import * as THREE from 'three';
import { MODEL_SPEC, SURFACE_CODE_LAYOUT } from './state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const tempDirection = new THREE.Vector3();
const tempMidpoint = new THREE.Vector3();
const tempColor = new THREE.Color();

export const MODEL_STATS = Object.freeze({
  ...MODEL_SPEC,
  heroParts: MODEL_SPEC.heroPartNames.length,
  physicalSites: SURFACE_CODE_LAYOUT.length,
  educationalApproximation: true,
});

export function getQuantumModelStats() {
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

function lineSegments(parent, positions, material, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = name;
  parent.add(lines);
  return lines;
}

function cylinderInstance(parent, start, end, radius, material, index, mesh, segments = 8) {
  tempDirection.subVectors(end, start);
  tempMidpoint.copy(start).add(end).multiplyScalar(.5);
  dummy.position.copy(tempMidpoint);
  dummy.quaternion.setFromUnitVectors(UP, tempDirection.clone().normalize());
  dummy.scale.set(1, tempDirection.length(), 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function stateShader(color, opacity = .7) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.4);
        float pulse = 0.65 + 0.35 * sin(uTime * 4.0);
        gl_FragColor = vec4(uColor * (0.75 + pulse * 0.55), (0.12 + fresnel * 0.88) * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function makeCryostat(materials) {
  const group = new THREE.Group();
  group.name = 'Dilution cryostat cutaway';
  const shellGeometry = new THREE.CylinderGeometry(4.25, 4.25, 7.5, 64, 1, true, .58, TAU - 1.16);
  addMesh(group, shellGeometry, materials.shell, [0, .15, 0], [0, 0, 0], 'outer shell');
  addMesh(group, new THREE.CylinderGeometry(3.92, 3.92, 6.8, 64, 1, true, .64, TAU - 1.28), materials.shield, [0, .3, 0], [0, 0, 0], 'silver radiation shield');
  addMesh(group, new THREE.CylinderGeometry(4.36, 4.36, .22, 64), materials.aluminum, [0, 3.95, 0], [0, 0, 0], 'service flange');
  addMesh(group, new THREE.CylinderGeometry(4.45, 4.45, .18, 64), materials.aluminum, [0, -3.62, 0], [0, 0, 0], 'vacuum vessel base');
  addMesh(group, new THREE.CylinderGeometry(3.25, 3.25, .16, 64), materials.gold, [0, 4.13, 0], [0, 0, 0], 'cryostat lid');
  addMesh(group, new THREE.TorusGeometry(4.27, .1, 10, 64), materials.steel, [0, 3.97, 0], [Math.PI / 2, 0, 0], 'flange seal');

  const stageData = [
    [-2.85, 3.45, .25, materials.copper, 'mixer plate'],
    [-1.95, 3.2, .18, materials.gold, 'still plate'],
    [-.9, 2.9, .14, materials.aluminum, 'cold stage'],
    [.05, 2.45, .11, materials.copper, 'thermal link'],
  ];
  for (const [y, radius, height, material, name] of stageData) {
    addMesh(group, new THREE.CylinderGeometry(radius, radius, height, 48), material, [0, y, 0], [0, 0, 0], name);
    addMesh(group, new THREE.TorusGeometry(radius, .045, 7, 48), materials.steel, [0, y + height * .5, 0], [Math.PI / 2, 0, 0], `${name} ring`);
  }

  const bolts = makeInstanced(group, new THREE.CylinderGeometry(.075, .075, .14, 6), materials.steel, MODEL_SPEC.cryostatBolts, 'bolt ring');
  for (let index = 0; index < MODEL_SPEC.cryostatBolts; index++) {
    const angle = index / MODEL_SPEC.cryostatBolts * TAU;
    setInstance(bolts, index, [Math.cos(angle) * 4.05, 4.1, Math.sin(angle) * 4.05]);
  }
  bolts.instanceMatrix.needsUpdate = true;

  const vias = makeInstanced(group, new THREE.CylinderGeometry(.035, .035, .38, 6), materials.copper, MODEL_SPEC.thermalVias, 'thermal vias');
  for (let index = 0; index < MODEL_SPEC.thermalVias; index++) {
    const ring = Math.floor(index / 20);
    const angle = (index % 20) / 20 * TAU;
    const radius = 1.1 + ring * .58;
    setInstance(vias, index, [Math.cos(angle) * radius, -1.7 + ring * .58, Math.sin(angle) * radius]);
  }
  vias.instanceMatrix.needsUpdate = true;

  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * TAU;
    const x = Math.cos(angle) * 4.34;
    const z = Math.sin(angle) * 4.34;
    addMesh(group, new THREE.CylinderGeometry(.085, .085, .7, 10), materials.steel, [x, 3.55, z], [0, 0, 0], 'coaxial feedthrough');
    addMesh(group, new THREE.TorusGeometry(.12, .025, 6, 12), materials.copper, [x, 3.92, z], [Math.PI / 2, 0, 0], 'feedthrough ring');
  }
  addMesh(group, new THREE.CylinderGeometry(.36, .36, .85, 18), materials.darkSteel, [-3.2, -3.15, 1.5], [0, 0, Math.PI / 2], 'pump port');
  addMesh(group, new THREE.TorusGeometry(.42, .055, 8, 24), materials.steel, [-3.62, -3.15, 1.5], [0, Math.PI / 2, 0], 'pump port flange');

  const finGeometry = new THREE.BoxGeometry(.045, 1.1, .42);
  const fins = makeInstanced(group, finGeometry, materials.aluminum, 28, 'thermal radiation fins');
  for (let index = 0; index < 28; index++) {
    const angle = index / 28 * TAU;
    setInstance(fins, index, [Math.cos(angle) * 4.25, -2.65, Math.sin(angle) * 4.25], [0, -angle, 0]);
  }
  fins.instanceMatrix.needsUpdate = true;
  return { group, shell: group.getObjectByName('outer shell') };
}

function makeChip(materials) {
  const group = new THREE.Group();
  group.name = 'Superconducting chip and surface-code sites';
  addMesh(group, new THREE.BoxGeometry(6.4, .24, 6.4), materials.silicon, [0, 1.34, 0], [0, 0, 0], 'silicon substrate');
  addMesh(group, new THREE.BoxGeometry(6.12, .07, 6.12), materials.ground, [0, 1.5, 0], [0, 0, 0], 'superconducting ground plane');
  const chipEdges = addEdges(group, new THREE.BoxGeometry(6.4, .24, 6.4), 0x8cecff, .65);
  chipEdges.position.set(0, 1.34, 0);

  const dataSites = SURFACE_CODE_LAYOUT.filter(site => site.kind === 'data');
  const measurementSites = SURFACE_CODE_LAYOUT.filter(site => site.kind === 'measurement');
  const dataPads = makeInstanced(group, new THREE.CylinderGeometry(.22, .24, .1, 18), materials.data, MODEL_SPEC.dataSites, 'data qubit capacitor pads');
  const capacitorBars = makeInstanced(group, new THREE.BoxGeometry(.07, .13, .34), materials.gold, MODEL_SPEC.dataSites * 2, 'data capacitor bars');
  const junctions = makeInstanced(group, new THREE.BoxGeometry(.12, .035, .075), materials.junction, MODEL_SPEC.dataSites, 'Josephson junction markers');
  dataSites.forEach((site, index) => {
    setInstance(dataPads, index, [site.position[0], 1.62, site.position[2]]);
    setInstance(capacitorBars, index * 2, [site.position[0] - .11, 1.72, site.position[2]]);
    setInstance(capacitorBars, index * 2 + 1, [site.position[0] + .11, 1.72, site.position[2]]);
    setInstance(junctions, index, [site.position[0], 1.8, site.position[2]]);
    dataPads.setColorAt(index, tempColor.set(0x79e7f2));
  });
  dataPads.instanceMatrix.needsUpdate = true;
  capacitorBars.instanceMatrix.needsUpdate = true;
  junctions.instanceMatrix.needsUpdate = true;
  dataPads.instanceColor.needsUpdate = true;

  const measurementPads = makeInstanced(group, new THREE.TorusGeometry(.2, .038, 7, 18), materials.measurement, MODEL_SPEC.measurementSites, 'measurement qubit pads');
  measurementSites.forEach((site, index) => {
    setInstance(measurementPads, index, [site.position[0], 1.67, site.position[2]], [Math.PI / 2, 0, 0]);
    measurementPads.setColorAt(index, tempColor.set(0xc08cff));
  });
  measurementPads.instanceMatrix.needsUpdate = true;
  measurementPads.instanceColor.needsUpdate = true;

  const couplers = makeInstanced(group, new THREE.BoxGeometry(.38, .045, .06), materials.coupler, MODEL_SPEC.couplers, 'nearest-neighbor couplers');
  let couplerIndex = 0;
  for (const site of SURFACE_CODE_LAYOUT) {
    const [x, , z] = site.position;
    if (site.column < 6) {
      setInstance(couplers, couplerIndex++, [x + .41, 1.61, z]);
    }
    if (site.row < 6) {
      setInstance(couplers, couplerIndex++, [x, 1.61, z + .41], [0, Math.PI / 2, 0]);
    }
  }
  couplers.instanceMatrix.needsUpdate = true;

  const resonatorPositions = [];
  const readoutPositions = [];
  SURFACE_CODE_LAYOUT.forEach((site, index) => {
    const x = site.position[0];
    const z = site.position[2];
    const direction = index % 2 ? 1 : -1;
    const points = [
      [x, 1.7, z], [x + direction * .28, 1.7, z],
      [x + direction * .28, 1.7, z + .27], [x + direction * .1, 1.7, z + .27],
      [x + direction * .1, 1.7, z + .43], [x + direction * .31, 1.7, z + .43],
      [x + direction * .31, 1.7, z + (site.row - 3) * .07],
    ];
    for (let point = 0; point < points.length - 1; point++) resonatorPositions.push(...points[point], ...points[point + 1]);
    const edgeZ = site.row < 3 ? -3.12 : 3.12;
    readoutPositions.push(x, 1.69, z, x, 1.69, edgeZ);
  });
  lineSegments(group, resonatorPositions, materials.trace, '49 resonator traces');
  lineSegments(group, readoutPositions, materials.readoutTrace, 'readout traces');

  const bonds = makeInstanced(group, new THREE.CylinderGeometry(.012, .012, 1, 5), materials.gold, MODEL_SPEC.wireBonds, 'wire bond array');
  let bondIndex = 0;
  for (let index = 0; index < 24; index++) {
    const side = index % 2 ? 1 : -1;
    const z = -2.7 + Math.floor(index / 2) * .47;
    cylinderInstance(group, new THREE.Vector3(side * 2.55, 1.7, z), new THREE.Vector3(side * 3.08, 1.38, z), .012, materials.gold, bondIndex, bonds, 5);
    cylinderInstance(group, new THREE.Vector3(side * 2.55, 1.7, z + .09), new THREE.Vector3(side * 3.08, 1.38, z + .09), .012, materials.gold, bondIndex + 1, bonds, 5);
    bondIndex += 2;
  }
  bonds.instanceMatrix.needsUpdate = true;

  const controls = makeInstanced(group, new THREE.BoxGeometry(.035, .025, .82), materials.copper, MODEL_SPEC.controlLines, 'microwave control lines');
  for (let index = 0; index < MODEL_SPEC.controlLines; index++) {
    const side = index % 2 ? 1 : -1;
    setInstance(controls, index, [side * 2.82, 1.58, -2.4 + Math.floor(index / 2) * .64]);
  }
  controls.instanceMatrix.needsUpdate = true;

  const contacts = makeInstanced(group, new THREE.BoxGeometry(.16, .05, .3), materials.gold, 48, 'chip edge contacts');
  for (let index = 0; index < 48; index++) {
    const side = Math.floor(index / 12);
    const offset = index % 12;
    const positions = [[-2.85 + offset * .52, 1.57, -3.08], [3.08, 1.57, -2.85 + offset * .52], [2.85 - offset * .52, 1.57, 3.08], [-3.08, 1.57, 2.85 - offset * .52]];
    setInstance(contacts, index, positions[side]);
  }
  contacts.instanceMatrix.needsUpdate = true;

  addMesh(group, new THREE.BoxGeometry(7.05, .14, 7.05), materials.darkSteel, [0, 1.12, 0], [0, 0, 0], 'mounting frame');
  addMesh(group, new THREE.CylinderGeometry(.75, .9, .38, 32), materials.copper, [0, .86, 0], [0, 0, 0], 'chip pedestal');
  return { group, dataPads, measurementPads, junctions, couplers };
}

function makeQuantumInstruments(materials) {
  const group = new THREE.Group();
  group.name = 'Quantum state and correction instruments';
  const bloch = new THREE.Group();
  bloch.position.set(-5.3, 4.2, .4);
  const sphere = addMesh(bloch, new THREE.SphereGeometry(1.08, 36, 24), materials.state, [0, 0, 0], [0, 0, 0], 'superposition sphere');
  for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    addMesh(bloch, new THREE.TorusGeometry(1.09, .013, 5, 64), materials.orbit, [0, 0, 0], rotation, 'bloch orbit ring');
  }
  const vector = addMesh(bloch, new THREE.CylinderGeometry(.025, .025, 1, 8), materials.vector, [0, 0, 0], [0, 0, 0], 'state vector');
  const tip = addMesh(bloch, new THREE.SphereGeometry(.09, 14, 10), materials.vector, [0, 0, 0], [0, 0, 0], 'state vector tip');
  group.add(bloch);

  const syndrome = new THREE.Group();
  syndrome.position.set(0, 3.05, -2.7);
  const bits = [];
  for (let index = 0; index < 4; index++) {
    const bit = addMesh(syndrome, new THREE.BoxGeometry(.42, .16, .18), materials.syndromeOff.clone(), [(index - 1.5) * .58, 0, 0], [0, 0, 0], `syndrome bit ${index + 1}`);
    bits.push(bit);
  }
  group.add(syndrome);

  const errorPulse = addMesh(group, new THREE.SphereGeometry(.31, 20, 14), materials.error, [0, 1.9, 0], [0, 0, 0], 'error pulse');
  const correctionRing = addMesh(group, new THREE.TorusGeometry(.46, .035, 7, 40), materials.correction, [0, 1.88, 0], [Math.PI / 2, 0, 0], 'correction pulse');
  const logicalHalo = addMesh(group, new THREE.TorusGeometry(2.15, .025, 6, 96), materials.logical, [0, 1.86, 0], [Math.PI / 2, 0, 0], 'logical encoding halo');
  return { group, bloch, sphere, vector, tip, bits, errorPulse, correctionRing, logicalHalo };
}

function makeParticles(materials) {
  const count = MODEL_SPEC.particles;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = randomSource(2026);
  for (let index = 0; index < count; index++) {
    tempColor.set(index % 3 === 0 ? 0x79e7f2 : index % 3 === 1 ? 0xffc56e : 0x8bc9ff);
    colors[index * 3] = tempColor.r;
    colors[index * 3 + 1] = tempColor.g;
    colors[index * 3 + 2] = tempColor.b;
    positions[index * 3] = (random() - .5) * 7;
    positions[index * 3 + 1] = random() * 6 - 2.5;
    positions[index * 3 + 2] = (random() - .5) * 7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: .055, vertexColors: true, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.name = 'microwave, readout and cooling particles';
  points.frustumCulled = false;
  return { points, positions, count };
}

export function createQuantumModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'Willow-inspired educational quantum system';
  const materials = {
    silicon: new THREE.MeshStandardMaterial({ color: 0x102536, metalness: .58, roughness: .3 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x8aa3ad, metalness: .92, roughness: .2 }),
    data: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .78, roughness: .24, emissive: 0x164654, emissiveIntensity: .7 }),
    measurement: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .65, roughness: .3, emissive: 0x422060, emissiveIntensity: .65 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9b366, metalness: .86, roughness: .24 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc77b45, metalness: .84, roughness: .3 }),
    aluminum: new THREE.MeshStandardMaterial({ color: 0xbacbd2, metalness: .88, roughness: .22 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6c818c, metalness: .9, roughness: .25 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x24343e, metalness: .8, roughness: .35 }),
    shell: new THREE.MeshPhysicalMaterial({ color: 0x8faebc, metalness: .72, roughness: .18, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }),
    shield: new THREE.MeshStandardMaterial({ color: 0xc6d5da, metalness: .95, roughness: .18, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false }),
    junction: new THREE.MeshStandardMaterial({ color: 0x506c76, metalness: .45, roughness: .18, emissive: 0x2b8292, emissiveIntensity: .55 }),
    coupler: new THREE.MeshStandardMaterial({ color: 0x697e88, metalness: .82, roughness: .28 }),
    trace: new THREE.LineBasicMaterial({ color: 0xe7bd6a, transparent: true, opacity: .76 }),
    readoutTrace: new THREE.LineBasicMaterial({ color: 0x78dce9, transparent: true, opacity: .58 }),
    orbit: new THREE.MeshBasicMaterial({ color: 0x73dce8, transparent: true, opacity: .34, depthWrite: false }),
    vector: new THREE.MeshBasicMaterial({ color: 0xb9f7ff }),
    state: stateShader(0x55dff2, .75),
    error: stateShader(0xff536f, .9),
    correction: new THREE.MeshBasicMaterial({ color: 0x8df5c7, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }),
    logical: new THREE.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }),
    syndromeOff: new THREE.MeshStandardMaterial({ color: 0x27313d, metalness: .45, roughness: .4, emissive: 0x000000 }),
    anisotropy: Math.min(8, options.anisotropy || 4),
  };

  const cryostat = makeCryostat(materials);
  const chip = makeChip(materials);
  const instruments = makeQuantumInstruments(materials);
  const particles = makeParticles(materials);
  root.add(cryostat.group, chip.group, instruments.group, particles.points);

  const chipLod = new THREE.LOD();
  const lowChip = new THREE.Group();
  lowChip.name = 'Low-LOD chip silhouette';
  addMesh(lowChip, new THREE.BoxGeometry(6.4, .24, 6.4), materials.silicon, [0, 1.34, 0]);
  addMesh(lowChip, new THREE.BoxGeometry(5.9, .08, 5.9), materials.ground, [0, 1.5, 0]);
  const lowSites = makeInstanced(lowChip, new THREE.CylinderGeometry(.18, .18, .08, 10), materials.data, 49, 'low-LOD site field');
  SURFACE_CODE_LAYOUT.forEach((site, index) => setInstance(lowSites, index, [site.position[0], 1.62, site.position[2]]));
  lowSites.instanceMatrix.needsUpdate = true;
  const mediumChip = chip.group.clone(true);
  mediumChip.name = 'Medium-LOD chip';
  chipLod.addLevel(chip.group, 0);
  chipLod.addLevel(mediumChip, 34);
  chipLod.addLevel(lowChip, 52);
  chipLod.autoUpdate = false;
  root.add(chipLod);
  root.remove(chip.group);

  const pedestal = addMesh(root, new THREE.CylinderGeometry(6.4, 6.8, .28, 64), materials.darkSteel, [0, -3.95, 0], [0, 0, 0], 'display pedestal');
  addMesh(root, new THREE.TorusGeometry(6.45, .035, 6, 96), materials.logical, [0, -3.78, 0], [Math.PI / 2, 0, 0], 'interactive outline');

  let disposed = false;
  let quality = 2;
  let presentation = { mode: 'superposition', hotspot: null, reducedMotion: false };

  function anchor(id) {
    if (id === 'chip') return new THREE.Vector3(0, 1.6, 0);
    if (id === 'qubit') return new THREE.Vector3(.82, 1.85, .82);
    if (id === 'resonator') return new THREE.Vector3(0, 1.72, -1.2);
    if (id === 'code') return new THREE.Vector3(0, 1.75, 0);
    return new THREE.Vector3(0, .2, 0);
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(2, Number(level) || 0));
    chipLod.autoUpdate = quality === 2;
    const lodIndex = [2, 1, 0][quality];
    chipLod.levels.forEach((entry, index) => { entry.object.visible = index === lodIndex; });
    cryostat.group.getObjectByName('thermal vias').visible = quality >= 1;
    instruments.bloch.visible = presentation.mode === 'superposition' || quality > 0;
    particles.points.geometry.setDrawRange(0, Math.floor(particles.count * [.45, .72, 1][quality]));
  }

  function setPresentation(next = {}) {
    presentation = { ...presentation, ...next };
    instruments.bloch.visible = presentation.mode === 'superposition';
  }

  function update(state) {
    if (disposed) return;
    const mode = state.mode;
    const time = state.time;
    instruments.sphere.material.uniforms.uTime.value = time;
    instruments.vector.position.set(state.bloch.x * .52, state.bloch.z * .52, state.bloch.y * .52);
    instruments.vector.scale.y = 1.05;
    instruments.vector.quaternion.setFromUnitVectors(UP, new THREE.Vector3(state.bloch.x, state.bloch.z, state.bloch.y).normalize());
    instruments.tip.position.set(state.bloch.x * 1.04, state.bloch.z * 1.04, state.bloch.y * 1.04);
    instruments.bloch.rotation.y = time * .12;

    const dataLookup = new Map(SURFACE_CODE_LAYOUT.filter(site => site.kind === 'data').map(site => [site.index, site]));
    let dataIndex = 0;
    for (const qubit of state.qubits) {
      if (qubit.kind !== 'data') continue;
      const color = qubit.error ? 0xff526f : qubit.corrected ? 0x8df5c7 : qubit.logical ? 0xa18cff : 0x79e7f2;
      chip.dataPads.setColorAt(dataIndex, tempColor.set(color));
      dataIndex++;
    }
    chip.dataPads.instanceColor.needsUpdate = true;
    let measurementIndex = 0;
    for (const qubit of state.qubits) {
      if (qubit.kind !== 'measurement') continue;
      chip.measurementPads.setColorAt(measurementIndex, tempColor.set(qubit.measured ? 0xffcf70 : 0xc08cff));
      measurementIndex++;
    }
    chip.measurementPads.instanceColor.needsUpdate = true;

    instruments.errorPulse.visible = state.errorActive;
    if (state.errorIndex >= 0) {
      const site = SURFACE_CODE_LAYOUT[state.errorIndex];
      instruments.errorPulse.position.set(site.position[0], 1.95, site.position[2]);
      instruments.errorPulse.scale.setScalar(.75 + .35 * Math.sin(time * 8));
      instruments.correctionRing.position.set(site.position[0], 1.88, site.position[2]);
    }
    instruments.correctionRing.visible = mode === 'correction';
    instruments.correctionRing.scale.setScalar(.7 + state.correctionProgress * 1.5);
    instruments.logicalHalo.visible = mode === 'logical';
    instruments.logicalHalo.scale.setScalar(.85 + state.logical.relativeError * .2);
    instruments.bits.forEach((bit, index) => {
      const on = state.syndromeBits[index] === 1;
      bit.material.color.set(on ? 0xffc76d : 0x27313d);
      bit.material.emissive.set(on ? 0xff9b3d : 0x000000);
      bit.material.emissiveIntensity = on ? 1.4 : 0;
    });

    for (let index = 0; index < particles.count; index++) {
      const phase = (state.flows.microwave + index / particles.count) % 1;
      const route = index % 3;
      if (route === 0) {
        particles.positions[index * 3] = Math.sin(index * 2.1) * 3.1;
        particles.positions[index * 3 + 1] = -1.8 + phase * 3.5;
        particles.positions[index * 3 + 2] = -2.8 + (index % 7) * .8;
      } else if (route === 1) {
        particles.positions[index * 3] = (index % 7 - 3) * .82;
        particles.positions[index * 3 + 1] = 1.75 + Math.sin(phase * TAU) * .08;
        particles.positions[index * 3 + 2] = -3 + phase * 6;
      } else {
        const angle = index * 2.399 + time * .08;
        particles.positions[index * 3] = Math.cos(angle) * (3.3 + (index % 5) * .15);
        particles.positions[index * 3 + 1] = -2.8 + state.flows.cooling * 5.8;
        particles.positions[index * 3 + 2] = Math.sin(angle) * (3.3 + (index % 5) * .15);
      }
    }
    particles.points.geometry.attributes.position.needsUpdate = true;
    cryostat.shell.material.opacity = mode === 'logical' ? .13 : .22;
    pedestal.rotation.y = 0;
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
    const materials = new Set();
    root.traverse(object => {
      if (object.isMesh) meshes++;
      if (object.isInstancedMesh) {
        instancedMeshes++;
        instances += object.count;
      }
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
    });
    return { ...MODEL_STATS, meshes, instancedMeshes, instances, materials: materials.size, quality };
  }

  setQuality(2);
  return { root, anchor, setQuality, setPresentation, update, dispose, stats, get counts() { return stats(); } };
}
