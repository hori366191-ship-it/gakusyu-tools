/*
 * app11 反応マップ — connector（描画用の接続）回帰テスト
 *
 * 保存データ（207 辺・86 反応・一般図16変換）は変えない。
 * 描画時に「反応の丸を消し、frame→arrow→frame に揃える」ための純関数を検証する。
 * 単なる保存点列の metrics ではなく、実際に routePath が返す path をサンプリングして
 * 交差・貫通・共有区間・端点誤差を見る。
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
const LEGACY = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-src', 'app11', 'legacy-baseline.json'), 'utf8'));
const LEGACY_PRIMARY_IDS = new Set(Object.keys(LEGACY.reactions).filter((id) => LEGACY.reactions[id].tier === 'primary'));
const LEGACY_REACTION_IDS = new Set(Object.keys(LEGACY.reactions));
const NEW_REACTION_COMPOUNDS = new Set();
D.reactions.filter((r) => !LEGACY_REACTION_IDS.has(r.id)).forEach((r) => {
  r.substrates.concat(r.products).forEach((id) => NEW_REACTION_COMPOUNDS.add(id));
});

const NODE_W = D.meta.nodeW;
const NODE_H = D.meta.nodeH;
const byId = {};
D.compounds.forEach((c) => { byId[c.id] = c; });

function connectorsForAll(filter) {
  const all = [];
  D.reactions.forEach((r) => {
    if (filter && !filter(r)) return;
    const list = Core.reactionConnectors(r, {
      compoundById: byId,
      nodeW: NODE_W,
      nodeH: NODE_H
    });
    list.forEach((c) => { c.rid = r.id; c.reaction = r; });
    all.push(...list);
  });
  Core.separateSharedPorts(all);
  Core.enforcePaintClearance(all);
  return all;
}

function segments(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) out.push([points[i], points[i + 1]]);
  return out;
}

function samples(connector) {
  // 実際に描く shaft（triangle の底で trim 済み）をサンプリングする。
  return Core.samplePath(Core.routePath(connector.shaft || connector.points, [], []), 2.5).flat();
}

function arrowSamples(connector) {
  const h = connector.arrowHead;
  if (!h) return [];
  const out = [];
  const cs = [h.tip, h.left, h.right, h.tip];
  for (let i = 0; i < cs.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.2) {
      out.push({ x: cs[i].x + (cs[i + 1].x - cs[i].x) * t, y: cs[i].y + (cs[i + 1].y - cs[i].y) * t });
    }
  }
  return out;
}

function haloWidth(c) {
  // 選択・active を含む保守的な実paint幅（primary 4.4 / secondary 2.4）。
  return c.tier === 'primary' ? 4.4 : 2.4;
}

function intersect(a, b, c, d) {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointSegDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
}

function segParallel(a, b, c, d) {
  const l1 = Math.hypot(b.x - a.x, b.y - a.y);
  const l2 = Math.hypot(d.x - c.x, d.y - c.y);
  if (!l1 || !l2) return 0;
  return Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) / (l1 * l2);
}

function overlapLength(a, b, c, d) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const l = Math.hypot(ux, uy);
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const l2 = Math.hypot(vx, vy);
  if (l < 1e-9 || l2 < 1e-9) return 0;
  if (Math.abs((ux * vy - uy * vx) / (l * l2)) > 0.01) return 0;
  const nx = -uy / l;
  const ny = ux / l;
  if (Math.abs((c.x - a.x) * nx + (c.y - a.y) * ny) > 0.6) return 0;
  if (Math.abs((d.x - a.x) * nx + (d.y - a.y) * ny) > 0.6) return 0;
  const proj = (p) => ((p.x - a.x) * ux + (p.y - a.y) * uy) / l;
  const t = [proj(c), proj(d)].sort((x, y) => x - y);
  return Math.max(0, Math.min(l, t[1]) - Math.max(0, t[0]));
}

test('[fixture] 角丸枠の角付近でも端点は実際の輪郭上に乗る', () => {
  const rect = { x: 100, y: 100, w: 136, h: 34 };
  const points = [{ x: 60, y: 70 }, { x: 104, y: 100 }]; // 左上の角丸にかかる保存端点
  const off = Core.endpointOffsets(3, 3, 0.75).arrow;
  const snapped = Core.snapEndpoint(points, 1, rect, 9, off);
  const p = snapped[1];
  assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off + 0.05)), true);
  assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off - 0.5)), false);
  // 軸矩形の角をそのまま使わない（見かけのズレを作らない）
  assert.notEqual(p.x, 104);
});

test('[fixture] 角丸に入る共有portも輪郭上で、指定した辺座標を保つ', () => {
  const rect = { x: 100, y: 100, w: 136, h: 34 };
  const off = Core.endpointOffsets(0, 1.2, 0.75, 'butt').cap;
  ['L', 'R', 'T', 'B'].forEach((side) => {
    const along = side === 'L' || side === 'R' ? 103 : 103;
    const p = Core.portPointOnOutline(side, rect, along, 9, off);
    assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off + 0.02)), true, side);
    assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off - 0.5)), false, side);
    const kept = side === 'L' || side === 'R' ? p.y : p.x;
    assert.ok(Math.abs(kept - along) < 1e-9, side + ' の辺座標');
  });
});

test('[fixture] 斜めの曲線でも最終線分と角丸輪郭の交点に寄せる', () => {
  const rect = { x: 300, y: 300, w: 136, h: 34 };
  const points = [{ x: 420, y: 420 }, { x: 360, y: 350 }, { x: 310, y: 316 }];
  const off = Core.endpointOffsets(1.1, 3, 0.75).cap;
  const snapped = Core.snapEndpoint(points, 2, rect, 9, off);
  const p = snapped[2];
  assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off + 0.05)), true);
  assert.equal(Core.pointInRoundRect(p, Core.inflateRoundRect(rect, 9, off - 0.5)), false);
  // 直前の点との向きは保存点列の最終線分とほぼ同じ
  const before = Math.atan2(316 - 350, 310 - 360);
  const after = Math.atan2(p.y - 350, p.x - 360);
  assert.ok(Math.abs(before - after) < 0.12, '最終線分の向きを変えない');
});

test('[fixture] gap 0.75 / 1 / 1.5・butt cap・tip の数値規則が一意', () => {
  for (const gap of [0.75, 1, 1.5]) {
    const o = Core.endpointOffsets(3, 3, gap);
    assert.equal(o.arrow, 1.5 + gap + Core.CONNECTOR.PAINT_SAFETY);
    assert.equal(o.cap, 1.5 + gap + Core.CONNECTOR.PAINT_SAFETY + 1.5, 'round cap の互換計算');
    const butt = Core.endpointOffsets(3, 3, gap, 'butt');
    assert.equal(butt.cap, butt.arrow, 'butt は path 終点で止まる');
    assert.equal(Core.CONNECTOR.ARROW_REF_X, 8, 'tip を path 終点に置く');
  }
  const meta = Core.connectorMetadata([0.75, 1, 1.5]);
  assert.equal(meta.nodeRx, 9);
  assert.deepEqual(meta.variants.map((v) => v.gap), [0.75, 1, 1.5]);
  assert.equal(meta.variants[0].node.arrow, 0.6 + 0.75 + Core.CONNECTOR.PAINT_SAFETY);
  assert.equal(meta.variants[0].hub.arrow, 0.8 + 0.75 + Core.CONNECTOR.PAINT_SAFETY);
  assert.equal(meta.variants[2].class.arrow, 0.7 + 1.5 + Core.CONNECTOR.PAINT_SAFETY);
  assert.equal(meta.variants[0].node.cap, meta.variants[0].node.arrow);
  assert.equal(meta.variants[0].capMode, 'butt');
  assert.deepEqual(meta.variants[0].actualGap, { node: 0.76, hub: 0.76, class: 0.76 });
});

test('[data] 全辺・全反応・一般図16変換の保存値を保つ', () => {
  let edges = 0;
  D.reactions.forEach((r) => { edges += r.edges.length; });
  assert.equal(edges, D.reactions.reduce((n, r) => n + r.edges.length, 0));
  assert.ok(edges >= LEGACY.counts.edges, '旧 207 辺は残す');
  assert.equal(D.reactions.length, D.meta.reactionCount);
  assert.equal(D.classMap.edges.length, 16);
  D.reactions.forEach((r) => r.edges.forEach((e) => {
    assert.ok(Array.isArray(e.points) && e.points.length >= 2);
    assert.deepEqual(e.gaps, []);
    assert.deepEqual(e.bridges, []);
  }));
});

test('[short stub] sucrose→glucose は shaft を triangle 底で止め、丸棒が tip を追い越さない', () => {
  const r = D.reactions.find((x) => x.id === 'sucrose-hydrolysis');
  const list = Core.reactionConnectors(r, { compoundById: byId, nodeW: NODE_W, nodeH: NODE_H });
  const glucose = list.find((c) => c.edgeId === 'glucose');
  assert.equal(glucose.arrow, true);
  assert.ok(glucose.arrowHead, 'triangle を別 path で持つ');
  assert.equal(glucose.arrowHead.headLength, 7);
  assert.ok(glucose.length > 8, 'connector 長 ' + glucose.length);
  glucose.ends.forEach((e) => {
    assert.ok(Math.abs((e.offset - e.nodeStroke / 2) - 0.75) <= 0.02, 'source butt / dest tip gap');
  });
  const g = byId.glucose;
  const tip = glucose.points[glucose.points.length - 1];
  const dx = Math.max(g.x - tip.x, 0, tip.x - (g.x + (g.w || NODE_W)));
  assert.ok(dx >= 1.4 && dx <= 1.7, '矢印先端は glucose の枠外 ' + dx + 'px');
  // shaft の終点＝triangle の底。active 4.4 の butt 端でも tip まで届かない。
  const shaftEnd = glucose.shaft[glucose.shaft.length - 1];
  assert.ok(Math.hypot(tip.x - shaftEnd.x, tip.y - shaftEnd.y) >= 6.9, 'triangle 長を確保');
  const tipGapFromShaft = Math.hypot(tip.x - shaftEnd.x, tip.y - shaftEnd.y) - haloWidth(glucose) / 2;
  assert.ok(tipGapFromShaft > 0, 'shaft 端が tip を追い越さない');
});

test('[multi] 入力の矢印を消し、出力だけ生成物向きの矢印にする', () => {
  const r = D.reactions.find((x) => x.id === 'sucrose-hydrolysis'); // 1入力2出力
  const list = Core.reactionConnectors(r, { compoundById: byId, nodeW: NODE_W, nodeH: NODE_H });
  const ins = list.filter((c) => c.dir === 'in');
  const outs = list.filter((c) => c.dir === 'out');
  assert.equal(ins.length, 1);
  assert.equal(outs.length, 2);
  assert.equal(ins[0].arrow, false);
  outs.forEach((c) => {
    assert.equal(c.arrow, true);
    const last = c.points[c.points.length - 1];
    const target = byId[c.edgeId];
    const first = c.points[0];
    const dLast = Math.hypot(last.x - (target.x + (target.w || NODE_W) / 2), last.y - (target.y + (target.h || NODE_H) / 2));
    const dFirst = Math.hypot(first.x - (target.x + (target.w || NODE_W) / 2), first.y - (target.y + (target.h || NODE_H) / 2));
    assert.ok(dLast < dFirst, '矢印側が生成物に近い: ' + c.edgeId);
  });
  // 全対全（入力×出力の複製）を作らない
  assert.equal(list.length, 3);
});

test('[reactant only] 生成物が無い反応は入力線だけを残し、矢印を付けない', () => {
  const r = D.reactions.find((x) => x.id === 'protein-hydrolysis');
  assert.ok(r, 'protein-hydrolysis');
  const list = Core.reactionConnectors(r, { compoundById: byId, nodeW: NODE_W, nodeH: NODE_H });
  assert.equal(list.length, r.edges.filter((e) => e.dir === 'in').length);
  assert.equal(list.every((c) => c.arrow === false), true);
});

test('[1in1out] 同一 tier はハブ中心を通る1本の連続 path にする', () => {
  const r = D.reactions.find((x) => {
    const ins = x.edges.filter((e) => e.dir === 'in');
    const outs = x.edges.filter((e) => e.dir === 'out');
    return ins.length === 1 && outs.length === 1 && ins[0].tier === outs[0].tier;
  });
  const list = Core.reactionConnectors(r, { compoundById: byId, nodeW: NODE_W, nodeH: NODE_H });
  assert.equal(list.length, 1);
  const c = list[0];
  assert.equal(c.edgeKeys.length, 2);
  const hubPoint = c.points.find((p) => Math.hypot(p.x - r.x, p.y - r.y) < 0.01);
  assert.ok(hubPoint, 'ハブ中心を通る（半径10の穴を作らない）');
  const d = Core.routePath(c.points, [], []);
  assert.equal((d.match(/M/g) || []).length, 1, '連続した1本');
});

test('[selection] 通常・選択・プレビューで同じ connector を使う', () => {
  const js = require('node:fs').readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('buildConnectors()'));
  assert.ok(js.includes('reactionConnectors[r.id] || []'));
  assert.ok(js.includes('通常表示と同じ connector を使う'));
  assert.ok(!/showReactionStroke[\s\S]{0,400}e\.points\.slice\(\)\.reverse\(\)/.test(js),
    '選択時だけ保存点列から別 geometry を作らない');
});

test('[actual] 描画 path を sampling して旧主要どうしの交差 0・node/label 貫通 0・共有区間 0', () => {
  const all = connectorsForAll();
  // 旧 86 の主要（legacy-primary）だけを対象に P–P 交差 0 を維持する。
  // 追加分の主要交差は許容し、貫通・共有区間は全経路で 0 を要求する。
  const primary = all.filter((c) => c.tier === 'primary' && LEGACY_PRIMARY_IDS.has(c.rid));
  // PP（主系列どうし）交差。同一反応内は反応ハブの合流として免除する。
  let pp = 0;
  for (let i = 0; i < primary.length; i++) {
    for (let j = i + 1; j < primary.length; j++) {
      const A = primary[i];
      const B = primary[j];
      if (A.rid === B.rid) continue;
      let hit = false;
      for (const x of segments(samples(A))) {
        for (const y of segments(samples(B))) {
          if (intersect(x[0], x[1], y[0], y[1])) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) pp++;
    }
  }
  assert.equal(pp, 0, '旧主要どうしの交差');
  // 追加分も含め、node 外周からの paint gap は全経路で満たす（下の gap 検査）。

  // 実ノード境界 stroke の外周から、全node/hubで同じ gap 0.75。
  all.forEach((c) => c.ends.forEach((e) => {
    const actual = e.offset - e.nodeStroke / 2;
    assert.ok(Math.abs(actual - Core.CONNECTOR.EDGE_GAP) <= 0.02,
      c.rid + ' ' + e.compoundId + ' gap=' + actual);
  }));

  // 実 paint 形状: source butt端面全体・destination triangle全頂点が node外周+0.75 の外。
  let shapeMin = Infinity;
  const shapeBad = [];
  all.forEach((c) => c.ends.forEach((e) => {
    const g = Core.connectorShapeGap(c, e);
    if (g == null) return;
    shapeMin = Math.min(shapeMin, g);
    if (g < Core.CONNECTOR.EDGE_GAP) shapeBad.push([c.rid, e.compoundId, e.role, g]);
  }));
  assert.deepEqual(shapeBad.slice(0, 5), [], 'paint形状の侵入');
  assert.ok(shapeMin >= Core.CONNECTOR.EDGE_GAP, 'shape min gap=' + shapeMin);

  // 受入NGだった斜めbutt / triangle 4件を固定回帰にする。
  const shapeFor = (rid, id, role) => {
    const c = all.find((x) => x.rid === rid && x.ends.some((e) => e.compoundId === id && e.role === role));
    const e = c.ends.find((x) => x.compoundId === id && x.role === role);
    return Core.connectorShapeGap(c, e);
  };
  assert.ok(shapeFor('glycerol-palmitic-esterification', 'glycerol', 'cap') >= 0.73);
  assert.ok(shapeFor('sucrose-hydrolysis', 'sucrose', 'cap') >= 0.73);
  ['ethyl-propionate-saponification', 'glucose-reduction',
    'acetic-acid-butanol-esterification', 'sucrose-hydrolysis'].forEach((rid) => {
    all.filter((c) => c.rid === rid).forEach((c) => c.ends.forEach((e) => {
      if (e.role !== 'arrow') return;
      assert.ok(Core.connectorShapeGap(c, e) >= 0.73, rid + ' ' + e.compoundId);
    }));
  });

  // node 貫通: centerline だけでなく実 stroke halo と arrowhead 外形も見る。
  const nodeHits = [];
  for (const c of all) {
    const margin = haloWidth(c) / 2;
    const probe = samples(c).concat(arrowSamples(c));
    for (const cp of D.compounds) {
      if (c.compounds.includes(cp.id)) continue;
      const x = cp.x - margin;
      const y = cp.y - margin;
      const w = (cp.w || NODE_W) + margin * 2;
      const h = (cp.h || NODE_H) + margin * 2;
      for (const s of probe) {
        if (s.x > x && s.x < x + w && s.y > y && s.y < y + h) {
          nodeHits.push([c.rid, c.edgeId, cp.id]);
          break;
        }
      }
    }
  }
  assert.deepEqual(nodeHits.slice(0, 5), [], 'node 貫通（halo+arrowhead）');

  // 反応ラベルの箱の貫通（halo を含む。自分以外の反応ラベル）
  const labelHits = [];
  for (const c of all) {
    const margin = haloWidth(c) / 2;
    const probe = samples(c).concat(arrowSamples(c));
    for (const r of D.reactions) {
      if (!r.label || r.id === c.rid) continue;
      const b = r.label.box;
      for (const s of probe) {
        if (s.x > b.x - margin && s.x < b.x + b.w + margin &&
          s.y > b.y - margin && s.y < b.y + b.h + margin) {
          labelHits.push([c.rid, c.edgeId, r.id]);
          break;
        }
      }
    }
  }
  assert.deepEqual(labelHits.slice(0, 5), [], 'label 貫通（halo）');

  // 別反応の近接平行の paint 重なり（centerline 距離 < 実幅の和/2）。
  // 同一物質の近接port（PORT_CLUSTER 内）は、port spacing で意図的に分けた区間だけ免除する。
  function pairOverlap(A, B) {
    const limit = (haloWidth(A.c) + haloWidth(B.c)) / 2 - 0.05;
    let best = { near: Infinity, point: null };
    for (const x of segments(A.pts)) {
      for (const y of segments(B.pts)) {
        if (segParallel(x[0], x[1], y[0], y[1]) > 0.08) continue;
        const candidates = [
          [pointSegDistance(x[0], y[0], y[1]), x[0]],
          [pointSegDistance(x[1], y[0], y[1]), x[1]],
          [pointSegDistance(y[0], x[0], x[1]), y[0]],
          [pointSegDistance(y[1], x[0], x[1]), y[1]]
        ];
        for (const cand of candidates) {
          if (cand[0] < best.near) best = { near: cand[0], point: cand[1] };
        }
      }
    }
    return { near: best.near, point: best.point, limit };
  }
  function sharedCompounds(A, B) {
    return A.c.compounds.filter((id) => B.c.compounds.indexOf(id) !== -1);
  }
  function nearCompoundPort(point, ids) {
    if (!point) return false;
    return ids.some((id) => {
      const cp = byId[id];
      if (!cp) return false;
      const dx = Math.max(cp.x - point.x, 0, point.x - (cp.x + (cp.w || NODE_W)));
      const dy = Math.max(cp.y - point.y, 0, point.y - (cp.y + (cp.h || NODE_H)));
      return Math.hypot(dx, dy) <= CONNECTOR_PORT_EXEMPT;
    });
  }
  const CONNECTOR_PORT_EXEMPT = 24;
  const shared = [];
  const sampled = all.map((c) => ({ c, pts: samples(c).concat(arrowSamples(c)) }));
  for (let i = 0; i < sampled.length; i++) {
    for (let j = i + 1; j < sampled.length; j++) {
      const A = sampled[i];
      const B = sampled[j];
      if (A.c.rid === B.c.rid) continue;
      // 旧 86 の組だけ、旧来の近接 paint 重なり 0 を維持する。
      // 追加分は交差・近接を許容する（node/label 貫通は全経路で別途 0）。
      if (!LEGACY_REACTION_IDS.has(A.c.rid) || !LEGACY_REACTION_IDS.has(B.c.rid)) continue;
      const result = pairOverlap(A, B);
      if (result.near >= result.limit - 0.3) continue;
      const common = sharedCompounds(A, B);
      if (common.some((id) => NEW_REACTION_COMPOUNDS.has(id))) continue;
      if (common.length && nearCompoundPort(result.point, common)) continue;
      shared.push([A.c.rid, A.c.edgeId, B.c.rid, B.c.edgeId, result.near, result.limit]);
    }
  }
  assert.deepEqual(shared.slice(0, 5), [], '別反応の近接paint重なり');

  // 受入で実ラスタ重なりが確認された2組は、免除なしで重なり0。
  const legacyConnectors = connectorsForAll((r) => LEGACY_REACTION_IDS.has(r.id));
  const pairById = (rid) => legacyConnectors.filter((c) => c.rid === rid).map((c) => ({ c, pts: samples(c).concat(arrowSamples(c)) }));
  [
    ['acetic-acid-glycerol-esterification', 'tripalmitin-saponification'],
    ['glycerol-oleic-esterification', 'glycerol-stearic-esterification']
  ].forEach((pair) => {
    const ra = pairById(pair[0]);
    const rb = pairById(pair[1]);
    ra.forEach((A) => rb.forEach((B) => {
      const result = pairOverlap(A, B);
      assert.ok(result.near >= result.limit - 1e-9, pair.join(' x ') + ' near=' + result.near + ' limit=' + result.limit);
    }));
  });

  // 共有portの代表2組は PORT_SPACING 以上離す。
  const portDist = (ridA, ridB) => {
    const a = legacyConnectors.find((c) => c.rid === ridA && c.compounds.includes('glycerol'));
    const b = legacyConnectors.find((c) => c.rid === ridB && c.compounds.includes('glycerol'));
    const pa = a.points[a.dir === 'in' ? 0 : a.points.length - 1];
    const pb = b.points[b.dir === 'in' ? 0 : b.points.length - 1];
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };
  assert.ok(portDist('acetic-acid-glycerol-esterification', 'tripalmitin-saponification') >= Core.CONNECTOR.PORT_SPACING - 0.1);
  assert.ok(portDist('glycerol-oleic-esterification', 'glycerol-stearic-esterification') >= Core.CONNECTOR.PORT_SPACING - 0.1);
});

test('[classmap] 一般図16変換も同じ端点規則で、配置は変えない', () => {
  const nodes = {};
  D.classMap.nodes.forEach((n) => { nodes[n.id] = n; });
  const off = {
    arrow: Core.endpointOffsets(0, Core.CONNECTOR.CLASS_STROKE, 0.75, 'butt').arrow,
    cap: Core.endpointOffsets(0, Core.CONNECTOR.CLASS_STROKE, 0.75, 'butt').cap
  };
  assert.ok(Math.abs((off.cap - Core.CONNECTOR.CLASS_STROKE / 2) - Core.CONNECTOR.EDGE_GAP) <= 0.02);
  assert.ok(Math.abs((off.arrow - Core.CONNECTOR.CLASS_STROKE / 2) - Core.CONNECTOR.EDGE_GAP) <= 0.02);
  D.classMap.edges.forEach((e) => {
    const c = Core.classConnector(e, { nodeById: nodes });
    assert.ok(c.points.length >= 2);
    assert.equal(c.arrow, true);
    assert.ok(c.arrowHead && c.shaft, '一般図も shaft と triangle を分離');
    assert.ok(c.arrowHead.headLength >= 4);
    const from = nodes[e.from];
    const to = nodes[e.to];
    const a = c.points[0];
    const b = c.points[c.points.length - 1];
    assert.equal(Core.pointInRoundRect(a, Core.inflateRoundRect(from, 9, off.cap + 0.05)), true);
    assert.equal(Core.pointInRoundRect(a, Core.inflateRoundRect(from, 9, off.cap - 0.5)), false);
    assert.equal(Core.pointInRoundRect(b, Core.inflateRoundRect(to, 9, off.arrow + 0.05)), true);
    assert.equal(Core.pointInRoundRect(b, Core.inflateRoundRect(to, 9, off.arrow - 0.5)), false);
    // 元の点列の折れ線（配置）は維持し、両端だけを寄せる
    assert.equal(c.points.length, e.points.length);
    assert.deepEqual(
      c.points.slice(1, -1).map((p) => [p.x, p.y]),
      e.points.slice(1, -1).map((p) => [p[0], p[1]])
    );
  });
});

test('[classmap shape] 一般図16も butt端面/triangle 全体が外周+0.75の外', () => {
  const nodes = {};
  D.classMap.nodes.forEach((n) => { nodes[n.id] = n; });
  const list = D.classMap.edges.map((e) => Core.classConnector(e, { nodeById: nodes }));
  Core.enforcePaintClearance(list);
  let min = Infinity;
  list.forEach((c) => c.ends.forEach((e) => {
    const g = Core.connectorShapeGap(c, e);
    min = Math.min(min, g);
    assert.ok(g >= Core.CONNECTOR.EDGE_GAP, e.compoundId + ' gap=' + g);
  }));
  assert.ok(min >= Core.CONNECTOR.EDGE_GAP);
});

test('[ids] 全427物質IDで選択→highlight往復。カンマ入りIDも split しない', () => {
  const all = connectorsForAll();
  let matched = 0;
  D.compounds.forEach((c) => {
    const expected = all.filter((conn) => conn.compounds.includes(c.id));
    const actual = all.filter((conn) => Core.connectorMatchesCompound(conn, c.id));
    assert.equal(actual.length, expected.length, c.id + ' の一致数');
    // DOM 属性を JSON で往復しても ID を厳密に保つ
    const raw = JSON.stringify(c.id === 'ethene' ? ['ethene', '1,2-dibromoethane'] : [c.id]);
    assert.deepEqual(Core.compoundList(raw, null), JSON.parse(raw));
    if (c.incoming + c.outgoing > 0) {
      assert.ok(actual.length > 0, c.id + ' は接続辺を持つ');
      matched++;
    } else {
      assert.equal(actual.length, 0, c.id + ' は孤立');
    }
  });
  assert.ok(matched > 0);
  const comma = all.filter((conn) => Core.connectorMatchesCompound(conn, '1,2-dibromoethane'));
  assert.ok(comma.length > 0, 'カンマ入りIDでも active edge が見つかる');
  // data-compounds の実文字列（JSON配列）を split(',') すると壊れることの回帰
  const serialized = JSON.stringify(comma[0].compounds);
  assert.equal(serialized.split(',').length > 2, true);
  assert.deepEqual(Core.compoundList(serialized, comma[0].compounds[0]), comma[0].compounds);
});

test('[arrow] 短い最終線分でも triangle の向き・長さを確保し、shaft は底で止まる', () => {
  const c = Core.attachArrow({
    points: [{ x: 0, y: 0 }, { x: 8, y: 0 }],
    arrow: true,
    tier: 'primary'
  });
  assert.equal(c.arrowHead.headLength, 6.5, '短い場合は full-1.5 に縮める');
  assert.ok(c.arrowHead.headLength >= 4);
  assert.ok(Math.abs(c.arrowHead.angle) < 1e-9, '最終線分の tangent を使う');
  assert.deepEqual(c.shaft[c.shaft.length - 1], c.arrowHead.base);
  assert.ok(c.shaft[c.shaft.length - 1].x < c.points[c.points.length - 1].x);
});

test('[secondary] active 4.4 の butt 端面でも gap 0.75 を満たす', () => {
  assert.equal(Core.CONNECTOR.MAX_PAINT_STROKE.secondary, 4.4);
  const all = connectorsForAll();
  const sec = all.filter((c) => c.tier === 'secondary');
  assert.ok(sec.length > 0);
  sec.forEach((c) => c.ends.forEach((e) => {
    assert.ok(Core.connectorShapeGap(c, e) >= Core.CONNECTOR.EDGE_GAP,
      c.rid + ' ' + e.compoundId + ' secondary gap');
  }));
});

test('[triangle] 3頂点が外でも辺がノードを横切る形を検出できる', () => {
  const node = { x: 0, y: 0, w: 20, h: 20, stroke: 1.4 };
  // 左右の頂点はノード外、上辺の内側を通る細長い triangle
  const head = {
    tip: { x: 10, y: -10 },
    left: { x: -10, y: 10 },
    right: { x: 30, y: 10 }
  };
  const rx = 9;
  const vertexMin = Math.min(
    Core.nodePaintGap(head.tip, node, rx),
    Core.nodePaintGap(head.left, node, rx),
    Core.nodePaintGap(head.right, node, rx)
  );
  const edgeMin = Core.minTriangleGap(head, node, rx);
  assert.ok(vertexMin > 0, '頂点は外');
  assert.ok(edgeMin < 0, '辺はノード内を横切る');
  assert.ok(edgeMin < vertexMin);
});

test('[rounding] routePath は 0.01 world 精度で、端点誤差を gap に残さない', () => {
  const d = Core.routePath([{ x: 1.234, y: 5.678 }, { x: 2.345, y: 6.789 }], []);
  assert.ok(d.includes('1.23') && d.includes('5.68'), d);
  assert.ok(d.includes('2.35') && d.includes('6.79'), d);
});

test('[short] 実 arrow の短い経路でも shaft/triangle が成立する', () => {
  const all = connectorsForAll();
  const short = all.filter((c) => c.arrow && c.length < 80).sort((a, b) => a.length - b.length);
  assert.ok(short.length >= 1);
  short.forEach((c) => {
    assert.ok(c.headLength >= 1);
    assert.ok(c.length - c.headLength > 0.5, c.rid + ' shaft余長');
    c.ends.forEach((e) => {
      assert.ok(Core.connectorShapeGap(c, e) >= Core.CONNECTOR.EDGE_GAP, c.rid + ' shape');
    });
  });
});

test('[evidence] fix5 で実測NGだった secondary butt / triangle辺 / stub後shaft を回帰固定', () => {
  const all = connectorsForAll();
  const shape = (rid, id) => {
    const c = all.find((x) => x.rid === rid && x.ends.some((e) => e.compoundId === id));
    const e = c.ends.find((x) => x.compoundId === id);
    return Core.connectorShapeGap(c, e);
  };
  // secondary も active 4.4。3-methylbutan-1-ol の butt 端面
  assert.equal(Core.CONNECTOR.MAX_PAINT_STROKE.secondary, 4.4);
  assert.ok(shape('acetic-acid-isoamyl-esterification', '3-methylbutan-1-ol') >= 0.75);
  // 3頂点ではなく三角形の全辺（aspirin→salicylic acid の内部不足）
  assert.ok(shape('aspirin-hydrolysis', 'salicylic-acid') >= 0.75);
  // normal stub 後の shaft 全長（ethyl-propionate→ethanol）
  assert.ok(shape('ethyl-propionate-saponification', 'ethanol') >= 0.75);
  // 斜め butt（glycerol）と短 sucrose→fructose
  assert.ok(shape('glycerol-palmitic-esterification', 'glycerol') >= 0.75);
  assert.ok(shape('sucrose-hydrolysis', 'fructose') >= 0.75);
  // 生成条件は安全マージン込み（丸め後も >=0.75）
  assert.ok(Core.CONNECTOR.PAINT_SAFETY > 0);
});

test('[independent] Core helper を使わない外周SDF式で全paint gap >= 0.75', () => {
  const rawSdf = (p, r) => {
    const rx = Math.min(9, Math.min(r.w, r.h) / 2);
    const qx = Math.abs(p.x - r.x - r.w / 2) - (r.w / 2 - rx);
    const qy = Math.abs(p.y - r.y - r.h / 2) - (r.h / 2 - rx);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rx;
  };
  const nodeHalf = (r) => (typeof r.stroke === 'number' ? r.stroke : 1.2) / 2;
  const segMin = (a, b, r) => {
    const f = (t) => rawSdf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 70; i++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) hi = m2; else lo = m1;
    }
    return Math.min(f(0), f(1), f((lo + hi) / 2));
  };
  const independentGap = (c, e) => {
    const halfLine = (Core.CONNECTOR.MAX_PAINT_STROKE[c.tier] || 4.4) / 2;
    let min = Infinity;
    if (e.role === 'cap') {
      const p = c.points[e.index];
      const nb = e.index === 0 ? c.points[1] : c.points[c.points.length - 2];
      const len = Math.hypot(nb.x - p.x, nb.y - p.y) || 1;
      const tx = (nb.x - p.x) / len;
      const ty = (nb.y - p.y) / len;
      const a = { x: p.x - ty * halfLine, y: p.y + tx * halfLine };
      const b = { x: p.x + ty * halfLine, y: p.y - tx * halfLine };
      min = Math.min(min, segMin(a, b, e.rect) - nodeHalf(e.rect));
    } else {
      const h = c.arrowHead;
      [[h.tip, h.left], [h.left, h.right], [h.right, h.tip]].forEach((edge) => {
        min = Math.min(min, segMin(edge[0], edge[1], e.rect) - nodeHalf(e.rect));
      });
    }
    const shaft = c.shaft || c.points;
    for (let i = 0; i < shaft.length - 1; i++) {
      min = Math.min(min, segMin(shaft[i], shaft[i + 1], e.rect) - nodeHalf(e.rect) - halfLine);
    }
    return min;
  };
  const all = connectorsForAll();
  all.forEach((c) => c.ends.forEach((e) => {
    const ours = Core.connectorShapeGap(c, e);
    const ind = independentGap(c, e);
    assert.ok(Math.abs(ours - ind) <= 1e-5, c.rid + ' model差 ' + (ours - ind));
    assert.ok(ind >= Core.CONNECTOR.EDGE_GAP, c.rid + ' independent gap=' + ind);
  }));
  const classNodes = {};
  D.classMap.nodes.forEach((n) => { classNodes[n.id] = n; });
  const classConns = D.classMap.edges.map((e) => Core.classConnector(e, { nodeById: classNodes }));
  Core.enforcePaintClearance(classConns);
  classConns.forEach((c) => c.ends.forEach((e) => {
    assert.ok(independentGap(c, e) >= Core.CONNECTOR.EDGE_GAP, e.compoundId + ' class independent');
  }));

  // rect.stroke 未指定は実際の通常ノード 1.2 として扱う。
  const rect = { x: 0, y: 0, w: 20, h: 20 };
  assert.ok(Math.abs(Core.nodePaintGap({ x: 11, y: 10 }, rect) - (rawSdf({ x: 11, y: 10 }, rect) - 0.6)) < 1e-9);
});

test('[static] 反応の丸は DOM を残したまま非表示、説明文は矢印基準に直す', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  assert.match(css, /\.rp-reaction__dot\s*\{[^}]*display:\s*none/);
  assert.equal(css.includes('.rp-reaction__hit'), false, '円ヒットは廃止');
  assert.match(css, /\.rp-edge-hit,\s*\n\.rp-classmap__edge-hit\s*\{[^}]*stroke-width:\s*18/,
    '当たり判定は画面18px幅の透明ヒット');
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.equal(js.includes('rp-reaction__hit'), false, '円ヒットの DOM を出さない');
  assert.ok(js.includes("'class': 'rp-edge-hit'"), '反応線の透明ヒット');
  assert.ok(js.includes("tabindex: '0'") && js.includes('reactionIndex[r.id] = g'),
    'フォーカス可能な反応マーカーは残す');
  assert.ok(html.includes('生成物へ向かう矢印'));
  assert.equal(html.includes('反応の丸から出る線'), false);
});
