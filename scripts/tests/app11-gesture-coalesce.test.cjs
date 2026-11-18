/**
 * 有機反応マップ（site/app11）— パン・ピンチのフレーム集約と補助ラベル追従の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-gesture-coalesce.test.cjs
 *
 * - pointermove は最新状態だけを保持し、rAF 1本で1フレーム1回だけ transform を更新する。
 * - ジェスチャー中は、いま出ている補助ラベルを world 位置へ追従させるだけ。
 *   重なり判定（実寸測定・作り直し）は最終フレームで1回だけ行う。
 * - 終了・cancel・capture 喪失・ピンチ→1本指では、未実行の rAF を待たず最後の位置を確定する。
 * - ジェスチャー外の操作（キー・ボタン等）は予約済みフレームを破棄し、古い座標で上書きしない。
 *
 * app.js はブラウザ前提のため、対象関数だけを抽出し、fake DOM / fake rAF で決定的に駆動する。
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

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

const GESTURE_FUNCTIONS = [
  'cancelGestureFrame', 'applyGestureView', 'applyPendingGesture',
  'flushGestureFrame', 'flushGestureNow', 'commitPendingGesture', 'rebaseGestureOrigins',
  'applyView', 'renderTransform', 'applyDetailLevel', 'render', 'renderGesture',
  'trackOverlay', 'updateOverlay', 'tryPlace',
  'setView', 'mapPoint', 'pointerList',
  'onPointerDown', 'onPointerMove', 'endPointer'
];

/* ---------------- fake DOM / fake rAF ---------------- */

function makeRaf(state) {
  let seq = 0;
  const queue = new Map();
  return {
    requestAnimationFrame(fn) {
      seq += 1;
      queue.set(seq, fn);
      return seq;
    },
    cancelAnimationFrame(id) { queue.delete(id); },
    flush() {
      const run = Array.from(queue.values());
      queue.clear();
      run.forEach((fn) => fn());
    },
    pending() { return queue.size; }
  };
}

function makeOverlay(state) {
  const overlay = {
    firstChild: null,
    getBoundingClientRect() {
      state.overlayReads += 1;
      return { left: 0, top: 0, width: 900, height: 600 };
    },
    appendChild(node) {
      node.nextSibling = null;
      if (!overlay.firstChild) {
        overlay.firstChild = node;
      } else {
        let last = overlay.firstChild;
        while (last.nextSibling) last = last.nextSibling;
        last.nextSibling = node;
      }
      node.parent = overlay;
      return node;
    },
    removeChild(node) {
      if (overlay.firstChild === node) {
        overlay.firstChild = node.nextSibling || null;
      } else {
        let prev = overlay.firstChild;
        while (prev && prev.nextSibling !== node) prev = prev.nextSibling;
        if (prev) prev.nextSibling = node.nextSibling || null;
      }
      node.nextSibling = null;
      node.parent = null;
    },
    toArray() {
      const list = [];
      let node = overlay.firstChild;
      while (node) { list.push(node); node = node.nextSibling; }
      return list;
    }
  };
  return overlay;
}

// 画面上の補助ラベル。left/top は style の px をそのまま実寸として返す
// （本物の getBoundingClientRect の代わり。呼び出し回数を数える）。
function makeDocument(state) {
  return {
    createElement(tag) {
      state.created += 1;
      const node = {
        tagName: tag,
        className: '',
        textContent: '',
        style: {},
        __rpAnchor: null,
        __rpX: undefined,
        __rpY: undefined,
        getBoundingClientRect() {
          state.rectReads += 1;
          const left = parseFloat(this.style.left) || 0;
          const top = parseFloat(this.style.top) || 0;
          const width = (this.textContent ? this.textContent.length : 0) * 10;
          return { left, top, width, height: 14, right: left + width, bottom: top + 14 };
        }
      };
      return node;
    }
  };
}

function makeMapEl(state) {
  return {
    clientHeight: 600,
    clientWidth: 900,
    style: { setProperty() {} },
    classList: { add() { state.panning += 1; }, remove() { state.panning -= 1; } },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    setAttribute() {},
    setPointerCapture() {},
    releasePointerCapture() {}
  };
}

