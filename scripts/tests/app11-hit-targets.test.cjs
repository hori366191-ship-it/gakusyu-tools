/*
 * app11 反応線・一般図の当たり判定（画面18px幅）回帰テスト
 *
 * 保存データ（427物質 / 86反応 / 一般図12分類16変換）と描画 geometry は変えない。
 * 見えない当たり判定が重なったときに
 *   - DOM 順ではなく「タップ位置に最も近い可視線」で選ぶ
 *   - 矢印 triangle の内部（塗り）は距離0で、輪郭距離だけで負けない
 *   - 実体上のダブルクリックでは地図を拡大しない
 * を純関数で確かめる。final UI test で見つかった3種の NG を再現コーパスとして持つ。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const D = require(path.join(APP, 'data.js'));
const Core = require(path.join(APP, 'map-core.js'));

const HIT_WIDTH = 18;
const HIT_RADIUS = HIT_WIDTH / 2;
const HIT_SAMPLE_STEP = 2;
// 具体図（427物質・86反応・分野・型・状態）の投影と、一般図12分類16変換の配置の固定ハッシュ。
// data.js 全文のハッシュは一般図の座標を詰めるたびに変わるため、投影ごとに分けて守る。
const CONCRETE_SHA256 = 'e227216f0a72f0f75003ff424e1ef61052e6c246b70dd486906cfc6ffa9b69a4';
const CLASS_GEOMETRY_SHA256 = 'f5401dbcc0ecead27031694de550c7fafc649d2f845883092bfdade030ea029c';
const NOTICE_SHA256 = '0839382096a9683caeb9c7ead3999e95299bc38e7808edfb9577d5ec29ceb8ef';

function concreteFingerprint() {
  const meta = Object.assign({}, D.meta);
  ['classMapNodeCount', 'classMapEdgeCount', 'classMapVerifiedAt', 'classMapNote']
    .forEach((key) => { delete meta[key]; });
  return crypto.createHash('sha256').update(JSON.stringify({
    compounds: D.compounds,
    reactions: D.reactions,
    regions: D.regions,
    types: D.types,
    states: D.states,
    meta: meta
  })).digest('hex');
}

function classGeometryFingerprint() {
  return crypto.createHash('sha256').update(JSON.stringify({
    area: D.classMap.area,
    frame: D.classMap.frame,
    nodes: D.classMap.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    edges: D.classMap.edges.map((e) => ({ id: e.id, points: e.points, labelPos: e.labelPos }))
  })).digest('hex');
}

const byId = {};
D.compounds.forEach((c) => { byId[c.id] = c; });

function shapeFromConnector(c, shaftD) {
  const head = c.arrowHead;
  const d = head ? shaftD + ' ' + Core.arrowHeadPath(head) : shaftD;
  const lines = [];
  (Core.samplePath(d, HIT_SAMPLE_STEP) || []).forEach((pts) => { if (pts.length > 1) lines.push(pts); });
  return { d: d, lines: lines, fills: head ? [[head.tip, head.left, head.right]] : [] };
}

function boxOf(shape) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (p) => {
    if (p.x < box.minX) box.minX = p.x;
    if (p.y < box.minY) box.minY = p.y;
    if (p.x > box.maxX) box.maxX = p.x;
    if (p.y > box.maxY) box.maxY = p.y;
  };
  shape.lines.forEach((poly) => poly.forEach(add));
  (shape.fills || []).forEach((poly) => poly.forEach(add));
  return box;
}

function reactionCandidates() {
  const all = [];
  const perReaction = {};
  D.reactions.forEach((r, order) => {
    const list = Core.reactionConnectors(r, {
      compoundById: byId,
      nodeW: D.meta.nodeW,
      nodeH: D.meta.nodeH
    });
    list.forEach((c) => { c.rid = r.id; });
    all.push(...list);
    perReaction[r.id] = { order: order, connectors: list };
  });
  Core.separateSharedPorts(all);
  Core.enforcePaintClearance(all);
  const out = [];
  const shapes = {};
  Object.keys(perReaction).forEach((id) => {
    const lines = [];
    const fills = [];
    perReaction[id].connectors.forEach((c) => {
      const shaftD = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
      const shape = shapeFromConnector(c, shaftD);
      shape.connectors = [shape];
      lines.push(...shape.lines);
      fills.push(...shape.fills);
      (shapes[id] || (shapes[id] = [])).push(shape);
    });
    const merged = { d: null, lines: lines, fills: fills };
    out.push({ kind: 'reaction', id: id, order: perReaction[id].order, lines: lines, fills: fills, box: boxOf(merged) });
  });
  return { candidates: out, shapes: shapes };
}

function classCandidates() {
  const nodes = {};
  D.classMap.nodes.forEach((n) => { nodes[n.id] = n; });
  return D.classMap.edges.map((e, order) => {
    const cc = Core.classConnector(e, { nodeById: nodes });
    Core.enforcePaintClearance([cc]);
    const shaftD = Core.routePath(cc.shaft || cc.points, [], []);
    const shape = shapeFromConnector(cc, shaftD);
    return { kind: 'class-edge', id: e.id, order: order, lines: shape.lines, fills: shape.fills, box: boxOf(shape), shape: shape };
  });
}

const REACTIONS = reactionCandidates();
const REACTION_CANDIDATES = REACTIONS.candidates;
const REACTION_SHAPES = REACTIONS.shapes;
const CLASS_CANDIDATES = classCandidates();
const CANDIDATE_BY_ID = {};
REACTION_CANDIDATES.forEach((c) => { CANDIDATE_BY_ID[c.id] = c; });
CLASS_CANDIDATES.forEach((c) => { CANDIDATE_BY_ID[c.id] = c; });

function centroid(poly) {
  const x = (poly[0].x + poly[1].x + poly[2].x) / 3;
  const y = (poly[0].y + poly[1].y + poly[2].y) / 3;
  return { x: x, y: y };
}

function nearestFor(cands, point, radius) {
  return Core.nearestHit(cands, point, radius);
}

/* ---------------- 幅18px の厳密性 ---------------- */

