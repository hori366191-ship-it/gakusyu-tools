import * as THREE from 'three';
import { createPhysicalAIModel } from './model.mjs';
import { HOTSPOTS, MODE_ORDER } from './content.mjs';
import { CAMERA_PRESETS, HOTSPOT_CAMERA, OVERALL_DISTANCE, OVERALL_TARGET } from './state.mjs';

const TAU = Math.PI * 2;
const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const HOTSPOT_IDS = Object.keys(HOTSPOTS);

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStars() {
  const random = randomSource(20261126);
  const group = new THREE.Group();
  for (const [count, size, color] of [[1200, .055, 0xc9e8f5], [240, .09, 0x7dbfea]]) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const theta = random() * TAU;
      const y = random() * 2 - 1;
      const radius = 65 + random() * 95;
      const horizontal = Math.sqrt(1 - y * y);
      positions[index * 3] = Math.cos(theta) * horizontal * radius;
      positions[index * 3 + 1] = y * radius;
      positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.userData.fullCount = count;
    group.add(points);
  }
  return group;
}

function makeBackdrop() {
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      void main() {
        vec3 direction = normalize(vPosition);
        float cloud = sin(direction.x * 8.0 + direction.z * 5.0) * sin(direction.y * 7.0 - direction.x * 3.0);
        float band = smoothstep(0.05, 0.8, cloud) * 0.12;
        float grain = hash(floor(direction * 420.0)) * 0.018;
        vec3 color = vec3(0.008, 0.018, 0.032) + vec3(0.035, 0.11, 0.15) * band + grain;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), material);
}

