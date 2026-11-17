/**
 * app11 反応名ラベルのアンカー / bbox 契約テスト
 *
 * 実行: node --test scripts/tests/app11-newlabelcsscontract.test.cjs
 *
 * 背景:
 *   CSS `.rp-reaction__label { text-anchor: middle }` は SVG の presentation 属性
 *   （text-anchor="start" / "end"）より優先される。そのため学術表示のラベルは
 *   generator が作った label.box と実描画がずれていた。
 *   現在はアンカーを classes（--start / --end / --middle）で与え、文字位置を
 *   label.box の対応する辺へ置く。通常配置（box 中心 = label.type）は middle のまま。
 *
 * - 既存の通常ラベル（現在の配置 80 件）の見た目・座標は変えない。
 * - 旧スキーマ（anchor 無し・side/box のみ）の学術ラベルは side から start/end を導き、
 *   box の辺に一致させる（±11px の補正で box からずれない）。
 * - 反応名の文字は typeLabel のまま。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));

const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(match, selector + ' の規則');
  return ' ' + match[1].replace(/\s+/g, ' ').trim() + ' ';
}

const labelApi = new Function(
  'var LABEL_EDGE_OFFSET = 11;\n' +
  extractFunctionSource(APP_JS, 'labelAnchorName') + '\n' +
  extractFunctionSource(APP_JS, 'labelPoint') + '\n' +
  'return { labelAnchorName: labelAnchorName, labelPoint: labelPoint };'
)();

/* ------------------------------------------------------------------
 * CSS: 共通ルールを消さず、アンカーだけを classes で上書きする
 * ------------------------------------------------------------------ */

test('[css] 共通の .rp-reaction__label は text-anchor: middle のまま（通常配置を崩さない）', () => {
  const base = ruleBody(APP_CSS, '.rp-reaction__label');
  assert.match(base, /text-anchor:\s*middle/, '現在の配置は middle のまま');
  assert.match(base, /dominant-baseline:\s*middle/);
});

test('[css] --start / --end / --middle が共通ルールより後ろで効く', () => {
  const baseIndex = APP_CSS.indexOf('.rp-reaction__label {');
  assert.ok(baseIndex > 0, '共通ルールの位置');
  const start = ruleBody(APP_CSS, '.rp-reaction__label--start');
  const end = ruleBody(APP_CSS, '.rp-reaction__label--end');
  const middle = ruleBody(APP_CSS, '.rp-reaction__label--middle');
  assert.match(start, /text-anchor:\s*start/);
  assert.match(end, /text-anchor:\s*end/);
  assert.match(middle, /text-anchor:\s*middle/);
  const startIndex = APP_CSS.indexOf('.rp-reaction__label--start {');
  const endIndex = APP_CSS.indexOf('.rp-reaction__label--end {');
  const middleIndex = APP_CSS.indexOf('.rp-reaction__label--middle {');
  assert.ok(startIndex > baseIndex, '--start は共通ルールの後');
  assert.ok(endIndex > baseIndex, '--end は共通ルールの後');
  assert.ok(middleIndex > baseIndex, '--middle は共通ルールの後');
});

