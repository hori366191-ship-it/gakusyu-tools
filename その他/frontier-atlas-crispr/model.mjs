import * as THREE from 'three';
import { BASE_PAIRS, HOTSPOTS, MODE_IDS, ORIGINAL_SEQUENCE, TARGET_INDEX } from './content.mjs';
import { TAU, basePairPoint, calculateCrisprState, sampleParticleSystem } from './state.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const DNA_X = -.65;
const TARGET_Y = (TARGET_INDEX / (BASE_PAIRS - 1) - .5) * 8.4;
const SPLIT_INDEX = TARGET_INDEX + 1;
const INSTANCE_DUMMY = new THREE.Object3D();
const BASE_COLORS = Object.freeze({ A: 0x63e6ff, T: 0xffc07a, G: 0x9cf1cc, C: 0xd2a6ff });

export const MODEL_STATS = Object.freeze({
  meaningfulParts: 40,
  basePairs: BASE_PAIRS,
  baseHalves: BASE_PAIRS * 2,
  backboneTubeSegments: 300,
  guideNucleotides: 20,
  proteinDomains: 18,
  proteinSurfaceDetails: 34,
  repairParticles: 96,
  meshObjects: 40,
  instancedSystems: 7,
  maxInstancedElements: 344,
  pbrMaterials: 9,
  shaderMaterials: 1,
  lodLevels: 2,
});

function randomSource(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function instanced(parent, geometry, material, count, dynamic = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.fullCount = count;
  parent.add(mesh);
  return mesh;
}

function setInstance(mesh, index, position, quaternion, scale = 1) {
  INSTANCE_DUMMY.position.copy(position);
  if (quaternion) INSTANCE_DUMMY.quaternion.copy(quaternion);
  else INSTANCE_DUMMY.quaternion.identity();
  INSTANCE_DUMMY.scale.setScalar(scale);
  INSTANCE_DUMMY.updateMatrix();
  mesh.setMatrixAt(index, INSTANCE_DUMMY.matrix);
}

function sequenceBase(index) {
  return ORIGINAL_SEQUENCE[index % ORIGINAL_SEQUENCE.length];
}

function complement(base) {
  return { A: 'T', T: 'A', G: 'C', C: 'G' }[base] || 'N';
}

function makeMaterials() {
  return {
    backbone: new THREE.MeshPhysicalMaterial({ color: 0x7593b8, emissive: 0x162c47, emissiveIntensity: .8, metalness: .32, roughness: .27, clearcoat: .5 }),
    bases: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .16, roughness: .32, emissive: 0x15252e, emissiveIntensity: .6 }),
    cas9: new THREE.MeshPhysicalMaterial({ color: 0x6f9ed8, emissive: 0x163861, emissiveIntensity: .75, metalness: .28, roughness: .3, clearcoat: .55 }),
    cas9Dark: new THREE.MeshStandardMaterial({ color: 0x324f7c, emissive: 0x101f3c, emissiveIntensity: .6, metalness: .42, roughness: .32 }),
    nuclease: new THREE.MeshPhysicalMaterial({ color: 0xff8b78, emissive: 0x6e201a, emissiveIntensity: .8, metalness: .2, roughness: .26, clearcoat: .45 }),
    deaminase: new THREE.MeshPhysicalMaterial({ color: 0xffc07a, emissive: 0x7b4218, emissiveIntensity: .9, metalness: .2, roughness: .25, clearcoat: .55 }),
    guide: new THREE.MeshPhysicalMaterial({ color: 0x9cf1cc, emissive: 0x245d48, emissiveIntensity: 1.15, metalness: .12, roughness: .24, clearcoat: .6 }),
    repair: new THREE.MeshPhysicalMaterial({ color: 0xd2a6ff, emissive: 0x4b2b79, emissiveIntensity: 1.0, metalness: .22, roughness: .28, clearcoat: .45 }),
    target: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .86, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

function makeEditShader() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0x63e6ff) } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uAmount;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float scan = .65 + .35 * sin(vUv.y * 38.0 - uTime * 6.0);
        float alpha = (rim * .32 + .035) * scan * uAmount;
        gl_FragColor = vec4(uColor * (1.0 + rim), alpha);
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

