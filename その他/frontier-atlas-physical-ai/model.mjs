import * as THREE from 'three';
import { JOINT_NAMES, MODEL_SPEC } from './state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const tempVector = new THREE.Vector3();
const tempMidpoint = new THREE.Vector3();
const tempColor = new THREE.Color();

export const MODEL_STATS = Object.freeze({
  ...MODEL_SPEC,
  heroParts: MODEL_SPEC.heroPartNames.length,
  animatedJoints: JOINT_NAMES.length,
  embodiments: 2,
  educationalApproximation: true,
});

export function getPhysicalAIModelStats() {
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

function lineSegments(parent, positions, material, name, loop = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = loop ? new THREE.LineLoop(geometry, material) : new THREE.LineSegments(geometry, material);
  lines.name = name;
  parent.add(lines);
  return lines;
}

function scanShader() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: .35 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float sweep = pow(max(0.0, cos(a - uTime * 3.0)), 22.0);
        float rings = smoothstep(0.92, 1.0, r) * 0.4;
        float alpha = (sweep * 0.65 + rings) * smoothstep(1.0, 0.72, r) * uOpacity;
        gl_FragColor = vec4(0.28, 0.88, 1.0, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function signalShader() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x7de4ee) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float pulse = pow(max(0.0, sin((vUv.x - uTime * 0.7) * 18.0)), 8.0);
        gl_FragColor = vec4(uColor * (0.6 + pulse), 0.18 + pulse * 0.72);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeHand(materials, side) {
  const group = new THREE.Group();
  group.name = side < 0 ? 'left hand' : 'right hand';
  addMesh(group, new THREE.BoxGeometry(.22, .28, .12), materials.dark, [0, -.12, 0], [0, 0, 0], 'palm shell');
  const fingers = makeInstanced(group, new THREE.BoxGeometry(.035, .13, .04), materials.polymer, 15, 'finger joint array');
  let index = 0;
  for (let finger = 0; finger < 5; finger++) {
    for (let segment = 0; segment < 3; segment++) {
      setInstance(fingers, index++, [(finger - 2) * .045, -.31 - segment * .105, .015], [0, 0, (finger - 2) * .025]);
    }
  }
  fingers.instanceMatrix.needsUpdate = true;
  return group;
}

function makeHumanoid(materials) {
  const group = new THREE.Group();
  group.name = 'Detailed humanoid embodiment';
  const torso = new THREE.Group();
  torso.position.y = 3.1;
  addMesh(torso, new THREE.BoxGeometry(1.02, 1.05, .48), materials.polymer, [0, 0, 0], [0, 0, 0], 'torso shell');
  addMesh(torso, new THREE.BoxGeometry(.76, .64, .06), materials.dark, [0, .05, .26], [0, 0, 0], 'chest frame');
  addMesh(torso, new THREE.BoxGeometry(.42, .08, .035), materials.signal, [0, .29, .3], [0, 0, 0], 'chest status light');
  addMesh(torso, new THREE.BoxGeometry(.56, .34, .3), materials.dark, [0, -.08, -.33], [0, 0, 0], 'battery pack');
  addMesh(torso, new THREE.CylinderGeometry(.13, .15, .22, 14), materials.aluminum, [0, -.62, 0], [0, 0, 0], 'waist joint');
  addMesh(torso, new THREE.BoxGeometry(.82, .25, .4), materials.dark, [0, -.79, 0], [0, 0, 0], 'pelvis frame');
  for (const x of [-.34, .34]) addMesh(torso, new THREE.BoxGeometry(.045, .74, .035), materials.copper, [x, .03, -.26], [0, 0, 0], 'cooling channel');
  group.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 4.08, .02);
  addMesh(head, new THREE.BoxGeometry(.62, .48, .5), materials.polymer, [0, 0, 0], [0, 0, 0], 'head shell');
  addMesh(head, new THREE.BoxGeometry(.5, .22, .04), materials.glass, [0, .03, .27], [0, 0, 0], 'face visor');
  addMesh(head, new THREE.CylinderGeometry(.11, .11, .08, 18), materials.lens, [0, .04, .3], [Math.PI / 2, 0, 0], 'depth camera');
  addMesh(head, new THREE.CylinderGeometry(.17, .19, .16, 20), materials.dark, [0, .32, 0], [0, 0, 0], 'LiDAR turret');
  addMesh(head, new THREE.TorusGeometry(.175, .018, 6, 24), materials.signal, [0, .4, 0], [Math.PI / 2, 0, 0], 'LiDAR scan ring');
  for (const x of [-.23, .23]) addMesh(head, new THREE.CylinderGeometry(.025, .025, .035, 10), materials.dark, [x, .13, .25], [Math.PI / 2, 0, 0], 'microphone array');
  addMesh(head, new THREE.CylinderGeometry(.1, .1, .18, 12), materials.aluminum, [0, -.32, 0], [0, 0, 0], 'neck joint');
  addMesh(head, new THREE.BoxGeometry(.22, .08, .18), materials.signal, [0, -.19, .25], [0, 0, 0], 'emergency stop');
  group.add(head);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * .28, 2.34, 0);
    addMesh(hip, new THREE.CylinderGeometry(.16, .16, .26, 16), materials.aluminum, [0, 0, 0], [0, 0, Math.PI / 2], 'hip actuator');
    addMesh(hip, new THREE.BoxGeometry(.24, .74, .25), materials.polymer, [0, -.42, 0], [0, 0, 0], 'thigh link');
    addMesh(hip, new THREE.BoxGeometry(.06, .58, .03), materials.copper, [side * .13, -.4, .02], [0, 0, 0], 'thigh cable');
    const knee = new THREE.Group();
    knee.position.y = -.82;
    addMesh(knee, new THREE.CylinderGeometry(.145, .145, .28, 16), materials.dark, [0, 0, 0], [0, 0, Math.PI / 2], 'knee actuator');
    addMesh(knee, new THREE.TorusGeometry(.15, .025, 6, 20), materials.signal, [side * .15, 0, 0], [0, Math.PI / 2, 0], 'knee encoder');
    addMesh(knee, new THREE.BoxGeometry(.2, .68, .22), materials.polymer, [0, -.39, 0], [0, 0, 0], 'shank link');
    const ankle = new THREE.Group();
    ankle.position.y = -.76;
    addMesh(ankle, new THREE.CylinderGeometry(.11, .11, .22, 14), materials.aluminum, [0, 0, 0], [0, 0, Math.PI / 2], 'ankle actuator');
    addMesh(ankle, new THREE.BoxGeometry(.29, .14, .48), materials.dark, [0, -.1, .1], [0, 0, 0], 'foot shell');
    addMesh(ankle, new THREE.BoxGeometry(.27, .035, .44), materials.rubber, [0, -.19, .1], [0, 0, 0], 'sole sensor');
    knee.add(ankle);
    hip.add(knee);
    group.add(hip);
    legs.push({ hip, knee, ankle });
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * .59, 3.48, 0);
    addMesh(shoulder, new THREE.SphereGeometry(.17, 18, 12), materials.aluminum, [0, 0, 0], [0, 0, 0], 'shoulder actuator');
    addMesh(shoulder, new THREE.BoxGeometry(.2, .58, .22), materials.polymer, [0, -.35, 0], [0, 0, 0], 'upper arm');
    const elbow = new THREE.Group();
    elbow.position.y = -.67;
    addMesh(elbow, new THREE.CylinderGeometry(.12, .12, .24, 14), materials.dark, [0, 0, 0], [0, 0, Math.PI / 2], 'elbow actuator');
    addMesh(elbow, new THREE.BoxGeometry(.17, .53, .18), materials.polymer, [0, -.3, 0], [0, 0, 0], 'forearm');
    addMesh(elbow, new THREE.BoxGeometry(.045, .4, .03), materials.copper, [side * .1, -.3, .02], [0, 0, 0], 'forearm cable');
    const wrist = new THREE.Group();
    wrist.position.y = -.61;
    addMesh(wrist, new THREE.CylinderGeometry(.075, .075, .14, 12), materials.aluminum, [0, 0, 0], [0, 0, 0], 'wrist');
    wrist.add(makeHand(materials, side));
    elbow.add(wrist);
    shoulder.add(elbow);
    group.add(shoulder);
    arms.push({ shoulder, elbow, wrist });
  }

  const fasteners = makeInstanced(group, new THREE.CylinderGeometry(.022, .022, .018, 6), materials.aluminum, MODEL_SPEC.bodyFasteners, 'body fastener array');
  let fastenerIndex = 0;
  for (const y of [2.78, 3.1, 3.42]) {
    for (const x of [-.4, .4]) {
      for (const z of [-.18, .18]) setInstance(fasteners, fastenerIndex++, [x, y, z], [Math.PI / 2, 0, 0]);
    }
  }
  for (const side of [-1, 1]) {
    for (let index = 0; index < 12; index++) setInstance(fasteners, fastenerIndex++, [side * (.25 + (index % 3) * .1), 2.45 - Math.floor(index / 3) * .23, -.14 + (index % 2) * .28], [Math.PI / 2, 0, 0]);
  }
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * TAU;
    setInstance(fasteners, fastenerIndex++, [Math.cos(angle) * .26, 4.08 + Math.sin(angle) * .19, .255], [Math.PI / 2, 0, 0]);
  }
  fasteners.instanceMatrix.needsUpdate = true;
  addMesh(group, new THREE.BoxGeometry(.24, .14, .2), materials.signal, [0, 2.93, -.27], [0, 0, 0], 'IMU module');
  addMesh(group, new THREE.BoxGeometry(.46, .18, .16), materials.dark, [0, 3.08, -.42], [0, 0, 0], 'policy compute module');
  return { group, torso, head, legs, arms, fasteners };
}

