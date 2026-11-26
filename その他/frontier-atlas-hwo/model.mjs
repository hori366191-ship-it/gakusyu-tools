import * as THREE from 'three';
import { PLANET_POSITION, fract } from './state.mjs';

const TAU = Math.PI * 2;
const SEGMENT_COUNT = 37;
const ACTUATORS_PER_SEGMENT = 3;
const ACTUATOR_COUNT = SEGMENT_COUNT * ACTUATORS_PER_SEGMENT;
const HINGE_COUNT = SEGMENT_COUNT * 2;
const STARSHADE_PETALS = 24;
const PHOTON_COUNT = 240;
const SPECTRUM_BARS = 32;
const MIRROR_CURVATURE = .0085;
const LOCAL_CURVATURE = .12;
const QUALITY_COUNTS = Object.freeze({ actuators: [36, 72, 96, 111], hinges: [24, 48, 72, 74], photons: [70, 120, 180, 240], petals: [12, 16, 20, 24] });

export const MODEL_STATS = Object.freeze({
  meaningfulParts: SEGMENT_COUNT * 8 + ACTUATOR_COUNT + HINGE_COUNT + STARSHADE_PETALS + 96,
  mirrorSegments: SEGMENT_COUNT,
  mirrorRims: SEGMENT_COUNT,
  individualMirrorMaterials: SEGMENT_COUNT,
  actuatorInstances: ACTUATOR_COUNT,
  hingeInstances: HINGE_COUNT,
  concaveMirror: true,
  centralHole: true,
  secondaryMirror: true,
  supportTrusses: 3,
  sunshieldLayers: 5,
  coronagraphOptics: 8,
  starshadePetals: STARSHADE_PETALS,
  photonInstances: PHOTON_COUNT,
  spectrumBars: SPECTRUM_BARS,
  instancedSystems: 5,
  pbrMaterials: 53,
  shaderMaterials: 2,
  lodLevels: 2,
  qualityLevels: 4,
});

