import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStarshipModel } from './starship-model.mjs';
import { HOTSPOTS } from './content.mjs';
import {
  GROUND_Y,
  BOOSTER_CATCH_BASE_Y,
  SHIP_CATCH_BASE_Y,
  BOOSTER_CATCH_SUPPORT_OFFSET,
  SHIP_CATCH_SUPPORT_OFFSET,
  resolveTrackingTarget,
} from './mission-state.mjs';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const EARTH_RADIUS = 1000;
const EARTH_ATMOSPHERE_SCALE = 1.018;
const EARTH_TOP_OFFSET = .35;
const EARTH_TEXTURE_PATHS = Object.freeze({
  4096: new URL('./textures/earth-4096.webp', import.meta.url).href,
  2048: new URL('./textures/earth-2048.webp', import.meta.url).href,
});
const DEFAULT_YAW = .92;
const QUALITY_NAMES = ['軽量', '省電力', 'バランス', '高精細'];
const HOTSPOT_OFFSETS = {
  engines: [-86, 24],
  tanks: [88, -18],
  hotstage: [94, 8],
  flaps: [-88, -12],
  payload: [82, -22],
};

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStars() {
  const random = seededRandom(2401);
  const group = new THREE.Group();
  for (const [count, size, color, seedOffset] of [[1500, 1.15, 0xd9ecff, 0], [220, 1.9, 0x79c9ff, 700]]) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const theta = random() * TAU;
      const y = random() * 2 - 1;
      const radius = EARTH_RADIUS * 1.8 + random() * EARTH_RADIUS * 1.2;
      const horizontal = Math.sqrt(1 - y * y);
      positions[index * 3] = Math.cos(theta) * horizontal * radius + seedOffset;
      positions[index * 3 + 1] = y * radius;
      positions[index * 3 + 2] = Math.sin(theta) * horizontal * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      transparent: true,
      opacity: count > 1000 ? .82 : .72,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.userData.fullCount = count;
    group.add(points);
  }
  return group;
}

function makeEarth(host, renderer, initialLevel, isCoarse) {
  const group = new THREE.Group();
  const centerY = GROUND_Y - EARTH_RADIUS - EARTH_TOP_OFFSET;
  const material = new THREE.MeshBasicMaterial({ color: 0x17384a, toneMapped: false });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 40), material);
  surface.position.set(0, centerY, 0);
  const lat = 26.0 * DEG;
  const lon = -97.2 * DEG;
  const phi = (lon + 180 * DEG) / (2 * Math.PI) * TAU;
  const theta = Math.PI / 2 - lat;
  const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  surface.quaternion.setFromUnitVectors(dir, new THREE.Vector3(0, 1, 0));
  group.add(surface);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * EARTH_ATMOSPHERE_SCALE, 128, 28),
    new THREE.MeshBasicMaterial({
      color: 0x3c9ed1,
      transparent: true,
      opacity: .12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  atmosphere.position.copy(surface.position);
  group.add(atmosphere);

  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textureCache = new Map();
  const loadCache = new Map();
  let requestedSize = 0;
  let requestToken = 0;
  let disposed = false;

  function loadTexture(size) {
    if (textureCache.has(size)) return Promise.resolve(textureCache.get(size));
    if (loadCache.has(size)) return loadCache.get(size);
    const promise = new Promise((resolve, reject) => {
      loader.load(EARTH_TEXTURE_PATHS[size], texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = anisotropy;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        if (disposed) {
          texture.dispose();
          reject(new Error('Earth viewer disposed'));
          return;
        }
        textureCache.set(size, texture);
        resolve(texture);
      }, undefined, reject);
    });
    loadCache.set(size, promise);
    return promise;
  }

  function applyTexture(texture, size) {
    material.map = texture;
    material.color.setRGB(2.5, 2.5, 2.5);
    material.needsUpdate = true;
    host.dataset.earthTextureState = 'ready';
    host.dataset.earthTextureSize = String(size);
  }

  function setQuality(level, coarse = false) {
    const size = level >= 3 && !coarse ? 4096 : 2048;
    if (size === requestedSize || disposed) return;
    requestedSize = size;
    const token = ++requestToken;
    const cached = textureCache.get(size);
    if (cached) {
      applyTexture(cached, size);
      return;
    }

    host.dataset.earthTextureState = 'loading';
    host.dataset.earthTextureSize = String(size);
    loadTexture(size).then(texture => {
      if (disposed || token !== requestToken || requestedSize !== size) return;
      applyTexture(texture, size);
    }).catch(error => {
      if (disposed || token !== requestToken || requestedSize !== size) return;
      host.dataset.earthTextureState = 'error';
      host.dataset.earthTextureSize = String(size);
      console.warn('FRONTIER ATLAS: Earth texture unavailable', error);
      // Keep the current material.map and deep-blue fallback color on failure.
    });
  }

  setQuality(initialLevel, isCoarse);
  return {
    group,
    setQuality,
    dispose() {
      if (disposed) return;
      disposed = true;
      requestToken++;
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
      loadCache.clear();
      material.map = null;
      delete host.dataset.earthTextureState;
      delete host.dataset.earthTextureSize;
    },
  };
}

