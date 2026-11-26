import * as THREE from 'three';
import { HOTSPOTS } from './content.mjs';
import {
  EARTH_CENTER,
  EARTH_RADIUS,
  EARTH_ROTATION,
  EARTH_TEXTURE_PATHS,
  SATELLITE_LAYOUT,
  modeWeight,
  orbitalPosition,
} from './scene-state.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const tempVector = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempVectorC = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempQuaternionB = new THREE.Quaternion();
const tempQuaternionC = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const dummy = new THREE.Object3D();

function seededRandom(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function hash2(x, y, seed = 0) {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise2(x, y, periodX, periodY, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const y0 = ((iy % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, ux), THREE.MathUtils.lerp(c, d, ux), uy);
}

function fbm2(x, y, seed = 1) {
  let value = 0;
  let amplitude = .55;
  for (let octave = 0; octave < 5; octave++) {
    value += noise2(x * (4 << octave), y * (2 << octave), 4 << octave, 2 << octave, seed + octave * 17) * amplitude;
    amplitude *= .5;
  }
  return value;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeSolarTexture() {
  return canvasTexture(512, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#164d79');
    gradient.addColorStop(.42, '#061630');
    gradient.addColorStop(1, '#1b648e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    for (let column = 0; column <= 16; column++) {
      for (let row = 0; row <= 8; row++) {
        const x = column * 32;
        const y = row * 32;
        context.fillStyle = (column + row) % 2 ? 'rgba(86,157,205,.1)' : 'rgba(2,9,25,.18)';
        context.fillRect(x + 1.5, y + 1.5, 29, 29);
        context.strokeStyle = 'rgba(155,213,239,.62)';
        context.lineWidth = .8;
        context.strokeRect(x + .8, y + .8, 30.4, 30.4);
        context.strokeStyle = 'rgba(185,224,244,.2)';
        context.beginPath();
        context.moveTo(x + 10.5, y + 2);
        context.lineTo(x + 10.5, y + 30);
        context.moveTo(x + 21.5, y + 2);
        context.lineTo(x + 21.5, y + 30);
        context.stroke();
      }
    }
    context.strokeStyle = 'rgba(218,241,249,.78)';
    context.lineWidth = 3;
    context.strokeRect(2, 2, width - 4, height - 4);
  });
}

function makeFoilTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    const random = seededRandom(123);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#704117');
    gradient.addColorStop(.24, '#e2b65d');
    gradient.addColorStop(.48, '#8e5b21');
    gradient.addColorStop(.72, '#f0c979');
    gradient.addColorStop(1, '#6f4318');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 1200; index++) {
      const x = random() * width;
      const y = random() * height;
      const length = 5 + random() * 42;
      context.strokeStyle = random() > .5 ? 'rgba(255,236,174,.25)' : 'rgba(44,22,5,.22)';
      context.lineWidth = .35 + random() * 1.4;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - .5) * 18, y + length);
      context.stroke();
    }
  });
}

function makeRadiatorTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = '#c7d4d8';
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 16; index++) {
      const x = index * width / 16;
      const gradient = context.createLinearGradient(x, 0, x + width / 16, 0);
      gradient.addColorStop(0, '#6f858f');
      gradient.addColorStop(.42, '#edf4f3');
      gradient.addColorStop(1, '#899da6');
      context.fillStyle = gradient;
      context.fillRect(x + 1, 0, width / 16 - 2, height);
    }
    context.strokeStyle = 'rgba(35,58,70,.58)';
    context.lineWidth = 2;
    for (let y = 0; y <= height; y += 32) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  });
}

function makeGlowTexture() {
  return canvasTexture(128, 128, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.12, 'rgba(255,255,255,.9)');
    gradient.addColorStop(.34, 'rgba(255,255,255,.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function makeStreakTexture() {
  return canvasTexture(512, 64, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(.42, 'rgba(255,220,150,.08)');
    gradient.addColorStop(.5, 'rgba(255,248,215,.95)');
    gradient.addColorStop(.58, 'rgba(255,220,150,.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function makeCloudTexture() {
  return canvasTexture(1024, 512, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const ny = y / height;
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const warp = .018 * Math.sin(ny * TAU * 3) + .012 * Math.sin(ny * TAU * 7 + nx * TAU);
        const density = fbm2(nx + warp, ny, 731);
        const detail = noise2(nx * 64, ny * 32, 64, 32, 97);
        const cloud = smoothstep(.48, .68, density * .84 + detail * .16);
        const polar = .06 * Math.pow(Math.abs(ny - .5) * 2, 3);
        const alpha = Math.min(190, (cloud * 165 + polar * 90) * (.75 + detail * .25));
        const offset = (y * width + x) * 4;
        image.data[offset] = 225;
        image.data[offset + 1] = 239;
        image.data[offset + 2] = 247;
        image.data[offset + 3] = alpha;
      }
    }
    context.putImageData(image, 0, 0);
  });
}

function addBox(parent, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent, start, end, radius, material, segments = 8) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addEdges(parent, geometry, color, opacity = .5) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
  parent.add(lines);
  return lines;
}