test('[pure] 幅18px（半径9px）は厳密で、8px は選び 10px は選ばない', () => {
  const line = [{ kind: 'reaction', id: 'line', order: 0, lines: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]], fills: [] }];
  assert.equal(Core.HIT_WIDTH, HIT_WIDTH);
  assert.equal(HIT_RADIUS, 9);
  const near = nearestFor(line, { x: 50, y: 8 }, HIT_RADIUS);
  assert.ok(near, '半径9pxの内側（8px）は選ぶ');
  assert.equal(near.id, 'line');
  assert.equal(nearestFor(line, { x: 50, y: 10 }, HIT_RADIUS), null, '半径9pxの外側（10px）は選ばない');
  assert.ok(nearestFor(line, { x: 50, y: 9 }, HIT_RADIUS), '境界ちょうどは内側');
});

test('[pure] 距離判定は画面ピクセル基準（world→screen の半径9pxが全倍率で一致）', () => {
  const view = { scale: 3, x: 0, y: 0 };
  const line = [{ kind: 'reaction', id: 'line', order: 0, lines: [[{ x: 0, y: 0 }, { x: 500, y: 0 }]], fills: [] }];
  const radiusAt3 = HIT_RADIUS / view.scale;
  assert.ok(nearestFor(line, Core.screenToWorld(view, 100, 8), radiusAt3), '拡大3倍でも画面8pxは選ぶ');
  assert.equal(nearestFor(line, Core.screenToWorld(view, 100, 10), radiusAt3), null, '画面10pxは選ばない');

  const zoomOut = { scale: 0.2, x: 0, y: 0 };
  const radiusAt02 = HIT_RADIUS / zoomOut.scale;
  assert.ok(nearestFor(line, Core.screenToWorld(zoomOut, 100, 8), radiusAt02), '縮小0.2倍でも画面8pxは選ぶ');
  assert.equal(nearestFor(line, Core.screenToWorld(zoomOut, 100, 10), radiusAt02), null);

  // 実在の曲線（Q）でも world 距離 × scale が画面距離と一致する
  const cand = REACTION_CANDIDATES.find((c) => {
    const d = REACTION_SHAPES[c.id][0].d;
    return d.indexOf('Q') !== -1;
  });
  assert.ok(cand, '曲線を含む反応線がある');
  const poly = cand.lines[0];
  const mi = Math.floor(poly.length / 2);
  const mid = poly[mi];
  const prev = poly[Math.max(0, mi - 1)];
  const next = poly[Math.min(poly.length - 1, mi + 1)];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const tl = Math.hypot(tx, ty) || 1;
  const nx = -ty / tl;
  const ny = tx / tl;
  const lineOnly = { lines: [poly], fills: [] };
  [0.2, 1, 3].forEach((scale) => {
    const radius = HIT_RADIUS / scale;
    const world8 = { x: mid.x + nx * (8 / scale), y: mid.y + ny * (8 / scale) };
    const world10 = { x: mid.x + nx * (10 / scale), y: mid.y + ny * (10 / scale) };
    const d8 = Core.hitDistance(lineOnly, world8) * scale;
    assert.ok(Math.abs(d8 - 8) < 1.2, 'world→screen の8px（実際 ' + d8.toFixed(3) + '）');
    assert.ok(nearestFor([{ kind: 'reaction', id: cand.id, order: 0, lines: [poly], fills: [] }], world8, radius),
      scale + '倍で画面8pxは選ぶ');
    assert.equal(nearestFor([{ kind: 'reaction', id: cand.id, order: 0, lines: [poly], fills: [] }], world10, radius),
      null, scale + '倍で画面10pxは選ばない');
  });
});

