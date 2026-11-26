import * as THREE from 'three';
import { GROUND_Y } from './mission-state.mjs';
import { STARSHIP_MODEL_STATS, FLAP_LAYOUT, PAYLOAD_LAYOUT, BODY_RADIUS } from './starship-model-spec.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function randomSource(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function steelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, '#aab4bb');
  gradient.addColorStop(.22, '#e7ecef');
  gradient.addColorStop(.52, '#b9c3ca');
  gradient.addColorStop(.78, '#dce3e7');
  gradient.addColorStop(1, '#8e9aa3');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 512);
  const random = randomSource(71);
  for (let index = 0; index < 900; index++) {
    const shade = random() > .5 ? 255 : 20;
    context.strokeStyle = `rgba(${shade},${shade},${shade},${.012 + random() * .035})`;
    context.lineWidth = .3 + random() * .7;
    const x = random() * 256;
    const y = random() * 512;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - .5) * 2, y + 8 + random() * 80);
    context.stroke();
  }
  for (let y = 0; y < 512; y += 64) {
    context.fillStyle = 'rgba(25,36,45,.13)';
    context.fillRect(0, y, 256, 1);
    context.fillStyle = 'rgba(255,255,255,.08)';
    context.fillRect(0, y + 1, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 5);
  texture.anisotropy = 4;
  return texture;
}

function cylinder(parent, radiusTop, radiusBottom, height, y, material, segments = 64, open = true) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open),
    material,
  );
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ring(parent, radius, y, material, thickness = .035) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 64), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seamLines(parent, bottom, top, radius, material) {
  const points = [];
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * TAU;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    points.push(x, bottom, z, x, top, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, material);
  parent.add(lines);
  return lines;
}

function makeTank(parent, bottom, top, radius, material, deckMaterial) {
  const group = new THREE.Group();
  const height = top - bottom;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 40, 1, false), material);
  body.position.y = (bottom + top) / 2;
  body.receiveShadow = true;
  group.add(body);

  const upperDome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 12, 0, TAU, 0, Math.PI / 2), material);
  upperDome.scale.y = .32;
  upperDome.position.y = top;
  group.add(upperDome);
  const lowerDome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 12, 0, TAU, Math.PI / 2, Math.PI / 2), material);
  lowerDome.scale.y = .32;
  lowerDome.position.y = bottom;
  group.add(lowerDome);

  ring(group, radius * .98, bottom, deckMaterial, .07);
  ring(group, radius * .98, top, deckMaterial, .07);
  parent.add(group);
  return group;
}

function engineBellGeometry(radius, length) {
  const profile = [
    [.25, 0], [.29, -.07], [.34, -.25], [.46, .52], [.62, .76], [.82, .92], [1, 1],
  ];
  return new THREE.LatheGeometry(
    profile.reverse().map(([r, y]) => new THREE.Vector2(r * radius, y * length)),
    24,
  );
}

function makeEngine(parent, options, plumeGeometry, plumeMaterial, glowMaterial) {
  const { x, z, deckY, radius, length } = options;
  const group = new THREE.Group();
  group.position.set(x, deckY, z);

  const bell = new THREE.Mesh(engineBellGeometry(radius, length), options.material);
  bell.castShadow = true;
  group.add(bell);
  const inner = new THREE.Mesh(engineBellGeometry(radius * .88, length * .96), options.innerMaterial);
  inner.position.y = -.035;
  group.add(inner);
  const mount = new THREE.Mesh(new THREE.TorusGeometry(radius * .34, .055, 6, 20), options.rimMaterial);
  mount.rotation.x = Math.PI / 2;
  mount.position.y = -.12;
  group.add(mount);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * .98, .045, 5, 24), options.rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -length;
  group.add(rim);

  const glow = new THREE.Mesh(new THREE.CircleGeometry(radius * .7, 20), glowMaterial);
  glow.rotation.x = Math.PI / 2;
  glow.position.y = -length + .035;
  group.add(glow);

  const plume = new THREE.Mesh(plumeGeometry, plumeMaterial);
  plume.frustumCulled = false;
  group.add(plume);
  parent.add(group);
  return { group, plume, glow, radius, length, vacuum: Boolean(options.vacuum) };
}

