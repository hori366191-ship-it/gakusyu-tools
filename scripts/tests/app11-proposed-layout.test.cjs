/**
 * app11 通常配置案（normal-proposed）の幾何・契約・描画回帰
 *
 * 実行: node --test scripts/tests/app11-proposed-layout.test.cjs
 *
 * 目的:
 *   - 427 物質 / 162 反応 / 375 辺がそろい、base の facts ハッシュが data.js と一致する。
 *   - 旧 layout.json / routes.json / data.js は読むだけで変更しない（座標のコピーでもない）。
 *   - 未接続 269 の棚参加者は現行と同じで、接続 158 は棚に入らない。
 *   - 既存 metrics.cjs の定義で hard 衝突 0（node / label / marker / endpoint / class map）。
 *   - 実際の描画（map-core.js）で connector の paint gap が 0.75 以上、描画折れ線の貫通 0。
 *   - `--check` が決定的に一致する（CI 用）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const SRC = path.join(ROOT, 'site-src', 'app11');

const D = require(path.join(APP, 'data.js'));
const P = require(path.join(APP, 'proposed-layout-data.js'));
const Contract = require(path.join(APP, 'proposal-contract.js'));
const Core = require(path.join(APP, 'map-core.js'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const M = require(path.join(ROOT, 'scripts', 'app11', 'metrics.cjs'));
const B = require(path.join(ROOT, 'scripts', 'app11', 'build-proposed-layout.cjs'));

const EDGE_KEYS = [];
D.reactions.forEach((r) => {
  r.edges.forEach((e) => EDGE_KEYS.push(r.id + '|' + e.dir + '|' + e.id));
});
const CONNECTED_IDS = new Set(D.compounds.filter((c) => c.incoming + c.outgoing > 0).map((c) => c.id));
const ISOLATED_IDS = new Set(D.compounds.filter((c) => c.incoming + c.outgoing === 0).map((c) => c.id));

test('[contract] kind / version / base / 件数', () => {
  assert.equal(P.kind, 'normal-proposed');
  assert.equal(P.version, 1);
  assert.deepEqual(P.base, Contract.buildBase(D));
  assert.deepEqual(Contract.verifyProposal(P, D), { ok: true });
  assert.equal(Object.keys(P.positions).length, 427);
  assert.equal(Object.keys(P.markers).length, 162);
  assert.equal(Object.keys(P.routes).length, 375);
  assert.deepEqual(new Set(Object.keys(P.markers)), new Set(D.reactions.map((r) => r.id)));
  assert.deepEqual(new Set(Object.keys(P.routes)), new Set(EDGE_KEYS));
  assert.equal(P.stats.counts.labels, 162);
  assert.equal(P.stats.labels.missing, 0);
  assert.ok(P.canvas.w > 0 && P.canvas.h > 0);
});

test('[contract] base が違うと fail-closed で拒否する', () => {
  const tampered = JSON.parse(JSON.stringify({ base: P.base, kind: P.kind, version: P.version,
    positions: P.positions, markers: P.markers, routes: P.routes, canvas: P.canvas }));
  tampered.base.reactionHash = '00000000';
  const verdict = Contract.verifyProposal(tampered, D);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /通常データと一致しない/);
});

test('[contract] label / route の欠落・不正を厳密に拒否する（mutation）', () => {
  const clone = () => JSON.parse(JSON.stringify({
    version: P.version, kind: P.kind, base: P.base, positions: P.positions,
    markers: P.markers, routes: P.routes, canvas: P.canvas,
    regionFocus: P.regionFocus, stats: P.stats, warnings: P.warnings
  }));
  const firstReaction = D.reactions[0].id;
  const firstLabel = () => clone().markers[firstReaction].label;
  const firstRouteKey = () => Object.keys(P.routes)[0];
  const cases = [
    ['box.y 欠落', (p) => { delete p.markers[firstReaction].label.box.y; }],
    ['box.h NaN', (p) => { p.markers[firstReaction].label.box.h = NaN; }],
    ['box.w 0', (p) => { p.markers[firstReaction].label.box.w = 0; }],
    ['box.x 文字列', (p) => { p.markers[firstReaction].label.box.x = '10'; }],
    ['type.x NaN', (p) => { p.markers[firstReaction].label.type.x = NaN; }],
    ['cond が点でない', (p) => { p.markers[firstReaction].label.cond = { x: 1 }; }],
    ['anchor 未知', (p) => { p.markers[firstReaction].label.anchor = 'bogus'; }],
    ['leader 1点', (p) => { p.markers[firstReaction].label.leader = [[1, 2]]; }],
    ['leader 非有限', (p) => { p.markers[firstReaction].label.leader = [{ x: 1, y: 2 }, { x: 'a', y: 3 }]; }],
    ['leader 80px 超', (p) => { p.markers[firstReaction].label.leader = [[0, 0], [81, 0]]; }],
    ['marker.tier 不一致', (p) => { p.markers[firstReaction].tier = 'academic'; }],
    ['route.points 1点', (p) => { p.routes[firstRouteKey()].points = [[0, 0]]; }],
    ['route.points 非有限', (p) => { const r = p.routes[firstRouteKey()]; r.points[0] = [NaN, 0]; }],
    ['route.tier 不正', (p) => { p.routes[firstRouteKey()].tier = 'academic'; }],
    ['route.key 不一致', (p) => {
      const key = firstRouteKey();
      p.routes[key + '|extra'] = p.routes[key];
      delete p.routes[key];
    }],
    ['route.compound が文字列でない', (p) => { p.routes[firstRouteKey()].compound = 42; }]
  ];
  cases.forEach((entry) => {
    const mutated = clone();
    entry[1](mutated);
    const verdict = Contract.verifyProposal(mutated, D);
    assert.equal(verdict.ok, false, entry[0] + ' を許可してしまった');
    assert.ok(typeof verdict.reason === 'string' && verdict.reason.length > 0, entry[0] + ' の理由');
  });
  // 元データは通る（mutation が偶然 base を壊していないことの対照）。
  assert.deepEqual(Contract.verifyProposal(clone(), D), { ok: true });
  assert.equal(firstLabel().anchor, 'center');

  // short 48 / extended 48..80 は schema として許可（品質は solver stat で区別する）。
  const withLongLeader = clone();
  withLongLeader.markers[firstReaction].label.leader = [[0, 0], [70, 0]];
  assert.deepEqual(Contract.verifyProposal(withLongLeader, D), { ok: true });
});

test('[facts] 既存データは不変で、旧座標のコピーではない', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
  const routes = JSON.parse(fs.readFileSync(path.join(SRC, 'routes.json'), 'utf8'));
  assert.equal(Object.keys(layout.positions).length, 427);
  assert.equal(Object.keys(routes.edges).length, 375);
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.reactionCount, 162);

  // 旧座標をそのまま使っていないこと（少なくとも大半の物質が 50px 以上動いている）。
  let moved = 0;
  D.compounds.forEach((c) => {
    const p = P.positions[c.id];
    if (Math.hypot(p.x - c.x, p.y - c.y) > 50) moved++;
  });
  assert.ok(moved > 400, '旧座標のコピー: ' + moved + '/427');
});

test('[independence] 旧 coords / 旧 label / 旧 edge points を入力に使わない', () => {
  const PGen = require(path.join(ROOT, 'scripts', 'app11', 'proposed-network-layout.cjs'));
  // 既存の生成 P を正解とし、旧座標・旧ラベル・旧 edge points だけを変えた入力で 1 回生成して比較する。
  const movedCompounds = D.compounds.map((c) => ({
    id: c.id, w: c.w, h: c.h, region: c.region, regionIndex: c.regionIndex,
    incoming: c.incoming, outgoing: c.outgoing,
    x: (c.x || 0) + 5000, y: (c.y || 0) - 3000
  }));
  const movedReactions = D.reactions.map((r, i) => ({
    id: r.id, tier: r.tier, typeLabel: r.typeLabel, conditions: r.conditions,
    substrates: r.substrates, products: r.products,
    x: (r.x || 0) + 7000, y: (r.y || 0) - 4000,
    label: { side: 'W', type: { x: 1 + i, y: 2 + i }, cond: null,
      box: { x: 3 + i, y: 4 + i, w: 50, h: 16 } },
    edges: (r.edges || []).map((e) => ({ dir: e.dir, id: e.id, tier: e.tier,
      points: [[9999 + i, 9999 + i], [10000 + i, 10000 + i]] }))
  }));
  const built = PGen.buildLayout({
    compounds: movedCompounds,
    reactions: movedReactions,
    classMap: D.classMap,
    nodeW: D.meta.nodeW,
    nodeH: D.meta.nodeH
  });
  const pick = (o) => JSON.stringify({
    positions: o.positions,
    markers: o.markers,
    routes: Object.fromEntries(Object.keys(o.routes).map((key) => {
      const route = o.routes[key];
      return [key, Object.assign({}, route, {
        points: route.points.map((pt) => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.x, pt.y]))
      })];
    })),
    canvas: o.canvas
  });
  assert.equal(pick(built), pick(P), '旧座標/旧ラベル/旧edge points が生成結果に影響している');
});

test('[shelf] 未接続 269 は棚、接続 158 は棚の外（新規参加 0）', () => {
  assert.equal(ISOLATED_IDS.size, 269);
  assert.equal(CONNECTED_IDS.size, 158);
  const shelf = P.stats.counts;
  assert.equal(shelf.shelf, 269);
  const xs = [];
  ISOLATED_IDS.forEach((id) => xs.push(P.positions[id].x));
  const shelfX = Math.min.apply(null, xs);
  const shelfMaxX = Math.max.apply(null, xs);
  ISOLATED_IDS.forEach((id) => {
    assert.ok(P.positions[id].x >= shelfX, '棚の左端: ' + id);
    assert.ok(P.positions[id].x <= shelfMaxX, '棚の右端: ' + id);
  });
  CONNECTED_IDS.forEach((id) => {
    const p = P.positions[id];
    assert.ok(p.x < shelfX - 10, '接続済み物質が棚側: ' + id);
  });
});

test('[geometry] metrics.cjs の hard 衝突 0・経路長と交差の計測', () => {
  const scene = B.sceneOf(P, D);
  const report = M.measure(scene);
  const hardKeys = B.HARD_KEYS;
  hardKeys.forEach((key) => {
    assert.equal(report.hard[key], 0, 'hard ' + key + '=' + report.hard[key]);
  });
  assert.equal(report.edges.nodePenetrations, 0);
  assert.equal(report.edges.labelPenetrations, 0);
  assert.equal(report.edges.markerPenetrations, 0);
  assert.equal(report.edges.endpointPenetrations, 0);
  assert.equal(report.nodes.overlaps, 0);
  // 提案データに保存した交差数と一致する（同じ計算であること）。
  assert.equal(report.edges.crossings, P.stats.crossings);
  assert.equal(report.edges.crossings, P.stats.compare.proposal.crossings);
  assert.ok(typeof P.stats.crossingsInternal === 'number');
  // 交差・総辺長は比較用の値として記録する（現行より増える tradeoff を許容）。
  assert.ok(Number.isFinite(report.edges.totalLength));
  assert.ok(report.edges.totalLength > 0);
});

test('[renderer] 実描画 connector の paint gap >= 0.75 と貫通 0', () => {
  const compoundById = {};
  D.compounds.forEach((c) => {
    const p = P.positions[c.id];
    compoundById[c.id] = Object.assign({}, c, { x: p.x, y: p.y, w: p.w, h: p.h });
  });
  const reactions = D.reactions.map((r) => {
    const marker = P.markers[r.id];
    return {
      id: r.id,
      x: marker.x,
      y: marker.y,
      tier: r.tier,
      typeLabel: r.typeLabel,
      conditions: r.conditions,
      substrates: r.substrates,
      products: r.products,
      label: marker.label,
      edges: r.edges.map((e) => {
        const route = P.routes[r.id + '|' + e.dir + '|' + e.id];
        return { dir: e.dir, id: e.id, tier: route.tier, points: route.points, gaps: [], bridges: [] };
      })
    };
  });

  let connectors = [];
  reactions.forEach((r) => {
    connectors = connectors.concat(Core.reactionConnectors(r, {
      compoundById: compoundById,
      nodeW: D.meta.nodeW,
      nodeH: D.meta.nodeH
    }));
  });
  Core.separateSharedPorts(connectors);
  Core.enforcePaintClearance(connectors);

  let minGap = Infinity;
  connectors.forEach((c) => {
    (c.ends || []).forEach((end) => {
      if (!end.rect) return;
      const gap = Core.connectorShapeGap(c, end);
      if (gap == null) return;
      if (gap < minGap) minGap = gap;
      assert.ok(gap >= 0.75 - 1e-6,
        'paint gap ' + gap.toFixed(3) + ' (' + c.edgeKeys[0] + ' / ' + end.role + ')');
    });
  });
  assert.ok(minGap >= 0.75 - 1e-6, '最小 paint gap ' + minGap);

  const nodeRects = D.compounds.map((c) => {
    const p = P.positions[c.id];
    return { id: c.id, rect: { x: p.x, y: p.y, w: p.w, h: p.h } };
  });
  const labelRects = Object.keys(P.markers).map((id) => ({ id: id, rect: P.markers[id].label.box }));
  let nodeHits = 0;
  let labelHits = 0;
  let markerHits = 0;
  connectors.forEach((c) => {
    const own = (c.edgeKeys[0] || '').split('|')[0];
    for (let i = 0; i < c.points.length - 1; i++) {
      const a = c.points[i];
      const b = c.points[i + 1];
      nodeRects.forEach((n) => {
        if (c.compounds.indexOf(n.id) !== -1) return;
        if (G.segmentRect(a, b, G.inflate(n.rect, -0.5))) nodeHits++;
      });
      labelRects.forEach((l) => {
        if (G.segmentRect(a, b, G.inflate(l.rect, -0.5))) labelHits++;
      });
      Object.keys(P.markers).forEach((id) => {
        if (id === own) return;
        const m = P.markers[id];
        if (G.segmentRect(a, b, G.inflate(G.markerBox(m.x, m.y), 2))) markerHits++;
      });
    }
  });
  assert.equal(nodeHits, 0, '描画線のノード貫通');
  assert.equal(labelHits, 0, '描画線のラベル貫通');
  assert.equal(markerHits, 0, '描画線の他マーカー貫通');
});

test('[check] 生成物が --check で決定的に一致する', () => {
  const result = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'app11', 'build-proposed-layout.cjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.match(result.stdout, /proposed-layout-data\.js は最新です/);
});


/* ------------------------------------------------------------------
 * 意味ゲート: 実 Core pipeline（.25 サンプル + arrow triangle）で
 *   - 全 162: 真の逆転（owner > foreign + 0.25）かつ valid leader 無し 0
 *   - 全 162: own >= 25 かつ valid leader 無し 0
 *   - 全 leader: owner paint 接続 / foreign・node・label・leader cross 0
 *   - 元26 + user3 + strong5: strict direct(<=12, margin>=8) または valid leader
 * を検査する。現時点で known fail の場合は CI を赤にする（緑にしない）。
 * ------------------------------------------------------------------ */

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
const USER3 = ['ethanol-dehydration-ethene', 'ethanol-sodium', 'ethanol-cuo-oxidation'];
const STRONG5 = ['ethanol-dehydration-ethene', 'ethyne-full-hydrogenation',
  'acetic-acid-sodium-carbonate', 'ethanol-sodium', 'methanol-cuo-oxidation'];

