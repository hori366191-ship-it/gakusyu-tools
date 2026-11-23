import * as THREE from 'three';
import { SCENE_UNITS_PER_AU, positionAt } from './bodies.mjs';
import { makeSky } from './sky.mjs';
import { createWorld } from './world.mjs';
import { makePlanetMaps } from './planet-maps.mjs';
import {
  easedTravel, observationDistance, orbitAngles, orbitDirection, orbitPitchBounds, overheadPose, travelDistance,
} from './views.mjs';

const up = new THREE.Vector3(0, 1, 0);
const sunView = new THREE.Vector3(-15, 8.7, 14).normalize();
const lookingDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const qualityNames = ['軽量', '省電力', 'バランス', '高精細'];
const dayFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

export function createViewer($, chart, onContextLost) {
  const mission = $('mission'), stage = $('flight-view'), radar = $('radar'), back = $('overview-back');
  const coarse = matchMedia('(pointer: coarse)'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
  const scene = new THREE.Scene(), skyScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(51, 1, 1, 190000);
  const skyCamera = new THREE.PerspectiveCamera(51, 1, .1, 5200);
  const sky = makeSky(new THREE.Vector3(.22, -.965, -.15).normalize());
  skyScene.add(sky.group);
  renderer.autoClear = false;
  const world = createWorld(scene);
  const planetMaps = makePlanetMaps(world.models, renderer.capabilities.maxTextureSize, renderer.capabilities.getMaxAnisotropy());
  const aim = new THREE.Vector3(), direction = new THREE.Vector3();
  const sunward = new THREE.Vector3(), flank = new THREE.Vector3(), eye = new THREE.Vector3();
  const cameraAU = new THREE.Vector3(), bodyAU = new THREE.Vector3(), overviewAU = new THREE.Vector3();
  const relative = new THREE.Vector3(), screen = new THREE.Vector3();
  const viewMatrix = new THREE.Matrix4();
  const aimQuaternion = new THREE.Quaternion();
  let mode = 'overview', visit, orbitOpacity = 1;
  // Manual view offsets are measured from the arrival pose of the current
  // visit, so orbit growth and the sunlit side still drive the base view.
  let orbitYaw = 0, orbitPitch = 0, baseElevation = 0;
  const drag = { id: null, x: 0, y: 0 };
  let width = 1, height = 1, priorInner = false, zoom;
  let level = coarse.matches ? 1 : 3, ceiling = coarse.matches ? 2 : 3;
  let days = 0, spinDays = 0, clock = 0, paused = false, rate = Number($('time-rate').value);
  let frame, previousTime, nextChart = 0, nextReadout = 0;
  let perfTime = 0, perfFrames = 0, fastWindows = 0, warmup = 1.4, active = true;
  const modal = () => Boolean(document.querySelector('dialog[open]'));

  function updateOverviewPoint(inner = chart.inner()) {
    const box = chart.frameBounds();
    if (box.width < 1 || box.height < 1) return;
    overviewAU.fromArray(overheadPose(width, height, box, camera.fov, inner));
  }

  function setDepth(distance) {
    const near = THREE.MathUtils.clamp(distance * .03, .0003, 2400);
    const far = Math.max(45000, cameraAU.length() * SCENE_UNITS_PER_AU + 36000);
    if (Math.abs(camera.near - near) > near * .001 || Math.abs(camera.far - far) > far * .001) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  function showMode(next) {
    mode = next;
    mission.dataset.mode = mode;
    // Touch dragging must not scroll or zoom the page while the arrival view
    // is in orbit mode; everywhere else the normal page gestures stay.
    stage.style.touchAction = mode === 'follow' ? 'none' : '';
    back.hidden = mode === 'overview';
    back.disabled = mode === 'return';
    radar.hidden = mode !== 'follow';
    const status = $('flight-status');
    if (mode === 'overview') status.textContent = '太陽系・真上';
    else if (mode === 'travel') status.textContent = `接近中・${visit.model.body.name}`;
    else if (mode === 'return') status.textContent = '真上へ移動中';
    else {
      const { body } = visit.model;
      status.textContent = body.a ? `公転に追随・${body.name}` : `観察中・${body.name}`;
      $('radar-name').textContent = body.name;
      $('radar-task').textContent = body.task;
    }
  }

  function resize() {
    width = stage.clientWidth; height = stage.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov = camera.aspect < .82 ? 55 : 51;
    camera.updateProjectionMatrix();
    skyCamera.aspect = camera.aspect;
    skyCamera.fov = camera.fov;
    skyCamera.updateProjectionMatrix();
    const maxRatio = [.6, 1, 1.2, 1.5][level];
    const ratio = Math.min(devicePixelRatio || 1, maxRatio, Math.sqrt(2050000 / (width * height)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    sky.setQuality(level, ratio);
    world.setQuality(level);
    $('quality-status').textContent = `自動品質・${qualityNames[level]}`;
    mission.dataset.quality = ['lite', 'eco', 'balanced', 'high'][level];
    updateOverviewPoint(mode === 'return' ? false : chart.inner());
  }

  function toOverview() {
    if (!active || mode === 'overview' || mode === 'return') return;
    orbitYaw = orbitPitch = 0;
    visit.start = cameraAU.clone().sub(bodyAU.fromArray(positionAt(visit.model.body, days)));
    visit.startRotation = camera.quaternion.clone();
    visit.initialOpacity = orbitOpacity;
    visit.elapsed = 0;
    visit.duration = reduced.matches ? 0 : 3.1;
    chart.reset();
    priorInner = false;
    updateOverviewPoint(false);
    showMode('return');
    $('announce').textContent = '真上の視点へ移動します。';
  }

  function finishReturn() {
    const visited = visit.model.body.id;
    cameraAU.copy(overviewAU);
    camera.quaternion.copy(lookingDown);
    visit = undefined;
    showMode('overview');
    $('announce').textContent = '太陽系を真上から表示しました。';
    $('destination-list').querySelector(`[data-body="${visited}"]`)?.focus({ preventScroll: true });
  }

  function travelTo(id, edgeOn = false) {
    const model = world.models.find(item => item.body.id === id);
    if (!model || !active) return;
    const same = mode === 'follow' && visit?.model === model;
    // A new pose always starts from the manual view that is on screen now;
    // the offsets themselves reset so arrival keeps the sunlit default.
    orbitYaw = orbitPitch = 0;
    const rings = id === 'saturn' ? 2.34 : id === 'uranus' ? 2.03 : 1;
    visit = {
      model, rings, edgeOn, same,
      start: cameraAU.clone(), startRotation: camera.quaternion.clone(), initialOpacity: orbitOpacity,
      elapsed: 0, duration: reduced.matches ? 0 : same ? .72 : 3.25,
    };
    if (same) visit.start.sub(bodyAU.fromArray(positionAt(model.body, days)));
    zoom = undefined;
    showMode('travel');
    $('announce').textContent = `${model.body.name}に接近します。`;
    back.focus({ preventScroll: true });
  }

  function targetLook(model, rings) {
    aim.subVectors(bodyAU, cameraAU).multiplyScalar(SCENE_UNITS_PER_AU);
    if (camera.aspect < .82) aim.y -= model.radius * (rings > 1 ? .57 : .28);
    viewMatrix.lookAt(camera.position, aim, up);
    aimQuaternion.setFromRotationMatrix(viewMatrix);
  }

  function pose(dt) {
    if (mode === 'overview') {
      if (chart.inner() !== priorInner) {
        priorInner = chart.inner();
        zoom = { from: cameraAU.clone(), elapsed: 0 };
        updateOverviewPoint();
      }
      if (zoom) {
        zoom.elapsed += dt;
        const t = reduced.matches ? 1 : Math.min(1, zoom.elapsed / .72);
        const e = easedTravel(t);
        cameraAU.lerpVectors(zoom.from, overviewAU, e);
        cameraAU.y = travelDistance(zoom.from.y, overviewAU.y, e);
        if (t === 1) zoom = undefined;
      } else cameraAU.copy(overviewAU);
      camera.quaternion.copy(lookingDown);
      orbitOpacity = 1;
      setDepth(cameraAU.y * SCENE_UNITS_PER_AU);
      return;
    }

    const { model, rings, edgeOn, start, startRotation, duration, same, initialOpacity } = visit;
    bodyAU.fromArray(positionAt(model.body, days));
    visit.elapsed += Math.min(.15, dt);
    const progress = duration ? Math.min(1, visit.elapsed / duration) : 1;
    const e = easedTravel(progress);
    if (mode === 'return') {
      relative.subVectors(overviewAU, bodyAU);
      const dist = travelDistance(start.length(), relative.length(), e);
      direction.copy(start).normalize().lerp(relative.normalize(), easedTravel(progress / .78)).normalize();
      cameraAU.copy(bodyAU).addScaledVector(direction, dist);
      camera.quaternion.copy(startRotation).slerp(lookingDown, easedTravel((progress - .15) / .85));
      orbitOpacity = initialOpacity + (1 - initialOpacity) * easedTravel((progress - .24) / .60);
      setDepth(dist * SCENE_UNITS_PER_AU);
      if (progress === 1) finishReturn();
      return;
    }
    if (model.body.a) sunward.copy(bodyAU).normalize().negate();
    else sunward.copy(sunView);
    flank.crossVectors(sunward, up).normalize();
    eye.copy(sunward).multiplyScalar(.74).addScaledVector(flank, .60);
    if (rings > 1) {
      eye.addScaledVector(model.axis, -eye.dot(model.axis)).normalize()
        .addScaledVector(model.axis, edgeOn ? .008 : .52);
    } else {
      eye.y += .27;
    }
    const distance = observationDistance(model.radius, rings, camera.aspect, camera.fov) / SCENE_UNITS_PER_AU;
    let dist = distance;
    eye.normalize();
    // Apply the manual orbit as an offset from this body's arrival pose.
    const angles = orbitAngles([eye.x, eye.y, eye.z]);
    baseElevation = angles.elevation;
    eye.fromArray(orbitDirection(angles, orbitYaw, orbitPitch));
    if (mode === 'travel') {
      if (same) relative.copy(start);
      else relative.subVectors(start, bodyAU);
      dist = travelDistance(relative.length(), distance, e);
      direction.copy(relative).normalize().lerp(eye, easedTravel((progress - (same ? 0 : .27)) / (same ? 1 : .73))).normalize();
    } else {
      direction.copy(eye);
    }
    cameraAU.copy(bodyAU).addScaledVector(direction, dist);
    targetLook(model, rings);
    camera.quaternion.copy(startRotation).slerp(aimQuaternion, same ? e : easedTravel(progress / .52));
    orbitOpacity = mode === 'follow' ? 0 : initialOpacity * (1 - easedTravel((progress - .15) / .57));
    setDepth(dist * SCENE_UNITS_PER_AU);
    if (mode === 'travel' && progress === 1) {
      showMode('follow');
      $('announce').textContent = `${model.body.name}に到着しました。観察メモを開けます。`;
    }
  }

  function updateMarkers() {
    const progress = visit?.duration ? Math.min(1, visit.elapsed / visit.duration) : 1;
    const overview = mode === 'overview';
    const opacity = overview ? 1 : mode === 'travel' ? 1 - easedTravel((progress - .37) / .37)
      : mode === 'return' ? easedTravel((progress - .49) / .38) : 0;
    const positions = world.models.map(model => {
      screen.copy(model.position).project(camera);
      return screen.z >= -1 && screen.z <= 1 ? [(screen.x + 1) * width / 2, (1 - screen.y) * height / 2] : null;
    });
    chart.present(positions, { overview, opacity, moving: Boolean(zoom) || !overview,
      target: mode === 'travel' && progress > .19 ? visit.model.body.id : undefined });
  }

  function tuneQuality(elapsed) {
    if (warmup > 0) { warmup -= Math.min(elapsed, .1); return; }
    perfTime += Math.min(elapsed, .14);
    perfFrames++;
    if (perfTime < 2.15) return;
    const ms = perfTime * 1000 / perfFrames;
    perfTime = perfFrames = 0;
    let next = level;
    if (ms > 33) { next = Math.max(0, level - 1); fastWindows = 0; }
    else if (ms < 19 && level < ceiling) {
      if (++fastWindows >= 4) { next++; fastWindows = 0; }
    } else fastWindows = 0;
    if (next !== level) { level = next; resize(); warmup = .7; }
  }

  function draw(time) {
    if (!active) return;
    frame = requestAnimationFrame(draw);
    const elapsed = previousTime === undefined ? 1 / 60 : Math.max(.001, (time - previousTime) / 1000);
    previousTime = time;
    if (document.hidden) return;
    const dt = Math.min(.06, elapsed);
    const dialogOpen = modal();
    if (!paused && !dialogOpen) {
      const stepDays = Math.min(.25, elapsed) * rate;
      days += stepDays;
      spinDays += stepDays;
      if (!reduced.matches) clock += dt;
    }
    pose(dialogOpen ? 0 : elapsed);
    world.place(days, spinDays, cameraAU, orbitOpacity);
    if (time >= nextReadout) {
      $('elapsed-days').textContent = `経過 ${dayFormat.format(days)} 日`;
      nextReadout = time + 180;
    }
    camera.updateMatrixWorld();
    planetMaps.update(time, dt, camera, level, coarse.matches, visit?.model);
    // Keep the decorative sky outside the physical depth/frustum budget.
    skyCamera.quaternion.copy(camera.quaternion);
    sky.update(skyCamera);
    world.updateEffects(clock, camera);
    renderer.clear();
    renderer.render(skyScene, skyCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
    if (time >= nextChart) { updateMarkers(); nextChart = time + 25; }
    if (!dialogOpen) tuneQuality(elapsed);
  }

  stage.append(renderer.domElement);
  stage.setAttribute('aria-hidden', 'true');
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  const pointerModeChanged = () => {
    ceiling = coarse.matches ? 2 : 3;
    level = Math.min(level, ceiling);
    resize();
  };
  const resetFrameTime = () => { previousTime = undefined; };
  const orbiting = () => active && mode === 'follow' && !modal();
  const rotate = (dx, dy) => {
    const scale = Math.PI / Math.max(240, height);
    orbitYaw -= dx * scale;
    const [low, high] = orbitPitchBounds(baseElevation);
    orbitPitch = Math.min(high, Math.max(low, orbitPitch + dy * scale));
  };
  const endDrag = event => {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  const startDrag = event => {
    if (drag.id !== null || !event.isPrimary || !orbiting()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.id = event.pointerId;
    drag.x = event.clientX;
    drag.y = event.clientY;
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = event => {
    if (event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!dx && !dy) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    rotate(dx, dy);
  };
  const keySteps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const keyOrbit = event => {
    const step = keySteps[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey || !orbiting()) return;
    if (event.target instanceof Element && event.target.closest('button, a, select, input, textarea, [contenteditable]')) return;
    event.preventDefault();
    rotate(step[0] * 36, step[1] * 36);
  };
  stage.addEventListener('pointerdown', startDrag);
  stage.addEventListener('pointermove', moveDrag);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('keydown', keyOrbit);
  coarse.addEventListener('change', pointerModeChanged);
  document.addEventListener('visibilitychange', resetFrameTime);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    active = false;
    cancelAnimationFrame(frame);
    planetMaps.dispose();
    observer.disconnect();
    coarse.removeEventListener('change', pointerModeChanged);
    document.removeEventListener('visibilitychange', resetFrameTime);
    window.removeEventListener('keydown', keyOrbit);
    stage.removeEventListener('pointerdown', startDrag);
    stage.removeEventListener('pointermove', moveDrag);
    stage.removeEventListener('pointerup', endDrag);
    stage.removeEventListener('pointercancel', endDrag);
    stage.removeEventListener('lostpointercapture', endDrag);
    stage.style.touchAction = '';
    renderer.domElement.remove();
    onContextLost();
  });
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').setAttribute('aria-pressed', String(paused));
    $('pause').setAttribute('aria-label', paused ? '時間を再開' : '時間を一時停止');
    $('pause').firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  });
  $('time-rate').addEventListener('change', event => { rate = Number(event.target.value); });
  chart.useScene();
  resize();
  cameraAU.copy(overviewAU);
  $('pause').disabled = $('time-rate').disabled = false;
  frame = requestAnimationFrame(draw);
  return {
    travelTo, overview: toOverview,
    observation: () => mode === 'follow' ? visit.model.body : undefined,
    ringEdgeOn: () => mode === 'follow' && visit.edgeOn,
  };
}