function makeQuadruped(materials) {
  const group = new THREE.Group();
  group.name = 'Quadruped comparison embodiment';
  group.position.set(-4.25, .1, -2.35);
  group.scale.setScalar(.72);
  addMesh(group, new THREE.BoxGeometry(1.55, .5, .68), materials.polymer, [0, 1.05, 0], [0, 0, 0], 'quadruped body');
  addMesh(group, new THREE.BoxGeometry(.55, .3, .5), materials.dark, [.7, 1.14, 0], [0, 0, 0], 'quadruped sensor mast');
  addMesh(group, new THREE.CylinderGeometry(.14, .16, .14, 18), materials.lens, [.7, 1.38, 0], [0, 0, 0], 'quadruped LiDAR');
  const legs = [];
  for (const x of [-.58, .58]) {
    for (const z of [-.25, .25]) {
      const hip = new THREE.Group();
      hip.position.set(x, .92, z);
      addMesh(hip, new THREE.CylinderGeometry(.11, .11, .2, 12), materials.aluminum, [0, 0, 0], [Math.PI / 2, 0, 0], 'quadruped hip actuator');
      addMesh(hip, new THREE.BoxGeometry(.12, .48, .13), materials.polymer, [0, -.27, 0], [0, 0, 0], 'quadruped upper link');
      const knee = new THREE.Group();
      knee.position.y = -.52;
      addMesh(knee, new THREE.CylinderGeometry(.09, .09, .18, 12), materials.dark, [0, 0, 0], [Math.PI / 2, 0, 0], 'quadruped knee');
      addMesh(knee, new THREE.BoxGeometry(.1, .42, .11), materials.polymer, [0, -.24, 0], [0, 0, 0], 'quadruped lower link');
      addMesh(knee, new THREE.SphereGeometry(.1, 12, 8), materials.rubber, [0, -.48, 0], [0, 0, 0], 'quadruped foot');
      hip.add(knee);
      group.add(hip);
      legs.push({ hip, knee });
    }
  }
  return { group, legs };
}

