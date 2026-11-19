/**
 * app11-3d-sphere — 選択解除フェードインの統合回帰（fake DOM + Canvas 計測）
 * 実行: node --test scripts/tests/app11-3d-sphere-reveal-integration.test.cjs
 *
 * これまでのテストは plan の fade フラグしか見ていなかった。ここでは
 * sphere-app.js を fake DOM / fake Canvas / fake RAF で実際に起動し、
 * 本物の「選択解除」操作（clear ボタン / Escape / 空白 pointerup）を発火して、
 * drawScene が実際に塗った globalAlpha を 0 → mid → 1 で記録する。
 *
 * さらに詳細パネルが消えたときの ResizeObserver（80ms デバウンス）を再現し、
 * 復帰アニメーションが途中でキャンセルされないことを確認する。
 *
 * ブラウザ・スクリーンショット・外部 API は使わない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const PUB = path.join(ROOT, 'site', 'app11', '3d', 'projection.js');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const Base = require(PUB);
const C = require(path.join(LAB, 'sphere-camera.js'))(Base);
const L = require(path.join(LAB, 'sphere-layout.js'));
const SR = require(path.join(LAB, 'sphere-render.js'));
const S = require(path.join(ROOT, 'site', 'app11', '3d', 'scene-model.js'));
const I = require(path.join(ROOT, 'site', 'app11', '3d', 'interaction.js'));
const G = require(path.join(LAB, 'sphere-input.js'));
const DOCK = require(path.join(LAB, 'sphere-dock.js'));

const projectionPath = require.resolve(PUB);
const rendererPath = require.resolve(path.join(ROOT, 'site', 'app11', '3d', 'renderer.js'));
const cachedProjection = require.cache[projectionPath];
const originalExports = cachedProjection ? cachedProjection.exports : null;
if (cachedProjection) cachedProjection.exports = C;
delete require.cache[rendererPath];
const R = require(rendererPath);
if (cachedProjection && originalExports) cachedProjection.exports = originalExports;

const data = require(path.join(ROOT, 'site', 'app11', 'data.js'));
const academic = require(path.join(ROOT, 'site', 'app11', '3d', 'academic-facts.js'));
const groups = require(path.join(ROOT, 'site', 'app11', 'reaction-groups.js'));

const APP_SOURCE = fs.readFileSync(path.join(LAB, 'sphere-app.js'), 'utf8');

/* ------------------------------------------------------------------ *
 * fake Canvas 2D（実際に塗られた globalAlpha を記録する）
 * ------------------------------------------------------------------ */

function createCanvasContext() {
  const stack = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    lineCap: '',
    lineJoin: '',
    imageSmoothingEnabled: true,
    __r3dGradient: null,
    frame: null,
    lastFrame: null,
    beginFrame() { this.frame = { fillTexts: [], strokes: [] }; },
    endFrame() {
      // 空フレーム（次フレームが無い）で最後の描画結果を上書きしない。
      if (this.frame.fillTexts.length || this.frame.strokes.length) this.lastFrame = this.frame;
    },
    save() {
      stack.push({
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        font: this.font,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
        lineCap: this.lineCap,
        lineJoin: this.lineJoin
      });
    },
    restore() {
      const state = stack.pop();
      if (state) Object.assign(this, state);
    },
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, closePath() {}, fill() {}, clip() {},
    setTransform() {}, translate() {}, transform() {}, drawImage() {},
    setLineDash() {},
    stroke() {
      if (this.frame) this.frame.strokes.push({ alpha: this.globalAlpha, strokeStyle: this.strokeStyle });
    },
    fillText(text, x, y) {
      if (this.frame) this.frame.fillTexts.push({
        text: String(text),
        x: x,
        y: y,
        alpha: this.globalAlpha,
        fillStyle: this.fillStyle
      });
    },
    measureText(text) { return { width: String(text).length * 7 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }
  };
  return ctx;
}

/* ------------------------------------------------------------------ *
 * fake DOM
 * ------------------------------------------------------------------ */

