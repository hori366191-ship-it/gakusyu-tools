import * as THREE from 'three';
import { MODEL_SPEC } from './state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const tempVector = new THREE.Vector3();
const tempMidpoint = new THREE.Vector3();
const tempColor = new THREE.Color();

export const MODEL_STATS = Object.freeze({
  ...MODEL_SPEC,
  heroParts: MODEL_SPEC.heroPartNames.length,
  mirrorPairs: 2,
  educationalApproximation: true,
});

export function getChiralityModelStats() {
  return { ...MODEL_STATS };
}

function randomSource(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addEdges(parent, geometry, color, opacity = .45) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  parent.add(lines);
  return lines;
}

function makeInstanced(parent, geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function setInstance(mesh, index, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  dummy.position.set(...position);
  dummy.rotation.set(...rotation);
  dummy.scale.set(...scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function setCylinderBetween(mesh, index, start, end, radius = 1) {
  tempVector.subVectors(end, start);
  tempMidpoint.copy(start).add(end).multiplyScalar(.5);
  dummy.position.copy(tempMidpoint);
  dummy.quaternion.setFromUnitVectors(UP, tempVector.clone().normalize());
  dummy.scale.set(radius, tempVector.length(), radius);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function makeMolecule(materials, handedness, product = false) {
  const group = new THREE.Group();
  group.name = `${handedness > 0 ? 'Right-handed' : 'Left-handed'} ${product ? 'product' : 'reactant'} molecule`;
  const atomMaterial = (product ? materials.productAtoms : materials.reactantAtoms).clone();
  atomMaterial.emissiveIntensity = product ? .55 : .18;
  const atoms = makeInstanced(group, new THREE.SphereGeometry(.105, 12, 8), atomMaterial, 16, 'molecular atom array');
  const bonds = makeInstanced(group, new THREE.CylinderGeometry(.024, .024, 1, 6), materials.bonds, 15, 'molecular bond array');
  const directions = [
    new THREE.Vector3(1, 1, 1).normalize(),
    new THREE.Vector3(-1, 1, -1).normalize(),
    new THREE.Vector3(1, -1, -1).normalize(),
    new THREE.Vector3(-1, -1, 1).normalize(),
  ];
  const branchLengths = [4, 4, 4, 3];
  const positions = [new THREE.Vector3()];
  const bondPairs = [];
  const colors = [0xd8f3ff, 0x7de4ee, 0xffc56e, 0xb393ff, 0x91e2be];
  let atomIndex = 1;
  directions.forEach((direction, branch) => {
    direction.x *= handedness;
    const perpendicular = new THREE.Vector3(-direction.z, .25, direction.x).normalize();
    let previous = new THREE.Vector3();
    for (let step = 1; step <= branchLengths[branch]; step++) {
      const point = direction.clone().multiplyScalar(step * .23);
      point.addScaledVector(perpendicular, Math.sin(step * 1.8 + branch) * .055 * handedness);
      positions.push(point);
      bondPairs.push([previous, point]);
      previous = point;
      atomIndex++;
    }
  });
  positions.forEach((position, index) => {
    setInstance(atoms, index, position.toArray(), [0, 0, 0], index === 0 ? [1.45, 1.45, 1.45] : [1, 1, 1]);
    atoms.setColorAt(index, tempColor.set(colors[index % colors.length]));
  });
  bondPairs.forEach(([start, end], index) => setCylinderBetween(bonds, index, start, end));
  atoms.instanceMatrix.needsUpdate = true;
  atoms.instanceColor.needsUpdate = true;
  bonds.instanceMatrix.needsUpdate = true;
  const halo = addMesh(group, new THREE.SphereGeometry(.82, 20, 14), product ? materials.productHalo : materials.reactantHalo, [0, 0, 0], [0, 0, 0], 'molecular orbit');
  return { group, atoms, bonds, halo };
}

function makeCatalyst(materials) {
  const group = new THREE.Group();
  group.name = 'Chiral catalyst surface high detail';
  addMesh(group, new THREE.BoxGeometry(7.2, .36, 5.2), materials.support, [0, .05, 0], [0, 0, 0], 'catalyst support plate');
  addMesh(group, new THREE.BoxGeometry(6.85, .12, 4.9), materials.metal, [0, .29, 0], [0, 0, 0], 'metal surface');
  addEdges(group, new THREE.BoxGeometry(7.2, .36, 5.2), 0x82dbe8, .6);

  const layers = makeInstanced(group, new THREE.BoxGeometry(6.6, .08, 4.65), materials.porous, MODEL_SPEC.supportLayers, 'porous support layer array');
  for (let index = 0; index < MODEL_SPEC.supportLayers; index++) {
    setInstance(layers, index, [0, -.16 - index * .075, 0], [0, (index % 2) * .02, 0], [1 - index * .025, 1, 1 - index * .025]);
    layers.setColorAt(index, tempColor.set(index % 2 ? 0x354b59 : 0x526b77));
  }
  layers.instanceMatrix.needsUpdate = true;
  layers.instanceColor.needsUpdate = true;

  const sites = makeInstanced(group, new THREE.SphereGeometry(.2, 16, 10), materials.active, MODEL_SPEC.activeSites, 'active site array');
  const pockets = makeInstanced(group, new THREE.TorusGeometry(.26, .035, 7, 20), materials.pocket, MODEL_SPEC.activeSites, 'binding pocket array');
  for (let index = 0; index < MODEL_SPEC.activeSites; index++) {
    const column = index % 8;
    const row = Math.floor(index / 8);
    const x = (column - 3.5) * .78;
    const z = (row - 1.5) * 1.15;
    setInstance(sites, index, [x, .48, z], [0, 0, 0], [1, .55, 1]);
    setInstance(pockets, index, [x, .51, z], [Math.PI / 2, (index % 3 - 1) * .22, 0]);
    sites.setColorAt(index, tempColor.set(index % 4 === 0 ? 0xffc56e : 0x79dbe6));
  }
  sites.instanceMatrix.needsUpdate = true;
  sites.instanceColor.needsUpdate = true;
  pockets.instanceMatrix.needsUpdate = true;

  const ridges = makeInstanced(group, new THREE.BoxGeometry(.68, .13, .12), materials.ligand, MODEL_SPEC.surfaceRidges, 'chiral ridge array');
  for (let index = 0; index < MODEL_SPEC.surfaceRidges; index++) {
    const x = -2.9 + (index % 8) * .82;
    const z = -1.72 + Math.floor(index / 8) * 1.72;
    setInstance(ridges, index, [x, .56, z], [0, (index % 2 ? 1 : -1) * .32, (index % 3 - 1) * .06]);
  }
  ridges.instanceMatrix.needsUpdate = true;

  const ligands = makeInstanced(group, new THREE.CylinderGeometry(.055, .075, .58, 9), materials.ligand, MODEL_SPEC.ligands, 'chiral ligand backbone array');
  const centers = makeInstanced(group, new THREE.SphereGeometry(.12, 12, 8), materials.center, MODEL_SPEC.ligands, 'metal center array');
  const substituents = makeInstanced(group, new THREE.SphereGeometry(.085, 10, 7), materials.substituent, MODEL_SPEC.ligands * 3, 'ligand substituent array');
  for (let index = 0; index < MODEL_SPEC.ligands; index++) {
    const angle = index / MODEL_SPEC.ligands * TAU;
    const radius = 1.25 + (index % 3) * .58;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * .68;
    setInstance(ligands, index, [x, .88, z], [Math.sin(angle) * .24, 0, Math.cos(angle) * .24]);
    setInstance(centers, index, [x, 1.2, z]);
    for (let branch = 0; branch < 3; branch++) {
      const branchAngle = angle + branch * TAU / 3;
      setInstance(substituents, index * 3 + branch, [x + Math.cos(branchAngle) * .23, 1.18 + (branch - 1) * .12, z + Math.sin(branchAngle) * .23]);
      substituents.setColorAt(index * 3 + branch, tempColor.set([0x7de4ee, 0xffc56e, 0xb393ff][branch]));
    }
  }
  ligands.instanceMatrix.needsUpdate = true;
  centers.instanceMatrix.needsUpdate = true;
  substituents.instanceMatrix.needsUpdate = true;
  substituents.instanceColor.needsUpdate = true;

  const pins = makeInstanced(group, new THREE.CylinderGeometry(.065, .065, .16, 8), materials.dark, MODEL_SPEC.catalystPins, 'catalyst support pin array');
  for (let index = 0; index < MODEL_SPEC.catalystPins; index++) {
    const side = index % 2 ? 1 : -1;
    setInstance(pins, index, [side * 3.35, .12, -2.2 + Math.floor(index / 2) * .58]);
  }
  pins.instanceMatrix.needsUpdate = true;
  addMesh(group, new THREE.BoxGeometry(1.5, .18, .55), materials.dark, [0, -.85, 0], [0, 0, 0], 'temperature control block');
  addMesh(group, new THREE.TorusGeometry(3.9, .025, 6, 96), materials.surfaceGlow, [0, .41, 0], [Math.PI / 2, 0, 0], 'surface scan');
  return { group, sites, pockets, ligands, substituents };
}

function makePathway(materials) {
  const group = new THREE.Group();
  group.name = 'Reaction pathways and energy barriers';
  const majorPoints = [
    new THREE.Vector3(-4.3, 2.7, .65), new THREE.Vector3(-2.5, 2.2, .45),
    new THREE.Vector3(-1.2, 1.15, .2), new THREE.Vector3(0, 1.55, .15),
    new THREE.Vector3(1.3, 1.1, .2), new THREE.Vector3(2.6, 2.2, .45), new THREE.Vector3(4.3, 2.7, .65),
  ];
  const minorPoints = majorPoints.map(point => new THREE.Vector3(point.x, point.y + .18, -point.z - .15));
  const majorCurve = new THREE.CatmullRomCurve3(majorPoints);
  const minorCurve = new THREE.CatmullRomCurve3(minorPoints);
  const major = new THREE.Mesh(new THREE.TubeGeometry(majorCurve, 100, .026, 6, false), materials.majorPath);
  major.name = 'major reaction path';
  const minor = new THREE.Mesh(new THREE.TubeGeometry(minorCurve, 100, .026, 6, false), materials.minorPath);
  minor.name = 'minor reaction path';
  group.add(major, minor);

  const barrierPointsMajor = [
    new THREE.Vector3(-2.1, .62, .15), new THREE.Vector3(-1.7, 2.9, .15),
    new THREE.Vector3(-1.3, 3.5, .15), new THREE.Vector3(-.9, 2.9, .15), new THREE.Vector3(-.5, .62, .15),
  ];
  const barrierPointsMinor = barrierPointsMajor.map(point => new THREE.Vector3(-point.x, point.y, -point.z - .15));
  const majorBarrier = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barrierPointsMajor), 48, .045, 7, false), materials.majorBarrier);
  majorBarrier.name = 'major barrier';
  const minorBarrier = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barrierPointsMinor), 48, .045, 7, false), materials.minorBarrier);
  minorBarrier.name = 'minor barrier';
  group.add(majorBarrier, minorBarrier);

  const autocatalytic = new THREE.Mesh(new THREE.TorusGeometry(1.05, .025, 6, 80), materials.amplification, [3.9, 2.7, .65], [0, .35, 0]);
  autocatalytic.name = 'autocatalytic loop';
  group.add(autocatalytic);
  const mirror = addMesh(group, new THREE.PlaneGeometry(9.5, 5.2), materials.mirror, [0, 2.45, -.05], [0, 0, 0], 'mirror plane');
  const mirrorFrame = addEdges(group, new THREE.PlaneGeometry(9.5, 5.2), 0x76c9ef, .45);
  mirrorFrame.position.set(0, 2.45, -.04);
  return { group, major, minor, majorCurve, minorCurve, majorBarrier, minorBarrier, autocatalytic, mirror };
}

