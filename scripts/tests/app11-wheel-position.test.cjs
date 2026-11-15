/**
 * 有機反応マップ（site/app11）— ホイール拡大縮小と現在位置フローティングの回帰テスト
 *
 * 実行: node --test scripts/tests/app11-wheel-position.test.cjs
 *
 * - ホイールは修飾キー無しで、カーソル位置を軸に 1ノッチ 1.35 倍。行・ページ単位をpxへ正規化し、
 *   トラックパッドの微小 delta は比例させる。1イベントの変化は3ノッチで頭打ち。
 * - 目標は累積し、rAF 1本の短い補間で追従する（毎イベントの再始動で移動が消えない）。
 * - 現在位置は地図内の右下フローティングで、地図のパン・ズームに巻き込まれない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const D = require(path.join(APP, 'data.js'));
const Core = require(path.join(APP, 'map-core.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(match, selector + ' の規則');
  return ' ' + match[1].replace(/\s+/g, ' ').trim() + ' ';
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

const NOTCH = 1.35;

/* ---------------- 純関数: ホイール量の正規化 ---------------- */

test('[core] ホイール1ノッチ（100px）は 1.35 倍、上で拡大・下で縮小', () => {
  assert.equal(Core.wheelZoomFactor(-100, 0, 600), NOTCH);
  assert.equal(Core.wheelZoomFactor(100, 0, 600), 1 / NOTCH);
  assert.ok(Core.wheelZoomFactor(-100, 0, 600) > 1, '上方向は拡大');
  assert.ok(Core.wheelZoomFactor(100, 0, 600) < 1, '下方向は縮小');
  assert.equal(Core.normalizeWheelDelta(-100, 0, 600), -100);
});

test('[core] トラックパッドの微小 delta は比例し、同じ合計なら同じ倍率になる', () => {
  const small = Core.wheelZoomFactor(-10, 0, 600);
  assert.ok(small > 1 && small < NOTCH, '1ノッチ未満: ' + small);
  assert.ok(Math.abs(small - Math.pow(NOTCH, 0.1)) < 1e-12);
  const splitA = Core.wheelZoomFactor(-5, 0, 600);
  const splitB = Core.wheelZoomFactor(-5, 0, 600);
  assert.ok(Math.abs(splitA * splitB - small) < 1e-12, '分割しても同じ');
  // 単調: 0 から 1ノッチまで、delta が大きいほど倍率も大きい
  let previous = 1;
  [0, -1, -3, -10, -30, -60, -100].forEach((delta) => {
    const factor = Core.wheelZoomFactor(delta, 0, 600);
    assert.ok(factor >= previous - 1e-12, 'delta ' + delta);
    previous = factor;
  });
});

test('[core] 行単位・ページ単位をpxへ正規化し、1イベントの変化は3ノッチで頭打ち', () => {
  // Firefox の行単位: 3行で1ノッチ
  assert.ok(Math.abs(Core.normalizeWheelDelta(-3, 1, 600) - -100) < 1e-9);
  assert.ok(Math.abs(Core.wheelZoomFactor(-3, 1, 600) - NOTCH) < 1e-9);
  assert.ok(Math.abs(Core.wheelZoomFactor(-1, 1, 600) - Math.pow(NOTCH, 1 / 3)) < 1e-9);
  // ページ単位: ビューポート高さを1ページとしてpxへ
  assert.equal(Core.normalizeWheelDelta(-1, 2, 600), -600);
  const page = Core.wheelZoomFactor(-1, 2, 600);
  assert.ok(Math.abs(page - Math.pow(NOTCH, 3)) < 1e-9, 'headlessでも飛ばない上限');
  // 1イベントの上限
  assert.ok(Math.abs(Core.wheelZoomFactor(-1000, 0, 600) - Math.pow(NOTCH, 3)) < 1e-12);
  assert.ok(Math.abs(Core.wheelZoomFactor(1000, 0, 600) - Math.pow(NOTCH, -3)) < 1e-12);
});

test('[core] delta 0・横方向だけの操作では拡大しない', () => {
  assert.equal(Core.wheelZoomFactor(0, 0, 600), 1);
  assert.equal(Core.wheelZoomFactor(0, 1, 600), 1);
  assert.equal(Core.wheelZoomFactor(0, 2, 600), 1);
  assert.equal(Core.wheelZoomFactor(NaN, 0, 600), 1);
  assert.equal(Core.normalizeWheelDelta(0, 0, 600), 0);
});

