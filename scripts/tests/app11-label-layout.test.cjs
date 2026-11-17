/**
 * 有機反応マップ（app11）— 反応ラベル配置ソルバ / ラベル API の回帰
 *
 * 実行: node --test scripts/tests/app11-label-layout.test.cjs
 *
 * ブラウザ・外部APIは使わない。純モジュール（reaction-label-layout / label-quality）と
 * 生成済み JSON の一部だけを読み、次を固定する。
 * - 出力契約: box が正、type は box 中心、anchor は 'center'、leader は plain 配列
 * - ラベルは node / 他ラベル / 実描画線（自線含む）から余白を保つ
 * - 通常モードの座標・経路を動かさない（ラベルだけ後処理）
 * - 代表の強5件は direct/leader へ改善する（幾何的に不可能な 1 件は未解決理由を残す）
 * - アカデミック配置のアダプタも同じ契約で動く
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site-src', 'app11');
const solver = require(path.join(ROOT, 'scripts', 'app11', 'reaction-label-layout.cjs'));
const Q = require(path.join(ROOT, 'scripts', 'app11', 'label-quality.cjs'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const F = require(path.join(ROOT, 'scripts', 'app11', 'layout-format.cjs'));
const VG = require(path.join(__dirname, 'helpers', 'app11-visible-geometry.cjs'));

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

// ユーザー報告の代表 + 強5件。
const STRONG = [
  'ethanol-dehydration-ethene',
  'ethanol-sodium',
  'ethanol-cuo-oxidation',
  'ethyne-full-hydrogenation',
  'acetic-acid-sodium-carbonate',
  'methanol-cuo-oxidation',
  'ethene-hydration'
];
// 固定ノード・固定経路のため、ラベル矩形だけでは目標を満たせない既知の 1 件。
const INFEAISBLE = new Set(['ethanol-sodium']);
// 改善前（ユーザー報告時点）の自線距離。悪化していないことを固定する。
const ORIGINAL_OWN = {
  'ethanol-dehydration-ethene': 73.71,
  'ethanol-sodium': 60.48,
  'ethanol-cuo-oxidation': 48.65,
  'ethyne-full-hydrogenation': 69.43,
  'acetic-acid-sodium-carbonate': 59.36,
  'methanol-cuo-oxidation': 43.17,
  'ethene-hydration': 23.54
};

function syntheticScene() {
  const compounds = {
    a: { x: 0, y: 0, w: 100, h: 30 },
    b: { x: 400, y: 0, w: 100, h: 30 },
    c: { x: 0, y: -95, w: 100, h: 30 },
    d: { x: 400, y: -95, w: 100, h: 30 }
  };
  const reactions = {
    r1: {
      x: 250, y: 15, tier: 'primary', typeLabel: '付加',
      conditions: '', substrates: ['a'], products: ['b']
    },
    r2: {
      x: 250, y: -80, tier: 'secondary', typeLabel: '付加',
      conditions: '', substrates: ['c'], products: ['d']
    }
  };
  const edges = {
    'r1|in|a': { reaction: 'r1', compound: 'a', dir: 'in', tier: 'primary', points: [[100, 15], [250, 15]] },
    'r1|out|b': { reaction: 'r1', compound: 'b', dir: 'out', tier: 'primary', points: [[250, 15], [400, 15]] },
    'r2|in|c': { reaction: 'r2', compound: 'c', dir: 'in', tier: 'secondary', points: [[100, -80], [250, -80]] },
    'r2|out|d': { reaction: 'r2', compound: 'd', dir: 'out', tier: 'secondary', points: [[250, -80], [400, -80]] }
  };
  const labels = {
    r1: {
      side: 'E', anchor: 'center',
      type: { x: 250, y: -80 },
      cond: null,
      box: { x: 210, y: -88, w: 80, h: 16 }
    }
  };
  return { compounds, reactions, edges, labels };
}

test('[contract] solveLabels は box と中心 type、余白を保つ direct 配置を返す', () => {
  const scene = syntheticScene();
  const result = solver.solveLabels(scene, { targets: ['r1'], repairPasses: 0 });
  const label = result.labels.r1;
  assert.ok(label, 'ラベルが返る');
  assert.equal(label.type.x, label.box.x + label.box.w / 2);
  assert.equal(label.type.y, label.box.y + label.box.h / 2);
  const ownDistance = Math.min(
    solver.segRectDistance({ x: 100, y: 15 }, { x: 250, y: 15 }, label.box),
    solver.segRectDistance({ x: 250, y: 15 }, { x: 400, y: 15 }, label.box)
  );
  assert.ok(ownDistance >= 3.99, '自線から 4px 以上離れる: ' + ownDistance);
  assert.ok(ownDistance <= 12, '自線の近く: ' + ownDistance);
  assert.ok(['direct', 'leader'].includes(result.metrics.r1.state), result.metrics.r1.state);
  assert.ok(result.metrics.r1.ownerDistance <= 12, '自線距離 ' + result.metrics.r1.ownerDistance);
  assert.ok(result.metrics.r1.margin == null || result.metrics.r1.margin >= 8, 'margin ' + result.metrics.r1.margin);
});

test('[determinism] 同じ入力から同じ出力（乱数・時刻なし）', () => {
  const a = solver.solveLabels(syntheticScene(), { targets: ['r1'], repairPasses: 1 });
  const b = solver.solveLabels(syntheticScene(), { targets: ['r1'], repairPasses: 1 });
  assert.deepEqual(a, b);
});

test('[hard] 線・ノード・既存ラベルの余白を破らない', () => {
  const scene = syntheticScene();
  // 障害物ノードを線上に置くと、その真上の候補は選ばれない。
  scene.compounds.block = { x: 150, y: 0, w: 60, h: 30 };
  const result = solver.solveLabels(scene, { targets: ['r1'], repairPasses: 0 });
  const box = result.labels.r1.box;
  assert.equal(G.rectsOverlap(box, scene.compounds.block), false, '障害物ノードと重ならない');
  const idx = new solver.SegmentIndex(48);
  for (const key of Object.keys(scene.edges)) {
    idx.add(scene.edges[key].reaction, scene.edges[key].points);
  }
  const near = idx.near(box, 3.99);
  assert.equal(near.size, 0, 'どの線にも 4px 未満で近づかない');
});

test('[api] layout-format は anchor と leader を保存する', () => {
  const layout = {
    version: 4,
    seed: 0,
    priorityHash: 'x',
    topologyNetworkx: null,
    nodeW: 136,
    nodeH: 34,
    canvas: { x: 0, y: 0, w: 10, h: 10 },
    shelf: { x: 0, y: 0, cols: 1, rows: 1, count: 0 },
    regions: [],
    positions: {},
    reactions: {
      r1: {
        x: 0, y: 0, tier: 'primary',
        label: {
          side: 'E',
          type: { x: 5.5, y: 9 },
          anchor: 'center',
          cond: null,
          box: { x: 1, y: 1, w: 9, h: 16 },
          leader: [[0, 0], [4, 4]]
        },
        substrates: [], products: [], typeLabel: '付加', conditions: '', cross: false
      }
    }
  };
  const rendered = JSON.parse(F.renderLayout(layout));
  assert.equal(rendered.reactions.r1.label.anchor, 'center');
  assert.deepEqual(rendered.reactions.r1.label.leader, [[0, 0], [4, 4]]);
  assert.equal(rendered.reactions.r1.label.type.x, 5.5);
});

test('[normal] 代表の強5件は direct/leader、座標・経路は不変', () => {
  const layout = clone(readJson('layout.json'));
  const routes = clone(readJson('routes.json'));
  const positionsBefore = JSON.stringify(layout.positions);
  const edgesBefore = JSON.stringify(routes.edges);

  const report = Q.applyNormalLabelLayout(layout, routes, {
    targets: STRONG,
    priority: STRONG,
    strong: STRONG,
    repairPasses: 0
  });

  assert.equal(JSON.stringify(layout.positions), positionsBefore, '物質座標は不変');
  assert.equal(JSON.stringify(routes.edges), edgesBefore, '保存経路は不変');
  for (const id of STRONG) {
    const entry = report.labels[id];
    assert.ok(entry, id + ' の結果');
    const label = layout.reactions[id].label;
    assert.equal(label.anchor, 'center', id + ' は center 契約');
    assert.equal(label.type.x, label.box.x + label.box.w / 2, id + ' の type.x は中心');
    assert.equal(label.type.y, label.box.y + label.box.h / 2, id + ' の type.y は中心');
    if (INFEAISBLE.has(id)) {
      if (entry.after.state === 'leader') {
        assert.ok(entry.after.leaderLength > 0 && entry.after.leaderLength <= 48, id + ' の leader 長');
        assert.ok(entry.after.ownerDistance < ORIGINAL_OWN[id] - 20, id + ' は改善前より自線へ近い');
        continue;
      }
      if (entry.after.state !== 'direct') {
        // 幾何的に目標未達なら、理由を残して正直に報告する。
        assert.ok(entry.after.reason, id + ' は未解決理由を残す');
        assert.ok(entry.after.ownerDistance < ORIGINAL_OWN[id] - 20, id + ' は改善前より自線へ近い');
        continue;
      }
    }
    assert.ok(['direct', 'leader'].includes(entry.after.state),
      id + ' が未解決: ' + entry.after.reason);
    assert.ok(entry.after.ownerDistance <= 12, id + ' own=' + entry.after.ownerDistance);
    assert.ok(entry.after.margin == null || entry.after.margin >= 8, id + ' margin=' + entry.after.margin);
    assert.ok(entry.after.ownerDistance < ORIGINAL_OWN[id] - 5, id + ' は改善前より自線へ近づく');
  }
});

test('[quality] 後処理後のラベルは線・ノード・ラベルから余白を保つ', () => {
  const layout = clone(readJson('layout.json'));
  const routes = clone(readJson('routes.json'));
  Q.applyNormalLabelLayout(layout, routes, {
    targets: STRONG, priority: STRONG, strong: STRONG, repairPasses: 0
  });

  const geo = Q.buildDrawnLines({
    positions: layout.positions,
    markers: layout.reactions,
    edges: routes.edges,
    nodeW: layout.nodeW,
    nodeH: layout.nodeH
  });
  const lines = geo.lines;
  const labels = {};
  for (const id of STRONG) {
    if (layout.reactions[id].label) labels[id] = layout.reactions[id].label;
  }
  const measured = Q.measureLabels(labels, lines, { ownerLines: geo.lines });
  for (const id of Object.keys(measured)) {
    const m = measured[id];
    const nearest = Math.min(
      m.ownerDistance == null ? Infinity : m.ownerDistance,
      m.foreignDistance == null ? Infinity : m.foreignDistance
    );
    if (INFEAISBLE.has(id)) {
      assert.ok(nearest > 0.5, id + ' が線を貫通している: ' + nearest);
    } else {
      assert.ok(nearest >= 3.99, id + ' が線に近すぎる: ' + nearest);
    }
    const box = labels[id].box;
    for (const other of Object.keys(labels)) {
      if (other === id) continue;
      assert.equal(G.rectsOverlap(box, labels[other].box), false, id + ' / ' + other + ' のラベル重複');
    }
  }
});


// 親共有の固定26 ID。この26件は必ず「自線 nearest（strict）」または
// 「実際に描画される Core の path（arrow 塗り含む）へ接続する有効 leader」で対応を明確にする。
const FIXED_26 = [
  'ethanol-dehydration-ethene', 'ethyne-full-hydrogenation', 'acetic-acid-sodium-carbonate',
  'ethanol-sodium', 'methanol-cuo-oxidation', 'glucose-fermentation',
  'methyl-salicylate-hydrolysis', 'ethene-hydration', 'ethanol-cuo-oxidation',
  'benzoic-acid-neutralization', 'propan-2-ol-cuo-oxidation', 'triolein-hydrogenation',
  'polyacetylene-polymerization', 'chlorobenzene-dow-phenol', 'caprolactam-ring-opening',
  'salicylic-acid-methyl-esterification', 'ethyne-hydrogen-bromide',
  'sodium-acetate-decarboxylation', 'phenol-nitration', 'phenol-phthalein',
  'ethyne-partial-hydrogenation', 'stearic-acid-neutralization',
  'ethylbenzene-dehydrogenation', 'benzene-chlorine-addition',
  'sodium-phenoxide-acidification', 'acetic-acid-anhydride'
];

// テスト側で Core から独立に実描画 geometry を作る（module の buildDrawnLines を鵜呑みにしない）。
function actualPaint(layout, routes) {
  const Core = require(path.join(ROOT, 'site', 'app11', 'map-core.js'));
  const compoundById = {};
  for (const id of Object.keys(layout.positions)) {
    const p = layout.positions[id];
    compoundById[id] = { id, x: p.x, y: p.y, w: p.w, h: p.h };
  }
  const byReaction = {};
  for (const key of Object.keys(routes.edges)) {
    const e = routes.edges[key];
    if (!Array.isArray(e.points) || e.points.length < 2) continue;
    if (!byReaction[e.reaction]) byReaction[e.reaction] = [];
    byReaction[e.reaction].push({
      dir: e.dir, id: e.compound, tier: e.tier,
      points: e.points.map((p) => ({ x: p[0], y: p[1] })), gaps: e.gaps || [], bridges: e.bridges || []
    });
  }
  const conns = {};
  const all = [];
  for (const id of Object.keys(layout.reactions)) {
    const m = layout.reactions[id];
    const list = Core.reactionConnectors({ id, x: m.x, y: m.y, edges: byReaction[id] || [] }, {
      compoundById, nodeW: layout.nodeW, nodeH: layout.nodeH
    });
    (list || []).forEach((c) => { c.rid = id; });
    conns[id] = list || [];
    for (const c of conns[id]) all.push(c);
  }
  Core.separateSharedPorts(all);
  Core.enforcePaintClearance(all);
  const lines = {};
  const triangles = {};
  for (const id of Object.keys(conns)) {
    lines[id] = [];
    triangles[id] = [];
    for (const c of conns[id]) {
      const d = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
      for (const sp of Core.samplePath(d, 0.25) || []) {
        if (sp && sp.length > 1) lines[id].push(sp.map((p) => ({ x: p.x, y: p.y })));
      }
      if (c.arrowHead) {
        const hd = Core.arrowHeadPath(c.arrowHead);
        for (const sp of Core.samplePath(hd, 0.25) || []) {
          if (sp && sp.length > 1) lines[id].push(sp.map((p) => ({ x: p.x, y: p.y })));
        }
        triangles[id].push([c.arrowHead.tip, c.arrowHead.left, c.arrowHead.right]);
      }
    }
  }
  return { lines, triangles };
}

function pointInTriangle(p, tri) {
  const [a, b, c] = tri;
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function paintDistance(id, p, paint) {
  let best = Infinity;
  for (const poly of paint.lines[id] || []) {
    for (let i = 0; i < poly.length - 1; i++) best = Math.min(best, G.distPointSeg(p, poly[i], poly[i + 1]));
  }
  for (const tri of paint.triangles[id] || []) if (pointInTriangle(p, tri)) best = 0;
  return best;
}

function leaderCheck(layout, routes, paint, label, id) {
  const leader = label.leader;
  if (!Array.isArray(leader) || leader.length < 2) return { valid: false, reason: 'no-leader' };
  const pts = leader.map((p) => ({ x: p[0], y: p[1] }));
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  if (length <= 0.5 || length > 80 + 1e-6) return { valid: false, reason: 'length ' + length };
  const box = label.box;
  const start = pts[0];
  const boundary = Math.min(
    G.distPointSeg(start, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }),
    G.distPointSeg(start, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }),
    G.distPointSeg(start, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }),
    G.distPointSeg(start, { x: box.x, y: box.y + box.h }, { x: box.x, y: box.y })
  );
  if (boundary > 0.8) return { valid: false, reason: 'start-not-boundary ' + boundary };
  const end = pts[pts.length - 1];
  const endGap = paintDistance(id, end, paint);
  if (endGap > 0.7) return { valid: false, reason: 'end-gap ' + endGap };
  const otherLabels = Object.keys(layout.reactions)
    .filter((other) => other !== id && layout.reactions[other].label)
    .map((other) => layout.reactions[other].label);
  const otherLeaders = otherLabels
    .filter((l) => Array.isArray(l.leader) && l.leader.length > 1)
    .map((l) => l.leader.map((p) => ({ x: p[0], y: p[1] })));
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    for (const rid of Object.keys(paint.lines)) {
      if (rid === id) continue;
      for (const poly of paint.lines[rid]) {
        for (let k = 0; k < poly.length - 1; k++) {
          if (G.segSegDistance(p1, p2, poly[k], poly[k + 1]) < 0.4) return { valid: false, reason: 'foreign ' + rid };
        }
      }
    }
    for (const nid of Object.keys(layout.positions)) {
      const n = layout.positions[nid];
      if (G.segmentRect(p1, p2, { x: n.x, y: n.y, w: n.w, h: n.h })) return { valid: false, reason: 'node ' + nid };
    }
    for (const other of otherLabels) {
      if (G.segmentRect(p1, p2, other.box)) return { valid: false, reason: 'label-cross' };
    }
    for (const ol of otherLeaders) {
      for (let k = 0; k < ol.length - 1; k++) {
        if (G.segSegDistance(p1, p2, ol[k], ol[k + 1]) < 0.4) return { valid: false, reason: 'leader-cross' };
      }
    }
  }
  return { valid: true, length, endGap };
}

test('[fixed26] 元26 ID は全件 strict direct または実 Core paint へ接続する leader', () => {
  const layout = clone(readJson('layout.json'));
  const routes = clone(readJson('routes.json'));
  const targets = FIXED_26.filter((id) => layout.reactions[id] && layout.reactions[id].label);
  assert.equal(targets.length, FIXED_26.length, '26 ID すべてにラベルがある');

  const paint = actualPaint(layout, routes);
  // owner 距離は実描画 lines で測る（保存経路は障害物評価にだけ使う）。
  const storedLines = {};
  for (const key of Object.keys(routes.edges)) {
    const e = routes.edges[key];
    if (!storedLines[e.reaction]) storedLines[e.reaction] = [];
    storedLines[e.reaction].push(e.points.map((p) => ({ x: p[0], y: p[1] })));
  }
  const obstacleLines = {};
  for (const id of Object.keys(paint.lines)) obstacleLines[id] = paint.lines[id].slice();
  for (const id of Object.keys(storedLines)) obstacleLines[id] = (obstacleLines[id] || []).concat(storedLines[id]);
  const labels = {};
  for (const id of targets) labels[id] = layout.reactions[id].label;
  const measured = Q.measureLabels(labels, obstacleLines, { ownerLines: paint.lines });

  const invalid = [];
  for (const id of targets) {
    const m = measured[id];
    const strict = m.ownerDistance != null && m.ownerDistance <= 12 && (m.margin == null || m.margin >= 8);
    if (strict) continue;
    const check = leaderCheck(layout, routes, paint, layout.reactions[id].label, id);
    if (!check.valid) invalid.push(id + ' (' + check.reason + ')');
  }
  assert.deepEqual(invalid, [], '26 ID の未対応: ' + invalid.join(', '));

  const noLeader = [];
  for (const id of targets) {
    const m = measured[id];
    const inversion = m.foreignDistance != null && m.ownerDistance > m.foreignDistance;
    const hasLeader = Array.isArray(layout.reactions[id].label.leader) && layout.reactions[id].label.leader.length > 1;
    if (inversion && !hasLeader) noLeader.push(id);
  }
  assert.deepEqual(noLeader, [], '真逆転で leader 無し: ' + noLeader.join(', '));
});

test('[hard] 全80ラベル・旧 positions/routes/facts の不変条件', () => {
  const layout = clone(readJson('layout.json'));
  const routes = clone(readJson('routes.json'));
  const legacy = JSON.parse(fs.readFileSync(path.join(SRC, 'legacy-baseline.json'), 'utf8'));
  const S = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));
  const LB = require(path.join(ROOT, 'scripts', 'app11', 'legacy-baseline.cjs'));
  assert.equal(Object.keys(layout.positions).length, 427);
  assert.equal(Object.keys(layout.reactions).length, 162);
  assert.equal(Object.keys(routes.edges).length, 375);
  assert.equal(Object.keys(layout.reactions).filter((id) => layout.reactions[id].label).length, 80);
  assert.equal(Object.keys(layout.reactions).filter((id) => !layout.reactions[id].label).length, 82);
  assert.deepEqual(LB.verifySource(S.loadSource(), legacy), [], '旧facts不変');
  assert.deepEqual(LB.verifyLayout(layout, routes, legacy, S.loadSource()), [], '旧positions/routes不変');

  const paint = actualPaint(layout, routes);
  const storedLines = {};
  for (const key of Object.keys(routes.edges)) {
    const e = routes.edges[key];
    if (!storedLines[e.reaction]) storedLines[e.reaction] = [];
    storedLines[e.reaction].push(e.points.map((p) => ({ x: p[0], y: p[1] })));
  }
  const labels = {};
  for (const id of Object.keys(layout.reactions)) {
    if (layout.reactions[id].label) labels[id] = layout.reactions[id].label;
  }
  const ids = Object.keys(labels);
  let boxOverlap = 0;
  let storedHit = 0;
  for (let a = 0; a < ids.length; a++) {
    const box = labels[ids[a]].box;
    for (let b = a + 1; b < ids.length; b++) {
      if (G.rectsOverlap(box, labels[ids[b]].box)) boxOverlap++;
    }
    for (const nid of Object.keys(layout.positions)) {
      const n = layout.positions[nid];
      if (G.rectsOverlap(box, { x: n.x, y: n.y, w: n.w, h: n.h })) boxOverlap++;
    }
    for (const rid of Object.keys(storedLines)) {
      for (const poly of storedLines[rid]) {
        for (let k = 0; k < poly.length - 1; k++) {
          if (G.segmentRect(poly[k], poly[k + 1], G.inflate(box, -0.5))) storedHit++;
        }
      }
    }
  }
  assert.equal(boxOverlap, 0, 'ラベル同士/ノードの重なり');
  assert.equal(storedHit, 0, '保存経路の貫通');
});

test('[visible-gate] 通常80は実 Core paint で真逆転/遠距離の leader 無し 0', () => {
  const layout = clone(readJson('layout.json'));
  const routes = clone(readJson('routes.json'));
  const labels = {};
  for (const id of Object.keys(layout.reactions)) {
    if (layout.reactions[id].label) labels[id] = layout.reactions[id].label;
  }
  const paint = VG.buildPaint({
    positions: layout.positions, markers: layout.reactions, edges: routes.edges,
    nodeW: layout.nodeW, nodeH: layout.nodeH
  });
  const result = VG.gate(paint, labels, layout, {
    reactionMeta: layout.reactions
  });
  assert.deepEqual(result.invalidLeaders, [], '不正 leader');
  assert.deepEqual(result.inversionDifferentNameNoLeader, [], '異名の真逆転で有効 leader 無し');
  assert.deepEqual(result.farNoLeader, [], 'own>=25 で有効 leader 無し');
});

test('[academic-gate] 全314の実 visible で真逆転/遠距離の valid leader 無し 0', () => {
  // 実行時測定 module を鵜呑みにせず、Core から独立再構築した paint で判定する。
  const A = require(path.join(ROOT, 'site', 'app11', 'academic-data.js'));
  const lay = A.layout;
  const markers = Object.assign({}, lay.normalMarkers, lay.markers);
  const edges = Object.assign({}, lay.normalRoutes, lay.routes);
  const labels = {};
  for (const id of Object.keys(markers)) {
    if (markers[id].label) labels[id] = markers[id].label;
  }
  const paint = VG.buildPaint({ positions: lay.positions, markers, edges, nodeW: 136, nodeH: 34 });
  const D = require(path.join(ROOT, 'site', 'app11', 'data.js'));
  const meta = {};
  for (const r of D.reactions) meta[r.id] = { typeLabel: r.typeLabel };
  for (const r of A.reactions) meta[r.id] = { typeLabel: r.typeLabel };
  const result = VG.gate(paint, labels, { positions: lay.positions }, { reactionMeta: meta });
  assert.deepEqual(result.invalidLeaders, [], 'academic 不正 leader: ' + JSON.stringify(result.invalidLeaders.slice(0, 8)));
  assert.deepEqual(result.inversionDifferentNameNoLeader, [],
    'academic 異名の真逆転で有効 leader 無し: ' + JSON.stringify(result.inversionDifferentNameNoLeader));
  assert.deepEqual(result.farNoLeader, [],
    'academic own>=25 で有効 leader 無し: ' + JSON.stringify(result.farNoLeader));
  // 同名線だけ近い・strict margin 未達は補助分類（fail 条件にしない）。
  assert.ok(Array.isArray(result.sameNameNearer));
  assert.ok(Array.isArray(result.strictMarginOnly));
});

test('[visible-gate-classify] 同名近接は補助、異名近接は fail、同名でも own>=25 は far fail', () => {
  const basePaint = (foreignY, ownerY) => ({
    lines: {
      r1: [[{ x: 0, y: ownerY }, { x: 100, y: ownerY }]],
      r2: [[{ x: 0, y: foreignY }, { x: 100, y: foreignY }]]
    },
    triangles: {},
    positions: {},
    markers: {}
  });
  const label = { r1: { box: { x: 0, y: -8, w: 20, h: 4 } } };
  // 同名（酸化）で foreign が近い → inversionDifferentName に入れず補助へ
  let result = VG.gate(basePaint(-2, 0), label, { positions: {} }, {
    reactionMeta: { r1: { typeLabel: '酸化' }, r2: { typeLabel: '酸化' } }
  });
  assert.equal(result.inversionDifferentNameNoLeader.length, 0);
  assert.equal(result.sameNameNearer.length, 1);
  // 異名で foreign が近い → fail 対象
  result = VG.gate(basePaint(-2, 0), label, { positions: {} }, {
    reactionMeta: { r1: { typeLabel: '酸化' }, r2: { typeLabel: '付加' } }
  });
  assert.equal(result.inversionDifferentNameNoLeader.length, 1);
  // 同名でも own>=25 は far gate 対象
  const farLabel = { r1: { box: { x: 0, y: -40, w: 20, h: 4 } } };
  result = VG.gate(basePaint(-50, 0), farLabel, { positions: {} }, {
    reactionMeta: { r1: { typeLabel: '酸化' }, r2: { typeLabel: '酸化' } }
  });
  assert.equal(result.farNoLeader.length, 1);
});

test('[academic] アダプタは座標を動かさず center 契約のラベルを返す', () => {
  const placed = {
    version: 2,
    positions: {
      a: { x: 0, y: 0, w: 100, h: 30 },
      b: { x: 400, y: 0, w: 100, h: 30 }
    },
    normalMarkers: {},
    markers: {
      'academic-r1': {
        x: 250, y: 15, tier: 'academic',
        label: {
          side: 'E', anchor: 'center', type: { x: 250, y: -80 }, cond: null,
          box: { x: 200, y: -88, w: 100, h: 18 }
        }
      }
    },
    normalRoutes: {},
    routes: {
      'academic-r1|in|a': { reaction: 'academic-r1', compound: 'a', dir: 'in', tier: 'academic', points: [[100, 15], [250, 15]] },
      'academic-r1|out|b': { reaction: 'academic-r1', compound: 'b', dir: 'out', tier: 'academic', points: [[250, 15], [400, 15]] }
    },
    canvas: { x: 0, y: 0, w: 500, h: 100 }
  };
  const routesBefore = JSON.stringify(placed.routes);
  const report = Q.applyAcademicLabelLayout(placed, { frame: null, nodes: [] }, {
    'academic-r1': { tier: 'academic', typeLabel: '付加', substrates: ['a'], products: ['b'] }
  }, { nodeW: 136, nodeH: 34, typeH: 18, repairPasses: 0 });
  assert.ok(report.labels['academic-r1']);
  assert.equal(placed.markers['academic-r1'].x, 250, 'マーカー x は不変');
  assert.equal(placed.markers['academic-r1'].y, 15, 'マーカー y は不変');
  assert.equal(JSON.stringify(placed.routes), routesBefore, '経路は不変');
  const label = placed.markers['academic-r1'].label;
  assert.equal(label.anchor, 'center');
  assert.equal(label.type.x, label.box.x + label.box.w / 2);
  assert.equal(label.type.y, label.box.y + label.box.h / 2);
  assert.ok(label.leader === null || Array.isArray(label.leader));
});