function makeParticles() {
  const count = MODEL_SPEC.particles;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    tempColor.set(index % 3 === 0 ? 0x7de4ee : index % 3 === 1 ? 0xffc56e : 0xb393ff);
    colors[index * 3] = tempColor.r;
    colors[index * 3 + 1] = tempColor.g;
    colors[index * 3 + 2] = tempColor.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: .05, vertexColors: true, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.name = 'approach, reaction and amplification particles';
  points.frustumCulled = false;
  return { points, positions, colors, count };
}

export function createChiralityModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'Chirality and asymmetric synthesis educational model';
  const materials = {
    support: new THREE.MeshStandardMaterial({ color: 0x334651, metalness: .68, roughness: .4 }),
    metal: new THREE.MeshPhysicalMaterial({ color: 0x8ba1ac, metalness: .92, roughness: .2, clearcoat: .45 }),
    porous: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .25, roughness: .78 }),
    active: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .7, roughness: .25, emissive: 0x245866, emissiveIntensity: .7 }),
    pocket: new THREE.MeshStandardMaterial({ color: 0x53727f, metalness: .78, roughness: .26 }),
    ligand: new THREE.MeshStandardMaterial({ color: 0x9276bd, metalness: .48, roughness: .34, emissive: 0x281944, emissiveIntensity: .35 }),
    center: new THREE.MeshStandardMaterial({ color: 0xd6b46e, metalness: .88, roughness: .2 }),
    substituent: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .3, roughness: .36, emissive: 0x203843, emissiveIntensity: .35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x182832, metalness: .72, roughness: .35 }),
    reactantAtoms: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .18, roughness: .38, emissive: 0x123944, emissiveIntensity: .18 }),
    productAtoms: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .24, roughness: .32, emissive: 0x28515b, emissiveIntensity: .55 }),
    bonds: new THREE.MeshStandardMaterial({ color: 0x8fa9b4, metalness: .62, roughness: .3 }),
    reactantHalo: new THREE.MeshBasicMaterial({ color: 0x6cdce9, transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false }),
    productHalo: new THREE.MeshBasicMaterial({ color: 0xb393ff, transparent: true, opacity: .08, blending: THREE.AdditiveBlending, depthWrite: false }),
    majorPath: new THREE.MeshBasicMaterial({ color: 0x7de4ee, transparent: true, opacity: .48, blending: THREE.AdditiveBlending, depthWrite: false }),
    minorPath: new THREE.MeshBasicMaterial({ color: 0xffad75, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false }),
    majorBarrier: new THREE.MeshBasicMaterial({ color: 0x91e2be, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }),
    minorBarrier: new THREE.MeshBasicMaterial({ color: 0xff8f70, transparent: true, opacity: .62, blending: THREE.AdditiveBlending, depthWrite: false }),
    amplification: new THREE.MeshBasicMaterial({ color: 0xc09cff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }),
    surfaceGlow: new THREE.MeshBasicMaterial({ color: 0x5dc9dc, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }),
    mirror: new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float edge = pow(abs(vUv.x - 0.5) * 2.0, 8.0);
          float scan = pow(max(0.0, sin(vUv.y * 30.0 - uTime * 1.5)), 18.0);
          gl_FragColor = vec4(0.35, 0.72, 0.92, 0.018 + edge * 0.1 + scan * 0.045);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
    anisotropy: Math.min(8, options.anisotropy || 4),
  };

  const catalyst = makeCatalyst(materials);
  const pathway = makePathway(materials);
  const molecules = {
    reactantA: makeMolecule(materials, 1, false),
    reactantB: makeMolecule(materials, -1, false),
    productA: makeMolecule(materials, 1, true),
    productB: makeMolecule(materials, -1, true),
  };
  const particles = makeParticles();
  root.add(catalyst.group, pathway.group, particles.points);
  Object.values(molecules).forEach(molecule => root.add(molecule.group));

  const catalystLod = new THREE.LOD();
  const medium = new THREE.Group();
  medium.name = 'Catalyst medium detail';
  addMesh(medium, new THREE.BoxGeometry(7.2, .36, 5.2), materials.support, [0, .05, 0]);
  addMesh(medium, new THREE.BoxGeometry(6.85, .12, 4.9), materials.metal, [0, .29, 0]);
  const mediumSites = makeInstanced(medium, new THREE.SphereGeometry(.2, 10, 7), materials.active, MODEL_SPEC.activeSites, 'medium active sites');
  for (let index = 0; index < MODEL_SPEC.activeSites; index++) setInstance(mediumSites, index, [(index % 8 - 3.5) * .78, .48, (Math.floor(index / 8) - 1.5) * 1.15], [0, 0, 0], [1, .55, 1]);
  mediumSites.instanceMatrix.needsUpdate = true;
  const low = new THREE.Group();
  low.name = 'Catalyst low detail';
  addMesh(low, new THREE.BoxGeometry(7.2, .36, 5.2), materials.support, [0, .05, 0]);
  addMesh(low, new THREE.BoxGeometry(6.4, .08, 4.4), materials.metal, [0, .28, 0]);
  catalystLod.addLevel(catalyst.group, 0);
  catalystLod.addLevel(medium, 28);
  catalystLod.addLevel(low, 46);
  catalystLod.autoUpdate = false;
  root.add(catalystLod);
  root.remove(catalyst.group);

  addMesh(root, new THREE.CylinderGeometry(6.4, 6.8, .25, 64), materials.dark, [0, -1.55, 0], [0, 0, 0], 'display plinth');
  addMesh(root, new THREE.TorusGeometry(6.35, .025, 6, 96), materials.surfaceGlow, [0, -1.4, 0], [Math.PI / 2, 0, 0], 'interactive outline');

  let disposed = false;
  let quality = 2;
  let presentation = { mode: 'achiral', hotspot: null, reducedMotion: false };

  function anchor(id) {
    if (id === 'mirror') return new THREE.Vector3(-3.8, 2.8, .4);
    if (id === 'catalyst') return new THREE.Vector3(0, .55, 0);
    if (id === 'ligand') return new THREE.Vector3(1.25, 1.1, .2);
    if (id === 'pathway') return new THREE.Vector3(-.9, 3.15, .15);
    return new THREE.Vector3(3.9, 2.7, .65);
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(2, Number(level) || 0));
    const index = [2, 1, 0][quality];
    catalystLod.levels.forEach((entry, entryIndex) => { entry.object.visible = entryIndex === index; });
    pathway.mirror.visible = quality > 0;
    particles.points.geometry.setDrawRange(0, Math.floor(particles.count * [.4, .7, 1][quality]));
    Object.values(molecules).forEach(molecule => { molecule.halo.visible = quality > 0; });
  }

  function setPresentation(next = {}) {
    presentation = { ...presentation, ...next };
    pathway.autocatalytic.visible = presentation.mode === 'product';
    materials.mirror.uniforms.uTime.value = 0;
  }

  function placeOnCurve(molecule, curve, progress, sideOffset = 0) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    molecule.group.position.copy(curve.getPoint(t));
    molecule.group.position.z += sideOffset;
    molecule.group.rotation.set(t * 2.4, t * TAU * 2, Math.sin(t * TAU) * .3);
  }

  function update(state) {
    if (disposed) return;
    const mode = state.mode;
    const selective = mode !== 'achiral';
    const approach = selective ? state.bindingProgress * .48 : state.cycle * .48;
    const reaction = state.reactionProgress;
    molecules.reactantA.group.visible = approach < .98 || mode === 'achiral';
    molecules.reactantB.group.visible = approach < .98 || mode === 'achiral';
    molecules.productA.group.visible = reaction > .04 || mode === 'achiral' && state.cycle > .55;
    molecules.productB.group.visible = reaction > .04 || mode === 'achiral' && state.cycle > .55;

    if (mode === 'achiral') {
      placeOnCurve(molecules.reactantA, pathway.majorCurve, Math.min(.48, state.cycle * .55));
      placeOnCurve(molecules.reactantB, pathway.minorCurve, Math.min(.48, state.cycle * .55));
      placeOnCurve(molecules.productA, pathway.majorCurve, .52 + Math.max(0, state.cycle - .55) * 1.05);
      placeOnCurve(molecules.productB, pathway.minorCurve, .52 + Math.max(0, state.cycle - .55) * 1.05);
    } else {
      placeOnCurve(molecules.reactantA, pathway.majorCurve, approach);
      placeOnCurve(molecules.reactantB, pathway.minorCurve, approach * (mode === 'binding' ? .72 : .86));
      placeOnCurve(molecules.productA, pathway.majorCurve, .5 + reaction * .5);
      placeOnCurve(molecules.productB, pathway.minorCurve, .5 + reaction * .38);
      molecules.productB.group.scale.setScalar(1 - state.enantiomericExcess * .32);
    }
    if (mode === 'achiral') molecules.productB.group.scale.setScalar(1);
    Object.values(molecules).forEach((molecule, index) => {
      molecule.halo.rotation.y = state.time * .25 * (index % 2 ? -1 : 1);
      molecule.halo.scale.setScalar(1 + Math.sin(state.time * 2 + index) * .05);
    });

    materials.mirror.uniforms.uTime.value = state.time;
    materials.minorBarrier.opacity = selective ? .62 : .32;
    pathway.minorBarrier.scale.y = selective ? 1 + state.enantiomericExcess * .28 : 1;
    pathway.autocatalytic.rotation.z = state.time * .35;
    pathway.autocatalytic.scale.setScalar(.8 + state.amplification * .45);
    materials.amplification.opacity = .3 + state.amplification * .65;

    for (let index = 0; index < particles.count; index++) {
      const phase = (state.flows.surface + index / particles.count) % 1;
      if (index % 4 === 0 && selective) {
        const angle = phase * TAU + state.time * .15;
        particles.positions[index * 3] = Math.cos(angle) * (2.7 + phase * .5);
        particles.positions[index * 3 + 1] = .62 + Math.sin(angle * 3) * .06;
        particles.positions[index * 3 + 2] = Math.sin(angle) * (1.8 + phase * .3);
      } else if (index % 4 === 1) {
        const point = (index % 2 ? pathway.majorCurve : pathway.minorCurve).getPoint(phase);
        particles.positions[index * 3] = point.x;
        particles.positions[index * 3 + 1] = point.y + Math.sin(phase * TAU) * .08;
        particles.positions[index * 3 + 2] = point.z;
      } else if (index % 4 === 2 && mode === 'product') {
        const angle = phase * TAU;
        particles.positions[index * 3] = 3.9 + Math.cos(angle) * 1.05;
        particles.positions[index * 3 + 1] = 2.7 + Math.sin(angle) * 1.05;
        particles.positions[index * 3 + 2] = .65 + Math.sin(angle * 2) * .25;
      } else {
        const angle = index * 2.399 + state.time * .05;
        particles.positions[index * 3] = Math.cos(angle) * (1 + phase * 2.6);
        particles.positions[index * 3 + 1] = .5 + Math.sin(phase * TAU) * .16;
        particles.positions[index * 3 + 2] = Math.sin(angle) * (1 + phase * 1.5);
      }
    }
    particles.points.geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materialSet = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materialSet.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materialSet.forEach(material => material.dispose());
    root.clear();
  }

  function stats() {
    let meshes = 0;
    let instancedMeshes = 0;
    let instances = 0;
    const materialSet = new Set();
    root.traverse(object => {
      if (object.isMesh) meshes++;
      if (object.isInstancedMesh) {
        instancedMeshes++;
        instances += object.count;
      }
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materialSet.add(material);
    });
    return { ...MODEL_STATS, meshes, instancedMeshes, instances, materials: materialSet.size, quality };
  }

  setQuality(2);
  setPresentation({ mode: 'achiral' });
  return { root, anchor, setQuality, setPresentation, update, dispose, stats, get counts() { return stats(); } };
}
