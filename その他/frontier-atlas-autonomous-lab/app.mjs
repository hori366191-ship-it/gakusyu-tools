import {
  EVIDENCE_LEGEND,
  MODE_IDS,
  OPERATING_GUIDE,
  SOURCES,
  getHotspot,
  getMode,
} from './content.mjs';
import {
  CYCLE_SECONDS,
  DEFAULT_AUTONOMY,
  PLAYBACK_RATES,
  advancePhase,
  calculateLabState,
  getModeGuidance,
  normalizeAutonomy,
} from './state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const stageHost = $('space-stage');
const fallbackDiagram = $('fallback-diagram');
const loadStatus = $('load-status');
const playButton = $('play-toggle');
const helpDialog = $('help-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const modeButtons = [...document.querySelectorAll('.mode-button[data-mode]')];
const hotspotButtons = [...document.querySelectorAll('.hotspot[data-hotspot]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];

let viewer;
let mode = 'hypothesis';
let phase = 0;
let rate = 1;
let playing = !reduced.matches;
let autonomy = DEFAULT_AUTONOMY;
let iteration = 0;
let selectedHotspot = null;
let currentState = calculateLabState(mode, phase, { autonomy, iteration });
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedMode = '';
let renderedSelection;
let renderedAutonomy = '';
let resumeAfterHelp = false;

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderStaticContent() {
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  $('legend-list').replaceChildren(...EVIDENCE_LEGEND.map(entry => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = entry.label;
    item.append(label, document.createTextNode(` — ${entry.text}`));
    return item;
  }));
  $('source-list').replaceChildren(...SOURCES.map(source => {
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = source.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = `${source.organization} — ${source.title} (${source.year})`;
    const kind = document.createElement('small');
    kind.textContent = source.kind;
    item.append(anchor, kind);
    return item;
  }));
  buildFallbackWells();
  buildFallbackBars();
}

function renderMode(force = false) {
  if (!force && renderedMode === mode) return;
  renderedMode = mode;
  const entry = getMode(mode);
  exhibit.dataset.mode = mode;
  fallbackDiagram.dataset.mode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('panel-kicker').textContent = `MODE ${entry.number} / 05`;
  $('panel-english').textContent = entry.english;
  $('panel-title').textContent = entry.title;
  $('panel-summary').textContent = entry.lead;
  $('panel-detail').textContent = entry.detail;
  $('stage-label').textContent = entry.stage;
  $('status-label').textContent = entry.status;
  $('observed-list').replaceChildren(...entry.observed.map(listItem));
  $('research-list').replaceChildren(...entry.research.map(listItem));
  $('conceptual-list').replaceChildren(...entry.conceptual.map(listItem));
  $('spec-list').replaceChildren(...entry.specs.map(listItem));
  $('challenge-list').replaceChildren(...entry.challenges.map(listItem));
  $('mode-guidance').textContent = getModeGuidance(currentState);
  renderSelection(true);
}

function renderSelection(force = false) {
  const key = selectedHotspot || '';
  if (!force && renderedSelection === key) return;
  renderedSelection = key;
  const hotspot = getHotspot(selectedHotspot);
  $('selected-card').hidden = !hotspot;
  if (hotspot) {
    $('selected-english').textContent = hotspot.english;
    $('selected-title').textContent = hotspot.title;
    $('selected-role').textContent = hotspot.role;
    $('selected-current').textContent = hotspot.current;
    $('selected-evidence').textContent = hotspot.evidence;
    $('selected-caveat').textContent = hotspot.caveat;
  }
  for (const button of hotspotButtons) button.setAttribute('aria-pressed', String(button.dataset.hotspot === selectedHotspot));
  $('panel-handle-title').textContent = hotspot ? `${hotspot.title}を選択中` : getMode(mode).shortTitle;
}

function renderAutonomy(force = false) {
  if (!force && renderedAutonomy === autonomy) return;
  renderedAutonomy = autonomy;
  $('autonomy').value = String(autonomy);
  $('autonomy').style.setProperty('--value', `${autonomy}%`);
  $('autonomy-value').textContent = `${autonomy}%`;
  $('autonomy').setAttribute('aria-valuetext', `${autonomy}パーセント。${currentState.automationLabel}。表示用の概念パラメータ。`);
  $('automation-label').textContent = currentState.automationLabel;
  $('automation-evidence').textContent = currentState.evidenceLabel;
  const loopText = currentState.loopClosed ? 'CLOSED LOOP · CONCEPT ONLY' : 'OPEN LOOP · HUMAN REVIEW';
  $('loop-label').textContent = loopText;
  $('transport-loop-label').textContent = loopText;
  exhibit.dataset.loop = currentState.loopType;
  fallbackDiagram.dataset.loop = currentState.loopType;
  $('autonomy-warning').textContent = currentState.loopClosed
    ? '完全自律は未実証の構想です。安全性・信頼性・倫理の実証値ではありません。'
    : '人間レビューを挟む開ループです。現状の部分的自動化を表しています。';
}

function buildFallbackWells() {
  const group = $('fallback-wells');
  group.replaceChildren();
  for (let index = 0; index < 96; index++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(252 + (index % 12) * 7));
    circle.setAttribute('cy', String(313 + Math.floor(index / 12) * 7));
    circle.setAttribute('r', '2.5');
    circle.setAttribute('class', 'f-well');
    group.append(circle);
  }
}

function buildFallbackBars() {
  const group = $('fallback-bars');
  group.replaceChildren();
  for (let index = 0; index < 12; index++) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(305 + index * 8));
    rect.setAttribute('y', '160');
    rect.setAttribute('width', '5');
    rect.setAttribute('height', '4');
    rect.setAttribute('rx', '1');
    rect.setAttribute('class', 'f-bar');
    group.append(rect);
  }
}

