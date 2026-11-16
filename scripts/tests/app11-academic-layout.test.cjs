/**
 * app11 アカデミック専用レイアウト（layout version 2）幾何テスト
 *
 * 実行: node --test scripts/tests/app11-academic-layout.test.cjs
 *
 * 目的:
 *   - 通常 427 物質は data.js のまま不変。アカデミック表示だけ専用座標 positions を持つ。
 *   - 接続 237（通常 101 + 新規 136）を 1 つのネットワークへ移し、未接続 190 だけ別棚へ置く。
 *   - 通常 86 反応 / 学術 178 反応の全 264 マーカーと、通常 207 + 学術 421 = 628 辺を配線する。
 *   - ラベル・マーカー・経路の衝突 0、経路長の大幅短縮（旧 baseline 比）を確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const B = require(path.join(ROOT, 'scripts', 'app11', 'build-academic-data.cjs'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures',
  'app11-academic-layout-baseline.json'), 'utf8'));

// 重い力配置・配線は 1 回だけ実行し、全テストで共有する。
const BUILT = B.build();
const L = A.layout;
const POS = L.positions;

const normalReactions = D.reactions;
const academicReactions = A.reactions;
const allMarkers = Object.assign({}, L.normalMarkers, L.markers);
const allRoutes = Object.assign({}, L.normalRoutes, L.routes);
const allLabels = Object.keys(allMarkers).map((id) => ({ id: id, box: allMarkers[id].label.box }));
const nodeIds = Object.keys(POS);

const overlap = (a, b, pad) => !(
  a.x + a.w + (pad || 0) <= b.x ||
  b.x + b.w + (pad || 0) <= a.x ||
  a.y + a.h + (pad || 0) <= b.y ||
  b.y + b.h + (pad || 0) <= a.y
);
const lengthOf = (points) => {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return sum;
};
const typeLabelOf = (id) => {
  const normal = normalReactions.find((r) => r.id === id);
  if (normal) return normal.typeLabel || normal.type;
  const academic = academicReactions.find((r) => r.id === id);
  return academic.typeLabel || academic.type;
};

test('[contract] layout version 2 の件数と ID 集合', () => {
  assert.equal(L.version, 2);
  assert.equal(nodeIds.length, 427, 'positions は全 427 物質');
  assert.deepEqual(new Set(nodeIds), new Set(D.compounds.map((c) => c.id)));
  nodeIds.forEach((id) => {
    const p = POS[id];
    [p.x, p.y, p.w, p.h].forEach((v) => assert.ok(Number.isFinite(v), id + ' の座標が有限でない'));
    assert.ok(p.w > 0 && p.h > 0, id + ' の寸法');
  });
  assert.equal(Object.keys(L.normalMarkers).length, 86);
  assert.equal(Object.keys(L.normalRoutes).length, 207);
  assert.equal(Object.keys(L.markers).length, 178);
  assert.equal(Object.keys(L.routes).length, 421);
  assert.equal(nodeIds.length, D.meta.compoundCount);
  // 通常マーカーの tier は元の primary / secondary を保持する。
  Object.keys(L.normalMarkers).forEach((id) => {
    const original = normalReactions.find((r) => r.id === id);
    assert.ok(original, '通常反応ID: ' + id);
    assert.equal(L.normalMarkers[id].tier, original.tier, id + ' の tier');
    assert.ok(['E', 'W'].includes(L.normalMarkers[id].label.side), id + ' のラベル側');
    assert.equal(L.normalMarkers[id].label.cond, null);
  });
  Object.keys(L.markers).forEach((id) => {
    assert.equal(L.markers[id].tier, 'academic');
  });
  assert.deepEqual(L.warnings, []);
});

test('[network] 接続237はネットワーク、未接続190だけ別棚', () => {
  const academicNew = new Set();
  academicReactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => academicNew.add(id)));
  const normalConnected = new Set(D.compounds.filter((c) => c.incoming + c.outgoing > 0).map((c) => c.id));
  const connected = new Set([...normalConnected, ...academicNew]);
  const isolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0 && !academicNew.has(c.id)).map((c) => c.id);
  assert.equal(connected.size, 237);
  assert.equal(isolated.length, 190);
  const shelfX = 5800; // academic-network-layout.cjs の SHELF.x
  connected.forEach((id) => {
    assert.ok(POS[id].x < shelfX, id + ' はネットワーク側にいる');
    assert.ok(POS[id].y < 3000 + 34, id + ' はネットワーク帯にいる');
  });
  isolated.forEach((id) => {
    assert.ok(POS[id].x >= shelfX, id + ' は未接続棚にいる');
  });
  // 学術で新たに接続した 136 は、通常座標の右棚から実際にネットワークへ移っている。
  const newly136 = [...academicNew].filter((id) => {
    const original = D.compounds.find((c) => c.id === id);
    return original.incoming + original.outgoing === 0;
  });
  assert.equal(newly136.length, 136);
  // 新規 136 は通常の右棚（x>=4223）からネットワーク（x<5800）へ実際に移る。
  newly136.forEach((id) => {
    const original = D.compounds.find((c) => c.id === id);
    const dist = Math.hypot(POS[id].x - original.x, POS[id].y - original.y);
    assert.ok(dist > 100, id + ' が通常の右棚から動いていない');
    assert.ok(POS[id].x < shelfX, id + ' がネットワークへ移っていない');
  });
  // ネットワークの広がりは通常 canvas の左側領域に収まる（class map は x>=4170）。
  let maxX = 0;
  connected.forEach((id) => { maxX = Math.max(maxX, POS[id].x + POS[id].w); });
  assert.ok(maxX <= 4100, 'ネットワークが class map に食い込む: ' + maxX);
  // 通常 101 接続のノードも学術表示では専用座標へ動く（D 側は不変）。
  normalConnected.forEach((id) => {
    const original = D.compounds.find((c) => c.id === id);
    assert.ok(Math.hypot(POS[id].x - original.x, POS[id].y - original.y) > 1, id + ' が専用座標へ移っていない');
  });
});

test('[labels] 全264ラベル・マーカーはノード・相互・一般図と衝突しない', () => {
  assert.equal(allLabels.length, 264);
  allLabels.forEach(({ id, box }) => {
    const text = typeLabelOf(id);
    assert.ok(box.w >= Math.ceil(G.textWidth(text, G.TYPE_FONT)), id + ' の計画幅が実テキスト幅より小さい');
    assert.ok(box.h >= G.TYPE_H - 2, id + ' の高さ');
    const m = allMarkers[id];
    if (m.label.side === 'E') {
      assert.equal(Math.round(m.label.type.x + 11), Math.round(box.x), id + ' のEアンカー');
    } else {
      assert.equal(Math.round(m.label.type.x - 11), Math.round(box.x + box.w), id + ' のWアンカー');
    }
    nodeIds.forEach((nid) => {
      assert.equal(overlap(box, POS[nid]), false, id + ' のラベルがノード ' + nid + ' と重なる');
    });
    D.classMap.nodes.forEach((n) => {
      assert.equal(overlap(box, n), false, id + ' のラベルが一般図ノードと重なる');
    });
    assert.equal(overlap(box, D.classMap.frame), false, id + ' のラベルが一般図の枠と重なる');
  });
  for (let i = 0; i < allLabels.length; i++) {
    for (let j = i + 1; j < allLabels.length; j++) {
      assert.equal(overlap(allLabels[i].box, allLabels[j].box), false,
        allLabels[i].id + ' / ' + allLabels[j].id + ' のラベル重複');
    }
  }
  // マーカー円 vs ノード・相互。
  const ids = Object.keys(allMarkers);
  ids.forEach((id) => {
    const m = allMarkers[id];
    nodeIds.forEach((nid) => {
      const r = POS[nid];
      const inside = m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
      assert.equal(inside, false, id + ' のマーカーがノード ' + nid + ' 内');
    });
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = allMarkers[ids[i]];
      const b = allMarkers[ids[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= G.MARKER_R * 2,
        ids[i] + ' / ' + ids[j] + ' のマーカーが近すぎる');
    }
  }
  assert.equal(L.stats.collisions.labelLabelOverlaps, 0);
  assert.equal(L.stats.collisions.labelNodeOverlaps, 0);
  assert.equal(L.stats.collisions.labelClassMapOverlaps, 0);
  assert.equal(L.stats.collisions.markerNodeOverlaps, 0);
  assert.equal(L.stats.collisions.markerMarkerOverlaps, 0);
});

test('[routes] 全628辺が描画され、ノード・ラベル・マーカーを貫通しない', () => {
  assert.equal(Object.keys(allRoutes).length, 628);
  const expectedNormal = new Set();
  normalReactions.forEach((r) => r.edges.forEach((e) => expectedNormal.add(r.id + '|' + e.dir + '|' + e.id)));
  assert.deepEqual(new Set(Object.keys(L.normalRoutes)), expectedNormal);
  const expectedAcademic = new Set();
  academicReactions.forEach((r) => {
    r.substrates.forEach((id) => expectedAcademic.add(r.id + '|in|' + id));
    r.products.forEach((id) => expectedAcademic.add(r.id + '|out|' + id));
  });
  assert.deepEqual(new Set(Object.keys(L.routes)), expectedAcademic);

  Object.keys(allRoutes).forEach((key) => {
    const route = allRoutes[key];
    const compound = POS[route.compound];
    const marker = allMarkers[route.reaction];
    assert.ok(compound, key + ' の端点物質');
    assert.ok(marker, key + ' のマーカー');
    assert.ok(route.points.length >= 2, key + ' の点列');
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    assert.ok(Math.abs(last[0] - marker.x) < 0.02 && Math.abs(last[1] - marker.y) < 0.02,
      key + ' がマーカー中心で終わっていない');
    const onBoundary = (Math.abs(first[0] - compound.x) < 0.02 || Math.abs(first[0] - (compound.x + compound.w)) < 0.02 ||
      Math.abs(first[1] - compound.y) < 0.02 || Math.abs(first[1] - (compound.y + compound.h)) < 0.02) &&
      first[0] >= compound.x - 0.02 && first[0] <= compound.x + compound.w + 0.02 &&
      first[1] >= compound.y - 0.02 && first[1] <= compound.y + compound.h + 0.02;
    assert.ok(onBoundary, key + ' がノード境界から出ていない');
    route.points.forEach((p) => {
      assert.ok(p[0] >= L.canvas.x && p[0] <= L.canvas.x + L.canvas.w, key + ' のxがcanvas外');
      assert.ok(p[1] >= L.canvas.y && p[1] <= L.canvas.y + L.canvas.h, key + ' のyがcanvas外');
    });
    const pts = route.points.map((p) => ({ x: p[0], y: p[1] }));
    for (let i = 0; i < pts.length - 1; i++) {
      nodeIds.forEach((nid) => {
        if (nid === route.compound && i === 0) return; // 端点ノードの外向き最初の区間だけ許す
        assert.equal(G.segmentRect(pts[i], pts[i + 1], POS[nid]), false,
          key + ' がノード ' + nid + ' を貫通');
      });
      allLabels.forEach((label) => {
        assert.equal(G.segmentRect(pts[i], pts[i + 1], label.box), false,
          key + ' がラベル ' + label.id + ' を貫通');
      });
      Object.keys(allMarkers).forEach((mid) => {
        if (mid === route.reaction) return;
        assert.ok(G.distPointSeg(allMarkers[mid], pts[i], pts[i + 1]) >= G.MARKER_R,
          key + ' がマーカー ' + mid + ' を貫通');
      });
    }
  });
  assert.equal(L.stats.collisions.routeNodePenetrations, 0);
  assert.equal(L.stats.collisions.routeLabelPenetrations, 0);
  assert.equal(L.stats.collisions.routeMarkerPenetrations, 0);
});

test('[metrics] 全628辺の総延長・p95・長辺が旧 baseline から半減する', () => {
  const lengths = Object.keys(allRoutes).map((key) => lengthOf(allRoutes[key].points));
  const stats = L.stats.after.combined;
  assert.equal(stats.count, 628);
  assert.equal(stats.count, lengths.length);
  const total = lengths.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - stats.total) < 1, 'stats.total と実測が一致しない');
  const limit = BASELINE.combined.total * 0.5; // <= 270740
  assert.ok(stats.total <= limit,
    '総延長が旧の50%を切っていない: ' + stats.total + ' > ' + limit);
  assert.ok(stats.p95 <= BASELINE.combined.p95 * 0.6,
    'p95 が十分に下がっていない: ' + stats.p95);
  assert.ok(stats.max <= BASELINE.combined.max, '最大辺が旧 baseline を超えた: ' + stats.max);
  assert.ok(stats.ge1000 <= Math.floor(BASELINE.combined.ge1000 * 0.5),
    '1000px 以上の辺が多い: ' + stats.ge1000);
  // 学術側だけで見ても旧 508034.9 から半減している。
  assert.ok(L.stats.after.academic.total <= BASELINE.academic.total * 0.5,
    '学術側の総延長: ' + L.stats.after.academic.total);
  assert.equal(L.stats.after.normal.count, 207);
  assert.equal(L.stats.after.academic.count, 421);
  // 交差は非平面グラフなので 0 を要求しないが、同じ測り方で旧より増やさない。
  assert.equal(L.stats.before.combined.crossingPairs, BASELINE.combined.crossingPairs);
  assert.equal(L.stats.before.academic.crossingPairs, BASELINE.academic.crossingPairs);
  assert.equal(L.stats.before.combined.crossingPairs, 5043);
  assert.ok(Number.isInteger(L.stats.collisions.crossingPairs));
  assert.ok(L.stats.collisions.crossingPairs < L.stats.before.combined.crossingPairs,
    '交差が旧 combined より増えた: ' + L.stats.collisions.crossingPairs);
});

test('[baseline] 通常データの座標・経路ラベルは不変（専用レイアウトは書き戻さない）', () => {
  const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(hash(D.compounds.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }))),
    '68a5dd2b99ef5095c75a127f002fbb4eea5e33f6dade8ff8270ccdd6d6ba6972');
  assert.equal(hash(D.reactions.map((r) => ({
    id: r.id,
    edges: r.edges.map((e) => ({ dir: e.dir, id: e.id, points: e.points }))
  }))), 'ff5615a05ea79810928942c2f3e82f34fc601fe374a2691336c99513175ff9f2');
  assert.equal(hash(D.reactions.map((r) => ({ id: r.id, label: r.label }))),
    '532cc5f260526bccc38bd478f9ec294dc7f0ae6d8ebf763b585c0746b820c244');
  assert.equal(A.base.nodeHash, B.academicBaseHash(D.compounds));
  assert.equal(L.stats.after.normal.count, 207, '通常207辺は専用座標で引き直す');
});

test('[determinism] 1回の build が生成ファイルと一致し、再実行しても同値', () => {
  const rendered = B.renderAcademicData(BUILT);
  const current = fs.readFileSync(path.join(APP, 'academic-data.js'), 'utf8');
  assert.equal(current, rendered, 'site/app11/academic-data.js が最新でない');
  const again = B.renderAcademicData(B.build());
  assert.equal(again, rendered, '同じ正本から同じ出力にならない');
  assert.equal(A.layout.version, 2);
  assert.equal(L.stats.collisions.nodeNodeOverlaps, 0);
  assert.equal(L.stats.collisions.routeNodePenetrations, 0);
  assert.equal(L.stats.collisions.routeLabelPenetrations, 0);
  assert.equal(L.stats.collisions.routeMarkerPenetrations, 0);
  assert.deepEqual(L.warnings, []);
});

test('[regionFocus] 接続ノードのある領域はその範囲を、無い領域は棚の範囲を返す', () => {
  const regions = new Set(D.compounds.map((c) => c.region));
  const focus = L.regionFocus;
  assert.deepEqual(new Set(Object.keys(focus)), regions);
  Object.keys(focus).forEach((region) => {
    const rect = focus[region];
    [rect.x, rect.y, rect.w, rect.h].forEach((v) => assert.ok(Number.isFinite(v), region + ' の値'));
    assert.ok(rect.w > 0 && rect.h > 0);
    if (!rect.connected) return;
    D.compounds.filter((c) => c.region === region && c.incoming + c.outgoing > 0).forEach((c) => {
      const p = POS[c.id];
      assert.ok(p.x >= rect.x && p.y >= rect.y && p.x + p.w <= rect.x + rect.w && p.y + p.h <= rect.y + rect.h,
        region + ' の focus が接続ノード ' + c.id + ' を含まない');
    });
  });
});