function addBackbone(group, start, end, strand, material) {
  const points = [];
  for (let index = start; index <= end; index++) {
    const p = basePairPoint(index, strand);
    points.push(new THREE.Vector3(DNA_X + p.x * 1.02, p.y, p.z * 1.02));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = addMesh(group, new THREE.TubeGeometry(curve, Math.max(12, (end - start) * 5), .105, 9, false), material);
  return mesh;
}

function makeDNAHalf(root, materials, start, end, name) {
  const group = new THREE.Group();
  group.name = name;
  const backbones = [addBackbone(group, start, end, 0, materials.backbone), addBackbone(group, start, end, 1, materials.backbone)];
  const halves = instanced(group, new THREE.CapsuleGeometry(.12, .47, 4, 8), materials.bases, (end - start + 1) * 2);
  const centers = [];
  let cursor = 0;
  for (let index = start; index <= end; index++) {
    const a = basePairPoint(index, 0);
    const b = basePairPoint(index, 1);
    const pointA = new THREE.Vector3(DNA_X + a.x * 1.02, a.y, a.z * 1.02);
    const pointB = new THREE.Vector3(DNA_X + b.x * 1.02, b.y, b.z * 1.02);
    const center = pointA.clone().add(pointB).multiplyScalar(.5);
    centers.push(center);
    for (const [strand, outer] of [[0, pointA], [1, pointB]]) {
      const position = center.clone().lerp(outer, .5);
      const direction = outer.clone().sub(center).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, direction);
      setInstance(halves, cursor, position, q, 1);
      const base = strand === 0 ? sequenceBase(index) : complement(sequenceBase(index));
      halves.setColorAt(cursor, new THREE.Color(BASE_COLORS[base]));
      cursor++;
    }
  }
  halves.instanceMatrix.needsUpdate = true;
  halves.instanceColor.needsUpdate = true;
  root.add(group);
  return { group, backbones, halves, start, end, centers };
}

function makeDNA(root, materials) {
  const upper = makeDNAHalf(root, materials, 0, SPLIT_INDEX - 1, 'DNA upper segment');
  const lower = makeDNAHalf(root, materials, SPLIT_INDEX, BASE_PAIRS - 1, 'DNA lower segment');
  const bonds = instanced(root, new THREE.SphereGeometry(.085, 8, 6), materials.backbone, BASE_PAIRS - 1);
  let cursor = 0;
  for (let index = 0; index < BASE_PAIRS - 1; index++) {
    if (index === TARGET_INDEX) continue;
    const p = basePairPoint(index + .5, 0);
    setInstance(bonds, cursor++, new THREE.Vector3(DNA_X + p.x * 1.02, p.y, p.z * 1.02), null, .8);
  }
  bonds.count = cursor;
  bonds.instanceMatrix.needsUpdate = true;
  return { upper, lower, bonds };
}

