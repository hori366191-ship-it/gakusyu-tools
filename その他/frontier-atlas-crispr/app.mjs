import { ATLAS, CHALLENGES, CUT_SEQUENCE, EDITED_SEQUENCE, EVIDENCE, MECHANISM_IDS, MODE_IDS, OPERATING_GUIDE, ORIGINAL_SEQUENCE, RESEARCH_STAGE, SOURCES, SPECS, TARGET_INDEX, getHotspot, getMechanism, getMode } from './content.mjs';
import { advancePhase, calculateCrisprState, formatTime, modePreviewPhase, normalizeMechanism, normalizeSpeed } from './state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const stageHost = $('space-stage');
const fallback = $('fallback-diagram');
const loadStatus = $('load-status');
const playButton = $('play-toggle');
const helpDialog = $('help-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const modeButtons = [...document.querySelectorAll('.mode-button[data-mode]')];
const mechanismButtons = [...document.querySelectorAll('.mechanism-button[data-mechanism]')];
const hotspotButtons = [...document.querySelectorAll('.hotspot[data-node]')];
const moleculeButtons = [...document.querySelectorAll('.molecule-button[data-node]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];
const timeline = $('phase-timeline');

let viewer;
let phase = 0;
let rate = 1;
let mechanism = 'base';
let playing = !reduced.matches;
let selectedNode = null;
let currentState = calculateCrisprState(phase, mechanism);
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedMode = '';
let renderedMechanism = '';
let renderedSelection;
let resumeAfterHelp = false;

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function definitionItem(term, value) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = term;
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function markedSequence(sequence, index, changed) {
  const wrapper = document.createElement('span');
  wrapper.className = 'sequence-bases';
  [...sequence].forEach((base, position) => {
    const token = document.createElement('span');
    token.textContent = base;
    if (position === index) {
      token.className = changed ? 'is-edited' : 'is-target';
      token.title = `${position + 1}番目の塩基`;
    }
    wrapper.append(token);
  });
  return wrapper;
}

function renderStaticContent() {
  const evidenceMap = { implementation: 'implementation-list', research: 'research-list', concept: 'concept-list' };
  for (const group of EVIDENCE) $(evidenceMap[group.kind]).replaceChildren(...group.items.map(listItem));
  $('spec-list').replaceChildren(...SPECS.map(([term, value]) => definitionItem(term, value)));
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  $('research-status').textContent = RESEARCH_STAGE.status;
  $('research-detail').textContent = RESEARCH_STAGE.detail;
  $('challenge-list').replaceChildren(...CHALLENGES.map(challenge => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = challenge.title;
    small.textContent = challenge.english;
    item.append(strong, small, document.createTextNode(challenge.text));
    return item;
  }));
  $('source-list').replaceChildren(...SOURCES.map(source => {
    const wrapper = document.createElement('div');
    const link = document.createElement('a');
    link.href = source.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${source.organization} (${source.year}) — ${source.title} ↗`;
    const note = document.createElement('p');
    note.textContent = source.note;
    wrapper.append(link, note);
    return wrapper;
  }));
}

function renderMechanism(force = false) {
  if (!force && renderedMechanism === mechanism) return;
  renderedMechanism = mechanism;
  const entry = getMechanism(mechanism);
  exhibit.dataset.mechanism = mechanism;
  fallback.dataset.mechanism = mechanism;
  for (const button of mechanismButtons) button.setAttribute('aria-pressed', String(button.dataset.mechanism === mechanism));
  $('mechanism-badge').textContent = entry.badge;
  $('mechanism-name').textContent = entry.title;
  $('mechanism-description').textContent = entry.description;
  $('mechanism-change').textContent = entry.change;
  $('sequence-edited').replaceChildren(markedSequence(entry.id === 'cut' ? CUT_SEQUENCE : EDITED_SEQUENCE, TARGET_INDEX, true));
  $('sequence-note').textContent = entry.id === 'cut'
    ? '9番目を強調：Cas9切断後の1塩基欠失の例です。NHEJの必然的な結果ではなく、任意の教学配列です。'
    : '9番目を強調：A·T → G·C。ベース編集は二本鎖切断を起こしません。任意の教学配列です。';
}

function renderMode(force = false) {
  if (!force && renderedMode === currentState.mode) return;
  renderedMode = currentState.mode;
  const mode = getMode(currentState.mode);
  exhibit.dataset.mode = mode.id;
  fallback.dataset.mode = mode.id;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode.id));
  $('panel-kicker').textContent = `MODE ${mode.number}`;
  $('panel-english').textContent = mode.english;
  $('panel-title').textContent = mode.title;
  $('panel-summary').textContent = mode.summary;
  $('panel-structure-note').textContent = getMechanism(mechanism).description;
  $('panel-detail').textContent = mode.detail;
  $('panel-boundary').textContent = `${mode.boundary} ${ATLAS.modelNotice}`;
  $('panel-study').textContent = mode.study;
  $('structure-label').textContent = currentState.structureLabel;
  $('flow-list').replaceChildren(...mode.flow.map(([step, title, detail]) => {
    const item = document.createElement('li');
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    small.textContent = step;
    strong.textContent = title;
    item.append(small, strong, document.createTextNode(detail));
    return item;
  }));
  renderSelection(true);
}

function renderSelection(force = false) {
  const key = selectedNode || '';
  if (!force && renderedSelection === key) return;
  renderedSelection = key;
  const node = getHotspot(selectedNode);
  $('selected-node-card').hidden = !node;
  if (node) {
    $('node-english').textContent = `${node.number} / ${node.english}`;
    $('node-title').textContent = node.title;
    $('node-role').textContent = node.role;
    $('node-description').textContent = node.description;
    $('node-specs').replaceChildren(...node.specs.map(([term, value]) => definitionItem(term, value)));
  }
  for (const button of [...hotspotButtons, ...moleculeButtons]) button.setAttribute('aria-pressed', String(button.dataset.node === selectedNode));
  $('panel-handle-title').textContent = node ? `${node.title}を選択中` : currentState.modeTitle;
}

function updateFallback() {
  const cut = fallback.querySelector('#fallback-cut');
  const repair = fallback.querySelector('#fallback-repair');
  cut.style.opacity = mechanism === 'cut' && currentState.cutAmount > .02 ? String(currentState.cutAmount) : '0';
  repair.style.opacity = String(currentState.repairAmount);
  [...repair.children].forEach((circle, index) => {
    const angle = index / 4 * Math.PI * 2 + currentState.phase * Math.PI * 5;
    circle.setAttribute('cx', (340 + Math.cos(angle) * (70 - currentState.repairAmount * 25)).toFixed(2));
    circle.setAttribute('cy', (274 + Math.sin(angle) * (70 - currentState.repairAmount * 25)).toFixed(2));
  });
  const upper = fallback.querySelectorAll('.c-helix > path');
  upper[0]?.setAttribute('transform', `translate(0 ${(-currentState.strandSeparation * 45).toFixed(2)})`);
  upper[1]?.setAttribute('transform', `translate(0 ${(currentState.strandSeparation * 45).toFixed(2)})`);
  $('fallback-stage-caption').textContent = `2D模式図 · ${currentState.modeTitle} / ${getMechanism(mechanism).label}`;
  for (const element of fallback.querySelectorAll('[data-fallback-node]')) element.classList.toggle('is-selected', element.dataset.fallbackNode === selectedNode);
}

function updateUI() {
  currentState = calculateCrisprState(phase, mechanism);
  renderMechanism();
  renderMode();
  renderSelection();
  $('structure-label').textContent = currentState.structureLabel;
  $('panel-structure-note').textContent = getMechanism(mechanism).description;
  const mode = getMode(currentState.mode);
  $('phase-readout').textContent = `${mode.number} / 04 · ${mode.title}`;
  $('phase-label').textContent = `${mode.title} · ${getMechanism(mechanism).label}`;
  $('time-label').textContent = `${formatTime(phase)} · 教育用ループ`;
  const percentage = Math.round(phase * 100);
  if (document.activeElement !== timeline) timeline.value = String(Math.round(phase * 1000));
  timeline.style.setProperty('--value', `${percentage}%`);
  timeline.setAttribute('aria-valuetext', `${percentage}パーセント、${mode.title}、${getMechanism(mechanism).label}`);
  $('timeline-value').textContent = `${percentage}%`;
  updateFallback();
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? 'CRISPRのアニメーションを再生します。' : 'アニメーションを一時停止します。';
}

function setRate(next) {
  rate = normalizeSpeed(Number(next));
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function setMechanism(id, announce = true) {
  if (!MECHANISM_IDS.includes(id)) return;
  mechanism = normalizeMechanism(id);
  renderMechanism(true);
  updateUI();
  if (announce) $('announce').textContent = `${getMechanism(mechanism).label}を選択しました。${getMechanism(mechanism).doubleStrandBreak ? '二本鎖切断を作り、細胞修復を利用します。' : '二本鎖切断を作らず、一塩基を化学変換します。'}`;
}

function setMode(id, announce = true) {
  if (!MODE_IDS.includes(id)) return;
  phase = modePreviewPhase(id);
  setPlaying(false);
  updateUI();
  if (announce) $('announce').textContent = `${getMode(id).title}モードを表示し、一時停止しました。`;
}

function selectNode(id) {
  const node = getHotspot(id);
  if (!node) return;
  if (selectedNode === id) {
    selectedNode = null;
    viewer?.resetView();
    $('announce').textContent = '構成要素の選択と視点を解除しました。';
  } else {
    selectedNode = id;
    viewer?.focusNode(id);
    $('announce').textContent = `${node.title}を選択しました。右の解説に役割と基本仕様を表示します。`;
  }
  renderSelection(true);
  updateFallback();
}

function resetViewOnly() {
  selectedNode = null;
  viewer?.resetView();
  renderSelection(true);
  $('announce').textContent = 'カメラの視点と構成要素の選択を初期状態に戻しました。再生位置と編集経路は変わりません。';
}

function resetAll() {
  phase = 0;
  rate = 1;
  mechanism = 'base';
  selectedNode = null;
  setRate(1);
  setMechanism('base', false);
  setPlaying(false);
  viewer?.resetView();
  viewer?.resetAnimation();
  renderSelection(true);
  updateUI();
  $('announce').textContent = '再生位置、速度、編集経路、選択、視点を初期状態に戻しました。';
}

function setPanelOpen(open) {
  exhibit.dataset.panel = open ? 'open' : 'closed';
  $('info-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle-label').textContent = open ? '解説を閉じる' : '解説を開く';
  $('info-content').inert = mobile.matches && !open;
}

function set3DAvailable(available) {
  for (const button of [$('zoom-out'), $('zoom-in'), $('reset-view')]) button.disabled = !available;
  for (const button of hotspotButtons) button.hidden = !available;
}

function showFallback(message = '3Dを開始できませんでした。2D模式図と解説を表示しています。') {
  const failed = viewer;
  viewer = undefined;
  failed?.dispose();
  stageHost.querySelector('canvas')?.remove();
  set3DAvailable(false);
  fallback.hidden = false;
  loadStatus.hidden = false;
  loadStatus.textContent = message;
  stageHost.classList.add('is-fallback');
  $('render-quality').textContent = '2D SVGフォールバック';
  $('announce').textContent = message;
}

async function initViewer() {
  try {
    const { createCrisprViewer } = await import('./viewer.mjs');
    viewer = createCrisprViewer(stageHost, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onContextLost: showFallback,
    });
    if (selectedNode) viewer.focusNode(selectedNode);
    fallback.hidden = true;
    loadStatus.hidden = true;
    stageHost.classList.remove('is-fallback');
    set3DAvailable(true);
  } catch (error) {
    console.warn('FRONTIER ATLAS CRISPR: 3D unavailable', error);
    showFallback();
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
  if (playing) phase = advancePhase(phase, elapsed * rate / currentState.cycleSeconds);
  currentState = calculateCrisprState(phase, mechanism);
  viewer?.render(currentState, { delta: elapsed, now, playing, rate });
  if (now - lastUIUpdate > 70) {
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

function interactiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, summary, [contenteditable="true"]'));
}

function keyboardShortcut(event) {
  if (event.repeat || helpDialog.open || interactiveTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying(!playing, true);
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

playButton.addEventListener('click', () => setPlaying(!playing, true));
for (const button of speedButtons) button.addEventListener('click', () => setRate(button.dataset.rate));
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of mechanismButtons) button.addEventListener('click', () => setMechanism(button.dataset.mechanism));
for (const button of [...hotspotButtons, ...moleculeButtons]) button.addEventListener('click', () => selectNode(button.dataset.node));
for (const element of fallback.querySelectorAll('[data-fallback-node]')) element.addEventListener('click', () => selectNode(element.dataset.fallbackNode));
timeline.addEventListener('input', () => {
  phase = Number(timeline.value) / 1000;
  setPlaying(false);
  updateUI();
});
$('zoom-in').addEventListener('click', () => viewer?.zoomIn());
$('zoom-out').addEventListener('click', () => viewer?.zoomOut());
$('reset-view').addEventListener('click', resetViewOnly);
$('reset-all').addEventListener('click', resetAll);
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
mobile.addEventListener('change', () => setPanelOpen(!mobile.matches));
window.addEventListener('pagehide', event => { if (!event.persisted) viewer?.dispose(); }, { once: true });

renderStaticContent();
$('sequence-original').replaceChildren(markedSequence(ORIGINAL_SEQUENCE, TARGET_INDEX, false));
renderMechanism();
setRate(1);
setPlaying(playing);
setPanelOpen(!mobile.matches);
updateUI();
animationFrame = requestAnimationFrame(frame);
initViewer();
