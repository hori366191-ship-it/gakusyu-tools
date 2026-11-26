import * as THREE from 'three';
import { HOTSPOT_IDS } from './content.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function seededRandom(seed = 1) {
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

function edgeLines(mesh, color = 0x7b9ba8, opacity = .42) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 28),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.add(lines);
  return lines;
}

export function buildModelStats() {
  const chips = 95;
  const wells = 96;
  const wellLiquids = 96;
  const vials = 24;
  const vialCaps = 24;
  const screws = 48;
  const liquidParticles = 220;
  const flowParticles = 30;
  const chartBars = 12;
  const objectives = 4;
  const robotJoints = 6;
  const protocolCards = 5;
  return Object.freeze({
    chips,
    wells,
    wellLiquids,
    vials,
    screws,
    liquidParticles,
    flowParticles,
    chartBars,
    objectives,
    robotJoints,
    protocolCards,
    meaningfulParts: chips + wells + wellLiquids + vials + vialCaps + screws + liquidParticles + flowParticles + chartBars + objectives + robotJoints + protocolCards,
    instancedDetail: chips + wells + wellLiquids + vials + vialCaps + screws + flowParticles + chartBars + objectives + robotJoints,
    instancedMeshes: 10,
    pbrMaterials: 7,
    shaderMaterials: 1,
    lodObjects: 1,
    hotspots: HOTSPOT_IDS.length,
    educational: true,
  });
}

function makeBench() {
  const group = new THREE.Group();
  group.name = 'autonomous laboratory bench';
  const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x172832, metalness: .72, roughness: .38 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x4e7680, metalness: .82, roughness: .25, emissive: 0x12353d, emissiveIntensity: .5 });
  const bench = addMesh(group, new THREE.BoxGeometry(13.2, .42, 8.2), benchMaterial, [0, -3.25, 0]);
  edgeLines(bench, 0x547d88, .45);
  addMesh(group, new THREE.BoxGeometry(12.7, .08, 7.7), edgeMaterial, [0, -2.99, 0]);
  const screwMaterial = new THREE.MeshStandardMaterial({ color: 0x9db1b6, metalness: .94, roughness: .18 });
  const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .055, .035, 8), screwMaterial, 48);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 48; index++) {
    const side = Math.floor(index / 12);
    const step = index % 12;
    if (side < 2) dummy.position.set(-6 + step * 1.09, -2.93, side === 0 ? -3.75 : 3.75);
    else dummy.position.set(side === 2 ? -6.25 : 6.25, -2.93, -3.3 + step * .6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    screws.setMatrixAt(index, dummy.matrix);
  }
  screws.instanceMatrix.needsUpdate = true;
  screws.userData.fullCount = 48;
  group.add(screws);

  const linePositions = [];
  for (let index = -6; index <= 6; index++) linePositions.push(index, -2.94, -3.7, index, -2.94, 3.7);
  for (let index = -3; index <= 3; index++) linePositions.push(-6.2, -2.94, index, 6.2, -2.94, index);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  group.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x31525e, transparent: true, opacity: .3 })));
  return { group, screws };
}