/* ---------------- 反応線の近接（final UI test の合格例を固定） ---------------- */

test('[pure] 近接する実在ペア（ethanol-oxidation-ethanal / ethanal-reduction）でも近い線を選ぶ', () => {
  const a = CANDIDATE_BY_ID['ethanol-oxidation-ethanal'];
  const b = CANDIDATE_BY_ID['ethanal-reduction'];
  assert.ok(a && b, '実データの近接ペアが存在する');

  let point = null;
  let gapToB = Infinity;
  a.lines.forEach((poly) => {
    poly.forEach((p) => {
      const d = Core.hitDistance(b, p);
      if (d < gapToB) { gapToB = d; point = p; }
    });
  });
  assert.ok(point, 'A の形状サンプル');
  assert.ok(gapToB <= HIT_RADIUS, 'この場所では 18px ヒットが重なる（gap=' + gapToB + '）');

  assert.equal(nearestFor([a, b], point, HIT_RADIUS).id, a.id, 'A 上のタップは A を選ぶ');
  assert.equal(nearestFor([b, a], point, HIT_RADIUS).id, a.id, '候補順が逆でも同じ');

  const onB = b.lines[0][0];
  assert.equal(nearestFor([b, a], onB, HIT_RADIUS).id, b.id, 'B 上のタップは B を選ぶ');
  assert.equal(nearestFor([a, b], onB, HIT_RADIUS).id, b.id, '候補順が逆でも同じ');
});

test('[pure] 同じ反応の複数枝は同じ反応として扱い、最短距離だけを見る', () => {
  const target = REACTION_CANDIDATES.filter((c) => c.lines.length > 1)[0];
  assert.ok(target, '複数枝を持つ反応がある');
  const near = { x: target.lines[0][0].x, y: target.lines[0][0].y };
  const picked = nearestFor([target, target], near, HIT_RADIUS);
  assert.equal(picked.kind, 'reaction');
  assert.equal(picked.id, target.id);
  assert.equal(picked.distance, 0);
});

test('[pure] 同一地点で交差する複数候補は order の小さい方で安定して決まる', () => {
  const line = [[{ x: 0, y: 0 }, { x: 100, y: 0 }]];
  const x = { kind: 'reaction', id: 'x', order: 5, lines: line, fills: [] };
  const y = { kind: 'reaction', id: 'y', order: 2, lines: line, fills: [] };
  const point = { x: 30, y: 0 };
  assert.equal(nearestFor([x, y], point, HIT_RADIUS).id, 'y');
  assert.equal(nearestFor([y, x], point, HIT_RADIUS).id, 'y', '入力順が変わっても同じ結果');
});

test('[pure] コンマ入り ID でも候補 ID が壊れない', () => {
  const id = '1,2-dibromoethane';
  const cand = { kind: 'reaction', id: id, order: 0, lines: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]], fills: [] };
  assert.equal(nearestFor([cand], { x: 5, y: 2 }, HIT_RADIUS).id, id);
});

/* ---------------- NG2: 矢印 triangle の内部（塗り） ---------------- */

