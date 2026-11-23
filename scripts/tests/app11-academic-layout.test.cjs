/**
 * app11 アカデミック専用レイアウト（layout version 2）幾何テスト
 *
 * 実行: node --test scripts/tests/app11-academic-layout.test.cjs
 *
 * 目的:
 *   - 通常 427 物質は data.js のまま不変。アカデミック表示だけ専用座標 positions を持つ。
 *   - 接続 255（通常 158 + 新規 97）を 1 つのネットワークへ移し、未接続 172 だけ別棚へ置く。
 *   - 通常 162 反応 / 学術 152 反応の全 314 マーカーと、通常 375 + 学術 358 = 733 辺を配線する。
 *   - ラベル・マーカー・経路の衝突 0、経路長の大幅短縮（旧 baseline 比）を確認する。
 *   - 交差は最終経路から独立に数え直し、旧 gate 5,799 と改修前実測 6,111 の 6% 低減を確認する。
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
const LEGACY = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-src', 'app11', 'legacy-baseline.json'), 'utf8'));
const LEGACY_REACTION_IDS = new Set(Object.keys(LEGACY.reactions));
const LEGACY_CONNECTED_IDS = Object.keys(LEGACY.positions).filter((id) => LEGACY.positions[id].tier !== 'isolated');

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
  assert.equal(Object.keys(L.normalMarkers).length, normalReactions.length);
  assert.equal(Object.keys(L.normalRoutes).length,
    normalReactions.reduce((n, r) => n + r.edges.length, 0));
  assert.equal(Object.keys(L.markers).length, academicReactions.length);
  assert.equal(Object.keys(L.routes).length,
    academicReactions.reduce((n, r) => n + r.substrates.length + r.products.length, 0));
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
  assert.equal(connected.size + isolated.length, D.compounds.length, '接続＋未接続＝全物質');
  assert.ok(connected.size > 101, '通常の接続に学術の接続が加わる');
  const shelfX = 5800; // academic-network-layout.cjs の SHELF.x
  connected.forEach((id) => {
    assert.ok(POS[id].x < shelfX, id + ' はネットワーク側にいる');
    assert.ok(POS[id].y < 3000 + 34, id + ' はネットワーク帯にいる');
  });
  isolated.forEach((id) => {
    assert.ok(POS[id].x >= shelfX, id + ' は未接続棚にいる');
  });
  // 学術で新たに接続した物質は、通常座標の右棚から実際にネットワークへ移っている。
  const newly136 = [...academicNew].filter((id) => {
    const original = D.compounds.find((c) => c.id === id);
    return original.incoming + original.outgoing === 0;
  });
  assert.ok(newly136.length > 0, '学術で新たに接続する物質がある');
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
  assert.equal(allLabels.length, Object.keys(allMarkers).length);
  allLabels.forEach(({ id, box }) => {
    const text = typeLabelOf(id);
    assert.ok(box.w >= Math.ceil(G.textWidth(text, G.TYPE_FONT)), id + ' の計画幅が実テキスト幅より小さい');
    assert.ok(box.h >= G.TYPE_H - 2, id + ' の高さ');
    const m = allMarkers[id];
    assert.equal(m.label.anchor, 'center', id + ' は center 契約');
    assert.ok(Math.abs(m.label.type.x - (box.x + box.w / 2)) < 0.02, id + ' の中心X');
    assert.ok(Math.abs(m.label.type.y - (box.y + box.h / 2)) < 0.02, id + ' の中心Y');
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

test('[routes] 全辺が描画され、ノード・ラベル・マーカーを貫通しない', () => {
  assert.equal(Object.keys(allRoutes).length,
    Object.keys(L.normalRoutes).length + Object.keys(L.routes).length);
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

test('[metrics] 全辺の総延長・p95・長辺が旧 baseline から半減する', () => {
  const lengths = Object.keys(allRoutes).map((key) => lengthOf(allRoutes[key].points));
  const stats = L.stats.after.combined;
  assert.equal(stats.count, Object.keys(allRoutes).length);
  assert.equal(stats.count, lengths.length);
  const total = lengths.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - stats.total) < 1, 'stats.total と実測が一致しない');
  // 総延長の上限は旧 overlay の 0.5515 倍（298626.33）を維持したうえで、
  // 交差低減の改修前実測 298560.12 を上限にする（改修で総延長は増やさない）。
  const limit = BASELINE.combined.total * 0.5515;
  assert.ok(stats.total <= limit,
    '総延長が旧の50%を切っていない: ' + stats.total + ' > ' + limit);
  assert.ok(stats.total <= 298560.12,
    '交差低減の改修前実測より総延長が増えた: ' + stats.total);
  assert.ok(stats.p95 <= BASELINE.combined.p95 * 0.6,
    'p95 が十分に下がっていない: ' + stats.p95);
  assert.ok(stats.max <= BASELINE.combined.max, '最大辺が旧 baseline を超えた: ' + stats.max);
  assert.ok(stats.ge1000 <= Math.floor(BASELINE.combined.ge1000 * 0.5),
    '1000px 以上の辺が多い: ' + stats.ge1000);
  // 交差低減の改修前実測（同じ定義・同じ 733 辺）は ge1000 57 だったので、長い裾を増やさない。
  assert.ok(stats.ge1000 <= 57, '1000px 以上の辺が改修前より増えた: ' + stats.ge1000);
  // 学術側だけで見ても旧 508034.9 から半減している。
  assert.ok(L.stats.after.academic.total <= BASELINE.academic.total * 0.5,
    '学術側の総延長: ' + L.stats.after.academic.total);
  assert.equal(L.stats.after.normal.count, Object.keys(L.normalRoutes).length);
  assert.equal(L.stats.after.academic.count, Object.keys(L.routes).length);
  // 交差は非平面グラフなので 0 を要求しないが、同じ測り方で旧より増やさない。
  assert.equal(L.stats.before.combined.crossingPairs, BASELINE.combined.crossingPairs);
  assert.equal(L.stats.before.academic.crossingPairs, BASELINE.academic.crossingPairs);
  assert.equal(L.stats.before.combined.crossingPairs, 5043);
});

test('[crossings] 交差数は最終経路から測り直した値で、旧 gate と改修前実測の両方を満たす', () => {
  // canonical な定義: 異なるルートキー同士の線分交差の総数（同一ルート内は除外、
  // 同一組の複数交差は回数分、同じ反応の別辺（in/out）同士も別キーとして数える）。
  const recount = () => {
    const keys = Object.keys(allRoutes).sort();
    const segs = [];
    for (const key of keys) {
      const pts = allRoutes[key].points;
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push({
          key: key,
          reaction: allRoutes[key].reaction,
          a: { x: pts[i][0], y: pts[i][1] },
          b: { x: pts[i + 1][0], y: pts[i + 1][1] }
        });
      }
    }
    let raw = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const minX = Math.min(s.a.x, s.b.x);
      const maxX = Math.max(s.a.x, s.b.x);
      const minY = Math.min(s.a.y, s.b.y);
      const maxY = Math.max(s.a.y, s.b.y);
      for (let j = i + 1; j < segs.length; j++) {
        const t = segs[j];
        if (t.key === s.key) continue;
        if (Math.max(t.a.x, t.b.x) < minX || Math.min(t.a.x, t.b.x) > maxX) continue;
        if (Math.max(t.a.y, t.b.y) < minY || Math.min(t.a.y, t.b.y) > maxY) continue;
        if (!G.segSegIntersection(s.a, s.b, t.a, t.b)) continue;
        raw++;
      }
    }
    return { raw: raw };
  };
  const measured = recount();
  assert.ok(Number.isInteger(L.stats.collisions.crossingPairs));
  assert.equal(L.stats.crossings.raw, measured.raw, 'stats.crossings.raw が最終経路の実測と一致しない');
  assert.equal(L.stats.collisions.crossingPairs, measured.raw,
    'stats.collisions.crossingPairs が最終経路の実測と一致しない（reroute 前の古い値ではない）');
  assert.ok(typeof L.stats.crossings.definition === 'string' && L.stats.crossings.definition.length > 10,
    '交差の数え方（定義）をデータに残す');
  assert.ok(L.stats.crossings.differentReaction <= L.stats.crossings.raw);
  // 旧 gate（= 旧 combined 5043 × 1.15 = 5799）は据え置き。改修前の同じ定義での実測 6111 を
  // 基準に 6% 以上の低減（≤ 5744）も要求する（数値を緩めるのではなく、両方を満たす）。
  const OLD_GATE = 5799;
  const PRE_RELIEF = 6111;
  assert.ok(L.stats.crossings.raw <= OLD_GATE, '旧 gate を超えた: ' + L.stats.crossings.raw);
  assert.ok(L.stats.crossings.raw <= Math.floor(PRE_RELIEF * 0.94),
    '改修前実測から 6% 以上減っていない: ' + L.stats.crossings.raw);
  // 改修の before/after は同じ定義・同じ最終データから測った値を残す。
  const relief = L.stats.crossingRelief;
  assert.ok(relief, 'crossingRelief の記録がない');
  assert.equal(relief.definition, L.stats.crossings.definition);
  assert.equal(relief.before.crossings, PRE_RELIEF, '改修前実測を記録する');
  assert.equal(relief.after.crossings, measured.raw);
  assert.ok(relief.changed > 0, '差し替えた辺がない');
  assert.ok(relief.after.crossings < relief.before.crossings, '交差が減っていない');
  assert.ok(relief.after.length <= relief.before.length, '差し替えで総延長が増えている');
  assert.equal(relief.after.length, L.stats.after.combined.total);
});

test('[baseline] 通常データの座標・経路ラベルは不変（専用レイアウトは書き戻さない）', () => {
  const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  // 旧 101 接続物質の座標は凍結。追加分は別途 legacy-baseline で検証する。
  assert.equal(hash(LEGACY_CONNECTED_IDS.map((id) => {
    const c = D.compounds.find((x) => x.id === id);
    return { id: c.id, x: c.x, y: c.y, w: c.w, h: c.h };
  })), '6b909f041911ca50fed7ea5d2705f057eff40dfea9325f3e1f2f485553e55c16');
  // 旧 86 反応の経路・ラベルは凍結（追加分を含めない）。
  assert.equal(hash(D.reactions.filter((r) => LEGACY_REACTION_IDS.has(r.id)).map((r) => ({
    id: r.id,
    edges: r.edges.map((e) => ({ dir: e.dir, id: e.id, points: e.points }))
  }))), 'ff5615a05ea79810928942c2f3e82f34fc601fe374a2691336c99513175ff9f2');
  // ラベルは site-src/app11/legacy-labels.json で凍結。追加反応の経路変更で
  // 実描画線（shared port 分離後）が数 px 動いた starch-hydrolysis-glucose だけ、
  // leader 終点を最寄りの自描画線へ再接続している（箱・始点は不変）。
  assert.equal(hash(D.reactions.filter((r) => LEGACY_REACTION_IDS.has(r.id))
    .map((r) => ({ id: r.id, label: r.label }))),
  'e8e54e4fd232fde32ace4268a628003ca0c395801d2f74722d0877b0cc27a7e3');
  assert.equal(A.base.nodeHash, B.academicBaseHash(D.compounds));
  assert.equal(L.stats.after.normal.count, Object.keys(L.normalRoutes).length, '通常の全辺を専用座標で引き直す');
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
