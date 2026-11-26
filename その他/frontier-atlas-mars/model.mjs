import * as THREE from 'three';
import { createStarshipModel } from '../frontier-atlas/starship-model.mjs';
import { EARTH_POSITION, MARS_POSITION, SURFACE_Y, SURFACE_Z, STARSHIP_SCALE, SHIP_CENTER_LOCAL, fract } from './state.mjs';

const TAU = Math.PI * 2;
const ROCKS = 180;
const PLANTS = 120;
const DUST = 220;
const RESOURCE_PARTICLES = 90;
const QUALITY_COUNTS = Object.freeze({ rocks: [70, 110, 150, 180], plants: [45, 75, 100, 120], particles: [60, 100, 150, 220] });

export const MODEL_STATS = Object.freeze({
  meaningfulParts: 722 + 39 + 4 + 4 + 56 + ROCKS + PLANTS + 64,
  reusedStarship: true,
  heatTiles: 722,
  boosterEngines: 33,
  shipEngines: 6,
  gridFins: 4,
  flaps: 4,
  separationRings: true,
  terrainRocks: ROCKS,
  plantInstances: PLANTS,
  exhaustParticles: 310,
  dustInstances: DUST,
  resourceInstances: RESOURCE_PARTICLES,
  instancedSystems: 6,
  pbrMaterials: 26,
  shaderMaterials: 3,
  lodLevels: 2,
  qualityLevels: 4,
});

function randomSource(seed = 505) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh;
}
function makeInstances(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData.fullCount = count; mesh.frustumCulled = false; return mesh;
}
function makeLine(parent, points, color, opacity = .6, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => Array.isArray(point) ? new THREE.Vector3(...point) : point));
  const material = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .4, gapSize: .25, depthWrite: false }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geometry, material); if (dashed) line.computeLineDistances(); parent.add(line); return line;
}
function cylinderBetween(parent, start, end, radius, material) {
  const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end); const direction = b.clone().sub(a);
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return mesh;
}
function terrainHeight(x, z) {
  return Math.sin(x * .82) * .17 + Math.cos(z * .93) * .14 + Math.sin((x + z) * 1.7) * .07 + Math.cos(x * 2.3 - z) * .035;
}

function makeEarth() {
  const group = new THREE.Group(); group.name = 'Earth'; group.position.set(...EARTH_POSITION);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;varying vec3 vP;varying vec3 vN;void main(){vec3 p=normalize(vP);float land=sin(p.x*8.+sin(p.z*6.))*cos(p.y*7.-p.x*3.)+sin(p.z*13.+p.y*4.)*.28;float clouds=sin(p.x*24.+uTime*.03)*sin(p.y*19.-p.z*7.);vec3 ocean=mix(vec3(.025,.12,.25),vec3(.05,.34,.52),max(0.,vN.z));vec3 col=mix(ocean,vec3(.18,.38,.23),smoothstep(.12,.42,land));col=mix(col,vec3(.8,.9,.92),smoothstep(.72,.95,clouds)*.5);gl_FragColor=vec4(col,1.);}`,
  });
  addMesh(group, new THREE.SphereGeometry(3.2, 48, 32), material);
  addMesh(group, new THREE.SphereGeometry(3.28, 36, 24), new THREE.MeshBasicMaterial({ color: 0x58baff, transparent: true, opacity: .09, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  return { group, material };
}

function makeMars() {
  const group = new THREE.Group(); group.name = 'Mars'; group.position.set(...MARS_POSITION);
  const material = new THREE.MeshStandardMaterial({ color: 0xa95235, roughness: .92, metalness: .03, emissive: 0x32100b, emissiveIntensity: .18 });
  addMesh(group, new THREE.SphereGeometry(3.6, 48, 32), material);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xe59162) } },
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 uColor;varying vec3 vN;void main(){float rim=pow(1.-abs(vN.z),2.8);gl_FragColor=vec4(uColor,rim*.28);}`,
  });
  addMesh(group, new THREE.SphereGeometry(3.72, 36, 24), atmosphereMaterial);
  return { group, material, atmosphereMaterial };
}