function makeAICore() {
  const lod = new THREE.LOD();
  lod.name = 'AI core with two-level detail';
  lod.position.set(-3.7, -.15, -1.7);
  const high = new THREE.Group();
  const low = new THREE.Group();
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x102f35, metalness: .46, roughness: .34, emissive: 0x09282c, emissiveIntensity: .8 });
  const chipMaterial = new THREE.MeshStandardMaterial({ color: 0x66ddd2, emissive: 0x1b9b91, emissiveIntensity: 1.25, metalness: .4, roughness: .24 });
  const frameMaterial = new THREE.MeshPhysicalMaterial({ color: 0x29444e, metalness: .78, roughness: .2, clearcoat: .7 });
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(.23, .08, .18), chipMaterial, 95);
  const dummy = new THREE.Object3D();
  for (let board = 0; board < 5; board++) {
    const y = -1.15 + board * .48;
    addMesh(high, new THREE.BoxGeometry(2.15, .10, 1.65), boardMaterial, [0, y, 0]);
    addMesh(high, new THREE.BoxGeometry(2.28, .055, 1.78), frameMaterial, [0, y - .09, 0]);
    for (let index = 0; index < 19; index++) {
      const column = index % 5;
      const row = Math.floor(index / 5);
      dummy.position.set(-.78 + column * .39, y + .10, -.52 + row * .42);
      dummy.rotation.set(0, (index % 3) * .12, 0);
      dummy.scale.setScalar(index % 7 === 0 ? 1.3 : 1);
      dummy.updateMatrix();
      chips.setMatrixAt(board * 19 + index, dummy.matrix);
    }
  }
  chips.instanceMatrix.needsUpdate = true;
  chips.userData.fullCount = 95;
  high.add(chips);
  addMesh(low, new THREE.CylinderGeometry(1.05, 1.2, 2.7, 18), frameMaterial);
  addMesh(low, new THREE.BoxGeometry(1.9, 1.9, 1.4), boardMaterial);
  lod.addLevel(high, 0);
  lod.addLevel(low, 18);

  const coreMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9af8e9, emissive: 0x2cc9b8, emissiveIntensity: 2.1, metalness: .12, roughness: .12, clearcoat: 1 });
  const nucleus = addMesh(lod, new THREE.IcosahedronGeometry(.42, 2), coreMaterial, [0, .12, 0]);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x71e5d8, emissive: 0x1c8c83, emissiveIntensity: 1.2, metalness: .65, roughness: .2, transparent: true, opacity: .78 });
  const rings = [];
  for (const [radius, rotation] of [[1.38, [.4, .2, .1]], [1.68, [1.15, -.4, .55]], [1.98, [.2, 1.05, -.3]]]) {
    rings.push(addMesh(lod, new THREE.TorusGeometry(radius, .027, 7, 72), ringMaterial, [0, .12, 0], rotation));
  }
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x58dccc, transparent: true, opacity: .055, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
  addMesh(lod, new THREE.SphereGeometry(2.35, 24, 16), haloMaterial, [0, .12, 0]);
  return { group: lod, high, low, chips, nucleus, rings, ringMaterial };
}

function makeRobot() {
  const root = new THREE.Group();
  root.name = 'six-joint robot arm and pipette';
  root.position.set(-1.25, -2.72, 1.35);
  const metal = new THREE.MeshStandardMaterial({ color: 0xa7b8bd, metalness: .88, roughness: .23 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x324b55, metalness: .78, roughness: .3 });
  const accent = new THREE.MeshPhysicalMaterial({ color: 0x67ded3, emissive: 0x177f78, emissiveIntensity: .8, metalness: .28, roughness: .2, clearcoat: .8 });
  addMesh(root, new THREE.CylinderGeometry(.62, .78, .34, 24), darkMetal, [0, .17, 0]);
  addMesh(root, new THREE.CylinderGeometry(.42, .5, .44, 20), metal, [0, .52, 0]);
  const turret = new THREE.Group();
  turret.position.y = .76;
  root.add(turret);
  addMesh(turret, new THREE.CylinderGeometry(.34, .34, .26, 18), accent);
  const shoulder = new THREE.Group();
  shoulder.position.y = .2;
  turret.add(shoulder);
  const upper = addMesh(shoulder, new THREE.BoxGeometry(.36, 1.35, .42), metal, [0, .67, 0]);
  edgeLines(upper, 0xd4e3e6, .35);
  const elbow = new THREE.Group();
  elbow.position.y = 1.35;
  shoulder.add(elbow);
  addMesh(elbow, new THREE.SphereGeometry(.24, 16, 12), accent);
  const forearm = addMesh(elbow, new THREE.BoxGeometry(.28, 1.18, .32), darkMetal, [0, .59, 0]);
  edgeLines(forearm, 0x87a6af, .4);
  const wrist = new THREE.Group();
  wrist.position.y = 1.18;
  elbow.add(wrist);
  addMesh(wrist, new THREE.CylinderGeometry(.20, .20, .26, 16), accent);
  const pipette = new THREE.Group();
  pipette.position.y = -.24;
  wrist.add(pipette);
  addMesh(pipette, new THREE.CylinderGeometry(.075, .055, .78, 12), metal, [0, -.34, 0]);
  addMesh(pipette, new THREE.ConeGeometry(.055, .24, 10), accent, [0, -.84, 0], [0, 0, Math.PI]);
  const pipetteTip = new THREE.Object3D();
  pipetteTip.position.set(0, -.98, 0);
  pipette.add(pipetteTip);
  const joints = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 10, 8), accent, 6);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 6; index++) {
    dummy.position.set(index % 2 ? .23 : -.23, .25 + index * .48, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    joints.setMatrixAt(index, dummy.matrix);
  }
  joints.instanceMatrix.needsUpdate = true;
  root.add(joints);
  return { root, turret, shoulder, elbow, wrist, pipette, pipetteTip, joints };
}

