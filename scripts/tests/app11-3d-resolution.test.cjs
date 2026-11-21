/**
 * app11/3d 球ビュー — 「操作中だけ Canvas 内部解像度を落とす」本番実装の検証
 * 実行: node --test scripts/tests/app11-3d-resolution.test.cjs
 *
 * ブラウザ・外部API・サーバ不要。次を検証する:
 *   1. 純関数 effectiveDpr: 小さいスマホは常時と操作中で不変 / 大きい画面だけ低下 /
 *      3M ピクセル予算 / 1.25 上限 / 0.75 下限 / 復帰は正確なネイティブ上限
 *   2. ?res=cap / ?res=full と reduced-motion のモード決定（既定は reduced で無効）
 *   3. 本番モジュールの状態機械が実際の canvas.width/height と setTransform を
 *      一致させたまま低下させ、操作終了で「1 回だけ」フル解像度へ戻す
 *      （sphere-app の viewport/resizeCanvas/render を同じ契約で駆動する）
 *   4. ピンチ途中（片指を離した状態）は操作継続、pointercancel / abort で終了
 *   5. ホイールは収束待ちの単発タイマーで 1 回だけ復帰
 *   6. devicePixelRatio / Canvas アクセサを書き換えず、CSS 座標・常駐ループを持たない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROD = path.join(ROOT, 'site', 'app11', '3d');
const MODULE = path.join(PROD, 'sphere-resolution.js');
const APP = path.join(PROD, 'sphere-app.js');
const PAGE = path.join(PROD, 'index.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const res = require(MODULE);

// ---------------- 1. 純関数: 解像度ポリシー ----------------

test('小さいスマホ（390x844, native 3）は操作中も常時と同じ dpr=2（無影響）', () => {
  assert.equal(res.baselineDpr(3), 2);
  assert.equal(res.effectiveDpr(390, 844, 3, false), 2);
  assert.equal(res.effectiveDpr(390, 844, 3, true), 2);
  assert.equal(res.effectiveDpr(390, 844, 2, true), 2);
  assert.ok(res.pixelCount(390, 844, 2) < res.DEFAULTS.budgetPx);
});

test('大きいデスクトップ画面だけ操作中に dpr を下げ、停止後は正確なネイティブ上限へ戻る', () => {
  assert.equal(res.baselineDpr(2), 2);
  const operating = res.effectiveDpr(1280, 900, 2, true);
  assert.equal(operating, 1.25, '操作中の上限 1.25 になっていない');
  assert.ok(res.pixelCount(1280, 900, operating) <= res.DEFAULTS.budgetPx);
  assert.equal(res.effectiveDpr(1280, 900, 2, false), 2);
  // native 3 でも常時は上限 2（従来どおり）へ戻す。
  assert.equal(res.effectiveDpr(1280, 900, 3, false), 2);
});

test('ピクセル予算が上限より厳しい画面では予算側が効き、下限 0.75 を割らない', () => {
  const big = res.effectiveDpr(2560, 1440, 2, true);
  assert.ok(big < 1.25 && big >= 0.9, `2560x1440 の操作中 dpr が想定外: ${big}`);
  assert.ok(res.pixelCount(2560, 1440, big) <= res.DEFAULTS.budgetPx);
  const huge = res.effectiveDpr(3840, 2160, 2, true);
  assert.equal(huge, 0.75, '画質の下限 0.75 を割っている');
  assert.equal(res.effectiveDpr(1366, 768, 1, true), 1);
  assert.equal(res.effectiveDpr(1366, 768, 1, false), 1);
});

test('節約が小さいときは切り替えない（解像度の往復を避ける）', () => {
  assert.equal(res.effectiveDpr(1280, 900, 2, true, { minGain: 1 }), 2);
  const a = res.effectiveDpr(1920, 1080, 2, true);
  const b = res.effectiveDpr(1920, 1080, 2, true);
  assert.equal(a, b);
  assert.equal(a, res.quantize(a, res.DEFAULTS.quantizeStep));
});

// ---------------- 2. モード決定 ----------------

test('?res=cap / ?res=full と reduced-motion でモードが決まる（既定は reduced で無効）', () => {
  assert.equal(res.resolveMode('', false), 'cap');
  assert.equal(res.resolveMode('', true), 'full');
  assert.equal(res.resolveMode('?res=cap', true), 'cap');
  assert.equal(res.resolveMode('?res=full', false), 'full');
  assert.equal(res.resolveMode('?foo=1&res=off', false), 'full');
  assert.equal(res.resolveMode('?foo=1&res=on', true), 'cap');
  assert.equal(res.resolveMode('?res=unknown', true), 'full');
});

// ---------------- 3. 実寸の canvas / transform で駆動 ----------------

/**
 * site/app11/3d/sphere-app.js の viewport / resizeCanvas / render のうち
 * 解像度まわりだけを、同じ契約（dpr を 1 か所で決める）で駆動する。
 * dpr は本番モジュールの dprFor が返す値だけを使う。
 */
