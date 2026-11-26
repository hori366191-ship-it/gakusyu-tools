const byId = id => document.getElementById(id);
const viewLabels = Object.freeze({ overall: '全体', flaps: 'フラップ', engines: 'エンジン', side: '側面' });
const statCache = new Map();

let comparison = null;
let synchronized = true;

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString('ja-JP') : '—';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function renderStats(side, stats) {
  statCache.set(side, stats);
  byId(`${side}-triangles`).textContent = formatNumber(stats.triangles);
  byId(`${side}-meshes`).textContent = formatNumber(stats.meshes);
  byId(`${side}-materials`).textContent = formatNumber(stats.materials);
  if (Number.isFinite(stats.fileBytes)) byId(`${side}-size`).textContent = formatBytes(stats.fileBytes);
}

function setPanelStatus(side, message, state) {
  byId(`${side}-status`).textContent = message;
  byId(`${side}-viewport`).dataset.state = state;
}

function showPanelError(side, error) {
  const message = error instanceof Error ? error.message : String(error);
  byId(`${side}-error-message`).textContent = message;
  byId(`${side}-error`).hidden = false;
  setPanelStatus(side, '表示エラー', 'error');
  byId('announce').textContent = `${side === 'procedural' ? 'プロシージラルモデル' : 'Blenderモデル'}でエラーが発生しました。${message}`;
}

function setViewUI(view) {
  if (!viewLabels[view]) return;
  for (const button of document.querySelectorAll('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  byId('announce').textContent = `${viewLabels[view]}ビューに切り替えました。`;
}

function setSynchronized(next, announce = true) {
  synchronized = Boolean(next);
  byId('sync-toggle').setAttribute('aria-checked', String(synchronized));
  byId('sync-label').textContent = `カメラ同期 ${synchronized ? 'ON' : 'OFF'}`;
  byId('camera-hint').textContent = synchronized
    ? 'ドラッグで周回・ホイールでズーム・2本指でピンチ。同期ONなら片方の操作が両方に反映されます。'
    : 'カメラ同期はOFFです。左右を別々に観察できます。ONに戻すと最後に操作した側の視点を両方へコピーします。';
  comparison?.setSynchronized(synchronized);
  if (announce) byId('announce').textContent = `カメラ同期を${synchronized ? 'ON' : 'OFF'}にしました。`;
}

function setControlsEnabled(enabled) {
  for (const button of document.querySelectorAll('[data-view], #sync-toggle, #reset-view')) button.disabled = !enabled;
}

async function loadProceduralSourceSize() {
  const sources = [
    new URL('../frontier-atlas/starship-model.mjs', import.meta.url),
    new URL('../frontier-atlas/starship-model-spec.mjs', import.meta.url),
  ];
  const responses = await Promise.all(sources.map(url => fetch(url, { cache: 'no-store' })));
  for (const response of responses) {
    if (!response.ok) throw new Error(`生成元ファイルの取得に失敗しました（HTTP ${response.status}）。`);
  }
  const buffers = await Promise.all(responses.map(response => response.arrayBuffer()));
  const fileBytes = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  const stats = statCache.get('procedural') || {};
  renderStats('procedural', { ...stats, fileBytes });
  byId('procedural-size').textContent = `${formatBytes(fileBytes)}（JS）`;
}

async function start() {
  try {
    const { createComparisonViewers } = await import('./viewer.mjs');
    comparison = createComparisonViewers(byId('procedural-viewport'), byId('blender-viewport'), {
      onStatus: setPanelStatus,
      onStats: renderStats,
      onError: showPanelError,
    });
    setControlsEnabled(comparison.hasRenderer('procedural') || comparison.hasRenderer('blender'));
    setSynchronized(true, false);
    try {
      await loadProceduralSourceSize();
    } catch (error) {
      byId('procedural-size').textContent = '取得失敗';
      console.warn('FRONTIER ATLAS BLENDER: source size unavailable', error);
    }
  } catch (error) {
    const message = `3Dモジュールを初期化できませんでした。${error instanceof Error ? error.message : String(error)} HTTPサーバーで開き、Three.jsのCDNへ接続できるか確認してください。`;
    showPanelError('procedural', new Error(message));
    showPanelError('blender', new Error(message));
    setControlsEnabled(false);
  }
}

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    comparison?.setView(view);
    setViewUI(view);
  });
}

byId('sync-toggle').addEventListener('click', () => setSynchronized(!synchronized));
byId('reset-view').addEventListener('click', () => {
  comparison?.resetView();
  setViewUI('overall');
});
window.addEventListener('pagehide', () => comparison?.dispose(), { once: true });

start();
