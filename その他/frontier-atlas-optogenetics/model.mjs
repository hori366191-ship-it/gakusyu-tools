import * as THREE from 'three';
import { HOTSPOTS, MODE_IDS } from './content.mjs';
import { TAU, calculateOptogeneticsState, sampleParticleSystem } from './state.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const SOMA_CENTER = new THREE.Vector3(-2.25, .15, 0);
const INSTANCE_DUMMY = new THREE.Object3D();

export const MODEL_STATS = Object.freeze({
  meaningfulParts: 113,
  dendrites: 40,
  myelinSegments: 11,
  channelrhodopsin: 18,
  transmembraneHelices: 126,
  mitochondria: 42,
  lightPulses: 36,
  ions: 216,
  actionPotentialParticles: 128,
  synapticVesicles: 84,
  meshObjects: 113,
  instancedSystems: 9,
  maxInstancedElements: 758,
  pbrMaterials: 13,
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

function curveFrom(points) {
  return new THREE.CatmullRomCurve3(points.map(point => point.isVector3 ? point : new THREE.Vector3(...point)));
}

function addTube(parent, points, radius, material, segments = 32, radial = 7) {
  const curve = curveFrom(points);
  const mesh = addMesh(parent, new THREE.TubeGeometry(curve, segments, radius, radial, false), material);
  return { mesh, curve };
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

function makeMaterials() {
  return {
    membrane: new THREE.MeshPhysicalMaterial({
      color: 0x316a82, metalness: .08, roughness: .26, clearcoat: .8,
      clearcoatRoughness: .18, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false,
    }),
    nucleus: new THREE.MeshPhysicalMaterial({
      color: 0x825dc7, emissive: 0x29164c, emissiveIntensity: .7, metalness: .12,
      roughness: .3, clearcoat: .5, transparent: true, opacity: .78,
    }),
    dendrite: new THREE.MeshStandardMaterial({ color: 0x285369, emissive: 0x0c2634, emissiveIntensity: .65, metalness: .28, roughness: .4 }),
    branch: new THREE.MeshStandardMaterial({ color: 0x39768a, emissive: 0x123c47, emissiveIntensity: .55, metalness: .22, roughness: .38 }),
    axon: new THREE.MeshPhysicalMaterial({ color: 0x65c7d8, emissive: 0x145263, emissiveIntensity: 1.1, metalness: .18, roughness: .22, clearcoat: .7 }),
    myelin: new THREE.MeshPhysicalMaterial({ color: 0xb8d9df, emissive: 0x1c3941, emissiveIntensity: .28, metalness: .05, roughness: .3, clearcoat: .45, transparent: true, opacity: .82 }),
    protein: new THREE.MeshStandardMaterial({ color: 0x63e6ff, emissive: 0x1a849d, emissiveIntensity: 1.2, metalness: .35, roughness: .25 }),
    retinal: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xd98524, emissiveIntensity: 1.3, metalness: .12, roughness: .28 }),
    fiber: new THREE.MeshPhysicalMaterial({ color: 0x758aab, metalness: .72, roughness: .24, clearcoat: .5 }),
    fiberCore: new THREE.MeshStandardMaterial({ color: 0xa9c6ff, emissive: 0x416dff, emissiveIntensity: 2.2, metalness: .1, roughness: .18 }),
    vesicle: new THREE.MeshPhysicalMaterial({ color: 0xd2a6ff, emissive: 0x603696, emissiveIntensity: 1.1, metalness: .15, roughness: .22, clearcoat: .65 }),
    organelle: new THREE.MeshStandardMaterial({ color: 0xe2a96c, emissive: 0x6d351b, emissiveIntensity: .7, metalness: .18, roughness: .38 }),
    ionSodium: new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false }),
    ionCalcium: new THREE.MeshBasicMaterial({ color: 0x9cf1cc, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false }),
    pulse: new THREE.MeshBasicMaterial({ color: 0xb7d5ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }),
    potential: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .96, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

function makeBeamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color(0x5bbcff) },
    },
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
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.4);
        float bands = .72 + .28 * sin(vUv.y * 46.0 - uTime * 8.0);
        float fade = smoothstep(0.0, .16, vUv.y) * (1.0 - smoothstep(.82, 1.0, vUv.y));
        float alpha = (.06 + edge * .26) * bands * fade * uIntensity;
        gl_FragColor = vec4(uColor * (1.1 + edge * .8), alpha);
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