function createHarness(options) {
  const canvas = {
    clientWidth: options.cssWidth,
    clientHeight: options.cssHeight,
    width: 1,
    height: 1
  };
  const ctx = {
    transform: [1, 0, 0, 1, 0, 0],
    setTransform(a, b, c, d, e, f) { this.transform = [a, b, c, d, e, f]; }
  };
  let renders = 0;
  const controller = res.createController({
    mode: options.mode || 'cap',
    options: options.options,
    timers: options.timers,
    onIdle: function () { render(); }
  });
  function viewport() {
    const width = Math.max(1, canvas.clientWidth || 1);
    const height = Math.max(1, canvas.clientHeight || 1);
    return { width, height, dpr: controller.dprFor(width, height, options.nativeDpr) };
  }
  function resizeCanvas(vp) {
    canvas.width = Math.max(1, Math.round(vp.width * vp.dpr));
    canvas.height = Math.max(1, Math.round(vp.height * vp.dpr));
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  }
  function render() {
    renders += 1;
    const vp = viewport();
    if (canvas.width !== Math.round(vp.width * vp.dpr) ||
      canvas.height !== Math.round(vp.height * vp.dpr)) {
      resizeCanvas(vp);
    }
    return vp;
  }
  return { canvas, ctx, controller, render, get renders() { return renders; } };
}

test('バッキングと setTransform は一致したまま低下し、停止後は 1 回だけフル解像度へ戻る', () => {
  const h = createHarness({ cssWidth: 1280, cssHeight: 900, nativeDpr: 2 });
  h.render();
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.canvas.height, 1800);
  assert.equal(h.ctx.transform[0], 2);

  // ドラッグ開始だけでは描かない（無駄な resize なし）。
  h.controller.pointerDown(1);
  assert.equal(h.canvas.width, 2560, '操作開始だけで resize している');
  assert.equal(h.controller.isOperating(), true);

  h.render();
  assert.equal(h.canvas.width, 1600, '操作中のバッキングが 1.25 倍でない');
  assert.equal(h.canvas.height, 1125);
  assert.equal(h.ctx.transform[0], 1.25);
  assert.equal(h.canvas.width, Math.round(h.canvas.clientWidth * h.ctx.transform[0]));
  assert.equal(h.canvas.height, Math.round(h.canvas.clientHeight * h.ctx.transform[3]));

  const beforeUp = h.renders;
  h.controller.pointerUp(1);
  assert.equal(h.renders, beforeUp + 1, '復帰の再描画が 1 回でない');
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.canvas.height, 1800);
  assert.deepEqual(h.ctx.transform, [2, 0, 0, 2, 0, 0]);
  assert.equal(h.controller.isOperating(), false);
  // 追加の描画を要求しない。
  assert.equal(h.renders, beforeUp + 1);
});

test('低解像度で描いていない操作では復帰の再描画を要求しない（小さいスマホ）', () => {
  const h = createHarness({ cssWidth: 390, cssHeight: 844, nativeDpr: 3 });
  h.render();
  assert.equal(h.canvas.width, 780); // native 3 だが従来どおり上限 2
  const renders = h.renders;
  h.controller.pointerDown(7);
  h.render();
  assert.equal(h.canvas.width, 780, '小さい画面の解像度が落ちた');
  h.controller.pointerUp(7);
  assert.equal(h.renders, renders + 1, '不要な復帰再描画が走った');
  assert.equal(h.canvas.width, 780);
});

test('ピンチは指が残っている間ずっと操作中、最後の 1 本で復帰する', () => {
  const h = createHarness({ cssWidth: 1280, cssHeight: 900, nativeDpr: 2 });
  h.render();
  h.controller.pointerDown(1);
  h.controller.pointerDown(2);
  h.render();
  assert.equal(h.canvas.width, 1600);
  h.controller.pointerUp(1);
  assert.equal(h.controller.isOperating(), true, '片指を離しただけで終了している');
  h.render();
  assert.equal(h.canvas.width, 1600);
  h.controller.pointerUp(2);
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.controller.isOperating(), false);
});

test('pointercancel / abort（blur・非表示・離脱）でも低解像度を残さない', () => {
  for (const how of ['pointercancel', 'abort']) {
    const h = createHarness({ cssWidth: 1280, cssHeight: 900, nativeDpr: 2 });
    h.render();
    h.controller.pointerDown(3);
    h.render();
    assert.equal(h.canvas.width, 1600);
    if (how === 'pointercancel') h.controller.pointerCancel(3);
    else h.controller.abort();
    assert.equal(h.canvas.width, 2560, `${how} で復帰していない`);
    assert.equal(h.controller.isOperating(), false);
  }
});