test('[pure] 矢印 triangle の内部は距離0で、輪郭距離だけの判定に負けない', () => {
  const id = 'tripalmitin-saponification';
  const shape = (REACTION_SHAPES[id] || []).find((s) => s.fills && s.fills.length);
  assert.ok(shape, '矢印の塗り多角形を持つ');
  const tri = shape.fills[0];
  const c = centroid(tri);
  assert.equal(Core.pointInPolygon(c, tri), true, '重心は内部');
  assert.equal(Core.hitDistance(shape, c), 0, '内部は距離0');
  // 輪郭（全3辺）の距離を別に測ると 0 ではない（従来の輪郭だけの判定では負けていた）
  const outlineOnly = { lines: shape.lines, fills: [] };
  assert.ok(Core.hitDistance(outlineOnly, c) > 0.5, '輪郭だけでは距離が残る');

  // 実在する全 triangle の重心は、その反応自身を選ぶ（final UI test の異議3件を含む）
  const misses = [];
  REACTION_CANDIDATES.forEach((cand) => {
    (REACTION_SHAPES[cand.id] || []).forEach((s) => {
      (s.fills || []).forEach((ring) => {
        const p = centroid(ring);
        const picked = nearestFor(REACTION_CANDIDATES, p, 45);
        if (!picked || picked.id !== cand.id) misses.push(cand.id + ' -> ' + (picked && picked.id));
      });
    });
  });
  assert.deepEqual(misses, [], 'triangle 重心の誤選択');
  ['tripalmitin-saponification', 'aspirin-hydrolysis', 'ethyl-acetate-hydrolysis'].forEach((rid) => {
    const own = (REACTION_SHAPES[rid] || []).find((s) => s.fills && s.fills.length);
    assert.ok(own, rid + ' の triangle');
    const p = centroid(own.fills[0]);
    assert.equal(nearestFor(REACTION_CANDIDATES, p, 45).id, rid, rid + ' の triangle 重心は自分を選ぶ');
  });
});

test('[pure] triangle の辺・外側近点・多点重なりでも安定して選ぶ', () => {
  const shape = (REACTION_SHAPES['tripalmitin-saponification'] || []).find((s) => s.fills && s.fills.length);
  assert.ok(shape, 'triangle を持つ');
  const tri = shape.fills[0];
  const c = centroid(tri);
  // 辺の中点の外側 1px / 2px は、自分の反応のまま（半径9px以内）
  const edgeMid = { x: (tri[0].x + tri[1].x) / 2, y: (tri[0].y + tri[1].y) / 2 };
  const nx = edgeMid.x - c.x;
  const ny = edgeMid.y - c.y;
  const len = Math.hypot(nx, ny) || 1;
  const outside2 = { x: edgeMid.x + (nx / len) * 2, y: edgeMid.y + (ny / len) * 2 };
  assert.equal(Core.pointInPolygon(outside2, tri), false);
  const picked = nearestFor(REACTION_CANDIDATES, outside2, 45);
  assert.equal(picked.id, 'tripalmitin-saponification');
  // 辺上は line 経由の距離0
  assert.equal(Core.hitDistanceDetail({ lines: [], fills: [tri] }, edgeMid).distance, 0);

  // 同じ点を2つの triangle が覆う場合は、点が完全一致なら line 優先 → order で安定
  const a = { kind: 'reaction', id: 'a', order: 1, lines: [], fills: [tri] };
  const b = { kind: 'reaction', id: 'b', order: 2, lines: [], fills: [tri] };
  assert.equal(nearestFor([a, b], c, 9).id, 'a');
  assert.equal(nearestFor([b, a], c, 9).id, 'a', '入力順に依存しない');

  // 塗り内部（距離0）でも、点が線の上でもあるなら線を優先し、order は最後の決め手
  const onLine = { kind: 'reaction', id: 'onLine', order: 5, lines: [[{ x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }]], fills: [] };
  assert.equal(nearestFor([a, onLine], c, 9).id, 'onLine', '同距離0なら線を優先');
  assert.equal(nearestFor([onLine, a], c, 9).id, 'onLine', '候補順に依存しない');
  const nearLine = { kind: 'reaction', id: 'nearLine', order: 0, lines: [[{ x: c.x - 20, y: c.y + 0.5 }, { x: c.x + 20, y: c.y + 0.5 }]], fills: [] };
  assert.equal(nearestFor([nearLine, a], c, 9).id, 'a', '塗り内部（0）は近傍線（0.5）より優先');
});

/* ---------------- NG1: 一般図も DOM 順ではなく最近傍 ---------------- */

