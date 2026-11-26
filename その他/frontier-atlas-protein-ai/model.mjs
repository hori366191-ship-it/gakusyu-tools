import * as THREE from 'three';
import { HOTSPOT_IDS } from './content.mjs';
import { confidenceAt, confidenceRGB, sampleDockingPose } from './state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const AA3 = Object.freeze({
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
});
const CPK = Object.freeze({
  C: [0.34, 0.38, 0.42], N: [0.20, 0.43, 0.92], O: [0.95, 0.24, 0.20], S: [0.96, 0.77, 0.18], P: [0.98, 0.55, 0.16],
});

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function addMesh(parent, geometry, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function rodBetween(start, end, radius, material, radialSegments = 8) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, radialSegments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.scale.set(radius, Math.max(.001, length), radius);
  return mesh;
}

function resolveResidueIndex(residues, number) {
  const index = residues.findIndex(residue => residue.number === number);
  return index < 0 ? 0 : index;
}

/** Parse public PDB fixed-column records without any network access. */
export function parsePdb(text) {
  if (typeof text !== 'string' || !/\nATOM\s/.test(`\n${text}`)) throw new Error('PDB ATOM records not found');
  const rawAtoms = [];
  const residues = [];
  const residueMap = new Map();
  const sequenceRecords = [];
  const helices = [];
  const sheetStrands = [];
  const sheetGroups = new Map();
  const title = [];

  for (const line of text.split(/\r?\n/)) {
    const record = line.slice(0, 6).trim();
    if (record === 'TITLE') title.push(line.slice(10).trim());
    if (record === 'SEQRES') sequenceRecords.push(line.slice(19).trim().split(/\s+/).filter(Boolean));
    if (record === 'ATOM') {
      const altLoc = line[16] || ' ';
      if (altLoc !== ' ' && altLoc !== 'A') continue;
      const element = (line.slice(76, 78).trim() || line.slice(12, 16).trim()[0] || 'C').toUpperCase();
      if (element === 'H' || element === 'D') continue;
      const chain = line[21] || 'A';
      const number = Number.parseInt(line.slice(22, 26), 10);
      const insertion = line[26] || ' ';
      const name = line.slice(17, 20).trim();
      const key = `${chain}:${number}:${insertion}`;
      let residue = residueMap.get(key);
      if (!residue) {
        residue = {
          key,
          chain,
          number,
          insertion,
          name,
          atoms: [],
          index: residues.length,
          ca: null,
        };
        residueMap.set(key, residue);
        residues.push(residue);
      }
      const atom = {
        name: line.slice(12, 16).trim(),
        element,
        x: Number(line.slice(30, 38)),
        y: Number(line.slice(38, 46)),
        z: Number(line.slice(46, 54)),
        bFactor: Number(line.slice(60, 66)) || 0,
        residue: residue.index,
      };
      if (![atom.x, atom.y, atom.z].every(Number.isFinite)) continue;
      rawAtoms.push(atom);
      residue.atoms.push(rawAtoms.length - 1);
      if (atom.name === 'CA') residue.ca = atom;
    }
    if (record === 'HELIX') {
      helices.push({
        start: Number.parseInt(line.slice(21, 25), 10),
        end: Number.parseInt(line.slice(33, 37), 10),
      });
    }
    if (record === 'SHEET') {
      const sheetId = line.slice(11, 14).trim() || 'S1';
      const strand = {
        sheetId,
        start: Number.parseInt(line.slice(22, 26), 10),
        end: Number.parseInt(line.slice(32, 36), 10),
      };
      sheetStrands.push(strand);
      if (!sheetGroups.has(sheetId)) sheetGroups.set(sheetId, { id: sheetId, strands: [] });
      sheetGroups.get(sheetId).strands.push(strand);
    }
  }
  if (!rawAtoms.length || !residues.length) throw new Error('PDB contained no usable atoms');

  const center = { x: 0, y: 0, z: 0 };
  let centerCount = 0;
  for (const residue of residues) {
    if (residue.ca) {
      center.x += residue.ca.x;
      center.y += residue.ca.y;
      center.z += residue.ca.z;
      centerCount++;
    }
  }
  if (!centerCount) {
    for (const atom of rawAtoms) {
      center.x += atom.x;
      center.y += atom.y;
      center.z += atom.z;
    }
    centerCount = rawAtoms.length;
  }
  center.x /= centerCount;
  center.y /= centerCount;
  center.z /= centerCount;

  let radius = .001;
  for (const atom of rawAtoms) radius = Math.max(radius, distance(atom, center));
  const scale = 3.55 / radius;
  for (const atom of rawAtoms) {
    atom.x = (atom.x - center.x) * scale;
    atom.y = (atom.y - center.y) * scale;
    atom.z = (atom.z - center.z) * scale;
  }
  for (const residue of residues) {
    residue.ca = residue.atoms.map(index => rawAtoms[index]).find(atom => atom.name === 'CA') || residue.atoms.map(index => rawAtoms[index])[0];
  }

  const sequenceFromRecords = sequenceRecords.flat().map(name => AA3[name] || 'X').join('');
  const sequenceFromAtoms = residues.map(residue => AA3[residue.name] || 'X').join('');
  const sequence = sequenceFromRecords.length === residues.length ? sequenceFromRecords : sequenceFromAtoms;
  for (const helix of helices) {
    helix.startIndex = resolveResidueIndex(residues, helix.start);
    helix.endIndex = resolveResidueIndex(residues, helix.end);
  }
  for (const strand of sheetStrands) {
    strand.startIndex = resolveResidueIndex(residues, strand.start);
    strand.endIndex = resolveResidueIndex(residues, strand.end);
  }
  const sheets = [...sheetGroups.values()];

  const smoothCA = residues.map((residue, index) => {
    const previous = residues[Math.max(0, index - 1)].ca;
    const next = residues[Math.min(residues.length - 1, index + 1)].ca;
    return {
      x: residue.ca.x * .5 + (previous.x + next.x) * .25,
      y: residue.ca.y * .5 + (previous.y + next.y) * .25,
      z: residue.ca.z * .5 + (previous.z + next.z) * .25,
    };
  });

  const header = text.split(/\r?\n/)[0] || '';
  const id = header.match(/\b\d[A-Z0-9]{3}\b/)?.[0]?.toLowerCase() || 'pdb';
  return {
    id,
    title: title.join(' ').replace(/\s+/g, ' ').trim(),
    sequence,
    residues,
    atoms: rawAtoms,
    helices,
    sheets,
    sheetStrands,
    smoothCA,
    center,
    scale,
    radius: 3.55,
    source: 'RCSB PDB experimental coordinates',
  };
}

