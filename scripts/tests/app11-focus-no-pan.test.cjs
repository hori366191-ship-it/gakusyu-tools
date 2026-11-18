/**
 * 有機反応マップ（site/app11）の「タップ・カード操作で表示が動かない」回帰テスト
 *
 * 実行: node --test scripts/tests/app11-focus-no-pan.test.cjs
 *
 * 対象（app.js の実関数を抽出して fake DOM で実行する）:
 * - 反応の線・一般図の変換/ノードをポインタで触ったとき、onFocusIn が画面外へ再センタリングしない
 * - カードの差し替え（別の反応の線をタップ）で、古い起点（画面外の印）へ focus を戻さない
 * - カードを閉じる（×ボタン / Escape / ダイアログ）とき、起点が画面外でも表示を動かさない
 * - 何も無い場所を押して閉じたときは従来どおり起点へ focus を戻す（表示は動かさない）
 * - キーボード（Tab）での画面外追随は従来どおり行う（ポインタ由来の抑制を持ち越さない）
 * - 検索・一覧の gotoEntity（明示的な移動）は従来どおり animateTo する
 * - 4px 未満の指のぶれではパンしない／しきい値を超えたドラッグとピンチは従来どおり動く
 *
 * 注: app.js の document ハンドラは既存テストがソース形を参照しているものがあるため、
 * 一部は init 内の名前付き関数（4スペース字下げ）として定義されている。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const Core = require(path.join(APP, 'map-core.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

// init() の中にある名前付き関数（4スペース字下げ、本体の終端も4スペース）。
function extractNestedFunctionSource(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  assert.ok(start > 0, name + ' の関数定義（init 内）');
  const end = source.indexOf('\n    }', start);
  assert.ok(end > start, name + ' の終端');
  return source.slice(start + 4, end + 6);
}

const FUNCTIONS = [
  'pointerList',
  'onPointerDown', 'onPointerMove', 'endPointer',
  'onFocusIn', 'focusWithoutRecentering',
  'openFromElement', 'openCard', 'closeCard',
  'closeEquationDialog',
  'gotoEntity'
];

const NESTED_FUNCTIONS = [
  'prepareCardFocusRestore',
  'onDocumentPointerUpRestoreFocus',
  'onDocumentKeydown'
];

/* ---------------- fake DOM ---------------- */

function fakeEntity(state, kind, id) {
  const node = {
    __kind: kind,
    __id: id,
    __isMap: true,
    attrs: { 'data-kind': kind, 'data-id': id },
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
    closest(selector) {
      if (selector === '[data-kind]') return this.attrs['data-kind'] ? node : null;
      return null;
    },
    contains(other) { return other === node; },
    focus(options) {
      state.focusCalls.push({ el: node, options: options });
      state.document.activeElement = node;
      // ブラウザと同じ順序: focus() の中で focusin が同期的に発火する。
      if (node.__isMap && state.focusinHandler) state.focusinHandler({ target: node });
    }
  };
  return node;
}

function fakeFocusable(state, label) {
  const node = {
    __kind: null,
    __id: null,
    __isMap: false,
    textContent: '',
    attrs: {},
    label: label,
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
    closest() { return null; },
    contains() { return false; },
    focus(options) {
      state.focusCalls.push({ el: node, options: options });
      state.document.activeElement = node;
    }
  };
  return node;
}

