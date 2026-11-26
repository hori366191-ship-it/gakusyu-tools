import { ATLAS, ENTRY, MODES, MODE_ORDER, HOTSPOTS, RESEARCH_STATUS, SPECIFICATIONS, CHALLENGES, BENEFITS, SOURCES, OPERATING_GUIDE } from './content.mjs';
import { MARS_DURATION, advanceMarsTime, formatMarsTime, normalizeMode, sampleMarsState } from './state.mjs';

const $ = id => document.getElementById(id);
const exhibit = $('exhibit');
const stage = $('space-stage');
const host = $('webgl-host');
const fallback = $('fallback-diagram');
const playButton = $('play-toggle');
const timeline = $('orbit-timeline');
const infoPanel = $('info-panel');
const infoContent = $('info-content');
const infoToggle = $('info-toggle');
const helpDialog = $('help-dialog');
const mobile = matchMedia('(max-width: 760px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let mode = MODE_ORDER[0];
let time = 0;
let rate = 1;
let playing = false;
let viewer = null;
let raf = 0;
let lastNow;
let panelOpen = false;
let resumeAfterHelp = false;
let fallbackReason = '';

$('catalog-count').textContent = `${String(ATLAS.entryNumber).padStart(2, '0')} / ${String(ATLAS.catalogCount).padStart(2, '0')}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fillDefinitionList(target, entries) {
  target.replaceChildren();
  for (const [term, value] of entries) {
    const row = element('div');
    row.append(element('dt', '', term), element('dd', '', value));
    target.append(row);
  }
}

function renderStaticContent() {
  $('guide-list').replaceChildren(...OPERATING_GUIDE.map(text => element('li', '', text)));
  $('challenge-list').replaceChildren(...CHALLENGES.map(text => element('li', '', text)));
  $('benefit-list').replaceChildren(...BENEFITS.map(text => element('li', '', text)));
  fillDefinitionList($('spec-list'), SPECIFICATIONS.map(([term, value, note]) => [term, `${value} — ${note}`]));
  for (const source of SOURCES) {
    const link = element('a', '', `${source.label} ↗`);
    link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    $('source-list').append(link);
  }
}

function renderModeContent() {
  const content = MODES.find(item => item.id === mode) || MODES[0];
  const index = MODE_ORDER.indexOf(mode);
  exhibit.dataset.mode = mode;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  $('panel-mode-english').textContent = content.english;
  $('panel-mode-title').textContent = content.title;
  $('mode-kicker').textContent = `${String(index + 1).padStart(2, '0')} / ${content.english}`;
  $('mode-title').textContent = content.title;
  $('mode-description').textContent = content.summary;
  $('mode-study').textContent = content.study;
  $('flow-caption').textContent = content.flow.map(([, title]) => title).join(' → ');
  $('flow-list').replaceChildren(...content.flow.map(([step, title, detail]) => {
    const item = element('li');
    const copy = element('p');
    copy.append(element('strong', '', title), element('small', '', detail));
    item.append(element('span', '', step), copy);
    return item;
  }));
  $('research-list').replaceChildren(...RESEARCH_STATUS.map(item => {
    const row = element('div', `research-row ${item.tone}`);
    row.append(element('span', 'research-state', item.status));
    const copy = element('div');
    copy.append(element('strong', '', item.title), element('p', '', item.detail));
    row.append(copy);
    return row;
  }));
  $('focus-title').textContent = '5つの部位にフォーカス';
  $('focus-description').textContent = 'ラベルを選ぶと、その部位へカメラが寄り、基本仕様を表示します。';
  $('focus-specs').hidden = true;
  $('fallback-stage-caption').textContent = `2D模式図 · ${content.label}`;
}

function setMode(next) {
  mode = normalizeMode(next);
  time = 0;
  setPlaying(false);
  viewer?.resetView();
  renderModeContent();
  renderCurrent();
  $('announce').textContent = `${MODES.find(item => item.id === mode).label}モードを表示しました。`;
}

function setPlaying(next) {
  playing = Boolean(next);
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
}

function setPanelOpen(next) {
  panelOpen = Boolean(next);
  exhibit.dataset.panel = panelOpen ? 'open' : 'closed';
  infoToggle.setAttribute('aria-expanded', String(panelOpen));
  $('panel-toggle-label').textContent = panelOpen ? '解説を閉じる' : '解説を開く';
  const collapsedOnMobile = mobile.matches && !panelOpen;
  infoContent.inert = collapsedOnMobile;
}

function showFocus(id) {
  const item = HOTSPOTS[id];
  if (!item) return;
  $('focus-kicker')?.remove();
  $('focus-title').textContent = item.title;
  $('focus-description').textContent = item.description;
  fillDefinitionList($('focus-specs'), item.specs);
  $('focus-specs').hidden = false;
  viewer?.focus(id);
  if (mobile.matches) setPanelOpen(true);
  $('announce').textContent = `${item.title}を選択しました。`;
}

function reset() {
  time = 0;
  rate = 1;
  setPlaying(false);
  document.querySelectorAll('[data-rate]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === 1)));
  viewer?.resetView();
  renderCurrent();
  $('announce').textContent = 'アニメーションと視点をリセットしました。';
}

function updateFallback(state) {
  const ship = $('fallback-ship');
  if (ship) {
    const x = 500 + state.shipPosition[0] * 33;
    const y = 500 - state.shipPosition[1] * 28;
    const rotation = state.mode === 'transit' ? Math.sin(state.progress * Math.PI) * -9 : 0;
    ship.setAttribute('transform', `translate(${x} ${y}) rotate(${rotation}) scale(.8)`);
  }
  const flame = $('fallback-flame');
  if (flame) flame.setAttribute('opacity', String(Math.max(state.engineThrust, state.plasma)));
  const earth = $('fallback-earth');
  if (earth) earth.setAttribute('opacity', String(state.mode === 'launch' || state.mode === 'transit' ? 1 : .16));
  const mars = $('fallback-mars');
  if (mars) mars.setAttribute('opacity', String(state.mode === 'launch' ? .18 : .95));
  const dust = $('fallback-dust');
  if (dust) dust.setAttribute('opacity', String(state.dust));
}

function renderCurrent(delta = 0) {
  const state = sampleMarsState(time, mode);
  timeline.value = String(time);
  timeline.setAttribute('aria-valuetext', `${formatMarsTime(time)} ${MODES.find(item => item.id === mode).label}`);
  $('orbit-time').textContent = formatMarsTime(time);
  updateFallback(state);
  viewer?.render(state, delta);
}

function tick(now) {
  raf = 0;
  if (document.hidden) { lastNow = undefined; return; }
  const delta = lastNow === undefined ? 0 : Math.min(.05, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  if (playing) time = advanceMarsTime(time, delta, rate);
  renderCurrent(delta);
  raf = requestAnimationFrame(tick);
}

function startLoop() {
  if (raf || document.hidden) return;
  lastNow = undefined;
  raf = requestAnimationFrame(tick);
}

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
  lastNow = undefined;
}

function useFallback(message) {
  try { viewer?.dispose(); } catch { /* keep the explanatory page available */ }
  viewer = null;
  host.replaceChildren();
  exhibit.classList.remove('is-3d');
  fallback.hidden = false;
  fallbackReason = message;
  $('load-status').textContent = message;
  $('render-quality').textContent = '2Dフォールバック';
  document.querySelectorAll('.hotspot').forEach(button => { button.hidden = true; });
}

async function boot3D() {
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('WebGL未対応のため2D模式図を表示しています。');
    const { createMarsViewer } = await import('./viewer.mjs');
    if (fallbackReason) return;
    viewer = createMarsViewer(host, {
      hotspotLayer: $('hotspot-layer'),
      onQuality: label => { $('render-quality').textContent = label; },
      onContextLost: useFallback,
    });
    exhibit.classList.add('is-3d');
    $('render-quality').textContent = `自動品質・${viewer.stats.heatTiles.toLocaleString()} heat-shield tiles`;
    renderCurrent();
  } catch (error) {
    useFallback(error instanceof Error ? `3Dを読み込めませんでした。${error.message}` : '3Dを読み込めませんでした。2D模式図を表示しています。');
  }
}

function openHelp() {
  resumeAfterHelp = playing;
  setPlaying(false);
  helpDialog.showModal();
}

function closeHelpDialog() { helpDialog.close(); }

renderStaticContent();
renderModeContent();
setPanelOpen(false);
setPlaying(false);
$('view-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) setMode(button.dataset.view);
});
playButton.addEventListener('click', () => setPlaying(!playing));
timeline.addEventListener('input', () => { time = Math.min(MARS_DURATION, Math.max(0, Number(timeline.value) || 0)); renderCurrent(); });
document.querySelectorAll('[data-rate]').forEach(button => button.addEventListener('click', () => {
  rate = Number(button.dataset.rate);
  document.querySelectorAll('[data-rate]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
$('reset-view').addEventListener('click', reset);
$('zoom-in').addEventListener('click', () => viewer?.zoomBy(.86));
$('zoom-out').addEventListener('click', () => viewer?.zoomBy(1.16));
$('hotspot-layer').addEventListener('click', event => { const button = event.target.closest('[data-hotspot]'); if (button) showFocus(button.dataset.hotspot); });
infoToggle.addEventListener('click', () => setPanelOpen(!panelOpen));
mobile.addEventListener('change', () => setPanelOpen(false));
$('help-open').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelpDialog);
helpDialog.addEventListener('close', () => { if (resumeAfterHelp) setPlaying(true); resumeAfterHelp = false; });
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelpDialog();
});

document.addEventListener('keydown', event => {
  if (helpDialog.open || event.target.matches('input,button,summary,a,textarea')) return;
  if (event.code === 'Space') { event.preventDefault(); setPlaying(!playing); }
  else if (event.key.toLowerCase() === 'r') reset();
  else if (event.key === '+' || event.key === '=') viewer?.zoomBy(.88);
  else if (event.key === '-') viewer?.zoomBy(1.14);
  else if (event.key === 'ArrowLeft') { event.preventDefault(); viewer?.orbitBy(-24, 0); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); viewer?.orbitBy(24, 0); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); viewer?.orbitBy(0, -20); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); viewer?.orbitBy(0, 20); }
});
stage.addEventListener('dblclick', () => viewer?.resetView());
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else { viewer?.resetFrameClock(); startLoop(); } });
reduced.addEventListener('change', () => { if (reduced.matches) setPlaying(false); });

renderCurrent();
startLoop();
boot3D();