/* ---------------- harness ---------------- */

function loadApp(opts) {
  opts = opts || {};
  const app = read('app.js');
  const state = {
    start: opts.start || { scale: 1.2, x: 20, y: 30 },
    viewSize: opts.viewSize || { w: 900, h: 600 },
    canvas: opts.canvas || { x: 0, y: 0, w: 2000, h: 1500 },
    transforms: [],
    positionUpdates: 0,
    markerUpdates: 0,
    insetUpdates: 0,
    created: 0,
    rectReads: 0,
    overlayReads: 0,
    panning: 0,
    opened: [],
    fixtures: opts.fixtures || fixtures()
  };
  const raf = makeRaf(state);
  const overlay = makeOverlay(state);
  const documentStub = makeDocument(state);
  const mapEl = makeMapEl(state);
  const viewport = {
    setAttribute(key, value) {
      if (key === 'transform') state.transforms.push(value);
    }
  };

  const src = GESTURE_FUNCTIONS.map((name) => extractFunctionSource(app, name)).join('\n');
  const factory = new Function(
    'Core', 'document', 'viewport', 'overlay', 'mapEl', 'window', 'state',
    'viewSize', 'PHYSICAL_CONTROL_SELECTOR',
    'updateMarkers', 'syncPositionInset', 'updatePosition',
    'activeRegions', 'regionHubs', 'nodeCenter', 'activeCompounds', 'nodeIndex',
    'displayReactions', 'activeReactionIndex', 'visibleBox',
    'cancelWheelZoom', 'pickDownEntity', 'openFromElement',
    'activeRegion', 'clearRegionSelection', 'modeCanvas', 'nodeW', 'nodeH',
    [
      'var view = { scale: state.start.scale, x: state.start.x, y: state.start.y };',
      'var lastLevel = -1;',
      'var pointers = {};',
      'var panOrigin = null, pinchOrigin = null, downEntity = null;',
      'var suppressClick = false;',
      'var wheelApplying = false;',
      'var gestureRaf = 0, gesturePending = null, gestureApplying = false, gestureDirty = false;',
      src,
      'return {',
      '  view: function () { return view; },',
      '  lastLevel: function () { return lastLevel; },',
      '  render: render,',
      '  renderGesture: renderGesture,',
      '  setView: setView,',
      '  onPointerDown: onPointerDown,',
      '  onPointerMove: onPointerMove,',
      '  endPointer: endPointer,',
      '  flush: function () { window.__raf.flush(); },',
      '  pendingFrames: function () { return window.__raf.pending(); },',
      '  gestureDirty: function () { return gestureDirty; },',
      '  overlayChildren: function () { return overlay.toArray(); }',
      '};'
    ].join('\n')
  );

  const f = state.fixtures;
  const windowStub = { __raf: raf, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame };
  const api = factory(
    Core,
    documentStub,
    viewport,
    overlay,
    mapEl,
    windowStub,
    state,
    state.viewSize,
    '.rp-position,button',
    function () { state.markerUpdates += 1; },
    function () { state.insetUpdates += 1; },
    function () { state.positionUpdates += 1; },
    () => f.regions,
    () => f.hubs || {},
    (c) => ({ x: c.x + (c.w || 100) / 2, y: c.y + (c.h || 40) / 2 }),
    () => f.compounds,
    f.nodeIndex || {},
    () => f.reactions,
    () => f.reactionIndex || {},
    () => ({ left: 0, top: 0, right: state.viewSize.w, bottom: state.viewSize.h }),
    function () {},
    function () { return null; },
    function (el) { state.opened.push(el); },
    null,
    function () {},
    () => state.canvas,
    (c) => c.w || 100,
    (c) => c.h || 40
  );

  return { api, state, overlay, raf };
}

function fixtures() {
  return {
    regions: [],
    hubs: {},
    compounds: [],
    nodeIndex: {},
    reactions: [
      { id: 'r1', tier: 'secondary', label: null, typeLabel: '酸化', x: 100, y: 50 },
      { id: 'r2', tier: 'secondary', label: null, typeLabel: '還元', x: 400, y: 50 }
    ],
    reactionIndex: {}
  };
}