function makeEnv(options) {
  options = options || {};
  const state = {
    recenters: 0,
    animations: [],
    applied: [],
    selectedNodes: [],
    openedCards: [],
    renders: 0,
    focusCalls: [],
    preventDefaults: 0,
    scrollIntoView: 0,
    pick: null,
    view: { scale: 1, x: 0, y: 0 },
    document: {
      activeElement: null,
      contains(node) { return !!node && node.__connected !== false; }
    },
    animateTo(target) {
      state.recenters += 1;
      state.animations.push(target);
    }
  };

  const cardHeading = fakeFocusable(state, 'card-heading');
  const card = {
    hidden: options.cardOpen !== true,
    contains(node) { return !!(node && node.__inCard); }
  };
  const cardDetail = {
    innerHTML: '',
    querySelector(selector) { return selector === 'h2' ? cardHeading : null; }
  };
  const cardEyebrow = { textContent: '' };
  const mapEl = {
    classList: { add() {}, remove() {} },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; },
    scrollIntoView() { state.scrollIntoView += 1; }
  };
  const eqDialogEl = { open: false, close() { eqDialogEl.open = false; } };
  const aboutEl = { open: false };
  const positionPopover = { hidden: true };

  function cardBuilder(kind) {
    return function (id) {
      state.openedCards.push([kind, id]);
      return '<h2>card</h2>';
    };
  }

  function assignView(next) {
    const current = state.view;
    current.scale = next.scale;
    current.x = next.x;
    current.y = next.y;
  }

  const app = read('app.js');
  const src = FUNCTIONS.map((name) => extractFunctionSource(app, name))
    .concat(NESTED_FUNCTIONS.map((name) => extractNestedFunctionSource(app, name)))
    .join('\n');
  const factory = new Function(
    'Core', 'document', 'mapEl', 'viewSize', 'viewState',
    'classNodeById', 'classEdgeById', 'compoundAt', 'findReaction',
    'nodeW', 'nodeH', 'displayIdFor', 'entityTarget', 'prefersReduce',
    'animateTo', 'selectNode', 'clearRegionSelection', 'applyGestureView', 'mapPoint',
    'cancelWheelZoom', 'flushGestureNow', 'commitPendingGesture', 'cancelGestureFrame', 'render',
    'pickDownEntity', 'PHYSICAL_CONTROL_SELECTOR', 'errMsg',
    'clearEquationDialogBody', 'closePositionPopover', 'restoreReactionStroke',
    'compoundCard', 'classCard', 'classEdgeCard', 'reactionCard',
    'card', 'cardEyebrow', 'cardDetail',
    'eqDialogEl', 'aboutEl', 'positionPopover',
    [
      'var view = viewState;',
      'var activeRegion = null;',
      'var programmaticFocusTarget = null;',
      'var pointerFocusGuard = false;',
      'var restoreAfterPointer = null;',
      'var suppressCompatFocus = false;',
      'var pointers = {};',
      'var panOrigin = null, pinchOrigin = null, downEntity = null;',
      'var suppressClick = false;',
      'var gestureDirty = false;',
      'var previewReaction = null;',
      'var returnFocus = null;',
      'var eqDialogOpener = null;',
      src,
      'return {',
      '  onPointerDown: onPointerDown,',
      '  onPointerUp: function (e) { endPointer(e, true); },',
      '  onPointerCancel: function (e) { endPointer(e, false); },',
      '  onPointerMove: onPointerMove,',
      '  onFocusIn: onFocusIn,',
      '  openCard: openCard,',
      '  closeCard: closeCard,',
      '  closeEquationDialog: closeEquationDialog,',
      '  prepareCardFocusRestore: prepareCardFocusRestore,',
      '  onDocumentPointerUpRestoreFocus: onDocumentPointerUpRestoreFocus,',
      '  onDocumentKeydown: onDocumentKeydown,',
      '  gotoEntity: gotoEntity,',
      '  setReturnFocus: function (el) { returnFocus = el; },',
      '  returnFocus: function () { return returnFocus; },',
      '  view: function () { return view; },',
      '  suppressClick: function () { return suppressClick; },',
      '  pointerFocusGuard: function () { return pointerFocusGuard; },',
      '  programmaticFocusTarget: function () { return programmaticFocusTarget; },',
      '  setCardOpen: function (open) { card.hidden = !open; },',
      '  cardHidden: function () { return card.hidden; },',
      '  restorePending: function () { return restoreAfterPointer; },',
      '  setDialog: function (open, opener) { eqDialogEl.open = open; eqDialogOpener = opener || null; },',
      '  eqDialogOpener: function () { return eqDialogOpener; }',
      '};'
    ].join('\n')
  );

  const api = factory(
    Core,                                   // Core
    state.document,                         // document
    mapEl,                                  // mapEl
    { w: 1000, h: 700 },                    // viewSize
    state.view,                             // viewState
    options.classNodeById || {},            // classNodeById
    options.classEdgeById || {},            // classEdgeById
    options.compoundAt || (() => null),     // compoundAt
    options.findReaction || (() => null),   // findReaction
    (c) => c.w || 40,                       // nodeW
    (c) => c.h || 40,                       // nodeH
    (id) => id,                             // displayIdFor
    (t, s, scale) => ({ scale: scale, x: -t.x + 500, y: -t.y + 350 }), // entityTarget
    () => false,                            // prefersReduce
    state.animateTo,                        // animateTo
    function (kind, id) { state.selectedNodes.push([kind, id]); },     // selectNode
    function () {},                         // clearRegionSelection
    function (next) { state.applied.push(next); assignView(next); },   // applyGestureView
    (e) => ({ x: e.clientX, y: e.clientY }),// mapPoint
    function () {},                         // cancelWheelZoom
    function () {},                         // flushGestureNow
    function () { return false; },          // commitPendingGesture
    function () {},                         // cancelGestureFrame
    function () { state.renders += 1; },    // render
    function () { return state.pick; },     // pickDownEntity
    '.rp-position,button',                  // PHYSICAL_CONTROL_SELECTOR
    function () {},                         // errMsg
    function () {},                         // clearEquationDialogBody
    function () {},                         // closePositionPopover
    function () {},                         // restoreReactionStroke
    cardBuilder('compound'),                // compoundCard
    cardBuilder('class'),                   // classCard
    cardBuilder('class-edge'),              // classEdgeCard
    cardBuilder('reaction'),                // reactionCard
    card,                                   // card
    cardEyebrow,                            // cardEyebrow
    cardDetail,                             // cardDetail
    eqDialogEl,                             // eqDialogEl
    aboutEl,                                // aboutEl
    positionPopover                         // positionPopover
  );

  state.focusinHandler = api.onFocusIn;
  return { api, state, card, cardHeading };
}