function makePolicyBoard(materials) {
  const high = new THREE.Group();
  high.name = 'Policy network high detail';
  addMesh(high, new THREE.BoxGeometry(3.4, 2.45, .12), materials.glass, [0, 0, 0], [0, 0, 0], 'policy board');
  addEdges(high, new THREE.BoxGeometry(3.4, 2.45, .12), 0x6de4ee, .7);
  const layers = [5, 8, 8, 5];
  const positions = [];
  layers.forEach((count, layer) => {
    for (let index = 0; index < count; index++) {
      positions.push(new THREE.Vector3(-1.28 + layer * .85, (index - (count - 1) / 2) * .3, .12));
    }
  });
  const nodes = makeInstanced(high, new THREE.IcosahedronGeometry(.095, 1), materials.node, positions.length, 'policy node array');
  positions.forEach((position, index) => {
    setInstance(nodes, index, position.toArray());
    nodes.setColorAt(index, tempColor.set(index < 5 ? 0x7de4ee : index < 19 ? 0x8b9cff : 0x91e2be));
  });
  nodes.instanceMatrix.needsUpdate = true;
  nodes.instanceColor.needsUpdate = true;

  const edgePairs = [];
  let offset = 0;
  for (let layer = 0; layer < layers.length - 1; layer++) {
    for (let from = 0; from < layers[layer]; from++) {
      for (let to = 0; to < layers[layer + 1]; to++) {
        if ((from * 3 + to * 5 + layer) % 3 !== 1) edgePairs.push([positions[offset + from], positions[offset + layers[layer] + to]]);
      }
    }
    offset += layers[layer];
  }
  while (edgePairs.length < MODEL_SPEC.policyEdges) edgePairs.push(edgePairs[edgePairs.length % Math.max(1, edgePairs.length)]);
  const edges = makeInstanced(high, new THREE.CylinderGeometry(.009, .009, 1, 5), materials.edge, MODEL_SPEC.policyEdges, 'policy edge array');
  edgePairs.slice(0, MODEL_SPEC.policyEdges).forEach(([start, end], index) => setCylinderBetween(edges, index, start, end));
  edges.instanceMatrix.needsUpdate = true;
  addMesh(high, new THREE.PlaneGeometry(3.15, 2.2), materials.policyGlow, [0, 0, -.02], [0, 0, 0], 'policy signal field');

  const medium = new THREE.Group();
  medium.name = 'Policy network medium detail';
  addMesh(medium, new THREE.BoxGeometry(3.4, 2.45, .12), materials.glass);
  const mediumNodes = makeInstanced(medium, new THREE.IcosahedronGeometry(.12, 0), materials.node, 8, 'medium policy nodes');
  for (let index = 0; index < 8; index++) setInstance(mediumNodes, index, [-1.1 + (index % 4) * .72, -.6 + Math.floor(index / 4) * 1.2, .12]);
  mediumNodes.instanceMatrix.needsUpdate = true;

  const low = new THREE.Group();
  low.name = 'Policy board low detail';
  addMesh(low, new THREE.BoxGeometry(3.4, 2.45, .12), materials.dark);
  addMesh(low, new THREE.BoxGeometry(2.9, .04, .02), materials.signal, [0, 0, .08]);
  return { high, medium, low, nodes, edges };
}