function beamBetween(parent, start, end, thickness, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, direction.length(), thickness), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function makeCatchAssembly(supportY, steel, dark) {
  const group = new THREE.Group();
  group.position.y = supportY;
  beamBetween(group, new THREE.Vector3(-15, 0, -7), new THREE.Vector3(-9, 0, 0), .55, steel);
  beamBetween(group, new THREE.Vector3(-9, -1.1, 0), new THREE.Vector3(-9, 1.1, 0), .45, dark);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, .68, .68), steel);
    arm.position.set(-4, 0, side * 9.25);
    arm.castShadow = true;
    group.add(arm);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, .5), dark);
    pad.position.set(.45, 0, side * 9.25);
    pad.castShadow = true;
    group.add(pad);
    arms.push({ arm, pad, side });
  }
  return {
    group,
    update(progress) {
      const closed = THREE.MathUtils.clamp(progress, 0, 1);
      const z = 4.75 + (1 - closed) * 4.5;
      for (const item of arms) {
        item.arm.position.z = item.side * z;
        item.pad.position.z = item.side * z;
      }
    },
  };
}

function makeLaunchComplex() {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x252d34, roughness: .94, metalness: .04 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x46535d, roughness: .48, metalness: .76 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x10171e, roughness: .8, metalness: .25 });
  const marking = new THREE.MeshBasicMaterial({ color: 0x9b7445, transparent: true, opacity: .62 });

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(15, 16.5, 2.5, 48), concrete);
  pad.position.y = GROUND_Y + 1.25;
  pad.receiveShadow = true;
  group.add(pad);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(11.5, .08, 5, 64), marking);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = GROUND_Y + 2.52;
  group.add(padRing);

  const mount = new THREE.Mesh(new THREE.BoxGeometry(10.5, 3, 10.5), dark);
  mount.position.y = GROUND_Y + 1.5;
  mount.receiveShadow = true;
  group.add(mount);
  for (const x of [-4.3, 4.3]) {
    for (const z of [-4.3, 4.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.65, 4.5, .65), steel);
      leg.position.set(x, GROUND_Y + 2.25, z);
      leg.castShadow = true;
      group.add(leg);
    }
  }
  const trench = new THREE.Mesh(new THREE.BoxGeometry(7, .25, 22), dark);
  trench.position.set(0, GROUND_Y + .15, 15);
  group.add(trench);

  const tower = new THREE.Group();
  tower.position.y = GROUND_Y;
  const towerHeight = 116;
  const left = -18, right = -12, front = -10, back = -4;
  for (const x of [left, right]) {
    for (const z of [front, back]) beamBetween(tower, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, towerHeight, z), .42, steel);
  }
  for (let y = 5; y < towerHeight; y += 7.5) {
    beamBetween(tower, new THREE.Vector3(left, y, front), new THREE.Vector3(right, y, front), .24, steel);
    beamBetween(tower, new THREE.Vector3(left, y, back), new THREE.Vector3(right, y, back), .24, steel);
    beamBetween(tower, new THREE.Vector3(left, y, front), new THREE.Vector3(left, y, back), .24, steel);
    beamBetween(tower, new THREE.Vector3(right, y, front), new THREE.Vector3(right, y, back), .24, steel);
    if (y + 7.5 <= towerHeight) {
      beamBetween(tower, new THREE.Vector3(left, y, front), new THREE.Vector3(right, y + 7.5, front), .15, steel);
      beamBetween(tower, new THREE.Vector3(right, y, back), new THREE.Vector3(left, y + 7.5, back), .15, steel);
    }
  }
  beamBetween(tower, new THREE.Vector3(-15, towerHeight, -7), new THREE.Vector3(-3, towerHeight, -7), .65, steel);
  beamBetween(tower, new THREE.Vector3(-15, towerHeight - 5, -7), new THREE.Vector3(-4, towerHeight, -7), .28, steel);
  group.add(tower);

  const boosterArms = makeCatchAssembly(BOOSTER_CATCH_BASE_Y + BOOSTER_CATCH_SUPPORT_OFFSET, steel, dark);
  const shipArms = makeCatchAssembly(SHIP_CATCH_BASE_Y + SHIP_CATCH_SUPPORT_OFFSET, steel, dark);
  group.add(boosterArms.group, shipArms.group);
  boosterArms.update(0);
  shipArms.update(0);

  return {
    group,
    update(state) {
      boosterArms.update(state.catch.booster);
      shipArms.update(state.catch.ship);
    },
  };
}