function pointerEvent(x, y, pointerType) {
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    pointerType: pointerType || 'mouse',
    button: 0,
    target: { closest() { return null; } }
  };
}

function offscreenReaction(id) {
  // 表示位置から 1355px 以上離れた、画面外の反応の線。
  return { x: -5000, y: -4000, id: id };
}

function backgroundTarget() {
  return { closest() { return null; } };
}

/* ---------------- タップ（capture → bubble の実順序） ---------------- */

function tap(env, spec) {
  const { api, state, card } = env;
  const pointerType = spec.pointerType || 'mouse';
  const x = spec.x || 100;
  const y = spec.y || 100;
  // 1. document capture: pointerdown（カード外なら閉じるだけ。復帰は pointerup へ回す）
  if (!card.hidden) api.prepareCardFocusRestore();
  // 2. mapEl bubble: pointerdown（パン基準・対象決定・ポインタ由来 focus の抑制を立てる）
  api.onPointerDown(pointerEvent(x, y, pointerType));
  // 3. ブラウザ既定動作: 押した要素（の focus 可能な祖先）へ focus が付く
  if (spec.focused) spec.focused.focus({ preventScroll: false });
  // 4. document capture: pointerup（復帰が要るなら、ここで起点へ戻す）
  api.onDocumentPointerUpRestoreFocus({ target: spec.target, pointerId: 1, pointerType });
  // 5. mapEl bubble: pointerup（未移動ならカードを開く）
  api.onPointerUp(pointerEvent(x, y, pointerType));
}

function lastFocused(state) {
  const last = state.focusCalls[state.focusCalls.length - 1];
  return last && last.el;
}

/* ---------------- カードの差し替え ---------------- */

test('[focus] 別の線をタップしてカードを差し替えても、画面外の古い印へ戻らず表示は動かない', () => {
  const env = makeEnv({
    cardOpen: true,
    findReaction: (id) => (id === 'r-old' ? offscreenReaction('r-old') : { x: 10, y: 10, id: id })
  });
  const { api, state } = env;
  const oldEl = fakeEntity(state, 'reaction', 'r-old');
  const newEl = fakeEntity(state, 'reaction', 'r-new');
  api.setReturnFocus(oldEl);
  state.pick = newEl;
  const before = { x: api.view().x, y: api.view().y, scale: api.view().scale };

  tap(env, { target: newEl, focused: newEl, x: 200, y: 200 });

  assert.equal(state.recenters, 0, '再センタリングしない');
  assert.deepEqual({ x: api.view().x, y: api.view().y, scale: api.view().scale }, before, '表示位置が動かない');
  assert.deepEqual(state.selectedNodes, [['reaction', 'r-new']], '新しい反応を選ぶ');
  assert.deepEqual(state.openedCards, [['reaction', 'r-new']], '新しいカードを開く');
  assert.equal(lastFocused(state), env.cardHeading, '最後はカード見出しへ focus');
  assert.equal(state.focusCalls.some((call) => call.el === oldEl), false, '古い印へ focus を戻さない');
  assert.equal(api.returnFocus(), newEl, '起点は新しい実体');
  assert.equal(api.cardHidden(), false, 'カードは開いたまま');
});