function makeMicroplate() {
  const root = new THREE.Group();
  root.name = '96-well microplate';
  root.position.set(1.9, -2.78, .85);
  const plateMaterial = new THREE.MeshPhysicalMaterial({ color: 0x7ba9b2, transparent: true, opacity: .34, roughness: .12, metalness: .08, clearcoat: 1, depthWrite: false });
  const wellMaterial = new THREE.MeshStandardMaterial({ color: 0x13252e, metalness: .3, roughness: .36 });
  const liquidMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x123d3d, emissiveIntensity: .8, metalness: .08, roughness: .16, clearcoat: 1 });
  const plate = addMesh(root, new THREE.BoxGeometry(4.55, .26, 3.0), plateMaterial, [0, .12, 0]);
  edgeLines(plate, 0x8ed6d4, .55);
  const wells = new THREE.InstancedMesh(new THREE.CylinderGeometry(.155, .155, .17, 12, 1, true), wellMaterial, 96);
  const liquids = new THREE.InstancedMesh(new THREE.CylinderGeometry(.122, .122, .035, 12), liquidMaterial, 96);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 12; column++) {
      const index = row * 12 + column;
      const x = (column - 5.5) * .35;
      const z = (row - 3.5) * .35;
      dummy.position.set(x, .28, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      wells.setMatrixAt(index, dummy.matrix);
      dummy.position.y = .30;
      dummy.updateMatrix();
      liquids.setMatrixAt(index, dummy.matrix);
      color.set(index % 4 === 0 ? 0x62dcd2 : index % 4 === 1 ? 0x5a8ee8 : index % 4 === 2 ? 0xa47ce8 : 0xe2b369);
      liquids.setColorAt(index, color);
    }
  }
  wells.instanceMatrix.needsUpdate = true;
  liquids.instanceMatrix.needsUpdate = true;
  liquids.instanceColor.needsUpdate = true;
  wells.userData.fullCount = 96;
  liquids.userData.fullCount = 96;
  root.add(wells, liquids);
  return { root, plate, wells, liquids, lastColorKey: '' };
}

function makeVialRack() {
  const root = new THREE.Group();
  root.name = 'reagent vial rack';
  root.position.set(-.1, -2.66, -2.35);
  const rackMaterial = new THREE.MeshStandardMaterial({ color: 0x243b45, metalness: .55, roughness: .4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9adfe3, transparent: true, opacity: .26, roughness: .08, metalness: .04, clearcoat: 1, depthWrite: false });
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0xd0a365, metalness: .35, roughness: .34 });
  addMesh(root, new THREE.BoxGeometry(2.75, .22, 1.25), rackMaterial, [0, .12, 0]);
  const vials = new THREE.InstancedMesh(new THREE.CylinderGeometry(.095, .095, .68, 12), glass, 24);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.11, .11, .12, 12), capMaterial, 24);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 24; index++) {
    const column = index % 8;
    const row = Math.floor(index / 8);
    dummy.position.set(-1.12 + column * .32, .53, -.4 + row * .4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    vials.setMatrixAt(index, dummy.matrix);
    dummy.position.y = .92;
    dummy.updateMatrix();
    caps.setMatrixAt(index, dummy.matrix);
  }
  vials.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  vials.userData.fullCount = 24;
  caps.userData.fullCount = 24;
  root.add(vials, caps);
  return { root, vials, caps };
}