function makeGuide(root, materials) {
  const group = new THREE.Group();
  group.name = 'guide RNA spacer and scaffold';
  const points = [];
  for (let index = 0; index < 20; index++) {
    const p = basePairPoint(TARGET_INDEX - 8 + index, 1);
    points.push(new THREE.Vector3(DNA_X + p.x * 1.30, p.y + .08, p.z * 1.30));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  addMesh(group, new THREE.TubeGeometry(curve, 70, .055, 7, false), materials.guide);
  const nucleotides = instanced(group, new THREE.SphereGeometry(.115, 10, 7), materials.guide, 20);
  points.forEach((point, index) => setInstance(nucleotides, index, point, null, .82 + (index % 3) * .08));
  nucleotides.instanceMatrix.needsUpdate = true;
  const scaffold = new THREE.Group();
  scaffold.position.set(1.30, TARGET_Y + 1.15, -.10);
  const stemA = addTubeLike(scaffold, [[-.45, -.7, 0], [-.25, -.25, .04], [-.18, .35, 0], [-.32, .72, .04]], .075, materials.guide);
  const stemB = addTubeLike(scaffold, [[.30, -.7, 0], [.16, -.25, -.04], [.10, .35, 0], [.24, .72, -.04]], .075, materials.guide);
  addMesh(scaffold, new THREE.TorusGeometry(.26, .065, 7, 24), materials.guide, [0, .80, 0], [0, Math.PI / 2, 0]);
  group.add(scaffold);
  group.visible = false;
  root.add(group);
  return { group, curve, nucleotides, scaffold, stemA, stemB };
}

function addTubeLike(parent, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return addMesh(parent, new THREE.TubeGeometry(curve, 24, radius, 7, false), material);
}

function makeProteinDomain(parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = addMesh(parent, geometry, material, position, rotation);
  mesh.scale.set(...scale);
  return mesh;
}

function makeCas9(root, materials) {
  const group = new THREE.Group();
  group.name = 'Cas9 recognition nuclease and base editor';
  group.position.set(1.62, TARGET_Y + .28, .08);
  const body = new THREE.Group();
  makeProteinDomain(body, new THREE.IcosahedronGeometry(.88, 2), materials.cas9, [.35, .12, 0], [1.18, 1.0, .86], [.2, .1, -.1]);
  makeProteinDomain(body, new THREE.IcosahedronGeometry(.62, 1), materials.cas9Dark, [1.02, -.42, .12], [1.1, .82, .9], [0, .3, .2]);
  makeProteinDomain(body, new THREE.IcosahedronGeometry(.54, 1), materials.cas9, [-.34, -.42, -.12], [.9, 1.1, .8]);
  const bridge = addTubeLike(body, [[-.50, .55, -.1], [.2, .88, -.15], [.90, .52, -.05]], .14, materials.cas9);
  const hnh = makeProteinDomain(body, new THREE.IcosahedronGeometry(.40, 1), materials.nuclease, [-.60, -.40, .50], [1, 1.25, .75], [.3, .2, .4]);
  const ruvc = makeProteinDomain(body, new THREE.IcosahedronGeometry(.43, 1), materials.nuclease, [-.12, -.76, -.38], [1.2, .8, .9], [0, -.3, -.2]);
  const deaminase = new THREE.Group();
  deaminase.name = 'adenine deaminase module';
  deaminase.position.set(-.88, .30, .30);
  makeProteinDomain(deaminase, new THREE.IcosahedronGeometry(.49, 2), materials.deaminase, [0, 0, 0], [1.0, .86, .74]);
  makeProteinDomain(deaminase, new THREE.SphereGeometry(.19, 16, 11), materials.deaminase, [-.35, -.12, .12], [1, .8, .8]);
  const catalytic = makeProteinDomain(deaminase, new THREE.OctahedronGeometry(.14, 0), materials.nuclease, [-.20, -.10, .42]);
  const linker = addTubeLike(body, [[-.55, .22, .05], [-.90, .26, .20]], .085, materials.deaminase);
  body.add(deaminase);
  group.add(body);

  const high = new THREE.Group();
  const low = new THREE.Group();
  const random = randomSource(411);
  const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x9bc5f2, emissive: 0x1b3e68, emissiveIntensity: .7, metalness: .25, roughness: .3 });
  const details = instanced(high, new THREE.SphereGeometry(.075, 8, 6), detailMaterial, 34);
  for (let index = 0; index < 34; index++) {
    const angle = random() * TAU;
    const y = (random() - .5) * 1.25;
    const radius = Math.sqrt(Math.max(.1, 1 - (y / 1.4) ** 2));
    setInstance(details, index, new THREE.Vector3(.34 + Math.cos(angle) * radius * .94, y + .12, Math.sin(angle) * radius * .72), null, .6 + random() * .7);
  }
  details.instanceMatrix.needsUpdate = true;
  addMesh(low, new THREE.IcosahedronGeometry(.58, 0), materials.cas9Dark, [.45, .12, 0]);
  const lod = new THREE.LOD();
  lod.addLevel(high, 0);
  lod.addLevel(low, 24);
  group.add(lod);
  root.add(group);
  return { group, body, bridge, hnh, ruvc, deaminase, catalytic, linker, lod };
}