export function createStarshipViewer(host, options = {}) {
  const { hotspotLayer, onQuality, onContextLost } = options;
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x03060c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(roomEnvironment, .04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .72;
  roomEnvironment.dispose?.();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 6500);
  const model = createStarshipModel();
  scene.add(model.root);
  const stars = makeStars();
  const earth = makeEarth(host, renderer, coarse.matches ? 1 : 2, coarse.matches);
  const launchComplex = makeLaunchComplex();
  scene.add(stars, earth.group, launchComplex.group);

  const hemisphere = new THREE.HemisphereLight(0xb9dcf2, 0x10131b, 1.75);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 330;
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .08;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x5ea7d9, 1.05);
  rim.position.set(65, 20, -80);
  scene.add(rim);

  const actualTarget = new THREE.Vector3(0, 58, 0);
  const desiredTarget = new THREE.Vector3();
  const centerA = new THREE.Vector3();
  const centerB = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const sunOffset = new THREE.Vector3(-75, 115, 85);
  let width = 1, height = 1;
  let yaw = DEFAULT_YAW, pitch = .13, actualYaw = yaw, actualPitch = pitch;
  let zoom = 1, actualDistance = 190, desiredDistance = 190;
  let view = 'overall', follow = 'auto', selectedHotspot = null;
  let section = false, exploded = false;
  let level = coarse.matches ? 1 : 2;
  let ceiling = coarse.matches ? 1 : 3;
  let active = true, disposed = false;
  let previousNow, clock = 0;
  let warmup = 1.5, perfTime = 0, perfFrames = 0, fastWindows = 0;
  let drag = null;

  function qualityChanged() {
    host.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    onQuality?.(`自動品質・${QUALITY_NAMES[level]}`);
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 53 : 50;
    camera.updateProjectionMatrix();
    const maxRatio = [.7, 1, 1.25, 1.6][level];
    const ratio = Math.min(devicePixelRatio || 1, maxRatio, Math.sqrt(1600000 / (width * height)));
    renderer.setPixelRatio(Math.max(.65, ratio));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = level > 0;
    earth.setQuality(level, coarse.matches);
    model.setQuality(level);
    for (const points of stars.children) {
      points.geometry.setDrawRange(0, Math.floor(points.userData.fullCount * [.55, .72, .9, 1][level]));
    }
    qualityChanged();
  }

  function fitDistance(length, fraction = .72) {
    return length / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fraction);
  }

  function setViewPose(state) {
    const shipCenter = model.stageCenter('ship');
    const boosterCenter = model.stageCenter('booster');
    let baseDistance;

    if (view === 'engines') {
      desiredTarget.copy(model.anchor('booster-engines', state));
      baseDistance = 39;
    } else if (view === 'hotstage') {
      desiredTarget.copy(model.anchor('hotstage', state));
      baseDistance = 37;
    } else if (view === 'flaps') {
      desiredTarget.copy(model.anchor('flaps', state));
      baseDistance = 48;
    } else if (view === 'hotspot' && selectedHotspot && HOTSPOTS[selectedHotspot]) {
      desiredTarget.copy(model.anchor(selectedHotspot, state));
      baseDistance = {
        engines: state.stageIndex >= 2 ? 43 : 39,
        tanks: 63,
        hotstage: 39,
        flaps: 48,
        payload: 57,
      }[selectedHotspot];
    } else if (view === 'overall' && follow === 'auto' && state.stageId === 'hotstage') {
      // Keep both stages large and centered; Earth remains the distant background.
      centerB.copy(boosterCenter).add(shipCenter).multiplyScalar(.5);
      desiredTarget.copy(centerB);
      const span = boosterCenter.distanceTo(shipCenter) + 140;
      baseDistance = Math.min(360, Math.max(240, fitDistance(span, .78)));
    } else {
      const tracking = resolveTrackingTarget(state, follow);
      if (tracking === 'ship') {
        desiredTarget.copy(shipCenter);
        baseDistance = width < 600 ? 122 : 108;
      } else if (tracking === 'booster') {
        desiredTarget.copy(boosterCenter);
        baseDistance = width < 600 ? 145 : 128;
      } else if (tracking === 'both') {
        desiredTarget.copy(boosterCenter).add(shipCenter).multiplyScalar(.5);
        const span = boosterCenter.distanceTo(shipCenter) + 105;
        baseDistance = Math.min(680, Math.max(255, fitDistance(span, .76)));
      } else {
        desiredTarget.copy(model.booster.localToWorld(centerA.set(0, 58, 0)));
        baseDistance = width < 600 ? 207 : 181;
      }
    }
    desiredDistance = THREE.MathUtils.clamp(baseDistance * zoom, 16, 900);
  }

  function updateCamera(state, delta) {
    setViewPose(state);
    const blend = reduced.matches || delta <= 0 ? 1 : 1 - Math.exp(-delta * 5.2);
    actualTarget.lerp(desiredTarget, blend);
    actualYaw = THREE.MathUtils.lerp(actualYaw, yaw, blend);
    actualPitch = THREE.MathUtils.lerp(actualPitch, pitch, blend);
    actualDistance = THREE.MathUtils.lerp(actualDistance, desiredDistance, blend);
    const horizontal = Math.cos(actualPitch) * actualDistance;
    cameraOffset.set(
      Math.sin(actualYaw) * horizontal,
      Math.sin(actualPitch) * actualDistance,
      Math.cos(actualYaw) * horizontal,
    );
    camera.position.copy(actualTarget).add(cameraOffset);
    camera.position.y = Math.max(GROUND_Y + 2, camera.position.y);
    camera.lookAt(actualTarget);
    camera.far = Math.max(6500, actualDistance + 5000);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    sun.position.copy(actualTarget).add(sunOffset);
    sun.target.position.copy(actualTarget);
    sun.target.updateMatrixWorld();
    launchComplex.update(state);
    launchComplex.group.visible = state.stageId === 'hotstage' || state.booster.position[1] < 75;
  }

  function updateHotspots(state) {
    if (!hotspotLayer) return;
    const mobile = width < 760;
    const top = mobile ? 150 : 78;
    const bottom = mobile ? height - 205 : height - 160;
    const priority = [selectedHotspot, 'engines', 'flaps', 'hotstage', 'tanks', 'payload'].filter(Boolean);
    const visibleIds = new Set(mobile ? priority.slice(0, 3) : priority);
    for (const [id, entry] of Object.entries(HOTSPOTS)) {
      const button = hotspotLayer.querySelector(`[data-hotspot="${id}"]`);
      if (!button) continue;
      const simplifiedAway = mobile && !section && !exploded && id !== selectedHotspot && ['tanks', 'payload'].includes(id);
      projected.copy(model.anchor(id, state)).project(camera);
      const inDepth = projected.z > -1 && projected.z < 1;
      const inFrame = Math.abs(projected.x) < .96 && Math.abs(projected.y) < .94;
      button.hidden = !active || !inDepth || !inFrame || !visibleIds.has(id) || simplifiedAway;
      if (button.hidden) continue;
      const [offsetX, offsetY] = HOTSPOT_OFFSETS[id];
      const scale = mobile ? .62 : 1;
      const rawX = (projected.x + 1) * width / 2 + offsetX * scale;
      const rawY = (1 - projected.y) * height / 2 + offsetY * scale;
      const x = THREE.MathUtils.clamp(rawX, mobile ? 62 : 72, width - (mobile ? 62 : 72));
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
    if (frame.playing && !reduced.matches) clock += delta;
    model.update(state, clock, reduced.matches ? 0 : delta);
    updateCamera(state, delta);
    renderer.render(scene, camera);
    updateHotspots(state);
    tuneQuality(rawDelta);
  }

  function rotate(dx, dy) {
    yaw -= dx * .006;
    pitch = THREE.MathUtils.clamp(pitch + dy * .005, -.82, 1.32);
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
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(event.deltaY * .0011), .32, 3.4);
  }

  function keyControl(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== host && event.target !== renderer.domElement) return;
    const keys = {
      ArrowLeft: [-34, 0],
      ArrowRight: [34, 0],
      ArrowUp: [0, -30],
      ArrowDown: [0, 30],
    };
    if (keys[event.key]) {
      event.preventDefault();
      rotate(...keys[event.key]);
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom * (['+', '='].includes(event.key) ? .88 : 1.14), .32, 3.4);
    }
  }

  function resetView() {
    view = 'overall';
    selectedHotspot = null;
    yaw = DEFAULT_YAW;
    pitch = .13;
    zoom = 1;
  }

  function focusView(next) {
    if (!['overall', 'engines', 'hotstage', 'flaps'].includes(next)) return;
    view = next;
    selectedHotspot = null;
    zoom = 1;
    yaw = DEFAULT_YAW;
    pitch = next === 'engines' ? -.12 : .13;
  }

  function focusHotspot(id) {
    if (!HOTSPOTS[id]) return;
    view = 'hotspot';
    selectedHotspot = id;
    zoom = 1;
    yaw = id === 'flaps' ? 1.05 : DEFAULT_YAW;
    pitch = id === 'engines' ? -.16 : .1;
  }

  function setFollow(next) {
    follow = ['auto', 'both', 'ship', 'booster'].includes(next) ? next : 'auto';
    if (view === 'hotspot') {
      view = 'overall';
      selectedHotspot = null;
    }
  }

  function setDisplayMode(next = {}) {
    section = Boolean(next.section);
    exploded = Boolean(next.exploded);
    model.setDisplayMode({ section, exploded });
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
    earth.dispose();
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
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    environmentTarget.dispose();
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
    setFollow,
    setDisplayMode,
    resetView,
    dispose,
    get engineCounts() { return model.engineCounts; },
    get stats() { return model.stats; },
  };
}
