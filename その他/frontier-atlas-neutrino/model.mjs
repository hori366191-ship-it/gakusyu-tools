import * as THREE from 'three';
import { VERTEX, SECONDARY_DIRECTION, ENTRY_POINT, fract } from './state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FULL_STRINGS = 86;
const DOMS_PER_STRING = 60;
const FULL_DOMS = FULL_STRINGS * DOMS_PER_STRING;
const FULL_TIES = 600;
const PHOTONS = 280;
const CASCADE = 42;
const QUALITY_COUNTS = Object.freeze({
  strings: [36, 54, 72, 86],
  doms: [1200, 2400, 3600, 5160],
  ties: [180, 300, 430, 600],
  photons: [90, 160, 220, 280],
});

export const MODEL_STATS = Object.freeze({
  meaningfulParts: FULL_STRINGS + FULL_DOMS + FULL_TIES + 24,
  detectorStrings: FULL_STRINGS,
  domInstances: FULL_DOMS,
  cableTieInstances: FULL_TIES,
  photonInstances: PHOTONS,
  cascadeInstances: CASCADE,
  instancedSystems: 8,
  pbrMaterials: 13,
  shaderMaterials: 2,
  lodLevels: 2,
  qualityLevels: 4,
});

function randomSource(seed = 73) {
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

function makeInstances(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.fullCount = count;
  mesh.frustumCulled = false;
  return mesh;
}

function makeLine(parent, points, color, opacity = .7, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => Array.isArray(point) ? new THREE.Vector3(...point) : point));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .35, gapSize: .24, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  parent.add(line);
  return line;
}

function makeEarth() {
  const group = new THREE.Group();
  group.name = 'Earth cutaway';
  const rock = new THREE.MeshStandardMaterial({ color: 0x183643, roughness: .82, metalness: .08, emissive: 0x06131e, emissiveIntensity: .7 });
  addMesh(group, new THREE.SphereGeometry(19, 56, 28, 0, TAU, 0, Math.PI * .64), rock, [0, -30, 0]);
  const core = addMesh(group, new THREE.SphereGeometry(7.5, 32, 18), new THREE.MeshStandardMaterial({ color: 0x59332e, roughness: .65, metalness: .16, emissive: 0x35100d, emissiveIntensity: .6 }), [0, -33, 0]);
  const scanMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x69e5ff) } },
    vertexShader: `varying vec3 vPos; varying vec3 vNormal; void main(){vPos=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vPos; varying vec3 vNormal; void main(){float band=pow(max(0.,sin(vPos.y*.82+uTime*.35)),22.);float rim=pow(1.-abs(vNormal.z),2.);float alpha=(band*.22+rim*.18)*smoothstep(-19.,-9.,vPos.y+19.);gl_FragColor=vec4(uColor,alpha);}`,
  });
  addMesh(group, new THREE.SphereGeometry(19.12, 48, 24, 0, TAU, 0, Math.PI * .64), scanMaterial, [0, -30, 0]);
  for (const radius of [12.5, 16]) {
    addMesh(group, new THREE.TorusGeometry(radius, .025, 5, 80), new THREE.MeshBasicMaterial({ color: 0x70d5e8, transparent: true, opacity: .24 }), [0, -30, 0], [Math.PI / 2, 0, 0]);
  }
  return { group, core, scanMaterial };
}

function makeIce() {
  const group = new THREE.Group();
  group.name = 'Antarctic ice cutaway';
  const iceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8fd9ed, roughness: .12, metalness: .02, transmission: .28, thickness: 3,
    transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false, clearcoat: .7,
  });
  const slab = addMesh(group, new THREE.BoxGeometry(27, 10, 23), iceMaterial, [0, -6.4, 0]);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x78dff4, transparent: true, opacity: .42 }));
  edges.position.copy(slab.position);
  group.add(edges);
  const snow = new THREE.MeshStandardMaterial({ color: 0xc8e7ed, roughness: .92, metalness: .02 });
  addMesh(group, new THREE.BoxGeometry(28, .35, 24), snow, [0, -1.12, 0]);
  const strataMaterial = new THREE.MeshPhysicalMaterial({ color: 0x4f9db8, roughness: .35, transparent: true, opacity: .09, depthWrite: false });
  for (const y of [-3.1, -5.4, -7.7, -9.9]) addMesh(group, new THREE.BoxGeometry(26.8, .06, 22.8), strataMaterial, [0, y, 0]);
  const station = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x879aa5, metalness: .82, roughness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x152b3a, metalness: .55, roughness: .48 });
  addMesh(station, new THREE.BoxGeometry(4.2, 1.05, 2.8), steel, [0, .12, 0]);
  addMesh(station, new THREE.BoxGeometry(4.5, .12, 3.1), dark, [0, .72, 0]);
  for (const x of [-1.5, -.5, .5, 1.5]) addMesh(station, new THREE.BoxGeometry(.65, .12, 1.5), dark, [x, .87, 0]);
  addMesh(station, new THREE.CylinderGeometry(.035, .035, 2.5, 8), steel, [1.5, 1.9, 0]);
  addMesh(station, new THREE.SphereGeometry(.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0xa7f3ff, emissive: 0x42d6ef, emissiveIntensity: 2, roughness: .2 }), [1.5, 3.15, 0]);
  for (const x of [-1.8, 1.8]) for (const z of [-1.2, 1.2]) addMesh(station, new THREE.CylinderGeometry(.05, .05, .8, 6), steel, [x, -.45, z]);
  group.add(station);
  return { group, slab, iceMaterial, station };
}

