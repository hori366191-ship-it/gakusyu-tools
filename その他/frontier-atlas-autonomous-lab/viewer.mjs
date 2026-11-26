import * as THREE from 'three';
import { createAutonomousLabModel } from './model.mjs';
import { HOTSPOT_IDS } from './content.mjs';

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
  const random = seededRandom(4351);
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const radius = 30 + random() * 55;
    const theta = random() * TAU;
    const y = random() * 2 - 1;
    const horizontal = Math.sqrt(1 - y * y);
    positions[index * 3] = Math.cos(theta) * horizontal * radius;
    positions[index * 3 + 1] = y * radius;
    positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x8ba8bd, size: .07, transparent: true, opacity: .48, depthWrite: false }));
  points.userData.fullCount = count;
  return points;
}

function makeHalo() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x7b6dde, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const radius of [7.7, 10.5, 13.8]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .018, radius + .018, 128), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -3.55;
    group.add(ring);
  }
  return group;
}

export function createAutonomousLabViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onStats, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050912, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050912, .008);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 180);
  const model = createAutonomousLabModel();
  scene.add(model.root);
  const stars = makeStars();
  const halo = makeHalo();
  scene.add(stars, halo);

  scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x090c18, 1.8));
  const key = new THREE.DirectionalLight(0xe8f4ff, 3.2);
  key.position.set(6, 11, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b74ff, 2.3);
  rim.position.set(-8, 5, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x55ddd2, 1.25);
  fill.position.set(4, 0, 8);
  scene.add(fill);
  const aiLight = new THREE.PointLight(0x58ded1, 16, 14, 2);
  aiLight.position.set(-3.7, 1, -1.7);
  scene.add(aiLight);
  const plateLight = new THREE.PointLight(0x8f78ff, 8, 10, 2);
  plateLight.position.set(2, 1, 1);
  scene.add(plateLight);

  let width = 1;
  let height = 1;
  let yaw = .55;
  let pitch = .38;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let zoom = 1;
  let desiredDistance = 26;
  let actualDistance = desiredDistance;
  let selectedHotspot = null;
  let view = 'overall';
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true;
  let disposed = false;
  let previousNow;
  let clock = 0;
  let warmup = 1.4;
  let perfTime = 0;
  let perfFrames = 0;
  let fastWindows = 0;
  let drag = null;
  let pinch = null;
  const pointers = new Map();
  const desiredTarget = new THREE.Vector3();
  const actualTarget = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const projected = new THREE.Vector3();

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function fitDistance(radius = 10.4, fraction = .79) {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return radius / Math.tan(Math.min(vertical, horizontal) / 2) / fraction;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 50 : 43;
    camera.updateProjectionMatrix();
    const ratio = Math.min(devicePixelRatio || 1, [.7, 1, 1.25, 1.6][level], Math.sqrt(1600000 / (width * height)));
    renderer.setPixelRatio(Math.max(.65, ratio));
    renderer.setSize(width, height, false);
    model.setQuality(level);
    stars.geometry.setDrawRange(0, Math.floor(stars.userData.fullCount * [.45, .65, .85, 1][level]));
    qualityChanged();
  }

  function updateCamera(delta) {
    if (view === 'hotspot' && selectedHotspot) {
      desiredTarget.copy(model.hotspotAnchor(selectedHotspot));
      desiredDistance = fitDistance(3.6, .82) * zoom;
    } else {
      desiredTarget.set(0, -.55, 0);
      desiredDistance = fitDistance(10.4, .79) * zoom;
    }
    desiredDistance = THREE.MathUtils.clamp(desiredDistance, 5, 65);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 7);
    actualTarget.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualDistance = THREE.MathUtils.lerp(actualDistance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * actualDistance;
    cameraOffset.set(Math.sin(actualYaw) * horizontal, Math.sin(actualPitch) * actualDistance, Math.cos(actualYaw) * horizontal);
    camera.position.copy(actualTarget).add(cameraOffset);
    camera.lookAt(actualTarget);
    camera.updateMatrixWorld();
    model.setCameraQuaternion(camera.quaternion);
  }

  function updateHotspots() {
    if (!hotspotLayer) return;
    const compact = width <= 980;
    const left = width > 1199 ? 258 : width > 980 ? 222 : 205;
    const right = width - (width > 1199 ? 392 : width > 980 ? 344 : 320);
    const top = width > 980 ? 215 : 255;
    const bottom = height - 224;
    for (const id of HOTSPOT_IDS) {
      const button = hotspotLayer.querySelector(`[data-hotspot="${id}"]`);
      if (!button) continue;
      projected.copy(model.hotspotAnchor(id)).project(camera);
      const inDepth = projected.z > -1 && projected.z < 1;
      const inFrame = Math.abs(projected.x) < .95 && Math.abs(projected.y) < .9;
      button.hidden = !active || compact || !inDepth || !inFrame || right <= left;
      if (button.hidden) continue;
      const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, left, right);
      const y = THREE.MathUtils.clamp((1 - projected.y) * height / 2 - 34, top, Math.max(top + 44, bottom));
      button.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  function tuneQuality(rawDelta) {
    if (warmup > 0) {
      warmup -= Math.min(.1, rawDelta);
      return;
    }
    perfTime += Math.min(.14, rawDelta);
    perfFrames++;
    if (perfTime < 2.2) return;
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
      warmup = .9;
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
    if (frame.playing && !reduced.matches) clock += delta * (Number.isFinite(frame.rate) ? frame.rate : 1);
    model.update(state, clock, delta);
    halo.rotation.y = clock * .012;
    stars.rotation.y = clock * .0025;
    updateCamera(delta);
    renderer.render(scene, camera);
    updateHotspots();
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.18, 1.15);
  }

  function zoomBy(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, .48, 2.5);
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
      const current = pointerDistance();
      if (current > 0 && pinch.distance > 0) zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / current, .48, 2.5);
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    rotate(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
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
    const rotations = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -28], ArrowDown: [0, 28] };
    if (rotations[event.key]) {
      event.preventDefault();
      rotate(...rotations[event.key]);
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
    selectedHotspot = null;
    model.setSelectedHotspot(null);
    yaw = .55;
    pitch = .38;
    zoom = 1;
  }

  function focusHotspot(id) {
    if (!HOTSPOT_IDS.includes(id)) return;
    view = 'hotspot';
    selectedHotspot = id;
    model.setSelectedHotspot(id);
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
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
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
  onStats?.(model.stats);

  return {
    render,
    focusHotspot,
    setSelectedHotspot: id => model.setSelectedHotspot(id),
    resetView,
    zoomIn: () => zoomBy(.88),
    zoomOut: () => zoomBy(1.14),
    resetFrameTime,
    dispose,
    get quality() { return level; },
    get stats() { return model.stats; },
  };
}
