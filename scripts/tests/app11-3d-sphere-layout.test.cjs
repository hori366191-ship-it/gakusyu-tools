/**
 * app11-3d-sphere — 球面レイアウトの回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-layout.test.cjs
 *
 * 対象: site/app11/3d/sphere-layout.js
 *   - 427 物質すべてが同じ球の上（半径一定）にあり、極を避けた固定スロットに入る
 *   - 同じ入力からは常に同じ座標・同じ分野割当（乱数なし）
 *   - 2D の x / y を読まない（座標を落としても結果が変わらない）
 *   - 分野は球面上の連続した測地ブロブ（全分野で連結成分 1）
 *   - 分野内の平均測地距離が、ラベルをでたらめに入れ替えた場合より明確に短い
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const D = require(path.join(APP, 'data.js'));
const L = require(path.join(LAB, 'sphere-layout.js'));

function build(compounds, options) {
  return L.buildSphereLayout(compounds || D.compounds, options || {});
}

const layout = build();

test('[count] 427 物質がすべて球面上の別々のスロットに入る', () => {
  assert.equal(layout.count, 427);
  assert.equal(layout.slots.length, 427);
  assert.equal(Object.keys(layout.points).length, 427);
  assert.equal(layout.stats.count, 427);

  const used = new Set();
  for (const compound of D.compounds) {
    const point = layout.points[compound.id];
    assert.ok(point, compound.id);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
    assert.notEqual(point.slot, undefined);
    assert.ok(!used.has(point.slot), 'slot 重複: ' + compound.id);
    used.add(point.slot);
  }
  assert.equal(used.size, 427);
});

test('[sphere] 全点が半径 100 の球面上にあり、極そのものを使わない', () => {
  for (const point of layout.list) {
    const r = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
    assert.ok(Math.abs(r - layout.radius) < 1e-9, point.id + ': ' + r);
    const n = Math.sqrt(point.nx * point.nx + point.ny * point.ny + point.nz * point.nz);
    assert.ok(Math.abs(n - 1) < 1e-9);
  }
  const n = layout.slots.length;
  const bound = 1 - 1 / n + 1e-12;
  for (const slot of layout.slots) {
    assert.ok(Math.abs(slot.dir.y) <= bound, 'slot ' + slot.index + ' が極に近すぎる');
    assert.ok(Math.abs(slot.dir.y) < 1);
  }
});

test('[determinism] 2 回構築しても座標・分野割当が完全に一致する', () => {
  const again = build();
  for (let i = 0; i < layout.list.length; i++) {
    const a = layout.list[i];
    const b = again.list[i];
    assert.equal(a.id, b.id);
    assert.equal(a.slot, b.slot);
    assert.ok(Math.abs(a.x - b.x) < 1e-12);
    assert.ok(Math.abs(a.y - b.y) < 1e-12);
    assert.ok(Math.abs(a.z - b.z) < 1e-12);
  }
  assert.deepEqual(Array.from(again.assignment), Array.from(layout.assignment));
});

test('[independent-of-2d] 2D の x / y を落としても座標が変わらない', () => {
  const stripped = D.compounds.map((compound) => {
    const copy = {};
    Object.keys(compound).forEach((key) => {
      if (key === 'x' || key === 'y' || key === 'w' || key === 'h') return;
      copy[key] = compound[key];
    });
    return copy;
  });
  const other = build(stripped);
  for (const id of Object.keys(layout.points)) {
    const a = layout.points[id];
    const b = other.points[id];
    assert.ok(b, id);
    assert.equal(a.slot, b.slot);
    assert.ok(Math.abs(a.x - b.x) < 1e-12);
    assert.ok(Math.abs(a.y - b.y) < 1e-12);
    assert.ok(Math.abs(a.z - b.z) < 1e-12);
  }
});

test('[slots] 近傍間隔が均質（極端な密集がない）', () => {
  const nearest = [];
  for (let i = 0; i < layout.list.length; i++) {
    let best = Infinity;
    for (let j = 0; j < layout.list.length; j++) {
      if (i === j) continue;
      const a = layout.list[i];
      const b = layout.list[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < best) best = d;
    }
    nearest.push(best);
  }
  nearest.sort((a, b) => a - b);
  const median = nearest[Math.floor(nearest.length / 2)];
  const min = nearest[0];
  const max = nearest[nearest.length - 1];
  // 理論間隔 ≈ 2R√(π/n) ≈ 17.2。中央値がその近く、最小でも半分以上。
  assert.ok(median > 15 && median < 19, 'median=' + median);
  assert.ok(min > 8, 'min=' + min);
  assert.ok(max < 26, 'max=' + max);
});

test('[regions] 分野ごとの件数が data.js と一致し、全分野が 1 連結', () => {
  const expected = {};
  for (const compound of D.compounds) {
    expected[compound.regionIndex] = (expected[compound.regionIndex] || 0) + 1;
  }
  assert.deepEqual(
    Object.keys(layout.regionSlotCounts).sort((a, b) => Number(a) - Number(b)),
    Object.keys(expected).sort((a, b) => Number(a) - Number(b))
  );
  for (const key of Object.keys(expected)) {
    assert.equal(layout.regionSlotCounts[key].compounds, expected[key], 'region ' + key);
    assert.equal(layout.regionSlotCounts[key].slots, expected[key], 'region ' + key);
    const conn = layout.stats.regionConnectivity[key];
    assert.equal(conn.total, expected[key]);
    assert.equal(conn.reached, expected[key], 'region ' + key + ' が分断されている: ' + JSON.stringify(conn));
    assert.equal(conn.ratio, 1);
  }
  assert.equal(layout.stats.unrepairedFragments, 0);
});

test('[locality] 同一分野の平均測地距離がランダム割当より十分短い', () => {
  const locality = layout.stats.regionLocality;
  let weighted = 0;
  let size = 0;
  for (const key of Object.keys(locality.meanByRegion)) {
    weighted += locality.meanByRegion[key] * locality.countByRegion[key];
    size += locality.countByRegion[key];
  }
  const mean = weighted / size;
  const baseline = L.randomizedLocalityBaseline(layout.slots, layout.assignment, layout.radius, 3);
  assert.ok(mean < baseline * 0.6, 'mean=' + mean + ' baseline=' + baseline);
  // どの分野もランダム平均より短い。
  assert.ok(mean < layout.radius, 'mean=' + mean);
});

test('[radius] radius オプションがスロットと測地距離に反映される', () => {
  const small = build(D.compounds, { radius: 50 });
  assert.equal(small.radius, 50);
  for (const point of small.list) {
    const r = Math.hypot(point.x, point.y, point.z);
    assert.ok(Math.abs(r - 50) < 1e-9);
  }
  const locality = small.stats.regionLocality.meanByRegion;
  for (const key of Object.keys(locality)) {
    assert.ok(locality[key] <= 60, 'region ' + key + ' が広すぎる: ' + locality[key]);
  }
});