function makeFoilBlanket(material, width, height, seed) {
  const geometry = new THREE.PlaneGeometry(width, height, 18, 10);
  const positions = geometry.attributes.position;
  const random = seededRandom(seed);
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const fold = Math.sin(x * 11 + y * 4) * .026 + Math.sin(y * 17 - x * 3) * .018 + (random() - .5) * .014;
    positions.setZ(index, fold);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function makeThruster(materials, scale = 1) {
  const group = new THREE.Group();
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.1 * scale, .2 * scale, .32 * scale, 12, 1, true), materials.darkSteel);
  group.add(nozzle);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.2 * scale, .025 * scale, 5, 18), materials.steel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -.16 * scale;
  group.add(rim);
  const throat = new THREE.Mesh(new THREE.CircleGeometry(.09 * scale, 12), materials.thrusterGlow);
  throat.rotation.x = Math.PI / 2;
  throat.position.y = -.17 * scale;
  group.add(throat);
  return group;
}

function makeAntennaDish(materials, scale = 1) {
  const group = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035 * scale, .055 * scale, .5 * scale, 8), materials.steel);
  mast.position.y = .25 * scale;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.46 * scale, 20, 10, 0, TAU, 0, Math.PI / 2), materials.dish);
  dish.scale.y = .32;
  dish.rotation.x = Math.PI;
  dish.position.y = .62 * scale;
  group.add(dish);
  cylinderBetween(group, new THREE.Vector3(0, .42 * scale, 0), new THREE.Vector3(0, .98 * scale, 0), .018 * scale, materials.darkSteel, 6);
  const feed = new THREE.Mesh(new THREE.SphereGeometry(.055 * scale, 10, 7), materials.groundLens);
  feed.position.y = .99 * scale;
  group.add(feed);
  return group;
}

function makeSolarWing(materials, side) {
  const group = new THREE.Group();
  group.position.x = side * 1.55;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .58, 12), materials.steel);
  hinge.rotation.z = Math.PI / 2;
  group.add(hinge);
  cylinderBetween(group, new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 2.15, 0, 0), .075, materials.steel);
  const panelGeometry = new THREE.BoxGeometry(1.58, .075, 2.72);
  for (let segment = 0; segment < 3; segment++) {
    const panel = new THREE.Mesh(panelGeometry, materials.solar);
    panel.position.set(side * (2.68 + segment * 1.64), 0, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    addEdges(panel, panelGeometry, 0x75c7ec, .6);
    addBox(group, [.045, .13, 2.76], [side * (1.88 + segment * 1.64), .01, 0], materials.frame);
  }
  addBox(group, [4.92, .09, .06], [side * 3.95, .03, 0], materials.frame);
  return group;
}

function makeRadiator(materials, side) {
  const group = new THREE.Group();
  group.position.set(0, .58, side * 2.55);
  const geometry = new THREE.BoxGeometry(2.62, .085, 2.24);
  const panel = new THREE.Mesh(geometry, materials.radiator);
  panel.castShadow = true;
  group.add(panel);
  const edge = addEdges(panel, geometry, 0xff9356, .9);
  edge.material.opacity = .7;
  const finGeometry = new THREE.BoxGeometry(.035, .11, 2.17);
  const fins = new THREE.InstancedMesh(finGeometry, materials.radiatorFin, 13);
  for (let index = 0; index < 13; index++) {
    dummy.position.set(-1.18 + index * .197, .07, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fins.setMatrixAt(index, dummy.matrix);
  }
  fins.instanceMatrix.needsUpdate = true;
  group.add(fins);
  cylinderBetween(group, new THREE.Vector3(0, -.18, -side * .8), new THREE.Vector3(0, -.18, -side * 1.5), .08, materials.copper);
  return { group, edge };
}

function makeTelescope(materials, x) {
  const group = new THREE.Group();
  group.position.set(x, 1.23, -.25);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.23, .29, .76, 18), materials.steel);
  barrel.rotation.x = Math.PI / 2;
  group.add(barrel);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.205, 20), materials.opticalLens);
  lens.position.z = .39;
  group.add(lens);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.235, .035, 6, 24), materials.optical);
  ring.position.z = .405;
  group.add(ring);
  addBox(group, [.14, .38, .16], [0, -.3, -.08], materials.darkSteel);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.39, 16, 10), materials.opticalHalo);
  halo.position.z = .18;
  group.add(halo);
  return { group, halo };
}

