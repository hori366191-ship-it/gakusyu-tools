import * as THREE from 'three';
import { createOrbitalModel } from './orbital-model.mjs';
import { HOTSPOTS, MODE_ORDER } from './content.mjs';
import { EARTH_CENTER, OVERALL_CAMERA_DISTANCE, OVERALL_CAMERA_TARGET } from './scene-state.mjs';

const TAU = Math.PI * 2;
const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const HOTSPOT_OFFSETS = {
  solar: [-92, -12],
  chip: [54, 58],
  optical: [88, -34],
  radiator: [-78, -58],
  ground: [76, 42],
};

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStars() {
  const random = seededRandom(202511);
  const group = new THREE.Group();
  for (const [count, size, color, seed] of [[1500, 1.2, 0xd6e8ff, 0], [260, 2.0, 0x8bc9ef, 900]]) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const theta = random() * TAU;
      const y = random() * 2 - 1;
      const radius = 220 + random() * 300;
      const horizontal = Math.sqrt(1 - y * y);
      positions[index * 3] = Math.cos(theta) * horizontal * radius + (seed ? 35 : 0);
      positions[index * 3 + 1] = y * radius;
      positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity: count > 1000 ? .76 : .5, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geometry, material);
    points.userData.fullCount = count;
    group.add(points);
  }
  return group;
}

function makeNebulaBackdrop() {
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.55;
        for (int octave = 0; octave < 5; octave++) {
          value += noise(p) * amplitude;
          p = p * 2.03 + vec2(13.2, 7.1);
          amplitude *= 0.5;
        }
        return value;
      }
      void main() {
        vec2 uv = vUv;
        float cloud = fbm(uv * vec2(7.0, 4.0) + vec2(2.4, 1.7));
        float detail = fbm(uv * vec2(18.0, 9.0) + cloud * 2.0);
        float band = smoothstep(0.34, 0.78, cloud * 0.72 + detail * 0.28);
        vec3 deep = vec3(0.012, 0.022, 0.075);
        vec3 violet = vec3(0.12, 0.055, 0.22);
        vec3 teal = vec3(0.025, 0.15, 0.19);
        vec3 color = mix(deep, violet, smoothstep(0.38, 0.72, cloud));
        color = mix(color, teal, smoothstep(0.52, 0.82, detail) * 0.48);
        gl_FragColor = vec4(color, band * 0.48);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(340, 40, 24), material);
  nebula.name = 'Procedural nebula backdrop';
  nebula.renderOrder = -10;
  return nebula;
}

function presetFor(view, hotspot, state, model) {
  if (view === 'hotspot' && hotspot && model) {
    const distance = { solar: 24, chip: 13, optical: 15, radiator: 17, ground: 18 }[hotspot] || 18;
    return {
      target: model.anchor(hotspot, state),
      distance,
      yaw: hotspot === 'ground' ? .38 : hotspot === 'radiator' ? .75 : .32,
      pitch: hotspot === 'ground' ? .18 : hotspot === 'radiator' ? .65 : .2,
    };
  }
  if (view === 'power') return { target: new THREE.Vector3(-3, 20, 28), distance: 30, yaw: .18, pitch: .36 };
  if (view === 'link') return { target: new THREE.Vector3(1, 20, 27), distance: 34, yaw: .68, pitch: .28 };
  if (view === 'cooling') return { target: new THREE.Vector3(0, 21, 29), distance: 24, yaw: .74, pitch: .68 };
  if (view === 'compute') return { target: new THREE.Vector3(0, 20, 29), distance: 16, yaw: .08, pitch: .13 };
  return { target: new THREE.Vector3(...OVERALL_CAMERA_TARGET), distance: OVERALL_CAMERA_DISTANCE, yaw: .5, pitch: .24 };
}

