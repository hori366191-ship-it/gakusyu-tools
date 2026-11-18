/**
 * app11-3d 決定的 3D 配置の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-layout.test.cjs
 *
 * 対象: site/app11/3d/layout3d.js
 *   - 427 物質すべてに有限座標（未接続も含む）
 *   - 同じ入力から同じ座標（乱数なし）
 *   - 薄い押し出しではなく、Y/Z にも実体積（分野ごとの局所平面の傾き + 緩和）
 *   - 分野ごとの高低差が残り、反応でつながる物質は全体平均より近い
 *   - site/app11/data.js の通常データだけを使い、academic の x/y は使わない
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
const G = require(path.join(APP, 'reaction-groups.js'));
const L = require(path.join(ROOT, 'site', 'app11', '3d', 'layout3d.js'));

function build(compounds, reactions) {
  return L.buildLayout3D(compounds || D.compounds, { reactions: reactions || D.reactions });
}

function distancesToNearest(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    let best = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dz = points[i].z - points[j].z;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    out.push(best);
  }
  out.sort((a, b) => a - b);
  return out;
}

test('[count] 427 物質すべてに有限座標がある（未接続も含む）', () => {
  const layout = build();
  assert.equal(layout.count, 427);
  assert.equal(Object.keys(layout.points).length, 427);
  for (const compound of D.compounds) {
    const p = layout.points[compound.id];
    assert.ok(p, compound.id);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), compound.id);
    assert.ok(Number.isFinite(p.cardW) && Number.isFinite(p.cardH));
  }
  // 未接続の代表も座標を持つ
  const isolated = D.compounds.find((compound) => !compound.incoming && !compound.outgoing);
  assert.ok(isolated);
  assert.ok(Number.isFinite(layout.points[isolated.id].x));
});

test('[determinism] 2 回構築しても完全に同じ座標', () => {
  const a = build();
  const b = build(D.compounds.slice(), D.reactions.slice());
  assert.deepEqual(a.points, b.points);
  assert.deepEqual(a.bounds, b.bounds);
  assert.equal(a.radius, b.radius);
});

test('[volume] Y/Z が X に対する薄い押し出しではなく、実体積を持つ', () => {
  const layout = build();
  const b = layout.bounds;
  assert.ok(b.width > 60, 'X が狭すぎる');
  assert.ok(b.height > 40, 'Y が薄すぎる: ' + b.height.toFixed(2));
  assert.ok(b.depth > 35, 'Z が薄すぎる: ' + b.depth.toFixed(2));
  // 旧版は Y/X ≈ 0.23, Z/X ≈ 0.57。現在は Y も X の 4 割超を要求する。
  assert.ok(b.height / b.width > 0.45, 'Y/X が小さすぎる: ' + (b.height / b.width).toFixed(2));
  assert.ok(b.depth / b.width > 0.4, 'Z/X が小さすぎる: ' + (b.depth / b.width).toFixed(2));
});

test('[density] 最近傍距離の中央値が上がり、密集が緩和されている', () => {
  const layout = build();
  const nn = distancesToNearest(layout.list);
  const median = nn[nn.length >> 1];
  assert.ok(median > 3.5, '最近傍中央値がまだ小さい: ' + median.toFixed(2));
  assert.ok(median < 20, '緩和しすぎて全体が散らばりすぎ: ' + median.toFixed(2));
  assert.ok(nn[0] > 2, '極端に近い物質が残っている: ' + nn[0].toFixed(2));
});

test('[relatedness] 反応でつながる物質は全体の偶然のペアより近い', () => {
  const layout = build();
  const edgeDistances = [];
  for (const edge of D.reactions) {
    for (const from of edge.substrates || []) {
      for (const to of edge.products || []) {
        const a = layout.points[from];
        const b = layout.points[to];
        if (!a || !b || from === to) continue;
        edgeDistances.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
  }
  edgeDistances.sort((a, b) => a - b);
  const median = edgeDistances[edgeDistances.length >> 1];
  const mean = edgeDistances.reduce((sum, value) => sum + value, 0) / edgeDistances.length;
  assert.ok(median < 16, '反応ペアの中央距離が大きすぎる: ' + median.toFixed(2));
  assert.ok(mean < 22, '反応ペアの平均距離が大きすぎる: ' + mean.toFixed(2));

  // 決定的に選んだ無関係ペアの平均距離と比べる
  const random = [];
  for (let i = 0; i < D.compounds.length; i += 7) {
    const a = layout.points[D.compounds[i].id];
    const b = layout.points[D.compounds[(i * 113 + 37) % D.compounds.length].id];
    if (a && b && a.id !== b.id) random.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  const randomMean = random.reduce((sum, value) => sum + value, 0) / random.length;
  assert.ok(mean < randomMean * 0.55,
    '関連ペアが偶然ペアより十分近くない: edge ' + mean.toFixed(2) + ' / random ' + randomMean.toFixed(2));
});

test('[groups] 分野ごとの高低差が残り、同じ分野は近くにまとまる', () => {
  const layout = build();
  const byRegion = new Map();
  for (const compound of D.compounds) {
    const key = compound.regionIndex || 0;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(layout.points[compound.id]);
  }
  const averages = [...byRegion.keys()].sort((a, b) => a - b).map((key) => {
    const values = byRegion.get(key).map((p) => p.y);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  for (let i = 1; i < averages.length; i++) {
    assert.ok(averages[i] > averages[i - 1], `region ${i} の平均高さが昇順でない`);
  }

  // 同一分野のペアは、分野をまたぐペアより近い（クラスタが保たれている）
  const sameRegion = [];
  const crossRegion = [];
  for (let i = 0; i < D.compounds.length; i += 3) {
    for (let j = i + 1; j < D.compounds.length; j += 5) {
      const a = layout.points[D.compounds[i].id];
      const b = layout.points[D.compounds[j].id];
      if (!a || !b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (a.regionIndex === b.regionIndex) sameRegion.push(d);
      else crossRegion.push(d);
    }
  }
  sameRegion.sort((a, b) => a - b);
  crossRegion.sort((a, b) => a - b);
  const sameMedian = sameRegion[sameRegion.length >> 1];
  const crossMedian = crossRegion[crossRegion.length >> 1];
  assert.ok(sameMedian < crossMedian * 0.75,
    '同一分野が十分近くない: ' + sameMedian.toFixed(2) + ' vs ' + crossMedian.toFixed(2));
});

test('[stable] 通常データだけを読み、academic の x/y に依存しない', () => {
  const source = fs.readFileSync(path.join(ROOT, 'site', 'app11', '3d', 'layout3d.js'), 'utf8');
  assert.equal(/academicData|academic\.reactions|academic\.layout/i.test(source), false);
  const base = build();
  // 通常データの reactions を落としても座標は有限（springs なしでも壊れない）
  const noSprings = L.buildLayout3D(D.compounds, {});
  assert.equal(noSprings.count, 427);
  for (const compound of D.compounds) {
    assert.ok(Number.isFinite(noSprings.points[compound.id].y));
  }
  // academic の反応を混ぜても layout の入力には渡さない（呼び出し側の責務）
  void base;
  void A;
  void G;
});

test('[hash] 同じ ID からは同じ値、違う ID では分布する', () => {
  assert.equal(L.hash32('ethanol'), L.hash32('ethanol'));
  assert.notEqual(L.hash32('ethanol'), L.hash32('methanol'));
  assert.ok(L.hash32('ethanol') >= 0 && L.hash32('ethanol') <= 0xffffffff);
  const values = new Set();
  for (let i = 0; i < 100; i++) values.add(L.hash32('id-' + i));
  assert.equal(values.size, 100);
  const buckets = new Set();
  for (let i = 0; i < 100; i++) buckets.add(L.hash32('id-' + i) % 10);
  assert.ok(buckets.size >= 8);
});