function updateFallback() {
  const robot = currentState.robot;
  const baseX = 151;
  const baseY = 330;
  const elbowX = baseX - 18 + robot.reach * 34;
  const elbowY = baseY - 65 - robot.reach * 12;
  const tipX = elbowX + 46 + robot.reach * 68;
  const tipY = elbowY + 30 + robot.reach * 68;
  const armPath = `M${baseX} ${baseY} L${elbowX.toFixed(1)} ${elbowY.toFixed(1)} L${tipX.toFixed(1)} ${tipY.toFixed(1)}`;
  $('fallback-arm').setAttribute('d', armPath);
  $('fallback-arm-outline').setAttribute('d', armPath);
  $('fallback-pipette').setAttribute('x2', String(tipX));
  $('fallback-pipette').setAttribute('y2', String(tipY + 30));
  $('fallback-drop').setAttribute('cx', tipX.toFixed(1));
  $('fallback-drop').setAttribute('cy', String(tipY + 38 + ((currentState.phase * 90) % 24)));
  $('fallback-drop').setAttribute('opacity', String(currentState.experiment * (.4 + robot.drop * .6)));
  $('fallback-scan').setAttribute('x1', String(274 + currentState.measurement * 65));
  $('fallback-scan').setAttribute('x2', String(274 + currentState.measurement * 65));
  $('fallback-scan').setAttribute('opacity', String(currentState.measurement));
  $('fallback-gate').setAttribute('opacity', currentState.humanGateVisible ? '1' : '.15');
  $('fallback-flow').setAttribute('opacity', String(.2 + currentState.flowOpacity * .7));
  const angle = currentState.phase * Math.PI * 2;
  $('fallback-flow-particle').setAttribute('cx', (240 + Math.cos(angle) * 142).toFixed(1));
  $('fallback-flow-particle').setAttribute('cy', (245 - Math.sin(angle) * 92).toFixed(1));
  $('fallback-flow-particle').setAttribute('opacity', String(currentState.flowOpacity));
  const wells = [...$('fallback-wells').children];
  wells.forEach((well, index) => {
    const signal = currentState.data[index % currentState.data.length];
    const hue = currentState.loopClosed ? 265 + signal * 45 : 165 + signal * 55;
    well.setAttribute('fill', `hsl(${hue} 65% ${38 + signal * 22}%)`);
    well.setAttribute('opacity', String(.45 + currentState.progress * .5));
  });
  [...$('fallback-bars').children].forEach((bar, index) => {
    const height = 4 + currentState.data[index] * 45;
    bar.setAttribute('height', height.toFixed(1));
    bar.setAttribute('y', (165 - height).toFixed(1));
    bar.setAttribute('opacity', String(.15 + currentState.analysis * .85));
  });
  $('fallback-caption').textContent = `2D模式図 · ${currentState.modeTitle} / ITERATION ${String(iteration + 1).padStart(2, '0')} / ${currentState.loopClosed ? '完全自律の構想' : '人間レビュー併用'}`;
  for (const group of fallbackDiagram.querySelectorAll('[data-fallback-mode]')) group.classList.toggle('is-active', group.dataset.fallbackMode === mode);
}

