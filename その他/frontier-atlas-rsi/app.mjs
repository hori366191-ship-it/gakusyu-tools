import {
  CHALLENGES,
  MODES,
  NODES,
  OPERATING_GUIDE,
  SAFEGUARDS,
  getMode,
  getNode,
} from './content.mjs';
import {
  CONTROL_DEFAULTS,
  advanceLoopPhase,
  calculateLoopState,
  getRiskGuidance,
  loopAngle,
} from './loop-state.mjs';

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
const loopButtons = [...document.querySelectorAll('.loop-button[data-node]')];
const hotspotButtons = [...document.querySelectorAll('.hotspot[data-node]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];
const sliders = Object.fromEntries(['automation', 'evaluation', 'oversight'].map(name => [name, $(name)]));
const controls = { ...CONTROL_DEFAULTS };

let viewer;
let mode = 'assisted';
let selectedNode = null;
let phase = 0;
let rate = 1;
let playing = !reduced.matches;
let currentState = calculateLoopState(mode, controls, phase);
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedMode = '';
let renderedSelection;
let renderedRisk = '';
let resumeAfterHelp = false;

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderStaticContent() {
  $('observed-list').replaceChildren(...getMode(mode).observed.map(listItem));
  $('unverified-list').replaceChildren(...getMode(mode).unverified.map(listItem));
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  $('safeguard-list').replaceChildren(...SAFEGUARDS.map(listItem));
  $('challenge-list').replaceChildren(...CHALLENGES.map(challenge => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const english = document.createElement('small');
    title.textContent = challenge.title;
    english.textContent = challenge.english;
    item.append(title, english, document.createTextNode(challenge.text));
    return item;
  }));
}

function renderMode(force = false) {
  if (!force && renderedMode === mode) return;
  renderedMode = mode;
  const entry = getMode(mode);
  exhibit.dataset.mode = mode;
  fallbackDiagram.dataset.mode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('panel-kicker').textContent = `MODE ${entry.number}`;
  $('panel-english').textContent = entry.english;
  $('panel-title').textContent = entry.shortTitle;
  $('panel-summary').textContent = entry.lead;
  $('panel-detail').textContent = entry.summary;
  $('panel-structure-note').textContent = entry.structureNote;
  $('structure-label').textContent = entry.structureLabel;
  $('panel-boundary').textContent = entry.boundary;
  $('observed-list').replaceChildren(...entry.observed.map(listItem));
  $('unverified-list').replaceChildren(...entry.unverified.map(listItem));
  renderSelection(true);
  updateRisk();
}

function renderSelection(force = false) {
  const key = selectedNode || '';
  if (!force && renderedSelection === key) return;
  renderedSelection = key;
  const node = getNode(selectedNode);
  $('selected-node-card').hidden = !node;
  if (node) {
    $('node-english').textContent = `${node.number} / ${node.english}`;
    $('node-title').textContent = node.title;
    $('node-role').textContent = node.role;
    $('node-current').textContent = node.current;
    $('node-hypothesis').textContent = node.hypothesis;
  }
  for (const button of [...loopButtons, ...hotspotButtons]) button.setAttribute('aria-pressed', String(button.dataset.node === selectedNode));
  $('panel-handle-title').textContent = node ? `${node.title}を選択中` : getMode(mode).shortTitle;
}

function updateRisk() {
  const key = `${currentState.mode}:${currentState.risk}:${currentState.gap}:${currentState.instability}`;
  if (key === renderedRisk) return;
  renderedRisk = key;
  const rounded = Math.round(currentState.risk);
  $('risk-value').textContent = `${rounded} / 100`;
  $('risk-bar').style.setProperty('--risk-width', `${currentState.risk}%`);
  $('risk-bar').firstElementChild.style.width = `${currentState.risk}%`;
  $('risk-bar').setAttribute('aria-label', `概念上のリスク ${rounded} / 100。教育用モデル`);
  $('risk-guidance').textContent = getRiskGuidance(currentState);
  $('risk-card').dataset.level = currentState.riskLevel;
  exhibit.dataset.risk = currentState.riskLevel;
  fallbackDiagram.dataset.risk = currentState.riskLevel;
}

function updateSlider(name) {
  const input = sliders[name];
  const value = Math.min(100, Math.max(0, Number(input.value)));
  controls[name] = value;
  input.value = String(value);
  input.style.setProperty('--value', `${value}%`);
  input.setAttribute('aria-valuetext', `${value} / 100。教育用の概念モデル`);
  $(`${name}-value`).textContent = `${value}%`;
  currentState = calculateLoopState(mode, controls, phase);
  updateRisk();
  updateReadout();
}

function updateReadout() {
  const node = NODES[currentState.nodeIndex];
  const stageCount = currentState.loopType === 'closed' ? NODES.length : 5;
  $('loop-readout').textContent = `LOOP ${String(currentState.stageIndex + 1).padStart(2, '0')} / ${String(stageCount).padStart(2, '0')} · ${currentState.stageTitle}`;
  $('phase-label').textContent = currentState.nextStageTitle
    ? `${currentState.stageTitle} → ${currentState.nextStageTitle}`
    : `${currentState.stageTitle}で停止 · 次の人間の指示`;
  $('fallback-stage-caption').textContent = `2D模式図 · ${getMode(mode).label} / ${currentState.stageTitle}`;
  for (const button of loopButtons) button.classList.toggle('is-flowing', button.dataset.node === currentState.nodeId);
  const fallbackNode = fallbackDiagram.querySelector(`[data-fallback-node="${currentState.nodeId}"]`);
  for (const element of fallbackDiagram.querySelectorAll('[data-fallback-node]')) element.classList.toggle('is-active', element === fallbackNode);
  fallbackDiagram.querySelector('[data-fallback-gate]')?.classList.toggle('is-active', currentState.stageId === 'review');
  const particle = $('fallback-particle');
  particle.setAttribute('cx', (240 + Math.cos(currentState.flow.angle) * 146).toFixed(2));
  particle.setAttribute('cy', (240 - Math.sin(currentState.flow.angle) * 146).toFixed(2));
  particle.setAttribute('opacity', currentState.flow.opacity.toFixed(3));
  const nodeAngle = loopAngle(currentState.nodeIndex / NODES.length);
  const travel = .5 - .5 * Math.cos(currentState.phase * Math.PI * 2);
  const placeRadial = (id, amount) => {
    const radius = 62 + amount * 84;
    $(id).setAttribute('cx', (240 + Math.cos(nodeAngle) * radius).toFixed(2));
    $(id).setAttribute('cy', (240 - Math.sin(nodeAngle) * radius).toFixed(2));
  };
  placeRadial('fallback-radial-out', travel);
  placeRadial('fallback-radial-in', 1 - travel);
}

function updateUI() {
  updateReadout();
  updateRisk();
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? '改善ループを再生します。' : '改善ループを一時停止します。';
}

function togglePlayback() {
  setPlaying(!playing, true);
}

function setRate(next) {
  rate = Number(next);
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function setMode(next, announce = true) {
  if (!MODES.some(entry => entry.id === next)) return;
  mode = next;
  currentState = calculateLoopState(mode, controls, phase);
  renderMode(true);
  updateUI();
  if (announce) {
    $('announce').textContent = mode === 'hypothesis'
      ? '完全自律RSIの仮説モードです。内側の再帰リングを持つ閉ループを表示します。自己目標設定や知能爆発は未実証です。'
      : '現在のAI支援モードです。人間承認ゲートを通る開ループを表示します。実装されている用途と未実証の仮説を分けます。';
  }
}

function selectNode(id) {
  const node = getNode(id);
  if (!node) return;
  if (selectedNode === id) {
    selectedNode = null;
    viewer?.resetView();
    $('announce').textContent = '構成要素の選択と視点を解除しました。';
  } else {
    selectedNode = id;
    viewer?.focusNode(id);
    $('announce').textContent = `${node.title}を選択しました。現在の実装と仮説を右の解説で比較できます。`;
  }
  renderSelection(true);
}

function resetViewOnly() {
  selectedNode = null;
  viewer?.resetView();
  renderSelection(true);
  $('announce').textContent = 'カメラの視点と構成要素の選択を初期状態に戻しました。スライダーと再生状態は変わりません。';
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
}

async function initViewer() {
  try {
    const { createRSIViewer } = await import('./rsi-viewer.mjs');
    viewer = createRSIViewer(stageHost, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onContextLost: fallback,
    });
    if (selectedNode) viewer.focusNode(selectedNode);
    fallbackDiagram.hidden = true;
    loadStatus.hidden = true;
    stageHost.classList.remove('is-fallback');
    set3DAvailable(true);
    if (!reduced.matches && playButton.getAttribute('aria-pressed') === 'true') setPlaying(true);
  } catch (error) {
    console.warn('FRONTIER ATLAS RSI: 3D unavailable', error);
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
    const speed = calculateLoopState(mode, controls, phase).loopSpeed;
    phase = advanceLoopPhase(phase, elapsed * rate * speed);
  }
  currentState = calculateLoopState(mode, controls, phase);
  viewer?.render(currentState, { delta: elapsed, now, playing, rate });
  if (now - lastUIUpdate > 80) {
    updateUI();
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
  if (event.repeat || helpDialog.open || isInteractiveTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    togglePlayback();
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetViewOnly();
  } else if (event.key === '?') {
    event.preventDefault();
    openHelp();
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

playButton.addEventListener('click', togglePlayback);
for (const button of speedButtons) button.addEventListener('click', () => setRate(button.dataset.rate));
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of [...loopButtons, ...hotspotButtons]) button.addEventListener('click', () => selectNode(button.dataset.node));
for (const [name, input] of Object.entries(sliders)) {
  input.addEventListener('input', () => updateSlider(name));
  input.addEventListener('change', () => {
    $('announce').textContent = `${input.labels[0].textContent} ${controls[name]}パーセント。概念上のリスクは${Math.round(currentState.risk)} / 100です。教育用モデルであり、実際の確率ではありません。`;
  });
}
$('reset-view').addEventListener('click', resetViewOnly);
$('zoom-in').addEventListener('click', () => viewer?.zoomIn());
$('zoom-out').addEventListener('click', () => viewer?.zoomOut());
$('info-toggle').addEventListener('click', () => setPanelOpen(exhibit.dataset.panel !== 'open'));
$('help-open').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
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
for (const name of Object.keys(sliders)) updateSlider(name);
setRate(1);
setMode('assisted', false);
setPlaying(playing);
setPanelOpen(!mobile.matches);
updateUI();
animationFrame = requestAnimationFrame(frame);
initViewer();
