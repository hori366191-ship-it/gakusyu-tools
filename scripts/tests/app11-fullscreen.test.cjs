/**
 * 有機反応マップ（site/app11）— 全画面レイアウトと「このアプリについて」ダイアログの回帰テスト
 *
 * 実行: node --test scripts/tests/app11-fullscreen.test.cjs
 *
 * - 地図はヘッダー下の残り画面いっぱい。ページ下部に常設の説明・一覧・フッターを置かない。
 * - 常設していた内容は native の <dialog> へ移し、showModal/close/Escape/フォーカス復帰を使う。
 * - 浮遊ツールバーの実寸は fit の上余白としてだけ予約し、SVG の座標系は変えない。
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

/* ---------------- 静止画: レイアウト ---------------- */

test('[static] body は header + 地図の2段グリッドで、ページ自体をスクロールさせない', () => {
  const css = read('app.css');
  const body = ruleBody(css, 'body.rp-app');
  assert.match(body, /display:\s*grid/);
  assert.match(body, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/, 'ヘッダー以外の高さを地図に渡す');
  assert.match(body, /height:\s*100vh/, 'dvh 非対応環境の fallback');
  assert.match(body, /height:\s*100dvh/, 'dynamic viewport を優先');
  assert.match(body, /(^|;)\s*overflow:\s*hidden/, 'body 背景をスクロールさせない');
  assert.match(body, /env\(safe-area-inset-bottom\)/, 'safe-area を確保する');

  const wrap = ruleBody(css, '.rp-wrap');
  assert.match(wrap, /display:\s*flex/);
  assert.match(wrap, /min-height:\s*0/, 'flex/grid の子で潰れない');
  assert.equal(/max-width:\s*1280px/.test(wrap), false, '地図を中央の固定幅に閉じない');
  assert.match(wrap, /padding:\s*0/, 'ページ余白を置かない');

  const panel = ruleBody(css, '.rp-map-panel');
  assert.match(panel, /flex:\s*1 1 auto/);
  assert.match(panel, /min-height:\s*0/);
  assert.match(panel, /border:\s*0/, 'パネルの外周線を外す');
  assert.match(panel, /border-radius:\s*0/);
  assert.match(panel, /box-shadow:\s*none/);

  const map = ruleBody(css, '.rp-map');
  assert.match(map, /flex:\s*1 1 auto/, '地図が残り高さを取る');
  assert.match(map, /min-height:\s*0/);
  assert.equal(/clamp\(\s*360px/.test(map), false, '固定の高さ clamp を残さない');
  assert.match(map, /touch-action:\s*none/, '地図内パン操作を維持');

  // ツールバーは地図の上に浮く（地図の外・パネル基準）
  const toolbar = ruleBody(css, '.rp-toolbar');
  assert.match(toolbar, /position:\s*absolute/);
  assert.match(toolbar, /top:\s*8px/);
  assert.match(toolbar, /pointer-events:\s*none/, '余白は地図の操作を邪魔しない');
  assert.match(ruleBody(css, '.rp-toolbar__row'), /pointer-events:\s*auto/);
  assert.match(ruleBody(css, '.rp-chips'), /overflow-x:\s*auto/, '分野チップは横スクロール');
});

test('[static] 地図の外に常設の下部情報を残さない（一覧・説明・注意は dialog 内だけ）', () => {
  const html = read('index.html');
  const mainAt = html.indexOf('<main class="rp-wrap">');
  const mainEnd = html.indexOf('</main>');
  assert.ok(mainAt >= 0 && mainEnd > mainAt);
  const main = html.slice(mainAt, mainEnd);
  assert.ok(main.includes('id="rp-map"'), 'main には地図だけ');
  ['rp-data-notice', 'rp-list', 'rp-info', 'rp-footer'].forEach((key) => {
    assert.equal(main.includes(key), false, key + ' を地図の下に常設しない');
  });
  const dialogAt = html.indexOf('<dialog class="rp-about"');
  const dialogEnd = html.indexOf('</dialog>');
  assert.ok(dialogAt > mainEnd && dialogEnd > dialogAt, 'main の後ろに dialog');
  const dialog = html.slice(dialogAt, dialogEnd);
  ['rp-data-notice', 'rp-list', 'rp-info', 'rp-footer'].forEach((key) => {
    assert.ok(dialog.includes(key), key + ' は dialog 内に残す');
  });
  assert.match(html, /<a class="rp-skip" href="#rp-map">/, 'スキップ先は地図（非表示 dialog ではない）');
  assert.match(html, /<div class="rp-map" id="rp-map" tabindex="-1"/, 'スキップ先をフォーカス可能にする');
});

test('[static] ダイアログは見出しと関連付き、内部スクロール・backdrop・閉じるボタンを持つ', () => {
  const html = read('index.html');
  const css = read('app.css');
  assert.match(html, /<dialog class="rp-about" id="rp-about" aria-labelledby="rp-about-title">/);
  assert.ok(html.includes('id="rp-about-title"'));
  assert.ok(html.includes('id="rp-about-open"'), 'ヘッダーの起動ボタン');
  assert.ok(/id="rp-about-open"[\s\S]{0,120}aria-haspopup="dialog"/.test(html));
  assert.ok(html.includes('id="rp-about-close"'), '閉じるボタン');

  const dialog = ruleBody(css, '.rp-about');
  assert.match(dialog, /max-height:/, '画面を超えない');
  assert.match(dialog, /overflow:\s*hidden/);
  assert.match(css, /\.rp-about::backdrop\s*\{[^}]*background:/, 'backdrop を持つ');
  const body = ruleBody(css, '.rp-about__body');
  assert.match(body, /overflow-y:\s*auto/, '長い本文は内部スクロール');
  assert.match(body, /overflow-x:\s*hidden/);
  assert.match(body, /overscroll-behavior:\s*contain/);
  assert.match(ruleBody(css, '.rp-about__bar'), /flex:\s*0 0 auto/, '閉じるボタンは固定');

  const js = read('app.js');
  assert.ok(js.includes('aboutEl.showModal()'), 'native modal で開く（focus trap は native）');
  assert.ok(js.includes('aboutEl.close()'), 'native で閉じる');
  assert.ok(/if \(aboutEl && aboutEl\.open\) return;/.test(js), 'Escape は dialog から奪わない');
});

/* ---------------- 関数を抽出して駆動 ---------------- */

function loadAbout() {
  const app = read('app.js');
  const src = ['openAbout', 'closeAbout', 'activateListEntity', 'setSearchStatus', 'focusFirstResult']
    .map((name) => extractFunctionSource(app, name)).join('\n');
  const calls = [];
  const dialog = { open: false, show: 0, closeCount: 0 };
  const aboutEl = {
    get open() { return dialog.open; },
    showModal() { dialog.open = true; dialog.show++; calls.push('show'); },
    close() { dialog.open = false; dialog.closeCount++; calls.push('close'); },
    setAttribute() { dialog.open = true; calls.push('show-attr'); }
  };
  const aboutButton = { id: 'rp-about-open' };
  const searchInput = { id: 'rp-search', value: '' };
  const searchStatus = { textContent: '' };
  const api = new Function(
    'aboutEl', 'aboutButton', 'searchInput', 'searchStatus', 'Core', 'D',
    'closeCard', 'closePositionPopover', 'closeEquationDialog', 'gotoEntity',
    src + '\nreturn {' +
      ' openAbout: openAbout, closeAbout: closeAbout, activateListEntity: activateListEntity,' +
      ' focusFirstResult: focusFirstResult, status: function () { return searchStatus.textContent; } };'
  )(
    aboutEl, aboutButton, searchInput, searchStatus, Core, D,
    function () { calls.push('close-card'); },
    function () { calls.push('close-popover'); },
    function () { calls.push('close-eq-dialog'); },
    function (kind, id, trigger) { calls.push('goto:' + kind + ':' + id + ':' + (trigger && trigger.id)); }
  );
  return { api, dialog, calls, searchInput, aboutButton };
}

test('[dialog] 開く前にカードと現在位置の全文を閉じ、閉じたら起点はヘッダーのボタン', () => {
  const { api, dialog, calls, aboutButton } = loadAbout();
  api.openAbout();
  assert.deepEqual(calls.slice(0, 3), ['close-eq-dialog', 'close-card', 'close-popover'], '式の拡大・カード・popoverを先に閉じる');
  assert.equal(dialog.show, 1, 'showModal で開く');
  assert.equal(dialog.open, true);

  // 一覧から選ぶ: 先に dialog を閉じ、フォーカス復帰先は閉じた dialog 内のボタンにしない。
  calls.length = 0;
  api.activateListEntity('compound', 'ethanol');
  assert.deepEqual(calls, ['close', 'goto:compound:ethanol:rp-about-open']);
  assert.equal(dialog.open, false, 'hidden な dialog の中へフォーカスしない');
  assert.equal(aboutButton.id, 'rp-about-open', '起点はヘッダーの起動ボタン');
});

test('[search] Enter は閉じた dialog 内の一覧ボタンへフォーカスせず、先頭の一致へ移動する', () => {
  const { api, calls, searchInput } = loadAbout();
  searchInput.value = 'エタノール';
  api.focusFirstResult();
  const found = Core.matchCompounds(D.compounds, 'エタノール');
  assert.ok(found.length > 0);
  assert.deepEqual(calls, ['goto:compound:' + found[0].id + ':rp-search'],
    '検索欄を起点に先頭の一致物質へ移る');

  calls.length = 0;
  searchInput.value = 'zzz-not-a-compound';
  api.focusFirstResult();
  assert.deepEqual(calls, [], '0件では地図を動かさない');
  assert.equal(api.status(), '一致なし', '小さな status でだけ知らせる');

  const app = read('app.js');
  assert.equal(/listResults\.querySelector\('button\.rp-item'\)/.test(app), false,
    '非表示になり得る一覧ボタンへ focus しない');
  assert.ok(app.includes('id="rp-search-status"') === false, 'status は HTML 側だけ');
  assert.ok(read('index.html').includes('id="rp-search-status"'));
});

/* ---------------- 浮遊ツールバーと fit の上余白 ---------------- */

function loadFit(top, height) {
  const app = read('app.js');
  const src = ['insetFitView', 'fitCanvasView']
    .map((name) => extractFunctionSource(app, name)).join('\n');
  const fn = new Function('Core', 'D', 'viewSize', 'fitTopInset', 'modeCanvas',
    src + '\nreturn fitCanvasView;');
  return fn(Core, D, { w: 1200, h: typeof height === 'number' ? height : 800 },
    function () { return top; }, function () { return D.meta.canvas; })();
}

test('[fit] 全体表示は実表示領域 [top, H] の中心 (H+top)/2 に置く（top 加算）', () => {
  const H = 800;
  const top = 90;
  const fit = loadFit(top);
  const canvas = D.meta.canvas;
  const expected = Core.fitTransform(canvas, 1200, H - top, 14);
  assert.ok(Math.abs(fit.scale - expected.scale) < 1e-12, '倍率は狭めた高さで決める');
  assert.ok(Math.abs(fit.x - expected.x) < 1e-9);
  // fitTransform は [0, H-top] の中央へ置くので、実表示領域の中心へは top を足す。
  assert.ok(Math.abs(fit.y - (expected.y + top)) < 1e-9, 'top/2 ではなく top を足す');

  // 独立した Core の実関数で投影して確かめる（文字列の期待値だけに頼らない）。
  const topLeft = Core.worldToScreen(fit, canvas.x, canvas.y);
  const bottomRight = Core.worldToScreen(fit, canvas.x + canvas.w, canvas.y + canvas.h);
  const centerY = (topLeft.y + bottomRight.y) / 2;
  assert.ok(Math.abs(centerY - (H + top) / 2) < 1e-6,
    '図の中心は実表示領域の中心: ' + centerY + ' != ' + (H + top) / 2);
  assert.ok(Math.abs(centerY - H / 2) > 1, 'top/2 補正では H/2 に戻ってしまう');
  assert.ok(topLeft.y >= top + 14 - 1e-6, '上端はツールバー帯＋余白の下: ' + topLeft.y);
  assert.ok(bottomRight.y <= H + 1, '下は画面内: ' + bottomRight.y);
  assert.ok(topLeft.x >= 0 && bottomRight.x <= 1200 + 1);

  // 余白なしなら従来の fit と同じ
  const plain = loadFit(0);
  const base = Core.fitTransform(canvas, 1200, H, 14);
  assert.ok(Math.abs(plain.scale - base.scale) < 1e-12);
  assert.ok(Math.abs(plain.y - base.y) < 1e-9);
});

function loadInsetTargets(top) {
  const app = read('app.js');
  const src = ['insetFitView', 'regionTarget', 'entityTarget']
    .map((name) => extractFunctionSource(app, name)).join('\n');
  return new Function('Core', 'D', 'viewSize', 'fitTopInset', 'modeCanvas',
    src + '\nreturn { regionTarget: regionTarget, entityTarget: entityTarget };'
  )(Core, D, { w: 1200, h: 800 }, function () { return top; }, function () { return D.meta.canvas; });
}

test('[fit] 分野と物質の移動も実表示領域 [top, H] の中心へ置く', () => {
  const H = 800;
  const top = 120;
  const api = loadInsetTargets(top);
  const region = D.regions.find((r) => r.focus) || D.regions[0];

  const t = api.regionTarget(region);
  assert.ok(Math.abs(t.scale - Core.regionView(region, 1200, H - top, 24).scale) < 1e-12,
    '倍率は狭めた高さで決める');
  const r1 = Core.worldToScreen(t, region.focus.x, region.focus.y);
  const r2 = Core.worldToScreen(t, region.focus.x + region.focus.w, region.focus.y + region.focus.h);
  assert.ok(Math.abs((r1.y + r2.y) / 2 - (H + top) / 2) < 1e-6, '分野の中心は実表示領域の中心');
  assert.ok(r1.y >= top - 1e-6, '分野の上端はツールバー帯の下');

  const node = D.compounds[0];
  const size = { w: node.w || D.meta.nodeW, h: node.h || D.meta.nodeH };
  const e = api.entityTarget({ x: node.x, y: node.y }, size, 1);
  const e1 = Core.worldToScreen(e, node.x, node.y);
  const e2 = Core.worldToScreen(e, node.x + size.w, node.y + size.h);
  assert.ok(Math.abs((e1.y + e2.y) / 2 - (H + top) / 2) < 1e-6, '物質の中心は実表示領域の中心');
  assert.ok(e1.y >= top - 1e-6, '物質の上端はツールバー帯の下');
});

test('[fit] innerH の下限160は、極端に低い画面でも倍率を潰さないための最小値', () => {
  // 実表示領域（H - top）が160px未満になるのは極端な場合だけ。そのときは 160px を
  // 基準に fit する（図が小さくなりすぎない）。中心は top + 80 で、実表示領域の中心より
  // 少し下寄りになるが、これは最小値の意図した挙動。
  const H = 240;
  const top = 120;
  const fit = loadFit(top, H);
  const floor = Core.fitTransform(D.meta.canvas, 1200, 160, 14);
  assert.ok(Math.abs(fit.scale - floor.scale) < 1e-12, '倍率は下限160で決める');
  assert.ok(Math.abs(fit.y - (floor.y + top)) < 1e-9, '中心補正は同じく top 加算');
  const centerY = fit.y + (D.meta.canvas.y + D.meta.canvas.h / 2) * fit.scale;
  assert.ok(Math.abs(centerY - (top + 80)) < 1e-6, '下限が効くときの中心は top + innerH/2');
  assert.ok(H - top < 160, 'この条件は実表示領域が160px未満のときだけ');
});

function loadToolbarInset(height) {
  const src = extractFunctionSource(read('app.js'), 'syncToolbarInset');
  const mapEl = {
    getBoundingClientRect() { return { top: 10 }; },
    style: { setProperty() {} }
  };
  const toolbarEl = { getBoundingClientRect() { return { height: 60, bottom: 70 }; } };
  const api = new Function('toolbarEl', 'mapEl', 'viewSize',
    'var mapTopInset = 0;\n' + src +
    '\nreturn { sync: syncToolbarInset, value: function () { return mapTopInset; } };'
  )(toolbarEl, mapEl, { w: 1200, h: height });
  return api;
}

test('[fit] ツールバーの実寸は地図高の42%までに抑え、fitTopInset が同じ値を返す', () => {
  const tall = loadToolbarInset(1000);
  assert.equal(tall.sync(), 68, '上端8px + 実測の下端まで');
  assert.equal(tall.value(), 68);
  const short = loadToolbarInset(100);
  assert.equal(short.sync(), 42, '小さい画面では地図を潰さない上限');
});