function makeMicroscope() {
  const root = new THREE.Group();
  root.name = 'microscope and scanning stage';
  root.position.set(4.35, -2.72, -1.65);
  const body = new THREE.MeshStandardMaterial({ color: 0xb7c5c8, metalness: .76, roughness: .25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263d47, metalness: .7, roughness: .32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x74d8de, transparent: true, opacity: .28, roughness: .06, metalness: .05, clearcoat: 1, depthWrite: false });
  const accent = new THREE.MeshStandardMaterial({ color: 0x71e1d7, emissive: 0x1b8a83, emissiveIntensity: 1.2, metalness: .35, roughness: .22 });
  addMesh(root, new THREE.BoxGeometry(2.0, .32, 1.8), dark, [0, .16, 0]);
  addMesh(root, new THREE.BoxGeometry(.55, 2.45, .62), body, [.45, 1.45, -.25], [0, 0, -.12]);
  addMesh(root, new THREE.BoxGeometry(1.45, .52, .72), body, [-.22, 2.45, -.25]);
  addMesh(root, new THREE.CylinderGeometry(.23, .28, .88, 18), dark, [-.75, 2.63, -.25], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.CylinderGeometry(.20, .20, .28, 18), glass, [-1.28, 2.63, -.25], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.BoxGeometry(1.75, .16, 1.35), dark, [-.28, 1.05, .1]);
  const stage = addMesh(root, new THREE.BoxGeometry(1.35, .10, .92), glass, [-.28, 1.18, .1]);
  addMesh(root, new THREE.CylinderGeometry(.42, .42, .22, 24), accent, [-.28, 1.94, .1]);
  const objectives = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .10, .48, 12), body, 4);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * TAU;
    dummy.position.set(-.28 + Math.cos(angle) * .25, 1.62, .1 + Math.sin(angle) * .25);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(index === 0 ? 1.2 : .85);
    dummy.updateMatrix();
    objectives.setMatrixAt(index, dummy.matrix);
  }
  objectives.instanceMatrix.needsUpdate = true;
  root.add(objectives);
  const scanMaterial = new THREE.MeshBasicMaterial({ color: 0x8dfff1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const scanLine = addMesh(root, new THREE.BoxGeometry(.025, .015, .82), scanMaterial, [-.8, 1.25, .1]);
  return { root, stage, objectives, scanLine, scanMaterial };
}

function makeFlowLoop() {
  const group = new THREE.Group();
  group.name = 'closed-loop workflow paths';
  const material = new THREE.MeshStandardMaterial({ color: 0x71dcd3, emissive: 0x1b7772, emissiveIntensity: 1.2, metalness: .25, roughness: .3, transparent: true, opacity: .55 });
  const curves = [
    new THREE.CatmullRomCurve3([new THREE.Vector3(-3.2, .6, -.8), new THREE.Vector3(-2.4, -.4, .4), new THREE.Vector3(-1.2, -.7, 1.4)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-.7, -.7, 1.4), new THREE.Vector3(.5, -1.5, 1.8), new THREE.Vector3(1.9, -1.3, .85)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(2.3, -1.1, .3), new THREE.Vector3(3.8, -.2, -.4), new THREE.Vector3(4.35, .0, -1.65)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(4.0, .5, -1.9), new THREE.Vector3(.5, 2.7, -2.8), new THREE.Vector3(-3.5, 1.4, -1.8)]),
  ];
  for (const curve of curves) group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .025, 6, false), material));
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xb6fff4, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(.065, 8, 6), particleMaterial, 30);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  particles.userData.fullCount = 30;
  group.add(particles);
  return { group, curves, material, particles, particleMaterial };
}

function makeHumanGate() {
  const group = new THREE.Group();
  group.name = 'human review gate';
  group.position.set(.1, -1.65, 2.8);
  const frame = new THREE.MeshStandardMaterial({ color: 0x83d7b3, emissive: 0x1b5c46, emissiveIntensity: .75, metalness: .62, roughness: .25 });
  const panelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x83d7b3, transparent: true, opacity: .12, roughness: .1, metalness: .05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  addMesh(group, new THREE.BoxGeometry(.11, 1.65, .11), frame, [-.72, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(.11, 1.65, .11), frame, [.72, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(1.55, .11, .11), frame, [0, .78, 0]);
  addMesh(group, new THREE.PlaneGeometry(1.34, 1.45), panelMaterial);
  const icon = addMesh(group, new THREE.TorusGeometry(.25, .028, 7, 32), frame, [0, .05, .03]);
  addMesh(group, new THREE.BoxGeometry(.05, .34, .04), frame, [0, .05, .04]);
  return { group, panelMaterial, icon };
}

function makeChart() {
  const root = new THREE.Group();
  root.name = 'analysis hologram';
  root.position.set(-1.75, 2.7, -1.7);
  const material = new THREE.MeshStandardMaterial({ color: 0x8b7cff, emissive: 0x443099, emissiveIntensity: 1.15, metalness: .28, roughness: .24, transparent: true, opacity: .82 });
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, 1, .13), material, 12);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  bars.userData.fullCount = 12;
  root.add(bars);
  const boardMaterial = new THREE.MeshBasicMaterial({ color: 0x6e5acb, transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false });
  addMesh(root, new THREE.PlaneGeometry(2.1, 1.65), boardMaterial);
  return { root, bars, material };
}