function makeGridFin(material) {
  const group = new THREE.Group();
  const barBetween = (a, b, thickness = .1) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, Math.hypot(dx, dy), .14), material);
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    mesh.castShadow = true;
    group.add(mesh);
  };
  const outline = [[0, -.85], [2.35, -1.18], [2.62, -.55], [2.38, .55], [0, .85]];
  for (let index = 0; index < outline.length; index++) barBetween(outline[index], outline[(index + 1) % outline.length], .13);
  for (let index = 1; index <= 5; index++) {
    const t = index / 6;
    const x = 2.5 * t;
    barBetween([x, -.85 - .33 * t], [x, .85 - .3 * t], .065);
  }
  for (const y of [-.42, .05, .48]) barBetween([.12, y], [2.32, y - .12], .065);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.65, 10), material);
  hinge.position.set(.06, 0, 0);
  group.add(hinge);
  return group;
}

function makeFlapAssembly(kind, material, edgeMaterial, hingeMaterial) {
  const layout = FLAP_LAYOUT[kind];
  const { height, extension, thickness } = layout;
  const shape = new THREE.Shape();
  if (kind === 'aft') {
    shape.moveTo(0, -height / 2);
    shape.lineTo(extension * .82, -height * .34);
    shape.quadraticCurveTo(extension * 1.04, 0, extension * .82, height * .34);
    shape.lineTo(0, height / 2);
  } else {
    shape.moveTo(0, -height / 2);
    shape.lineTo(extension * .68, -height * .4);
    shape.quadraticCurveTo(extension * 1.04, -height * .08, extension * .78, height * .3);
    shape.lineTo(0, height / 2);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: kind === 'aft' ? .03 : .018,
    bevelThickness: kind === 'aft' ? .03 : .018,
  });
  geometry.translate(0, 0, -thickness / 2);

  const mount = new THREE.Group();
  mount.position.set(layout.mountRadius, layout.y, 0);
  mount.rotation.y = layout.angle;
  const axis = new THREE.Group();
  axis.position.z = layout.leewardOffset;
  axis.rotation.z = layout.hingeTilt;
  mount.add(axis);
  const panel = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edgeMaterial));
  panel.add(mesh);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, height * .72, 10), hingeMaterial);
  hinge.position.set(.02, 0, 0);
  axis.add(hinge);
  const reinforcement = new THREE.Mesh(new THREE.BoxGeometry(.42, height * .52, thickness + .12), hingeMaterial);
  reinforcement.position.set(.2, 0, 0);
  axis.add(reinforcement);
  const aerocover = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 8), hingeMaterial);
  aerocover.scale.set(1.45, height * .36, .72);
  aerocover.position.set(.18, 0, 0);
  axis.add(aerocover);

  const wireGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(.18, height * .32, thickness / 2 + .04),
    new THREE.Vector3(extension * .68, 0, thickness / 2 + .04),
  ]);
  panel.add(new THREE.Line(wireGeometry, new THREE.LineBasicMaterial({ color: 0xc7b98f, transparent: true, opacity: .8 })));
  axis.add(panel);
  mount.userData.kind = kind;
  mount.userData.phase = kind === 'aft' ? 0 : 1.7;
  return { group: mount, panel, axis, kind };
}