function pointerEvent(x, y, id, pointerType) {
  return {
    pointerId: id || 1,
    clientX: x,
    clientY: y,
    pointerType: pointerType || 'touch',
    button: 0,
    target: { closest() { return null; } }
  };
}

function close(actual, expected, message, tolerance) {
  const eps = tolerance == null ? 1e-9 : tolerance;
  assert.ok(Math.abs(actual - expected) <= eps, message + ' (expected ' + expected + ', got ' + actual + ')');
}

/* ---------------- フレーム集約 ---------------- */

test('[gesture] 連続パンは最新状態だけを保持し、1フレーム1回だけ transform を更新する', () => {
  const { api, state } = loadApp();
  api.render();
  const createdAfterRender = state.created;
  const rectReadsAfterRender = state.rectReads;
  const positionAfterRender = state.positionUpdates;
  assert.equal(state.transforms.length, 1, '初期描画は1回');

  api.onPointerDown(pointerEvent(200, 150));
  for (let i = 1; i <= 6; i += 1) api.onPointerMove(pointerEvent(200 + i * 10, 150 + i * 5));
  assert.equal(api.pendingFrames(), 1, 'rAF は1本だけ');
  assert.equal(state.transforms.length, 1, 'フレーム前は表示を動かさない');

  api.flush();
  assert.equal(state.transforms.length, 2, '1フレームで1回だけ');
  const v = api.view();
  close(v.x, 20 + 60, '最後の移動が反映される');
  close(v.y, 30 + 30, '最後の移動が反映される');
  assert.equal(state.created, createdAfterRender, 'ジェスチャー中は補助ラベルを作り直さない');
  assert.equal(state.rectReads, rectReadsAfterRender, 'ジェスチャー中は実寸を測らない');
  assert.equal(state.positionUpdates, positionAfterRender, '現在位置の再計算は最終フレームへ回す');
});

test('[gesture] パン中も補助ラベルは同じ world 位置へ追従し、最終フレームで1回だけ作り直す', () => {
  const { api, state, overlay } = loadApp();
  api.render();
  const labels = overlay.toArray();
  assert.equal(labels.length, 2, '補助ラベルが2つ出ている');
  const before = labels.map((node) => ({ left: node.style.left, x: node.__rpAnchor.x }));
  const createdAfterRender = state.created;
  const positionBeforeEnd = state.positionUpdates;
  const overlayReadsBeforeEnd = state.overlayReads;

  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(260, 190));
  api.flush();
  const moved = overlay.toArray();
  assert.equal(moved.length, 2, '同じ要素を使い続ける（作り直さない）');
  assert.equal(moved[0], labels[0], '同一ノードを再利用する');
  moved.forEach((node, i) => {
    const expected = before[i].x * api.view().scale + api.view().x;
    close(parseFloat(node.style.left), expected, 'world x へ追従');
  });
  assert.ok(parseFloat(moved[0].style.left) > parseFloat(before[0].left), '右へ動く');
  assert.equal(state.created, createdAfterRender, '追従中は要素を作らない');
  assert.equal(state.overlayReads, overlayReadsBeforeEnd, '追従中は重なり判定をしない');

  api.endPointer(pointerEvent(260, 190), true);
  assert.equal(state.positionUpdates, positionBeforeEnd + 1, '終了時に現在位置を1回だけ更新する');
  assert.equal(state.transforms.length, 2, '終了時は最後のフレームの transform を書き直さない');
  assert.ok(state.created > createdAfterRender, '終了時に補助ラベルを1回だけ作り直す');
  assert.ok(state.overlayReads > overlayReadsBeforeEnd, '終了時に重なり判定を1回だけ行う');
});

