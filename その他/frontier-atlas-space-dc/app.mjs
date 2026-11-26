import {
  ATLAS,
  BENEFITS,
  CHALLENGES,
  COMPARISON,
  ENTRY,
  HOTSPOTS,
  MODES,
  MODE_ORDER,
  OPERATING_GUIDE,
  SPECIFICATIONS,
} from './content.mjs';
import {
  ORBIT_DURATION,
  formatOrbitTime,
  normalizeOrbitTime,
  sampleOrbitalScene,
} from './scene-state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const stageHost = $('space-stage');
const fallbackDiagram = $('fallback-diagram');
const loadStatus = $('load-status');
const timeline = $('orbit-timeline');
const playButton = $('play-toggle');
const helpDialog = $('help-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const compact = matchMedia('(max-width: 1199px)');
const modeButtons = [...document.querySelectorAll('.view-button[data-view]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];
const hotspotButtons = [...document.querySelectorAll('.hotspot[data-hotspot]')];

const FLOW_CAPTIONS = {
  overall: '太陽光 → AI計算 → 光通信 → 地球 / 熱は赤外線で放熱',
  power: '太陽光 → 太陽電池 → 電力変換 → AI・通信機器',
  link: 'AI処理 → 光信号 → 衛星間中継 → 地球局受信',
  cooling: 'AIチップ → 熱移動 → ラジエーター → 赤外線で宇宙へ',
  compute: '宇宙のデータ → 軌道上で選別・推論 → 結果だけ地球へ',
};

let viewer;
let time = 0;
let rate = 1;
let playing = false;
let currentMode = 'overall';
let selectedHotspot = null;
let currentState = sampleOrbitalScene(0);
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedMode = '';
let renderedFocus = '';
let userInteracted = false;
let resumeAfterHelp = false;

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderStaticContent() {
  $('catalog-count').textContent = `${String(ATLAS.entryNumber).padStart(2, '0')} / ${String(ATLAS.catalogCount).padStart(2, '0')}`;
  $('comparison-list').replaceChildren(...COMPARISON.map(row => {
    const element = document.createElement('div');
    const term = document.createElement('dt');
    const ground = document.createElement('dd');
    const space = document.createElement('dd');
    term.textContent = row.term;
    ground.textContent = row.ground;
    space.textContent = row.space;
    element.append(term, ground, space);
    return element;
  }));
  $('spec-list').replaceChildren(...SPECIFICATIONS.map(([name, value, note]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    const small = document.createElement('small');
    dt.textContent = name;
    dd.textContent = value;
    small.textContent = note;
    dd.append(small);
    row.append(dt, dd);
    return row;
  }));
  $('benefit-list').replaceChildren(...BENEFITS.map(listItem));
  $('challenge-list').replaceChildren(...CHALLENGES.map(listItem));
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  document.title = `${ENTRY.title} — ${ENTRY.japaneseTitle} | ${ATLAS.title}`;
}

function activeModeData() {
  return MODES.find(mode => mode.id === currentMode) || MODES[0];
}

function renderMode(force = false) {
  if (!force && renderedMode === currentMode) return;
  renderedMode = currentMode;
  const mode = activeModeData();
  const index = MODES.indexOf(mode);
  const number = String(index + 1).padStart(2, '0');
  $('mode-kicker').textContent = `${number} / ${mode.english}`;
  $('mode-title').textContent = mode.title;
  $('mode-description').textContent = mode.summary;
  $('mode-study').textContent = mode.study;
  $('panel-mode-english').textContent = mode.english;
  $('panel-mode-title').textContent = mode.title;
  $('flow-caption').textContent = FLOW_CAPTIONS[mode.id];
  $('flow-list').replaceChildren(...mode.flow.map(([step, title, detail]) => {
    const item = document.createElement('li');
    const badge = document.createElement('span');
    const copy = document.createElement('p');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    badge.textContent = step;
    strong.textContent = title;
    small.textContent = detail;
    copy.append(strong, small);
    item.append(badge, copy);
    return item;
  }));
  exhibit.dataset.mode = mode.id;
  fallbackDiagram.dataset.mode = mode.id;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.view === mode.id));
}

function renderFocus(force = false) {
  const key = selectedHotspot || 'default';
  if (!force && renderedFocus === key) return;
  renderedFocus = key;
  const entry = selectedHotspot ? HOTSPOTS[selectedHotspot] : undefined;
  $('focus-kicker').textContent = entry?.english || 'EXPLORE THE MODEL';
  $('focus-title').textContent = entry?.title || '5つの機器にフォーカス';
  $('focus-description').textContent = entry?.description || '太陽光パネル、AIチップ、光通信、ラジエーター、地球局のラベルを選ぶと、該当部分を拡大して解説します。';
  const specs = $('focus-specs');
  specs.hidden = !entry;
  if (entry) {
    specs.replaceChildren(...entry.specs.map(([term, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
  } else specs.replaceChildren();
  for (const button of hotspotButtons) button.setAttribute('aria-pressed', String(button.dataset.hotspot === selectedHotspot));
}

function updateReadout(state) {
  const label = formatOrbitTime(time);
  $('orbit-time').textContent = label;
  timeline.value = String(time);
  timeline.style.setProperty('--progress', `${state.progress * 100}%`);
  timeline.setAttribute('aria-valuetext', `${label} ${activeModeData().label}`);
  $('fallback-stage-caption').textContent = `2D模式図 · ${activeModeData().label}`;
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? '太陽光・データ・熱の流れを再生します。' : 'アニメーションを一時停止します。';
}

function togglePlayback() {
  userInteracted = true;
  if (time >= ORBIT_DURATION) time = 0;
  setPlaying(!playing, true);
  updateReadout(currentState);
}

function setRate(next) {
  rate = Number(next);
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function seek(value, announce = false) {
  userInteracted = true;
  time = normalizeOrbitTime(value);
  setPlaying(false);
  currentState = sampleOrbitalScene(reduced.matches ? 0 : time);
  updateReadout(currentState);
  if (announce) $('announce').textContent = `${formatOrbitTime(time)}へ移動しました。`;
}

function setPanelOpen(open) {
  exhibit.dataset.panel = open ? 'open' : 'closed';
  $('info-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle-label').textContent = open ? '解説を閉じる' : '解説を開く';
  const collapsedOnMobile = mobile.matches && !open;
  $('info-content').inert = collapsedOnMobile;
  if (collapsedOnMobile) $('info-content').setAttribute('aria-hidden', 'true');
  else $('info-content').removeAttribute('aria-hidden');
}

function setBriefingOpen(open) {
  exhibit.dataset.briefing = open ? 'open' : 'closed';
  $('briefing-toggle').setAttribute('aria-expanded', String(open));
  $('briefing-toggle').setAttribute('aria-label', open ? '比較・研究段階・基本構成を閉じる' : '比較・研究段階・基本構成を開く');
  if (open && mobile.matches) setPanelOpen(false);
}

function selectMode(next, announce = true) {
  if (!MODE_ORDER.includes(next)) return;
  userInteracted = true;
  currentMode = next;
  selectedHotspot = null;
  renderMode(true);
  renderFocus(true);
  viewer?.focusView(next);
  if (announce) $('announce').textContent = `${activeModeData().label}のモードに切り替えました。`;
}

function selectHotspot(id) {
  const entry = HOTSPOTS[id];
  if (!entry) return;
  userInteracted = true;
  selectedHotspot = id;
  currentMode = entry.mode;
  renderMode(true);
  renderFocus(true);
  viewer?.focusHotspot(id);
  setBriefingOpen(false);
  if (mobile.matches) setPanelOpen(true);
  $('announce').textContent = `${entry.title}にフォーカスしました。`;
}

function resetView() {
  userInteracted = true;
  selectedHotspot = null;
  currentMode = 'overall';
  renderMode(true);
  renderFocus(true);
  viewer?.resetView();
  $('announce').textContent = 'カメラの視点とモードを全体表示に戻しました。時刻はそのままです。';
}

function set3DAvailable(available) {
  $('reset-view').disabled = !available;
}

function fallback(message = '3Dを開始できませんでした。2D模式図と解説を表示しています。') {
  const failed = viewer;
  viewer = undefined;
  failed?.dispose();
  stageHost.querySelector('canvas')?.remove();
  setPlaying(false);
  set3DAvailable(false);
  for (const button of hotspotButtons) button.hidden = true;
  fallbackDiagram.hidden = false;
  loadStatus.hidden = false;
  loadStatus.textContent = message;
  $('render-quality').textContent = '2D模式図';
  stageHost.classList.add('is-fallback');
  $('announce').textContent = message;
}

async function initViewer() {
  try {
    const { createOrbitalViewer } = await import('./orbital-viewer.mjs');
    viewer = createOrbitalViewer(stageHost, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onContextLost: fallback,
    });
    fallbackDiagram.hidden = true;
    loadStatus.hidden = true;
    stageHost.classList.remove('is-fallback');
    set3DAvailable(true);
    if (selectedHotspot) viewer.focusHotspot(selectedHotspot);
    else viewer.focusView(currentMode);
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
  if (playing) time = (time + elapsed * rate) % ORBIT_DURATION;
  currentState = sampleOrbitalScene(reduced.matches ? 0 : time);
  viewer?.render(currentState, { delta: elapsed, now, playing, motionScale: reduced.matches ? 0 : 1 });
  if (now - lastUIUpdate > 70) {
    updateReadout(currentState);
    lastUIUpdate = now;
  }
}

function visibilityChanged() {
  previousFrame = undefined;
  viewer?.resetFrameTime();
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
  if (event.code !== 'Space' || event.repeat || isInteractiveTarget(event.target) || helpDialog.open) return;
  event.preventDefault();
  togglePlayback();
}

playButton.addEventListener('click', togglePlayback);
timeline.addEventListener('input', () => seek(Number(timeline.value)));
timeline.addEventListener('change', () => { $('announce').textContent = `${formatOrbitTime(time)}へ移動しました。`; });
for (const button of speedButtons) button.addEventListener('click', () => { userInteracted = true; setRate(button.dataset.rate); });
for (const button of modeButtons) button.addEventListener('click', () => selectMode(button.dataset.view));
for (const button of hotspotButtons) button.addEventListener('click', () => selectHotspot(button.dataset.hotspot));
$('reset-view').addEventListener('click', resetView);
$('info-toggle').addEventListener('click', () => setPanelOpen(exhibit.dataset.panel !== 'open'));
$('briefing-toggle').addEventListener('click', () => setBriefingOpen(exhibit.dataset.briefing !== 'open'));
function closeHelpDialog() {
  if (helpDialog.open) helpDialog.close();
}

$('help-open').addEventListener('click', () => {
  resumeAfterHelp = playing;
  setPlaying(false);
  helpDialog.showModal();
});
$('help-close').addEventListener('click', closeHelpDialog);
helpDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeHelpDialog();
});
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) closeHelpDialog();
});
helpDialog.addEventListener('close', () => {
  if (resumeAfterHelp) setPlaying(true);
  resumeAfterHelp = false;
});
document.addEventListener('visibilitychange', visibilityChanged);
document.addEventListener('keydown', keyboardShortcut);
reduced.addEventListener('change', event => { if (event.matches) setPlaying(false); });
mobile.addEventListener('change', event => setPanelOpen(!event.matches));
compact.addEventListener('change', event => { if (!event.matches) setBriefingOpen(false); });

renderStaticContent();
renderMode(true);
renderFocus(true);
setRate(1);
setPanelOpen(!mobile.matches);
setBriefingOpen(false);
updateReadout(currentState);
animationFrame = requestAnimationFrame(frame);
initViewer();