function makeTileMesh(material) {
  const matrices = [];
  const { centerAngle, halfAngle } = STARSHIP_MODEL_STATS.tiles;
  const isWindward = angle => {
    const difference = Math.atan2(Math.sin(angle - centerAngle), Math.cos(angle - centerAngle));
    return Math.abs(difference) <= halfAngle;
  };
  const dummy = new THREE.Object3D();
  const addTile = (position, normal) => {
    dummy.position.copy(position);
    dummy.quaternion.setFromUnitVectors(UP, normal.clone().normalize());
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  };

  for (let row = 0; row < 31; row++) {
    const y = 4.25 + row * .89;
    const columns = 40;
    for (let column = 0; column < columns; column++) {
      const angle = (column + (row % 2) * .5) / columns * TAU;
      if (!isWindward(angle)) continue;
      const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      addTile(normal.clone().multiplyScalar(4.555).setY(y), normal);
    }
  }

  for (let row = 0; row < 11; row++) {
    const y = 38.7 + row * 1.02;
    const t = (y - 32) / 18;
    const radius = 4.5 * Math.pow(1 - t, .72) + .04;
    const derivative = -4.5 * .72 / 18 * Math.pow(1 - t, -.28);
    const columns = Math.max(5, Math.round(TAU * radius / .72));
    for (let column = 0; column < columns; column++) {
      const angle = (column + (row % 2) * .5) / columns * TAU;
      if (!isWindward(angle)) continue;
      const normal = new THREE.Vector3(Math.sin(angle), -derivative, Math.cos(angle)).normalize();
      addTile(new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius), normal);
    }
  }

  const geometry = new THREE.CylinderGeometry(.355, .355, .055, 6, 1, false);
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  mesh.userData.fullCount = matrices.length;
  mesh.userData.coverage = STARSHIP_MODEL_STATS.tiles.coverage;
  mesh.userData.windward = true;
  return mesh;
}

function makeExhaustParticles(parent, startY, count, material) {
  const random = randomSource(count + 91);
  const seeds = Array.from({ length: count }, () => ({
    angle: random() * TAU,
    radius: random() * 3.8,
    speed: 16 + random() * 23,
    offset: random() * 44,
  }));
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  parent.add(points);
  return { points, positions, seeds, startY };
}

