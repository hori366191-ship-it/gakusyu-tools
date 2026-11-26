import * as THREE from 'three';
import { NODE_IDS, NODES, getMode } from './content.mjs';
import {
  RADIAL_COLORS,
  TAU,
  calculateLoopState,
  loopAngle,
  loopPose,
  sampleRadialParticle,
  tangentAtAngle,
} from './loop-state.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const LOOP_RADIUS = 5.15;
const INNER_RADIUS = 2.72;
const SAFETY_RADIUS = 7.25;

function randomSource(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function edgeLines(mesh, color = 0x9beeff, opacity = .5) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 24),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.add(lines);
  return lines;
}

function glowMaterial(color, opacity = .08) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function makeTraceLines(parent, width, depth, count, material, y = 0) {
  const random = randomSource(Math.round((width + depth) * 100));
  const positions = [];
  for (let index = 0; index < count; index++) {
    const x = (random() - .5) * width;
    const z = (random() - .5) * depth;
    const endX = THREE.MathUtils.clamp(x + (random() - .5) * width * .8, -width / 2, width / 2);
    const endZ = THREE.MathUtils.clamp(z + (random() - .5) * depth * .8, -depth / 2, depth / 2);
    const bendX = (x + endX) / 2;
    positions.push(x, y, z, bendX, y, z, bendX, y, z, endX, y, endZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, material);
  parent.add(lines);
  return lines;
}

function makeCircuit(count) {
  const random = randomSource(481);
  const geometry = new THREE.BoxGeometry(.075, .16, .028);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8be8f2,
    emissive: 0x2a9cad,
    emissiveIntensity: 1.5,
    metalness: .35,
    roughness: .3,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const position = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const y = 1 - (index / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * 2.399963229728653;
    position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius).multiplyScalar(1.5);
    dummy.position.copy(position);
    dummy.lookAt(position.clone().multiplyScalar(2));
    dummy.rotateZ((random() - .5) * 1.8);
    dummy.scale.setScalar(.65 + random() * .8);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.set(index % 5 === 0 ? 0xb9f7ff : index % 3 === 0 ? 0x5aa8ff : 0x72e4ed);
    mesh.setColorAt(index, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.userData.fullCount = count;
  mesh.frustumCulled = false;
  return mesh;
}

function makeComputeUnits(count) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x173847,
    emissive: 0x1b8290,
    emissiveIntensity: 1.15,
    metalness: .72,
    roughness: .26,
  });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, .12, .25), material, count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const ring = Math.floor(index / 6);
    const angle = index / 6 * TAU + ring * .4;
    const radius = .38 + ring * .25;
    dummy.position.set(Math.cos(angle) * radius, (ring % 2 ? .18 : -.18), Math.sin(angle) * radius);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.fullCount = count;
  return mesh;
}

function makeCore() {
  const group = new THREE.Group();
  group.name = 'AI core';
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x153343,
    emissive: 0x176373,
    emissiveIntensity: .8,
    metalness: .82,
    roughness: .22,
    transparent: true,
    opacity: .78,
    side: THREE.DoubleSide,
  });
  const midShellMaterial = shellMaterial.clone();
  midShellMaterial.opacity = .34;
  midShellMaterial.roughness = .18;
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8be8f2,
    metalness: .08,
    roughness: .08,
    clearcoat: 1,
    clearcoatRoughness: .06,
    transparent: true,
    opacity: .14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shells = new THREE.Group();
  for (const [radius, material] of [[1.2, midShellMaterial], [1.46, shellMaterial]]) {
    addMesh(shells, new THREE.SphereGeometry(radius, 32, 16, 0, TAU, 0, Math.PI / 2), material);
    addMesh(shells, new THREE.SphereGeometry(radius, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2), material);
  }
  addMesh(shells, new THREE.SphereGeometry(1.68, 36, 18, 0, TAU, 0, Math.PI / 2), glassMaterial);
  addMesh(shells, new THREE.SphereGeometry(1.68, 36, 18, 0, TAU, Math.PI / 2, Math.PI / 2), glassMaterial);
  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x426777, metalness: .9, roughness: .2, emissive: 0x123743, emissiveIntensity: .7 });
  addMesh(shells, new THREE.TorusGeometry(1.68, .026, 6, 80), seamMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  group.add(shells);

  const inner = new THREE.Group();
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x0b2c31, metalness: .38, roughness: .48, emissive: 0x08282b, emissiveIntensity: .7 });
  const traceMaterial = new THREE.LineBasicMaterial({ color: 0x72e4ed, transparent: true, opacity: .74, blending: THREE.AdditiveBlending });
  addMesh(inner, new THREE.CylinderGeometry(1.08, 1.08, .07, 32), boardMaterial);
  addMesh(inner, new THREE.CylinderGeometry(.86, .86, .06, 28), boardMaterial, [0, 0, 0], [0, 0, Math.PI / 2]);
  makeTraceLines(inner, 1.85, 1.85, 22, traceMaterial, .045);
  const computeUnits = makeComputeUnits(18);
  inner.add(computeUnits);
  const nucleus = addMesh(inner, new THREE.IcosahedronGeometry(.31, 1), new THREE.MeshStandardMaterial({
    color: 0xe8feff,
    emissive: 0x8be8f2,
    emissiveIntensity: 2.8,
    metalness: .2,
    roughness: .18,
  }));
  group.add(inner);

  const circuit = makeCircuit(150);
  group.add(circuit);
  const haloMaterial = glowMaterial(0x72e4ed, .075);
  addMesh(group, new THREE.SphereGeometry(1.98, 28, 18), haloMaterial);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fbfca,
    emissive: 0x1d6d79,
    emissiveIntensity: 1.1,
    metalness: .88,
    roughness: .2,
    transparent: true,
    opacity: .78,
  });
  const rings = new THREE.Group();
  const gyros = [];
  for (const [radius, tube, rotation] of [[1.82, .025, [.5, .2, .1]], [2.08, .018, [1.15, -.4, .6]], [2.34, .014, [.2, 1.1, -.3]]]) {
    const ring = addMesh(rings, new THREE.TorusGeometry(radius, tube, 7, 96), ringMaterial, [0, 0, 0], rotation);
    gyros.push(ring);
  }
  group.add(rings);

  const fiberMaterial = new THREE.MeshStandardMaterial({ color: 0x72e4ed, emissive: 0x2b9cad, emissiveIntensity: 1.8, metalness: .25, roughness: .24 });
  const fiberAccentMaterial = fiberMaterial.clone();
  fiberAccentMaterial.color.set(0xc39cff);
  fiberAccentMaterial.emissive.set(0x7146a1);
  const fibers = new THREE.Group();
  for (let index = 0; index < 10; index++) {
    const angle = index / 10 * TAU;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * .5, Math.sin(angle * 2) * .25, Math.sin(angle) * .5),
      new THREE.Vector3(Math.cos(angle + .25) * .95, Math.sin(angle * 3) * .45, Math.sin(angle + .25) * .95),
      new THREE.Vector3(Math.cos(angle) * 1.42, Math.sin(angle * 2) * .7, Math.sin(angle) * 1.42),
    ]);
    addMesh(fibers, new THREE.TubeGeometry(curve, 12, .016, 5, false), index % 2 ? fiberMaterial : fiberAccentMaterial);
  }
  group.add(fibers);

  const light = new THREE.PointLight(0x72e4ed, 12, 9, 2);
  group.add(light);
  return {
    group, shells, shellMaterial, midShellMaterial, glassMaterial, inner, nucleus, circuit, computeUnits,
    haloMaterial, ringMaterial, rings, gyros, fibers, fiberMaterial, fiberAccentMaterial, light,
  };
}

