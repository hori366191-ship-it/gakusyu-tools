import {
  CHALLENGES, COMPONENTS, EVIDENCE_LEVELS, EXHIBIT, MODES, MODE_IDS,
  OPERATING_GUIDE, SOURCES, SPECS, getComponent, getMode,
} from './content.mjs';
import {
  CONTROL_DEFAULTS, CONTROL_LABELS, advancePhase, calculateFusionState,
  getFusionGuidance, normalizeControls,
} from './state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const host = $('space-stage');
const fallback = $('fallback-diagram');
const playButton = $('play-toggle');
const helpDialog = $('help-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const modeButtons = [...document.querySelectorAll('.mode-button[data-mode]')];
const componentButtons = [...document.querySelectorAll('.component-button[data-component]')];
const hotspots = [...document.querySelectorAll('.hotspot[data-component]')];
const speedButtons = [...document.querySelectorAll('.speed-control [data-rate]')];
const sliders = Object.fromEntries(Object.keys(CONTROL_DEFAULTS).map(name => [name, $(name)]));
let controls = { ...CONTROL_DEFAULTS };
let mode = MODE_IDS[0];
let selected = null;
let phase = 0;
let rate = 1;
let playing = !reduced.matches;
let viewer;
let state = calculateFusionState(mode, controls, phase);
let previousFrame;
let animationFrame = 0;
let lastUI = -Infinity;
let renderedMode = '';
let renderedSelection;
let renderedMetricKey = '';
let resumeAfterHelp = false;

const modeComponent = { heating: 'vessel', confinement: 'coils', reaction: 'plasma', blanket: 'blanket', power: 'blanket' };

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function sourceAnchor(source) {
  const anchor = document.createElement('a');
  anchor.href = source.href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.append(document.createTextNode(`${source.organization} — ${source.title} ↗`));
  const kind = document.createElement('small');
  kind.textContent = `${source.kind} / ${source.citation}`;
  anchor.append(kind);
  return anchor;
}

function renderStaticContent() {
  $('distinction-copy').textContent = EXHIBIT.distinction;
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(listItem));
  $('challenge-list').replaceChildren(...CHALLENGES.map(challenge => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = challenge.title;
    small.textContent = challenge.english;
    item.append(strong, small, document.createTextNode(challenge.text));
    return item;
  }));
  $('spec-list').replaceChildren(...SPECS.map(spec => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = spec.label;
    description.append(document.createTextNode(spec.value));
    const note = document.createElement('small');
    note.textContent = spec.note;
    description.append(note);
    row.append(term, description);
    return row;
  }));
  $('evidence-list').replaceChildren(...EVIDENCE_LEVELS.map(entry => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = entry.label;
    description.textContent = entry.text;
    row.append(term, description);
    return row;
  }));
  $('source-list').replaceChildren(...SOURCES.map(sourceAnchor));
  $('help-sources').replaceChildren(...SOURCES.map(sourceAnchor));
}

function renderMode(force = false) {
  if (!force && renderedMode === mode) return;
  renderedMode = mode;
  const entry = getMode(mode);
  exhibit.dataset.mode = mode;
  fallback.dataset.mode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('panel-kicker').textContent = `MODE ${entry.number} / ${entry.status}`;
  $('panel-english').textContent = entry.english;
  $('panel-title').textContent = entry.label;
  $('panel-handle-title').textContent = selected ? `${getComponent(selected).title}を選択中` : entry.label;
  $('panel-summary').textContent = entry.summary;
  $('panel-focus').textContent = entry.focus;
  $('panel-boundary').textContent = entry.boundary;
  $('structure-label').textContent = `ITER · ${entry.status.toUpperCase()} / ${mode === 'power' ? 'CONCEPT ONLY' : 'NOT A POWER PLANT'}`;
  $('transport-note').textContent = mode === 'power' ? '半透明の電化系はITERではなく将来構想です' : '粒子の動きは教育用の模式表現です';
  renderedMetricKey = '';
}