export function buildModelStats(structures) {
  const list = Array.isArray(structures) ? structures : [];
  const residues = list.reduce((sum, entry) => sum + entry.residues.length, 0);
  const atoms = list.reduce((sum, entry) => sum + entry.atoms.length, 0);
  const helices = list.reduce((sum, entry) => sum + entry.helices.length, 0);
  const sheets = list.reduce((sum, entry) => sum + entry.sheets.length, 0);
  const sheetStrands = list.reduce((sum, entry) => sum + entry.sheetStrands.length, 0);
  const backbone = list.reduce((sum, entry) => sum + Math.max(0, entry.residues.length - 1), 0);
  const ligandAtoms = 9;
  const dnaBasePairs = 24;
  const environmentDetails = 72;
  const shaderParticles = 320;
  return Object.freeze({
    structures: list.length,
    residues,
    heavyAtoms: atoms,
    helices,
    sheets,
    sheetStrands,
    backboneBonds: backbone,
    ligandAtoms,
    ligandPoses: 5,
    dnaBasePairs,
    shaderParticles,
    environmentDetails,
    meaningfulParts: residues + helices + sheetStrands + ligandAtoms * 6 + dnaBasePairs * 3 + environmentDetails,
    instancedDetail: atoms + residues + backbone + ligandAtoms * 6 + dnaBasePairs + environmentDetails,
    instancedMeshes: list.length * 12 + 1,
    pbrMaterials: 6,
    shaderMaterials: 1,
    lodObjects: Math.max(1, helices),
    hotspots: HOTSPOT_IDS.length,
    educational: true,
  });
}