function makeParticles(count, geometry, opacity = .9) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.fullCount = count;
  return mesh;
}

function makeCodeModule(parent, bodyMaterial, accentMaterial) {
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x0d3034, metalness: .42, roughness: .42, emissive: 0x09272a, emissiveIntensity: .8 });
  const board = addMesh(parent, new THREE.BoxGeometry(1.5, .12, 1.18), boardMaterial, [0, -.36, 0]);
  edgeLines(board, 0x4e9ca4, .42);
  const body = new THREE.Group();
  const chip = addMesh(body, new THREE.BoxGeometry(.74, .2, .62), bodyMaterial, [0, -.19, 0]);
  edgeLines(chip, 0x9beeff, .62);
  parent.add(body);
  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xb6c8cc, metalness: .92, roughness: .2 });
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(.055, .055, .17), pinMaterial, 24);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 24; index++) {
    const side = Math.floor(index / 6);
    const step = index % 6;
    if (side < 2) dummy.position.set(-.42 + step * .168, -.25, side === 0 ? -.39 : .39);
    else dummy.position.set(side === 2 ? -.45 : .45, -.25, -.3 + step * .12);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pins.setMatrixAt(index, dummy.matrix);
  }
  pins.instanceMatrix.needsUpdate = true;
  parent.add(pins);
  makeTraceLines(parent, 1.32, 1.02, 16, new THREE.LineBasicMaterial({ color: 0x72e4ed, transparent: true, opacity: .68 }), -.292);
  const particles = makeParticles(20, new THREE.TetrahedronGeometry(.045, 0), .88);
  particles.material.dispose();
  particles.material = accentMaterial;
  parent.add(particles);
  const seeds = Array.from({ length: 20 }, (_, index) => ({
    x: (randomSource(index + 31)() - .5) * 1.4,
    z: (randomSource(index + 71)() - .5) * 1.1,
    phase: index * .73,
  }));
  return { body, particles, particleSeeds: seeds, scanRings: [], layers: [], arm: null, needle: null, networkNodes: null };
}

function makeExperimentModule(parent, bodyMaterial, accentMaterial) {
  const body = new THREE.Group();
  addMesh(body, new THREE.CylinderGeometry(.42, .5, .5, 20), bodyMaterial, [0, -.12, 0]);
  addMesh(body, new THREE.TorusGeometry(.47, .035, 6, 40), accentMaterial, [0, .16, 0], [Math.PI / 2, 0, 0]);
  parent.add(body);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa7e9f2, transparent: true, opacity: .22, roughness: .08, metalness: .05, depthWrite: false });
  const liquid = new THREE.MeshStandardMaterial({ color: 0x4aa8d8, emissive: 0x1f5f94, emissiveIntensity: 1.1, transparent: true, opacity: .72, roughness: .2 });
  for (let index = 0; index < 3; index++) {
    const x = -.52 + index * .52;
    addMesh(parent, new THREE.CylinderGeometry(.105, .105, .68, 14, 1, true), glass, [x, .05, -.38]);
    addMesh(parent, new THREE.CylinderGeometry(.078, .078, .34, 12), liquid, [x, -.08, -.38]);
    addMesh(parent, new THREE.TorusGeometry(.108, .018, 5, 18), accentMaterial, [x, .39, -.38], [Math.PI / 2, 0, 0]);
  }
  const arm = new THREE.Group();
  arm.position.set(.38, -.35, .28);
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0x69808a, metalness: .86, roughness: .26 });
  addMesh(arm, new THREE.CylinderGeometry(.07, .09, .58, 10), armMaterial, [0, .28, 0]);
  addMesh(arm, new THREE.SphereGeometry(.11, 12, 8), accentMaterial, [0, .58, 0]);
  const forearm = new THREE.Group();
  forearm.position.y = .58;
  addMesh(forearm, new THREE.CylinderGeometry(.055, .07, .5, 10), armMaterial, [0, .24, 0]);
  addMesh(forearm, new THREE.BoxGeometry(.26, .06, .08), armMaterial, [0, .5, 0]);
  arm.add(forearm);
  parent.add(arm);
  const scanRings = [];
  for (const [radius, rotation] of [[.7, [.4, .2, 0]], [.88, [1.1, -.4, .5]]]) {
    scanRings.push(addMesh(parent, new THREE.TorusGeometry(radius, .018, 5, 56), accentMaterial, [0, .05, 0], rotation));
  }
  const particles = makeParticles(18, new THREE.SphereGeometry(.04, 7, 5), .82);
  particles.material.dispose();
  particles.material = accentMaterial;
  parent.add(particles);
  const particleSeeds = Array.from({ length: 18 }, (_, index) => ({ angle: index * 2.4, radius: .35 + (index % 4) * .13, phase: index * .61 }));
  return { body, particles, particleSeeds, scanRings, layers: [], arm, forearm, needle: null, networkNodes: null };
}