function makeTerrain() {
  const group = new THREE.Group(); group.name = 'Martian terrain'; group.position.set(8, SURFACE_Y, SURFACE_Z);
  const geometry = new THREE.PlaneGeometry(12, 12, 34, 34); geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index++) position.setY(index, terrainHeight(position.getX(index), position.getZ(index)));
  geometry.computeVertexNormals();
  addMesh(group, geometry, new THREE.MeshStandardMaterial({ color: 0x8f4933, roughness: .98, metalness: .02 }));
  const rocks = makeInstances(new THREE.DodecahedronGeometry(.18, 0), new THREE.MeshStandardMaterial({ color: 0x5e3027, roughness: .94, metalness: .04 }), ROCKS);
  const random = randomSource(81); const dummy = new THREE.Object3D();
  for (let index = 0; index < ROCKS; index++) {
    const angle = random() * TAU; const radius = Math.sqrt(random()) * 5.7; const x = Math.cos(angle) * radius; const z = Math.sin(angle) * radius;
    dummy.position.set(x, terrainHeight(x, z) + .06, z); dummy.rotation.set(random(), random() * TAU, random()); dummy.scale.set(.4 + random() * 1.4, .35 + random() * .9, .5 + random()); dummy.updateMatrix(); rocks.setMatrixAt(index, dummy.matrix);
  }
  group.add(rocks);
  const dust = makeInstances(new THREE.SphereGeometry(.045, 5, 4), new THREE.MeshBasicMaterial({ color: 0xc77c54, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }), DUST);
  const dustSeeds = Array.from({ length: DUST }, () => ({ angle: random() * TAU, radius: random(), height: random(), speed: .5 + random() }));
  group.add(dust);
  return { group, rocks, dust, dustSeeds };
}

function makeISRU() {
  const group = new THREE.Group(); group.name = 'ISRU concept'; group.position.set(8, SURFACE_Y, SURFACE_Z);
  const metal = new THREE.MeshStandardMaterial({ color: 0x77868d, metalness: .82, roughness: .34 });
  const tankMaterial = new THREE.MeshStandardMaterial({ color: 0xb5c2c5, metalness: .72, roughness: .3 });
  const copper = new THREE.MeshStandardMaterial({ color: 0x9c6547, metalness: .7, roughness: .38 });
  addMesh(group, new THREE.BoxGeometry(2.1, .28, 2.1), metal, [3.1, .14, .2]);
  for (const x of [2.5, 3.7]) addMesh(group, new THREE.CylinderGeometry(.42, .42, 1.7, 20), tankMaterial, [x, 1.1, .2]);
  addMesh(group, new THREE.CylinderGeometry(.22, .32, 2.7, 16), metal, [3.1, 1.55, -1.1]);
  addMesh(group, new THREE.BoxGeometry(1.3, .16, 1.3), copper, [3.1, 2.95, -1.1]);
  cylinderBetween(group, [3.1, 2.7, -1.1], [3.1, 4.2, -1.1], .08, metal);
  cylinderBetween(group, [3.1, 1.6, -.8], [3.1, 1.2, .2], .07, copper);
  cylinderBetween(group, [2.5, .8, .2], [1.3, .35, 1.1], .06, copper);
  const resource = makeInstances(new THREE.SphereGeometry(.035, 5, 4), new THREE.MeshBasicMaterial({ color: 0x7de6dd, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }), RESOURCE_PARTICLES);
  group.add(resource);
  return { group, resource };
}