function makeEnvironment() {
  const group = new THREE.Group();
  group.name = 'exhibition pedestal';
  const metal = new THREE.MeshStandardMaterial({ color: 0x172a35, metalness: .82, roughness: .31 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x55d9d0, emissive: 0x1b8b86, emissiveIntensity: .8, metalness: .3, roughness: .24 });
  addMesh(group, new THREE.CylinderGeometry(6.4, 6.8, .18, 96), metal, [0, -4.35, 0]);
  for (const radius of [2.2, 4.3, 6.15]) {
    const ring = addMesh(group, new THREE.TorusGeometry(radius, .018, 6, 96), accent, [0, -4.22, 0]);
    ring.rotation.x = Math.PI / 2;
  }
  const detail = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, .025, .28), accent, 72);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 72; index++) {
    const angle = index / 72 * TAU;
    dummy.position.set(Math.cos(angle) * 5.65, -4.19, Math.sin(angle) * 5.65);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.setScalar(index % 6 === 0 ? 1.8 : 1);
    dummy.updateMatrix();
    detail.setMatrixAt(index, dummy.matrix);
  }
  detail.instanceMatrix.needsUpdate = true;
  detail.userData.fullCount = 72;
  group.add(detail);
  return { group, detail };
}

function makeDenoiseParticles() {
  const random = seededRandom(9042);
  const count = 320;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const theta = random() * TAU;
    const y = random() * 2 - 1;
    const radius = 3.8 + random() * 3.2;
    const horizontal = Math.sqrt(1 - y * y);
    positions[index * 3] = Math.cos(theta) * horizontal * radius;
    positions[index * 3 + 1] = y * radius;
    positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
    phases[index] = random() * TAU;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNoise: { value: 1 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(0x70e7dc) },
    },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform float uNoise;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float shimmer = sin(aPhase + uTime * 1.7) * 0.16;
        p += normalize(p + vec3(0.001)) * shimmer * (0.3 + uNoise);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (3.0 + 3.0 * uNoise) * (90.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vGlow = 0.55 + 0.45 * sin(aPhase * 2.0 - uTime);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.05, d) * uOpacity * vGlow;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor * (1.1 + vGlow * 0.4), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.userData.fullCount = count;
  points.frustumCulled = false;
  return points;
}

function makeSecondaryStructure(data, material) {
  const group = new THREE.Group();
  group.name = 'PDB secondary structure';
  for (const helix of data.helices) {
    const points = [];
    for (let index = helix.startIndex; index <= helix.endIndex; index++) {
      const ca = data.residues[index]?.ca;
      if (ca) points.push(new THREE.Vector3(ca.x, ca.y, ca.z));
    }
    if (points.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(points);
    const high = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 4), .19, 7, false), material);
    const low = rodBetween(points[0], points.at(-1), .24, material, 7);
    const lod = new THREE.LOD();
    lod.addLevel(high, 0);
    lod.addLevel(low, 17);
    group.add(lod);
  }
  for (const sheet of data.sheetStrands) {
    const start = data.residues[sheet.startIndex]?.ca;
    const end = data.residues[sheet.endIndex]?.ca;
    if (!start || !end) continue;
    const a = new THREE.Vector3(start.x, start.y, start.z);
    const b = new THREE.Vector3(end.x, end.y, end.z);
    group.add(rodBetween(a, b, .11, material, 7));
    const direction = new THREE.Vector3().subVectors(b, a).normalize();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.26, .55, 8), material);
    arrow.position.copy(b).addScaledVector(direction, .18);
    arrow.quaternion.setFromUnitVectors(UP, direction);
    group.add(arrow);
  }
  return group;
}

function makeLigand() {
  const group = new THREE.Group();
  group.name = 'educational ligand';
  const local = [
    [-.48, .12, 0], [-.2, .42, .08], [.2, .42, .08], [.48, .12, 0],
    [.2, -.2, -.08], [-.2, -.2, -.08], [.7, .12, .22], [-.72, .12, -.22], [0, .75, .08],
  ].map(point => new THREE.Vector3(...point));
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffa45c, emissive: 0x8a3218, emissiveIntensity: .7, metalness: .12, roughness: .24, clearcoat: .8,
  });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 12, 8), material, local.length);
  const dummy = new THREE.Object3D();
  local.forEach((point, index) => {
    dummy.position.copy(point);
    dummy.scale.setScalar(index === 8 ? 1.2 : 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  const bondPositions = [];
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [0, 7], [1, 8]]) {
    bondPositions.push(...local[a].toArray(), ...local[b].toArray());
  }
  const bondGeometry = new THREE.BufferGeometry();
  bondGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bondPositions, 3));
  group.add(new THREE.LineSegments(bondGeometry, new THREE.LineBasicMaterial({ color: 0xffd2a8, transparent: true, opacity: .8 })));
  const ghosts = [];
  for (let index = 0; index < 5; index++) {
    const ghost = new THREE.Group();
    const ghostMaterial = new THREE.MeshBasicMaterial({ color: index === 0 ? 0x7ef2dc : 0xffa45c, transparent: true, opacity: .12, depthWrite: false });
    const ghostMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), ghostMaterial, local.length);
    local.forEach((point, atomIndex) => {
      dummy.position.copy(point);
      dummy.rotation.set(index * .17, index * .53 + atomIndex * .05, index * .11);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ghostMesh.setMatrixAt(atomIndex, dummy.matrix);
    });
    ghostMesh.instanceMatrix.needsUpdate = true;
    ghost.add(ghostMesh);
    ghosts.push({ group: ghost, material: ghostMaterial });
  }
  return { group, mesh, ghosts, local };
}