export function createStarshipModel() {
  const root = new THREE.Group();
  root.name = 'Starship educational model';
  root.userData.groundY = GROUND_Y;
  const booster = new THREE.Group();
  booster.name = 'Super Heavy';
  const ship = new THREE.Group();
  ship.name = 'Starship upper stage';
  root.add(booster, ship);

  const map = steelTexture();
  const steel = new THREE.MeshStandardMaterial({ color: 0xe8edf0, map, metalness: STARSHIP_MODEL_STATS.steel.metalness, roughness: STARSHIP_MODEL_STATS.steel.roughness });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x39434c, metalness: .72, roughness: .34 });
  const ringSteel = new THREE.MeshStandardMaterial({ color: 0x8e9aa3, metalness: .78, roughness: .29 });
  const bellInner = new THREE.MeshStandardMaterial({ color: 0x151d25, metalness: .58, roughness: .42, side: THREE.BackSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x10161d, metalness: .16, roughness: .88 });
  const tile = new THREE.MeshStandardMaterial({ color: 0x151b22, metalness: .08, roughness: .92 });
  const seamMaterial = new THREE.LineBasicMaterial({ color: 0x1e2a33, transparent: true, opacity: .48 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8899a4, transparent: true, opacity: .7 });
  const oxidizer = new THREE.MeshStandardMaterial({ color: 0x3a9fc8, emissive: 0x082c42, metalness: .15, roughness: .25, transparent: true, opacity: .78 });
  const methane = new THREE.MeshStandardMaterial({ color: 0xc78c42, emissive: 0x3a1e07, metalness: .12, roughness: .3, transparent: true, opacity: .76 });
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0xb47c4c, metalness: .8, roughness: .3 });
  const plumeMaterial = new THREE.MeshBasicMaterial({
    color: 0x69c9ff,
    transparent: true,
    opacity: .52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const boosterGlow = new THREE.MeshBasicMaterial({ color: 0x9de5ff, transparent: true, opacity: .9 });
  const shipGlow = boosterGlow.clone();
  shipGlow.color.set(0xb9e9ff);
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x8bd8ff,
    size: .24,
    transparent: true,
    opacity: .38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const shellMaterials = [steel, tile];
  const explodedParts = [];
  const engines = { booster: [], ship: [] };
  const forwardFlaps = [];
  const aftFlaps = [];
  const fins = [];

  // Super Heavy: cylindrical barrel, engine skirt, tank deck and hot-stage interface.
  cylinder(booster, 4.5, 4.5, 60, 38, steel);
  cylinder(booster, 4.5, 4.24, 5.2, 5.55, steel);
  cylinder(booster, 4.42, 4.42, 2.3, 69.6, darkSteel, 64, false);
  cylinder(booster, 4.12, 4.12, .65, 5.2, darkSteel, 64, false);
  for (let y = 10; y <= 67; y += 4.25) ring(booster, 4.515, y, ringSteel, y % 8.5 < 1 ? .055 : .032);
  seamLines(booster, 8.2, 67.8, 4.512, seamMaterial);

  const boosterTanks = new THREE.Group();
  makeTank(boosterTanks, 11, 40.5, 4.05, methane, darkSteel);
  makeTank(boosterTanks, 42, 67, 4.05, oxidizer, darkSteel);
  cylinder(boosterTanks, 4.08, 4.08, .22, 41.2, darkSteel, 48, false);
  booster.add(boosterTanks);
  explodedParts.push({ object: boosterTanks, base: boosterTanks.position.clone(), offset: new THREE.Vector3(-7, 0, 0) });

  // Starship: main barrel, split ogive nose and a real payload-bay opening.
  cylinder(ship, 4.5, 4.5, 29, 17.5, steel);
  const profileBetween = (bottom, top, steps = 18) => {
    const points = [];
    for (let index = 0; index <= steps; index++) {
      const y = bottom + (top - bottom) * index / steps;
      const t = (y - 32) / 18;
      points.push(new THREE.Vector2(4.5 * Math.pow(1 - t, .72) + .015, y));
    }
    return points;
  };
  const lowerNoseProfile = profileBetween(32, PAYLOAD_LAYOUT.doorTop, 12);
  const upperNoseProfile = profileBetween(PAYLOAD_LAYOUT.doorTop, 50, 20);
  const remainingHalf = Math.PI / 2 - PAYLOAD_LAYOUT.doorHalfAngle;
  for (const start of [-remainingHalf, Math.PI - remainingHalf]) {
    const shell = new THREE.Mesh(new THREE.LatheGeometry(lowerNoseProfile, 28, start, remainingHalf * 2), steel);
    shell.castShadow = true;
    shell.receiveShadow = true;
    ship.add(shell);
  }
  const nose = new THREE.Mesh(new THREE.LatheGeometry(upperNoseProfile, 64), steel);
  nose.castShadow = true;
  nose.receiveShadow = true;
  ship.add(nose);

  const payloadDoors = [];
  for (const side of [-1, 1]) {
    const center = side > 0 ? Math.PI / 2 : Math.PI * 1.5;
    const geometry = new THREE.LatheGeometry(lowerNoseProfile, 24, center - PAYLOAD_LAYOUT.doorHalfAngle, PAYLOAD_LAYOUT.doorHalfAngle * 2);
    const door = new THREE.Group();
    const panel = new THREE.Mesh(geometry, steel);
    panel.castShadow = true;
    panel.receiveShadow = true;
    panel.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), edgeMaterial));
    door.add(panel);
    door.userData.side = side;
    ship.add(door);
    payloadDoors.push(door);
  }
  for (let y = 4; y <= 31; y += 3.4) ring(ship, 4.515, y, ringSteel, .03);
  seamLines(ship, 3.2, 31.8, 4.512, seamMaterial);

  const shipTanks = new THREE.Group();
  makeTank(shipTanks, 4.2, 15.6, 4.04, methane, darkSteel);
  makeTank(shipTanks, 17, 30.8, 4.04, oxidizer, darkSteel);
  cylinder(shipTanks, 4.08, 4.08, .24, 16.25, darkSteel, 48, false);
  for (const x of [-2.65, 2.65]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, 24, 10), pipeMaterial);
    pipe.position.set(x, 18, 1.8);
    shipTanks.add(pipe);
  }
  ship.add(shipTanks);
  explodedParts.push({ object: shipTanks, base: shipTanks.position.clone(), offset: new THREE.Vector3(7, 0, 0) });

  const tileMesh = makeTileMesh(tile);
  ship.add(tileMesh);

  const hotstage = new THREE.Group();
  cylinder(hotstage, 4.56, 4.56, 1.4, 1.05, darkSteel);
  ring(hotstage, 4.59, .34, ringSteel, .075);
  ring(hotstage, 4.59, 1.77, ringSteel, .075);
  const ventGeometry = new THREE.BoxGeometry(.52, .58, .14);
  const vents = new THREE.InstancedMesh(ventGeometry, black, 28);
  const ventDummy = new THREE.Object3D();
  for (let index = 0; index < 28; index++) {
    const angle = index / 28 * TAU;
    ventDummy.position.set(Math.sin(angle) * 4.59, 1.06, Math.cos(angle) * 4.59);
    ventDummy.rotation.set(0, angle, 0);
    ventDummy.updateMatrix();
    vents.setMatrixAt(index, ventDummy.matrix);
  }
  vents.instanceMatrix.needsUpdate = true;
  hotstage.add(vents);
  ship.add(hotstage);
  explodedParts.push({ object: hotstage, base: hotstage.position.clone(), offset: new THREE.Vector3(0, 2.8, 0) });

  const bayFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, .16, 40),
    new THREE.MeshStandardMaterial({ color: 0x111820, metalness: .25, roughness: .78 }),
  );
  bayFloor.position.y = 32.15;
  ship.add(bayFloor);

  const payload = new THREE.Group();
  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 5.6, 2.5),
    new THREE.MeshStandardMaterial({ color: 0xa88948, metalness: .72, roughness: .38 }),
  );
  bus.position.y = 38.5;
  bus.castShadow = true;
  payload.add(bus);

  const dispenser = new THREE.Group();
  const dispenserBody = new THREE.Mesh(new THREE.BoxGeometry(.52, 4.8, 1.55), darkSteel);
  dispenserBody.position.set(1.58, 38.5, 0);
  dispenser.add(dispenserBody);
  for (const y of [36.9, 38.5, 40.1]) {
    const satellite = new THREE.Mesh(new THREE.CylinderGeometry(.32, .38, .9, 12), ringSteel);
    satellite.position.set(1.6, y, .82);
    dispenser.add(satellite);
  }
  payload.add(dispenser);

  const solarMaterial = new THREE.MeshStandardMaterial({ color: 0x174e78, metalness: .55, roughness: .34, emissive: 0x061b2c });
  const solarWings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * PAYLOAD_LAYOUT.wingRoot, PAYLOAD_LAYOUT.wingY, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(PAYLOAD_LAYOUT.wingLength, .1, PAYLOAD_LAYOUT.wingWidth), solarMaterial);
    panel.position.x = side * PAYLOAD_LAYOUT.wingLength / 2;
    wing.add(panel);
    for (let index = 1; index < 5; index++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.03, .12, PAYLOAD_LAYOUT.wingWidth + .02), ringSteel);
      stripe.position.x = side * PAYLOAD_LAYOUT.wingLength * index / 5;
      wing.add(stripe);
    }
    wing.rotation.z = side * Math.PI / 2;
    payload.add(wing);
    solarWings.push({ wing, side });
  }
  ship.add(payload);
  explodedParts.push({ object: payload, base: payload.position.clone(), offset: new THREE.Vector3(7.5, 4, 0) });

  // Four grid fins near the top of the booster.
  for (let index = 0; index < 4; index++) {
    const fin = makeGridFin(darkSteel);
    fin.position.set(4.4, 61.5, 0);
    fin.rotation.y = index * Math.PI / 2;
    fin.userData.baseY = fin.rotation.y;
    booster.add(fin);
    fins.push(fin);
  }

  // Two aft flaps and two thinner, swept forward flaps offset toward leeward.
  for (const [kind, list] of [['aft', aftFlaps], ['forward', forwardFlaps]]) {
    for (let index = 0; index < FLAP_LAYOUT[kind].count; index++) {
      const flap = makeFlapAssembly(kind, black, edgeMaterial, ringSteel);
      flap.group.rotation.y = FLAP_LAYOUT[kind].angle + index * FLAP_LAYOUT[kind].step;
      flap.group.userData.baseY = flap.group.rotation.y;
      ship.add(flap.group);
      list.push(flap);
    }
  }

  const plumeGeometry = new THREE.CylinderGeometry(.62, .075, 1, 12, 1, true);
  const addEngine = (stage, options) => {
    engines[stage].push(makeEngine(stage === 'booster' ? booster : ship, { ...options, innerMaterial: bellInner }, plumeGeometry, plumeMaterial, stage === 'booster' ? boosterGlow : shipGlow));
  };

  // 20 outer + 13 inner Raptor-like engine bells on Super Heavy.
  for (let index = 0; index < 20; index++) {
    const angle = index / 20 * TAU;
    addEngine('booster', { x: Math.sin(angle) * 3.43, z: Math.cos(angle) * 3.43, deckY: 5.2, radius: .61, length: 2.45, material: darkSteel, rimMaterial: ringSteel });
  }
  addEngine('booster', { x: 0, z: 0, deckY: 5.2, radius: .73, length: 2.65, material: darkSteel, rimMaterial: ringSteel });
  for (const [radius, count] of [[1.42, 6], [2.58, 6]]) {
    for (let index = 0; index < count; index++) {
      const angle = index / count * TAU + Math.PI / 6;
      addEngine('booster', { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, deckY: 5.2, radius: .73, length: 2.65, material: darkSteel, rimMaterial: ringSteel });
    }
  }

  // Three larger vacuum bells + three sea-level-like bells on Starship.
  for (let index = 0; index < 3; index++) {
    const angle = index / 3 * TAU;
    addEngine('ship', { x: Math.sin(angle) * 2.72, z: Math.cos(angle) * 2.72, deckY: 2.8, radius: 1.08, length: 3.12, material: darkSteel, rimMaterial: ringSteel, vacuum: true });
  }
  for (let index = 0; index < 3; index++) {
    const angle = index / 3 * TAU + Math.PI / 3;
    addEngine('ship', { x: Math.sin(angle) * 1.35, z: Math.cos(angle) * 1.35, deckY: 2.8, radius: .66, length: 2.4, material: darkSteel, rimMaterial: ringSteel });
  }
  cylinder(ship, 3.9, 3.9, .45, 2.8, darkSteel, 48, false);

  const boosterParticles = makeExhaustParticles(booster, 2.4, 190, particleMaterial);
  const shipParticleMaterial = particleMaterial.clone();
  shipParticleMaterial.color.set(0xb7e7ff);
  const shipParticles = makeExhaustParticles(ship, -.1, 120, shipParticleMaterial);

  let section = false;
  let exploded = false;
  let explodeBlend = 0;
  let quality = 2;

  function setDisplayMode(next = {}) {
    section = Boolean(next.section);
    exploded = Boolean(next.exploded);
    for (const material of shellMaterials) {
      material.transparent = section;
      material.opacity = section ? (material === tile ? .2 : .17) : 1;
      material.depthWrite = !section;
      material.needsUpdate = true;
    }
  }

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, level));
    tileMesh.count = Math.max(420, Math.floor(tileMesh.userData.fullCount * [.5, .68, .88, 1][quality]));
  }

  function updateEngines(list, power, clock, glowMaterial) {
    for (let index = 0; index < list.length; index++) {
      const engine = list[index];
      const flicker = .93 + Math.sin(clock * 41 + index * 1.71) * .07;
      const length = (engine.vacuum ? 12 : 7.5) * Math.max(0, power) * flicker;
      engine.plume.visible = power > .015;
      engine.plume.scale.set(engine.radius / .62 * (1 + Math.sin(clock * 29 + index) * .035), Math.max(.001, length), engine.radius / .62);
      engine.plume.position.y = -engine.length - length / 2;
      engine.glow.visible = power > .015;
    }
    glowMaterial.opacity = .25 + power * .75;
  }

  function updateParticles(system, power, clock) {
    system.points.visible = power > .04;
    system.points.material.opacity = .12 + power * .32;
    for (let index = 0; index < system.seeds.length; index++) {
      const seed = system.seeds[index];
      const life = ((clock * seed.speed + seed.offset) % 44) / 44;
      const radius = seed.radius * (.45 + life * 1.8);
      system.positions[index * 3] = Math.cos(seed.angle) * radius;
      system.positions[index * 3 + 1] = system.startY - life * 42;
      system.positions[index * 3 + 2] = Math.sin(seed.angle) * radius;
    }
    system.points.geometry.attributes.position.needsUpdate = true;
  }

  function update(state, clock, delta) {
    booster.position.fromArray(state.booster.position);
    booster.rotation.set(...state.booster.rotation);
    ship.position.fromArray(state.ship.position);
    ship.rotation.set(...state.ship.rotation);

    updateEngines(engines.booster, state.engines.booster, clock, boosterGlow);
    updateEngines(engines.ship, state.engines.ship, clock, shipGlow);
    updateParticles(boosterParticles, state.engines.booster, clock);
    updateParticles(shipParticles, state.engines.ship, clock);

    const boosterReturning = state.stageId === 'booster-return';
    const shipReturning = state.stageId === 'ship-return';
    for (let index = 0; index < fins.length; index++) {
      const fin = fins[index];
      fin.rotation.y = fin.userData.baseY + (boosterReturning ? Math.sin(clock * 1.7 + index) * .09 : 0);
      fin.rotation.z = boosterReturning ? Math.sin(clock * 1.3 + index) * .08 : 0;
    }
    for (const flap of [...forwardFlaps, ...aftFlaps]) {
      const amount = shipReturning ? (flap.kind === 'aft' ? .08 : .045) : .012;
      flap.panel.rotation.y = Math.sin(clock * .7 + flap.group.userData.phase) * amount;
    }

    const payloadState = state.payload || { doors: 0, deploy: 0 };
    for (const door of payloadDoors) {
      const side = door.userData.side;
      door.position.x = side * payloadState.doors * .9;
      door.rotation.y = side * payloadState.doors * 1.12;
    }
    for (const { wing, side } of solarWings) wing.rotation.z = side * (1 - payloadState.deploy) * Math.PI / 2;

    const target = exploded ? 1 : 0;
    explodeBlend = delta > 0 ? THREE.MathUtils.lerp(explodeBlend, target, 1 - Math.exp(-delta * 8)) : target;
    for (const part of explodedParts) part.object.position.copy(part.base).addScaledVector(part.offset, explodeBlend);

    root.updateMatrixWorld(true);
  }

  function anchor(name, state) {
    if (name === 'booster-engines') return booster.localToWorld(new THREE.Vector3(0, 2.6, 0));
    if (name === 'ship-engines') return ship.localToWorld(new THREE.Vector3(0, .2, 0));
    if (name === 'engines') return state.stageIndex >= 2 ? anchor('ship-engines', state) : anchor('booster-engines', state);
    if (name === 'tanks') return shipTanks.localToWorld(new THREE.Vector3(0, 22, 4.25));
    if (name === 'hotstage') return hotstage.localToWorld(new THREE.Vector3(0, 1.1, 4.6));
    if (name === 'flaps') return ship.localToWorld(new THREE.Vector3(5.75, 9.3, 0));
    if (name === 'payload') return payload.localToWorld(new THREE.Vector3(0, 40, 0));
    return root.localToWorld(new THREE.Vector3(0, 60, 0));
  }

  function stageCenter(stage) {
    return (stage === 'booster' ? booster : ship).localToWorld(new THREE.Vector3(0, stage === 'booster' ? 35 : 25, 0));
  }

  setQuality(quality);
  setDisplayMode({ section: false, exploded: false });

  return {
    root,
    booster,
    ship,
    engineCounts: { booster: engines.booster.length, ship: engines.ship.length },
    stats: {
      flaps: { ...STARSHIP_MODEL_STATS.flaps, forward: forwardFlaps.length, aft: aftFlaps.length, total: forwardFlaps.length + aftFlaps.length },
      tiles: { ...STARSHIP_MODEL_STATS.tiles, instances: tileMesh.userData.fullCount },
      payload: { ...STARSHIP_MODEL_STATS.payload },
    },
    groundY: GROUND_Y,
    update,
    setDisplayMode,
    setQuality,
    anchor,
    stageCenter,
  };
}