function updateStats(stats) {
  if (!stats) return;
  $('stat-parts').textContent = String(stats.meaningfulParts);
  $('stat-instanced').textContent = String(stats.instancedDetail);
  $('stat-particles').textContent = String(stats.liquidParticles);
  $('stat-pbr').textContent = String(stats.pbrMaterials);
  $('model-stats-note').textContent = `Instanced ${stats.instancedDetail}件 / Shader粒子 ${stats.liquidParticles} / LOD ${stats.lodObjects}`;
}

function updateReadout() {
  $('phase-label').textContent = `${currentState.modeTitle} · ${Math.round(currentState.phase * 100)}%`;
  const iterationText = `ITERATION ${String(iteration + 1).padStart(2, '0')}`;
  $('iteration-label').textContent = iterationText;
  $('progress-iteration-label').textContent = iterationText;
  $('progress-value').textContent = `${Math.round(currentState.phase * 100)}%`;
  $('progress-bar').style.width = `${currentState.phase * 100}%`;
  $('mode-guidance').textContent = getModeGuidance(currentState);
  $('fallback-progress-label').textContent = `${currentState.modeTitle} ${Math.round(currentState.phase * 100)}%`;
  updateFallback();
}

function refreshState() {
  currentState = calculateLabState(mode, phase, { autonomy, iteration });
  renderMode();
  renderAutonomy();
  updateReadout();
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? '自律ラボの模式アニメーションを再生します。' : '自律ラボの模式アニメーションを一時停止します。';
}

function setRate(next) {
  const value = Number(next);
  if (!PLAYBACK_RATES.includes(value)) return;
  rate = value;
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function setMode(next, announce = true) {
  if (!MODE_IDS.includes(next)) return;
  mode = next;
  phase = 0;
  selectedHotspot = null;
  viewer?.setSelectedHotspot(null);
  refreshState();
  renderSelection(true);
  if (announce) $('announce').textContent = `${getMode(mode).title}モード。${getMode(mode).status}です。`;
}

function setAutonomy(value) {
  autonomy = normalizeAutonomy(Number(value));
  refreshState();
  $('announce').textContent = `自律度${autonomy}パーセント。${currentState.automationLabel}。${currentState.evidenceLabel}。`;
}

function selectHotspot(id) {
  const hotspot = getHotspot(id);
  if (!hotspot) return;
  if (selectedHotspot === id) {
    selectedHotspot = null;
    viewer?.resetView();
    $('announce').textContent = 'ホットスポットの選択を解除しました。';
  } else {
    selectedHotspot = id;
    viewer?.focusHotspot(id);
    if (mobile.matches) setPanelOpen(true);
    $('announce').textContent = `${hotspot.title}を選択しました。報告・研究・構想の区別を右の解説で確認できます。`;
  }
  renderSelection(true);
}

function resetViewOnly() {
  selectedHotspot = null;
  viewer?.resetView();
  renderSelection(true);
  $('announce').textContent = '視点と選択を初期位置に戻しました。';
}

function resetExhibit() {
  mode = 'hypothesis';
  phase = 0;
  autonomy = DEFAULT_AUTONOMY;
  iteration = 0;
  selectedHotspot = null;
  viewer?.resetView();
  setPlaying(false);
  refreshState();
  renderSelection(true);
  $('announce').textContent = '仮説モード、自律度45パーセント、反復1、先頭からにリセットしました。';
}

function setPanelOpen(open) {
  exhibit.dataset.panel = open ? 'open' : 'closed';
  $('info-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle-label').textContent = open ? '解説を閉じる' : '解説を開く';
}

function set3DAvailable(available) {
  for (const button of [$('zoom-out'), $('zoom-in'), $('reset-view')]) button.disabled = !available;
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
  stageHost.classList.add('is-fallback');
  $('render-quality').textContent = '2D模式図';
  $('announce').textContent = message;
  updateFallback();
}

async function initViewer() {
  try {
    loadStatus.textContent = '3Dラボを準備中…';
    const { createAutonomousLabViewer } = await import('./viewer.mjs');
    viewer = createAutonomousLabViewer(stageHost, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onStats: updateStats,
      onContextLost: fallback,
    });
    if (selectedHotspot) viewer.focusHotspot(selectedHotspot);
    fallbackDiagram.hidden = true;
    loadStatus.hidden = true;
    stageHost.classList.remove('is-fallback');
    set3DAvailable(true);
    setPlaying(!reduced.matches);
  } catch (error) {
    console.warn('FRONTIER ATLAS autonomous lab: 3D unavailable', error);
    fallback('3D・CDNを利用できません。2D模式図と解説は引き続き操作できます。');
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
    const advanced = phase + elapsed * rate / CYCLE_SECONDS;
    if (advanced >= 1) iteration++;
    phase = advancePhase(phase, elapsed * rate / CYCLE_SECONDS);
  }
  currentState = calculateLabState(mode, phase, { autonomy, iteration });
  viewer?.render(currentState, { now, playing, rate });
  if (now - lastUIUpdate > 80) {
    updateReadout();
    lastUIUpdate = now;
  }
}

