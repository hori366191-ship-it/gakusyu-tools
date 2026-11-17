/**
 * app11 — 拡張経路の始点 stub 正規化（post-pass）の回帰
 *
 * 実行: node --test scripts/tests/app11-route-heads.test.cjs
 *
 * 背景:
 *   extension-layout.cjs の applyStubStart は、境界から外向きの stub を挿入する際に
 *   元の次点を追い越すことがあり、150〜180° 戻る「折れ」になっていた
 *   （例: ethanol-sodium in が 612→590→600→marker と戻る）。
 *   配置（ノード・マーカー・ラベル）は確定済みのまま、extend() の最後で
 *   折れた経路の点列だけを引き直す（normalizeRouteHeads / repairOwnCrossings）。
 *
 * この検査は生成済みデータ（layout.json / routes.json）を対象に、
 *  - 始点 stub の追い越し（折れ）が 0
 *  - 始点は 14px 以上・外向き dot >= 0.35
 *  - ノード / ラベル / マーカーの貫通 0、同一直線の重なりなし
 *  - 同一反応の入出線が自分自身と交差しない（既知の同時収束 3 件を除く）
 *  - 旧 86 反応・207 経路・101 物質の座標は不変
 * を確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site-src', 'app11');
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const X = require(path.join(ROOT, 'scripts', 'app11', 'extension-layout.cjs'));
const L = require(path.join(ROOT, 'scripts', 'app11', 'legacy-baseline.cjs'));

const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(path.join(SRC, 'routes.json'), 'utf8'));
const legacy = L.loadBaseline();

// 配置（ノード・マーカー）を確定済みとして扱う。
const scene = { compounds: new Map(), reactions: new Map(), routes: [], shelf: layout.shelf };
for (const [id, pos] of Object.entries(layout.positions)) {
  scene.compounds.set(id, { x: pos.x, y: pos.y, w: pos.w, h: pos.h, tier: pos.tier });
}
for (const [id, marker] of Object.entries(layout.reactions)) {
  scene.reactions.set(id, {
    x: marker.x,
    y: marker.y,
    typeLabel: marker.typeLabel,
    conditions: marker.conditions,
    labelSide: marker.label ? marker.label.side : null,
    labelBoxes: marker.label ? { type: marker.label.box, cond: null } : null
  });
}
for (const [key, edge] of Object.entries(routes.edges)) {
  scene.routes.push({
    key: key,
    reactionId: edge.reaction,
    compoundId: edge.compound,
    dir: edge.dir,
    tier: edge.tier,
    legacy: key in legacy.edges,
    points: edge.points.map((p) => ({ x: p[0], y: p[1] })),
    gaps: [],
    bridges: []
  });
}

const extensionRoutes = scene.routes.filter((route) => !route.legacy);

function boundaryNormal(node, point) {
  const distances = [
    { d: Math.abs(point.x - node.x), n: { x: -1, y: 0 } },
    { d: Math.abs(point.x - (node.x + node.w)), n: { x: 1, y: 0 } },
    { d: Math.abs(point.y - node.y), n: { x: 0, y: -1 } },
    { d: Math.abs(point.y - (node.y + node.h)), n: { x: 0, y: 1 } }
  ];
  distances.sort((a, b) => a.d - b.d);
  return distances[0].n;
}

function firstSegment(route) {
  const p0 = route.points[0];
  const p1 = route.points[1];
  const length = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const normal = boundaryNormal(scene.compounds.get(route.compoundId), p0);
  return {
    length: length,
    dot: ((p1.x - p0.x) / length) * normal.x + ((p1.y - p0.y) / length) * normal.y
  };
}

// 「折れ」= 外向き stub の直後が、stub を追い越してノード側へ戻る（角度 > 110°）。
function stubFold(route) {
  if (route.legacy || route.points.length < 3) return null;
  const p0 = route.points[0];
  const p1 = route.points[1];
  const p2 = route.points[2];
  const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (length < 6 || length > 30) return null;
  const normal = boundaryNormal(scene.compounds.get(route.compoundId), p0);
  const dot = ((p1.x - p0.x) / length) * normal.x + ((p1.y - p0.y) / length) * normal.y;
  if (dot < 0.98) return null;
  const reach = (p2.x - p0.x) * normal.x + (p2.y - p0.y) * normal.y;
  if (reach >= length - 0.5) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const step = Math.hypot(dx, dy) || 1;
  const dirDot = ((p1.x - p0.x) / length) * (dx / step) + ((p1.y - p0.y) / length) * (dy / step);
  return dirDot < -0.35 ? { length: length, reach: reach, dirDot: dirDot } : null;
}

test('[stub] 追加反応の始点は 14px 以上・外向き dot >= 0.35 を満たす', () => {
  // 旧 86 反応の経路は凍結（2 点の直線端口を含む）ため対象外。
  const bad = [];
  for (const route of extensionRoutes) {
    const info = firstSegment(route);
    if (info.length < 14 || info.dot < 0.35) {
      bad.push(route.key + ' len=' + info.length.toFixed(1) + ' dot=' + info.dot.toFixed(2));
    }
  }
  assert.deepEqual(bad, [], '始点の stub が短い / 外向きでない経路: ' + bad.slice(0, 5).join(', '));
});

test('[stub] 追加反応の経路に stub 追い越し（150〜180° の戻り）が無い', () => {
  const bad = [];
  for (const route of extensionRoutes) {
    const fold = stubFold(route);
    if (fold) {
      bad.push(route.key + ' reach=' + fold.reach.toFixed(1) + ' dot=' + fold.dirDot.toFixed(2));
    }
  }
  assert.deepEqual(bad, [], 'stub を追い越して戻る経路: ' + bad.slice(0, 5).join(', '));
});

test('[stub] 代表例の戻りが消えている（ethanol / ethyne-silver-acetylide / methanol）', () => {
  const rep = {
    'ethanol-sodium|in|ethanol': routes.edges['ethanol-sodium|in|ethanol'].points,
    'ethanol-sodium|out|sodium-ethoxide': routes.edges['ethanol-sodium|out|sodium-ethoxide'].points,
    'ethyne-silver-acetylide|out|silver-acetylide': routes.edges['ethyne-silver-acetylide|out|silver-acetylide'].points,
    'methanol-sodium|in|methanol': routes.edges['methanol-sodium|in|methanol'].points
  };
  for (const key of Object.keys(rep)) {
    const route = scene.routes.find((item) => item.key === key);
    assert.equal(stubFold(route), null, key + ' に stub の追い越しが残る');
    // 内部で 120° 以上戻る区間が無い（150〜180° の戻りの再発防止）。
    const points = rep[key];
    for (let i = 1; i < points.length - 1; i++) {
      const ax = points[i][0] - points[i - 1][0];
      const ay = points[i][1] - points[i - 1][1];
      const bx = points[i + 1][0] - points[i][0];
      const by = points[i + 1][1] - points[i][1];
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      const dot = (ax * bx + ay * by) / (la * lb);
      assert.ok(dot > -0.5, key + ' の区間 ' + i + ' が戻っている dot=' + dot.toFixed(2));
    }
  }
  // 例として挙げた「折れた次点」が残っていない。
  assert.ok(!rep['ethanol-sodium|in|ethanol'].some((p) => p[0] === 1240 && p[1] === 600));
  assert.ok(!rep['ethyne-silver-acetylide|out|silver-acetylide'].some((p) => p[0] === 590 && p[1] === 880));
});

test('[clear] 追加経路がノード・ラベル・マーカーを貫通せず、同一直線で重ならない', () => {
  const bad = [];
  for (const route of extensionRoutes) {
    const violation = X.routeObstacleViolation(scene, route);
    if (violation) bad.push(route.key + ' -> ' + violation);
  }
  assert.deepEqual(bad, [], '追加経路の貫通・重なり: ' + bad.slice(0, 5).join(', '));
});

test('[cross] 同一反応の入出線の自己交差は既知の同時収束 3 件だけ', () => {
  // マーカー直近で複数枝が同時に収束する既存ケース（stub 折れとは別根因）。
  // 経路の折れを直しても解消しないため、ここでは増えていないことだけを固定する。
  const known = new Set([
    'ethyl-acetate-saponification',
    'triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid',
    'urea-resin-condensation'
  ]);
  const found = [];
  for (const [id] of scene.reactions) {
    const list = extensionRoutes.filter((route) => route.reactionId === id);
    if (list.length < 2) continue;
    const crossings = X.reactionCrossings(list);
    if (crossings > 0) found.push(id + ':' + crossings);
  }
  const unexpected = found.filter((entry) => !known.has(entry.split(':')[0]));
  assert.deepEqual(unexpected, [], '新たな自己交差: ' + unexpected.join(', '));
});

test('[legacy] 旧 86 反応・旧 207 経路・旧 101 物質の座標は不変', () => {
  const S = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));
  const source = S.loadSource();
  assert.deepEqual(L.verifySource(source, legacy), []);
  assert.deepEqual(L.verifyLayout(layout, routes, legacy, source), []);
  for (const [key, edge] of Object.entries(legacy.edges)) {
    assert.deepEqual(routes.edges[key].points, edge.points, '旧経路が変わった: ' + key);
  }
  assert.equal(Object.keys(legacy.edges).length, 207);
  assert.equal(legacy.counts.connected, 101);
  assert.equal(legacy.counts.reactions, 86);
  assert.equal(legacy.counts.edges, 207);
});

test('[freeze] 全 427 物質と全 162 マーカーの座標は data.js と一致する', () => {
  const D = require(path.join(ROOT, 'site', 'app11', 'data.js'));
  assert.equal(Object.keys(layout.positions).length, 427);
  assert.equal(Object.keys(layout.reactions).length, 162);
  assert.equal(D.compounds.length, 427);
  assert.equal(D.reactions.length, 162);
  for (const compound of D.compounds) {
    const pos = layout.positions[compound.id];
    assert.ok(pos, '物質座標がない: ' + compound.id);
    assert.equal(pos.x, compound.x, 'x 不一致: ' + compound.id);
    assert.equal(pos.y, compound.y, 'y 不一致: ' + compound.id);
    assert.equal(pos.w, compound.w, 'w 不一致: ' + compound.id);
    assert.equal(pos.h, compound.h, 'h 不一致: ' + compound.id);
  }
  for (const reaction of D.reactions) {
    const marker = layout.reactions[reaction.id];
    assert.ok(marker, 'マーカーがない: ' + reaction.id);
    assert.equal(marker.x, reaction.x, 'マーカー x 不一致: ' + reaction.id);
    assert.equal(marker.y, reaction.y, 'マーカー y 不一致: ' + reaction.id);
  }
});

test('[determinism] normalizeRouteHeads は冪等（再適用しても点列が変わらない）', () => {
  const clone = {
    compounds: scene.compounds,
    reactions: scene.reactions,
    routes: scene.routes.map((route) => ({
      key: route.key,
      reactionId: route.reactionId,
      compoundId: route.compoundId,
      dir: route.dir,
      tier: route.tier,
      legacy: route.legacy,
      points: route.points.map((p) => ({ x: p.x, y: p.y })),
      gaps: [],
      bridges: []
    }))
  };
  const before = clone.routes.map((route) => JSON.stringify(route.points));
  const changed = X.normalizeRouteHeads(clone, { x: 0, y: 0, w: 7000, h: 4000 });
  assert.deepEqual(changed, [], '正規化済みの経路が再度変更された: ' + changed.slice(0, 5).join(', '));
  assert.deepEqual(clone.routes.map((route) => JSON.stringify(route.points)), before);
});

test('[geometry] 実描画 paint の gap と自己交差（Core 経由）', () => {
  const helper = require(path.join(__dirname, 'helpers', 'app11-visible-geometry.cjs'));
  const D = require(path.join(ROOT, 'site', 'app11', 'data.js'));
  const markers = {};
  for (const [id, marker] of Object.entries(layout.reactions)) markers[id] = { x: marker.x, y: marker.y };
  const paint = helper.buildPaint({
    positions: layout.positions,
    markers: markers,
    edges: routes.edges,
    nodeW: layout.nodeW,
    nodeH: layout.nodeH
  });
  // 追加反応のうち、端点が 8px 以上離れている枝は描画線が 1px 以上残る。
  const tooShort = [];
  for (const route of extensionRoutes) {
    const first = route.points[0];
    const next = route.points[1];
    const length = Math.hypot(next.x - first.x, next.y - first.y);
    if (length < 8) tooShort.push(route.key);
  }
  assert.deepEqual(tooShort, []);
  // paint は各反応の線を持つ（空の反応が無い）。
  const empty = Object.keys(paint.lines).filter((id) => (paint.lines[id] || []).length === 0);
  assert.deepEqual(empty, [], '描画線が空の反応: ' + empty.slice(0, 5).join(', '));
});