function randomSource(seed = 404) {
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
  const material = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .24, gapSize: .18, depthWrite: false }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geometry, material); if (dashed) line.computeLineDistances(); parent.add(line); return line;
}
function cylinderBetween(parent, start, end, radius, material) {
  const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end); const direction = b.clone().sub(a);
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return mesh;
}
function buildMirrorLayout() {
  const positions = [];
  const spacing = .82;
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (Math.abs(q + r) > 3 || (q === 0 && r === 0)) continue;
    positions.push({ x: Math.sqrt(3) * spacing * (q + r / 2), y: 1.5 * spacing * r });
  }
  // A 37th outer segment keeps the requested count while preserving the open center.
  positions.push({ x: Math.sqrt(3) * spacing * 3, y: -1.5 * spacing * 2 });
  return positions;
}
function hexPoint(angle, radius, curvature) {
  return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, curvature * radius * radius);
}
function makeHexDishGeometry(radius = .76, curvature = LOCAL_CURVATURE, rings = 4) {
  const positions = [0, 0, 0];
  const indices = [];
  for (let ring = 1; ring <= rings; ring++) {
    for (let side = 0; side < 6; side++) {
      const point = hexPoint(side / 6 * TAU, radius * ring / rings, curvature);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let side = 0; side < 6; side++) indices.push(0, 1 + side, 1 + (side + 1) % 6);
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * 6;
    const outer = 1 + ring * 6;
    for (let side = 0; side < 6; side++) {
      const next = (side + 1) % 6;
      indices.push(inner + side, outer + side, outer + next, inner + side, outer + next, inner + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function makeHexRim(radius = .76, curvature = LOCAL_CURVATURE) {
  const points = Array.from({ length: 7 }, (_, index) => hexPoint(index / 6 * TAU, radius, curvature));
  return new THREE.BufferGeometry().setFromPoints(points);
}
function shieldShape(scale = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 8.2 * scale); shape.lineTo(7.1 * scale, 0); shape.lineTo(0, -8.2 * scale); shape.lineTo(-7.1 * scale, 0); shape.closePath();
  return shape;
}

export function createHWOModel() {
  const root = new THREE.Group(); root.name = 'HWO high-detail educational observatory';
  const random = randomSource();
  const layout = buildMirrorLayout();
  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x3c485c, metalness: .86, roughness: .29 });
  const carbonMaterial = new THREE.MeshStandardMaterial({ color: 0x151d2b, metalness: .48, roughness: .46 });
  const goldMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc59a52, metalness: .9, roughness: .2, clearcoat: .55 });
  const shieldMaterial = new THREE.MeshPhysicalMaterial({ color: 0x82729f, metalness: .68, roughness: .24, clearcoat: .6, side: THREE.DoubleSide });
  const instrumentMaterial = new THREE.MeshStandardMaterial({ color: 0x17253b, metalness: .66, roughness: .34, emissive: 0x0d2238, emissiveIntensity: .5 });
  const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x080d16, metalness: .35, roughness: .72, side: THREE.DoubleSide });

  const detailedMirror = new THREE.Group(); detailedMirror.name = '37 concave primary segments';
  const segmentGeometry = makeHexDishGeometry();
  const rimGeometry = makeHexRim();
  const rimMaterial = new THREE.LineBasicMaterial({ color: 0xe1edff, transparent: true, opacity: .72 });
  const mirrorMaterials = [];
  const segments = layout.map((point, index) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(.58 + (random() - .5) * .025, .22 + random() * .08, .72 + random() * .08),
      metalness: .9 + random() * .06, roughness: .045 + random() * .035, clearcoat: 1, clearcoatRoughness: .025,
      emissive: 0x10243e, emissiveIntensity: .22, side: THREE.DoubleSide,
    });
    mirrorMaterials.push(material);
    const radiusSquared = point.x * point.x + point.y * point.y;
    const full = new THREE.Vector3(point.x, point.y, MIRROR_CURVATURE * radiusSquared);
    const normal = new THREE.Vector3(-2 * MIRROR_CURVATURE * point.x, -2 * MIRROR_CURVATURE * point.y, 1).normalize();
    const fullQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const foldedAngle = index * 2.399963229728653;
    const folded = new THREE.Vector3(Math.cos(foldedAngle) * (.22 + index % 4 * .07), Math.sin(foldedAngle) * (.22 + index % 4 * .07), -1.55 - index * .022);
    const foldedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 1.2, random() * 1.2, random() * TAU));
    const mesh = addMesh(detailedMirror, segmentGeometry, material);
    mesh.name = `concave primary segment ${index + 1}`;
    mesh.add(new THREE.LineLoop(rimGeometry, rimMaterial));
    addMesh(mesh, new THREE.CylinderGeometry(.69, .69, .07, 6), carbonMaterial, [0, 0, -.055], [Math.PI / 2, 0, 0]);
    mesh.userData.full = full; mesh.userData.folded = folded; mesh.userData.fullQuaternion = fullQuaternion; mesh.userData.foldedQuaternion = foldedQuaternion;
    return mesh;
  });

  const actuatorGeometry = new THREE.CylinderGeometry(.042, .042, .28, 7); actuatorGeometry.rotateX(Math.PI / 2);
  const actuators = makeInstances(actuatorGeometry, structureMaterial, ACTUATOR_COUNT);
  const hingeGeometry = new THREE.BoxGeometry(.12, .2, .16);
  const hinges = makeInstances(hingeGeometry, goldMaterial, HINGE_COUNT);
  detailedMirror.add(actuators, hinges);

  const aperture = new THREE.Group(); aperture.name = 'central hole and baffle';
  addMesh(aperture, new THREE.TorusGeometry(.61, .065, 10, 64), goldMaterial, [0, 0, .02]);
  addMesh(aperture, new THREE.CylinderGeometry(.56, .56, .62, 48, 1, true), blackMaterial, [0, 0, -.28], [Math.PI / 2, 0, 0]);
  for (const z of [-.48, -.24, 0]) addMesh(aperture, new THREE.TorusGeometry(.56, .018, 5, 48), carbonMaterial, [0, 0, z]);
  detailedMirror.add(aperture);

  const simpleMirror = new THREE.Group();
  addMesh(simpleMirror, new THREE.CircleGeometry(4.55, 6), new THREE.MeshPhysicalMaterial({ color: 0xc8d8ed, metalness: .94, roughness: .08, clearcoat: 1, side: THREE.DoubleSide }), [0, 0, .04]);
  addMesh(simpleMirror, new THREE.CircleGeometry(.58, 40), blackMaterial, [0, 0, .06]);
  const mirrorLOD = new THREE.LOD(); mirrorLOD.name = 'concave segmented primary LOD'; mirrorLOD.addLevel(detailedMirror, 0); mirrorLOD.addLevel(simpleMirror, 52); root.add(mirrorLOD);

  const shieldLayers = [];
  for (let index = 0; index < 5; index++) {
    const scale = 1 - index * .055;
    const geometry = new THREE.ExtrudeGeometry(shieldShape(scale), { depth: .035, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .018 });
    const material = shieldMaterial.clone(); material.color.offsetHSL(index * .006, 0, index % 2 ? .045 : -.02);
    const layer = addMesh(root, geometry, material, [0, 0, -1.2 - index * .22]);
    layer.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0xd0c1ec, transparent: true, opacity: .38 })));
    for (let side = 0; side < 6; side++) {
      const angle = side / 6 * TAU;
      cylinderBetween(layer, [0, 0, .07], [Math.cos(angle) * 6.9 * scale, Math.sin(angle) * 6.9 * scale, .07], .014, carbonMaterial);
    }
    shieldLayers.push(layer);
  }
  addMesh(root, new THREE.BoxGeometry(4.8, 3.5, 1.2), instrumentMaterial, [0, 0, -2.7]);
  addMesh(root, new THREE.CylinderGeometry(.04, .04, 2, 8), goldMaterial, [-2.2, 2.9, -2.9], [0, 0, -.42]);
  addMesh(root, new THREE.SphereGeometry(.46, 20, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc6d2df, metalness: .82, roughness: .22 }), [-2.6, 3.75, -2.9], [0, 0, -.42]);
  for (const x of [-2, 2]) for (const y of [-1.2, 1.2]) addMesh(root, new THREE.CylinderGeometry(.11, .18, .55, 10), structureMaterial, [x, y, -3.5], [Math.PI / 2, 0, 0]);

  const supportTrusses = new THREE.Group(); supportTrusses.name = 'primary-to-secondary support trusses'; root.add(supportTrusses);
  const secondary = new THREE.Group(); secondary.name = 'secondary mirror and support trusses'; secondary.position.z = 4.25;
  const secondaryMirror = addMesh(secondary, new THREE.SphereGeometry(.62, 36, 22), goldMaterial, [0, 0, 0]); secondaryMirror.scale.z = .28;
  addMesh(secondary, new THREE.CylinderGeometry(.72, .72, .22, 32), carbonMaterial, [0, 0, -.18], [Math.PI / 2, 0, 0]);
  for (const angle of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
    const outer = [Math.cos(angle) * 3.9, Math.sin(angle) * 3.9, .12];
    const inner = [Math.cos(angle) * .58, Math.sin(angle) * .58, 4.08];
    cylinderBetween(supportTrusses, outer, inner, .038, carbonMaterial);
    addMesh(supportTrusses, new THREE.SphereGeometry(.09, 10, 7), goldMaterial, outer);
  }
  root.add(secondary);

  const coronagraph = new THREE.Group(); coronagraph.name = 'coronagraph optical bench'; coronagraph.position.z = 2.65;
  addMesh(coronagraph, new THREE.TorusGeometry(.93, .11, 12, 72), goldMaterial);
  addMesh(coronagraph, new THREE.CircleGeometry(.37, 48), blackMaterial, [0, 0, .03]);
  const lensMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9edcf0, metalness: .05, roughness: .06, transmission: .38, transparent: true, opacity: .42, thickness: .12, clearcoat: 1, side: THREE.DoubleSide });
  for (const [radius, z] of [[.62, .08], [.78, -.08]]) addMesh(coronagraph, new THREE.CircleGeometry(radius, 56), lensMaterial, [0, 0, z]);
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * TAU;
    addMesh(coronagraph, new THREE.BoxGeometry(.12, .28, .18), structureMaterial, [Math.cos(angle) * 1.04, Math.sin(angle) * 1.04, 0], [0, 0, angle]);
  }
  for (const radius of [1.24, 1.58, 1.92]) addMesh(coronagraph, new THREE.TorusGeometry(radius, .012, 5, 72), new THREE.MeshBasicMaterial({ color: 0x79dff5, transparent: true, opacity: .23 }));
  root.add(coronagraph);

  const starshade = new THREE.Group(); starshade.name = 'external starshade'; starshade.position.z = 7.25;
  const petalShape = new THREE.Shape(); petalShape.moveTo(-.14, .2); petalShape.lineTo(-.28, 2.6); petalShape.quadraticCurveTo(0, 2.9, .28, 2.6); petalShape.lineTo(.14, .2); petalShape.closePath();
  const petalGeometry = new THREE.ExtrudeGeometry(petalShape, { depth: .028, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .012, bevelThickness: .012 });
  const petalMaterial = new THREE.MeshPhysicalMaterial({ color: 0x202942, metalness: .66, roughness: .3, side: THREE.DoubleSide, clearcoat: .4 });
  const petalEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x9ba9cb, transparent: true, opacity: .5 });
  const petals = [];
  for (let index = 0; index < STARSHADE_PETALS; index++) {
    const angle = index / STARSHADE_PETALS * TAU;
    const petal = addMesh(starshade, petalGeometry, petalMaterial, [0, 0, 0], [0, 0, angle]);
    petal.add(new THREE.LineSegments(new THREE.EdgesGeometry(petalGeometry, 24), petalEdgeMaterial));
    petal.userData.angle = angle; petals.push(petal);
  }
  cylinderBetween(starshade, [0, 0, -.5], [0, 0, .5], .13, goldMaterial);
  root.add(starshade);

  const starGroup = new THREE.Group(); starGroup.name = 'host star'; starGroup.position.set(0, 0, 10.8);
  const starMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSuppression: { value: 0 }, uColor: { value: new THREE.Color(0xffdca0) } },
    vertexShader: `varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform float uSuppression;uniform vec3 uColor;varying vec3 vN;varying vec3 vP;void main(){float cells=sin(vP.x*18.+uTime)*sin(vP.y*21.-uTime*.7)*sin(vP.z*17.);float rim=pow(1.-abs(vN.z),2.);float light=(1.-uSuppression*.96);gl_FragColor=vec4(uColor*(.85+cells*.18+rim*.3),light);}`,
  });
  addMesh(starGroup, new THREE.SphereGeometry(.62, 36, 24), starMaterial);
  addMesh(starGroup, new THREE.SphereGeometry(.98, 28, 18), new THREE.MeshBasicMaterial({ color: 0xffbd68, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(starGroup);

  const planetGroup = new THREE.Group(); planetGroup.name = 'educational exoplanet'; planetGroup.position.set(...PLANET_POSITION);
  const planetMaterial = new THREE.MeshStandardMaterial({ color: 0x3f87a4, roughness: .58, metalness: .04, emissive: 0x12364a, emissiveIntensity: .28 });
  const planet = addMesh(planetGroup, new THREE.SphereGeometry(.36, 40, 26), planetMaterial);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xd6edf1, transparent: true, opacity: .34, roughness: .9, depthWrite: false });
  const clouds = makeInstances(new THREE.SphereGeometry(.038, 7, 5), cloudMaterial, 70);
  for (let index = 0; index < 70; index++) {
    const y = random() * 2 - 1; const a = random() * TAU; const radius = Math.sqrt(1 - y * y);
    const position = new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius).multiplyScalar(.374);
    const dummy = new THREE.Object3D(); dummy.position.copy(position); dummy.scale.set(1.8 + random(), .35, .8 + random()); dummy.lookAt(position.clone().multiplyScalar(2)); dummy.updateMatrix(); clouds.setMatrixAt(index, dummy.matrix);
  }
  planetGroup.add(clouds);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: .4 }, uColor: { value: new THREE.Color(0x62cfff) } },
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uOpacity;uniform vec3 uColor;varying vec3 vN;void main(){float rim=pow(1.-abs(vN.z),2.4);gl_FragColor=vec4(uColor,rim*uOpacity);}`,
  });
  addMesh(planetGroup, new THREE.SphereGeometry(.43, 32, 20), atmosphereMaterial);
  root.add(planetGroup);

  const opticalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(...PLANET_POSITION), new THREE.Vector3(0, 0, .28), new THREE.Vector3(0, 0, 4.25),
    new THREE.Vector3(0, 0, 2.65), new THREE.Vector3(-2.4, -.45, 2.8), new THREE.Vector3(-5.2, -1.2, 3.3),
  ], false, 'centripetal');
  const opticalPath = addMesh(root, new THREE.TubeGeometry(opticalCurve, 96, .016, 6, false), new THREE.MeshBasicMaterial({ color: 0x7be7ff, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false }));
  const photonMaterial = new THREE.MeshBasicMaterial({ color: 0xc5f5ff, transparent: true, opacity: .86, blending: THREE.AdditiveBlending, depthWrite: false });
  const photons = makeInstances(new THREE.SphereGeometry(.022, 5, 4), photonMaterial, PHOTON_COUNT);
  const photonSeeds = Array.from({ length: PHOTON_COUNT }, () => ({ phase: random(), speed: .08 + random() * .16, offset: (random() - .5) * .05 }));
  root.add(photons);

  const spectrograph = new THREE.Group(); spectrograph.name = 'educational spectrograph'; spectrograph.position.set(-5.2, -1.2, 2.5);
  addMesh(spectrograph, new THREE.BoxGeometry(2.5, 1.35, 1.15), instrumentMaterial);
  addMesh(spectrograph, new THREE.CylinderGeometry(.12, .12, 2.6, 12), goldMaterial, [0, 0, .8], [0, 0, Math.PI / 2]);
  addMesh(spectrograph, new THREE.ConeGeometry(.35, .65, 4), lensMaterial, [0, .05, .85], [0, 0, Math.PI / 4]);
  const spectrumMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 });
  const spectrumBars = makeInstances(new THREE.BoxGeometry(.105, 1, .05), spectrumMaterial, SPECTRUM_BARS);
  const spectrumSeeds = [];
  for (let index = 0; index < SPECTRUM_BARS; index++) {
    spectrumBars.setColorAt(index, new THREE.Color().setHSL(.58 - index / SPECTRUM_BARS * .48, .78, .62));
    spectrumSeeds.push(.25 + random() * .65);
  }
  spectrograph.add(spectrumBars);
  for (let index = 0; index < 3; index++) addMesh(spectrograph, new THREE.TorusGeometry(.07, .012, 5, 18), new THREE.MeshBasicMaterial({ color: 0xffd27c, transparent: true, opacity: .8 }), [-.82 + index * .82, .95, 1.05]);
  root.add(spectrograph);

  const anchors = Object.freeze({
    mirror: new THREE.Vector3(0, 0, .3),
    starshade: new THREE.Vector3(0, 0, 7.3),
    coronagraph: new THREE.Vector3(1.05, 0, 2.7),
    planet: new THREE.Vector3(...PLANET_POSITION),
    spectrograph: new THREE.Vector3(-5.2, -1.2, 3.3),
  });

  let quality = 2;
  function setQuality(level) {
    quality = THREE.MathUtils.clamp(Math.round(Number(level) || 0), 0, 3);
    actuators.count = QUALITY_COUNTS.actuators[quality]; hinges.count = QUALITY_COUNTS.hinges[quality]; photons.count = QUALITY_COUNTS.photons[quality];
    petals.forEach((petal, index) => { petal.visible = index < QUALITY_COUNTS.petals[quality]; });
    shieldLayers.forEach((layer, index) => { layer.visible = index < [3, 4, 5, 5][quality]; });
    root.userData.quality = quality;
  }

  function update(state) {
    const dummy = new THREE.Object3D();
    const deployment = state.mirrorDeployment;
    segments.forEach(segment => {
      segment.position.copy(segment.userData.folded).lerp(segment.userData.full, deployment);
      segment.quaternion.copy(segment.userData.foldedQuaternion).slerp(segment.userData.fullQuaternion, deployment);
      segment.scale.setScalar(.58 + deployment * .42);
    });
    for (let index = 0; index < ACTUATOR_COUNT; index++) {
      const segment = segments[Math.floor(index / ACTUATORS_PER_SEGMENT)];
      const angle = index % ACTUATORS_PER_SEGMENT / ACTUATORS_PER_SEGMENT * TAU;
      const offset = new THREE.Vector3(Math.cos(angle) * .25, Math.sin(angle) * .25, -.19).applyQuaternion(segment.quaternion).multiplyScalar(segment.scale.x);
      dummy.position.copy(segment.position).add(offset); dummy.quaternion.copy(segment.quaternion); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); actuators.setMatrixAt(index, dummy.matrix);
    }
    actuators.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < HINGE_COUNT; index++) {
      const segment = segments[Math.floor(index / 2)]; const side = index % 2 === 0 ? -1 : 1;
      const offset = new THREE.Vector3(side * .31, 0, -.11).applyQuaternion(segment.quaternion).multiplyScalar(segment.scale.x);
      dummy.position.copy(segment.position).add(offset); dummy.quaternion.copy(segment.quaternion); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); hinges.setMatrixAt(index, dummy.matrix);
    }
    hinges.instanceMatrix.needsUpdate = true;
    const shieldDeployment = state.mode === 'mirror-deploy' ? deployment : 1;
    secondary.position.z = 1.3 + deployment * 2.95;
    supportTrusses.scale.setScalar(.3 + deployment * .7);
    supportTrusses.visible = deployment > .025;
    coronagraph.position.z = 1.25 + deployment * 1.4;
    shieldLayers.forEach((layer, index) => {
      layer.scale.setScalar(.24 + shieldDeployment * .76);
      layer.position.z = (-1.2 - index * .22) * (.45 + shieldDeployment * .55);
      layer.rotation.z = (1 - shieldDeployment) * (index - 2) * .08;
    });
    petals.forEach((petal, index) => {
      petal.scale.setScalar(Math.max(.001, state.starshadeDeployment));
      petal.rotation.z = petal.userData.angle + (1 - state.starshadeDeployment) * .7;
      petal.visible = index < QUALITY_COUNTS.petals[quality];
    });
    starMaterial.uniforms.uTime.value = state.progress * TAU * 2; starMaterial.uniforms.uSuppression.value = state.suppression;
    planetMaterial.emissiveIntensity = .12 + state.planetReveal * .35; planetGroup.scale.setScalar(.82 + state.planetReveal * .25); planet.rotation.y = state.planetRotation;
    atmosphereMaterial.uniforms.uOpacity.value = .22 + state.planetReveal * .38;
    coronagraph.scale.setScalar(.78 + state.suppression * .22);
    spectrograph.visible = state.mode === 'spectroscopy' || state.mode === 'biosignature';
    opticalPath.visible = state.mode !== 'starlight-suppression';
    photons.visible = ['direct-imaging', 'spectroscopy', 'biosignature'].includes(state.mode);
    for (let index = 0; index < PHOTON_COUNT; index++) {
      const seed = photonSeeds[index]; const travel = fract(seed.phase + state.photonPhase * seed.speed);
      dummy.position.copy(opticalCurve.getPointAt(travel)); dummy.position.x += seed.offset * Math.sin(travel * Math.PI); dummy.position.y += seed.offset * .7 * Math.sin(travel * Math.PI);
      dummy.quaternion.identity(); dummy.scale.setScalar(.65 + Math.sin(travel * Math.PI) * .8); dummy.updateMatrix(); photons.setMatrixAt(index, dummy.matrix);
    }
    photons.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < SPECTRUM_BARS; index++) {
      const wave = .55 + .45 * Math.sin(index * .71 + state.spectrum * 8);
      const candidateBoost = state.mode === 'biosignature' && [9, 17, 24].includes(index) ? .8 : 0;
      const height = .15 + spectrumSeeds[index] * wave * (.45 + state.spectrum * .7) + candidateBoost;
      dummy.position.set((index - (SPECTRUM_BARS - 1) / 2) * .13, height / 2, 1.45); dummy.quaternion.identity(); dummy.scale.set(1, height, 1); dummy.updateMatrix(); spectrumBars.setMatrixAt(index, dummy.matrix);
    }
    spectrumBars.instanceMatrix.needsUpdate = true;
    mirrorMaterials.forEach((material, index) => { material.emissiveIntensity = .16 + state.weights.mirror * .22 + Math.sin(state.progress * TAU + index * .17) * .025; });
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
  return { root, anchors, stats: MODEL_STATS, optics: { segmentCount: segments.length, individualMaterials: mirrorMaterials.length, actuatorCount: ACTUATOR_COUNT, centralHoleRadius: .61 }, setQuality, update, dispose };
}