test('[pure] 一般図の変換線も最近傍で選び、候補順（DOM順）に依存しない', () => {
  const a = CLASS_CANDIDATES.find((c) => c.id === 'alkene-alkane');
  const b = CLASS_CANDIDATES.find((c) => c.id === 'primary-alcohol-alkene');
  assert.ok(a && b, '再現に使う一般図の変換がある');

  // a の線上の点で、b が 18px 以内に重なる場所（final UI test の 5.979px 例と同じ状況）
  let point = null;
  let gap = Infinity;
  a.lines.forEach((poly) => {
    poly.forEach((p) => {
      const d = Core.hitDistance(b, p);
      if (d < gap) { gap = d; point = p; }
    });
  });
  assert.ok(point, 'a の形状サンプル');
  const scale = 0.1993; // final UI test の global fit
  assert.ok(gap * scale <= HIT_RADIUS, 'この倍率では 18px ヒットが重なる（' + (gap * scale).toFixed(3) + 'px）');

  const radiusWorld = HIT_RADIUS / scale;
  const first = nearestFor([a, b], point, radiusWorld);
  const reversed = nearestFor([b, a], point, radiusWorld);
  assert.equal(first.id, 'alkene-alkane', '距離0の線を選ぶ（DOM順の別変換ではない）');
  assert.equal(reversed.id, first.id, '候補順を逆にしても同じ');

  // 一般図の全16変換で、線上の点はその変換自身を選ぶ
  CLASS_CANDIDATES.forEach((cand) => {
    assert.equal(nearestFor(CLASS_CANDIDATES, cand.lines[0][0], radiusWorld).id, cand.id,
      cand.id + ' の始点は自分を選ぶ');
  });
});

test('[pure] 候補の並び（DOM順）を反転しても全16変換の選択が一致する', () => {
  const forward = CLASS_CANDIDATES;
  const reversed = CLASS_CANDIDATES.slice().reverse();
  CLASS_CANDIDATES.forEach((cand) => {
    cand.lines.forEach((poly) => {
      const p = poly[Math.floor(poly.length / 2)];
      const a = nearestFor(forward, p, 9);
      const b = nearestFor(reversed, p, 9);
      assert.equal(a ? a.id : null, b ? b.id : null, cand.id + ' の点で順序依存');
    });
  });
});

test('[pure] 実座標の候補解決: タッチ補正された target ではなく物理点で決める', () => {
  // 補正で e.target がノードになっても、elementsFromPoint（幾何）には線だけが入る
  const touch = Core.resolvePhysicalTarget([
    { role: 'line', kind: 'reaction', id: 'ethyl-acetate-hydrolysis', inside: true }
  ]);
  assert.deepEqual(touch, { type: 'line', kind: 'reaction', id: 'ethyl-acetate-hydrolysis' });

  // ノードがスタックに居ても、実 point がその形状の内側でなければ採用しない（ハロー等）
  const halo = Core.resolvePhysicalTarget([
    { role: 'node', kind: 'compound', id: 'ethanol', inside: false },
    { role: 'line', kind: 'reaction', id: 'ethyl-acetate-hydrolysis', inside: true }
  ]);
  assert.equal(halo.type, 'line');

  // 実 point がノードの内側なら従来どおりノード優先
  const node = Core.resolvePhysicalTarget([
    { role: 'node', kind: 'compound', id: 'ethanol', inside: true },
    { role: 'line', kind: 'reaction', id: 'x', inside: true }
  ]);
  assert.deepEqual(node, { type: 'entity', kind: 'compound', id: 'ethanol', via: 'node' });

  // ラベルは実 bbox 内のときだけ優先
  const label = Core.resolvePhysicalTarget([
    { role: 'label', kind: 'reaction', id: 'r1', inside: true },
    { role: 'line', kind: 'reaction', id: 'r1', inside: true }
  ]);
  assert.deepEqual(label, { type: 'entity', kind: 'reaction', id: 'r1', via: 'label' });
  assert.equal(Core.resolvePhysicalTarget([
    { role: 'label', kind: 'reaction', id: 'r1', inside: false },
    { role: 'line', kind: 'reaction', id: 'r2', inside: true }
  ]).type, 'line');

  // 操作要素は実 point がその中にあるときだけ control
  assert.equal(Core.resolvePhysicalTarget([{ role: 'control', inside: true }]).type, 'control');
  assert.equal(Core.resolvePhysicalTarget([
    { role: 'control', inside: false },
    { role: 'line', kind: 'reaction', id: 'r3', inside: true }
  ]).type, 'line');

  assert.deepEqual(Core.resolvePhysicalTarget([]), { type: 'background' });
  assert.deepEqual(Core.resolvePhysicalTarget(null), { type: 'background' });
});

