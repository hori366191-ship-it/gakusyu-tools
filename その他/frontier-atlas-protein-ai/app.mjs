import {
  COMPARISON,
  EVIDENCE_LEGEND,
  MODE_IDS,
  OPERATING_GUIDE,
  SOURCES,
  getHotspot,
  getMode,
  getRepresentation,
  getSpecimen,
} from './content.mjs';
import {
  CYCLE_SECONDS,
  PLAYBACK_RATES,
  advancePhase,
  calculateProteinState,
  getModeGuidance,
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
const specimenButtons = [...document.querySelectorAll('[data-specimen]')];
const representationButtons = [...document.querySelectorAll('[data-representation]')];

let viewer;
let structures = [];
let mode = 'sequence';
let phase = 0;
let rate = 1;
let playing = !reduced.matches;
let specimen = '1crn';
let representation = 'experimental';
let confidence = true;
let selectedHotspot = null;
let currentState = calculateProteinState(mode, phase, { specimen, representation, confidence });
let previousFrame;
let animationFrame = 0;
let lastUIUpdate = -Infinity;
let renderedMode = '';
let renderedSelection;
let renderedSpecimen = '';
let renderedRepresentation = '';
let renderedConfidence;
let resumeAfterHelp = false;

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderStaticContent() {
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  $('challenge-list').replaceChildren(...getMode(mode).challenges.map(listItem));
  $('legend-list').replaceChildren(...EVIDENCE_LEGEND.map(entry => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = entry.label;
    item.append(label, document.createTextNode(` — ${entry.text}`));
    return item;
  }));
  $('comparison-body').replaceChildren(...COMPARISON.map(row => {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.append(td);
    }
    return tr;
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

function renderSpecimen(force = false) {
  if (!force && renderedSpecimen === specimen) return;
  renderedSpecimen = specimen;
  const entry = getSpecimen(specimen);
  for (const button of specimenButtons) button.setAttribute('aria-pressed', String(button.dataset.specimen === specimen));
  $('specimen-name').textContent = `${entry.pdb} · ${entry.name}`;
  $('specimen-meta').textContent = `${entry.residues}残基 / ${entry.resolution} / ${entry.year} / ${entry.organism}`;
  buildFallbackResidues(entry.residues);
}

function renderRepresentation(force = false) {
  const key = `${representation}:${confidence}`;
  if (!force && renderedRepresentation === key) return;
  renderedRepresentation = key;
  for (const button of representationButtons) button.setAttribute('aria-pressed', String(button.dataset.representation === representation));
  $('representation-note').textContent = getRepresentation(representation).note;
  $('confidence-toggle').checked = confidence;
  $('confidence-toggle').disabled = false;
  exhibit.dataset.representation = representation;
  fallbackDiagram.dataset.representation = representation;
}

function buildFallbackResidues(count) {
  const group = $('fallback-residues');
  const line = $('fallback-chain-line');
  group.replaceChildren();
  for (let index = 0; index < count; index++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', index % 5 === 0 ? '5.2' : '4.2');
    circle.setAttribute('class', index % 5 === 0 ? 'f-residue is-major' : 'f-residue');
    circle.dataset.index = String(index);
    group.append(circle);
  }
  line.dataset.count = String(count);
}

function updateFallback() {
  const count = getSpecimen(specimen).residues;
  const circles = [...$('fallback-residues').children];
  const points = [];
  for (let index = 0; index < count; index++) {
    const t = index / Math.max(1, count - 1);
    const angle = t * Math.PI * 3.4 + .5;
    const radius = 68 + 26 * Math.sin(t * Math.PI);
    const foldedX = 240 + Math.cos(angle) * radius;
    const foldedY = 238 + Math.sin(angle) * radius * .8;
    const extendedX = 66 + t * 348;
    const extendedY = 238 + Math.sin(index * .57) * 17;
    const noise = currentState.noise * Math.sin(index * 12.3 + currentState.phase * 9) * 18;
    const x = extendedX + (foldedX - extendedX) * currentState.fold + noise;
    const y = extendedY + (foldedY - extendedY) * currentState.fold + Math.cos(index * 4.7) * currentState.noise * 13;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    circles[index]?.setAttribute('cx', x.toFixed(1));
    circles[index]?.setAttribute('cy', y.toFixed(1));
  }
  $('fallback-chain-line').setAttribute('points', points.join(' '));
  const circumference = 2 * Math.PI * 49;
  $('fallback-progress').style.strokeDashoffset = String(circumference * (1 - currentState.phase));
  $('fallback-caption').textContent = `2D模式図 · ${currentState.specimenLabel} / ${currentState.modeTitle} / ${currentState.representationLabel} / ${Math.round(currentState.phase * 100)}%`;
  for (const group of fallbackDiagram.querySelectorAll('[data-fallback-mode]')) {
    group.classList.toggle('is-active', group.dataset.fallbackMode === mode);
  }
}

function updateStats(stats) {
  if (!stats) return;
  $('stat-residues').textContent = String(stats.residues);
  $('stat-atoms').textContent = String(stats.heavyAtoms);
  $('stat-instanced').textContent = String(stats.instancedDetail);
  $('stat-lod').textContent = String(stats.lodObjects);
  $('model-stats-note').textContent = `Instanced ${stats.instancedDetail}件 / PBR ${stats.pbrMaterials}種 / Shader粒子 ${stats.shaderParticles}`;
}

function updateReadout() {
  $('phase-label').textContent = `${currentState.modeTitle} · ${Math.round(currentState.phase * 100)}%`;
  $('progress-value').textContent = `${Math.round(currentState.phase * 100)}%`;
  $('progress-bar').style.width = `${currentState.phase * 100}%`;
  $('confidence-value').textContent = currentState.confidence ? `${currentState.meanConfidence.toFixed(1)} / 100（疑似）` : 'CPK元素色';
  $('confidence-note').textContent = currentState.confidenceNotice;
  $('mode-guidance').textContent = getModeGuidance(currentState);
  $('fallback-progress-label').textContent = `${currentState.modeTitle} ${Math.round(currentState.phase * 100)}%`;
  updateFallback();
}

function refreshState() {
  currentState = calculateProteinState(mode, phase, { specimen, representation, confidence });
  renderMode();
  renderSpecimen();
  renderRepresentation();
  updateReadout();
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? '構造アニメーションを再生します。' : '構造アニメーションを一時停止します。';
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

function setSpecimen(next) {
  if (!getSpecimen(next) || !['1crn', '1ubq'].includes(next)) return;
  specimen = next;
  phase = 0;
  refreshState();
  $('announce').textContent = `${getSpecimen(next).pdb}の実測構造を選択しました。`;
}

function setRepresentation(next) {
  if (!getRepresentation(next) || !['experimental', 'proxy', 'compare'].includes(next)) return;
  representation = next;
  refreshState();
  $('announce').textContent = `${getRepresentation(next).label}。${getRepresentation(next).note}。`;
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
    $('announce').textContent = `${hotspot.title}を選択しました。根拠と教育用近似を右の解説で確認できます。`;
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
  mode = 'sequence';
  phase = 0;
  specimen = '1crn';
  representation = 'experimental';
  confidence = true;
  selectedHotspot = null;
  viewer?.resetView();
  setPlaying(false);
  refreshState();
  renderSelection(true);
  $('announce').textContent = '配列モード、1CRN、実験構造、先頭からにリセットしました。';
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

async function loadStructureText(id) {
  const response = await fetch(`./data/${id}.pdb`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes('ATOM')) throw new Error(`${id}: invalid PDB`);
  return text;
}

async function initViewer() {
  try {
    loadStatus.textContent = '公開PDB座標を読み込み中…';
    const texts = await Promise.all([loadStructureText('1crn'), loadStructureText('1ubq')]);
    const { parsePdb } = await import('./model.mjs');
    structures = texts.map(parsePdb);
    loadStatus.textContent = '3Dを準備中…';
    const { createProteinViewer } = await import('./viewer.mjs');
    viewer = createProteinViewer(stageHost, {
      structures,
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
    console.warn('FRONTIER ATLAS protein AI: 3D unavailable', error);
    fallback('3D・CDN・PDB読み込みのいずれかを利用できません。2D模式図と解説は利用できます。');
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
  if (playing) phase = advancePhase(phase, elapsed * rate / CYCLE_SECONDS);
  currentState = calculateProteinState(mode, phase, { specimen, representation, confidence });
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
for (const button of specimenButtons) button.addEventListener('click', () => setSpecimen(button.dataset.specimen));
for (const button of representationButtons) button.addEventListener('click', () => setRepresentation(button.dataset.representation));
$('confidence-toggle').addEventListener('change', event => {
  confidence = event.target.checked;
  refreshState();
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
renderSpecimen(true);
renderRepresentation(true);
setRate(1);
setMode('sequence', false);
setPlaying(playing);
setPanelOpen(!mobile.matches);
updateReadout();
animationFrame = requestAnimationFrame(frame);
initViewer();