function makeDendrites(root, materials) {
  const group = new THREE.Group();
  group.name = 'dendritic arbor';
  const random = randomSource(341);
  const mainCurves = [];
  for (let index = 0; index < 10; index++) {
    const angle = index / 10 * TAU;
    const direction = new THREE.Vector3(-.65 - random() * .55, Math.cos(angle) * 1.15, Math.sin(angle) * 1.1).normalize();
    const start = SOMA_CENTER.clone().addScaledVector(direction, .92);
    const middle = start.clone().addScaledVector(direction, 1.15);
    middle.y += (random() - .5) * .7;
    middle.z += (random() - .5) * .7;
    const end = start.clone().addScaledVector(direction, 2.25 + random() * .7);
    const { curve } = addTube(group, [start, middle, end], .13 - index * .004, index % 2 ? materials.dendrite : materials.branch, 22, 7);
    mainCurves.push(curve);
    for (let branch = 0; branch < 3; branch++) {
      const t = .36 + branch * .2;
      const origin = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const side = new THREE.Vector3((random() - .5) * .8, Math.cos(angle + branch) * .9, Math.sin(angle + branch) * .9);
      const branchDirection = tangent.clone().multiplyScalar(.55).add(side).normalize();
      const tip = origin.clone().addScaledVector(branchDirection, .75 + random() * .65);
      const bend = origin.clone().lerp(tip, .55).add(new THREE.Vector3(0, (random() - .5) * .25, 0));
      addTube(group, [origin, bend, tip], .047, materials.branch, 12, 5);
    }
  }
  root.add(group);
  return group;
}

function makeSoma(root, materials) {
  const group = new THREE.Group();
  group.name = 'soma and nucleus';
  group.position.copy(SOMA_CENTER);
  const membrane = addMesh(group, new THREE.SphereGeometry(1.28, 40, 26), materials.membrane);
  membrane.scale.set(1.02, 1.18, .94);
  membrane.userData.semantic = true;
  const nucleus = addMesh(group, new THREE.SphereGeometry(.61, 30, 20), materials.nucleus, [-.12, .03, .05]);
  nucleus.scale.set(1, 1.14, .92);
  const nucleolus = addMesh(group, new THREE.SphereGeometry(.2, 20, 14), materials.organelle, [-.18, .12, .28]);

  const high = new THREE.Group();
  high.name = 'high detail cell interior';
  const low = new THREE.Group();
  low.name = 'low detail cell interior';
  const erMaterial = new THREE.MeshStandardMaterial({ color: 0x7696c9, emissive: 0x233a66, emissiveIntensity: .7, metalness: .22, roughness: .35 });
  for (let index = 0; index < 7; index++) {
    const ring = addMesh(high, new THREE.TorusGeometry(.42 + index * .075, .027, 6, 42), erMaterial, [.15, -.2 + index * .06, -.1], [Math.PI / 2 + index * .15, index * .3, index * .17]);
    ring.scale.y = .7;
  }
  const mitochondria = instanced(high, new THREE.CapsuleGeometry(.10, .25, 5, 9), materials.organelle, 42);
  const random = randomSource(811);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 42; index++) {
    const radius = .42 + random() * .58;
    const theta = random() * TAU;
    const phi = Math.acos(2 * random() - 1);
    dummy.position.set(Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius * 1.1, Math.sin(phi) * Math.sin(theta) * radius);
    dummy.rotation.set(random() * TAU, random() * TAU, random() * TAU);
    dummy.scale.setScalar(.7 + random() * .6);
    dummy.updateMatrix();
    mitochondria.setMatrixAt(index, dummy.matrix);
  }
  mitochondria.instanceMatrix.needsUpdate = true;
  addMesh(low, new THREE.IcosahedronGeometry(.38, 1), materials.organelle, [.25, -.1, -.2]);
  const lod = new THREE.LOD();
  lod.addLevel(high, 0);
  lod.addLevel(low, 28);
  group.add(lod, nucleus, nucleolus);
  root.add(group);
  return { group, membrane, nucleus, nucleolus, mitochondria, lod };
}