test('[focus] 差し替えで focus されるのは新しい実体と新カード見出しだけ', () => {
  const env = makeEnv({
    cardOpen: true,
    findReaction: (id) => ({ x: 10, y: 10, id: id })
  });
  const { api, state } = env;
  const oldEl = fakeEntity(state, 'reaction', 'r-old');
  const newEl = fakeEntity(state, 'reaction', 'r-new');
  api.setReturnFocus(oldEl);
  state.pick = newEl;

  tap(env, { target: newEl, focused: newEl });

  assert.equal(state.recenters, 0);
  assert.deepEqual(state.focusCalls.map((call) => call.el), [newEl, env.cardHeading]);
});

/* ---------------- 直接タップ（初回フォーカス） ---------------- */

test('[focus] 一般図の変換を直接タップしても、キーボード追従用の再センタリングを起こさない', () => {
  const env = makeEnv({
    classEdgeById: { e1: { labelPos: { x: 1355, y: 900 } } }
  });
  const { api, state } = env;
  const edge = fakeEntity(state, 'class-edge', 'e1');
  state.pick = edge;

  tap(env, { target: edge, focused: edge, pointerType: 'touch', x: 60, y: 60 });

  assert.equal(state.recenters, 0, 'タップした場所をそのまま見せる');
  assert.equal(state.selectedNodes.length, 1, '選択は行う');
  assert.equal(api.view().x, 0, '表示位置は変わらない');
  assert.equal(api.view().y, 0);
});

test('[focus] 反応の線を直接タップしても（初回・カード無し）再センタリングしない', () => {
  const env = makeEnv({ findReaction: () => offscreenReaction('r1') });
  const { api, state } = env;
  const line = fakeEntity(state, 'reaction', 'r1');
  state.pick = line;

  tap(env, { target: line, focused: line, pointerType: 'mouse' });

  assert.equal(state.recenters, 0);
  assert.equal(api.view().x, 0);
  assert.deepEqual(state.openedCards, [['reaction', 'r1']]);
});

/* ---------------- 閉じる（× / Escape / ダイアログ） ---------------- */

test('[focus] ×ボタンで閉じても、画面外の起点へ戻すだけで表示は動かない', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const marker = fakeEntity(state, 'reaction', 'r1');
  api.setReturnFocus(marker);

  api.closeCard(true);

  assert.equal(state.recenters, 0);
  assert.equal(api.view().x, 0);
  const call = state.focusCalls[0];
  assert.equal(call && call.el, marker, '起点へ focus を戻す');
  assert.equal(call.options && call.options.preventScroll, true, 'スクロールさせない');
  assert.equal(api.cardHidden(), true);
});

test('[focus] Escape で閉じても、画面外の起点へ戻すだけで表示は動かない', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const marker = fakeEntity(state, 'reaction', 'r1');
  api.setReturnFocus(marker);

  api.onDocumentKeydown({ key: 'Escape', preventDefault() { state.preventDefaults += 1; } });

  assert.equal(state.preventDefaults, 1, 'カードを閉じる');
  assert.equal(api.cardHidden(), true);
  assert.equal(state.recenters, 0);
  assert.equal(state.focusCalls[0].el, marker);
  assert.equal(state.focusCalls[0].options.preventScroll, true);
});

test('[focus] ダイアログを閉じたときの focus 復帰も表示を動かさない', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const opener = fakeFocusable(state, 'eq-opener');
  api.setDialog(true, opener);

  api.closeEquationDialog(true);

  assert.equal(api.eqDialogOpener(), null);
  assert.equal(state.recenters, 0);
  assert.equal(state.focusCalls[0].el, opener);
});

test('[focus] 何も無い場所を押して閉じたときは、従来どおり起点へ focus を戻す（表示は動かさない）', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const marker = fakeEntity(state, 'class-edge', 'e1');
  api.setReturnFocus(marker);

  tap(env, { target: backgroundTarget(), focused: null });

  assert.equal(api.cardHidden(), true, 'カードは閉じる');
  assert.equal(state.recenters, 0);
  assert.equal(state.focusCalls.length, 1);
  assert.equal(state.focusCalls[0].el, marker, '起点へ戻す');
  assert.equal(state.focusCalls[0].options.preventScroll, true, 'スクロールさせない');
});