test('[gesture] 終了が rAF より先でも、最後の移動位置で確定する', () => {
  const { api, state } = loadApp({ start: { scale: 1, x: 10, y: 10 } });
  api.render();
  api.onPointerDown(pointerEvent(100, 100));
  api.onPointerMove(pointerEvent(140, 120));
  api.onPointerMove(pointerEvent(170, 160));
  assert.equal(api.pendingFrames(), 1);
  api.endPointer(pointerEvent(170, 160), true);
  assert.equal(api.pendingFrames(), 0, '予約フレームは残さない');
  const v = api.view();
  close(v.x, 10 + 70, '最後の pointermove の位置');
  close(v.y, 10 + 60, '最後の pointermove の位置');
  assert.equal(state.positionUpdates, 2, '初期描画 + 終了時の1回');
  assert.equal(state.transforms.length, 2, '予約位置の確定と通常描画で transform は1回だけ');
});

test('[gesture] cancel / capture 喪失でも同じ終点で確定し、詳細は開かない', () => {
  const { api, state } = loadApp({ start: { scale: 1, x: 10, y: 10 } });
  api.render();
  api.onPointerDown(pointerEvent(100, 100));
  api.onPointerMove(pointerEvent(160, 130));
  api.endPointer(pointerEvent(160, 130), false);
  close(api.view().x, 70, 'cancel でも最後の移動まで反映');
  assert.equal(state.opened.length, 0, 'cancel では詳細を開かない');
  assert.equal(state.panning, 0, '押下状態を残さない');
});

test('[gesture] ジェスチャー外の操作は予約フレームを破棄し、古い座標で上書きしない', () => {
  const { api, state } = loadApp();
  api.render();
  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(400, 300));
  api.setView({ scale: 1, x: 5, y: 6 }, true);
  assert.equal(api.pendingFrames(), 0, '予約を捨てる');
  api.flush();
  close(api.view().x, 5, 'キー・ボタン等の表示を保つ');
  close(api.view().y, 6, 'キー・ボタン等の表示を保つ');
  assert.equal(state.positionUpdates, 2, '通常の描画はそのまま現在位置も更新する');
});

/* ---------------- ピンチ ---------------- */

test('[gesture] ピンチは中点を軸にし、移動後も同じ world 点が新しい中点の下に残る', () => {
  const { api, state } = loadApp();
  api.render();
  const origin = { scale: 1.2, x: 20, y: 30 };
  api.onPointerDown(pointerEvent(300, 200, 1));
  api.onPointerDown(pointerEvent(500, 200, 2));
  const anchor = Core.screenToWorld(origin, 400, 200);
  api.onPointerMove(pointerEvent(280, 200, 1));
  api.onPointerMove(pointerEvent(540, 200, 2));
  assert.equal(api.pendingFrames(), 1, '2本指でも rAF は1本');
  assert.equal(state.transforms.length, 1, 'フレーム前は動かさない');
  api.flush();
  assert.equal(state.transforms.length, 2);
  close(api.view().scale, 1.56, '距離比 260/200 で拡大');
  const screen = Core.worldToScreen(api.view(), anchor.x, anchor.y);
  close(screen.x, 410, '中点の下に同じ点が残る', 1e-6);
  close(screen.y, 200, '中点の下に同じ点が残る', 1e-6);
});

test('[gesture] ピンチ→1本指のパンは、確定済みの view から基準を取り直して飛ばない', () => {
  const { api, state } = loadApp();
  api.render();
  api.onPointerDown(pointerEvent(300, 200, 1));
  api.onPointerDown(pointerEvent(500, 200, 2));
  api.onPointerMove(pointerEvent(280, 200, 1));
  api.onPointerMove(pointerEvent(540, 200, 2));
  api.flush();
  const afterPinch = { x: api.view().x, y: api.view().y, scale: api.view().scale };
  api.endPointer(pointerEvent(540, 200, 2), true);
  assert.equal(api.pendingFrames(), 0);
  close(api.view().x, afterPinch.x, '離しただけでは動かない');
  api.onPointerMove(pointerEvent(300, 220, 1));
  api.flush();
  close(api.view().x, afterPinch.x + 20, '残った指の移動だけが効く');
  close(api.view().y, afterPinch.y + 20, '残った指の移動だけが効く');
  assert.equal(state.opened.length, 0, 'ピンチ操作でカードを開かない');
});