function makeEvaluationModule(parent, bodyMaterial, accentMaterial) {
  const body = new THREE.Group();
  const sample = addMesh(body, new THREE.DodecahedronGeometry(.43, 0), bodyMaterial);
  edgeLines(sample, 0x9beeff, .55);
  parent.add(body);
  const scanRings = [];
  for (const [radius, rotation] of [[.65, [.2, .3, 0]], [.82, [1.1, -.2, .6]], [.98, [.7, .8, -.4]]]) {
    scanRings.push(addMesh(parent, new THREE.TorusGeometry(radius, .02, 5, 64), accentMaterial, [0, .02, 0], rotation));
  }
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x39525b, metalness: .8, roughness: .3 });
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * TAU + Math.PI / 4;
    const x = Math.cos(angle) * .72;
    const z = Math.sin(angle) * .72;
    addMesh(parent, new THREE.CylinderGeometry(.065, .09, .68, 8), pillarMaterial, [x, -.18, z]);
    addMesh(parent, new THREE.OctahedronGeometry(.1, 0), accentMaterial, [x, .2, z]);
  }
  const gauge = addMesh(parent, new THREE.TorusGeometry(.53, .028, 6, 40, Math.PI * 1.5), accentMaterial, [0, .12, .58], [0, 0, Math.PI * .25]);
  const needle = addMesh(parent, new THREE.BoxGeometry(.035, .4, .035), accentMaterial, [0, .12, .6], [0, 0, -.55]);
  return { body, particles: null, particleSeeds: [], scanRings, layers: [], arm: null, needle, gauge, networkNodes: null };
}

function makeModelModule(parent, bodyMaterial, accentMaterial) {
  const body = new THREE.Group();
  const generationCore = addMesh(body, new THREE.IcosahedronGeometry(.36, 1), bodyMaterial);
  edgeLines(generationCore, 0xd8c7ff, .62);
  parent.add(body);
  const layers = [];
  const layerMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2142, metalness: .66, roughness: .28, emissive: 0x2c174c, emissiveIntensity: .8, transparent: true, opacity: .82 });
  for (let index = 0; index < 5; index++) {
    const radius = .7 - index * .055;
    const layer = addMesh(parent, new THREE.CylinderGeometry(radius, radius, .055, 6), layerMaterial, [0, -.42 + index * .21, 0]);
    layer.userData.baseY = layer.position.y;
    edgeLines(layer, 0xc39cff, .36);
    layers.push(layer);
  }
  const networkNodes = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 7, 5), accentMaterial, 24);
  const dummy = new THREE.Object3D();
  const points = [];
  for (let layer = 0; layer < 4; layer++) {
    for (let index = 0; index < 6; index++) {
      const angle = index / 6 * TAU + layer * .2;
      const radius = .58 - layer * .045;
      const y = -.32 + layer * .21;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push([x, y, z]);
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      networkNodes.setMatrixAt(layer * 6 + index, dummy.matrix);
    }
  }
  networkNodes.instanceMatrix.needsUpdate = true;
  parent.add(networkNodes);
  const synapsePositions = [];
  for (let layer = 0; layer < 3; layer++) {
    for (let index = 0; index < 6; index++) {
      const a = points[layer * 6 + index];
      const b = points[(layer + 1) * 6 + ((index + 2) % 6)];
      synapsePositions.push(...a, ...b);
    }
  }
  const synapseGeometry = new THREE.BufferGeometry();
  synapseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(synapsePositions, 3));
  parent.add(new THREE.LineSegments(synapseGeometry, new THREE.LineBasicMaterial({ color: 0xc39cff, transparent: true, opacity: .34 })));
  return { body, particles: null, particleSeeds: [], scanRings: [], layers, arm: null, needle: null, networkNodes };
}