function makeEnvironment(materials) {
  const group = new THREE.Group();
  group.name = 'Perception, obstacles and balance instruments';
  const obstacle = new THREE.Group();
  obstacle.position.set(-2.65, 0, .25);
  const tiles = makeInstanced(obstacle, new THREE.BoxGeometry(.42, .32, .42), materials.obstacle, MODEL_SPEC.obstacleTiles, 'obstacle tile array');
  let index = 0;
  for (let level = 0; level < 3; level++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 2; z++) {
        setInstance(tiles, index++, [(x - 1) * .43, .18 + level * .32, (z - .5) * .43], [0, (index % 3 - 1) * .05, 0]);
        tiles.setColorAt(index - 1, tempColor.set(level === 2 ? 0x718596 : 0x3a4d5c));
      }
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  tiles.instanceColor.needsUpdate = true;
  group.add(obstacle);

  const random = randomSource(441);
  const sensorPoints = makeInstanced(group, new THREE.SphereGeometry(.025, 6, 4), materials.point, MODEL_SPEC.sensorPoints, 'sensor point cloud');
  for (let point = 0; point < MODEL_SPEC.sensorPoints; point++) {
    const zone = point % 4;
    let position;
    if (zone === 0) position = [-3.6 + random() * 3.2, random() * 1.1, -1.2 + random() * 2.5];
    else if (zone === 1) position = [-1.4 + random() * 2.8, random() * .08, -2.8 + random() * 5.6];
    else if (zone === 2) position = [-.8 + random() * 1.6, .4 + random() * 3.7, -.4 + random() * .8];
    else position = [-5 + random() * 9, random() * .08, -3.5 + random() * 1.2];
    setInstance(sensorPoints, point, position);
    sensorPoints.setColorAt(point, tempColor.setHSL(.5 + random() * .08, .7, .45 + random() * .25));
  }
  sensorPoints.instanceMatrix.needsUpdate = true;
  sensorPoints.instanceColor.needsUpdate = true;

  const pathPoints = [
    new THREE.Vector3(1.7, .06, 1.7), new THREE.Vector3(.8, .06, 1.5), new THREE.Vector3(-.5, .06, 1.1),
    new THREE.Vector3(-1.65, .06, .5), new THREE.Vector3(-2.1, .06, -.5), new THREE.Vector3(-1.2, .06, -1.5),
    new THREE.Vector3(.4, .06, -2),
  ];
  const curve = new THREE.CatmullRomCurve3(pathPoints);
  const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .025, 6, false), materials.path);
  path.name = 'planned route';
  group.add(path);
  const routeMarkers = makeInstanced(group, new THREE.SphereGeometry(.07, 10, 7), materials.signal, 12, 'planned route markers');
  for (let marker = 0; marker < 12; marker++) setInstance(routeMarkers, marker, curve.getPoint(marker / 11).toArray());
  routeMarkers.instanceMatrix.needsUpdate = true;

  const support = lineSegments(group, [
    -.58, .035, -.25, .58, .035, -.25, .58, .035, .25, -.58, .035, .25,
  ], new THREE.LineBasicMaterial({ color: 0x8df5c7, transparent: true, opacity: .7 }), 'support polygon', true);
  const com = addMesh(group, new THREE.SphereGeometry(.09, 14, 10), materials.signal, [0, 1.05, 0], [0, 0, 0], 'center of mass marker');
  const balanceVector = addMesh(group, new THREE.CylinderGeometry(.012, .012, 1, 6), materials.balance, [0, .5, 0], [0, 0, 0], 'balance vector');
  const scan = addMesh(group, new THREE.CircleGeometry(4.3, 64), materials.scan, [0, 4.43, .02], [-Math.PI / 2, 0, 0], 'LiDAR scan plane');
  return { group, obstacle, sensorPoints, path, routeMarkers, support, com, balanceVector, scan };
}

