/**
 * app11-3d-sphere — detail ドック判定の幾何テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-dock.test.cjs
 *
 * 対象: site/app11/3d/sphere-dock.js
 *
 * net 領域 = canvas − 上部ヘッダ − 下部ツールバー/フッター。
 * detail 自身の矩形は判定に含めない（right↔bottom でハンチングしない）。
 * 高さが幅より厳密に大きいときだけ bottom。正方形は right。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'site', 'app11', '3d');
const DOCK = require(path.join(LAB, 'sphere-dock.js'));

function rect(x, y, width, height) {
  return { x, y, width, height };
}

test('[dock] 834x1194（縦長 net）は bottom、1194x834（横長 net）は right', () => {
  const portrait = DOCK.netMapRect(
    { width: 834, height: 1194 },
    rect(0, 0, 834, 100),
    rect(0, 1100, 834, 80)
  );
  assert.deepEqual(portrait, { x: 0, y: 100, width: 834, height: 1000 });
  assert.equal(DOCK.chooseDock(portrait), 'bottom');

  const landscape = DOCK.netMapRect(
    { width: 1194, height: 834 },
    rect(0, 0, 1194, 100),
    rect(0, 760, 1194, 70)
  );
  assert.deepEqual(landscape, { x: 0, y: 100, width: 1194, height: 660 });
  assert.equal(DOCK.chooseDock(landscape), 'right');
});

test('[dock] 画面幅ではなく net の aspect で決まる（狭い画面でも net が横長なら right）', () => {
  // 狭い viewport でも、ヘッダ/ツールバーが高く net が横長になるケース。
  const wideNet = DOCK.netMapRect(
    { width: 390, height: 844 },
    rect(0, 0, 390, 420),
    rect(0, 700, 390, 80)
  );
  assert.deepEqual(wideNet, { x: 0, y: 420, width: 390, height: 280 });
  assert.equal(DOCK.chooseDock(wideNet), 'right');

  const tallNet = DOCK.netMapRect(
    { width: 390, height: 844 },
    rect(0, 0, 390, 120),
    rect(0, 780, 390, 60)
  );
  assert.equal(DOCK.chooseDock(tallNet), 'bottom');
});

test('[dock] 正方形は right、厳密に 1px でも縦長なら bottom', () => {
  assert.equal(DOCK.chooseDock({ width: 500, height: 500 }), 'right');
  assert.equal(DOCK.chooseDock({ width: 500, height: 501 }), 'bottom');
  assert.equal(DOCK.chooseDock({ width: 501, height: 500 }), 'right');
  // ちょうど正方形になる実測（header 100 / toolbar top 600 / canvas 500x700）。
  const square = DOCK.netMapRect(
    { width: 500, height: 700 },
    rect(0, 0, 500, 100),
    rect(0, 600, 500, 80)
  );
  assert.equal(square.width, 500);
  assert.equal(square.height, 500);
  assert.equal(DOCK.chooseDock(square), 'right');
});

test('[dock] ヘッダ/フッターの実測変化で比率が反転する', () => {
  const base = DOCK.netMapRect(
    { width: 600, height: 800 },
    rect(0, 0, 600, 100),
    rect(0, 700, 600, 80)
  );
  assert.equal(DOCK.chooseDock(base), 'right'); // 600x600

  const footerUp = DOCK.netMapRect(
    { width: 600, height: 800 },
    rect(0, 0, 600, 100),
    rect(0, 699, 600, 80)
  );
  assert.equal(footerUp.height, 599);
  assert.equal(DOCK.chooseDock(footerUp), 'right'); // 600x599
  // 1px 下げると 600x601 で縦長 → bottom。
  const footerDown = DOCK.netMapRect(
    { width: 600, height: 800 },
    rect(0, 0, 600, 100),
    rect(0, 701, 600, 80)
  );
  assert.equal(footerDown.height, 601);
  assert.equal(DOCK.chooseDock(footerDown), 'bottom');

  const headerTall = DOCK.netMapRect(
    { width: 600, height: 800 },
    rect(0, 0, 600, 200),
    rect(0, 700, 600, 80)
  );
  assert.equal(headerTall.height, 500);
  assert.equal(DOCK.chooseDock(headerTall), 'right');
});

test('[dock] 詳細パネルは判定入力に存在しない（detail 非依存）', () => {
  const net = DOCK.netMapRect(
    { width: 834, height: 1194 },
    rect(0, 0, 834, 100),
    rect(0, 1100, 834, 80)
  );
  // 同じ net からは detail の有無・位置に関係なく同じ判定。
  assert.equal(DOCK.chooseDock(net), 'bottom');
  assert.equal(DOCK.chooseDock(Object.assign({}, net)), 'bottom');
  assert.equal(Object.keys(net).sort().join(','), 'height,width,x,y');
});

test('[dock] 下部ドックのオフセットはツールバー実測の上に置く', () => {
  assert.equal(DOCK.bottomOffset(800, rect(0, 700, 500, 80), 10), 110);
  assert.equal(DOCK.bottomOffset(800, null, 10), 10);
  // ツールバーが想定外の位置でも負のオフセットにしない。
  assert.equal(DOCK.bottomOffset(800, rect(0, 850, 500, 80), 10), 10);
  const noGap = DOCK.bottomOffset(800, rect(0, 700, 500, 80));
  assert.equal(noGap, 110);
});

test('[dock] 配線: 実測 → クラス適用 → usable/フレーミングの順で、CSS も両ドックを持つ', () => {
  const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(LAB, 'sphere.css'), 'utf8');
  const app = fs.readFileSync(path.join(LAB, 'sphere-app.js'), 'utf8');
  assert.ok(html.indexOf('src="./sphere-dock.js"') >= 0);
  assert.ok(html.indexOf('src="./sphere-dock.js"') < html.indexOf('src="./sphere-app.js"'));
  assert.ok(/\.r3d-app\.r3d-dock-bottom \.r3d-detail/.test(css), 'bottom CSS がない');
  assert.ok(/\.r3d-app\.r3d-dock-right \.r3d-detail/.test(css), 'right CSS がない');

  const refit = app.slice(app.indexOf('function refitForLayout'), app.indexOf('// ---------------- 描画'));
  assert.ok(refit.indexOf('applyDetailDock()') >= 0);
  assert.ok(refit.indexOf('applyDetailDock()') < refit.indexOf('usableArea()'),
    'refitForLayout が usable より後にドックを決めている');

  const select = app.slice(app.indexOf('function select('), app.indexOf('function clearSelection'));
  assert.ok(select.indexOf('applyDetailDock()') >= 0);
  assert.ok(select.indexOf('applyDetailDock()') < select.indexOf('framingCamera('),
    'select がフレーミングより後にドックを決めている');

  const render = app.slice(app.indexOf('function render('), app.indexOf('function resizeCanvas'));
  assert.ok(render.indexOf('applyDetailDock()') < render.indexOf('usableArea()'),
    'render が usable より後にドックを決めている');
  assert.ok(app.includes("classList.toggle('r3d-dock-bottom'"));
  assert.ok(app.includes("classList.toggle('r3d-dock-right'"));
});

test('[dock] ヘッダ/ツールバーが重なって空きが無い場合は canvas 全体へ戻す', () => {
  const net = DOCK.netMapRect(
    { width: 800, height: 600 },
    rect(0, 0, 800, 400),
    rect(0, 300, 800, 100)
  );
  assert.deepEqual(net, { x: 0, y: 0, width: 800, height: 600 });
  assert.equal(DOCK.chooseDock(net), 'right');
});