function makeChannels(root, materials) {
  const group = new THREE.Group();
  group.name = 'channelrhodopsin membrane proteins';
  const random = randomSource(1902);
  const anchors = [];
  for (let index = 0; index < 18; index++) {
    const theta = index * 2.399963229728653;
    const y = -.72 + (index / 17) * 1.5;
    const radial = Math.sqrt(Math.max(.1, 1 - (y / 1.5) ** 2));
    const normal = new THREE.Vector3(radial * Math.cos(theta), y / 1.5, radial * Math.sin(theta)).normalize();
    const position = SOMA_CENTER.clone().add(new THREE.Vector3(normal.x * 1.27, normal.y * 1.48, normal.z * 1.18));
    const tangent = new THREE.Vector3(-normal.z, .18, normal.x).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    anchors.push({ position, normal, tangent, bitangent });
  }
  const helices = instanced(group, new THREE.CylinderGeometry(.043, .043, .47, 7), materials.protein, 126);
  const pores = instanced(group, new THREE.TorusGeometry(.105, .028, 6, 16), materials.protein, 18, true);
  const retinals = instanced(group, new THREE.SphereGeometry(.064, 10, 7), materials.retinal, 18);
  const q = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  anchors.forEach((anchor, index) => {
    basis.makeBasis(anchor.tangent, anchor.normal, anchor.bitangent);
    q.setFromRotationMatrix(basis);
    for (let helix = 0; helix < 7; helix++) {
      const angle = helix / 7 * TAU;
      const local = anchor.tangent.clone().multiplyScalar(Math.cos(angle) * .15)
        .addScaledVector(anchor.bitangent, Math.sin(angle) * .15);
      setInstance(helices, index * 7 + helix, anchor.position.clone().add(local), q);
    }
    const poreQ = new THREE.Quaternion().setFromUnitVectors(FORWARD, anchor.normal);
    setInstance(pores, index, anchor.position.clone().addScaledVector(anchor.normal, .25), poreQ, 1);
    setInstance(retinals, index, anchor.position.clone().addScaledVector(anchor.tangent, .12).addScaledVector(anchor.normal, .04), q);
  });
  helices.instanceMatrix.needsUpdate = true;
  pores.instanceMatrix.needsUpdate = true;
  retinals.instanceMatrix.needsUpdate = true;
  root.add(group);
  return { group, anchors, helices, pores, retinals };
}