function makeNode(node, index) {
  const group = new THREE.Group();
  group.name = node.title;
  const angle = loopAngle(index / NODE_IDS.length);
  const basePosition = new THREE.Vector3(Math.cos(angle) * LOOP_RADIUS, index % 2 ? .36 : .12, Math.sin(angle) * LOOP_RADIUS);
  group.position.copy(basePosition);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x102330,
    emissive: new THREE.Color(node.color).multiplyScalar(.45),
    emissiveIntensity: .9,
    metalness: .72,
    roughness: .28,
  });
  const glow = glowMaterial(node.color, .06);
  const cageMaterial = new THREE.MeshBasicMaterial({ color: node.color, wireframe: true, transparent: true, opacity: .14, depthWrite: false });
  const accentMaterial = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: .86 });
  const pedestal = addMesh(group, new THREE.CylinderGeometry(.82, .98, .14, 8), new THREE.MeshStandardMaterial({
    color: 0x132634,
    metalness: .82,
    roughness: .34,
    emissive: 0x0a1d29,
    emissiveIntensity: .6,
  }), [0, -.9, 0]);
  const baseRing = addMesh(group, new THREE.TorusGeometry(.93, .024, 5, 56), accentMaterial, [0, -.8, 0], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.SphereGeometry(1.08, 20, 12), glow);
  const cage = addMesh(group, new THREE.IcosahedronGeometry(1.04, 0), cageMaterial);
  const builders = {
    code: makeCodeModule,
    experiment: makeExperimentModule,
    evaluation: makeEvaluationModule,
    model: makeModelModule,
  };
  const module = builders[node.id](group, bodyMaterial, accentMaterial);
  const fullParticleCount = module.particles?.userData.fullCount || 0;

  function setQuality(level) {
    if (module.particles) module.particles.count = [Math.ceil(fullParticleCount * .45), Math.ceil(fullParticleCount * .65), Math.ceil(fullParticleCount * .85), fullParticleCount][level];
    if (module.networkNodes) module.networkNodes.count = [10, 16, 20, 24][level];
  }

  return {
    id: node.id,
    group,
    body: module.body,
    bodyMaterial,
    glow,
    cage,
    cageMaterial,
    accentMaterial,
    basePosition,
    orbiters: [],
    particles: module.particles,
    particleSeeds: module.particleSeeds,
    scanRings: module.scanRings,
    layers: module.layers,
    arm: module.arm,
    forearm: module.forearm,
    needle: module.needle,
    gauge: module.gauge,
    networkNodes: module.networkNodes,
    pedestal,
    baseRing,
    phase: index * .8,
    setQuality,
  };
}