function makeParticles() {
  const count = MODEL_SPEC.particles;
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x86e9f4, size: .045, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.name = 'policy and motor signal particles';
  points.frustumCulled = false;
  return { points, positions, count };
}

export function createPhysicalAIModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'Physical AI educational exhibit';
  const materials = {
    polymer: new THREE.MeshStandardMaterial({ color: 0xd5e0e4, metalness: .18, roughness: .46 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17242d, metalness: .7, roughness: .32 }),
    aluminum: new THREE.MeshStandardMaterial({ color: 0x9aabb3, metalness: .88, roughness: .24 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc27b48, metalness: .82, roughness: .3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x11191d, metalness: .04, roughness: .92 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1d4c5c, metalness: .25, roughness: .14, transparent: true, opacity: .72, depthWrite: false }),
    lens: new THREE.MeshBasicMaterial({ color: 0x8cf3ff }),
    signal: new THREE.MeshStandardMaterial({ color: 0x73e4ed, metalness: .35, roughness: .24, emissive: 0x1e8c9a, emissiveIntensity: 1.2 }),
    node: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .35, roughness: .28, emissive: 0x235c73, emissiveIntensity: 1.05 }),
    edge: new THREE.MeshBasicMaterial({ color: 0x5eb6d1, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false }),
    obstacle: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .42, roughness: .5 }),
    point: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82 }),
    path: new THREE.MeshBasicMaterial({ color: 0x72e4ed, transparent: true, opacity: .58, blending: THREE.AdditiveBlending, depthWrite: false }),
    balance: new THREE.MeshBasicMaterial({ color: 0x91e2be, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }),
    scan: scanShader(),
    policyGlow: signalShader(),
    anisotropy: Math.min(8, options.anisotropy || 4),
  };

  const humanoid = makeHumanoid(materials);
  const quadruped = makeQuadruped(materials);
  const policy = makePolicyBoard(materials);
  const environment = makeEnvironment(materials);
  const particles = makeParticles();
  root.add(humanoid.group, quadruped.group, environment.group, particles.points);

  const policyLod = new THREE.LOD();
  policyLod.position.set(3.75, 3.05, -1.15);
  policyLod.rotation.y = -.12;
  policyLod.addLevel(policy.high, 0);
  policyLod.addLevel(policy.medium, 19);
  policyLod.addLevel(policy.low, 34);
  policyLod.autoUpdate = false;
  root.add(policyLod);

  addMesh(root, new THREE.CylinderGeometry(6.7, 7, .2, 64), materials.dark, [.3, -.12, 0], [0, 0, 0], 'display plinth');
  const grid = new THREE.GridHelper(13, 26, 0x3b6674, 0x1c3540);
  grid.position.set(.3, .005, 0);
  grid.material.transparent = true;
  grid.material.opacity = .34;
  grid.name = 'reference grid';
  root.add(grid);
  addMesh(root, new THREE.TorusGeometry(6.65, .025, 6, 96), materials.signal, [.3, -.01, 0], [Math.PI / 2, 0, 0], 'interactive outline');

  let disposed = false;
  let quality = 2;
  let presentation = { mode: 'perception', hotspot: null, reducedMotion: false };

  function anchor(id) {
    if (id === 'sensors') return new THREE.Vector3(0, 4.15, .3);
    if (id === 'joints') return new THREE.Vector3(.4, 2.2, .05);
    if (id === 'policy') return new THREE.Vector3(3.75, 3.05, -1);
    if (id === 'obstacle') return new THREE.Vector3(-2.65, .75, .25);
    return new THREE.Vector3(0, .25, .15);
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(2, Number(level) || 0));
    const index = [2, 1, 0][quality];
    policyLod.levels.forEach((entry, entryIndex) => { entry.object.visible = entryIndex === index; });
    humanoid.fasteners.visible = quality >= 1;
    environment.sensorPoints.geometry.setDrawRange(0, Math.floor(MODEL_SPEC.sensorPoints * [.35, .68, 1][quality]));
    particles.points.geometry.setDrawRange(0, Math.floor(particles.count * [.4, .7, 1][quality]));
    environment.scan.visible = quality > 0 && presentation.mode === 'perception';
  }

  function setPresentation(next = {}) {
    presentation = { ...presentation, ...next };
    environment.sensorPoints.visible = ['perception', 'planning'].includes(presentation.mode) && quality > 0;
    environment.path.visible = presentation.mode === 'planning';
    environment.routeMarkers.visible = presentation.mode === 'planning';
    environment.support.visible = presentation.mode === 'balance';
    environment.com.visible = presentation.mode === 'balance';
    environment.balanceVector.visible = presentation.mode === 'balance';
    environment.scan.visible = presentation.mode === 'perception' && quality > 0;
    materials.policyGlow.uniforms.uColor.value.set(presentation.mode === 'learning' ? 0xb393ff : 0x7de4ee);
  }

  function update(state) {
    if (disposed) return;
    humanoid.group.position.y = state.body.position[1];
    humanoid.group.rotation.z = state.body.rotation[2];
    humanoid.torso.rotation.y = state.jointAngles[10];
    humanoid.head.rotation.x = state.jointAngles[11];
    humanoid.legs.forEach((leg, index) => {
      const offset = index * 3;
      leg.hip.rotation.x = state.jointAngles[offset];
      leg.knee.rotation.x = state.jointAngles[offset + 1];
      leg.ankle.rotation.x = state.jointAngles[offset + 2];
    });
    humanoid.arms.forEach((arm, index) => {
      const offset = 6 + index * 2;
      arm.shoulder.rotation.x = state.jointAngles[offset];
      arm.elbow.rotation.x = state.jointAngles[offset + 1];
      arm.wrist.rotation.z = Math.sin(state.gait + index) * .08;
    });
    quadruped.legs.forEach((leg, index) => {
      const phase = state.quadrupedPhase + (index % 2) * Math.PI + (index > 1 ? .7 : 0);
      leg.hip.rotation.x = Math.sin(phase) * .42;
      leg.knee.rotation.x = .25 + Math.max(0, Math.sin(phase)) * .5;
    });
    quadruped.group.position.y = .1 + Math.cos(state.quadrupedPhase * 2) * .035;

    materials.scan.uniforms.uTime.value = state.time;
    materials.policyGlow.uniforms.uTime.value = state.flows.policy;
    materials.node.emissiveIntensity = .7 + state.planning.progress * .9;
    environment.obstacle.rotation.y = presentation.mode === 'planning' ? Math.sin(state.time * .2) * .04 : 0;
    environment.com.position.set(state.balance.centerOfMass[0], state.balance.centerOfMass[1], 0);
    const top = new THREE.Vector3(state.balance.centerOfMass[0], state.balance.centerOfMass[1], 0);
    const bottom = new THREE.Vector3(state.balance.centerOfMass[0], .05, 0);
    environment.balanceVector.position.copy(top).add(bottom).multiplyScalar(.5);
    environment.balanceVector.scale.y = top.distanceTo(bottom);
    environment.sensorPoints.rotation.y = Math.sin(state.time * .18) * .035;

    for (let index = 0; index < particles.count; index++) {
      const phase = (state.flows.policy + index / particles.count) % 1;
      if (index % 3 === 0) {
        particles.positions[index * 3] = .2 + phase * 3.4;
        particles.positions[index * 3 + 1] = 4.1 - phase * 1.2;
        particles.positions[index * 3 + 2] = .2 - phase * 1.2;
      } else if (index % 3 === 1) {
        particles.positions[index * 3] = 3.6 - phase * 3.3;
        particles.positions[index * 3 + 1] = 3.1 - phase * 2.5;
        particles.positions[index * 3 + 2] = -1.1 + phase * .8;
      } else {
        const angle = index * 2.399 + state.time * .4;
        particles.positions[index * 3] = Math.cos(angle) * (.7 + phase * 2.5);
        particles.positions[index * 3 + 1] = .1 + phase * 3.7;
        particles.positions[index * 3 + 2] = Math.sin(angle) * (.7 + phase * 2.5);
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
  setPresentation({ mode: 'perception' });
  return { root, anchor, setQuality, setPresentation, update, dispose, stats, get counts() { return stats(); } };
}