function makeAxon(root, materials) {
  const group = new THREE.Group();
  group.name = 'axon myelin and terminals';
  const points = [
    [-1.05, .15, 0], [.2, .28, .05], [1.8, .04, -.08], [3.5, -.20, .12], [5.2, -.04, -.05], [7.15, .22, .02],
  ];
  const axon = addTube(group, points, .135, materials.axon, 88, 10);
  const initial = new THREE.Vector3(...points[0]);
  const hillock = addMesh(group, new THREE.ConeGeometry(.30, .72, 18), materials.axon, initial.toArray(), [0, 0, -Math.PI / 2]);
  hillock.scale.set(1, 1, .75);
  const segments = [];
  for (let index = 0; index < 11; index++) {
    const t = .14 + index * .067;
    const point = axon.curve.getPoint(t);
    const tangent = axon.curve.getTangent(t).normalize();
    const segment = addMesh(group, new THREE.CylinderGeometry(.27, .29, .50, 18), materials.myelin, point.toArray());
    segment.quaternion.setFromUnitVectors(UP, tangent);
    segment.userData.baseScale = .92 + (index % 3) * .04;
    const ringA = addMesh(group, new THREE.TorusGeometry(.276, .022, 5, 22), materials.axon, point.clone().addScaledVector(tangent, -.25).toArray());
    const ringB = addMesh(group, new THREE.TorusGeometry(.276, .022, 5, 22), materials.axon, point.clone().addScaledVector(tangent, .25).toArray());
    const ringQ = new THREE.Quaternion().setFromUnitVectors(FORWARD, tangent);
    ringA.quaternion.copy(ringQ);
    ringB.quaternion.copy(ringQ);
    segments.push(segment);
  }
  const terminals = new THREE.Group();
  terminals.name = 'axon terminal branches';
  const end = axon.curve.getPoint(1);
  const terminalEnds = [];
  for (let index = 0; index < 6; index++) {
    const angle = index / 6 * TAU;
    const tip = end.clone().add(new THREE.Vector3(.85 + (index % 2) * .25, Math.cos(angle) * .75, Math.sin(angle) * .75));
    const middle = end.clone().lerp(tip, .5).add(new THREE.Vector3(0, .1 * Math.sin(angle * 2), 0));
    addTube(terminals, [end, middle, tip], .075, materials.axon, 18, 7);
    const bulb = addMesh(terminals, new THREE.SphereGeometry(.18, 16, 11), materials.axon, tip.toArray());
    bulb.scale.set(1.25, 1, 1);
    terminalEnds.push(tip);
  }
  const vesicles = instanced(terminals, new THREE.SphereGeometry(.062, 9, 6), materials.vesicle, 84);
  const random = randomSource(771);
  const vesicleSeeds = [];
  for (let index = 0; index < 84; index++) {
    const center = terminalEnds[index % terminalEnds.length];
    const seed = center.clone().add(new THREE.Vector3((random() - .5) * .46, (random() - .5) * .46, (random() - .5) * .46));
    vesicleSeeds.push(seed);
    setInstance(vesicles, index, seed, null, .7 + random() * .55);
  }
  vesicles.instanceMatrix.needsUpdate = true;
  group.add(terminals);
  root.add(group);
  return { group, axon: axon.curve, segments, terminals, terminalEnds, vesicles, vesicleSeeds };
}

function makeFiber(root, materials) {
  const group = new THREE.Group();
  group.name = 'optical fiber and blue light';
  const points = [[-2.1, 5.1, -.55], [-2.28, 3.9, -.25], [-2.18, 2.65, .12], [-2.04, 1.78, .38]];
  const outer = addTube(group, points, .16, materials.fiber, 48, 12);
  const core = addTube(group, points.map(point => [point[0] + .015, point[1], point[2] + .02]), .085, materials.fiberCore, 48, 9);
  const tip = addMesh(group, new THREE.CylinderGeometry(.19, .19, .32, 18), materials.fiber, [-2.04, 1.70, .38]);
  const lens = addMesh(group, new THREE.SphereGeometry(.15, 18, 12), materials.fiberCore, [-2.04, 1.52, .38]);
  lens.scale.y = .35;
  const cable = addTube(group, [[-2.1, 5.1, -.55], [-2.0, 5.65, -.6], [-1.2, 6.1, -.8]], .21, materials.fiber, 20, 10);
  const beamMaterial = makeBeamMaterial();
  const beam = addMesh(group, new THREE.ConeGeometry(.92, 2.15, 36, 1, true), beamMaterial, [-2.08, .60, .34], [0, 0, -.08]);
  const pulses = instanced(group, new THREE.SphereGeometry(.068, 9, 6), materials.pulse, 36, true);
  root.add(group);
  return { group, curve: core.curve, outer: outer.curve, tip, lens, beam, beamMaterial, pulses, cable };
}

function makeParticles(root, materials) {
  const ions = instanced(root, new THREE.SphereGeometry(.058, 8, 5), materials.ionSodium, 216, true);
  const calcium = new THREE.Color(0x9cf1cc);
  const sodium = new THREE.Color(0x63e6ff);
  for (let index = 0; index < 216; index++) ions.setColorAt(index, index % 3 === 0 ? calcium : sodium);
  ions.instanceColor.needsUpdate = true;
  const potential = instanced(root, new THREE.SphereGeometry(.075, 8, 5), materials.potential, 128, true);
  return { ions, potential };
}