function makeHero(materials) {
  const group = new THREE.Group();
  group.name = 'Detailed orbital compute satellite';
  const bus = addBox(group, [3.05, 1.72, 2.65], [0, 0, 0], materials.foil);
  addEdges(bus, bus.geometry, 0xe7c681, .5);
  addBox(group, [3.18, .14, 2.78], [0, .88, 0], materials.steel);
  addBox(group, [3.18, .12, 2.78], [0, -.88, 0], materials.darkSteel);
  for (const x of [-1.51, 1.51]) {
    for (const z of [-1.31, 1.31]) addBox(group, [.11, 1.88, .11], [x, 0, z], materials.frame);
  }

  const backBlanket = makeFoilBlanket(materials.foil, 2.92, 1.58, 31);
  backBlanket.position.z = -1.335;
  backBlanket.rotation.y = Math.PI;
  group.add(backBlanket);
  for (const side of [-1, 1]) {
    const blanket = makeFoilBlanket(materials.foil, 2.48, 1.56, 40 + side);
    blanket.position.set(side * 1.535, 0, 0);
    blanket.rotation.y = side * Math.PI / 2;
    group.add(blanket);
  }

  const computeBay = addBox(group, [2.54, 1.24, .18], [0, -.08, 1.41], materials.darkSteel);
  addEdges(computeBay, computeBay.geometry, 0x75efff, .95);
  const chipGeometry = new THREE.BoxGeometry(.32, .28, .12);
  const chips = new THREE.InstancedMesh(chipGeometry, materials.compute, 18);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) {
      dummy.position.set(-1.04 + column * .416, -.43 + row * .35, 1.56);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      chips.setMatrixAt(row * 6 + column, dummy.matrix);
    }
  }
  chips.instanceMatrix.needsUpdate = true;
  group.add(chips);
  for (let row = 0; row < 4; row++) addBox(group, [2.4, .035, .04], [0, -.6 + row * .35, 1.64], materials.copper);
  const computeGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 1.42), materials.computeHalo);
  computeGlow.position.set(0, -.08, 1.51);
  group.add(computeGlow);

  const leftWing = makeSolarWing(materials, -1);
  const rightWing = makeSolarWing(materials, 1);
  group.add(leftWing, rightWing);
  for (const side of [-1, 1]) cylinderBetween(group, new THREE.Vector3(side * 1.2, -.32, -.9), new THREE.Vector3(side * 3.1, -.08, -.6), .045, materials.copper);

  const radiatorBack = makeRadiator(materials, -1);
  const radiatorFront = makeRadiator(materials, 1);
  group.add(radiatorBack.group, radiatorFront.group);
  const opticalLeft = makeTelescope(materials, -.88);
  const opticalRight = makeTelescope(materials, .88);
  group.add(opticalLeft.group, opticalRight.group);

  const antenna = makeAntennaDish(materials, .82);
  antenna.position.set(-.15, 1.05, -.82);
  antenna.rotation.z = -.12;
  group.add(antenna);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, 1.1, 6), materials.steel);
  whip.position.set(1.28, 1.55, -.78);
  whip.rotation.z = -.18;
  group.add(whip);
  const whipTip = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), materials.opticalLens);
  whipTip.position.set(1.38, 2.08, -.78);
  group.add(whipTip);

  const thrusters = [];
  for (const x of [-1.08, 1.08]) {
    for (const z of [-.84, .84]) {
      const thruster = makeThruster(materials, .9);
      thruster.position.set(x, -.88, z);
      thruster.rotation.z = x * .08;
      group.add(thruster);
      thrusters.push(thruster);
    }
  }
  for (const x of [-.55, .55]) {
    const battery = addBox(group, [.66, .45, 1.5], [x, 1.12, -.35], materials.battery);
    addEdges(battery, battery.geometry, 0xffcf75, .38);
  }
  const starTracker = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .34, 10), materials.darkSteel);
  starTracker.position.set(1.32, 1.18, -.15);
  starTracker.rotation.z = -.32;
  group.add(starTracker);

  return {
    group,
    chips,
    computeGlow,
    solarEdges: [leftWing, rightWing],
    radiators: [radiatorBack, radiatorFront],
    opticalHalos: [opticalLeft.halo, opticalRight.halo],
    antenna,
    thrusters,
  };
}

function makeSun(materials) {
  const group = new THREE.Group();
  group.name = 'Sun with procedural lens flare';
  group.position.set(-48, 38, 25);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.45, 32, 20), materials.sun);
  group.add(core);
  const layers = [
    { scale: 18, opacity: .76, color: 0xffc568, position: [0, 0, 0], map: materials.glowTexture },
    { scale: 8, opacity: .95, color: 0xfff0bd, position: [0, 0, .1], map: materials.glowTexture },
    { scale: 25, opacity: .58, color: 0xffd790, position: [0, 0, .2], map: materials.streakTexture },
    { scale: 4.5, opacity: .32, color: 0x77caff, position: [7, -3, 1], map: materials.glowTexture },
    { scale: 3, opacity: .24, color: 0xb692ff, position: [-5, 2.5, .5], map: materials.glowTexture },
  ];
  for (const layer of layers) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: layer.map, color: layer.color, transparent: true, opacity: layer.opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.set(...layer.position);
    sprite.scale.set(layer.scale, layer.scale, 1);
    group.add(sprite);
  }
  return group;
}