function makeProtocolCards() {
  const root = new THREE.Group();
  root.name = 'hypothesis protocol cards';
  root.position.set(-3.7, 2.25, -1.7);
  const cardMaterial = new THREE.MeshPhysicalMaterial({ color: 0x193b42, emissive: 0x0d4947, emissiveIntensity: .55, metalness: .25, roughness: .3, transparent: true, opacity: .72, clearcoat: .6 });
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x79e4d7, transparent: true, opacity: .65 });
  const cards = [];
  for (let index = 0; index < 5; index++) {
    const card = new THREE.Group();
    const angle = index / 5 * TAU;
    card.position.set(Math.cos(angle) * 1.55, (index % 2) * .42, Math.sin(angle) * 1.15);
    card.rotation.y = -angle;
    addMesh(card, new THREE.BoxGeometry(.82, .055, .52), cardMaterial);
    for (let line = 0; line < 3; line++) addMesh(card, new THREE.BoxGeometry(.54 - line * .08, .012, .018), lineMaterial, [-.06 + line * .04, .036, -.14 + line * .13]);
    cards.push(card);
    root.add(card);
  }
  return { root, cards };
}

function makeLiquidParticles() {
  const random = seededRandom(7721);
  const count = 220;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = (random() - .5) * 4;
    positions[index * 3 + 1] = random() * 2;
    positions[index * 3 + 2] = (random() - .5) * 3;
    phases[index] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uOpacity: { value: 0 }, uDrop: { value: 0 },
      uColor: { value: new THREE.Color(0x77e9df) },
    },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uDrop;
      varying float vAlpha;
      void main() {
        float fall = fract(aPhase + uTime * 0.55);
        vec3 p = uOrigin + vec3(sin(aPhase * 41.0) * 0.09, -fall * 1.7, cos(aPhase * 37.0) * 0.09);
        p.x += sin(uTime + aPhase * 12.0) * 0.025;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (3.5 + 2.0 * uDrop) * (85.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vAlpha = (1.0 - fall) * (0.45 + 0.55 * uDrop);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.08, d) * uOpacity * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor * 1.25, alpha);
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