export function createOptogeneticsModel() {
  const root = new THREE.Group();
  root.name = 'optogenetics educational neuron network';
  const materials = makeMaterials();
  const soma = makeSoma(root, materials);
  const dendrites = makeDendrites(root, materials);
  const channels = makeChannels(root, materials);
  const axon = makeAxon(root, materials);
  const fiber = makeFiber(root, materials);
  const particles = makeParticles(root, materials);
  const random = randomSource(1207);
  const dust = instanced(root, new THREE.OctahedronGeometry(.024, 0), new THREE.MeshBasicMaterial({ color: 0x6ba8bd, transparent: true, opacity: .28 }), 90);
  for (let index = 0; index < 90; index++) {
    setInstance(dust, index, new THREE.Vector3((random() - .5) * 15, (random() - .5) * 9, (random() - .5) * 9), null, .5 + random());
  }
  dust.instanceMatrix.needsUpdate = true;

  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let quality = 2;
  let selected = null;
  let previousMode = '';
  const displayProteinColor = new THREE.Color(0x3c8ba5);
  const openProteinColor = new THREE.Color(0x8ef4ff);
  const poreQuaternion = new THREE.Quaternion();
  const forwardAxis = new THREE.Vector3(0, 0, 1);
  const selectedScaleVector = new THREE.Vector3();

  function setQuality(level) {
    quality = Math.max(0, Math.min(3, level));
    particles.ions.count = [90, 144, 184, 216][quality];
    particles.potential.count = [48, 80, 108, 128][quality];
    fiber.pulses.count = [14, 24, 30, 36][quality];
    axon.vesicles.count = [36, 56, 72, 84][quality];
    soma.mitochondria.count = [18, 28, 36, 42][quality];
    dust.count = [30, 50, 70, 90][quality];
  }

  function setSelectedNode(id) {
    selected = HOTSPOTS[id] ? id : null;
  }

  function update(state, clock = 0, delta = 0) {
    const current = calculateOptogeneticsState(state?.phase, state?.light);
    const system = sampleParticleSystem(current, clock);
    const blend = delta > 0 ? 1 - Math.exp(-delta * 8) : 1;
    const pulse = .5 + .5 * Math.sin(clock * 5);
    const modeChanged = previousMode !== current.mode;
    previousMode = current.mode;

    materials.membrane.emissive.setRGB(.025 + current.membraneDepolarization * .035, .10 + current.membraneDepolarization * .16, .16 + current.membraneDepolarization * .18);
    materials.membrane.emissiveIntensity = .6 + current.membraneDepolarization * 1.1;
    materials.membrane.opacity = THREE.MathUtils.lerp(materials.membrane.opacity, .30 + current.membraneDepolarization * .16, blend);
    soma.nucleus.rotation.y = clock * .08;
    soma.nucleus.scale.setScalar(1 + Math.sin(clock * .7) * .015);
    soma.mitochondria.rotation.y = clock * .035;
    materials.nucleus.emissiveIntensity = .55 + current.membraneDepolarization * .45;

    materials.protein.emissiveIntensity = .55 + current.channelOpen * 2.4 + (selected === 'channel' ? .5 : 0);
    materials.protein.color.lerp(current.channelOpen > .1 ? openProteinColor : displayProteinColor, blend);
    channels.pores.count = 18;
    for (let index = 0; index < 18; index++) {
      const anchor = channels.anchors[index];
      poreQuaternion.setFromUnitVectors(forwardAxis, anchor.normal);
      const scale = .55 + current.channelOpen * (.65 + .12 * Math.sin(clock * 7 + index));
      setInstance(channels.pores, index, anchor.position.clone().addScaledVector(anchor.normal, .25), poreQuaternion, scale);
    }
    channels.pores.instanceMatrix.needsUpdate = true;

    fiber.beamMaterial.uniforms.uTime.value = clock;
    fiber.beamMaterial.uniforms.uIntensity.value = current.lightActive ? current.intensity : 0;
    fiber.beam.visible = current.lightActive;
    fiber.lens.material.emissiveIntensity = 1.1 + current.intensity * 3.2;
    for (let index = 0; index < fiber.pulses.count; index++) {
      const sample = system.lightPulse(index, fiber.pulses.count);
      point.copy(fiber.curve.getPoint(sample.travel));
      setInstance(fiber.pulses, index, point, null, Math.max(.001, sample.scale));
    }
    fiber.pulses.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < particles.ions.count; index++) {
      const sample = system.ion(index, particles.ions.count);
      const anchor = channels.anchors[sample.lane % channels.anchors.length];
      normal.copy(anchor.normal);
      tangent.copy(anchor.tangent).multiplyScalar(sample.radialJitter * (1 - sample.travel));
      point.copy(anchor.position).addScaledVector(normal, 1.55 * (1 - sample.travel) + .22).add(tangent);
      point.y += Math.sin(sample.travel * Math.PI) * .08;
      setInstance(particles.ions, index, point, null, Math.max(.001, sample.scale));
    }
    particles.ions.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < particles.potential.count; index++) {
      const sample = system.potential(index, particles.potential.count);
      point.copy(axon.axon.getPoint(sample.travel));
      point.y += .12 + Math.sin(sample.travel * 45) * .025;
      setInstance(particles.potential, index, point, null, Math.max(.001, sample.scale * 1.25));
    }
    particles.potential.instanceMatrix.needsUpdate = true;
    materials.potential.opacity = .45 + current.actionPotential * .55;
    materials.axon.emissiveIntensity = .75 + current.actionPotential * 1.6;
    axon.segments.forEach((segment, index) => {
      const active = current.actionPotential * Math.max(0, 1 - Math.abs(index / 10 - current.pulsePhase) * 7);
      segment.scale.set(segment.userData.baseScale * (1 + active * .06), 1, segment.userData.baseScale * (1 + active * .06));
      segment.material.emissiveIntensity = .22 + active * .7;
    });
    for (let index = 0; index < axon.vesicles.count; index++) {
      const scale = .8 + current.actionPotential * .45 + Math.sin(clock * 3 + index) * .08;
      setInstance(axon.vesicles, index, axon.vesicleSeeds[index], null, scale);
    }
    axon.vesicles.instanceMatrix.needsUpdate = true;

    const selectedScale = selected ? 1.04 : 1;
    selectedScaleVector.setScalar(selectedScale);
    channels.group.scale.lerp(selectedScaleVector, blend);
    if (modeChanged && current.mode === 'off') {
      materials.membrane.opacity = .32;
    }
    root.updateMatrixWorld(true);
  }

  function anchor(id) {
    const lookup = {
      soma: new THREE.Vector3(-2.25, 1.35, .25),
      channel: channels.anchors[2].position.clone().add(new THREE.Vector3(0, .35, .18)),
      fiber: new THREE.Vector3(-2.04, 2.0, .38),
      axon: axon.axon.getPoint(.52).add(new THREE.Vector3(0, .5, 0)),
      terminal: axon.terminalEnds[1].clone().add(new THREE.Vector3(0, .35, 0)),
    };
    return lookup[id] ? root.localToWorld(lookup[id]) : new THREE.Vector3();
  }

  function dispose() {
    const geometries = new Set();
    const materialsSet = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialsSet.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materialsSet.forEach(material => material.dispose());
  }

  setQuality(quality);
  setSelectedNode(null);
  update(calculateOptogeneticsState(), 0, 0);

  return {
    root,
    components: { soma, dendrites, channels, axon, fiber, particles },
    update,
    setQuality,
    setSelectedNode,
    nodeAnchor: anchor,
    coreAnchor: () => root.localToWorld(SOMA_CENTER.clone()),
    dispose,
    stats: MODEL_STATS,
    modeIds: MODE_IDS,
  };
}