test('[core] カーソル位置を軸に拡大し、上下限でクランプする', () => {
  const view = { scale: 0.5, x: 30, y: -20 };
  const anchor = { x: 200, y: 140 };
  const before = Core.screenToWorld(view, anchor.x, anchor.y);
  const next = Core.zoomAt(view, NOTCH, anchor.x, anchor.y);
  const after = Core.screenToWorld(next, anchor.x, anchor.y);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9,
    'カーソル下の点が動かない');
  assert.equal(Core.zoomAt({ scale: Core.SCALE_MAX, x: 0, y: 0 }, NOTCH, 10, 10).scale, Core.SCALE_MAX);
  assert.equal(Core.zoomAt({ scale: Core.SCALE_MIN, x: 0, y: 0 }, 1 / NOTCH, 10, 10).scale, Core.SCALE_MIN);
});

/* ---------------- app.js: onWheel の実装（関数を抽出して駆動） ---------------- */

function loadWheel(start) {
  const app = read('app.js');
  const src = ['cancelWheelZoom', 'applyWheelView', 'wheelStep', 'onWheel']
    .map((name) => extractFunctionSource(app, name)).join('\n');
  const state = {
    view: { scale: start.scale, x: start.x, y: start.y },
    renders: [],
    frames: [],
    prevented: 0,
    mapRect: { left: 0, top: 0 }
  };
  const windowStub = {
    requestAnimationFrame(fn) { state.frames.push(fn); return state.frames.length; },
    cancelAnimationFrame() { state.frames = []; }
  };
  const factory = new Function(
    'Core', 'D', 'window', 'PHYSICAL_CONTROL_SELECTOR', 'mapEl', 'viewSize',
    'activeRegion', 'clearRegionSelection', 'mapPoint', 'state',
    [
      'var view = state.view;',
      'var wheelZoom = null, wheelRaf = 0, wheelApplying = false;',
      'var animToken = 0;',
      'var WHEEL_FOLLOW = 0.4, WHEEL_SETTLE_SCALE = 1e-4, WHEEL_SETTLE_PX = 0.5;',
      'function setView(next, clamp) {',
      '  if (!wheelApplying) cancelWheelZoom();',
      '  view = clamp ? Core.clampPan(next, viewSize.w, viewSize.h, D.meta.canvas) : next;',
      '  state.view = view;',
      '  state.renders.push({ scale: view.scale, x: view.x, y: view.y });',
      '}',
      src,
      'return {',
      '  onWheel: onWheel,',
      '  get wheelZoom() { return wheelZoom; },',
      '  flush: function () {',
      '    var guard = 0;',
      '    while (state.frames.length && guard++ < 20000) state.frames.shift()();',
      '  },',
      '  pending: function () { return state.frames.length; }',
      '};'
    ].join('\n')
  );
  const api = factory(
    Core, D, windowStub, '.rp-position,button',
    { clientHeight: 600, clientWidth: 900 },
    { w: 900, h: 600 },
    null, function () {},
    function (e) { return { x: e.clientX - state.mapRect.left, y: e.clientY - state.mapRect.top }; },
    state
  );
  return { api: api, state: state };
}

function wheelEvent(opts) {
  opts = opts || {};
  const event = {
    deltaY: opts.deltaY || 0,
    deltaX: opts.deltaX || 0,
    deltaMode: opts.deltaMode || 0,
    clientX: typeof opts.clientX === 'number' ? opts.clientX : 200,
    clientY: typeof opts.clientY === 'number' ? opts.clientY : 140,
    target: opts.target || { closest() { return null; } },
    preventDefault() { event.prevented = true; }
  };
  return event;
}

test('[wheel] 修飾キー無しで拡大し、5ノッチで 1.35^5（上限内）まで累積する', () => {
  const { api, state } = loadWheel({ scale: 0.2, x: 0, y: 0 });
  for (let i = 0; i < 5; i += 1) {
    const e = wheelEvent({ deltaY: -100 });
    api.onWheel(e);
    assert.equal(e.prevented, true, '地図の上では既定動作を止める');
  }
  assert.ok(api.pending() > 0, 'rAFで追従する');
  assert.ok(api.wheelZoom.scale > 0.2, '目標は累積している');
  api.flush();
  assert.ok(Math.abs(state.view.scale - 0.2 * Math.pow(NOTCH, 5)) < 1e-9, 'scale: ' + state.view.scale);
});