function makeDNA() {
  const group = new THREE.Group();
  group.name = 'schematic double-stranded DNA';
  const count = 24;
  const strandA = [];
  const strandB = [];
  for (let index = 0; index < count; index++) {
    const t = index / (count - 1);
    const angle = t * TAU * 2.2;
    const y = (t - .5) * 7.2;
    const radius = 1.02;
    strandA.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    strandB.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
  }
  const materialA = new THREE.MeshPhysicalMaterial({ color: 0x8b7cff, emissive: 0x372478, emissiveIntensity: .8, roughness: .22, metalness: .18, clearcoat: .7 });
  const materialB = new THREE.MeshPhysicalMaterial({ color: 0x59d9de, emissive: 0x145b64, emissiveIntensity: .8, roughness: .22, metalness: .18, clearcoat: .7 });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandA), 96, .075, 7, false), materialA));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandB), 96, .075, 7, false), materialB));
  const pairMaterial = new THREE.MeshStandardMaterial({ color: 0xe9dca9, emissive: 0x514521, emissiveIntensity: .35, metalness: .12, roughness: .46 });
  const pairs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .035, 1, 6), pairMaterial, count);
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(.10, 8, 6), pairMaterial, count * 2);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const midpoint = strandA[index].clone().add(strandB[index]).multiplyScalar(.5);
    const direction = strandB[index].clone().sub(strandA[index]);
    dummy.position.copy(midpoint);
    dummy.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
    dummy.scale.set(1, direction.length(), 1);
    dummy.updateMatrix();
    pairs.setMatrixAt(index, dummy.matrix);
    for (const [nodeIndex, point] of [[index * 2, strandA[index]], [index * 2 + 1, strandB[index]]]) {
      dummy.position.copy(point);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      nodes.setMatrixAt(nodeIndex, dummy.matrix);
    }
  }
  pairs.instanceMatrix.needsUpdate = true;
  nodes.instanceMatrix.needsUpdate = true;
  group.add(pairs, nodes);
  group.position.set(5.2, .15, -.4);
  group.rotation.z = -.18;
  return { group, pairs, nodes, strandA, strandB };
}