function renderSelection(force = false) {
  if (!force && renderedSelection === selected) return;
  renderedSelection = selected;
  const component = getComponent(selected);
  $('selected-component-card').hidden = !component;
  if (component) {
    $('component-english').textContent = `${component.number} / ${component.english}`;
    $('component-title').textContent = component.title;
    $('component-role').textContent = component.role;
    $('component-text').textContent = component.text;
  }
  for (const button of [...componentButtons, ...hotspots]) button.setAttribute('aria-pressed', String(button.dataset.component === selected));
  $('panel-handle-title').textContent = component ? `${component.title}を選択中` : getMode(mode).label;
  updateFallback();
}

function updateMetrics(force = false) {
  const key = `${state.mode}:${state.plasmaTemperature}:${state.illustrativeHeat}:${state.plasmaQ}:${state.tripleProduct}`;
  if (!force && key === renderedMetricKey) return;
  renderedMetricKey = key;
  $('temperature-value').textContent = `${state.plasmaTemperature}`;
  $('fusion-value').textContent = `${state.illustrativeHeat}`;
  $('q-value').textContent = `${state.plasmaQ.toFixed(2)}`;
  $('grid-value').textContent = `${state.gridPowerMW} MW`;
  $('metric-guidance').textContent = getFusionGuidance(state);
}

function updateFallback() {
  const active = selected || modeComponent[mode];
  for (const group of fallback.querySelectorAll('[data-fallback-component]')) group.classList.toggle('is-active', group.dataset.fallbackComponent === active);
  const angle = state.phase * Math.PI * 2;
  const radius = 105 + (state.mode === 'reaction' || state.mode === 'blanket' ? state.phase * 54 : 0);
  const particle = $('fallback-neutron');
  particle.setAttribute('cx', (280 + Math.cos(angle) * radius).toFixed(2));
  particle.setAttribute('cy', (225 + Math.sin(angle) * radius * .6).toFixed(2));
  particle.setAttribute('opacity', state.mode === 'reaction' || state.mode === 'blanket' ? '1' : '.2');
  $('fallback-stage-caption').textContent = `2D模式図 · ${getMode(mode).label} / ${selected ? getComponent(selected).title : '全体'}`;
}

function updateUI(force = false) {
  const entry = getMode(mode);
  const index = MODE_IDS.indexOf(mode);
  const next = MODE_IDS[(index + 1) % MODE_IDS.length];
  $('phase-readout').textContent = `PROCESS ${String(index + 1).padStart(2, '0')} / 05 · ${entry.label}`;
  $('phase-label').textContent = `${entry.label} → ${getMode(next).label}`;
  updateMetrics(force);
  updateFallback();
}

function updateSlider(name) {
  const value = normalizeControls({ [name]: Number(sliders[name].value) })[name];
  controls[name] = value;
  sliders[name].value = String(value);
  sliders[name].style.setProperty('--value', `${value}%`);
  sliders[name].setAttribute('aria-valuetext', `${value}パーセント。教育用の模式モデル`);
  $(`${name}-value`).textContent = `${value}%`;
  state = calculateFusionState(mode, controls, phase);
  updateUI(true);
}

function setPlaying(next, announce = false) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
  if (announce) $('announce').textContent = playing ? 'プロセスを再生します。' : 'プロセスを一時停止します。';
}