function visibilityChanged() {
  previousFrame = undefined;
  viewer?.resetFrameTime();
  if (document.hidden) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else if (!animationFrame) animationFrame = requestAnimationFrame(frame);
}

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, summary, [contenteditable="true"]'));
}

function keyboardShortcut(event) {
  if (event.repeat || helpDialog.open || isInteractiveTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying(!playing, true);
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetExhibit();
  } else if (event.key === '?') {
    event.preventDefault();
    openHelp();
  } else if (/^[1-5]$/.test(event.key)) {
    event.preventDefault();
    setMode(MODE_IDS[Number(event.key) - 1]);
  }
}

function openHelp() {
  resumeAfterHelp = playing;
  setPlaying(false);
  helpDialog.showModal();
}

function closeHelp() {
  helpDialog.close();
}

playButton.addEventListener('click', () => setPlaying(!playing, true));
for (const button of speedButtons) button.addEventListener('click', () => setRate(button.dataset.rate));
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of hotspotButtons) button.addEventListener('click', () => selectHotspot(button.dataset.hotspot));
$('autonomy').addEventListener('input', event => setAutonomy(event.target.value));
$('autonomy').addEventListener('change', () => {
  $('announce').textContent = `自律度${autonomy}パーセント。${currentState.automationLabel}。教育用の表示用パラメータです。`;
});
$('reset-sim').addEventListener('click', resetExhibit);
$('reset-view').addEventListener('click', resetViewOnly);
$('zoom-in').addEventListener('click', () => viewer?.zoomIn());
$('zoom-out').addEventListener('click', () => viewer?.zoomOut());
$('info-toggle').addEventListener('click', () => setPanelOpen(exhibit.dataset.panel !== 'open'));
$('help-open').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) closeHelp();
});
helpDialog.addEventListener('close', () => {
  if (resumeAfterHelp) setPlaying(true);
  resumeAfterHelp = false;
});
document.addEventListener('visibilitychange', visibilityChanged);
document.addEventListener('keydown', keyboardShortcut);
reduced.addEventListener('change', event => { if (event.matches) setPlaying(false); });
mobile.addEventListener('change', event => setPanelOpen(!event.matches));

renderStaticContent();
setRate(1);
setMode('hypothesis', false);
setAutonomy(DEFAULT_AUTONOMY);
setPlaying(playing);
setPanelOpen(!mobile.matches);
updateReadout();
animationFrame = requestAnimationFrame(frame);
initViewer();