test('[gesture] ピンチ中も補助ラベルは同じ反応の近くに留まり、作り直さない', () => {
  const { api, state, overlay } = loadApp({ start: { scale: 1.2, x: 20, y: 30 } });
  api.render();
  const labels = overlay.toArray();
  const createdAfterRender = state.created;
  api.onPointerDown(pointerEvent(300, 200, 1));
  api.onPointerDown(pointerEvent(500, 200, 2));
  api.onPointerMove(pointerEvent(280, 200, 1));
  api.onPointerMove(pointerEvent(540, 200, 2));
  api.flush();
  const moved = overlay.toArray();
  assert.equal(moved.length, labels.length, '作り直さない');
  assert.equal(moved[0], labels[0], '同一ノードを再利用する');
  const v = api.view();
  const expectedX = 100 * v.scale + v.x;
  const expectedY = 50 * v.scale + v.y - 30;
  close(parseFloat(moved[0].style.left), expectedX, 'world の反応位置へ追従', 1e-6);
  close(parseFloat(moved[0].style.top), expectedY, '画面オフセットを保つ', 1e-6);
  assert.equal(state.created, createdAfterRender, '要素を増やさない');
});

test('[gesture] ジェスチャー中の新しい表示は基準を取り直し、次の move で打ち消さない', () => {
  const { api, state } = loadApp();
  api.render();
  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(240, 150));
  // キー・ボタンなどの新しい表示（指は押されたまま）。
  api.setView({ scale: 1.2, x: 100, y: 50 }, true);
  api.onPointerMove(pointerEvent(250, 150));
  api.flush();
  close(api.view().x, 110, '新しい表示からの差分だけ動く');
  close(api.view().y, 50, '新しい表示を打ち消さない');
  assert.equal(state.positionUpdates, 2, '新しい表示とジェスチャー終了で各1回');
});

test('[gesture] 3本→2本に減っても、残った指でピンチ基準を取り直して飛ばない', () => {
  const { api } = loadApp();
  api.render();
  api.onPointerDown(pointerEvent(300, 200, 1));
  api.onPointerDown(pointerEvent(500, 200, 2));
  api.onPointerDown(pointerEvent(700, 200, 3));
  const scaleBefore = api.view().scale;
  // ピンチ基準に使っていた2本目を離す。残りは 1 と 3。
  api.endPointer(pointerEvent(500, 200, 2), true);
  api.onPointerMove(pointerEvent(290, 200, 1));
  api.onPointerMove(pointerEvent(690, 200, 3));
  api.flush();
  close(api.view().scale, scaleBefore, '距離が同じなら倍率は変わらない');
  close(api.view().x, 20 - 10, '中点の移動分だけ動く');
});

test('[gesture] 障害物がある配置でも、追従中は同じ画面オフセットを保つ（実寸は測らない）', () => {
  const box = {
    getBoundingClientRect() { return { left: 100, top: 40, width: 200, height: 40, right: 300, bottom: 80 }; }
  };
  const fixtures2 = fixtures();
  fixtures2.compounds = [{ id: 'c1', x: 100, y: 50, w: 100, h: 40 }];
  fixtures2.nodeIndex = {
    c1: { querySelector(sel) { return sel === '.rp-node__box' ? box : null; } }
  };
  const { api, state, overlay } = loadApp({ fixtures: fixtures2 });
  api.render();
  const node = overlay.toArray()[0];
  assert.ok(node, '補助ラベルが置かれる');
  assert.equal(node.__rpAnchor.oy, 30, '障害物を避けた下側のオフセット');
  const topBefore = parseFloat(node.style.top);
  const rectReads = state.rectReads;
  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(240, 170));
  api.flush();
  close(parseFloat(node.style.top), topBefore + 20, '同じオフセットのまま追従する');
  assert.equal(state.rectReads, rectReads, '追従中は実寸を測らない');
  assert.equal(state.overlayReads, 1, '追従中は重なり判定をしない');
});

/* ---------------- LOD ---------------- */