test('[pure] 旧NG: 390px の矢印重心は、近接ノードの外側なので反応として解決する', () => {
  const cases = [
    { id: 'tripalmitin-saponification', near: ['glycerol', 'sodium-palmitate'] },
    { id: 'aspirin-hydrolysis', near: ['acetic-acid', 'salicylic-acid'] },
    { id: 'ethyl-acetate-hydrolysis', near: ['ethanol'] }
  ];
  cases.forEach((item) => {
    const shape = (REACTION_SHAPES[item.id] || []).find((s) => s.fills && s.fills.length);
    assert.ok(shape, item.id + ' の triangle');
    const p = centroid(shape.fills[0]);
    assert.equal(Core.pointInPolygon(p, shape.fills[0]), true, item.id + ' は矢印の内側');
    item.near.forEach((cid) => {
      const c = byId[cid];
      if (!c) return;
      const rect = { x: c.x, y: c.y, w: c.w || D.meta.nodeW, h: c.h || D.meta.nodeH, rx: 9 };
      assert.equal(Core.pointInRoundRect(p, rect), false, item.id + ' の重心は ' + cid + ' の枠外');
    });
    // 物理点が矢印内なら、補正でノードの target になっても反応を選ぶ
    const decided = Core.resolvePhysicalTarget([
      { role: 'line', kind: 'reaction', id: item.id, inside: true }
    ]);
    assert.equal(decided.type, 'line');
    assert.equal(decided.id, item.id);
    // 矢印の内部（距離0）が近接線（>0.5px）より優先される
    assert.equal(nearestFor(REACTION_CANDIDATES, p, 45).id, item.id);
  });
});

/* ---------------- NG3: ダブルクリック ---------------- */

test('[pure] 実体上のダブルクリックは拡大しない（背景だけ拡大）', () => {
  assert.equal(Core.dblclickAction(true, false), 'none', '線・矢印・ラベル・ノード・一般図');
  assert.equal(Core.dblclickAction(false, false), 'zoom', '背景');
  assert.equal(Core.dblclickAction(false, true), 'none', '凡例・ヒント・一般図ジャンプ');
  assert.equal(Core.dblclickAction(true, true), 'none');
});

test('[pure] dblclick も同じ物理解決: target が #rp-map に retarget されても背景扱いにしない', () => {
  // pointer capture 後の dblclick.target は #rp-map だが、実座標の候補は線
  const onLine = Core.resolvePhysicalTarget([
    { role: 'line', kind: 'reaction', id: 'ethanol-oxidation-ethanal', inside: true }
  ]);
  assert.equal(Core.dblclickAction(onLine.type === 'line', onLine.type === 'control'), 'none');

  const onNode = Core.resolvePhysicalTarget([{ role: 'node', kind: 'compound', id: 'ethanol', inside: true }]);
  assert.equal(Core.dblclickAction(onNode.type === 'entity', false), 'none');

  const onBackground = Core.resolvePhysicalTarget([
    { role: 'node', kind: 'compound', id: 'ethanol', inside: false }
  ]);
  assert.equal(Core.dblclickAction(onBackground.type === 'entity' || onBackground.type === 'line', false), 'zoom');
});

/* ---------------- 配線（静的） ---------------- */

test('[static] 線のヒットは「触れた線」で判定し、グループの classList では判定しない', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('HIT_LINE_SELECTOR') && js.includes("'.rp-edge-hit,.rp-edge,.rp-classmap__edge-hit,.rp-classmap__edge'"),
    '可視線そのものも線ヒットとして扱う');
  assert.ok(js.includes('hitLineTarget(target)'), '触れた要素から線ヒットを取る');
  assert.equal(/cls\.contains\('rp-edge-hit'\)/.test(js), false, 'グループの classList 依存を残さない');
  assert.ok(js.includes('nearestHitAt(kind, point)'), '一般図も最近傍へ回す');
  // 一般図の透明ヒット自身が kind/id を持つため、グループの classList を見なくても線として判定できる
  assert.ok(/rp-classmap__edge-hit'[\s\S]{0,160}'data-kind': 'class-edge'/.test(js),
    '一般図ヒットに data-kind を持たせる');
  assert.ok(/rp-classmap__edge-hit'[\s\S]{0,200}'data-id': e\.id/.test(js), '一般図ヒットに data-id を持たせる');
});