function makeElement(tag, id) {
  const classes = new Set();
  const listeners = Object.create(null);
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    id: id || '',
    hidden: false,
    disabled: false,
    open: false,
    value: '',
    attributes: Object.create(null),
    childNodes: [],
    parentNode: null,
    style: {
      setProperty(name, value) { this[name] = String(value); },
      getPropertyValue(name) { return this[name] || ''; }
    },
    dataset: {},
    listeners: listeners,
    rect: null,
    clientWidth: 0,
    clientHeight: 0,
    width: 0,
    height: 0,
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i >= 0) this.childNodes.splice(i, 1);
      return child;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners[type] || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent(event) {
      const ev = event || {};
      if (!ev.target) ev.target = this;
      if (typeof ev.preventDefault !== 'function') ev.preventDefault = function () { this.defaultPrevented = true; };
      (listeners[ev.type] || []).slice().forEach((handler) => handler(ev));
      return true;
    },
    click() { this.dispatchEvent({ type: 'click', target: this }); },
    focus() {},
    contains(node) {
      if (node === this) return true;
      return this.childNodes.some((child) => child && (child === node || (child.contains && child.contains(node))));
    },
    querySelectorAll(selector) {
      if (!selector || selector.charAt(0) !== '.') return [];
      const name = selector.slice(1);
      return this.childNodes.filter((child) => child && child.nodeType === 1 && child.classList.contains(name));
    },
    getBoundingClientRect() {
      if (this.hidden) return { left: 0, top: 0, width: 0, height: 0 };
      return this.rect || { left: 0, top: 0, width: 0, height: 0 };
    },
    scrollIntoView() {},
    showModal() {},
    close() {}
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(classes).join(' '); },
    set(value) {
      classes.clear();
      String(value == null ? '' : value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    }
  });
  el.classList = {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !classes.has(name) : !!force;
      if (next) classes.add(name); else classes.delete(name);
      return next;
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set() { el.childNodes = []; }
  });
  Object.defineProperty(el, 'textContent', {
    get() {
      return el.childNodes.map((child) => child.textContent || '').join('');
    },
    set(value) {
      el.childNodes = [];
      if (value !== '' && value != null) {
        el.childNodes.push({ nodeType: 3, textContent: String(value), parentNode: el });
      }
    }
  });
  return el;
}