function makeSettlement() {
  const group = new THREE.Group(); group.name = 'habitat and plant factory'; group.position.set(8, SURFACE_Y, SURFACE_Z);
  const hull = new THREE.MeshStandardMaterial({ color: 0xc3ccd0, metalness: .66, roughness: .38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x283943, metalness: .6, roughness: .42 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x86c7d7, metalness: .05, roughness: .08, transmission: .28, transparent: true, opacity: .38, depthWrite: false, clearcoat: .8 });
  for (const [x, y, z, rotation] of [[0, .8, 2.6, 0], [1.75, .8, 2.6, 0], [.85, .8, 4.05, Math.PI / 2]]) addMesh(group, new THREE.CylinderGeometry(.72, .72, 1.55, 24), hull, [x, y, z], [0, 0, Math.PI / 2 + rotation]);
  for (const x of [.35, 1.2, 2.1]) addMesh(group, new THREE.CircleGeometry(.19, 18), glass, [x, .92, 1.89]);
  addMesh(group, new THREE.BoxGeometry(3.3, .12, .22), dark, [.85, .12, 2.6]);
  const greenhouse = new THREE.Group(); greenhouse.position.set(-2.1, 0, 2.7);
  addMesh(greenhouse, new THREE.BoxGeometry(2.4, 1.6, 2.2), glass, [0, .9, 0]);
  for (const x of [-1.2, 1.2]) for (const z of [-1.1, 1.1]) addMesh(greenhouse, new THREE.BoxGeometry(.06, 1.8, .06), dark, [x, .9, z]);
  for (const y of [.1, 1.75]) addMesh(greenhouse, new THREE.BoxGeometry(2.45, .06, 2.25), dark, [0, y, 0]);
  addMesh(greenhouse, new THREE.BoxGeometry(2.1, .12, 1.9), new THREE.MeshStandardMaterial({ color: 0x3d4b32, roughness: .95 }), [0, .2, 0]);
  const plants = makeInstances(new THREE.ConeGeometry(.09, .5, 5), new THREE.MeshStandardMaterial({ color: 0x4f9e58, roughness: .72, metalness: .02 }), PLANTS);
  const plantSeeds = []; const dummy = new THREE.Object3D();
  for (let index = 0; index < PLANTS; index++) {
    const x = (index % 10 - 4.5) * .19; const z = (Math.floor(index / 10) % 6 - 2.5) * .27; const row = Math.floor(index / 60);
    plantSeeds.push({ x, y: .42 + row * .16, z, scale: .7 + (index % 7) * .06 });
    dummy.position.set(x, plantSeeds[index].y, z); dummy.scale.setScalar(.01); dummy.updateMatrix(); plants.setMatrixAt(index, dummy.matrix);
  }
  greenhouse.add(plants); group.add(greenhouse);
  const solarMaterial = new THREE.MeshPhysicalMaterial({ color: 0x163c67, metalness: .55, roughness: .2, clearcoat: .8 });
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * TAU;
    const panel = addMesh(group, new THREE.BoxGeometry(1.4, .06, .7), solarMaterial, [Math.cos(angle) * 4.3, .8, 2.7 + Math.sin(angle) * 4.3], [0, -angle, -.18]);
    addMesh(panel, new THREE.BoxGeometry(1.44, .03, .04), hull, [0, .04, 0]);
  }
  return { group, plants, plantSeeds };
}