function makeEarth(materials) {
  const group = new THREE.Group();
  group.name = 'High-resolution procedural Earth';
  group.position.set(...EARTH_CENTER);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 64), materials.earth);
  surface.rotation.z = -.16;
  group.add(surface);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 128, 64), materials.clouds);
  clouds.rotation.z = -.16;
  group.add(clouds);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.065, 128, 64), materials.atmosphere);
  group.add(atmosphere);
  const innerAtmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 128, 64),
    new THREE.MeshBasicMaterial({ color: 0x54bff5, transparent: true, opacity: .07, side: THREE.FrontSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(innerAtmosphere);
  return { group, surface, clouds, atmosphere };
}

function makeGroundStation(materials) {
  const group = new THREE.Group();
  group.name = 'Optical ground receiver';
  const normal = new THREE.Vector3(.42, .86, .3).normalize();
  group.position.set(...EARTH_CENTER).addScaledVector(normal, EARTH_RADIUS + .08);
  group.quaternion.setFromUnitVectors(UP, normal);
  group.scale.setScalar(1.8);
  addBox(group, [1.1, .15, 1.1], [0, .08, 0], materials.darkSteel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, .82, 10), materials.steel);
  mast.position.y = .52;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.62, 24, 12, 0, TAU, 0, Math.PI / 2), materials.dish);
  dish.scale.y = .38;
  dish.rotation.x = Math.PI;
  dish.position.y = 1.05;
  group.add(dish);
  cylinderBetween(group, new THREE.Vector3(0, .78, 0), new THREE.Vector3(0, 1.58, 0), .025, materials.darkSteel);
  const receiver = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 8), materials.groundLens);
  receiver.position.y = 1.6;
  group.add(receiver);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.82, .03, 5, 40), materials.groundLens);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .18;
  group.add(ring);
  return group;
}

function makeOrbitGuide(layout, opacity) {
  const points = [];
  for (let index = 0; index < 192; index++) points.push(new THREE.Vector3(...orbitalPosition(layout, index / 192 * TAU)));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({ color: 0x77bfda, transparent: true, opacity, dashSize: .38, gapSize: .42, depthWrite: false });
  const line = new THREE.LineLoop(geometry, material);
  line.computeLineDistances();
  return line;
}

function makeFlowParticles(count, color, size) {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.fullCount = count;
  return { points, positions, count };
}

function makePackets(count, color, size) {
  const geometry = new THREE.OctahedronGeometry(size, 0);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.fullCount = count;
  return { mesh, count };
}

function updateFlow(flow, routes, phase, motionScale = 1) {
  if (!routes.length) return;
  const safePhase = motionScale ? phase : .12;
  for (let index = 0; index < flow.count; index++) {
    const route = routes[index % routes.length];
    const progress = (safePhase + Math.floor(index / routes.length) / Math.ceil(flow.count / routes.length)) % 1;
    const offset = index * 3;
    flow.positions[offset] = route.start[0] + (route.end[0] - route.start[0]) * progress;
    flow.positions[offset + 1] = route.start[1] + (route.end[1] - route.start[1]) * progress;
    flow.positions[offset + 2] = route.start[2] + (route.end[2] - route.start[2]) * progress;
  }
  flow.points.geometry.attributes.position.needsUpdate = true;
}

function updatePackets(packets, routes, phase, motionScale = 1) {
  if (!routes.length) return;
  const safePhase = motionScale ? phase : .18;
  for (let index = 0; index < packets.count; index++) {
    const route = routes[index % routes.length];
    const progress = (safePhase + Math.floor(index / routes.length) / Math.ceil(packets.count / routes.length)) % 1;
    dummy.position.set(
      route.start[0] + (route.end[0] - route.start[0]) * progress,
      route.start[1] + (route.end[1] - route.start[1]) * progress,
      route.start[2] + (route.end[2] - route.start[2]) * progress,
    );
    dummy.rotation.set(progress * TAU, progress * TAU * .7, 0);
    dummy.scale.setScalar(.72 + Math.sin(progress * Math.PI) * .45);
    dummy.updateMatrix();
    packets.mesh.setMatrixAt(index, dummy.matrix);
  }
  packets.mesh.instanceMatrix.needsUpdate = true;
}

function makeBeam(material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), material);
  mesh.frustumCulled = false;
  return mesh;
}

function updateBeam(mesh, start, end, radius) {
  tempVector.subVectors(end, start);
  const length = tempVector.length();
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, tempVector.normalize());
  mesh.scale.set(radius, length, radius);
}

function updateBeamPair(pair, start, end, outerRadius, coreRadius) {
  updateBeam(pair[0], start, end, outerRadius);
  updateBeam(pair[1], start, end, coreRadius);
}

function setInstance(mesh, index, position, quaternion, scale) {
  tempScale.setScalar(scale);
  tempMatrix.compose(position, quaternion, tempScale);
  mesh.setMatrixAt(index, tempMatrix);
}

