import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStarshipModel } from '../frontier-atlas/starship-model.mjs';

const BLENDER_MODEL_URL = new URL('./models/starship-blender.glb', import.meta.url).href;
const BLENDER_MODEL_BASE = new URL('./models/', import.meta.url).href;
const VIEW_PRESETS = Object.freeze({
  overall: Object.freeze({ target: [0, 60.5, 0], yaw: .92, pitch: .11, distance: 202 }),
  flaps: Object.freeze({ target: [0, 87, 0], yaw: .92, pitch: .08, distance: 57 }),
  engines: Object.freeze({ target: [0, 3.8, 0], yaw: .92, pitch: -.13, distance: 42 }),
  side: Object.freeze({ target: [0, 60.5, 0], yaw: Math.PI / 2, pitch: 0, distance: 202 }),
});

function measureModelStats(root, fileBytes = null) {
  let triangles = 0;
  let meshes = 0;
  const materials = new Set();
  root.traverseVisible(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    const positionCount = geometry?.attributes?.position?.count || 0;
    const triangleCount = geometry?.index ? geometry.index.count / 3 : positionCount / 3;
    triangles += Math.floor(triangleCount) * (object.isInstancedMesh ? object.count : 1);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
    }
  });
  return { triangles, meshes, materials: materials.size, fileBytes };
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

function makeExhibitScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b12);
  scene.fog = new THREE.Fog(0x070b12, 270, 540);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(room, .04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .78;
  room.dispose?.();
  pmrem.dispose();

  const hemisphere = new THREE.HemisphereLight(0xc8e6f5, 0x111722, 1.55);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff1dd, 3.2);
  key.position.set(52, 112, 68);
  key.target.position.set(0, 55, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -85;
  key.shadow.camera.right = 85;
  key.shadow.camera.top = 85;
  key.shadow.camera.bottom = -85;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 290;
  key.shadow.bias = -.0002;
  key.shadow.normalBias = .055;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x6fb7e8, 1.65);
  rim.position.set(-65, 75, -70);
  rim.target.position.set(0, 58, 0);
  scene.add(rim, rim.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ color: 0x0b121c, metalness: .18, roughness: .82 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.07;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(280, 56, 0x34576b, 0x1b3040);
  grid.position.y = -.045;
  grid.material.transparent = true;
  grid.material.opacity = .42;
  scene.add(grid);

  return { scene, environmentTarget };
}