export function createAutonomousLabModel() {
  const root = new THREE.Group();
  root.name = 'autonomous AI laboratory educational model';
  const bench = makeBench();
  const core = makeAICore();
  const robot = makeRobot();
  const plate = makeMicroplate();
  const vials = makeVialRack();
  const microscope = makeMicroscope();
  const flow = makeFlowLoop();
  const gate = makeHumanGate();
  const chart = makeChart();
  const cards = makeProtocolCards();
  const liquid = makeLiquidParticles();
  root.add(bench.group, core.group, robot.root, plate.root, vials.root, microscope.root, flow.group, gate.group, chart.root, cards.root, liquid);
  const stats = buildModelStats();
  let quality = 2;
  let selectedHotspot = null;
  let currentState = null;
  const cameraQuaternion = new THREE.Quaternion();
  const selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: .86, depthWrite: false });
  const selection = new THREE.Mesh(new THREE.TorusGeometry(.58, .026, 7, 56), selectionMaterial);
  selection.visible = false;
  root.add(selection);
  const dummy = new THREE.Object3D();
  const temp = new THREE.Vector3();
  const liquidOrigin = new THREE.Vector3();
  const color = new THREE.Color();

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, Math.floor(level)));
    core.chips.count = [48, 64, 80, 95][quality];
    bench.screws.count = [24, 32, 40, 48][quality];
    vials.vials.count = [12, 16, 20, 24][quality];
    vials.caps.count = [12, 16, 20, 24][quality];
    liquid.geometry.setDrawRange(0, [100, 150, 190, 220][quality]);
    flow.particles.count = [14, 20, 26, 30][quality];
  }

  function updatePlate(state) {
    const key = `${state.mode}:${Math.floor(state.phase * 24)}:${state.iteration}:${state.autonomy}`;
    if (key === plate.lastColorKey) return;
    plate.lastColorKey = key;
    for (let index = 0; index < 96; index++) {
      const signal = state.data[index % state.data.length];
      const designed = state.nextDesign * (.5 + .5 * Math.sin(index * 1.9 + state.iteration));
      const hue = state.mode === 'next-design' ? .72 + designed * .12 : state.mode === 'measurement' ? .46 + signal * .28 : .48 + (index % 4) * .055;
      color.setHSL(hue % 1, .68, .38 + signal * .24);
      plate.liquids.setColorAt(index, color);
    }
    plate.liquids.instanceColor.needsUpdate = true;
  }

  function update(state, clock, delta = 0) {
    currentState = state;
    core.nucleus.scale.setScalar(1 + Math.sin(clock * 2.6) * .08 + state.planning * .18);
    core.rings.forEach((ring, index) => {
      ring.rotation.x += delta * (.16 + index * .06);
      ring.rotation.y += delta * (.12 + index * .04);
    });
    core.ringMaterial.emissiveIntensity = 1.0 + state.planning * 1.2;

    robot.turret.rotation.y = state.robot.base;
    robot.shoulder.rotation.z = state.robot.shoulder;
    robot.elbow.rotation.z = state.robot.elbow;
    robot.wrist.rotation.z = state.robot.wrist;
    robot.pipette.rotation.z = Math.sin(clock * 1.7) * state.experiment * .035;

    root.updateMatrixWorld(true);
    robot.pipetteTip.getWorldPosition(temp);
    liquidOrigin.copy(root.worldToLocal(temp));
    liquid.material.uniforms.uOrigin.value.copy(liquidOrigin);
    liquid.material.uniforms.uTime.value = clock;
    liquid.material.uniforms.uDrop.value = state.robot.drop;
    liquid.material.uniforms.uOpacity.value = state.experiment * .9;
    liquid.visible = state.experiment > .01;

    microscope.stage.position.x = -.28 + Math.sin(state.phase * TAU * 2) * .42 * state.measurement;
    microscope.scanLine.position.x = -.85 + ((state.phase * 3) % 1) * 1.15;
    microscope.scanMaterial.opacity = state.measurement * .85;
    microscope.scanLine.visible = state.measurement > .01;

    updatePlate(state);
    state.data.forEach((value, index) => {
      const height = .08 + value * 1.35;
      dummy.position.set((index - 5.5) * .15, height / 2, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      chart.bars.setMatrixAt(index, dummy.matrix);
    });
    chart.bars.instanceMatrix.needsUpdate = true;
    chart.root.visible = state.analysis > .01 || state.mode === 'next-design';
    chart.material.opacity = .35 + state.analysis * .55;
    chart.root.rotation.y = Math.sin(clock * .25) * .12;

    cards.root.visible = state.planning > .01;
    cards.cards.forEach((card, index) => {
      card.position.y = (index % 2) * .42 + Math.sin(clock * .8 + index) * .08;
      card.rotation.z = Math.sin(clock * .45 + index) * .04;
    });

    flow.material.opacity = .18 + state.flowOpacity * .5;
    flow.particleMaterial.opacity = state.flowOpacity * .9;
    for (let index = 0; index < flow.particles.count; index++) {
      const curve = flow.curves[index % flow.curves.length];
      const travel = (clock * .055 * state.flowSpeed + index / flow.particles.count) % 1;
      dummy.position.copy(curve.getPointAt(travel));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(.75 + (index % 3) * .2);
      dummy.updateMatrix();
      flow.particles.setMatrixAt(index, dummy.matrix);
    }
    flow.particles.instanceMatrix.needsUpdate = true;
    gate.group.visible = state.humanGateVisible;
    gate.icon.rotation.z = clock * .25;
    gate.panelMaterial.opacity = .10 + Math.sin(clock * 1.4) * .025;

    if (selectedHotspot) {
      selection.visible = true;
      selection.position.copy(hotspotAnchor(selectedHotspot));
      selection.quaternion.copy(cameraQuaternion);
      selection.scale.setScalar(1 + Math.sin(clock * 3) * .08);
    } else selection.visible = false;
  }

  function hotspotAnchor(id) {
    if (id === 'ai-core') return new THREE.Vector3(-3.7, .6, -1.7);
    if (id === 'robot-arm') {
      root.updateMatrixWorld(true);
      return robot.pipetteTip.getWorldPosition(new THREE.Vector3());
    }
    if (id === 'microplate') return new THREE.Vector3(1.9, -2.35, .85);
    if (id === 'microscope') return new THREE.Vector3(4.0, -.15, -1.55);
    return new THREE.Vector3(.1, -1.2, 2.8);
  }

  setQuality(quality);
  return {
    root,
    stats,
    update,
    setQuality,
    setSelectedHotspot(id) { selectedHotspot = HOTSPOT_IDS.includes(id) ? id : null; },
    setCameraQuaternion(quaternion) { if (quaternion?.isQuaternion) cameraQuaternion.copy(quaternion); },
    hotspotAnchor,
    get quality() { return quality; },
    get state() { return currentState; },
  };
}
