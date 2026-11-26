import * as THREE from 'three';
import { createFusionModel } from './model.mjs';
import { COMPONENT_IDS } from './content.mjs';

const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const MAX_DPR = [.75, 1, 1.25, 1.6];

function makeStars() {
  const positions = new Float32Array(540 * 3);
  let seed = 81423;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 540; index++) {
    const angle = random() * Math.PI * 2;
    const height = random() * 2 - 1;
    const radius = 45 + random() * 85;
    const horizontal = Math.sqrt(1 - height * height);
    positions[index * 3] = Math.cos(angle) * horizontal * radius;
    positions[index * 3 + 1] = height * radius;
    positions[index * 3 + 2] = Math.sin(angle) * horizontal * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa9d9e8, size: .11, transparent: true, opacity: .55, depthWrite: false }));
}

function makeExhibitFloor() {
  const group = new THREE.Group();
  group.name = 'instrument pedestal';
  group.position.y = -2.25;
  const material = new THREE.MeshBasicMaterial({ color: 0x3e8fa6, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false });
  for (const radius of [4.8, 6.2, 8.1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .018, radius + .018, 96), material);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  const positions = [];
  for (let index = 0; index < 24; index++) {
    const angle = index / 24 * Math.PI * 2;
    positions.push(Math.cos(angle) * 4.8, 0, Math.sin(angle) * 4.8, Math.cos(angle) * 8.1, 0, Math.sin(angle) * 8.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x2e6b7f, transparent: true, opacity: .2 })));
  return group;
}

export function createFusionViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03080f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03080f, .008);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 260);
  const model = createFusionModel();
  const stars = makeStars();
  const floor = makeExhibitFloor();
  scene.add(model.root, stars, floor);
  scene.add(new THREE.HemisphereLight(0xccefff, 0x0b1119, 1.9));
  const key = new THREE.DirectionalLight(0xe4f6ff, 3.5);
  key.position.set(7, 11, 9);
  const rim = new THREE.DirectionalLight(0x4abfe5, 2.2);
  rim.position.set(-9, 4, -7);
  const warm = new THREE.PointLight(0xff7d45, 16, 18, 2);
  warm.position.set(0, .4, 0);
  scene.add(key, rim, warm);

  const target = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let yaw = .62;
  let pitch = .38;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let zoom = 1;
  let distance = 22;
  let desiredDistance = distance;
  let selected = null;
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true;
  let disposed = false;
  let previousNow;
  let clock = 0;
  let warmup = 1.2;
  let sampleTime = 0;
  let sampleFrames = 0;
  let fastWindows = 0;
  let drag = null;
  let pinch = null;
  const pointers = new Map();

  function fitDistance(radius = 9.6, fraction = .79) {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return radius / Math.tan(Math.min(vertical, horizontal) / 2) / fraction;
  }

  function reportQuality() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]} / DPR ${renderer.getPixelRatio().toFixed(2)}`);
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 620 ? 50 : 46;
    camera.updateProjectionMatrix();
    const budgetRatio = Math.sqrt(1500000 / (width * height));
    renderer.setPixelRatio(Math.max(.65, Math.min(devicePixelRatio || 1, MAX_DPR[level], budgetRatio)));
    renderer.setSize(width, height, false);
    model.setQuality(level);
    stars.geometry.setDrawRange(0, [220, 340, 440, 540][level]);
    reportQuality();
  }

  function updateCamera(delta) {
    if (selected) {
      desiredTarget.copy(model.anchors[selected]).multiplyScalar(.45);
      desiredDistance = fitDistance(5.4, .8) * zoom;
    } else {
      desiredTarget.set(.35, -.1, 0);
      desiredDistance = fitDistance() * zoom;
    }
    desiredDistance = THREE.MathUtils.clamp(desiredDistance, 8, 70);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 6.5);
    target.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    distance = THREE.MathUtils.lerp(distance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * distance;
    offset.set(Math.sin(actualYaw) * horizontal, Math.sin(actualPitch) * distance, Math.cos(actualYaw) * horizontal);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function updateHotspots() {
    if (!hotspotLayer) return;
    const compact = width <= 1050;
    const left = width > 1199 ? 276 : 220;
    const right = width - (width > 1199 ? 390 : 356);
    const top = width > 1050 ? 222 : 260;
    const bottom = height - 215;
    for (const id of COMPONENT_IDS) {
      const button = hotspotLayer.querySelector(`[data-component="${id}"]`);
      if (!button) continue;
      projected.copy(model.anchors[id]).project(camera);
      const visible = active && !compact && projected.z > -1 && projected.z < 1
        && Math.abs(projected.x) < .93 && Math.abs(projected.y) < .88 && right > left;
      button.hidden = !visible;
      if (!visible) continue;
      const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, left, right);
      const y = THREE.MathUtils.clamp((1 - projected.y) * height / 2 - 30, top, Math.max(top + 44, bottom));
      button.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  function tuneQuality(rawDelta) {
    if (warmup > 0) {
      warmup -= Math.min(.1, rawDelta);
      return;
    }
    sampleTime += Math.min(.15, rawDelta);
    sampleFrames++;
    if (sampleTime < 2.2) return;
    const milliseconds = sampleTime * 1000 / sampleFrames;
    sampleTime = sampleFrames = 0;
    let next = level;
    if (milliseconds > 35) {
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
    model.update(state, clock, reduced.matches ? 0 : delta);
    floor.rotation.y = clock * .014;
    updateCamera(delta);
    renderer.render(scene, camera);
    updateHotspots();
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.15, 1.18);
  }

  function zoomBy(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, .48, 2.35);
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
      if (current > 0 && pinch.distance > 0) zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / current, .48, 2.35);
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
    } else drag = pinch = null;
  }

  function wheel(event) {
    if (!active) return;
    event.preventDefault();
    zoomBy(Math.exp(event.deltaY * .0011));
  }

  function keyControl(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.target !== host) return;
    const rotations = { ArrowLeft: [-34, 0], ArrowRight: [34, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] };
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
    selected = null;
    model.setSelected(null);
    yaw = .62;
    pitch = .38;
    zoom = 1;
  }

  function focusComponent(id) {
    if (!COMPONENT_IDS.includes(id)) return;
    selected = id;
    model.setSelected(id);
    zoom = 1;
  }

  function resetFrameTime() { previousNow = undefined; }

  function contextLost(event) {
    event.preventDefault();
    active = false;
    resetFrameTime();
    onContextLost?.('WebGLの描画が停止しました。2D模式図と解説を表示しています。');
  }

  function pointerModeChanged() {
    ceiling = coarse.matches ? 1 : 3;
    level = Math.min(level, ceiling);
    resize();
  }

  function dispose() {
    if (disposed) return;
    disposed = active = false;
    observer.disconnect();
    coarse.removeEventListener('change', pointerModeChanged);
    document.removeEventListener('visibilitychange', resetFrameTime);
    window.removeEventListener('keydown', keyControl);
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
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
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
  window.addEventListener('keydown', keyControl);
  coarse.addEventListener('change', pointerModeChanged);
  document.addEventListener('visibilitychange', resetFrameTime);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  reportQuality();

  return {
    render,
    focusComponent,
    resetView,
    zoomIn: () => zoomBy(.88),
    zoomOut: () => zoomBy(1.14),
    resetFrameTime,
    dispose,
    get quality() { return level; },
    get stats() { return model.stats; },
  };
}