function pointerDistance(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createRig(side, host, onInput, onError, requestRender) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    throw new Error(`WebGLを初期化できませんでした。ブラウザのハードウェアアクセラレーションとWebGL対応を確認してください。${error instanceof Error ? ` (${error.message})` : ''}`);
  }

  renderer.setClearColor(0x070b12, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const { scene, environmentTarget } = makeExhibitScene(renderer);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 1200);
  const state = {
    target: new THREE.Vector3(...VIEW_PRESETS.overall.target),
    yaw: VIEW_PRESETS.overall.yaw,
    pitch: VIEW_PRESETS.overall.pitch,
    distance: VIEW_PRESETS.overall.distance,
  };
  const pointers = new Map();
  let gesture = null;
  let dirty = true;
  let lost = false;
  let disposed = false;

  function updateCamera() {
    const horizontal = Math.cos(state.pitch) * state.distance;
    camera.position.set(
      state.target.x + Math.sin(state.yaw) * horizontal,
      state.target.y + Math.sin(state.pitch) * state.distance,
      state.target.z + Math.cos(state.yaw) * horizontal,
    );
    camera.lookAt(state.target);
    camera.updateMatrixWorld();
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (width * height)));
    renderer.setPixelRatio(Math.max(.75, ratio));
    renderer.setSize(width, height, false);
    dirty = true;
    requestRender();
  }

  function rotate(dx, dy) {
    state.yaw -= dx * .006;
    state.pitch = THREE.MathUtils.clamp(state.pitch + dy * .005, -1.2, 1.35);
  }

  function zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    state.distance = THREE.MathUtils.clamp(state.distance * factor, 12, 430);
  }

  function startPointer(event) {
    if (disposed || lost || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    host.focus({ preventScroll: true });
    renderer.domElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gesture = { type: 'drag', ...pointers.values().next().value };
    } else if (pointers.size === 2) {
      gesture = { type: 'pinch', distance: pointerDistance(pointers) };
    }
  }

  function movePointer(event) {
    if (!pointers.has(event.pointerId) || disposed || lost) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const distance = pointerDistance(pointers);
      if (gesture?.type === 'pinch' && distance > 0) onInput('zoom', side, gesture.distance / distance);
      gesture = { type: 'pinch', distance };
      return;
    }
    if (gesture?.type !== 'drag') return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    onInput('rotate', side, dx, dy);
  }

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    if (pointers.size === 1) {
      gesture = { type: 'drag', ...pointers.values().next().value };
    } else {
      gesture = null;
    }
  }

  function wheel(event) {
    if (disposed || lost) return;
    event.preventDefault();
    onInput('zoom', side, Math.exp(event.deltaY * .0011));
  }

  function keyControl(event) {
    if (event.target !== host || event.altKey || event.ctrlKey || event.metaKey || disposed || lost) return;
    const rotations = { ArrowLeft: [-34, 0], ArrowRight: [34, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] };
    if (rotations[event.key]) {
      event.preventDefault();
      onInput('rotate', side, ...rotations[event.key]);
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      onInput('zoom', side, ['+', '='].includes(event.key) ? .88 : 1.14);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onInput('resetView', side);
    }
  }

  function contextLost(event) {
    event.preventDefault();
    lost = true;
    dirty = false;
    onError(side, new Error('WebGLの描画が停止しました。ページを再読み込みするか、ブラウザのハードウェアアクセラレーションを確認してください。'));
  }

  function resetFromGesture() {
    onInput('resetView', side);
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', startPointer);
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', resetFromGesture);
  canvas.addEventListener('webglcontextlost', contextLost);
  host.addEventListener('keydown', keyControl);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    side,
    host,
    scene,
    camera,
    state,
    renderer,
    rotate,
    zoom,
    updateCamera,
    addModel(root) {
      scene.add(root);
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
      requestRender();
    },
    render() {
      if (lost || disposed) return;
      updateCamera();
      renderer.render(scene, camera);
      dirty = false;
    },
    markDirty() {
      dirty = true;
      requestRender();
    },
    get dirty() { return dirty; },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', startPointer);
      canvas.removeEventListener('pointermove', movePointer);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      canvas.removeEventListener('lostpointercapture', endPointer);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('dblclick', resetFromGesture);
      canvas.removeEventListener('webglcontextlost', contextLost);
      host.removeEventListener('keydown', keyControl);
      disposeObject(scene);
      environmentTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

function copyCamera(source, destination) {
  destination.yaw = source.yaw;
  destination.pitch = source.pitch;
  destination.distance = source.distance;
  destination.target.copy(source.target);
}

export function createComparisonViewers(proceduralHost, blenderHost, options = {}) {
  const { onStatus, onStats, onError } = options;
  const rigs = Object.create(null);
  const abortController = new AbortController();
  let frameId = 0;
  let disposed = false;
  let synchronized = true;
  let activeSource = 'procedural';
  let controller;

  function scheduleRender() {
    if (frameId || disposed || document.hidden) return;
    frameId = requestAnimationFrame(renderFrame);
  }

  function renderFrame() {
    frameId = 0;
    if (disposed || document.hidden) return;
    for (const rig of Object.values(rigs)) {
      if (rig.dirty) rig.render();
    }
  }

  function markDirty(...sides) {
    for (const side of sides.length ? sides : Object.keys(rigs)) rigs[side]?.markDirty();
  }

  function otherSide(side) {
    return side === 'procedural' ? 'blender' : 'procedural';
  }

  function manipulate(source, change) {
    if (disposed || !rigs[source]) return;
    activeSource = source;
    change(rigs[source]);
    if (synchronized && rigs[otherSide(source)]) copyCamera(rigs[source].state, rigs[otherSide(source)].state);
    markDirty('procedural', 'blender');
  }

  function setSynchronized(enabled) {
    synchronized = Boolean(enabled);
    const source = rigs[activeSource] ? activeSource : otherSide(activeSource);
    if (synchronized && rigs[source] && rigs[otherSide(source)]) {
      copyCamera(rigs[source].state, rigs[otherSide(source)].state);
      markDirty('procedural', 'blender');
    }
  }

  function setView(view) {
    const preset = VIEW_PRESETS[view];
    if (!preset || disposed) return;
    for (const rig of Object.values(rigs)) {
      rig.state.target.set(...preset.target);
      rig.state.yaw = preset.yaw;
      rig.state.pitch = preset.pitch;
      rig.state.distance = preset.distance;
    }
    markDirty('procedural', 'blender');
  }

  function resetView() {
    setView('overall');
  }

  function getCameraState(side) {
    const state = rigs[side]?.state;
    if (!state) return null;
    return { yaw: state.yaw, pitch: state.pitch, distance: state.distance, target: state.target.toArray() };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    document.removeEventListener('visibilitychange', scheduleRender);
    for (const rig of Object.values(rigs)) rig.dispose();
  }

  controller = {
    rotate: (source, dx, dy) => manipulate(source, rig => rig.rotate(dx, dy)),
    zoom: (source, factor) => manipulate(source, rig => rig.zoom(factor)),
    setSynchronized,
    setView,
    resetView,
    getCameraState,
    hasRenderer(side) { return Boolean(rigs[side]); },
    dispose,
  };

  onStatus?.('procedural', 'Three.jsモデルを準備中…', 'loading');
  onStatus?.('blender', 'Blender版GLBを読み込み中…', 'loading');

  for (const [side, host] of [['procedural', proceduralHost], ['blender', blenderHost]]) {
    try {
      rigs[side] = createRig(side, host, (action, source, ...args) => {
        if (action === 'resetView') controller.resetView();
        else controller[action]?.(source, ...args);
      }, onError, scheduleRender);
    } catch (error) {
      onError?.(side, error);
    }
  }
  if (!rigs.procedural && rigs.blender) activeSource = 'blender';

  if (rigs.procedural) {
    try {
      const model = createStarshipModel();
      // The existing updater also hides exhaust plumes/particles when thrust is zero.
      model.update({
        booster: { position: [0, 0, 0], rotation: [0, 0, 0] },
        ship: { position: [0, 71, 0], rotation: [0, 0, 0] },
        engines: { booster: 0, ship: 0 },
        stageId: 'static-comparison',
        stageIndex: 0,
        payload: { doors: 0, deploy: 0 },
      }, 0, 0);
      rigs.procedural.addModel(model.root);
      const stats = measureModelStats(model.root);
      onStats?.('procedural', stats);
      onStatus?.('procedural', `表示中 · ${stats.triangles.toLocaleString('ja-JP')}三角形`, 'ready');
    } catch (error) {
      onError?.('procedural', new Error(`プロシージラルモデルの生成に失敗しました。${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async function loadBlenderModel() {
    try {
      const response = await fetch(BLENDER_MODEL_URL, { cache: 'no-store', signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`GLBファイルを取得できませんでした（HTTP ${response.status}）。${BLENDER_MODEL_URL} を確認し、Blender生成スクリプトを実行してください。`);
      }
      const buffer = await response.arrayBuffer();
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buffer, BLENDER_MODEL_BASE);
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      gltf.scene.name = 'Starship_Blender';
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
          if ('envMapIntensity' in material) material.envMapIntensity = .82;
        }
      });
      const stats = measureModelStats(gltf.scene, buffer.byteLength);
      if (rigs.blender) {
        rigs.blender.addModel(gltf.scene);
        onStatus?.('blender', `表示中 · ${stats.triangles.toLocaleString('ja-JP')}三角形`, 'ready');
      }
      onStats?.('blender', stats);
    } catch (error) {
      if (disposed || error?.name === 'AbortError') return;
      const detail = error instanceof Error ? error.message : String(error);
      onError?.('blender', new Error(`Blender版GLBの読み込み・解析に失敗しました。${detail}`));
    }
  }

  document.addEventListener('visibilitychange', scheduleRender);
  loadBlenderModel();
  scheduleRender();
  return controller;
}