function makeContactLines(data, dna) {
  const positions = [];
  const selected = [Math.floor(data.residues.length * .18), Math.floor(data.residues.length * .32), Math.floor(data.residues.length * .48), Math.floor(data.residues.length * .66)];
  for (let index = 0; index < 8; index++) {
    const residue = data.residues[selected[index % selected.length]];
    const dnaPoint = dna.strandA[4 + index * 2].clone().add(dna.group.position);
    positions.push(residue.ca.x, residue.ca.y, residue.ca.z, dnaPoint.x, dnaPoint.y, dnaPoint.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineDashedMaterial({ color: 0xffcf83, transparent: true, opacity: 0, dashSize: .12, gapSize: .09, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.computeLineDistances();
  return { lines, material };
}

function makeStructure(data) {
  const group = new THREE.Group();
  group.name = `${data.id.toUpperCase()} experimental protein`;
  const random = seededRandom(data.id.charCodeAt(0) * 911 + data.atoms.length);
  const atomMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .31, metalness: .17 });
  const caMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .2, metalness: .12, clearcoat: .8, clearcoatRoughness: .15 });
  const backboneMaterial = new THREE.MeshStandardMaterial({ color: 0x93e8e1, emissive: 0x1d6965, emissiveIntensity: .55, metalness: .4, roughness: .27 });
  const atomMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), atomMaterial, data.atoms.length);
  const caMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), caMaterial, data.residues.length);
  const backboneMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), backboneMaterial, Math.max(1, data.residues.length - 1));
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0xe6edf4, transparent: true, opacity: .19, depthWrite: false });
  const ghostMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), ghostMaterial, data.atoms.length);
  for (const mesh of [atomMesh, caMesh, backboneMesh, ghostMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
  }
  group.add(atomMesh, caMesh, backboneMesh, ghostMesh);

  const backbonePositions = new Float32Array(data.residues.length * 3);
  const backboneGeometry = new THREE.BufferGeometry();
  backboneGeometry.setAttribute('position', new THREE.BufferAttribute(backbonePositions, 3));
  const backboneLine = new THREE.Line(backboneGeometry, new THREE.LineBasicMaterial({ color: 0xd7fffa, transparent: true, opacity: .75 }));
  backboneLine.frustumCulled = false;
  group.add(backboneLine);

  const secondaryMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffca78, emissive: 0x7b471d, emissiveIntensity: .7, metalness: .16, roughness: .28,
    transparent: true, opacity: 0, clearcoat: .55, depthWrite: false,
  });
  const secondary = makeSecondaryStructure(data, secondaryMaterial);
  group.add(secondary);

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x71d9d4, transparent: true, opacity: .09, roughness: .1, metalness: .05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  const shellCurve = new THREE.CatmullRomCurve3(data.residues.map(residue => new THREE.Vector3(residue.ca.x, residue.ca.y, residue.ca.z)));
  const shell = new THREE.Mesh(new THREE.TubeGeometry(shellCurve, Math.max(32, data.residues.length * 2), .34, 8, false), shellMaterial);
  group.add(shell);

  const ligand = makeLigand();
  const ligandTarget = new THREE.Vector3();
  const targetResidues = [Math.floor(data.residues.length * .28), Math.floor(data.residues.length * .42), Math.floor(data.residues.length * .55)];
  for (const index of targetResidues) {
    const ca = data.residues[index].ca;
    ligandTarget.add(new THREE.Vector3(ca.x, ca.y, ca.z));
  }
  ligandTarget.multiplyScalar(1 / targetResidues.length).add(new THREE.Vector3(.45, .2, .7));
  for (let index = 0; index < ligand.ghosts.length; index++) {
    const pose = sampleDockingPose(.65, index);
    ligand.ghosts[index].group.position.copy(ligandTarget).add(new THREE.Vector3(pose.x * .16, pose.y * .16, pose.z * .16));
    ligand.ghosts[index].group.rotation.set(index * .31, index * .77, index * .19);
    group.add(ligand.ghosts[index].group);
  }
  group.add(ligand.group);

  const dna = makeDNA();
  const contact = makeContactLines(data, dna);
  group.add(dna.group, contact.lines);

  const noiseDirections = data.atoms.map(() => new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize());
  const anchors = new Map();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const direction = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  let lastPositionKey = '';
  let currentFold = 0;
  let currentNoise = 0;
  let currentConfidence = true;
  let currentRepresentation = 'experimental';
  const anchorPositions = [];

  function residueAnchor(index, fold, noise, representation) {
    const residue = data.residues[index];
    const folded = representation === 'experimental' ? residue.ca : data.smoothCA[index];
    const t = index / Math.max(1, data.residues.length - 1);
    const extended = {
      x: (t - .5) * 11.8,
      y: Math.sin(index * .54) * .26,
      z: Math.cos(index * .43) * .26,
    };
    const jitter = Math.sin(index * 12.9898) * Math.cos(index * 7.233) * noise * .55;
    return new THREE.Vector3(
      extended.x + (folded.x - extended.x) * fold + jitter,
      extended.y + (folded.y - extended.y) * fold + Math.cos(index * 5.17) * noise * .32,
      extended.z + (folded.z - extended.z) * fold + Math.sin(index * 9.13) * noise * .32,
    );
  }

  function atomColor(atom) {
    if (currentConfidence) return confidenceRGB(confidenceAt(atom.residue, data.residues.length));
    const rgb = CPK[atom.element] || CPK.C;
    return rgb;
  }

  function updatePositions(state) {
    const key = `${state.fold}:${state.noise}:${state.confidence}:${state.representation}`;
    if (key === lastPositionKey) return;
    lastPositionKey = key;
    currentFold = state.fold;
    currentNoise = state.noise;
    currentConfidence = state.confidence;
    currentRepresentation = state.representation;
    const showProxy = state.representation !== 'experimental';
    anchorPositions.length = 0;
    data.residues.forEach((residue, index) => {
      const anchor = residueAnchor(index, currentFold, currentNoise, showProxy ? 'proxy' : 'experimental');
      anchorPositions.push(anchor);
      dummy.position.copy(anchor);
      dummy.quaternion.identity();
      dummy.scale.setScalar(.15);
      dummy.updateMatrix();
      caMesh.setMatrixAt(index, dummy.matrix);
      const rgb = currentConfidence ? confidenceRGB(confidenceAt(index, data.residues.length)) : [0.45, .92, .88];
      color.setRGB(...rgb);
      caMesh.setColorAt(index, color);
      backbonePositions[index * 3] = anchor.x;
      backbonePositions[index * 3 + 1] = anchor.y;
      backbonePositions[index * 3 + 2] = anchor.z;
    });
    caMesh.instanceMatrix.needsUpdate = true;
    if (caMesh.instanceColor) caMesh.instanceColor.needsUpdate = true;
    backboneGeometry.attributes.position.needsUpdate = true;

    data.atoms.forEach((atom, index) => {
      const residue = data.residues[atom.residue];
      const anchor = anchorPositions[atom.residue];
      const reference = showProxy ? data.smoothCA[atom.residue] : residue.ca;
      const offset = new THREE.Vector3(atom.x - reference.x, atom.y - reference.y, atom.z - reference.z).multiplyScalar(showProxy ? .82 : 1);
      const position = anchor.clone().add(offset).addScaledVector(noiseDirections[index], currentNoise * .22);
      const radius = atom.element === 'S' ? .19 : atom.element === 'O' ? .135 : atom.element === 'N' ? .14 : .115;
      dummy.position.copy(position);
      dummy.quaternion.identity();
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      atomMesh.setMatrixAt(index, dummy.matrix);
      color.setRGB(...atomColor(atom));
      atomMesh.setColorAt(index, color);

      dummy.position.set(atom.x, atom.y, atom.z);
      dummy.scale.setScalar(radius * 1.03);
      dummy.updateMatrix();
      ghostMesh.setMatrixAt(index, dummy.matrix);
    });
    atomMesh.instanceMatrix.needsUpdate = true;
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
    ghostMesh.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < data.residues.length - 1; index++) {
      start.copy(anchorPositions[index]);
      end.copy(anchorPositions[index + 1]);
      direction.subVectors(end, start);
      const length = direction.length();
      dummy.position.copy(start).add(end).multiplyScalar(.5);
      dummy.quaternion.setFromUnitVectors(UP, direction.normalize());
      dummy.scale.set(.07, Math.max(.01, length), .07);
      dummy.updateMatrix();
      backboneMesh.setMatrixAt(index, dummy.matrix);
    }
    backboneMesh.instanceMatrix.needsUpdate = true;
    ghostMesh.visible = state.representation === 'compare';
  }

  function update(state, clock) {
    updatePositions(state);
    const foldedOpacity = Math.max(0, Math.min(1, state.fold));
    secondaryMaterial.opacity = foldedOpacity * .82;
    secondary.visible = foldedOpacity > .04;
    shell.visible = foldedOpacity > .08;
    shellMaterial.opacity = .04 + foldedOpacity * .10;
    ligand.group.visible = state.mode === 'docking';
    const pose = sampleDockingPose(state.phase);
    ligand.group.position.copy(ligandTarget).add(new THREE.Vector3(pose.x, pose.y, pose.z));
    ligand.group.rotation.set(clock * .16, pose.rotation + clock * .28, Math.sin(clock * .4) * .16);
    ligand.ghosts.forEach((ghost, index) => {
      ghost.group.visible = state.mode === 'docking';
      ghost.material.opacity = (.06 + (1 - state.docking) * .13) * (index === pose.candidate ? 1.7 : .65);
    });
    dna.group.visible = state.mode === 'interaction';
    dna.group.rotation.y = Math.sin(clock * .15) * .18;
    contact.lines.visible = state.mode === 'interaction';
    contact.material.opacity = state.interaction * (.42 + Math.sin(clock * 2) * .1);
  }

  function hotspotAnchor(id) {
    if (id === 'chain') return anchorPositions[Math.floor(anchorPositions.length * .52)] || new THREE.Vector3();
    if (id === 'helix') {
      const helix = data.helices[0];
      const ca = data.residues[Math.floor(((helix?.startIndex || 0) + (helix?.endIndex || 0)) / 2)]?.ca;
      return ca ? new THREE.Vector3(ca.x, ca.y, ca.z) : new THREE.Vector3(0, 2, 0);
    }
    if (id === 'sheet') {
      const sheet = data.sheetStrands[0];
      const ca = data.residues[Math.floor(((sheet?.startIndex || 0) + (sheet?.endIndex || 0)) / 2)]?.ca;
      return ca ? new THREE.Vector3(ca.x, ca.y, ca.z) : new THREE.Vector3(0, -1, 0);
    }
    if (id === 'diffusion') return new THREE.Vector3(-2.7, 3.5, -.8);
    return stateAnchor(id);
  }

  function stateAnchor(id) {
    if (id === 'interaction') return ligand.group.visible ? ligand.group.position.clone() : dna.group.position.clone();
    return new THREE.Vector3();
  }

  return {
    data, group, atomMesh, caMesh, backboneMesh, ghostMesh, secondary, shell, ligand, dna, contact,
    particles: null, update, hotspotAnchor,
    get fold() { return currentFold; },
    get representation() { return currentRepresentation; },
  };
}