function buildVisibleGate() {
  const H = require(path.join(ROOT, 'scripts', 'tests', 'helpers', 'app11-visible-geometry.cjs'));
  const edges = {};
  Object.keys(P.routes).forEach((key) => {
    const e = P.routes[key];
    edges[key] = { reaction: e.reaction, compound: e.compound, dir: e.dir, tier: e.tier,
      points: e.points, gaps: [], bridges: [] };
  });
  const paint = H.buildPaint({
    positions: P.positions,
    markers: P.markers,
    edges: edges,
    nodeW: D.meta.nodeW,
    nodeH: D.meta.nodeH
  });
  const labels = {};
  Object.keys(P.markers).forEach((id) => {
    labels[id] = { box: P.markers[id].label.box, leader: P.markers[id].label.leader || null, type: P.markers[id].label.type };
  });
  const layout = { positions: P.positions };
  const result = H.gate(paint, labels, layout);
  return { H: H, paint: paint, labels: labels, layout: layout, result: result };
}

test('[semantic-gate] 全162: 真の逆転/own>=25 に valid leader 無し 0', () => {
  const g = buildVisibleGate().result;
  console.log('[semantic] inversionDifferentNameNoLeader', JSON.stringify(g.inversionDifferentNameNoLeader));
  console.log('[semantic] sameNameNearer', JSON.stringify(g.sameNameNearer));
  console.log('[semantic] farNoLeader', JSON.stringify(g.farNoLeader));
  assert.deepEqual(g.inversionDifferentNameNoLeader, [], '異名の真逆転（owner > foreign + 0.25）に valid leader が無い');
  assert.deepEqual(g.farNoLeader, [], 'own>=25 に valid leader が無い');
});