function buildStringLayout() {
  const random = randomSource(86);
  const points = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) points.push({ x: (x - 4.5) * 1.62, z: (z - 4.5) * 1.62, order: random() });
  points.sort((a, b) => a.order - b.order);
  return points.slice(0, FULL_STRINGS).map(({ x, z }) => [x, z]);
}

export function createNeutrinoModel() {
  const root = new THREE.Group();
  root.name = 'IceCube educational observatory';
  const earth = makeEarth();
  const ice = makeIce();
  root.add(earth.group, ice.group);

  const layout = buildStringLayout();
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x617783, metalness: .78, roughness: .36 });
  const cableGeometry = new THREE.CylinderGeometry(.022, .022, 10.2, 5);
  const cables = makeInstances(cableGeometry, cableMaterial, FULL_STRINGS);
  const dummy = new THREE.Object3D();
  layout.forEach(([x, z], index) => {
    dummy.position.set(x, -5.95, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); cables.setMatrixAt(index, dummy.matrix);
  });
  cables.instanceMatrix.needsUpdate = true;

  const domMaterial = new THREE.MeshPhysicalMaterial({ color: 0x173b4b, emissive: 0x0e657b, emissiveIntensity: .8, metalness: .42, roughness: .18, clearcoat: 1 });
  const domGeometry = new THREE.SphereGeometry(.095, 10, 7);
  const doms = makeInstances(domGeometry, domMaterial, FULL_DOMS);
  const sensorPositions = [];
  for (let string = 0; string < FULL_STRINGS; string++) {
    const [x, z] = layout[string];
    for (let level = 0; level < DOMS_PER_STRING; level++) {
      const y = -1.45 - level * .154;
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      doms.setMatrixAt(string * DOMS_PER_STRING + level, dummy.matrix);
      sensorPositions.push(new THREE.Vector3(x, y, z));
    }
  }
  doms.instanceMatrix.needsUpdate = true;
  doms.userData.sensorPositions = sensorPositions;

  const tieMaterial = new THREE.MeshStandardMaterial({ color: 0x365464, metalness: .7, roughness: .4 });
  const ties = makeInstances(new THREE.TorusGeometry(.045, .012, 4, 7), tieMaterial, FULL_TIES);
  const random = randomSource(460);
  for (let index = 0; index < FULL_TIES; index++) {
    const [x, z] = layout[index % FULL_STRINGS];
    dummy.position.set(x, -1.7 - random() * 8.7, z); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); ties.setMatrixAt(index, dummy.matrix);
  }
  ties.instanceMatrix.needsUpdate = true;

  const simpleGroup = new THREE.Group();
  const simpleCables = makeInstances(cableGeometry, cableMaterial, 36);
  const simpleDoms = makeInstances(new THREE.BoxGeometry(.13, .13, .13), new THREE.MeshStandardMaterial({ color: 0x72d8ec, emissive: 0x1b7b8c, emissiveIntensity: 1.2, metalness: .3, roughness: .3 }), 432);
  for (let index = 0; index < 36; index++) {
    const [x, z] = layout[index];
    dummy.position.set(x, -5.95, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); simpleCables.setMatrixAt(index, dummy.matrix);
    for (let level = 0; level < 12; level++) {
      dummy.position.set(x, -1.7 - level * .73, z); dummy.updateMatrix(); simpleDoms.setMatrixAt(index * 12 + level, dummy.matrix);
    }
  }
  simpleGroup.add(simpleCables, simpleDoms);
  const detailedGroup = new THREE.Group();
  detailedGroup.add(cables, doms, ties);
  const detectorLOD = new THREE.LOD();
  detectorLOD.name = 'detector grid LOD';
  detectorLOD.addLevel(detailedGroup, 0);
  detectorLOD.addLevel(simpleGroup, 52);
  root.add(detectorLOD);

  const signal = new THREE.Group();
  signal.name = 'interaction and light';
  const neutrinoMaterial = new THREE.MeshStandardMaterial({ color: 0xe9fdff, emissive: 0x8eeeff, emissiveIntensity: 3, metalness: .05, roughness: .15 });
  const neutrino = addMesh(signal, new THREE.SphereGeometry(.13, 18, 12), neutrinoMaterial, ENTRY_POINT);
  const track = makeLine(signal, [ENTRY_POINT, VERTEX], 0xb8f7ff, .78, true);
  const secondaryPoints = [];
  for (let index = 0; index <= 20; index++) secondaryPoints.push(VERTEX.map((value, axis) => value + SECONDARY_DIRECTION[axis] * index * .42));
  const secondaryTrack = makeLine(signal, secondaryPoints, 0xb99cff, .62, true);
  const vertexMaterial = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const vertex = addMesh(signal, new THREE.IcosahedronGeometry(.22, 1), vertexMaterial, VERTEX);
  addMesh(signal, new THREE.SphereGeometry(.58, 20, 14), new THREE.MeshBasicMaterial({ color: 0x75eaff, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false }), VERTEX);

  const coneMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 }, uColor: { value: new THREE.Color(0x6ce8ff) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){vUv=uv;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform float uStrength;uniform vec3 uColor;varying vec2 vUv;varying vec3 vN;void main(){float pulse=.55+.45*sin(vUv.y*38.-uTime*6.);float rim=pow(1.-abs(vN.z),1.7);float fade=smoothstep(0.,.13,vUv.y)*(1.-smoothstep(.78,1.,vUv.y));gl_FragColor=vec4(uColor,(.08+pulse*.12+rim*.2)*fade*uStrength);}`,
  });
  const direction = new THREE.Vector3(...SECONDARY_DIRECTION).normalize();
  const cone = addMesh(signal, new THREE.ConeGeometry(3.4, 7.2, 48, 8, true), coneMaterial);
  cone.position.copy(new THREE.Vector3(...VERTEX)).addScaledVector(direction, 3.6);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
  const basisU = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > .9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  const basisV = new THREE.Vector3().crossVectors(direction, basisU).normalize();
  const coneRimPoints = [];
  for (let index = 0; index <= 64; index++) {
    const angle = index / 64 * TAU;
    coneRimPoints.push(new THREE.Vector3(...VERTEX).addScaledVector(direction, 7.2).addScaledVector(basisU, Math.cos(angle) * 3.4).addScaledVector(basisV, Math.sin(angle) * 3.4));
  }
  const coneRim = makeLine(signal, coneRimPoints, 0x71e9ff, .42);

  const photonMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const photons = makeInstances(new THREE.SphereGeometry(.026, 5, 4), photonMaterial, PHOTONS);
  const photonSeeds = [];
  for (let index = 0; index < PHOTONS; index++) {
    const axial = random();
    photonSeeds.push({ axial, angle: random() * TAU, radius: .2 + random() * .8, speed: .65 + random() * .6 });
  }
  signal.add(photons);
  const cascadeMaterial = new THREE.MeshBasicMaterial({ color: 0xc8a7ff, transparent: true, opacity: .78, blending: THREE.AdditiveBlending, depthWrite: false });
  const cascade = makeInstances(new THREE.IcosahedronGeometry(.04, 0), cascadeMaterial, CASCADE);
  const cascadeSeeds = Array.from({ length: CASCADE }, () => ({ travel: random(), angle: random() * TAU, spread: random() }));
  signal.add(cascade);

  const hitMaterial = new THREE.MeshBasicMaterial({ color: 0xbefaff, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
  const hits = makeInstances(new THREE.SphereGeometry(.18, 10, 7), hitMaterial, 64);
  const hitPositions = [];
  for (let index = 0; index < 64; index++) {
    const travel = .25 + index / 64 * 4.9;
    const target = new THREE.Vector3(...VERTEX).addScaledVector(direction, travel);
    let nearest = sensorPositions[0];
    let distance = Infinity;
    for (const candidate of sensorPositions) {
      const d = candidate.distanceToSquared(target);
      if (d < distance) { distance = d; nearest = candidate; }
    }
    hitPositions.push(nearest.clone());
    dummy.position.copy(nearest); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.4); dummy.updateMatrix(); hits.setMatrixAt(index, dummy.matrix);
  }
  hits.userData.positions = hitPositions;
  signal.add(hits);

  const reconstruction = new THREE.Group();
  reconstruction.name = 'probabilistic reconstruction';
  const incoming = new THREE.Vector3(...ENTRY_POINT).sub(new THREE.Vector3(...VERTEX)).normalize();
  const arrow = new THREE.ArrowHelper(incoming, new THREE.Vector3(...VERTEX), 10, 0xf3c77c, .7, .34);
  arrow.line.material.transparent = true; arrow.line.material.opacity = .82;
  reconstruction.add(arrow);
  const uncertaintyPoints = [];
  for (let index = 0; index <= 72; index++) {
    const angle = index / 72 * TAU;
    uncertaintyPoints.push(new THREE.Vector3(...VERTEX).addScaledVector(incoming, 8.7).addScaledVector(basisU, Math.cos(angle) * 1.25).addScaledVector(basisV, Math.sin(angle) * 1.25));
  }
  makeLine(reconstruction, uncertaintyPoints, 0xf3c77c, .55, true);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) makeLine(reconstruction, [VERTEX, uncertaintyPoints[Math.round(angle / TAU * 72)]], 0xf3c77c, .18, true);
  root.add(signal, reconstruction);

  const anchors = Object.freeze({
    surface: new THREE.Vector3(0, 1.7, 0),
    strings: new THREE.Vector3(-7.4, -6.3, 4.2),
    vertex: new THREE.Vector3(...VERTEX),
    cone: new THREE.Vector3(...VERTEX).addScaledVector(direction, 5).addScaledVector(basisU, 1.4),
    reconstruction: new THREE.Vector3(...VERTEX).addScaledVector(incoming, 7.5),
  });

  let quality = 2;
  function setQuality(level) {
    quality = THREE.MathUtils.clamp(Math.round(Number(level) || 0), 0, 3);
    const strings = QUALITY_COUNTS.strings[quality];
    cables.count = strings; simpleCables.count = Math.min(36, strings);
    doms.count = strings * DOMS_PER_STRING; ties.count = QUALITY_COUNTS.ties[quality];
    simpleDoms.count = Math.min(432, strings * 12);
    photons.count = QUALITY_COUNTS.photons[quality];
    root.userData.quality = quality;
  }

  function update(state) {
    const t = state.lightProgress;
    coneMaterial.uniforms.uTime.value = t * TAU;
    coneMaterial.uniforms.uStrength.value = .35 + state.weights.light * .8;
    earth.scanMaterial.uniforms.uTime.value = t * TAU;
    neutrino.position.set(...state.neutrinoPosition);
    neutrino.visible = state.weights.neutrino > .5;
    neutrinoMaterial.opacity = state.weights.neutrino;
    neutrinoMaterial.transparent = true;
    track.material.opacity = state.weights.neutrino * .8;
    vertex.scale.setScalar(.65 + state.weights.vertex * (.5 + .2 * Math.sin(t * TAU * 3)));
    vertex.visible = state.active > 0;
    secondaryTrack.visible = state.active > 0;
    cone.visible = state.active >= 2; coneRim.visible = state.active >= 2;
    cascade.visible = state.active === 1 || state.active === 2;
    photons.visible = state.active === 2 || state.active === 3;
    hits.visible = state.active === 3;
    reconstruction.visible = state.active === 4;
    ice.iceMaterial.opacity = state.active === 0 ? .16 : .09;

    for (let index = 0; index < PHOTONS; index++) {
      const seed = photonSeeds[index];
      const axial = fract(seed.axial - t * seed.speed);
      const radius = axial * 3.35 * seed.radius;
      const angle = seed.angle + t * .5;
      dummy.position.copy(new THREE.Vector3(...VERTEX)).addScaledVector(direction, axial * 7.2).addScaledVector(basisU, Math.cos(angle) * radius).addScaledVector(basisV, Math.sin(angle) * radius);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.6 + Math.sin(axial * Math.PI) * 1.25); dummy.updateMatrix(); photons.setMatrixAt(index, dummy.matrix);
    }
    photons.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < CASCADE; index++) {
      const seed = cascadeSeeds[index];
      const axial = fract(seed.travel + t * .7);
      dummy.position.copy(new THREE.Vector3(...VERTEX)).addScaledVector(direction, axial * 5.8).addScaledVector(basisU, Math.cos(seed.angle) * seed.spread * axial).addScaledVector(basisV, Math.sin(seed.angle) * seed.spread * axial);
      dummy.scale.setScalar(1 - axial * .65); dummy.updateMatrix(); cascade.setMatrixAt(index, dummy.matrix);
    }
    cascade.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < 64; index++) {
      const pulse = .55 + .75 * Math.max(0, Math.sin(state.sensorPhase * TAU * 5 - index * .7));
      dummy.position.copy(hits.userData.positions?.[index] || sensorPositions[Math.min(sensorPositions.length - 1, index * 83)]);
      dummy.scale.setScalar(pulse * (1 + state.weights.sensors * .45)); dummy.updateMatrix(); hits.setMatrixAt(index, dummy.matrix);
    }
    hits.instanceMatrix.needsUpdate = true;
    arrow.setLength(7 + state.reconstructionProgress * 4, .65, .32);
  }

  function dispose() {
    root.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
  }

  setQuality(2);
  return { root, anchors, stats: MODEL_STATS, setQuality, update, dispose };
}