function createFakeDom(options) {
  options = options || {};
  let clock = 0;
  let nextRaf = 1;
  let nextTimer = 1;
  const rafQueue = [];
  const timers = [];
  const resizeObservers = [];
  const windowListeners = Object.create(null);
  const documentListeners = Object.create(null);
  const ctx = createCanvasContext();

  const canvas = makeElement('canvas', 'r3d-canvas');
  canvas.clientWidth = 1280;
  canvas.clientHeight = 800;
  canvas.width = 1280;
  canvas.height = 800;
  canvas.rect = { left: 0, top: 0, width: 1280, height: 800 };
  canvas.getContext = function () { return ctx; };
  canvas.setPointerCapture = function () {};
  canvas.releasePointerCapture = function () {};

  const elements = Object.create(null);
  const ids = [
    'r3d-canvas', 'r3d-controls', 'r3d-detail', 'r3d-detail-body', 'r3d-detail-eyebrow',
    'r3d-detail-focus', 'r3d-detail-meta', 'r3d-detail-title', 'r3d-fallback',
    'r3d-fallback-list', 'r3d-fallback-message', 'r3d-fallback-search', 'r3d-focus',
    'r3d-help', 'r3d-help-close', 'r3d-help-open', 'r3d-legend', 'r3d-legend-list',
    'r3d-live', 'r3d-mode-inside', 'r3d-mode-outside', 'r3d-reset', 'r3d-results',
    'r3d-search', 'r3d-search-status', 'r3d-unconnected', 'r3d-zoom-in', 'r3d-zoom-out',
    's3d-fade', 'r3d-clear', 'r3d-app'
  ];
  ids.forEach((id) => {
    const el = id === 'r3d-canvas' ? canvas : makeElement(id === 's3d-fade' ? 'div' : 'div', id);
    elements[id] = el;
  });
  elements['r3d-search'].parentNode = { contains() { return true; } };
  elements['r3d-search'].setAttribute('type', 'search');
  elements['r3d-detail'].hidden = true;
  elements['r3d-detail'].rect = { left: 880, top: 120, width: 380, height: 560 };
  elements['r3d-results'].hidden = true;
  elements['r3d-fallback'].hidden = true;
  elements['r3d-legend'].open = true;
  elements['r3d-legend'].rect = { left: 0, top: 700, width: 400, height: 120 };

  const head = makeElement('header', 'r3d-head');
  head.rect = { left: 0, top: 0, width: 1280, height: 100 };
  const hint = makeElement('div', 'r3d-hint');
  hint.rect = { left: 0, top: 660, width: 1280, height: 40 };
  elements['r3d-controls'].rect = { left: 0, top: 700, width: 1280, height: 100 };
  elements['r3d-legend'].rect = { left: 0, top: 700, width: 400, height: 100 };

  const document = {
    readyState: 'complete',
    createElement(tag) { return makeElement(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: String(text), parentNode: null }; },
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) {
      if (selector === '.r3d-head') return head;
      if (selector === '.r3d-hint') return hint;
      if (selector === '.r3d-detail') return elements['r3d-detail'];
      return null;
    },
    addEventListener(type, handler) {
      if (!documentListeners[type]) documentListeners[type] = [];
      documentListeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      const list = documentListeners[type] || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent(event) {
      const ev = event || {};
      if (typeof ev.preventDefault !== 'function') ev.preventDefault = function () { this.defaultPrevented = true; };
      (documentListeners[ev.type] || []).slice().forEach((handler) => handler(ev));
      return true;
    }
  };

  const performance = { now() { return clock; } };
  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    performance: performance,
    setTimeout(fn, ms) {
      const id = nextTimer++;
      timers.push({ id: id, at: clock + Math.max(0, ms || 0), fn: fn, done: false });
      return id;
    },
    clearTimeout(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.done = true;
    },
    requestAnimationFrame(fn) {
      const id = nextRaf++;
      rafQueue.push({ id: id, fn: fn });
      return id;
    },
    cancelAnimationFrame(id) {
      const i = rafQueue.findIndex((item) => item.id === id);
      if (i >= 0) rafQueue.splice(i, 1);
    },
    matchMedia(query) {
      return {
        matches: query.indexOf('max-width') >= 0 ? false : !!options.reducedMotion,
        addEventListener() {},
        removeEventListener() {}
      };
    },
    addEventListener(type, handler) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      const list = windowListeners[type] || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  };
  window.window = window;
  window.document = document;
  window.RP3DProjection = C;
  window.RP3DSphereCamera = C;
  window.RP3DSphereLayout = L;
  window.RP3DSphereRender = SR;
  window.RP3DScene = S;
  window.RP3DRenderer = R;
  window.RP3DInteraction = I;
  window.RP3DSphereInput = G;
  window.RP3DSphereDock = DOCK;
  window.RP3DEquationFit = null;
  window.RPMapData = data;
  window.RPMapAcademicFacts = academic;
  window.RPReactionGroups = groups;

  function ResizeObserver(callback) {
    resizeObservers.push(callback);
  }
  ResizeObserver.prototype.observe = function () {};
  ResizeObserver.prototype.disconnect = function () {};

  const sandbox = {
    window: window,
    document: document,
    performance: performance,
    ResizeObserver: ResizeObserver,
    console: console,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(APP_SOURCE, sandbox, { filename: 'sphere-app.js' });

  function runFrameAt(ms) {
    clock = Math.max(clock, ms);
    const callbacks = rafQueue.splice(0, rafQueue.length);
    ctx.beginFrame();
    callbacks.forEach((item) => item.fn(clock));
    ctx.endFrame();
    return ctx.lastFrame;
  }

  function runTimersUntil(ms) {
    const target = Math.max(clock, ms);
    let guard = 0;
    while (guard++ < 2000) {
      const due = timers.filter((item) => !item.done && item.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.done = true;
      clock = Math.max(clock, due.at);
      due.fn();
    }
    clock = target;
  }

  function triggerResizeObserver() {
    resizeObservers.forEach((callback) => callback([{ target: elements['r3d-detail'] }]));
  }

  return {
    clock: () => clock,
    setClock(value) { clock = value; },
    elements: elements,
    document: document,
    canvas: canvas,
    ctx: ctx,
    window: window,
    runFrameAt: runFrameAt,
    runTimersUntil: runTimersUntil,
    triggerResizeObserver: triggerResizeObserver
  };
}

function selectViaSearch(env, query) {
  const search = env.elements['r3d-search'];
  search.value = query;
  search.dispatchEvent({ type: 'input', target: search });
  const results = env.elements['r3d-results'];
  const button = results.querySelectorAll('.r3d-result')[0];
  assert.ok(button, '検索結果ボタンがない: ' + query);
  button.dispatchEvent({ type: 'click', target: button });
}

function frameTexts(frame) {
  const map = new Map();
  (frame && frame.fillTexts || []).forEach((record) => {
    map.set(record.text, record.alpha);
  });
  return map;
}

function driveSelection(env) {
  env.setClock(1000);
  selectViaSearch(env, '酢酸');
  [1010, 1200, 1400, 1500, 1650, 1700].forEach((t) => env.runFrameAt(t));
  const steady = new Set();
  env.ctx.lastFrame.fillTexts.forEach((record) => steady.add(record.text));
  assert.ok(steady.size > 0, '選択中の描画テキストがない');
  assert.equal(env.elements['r3d-detail'].hidden, false, '詳細パネルが表示されていない');
  return steady;
}

function driveClear(env, clearFn, start) {
  env.setClock(start);
  clearFn();
  const f0 = env.runFrameAt(start);
  // 詳細パネルが消えたことによる ResizeObserver → 80ms デバウンス。
  env.triggerResizeObserver();
  env.runTimersUntil(start + 85);
  const mid = env.runFrameAt(start + 450);
  const end = env.runFrameAt(start + 950);
  return { f0: f0, mid: mid, end: end };
}

function assertDrawnFade(steady, frames, label) {
  const endTexts = frameTexts(frames.end);
  let target = null;
  for (const [text, alpha] of endTexts) {
    if (alpha >= 0.99 && !steady.has(text) &&
      frameTexts(frames.f0).has(text) && frameTexts(frames.mid).has(text)) {
      target = text;
      break;
    }
  }
  assert.ok(target, label + ': 新しく描かれるカードが見つからない');
  const alpha0 = frameTexts(frames.f0).get(target);
  const alphaMid = frameTexts(frames.mid).get(target);
  const alphaEnd = frameTexts(frames.end).get(target);
  assert.ok(alpha0 != null && alpha0 < 0.05, label + ': 開始 alpha=' + alpha0);
  assert.ok(alphaMid != null && alphaMid > 0.15 && alphaMid < 0.85,
    label + ': 中間 alpha=' + alphaMid + '（ResizeObserver でキャンセルされた可能性）');
  assert.ok(alphaEnd != null && alphaEnd >= 0.99, label + ': 終了 alpha=' + alphaEnd);

  // 既存（選択グラフ）は steady のまま。
  let steadyText = null;
  for (const text of steady) {
    if (endTexts.get(text) != null) { steadyText = text; break; }
  }
  assert.ok(steadyText, label + ': steady な既存カードが見つからない');
  for (const [name, frame] of [['0', frames.f0], ['mid', frames.mid], ['end', frames.end]]) {
    const alpha = frameTexts(frame).get(steadyText);
    assert.ok(alpha != null && alpha > 0.99, label + ': 既存カードが ' + name + ' で alpha=' + alpha);
  }

  // 経路（バッチ）も実際の globalAlpha が 0 → 中間 → 1 に進む。
  const strokes0 = frames.f0.strokes.map((s) => s.alpha);
  const strokesMid = frames.mid.strokes.map((s) => s.alpha);
  assert.ok(strokes0.some((a) => a < 0.02), label + ': 開始の経路 alpha が 0 でない');
  assert.ok(strokesMid.some((a) => a > 0.05 && a < 0.25), label + ': 中間の経路 alpha が中間でない');
  return { target: target, alpha0: alpha0, alphaMid: alphaMid, alphaEnd: alphaEnd };
}

test('[integration] clear ボタン: 詳細パネル消失の ResizeObserver 後も 0→mid→1 で描画される', () => {
  const env = createFakeDom();
  const steady = driveSelection(env);
  const frames = driveClear(env, () => env.elements['r3d-clear'].click(), 2000);
  const result = assertDrawnFade(steady, frames, 'clear ボタン');
  // 最終フレームは通常計画（カードの globalAlpha はすべて 1）。
  assert.ok(env.ctx.lastFrame.fillTexts.every((r) => r.alpha >= 0.99),
    '最終フレームに fade 途中のカードが残っている');
  assert.ok(result.alphaMid > 0.15 && result.alphaMid < 0.85);
});

test('[integration] Escape: キーボード解除でも同じフェードインが描画される', () => {
  const env = createFakeDom();
  const steady = driveSelection(env);
  const frames = driveClear(env, () => {
    env.document.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      target: env.canvas,
      preventDefault() {}
    });
  }, 3000);
  assertDrawnFade(steady, frames, 'Escape');
});