test('[semantic-gate] 全 leader: owner paint 接続・foreign/node/label/leader cross 0', () => {
  const g = buildVisibleGate().result;
  console.log('[semantic] invalidLeaders', JSON.stringify(g.invalidLeaders));
  assert.deepEqual(g.invalidLeaders, [], '実 Core paint で不正な leader');
});

test('[semantic-gate] 元26 + user3 + strong5 は strict direct または valid leader', () => {
  const gate = buildVisibleGate();
  const g = gate.result;
  const targets = Array.from(new Set(FIXED_26.concat(USER3, STRONG5)));
  const failures = [];
  targets.forEach((id) => {
    const m = g.measured[id];
    if (!m || m.ownerDistance == null) { failures.push({ id: id, reason: 'no-owner' }); return; }
    const strict = m.ownerDistance <= 12 && (m.margin == null || m.margin >= 8);
    if (strict) return;
    const check = gate.H.validateLeader(gate.paint, gate.labels, gate.layout, id);
    if (!check.valid) failures.push({ id: id, own: m.ownerDistance, foreign: m.foreignDistance, margin: m.margin, reason: check.reason });
  });
  console.log('[semantic] fixedFailures', JSON.stringify(failures));
  assert.deepEqual(failures, [], '重点反応の再発');
});