test('[gesture] LOD をまたいでも補助ラベルは作り直さず、既存タグを追従させて終了時に1回だけ再構築する', () => {
  const { api, state, overlay } = loadApp();
  api.render();
  const labels = overlay.toArray();
  assert.equal(labels.length, 2, 'level 2 の補助ラベル');
  const created = state.created;
  const overlayReads = state.overlayReads;
  const inset = state.insetUpdates;

  // 1.2 -> 0.18（LOD 2 -> 0）を1フレームでまたぐ。
  api.onPointerDown(pointerEvent(200, 200, 1));
  api.onPointerDown(pointerEvent(600, 200, 2));
  api.onPointerMove(pointerEvent(370, 200, 1));
  api.onPointerMove(pointerEvent(430, 200, 2));
  api.flush();
  assert.ok(api.view().scale < 0.5, '低倍率まで縮小している');
  assert.equal(overlay.toArray().length, 2, 'ジェスチャー中は古いタグを残す（消さない・作り直さない）');
  assert.equal(overlay.toArray()[0], labels[0], '同じタグを追従させる');
  assert.equal(state.created, created, 'LOD をまたいでも要素を作らない');
  assert.equal(state.overlayReads, overlayReads, 'LOD をまたいでも重なり判定をしない');
  assert.equal(state.insetUpdates, inset, '右下の実寸測定も終了まで遅らせる');
  const v = api.view();
  close(parseFloat(labels[0].style.left), 100 * v.scale + v.x, '新しい倍率でも同じ world 位置');

  // 終了時に1回だけ再構築し、レベル0のタグ（無し）へ置き換える。
  api.endPointer(pointerEvent(370, 200, 1), true);
  assert.equal(overlay.toArray().length, 2, '指が残る間は作り直さない');
  api.endPointer(pointerEvent(430, 200, 2), true);
  assert.equal(overlay.toArray().length, 0, '終了時にレベル0の内容へ1回だけ置き換える');
  assert.equal(state.insetUpdates, inset + 1, '実寸は終了時に1回だけ測る');
});

test('[gesture] 終了時にまたぐ LOD も、再構築は最後の1回だけ（rAF 前の予約でも）', () => {
  // ピンチの中点（画面 400,200 / scale 0.4 では world 1000,500）の周りに置く。
  const fixtures3 = fixtures();
  fixtures3.reactions = [
    { id: 'z1', tier: 'secondary', label: null, typeLabel: '酸化', x: 875, y: 500 },
    { id: 'z2', tier: 'secondary', label: null, typeLabel: '還元', x: 920, y: 540 }
  ];
  const { api, state, overlay } = loadApp({ start: { scale: 0.4, x: 0, y: 0 }, fixtures: fixtures3 });
  api.render();
  assert.equal(overlay.toArray().length, 0, '低倍率では補助ラベルなし');
  const created = state.created;
  const overlayReads = state.overlayReads;
  const position = state.positionUpdates;
  const inset = state.insetUpdates;

  // 0.4 -> 2.4（LOD 0 -> 2）を rAF 未実行のまま予約する。
  api.onPointerDown(pointerEvent(300, 200, 1));
  api.onPointerDown(pointerEvent(500, 200, 2));
  api.onPointerMove(pointerEvent(100, 200, 1));
  api.onPointerMove(pointerEvent(700, 200, 2));
  assert.equal(api.pendingFrames(), 1);
  assert.equal(overlay.toArray().length, 0, 'フレーム前は作り直さない');
  assert.equal(state.created, created);
  assert.equal(state.overlayReads, overlayReads);
  assert.equal(state.positionUpdates, position);
  assert.equal(state.insetUpdates, inset, 'フレーム前は実寸も測らない');

  // 1本目を離す: 予約位置を軽量フレームで確定するが、重なり判定はしない。
  api.endPointer(pointerEvent(100, 200, 1), true);
  assert.ok(api.view().scale > 1, 'LOD をまたぐ位置が確定している');
  assert.equal(overlay.toArray().length, 0, '指が残る間は補助ラベルを作らない');
  assert.equal(state.created, created);
  assert.equal(state.overlayReads, overlayReads);
  assert.equal(state.positionUpdates, position);

  // 残った指を動かして予約し、最後の終了で1回だけ通常描画する。
  api.onPointerMove(pointerEvent(710, 210, 2));
  const transformsBeforeEnd = state.transforms.length;
  api.endPointer(pointerEvent(710, 210, 2), true);
  assert.equal(overlay.toArray().length, 2, '終了時に1回だけ補助ラベルを作る');
  assert.equal(state.created, created + 2, '作るのは終了時の1回だけ');
  assert.ok(state.overlayReads > overlayReads, '重なり判定も終了時の1回だけ');
  assert.equal(state.positionUpdates, position + 1, '現在位置も終了時の1回だけ');
  assert.equal(state.insetUpdates, inset + 1, '実寸も終了時の1回だけ');
  assert.equal(state.transforms.length, transformsBeforeEnd + 1, '終了時は transform を1回だけ書く');
});