export function createOrbitalViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03060d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(47, 1, .1, 900);
  const model = createOrbitalModel({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  scene.add(model.root);
  const stars = makeStars();
  const nebula = makeNebulaBackdrop();
  scene.add(stars, nebula);

  scene.add(new THREE.HemisphereLight(0xc1def0, 0x07101d, .82));
  const sunlight = new THREE.DirectionalLight(0xffe6bb, 3.1);
  sunlight.position.set(-48, 38, 25);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -48;
  sunlight.shadow.camera.right = 48;
  sunlight.shadow.camera.top = 48;
  sunlight.shadow.camera.bottom = -48;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 180;
  sunlight.shadow.bias = -.0004;
  sunlight.shadow.normalBias = .05;
  scene.add(sunlight, sunlight.target);
  const rim = new THREE.DirectionalLight(0x64b8ef, 1.45);
  rim.position.set(15, 4, -18);
  scene.add(rim);
  const computeLight = new THREE.PointLight(0x4adcf4, 1.2, 8, 2);
  computeLight.position.set(0, 20, 30);
  scene.add(computeLight);

  let width = 1;
  let height = 1;
  let yaw = .5;
  let pitch = .24;
  let zoom = 1;
  let actualYaw = yaw;
  let actualPitch = pitch;
  let actualDistance = OVERALL_CAMERA_DISTANCE;
  let view = 'overall';
  let selectedHotspot = null;
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true;
  let disposed = false;
  let previousNow;
  let drag = null;
  let warmup = 1.4;
  let perfTime = 0;
  let perfFrames = 0;
  let fastWindows = 0;
  const desiredTarget = new THREE.Vector3();
  const actualTarget = new THREE.Vector3(...OVERALL_CAMERA_TARGET);
  const projected = new THREE.Vector3();

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 52 : 47;
    camera.updateProjectionMatrix();
    const maxRatio = [.7, 1, 1.25, 1.55][level];
    const ratio = Math.min(devicePixelRatio || 1, maxRatio, Math.sqrt(1600000 / (width * height)));
    renderer.setPixelRatio(Math.max(.65, ratio));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = level >= 2;
    model.setQuality(level);
    for (const points of stars.children) {
      points.geometry.setDrawRange(0, Math.floor(points.userData.fullCount * [.5, .7, .88, 1][level]));
    }
    qualityChanged();
  }

  function updateCamera(state, delta) {
    const preset = presetFor(view, selectedHotspot, state, model);
    desiredTarget.copy(preset.target);
    const responsiveDistance = view === 'overall' && width < 600 ? 98 : preset.distance;
    const desiredDistance = THREE.MathUtils.clamp(responsiveDistance * zoom, 5.5, 180);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 5.4);
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
    computeLight.position.copy(model.anchor('chip', state)).add(new THREE.Vector3(0, .3, 1.2));
    sunlight.target.position.set(...EARTH_CENTER);
    sunlight.target.updateMatrixWorld();
  }

  function updateHotspots(state) {
    if (!hotspotLayer) return;
    const mobile = width <= 760;
    const leftGuard = width >= 1200 ? 276 : 20;
    const rightGuard = width > 760 ? 400 : 24;
    const top = mobile ? 270 : 178;
    const bottom = mobile ? height - 194 : height - 142;
    for (const [id, entry] of Object.entries(HOTSPOTS)) {
      const button = hotspotLayer.querySelector(`[data-hotspot="${id}"]`);
      if (!button) continue;
      projected.copy(model.anchor(id, state)).project(camera);
      const inDepth = projected.z > -1 && projected.z < 1;
      const inFrame = Math.abs(projected.x) < .98 && Math.abs(projected.y) < .95;
      button.hidden = !active || !inDepth || !inFrame;
      if (button.hidden) continue;
      const [offsetX, offsetY] = HOTSPOT_OFFSETS[id];
      const rawX = (projected.x + 1) * width / 2 + offsetX;
      const rawY = (1 - projected.y) * height / 2 + offsetY;
      const x = THREE.MathUtils.clamp(rawX, leftGuard + 44, Math.max(leftGuard + 90, width - rightGuard - 44));
      const y = THREE.MathUtils.clamp(rawY, top + 22, Math.max(top + 44, bottom - 22));
      button.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      button.setAttribute('aria-label', `${entry.title}にフォーカス`);
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
    const motionScale = frame.motionScale === 0 || reduced.matches ? 0 : 1;
    model.setPresentation({ mode: view === 'hotspot' ? HOTSPOTS[selectedHotspot]?.mode || 'overall' : view, hotspot: selectedHotspot, reducedMotion: motionScale === 0 });
    model.update(state, model.presentation, delta);
    updateCamera(state, delta);
    renderer.render(scene, camera);
    updateHotspots(state);
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.72, 1.28);
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  }

  function startDrag(event) {
    if (!active || drag || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    rotate(dx, dy);
  }

  function wheel(event) {
    if (!active) return;
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(event.deltaY * .0011), .42, 3.2);
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
      zoom = THREE.MathUtils.clamp(zoom * (['+', '='].includes(event.key) ? .88 : 1.14), .42, 3.2);
    }
  }

  function focusView(next) {
    if (!MODE_ORDER.includes(next)) return;
    view = next;
    selectedHotspot = null;
    zoom = 1;
    const preset = presetFor(next, null, { hero: { position: [0, 20, 28], rotation: [0, 0, 0] } }, model);
    yaw = preset.yaw;
    pitch = preset.pitch;
  }

  function focusHotspot(id) {
    if (!HOTSPOTS[id]) return;
    view = 'hotspot';
    selectedHotspot = id;
    zoom = 1;
    yaw = id === 'ground' ? .38 : id === 'radiator' ? .75 : .32;
    pitch = id === 'ground' ? .18 : id === 'radiator' ? .65 : .2;
  }

  function resetView() {
    focusView('overall');
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
    renderer.domElement.removeEventListener('pointerdown', startDrag);
    renderer.domElement.removeEventListener('pointermove', moveDrag);
    renderer.domElement.removeEventListener('pointerup', endDrag);
    renderer.domElement.removeEventListener('pointercancel', endDrag);
    renderer.domElement.removeEventListener('lostpointercapture', endDrag);
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
        for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', startDrag);
  canvas.addEventListener('pointermove', moveDrag);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
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
    focusView,
    focusHotspot,
    resetView,
    resetFrameTime,
    dispose,
    get modelCounts() { return model.counts; },
  };
}