test('ホイールは収束待ちの単発タイマーで 1 回だけ復帰する', () => {
  const pending = new Map();
  let nextId = 1;
  const timers = {
    setTimeout(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) { pending.delete(id); }
  };
  const h = createHarness({ cssWidth: 1280, cssHeight: 900, nativeDpr: 2, timers });
  h.render();
  h.controller.wheel();
  h.controller.wheel(); // 連続ホイールは前のタイマーを clear して 1 本に保つ
  assert.equal(pending.size, 1, 'ホイールのタイマーが 1 本でない');
  h.render();
  assert.equal(h.canvas.width, 1600);
  const renders = h.renders;
  for (const { fn } of pending.values()) fn();
  pending.clear();
  assert.equal(h.renders, renders + 1, 'ホイール後に復帰していない');
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.controller.isOperating(), false);
  assert.equal(pending.size, 0, 'タイマーが残っている');
});

test('?res=full（full モード）では操作中も解像度を変えず、復帰も要求しない', () => {
  const h = createHarness({ cssWidth: 1280, cssHeight: 900, nativeDpr: 2, mode: 'full' });
  h.render();
  h.controller.pointerDown(1);
  h.render();
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.ctx.transform[0], 2);
  const renders = h.renders;
  h.controller.pointerUp(1);
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.renders, renders, 'full モードで復帰の再描画を要求している');
  assert.equal(h.controller.dprFor(1280, 900, 3), 2);
});

// ---------------- 4. 実装の性質（本番ソース） ----------------

test('devicePixelRatio / Canvas アクセサを書き換えない（モンキーパッチなし）', () => {
  for (const file of [MODULE, APP]) {
    const src = read(file);
    assert.equal(/Object\.(?:defineProperty|defineProperties)\s*\(\s*(?:window|root|globalThis|scope)/.test(src),
      false, `${path.basename(file)} がグローバルを再定義している`);
    assert.equal(/defineProperty\([^)]*['"]devicePixelRatio['"]/.test(src), false,
      `${path.basename(file)} が devicePixelRatio を差し替えている`);
    assert.equal(/devicePixelRatio\s*=(?!=)/.test(src), false,
      `${path.basename(file)} が devicePixelRatio に代入している`);
    assert.equal(/getContext\s*=\s*function|\.getContext\s*=/.test(src), false,
      `${path.basename(file)} が Canvas の getContext を包んでいる`);
    assert.equal(/__rp|patchCanvas|patchDpr/.test(src), false,
      `${path.basename(file)} に実験用パッチの痕跡が残っている`);
  }
});

test('解像度は viewport の dpr 1 か所だけで決まり、CSS サイズ・座標系に触れない', () => {
  const app = read(APP);
  assert.match(app, /var dpr = resolution\s*\n?\s*\? resolution\.dprFor\(width, height, window\.devicePixelRatio \|\| 1\)/);
  assert.match(app, /: Math\.min\(2, window\.devicePixelRatio \|\| 1\)/);
  // CSS サイズの契約は不変。
  assert.match(app, /var width = Math\.max\(1, canvas\.clientWidth \|\| window\.innerWidth\);/);
  assert.match(app, /canvas\.width = Math\.max\(1, Math\.round\(vp\.width \* vp\.dpr\)\);/);
  assert.match(app, /ctx\.setTransform\(vp\.dpr, 0, 0, vp\.dpr, 0, 0\);/);
  // 復帰は既存の scheduler（requestRender → render → resizeCanvas）に任せる。
  assert.match(app, /onIdle: function \(\) \{ requestRender\(\); \}/);

  const src = read(MODULE);
  assert.equal(/requestAnimationFrame\s*\(/.test(src), false, 'rAF を使っている');
  assert.equal(/setInterval\s*\(/.test(src), false, 'setInterval を使っている');
  assert.equal(/canvas\.style|touch-action|preventDefault|clientX|clientY|getBoundingClientRect/.test(src),
    false, 'CSS 座標・入力座標に触れている');
  assert.match(src, /clearTimeout|clearTimer/);
});

test('reduced-motion の既定は full（＝従来どおり）で、?res=cap のときだけ有効化する', () => {
  const app = read(APP);
  assert.match(app, /RES\.resolveMode\(search, prefersReducedMotion\(\)\)/);
  assert.equal(res.resolveMode('', true), 'full');
  assert.equal(res.resolveMode('?res=cap', true), 'cap');
});

test('index.html は sphere-resolution.js を sphere-app.js より前に読む', () => {
  const html = read(PAGE);
  const a = html.indexOf('src="./sphere-resolution.js"');
  const b = html.indexOf('src="./sphere-app.js"');
  assert.ok(a >= 0, 'sphere-resolution.js を読み込んでいない');
  assert.ok(a < b, 'sphere-resolution.js が sphere-app.js より後');
});
