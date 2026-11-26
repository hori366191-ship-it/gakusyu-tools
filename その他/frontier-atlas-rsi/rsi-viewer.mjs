import * as THREE from 'three';
import { createRSIModel } from './rsi-model.mjs';
import { NODE_IDS } from './content.mjs';

const TAU = Math.PI * 2;
const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStars() {
  const random = seededRandom(2601);
  const group = new THREE.Group();
  for (const [count, size, color, near] of [[1200, 1.15, 0xd9ecff, false], [260, .075, 0x72e4ed, true]]) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const theta = random() * TAU;
      const y = random() * 2 - 1;
      const radius = near ? 12 + random() * 38 : 110 + random() * 190;
      const horizontal = Math.sqrt(1 - y * y);
      positions[index * 3] = Math.cos(theta) * horizontal * radius;
      positions[index * 3 + 1] = y * radius;
      positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: near ? .42 : .78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    points.userData.fullCount = count;
    group.add(points);
  }
  return group;
}

function makeNebula() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(93, 62, 160, .34)');
  gradient.addColorStop(.35, 'rgba(39, 92, 126, .18)');
  gradient.addColorStop(1, 'rgba(3, 6, 13, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  for (const [position, scale, color] of [
    [[-92, 28, -145], [150, 105, 1], 0xb59aff],
    [[105, -18, -180], [180, 120, 1], 0x64cce2],
    [[15, 70, -210], [120, 90, 1], 0x587dff],
  ]) {
    const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity: .52, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...position);
    sprite.scale.set(...scale);
    group.add(sprite);
  }
  return group;
}

function makeHoloFloor() {
  const group = new THREE.Group();
  group.name = 'holographic floor';
  group.position.y = -1.42;
  const material = new THREE.MeshBasicMaterial({ color: 0x2e7f91, transparent: true, opacity: .16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const radius of [2.4, 4.2, 6.4, 8.8, 11.4]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .018, radius + .018, 96), material);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  const spokePositions = [];
  for (let index = 0; index < 24; index++) {
    const angle = index / 24 * TAU;
    spokePositions.push(Math.cos(angle) * 1.6, 0, Math.sin(angle) * 1.6, Math.cos(angle) * 11.4, 0, Math.sin(angle) * 11.4);
  }
  const spokeGeometry = new THREE.BufferGeometry();
  spokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spokePositions, 3));
  group.add(new THREE.LineSegments(spokeGeometry, new THREE.LineBasicMaterial({ color: 0x28566b, transparent: true, opacity: .18, depthWrite: false })));
  const scanMaterial = material.clone();
  scanMaterial.opacity = .32;
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.5, 72), scanMaterial);
  scanRing.rotation.x = -Math.PI / 2;
  scanRing.position.y = .012;
  group.add(scanRing);
  return { group, scanRing, scanMaterial };
}

function makeComputeModules() {
  const random = seededRandom(771);
  const group = new THREE.Group();
  group.name = 'floating compute modules';
  const material = new THREE.MeshStandardMaterial({ color: 0x18313d, emissive: 0x123946, emissiveIntensity: .75, metalness: .78, roughness: .3 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .12, .28), material, 28);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 28; index++) {
    const angle = random() * TAU;
    const radius = 9.5 + random() * 7;
    dummy.position.set(Math.cos(angle) * radius, -1 + random() * 5.5, Math.sin(angle) * radius);
    dummy.rotation.set(random() * .5, random() * TAU, random() * .4);
    dummy.scale.setScalar(.7 + random() * .9);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.fullCount = 28;
  mesh.frustumCulled = false;
  group.add(mesh);
  return { group, mesh };
}

