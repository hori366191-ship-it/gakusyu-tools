import * as THREE from 'three';
import { createOptogeneticsModel } from './model.mjs';
import { HOTSPOTS } from './content.mjs';

const NODE_IDS = Object.freeze(Object.keys(HOTSPOTS));
const TAU = Math.PI * 2;
const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const MAX_DPR = [.75, 1, 1.3, 1.65];

function makeDust() {
  const group = new THREE.Group();
  group.name = 'procedural laboratory dust';
  let seed = 4107;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const [count, size, opacity] of [[620, .055, .34], [150, .085, .45]]) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const angle = random() * TAU;
      const radius = 12 + random() * 36;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (random() - .5) * 30;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x75bfd1, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.userData.fullCount = count;
    group.add(points);
  }
  return group;
}

function makeFloor() {
  const group = new THREE.Group();
  group.name = 'exhibition measurement plinth';
  group.position.y = -2.25;
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x397c91, transparent: true, opacity: .21, side: THREE.DoubleSide, depthWrite: false });
  for (const radius of [3.1, 5.3, 7.7, 10.1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .018, radius + .018, 96), lineMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  const positions = [];
  for (let index = 0; index < 32; index++) {
    const angle = index / 32 * TAU;
    positions.push(Math.cos(angle) * 2.1, 0, Math.sin(angle) * 2.1, Math.cos(angle) * 10.1, 0, Math.sin(angle) * 10.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x2c586a, transparent: true, opacity: .17, depthWrite: false })));
  const plate = new THREE.Mesh(new THREE.CircleGeometry(2.8, 72), new THREE.MeshPhysicalMaterial({ color: 0x102532, metalness: .65, roughness: .31, transparent: true, opacity: .36, side: THREE.DoubleSide }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -.04;
  group.add(plate);
  const scan = new THREE.Mesh(new THREE.RingGeometry(1.8, 1.84, 72), new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: .24, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  scan.rotation.x = -Math.PI / 2;
  scan.position.y = .012;
  group.add(scan);
  return { group, scan };
}

export function createOptogeneticsViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    throw new Error('WebGL renderer could not be created', { cause: error });
  }
  renderer.setClearColor(0x030810, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030810, .012);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 180);
  const model = createOptogeneticsModel();
  const dust = makeDust();
  const floor = makeFloor();
  scene.add(model.root, dust, floor.group);
  scene.add(new THREE.HemisphereLight(0xc6efff, 0x07101b, 2.0));
  const key = new THREE.DirectionalLight(0xe1f8ff, 3.3);
  key.position.set(-4, 9, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6e8fff, 2.4);
  rim.position.set(8, 4, -7);
  scene.add(rim);
  const fill = new THREE.PointLight(0x63e6ff, 14, 24, 2);
  fill.position.set(-3, 2, 4);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffc07a, 8, 16, 2);
  warm.position.set(6, 1, 3);
  scene.add(warm);

  const desiredTarget = new THREE.Vector3();
  const actualTarget = new THREE.Vector3(.3, .1, 0);
  const offset = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let yaw = .36;
  let pitch = .27;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let zoom = 1;
  let desiredDistance = 21;
  let actualDistance = desiredDistance;
  let view = 'overall';
  let selectedNode = null;
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
    onQuality?.(`自動品質・${QUALITY_NAMES[level]} / DPR≤${MAX_DPR[level]}`);
  }

  function fitDistance(radius = 8.6, fraction = .78) {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return radius / Math.tan(Math.min(vertical, horizontal) / 2) / fraction;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 50 : 46;
    camera.updateProjectionMatrix();
    const pixelRatio = Math.min(devicePixelRatio || 1, MAX_DPR[level], Math.sqrt(1600000 / (width * height)));
    renderer.setPixelRatio(Math.max(.65, pixelRatio));
    renderer.setSize(width, height, false);
    model.setQuality(level);
    for (const points of dust.children) points.geometry.setDrawRange(0, Math.floor(points.userData.fullCount * [.48, .68, .86, 1][level]));
    qualityChanged();
  }

  function updateCamera(delta) {
    if (view === 'node' && selectedNode) {
      desiredTarget.copy(model.nodeAnchor(selectedNode)).multiplyScalar(.68);
      desiredDistance = fitDistance(3.8, .80) * zoom;
    } else {
      desiredTarget.set(.3, .1, 0);
      desiredDistance = fitDistance() * zoom;
    }
    desiredDistance = THREE.MathUtils.clamp(desiredDistance, 7, 70);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 6.5);
    actualTarget.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualDistance = THREE.MathUtils.lerp(actualDistance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * actualDistance;
    offset.set(Math.sin(actualYaw) * horizontal, Math.sin(actualPitch) * actualDistance, Math.cos(actualYaw) * horizontal);
    camera.position.copy(actualTarget).add(offset);
    camera.lookAt(actualTarget);
    camera.updateMatrixWorld();
  }

  function updateHotspots() {
    if (!hotspotLayer) return;
    const compact = width <= 980;
    const left = width > 1199 ? 274 : width > 980 ? 226 : 206;
    const right = width - (width > 1199 ? 366 : width > 980 ? 326 : 306);
    const top = width > 980 ? 264 : 302;
    const bottom = height - 206;
    for (const id of NODE_IDS) {
      const button = hotspotLayer.querySelector(`[data-node="${id}"]`);
      if (!button) continue;
      projected.copy(model.nodeAnchor(id)).project(camera);
      const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .88;
      button.hidden = !active || compact || !inFrame || right <= left;
      if (button.hidden) continue;
      const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, left, right);
      const y = THREE.MathUtils.clamp((1 - projected.y) * height / 2 - 32, top, Math.max(top + 44, bottom));
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
    if (frame.playing && !reduced.matches) clock += delta * (Number.isFinite(frame.rate) ? frame.rate : 1);
    model.update(state, reduced.matches ? 0 : clock, reduced.matches ? 0 : delta);
    floor.scan.scale.setScalar(1 + ((clock * .13) % 1) * 4.2);
    floor.scan.material.opacity = .22 * (1 - ((clock * .13) % 1));
    dust.rotation.y = clock * .006;
    updateCamera(delta);
    renderer.render(scene, camera);
    updateHotspots();
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.16, 1.15);
  }

  function zoomBy(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, .52, 2.3);
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
      if (distance > 0 && pinch.distance > 0) zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / distance, .52, 2.3);
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
    yaw = .36;
    pitch = .27;
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
    host.removeEventListener('keydown', keyControl);
    const canvas = renderer.domElement;
    canvas.removeEventListener('pointerdown', startPointer);
    canvas.removeEventListener('pointermove', movePointer);
    canvas.removeEventListener('pointerup', endPointer);
    canvas.removeEventListener('pointercancel', endPointer);
    canvas.removeEventListener('lostpointercapture', endPointer);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('dblclick', resetView);
    canvas.removeEventListener('webglcontextlost', contextLost);
    const geometries = new Set();
    const materials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    renderer.dispose();
    canvas.remove();
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
  host.addEventListener('keydown', keyControl);
  coarse.addEventListener('change', pointerModeChanged);
  document.addEventListener('visibilitychange', resetFrameTime);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  qualityChanged();
  updateCamera(0);
  renderer.render(scene, camera);

  return {
    render,
    focusNode,
    resetView,
    zoomIn: () => zoomBy(.88),
    zoomOut: () => zoomBy(1.14),
    resetFrameTime,
    resetAnimation() { clock = 0; previousNow = undefined; },
    dispose,
    get quality() { return level; },
    get stats() { return model.stats; },
  };
}