test('[gesture] 学術モードの座標でも同じ追従（モード非依存）', () => {
  const fixtures2 = fixtures();
  fixtures2.reactions = [
    { id: 'a1', tier: 'secondary', label: null, typeLabel: '付加', x: 700, y: 300 }
  ];
  const { api, state, overlay } = loadApp({ start: { scale: 1.2, x: 10, y: 10 }, fixtures: fixtures2 });
  api.render();
  assert.equal(overlay.toArray().length, 1);
  const created = state.created;
  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(240, 170));
  api.flush();
  const node = overlay.toArray()[0];
  const v = api.view();
  close(parseFloat(node.style.left), 700 * v.scale + v.x, '学術座標でも追従', 1e-6);
  assert.equal(state.created, created, '作り直さない');
});

/* ---------------- 静的な契約 ---------------- */

test('[static] pointermove は setView を直接呼ばず、終了系のイベントを取りこぼさない', () => {
  const app = read('app.js');
  const move = extractFunctionSource(app, 'onPointerMove');
  assert.match(move, /applyGestureView\(/, 'rAF 集約を経由する');
  assert.equal(/setView\(/.test(move), false, 'pointermove から直接 setView しない');
  const renderGesture = extractFunctionSource(app, 'renderGesture');
  assert.match(renderGesture, /trackOverlay\(\)/, '追従だけを行う');
  assert.equal(/updateOverlay/.test(renderGesture), false, 'ジェスチャー中は補助ラベルを作り直さない');
  assert.equal(/getBoundingClientRect/.test(renderGesture), false,
    'ジェスチャー中の実寸測定をしない');
  assert.equal(/updatePosition/.test(renderGesture), false,
    '現在位置は最終フレームへ回す');
  assert.match(renderGesture, /applyDetailLevel\(Core\.detailLevel\(view\.scale\), true\)/,
    'LOD はメイン SVG だけ切り替え、右下の実寸は遅らせる');
  assert.ok(app.includes("mapEl.addEventListener('lostpointercapture', onLostPointerCapture)"),
    'capture 喪失を取りこぼさない');
  assert.ok(app.includes("mapEl.addEventListener('pointercancel', onPointerCancel)"));
  const end = extractFunctionSource(app, 'endPointer');
  assert.match(end, /commitPendingGesture\(\)/, '最終終了は位置の確定だけを行う');
  assert.match(end, /render\(\{ skipTransform: !committed \}\)/, '描画は最後に1回だけ');
  assert.match(end, /gestureDirty/, '動いたときだけ最終描画する');
  const setView = extractFunctionSource(app, 'setView');
  assert.match(setView, /rebaseGestureOrigins\(\)/, '指が残る間は基準を取り直す');
});

test('[static] ホイールの rAF 追従は変えず、ジェスチャーと競合しない', () => {
  const app = read('app.js');
  const wheel = extractFunctionSource(app, 'wheelStep');
  assert.match(wheel, /requestAnimationFrame\(wheelStep\)/);
  assert.equal(/gesture/i.test(wheel), false, 'ホイールは従来どおり独立して追従する');
  const setView = extractFunctionSource(app, 'setView');
  assert.match(setView, /if \(!gestureApplying\) \{\s*cancelGestureFrame\(\);/, '新しい操作が古い予約を捨てる');
  assert.match(setView, /rebaseGestureOrigins\(\)/, '指が残る間は基準を取り直す');
  assert.match(setView, /if \(!wheelApplying\) cancelWheelZoom\(\);/, 'ホイール目標の破棄は維持');
});