test('[static] 矢印の塗りは描画と同じ頂点を距離計算にも共有する（cache）', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('connectorHitShape') && js.includes('connector.__hitShape'),
    'connector ごとに shape をキャッシュ');
  assert.ok(js.includes('fills: head ? [[head.tip, head.left, head.right]] : []'), '描画と同じ triangle 頂点');
  assert.ok(js.includes('hitShape.d'), 'hit path の d も同じ shape から作る');
  assert.ok(/rp-classmap__edge-hit'[\s\S]{0,200}?d: hitShape\.d/.test(js), '一般図の hit path も同じ規則');
  const core = fs.readFileSync(path.join(APP, 'map-core.js'), 'utf8');
  assert.ok(core.includes('pointInPolygon'), 'ray casting の内外判定');
  assert.ok(core.includes('hitDistanceDetail'), '塗りと線を同じ距離関数で扱う');
});

test('[static] pointerdown/dblclick は event.target を信用せず実座標で解決する', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('function resolvePhysicalAt(clientX, clientY)'));
  assert.ok(js.includes('document.elementsFromPoint'));
  assert.equal((js.match(/resolvePhysicalAt\(e\.clientX, e\.clientY\)/g) || []).length >= 2, true,
    'pointerdown と dblclick の両方で実座標を使う');
  assert.equal(/pickDownEntity\(e\.target/.test(js), false, 'entity 判定に event.target を使わない');
  assert.equal(/hitLineTarget\(e\.target\)/.test(js), false, 'dblclick も target を見ない');
  assert.equal(/core dblclickAction/.test(js), false);
  assert.ok(js.includes('isPointInFill'), 'node/label は実形状で確認する');
  assert.ok(js.includes('inside: insideNode') || js.includes('inside: insideNode,'));
  assert.ok(js.includes('nearestAnyAt(point)'), '線がスタックに無いときの距離0フォールバック');
  assert.ok(js.includes("if (nearest && nearest.distance > 1e-6) nearest = null"),
    '背景タップで近くの線を拾わない');
});

test('[static] dblclick は実体で拡大しない（最小差分のハンドラ）', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('Core.dblclickAction(isEntity, isControl)'), '判定を純関数に集約');
  assert.ok(js.includes("if (Core.dblclickAction(isEntity, isControl) !== 'zoom') return;"));
  assert.equal(js.indexOf('addEventListener(\'dblclick\'') !== -1, true);
});

test('[static] 反応線の透明ヒットは枝ごとに data-kind=reaction で置き、円ヒットは廃止のまま', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');

  assert.ok(js.includes("'class': 'rp-edge-hit'"), '透明ヒットの path');
  assert.ok(js.includes("'data-kind': 'reaction'"), '透明ヒットは反応として開く');
  assert.ok(js.includes('Core.arrowHeadPath(c.arrowHead)'), '矢印も透明ヒットに含める');
  assert.equal(js.includes('rp-reaction__hit'), false, '反応マーカーの円ヒット DOM を出さない');
  assert.equal(/\.rp-reaction__hit/.test(css), false, '円ヒットの CSS を残さない');
  assert.equal(/hit\.setAttribute\('r'/.test(js), false, 'r=12/22 の LOD 更新をしない');

  const hitBlock = js.slice(js.indexOf("'class': 'rp-edge-hit'") - 300, js.indexOf("'class': 'rp-edge-hit'") + 400);
  assert.equal(/tabindex/.test(hitBlock), false, '透明ヒットはタブストップにしない');
  assert.equal(/role:\s*'button'/.test(hitBlock), false, '透明ヒットに role=button を足さない');
  assert.ok(js.includes("tabindex: '0'") && js.includes('reactionIndex[r.id] = g'),
    '反応マーカーはフォーカス可能な実体として残す');
  assert.ok(js.includes('Core.resolveHitTarget') && js.includes('reactionIndex[id] || null'),
    '開く対象はフォーカス可能な実体へ戻す');
});