/* ---------------- キーボードの追随は残す ---------------- */

test('[focus] ポインタ操作の後に Tab で画面外の実体へ移ると、従来どおり再センタリングする', () => {
  const env = makeEnv({ classEdgeById: { e9: { labelPos: { x: 1400, y: 900 } } } });
  const { api, state } = env;
  const tapped = fakeEntity(state, 'reaction', 'r1');
  state.pick = tapped;
  // 背景タップ（focus は付かない）→ 抑制フラグが残り得る状況を作る
  tap(env, { target: backgroundTarget(), focused: null });
  assert.equal(state.recenters, 0);

  // Tab の keydown で抑制を解除してから、別の実体へ focus が移る（キーボード）
  api.onDocumentKeydown({ key: 'Tab', preventDefault() {} });
  assert.equal(api.pointerFocusGuard(), false, 'keydown で抑制を持ち越さない');
  const next = fakeEntity(state, 'class-edge', 'e9');
  api.onFocusIn({ target: next });

  assert.equal(state.recenters, 1, '画面外なので中央へ寄せる');
  assert.equal(state.animations.length, 1);
});

test('[focus] 抑制フラグは focusin で消費され、次のキーボード focus を飲み込まない', () => {
  const env = makeEnv({
    classEdgeById: {
      e1: { labelPos: { x: 1355, y: 900 } },
      e2: { labelPos: { x: 1500, y: 1200 } }
    }
  });
  const { api, state } = env;
  const first = fakeEntity(state, 'class-edge', 'e1');
  state.pick = first;
  tap(env, { target: first, focused: first, pointerType: 'touch' });
  assert.equal(state.recenters, 0, 'タップでは寄せない');

  api.onFocusIn({ target: fakeEntity(state, 'class-edge', 'e2') });
  assert.equal(state.recenters, 1, '2回目の focus はタップ由来ではないので追随する');
});

test('[focus] タッチは pointerup の後の互換 focus でも再センタリングしない', () => {
  const env = makeEnv({ findReaction: () => offscreenReaction('r1') });
  const { api, state } = env;
  const line = fakeEntity(state, 'reaction', 'r1');
  state.pick = line;

  // タッチは「pointerdown → pointerup（クリック確定）→ 互換 mousedown の focus」の順。
  api.onPointerDown(pointerEvent(100, 100, 'touch'));
  api.onDocumentPointerUpRestoreFocus({ target: line, pointerId: 1, pointerType: 'touch' });
  api.onPointerUp(pointerEvent(100, 100, 'touch'));
  assert.equal(api.pointerFocusGuard(), true, 'タッチは互換 focus まで抑制を残す');

  line.focus({ preventScroll: false }); // 互換 mousedown/click 相当
  assert.equal(state.recenters, 0, '互換 focus でも中央へ寄せない');
  assert.equal(api.pointerFocusGuard(), false, 'focusin で消費する');
  assert.deepEqual(state.openedCards, [['reaction', 'r1']]);
});

test('[focus] pointercancel では復帰予約を残さない（次の操作で古い起点を掴まない）', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const marker = fakeEntity(state, 'reaction', 'r1');
  const other = fakeEntity(state, 'reaction', 'r2');
  api.setReturnFocus(marker);
  api.prepareCardFocusRestore();
  assert.equal(api.restorePending(), marker, '押した時点では復帰を予約する');

  api.onPointerDown(pointerEvent(100, 100));
  api.onPointerCancel(pointerEvent(100, 100));
  assert.equal(api.restorePending(), null, 'キャンセルで予約を捨てる');

  // 次の背景クリックの pointerup で、古い起点へ focus を奪わない
  api.onDocumentPointerUpRestoreFocus({ target: other, pointerId: 1, pointerType: 'mouse' });
  assert.equal(state.focusCalls.length, 0, '古い起点へ focus しない');
  assert.equal(state.recenters, 0);
});

test('[focus] 既に focus 済みの要素へは focus を強制せず、抑制フラグを残さない', () => {
  const env = makeEnv({ cardOpen: true });
  const { api, state } = env;
  const marker = fakeEntity(state, 'reaction', 'r1');
  marker.focus({ preventScroll: true });
  state.focusCalls.length = 0;
  api.setReturnFocus(marker);

  api.closeCard(true);

  assert.equal(state.recenters, 0, '再センタリングしない');
  assert.equal(api.programmaticFocusTarget(), null, 'focusin が来ない経路でフラグを残さない');
});