export function createRSIViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03060d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060d, .008);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 650);
  const model = createRSIModel();
  scene.add(model.root);
  const stars = makeStars();
  const nebula = makeNebula();
  const holo = makeHoloFloor();
  const modules = makeComputeModules();
  scene.add(stars, nebula, holo.group, modules.group);

  const grid = new THREE.GridHelper(30, 30, 0x285166, 0x183042);
  grid.position.y = -1.4;
  grid.material.transparent = true;
  grid.material.opacity = .08;
  grid.material.depthWrite = false;
  scene.add(grid);

  scene.add(new THREE.HemisphereLight(0xc4efff, 0x080b16, 1.7));
  const key = new THREE.DirectionalLight(0xe2f8ff, 3.2);
  key.position.set(7, 11, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa888ff, 2.1);
  rim.position.set(-9, 4, -7);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x4ccce0, 1.15);
  fill.position.set(2, -4, 8);
  scene.add(fill);

  const desiredTarget = new THREE.Vector3();
  const actualTarget = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let yaw = .56;
  let pitch = .36;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let zoom = 1;
  let desiredDistance = 22;
  let actualDistance = desiredDistance;
  let selectedNode = null;
  let view = 'overall';
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true;
  let disposed = false;
  let previousNow;
  let clock = 0;
  let warmup = 1.2;
  let perfTime = 0;
  let perfFrames = 0;
  let fastWindows = 0;
  let drag = null;
  let pinch = null;
  const pointers = new Map();

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function fitDistance(radius = 7.9, fraction = .82) {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return radius / Math.tan(Math.min(vertical, horizontal) / 2) / fraction;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 50 : 48;
    camera.updateProjectionMatrix();
    const maxRatio = [.7, 1, 1.25, 1.6][level];
    const ratio = Math.min(devicePixelRatio || 1, maxRatio, Math.sqrt(1500000 / (width * height)));
    renderer.setPixelRatio(Math.max(.65, ratio));
    renderer.setSize(width, height, false);
    model.setQuality(level);
    for (const points of stars.children) {
      points.geometry.setDrawRange(0, Math.floor(points.userData.fullCount * [.5, .7, .88, 1][level]));
    }
    modules.mesh.count = [10, 16, 22, 28][level];
    qualityChanged();
  }

  function updateCamera(delta) {
    if (view === 'node' && selectedNode) {
      desiredTarget.copy(model.nodeAnchor(selectedNode)).multiplyScalar(.52);
      desiredDistance = fitDistance(4.4, .78) * zoom;
    } else {
      desiredTarget.set(0, 0, 0);
      desiredDistance = fitDistance() * zoom;
    }
    desiredDistance = THREE.MathUtils.clamp(desiredDistance, 10, 85);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 6.5);
    actualTarget.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualDistance = THREE.MathUtils.lerp(actualDistance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * actualDistance;
    cameraOffset.set(Math.sin(actualYaw) * horizontal, Math.sin(actualPitch) * actualDistance, Math.cos(actualYaw) * horizontal);
    camera.position.copy(actualTarget).add(cameraOffset);
    camera.lookAt(actualTarget);
    camera.updateMatrixWorld();
  }

  function updateHotspots(state) {
    if (!hotspotLayer) return;
    const compact = width <= 980;
    const left = width > 1199 ? 274 : width > 980 ? 226 : 206;
    const right = width - (width > 1199 ? 366 : width > 980 ? 326 : 306);
    const top = width > 980 ? 218 : 260;
    const bottom = height - 222;
    for (const id of NODE_IDS) {
      const button = hotspotLayer.querySelector(`[data-node="${id}"]`);
      if (!button) continue;
      projected.copy(model.nodeAnchor(id)).project(camera);
      const inDepth = projected.z > -1 && projected.z < 1;
      const inFrame = Math.abs(projected.x) < .94 && Math.abs(projected.y) < .9;
      button.hidden = !active || compact || !inDepth || !inFrame || right <= left;
      if (button.hidden) continue;
      const rawX = (projected.x + 1) * width / 2;
      const rawY = (1 - projected.y) * height / 2 - 38;
      const x = THREE.MathUtils.clamp(rawX, left, right);
      const y = THREE.MathUtils.clamp(rawY, top, Math.max(top + 44, bottom));
      button.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    const gateLabel = hotspotLayer.querySelector('#gate-label');
    const generationLabel = hotspotLayer.querySelector('#generation-label');
    const placeLabel = (element, anchor, visible) => {
      if (!element) return;
      projected.copy(anchor).project(camera);
      const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .9 && Math.abs(projected.y) < .86;
      element.hidden = !active || compact || !visible || !inFrame;
      if (element.hidden) return;
      const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, left + 70, right - 70);
      const y = THREE.MathUtils.clamp((1 - projected.y) * height / 2 - 24, top + 20, bottom - 10);
      element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    placeLabel(gateLabel, model.gateAnchor(), state.mode === 'assisted');
    placeLabel(generationLabel, model.innerAnchor(), state.mode === 'hypothesis');
  }

  function tuneQuality(rawDelta) {
    if (warmup > 0) {
      warmup -= Math.min(.1, rawDelta);
      return;
    }
    perfTime += Math.min(.14, rawDelta);
    perfFrames++;
    if (perfTime < 2.1) return;
    const milliseconds = perfTime * 1000 / perfFrames;
    perfTime = perfFrames = 0;
    let next = level;
    if (milliseconds > 34) {
      next = Math.max(0, level - 1);
      fastWindows = 0;
    } else if (milliseconds < 20 && level < ceiling) {
      fastWindows++;
      if (fastWindows >= 4) {
        next++;
        fastWindows = 0;
      }
    } else fastWindows = 0;
    if (next !== level) {
      level = next;
      resize();
      warmup = .8;
    }
  }

  function render(state, frame = {}) {
    if (!active || disposed || document.hidden) {
      previousNow = undefined;
      return;
    }
    const now = Number.isFinite(frame.now) ? frame.now : performance.now();
    const rawDelta = previousNow === undefined ? 0 : Math.max(0, (now - previousNow) / 1000);
    previousNow = now;
    const delta = Math.min(.06, rawDelta);
    if (frame.playing && !reduced.matches) {
      clock += delta * (Number.isFinite(frame.rate) ? frame.rate : 1) * (state.mode === 'hypothesis' ? 2.15 : 1);
    }
    model.update(state, clock, reduced.matches ? 0 : delta);
    holo.group.rotation.y = clock * .018;
    holo.scanRing.scale.setScalar(1 + ((clock * .16) % 1) * 5.2);
    holo.scanMaterial.opacity = .28 * (1 - ((clock * .16) % 1));
    modules.group.rotation.y = clock * .025;
    updateCamera(delta);
    renderer.render(scene, camera);
    updateHotspots(state);
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.18, 1.18);
  }

  function zoomBy(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, .5, 2.4);
  }

  function pointerDistance() {
    const values = [...pointers.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function startPointer(event) {
    if (!active || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      pinch = null;
    } else {
      drag = null;
      pinch = { distance: pointerDistance(), zoom };
    }
    event.preventDefault();
  }

  function movePointer(event) {
    if (!active || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const distance = pointerDistance();
      if (distance > 0 && pinch.distance > 0) zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / distance, .5, 2.4);
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    rotate(dx, dy);
  }

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    if (pointers.size === 1) {
      const [id, point] = [...pointers.entries()][0];
      drag = { id, x: point.x, y: point.y };
      pinch = null;
    } else {
      drag = null;
      pinch = null;
    }
  }

  function wheel(event) {
    if (!active) return;
    event.preventDefault();
    zoomBy(Math.exp(event.deltaY * .0011));
  }

  function keyControl(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.target !== host) return;
    const keys = { ArrowLeft: [-34, 0], ArrowRight: [34, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] };
    if (keys[event.key]) {
      event.preventDefault();
      rotate(...keys[event.key]);
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      zoomBy(['+', '='].includes(event.key) ? .88 : 1.14);
    } else if (event.key === 'Home') {
      event.preventDefault();
      resetView();
    }
  }

  function resetView() {
    view = 'overall';
    selectedNode = null;
    model.setSelectedNode(null);
    yaw = .56;
    pitch = .36;
    zoom = 1;
  }

  function focusNode(id) {
    if (!NODE_IDS.includes(id)) return;
    view = 'node';
    selectedNode = id;
    model.setSelectedNode(id);
    zoom = 1;
  }

  function pointerModeChanged() {
    ceiling = coarse.matches ? 1 : 3;
    level = Math.min(level, ceiling);
    resize();
  }

  function resetFrameTime() {
    previousNow = undefined;
  }

  function contextLost(event) {
    event.preventDefault();
    active = false;
    resetFrameTime();
    onContextLost?.('WebGLの描画が停止しました。2D模式図と解説を表示しています。');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    observer.disconnect();
    coarse.removeEventListener('change', pointerModeChanged);
    document.removeEventListener('visibilitychange', resetFrameTime);
    window.removeEventListener('keydown', keyControl);
    renderer.domElement.removeEventListener('pointerdown', startPointer);
    renderer.domElement.removeEventListener('pointermove', movePointer);
    renderer.domElement.removeEventListener('pointerup', endPointer);
    renderer.domElement.removeEventListener('pointercancel', endPointer);
    renderer.domElement.removeEventListener('lostpointercapture', endPointer);
    renderer.domElement.removeEventListener('wheel', wheel);
    renderer.domElement.removeEventListener('dblclick', resetView);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', startPointer);
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', resetView);
  canvas.addEventListener('webglcontextlost', contextLost);
  window.addEventListener('keydown', keyControl);
  coarse.addEventListener('change', pointerModeChanged);
  document.addEventListener('visibilitychange', resetFrameTime);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  qualityChanged();

  return {
    render,
    focusNode,
    resetView,
    zoomIn: () => zoomBy(.88),
    zoomOut: () => zoomBy(1.14),
    resetFrameTime,
    dispose,
    get quality() { return level; },
    get stats() { return model.stats; },
  };
}
