import {
  ATLAS,
  CATALOG,
  ENTRY,
  STAGES,
  SPECIFICATIONS,
  PRINCIPLES,
  HOTSPOTS,
  OPERATING_GUIDE,
} from './content.mjs';
import {
  MISSION_DURATION,
  formatMissionTime,
  normalizeMissionTime,
  resolveTrackingTarget,
  sampleMission,
} from './mission-state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const stageHost = $('space-stage');
const fallbackDiagram = $('fallback-diagram');
const loadStatus = $('load-status');
const timeline = $('mission-timeline');
const playButton = $('play-toggle');
const helpDialog = $('help-dialog');
const helpClose = $('help-close');
const observationDrawer = $('observation-drawer');
const observationOpen = $('observation-open');
const observationClose = $('observation-close');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const stageButtons = [...document.querySelectorAll('.stage-button[data-stage-index]')];
const timelineButtons = [...document.querySelectorAll('.timeline-stages [data-stage-index]')];
const viewButtons = [...document.querySelectorAll('.view-button[data-view]')];
const trackingButtons = [...document.querySelectorAll('.tracking-buttons [data-track]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];
const hotspotButtons = [...document.querySelectorAll('.hotspot[data-hotspot]')];

let viewer;
let currentState = sampleMission(0);
let time = 0;
let rate = 1;
let playing = false;
let currentView = 'overall';
let selectedHotspot = null;
let follow = 'auto';
let section = false;
let exploded = false;
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedPhase = '';
let renderedFocus;
let userInteracted = false;
let resumeAfterHelp = false;
let threeDAvailable = false;
const trackingLabels = { stack: '統合機体', both: '上下段', ship: '上段', booster: '下段' };

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderStaticContent() {
  const entryNumber = String(ENTRY.entryNumber).padStart(2, '0');
  const entryCount = String(CATALOG.length).padStart(2, '0');
  $('catalog-count').textContent = `${entryNumber} / ${entryCount}`;
  $('spec-list').replaceChildren(...SPECIFICATIONS.map(([term, value, note]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    const small = document.createElement('small');
    dt.textContent = term;
    dd.textContent = value;
    small.textContent = note;
    dd.append(small);
    row.append(dt, dd);
    return row;
  }));
  $('principle-list').replaceChildren(...PRINCIPLES.map(([term, text]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = text;
    row.append(dt, dd);
    return row;
  }));
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  document.title = `${ENTRY.title} — ${ATLAS.subtitle} | ${ATLAS.title}`;
}

function renderPhase(state, force = false) {
  const stage = STAGES[state.stageIndex];
  const key = `${stage.id}:${selectedHotspot || ''}`;
  if (!force && key === renderedPhase) return;
  renderedPhase = key;
  const number = String(stage.number).padStart(2, '0');
  $('phase-kicker').textContent = `${number} / ${stage.english}`;
  $('phase-title').textContent = stage.title;
  $('phase-description').textContent = stage.summary;
  $('phase-study').textContent = stage.study;
  $('panel-phase-number').textContent = `PHASE ${number}`;
  $('panel-phase-title').textContent = stage.title;
  $('confirmed-list').replaceChildren(...stage.confirmed.map(listItem));
  $('planned-list').replaceChildren(...stage.planned.map(listItem));

  for (const button of stageButtons) {
    const active = Number(button.dataset.stageIndex) === state.stageIndex;
    button.classList.toggle('is-current', active);
    if (active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  for (const button of timelineButtons) button.classList.toggle('is-current', Number(button.dataset.stageIndex) === state.stageIndex);
}

function renderFocus(force = false) {
  const key = selectedHotspot || 'default';
  if (!force && key === renderedFocus) return;
  renderedFocus = key;
  const entry = selectedHotspot ? HOTSPOTS[selectedHotspot] : undefined;
  $('focus-kicker').textContent = entry?.english || 'EXPLORE THE MODEL';
  $('focus-title').textContent = entry?.title || '構造を拡大して見る';
  $('focus-description').textContent = entry?.description
    || '3Dのラベル、上部の「観察」ドロワー、「断面」「分解」を組み合わせると、エンジン・タンク・分離部・フラップ・ペイロードを読み解けます。';
  const specs = $('focus-specs');
  specs.hidden = !entry;
  if (entry) {
    specs.replaceChildren(...entry.specs.map(([term, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term.trim();
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
  } else specs.replaceChildren();
  for (const button of hotspotButtons) {
    const active = button.dataset.hotspot === selectedHotspot;
    button.setAttribute('aria-pressed', String(active));
  }
}

function updateReadout(state) {
  const label = formatMissionTime(time);
  $('mission-time').textContent = label;
  timeline.value = String(time);
  timeline.style.setProperty('--progress', `${state.progress * 100}%`);
  timeline.setAttribute('aria-valuetext', `${label} ${STAGES[state.stageIndex].title}`);
  $('fallback-stage-caption').textContent = `2D模式図 · ${STAGES[state.stageIndex].title}`;
  fallbackDiagram.dataset.stage = state.stageId;
}

function updateTrackingUI(state) {
  const separated = state.separation > .001;
  const target = resolveTrackingTarget(state, follow);
  for (const button of trackingButtons) {
    button.disabled = !threeDAvailable || !separated;
    button.setAttribute('aria-pressed', String(button.dataset.track === follow));
  }
  $('tracking-control').dataset.target = target;
  const status = !separated
    ? '分離後に選択できます'
    : !threeDAvailable ? '3D利用時のみ選択できます' : `追跡：${trackingLabels[target]}`;
  if ($('tracking-status').textContent !== status) $('tracking-status').textContent = status;
}

function updateUI(state, force = false) {
  renderPhase(state, force);
  updateReadout(state);
  updateTrackingUI(state);
}

function setPlaying(next, announce = false) {
  playing = Boolean(next) && time < MISSION_DURATION;
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? 'ミッションを再生します。' : 'ミッションを一時停止します。';
}

function togglePlayback() {
  userInteracted = true;
  if (time >= MISSION_DURATION) time = 0;
  setPlaying(!playing, true);
  updateUI(sampleMission(time), true);
}

function setRate(next) {
  rate = Number(next);
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function seek(value, announce = true) {
  userInteracted = true;
  time = normalizeMissionTime(value);
  setPlaying(false);
  currentState = sampleMission(time);
  updateUI(currentState, true);
  if (announce) $('announce').textContent = `${formatMissionTime(time)} ${STAGES[currentState.stageIndex].title}へ移動しました。`;
}

function seekStage(index) {
  const stage = STAGES[index];
  if (!stage) return;
  setFollow('auto', false);
  selectedHotspot = null;
  setViewUI('overall');
  renderFocus(true);
  seek(stage.start + (stage.start === 0 ? 0 : .001));
}

function setViewUI(next) {
  currentView = next;
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === next));
}

function selectView(next) {
  userInteracted = true;
  selectedHotspot = null;
  setViewUI(next);
  renderFocus(true);
  viewer?.focusView(next);
  if (mobile.matches) setObservationOpen(false, true);
  $('announce').textContent = `${next === 'overall' ? '全体' : HOTSPOTS[next]?.title || next}の視点に切り替えました。`;
}

function setObservationOpen(open, returnFocus = false) {
  observationDrawer.hidden = !open;
  observationOpen.setAttribute('aria-expanded', String(open));
  if (open) observationClose.focus({ preventScroll: true });
  else if (returnFocus) observationOpen.focus({ preventScroll: true });
}

function selectHotspot(id) {
  const entry = HOTSPOTS[id];
  if (!entry) return;
  userInteracted = true;
  selectedHotspot = id;
  currentView = 'hotspot';
  for (const button of viewButtons) button.setAttribute('aria-pressed', 'false');
  if (id === 'tanks' || id === 'payload') setSection(true, false);
  viewer?.focusHotspot(id);
  renderFocus(true);
  if (mobile.matches) setPanelOpen(true);
  $('announce').textContent = `${entry.title}にフォーカスしました。`;
}

function setSection(next, speak = true) {
  section = Boolean(next);
  $('section-toggle').setAttribute('aria-pressed', String(section));
  viewer?.setDisplayMode({ section, exploded });
  if (speak) $('announce').textContent = section ? '胴体を半透明にして内部を示します。' : '胴体の表示を戻します。';
}

function setExploded(next, speak = true) {
  exploded = Boolean(next);
  $('explode-toggle').setAttribute('aria-pressed', String(exploded));
  viewer?.setDisplayMode({ section, exploded });
  if (speak) $('announce').textContent = exploded ? '内部を分解して広げます。' : '分解表示を解除します。';
}

function setPanelOpen(open) {
  exhibit.dataset.panel = open ? 'open' : 'closed';
  $('info-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle-label').textContent = open ? '解説を閉じる' : '解説を開く';
}

function setFollow(next, speak = true) {
  follow = ['auto', 'both', 'ship', 'booster'].includes(next) ? next : 'auto';
  viewer?.setFollow(follow);
  updateTrackingUI(currentState);
  if (speak) $('announce').textContent = follow === 'auto'
    ? '追跡を自動に戻しました。'
    : `追跡対象を${trackingLabels[follow]}に切り替えました。`;
}

function resetMission() {
  userInteracted = true;
  time = 0;
  setRate(1);
  setPlaying(false);
  setFollow('auto');
  selectedHotspot = null;
  currentView = 'overall';
  setViewUI('overall');
  setSection(false, false);
  setExploded(false, false);
  viewer?.resetView();
  if (mobile.matches) setPanelOpen(false);
  currentState = sampleMission(0);
  renderFocus(true);
  updateUI(currentState, true);
  $('announce').textContent = 'ミッションと視点をリセットしました。';
}

function set3DAvailable(available) {
  threeDAvailable = Boolean(available);
  for (const button of [...viewButtons, $('section-toggle'), $('explode-toggle'), $('reset-view')]) button.disabled = !threeDAvailable;
  updateTrackingUI(currentState);
}

function fallback(message = '3Dを開始できませんでした。2D模式図と解説を表示しています。') {
  const failed = viewer;
  viewer = undefined;
  failed?.dispose();
  stageHost.querySelector('canvas')?.remove();
  setPlaying(false);
  set3DAvailable(false);
  fallbackDiagram.hidden = false;
  loadStatus.hidden = false;
  loadStatus.textContent = message;
  $('render-quality').textContent = '2D模式図';
  stageHost.classList.add('is-fallback');
  $('announce').textContent = message;
}

async function initViewer() {
  try {
    const { createStarshipViewer } = await import('./starship-viewer.mjs');
    viewer = createStarshipViewer(stageHost, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onContextLost: fallback,
    });
    fallbackDiagram.hidden = true;
    loadStatus.hidden = true;
    stageHost.classList.remove('is-fallback');
    set3DAvailable(true);
    viewer.setFollow(follow);
    viewer.setDisplayMode({ section, exploded });
    if (currentView === 'hotspot' && selectedHotspot) viewer.focusHotspot(selectedHotspot);
    else viewer.focusView(currentView);
    if (!userInteracted && !reduced.matches) setPlaying(true);
  } catch (error) {
    console.warn('FRONTIER ATLAS: 3D unavailable', error);
    fallback();
  }
}

function frame(now) {
  animationFrame = requestAnimationFrame(frame);
  if (document.hidden) {
    previousFrame = undefined;
    return;
  }
  const elapsed = previousFrame === undefined ? 0 : Math.min(.1, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  if (playing) {
    time = Math.min(MISSION_DURATION, time + elapsed * rate);
    if (time >= MISSION_DURATION) setPlaying(false);
  }
  currentState = sampleMission(time);
  viewer?.render(currentState, { delta: elapsed, now, playing });
  if (now - lastUIUpdate > 70 || renderedPhase !== `${STAGES[currentState.stageIndex].id}:${selectedHotspot || ''}`) {
    updateUI(currentState);
    lastUIUpdate = now;
  }
}

function visibilityChanged() {
  previousFrame = undefined;
  if (document.hidden) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else if (!animationFrame) {
    animationFrame = requestAnimationFrame(frame);
  }
}

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, summary, [contenteditable="true"]'));
}

function keyboardShortcut(event) {
  if (event.key === 'Escape' && !observationDrawer.hidden && !helpDialog.open) {
    event.preventDefault();
    setObservationOpen(false, true);
    return;
  }
  if (event.code !== 'Space' || event.repeat || isInteractiveTarget(event.target) || helpDialog.open) return;
  event.preventDefault();
  togglePlayback();
}

playButton.addEventListener('click', togglePlayback);
timeline.addEventListener('input', () => seek(Number(timeline.value), false));
timeline.addEventListener('change', () => $('announce').textContent = `${formatMissionTime(time)} ${STAGES[currentState.stageIndex].title}`);
for (const button of speedButtons) button.addEventListener('click', () => { userInteracted = true; setRate(button.dataset.rate); });
for (const button of [...stageButtons, ...timelineButtons]) button.addEventListener('click', () => seekStage(Number(button.dataset.stageIndex)));
for (const button of viewButtons) button.addEventListener('click', () => selectView(button.dataset.view));
for (const button of hotspotButtons) button.addEventListener('click', () => selectHotspot(button.dataset.hotspot));
$('section-toggle').addEventListener('click', () => setSection(!section));
$('explode-toggle').addEventListener('click', () => setExploded(!exploded));
$('reset-view').addEventListener('click', () => {
  userInteracted = true;
  selectedHotspot = null;
  setViewUI('overall');
  renderFocus(true);
  viewer?.resetView();
  $('announce').textContent = 'カメラの視点を初期位置に戻しました。ミッション時刻は変わりません。';
});
$('reset-mission').addEventListener('click', resetMission);
for (const button of trackingButtons) button.addEventListener('click', () => {
  userInteracted = true;
  setFollow(button.dataset.track);
  selectedHotspot = null;
  setViewUI('overall');
  renderFocus(true);
});
observationOpen.addEventListener('click', () => setObservationOpen(true));
observationClose.addEventListener('click', () => setObservationOpen(false, true));
$('info-toggle').addEventListener('click', () => setPanelOpen(exhibit.dataset.panel !== 'open'));
function closeHelp() {
  if (helpDialog.open) helpDialog.close();
}

$('help-open').addEventListener('click', () => {
  resumeAfterHelp = playing;
  setPlaying(false);
  helpDialog.showModal();
});
helpClose.addEventListener('click', closeHelp);
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
});
helpDialog.addEventListener('close', () => {
  if (resumeAfterHelp && time < MISSION_DURATION) setPlaying(true);
  resumeAfterHelp = false;
});
document.addEventListener('visibilitychange', visibilityChanged);
document.addEventListener('keydown', keyboardShortcut);
reduced.addEventListener('change', event => { if (event.matches) setPlaying(false); });
mobile.addEventListener('change', event => setPanelOpen(!event.matches));

renderStaticContent();
renderFocus(true);
setRate(1);
setPanelOpen(!mobile.matches);
updateUI(currentState, true);
animationFrame = requestAnimationFrame(frame);
initViewer();
