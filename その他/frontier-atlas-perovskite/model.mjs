import * as THREE from 'three';
import { COMPONENT_IDS } from './content.mjs';
import { BAND_STRUCTURE, TAU, carrierSample, photonSample } from './state.mjs';

export const MODEL_STATS = Object.freeze({
  logicalParts: 593,
  meshObjects: 30,
  instancedDetails: 563,
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

function createPerovskiteMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uExcitation: { value: .6 },
      uDegradation: { value: 0 },
      uColorA: { value: new THREE.Color('#ffb35c') },
      uColorB: { value: new THREE.Color('#9d4f74') },
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
      uniform float uExcitation;
      uniform float uDegradation;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 cell = floor(vPosition * 7.0);
        float grain = hash(cell);
        float carrier = 0.5 + 0.5 * sin(vPosition.x * 11.0 + vPosition.z * 8.0 - uTime * 3.0);
        float edge = pow(1.0 - abs(vNormal.z), 2.0);
        float damaged = smoothstep(0.58, 0.82, grain) * uDegradation;
        vec3 color = mix(uColorA, uColorB, grain * 0.55 + carrier * 0.18);
        color = mix(color, vec3(0.12, 0.07, 0.09), damaged * 0.88);
        color *= 0.8 + uExcitation * 0.5 + edge * 0.22;
        gl_FragColor = vec4(color, 0.9);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

export function createPerovskiteModel() {
  const root = new THREE.Group();
  root.name = 'educational perovskite–silicon tandem solar cell';
  const dummy = new THREE.Object3D();
  const parts = Object.fromEntries(COMPONENT_IDS.map(id => [id, new THREE.Group()]));
  for (const [id, group] of Object.entries(parts)) {
    group.name = id;
    root.add(group);
  }

  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb8e6f0, metalness: .05, roughness: .12, transmission: .38, thickness: .18, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide });
  const electrode = new THREE.MeshStandardMaterial({ color: 0xb7c6cc, metalness: .9, roughness: .24, emissive: 0x24323a, emissiveIntensity: .2 });
  const etl = new THREE.MeshPhysicalMaterial({ color: 0x75c8b4, metalness: .12, roughness: .3, transparent: true, opacity: .75, transmission: .08, emissive: 0x123b32, emissiveIntensity: .2 });
  const htl = new THREE.MeshStandardMaterial({ color: 0x8267ad, metalness: .15, roughness: .38, emissive: 0x2d1649, emissiveIntensity: .25 });
  const silicon = new THREE.MeshPhysicalMaterial({ color: 0x244f78, metalness: .62, roughness: .23, clearcoat: .45, emissive: 0x102c4c, emissiveIntensity: .2 });
  const interconnect = new THREE.MeshStandardMaterial({ color: 0x9bb8c5, metalness: .88, roughness: .2 });
  const perovskiteMaterial = createPerovskiteMaterial();
  const sealMaterial = new THREE.MeshStandardMaterial({ color: 0x293b46, metalness: .25, roughness: .52 });
  const bluePhoton = new THREE.MeshBasicMaterial({ color: 0x70a9ff, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
  const greenPhoton = new THREE.MeshBasicMaterial({ color: 0x83f0ba, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const redPhoton = new THREE.MeshBasicMaterial({ color: 0xff8d79, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const electronMaterial = new THREE.MeshBasicMaterial({ color: 0x75eaff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const holeMaterial = new THREE.MeshBasicMaterial({ color: 0xff8ed7, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const degradationMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1820, metalness: .05, roughness: .82, transparent: true, opacity: 0, emissive: 0x3f101b, emissiveIntensity: .3 });

  const stack = new THREE.Group();
  stack.name = 'exploded monolithic tandem stack';
  stack.position.x = -1.2;
  root.add(stack);
  for (const group of [parts.perovskite, parts.silicon, parts.transport, parts.stability]) stack.add(group);

  const layers = [
    { id: 'stability', name: 'protective cover glass', y: 2.35, height: .13, width: 5.7, depth: 3.9, material: glass },
    { id: 'transport', name: 'front transparent electrode', y: 2.03, height: .07, width: 5.45, depth: 3.7, material: electrode },
    { id: 'transport', name: 'electron transport layer', y: 1.72, height: .12, width: 5.25, depth: 3.55, material: etl },
    { id: 'perovskite', name: 'wide-bandgap perovskite absorber', y: 1.24, height: .42, width: 5.2, depth: 3.5, material: perovskiteMaterial },
    { id: 'transport', name: 'hole transport layer', y: .78, height: .12, width: 5.25, depth: 3.55, material: htl },
    { id: 'transport', name: 'tandem interconnect', y: .39, height: .08, width: 5.3, depth: 3.6, material: interconnect },
    { id: 'silicon', name: 'crystalline silicon bottom subcell', y: -.24, height: .82, width: 5.35, depth: 3.65, material: silicon },
    { id: 'transport', name: 'rear contact', y: -.84, height: .08, width: 5.4, depth: 3.7, material: electrode },
  ];
  for (const layer of layers) {
    const mesh = addMesh(parts[layer.id], new THREE.BoxGeometry(layer.width, layer.height, layer.depth), layer.material, layer.name);
    mesh.position.y = layer.y;
  }

  const fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .028, 3.4), electrode, 48);
  fingers.name = 'front electrode current-collection fingers';
  for (let index = 0; index < 48; index++) {
    const x = (index % 12 - 5.5) * .42;
    const z = (Math.floor(index / 12) - 1.5) * .78;
    setInstance(fingers, index, dummy, [x, 2.085, z]);
  }
  fingers.instanceMatrix.needsUpdate = true;
  parts.transport.add(fingers);

  const siliconCells = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .025, .25), silicon, 120);
  siliconCells.name = 'silicon surface cell detail';
  for (let index = 0; index < 120; index++) {
    const x = (index % 12 - 5.5) * .4;
    const z = (Math.floor(index / 12) - 4.5) * .31;
    setInstance(siliconCells, index, dummy, [x, .185, z]);
  }
  siliconCells.instanceMatrix.needsUpdate = true;
  parts.silicon.add(siliconCells);

  const interconnectBars = new THREE.InstancedMesh(new THREE.BoxGeometry(.045, .08, 3.45), interconnect, 24);
  interconnectBars.name = 'interconnect contact bars';
  for (let index = 0; index < 24; index++) {
    const x = (index % 12 - 5.5) * .42;
    const z = (Math.floor(index / 12) - .5) * 1.5;
    setInstance(interconnectBars, index, dummy, [x, .39, z]);
  }
  interconnectBars.instanceMatrix.needsUpdate = true;
  parts.transport.add(interconnectBars);

  // 27 A + 27 B + 81 X sites form an explicitly schematic ABX3 lattice cutaway.
  const lattice = parts.lattice;
  lattice.position.set(3.55, .25, 0);
  const aMaterial = new THREE.MeshStandardMaterial({ color: 0x71dfd7, metalness: .2, roughness: .32, emissive: 0x174c4c, emissiveIntensity: .35 });
  const bMaterial = new THREE.MeshStandardMaterial({ color: 0xffc46b, metalness: .55, roughness: .27, emissive: 0x6b3e12, emissiveIntensity: .3 });
  const xMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc9a2ff, metalness: .1, roughness: .26, transmission: .08, transparent: true, opacity: .88 });
  const aSites = new THREE.InstancedMesh(new THREE.SphereGeometry(.15, 10, 7), aMaterial, 27);
  aSites.name = 'A crystal sites';
  const bSites = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.17, 1), bMaterial, 27);
  bSites.name = 'B crystal sites';
  const xSites = new THREE.InstancedMesh(new THREE.SphereGeometry(.085, 8, 6), xMaterial, 81);
  xSites.name = 'X crystal sites';
  let aIndex = 0;
  let bIndex = 0;
  let xIndex = 0;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    const center = [(x - 1) * .72, (y - 1) * .72, (z - 1) * .72];
    setInstance(aSites, aIndex++, dummy, center);
    setInstance(bSites, bIndex++, dummy, center.map((value, axis) => value + (axis === 0 ? .24 : axis === 1 ? .16 : -.12)));
    for (const offset of [[.36,0,0],[-.36,0,0],[0,.36,0],[0,-.36,0],[0,0,.36],[0,0,-.36]]) {
      setInstance(xSites, xIndex++, dummy, center.map((value, axis) => value + offset[axis]));
    }
  }
  for (const mesh of [aSites, bSites, xSites]) {
    mesh.instanceMatrix.needsUpdate = true;
    lattice.add(mesh);
  }
  const latticeFrame = addMesh(lattice, new THREE.BoxGeometry(2.35, 2.35, 2.35), new THREE.MeshBasicMaterial({ color: 0x4c8d99, wireframe: true, transparent: true, opacity: .22 }), 'ABX3 lattice bounding frame');

  // 3D band diagram: bar heights are schematic, not an energy-scale simulation.
  const bands = new THREE.Group();
  bands.name = 'schematic band diagram';
  bands.position.set(-4.65, .15, .35);
  parts.transport.add(bands);
  const bandMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xffb65d, emissive: 0x8a4318, emissiveIntensity: .45, roughness: .35 }),
    new THREE.MeshStandardMaterial({ color: 0x9c6aad, emissive: 0x43204e, emissiveIntensity: .4, roughness: .35 }),
    new THREE.MeshStandardMaterial({ color: 0x67b6ee, emissive: 0x164774, emissiveIntensity: .45, roughness: .35 }),
    new THREE.MeshStandardMaterial({ color: 0x486c9a, emissive: 0x152f57, emissiveIntensity: .4, roughness: .35 }),
  ];
  const bandHeights = [1.55, .85, 1.1, .1];
  for (let index = 0; index < 4; index++) {
    const bar = addMesh(bands, new THREE.BoxGeometry(index < 2 ? 1.15 : 1.35, .11, .18), bandMaterials[index % 4], `schematic band level ${index + 1}`);
    bar.position.set(index < 2 ? -.35 : .45, bandHeights[index], 0);
  }
  const energyAxis = addMesh(bands, new THREE.CylinderGeometry(.018, .018, 2.25, 6), electrode, 'schematic energy axis');
  energyAxis.position.set(-1.18, .9, 0);
  const energyArrow = addMesh(bands, new THREE.ConeGeometry(.08, .2, 8), electrode, 'energy axis arrow');
  energyArrow.position.set(-1.18, 2.08, 0);
  const transitions = new THREE.InstancedMesh(new THREE.SphereGeometry(.06, 7, 6), electronMaterial, 8);
  transitions.name = 'schematic electron transitions';
  for (let index = 0; index < 8; index++) setInstance(transitions, index, dummy, [-.7 + (index % 2) * .68, 1.1 + (index % 4) * .18, .05]);
  transitions.instanceMatrix.needsUpdate = true;
  bands.add(transitions);

  const photons = [bluePhoton, greenPhoton, redPhoton].map((material, index) => {
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.022, .022, .38, 6), material, 16);
    mesh.name = `incoming ${['blue', 'green', 'red'][index]} photons`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  });
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(.052, 8, 6), electronMaterial, 48);
  electrons.name = 'photogenerated electrons moving to ETL';
  electrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  electrons.frustumCulled = false;
  stack.add(electrons);
  const holes = new THREE.InstancedMesh(new THREE.SphereGeometry(.052, 8, 6), holeMaterial, 48);
  holes.name = 'photogenerated holes moving to HTL';
  holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  holes.frustumCulled = false;
  stack.add(holes);

  const degradationPatches = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 8, 6), degradationMaterial, 60);
  degradationPatches.name = 'moisture and interface degradation patches';
  for (let index = 0; index < 60; index++) {
    const x = (index % 10 - 4.5) * .48;
    const z = (Math.floor(index / 10) - 2.5) * .58;
    setInstance(degradationPatches, index, dummy, [x, 1.475 + Math.sin(index) * .012, z], [0, 0, 0], [1, .08, 1]);
  }
  degradationPatches.instanceMatrix.needsUpdate = true;
  parts.stability.add(degradationPatches);
  const sealRods = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, .18, .12), sealMaterial, 24);
  sealRods.name = 'encapsulation edge seal';
  for (let index = 0; index < 24; index++) {
    const side = Math.floor(index / 6);
    const offset = (index % 6 - 2.5) * .82;
    const position = side === 0 ? [-2.65 + offset, 2.29, -1.82] : side === 1 ? [-2.65 + offset, 2.29, 1.82] : side === 2 ? [-2.65, 2.29, -1.45 + offset] : [2.65, 2.29, -1.45 + offset];
    setInstance(sealRods, index, dummy, position);
  }
  sealRods.instanceMatrix.needsUpdate = true;
  parts.stability.add(sealRods);

  const lod = new THREE.LOD();
  const high = new THREE.Group();
  for (const group of [stack, parts.lattice, bands, photons[0], photons[1], photons[2]]) high.add(group);
  const low = new THREE.Group();
  for (const [y, height, material] of [[2.25,.1,glass],[1.65,.1,etl],[1.15,.4,perovskiteMaterial],[.7,.1,htl],[-.3,.8,silicon],[-.9,.1,electrode]]) {
    const proxy = addMesh(low, new THREE.BoxGeometry(5.4, height, 3.7), material, 'LOD tandem layer silhouette');
    proxy.position.set(-1.2, y, 0);
  }
  const lowLattice = addMesh(low, new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshBasicMaterial({ color: 0x6ab4ad, wireframe: true, transparent: true, opacity: .25 }), 'LOD lattice silhouette');
  lowLattice.position.set(3.55, .25, 0);
  lod.addLevel(high, 0);
  lod.addLevel(low, 34);
  root.add(lod);

  const highlight = addMesh(root, new THREE.TorusGeometry(.42, .025, 6, 32), electronMaterial, 'selected component marker');
  highlight.rotation.x = Math.PI / 2;
  highlight.visible = false;
  const anchors = Object.freeze({
    perovskite: new THREE.Vector3(-1.2, 1.35, 1.85),
    silicon: new THREE.Vector3(-1.2, -.25, 1.9),
    lattice: new THREE.Vector3(3.55, 1.2, 1.1),
    transport: new THREE.Vector3(-3.4, 1.75, 1.5),
    stability: new THREE.Vector3(-1.2, 2.5, -.8),
  });
  let quality = 2;
  let selected = null;

  function update(state, clock, delta = 0) {
    const time = Number.isFinite(clock) ? clock : 0;
    perovskiteMaterial.uniforms.uTime.value = time;
    perovskiteMaterial.uniforms.uExcitation.value = state.absorption;
    perovskiteMaterial.uniforms.uDegradation.value = state.degradation;
    degradationMaterial.opacity = Math.min(.9, state.degradation * 1.4);
    degradationPatches.visible = state.degradation > .005;
    glass.opacity = .14 + state.encapsulation / 100 * .08;
    etl.emissiveIntensity = .15 + state.weights.current * .22;
    htl.emissiveIntensity = .18 + state.weights.carriers * .2;
    for (let group = 0; group < photons.length; group++) {
      const mesh = photons[group];
      const count = [6, 10, 13, 16][quality];
      mesh.count = count;
      for (let index = 0; index < count; index++) {
        const globalIndex = group * 16 + index;
        const raw = (state.phase * 1.8 + index / count + group * .11) % 1;
        const point = photonSample(raw, globalIndex);
        const absorbed = group < 2 && raw > .48 + state.absorption * .13;
        const y = absorbed ? 1.55 + Math.sin(time * 4 + index) * .04 : point.y;
        const scale = absorbed ? .35 : .8 + state.photons / 100 * .35;
        setInstance(mesh, index, dummy, [point.x - 1.2, y, point.z], [0, 0, 0], [scale, scale, scale]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.material.opacity = .4 + state.weights.photons * .3;
    }

    const carrierCount = [24, 32, 40, 48][quality];
    electrons.count = holes.count = carrierCount;
    for (let index = 0; index < carrierCount; index++) {
      const raw = (state.phase * 1.4 + index / carrierCount) % 1;
      const electron = carrierSample(raw, 'electron', index);
      const hole = carrierSample(raw, 'hole', index);
      const visibility = .35 + state.collection * .65;
      setInstance(electrons, index, dummy, [electron.x, electron.y, electron.z], [0, 0, 0], [visibility, visibility, visibility]);
      setInstance(holes, index, dummy, [hole.x, hole.y, hole.z], [0, 0, 0], [visibility, visibility, visibility]);
    }
    electrons.instanceMatrix.needsUpdate = true;
    holes.instanceMatrix.needsUpdate = true;
    electrons.visible = holes.visible = state.weights.carriers > .3;
    lattice.rotation.y = Math.sin(time * .16) * .08;
    bands.position.y = .15 + Math.sin(time * .7) * .025 * state.weights.current;
    transitions.rotation.z = time * .08;

    highlight.visible = Boolean(selected);
    if (selected) {
      highlight.position.copy(anchors[selected]);
      highlight.position.y += .23 + Math.sin(time * 2.5) * .06;
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