test('[js] 反応名 text はアンカー classes と label.box 由来の座標で作る', () => {
  const src = extractFunctionSource(APP_JS, 'reactionLabelNodes');
  assert.match(src, /rp-reaction__label--' \+ place\.anchor/);
  assert.equal(/text-anchor/.test(src.split('--cond')[0]), false,
    '種別ラベルに presentation 属性の text-anchor を使わない（条件ラベルだけ middle）');
  assert.match(src, /label\.textContent = r\.typeLabel/, '文字は typeLabel のまま');
  assert.match(extractFunctionSource(APP_JS, 'buildAcademic'), /reactionLabelNodes\(r/);
  assert.match(extractFunctionSource(APP_JS, 'buildProposed'), /reactionLabelNodes\(r\)/);
});

/* ------------------------------------------------------------------
 * 位置: アンカーと bbox を一致させる
 * ------------------------------------------------------------------ */

test('[anchor] 現在の配置 80 件は middle のまま（座標・アンカーを変えない）', () => {
  const labeled = D.reactions.filter((r) => r.label);
  assert.equal(labeled.length, 80, '現在の配置のラベルは 80 件');
  labeled.forEach((r) => {
    const place = labelApi.labelPoint(r.label);
    assert.equal(place.anchor, 'middle', r.id + ' のアンカー');
    assert.equal(place.x, r.label.type.x, r.id + ' の x');
    assert.equal(place.y, r.label.type.y, r.id + ' の y');
    assert.ok(Math.abs(place.x - (r.label.box.x + r.label.box.w / 2)) < 1e-6, r.id + ' の bbox 中心');
    assert.ok(Math.abs(place.y - (r.label.box.y + r.label.box.h / 2)) < 1e-6, r.id + ' の bbox 中心 y');
  });
  // 現在の配置で label が無い反応は null のまま（HTML 重ねラベルが使える）。
  assert.equal(D.reactions.filter((r) => !r.label).length, D.reactions.length - 80);
});

test('[anchor] 実データの全ラベルが anchor 契約（center / start / end・旧 side fallback）と一致する', () => {
  const markers = A.layout.normalMarkers || {};
  let checked = 0;
  let legacy = 0;
  Object.keys(markers).forEach((id) => {
    const label = markers[id].label;
    if (!label || !label.box) return;
    const place = labelApi.labelPoint(label);
    if (label.anchor === 'center' || label.anchor === 'middle') {
      // center 契約: type が box 中心で、text は middle。
      assert.equal(place.anchor, 'middle', id + ' のアンカー');
      assert.ok(Math.abs(place.x - label.type.x) < 1e-9, id + ' は type（box 中心）に置く');
      assert.ok(Math.abs(label.box.x + label.box.w / 2 - label.type.x) < 1e-6,
        id + ' の box 中心と type が一致');
      assert.ok(Math.abs(label.box.y + label.box.h / 2 - label.type.y) < 1e-6);
    } else if (label.anchor === 'start' || label.anchor === 'end') {
      const wantX = label.anchor === 'start' ? label.box.x : label.box.x + label.box.w;
      assert.equal(place.anchor, label.anchor, id + ' は明示 anchor');
      assert.equal(place.x, wantX, id + ' は box の辺');
    } else {
      // 旧スキーマ: side から導き、box の辺に一致させる（±11px の補正でずらさない）。
      legacy++;
      const wantAnchor = label.side === 'E' ? 'start' : 'end';
      const wantX = label.side === 'E' ? label.box.x : label.box.x + label.box.w;
      assert.equal(place.anchor, wantAnchor, id + ' は side から導く');
      assert.equal(place.x, wantX, id + ' は box の辺');
    }
    assert.ok(Math.abs(place.y - (label.box.y + label.box.h / 2)) < 1e-6, id + ' は box の縦中心');
    checked++;
  });
  assert.ok(checked > 100, '学術配置のラベルを検証した件数: ' + checked);
  assert.ok(legacy >= 0);
});

test('[anchor] 旧スキーマ（anchor 無し・side/box）は box の辺へ start / end を置く', () => {
  // 合成の旧スキーマ（side=E/W・box が type から 11px ずれる）でも辺に一致する。
  const east = labelApi.labelPoint({ side: 'E', type: { x: 200, y: 100 }, box: { x: 211, y: 92, w: 80, h: 16 } });
  assert.deepEqual(east, { x: 211, y: 100, anchor: 'start' });
  const west = labelApi.labelPoint({ side: 'W', type: { x: 200, y: 100 }, box: { x: 109, y: 92, w: 80, h: 16 } });
  assert.deepEqual(west, { x: 189, y: 100, anchor: 'end' });
  // 旧実装の ±11px 補正は box と一致しないため使わない。
  assert.ok(Math.abs(east.x - (200 + 11)) < 1e-9);
  assert.equal(east.anchor, 'start');
});

test('[anchor] 明示 anchor を優先する（center / start / end）', () => {
  const box = { x: 100, y: 40, w: 60, h: 16 };
  const center = labelApi.labelPoint({ anchor: 'center', side: 'E', type: { x: 130, y: 48 }, box: box });
  assert.deepEqual(center, { x: 130, y: 48, anchor: 'middle' });
  const start = labelApi.labelPoint({ anchor: 'start', side: 'E', type: { x: 130, y: 48 }, box: box });
  assert.deepEqual(start, { x: 100, y: 48, anchor: 'start' });
  const end = labelApi.labelPoint({ anchor: 'end', side: 'W', type: { x: 130, y: 48 }, box: box });
  assert.deepEqual(end, { x: 160, y: 48, anchor: 'end' });
  assert.equal(labelApi.labelPoint({ anchor: 'left', box: box, type: box }).anchor, 'start');
  assert.equal(labelApi.labelPoint({ anchor: 'right', box: box, type: box }).anchor, 'end');
  assert.equal(labelApi.labelPoint({ anchor: 'centre', box: box, type: box }).anchor, 'middle');
});

test('[anchor] box が無い旧データは type 点から ±11px で従来の位置を保つ', () => {
  const east = labelApi.labelPoint({ side: 'E', type: { x: 10, y: 20 }, box: null });
  assert.deepEqual(east, { x: 21, y: 20, anchor: 'start' });
  const west = labelApi.labelPoint({ side: 'W', type: { x: 10, y: 20 }, box: null });
  assert.deepEqual(west, { x: -1, y: 20, anchor: 'end' });
  const none = labelApi.labelPoint({ type: { x: 10, y: 20 }, box: null });
  assert.deepEqual(none, { x: 10, y: 20, anchor: 'middle' });
});

test('[anchor] 生成器の box と実描画幅が同じ前提で、アンカーごとの text 位置が一意に決まる', () => {
  // 同じ label からアンカーが一意に決まる（CSS と JS で解釈が割れない）。
  ['E', 'W'].forEach((side) => {
    const label = { side: side, type: { x: 200, y: 100 }, box: { x: 211, y: 92, w: 80, h: 16 } };
    assert.equal(labelApi.labelAnchorName(label), side === 'E' ? 'start' : 'end');
  });
  // 中心一致の label（現在の配置）は side があっても middle。
  assert.equal(labelApi.labelAnchorName({
    side: 'E',
    type: { x: 250, y: 100 },
    box: { x: 210, y: 92, w: 80, h: 16 }
  }), 'middle');
});