export function createProteinModel(structures) {
  if (!Array.isArray(structures) || !structures.length) throw new Error('At least one parsed PDB structure is required');
  const normalized = structures;
  const root = new THREE.Group();
  root.name = 'AI protein structure educational model';
  const environment = makeEnvironment();
  const particles = makeDenoiseParticles();
  root.add(environment.group, particles);
  const structureMap = new Map();
  for (const data of normalized) {
    const structure = makeStructure(data);
    structureMap.set(data.id, structure);
    root.add(structure.group);
  }
  const stats = buildModelStats(normalized);
  let specimen = normalized[0].id;
  let selectedHotspot = null;
  let quality = 2;
  let currentState = null;
  const cameraQuaternion = new THREE.Quaternion();

  const selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: .82, depthWrite: false });
  const selection = new THREE.Mesh(new THREE.TorusGeometry(.55, .025, 7, 56), selectionMaterial);
  selection.visible = false;
  root.add(selection);

  function current() {
    return structureMap.get(specimen) || normalized.length && structureMap.get(normalized[0].id);
  }

  function setSpecimen(id) {
    const next = structureMap.get(id);
    if (!next) return;
    specimen = id;
    for (const [key, structure] of structureMap) structure.group.visible = key === id;
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, Math.floor(level)));
    environment.detail.count = [24, 40, 56, 72][quality];
    particles.geometry.setDrawRange(0, [120, 200, 280, 320][quality]);
  }

  function update(state, clock, delta = 0) {
    currentState = state;
    setSpecimen(state.specimen);
    const active = current();
    active.update(state, clock);
    particles.material.uniforms.uTime.value = clock;
    particles.material.uniforms.uNoise.value = state.noise;
    particles.material.uniforms.uOpacity.value = state.mode === 'denoise' ? .85 : state.mode === 'fold' ? .12 * (1 - state.fold) : 0;
    particles.visible = particles.material.uniforms.uOpacity.value > .005;
    environment.group.rotation.y = clock * .012;
    if (selectedHotspot) {
      selection.visible = true;
      selection.position.copy(hotspotAnchor(selectedHotspot));
      selection.quaternion.copy(cameraQuaternion);
      const pulse = 1 + Math.sin(clock * 3) * .08;
      selection.scale.setScalar(pulse);
    } else selection.visible = false;
  }

  function hotspotAnchor(id) {
    return current().hotspotAnchor(id);
  }

  setSpecimen(specimen);
  setQuality(quality);
  updatePositionsInitial();

  function updatePositionsInitial() {
    const initial = {
      mode: 'sequence', phase: 0, fold: 0, noise: 0, docking: 0, interaction: 0,
      confidence: true, representation: 'experimental', specimen,
    };
    current().update(initial, 0);
  }

  return {
    root,
    stats,
    update,
    setSpecimen,
    setQuality,
    setSelectedHotspot(id) { selectedHotspot = HOTSPOT_IDS.includes(id) ? id : null; },
    setCameraQuaternion(quaternion) { if (quaternion?.isQuaternion) cameraQuaternion.copy(quaternion); },
    hotspotAnchor,
    get specimen() { return specimen; },
    get quality() { return quality; },
    get state() { return currentState; },
  };
}