function makeEntryPlasma() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uHeat: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uHeat;uniform float uTime;varying vec3 vP;varying vec3 vN;void main(){float streak=sin(vP.y*18.+vP.x*11.-uTime*9.)*.5+.5;float rim=pow(1.-abs(vN.z),1.6);vec3 col=mix(vec3(1.,.2,.03),vec3(1.,.82,.35),streak);gl_FragColor=vec4(col,(.12+rim*.48+streak*.15)*uHeat);}`,
  });
  const mesh = addMesh(new THREE.Group(), new THREE.SphereGeometry(1.25, 32, 20), material); mesh.scale.set(1.05, 1.75, 1.05);
  return { group: mesh.parent, mesh, material };
}

function makeSimpleRig() {
  const group = new THREE.Group(); group.name = 'Starship low-detail LOD';
  const steel = new THREE.MeshStandardMaterial({ color: 0xaeb9c0, metalness: .9, roughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303b43, metalness: .78, roughness: .4 });
  const booster = new THREE.Group(); const ship = new THREE.Group();
  addMesh(booster, new THREE.CylinderGeometry(4.5, 4.5, 60, 16), steel, [0, 38, 0]);
  addMesh(booster, new THREE.CylinderGeometry(4.4, 4.2, 5.2, 16), steel, [0, 5.55, 0]);
  addMesh(booster, new THREE.TorusGeometry(4.55, .08, 6, 32), dark, [0, 69.5, 0], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 4; index++) addMesh(booster, new THREE.BoxGeometry(.3, 1.8, 2.1), dark, [Math.sin(index * Math.PI / 2) * 4.5, 61.5, Math.cos(index * Math.PI / 2) * 4.5], [0, index * Math.PI / 2, 0]);
  addMesh(ship, new THREE.CylinderGeometry(4.5, 4.5, 29, 16), steel, [0, 17.5, 0]);
  addMesh(ship, new THREE.ConeGeometry(4.5, 18, 16), steel, [0, 41, 0]);
  addMesh(ship, new THREE.CylinderGeometry(4.56, 4.56, 1.4, 16), dark, [0, 1.05, 0]);
  for (let index = 0; index < 4; index++) addMesh(ship, new THREE.BoxGeometry(.18, 5.8, 1.8), dark, [Math.sin(index * Math.PI / 2) * 4.6, 9.3, Math.cos(index * Math.PI / 2) * 4.6], [0, index * Math.PI / 2, 0]);
  group.add(booster, ship);
  return { group, booster, ship };
}

export function createMarsModel() {
  const root = new THREE.Group(); root.name = 'Earth to Mars educational mission';
  const earth = makeEarth(); const mars = makeMars(); const terrain = makeTerrain(); const isru = makeISRU(); const settlement = makeSettlement();
  root.add(earth.group, mars.group, terrain.group, isru.group, settlement.group);

  const reference = createStarshipModel();
  reference.setDisplayMode({ section: false, exploded: false });
  reference.setQuality(2);
  reference.root.scale.setScalar(STARSHIP_SCALE);
  const simpleRig = makeSimpleRig(); simpleRig.group.scale.setScalar(STARSHIP_SCALE);
  const rig = new THREE.LOD(); rig.name = 'reused high-detail Starship LOD'; rig.addLevel(reference.root, 0); rig.addLevel(simpleRig.group, 58); root.add(rig);
  const plasma = makeEntryPlasma(); root.add(plasma.group);
  const route = makeLine(root, [EARTH_POSITION, MARS_POSITION], 0x7bd9e8, .45, true);
  const anchors = {
    starship: new THREE.Vector3(),
    heatshield: new THREE.Vector3(),
    mars: new THREE.Vector3(8, 2.1, 0),
    isru: new THREE.Vector3(11.1, -2.4, SURFACE_Z - .8),
    settlement: new THREE.Vector3(6, -3.2, SURFACE_Z + 3.2),
  };

  let quality = 2;
  function setQuality(level) {
    quality = THREE.MathUtils.clamp(Math.round(Number(level) || 0), 0, 3);
    reference.setQuality(quality);
    terrain.rocks.count = QUALITY_COUNTS.rocks[quality]; settlement.plants.count = QUALITY_COUNTS.plants[quality];
    const particleCount = QUALITY_COUNTS.particles[quality];
    terrain.dust.count = Math.min(DUST, particleCount + 40); isru.resource.count = Math.min(RESOURCE_PARTICLES, particleCount);
    root.userData.quality = quality;
  }

  function update(state) {
    earth.group.visible = state.mode === 'launch' || state.mode === 'transit';
    mars.group.visible = state.mode !== 'launch';
    terrain.group.visible = ['entry', 'landing', 'isru', 'settlement'].includes(state.mode);
    isru.group.visible = state.mode === 'isru' || state.mode === 'settlement';
    settlement.group.visible = state.mode === 'settlement';
    route.visible = state.mode === 'transit';

    const shipAngle = state.mode === 'transit' ? Math.sin(state.progress * Math.PI) * -.16 : 0;
    rig.position.set(...state.shipPosition); rig.position.y -= SHIP_CENTER_LOCAL * STARSHIP_SCALE;
    const localBooster = new THREE.Vector3(...state.boosterPosition).sub(rig.position).divideScalar(STARSHIP_SCALE);
    const boosterRotation = [0, 0, state.mode === 'launch' ? Math.sin(state.progress * Math.PI) * .025 : 0];
    const shipRotation = [0, 0, shipAngle];
    const boosterVisible = state.mode === 'launch' || state.mode === 'transit';
    reference.update({
      booster: { position: localBooster.toArray(), rotation: boosterRotation },
      ship: { position: [0, 0, 0], rotation: shipRotation },
      engines: { booster: state.boosterThrust, ship: state.shipThrust },
      stageId: state.mode,
      payload: { doors: 0, deploy: 0 },
    }, state.time, 1 / 60);
    reference.booster.visible = boosterVisible; reference.ship.visible = true;
    simpleRig.booster.position.copy(localBooster); simpleRig.booster.rotation.set(...boosterRotation); simpleRig.booster.visible = boosterVisible;
    simpleRig.ship.rotation.set(...shipRotation); simpleRig.ship.visible = true;

    plasma.material.uniforms.uTime.value = state.progress * TAU * 6; plasma.material.uniforms.uHeat.value = state.plasma;
    plasma.group.position.set(...state.shipPosition); plasma.group.rotation.z = shipAngle; plasma.group.visible = state.plasma > .02;
    earth.material.uniforms.uTime.value = state.progress * TAU; mars.group.rotation.y = state.progress * .25;

    const dummy = new THREE.Object3D();
    terrain.dust.visible = state.dust > .02;
    for (let index = 0; index < DUST; index++) {
      const seed = terrain.dustSeeds[index]; const travel = fract(seed.phase + state.progress * seed.speed * 2);
      const radius = .5 + seed.radius * (1 + travel * 4.5); const angle = seed.angle + travel;
      dummy.position.set(Math.cos(angle) * radius, terrainHeight(Math.cos(angle) * radius, Math.sin(angle) * radius) + .1 + seed.height * (1 - travel) * 1.5, Math.sin(angle) * radius);
      dummy.scale.setScalar((1 - travel) * state.dust * 1.4); dummy.updateMatrix(); terrain.dust.setMatrixAt(index, dummy.matrix);
    }
    terrain.dust.instanceMatrix.needsUpdate = true;
    settlement.group.scale.setScalar(.25 + state.settlementProgress * .75);
    for (let index = 0; index < PLANTS; index++) {
      const seed = settlement.plantSeeds[index];
      dummy.position.set(seed.x, seed.y, seed.z); dummy.rotation.set(0, index * .7, 0); dummy.scale.set(seed.scale * state.plantGrowth, seed.scale * (.3 + state.plantGrowth * 1.4), seed.scale * state.plantGrowth); dummy.updateMatrix(); settlement.plants.setMatrixAt(index, dummy.matrix);
    }
    settlement.plants.instanceMatrix.needsUpdate = true;
    isru.resource.visible = state.mode === 'isru' || state.mode === 'settlement';
    for (let index = 0; index < RESOURCE_PARTICLES; index++) {
      const travel = fract(index / RESOURCE_PARTICLES + state.resourcePhase);
      dummy.position.set(3.1 + Math.sin(travel * Math.PI) * .25, 2.9 - travel * 2.1, -1.1 + travel * 1.3);
      dummy.scale.setScalar(.6 + Math.sin(travel * Math.PI) * .7); dummy.updateMatrix(); isru.resource.setMatrixAt(index, dummy.matrix);
    }
    isru.resource.instanceMatrix.needsUpdate = true;
    anchors.starship.set(...state.shipPosition); anchors.heatshield.set(state.shipPosition[0], state.shipPosition[1] - 1.35, state.shipPosition[2]);
  }

  function dispose() {
    const materials = new Set();
    root.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  }
  setQuality(2);
  return { root, rig, anchors, stats: MODEL_STATS, starship: { engineCounts: reference.engineCounts, stats: reference.stats }, setQuality, update, dispose };
}