export function createOrbitalModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'Orbital compute educational model';
  const anisotropy = Math.min(8, options.anisotropy || 4);
  const mobileTexture = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  let disposed = false;

  const solarTexture = makeSolarTexture();
  const foilTexture = makeFoilTexture();
  const radiatorTexture = makeRadiatorTexture();
  const glowTexture = makeGlowTexture();
  const streakTexture = makeStreakTexture();
  const cloudTexture = makeCloudTexture();
  const fallbackEarth = new THREE.DataTexture(new Uint8Array([12, 42, 68, 255]), 1, 1);
  fallbackEarth.colorSpace = THREE.SRGBColorSpace;
  fallbackEarth.needsUpdate = true;
  const sunDirection = new THREE.Vector3(-48, 62, 45).normalize();
  const texturePath = EARTH_TEXTURE_PATHS[mobileTexture ? 'mobile' : 'high'];
  new THREE.TextureLoader().load(new URL(texturePath, import.meta.url).href, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    if (disposed) {
      texture.dispose();
      return;
    }
    materials.earth.uniforms.dayMap.value = texture;
    fallbackEarth.dispose();
  }, undefined, () => {
    console.warn('FRONTIER ATLAS: Earth texture unavailable', texturePath);
  });

  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0xbac8ce, metalness: .84, roughness: .27 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x273946, metalness: .8, roughness: .32 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x718794, metalness: .88, roughness: .24 }),
    foil: new THREE.MeshStandardMaterial({ color: 0xd8ad60, map: foilTexture, metalness: .7, roughness: .38, side: THREE.DoubleSide }),
    solar: new THREE.MeshStandardMaterial({ color: 0x82b3dc, map: solarTexture, metalness: .54, roughness: .24, emissive: 0x0b2f54, emissiveIntensity: .32 }),
    radiator: new THREE.MeshStandardMaterial({ color: 0xe8f0f1, map: radiatorTexture, metalness: .2, roughness: .68, emissive: 0x5b1d0c, emissiveIntensity: .12 }),
    radiatorFin: new THREE.MeshStandardMaterial({ color: 0x9aabb3, metalness: .76, roughness: .29, emissive: 0x6b2410, emissiveIntensity: .15 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc98148, metalness: .82, roughness: .26 }),
    battery: new THREE.MeshStandardMaterial({ color: 0xbeb28d, metalness: .56, roughness: .43 }),
    compute: new THREE.MeshStandardMaterial({ color: 0x173b47, metalness: .4, roughness: .24, emissive: 0x36dcf3, emissiveIntensity: 1.25 }),
    optical: new THREE.MeshStandardMaterial({ color: 0x7edff0, metalness: .38, roughness: .18, emissive: 0x3acbe8, emissiveIntensity: 1.1 }),
    opticalLens: new THREE.MeshBasicMaterial({ color: 0x9af6ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending }),
    groundLens: new THREE.MeshBasicMaterial({ color: 0x9deeff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending }),
    thrusterGlow: new THREE.MeshBasicMaterial({ color: 0x6fcce5, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false }),
    dish: new THREE.MeshStandardMaterial({ color: 0xd0dde0, metalness: .7, roughness: .28, side: THREE.DoubleSide }),
    sun: new THREE.MeshBasicMaterial({ color: 0xffe6a4 }),
    earth: new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: fallbackEarth },
        sunDirection: { value: sunDirection.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          vec3 dayColor = texture2D(dayMap, vUv).rgb;
          float sunDot = dot(normal, normalize(sunDirection));
          float daylight = smoothstep(-0.16, 0.24, sunDot);
          float oceanMask = smoothstep(0.01, 0.12, dayColor.b - dayColor.r) * (1.0 - smoothstep(0.16, 0.42, dayColor.g));
          vec3 dayLit = dayColor * (0.18 + 1.35 * max(sunDot, 0.0));
          vec3 nightLit = dayColor * 0.022;
          vec3 color = mix(nightLit, dayLit, daylight);
          vec3 halfDirection = normalize(normalize(sunDirection) + viewDirection);
          float specular = pow(max(dot(normal, halfDirection), 0.0), 72.0) * oceanMask * daylight;
          color += vec3(0.32, 0.62, 0.92) * specular * 0.72;
          float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
          color += vec3(0.04, 0.28, 0.62) * fresnel * (0.16 + daylight * 0.84) * 0.52;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
    clouds: new THREE.MeshStandardMaterial({ map: cloudTexture, transparent: true, opacity: .52, depthWrite: false, roughness: 1 }),
    atmosphere: new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: sunDirection.clone() } },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 2.7);
          float sunlight = smoothstep(-0.38, 0.52, dot(normal, normalize(sunDirection)));
          vec3 color = mix(vec3(0.03, 0.16, 0.42), vec3(0.18, 0.68, 1.0), sunlight);
          gl_FragColor = vec4(color, fresnel * (0.2 + sunlight * 0.8) * 0.82);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    computeHalo: new THREE.MeshBasicMaterial({ color: 0x40dcf5, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    opticalHalo: new THREE.MeshBasicMaterial({ color: 0x54dcff, transparent: true, opacity: .04, blending: THREE.AdditiveBlending, depthWrite: false }),
    glowTexture,
    streakTexture,
  };

  const hero = makeHero(materials);
  hero.group.scale.setScalar(1);
  root.add(hero.group);
  const earth = makeEarth(materials);
  root.add(earth.group);
  const groundStation = makeGroundStation(materials);
  root.add(groundStation);
  const sun = makeSun(materials);
  root.add(sun);
  SATELLITE_LAYOUT.forEach((layout, index) => root.add(makeOrbitGuide(layout, .16 - index * .014)));

  const count = SATELLITE_LAYOUT.length;
  const relayBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.26, .8, 1.04), materials.foil, count);
  const relayFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(1.34, .1, 1.12), materials.frame, count * 2);
  const relayPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(.58, .06, 1.24), materials.solar, count * 6);
  const relayRadiators = new THREE.InstancedMesh(new THREE.BoxGeometry(.82, .065, 1.02), materials.radiator, count * 2);
  const relayFins = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .08, .96), materials.radiatorFin, count * 8);
  const relayOptics = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .13, .28, 10), materials.optical, count);
  const relayLenses = new THREE.InstancedMesh(new THREE.SphereGeometry(.085, 10, 7), materials.opticalLens, count);
  const relayAntennaGeometry = new THREE.SphereGeometry(.28, 12, 6, 0, TAU, 0, Math.PI / 2);
  relayAntennaGeometry.scale(1, .32, 1);
  const relayAntennaDish = new THREE.InstancedMesh(relayAntennaGeometry, materials.dish, count);
  const relayAntennaMast = new THREE.InstancedMesh(new THREE.CylinderGeometry(.022, .03, .26, 6), materials.steel, count);
  const relayThrusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(.065, .115, .2, 8, 1, true), materials.darkSteel, count * 4);
  const relayCompute = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .22, .08), materials.compute, count);
  const relayMeshes = [relayBody, relayFrame, relayPanels, relayRadiators, relayFins, relayOptics, relayLenses, relayAntennaDish, relayAntennaMast, relayThrusters, relayCompute];
  for (const mesh of relayMeshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  const beamMaterials = {
    power: new THREE.MeshBasicMaterial({ color: 0xffcb72, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    opticalOuter: new THREE.MeshBasicMaterial({ color: 0x55dfff, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    opticalCore: new THREE.MeshBasicMaterial({ color: 0xb9f8ff, transparent: true, opacity: .56, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    downlinkOuter: new THREE.MeshBasicMaterial({ color: 0x87adff, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    downlinkCore: new THREE.MeshBasicMaterial({ color: 0xd1ddff, transparent: true, opacity: .62, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  const powerBeams = Array.from({ length: 4 }, () => makeBeam(beamMaterials.power));
  const opticalBeams = Array.from({ length: SATELLITE_LAYOUT.length }, () => [makeBeam(beamMaterials.opticalOuter), makeBeam(beamMaterials.opticalCore)]);
  const downlinkBeam = [makeBeam(beamMaterials.downlinkOuter), makeBeam(beamMaterials.downlinkCore)];
  root.add(...powerBeams, ...opticalBeams.flat(), ...downlinkBeam);

  const flows = {
    power: makeFlowParticles(44, 0xffd27d, .28),
    optical: makeFlowParticles(52, 0x8df3ff, .26),
    downlink: makeFlowParticles(22, 0xb5c8ff, .29),
  };
  const packets = {
    power: makePackets(14, 0xffd88d, .22),
    optical: makePackets(22, 0x9af7ff, .2),
    downlink: makePackets(10, 0xc4d2ff, .24),
  };
  root.add(flows.power.points, flows.optical.points, flows.downlink.points, packets.power.mesh, packets.optical.mesh, packets.downlink.mesh);

  const heatRandom = seededRandom(919);
  const heatCount = 140;
  const heatPositions = new Float32Array(heatCount * 3);
  const heatColors = new Float32Array(heatCount * 3);
  const heatSeeds = Array.from({ length: heatCount }, (_, index) => {
    const color = new THREE.Color().setHSL(.025 + (index % 6) * .012, .96, .56 + (index % 3) * .08);
    heatColors[index * 3] = color.r;
    heatColors[index * 3 + 1] = color.g;
    heatColors[index * 3 + 2] = color.b;
    return { x: (heatRandom() - .5) * 2.35, z: (heatRandom() > .5 ? 1 : -1) * (1.65 + heatRandom() * 1.65), offset: heatRandom(), drift: (heatRandom() - .5) * .72 };
  });
  const heatGeometry = new THREE.BufferGeometry();
  heatGeometry.setAttribute('position', new THREE.BufferAttribute(heatPositions, 3));
  heatGeometry.setAttribute('color', new THREE.BufferAttribute(heatColors, 3));
  const heatMaterial = new THREE.PointsMaterial({ size: .18, vertexColors: true, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false });
  const heatPoints = new THREE.Points(heatGeometry, heatMaterial);
  heatPoints.frustumCulled = false;
  heatPoints.userData.fullCount = heatCount;
  hero.group.add(heatPoints);

  let quality = 2;
  let presentation = { mode: 'overall', hotspot: null };
  let motionScale = 1;

  function anchor(id, state) {
    hero.group.position.set(...state.hero.position);
    hero.group.rotation.set(...state.hero.rotation);
    hero.group.updateMatrixWorld(true);
    groundStation.updateMatrixWorld(true);
    const local = {
      solar: [-4.8, .12, .3],
      'solar-right': [4.8, .12, .3],
      chip: [0, -.05, 1.75],
      optical: [.88, 1.28, .18],
      radiator: [1.15, .72, 3.15],
      ground: [0, 1.6, 0],
    }[id] || [0, 0, 0];
    const target = id === 'ground' ? groundStation : hero.group;
    return target.localToWorld(new THREE.Vector3(...local));
  }

  function placeRelayPart(mesh, index, satellitePosition, satelliteQuaternion, satelliteScale, localPosition, localRotation = [0, 0, 0], partScale = 1) {
    tempVectorC.set(...localPosition).applyQuaternion(satelliteQuaternion).multiplyScalar(satelliteScale).add(satellitePosition);
    tempQuaternionB.setFromEuler(new THREE.Euler(...localRotation));
    tempQuaternionC.copy(satelliteQuaternion).multiply(tempQuaternionB);
    setInstance(mesh, index, tempVectorC, tempQuaternionC, satelliteScale * partScale);
  }

  function updateRelays(state) {
    state.satellites.forEach((satellite, index) => {
      tempQuaternion.setFromEuler(new THREE.Euler(...satellite.rotation));
      tempVector.set(...satellite.position);
      const scale = satellite.scale;
      placeRelayPart(relayBody, index, tempVector, tempQuaternion, scale, [0, 0, 0]);
      placeRelayPart(relayFrame, index * 2, tempVector, tempQuaternion, scale, [0, .43, 0]);
      placeRelayPart(relayFrame, index * 2 + 1, tempVector, tempQuaternion, scale, [0, -.43, 0]);
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex === 0 ? -1 : 1;
        for (let segment = 0; segment < 3; segment++) {
          placeRelayPart(relayPanels, index * 6 + sideIndex * 3 + segment, tempVector, tempQuaternion, scale, [side * (.75 + segment * .62), .03, 0]);
        }
      }
      placeRelayPart(relayRadiators, index * 2, tempVector, tempQuaternion, scale, [0, .48, -.68]);
      placeRelayPart(relayRadiators, index * 2 + 1, tempVector, tempQuaternion, scale, [0, .48, .68]);
      for (let fin = 0; fin < 4; fin++) {
        placeRelayPart(relayFins, index * 8 + fin, tempVector, tempQuaternion, scale, [-.28 + fin * .185, .54, -.68]);
        placeRelayPart(relayFins, index * 8 + fin + 4, tempVector, tempQuaternion, scale, [-.28 + fin * .185, .54, .68]);
      }
      placeRelayPart(relayOptics, index, tempVector, tempQuaternion, scale, [0, .58, .08], [Math.PI / 2, 0, 0]);
      placeRelayPart(relayLenses, index, tempVector, tempQuaternion, scale, [0, .58, .25]);
      placeRelayPart(relayAntennaMast, index, tempVector, tempQuaternion, scale, [0, .55, -.34]);
      placeRelayPart(relayAntennaDish, index, tempVector, tempQuaternion, scale, [0, .79, -.34], [Math.PI, 0, 0]);
      placeRelayPart(relayCompute, index, tempVector, tempQuaternion, scale, [0, -.02, .55]);
      for (let thruster = 0; thruster < 4; thruster++) {
        placeRelayPart(relayThrusters, index * 4 + thruster, tempVector, tempQuaternion, scale, [thruster % 2 ? .43 : -.43, -.48, thruster < 2 ? -.34 : .34]);
      }
    });
    for (const mesh of relayMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  function updateHeat(state) {
    const phase = motionScale ? state.flows.heat : .18;
    heatSeeds.forEach((seed, index) => {
      const progress = (phase + seed.offset) % 1;
      const offset = index * 3;
      heatPositions[offset] = seed.x + seed.drift * progress;
      heatPositions[offset + 1] = .78 + progress * 3.1;
      heatPositions[offset + 2] = seed.z + Math.sin(progress * Math.PI) * .15;
    });
    heatGeometry.attributes.position.needsUpdate = true;
  }

  function update(state, nextPresentation = presentation, delta = 0) {
    presentation = nextPresentation;
    motionScale = Number.isFinite(delta) && delta >= 0 ? (presentation.reducedMotion ? 0 : 1) : 1;
    hero.group.position.set(...state.hero.position);
    hero.group.rotation.set(...state.hero.rotation);
    earth.surface.rotation.y = EARTH_ROTATION;
    earth.clouds.rotation.y = EARTH_ROTATION + .2;
    materials.earth.uniforms.sunDirection.value.copy(sun.position).sub(earth.group.position).normalize();
    materials.atmosphere.uniforms.sunDirection.value.copy(materials.earth.uniforms.sunDirection.value);
    hero.group.updateMatrixWorld(true);
    updateRelays(state);

    const solarLeft = anchor('solar', state);
    const solarRight = anchor('solar-right', state);
    const optical = anchor('optical', state);
    const ground = anchor('ground', state);
    const relayTargets = state.satellites.map(satellite => new THREE.Vector3(...satellite.position));
    const powerRoutes = [
      { start: sun.position.toArray(), end: solarLeft.toArray() },
      { start: sun.position.toArray(), end: solarRight.toArray() },
      { start: sun.position.toArray(), end: relayTargets[0].toArray() },
      { start: sun.position.toArray(), end: relayTargets[1].toArray() },
    ];
    const opticalRoutes = relayTargets.map(end => ({ start: optical.toArray(), end: end.toArray() }));
    const downlinkRoutes = [{ start: optical.toArray(), end: ground.toArray() }];

    powerRoutes.forEach((route, index) => updateBeam(powerBeams[index], new THREE.Vector3(...route.start), new THREE.Vector3(...route.end), .075));
    opticalBeams.forEach((pair, index) => updateBeamPair(pair, optical, relayTargets[index], .11, .028));
    updateBeamPair(downlinkBeam, optical, ground, .12, .035);
    updateFlow(flows.power, powerRoutes, state.flows.power, motionScale);
    updateFlow(flows.optical, opticalRoutes, state.flows.optical, motionScale);
    updateFlow(flows.downlink, downlinkRoutes, state.flows.downlink, motionScale);
    updatePackets(packets.power, powerRoutes, state.flows.power, motionScale);
    updatePackets(packets.optical, opticalRoutes, state.flows.optical, motionScale);
    updatePackets(packets.downlink, downlinkRoutes, state.flows.downlink, motionScale);
    updateHeat(state);

    const mode = presentation.mode || 'overall';
    const selected = presentation.hotspot;
    const powerWeight = modeWeight(mode, 'power', selected === 'solar');
    const linkWeight = modeWeight(mode, 'link', selected === 'optical' || selected === 'ground');
    const coolingWeight = modeWeight(mode, 'cooling', selected === 'radiator');
    const computeWeight = modeWeight(mode, 'compute', selected === 'chip');
    const pulse = .78 + Math.sin((motionScale ? state.flows.compute : .2) * TAU) * .22;
    materials.solar.emissiveIntensity = .12 + powerWeight * .42;
    materials.compute.emissiveIntensity = .35 + computeWeight * pulse * .95;
    materials.optical.emissiveIntensity = .3 + linkWeight * .85;
    materials.opticalLens.opacity = Math.min(1, .55 + linkWeight * .26);
    materials.radiator.emissiveIntensity = .04 + coolingWeight * .42;
    materials.radiatorFin.emissiveIntensity = .04 + coolingWeight * .31;
    materials.computeHalo.opacity = .015 + computeWeight * .065;
    materials.opticalHalo.opacity = .01 + linkWeight * .07;
    beamMaterials.power.opacity = .014 + powerWeight * .06;
    beamMaterials.opticalOuter.opacity = .025 + linkWeight * .08;
    beamMaterials.opticalCore.opacity = Math.min(1, .18 + linkWeight * .36);
    beamMaterials.downlinkOuter.opacity = .03 + linkWeight * .09;
    beamMaterials.downlinkCore.opacity = Math.min(1, .22 + linkWeight * .38);
    flows.power.points.material.opacity = Math.min(1, .28 + powerWeight * .45);
    flows.optical.points.material.opacity = Math.min(1, .25 + linkWeight * .55);
    flows.downlink.points.material.opacity = Math.min(1, .3 + linkWeight * .5);
    for (const key of Object.keys(packets)) packets[key].mesh.material.opacity = Math.min(1, .3 + ({ power: powerWeight, optical: linkWeight, downlink: linkWeight }[key]) * .45);
    heatMaterial.opacity = Math.min(1, .16 + coolingWeight * .62);
    hero.radiators.forEach(radiator => { radiator.edge.material.opacity = Math.min(1, .18 + coolingWeight * .65); });
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, level));
    const fraction = [.36, .56, .78, 1][quality];
    heatGeometry.setDrawRange(0, Math.floor(heatCount * fraction));
    for (const flow of Object.values(flows)) flow.points.geometry.setDrawRange(0, Math.floor(flow.count * fraction));
    for (const packet of Object.values(packets)) packet.mesh.count = Math.max(1, Math.floor(packet.count * fraction));
  }

  function setPresentation(next) {
    presentation = { ...presentation, ...next };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (materials.earth.uniforms.dayMap.value === fallbackEarth) fallbackEarth.dispose();
  }

  return {
    root,
    update,
    anchor,
    setQuality,
    setPresentation,
    dispose,
    counts: Object.freeze({
      satellites: count,
      solarPanels: 6,
      relaySolarPanels: count * 6,
      computeChips: 18,
      radiators: 2,
      antennas: 1,
      thrusters: 4,
      instancedSystems: relayMeshes.length,
      earthSegments: [128, 64],
    }),
    get quality() { return quality; },
    get presentation() { return presentation; },
    get hotspotIds() { return Object.keys(HOTSPOTS); },
  };
}
