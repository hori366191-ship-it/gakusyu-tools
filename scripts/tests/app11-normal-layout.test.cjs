/**
 * app11 通常モード拡張（高校標準 76 反応）の統合回帰
 *
 * 実行: node --test scripts/tests/app11-normal-layout.test.cjs
 *
 * - 旧 86 反応の事実・旧 101 物質の座標・旧 207 経路は legacy-baseline と完全一致
 * - 追加反応は接続済みの端点近傍へ置き、旧棚の座標を anchor に使わない
 * - 新しく接続した物質は棚に残さない（maleic 無水物クラスタを含む）
 * - 全経路が描画され、node/label/marker を貫通しない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const SRC = path.join(ROOT, 'site-src', 'app11');
const D = require(path.join(APP, 'data.js'));
const M = require(path.join(ROOT, 'scripts', 'app11', 'metrics.cjs'));
const L = require(path.join(ROOT, 'scripts', 'app11', 'legacy-baseline.cjs'));
const S = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));

const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(path.join(SRC, 'routes.json'), 'utf8'));
const legacy = L.loadBaseline();
const source = S.loadSource();
const legacyIds = new Set(Object.keys(legacy.reactions));
const newIds = source.reactions.map((r) => r.id).filter((id) => !legacyIds.has(id));

function edgeLength(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return sum;
}

test('[legacy] 旧 86 反応の事実・旧 101 座標・旧 207 経路は不変', () => {
  assert.deepEqual(L.verifySource(source, legacy), []);
  assert.deepEqual(L.verifyLayout(layout, routes, legacy, source), []);
  assert.equal(Object.keys(legacy.reactions).length, 86);
  assert.equal(legacy.counts.connected, 101);
  assert.equal(legacy.counts.edges, 207);
});

test('[expand] 全 162 反応・全 427 物質・全経路が data/layout/routes に揃う', () => {
  assert.equal(source.reactions.length, 162);
  assert.equal(D.reactions.length, source.reactions.length);
  assert.equal(Object.keys(layout.positions).length, 427);
  assert.equal(Object.keys(layout.reactions).length, source.reactions.length);
  const expectedEdges = source.reactions.reduce((n, r) => n + r.substrates.length + r.products.length, 0);
  assert.equal(Object.keys(routes.edges).length, expectedEdges);
  assert.equal(D.reactions.reduce((n, r) => n + r.edges.length, 0), expectedEdges);
  newIds.forEach((id) => {
    assert.ok(layout.reactions[id], '新しい反応のマーカー: ' + id);
    assert.ok(Object.keys(routes.edges).some((key) => routes.edges[key].reaction === id), '新しい反応の経路: ' + id);
  });
});

test('[anchor] 追加マーカーは旧棚を anchor にせず、接続済み端点の近くへ置く', () => {
  const shelf = layout.shelf;
  assert.equal(shelf.side, 'right');
  newIds.forEach((id) => {
    const marker = layout.reactions[id];
    assert.ok(marker.x < shelf.x - 250, id + ' のマーカーが旧棚側: ' + marker.x);
  });
  // 代表: エタノール＋ナトリウム。エタノールの近傍に置き、長い引き回しをしない。
  const ethanol = D.compounds.find((c) => c.id === 'ethanol');
  const marker = layout.reactions['ethanol-sodium'];
  assert.ok(marker, 'ethanol-sodium のマーカー');
  const distance = Math.hypot(marker.x - (ethanol.x + ethanol.w / 2), marker.y - (ethanol.y + ethanol.h / 2));
  assert.ok(distance < 300, 'ethanol-sodium のマーカー距離: ' + distance.toFixed(0));
  const keys = Object.keys(routes.edges).filter((key) => routes.edges[key].reaction === 'ethanol-sodium');
  const longest = Math.max(...keys.map((key) => edgeLength(routes.edges[key].points)));
  assert.ok(longest < 600, 'ethanol-sodium の最長辺: ' + longest.toFixed(0));
  // 全体の長線本数を抑える（旧棚経由の再発防止）。
  const longEdges = Object.keys(routes.edges).filter((key) => edgeLength(routes.edges[key].points) > 1500);
  assert.ok(longEdges.length <= 8, '1500px 超の辺: ' + longEdges.length + ' / ' + longEdges.slice(0, 5).join(', '));
});

test('[shelf] 新しく接続した物質を棚に残さない（maleic クラスタを含む）', () => {
  const incident = L.incidentCounts(source);
  const shelfRect = {
    x: layout.shelf.x - 1,
    y: layout.shelf.y - 1,
    w: layout.shelf.cols * 152 + 2,
    h: layout.shelf.rows * 54 + 2
  };
  const inShelf = (p) => p.x >= shelfRect.x && p.x <= shelfRect.x + shelfRect.w &&
    p.y >= shelfRect.y && p.y <= shelfRect.y + shelfRect.h;
  Object.keys(layout.positions).forEach((id) => {
    const pos = layout.positions[id];
    if (!(incident.get(id) > 0)) return;
    assert.equal(inShelf(pos), false, '接続済み物質が棚の中: ' + id);
  });
  const isolated = Object.keys(layout.positions).filter((id) => !(incident.get(id) > 0));
  assert.equal(layout.shelf.count, isolated.length);
  ['maleic-acid', 'maleic-anhydride'].forEach((id) => {
    assert.ok(incident.get(id) > 0, id + ' は反応網に接続する');
    assert.equal(inShelf(layout.positions[id]), false, id + ' が棚に残る');
    assert.ok(layout.positions[id].x < layout.shelf.x - 250, id + ' はネットワーク側');
  });
});

test('[geometry] 全経路が node/label/marker を貫通せず、旧主要の交差は 0', () => {
  const report = M.measure(M.loadCurrent());
  assert.equal(report.edges.nodePenetrations, 0);
  assert.equal(report.edges.labelPenetrations, 0);
  assert.equal(report.edges.markerPenetrations, 0);
  assert.equal(report.markers.markerCollisions, 0);
  assert.equal(report.markers.labelMarkerCollisions, 0);
  // 旧 primary の P–P 交差は 0 を維持する。
  const legacyPrimary = new Set(Object.keys(legacy.edges).filter((key) => legacy.edges[key].tier === 'primary'));
  const scene = M.loadCurrent();
  scene.routes = scene.routes.filter((r) => legacyPrimary.has(r.key));
  assert.equal(M.measure(scene).crossings.PP, 0);
  assert.equal(report.edges.count, Object.keys(routes.edges).length);
});