test('[wheel] 逆方向で元へ戻り、同じ点がカーソルの下に残る', () => {
  const { api, state } = loadWheel({ scale: 0.4, x: 40, y: 25 });
  const anchor = { x: 300, y: 210 };
  const worldBefore = Core.screenToWorld(state.view, anchor.x, anchor.y);
  for (let i = 0; i < 3; i += 1) api.onWheel(wheelEvent({ deltaY: -100, clientX: 300, clientY: 210 }));
  api.flush();
  const zoomed = state.view.scale;
  assert.ok(zoomed > 0.4);
  for (let i = 0; i < 3; i += 1) api.onWheel(wheelEvent({ deltaY: 100, clientX: 300, clientY: 210 }));
  api.flush();
  assert.ok(Math.abs(state.view.scale - 0.4) < 1e-9, '逆方向で戻る: ' + state.view.scale);
  const worldAfter = Core.screenToWorld(state.view, anchor.x, anchor.y);
  assert.ok(Math.abs(worldAfter.x - worldBefore.x) < 0.2 && Math.abs(worldAfter.y - worldBefore.y) < 0.2,
    'カーソル位置の基準点を保つ');
});

test('[wheel] 上限では止まり、古い目標へ巻き戻らない', () => {
  const { api, state } = loadWheel({ scale: Core.SCALE_MAX - 0.01, x: 0, y: 0 });
  for (let i = 0; i < 4; i += 1) {
    const e = wheelEvent({ deltaY: -100 });
    api.onWheel(e);
    assert.equal(e.prevented, true, '上限でもページスクロールへ渡さない');
  }
  api.flush();
  assert.equal(state.view.scale, Core.SCALE_MAX);
  // 他の操作（パン相当の setView）が入ったら、ホイール目標は捨てる
  api.onWheel(wheelEvent({ deltaY: 100 }));
  assert.ok(api.wheelZoom === null || api.wheelZoom.scale <= Core.SCALE_MAX);
});

test('[wheel] delta 0・横方向だけ・操作要素の上では何もしない', () => {
  const { api, state } = loadWheel({ scale: 0.3, x: 0, y: 0 });
  [
    wheelEvent({ deltaY: 0 }),
    wheelEvent({ deltaY: 0, deltaX: 120 }),
    wheelEvent({ deltaY: -100, target: { closest(sel) { return sel === '.rp-position,button' ? this : null; } } })
  ].forEach((e) => {
    api.onWheel(e);
    assert.equal(e.prevented, undefined, 'preventDefault しない');
  });
  assert.equal(api.pending(), 0);
  assert.equal(state.view.scale, 0.3);
  assert.equal(state.renders.length, 0, 'viewを書き換えない');
});