function setRate(next) {
  const numeric = Number(next);
  rate = [0.5, 1, 2].includes(numeric) ? numeric : 1;
  for (const button of speedButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
}

function setMode(next, announce = true) {
  if (!MODE_IDS.includes(next)) return;
  mode = next;
  phase = 0;
  state = calculateFusionState(mode, controls, phase);
  renderMode(true);
  renderSelection(true);
  updateUI(true);
  if (announce) $('announce').textContent = `${getMode(mode).label}モードです。${getMode(mode).status}。${getMode(mode).boundary}`;
}

function selectComponent(id) {
  const component = getComponent(id);
  if (!component) return;
  selected = selected === id ? null : id;
  if (selected) viewer?.focusComponent(id);
  else viewer?.resetView();
  renderSelection(true);
  if (selected && mobile.matches) setPanelOpen(true);
  $('announce').textContent = selected ? `${component.title}を選択しました。${component.text}` : '構成要素の選択を解除しました。';
}

function resetAll() {
  mode = MODE_IDS[0];
  phase = 0;
  rate = 1;
  controls = { ...CONTROL_DEFAULTS };
  selected = null;
  for (const name of Object.keys(sliders)) updateSlider(name);
  setRate(1);
  setMode(mode, false);
  setPlaying(!reduced.matches);
  viewer?.resetView();
  renderSelection(true);
  $('announce').textContent = 'モード・スライダー・再生速度・時刻・視点・選択を初期状態に戻しました。';
}

function setPanelOpen(open) {
  exhibit.dataset.panel = open ? 'open' : 'closed';
  $('info-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle-label').textContent = open ? '解説を閉じる' : '解説を開く';
}

function set3DAvailable(available) {
  for (const button of [$('zoom-out'), $('zoom-in'), $('reset-view')]) button.disabled = !available;
}

function fallbackTo2D(message = '3Dを開始できませんでした。2D模式図と解説を表示しています。') {
  const failed = viewer;
  viewer = undefined;
  failed?.dispose();
  host.querySelector('canvas')?.remove();
  set3DAvailable(false);
  fallback.hidden = false;
  $('load-status').hidden = false;
  $('load-status').textContent = message;
  $('render-quality').textContent = '2Dフォールバック';
  $('announce').textContent = `${message} モード・スライダー・2D粒子は引き続き操作できます。`;
}

async function initViewer() {
  try {
    const module = await import('./viewer.mjs');
    viewer = module.createFusionViewer(host, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: text => { $('render-quality').textContent = text; },
      onContextLost: fallbackTo2D,
    });
    if (selected) viewer.focusComponent(selected);
    fallback.hidden = true;
    $('load-status').hidden = true;
    set3DAvailable(true);
  } catch (error) {
    console.warn('FRONTIER ATLAS fusion: 3D unavailable', error);
    fallbackTo2D();
  }
}

function frame(now) {
  animationFrame = requestAnimationFrame(frame);
  if (document.hidden) {
    previousFrame = undefined;
    return;
  }
  const delta = previousFrame === undefined ? 0 : Math.min(.1, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  if (playing) phase = advancePhase(phase, delta * rate * state.animationSpeed * .09);
  state = calculateFusionState(mode, controls, phase);
  viewer?.render(state, { delta, now, playing, rate });
  if (now - lastUI > 90) {
    updateUI();
    lastUI = now;
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

function interactiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button,a,input,select,textarea,summary,[contenteditable="true"]'));
}

function keyboard(event) {
  if (event.repeat || helpDialog.open || interactiveTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying(!playing, true);
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetAll();
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

function closeHelp() { helpDialog.close(); }

playButton.addEventListener('click', () => setPlaying(!playing, true));
for (const button of speedButtons) button.addEventListener('click', () => setRate(button.dataset.rate));
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of [...componentButtons, ...hotspots]) button.addEventListener('click', () => selectComponent(button.dataset.component));
for (const [name, input] of Object.entries(sliders)) {
  input.addEventListener('input', () => updateSlider(name));
  input.addEventListener('change', () => { $('announce').textContent = `${CONTROL_LABELS[name]} ${controls[name]}パーセント。教育用の模式モデルです。`; });
}
$('reset-view').addEventListener('click', resetAll);
$('zoom-in').addEventListener('click', () => viewer?.zoomIn());
$('zoom-out').addEventListener('click', () => viewer?.zoomOut());
$('info-toggle').addEventListener('click', () => setPanelOpen(exhibit.dataset.panel !== 'open'));
$('help-open').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
});
helpDialog.addEventListener('close', () => {
  if (resumeAfterHelp) setPlaying(true);
  resumeAfterHelp = false;
});
document.addEventListener('visibilitychange', visibilityChanged);
document.addEventListener('keydown', keyboard);
reduced.addEventListener('change', event => { if (event.matches) setPlaying(false); });
mobile.addEventListener('change', event => setPanelOpen(!event.matches));

renderStaticContent();
for (const name of Object.keys(sliders)) updateSlider(name);
setRate(1);
setMode(mode, false);
setPlaying(playing);
setPanelOpen(!mobile.matches);
updateUI(true);
animationFrame = requestAnimationFrame(frame);
initViewer();