/* ---------------- 明示的な移動（検索・一覧） ---------------- */

test('[focus] gotoEntity（検索・一覧）は従来どおり animateTo で移動する', () => {
  const env = makeEnv({
    cardOpen: false,
    compoundAt: (id) => (id === 'c1' ? { x: 4000, y: 3000, w: 100, h: 40 } : null)
  });
  const { api, state } = env;
  const trigger = fakeFocusable(state, 'list-item');

  api.gotoEntity('compound', 'c1', trigger);

  assert.equal(state.recenters, 1, '明示的な移動は animateTo する');
  assert.equal(state.scrollIntoView, 1, 'scrollIntoView も従来どおり');
  assert.deepEqual(state.openedCards, [['compound', 'c1']]);
});

/* ---------------- パンのしきい値 ---------------- */

test('[gesture] 4px 未満のぶれではパンせず、しきい値超えのドラッグは従来どおり動く', () => {
  const env = makeEnv({});
  const { api, state } = env;

  api.onPointerDown(pointerEvent(200, 150));
  api.onPointerMove(pointerEvent(202, 151));
  assert.equal(state.applied.length, 0, '4px 未満は表示を動かさない');
  assert.equal(api.suppressClick(), false, 'タップ判定のまま');
  assert.equal(api.view().x, 0);

  api.onPointerMove(pointerEvent(220, 150));
  assert.equal(state.applied.length, 1, 'しきい値超えはパンする');
  assert.equal(api.view().x, 20);
  assert.equal(api.suppressClick(), true);
});

test('[gesture] ピンチは従来どおり倍率が変わる', () => {
  const env = makeEnv({});
  const { api, state } = env;

  api.onPointerDown(Object.assign(pointerEvent(200, 200), { pointerId: 1 }));
  api.onPointerDown(Object.assign(pointerEvent(400, 200), { pointerId: 2 }));
  api.onPointerMove(Object.assign(pointerEvent(500, 200), { pointerId: 2 }));

  assert.equal(state.applied.length, 1, 'ピンチは表示を更新する');
  assert.ok(state.applied[0].scale > 1, '距離が広がれば拡大する');
});

/* ---------------- 静的な契約 ---------------- */

test('[static] ポインタ由来の focus 抑制は、マウスの pointerup で解除し、タッチは互換 focus まで残す', () => {
  const app = read('app.js');
  const end = extractFunctionSource(app, 'endPointer');
  assert.match(end, /pointerFocusGuard = false/, 'マウスでは pointerup で解除する');
  assert.match(end, /e\.pointerType !== 'touch' && e\.pointerType !== 'pen'/, 'タッチ・ペンは残す');
  const down = extractFunctionSource(app, 'onPointerDown');
  assert.match(down, /pointerFocusGuard = true/, 'ポインタ操作で抑制を立てる');
  const focusIn = extractFunctionSource(app, 'onFocusIn');
  assert.match(focusIn, /var fromPointer = pointerFocusGuard;/, 'スコープした1回分の状態として読む');
  assert.match(focusIn, /pointerFocusGuard = false;/);
});

test('[static] pointerup の復帰は実体タップを除外し、再センタリングを抑えた focus を使う', () => {
  const app = read('app.js');
  assert.match(app, /addEventListener\('pointerup', onDocumentPointerUpRestoreFocus, true\)/);
  const up = extractNestedFunctionSource(app, 'onDocumentPointerUpRestoreFocus');
  assert.match(up, /if \(downEntity\) return;/, '新しいカードが開くタップでは古い起点へ戻さない');
  assert.match(up, /focusWithoutRecentering\(target\)/, '戻すときも表示を動かさない');
  assert.match(up, /if \(e\.pointerType === 'touch' \|\| e\.pointerType === 'pen'\) suppressCompatFocus = true;/);
  assert.match(app, /cardClose\.addEventListener\('click', function \(\) \{ closeCard\(true\); \}\)/,
    '×ボタンは従来どおり closeCard(true)');
  const key = extractNestedFunctionSource(app, 'onDocumentKeydown');
  assert.match(key, /pointerFocusGuard = false;/, 'キーボードでは抑制を持ち越さない');
});
