import * as THREE from 'three';
import { COMPONENT_IDS } from './content.mjs';
import { MAJOR_RADIUS, MINOR_RADIUS, TAU, neutronSample, torusPoint } from './state.mjs';

export const MODEL_STATS = Object.freeze({
  logicalParts: 507,
  meshObjects: 173,
  instancedDetails: 334,
  pbrFamilies: 5,
  shaderMaterials: 1,
  lodLevels: 2,
  hotspots: COMPONENT_IDS.length,
  educationalApproximation: true,
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addMesh(parent, geometry, material, name) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  parent.add(object);
  return object;
}

function setInstance(mesh, index, dummy, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  dummy.position.set(...position);
  dummy.rotation.set(...rotation);
  dummy.scale.set(...scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function createPlasmaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColorA: { value: new THREE.Color('#ff7a45') },
      uColorB: { value: new THREE.Color('#72e8ff') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float uTime;
      uniform float uIntensity;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        float ripple = sin(position.x * 4.0 + uTime * 1.8) * sin(position.z * 3.0 - uTime) * 0.025 * uIntensity;
        vec3 displaced = position + normal * ripple;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      void main() {
        float bands = 0.5 + 0.5 * sin(vPosition.x * 8.0 + vPosition.z * 6.0 - uTime * 3.2);
        float fine = 0.5 + 0.5 * sin(vPosition.y * 18.0 + uTime * 2.0);
        float fresnel = pow(1.0 - abs(vNormal.z), 2.0);
        vec3 color = mix(uColorA, uColorB, bands * 0.72 + fresnel * 0.28);
        color *= 0.85 + fine * 0.35;
        gl_FragColor = vec4(color * (0.9 + uIntensity * 0.7), 0.68 + bands * 0.22);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function coilCurve(angle) {
  const points = [];
  for (let index = 0; index < 20; index++) {
    const phi = index / 20 * TAU;
    const radial = MAJOR_RADIUS + Math.cos(phi) * 1.34;
    points.push(new THREE.Vector3(radial * Math.cos(angle), Math.sin(phi) * 1.34, radial * Math.sin(angle)));
  }
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

export function createFusionModel() {
  const root = new THREE.Group();
  root.name = 'educational detailed tokamak — not an ITER engineering model';
  const random = seededRandom(20261126);
  const dummy = new THREE.Object3D();
  const parts = Object.fromEntries(COMPONENT_IDS.map(id => [id, new THREE.Group()]));
  for (const [id, group] of Object.entries(parts)) {
    group.name = id;
    root.add(group);
  }

  const steel = new THREE.MeshPhysicalMaterial({ color: 0x718899, metalness: .88, roughness: .27, clearcoat: .35 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x243743, metalness: .8, roughness: .36 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xd48a52, metalness: .85, roughness: .25, emissive: 0x6b2b12, emissiveIntensity: .25 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x92b6b0, metalness: .08, roughness: .3, transmission: .14, thickness: .4, transparent: true, opacity: .9 });
  const vesselGlass = new THREE.MeshPhysicalMaterial({ color: 0x8fc5d6, metalness: .15, roughness: .18, transmission: .25, thickness: .25, transparent: true, opacity: .19, side: THREE.DoubleSide, depthWrite: false });
  const heatMaterial = new THREE.MeshStandardMaterial({ color: 0xffa15d, metalness: .35, roughness: .32, emissive: 0xff4b1f, emissiveIntensity: .4 });
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x83e9ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
  const neutronMaterial = new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const conceptMaterial = new THREE.MeshPhysicalMaterial({ color: 0xa9d9ff, metalness: .55, roughness: .24, transparent: true, opacity: 0, emissive: 0x245477, emissiveIntensity: .45, depthWrite: false });

  // 24 vessel sectors, 12 equipment ports and 48 ribs: all individually meaningful.
  for (let index = 0; index < 24; index++) {
    const angle = index / 24 * TAU;
    const sector = addMesh(parts.vessel, new THREE.TorusGeometry(3.88, 1.02, 10, 12, TAU / 24 * .9), vesselGlass, `vacuum vessel sector ${index + 1}`);
    sector.rotation.set(Math.PI / 2, angle, 0);
  }
  const ports = new THREE.InstancedMesh(new THREE.BoxGeometry(.62, .52, .76), steel, 12);
  ports.name = 'heating and diagnostic ports';
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * TAU;
    setInstance(ports, index, dummy, [Math.cos(angle) * 4.73, 0, Math.sin(angle) * 4.73], [0, -angle, 0]);
  }
  ports.instanceMatrix.needsUpdate = true;
  parts.vessel.add(ports);
  const ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(4.03, .032, 6, 10, TAU / 24 * .82), darkSteel, 48);
  ribs.name = 'vessel reinforcement ribs';
  for (let index = 0; index < 48; index++) {
    const angle = Math.floor(index / 2) / 24 * TAU;
    const side = index % 2 ? .82 : -.82;
    setInstance(ribs, index, dummy, [0, side, 0], [Math.PI / 2, angle, 0]);
  }
  ribs.instanceMatrix.needsUpdate = true;
  parts.vessel.add(ribs);

  // 18 toroidal D-coils; their tubes follow the same torus coordinates as the plasma.
  for (let index = 0; index < 18; index++) {
    const angle = index / 18 * TAU;
    addMesh(parts.coils, new THREE.TubeGeometry(coilCurve(angle), 56, .065, 7, true), copper, `toroidal field coil ${index + 1}`);
  }
  // 6 simplified poloidal rings and 14 central-solenoid turns.
  for (let index = 0; index < 6; index++) {
    const ring = addMesh(parts.coils, new THREE.TorusGeometry(4.55 + index * .16, .065, 8, 80), copper, `poloidal field coil ${index + 1}`);
    ring.scale.y = .74;
    ring.position.z = -.35 - index * .06;
  }
  const solenoid = new THREE.InstancedMesh(new THREE.CylinderGeometry(.38, .38, .12, 20), copper, 14);
  solenoid.name = 'central solenoid turns';
  for (let index = 0; index < 14; index++) setInstance(solenoid, index, dummy, [0, -1.18 + index * .18, 0]);
  solenoid.instanceMatrix.needsUpdate = true;
  parts.coils.add(solenoid);

  // Plasma torus uses a dedicated animated fragment shader, with instanced field tracers.
  const plasmaMaterial = createPlasmaMaterial();
  const plasma = addMesh(parts.plasma, new THREE.TorusGeometry(MAJOR_RADIUS, MINOR_RADIUS, 28, 96), plasmaMaterial, 'plasma torus shader');
  plasma.rotation.x = Math.PI / 2;
  const plasmaCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffc08c, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false });
  const plasmaCore = addMesh(parts.plasma, new THREE.TorusGeometry(MAJOR_RADIUS, MINOR_RADIUS * .64, 18, 80), plasmaCoreMaterial, 'alpha heated plasma core');
  plasmaCore.rotation.x = Math.PI / 2;
  const fieldTracers = new THREE.InstancedMesh(new THREE.SphereGeometry(.028, 6, 5), beamMaterial, 64);
  fieldTracers.name = 'magnetic field direction tracers';
  for (let index = 0; index < 64; index++) {
    const u = index / 64;
    const v = (u * 11) % 1;
    const point = torusPoint(u, v);
    setInstance(fieldTracers, index, dummy, [point.x, point.y, point.z]);
  }
  fieldTracers.instanceMatrix.needsUpdate = true;
  parts.plasma.add(fieldTracers);

  // Four neutral-beam injectors with glowing beam cores.
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * TAU + Math.PI / 4;
    const injector = new THREE.Group();
    injector.name = `neutral beam injector ${index + 1}`;
    injector.position.set(Math.cos(angle) * 5.3, .35, Math.sin(angle) * 5.3);
    injector.rotation.y = -angle;
    const housing = addMesh(injector, new THREE.CylinderGeometry(.25, .34, 1.7, 12), darkSteel, 'beam housing');
    housing.rotation.z = Math.PI / 2;
    const core = addMesh(injector, new THREE.CylinderGeometry(.08, .12, 2.1, 10), beamMaterial, 'neutral beam');
    core.rotation.z = Math.PI / 2;
    core.position.x = -.3;
    parts.vessel.add(injector);
  }

  // 12 divertor cassettes and 48 cooling fins beneath the torus.
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * TAU;
    const cassette = addMesh(parts.divertor, new THREE.BoxGeometry(.62, .22, 1.12), darkSteel, `divertor cassette ${index + 1}`);
    cassette.position.set(Math.cos(angle) * 3.55, -1.42, Math.sin(angle) * 3.55);
    cassette.rotation.y = -angle;
    const target = addMesh(parts.divertor, new THREE.BoxGeometry(.48, .055, .9), heatMaterial, `divertor target ${index + 1}`);
    target.position.copy(cassette.position);
    target.position.y -= .14;
    target.rotation.y = -angle;
  }
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.045, .32, .82), copper, 48);
  fins.name = 'divertor cooling fins';
  for (let index = 0; index < 48; index++) {
    const angle = Math.floor(index / 4) / 12 * TAU;
    const offset = (index % 4 - 1.5) * .13;
    setInstance(fins, index, dummy, [Math.cos(angle) * (3.55 + offset), -1.58, Math.sin(angle) * (3.55 + offset)], [0, -angle, 0]);
  }
  fins.instanceMatrix.needsUpdate = true;
  parts.divertor.add(fins);

  // 18 blanket modules, each with a ceramic insert and two coolant channels.
  for (let index = 0; index < 18; index++) {
    const angle = index / 18 * TAU;
    const module = new THREE.Group();
    module.name = `blanket module ${index + 1}`;
    module.position.set(Math.cos(angle) * 4.55, 0, Math.sin(angle) * 4.55);
    module.rotation.y = -angle;
    addMesh(module, new THREE.BoxGeometry(.76, 1.36, .42), steel, 'blanket structural frame');
    addMesh(module, new THREE.BoxGeometry(.64, 1.12, .46), ceramic, 'breeding ceramic insert');
    for (const side of [-1, 1]) {
      const pipe = addMesh(module, new THREE.CylinderGeometry(.045, .045, 1.48, 8), heatMaterial, 'coolant channel');
      pipe.position.x = side * .23;
    }
    parts.blanket.add(module);
  }

  const neutrons = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 7, 6), neutronMaterial, 112);
  neutrons.name = 'neutral neutrons crossing the blanket';
  neutrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  neutrons.frustumCulled = false;
  root.add(neutrons);
  const heatPulses = new THREE.InstancedMesh(new THREE.SphereGeometry(.075, 7, 6), heatMaterial, 36);
  heatPulses.name = 'coolant heat pulses';
  heatPulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heatPulses.frustumCulled = false;
  root.add(heatPulses);

  // Conceptual future plant only. It is never presented as an ITER subsystem.
  const powerConcept = new THREE.Group();
  powerConcept.name = 'conceptual future steam turbine — not ITER';
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.5, .6, 0), new THREE.Vector3(6.2, .6, 0), new THREE.Vector3(6.8, 1.4, 0),
    new THREE.Vector3(6.8, 2.5, 0), new THREE.Vector3(8.1, 2.5, 0),
  ]);
  addMesh(powerConcept, new THREE.TubeGeometry(pipeCurve, 30, .1, 8, false), conceptMaterial, 'conceptual steam pipe');
  const turbine = addMesh(powerConcept, new THREE.CylinderGeometry(.52, .52, 1.2, 24), conceptMaterial, 'conceptual steam turbine');
  turbine.rotation.z = Math.PI / 2;
  turbine.position.set(7.2, 1.55, 0);
  const generator = addMesh(powerConcept, new THREE.CylinderGeometry(.42, .42, 1, 20), conceptMaterial, 'conceptual generator');
  generator.rotation.z = Math.PI / 2;
  generator.position.set(8.55, 1.55, 0);
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * TAU;
    const blade = addMesh(powerConcept, new THREE.BoxGeometry(.12, .9, .16), conceptMaterial, `turbine blade ${index + 1}`);
    blade.position.set(7.2 + Math.cos(angle) * .22, 1.55 + Math.sin(angle) * .22, 0);
    blade.rotation.z = angle;
  }
  powerConcept.visible = false;
  root.add(powerConcept);

  // LOD preserves the silhouette when detailed parts are too small to resolve.
  const lod = new THREE.LOD();
  const high = new THREE.Group();
  for (const group of Object.values(parts)) high.add(group);
  const low = new THREE.Group();
  const lowShell = addMesh(low, new THREE.TorusGeometry(3.8, 1.05, 10, 40), vesselGlass, 'LOD vessel silhouette');
  lowShell.rotation.x = Math.PI / 2;
  const lowCoils = addMesh(low, new THREE.TorusGeometry(4.8, .12, 8, 48), copper, 'LOD coil silhouette');
  lowCoils.rotation.x = Math.PI / 2;
  const lowBlanket = addMesh(low, new THREE.TorusGeometry(4.5, .24, 8, 48), steel, 'LOD blanket silhouette');
  lowBlanket.rotation.x = Math.PI / 2;
  lod.addLevel(high, 0);
  lod.addLevel(low, 34);
  root.add(lod);
  // Keep public part references available for highlighting while LOD owns the scene graph.
  const highlight = addMesh(root, new THREE.TorusGeometry(.46, .025, 6, 36), beamMaterial, 'selected component marker');
  highlight.rotation.x = Math.PI / 2;
  highlight.visible = false;

  const anchors = Object.freeze({
    vessel: new THREE.Vector3(4.65, .35, .1),
    coils: new THREE.Vector3(-4.75, .75, .2),
    plasma: new THREE.Vector3(0, .8, 0),
    divertor: new THREE.Vector3(2.1, -1.65, 2.1),
    blanket: new THREE.Vector3(-2.4, .35, -4.1),
  });
  let quality = 2;
  let selected = null;
  let conceptOpacity = 0;

  function update(state, clock, delta = 0) {
    const time = Number.isFinite(clock) ? clock : 0;
    const step = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
    const modeWeights = state.weights || { reaction: .2, heat: .1 };
    plasmaMaterial.uniforms.uTime.value = time;
    plasmaMaterial.uniforms.uIntensity.value = .35 + state.reactionIntensity * 1.8;
    plasmaCoreMaterial.opacity = .12 + state.reactionIntensity * .55;
    copper.emissiveIntensity = .12 + modeWeights.fields * .2;
    heatMaterial.emissiveIntensity = .18 + modeWeights.heat * .65;
    beamMaterial.opacity = .4 + modeWeights.plasma * .24;
    const pulse = 1 + Math.sin(time * 3) * .012 * state.reactionIntensity;
    parts.plasma.scale.setScalar(pulse);

    const tracerCount = [24, 40, 52, 64][quality];
    fieldTracers.count = tracerCount;
    for (let index = 0; index < tracerCount; index++) {
      const u = (index / tracerCount + time * .025 * (state.mode === 'confinement' ? 2.2 : 1)) % 1;
      const v = (index * .173 + time * .035) % 1;
      const point = torusPoint(u, v);
      setInstance(fieldTracers, index, dummy, [point.x, point.y, point.z]);
    }
    fieldTracers.instanceMatrix.needsUpdate = true;

    const neutronCount = [40, 64, 88, 112][quality];
    neutrons.count = neutronCount;
    neutrons.visible = state.reactionIntensity > .015 && (state.mode === 'reaction' || state.mode === 'blanket');
    for (let index = 0; index < neutronCount; index++) {
      const progress = (state.phase * 1.8 + index / neutronCount + random() * .002) % 1;
      const point = neutronSample(progress, index);
      const scale = .45 + point.opacity * .8;
      setInstance(neutrons, index, dummy, [point.x, point.y, point.z], [0, 0, 0], [scale, scale, scale]);
    }
    neutrons.instanceMatrix.needsUpdate = true;

    const heatCount = [12, 20, 28, 36][quality];
    heatPulses.count = heatCount;
    heatPulses.visible = modeWeights.heat > .2;
    for (let index = 0; index < heatCount; index++) {
      const angle = index / heatCount * TAU + time * .05;
      const travel = (time * .32 + index * .17) % 1;
      const radius = 4.15 + travel * .9;
      setInstance(heatPulses, index, dummy, [Math.cos(angle) * radius, -.7 + travel * 1.4, Math.sin(angle) * radius]);
    }
    heatPulses.instanceMatrix.needsUpdate = true;

    conceptOpacity = THREE.MathUtils.lerp(conceptOpacity, state.powerConceptual ? .62 : 0, step > 0 ? 1 - Math.exp(-step * 5) : 1);
    conceptMaterial.opacity = conceptOpacity;
    powerConcept.visible = conceptOpacity > .015;
    powerConcept.scale.setScalar(.96 + conceptOpacity * .07);
    turbine.rotation.x = time * 2.2;

    highlight.visible = Boolean(selected);
    if (selected) {
      highlight.position.copy(anchors[selected]);
      highlight.position.y += .28 + Math.sin(time * 2.5) * .07;
      highlight.scale.setScalar(.9 + Math.sin(time * 3) * .08);
    }
  }

  return {
    root,
    anchors,
    stats: MODEL_STATS,
    update,
    setQuality(level) { quality = Math.min(3, Math.max(0, Number.isFinite(level) ? level : 2)); },
    setSelected(id) { selected = COMPONENT_IDS.includes(id) ? id : null; },
    get quality() { return quality; },
  };
}