function makeTarget(root, materials) {
  const group = new THREE.Group();
  group.name = 'target locus and PAM marker';
  group.position.set(DNA_X, TARGET_Y, 0);
  const ring = addMesh(group, new THREE.TorusGeometry(1.38, .025, 6, 64), materials.target, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const targetRing = addMesh(group, new THREE.TorusGeometry(.42, .045, 7, 40), materials.target, [1.03, 0, 0], [0, Math.PI / 2, 0]);
  const pam = new THREE.Group();
  pam.position.set(-.15, 1.38, .05);
  for (let index = 0; index < 3; index++) {
    addMesh(pam, new THREE.BoxGeometry(.22, .22, .22), materials.target, [index * .27, 0, 0]);
  }
  group.add(pam);
  const shaderMaterial = makeEditShader();
  const shell = addMesh(group, new THREE.SphereGeometry(1.62, 28, 18), shaderMaterial);
  root.add(group);
  return { group, ring, targetRing, pam, shell, shaderMaterial };
}

function makeRepair(root, materials) {
  const group = new THREE.Group();
  group.name = 'DNA repair complex';
  group.position.set(.45, TARGET_Y, .15);
  const ringA = addMesh(group, new THREE.TorusGeometry(.74, .11, 8, 36), materials.repair, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const ringB = addMesh(group, new THREE.TorusGeometry(.52, .085, 8, 32), materials.repair, [0, .18, 0], [0, Math.PI / 2, .4]);
  for (let index = 0; index < 6; index++) {
    const angle = index / 6 * TAU;
    makeProteinDomain(group, new THREE.IcosahedronGeometry(.21, 1), materials.repair, [Math.cos(angle) * .83, Math.sin(angle) * .55, Math.sin(angle * 2) * .25], [1, 1.25, .85]);
  }
  const particles = instanced(root, new THREE.OctahedronGeometry(.075, 0), materials.repair, 96, true);
  group.visible = false;
  root.add(group);
  return { group, ringA, ringB, particles };
}

export function createCrisprModel() {
  const root = new THREE.Group();
  root.name = 'CRISPR base editing educational molecular model';
  const materials = makeMaterials();
  const dna = makeDNA(root, materials);
  const guide = makeGuide(root, materials);
  const cas9 = makeCas9(root, materials);
  const target = makeTarget(root, materials);
  const repair = makeRepair(root, materials);
  const random = randomSource(982);
  const ambient = instanced(root, new THREE.SphereGeometry(.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7397bd, transparent: true, opacity: .24 }), 100);
  for (let index = 0; index < 100; index++) {
    setInstance(ambient, index, new THREE.Vector3((random() - .5) * 10, (random() - .5) * 11, (random() - .5) * 8), null, .5 + random());
  }
  ambient.instanceMatrix.needsUpdate = true;

  const dummyPoint = new THREE.Vector3();
  const baseA = new THREE.Color(BASE_COLORS.A);
  const baseT = new THREE.Color(BASE_COLORS.T);
  const baseG = new THREE.Color(BASE_COLORS.G);
  const baseC = new THREE.Color(BASE_COLORS.C);
  const intermediateColor = new THREE.Color(0xff8fbd);
  const tempColor = new THREE.Color();
  const targetCenter = new THREE.Vector3();
  const targetPointA = new THREE.Vector3();
  const targetPointB = new THREE.Vector3();
  const targetOuter = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const targetDirection = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  let quality = 2;
  let selected = null;

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, level));
    repair.particles.count = [32, 56, 76, 96][quality];
    ambient.count = [36, 58, 80, 100][quality];
    guide.nucleotides.count = [12, 16, 18, 20][quality];
  }

  function setSelectedNode(id) {
    selected = HOTSPOTS[id] ? id : null;
  }

  function updateDNABaseColors(state) {
    const halves = dna.upper.halves;
    const localIndex = TARGET_INDEX - dna.upper.start;
    const aIndex = localIndex * 2;
    const tIndex = aIndex + 1;
    const a = basePairPoint(TARGET_INDEX, 0);
    const b = basePairPoint(TARGET_INDEX, 1);
    targetPointA.set(DNA_X + a.x * 1.02, a.y, a.z * 1.02);
    targetPointB.set(DNA_X + b.x * 1.02, b.y, b.z * 1.02);
    targetCenter.copy(targetPointA).add(targetPointB).multiplyScalar(.5);
    for (const [strand, outer, instanceIndex] of [[0, targetPointA, aIndex], [1, targetPointB, tIndex]]) {
      targetOuter.copy(outer);
      targetPosition.copy(targetCenter).lerp(targetOuter, .5);
      targetDirection.copy(targetOuter).sub(targetCenter).normalize();
      targetQuaternion.setFromUnitVectors(UP, targetDirection);
      const visibleScale = state.isCut && state.completed ? .001 : 1;
      setInstance(halves, instanceIndex, targetPosition, targetQuaternion, visibleScale);
    }
    halves.instanceMatrix.needsUpdate = true;
    if (state.mechanism === 'base') {
      const amount = state.completed ? 1 : state.deamination;
      if (state.intermediate) {
        halves.setColorAt(aIndex, tempColor.copy(baseA).lerp(intermediateColor, .86));
        halves.setColorAt(tIndex, tempColor.copy(baseT).lerp(baseC, state.repairAmount * .8));
      } else {
        halves.setColorAt(aIndex, tempColor.copy(baseA).lerp(baseG, amount));
        halves.setColorAt(tIndex, tempColor.copy(baseT).lerp(baseC, amount));
      }
    } else {
      halves.setColorAt(aIndex, baseA);
      halves.setColorAt(tIndex, baseT);
    }
    halves.instanceColor.needsUpdate = true;
  }

  function update(state, clock = 0, delta = 0) {
    const current = calculateCrisprState(state?.phase, state?.mechanism);
    const system = sampleParticleSystem(current, clock);
    const blend = delta > 0 ? 1 - Math.exp(-delta * 7) : 1;
    const pulse = .5 + .5 * Math.sin(clock * 4.2);
    const cut = current.isCut;
    const approach = current.modeIndex === 0 ? 1 - current.recognition * .30 : 1;
    cas9.group.position.x = THREE.MathUtils.lerp(cas9.group.position.x, 1.62 - (1 - approach) * 1.1, blend);
    cas9.group.position.y = TARGET_Y + .28 + (1 - current.engagement) * .18;
    cas9.group.rotation.z = Math.sin(clock * .45) * .025;
    cas9.body.rotation.y = Math.sin(clock * .32) * .06;
    cas9.hnh.rotation.z = .4 + current.editAmount * .55;
    cas9.ruvc.rotation.z = -.2 - current.editAmount * .48;
    cas9.hnh.position.x = -.60 + current.editAmount * .18;
    cas9.ruvc.position.y = -.76 + current.editAmount * .12;
    cas9.deaminase.visible = !cut;
    cas9.linker.visible = !cut;
    cas9.deaminase.scale.setScalar(1 + current.deamination * .08 + pulse * .025);
    cas9.catalytic.rotation.y = clock * (current.intermediate ? 3 : .4);
    materials.deaminase.emissiveIntensity = .6 + current.deamination * 2.3;
    materials.nuclease.emissiveIntensity = .5 + current.cutAmount * 2.4;
    materials.cas9.emissiveIntensity = .55 + current.recognition * .65 + (selected === 'cas9' ? .45 : 0);

    guide.group.visible = current.recognition > .02 && !current.completed;
    guide.group.scale.setScalar(.92 + current.recognition * .08);
    guide.group.position.z = (1 - current.recognition) * .55;
    materials.guide.emissiveIntensity = .75 + current.recognition * .95;
    guide.scaffold.rotation.y = Math.sin(clock * .6) * .10;

    dna.upper.group.position.y = THREE.MathUtils.lerp(dna.upper.group.position.y, current.strandSeparation, blend);
    dna.lower.group.position.y = THREE.MathUtils.lerp(dna.lower.group.position.y, -current.strandSeparation, blend);
    dna.upper.group.position.x = current.strandSeparation * .08;
    dna.lower.group.position.x = -current.strandSeparation * .08;
    dna.upper.group.rotation.z = current.strandSeparation * .012;
    dna.lower.group.rotation.z = -current.strandSeparation * .012;
    updateDNABaseColors(current);

    target.group.visible = !current.completed || cut;
    target.ring.rotation.z = clock * .16;
    target.targetRing.scale.setScalar(.94 + current.editAmount * .16 + pulse * .035);
    target.pam.visible = current.modeIndex === 0;
    target.shaderMaterial.uniforms.uTime.value = clock;
    target.shaderMaterial.uniforms.uAmount.value = current.recognition * (.45 + current.editAmount * .55);
    target.shaderMaterial.uniforms.uColor.value.set(cut ? 0xff8b78 : current.completed ? 0x83e2b5 : current.intermediate ? 0xff8fbd : 0x63e6ff);

    repair.group.visible = current.repairAmount > .01;
    repair.group.scale.setScalar(.65 + current.repairAmount * .55);
    repair.ringA.rotation.z = clock * .32;
    repair.ringB.rotation.y = clock * -.38;
    for (let index = 0; index < repair.particles.count; index++) {
      const sample = system.repair(index, repair.particles.count);
      const angle = sample.angle;
      dummyPoint.set(
        .45 + Math.cos(angle) * sample.radius,
        TARGET_Y + sample.y,
        .15 + Math.sin(angle) * sample.radius * .7,
      );
      setInstance(repair.particles, index, dummyPoint, null, Math.max(.001, sample.scale));
    }
    repair.particles.instanceMatrix.needsUpdate = true;
    materials.repair.emissiveIntensity = .7 + current.repairAmount * 1.1;
    ambient.rotation.y = clock * .012;
    root.updateMatrixWorld(true);
  }

  function anchor(id) {
    const lookup = {
      helix: new THREE.Vector3(DNA_X - .35, 1.9, .3),
      guide: new THREE.Vector3(DNA_X + .25, TARGET_Y + .95, 1.25),
      cas9: new THREE.Vector3(2.3, TARGET_Y + 1.1, .3),
      deaminase: new THREE.Vector3(.68, TARGET_Y + .72, .8),
      repair: new THREE.Vector3(.9, TARGET_Y - .6, .85),
    };
    return lookup[id] ? root.localToWorld(lookup[id]) : new THREE.Vector3();
  }

  function dispose() {
    const geometries = new Set();
    const materialSet = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialSet.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materialSet.forEach(material => material.dispose());
  }

  setQuality(quality);
  setSelectedNode(null);
  update(calculateCrisprState(), 0, 0);
  return {
    root,
    components: { dna, guide, cas9, target, repair },
    update,
    setQuality,
    setSelectedNode,
    nodeAnchor: anchor,
    coreAnchor: () => root.localToWorld(new THREE.Vector3(.4, TARGET_Y, 0)),
    dispose,
    stats: MODEL_STATS,
    modeIds: MODE_IDS,
  };
}