export function createPhysicalAIViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03070d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03070d, .009);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 500);
  const model = createPhysicalAIModel({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  scene.add(model.root, makeStars(), makeBackdrop());
  scene.add(new THREE.HemisphereLight(0xc9e9f5, 0x07121c, 1.15));
  const key = new THREE.DirectionalLight(0xffe2b0, 3.2);
  key.position.set(-12, 18, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.near = .5;
  key.shadow.camera.far = 70;
  key.shadow.bias = -.0005;
  key.shadow.normalBias = .035;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x5ac8f2, 2.1);
  rim.position.set(14, 6, -12);
  scene.add(rim);
  const fill = new THREE.PointLight(0x8d7cff, 2.4, 28, 2);
  fill.position.set(-7, 5, 4);
  scene.add(fill);

  let width = 1;
  let height = 1;
  let yaw = CAMERA_PRESETS.overall.yaw;
  let pitch = CAMERA_PRESETS.overall.pitch;
  let zoom = 1;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let actualDistance = OVERALL_DISTANCE;
  let view = MODE_ORDER[0];
  let selectedHotspot = null;
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true;
  let disposed = false;
  let previousNow;
  let warmup = 1.2;
  let perfTime = 0;
  let perfFrames = 0;
  let fastWindows = 0;
  let drag = null;
  let pinchDistance = 0;
  const pointers = new Map();
  const desiredTarget = new THREE.Vector3(...OVERALL_TARGET);
  const actualTarget = new THREE.Vector3(...OVERALL_TARGET);
  const projected = new THREE.Vector3();

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]} / LOD ${level}`);
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 54 : 46;
    camera.updateProjectionMatrix();
    const maxRatio = [.65, .9, 1.2, 1.5][level];
    const ratio = Math.min(devicePixelRatio || 1, maxRatio, Math.sqrt(1500000 / (width * height)));
    renderer.setPixelRatio(Math.max(.6, ratio));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = level >= 2;
    model.setQuality(level);
    for (const points of scene.children.filter(child => child.isPoints && child.userData.fullCount)) {
      points.geometry.setDrawRange(0, Math.floor(points.userData.fullCount * [.5, .72, .9, 1][level]));
    }
    qualityChanged();
  }

  function presetFor(state) {
    if (view === 'hotspot' && selectedHotspot) {
      const preset = HOTSPOT_CAMERA[selectedHotspot] || CAMERA_PRESETS.overall;
      return { target: model.anchor(selectedHotspot, state), distance: preset.distance, yaw: preset.yaw, pitch: preset.pitch };
    }
    return CAMERA_PRESETS[view] || CAMERA_PRESETS.overall;
  }

  function updateCamera(state, delta) {
    const preset = presetFor(state);
    desiredTarget.set(...(Array.isArray(preset.target) ? preset.target : preset.target.toArray()));
    const responsiveDistance = view === MODE_ORDER[0] && width < 600 ? OVERALL_DISTANCE * 1.13 : preset.distance;
    const desiredDistance = THREE.MathUtils.clamp(responsiveDistance * zoom, 3.5, 95);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 5.8);
    actualTarget.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualDistance = THREE.MathUtils.lerp(actualDistance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * actualDistance;
    camera.position.set(
      actualTarget.x + Math.sin(actualYaw) * horizontal,
      actualTarget.y + Math.sin(actualPitch) * actualDistance,
      actualTarget.z + Math.cos(actualYaw) * horizontal,
    );
    camera.lookAt(actualTarget);
    camera.updateMatrixWorld();
    key.target.position.copy(actualTarget);
    key.target.updateMatrixWorld();
  }

  function updateHotspots(state) {
    if (!hotspotLayer) return;
    const isMobile = width <= 760;
    const leftGuard = width >= 1200 ? 278 : 18;
    const rightGuard = width > 760 ? 398 : 22;
    const top = isMobile ? 258 : 174;
    const bottom = isMobile ? height - 205 : height - 140;
    HOTSPOT_IDS.forEach((id, index) => {
      const entry = HOTSPOTS[id];
      const button = hotspotLayer.querySelector(`[data-hotspot="${id}"]`);
      if (!button) return;
      projected.copy(model.anchor(id, state)).project(camera);
      const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .97 && Math.abs(projected.y) < .94;
      button.hidden = !active || !inFrame;
      if (button.hidden) return;
      const offsets = [[-42, -28], [36, -34], [-38, 32], [42, 26], [0, -42]];
      const [offsetX, offsetY] = offsets[index % offsets.length];
      const rawX = (projected.x + 1) * width / 2 + offsetX;
      const rawY = (1 - projected.y) * height / 2 + offsetY;
      const x = THREE.MathUtils.clamp(rawX, leftGuard + 48, Math.max(leftGuard + 90, width - rightGuard - 48));
      const y = THREE.MathUtils.clamp(rawY, top + 22, Math.max(top + 44, bottom - 22));
      button.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      button.setAttribute('aria-label', `${entry.title}にフォーカス`);
    });
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
    const motionScale = frame.motionScale === 0 || reduced.matches ? 0 : 1;
    model.setPresentation({ mode: view === 'hotspot' ? HOTSPOTS[selectedHotspot]?.mode || MODE_ORDER[0] : view, hotspot: selectedHotspot, reducedMotion: motionScale === 0 });
    model.update(state);
    updateCamera(state, delta);
    renderer.render(scene, camera);
    updateHotspots(state);
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.7, 1.3);
  }

  function pointerDistance() {
    const values = [...pointers.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function startPointer(event) {
    if (!active || !event.isPrimary && event.pointerType === 'mouse') return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    if (pointers.size === 1) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      pinchDistance = pointerDistance();
      drag = null;
    }
    event.preventDefault();
  }

  function movePointer(event) {
    if (!active || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const nextDistance = pointerDistance();
      if (pinchDistance > 0 && nextDistance > 0) zoom = THREE.MathUtils.clamp(zoom * (pinchDistance / nextDistance), .38, 3.4);
      pinchDistance = nextDistance;
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    rotate(dx, dy);
  }

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (drag && event.pointerId === drag.id) drag = null;
    if (pointers.size < 2) pinchDistance = 0;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  }

  function wheel(event) {
    if (!active) return;
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(event.deltaY * .0011), .38, 3.4);
  }

  function keyControl(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== host && event.target !== renderer.domElement) return;
    const keys = { ArrowLeft: [-34, 0], ArrowRight: [34, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] };
    if (keys[event.key]) {
      event.preventDefault();
      rotate(...keys[event.key]);
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom * (['+', '='].includes(event.key) ? .88 : 1.14), .38, 3.4);
    }
  }

  function focusView(next) {
    if (!MODE_ORDER.includes(next)) return;
    view = next;
    selectedHotspot = null;
    zoom = 1;
    const preset = CAMERA_PRESETS[next];
    yaw = preset.yaw;
    pitch = preset.pitch;
  }

  function focusHotspot(id) {
    if (!HOTSPOTS[id]) return;
    view = 'hotspot';
    selectedHotspot = id;
    zoom = 1;
    const preset = HOTSPOT_CAMERA[id];
    yaw = preset.yaw;
    pitch = preset.pitch;
  }

  function resetView() {
    focusView(MODE_ORDER[0]);
  }

  function resetFrameTime() {
    previousNow = undefined;
  }

  function pointerModeChanged() {
    ceiling = coarse.matches ? 1 : 3;
    level = Math.min(level, ceiling);
    resize();
  }

  function contextLost(event) {
    event.preventDefault();
    active = false;
    resetFrameTime();
    for (const button of hotspotLayer?.querySelectorAll('.hotspot') || []) button.hidden = true;
    onContextLost?.('WebGLの描画が停止しました。2D模式図と解説を表示しています。');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    model.dispose();
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
    const materialSet = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materialSet.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materialSet.forEach(material => material.dispose());
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
    render, focusView, focusHotspot, resetView, resetFrameTime, dispose,
    get modelCounts() { return model.counts; },
  };
}