function makeLoop() {
  const group = new THREE.Group();
  group.name = 'outer improvement loop';
  const material = new THREE.MeshBasicMaterial({ color: 0x72e4ed, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false });
  const openMaterial = material.clone();
  const closedRing = addMesh(group, new THREE.TorusGeometry(LOOP_RADIUS, .03, 6, 160), material, [0, .2, 0], [Math.PI / 2, 0, 0]);
  const openRing = new THREE.Group();
  openRing.position.y = .2;
  addMesh(openRing, new THREE.TorusGeometry(LOOP_RADIUS, .03, 6, 96, Math.PI), openMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const lowerArc = new THREE.TorusGeometry(LOOP_RADIUS, .03, 6, 64, Math.PI / 2);
  lowerArc.rotateZ(Math.PI * 1.5);
  addMesh(openRing, lowerArc, openMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  group.add(openRing);
  const secondaryMaterial = openMaterial.clone();
  secondaryMaterial.opacity = .12;
  const secondary = new THREE.Group();
  secondary.position.y = .08;
  secondary.rotation.set(1.08, .16, .34);
  addMesh(secondary, new THREE.TorusGeometry(LOOP_RADIUS + .28, .012, 5, 96, Math.PI), secondaryMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const lowerSecondary = new THREE.TorusGeometry(LOOP_RADIUS + .28, .012, 5, 64, Math.PI / 2);
  lowerSecondary.rotateZ(Math.PI * 1.5);
  addMesh(secondary, lowerSecondary, secondaryMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  group.add(secondary);
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x9beeff, transparent: true, opacity: .76 });
  const arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(.09, .27, 5), arrowMaterial, 12);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.frustumCulled = false;
  group.add(arrows);
  return { group, closedRing, openRing, material, openMaterial, secondary, secondaryMaterial, arrows, arrowMaterial };
}

function makeInnerLoop() {
  const group = new THREE.Group();
  group.name = 'inner recursive generation loop';
  const material = new THREE.MeshStandardMaterial({
    color: 0xc39cff,
    emissive: 0x6f3fa1,
    emissiveIntensity: 1.35,
    metalness: .58,
    roughness: .24,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = addMesh(group, new THREE.TorusGeometry(INNER_RADIUS, .035, 6, 120), material, [0, .42, 0], [Math.PI / 2, 0, 0]);
  const second = addMesh(group, new THREE.TorusGeometry(INNER_RADIUS + .18, .014, 5, 120), material, [0, .42, 0], [1.05, .3, .4]);
  const particles = makeParticles(36, new THREE.OctahedronGeometry(.065, 0), .9);
  particles.material.dispose();
  particles.material = material;
  group.add(particles);
  const generationMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c8ff, emissive: 0x8754c7, emissiveIntensity: 1.8, metalness: .5, roughness: .2, transparent: true, opacity: 0 });
  const generations = [];
  for (let index = 0; index < 5; index++) {
    const angle = loopAngle(index / 5);
    const generation = addMesh(group, new THREE.IcosahedronGeometry(.14 + index * .018, 0), generationMaterial, [Math.cos(angle) * INNER_RADIUS, .42, Math.sin(angle) * INNER_RADIUS]);
    edgeLines(generation, 0xf0e7ff, .55);
    generations.push(generation);
  }
  return { group, material, ring, second, particles, generations, generationMaterial };
}

function makeHumanGate() {
  const group = new THREE.Group();
  group.name = 'human approval gate';
  const angle = -Math.PI / 4;
  const tangent = tangentAtAngle(angle);
  group.position.set(Math.cos(angle) * LOOP_RADIUS, .2, Math.sin(angle) * LOOP_RADIUS);
  group.rotation.y = Math.atan2(tangent.x, tangent.z);
  const material = new THREE.MeshStandardMaterial({ color: 0x83e2b5, emissive: 0x286b51, emissiveIntensity: 1.25, metalness: .62, roughness: .26, transparent: true, opacity: .8 });
  const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x83e2b5, transparent: true, opacity: .12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  addMesh(group, new THREE.BoxGeometry(.13, 1.15, .13), material, [-.58, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(.13, 1.15, .13), material, [.58, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(1.28, .13, .13), material, [0, .55, 0]);
  addMesh(group, new THREE.PlaneGeometry(1.05, .95), planeMaterial, [0, .02, 0]);
  const seal = addMesh(group, new THREE.OctahedronGeometry(.19, 0), material, [0, .08, .04]);
  edgeLines(seal, 0xd9ffe9, .6);
  return { group, material, planeMaterial, seal };
}

function makeSafetyRing() {
  const group = new THREE.Group();
  group.name = 'human oversight and safety ring';
  const material = new THREE.MeshStandardMaterial({
    color: 0x83e2b5,
    emissive: 0x286b51,
    emissiveIntensity: 1.05,
    metalness: .5,
    roughness: .32,
    transparent: true,
    opacity: .68,
  });
  const thinMaterial = material.clone();
  thinMaterial.opacity = 0;
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x83e2b5, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = addMesh(group, new THREE.TorusGeometry(SAFETY_RADIUS, .022, 5, 160), lineMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const outer = addMesh(group, new THREE.TorusGeometry(SAFETY_RADIUS + .34, .068, 7, 160), material, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const thinOuter = addMesh(group, new THREE.TorusGeometry(SAFETY_RADIUS + .34, .018, 5, 160), thinMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(.38, .09, .15), material, 32);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 32; index++) {
    const angle = index / 32 * TAU;
    dummy.position.set(Math.cos(angle) * SAFETY_RADIUS, .02, Math.sin(angle) * SAFETY_RADIUS);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.setScalar(index % 4 === 0 ? 1.45 : .8);
    dummy.updateMatrix();
    blocks.setMatrixAt(index, dummy.matrix);
  }
  blocks.instanceMatrix.needsUpdate = true;
  blocks.userData.fullCount = 32;
  blocks.frustumCulled = false;
  group.add(blocks);
  const gates = new THREE.Group();
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * TAU + Math.PI / 4;
    const gate = new THREE.Group();
    gate.position.set(Math.cos(angle) * (SAFETY_RADIUS + .15), 0, Math.sin(angle) * (SAFETY_RADIUS + .15));
    addMesh(gate, new THREE.CylinderGeometry(.045, .045, .62, 6), material, [0, .25, 0]);
    addMesh(gate, new THREE.OctahedronGeometry(.12, 0), material, [0, .62, 0]);
    gates.add(gate);
  }
  group.add(gates);
  return { group, material, thinMaterial, lineMaterial, inner, outer, thinOuter, blocks, gates };
}

export function createRSIModel() {
  const root = new THREE.Group();
  root.name = 'RSI educational conceptual model';
  const core = makeCore();
  const nodes = NODES.map((node, index) => makeNode(node, index));
  const loop = makeLoop();
  const inner = makeInnerLoop();
  const gate = makeHumanGate();
  const safety = makeSafetyRing();
  root.add(core.group, loop.group, inner.group, gate.group, safety.group);
  nodes.forEach(node => root.add(node.group));

  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x2e6570, emissive: 0x174b55, emissiveIntensity: .8, metalness: .68, roughness: .3 });
  const cableAccentMaterial = cableMaterial.clone();
  cableAccentMaterial.color.set(0x4f3b68);
  cableAccentMaterial.emissive.set(0x33204e);
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const start = node.basePosition.clone().normalize().multiplyScalar(1.55);
    for (let strand = 0; strand < 3; strand++) {
      const offset = (strand - 1) * .12;
      const middle = start.clone().lerp(node.basePosition, .52);
      middle.y += .28 + strand * .12;
      middle.x += offset;
      middle.z -= offset;
      const curve = new THREE.CatmullRomCurve3([start, middle, node.basePosition.clone()]);
      addMesh(root, new THREE.TubeGeometry(curve, 12, .018, 5, false), strand === 1 ? cableAccentMaterial : cableMaterial);
    }
  }

  const loopParticles = makeParticles(96, new THREE.SphereGeometry(.055, 6, 4), .92);
  const radialParticles = makeParticles(48, new THREE.SphereGeometry(.068, 6, 4), .88);
  root.add(loopParticles, radialParticles);
  const color = new THREE.Color();
  for (let index = 0; index < 96; index++) loopParticles.setColorAt(index, color.set(index % 2 ? 0x72e4ed : 0x5aa8ff));
  for (let index = 0; index < 48; index++) radialParticles.setColorAt(index, color.set(RADIAL_COLORS.outbound));
  loopParticles.instanceColor.needsUpdate = true;
  radialParticles.instanceColor.needsUpdate = true;

  const riskMaterial = new THREE.MeshBasicMaterial({ color: 0xff546d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const riskSparks = makeParticles(56, new THREE.TetrahedronGeometry(.075, 0), .85);
  riskSparks.material.dispose();
  riskSparks.material = riskMaterial;
  root.add(riskSparks);

  const random = randomSource(906);
  const sparkSeeds = Array.from({ length: 56 }, () => ({
    angle: random() * TAU,
    radius: 1.8 + random() * 5.2,
    height: (random() - .5) * 4.6,
    speed: .7 + random() * 1.8,
    scale: .45 + random() * 1.1,
  }));
  const dummy = new THREE.Object3D();
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const primaryColor = new THREE.Color(0x72e4ed);
  const secondaryColor = new THREE.Color(0x5aa8ff);
  const displayPrimary = primaryColor.clone();
  const displaySecondary = secondaryColor.clone();
  const riskColor = new THREE.Color(0xff546d);
  const baseCoreColor = new THREE.Color(0x153343);
  const tempColor = new THREE.Color();
  const safetyColor = new THREE.Color(0x83e2b5);
  let quality = 2;
  let selectedNode = null;
  let structureBlend = 0;
  let safetyBlockCount = 32;

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, level));
    core.circuit.count = [55, 90, 125, 150][quality];
    core.computeUnits.count = [8, 12, 15, 18][quality];
    loopParticles.count = [28, 48, 72, 96][quality];
    radialParticles.count = [16, 28, 40, 48][quality];
    inner.particles.count = [12, 20, 28, 36][quality];
    riskSparks.count = [16, 28, 40, 56][quality];
    safetyBlockCount = [16, 24, 28, 32][quality];
    nodes.forEach(node => node.setQuality(quality));
  }

  function setSelectedNode(id) {
    selectedNode = NODE_IDS.includes(id) ? id : null;
  }

  function updateNodeParticles(node, clock) {
    if (!node.particles) return;
    for (let index = 0; index < node.particles.count; index++) {
      const seed = node.particleSeeds[index % node.particleSeeds.length];
      if (node.id === 'code') {
        dummy.position.set(seed.x + Math.sin(clock * .8 + seed.phase) * .06, -.12 + Math.sin(clock * 1.3 + seed.phase) * .16, seed.z);
        dummy.rotation.set(clock + seed.phase, clock * .7, 0);
      } else {
        const angle = seed.angle + clock * .45;
        dummy.position.set(Math.cos(angle) * seed.radius, .12 + Math.sin(clock + seed.phase) * .22, Math.sin(angle) * seed.radius - .2);
        dummy.rotation.set(0, angle, 0);
      }
      dummy.scale.setScalar(.7 + .3 * Math.sin(clock * 2 + seed.phase));
      dummy.updateMatrix();
      node.particles.setMatrixAt(index, dummy.matrix);
    }
    node.particles.instanceMatrix.needsUpdate = true;
  }

  function update(state, clock, delta = 0) {
    const mode = getMode(state.mode);
    const hypothetical = state.mode === 'hypothesis';
    const instability = Math.max(0, Math.min(1, state.instability || 0));
    const oversight = Math.max(0, Math.min(1, (state.oversight ?? 65) / 100));
    const pulse = .5 + .5 * Math.sin(clock * 2.4);
    const targetStructure = state.structureTarget ?? (hypothetical ? 1 : 0);
    structureBlend = delta > 0 ? THREE.MathUtils.lerp(structureBlend, targetStructure, 1 - Math.exp(-delta * 5.5)) : targetStructure;
    const colorBlend = delta > 0 ? 1 - Math.exp(-delta * 6) : 1;
    primaryColor.set(mode.palette.primary);
    secondaryColor.set(mode.palette.secondary);
    displayPrimary.lerp(primaryColor, colorBlend);
    displaySecondary.lerp(secondaryColor, colorBlend);

    core.shellMaterial.color.lerpColors(baseCoreColor, riskColor, instability * .78);
    core.shellMaterial.emissive.lerpColors(displayPrimary, riskColor, instability);
    core.shellMaterial.emissiveIntensity = .6 + pulse * .2 + instability * .5;
    core.midShellMaterial.emissive.copy(core.shellMaterial.emissive);
    core.midShellMaterial.emissiveIntensity = .8 + instability * .4;
    core.glassMaterial.color.lerpColors(displayPrimary, riskColor, instability * .7);
    core.glassMaterial.opacity = .12 + pulse * .025 + instability * .06;
    core.inner.rotation.y = -clock * (.22 + state.automation / 420);
    core.inner.rotation.x = clock * .11;
    core.nucleus.rotation.set(clock * .31, clock * .23, 0);
    core.nucleus.material.emissive.lerpColors(displayPrimary, riskColor, instability);
    core.computeUnits.material.emissive.lerpColors(displaySecondary, riskColor, instability * .8);
    core.circuit.material.emissive.lerpColors(displayPrimary, riskColor, instability * .8);
    core.haloMaterial.color.lerpColors(displayPrimary, riskColor, instability);
    core.haloMaterial.opacity = .055 + pulse * .025 + instability * .09;
    core.ringMaterial.color.lerpColors(displayPrimary, riskColor, instability * .8);
    core.ringMaterial.emissive.lerpColors(displayPrimary, riskColor, instability);
    core.rings.rotation.y = clock * (.16 + state.automation / 500);
    core.rings.rotation.x = Math.sin(clock * .17) * .16;
    core.gyros.forEach((gyro, index) => {
      gyro.rotation.z += delta * (.12 + index * .05) * (index % 2 ? -1 : 1);
      gyro.rotation.y += delta * .07 * (index + 1);
    });
    core.fiberMaterial.emissive.lerpColors(displayPrimary, riskColor, instability * .7);
    core.fiberAccentMaterial.emissive.lerpColors(displaySecondary, riskColor, instability * .7);
    core.fibers.rotation.y = clock * .08;
    core.light.color.lerpColors(displayPrimary, riskColor, instability);
    core.light.intensity = 10 + pulse * 3 + instability * 5;
    core.group.position.set(
      Math.sin(clock * 31) * .085 * instability,
      Math.cos(clock * 27) * .065 * instability,
      Math.sin(clock * 23) * .07 * instability,
    );
    core.group.scale.setScalar(1 + pulse * .018 + instability * Math.sin(clock * 37) * .025);

    loop.material.color.lerpColors(displayPrimary, riskColor, instability * .9);
    loop.openMaterial.color.copy(loop.material.color);
    loop.secondaryMaterial.color.copy(loop.material.color);
    loop.arrowMaterial.color.lerpColors(displaySecondary, riskColor, instability);
    loop.material.opacity = (.36 + oversight * .18 + instability * .16) * structureBlend;
    loop.openMaterial.opacity = (.4 + oversight * .18 + instability * .16) * (1 - structureBlend);
    loop.secondaryMaterial.opacity = .13 * (1 - structureBlend);
    loop.closedRing.visible = structureBlend > .002;
    loop.openRing.visible = structureBlend < .998;
    loop.secondary.visible = structureBlend < .998;
    const arrowCount = structureBlend > .5 ? 12 : 9;
    loop.arrows.count = arrowCount;
    for (let index = 0; index < arrowCount; index++) {
      const offset = structureBlend > .5 ? index / arrowCount : index / (arrowCount - 1) * .76;
      const pose = loopPose(offset, structureBlend > .5 ? 'hypothesis' : 'assisted');
      dummy.position.set(Math.cos(pose.angle) * LOOP_RADIUS, .2, Math.sin(pose.angle) * LOOP_RADIUS);
      direction.set(pose.tangent.x, 0, pose.tangent.z);
      dummy.quaternion.setFromUnitVectors(UP, direction);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      loop.arrows.setMatrixAt(index, dummy.matrix);
    }
    loop.arrows.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < loopParticles.count; index++) {
      const band = index % 3;
      const pose = loopPose(state.phase + index / loopParticles.count, state.mode);
      const radius = LOOP_RADIUS + (band - 1) * .1;
      dummy.position.set(Math.cos(pose.angle) * radius, .2 + Math.sin(pose.angle * 2 + clock * .22) * .09 + band * .035, Math.sin(pose.angle) * radius);
      dummy.quaternion.identity();
      dummy.scale.setScalar((.75 + (index % 5) * .11 + instability * .2) * Math.max(0, pose.opacity));
      dummy.updateMatrix();
      loopParticles.setMatrixAt(index, dummy.matrix);
      loopParticles.setColorAt(index, tempColor.copy(index % 2 ? displayPrimary : displaySecondary).lerp(riskColor, instability * .75));
    }
    loopParticles.instanceMatrix.needsUpdate = true;
    loopParticles.instanceColor.needsUpdate = true;

    inner.group.visible = structureBlend > .005;
    inner.group.scale.setScalar(.72 + structureBlend * .28);
    inner.material.opacity = .58 * structureBlend;
    inner.generationMaterial.opacity = .9 * structureBlend;
    inner.material.color.lerpColors(displaySecondary, riskColor, instability * .8);
    inner.generationMaterial.emissive.lerpColors(displaySecondary, riskColor, instability * .8);
    inner.ring.rotation.z = clock * .12;
    inner.second.rotation.y = -clock * .16;
    for (let index = 0; index < inner.particles.count; index++) {
      const angle = loopAngle(state.phase * 1.5 + index / inner.particles.count);
      dummy.position.set(Math.cos(angle) * INNER_RADIUS, .42 + Math.sin(angle * 2) * .08, Math.sin(angle) * INNER_RADIUS);
      dummy.quaternion.identity();
      dummy.scale.setScalar(.65 + .35 * Math.sin(clock * 3 + index));
      dummy.updateMatrix();
      inner.particles.setMatrixAt(index, dummy.matrix);
    }
    inner.particles.instanceMatrix.needsUpdate = true;
    const activeGeneration = Math.floor(state.phase * inner.generations.length) % inner.generations.length;
    inner.generations.forEach((generation, index) => {
      const active = index === activeGeneration;
      generation.scale.setScalar(active ? 1.45 + pulse * .18 : .82 + index * .05);
      generation.rotation.y = clock * (.3 + index * .04);
    });

    gate.group.visible = structureBlend < .995;
    gate.group.scale.setScalar(.62 + (1 - structureBlend) * .38);
    gate.material.opacity = (.25 + oversight * .62) * (1 - structureBlend);
    gate.planeMaterial.opacity = .14 * (1 - structureBlend);
    gate.material.emissiveIntensity = .8 + pulse * .45;
    gate.seal.rotation.y = clock * .5;

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const selected = selectedNode === node.id;
      const scale = THREE.MathUtils.lerp(node.group.scale.x, selected ? 1.16 : 1, delta > 0 ? 1 - Math.exp(-delta * 9) : 1);
      node.group.scale.setScalar(scale);
      node.group.position.copy(node.basePosition);
      node.group.position.x += Math.sin(clock * (19 + index * 3) + index) * .045 * instability;
      node.group.position.y += Math.cos(clock * (23 + index * 2) + index) * .04 * instability;
      node.body.rotation.y = clock * (.18 + index * .025) + index;
      node.body.rotation.x = Math.sin(clock * .27 + index) * .16;
      node.cage.rotation.y = -clock * (.12 + index * .018);
      node.cageMaterial.opacity = (selected ? .32 : .14) + pulse * .035;
      node.glow.opacity = (selected ? .15 : .06) + pulse * .018 + instability * .05;
      tempColor.set(NODES[index].color).lerp(displayPrimary, hypothetical ? .42 : 0).lerp(riskColor, instability * .76);
      node.bodyMaterial.emissive.lerpColors(tempColor, riskColor, instability * .45);
      node.accentMaterial.color.lerpColors(tempColor, riskColor, instability * .7);
      node.scanRings.forEach((ring, ringIndex) => {
        ring.rotation.y += delta * (.22 + ringIndex * .08) * (ringIndex % 2 ? -1 : 1);
        ring.rotation.z += delta * .06;
      });
      if (node.arm) {
        node.arm.rotation.z = Math.sin(clock * .7) * .28;
        node.forearm.rotation.z = -.45 + Math.sin(clock * .9 + 1) * .35;
      }
      if (node.needle) node.needle.rotation.z = -.8 + Math.sin(clock * .65) * .55 + instability * .3;
      node.layers.forEach((layer, layerIndex) => {
        layer.position.y = layer.userData.baseY + Math.sin(clock * .8 + layerIndex * .6) * .035;
        layer.rotation.y = clock * (.12 + layerIndex * .025);
        layer.scale.setScalar(layerIndex === activeGeneration ? 1.12 : 1);
      });
      updateNodeParticles(node, clock);
    }

    const radialLanes = Math.max(1, Math.floor(radialParticles.count / 4));
    for (let index = 0; index < radialParticles.count; index++) {
      const nodeIndex = index % 4;
      const lane = Math.floor(index / 4);
      const life = clock * (.12 + state.particleSpeed * .07) + lane / radialLanes + nodeIndex * .19;
      const radial = sampleRadialParticle(life);
      const node = nodes[nodeIndex];
      position.copy(node.basePosition).normalize().multiplyScalar(1.65).lerp(node.basePosition, radial.travel);
      position.y += Math.sin(radial.life * Math.PI) * .16 + Math.sin(clock + lane) * .025;
      dummy.position.copy(position);
      dummy.quaternion.identity();
      dummy.scale.setScalar(.6 + Math.sin(radial.life * Math.PI) * .7);
      dummy.updateMatrix();
      radialParticles.setMatrixAt(index, dummy.matrix);
      radialParticles.setColorAt(index, tempColor.set(radial.color));
    }
    radialParticles.instanceMatrix.needsUpdate = true;
    radialParticles.instanceColor.needsUpdate = true;

    cableMaterial.emissive.lerpColors(displayPrimary, riskColor, instability * .6);
    cableAccentMaterial.emissive.lerpColors(displaySecondary, riskColor, instability * .6);
    safetyColor.set(hypothetical ? '#ffc07a' : '#83e2b5').lerp(riskColor, Math.max(0, (state.risk - 55) / 45));
    safety.material.color.copy(safetyColor);
    safety.material.emissive.copy(safetyColor).multiplyScalar(.42);
    safety.material.opacity = (.2 + oversight * .58) * (1 - structureBlend);
    safety.material.emissiveIntensity = .65 + oversight * .8;
    safety.thinMaterial.color.copy(safetyColor);
    safety.thinMaterial.emissive.copy(safetyColor).multiplyScalar(.55);
    safety.thinMaterial.opacity = (.16 + (.5 + .5 * Math.sin(clock * 5.2)) * .26) * structureBlend;
    safety.lineMaterial.color.copy(safetyColor);
    safety.lineMaterial.opacity = .1 + oversight * .28;
    safety.outer.visible = structureBlend < .998;
    safety.thinOuter.visible = structureBlend > .002;
    safety.blocks.count = structureBlend > .5 ? Math.max(4, Math.floor(safetyBlockCount * .45)) : safetyBlockCount;
    safety.blocks.scale.setScalar(.96 + oversight * .06);
    safety.gates.scale.set(1, (.65 + oversight * .4) * (1 - structureBlend), 1);
    safety.gates.rotation.y = clock * .018 * (hypothetical ? -1 : 1);

    riskSparks.visible = instability > .015;
    riskMaterial.opacity = instability * .78;
    for (let index = 0; index < riskSparks.count; index++) {
      const seed = sparkSeeds[index];
      const angle = seed.angle + clock * seed.speed * .12;
      const jitter = Math.sin(clock * (17 + index % 7) + index) * .22 * instability;
      dummy.position.set(
        Math.cos(angle) * (seed.radius + jitter),
        seed.height + Math.cos(clock * seed.speed + index) * .3 * instability,
        Math.sin(angle) * (seed.radius + jitter),
      );
      dummy.rotation.set(clock * seed.speed, angle, clock * .7);
      dummy.scale.setScalar(seed.scale * instability * (.65 + .35 * Math.sin(clock * 9 + index)));
      dummy.updateMatrix();
      riskSparks.setMatrixAt(index, dummy.matrix);
    }
    riskSparks.instanceMatrix.needsUpdate = true;
    root.updateMatrixWorld(true);
  }

  function nodeAnchor(id) {
    const node = nodes.find(entry => entry.id === id);
    return node ? node.group.localToWorld(new THREE.Vector3(0, 1.08, 0)) : new THREE.Vector3();
  }

  function gateAnchor() {
    return gate.group.localToWorld(new THREE.Vector3(0, .85, 0));
  }

  function innerAnchor() {
    return inner.group.localToWorld(new THREE.Vector3(0, .9, 0));
  }

  setQuality(quality);
  setSelectedNode(null);
  update(calculateLoopState(), 0, 0);

  return {
    root,
    nodes,
    components: Object.freeze({ core, loop, inner, gate, safety }),
    update,
    setQuality,
    setSelectedNode,
    nodeAnchor,
    gateAnchor,
    innerAnchor,
    coreAnchor: () => core.group.localToWorld(new THREE.Vector3(0, 0, 0)),
    get structureBlend() { return structureBlend; },
    stats: Object.freeze({
      circuit: 150,
      computeUnits: 18,
      loopParticles: 96,
      radialParticles: 48,
      innerParticles: 36,
      safetySegments: 32,
      riskSparks: 56,
    }),
  };
}