test('[static] 当たり判定は可視線の上・反応ラベルと物質ノードの下（18px はLODで消さない）', () => {
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');

  const primary = js.indexOf('viewport.appendChild(primaryLayer)');
  const hit = js.indexOf('viewport.appendChild(hitLayer)');
  const marker = js.indexOf('viewport.appendChild(markerLayer)');
  assert.ok(primary >= 0 && primary < hit && hit < marker, '可視線 → 透明ヒット → 反応ラベル');

  assert.match(css, /\.rp-edge-hit,\s*\n\.rp-classmap__edge-hit\s*\{[^}]*stroke-width:\s*18/,
    '一般図と同じ 18px の定義を共有');
  assert.match(css, /\.rp-edge-hit,\s*\n\.rp-classmap__edge-hit\s*\{[^}]*stroke:\s*transparent/);
  assert.match(css, /\.rp-edge-hit,\s*\n\.rp-classmap__edge-hit\s*\{[^}]*pointer-events:\s*stroke/);
  assert.match(css, /\.rp-edge-hit,\s*\n\.rp-classmap__edge-hit\s*\{[^}]*vector-effect:\s*non-scaling-stroke/);
  assert.equal(/^\.rp-edge-hit[^{]*\{[^}]*display:\s*none/m.test(css), false, '低倍率でも具体図の線ヒットを消さない');
  assert.equal(/\.rp-map\[data-level="0"\][^{]*\.rp-edge-hit/.test(css), false);
});

test('[static] 反応線の見た目（幅・色・端点）と data は変えない', () => {
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
  const data = fs.readFileSync(path.join(APP, 'data.js'), 'utf8');
  assert.match(css, /\.rp-edge--primary\s*\{[^}]*stroke-width:\s*3/, '主要線は3px');
  assert.match(css, /\.rp-edge--secondary\s*\{[^}]*stroke-width:\s*1\.1/, '補助線は1.1px');
  assert.match(css, /\.rp-edge--secondary\s*\{[^}]*stroke-dasharray:\s*6 5/, '補助線は点線');
  assert.equal(concreteFingerprint(), CONCRETE_SHA256,
    '具体図（427物質・86反応・分野・型・状態）の投影を変えない');
  assert.equal(classGeometryFingerprint(), CLASS_GEOMETRY_SHA256,
    '一般図の配置（12分類・16変換の座標・経路・area/frame）は意図した詰め方だけ');
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.requiredCount, 294);
  assert.equal(D.meta.reactionCount, 86);
  assert.equal(D.meta.heldReactionCount, 81);
  assert.equal(D.classMap.nodes.length, 12);
  assert.equal(D.classMap.edges.length, 16);
  assert.equal(D.reactions.filter((r) => !r.label).length, 36, 'ラベルの無い反応は線ヒットで開く');
});

test('[static] データ注意枠は地図の直後（一覧の前）にあり、文言は移動前と同一', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const mapAt = html.indexOf('class="rp-map-panel"');
  const noticeAt = html.indexOf('id="rp-data-notice"');
  const listAt = html.indexOf('id="rp-list"');
  assert.ok(mapAt >= 0 && noticeAt > mapAt && listAt > noticeAt, '地図 → 注意枠 → 物質一覧の順');
  assert.equal(html.slice(0, mapAt).includes('rp-data-notice'), false, '地図の上に注意枠を残さない');

  const start = html.indexOf('<div class="rp-notice" id="rp-data-notice">');
  const end = html.indexOf('</div>', html.indexOf('id="rp-data-note"'));
  const block = html.slice(start, end + '</div>'.length);
  assert.equal(crypto.createHash('sha256').update(block.replace(/\s+/g, '')).digest('hex'), NOTICE_SHA256,
    '注意枠の DOM 全文（空白を除く）が移動前と同一');
  assert.ok(block.includes('rp-data-summary') && block.includes('rp-data-note'));

  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(app.includes("document.getElementById('rp-data-summary')"));
  assert.ok(app.includes("document.getElementById('rp-data-note')"));
  assert.ok(app.includes('D.meta.heldReactionCount'), '保留件数の文言は生成側のまま');
});

test('[static] 地図と注意枠は密着させない（上マージンのみ調整）', () => {
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
  assert.match(css, /\.rp-map-panel \+ \.rp-notice\s*\{\s*margin-top:\s*14px;?\s*\}/);
  assert.match(css, /\.rp-notice\s*\{[^}]*margin:\s*14px 0/);
});
