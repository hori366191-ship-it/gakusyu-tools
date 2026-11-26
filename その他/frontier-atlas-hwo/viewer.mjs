import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHWOModel } from './model.mjs';
import { CAMERA_TARGET } from './state.mjs';

const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const TAU = Math.PI * 2;

function seededRandom(seed = 311) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStars() {
  const random = seededRandom();
  const count = 1400;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const y = random() * 2 - 1;
    const horizontal = Math.sqrt(1 - y * y);
    const angle = random() * TAU;
    const radius = 80 + random() * 130;
    positions.set([Math.cos(angle) * horizontal * radius, y * radius, Math.sin(angle) * horizontal * radius], index * 3);
    color.set(index % 7 === 0 ? 0x84dff5 : 0xe5f5ff);
    colors.set([color.r, color.g, color.b], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .14, vertexColors: true, transparent: true, opacity: .78, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.userData.fullCount = count;
  return points;
}

export function createHWOViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050914, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(roomEnvironment, .04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .72;
  scene.fog = new THREE.FogExp2(0x050914, .0065);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 500);
  const model = createHWOModel();
  scene.add(model.root);
  const stars = makeStars();
  scene.add(stars);
  scene.add(new THREE.HemisphereLight(0xb9efff, 0x07101c, 2.2));
  const key = new THREE.DirectionalLight(0xe8fbff, 3.4); key.position.set(8, 14, 11); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b82ff, 2.2); rim.position.set(-10, 3, -8); scene.add(rim);
  const iceLight = new THREE.PointLight(0x4edfff, 18, 28, 2); iceLight.position.set(0, -4, 3); scene.add(iceLight);

  const target = new THREE.Vector3(...CAMERA_TARGET);
  const actualTarget = target.clone();
  const projected = new THREE.Vector3();
  const pointers = new Map();
  let width = 1;
  let height = 1;
  let yaw = .62;
  let pitch = .18;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let zoom = 1;
  let actualZoom = 1;
  let focusId = null;
  let drag = null;
  let pinch = null;
  let active = true;
  let disposed = false;
  let previousNow;
  let level = coarse.matches ? 1 : 2;
  const ceiling = coarse.matches ? 1 : 3;
  let warmup = 1.4;
  let perfTime = 0;
  let perfFrames = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  let raf = 0;

  function fitDistance(radius = 13, fraction = .88) {
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return radius / Math.tan(Math.min(vertical, horizontal) / 2) / fraction;
  }

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 49 : 45;
    camera.updateProjectionMatrix();
    const maxRatio = [.7, 1, 1.25, 1.6][level];
    const pixelBudgetRatio = Math.sqrt(1500000 / Math.max(1, width * height));
    renderer.setPixelRatio(Math.max(.65, Math.min(devicePixelRatio || 1, maxRatio, pixelBudgetRatio)));
    renderer.setSize(width, height, false);
    model.setQuality(level);
    stars.geometry.setDrawRange(0, Math.floor(stars.userData.fullCount * [.45, .65, .85, 1][level]));
    qualityChanged();
  }

  function orbitBy(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.85, 1.05);
  }

  function zoomBy(amount) {
    zoom = THREE.MathUtils.clamp(zoom * amount, .48, 2.6);
  }

  function resetView() {
    focusId = null;
    yaw = .62; pitch = .18; zoom = 1;
  }

  function focus(id) {
    if (!model.anchors[id]) return;
    focusId = id;
    zoom = .72;
  }

  function updateCamera(delta) {
    if (focusId && model.anchors[focusId]) actualTarget.copy(model.anchors[focusId]).lerp(target, .28);
    else actualTarget.lerp(target, .18);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 7);
    actualTarget.lerp(focusId ? model.anchors[focusId] : target, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualZoom = THREE.MathUtils.lerp(actualZoom, zoom, blend);
    const radius = focusId ? 7 : 16;
    const distance = THREE.MathUtils.clamp(fitDistance(radius, focusId ? .78 : .88) * actualZoom, 5, 100);
    const horizontal = Math.cos(actualPitch) * distance;
    camera.position.set(actualTarget.x + Math.sin(actualYaw) * horizontal, actualTarget.y + Math.sin(actualPitch) * distance, actualTarget.z + Math.cos(actualYaw) * horizontal);
    camera.lookAt(actualTarget);
    camera.updateMatrixWorld();
  }

  function updateHotspots() {
    if (!hotspotLayer) return;
    for (const [id, anchor] of Object.entries(model.anchors)) {
      const button = hotspotLayer.querySelector(`[data-hotspot="${id}"]`);
      if (!button) continue;
      projected.copy(anchor).project(camera);
      const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .91 && Math.abs(projected.y) < .88;
      button.hidden = !active || width < 780 || !inFrame;
      if (button.hidden) continue;
      button.style.left = `${(projected.x + 1) * width / 2}px`;
      button.style.top = `${(1 - projected.y) * height / 2}px`;
      button.classList.toggle('is-active', focusId === id);
    }
  }

  function pointerDistance() {
    const values = [...pointers.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function onPointerDown(event) {
    if (!active) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) pinch = { distance: pointerDistance(), zoom };
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const distance = pointerDistance();
      if (distance > 0 && pinch.distance > 0) zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / distance, .48, 2.6);
    } else if (drag) {
      orbitBy(event.clientX - drag.x, event.clientY - drag.y);
    }
    drag = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    drag = pointers.size ? { ...pointers.values().next().value } : null;
    if (pointers.size < 2) pinch = null;
  }

  function onWheel(event) {
    event.preventDefault();
    zoomBy(Math.exp(event.deltaY * .0011));
  }

  function onVisibility() {
    active = !document.hidden;
    previousNow = undefined;
    if (active) onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function handleContextLost(event) {
    event.preventDefault();
    active = false;
    cancelAnimationFrame(raf);
    onContextLost?.('WebGLコンテキストを失いました。2D模式図へ切り替えます。');
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  document.addEventListener('visibilitychange', onVisibility);
  resize();

  function render(state, delta = 0) {
    if (disposed || !active || document.hidden) { previousNow = undefined; return; }
    model.update(state);
    updateCamera(delta);
    updateHotspots();
    renderer.render(scene, camera);
    if (warmup > 0) { warmup -= Math.max(0, delta); return; }
    perfTime += Math.max(0, delta); perfFrames++;
    if (perfTime >= 2 && perfFrames > 20) {
      const average = perfTime / perfFrames;
      if (average > .029 && level > 0) { level--; slowWindows++; fastWindows = 0; resize(); }
      else if (average < .018 && level < ceiling) { fastWindows++; slowWindows = 0; if (fastWindows >= 3) { level++; fastWindows = 0; resize(); } }
      else { slowWindows = 0; fastWindows = 0; }
      perfTime = 0; perfFrames = 0;
    }
    previousNow = delta;
  }

  function resetFrameClock() { previousNow = undefined; }

  function dispose() {
    if (disposed) return;
    disposed = true; active = false;
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerUp);
    renderer.domElement.removeEventListener('wheel', onWheel);
    renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
    document.removeEventListener('visibilitychange', onVisibility);
    stars.geometry.dispose(); stars.material.dispose();
    model.dispose();
    environmentTarget.dispose(); roomEnvironment.dispose(); pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { stats: model.stats, render, orbitBy, zoomBy, resetView, focus, resetFrameClock, dispose };
}
