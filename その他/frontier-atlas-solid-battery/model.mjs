import * as THREE from 'three';
import { COMPONENT_IDS } from './content.mjs';
import { LAYERS, TAU, ionSample } from './state.mjs';

export const MODEL_STATS = Object.freeze({
  logicalParts: 360,
  meshObjects: 56,
  instancedDetails: 304,
  pbrFamilies: 5,
  shaderMaterials: 1,
  lodLevels: 2,
  hotspots: COMPONENT_IDS.length,
  educationalApproximation: true,
});

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

function externalCircuitPoint(progress) {
  const points = [
    [-4, 2.08, .4], [-4.65, 1.45, .4], [-4.65, -1.45, .4], [-4, -2.08, .4], [-1.55, -2.08, .4],
  ];
  const travel = Math.min(.999999, Math.max(0, progress)) * (points.length - 1);
  const index = Math.floor(travel);
  const amount = travel - index;
  const start = points[index];
  const end = points[index + 1];
  return {
    x: start[0] + (end[0] - start[0]) * amount,
    y: start[1] + (end[1] - start[1]) * amount,
    z: start[2] + (end[2] - start[2]) * amount,
  };
}

function createElectrolyteMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 1 },
      uConductivity: { value: .7 },
      uColor: { value: new THREE.Color('#69e6e0') },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uFlow;
      uniform float uConductivity;
      uniform vec3 uColor;
      void main() {
        float sites = pow(0.5 + 0.5 * sin(vPosition.x * 12.0) * sin(vPosition.z * 10.0), 5.0);
        float bands = 0.5 + 0.5 * sin(vPosition.y * 16.0 + uTime * 4.0 * uFlow);
        float edge = pow(1.0 - abs(vNormal.z), 2.0);
        vec3 color = uColor * (0.45 + sites * 0.4 + bands * 0.3 + edge * 0.3);
        gl_FragColor = vec4(color * (0.75 + uConductivity * 0.5), 0.38 + sites * 0.18 + edge * 0.12);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function branch(parent, points, material, radius, name) {
  const group = new THREE.Group();
  group.name = name;
  for (let index = 1; index < points.length; index++) {
    const start = new THREE.Vector3(...points[index - 1]);
    const end = new THREE.Vector3(...points[index]);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const segment = addMesh(group, new THREE.CylinderGeometry(radius * .72, radius, length, 7), material, `${name} segment ${index}`);
    segment.position.copy(start).add(end).multiplyScalar(.5);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  parent.add(group);
  return group;
}

export function createSolidBatteryModel() {
  const root = new THREE.Group();
  root.name = 'educational exploded all-solid-state cell';
  const dummy = new THREE.Object3D();
  const parts = Object.fromEntries(COMPONENT_IDS.map(id => [id, new THREE.Group()]));
  for (const [id, group] of Object.entries(parts)) {
    group.name = id;
    root.add(group);
  }

  const aluminum = new THREE.MeshPhysicalMaterial({ color: 0xb8cbd4, metalness: .92, roughness: .22, clearcoat: .3 });
  const cathodeMaterial = new THREE.MeshStandardMaterial({ color: 0x346ba0, metalness: .28, roughness: .42, emissive: 0x123c68, emissiveIntensity: .25 });
  const lithiumMaterial = new THREE.MeshStandardMaterial({ color: 0xaab9c2, metalness: .9, roughness: .2, emissive: 0x314452, emissiveIntensity: .2 });
  const casingMaterial = new THREE.MeshStandardMaterial({ color: 0x263640, metalness: .65, roughness: .4 });
  const interfaceMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb59ce8, metalness: .15, roughness: .26, transparent: true, opacity: .6, transmission: .08 });
  const electrolyteMaterial = createElectrolyteMaterial();
  const ionMaterial = new THREE.MeshBasicMaterial({ color: 0x69f1ef, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const electronMaterial = new THREE.MeshBasicMaterial({ color: 0xffb263, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const dendriteMaterial = new THREE.MeshStandardMaterial({ color: 0xd5e1e5, metalness: .88, roughness: .23, emissive: 0x5a1724, emissiveIntensity: .55 });
  const riskMaterial = new THREE.MeshBasicMaterial({ color: 0xff617f, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });

  // Main exploded cell, shifted left to leave room for the two comparison cells.
  const main = new THREE.Group();
  main.name = 'main exploded Li | solid electrolyte | cathode cell';
  main.position.x = -1.55;
  root.add(main);
  const mainParts = Object.fromEntries(COMPONENT_IDS.slice(0, 4).map(id => [id, parts[id]]));
  for (const group of Object.values(mainParts)) main.add(group);

  const topCollector = addMesh(parts.collectors, new THREE.BoxGeometry(4.65, .16, 3.18), aluminum, 'positive current collector');
  topCollector.position.y = LAYERS.collectorTop;
  const bottomCollector = addMesh(parts.collectors, new THREE.BoxGeometry(4.65, .16, 3.18), aluminum, 'negative current collector');
  bottomCollector.position.y = LAYERS.collectorBottom;
  for (const y of [LAYERS.collectorTop, LAYERS.collectorBottom]) {
    const tab = addMesh(parts.collectors, new THREE.BoxGeometry(.55, .12, 1.2), aluminum, 'collector tab');
    tab.position.set(-2.45, y, 0);
  }
  const gasket = addMesh(parts.collectors, new THREE.BoxGeometry(4.88, 2.2, .09), casingMaterial, 'pouch frame rear');
  gasket.position.set(0, 0, -1.7);
  const gasketFront = addMesh(parts.collectors, new THREE.BoxGeometry(4.88, 2.2, .06), interfaceMaterial, 'transparent pouch frame front');
  gasketFront.position.set(0, 0, 1.72);

  const cathode = addMesh(parts.cathode, new THREE.BoxGeometry(4.22, .68, 2.82), cathodeMaterial, 'cathode active material');
  cathode.position.y = LAYERS.cathode;
  const cathodeParticles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.13, 1), cathodeMaterial, 32);
  cathodeParticles.name = 'cathode active particles';
  for (let index = 0; index < 32; index++) {
    const x = (index % 8 - 3.5) * .47;
    const z = (Math.floor(index / 8) - 1.5) * .66;
    setInstance(cathodeParticles, index, dummy, [x, LAYERS.cathode + .38 + Math.sin(index) * .02, z], [index * .4, index * .7, 0], [1, .65, 1]);
  }
  cathodeParticles.instanceMatrix.needsUpdate = true;
  parts.cathode.add(cathodeParticles);
  const conductiveAdditives = new THREE.InstancedMesh(new THREE.BoxGeometry(.28, .035, .035), aluminum, 24);
  conductiveAdditives.name = 'cathode conductive network';
  for (let index = 0; index < 24; index++) {
    const x = (index % 6 - 2.5) * .62;
    const z = (Math.floor(index / 6) - 1.5) * .7;
    setInstance(conductiveAdditives, index, dummy, [x, LAYERS.cathode + .43, z], [0, index % 2 ? .5 : -.4, 0]);
  }
  conductiveAdditives.instanceMatrix.needsUpdate = true;
  parts.cathode.add(conductiveAdditives);

  const electrolyte = addMesh(parts.electrolyte, new THREE.BoxGeometry(4.42, .64, 3), electrolyteMaterial, 'solid electrolyte ionic-conduction shader');
  electrolyte.position.y = LAYERS.electrolyte;
  const latticeSites = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.075, 0), ionMaterial, 48);
  latticeSites.name = 'illustrative lithium vacancy sites';
  for (let index = 0; index < 48; index++) {
    const x = (index % 8 - 3.5) * .48;
    const z = (Math.floor(index / 8) - 2.5) * .48;
    setInstance(latticeSites, index, dummy, [x, LAYERS.electrolyte + Math.sin(index * 3.1) * .18, z]);
  }
  latticeSites.instanceMatrix.needsUpdate = true;
  parts.electrolyte.add(latticeSites);
  for (const y of [LAYERS.electrolyte - .36, LAYERS.electrolyte + .36]) {
    const interphase = addMesh(parts.electrolyte, new THREE.BoxGeometry(4.3, .035, 2.9), interfaceMaterial, 'solid-electrolyte interphase');
    interphase.position.y = y;
  }

  const anode = addMesh(parts.anode, new THREE.BoxGeometry(4.22, .38, 2.82), lithiumMaterial, 'lithium metal anode');
  anode.position.y = LAYERS.anode;
  const lithiumLayers = new THREE.InstancedMesh(new THREE.BoxGeometry(4.05, .018, 2.68), lithiumMaterial, 12);
  lithiumLayers.name = 'lithium foil layers';
  for (let index = 0; index < 12; index++) setInstance(lithiumLayers, index, dummy, [0, LAYERS.anode - .15 + index * .027, 0]);
  lithiumLayers.instanceMatrix.needsUpdate = true;
  parts.anode.add(lithiumLayers);
  const deposits = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), lithiumMaterial, 28);
  deposits.name = 'uniform versus uneven lithium deposits';
  for (let index = 0; index < 28; index++) {
    const x = (index % 7 - 3) * .48;
    const z = (Math.floor(index / 7) - 1.5) * .72;
    setInstance(deposits, index, dummy, [x, LAYERS.anode + .24, z], [0, 0, 0], [1.1, .25 + (index % 4) * .08, 1]);
  }
  deposits.instanceMatrix.needsUpdate = true;
  parts.anode.add(deposits);

  // Li ions move only through the electrolyte. Their paths deliberately differ from electrons.
  const ions = new THREE.InstancedMesh(new THREE.SphereGeometry(.055, 8, 6), ionMaterial, 96);
  ions.name = 'lithium ions in solid electrolyte';
  ions.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ions.frustumCulled = false;
  main.add(ions);
  const wireCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 2.08, .4), new THREE.Vector3(-4.65, 1.45, .4),
    new THREE.Vector3(-4.65, -1.45, .4), new THREE.Vector3(-4, -2.08, .4),
    new THREE.Vector3(-1.55, -2.08, .4),
  ], false, 'centripetal');
  addMesh(root, new THREE.TubeGeometry(wireCurve, 40, .035, 7, false), aluminum, 'external electron circuit');
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(.06, 8, 6), electronMaterial, 32);
  electrons.name = 'electrons in the external circuit';
  electrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  electrons.frustumCulled = false;
  root.add(electrons);
  const charger = new THREE.Group();
  charger.name = 'charging source or external load — conceptual';
  charger.position.set(-3.1, 0, .4);
  addMesh(charger, new THREE.BoxGeometry(.72, 1.1, .4), casingMaterial, 'external source or load');
  const chargeMark = addMesh(charger, new THREE.BoxGeometry(.08, .55, .03), electronMaterial, 'current indicator');
  chargeMark.position.z = .23;
  const crossMark = addMesh(charger, new THREE.BoxGeometry(.45, .08, .03), electronMaterial, 'current indicator cross');
  crossMark.position.z = .23;
  parts.collectors.add(charger);

  // Two explicit comparison cells. The vulnerable cell has 28 branch segments;
  // the managed cell has 24 near-uniform deposits and no guaranteed short prevention.
  function makeComparison(x, managed) {
    const group = new THREE.Group();
    group.name = managed ? 'managed interface comparison cell' : 'vulnerable pore comparison cell';
    group.position.set(x, -.2, 0);
    group.scale.setScalar(.66);
    root.add(group);
    for (const [y, height, material, name] of [
      [1.45, .12, aluminum, 'comparison top collector'], [.65, .58, cathodeMaterial, 'comparison cathode'],
      [-.05, .72, electrolyteMaterial, 'comparison solid electrolyte'], [-.82, .28, lithiumMaterial, 'comparison Li anode'],
      [-1.45, .12, aluminum, 'comparison bottom collector'],
    ]) {
      const layer = addMesh(group, new THREE.BoxGeometry(2.55, height, 1.8), material, name);
      layer.position.y = y;
    }
    const growth = new THREE.Group();
    growth.name = managed ? 'near-uniform lithium deposition' : 'lithium dendrite branches';
    growth.position.y = -.64;
    group.add(growth);
    if (managed) {
      const patches = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 8, 6), lithiumMaterial, 24);
      patches.name = 'interface-controlled lithium deposits';
      for (let index = 0; index < 24; index++) {
        const x = (index % 6 - 2.5) * .34;
        const z = (Math.floor(index / 6) - 1.5) * .4;
        setInstance(patches, index, dummy, [x, .03 + (index % 3) * .012, z], [0, 0, 0], [1, .25, 1]);
      }
      patches.instanceMatrix.needsUpdate = true;
      growth.add(patches);
    } else {
      const paths = [
        [[0,0,0],[.05,.35,.02],[.18,.72,.08],[.08,1.1,.02]],
        [[.15,0,.12],[.3,.32,.2],[.52,.58,.26],[.68,.91,.34]],
        [[-.18,0,-.1],[-.32,.3,-.18],[-.5,.62,-.27],[-.64,1.0,-.36]],
        [[-.12,0,.22],[-.2,.38,.4],[-.36,.7,.5],[-.25,1.02,.62]],
        [[.12,0,-.24],[.28,.28,-.36],[.42,.56,-.45],[.55,.85,-.55]],
        [[0,0,.22],[.02,.34,.38],[.14,.66,.52],[.03,.98,.7]],
        [[-.25,0,.04],[-.42,.25,.08],[-.55,.48,.12],[-.75,.7,.16]],
      ];
      for (const [index, points] of paths.entries()) branch(growth, points, dendriteMaterial, .065, `dendrite branch ${index + 1}`);
      const hotspots = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 7, 6), riskMaterial, 8);
      hotspots.name = 'current focusing at dendrite tips';
      for (let index = 0; index < 8; index++) setInstance(hotspots, index, dummy, [Math.sin(index * 2.1) * .5, .7 + (index % 3) * .14, Math.cos(index * 1.7) * .4]);
      hotspots.instanceMatrix.needsUpdate = true;
      growth.add(hotspots);
    }
    return { group, growth };
  }
  const vulnerable = makeComparison(2.0, false);
  const managed = makeComparison(4.65, true);

  // Simplified LOD levels retain the stack and comparison silhouettes at distance.
  const lod = new THREE.LOD();
  const high = new THREE.Group();
  for (const group of [main, vulnerable.group, managed.group, electrons]) high.add(group);
  const low = new THREE.Group();
  for (const [x, y, height, material] of [
    [-1.55, 1.8, .15, aluminum], [-1.55, .8, .7, cathodeMaterial], [-1.55, 0, .7, electrolyteMaterial],
    [-1.55, -.9, .35, lithiumMaterial], [-1.55, -1.8, .15, aluminum],
    [2, .3, 2.4, casingMaterial], [4.65, .3, 2.4, casingMaterial],
  ]) {
    const proxy = addMesh(low, new THREE.BoxGeometry(4.2, height, 2.8), material, 'LOD cell stack silhouette');
    proxy.position.set(x, y, 0);
  }
  lod.addLevel(high, 0);
  lod.addLevel(low, 32);
  root.add(lod);

  const highlight = addMesh(root, new THREE.TorusGeometry(.4, .025, 6, 32), ionMaterial, 'selected component marker');
  highlight.rotation.x = Math.PI / 2;
  highlight.visible = false;
  const anchors = Object.freeze({
    cathode: new THREE.Vector3(-1.55, 1.65, 1.3),
    electrolyte: new THREE.Vector3(-1.55, .1, 1.45),
    anode: new THREE.Vector3(-1.55, -1.35, 1.3),
    collectors: new THREE.Vector3(-4.2, 1.9, .5),
    dendrite: new THREE.Vector3(2.15, .25, 1.25),
  });
  let quality = 2;
  let selected = null;

  function update(state, clock, delta = 0) {
    const time = Number.isFinite(clock) ? clock : 0;
    electrolyteMaterial.uniforms.uTime.value = time;
    electrolyteMaterial.uniforms.uFlow.value = state.migrationDirection;
    electrolyteMaterial.uniforms.uConductivity.value = state.conductivity;
    cathodeMaterial.emissiveIntensity = .12 + state.weights.ions * .18;
    interfaceMaterial.opacity = .35 + state.interface / 100 * .35;
    const ionCount = [48, 64, 80, 96][quality];
    ions.count = ionCount;
    for (let index = 0; index < ionCount; index++) {
      const raw = (state.phase * 2.2 + index / ionCount) % 1;
      const progress = state.migrationDirection < 0 ? raw : 1 - raw;
      const point = ionSample(progress, index % 24, index);
      const scale = .75 + Math.sin(time * 4 + index) * .12;
      setInstance(ions, index, dummy, [point.x, point.y, point.z], [0, 0, 0], [scale, scale, scale]);
    }
    ions.instanceMatrix.needsUpdate = true;

    const electronCount = [12, 20, 26, 32][quality];
    electrons.count = electronCount;
    for (let index = 0; index < electronCount; index++) {
      const raw = (state.phase * 1.6 + index / electronCount) % 1;
      const progress = state.electronDirection < 0 ? raw : 1 - raw;
      const point = externalCircuitPoint(progress);
      setInstance(electrons, index, dummy, [point.x, point.y, point.z]);
    }
    electrons.instanceMatrix.needsUpdate = true;
    chargeMark.visible = state.mode === 'charge' || state.mode === 'dendrite';
    crossMark.visible = state.mode === 'discharge';

    const vulnerableGrowth = state.mode === 'dendrite' ? .08 + state.growth * .96 : state.mode === 'charge' ? .05 + state.growth * .18 : .02;
    const managedGrowth = state.mode === 'dendrite' ? .35 + (1 - state.growth) * .8 : .12;
    vulnerable.growth.scale.y = THREE.MathUtils.lerp(vulnerable.growth.scale.y, vulnerableGrowth, delta > 0 ? 1 - Math.exp(-delta * 4) : 1);
    managed.growth.scale.y = THREE.MathUtils.lerp(managed.growth.scale.y, managedGrowth, delta > 0 ? 1 - Math.exp(-delta * 4) : 1);
    dendriteMaterial.emissiveIntensity = .25 + state.weights.dendrite * .5;
    vulnerable.group.visible = true;
    managed.group.visible = true;

    highlight.visible = Boolean(selected);
    if (selected) {
      highlight.position.copy(anchors[selected]);
      highlight.position.y += .25 + Math.sin(time * 2.5) * .06;
      highlight.scale.setScalar(.9 + Math.sin(time * 3) * .07);
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