test('[static] ホイールは地図の上だけで止め、修飾キー必須に戻さない', () => {
  const app = read('app.js');
  assert.equal(app.includes('ctrlKey'), false, 'Ctrl/Meta を必須にしない');
  const wheelListeners = [...app.matchAll(/\.addEventListener\('wheel',\s*onWheel/g)];
  assert.equal(wheelListeners.length, 1, 'onWheel のリスナーは1か所だけ');
  assert.ok(app.includes("mapEl.addEventListener('wheel', onWheel, { passive: false })"), '地図だけ');
  assert.equal(/document\.addEventListener\('wheel'/.test(app), false, 'documentへ足さない');
  assert.ok(app.includes('Core.wheelZoomFactor(e.deltaY, e.deltaMode, mapEl.clientHeight)'));
  assert.ok(app.includes("if (e.target && e.target.closest && e.target.closest(PHYSICAL_CONTROL_SELECTOR)) return;"));
  // 累積目標 + rAF 追従（毎イベント animateTo を再始動しない）
  assert.ok(app.includes('wheelZoom = Core.clampPan(next, viewSize.w, viewSize.h, D.meta.canvas)'));
  assert.ok(app.includes('wheelRaf = window.requestAnimationFrame(wheelStep)'));
  assert.equal(/onWheel[\s\S]{0,400}animateTo\(/.test(app), false, 'onWheelからanimateToを呼ばない');
  assert.ok(app.includes('if (!wheelApplying) cancelWheelZoom();'), '他の操作で目標を捨てる');
  assert.ok(app.includes('cancelWheelZoom();') && app.includes('function cancelWheelZoom()'));
});

/* ---------------- 現在位置: 地図内フローティング ---------------- */

test('[static] 現在位置は地図内の右下に固定され、パン・ズーム・キー操作から除外される', () => {
  const app = read('app.js');
  const html = read('index.html');
  const css = read('app.css');

  assert.ok(html.includes('id="rp-map"') && html.indexOf('id="rp-position"') > html.indexOf('id="rp-map"'),
    '地図の中に置く');
  assert.ok(html.indexOf('id="rp-position"') < html.indexOf('id="rp-data-notice"'));
  assert.match(ruleBody(css, '.rp-position'), /position: absolute/);
  assert.match(ruleBody(css, '.rp-position'), /right: 12px/);
  assert.match(ruleBody(css, '.rp-position'), /bottom: 12px/);
  assert.match(ruleBody(css, '.rp-position'), /max-width: min\(420px, calc\(100% - 24px\)\)/);
  // 地図の変換層（#rp-viewport）には入れない
  const svgEnd = html.indexOf('</svg>');
  assert.ok(svgEnd > 0 && html.indexOf('id="rp-position"') > svgEnd, 'transform層の外');

  assert.ok(app.includes("var PHYSICAL_CONTROL_SELECTOR = '.rp-legend,.rp-classmap-jump,.rp-position,"),
    '当たり判定の操作要素に含める');
  assert.ok(app.includes('if (e.target.closest && e.target.closest(PHYSICAL_CONTROL_SELECTOR)) return;'),
    'pointerdownで地図のパンを始めない');
  assert.ok(app.includes('if (positionEl && positionEl.contains(e.target)) return;'),
    'keydownを地図のショートカットへ渡さない');
  assert.ok(app.includes("positionPopover.addEventListener('wheel', function (e) { e.stopPropagation(); }"),
    'popoverのwheelは地図へ渡さない');
  assert.ok(app.includes('function onPopoverPointerDown'), 'touch-action:none の下でも指スクロールできる');
  assert.ok(app.includes('positionPopover.scrollTop = popoverDrag.top - (e.clientY - popoverDrag.y)'));
  // 全文は選択・コピーできる（user-select を殺さない）
  assert.equal(/\.rp-position[^}]*user-select:\s*none/.test(css), false);
});

test('[static] 地図の文字は描画層だけ非選択にし、カード・現在位置・popoverの選択/コピーは保つ', () => {
  const css = read('app.css');
  // 描画層（SVGとHTMLオーバーレイ）はパン開始前から非選択。
  const svgRule = ruleBody(css, '.rp-svg');
  assert.match(svgRule, /-webkit-user-select:\s*none/);
  assert.match(svgRule, /(^|;)\s*user-select:\s*none/);
  const overlayRule = ruleBody(css, '.rp-overlay');
  assert.match(overlayRule, /-webkit-user-select:\s*none/);
  assert.match(overlayRule, /(^|;)\s*user-select:\s*none/);
  // 地図全体やカード・現在位置・popover には掛けない（内側の全文コピーを壊さない）。
  assert.equal(/user-select/.test(ruleBody(css, '.rp-map')), false, '.rp-map 全域に掛けない');
  assert.equal(/user-select/.test(ruleBody(css, '.rp-card')), false, 'カード外側は選択できる');
  assert.equal(/user-select/.test(ruleBody(css, '.rp-position')), false, '現在位置は選択できる');
  assert.equal(/user-select/.test(ruleBody(css, '.rp-position__popover')), false, 'popoverは選択できる');
  assert.equal(/user-select/.test(ruleBody(css, '.rp-card__body')), false, 'カード本文は選択できる');
});

test('[static] 「一般図へ」の導線は現在位置の高さの上に置き、ヒント行は残さない', () => {
  const app = read('app.js');
  const html = read('index.html');
  const css = read('app.css');

  assert.equal(html.includes('rp-hint'), false, 'ヒントのDOMを残さない');
  assert.equal(app.includes('rp-hint'), false, 'ヒントへの参照を残さない');
  assert.equal(/\.rp-hint/.test(css), false, 'ヒントのCSSを残さない');
  assert.equal(html.includes('ドラッグで移動'), false, '別の説明文へ置き換えない');

  assert.match(ruleBody(css, '.rp-classmap-jump'), /bottom: calc\(12px \+ var\(--rp-position-h, 50px\) \+ 10px\)/,
    '現在位置の上に置く（動的フォントでも重ならない）');
  assert.ok(app.includes('function syncPositionInset'));
  assert.ok(app.includes("mapEl.style.setProperty('--rp-position-h'"));
  assert.ok(app.includes('new ResizeObserver(function () { syncPositionInset(); }).observe(positionEl)'),
    '文字サイズ・折返しの変化に追随する');
  assert.ok(app.includes('syncPositionPopoverBox'));
  assert.ok(app.includes('popoverDrag') && app.includes('positionPopover.setPointerCapture'),
    'popover内スクロールは地図へ渡さない');
});