test('[integration] 空白 pointerup: タップ解除でも同じフェードインが描画される', () => {
  const env = createFakeDom();
  const steady = driveSelection(env);
  const frames = driveClear(env, () => {
    const event = {
      pointerId: 77,
      clientX: 3,
      clientY: 3,
      pointerType: 'mouse',
      button: 0,
      preventDefault() {}
    };
    env.canvas.dispatchEvent(Object.assign({ type: 'pointerdown' }, event));
    env.canvas.dispatchEvent(Object.assign({ type: 'pointerup' }, event));
  }, 4000);
  assertDrawnFade(steady, frames, '空白 pointerup');
});

test('[integration] 地図の実表示領域の縦横比で detail ドックが切り替わる（detail 自身は使わない）', () => {
  const env = createFakeDom();
  const app = env.elements['r3d-app'];
  const head = env.document.querySelector('.r3d-head');
  const toolbar = env.elements['r3d-controls'];
  const detail = env.elements['r3d-detail'];
  const apply = () => {
    env.triggerResizeObserver();
    env.runTimersUntil(env.clock() + 100);
  };
  const dock = () => app.classList.contains('r3d-dock-bottom') ? 'bottom' : 'right';
  // 初期: 1280x800 / header 100 / toolbar 700 → net 1280x600（横長）→ right。
  assert.equal(dock(), 'right', '初期が right でない');
  assert.equal(app.classList.contains('r3d-dock-right'), true, 'right クラスがない');

  // 834x1194 相当の縦長 net（canvas 834x1194, header 100, toolbar 1100）。
  env.canvas.clientWidth = 834;
  env.canvas.clientHeight = 1194;
  env.canvas.rect = { left: 0, top: 0, width: 834, height: 1194 };
  head.rect = { left: 0, top: 0, width: 834, height: 100 };
  toolbar.rect = { left: 0, top: 1100, width: 834, height: 80 };
  apply();
  assert.equal(dock(), 'bottom', '縦長 net で bottom にならない');
  assert.equal(app.classList.contains('r3d-dock-right'), false, 'bottom 時に right クラスが残る');

  // detail 自身の矩形が変わっても判定は変わらない（ハンチングしない）。
  detail.rect = { left: 10, top: 780, width: 814, height: 300 };
  apply();
  assert.equal(dock(), 'bottom', 'detail の矩形で判定が変わった');

  // ツールバーが上がって net が横長へ反転（834x480 相当）→ right。
  toolbar.rect = { left: 0, top: 580, width: 834, height: 80 };
  apply();
  assert.equal(dock(), 'right', '横長 net で right に戻らない');

  // ちょうど正方形（net 500x500）→ 厳密に縦長でないので right。
  env.canvas.clientWidth = 500;
  env.canvas.clientHeight = 700;
  env.canvas.rect = { left: 0, top: 0, width: 500, height: 700 };
  head.rect = { left: 0, top: 0, width: 500, height: 100 };
  toolbar.rect = { left: 0, top: 600, width: 500, height: 80 };
  apply();
  assert.equal(dock(), 'right', '正方形で bottom になった');

  // ヘッダが縮んで net が縦長（500x520）→ bottom。
  head.rect = { left: 0, top: 0, width: 500, height: 80 };
  apply();
  assert.equal(dock(), 'bottom', 'ヘッダ変化後の縦長 net で bottom にならない');
  // 下部ドックの位置はツールバー実測の上（CSS 変数）。
  const offset = app.style['--r3d-dock-bottom-offset'];
  assert.ok(offset && /^\d+px$/.test(offset), '下部ドックのオフセットがない: ' + offset);
});

test('[integration] reduced-motion が有効なら即時（意図どおり 0ms・フェードしない）', () => {
  const env = createFakeDom({ reducedMotion: true });
  const steady = driveSelection(env);
  const frames = driveClear(env, () => env.elements['r3d-clear'].click(), 2000);
  const endTexts = frameTexts(frames.end);
  let target = null;
  for (const [text, alpha] of endTexts) {
    if (alpha >= 0.99 && !steady.has(text)) { target = text; break; }
  }
  assert.ok(target, 'reduced-motion: 新カードが見つからない');
  const first = frameTexts(frames.f0).get(target);
  assert.ok(first != null && first >= 0.99, 'reduced-motion なのに alpha=' + first);
});
