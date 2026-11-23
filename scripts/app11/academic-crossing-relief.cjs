/**
 * 有機反応マップ（app11）— アカデミック表示の交差低減（crossing relief）
 *
 * 目的:
 *   通常 86 + 学術 178 = 264 反応の全 733 辺は、label 再配置と route 救済の後で
 *   なお多数の交差を持つ（非平面グラフなので 0 にはできない）。ここでは
 *   「交差に関与する辺」と「長い辺」を対象に、既存の格子 A*（priority-router.cjs）へ
 *   他辺を soft cost として与えた候補経路を作り、交差が減り全長が増えないものだけを採る。
 *
 * 不変条件:
 *   - 物質座標・マーカー座標・ラベル箱は変更しない（経路の点列だけを差し替える）。
 *   - 候補は必ず「物質境界のポート → マーカー中心」で、既存と同じ端点規約を守る。
 *   - 候補は物質矩形（inflate 2）・ラベル箱（inflate 1）・他マーカー円（+1）を
 *     貫通しないこと（build の hard gate と同じ判定）。
 *   - 受入は「その辺の交差数が減る」かつ「総延長が baseline を超えない」場合だけ。
 *     総延長の増加は、それまでの受入で生じた短縮分の範囲内に限る。
 *   - 入力順・乱数なしの決定的計算。同じ入力からは常に同じ出力。
 *
 * 交差の定義（canonical）:
 *   crossingPairs = 異なるルートキー同士の線分交差の総数（同一ルートキー内は除外）。
 *   1 組のルート同士が複数回交差すればその回数だけ数える（raw）。同じ反応の別辺
 *   （in/out）同士の交差も別ルートキーなので含む。この定義は
 *   academic-network-layout.cjs の collisionStats.crossingPairs と同一。
 *   参考として「反応が異なる組だけ」を数えた differentReaction も返す。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');
const N = require('./academic-network-layout.cjs');

const MARKER_R = 6;
const CROSSING_DEFINITION =
  '異なるルートキー同士の線分交差の総数（同一ルート内は除外、同一組の複数交差は回数分、' +
  '同じ反応の別辺（in/out）同士も別キーとして数える）';

function round2(v) {
  return Math.round(v * 100) / 100;
}

function lengthOf(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return sum;
}

function segmentsOf(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push({ a: { x: points[i][0], y: points[i][1] }, b: { x: points[i + 1][0], y: points[i + 1][1] } });
  }
  return out;
}

function bboxOfSeg(s) {
  return {
    minX: Math.min(s.a.x, s.b.x),
    maxX: Math.max(s.a.x, s.b.x),
    minY: Math.min(s.a.y, s.b.y),
    maxY: Math.max(s.a.y, s.b.y)
  };
}

/** ルート集合の線分索引。excludeKey を渡すとそのルートを除く。 */
function segmentIndex(routes, excludeKey) {
  const out = [];
  Object.keys(routes).sort().forEach((key) => {
    if (key === excludeKey) return;
    const entry = routes[key];
    const pts = entry.points;
    for (let i = 0; i < pts.length - 1; i++) {
      out.push({
        key: key,
        reaction: entry.reaction,
        a: { x: pts[i][0], y: pts[i][1] },
        b: { x: pts[i + 1][0], y: pts[i + 1][1] }
      });
    }
  });
  return out;
}

function countCross(points, segments, ownKey) {
  let n = 0;
  for (const s of segmentsOf(points)) {
    const sb = bboxOfSeg(s);
    for (const t of segments) {
      if (t.key === ownKey) continue;
      if (Math.max(t.a.x, t.b.x) < sb.minX || Math.min(t.a.x, t.b.x) > sb.maxX) continue;
      if (Math.max(t.a.y, t.b.y) < sb.minY || Math.min(t.a.y, t.b.y) > sb.maxY) continue;
      if (G.segSegIntersection(s.a, s.b, t.a, t.b)) n++;
    }
  }
  return n;
}

/**
 * canonical な交差集計。
 * @returns {{raw:number, differentReaction:number, pairCount:number, perRoute:Map<string,number>, routePairs:Map<string,number>}}
 */
function crossingReport(routes) {
  const segments = segmentIndex(routes, null);
  const perRoute = new Map();
  const routePairs = new Map();
  let raw = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const sb = bboxOfSeg(s);
    for (let j = i + 1; j < segments.length; j++) {
      const t = segments[j];
      if (t.key === s.key) continue;
      if (Math.max(t.a.x, t.b.x) < sb.minX || Math.min(t.a.x, t.b.x) > sb.maxX) continue;
      if (Math.max(t.a.y, t.b.y) < sb.minY || Math.min(t.a.y, t.b.y) > sb.maxY) continue;
      if (!G.segSegIntersection(s.a, s.b, t.a, t.b)) continue;
      raw++;
      perRoute.set(s.key, (perRoute.get(s.key) || 0) + 1);
      perRoute.set(t.key, (perRoute.get(t.key) || 0) + 1);
      const pairKey = s.key < t.key ? s.key + '|||' + t.key : t.key + '|||' + s.key;
      routePairs.set(pairKey, (routePairs.get(pairKey) || 0) + 1);
    }
  }
  let differentReaction = 0;
  routePairs.forEach((count, pairKey) => {
    const parts = pairKey.split('|||');
    const a = routes[parts[0]];
    const b = routes[parts[1]];
    if (a && b && a.reaction !== b.reaction) differentReaction += count;
  });
  return {
    raw: raw,
    differentReaction: differentReaction,
    pairCount: routePairs.size,
    perRoute: perRoute,
    routePairs: routePairs,
    definition: CROSSING_DEFINITION
  };
}

/** 経路が物質・ラベル・他マーカーを貫通していないか（build の hard gate と同条件）。 */
function penetrations(points, ctx, ownCompound, ownReaction) {
  const problems = [];
  const labelPad = ctx.labelPad;
  for (let i = 0; i < points.length - 1; i++) {
    const a = { x: points[i][0], y: points[i][1] };
    const b = { x: points[i + 1][0], y: points[i + 1][1] };
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) problems.push('zero-segment');
    for (const node of ctx.nodes) {
      if (node.id === ownCompound && i === 0) continue;
      if (G.segmentRect(a, b, G.inflate(node.rect, 2))) problems.push('node:' + node.id);
    }
    for (const label of ctx.labels) {
      if (G.segmentRect(a, b, G.inflate(label.rect, labelPad))) problems.push('label:' + label.id);
    }
    for (const disc of ctx.markers) {
      if (disc.id === ownReaction) continue;
      if (G.distPointSeg(disc, a, b) < MARKER_R + 1) problems.push('marker:' + disc.id);
    }
  }
  return problems;
}

function buildContext(input) {
  const nodes = [];
  Object.keys(input.positions).sort().forEach((id) => {
    const p = input.positions[id];
    nodes.push({ id: id, rect: { x: p.x, y: p.y, w: p.w, h: p.h } });
  });
  const markerIds = Object.keys(input.markers).sort();
  const labels = markerIds
    .filter((id) => input.markers[id].label && input.markers[id].label.box)
    .map((id) => ({ id: id, rect: input.markers[id].label.box }));
  const markers = markerIds.map((id) => ({ id: id, x: input.markers[id].x, y: input.markers[id].y }));
  const nodeById = new Map(nodes.map((n) => [n.id, n.rect]));
  const markerById = new Map(markers.map((m) => [m.id, m]));
  const typeLabelById = new Map(markerIds.map((id) => [id, normalizeLabel(input.typeLabelOf ? input.typeLabelOf(id) : '')]));
  const leaderIds = new Set(markerIds.filter((id) => {
    const label = input.markers[id].label;
    return !!(label && label.leader && label.leader.length > 1);
  }));
  return {
    nodes: nodes,
    labels: labels,
    markers: markers,
    nodeById: nodeById,
    markerById: markerById,
    labelPad: input.labelPad == null ? 1 : input.labelPad,
    typeOf: (id) => typeLabelById.get(id) || '',
    hasLeader: (id) => leaderIds.has(id)
  };
}

function normalizeLabel(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '');
}

/** soft cost 用に、探索窓と交差する他ルート線分だけを残す（結果は同じ、計算量だけ削る）。 */
function localSoftSegments(segments, ownKey, a, b, radius) {
  const minX = Math.min(a.x, b.x) - radius;
  const maxX = Math.max(a.x, b.x) + radius;
  const minY = Math.min(a.y, b.y) - radius;
  const maxY = Math.max(a.y, b.y) + radius;
  const out = [];
  for (const s of segments) {
    if (s.key === ownKey) continue;
    if (Math.max(s.a.x, s.b.x) < minX || Math.min(s.a.x, s.b.x) > maxX) continue;
    if (Math.max(s.a.y, s.b.y) < minY || Math.min(s.a.y, s.b.y) > maxY) continue;
    out.push({ a: s.a, b: s.b });
  }
  return out;
}

function distSegRect(a, b, r) {
  if (G.segmentRect(a, b, r)) return 0;
  let d = Math.min(G.distPointRect(a, r), G.distPointRect(b, r));
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h }
  ];
  for (const c of corners) d = Math.min(d, G.distPointSeg(c, a, b));
  return d;
}

function polylineRectDistance(points, rect) {
  let d = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = { x: points[i][0], y: points[i][1] };
    const b = { x: points[i + 1][0], y: points[i + 1][1] };
    d = Math.min(d, distSegRect(a, b, rect));
    if (d <= 0) return 0;
  }
  return d;
}

/**
 * ラベル帰属ガード。ラベル箱は動かさないので、「異なる typeLabel の線の方が
 * 自分の線より近い（leader 無し）」状態を作る候補は採らない。
 * ownDistance は現在の保存経路から測った近似値（実描画との差は build 側で再確認する）。
 */
function buildLabelGuard(routes, ctx) {
  const byReaction = new Map();
  Object.keys(routes).sort().forEach((key) => {
    const entry = routes[key];
    if (!byReaction.has(entry.reaction)) byReaction.set(entry.reaction, []);
    byReaction.get(entry.reaction).push(entry.points);
  });
  const labels = [];
  for (const label of ctx.labels) {
    const polylines = byReaction.get(label.id) || [];
    let own = Infinity;
    for (const poly of polylines) own = Math.min(own, polylineRectDistance(poly, label.rect));
    labels.push({
      id: label.id,
      rect: label.rect,
      typeLabel: ctx.typeOf(label.id),
      ownDistance: ctx.ownDistanceOf ? ctx.ownDistanceOf(label.id, own) : own,
      exempt: ctx.hasLeader(label.id)
    });
  }
  return { labels: labels, typeOf: ctx.typeOf };
}

function candidateKeepsLabelAttribution(points, route, guard) {
  const ownType = guard.typeOf(route.reaction);
  for (const label of guard.labels) {
    if (label.id === route.reaction) continue; // 自分のラベルは帰属が改善する方向のみ
    if (label.exempt) continue; // leader があるラベルは別ゲート（leader 検証）で扱う
    if (label.typeLabel === ownType) continue; // 同名は補助分類（fail にしない）
    if (label.ownDistance === Infinity) continue;
    const rect = label.rect;
    let near = false;
    for (let i = 0; i < points.length - 1 && !near; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (Math.max(a[0], b[0]) < rect.x - 40 || Math.min(a[0], b[0]) > rect.x + rect.w + 40) continue;
      if (Math.max(a[1], b[1]) < rect.y - 40 || Math.min(a[1], b[1]) > rect.y + rect.h + 40) continue;
      near = true;
    }
    if (!near) continue;
    const d = polylineRectDistance(points, rect);
    if (d < label.ownDistance - 0.25) return false;
  }
  return true;
}

function candidatesFor(key, routes, ctx, opts) {
  const route = routes[key];
  const compound = ctx.nodeById.get(route.compound);
  const marker = ctx.markerById.get(route.reaction);
  if (!compound || !marker) return [];
  const markerPoint = { x: marker.x, y: marker.y };
  const rects = [];
  for (const node of ctx.nodes) rects.push({ rect: node.rect });
  for (const label of ctx.labels) rects.push({ rect: label.rect });
  const discs = [];
  for (const disc of ctx.markers) {
    if (disc.id === route.reaction) continue;
    discs.push({ x: disc.x, y: disc.y, r: MARKER_R });
  }
  const rectObs = { rects: rects, discs: discs, segments: [] };
  const segments = segmentIndex(routes, key);
  const sides = ['right', 'left', 'top', 'bottom'].slice().sort((a, b) => {
    const pa = N.portFor(compound, markerPoint, a);
    const pb = N.portFor(compound, markerPoint, b);
    return Math.hypot(pa.outside.x - markerPoint.x, pa.outside.y - markerPoint.y) -
      Math.hypot(pb.outside.x - markerPoint.x, pb.outside.y - markerPoint.y) ||
      (a < b ? -1 : a > b ? 1 : 0);
  });
  const out = [];
  for (const margin of opts.margins) {
    for (const side of sides) {
      const port = N.portFor(compound, markerPoint, side);
      const soft = localSoftSegments(segments, key, port.outside, markerPoint, margin + 320);
      let path = R.gridRoute(port.outside, markerPoint, rectObs, opts.bounds, {
        margin: margin,
        primary: false,
        softSegments: soft
      });
      if (!path) continue;
      path = R.simplifyPath(path, rectObs, 4);
      const gridPoints = path.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
      let points = R.dedupe([{ x: round2(port.point.x), y: round2(port.point.y) }].concat(gridPoints));
      points[points.length - 1] = { x: round2(markerPoint.x), y: round2(markerPoint.y) };
      if (points.length < 2) continue;
      const pts = points.map((p) => [p.x, p.y]);
      if (penetrations(pts, ctx, route.compound, route.reaction).length) continue;
      if (opts.labelGuard && !candidateKeepsLabelAttribution(pts, route, opts.labelGuard)) continue;
      const cross = countCross(pts, segments, key);
      out.push({ points: pts, crossings: cross, length: round2(lengthOf(pts)), margin: margin, side: side });
    }
  }
  return out;
}

/**
 * 交差低減の本体。routes の entry.points を直接差し替える。
 *
 * @param {object} input
 *   routes: {key: {reaction, compound, dir, points}}   ← 実際のレイアウト entry（参照を渡す）
 *   markers: 全マーカー（normal + academic）
 *   positions: 全 427 物質の矩形
 *   bounds: {x,y,w,h}
 * @param {object} opts
 *   margins: 1 候補あたりの探索余白（既定 [160, 260]）
 *   maxTargets: 1 パスの対象辺の上限（交差数の多い順）
 *   minCrossings: 対象にする最小交差数
 *   passes: 反復回数
 *   extraLongest: 交差数に関係なく必ず対象へ入れる「長い辺」の本数
 */
function relieve(input, opts) {
  const options = opts || {};
  const margins = Array.isArray(options.margins) && options.margins.length ? options.margins : [160, 260];
  const maxTargets = options.maxTargets || 250;
  const minCrossings = options.minCrossings == null ? 6 : options.minCrossings;
  const passes = options.passes || 2;
  const extraLongest = options.extraLongest == null ? 10 : options.extraLongest;
  const routes = input.routes;
  const ctx = buildContext({
    positions: input.positions,
    markers: input.markers,
    labelPad: options.labelPad,
    typeLabelOf: options.typeLabelOf
  });
  ctx.ownDistanceOf = options.ownDistanceOf || null;
  const labelGuard = buildLabelGuard(routes, ctx);
  const lastTargets = options.lastPassTargets || 60;
  const skipReactions = options.skipReactions || null;
  const skipKeys = options.skipKeys || null;
  const skipped = (key) =>
    !!(skipKeys && skipKeys.has(key)) || !!(skipReactions && skipReactions.has(routes[key].reaction));

  const before = crossingReport(routes);
  const baselineLength = Object.keys(routes).reduce((sum, key) => sum + lengthOf(routes[key].points), 0);
  let currentLength = baselineLength;
  const changed = [];
  let evaluated = 0;

  const passTargets = function (report, limit) {
    const ranked = Object.keys(routes)
      .filter((key) => (report.perRoute.get(key) || 0) >= minCrossings)
      .sort((a, b) => (report.perRoute.get(b) || 0) - (report.perRoute.get(a) || 0) || (a < b ? -1 : 1));
    const targets = ranked.slice(0, limit);
    if (extraLongest > 0) {
      const seen = new Set(targets);
      Object.keys(routes)
        .sort((a, b) => lengthOf(routes[b].points) - lengthOf(routes[a].points) || (a < b ? -1 : 1))
        .slice(0, extraLongest)
        .forEach((key) => {
          if (seen.has(key)) return;
          targets.push(key);
          seen.add(key);
        });
    }
    return targets;
  };

  for (let pass = 0; pass < passes; pass++) {
    const report = crossingReport(routes);
    const limit = pass === passes - 1 && passes > 1 ? Math.min(lastTargets, maxTargets) : maxTargets;
    const targets = passTargets(report, limit);
    if (!targets.length) break;
    let changedThisPass = 0;
    for (const key of targets) {
      if (!routes[key] || skipped(key)) continue;
      evaluated++;
      // 対象辺の交差数だけを局所的に数える（全体集計はパス境界と最後だけで行う）。
      const oldCrossings = countCross(routes[key].points, segmentIndex(routes, key), key);
      if (oldCrossings <= 0) continue;
      const candidates = candidatesFor(key, routes, ctx, {
        margins: margins,
        bounds: input.bounds,
        labelGuard: labelGuard
      });
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.crossings - b.crossings || a.length - b.length ||
        (a.margin - b.margin) || (a.side < b.side ? -1 : a.side > b.side ? 1 : 0));
      const oldLength = lengthOf(routes[key].points);
      // 総延長は baseline を超えない。
      const pooledSaving = Math.max(0, baselineLength - currentLength);
      let accepted = null;
      for (const candidate of candidates) {
        if (candidate.crossings >= oldCrossings) break; // これ以降は交差が減らない
        const delta = candidate.length - oldLength;
        const crossingCut = oldCrossings > 0 ? (oldCrossings - candidate.crossings) / oldCrossings : 0;
        if (delta <= 0) { accepted = candidate; break; }
        // 伸ばす候補は「2%（最低 20px）以内」かつ「ここまでの短縮分の範囲」かつ
        // 「交差が 10% 以上減る」かつ「1000px 未満のまま（長い辺は伸ばさない）」場合だけ。
        const cap = Math.max(20, oldLength * 0.02);
        if (delta <= cap && delta <= pooledSaving + 1e-6 && crossingCut >= 0.1 &&
            candidate.length < Math.max(1000, oldLength)) {
          accepted = candidate;
          break;
        }
      }
      if (!accepted) continue;
      const delta = accepted.length - oldLength;
      routes[key].points = accepted.points;
      currentLength += delta;
      changed.push({
        key: key,
        beforeCrossings: oldCrossings,
        afterCrossings: accepted.crossings,
        beforeLength: round2(oldLength),
        afterLength: accepted.length,
        margin: accepted.margin,
        side: accepted.side
      });
      changedThisPass++;
    }
    if (!changedThisPass) break;
  }

  // 短縮パス: 交差を増やさずに短くなる候補だけを採る（総延長・p95・最長辺の長い裾を削る）。
  const shortened = [];
  const shortenTargets = options.shortenTargets == null ? 80 : options.shortenTargets;
  const minShortenLength = options.minShortenLength == null ? 900 : options.minShortenLength;
  const shortenMargins = Array.isArray(options.shortenMargins) && options.shortenMargins.length
    ? options.shortenMargins : [120, 160, 260];
  if (shortenTargets > 0) {
    const ranked = Object.keys(routes)
      .filter((key) => lengthOf(routes[key].points) >= minShortenLength)
      .sort((a, b) => lengthOf(routes[b].points) - lengthOf(routes[a].points) || (a < b ? -1 : 1))
      .slice(0, shortenTargets);
    for (const key of ranked) {
      if (!routes[key] || skipped(key)) continue;
      evaluated++;
      const segments = segmentIndex(routes, key);
      const oldPoints = routes[key].points;
      const oldLength = lengthOf(oldPoints);
      const oldCrossings = countCross(oldPoints, segments, key);
      const candidates = candidatesFor(key, routes, ctx, {
        margins: shortenMargins,
        bounds: input.bounds,
        labelGuard: labelGuard
      });
      if (!candidates.length) continue;
      let best = null;
      for (const candidate of candidates) {
        if (candidate.crossings > oldCrossings) continue;
        if (candidate.length > oldLength - Math.max(20, oldLength * 0.03)) continue;
        if (!best || candidate.length < best.length ||
            (candidate.length === best.length && candidate.crossings < best.crossings)) {
          best = candidate;
        }
      }
      if (!best) continue;
      routes[key].points = best.points;
      currentLength += best.length - oldLength;
      shortened.push({
        key: key,
        beforeLength: round2(oldLength),
        afterLength: best.length,
        crossings: best.crossings
      });
    }
  }

  const after = crossingReport(routes);
  return {
    definition: CROSSING_DEFINITION,
    evaluated: evaluated,
    changed: changed,
    shortened: shortened,
    before: {
      crossings: before.raw,
      crossingsDifferentReaction: before.differentReaction,
      length: round2(baselineLength)
    },
    after: {
      crossings: after.raw,
      crossingsDifferentReaction: after.differentReaction,
      length: round2(currentLength)
    }
  };
}

function lengthOfAll(routes) {
  let sum = 0;
  for (const key of Object.keys(routes)) sum += lengthOf(routes[key].points);
  return Math.round(sum * 100) / 100;
}

/**
 * 最終ジオメトリから hard collision と交差を実測する。
 * 定義は academic-network-layout.cjs の collisionStats と同一
 * （route 貫通は inflate なしの厳密判定、交差は canonical 定義）。
 */
function finalCollisions(input) {
  const routes = input.routes;
  const positions = input.positions;
  const markers = input.markers;
  const classRects = input.classRects || [];
  const counts = {
    nodeNodeOverlaps: 0,
    labelLabelOverlaps: 0,
    labelNodeOverlaps: 0,
    labelClassMapOverlaps: 0,
    markerNodeOverlaps: 0,
    markerMarkerOverlaps: 0,
    routeNodePenetrations: 0,
    routeLabelPenetrations: 0,
    routeMarkerPenetrations: 0,
    crossingPairs: 0
  };
  const nodeList = Object.keys(positions).sort().map((id) => ({
    id: id,
    rect: { x: positions[id].x, y: positions[id].y, w: positions[id].w, h: positions[id].h }
  }));
  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      if (G.rectsOverlap(nodeList[i].rect, nodeList[j].rect, 0)) counts.nodeNodeOverlaps++;
    }
  }
  const ids = Object.keys(markers).sort();
  const labelList = [];
  ids.forEach((id) => {
    const marker = markers[id];
    const box = marker.label.box;
    labelList.push({ id: id, rect: box });
    for (const node of nodeList) {
      if (G.rectsOverlap(box, node.rect, 0)) counts.labelNodeOverlaps++;
      if (G.distPointRect({ x: marker.x, y: marker.y }, node.rect) < MARKER_R + 2) counts.markerNodeOverlaps++;
    }
    for (const rect of classRects) {
      if (G.rectsOverlap(box, rect, 0)) counts.labelClassMapOverlaps++;
    }
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (G.rectsOverlap(labelList[i].rect, labelList[j].rect, 0)) counts.labelLabelOverlaps++;
      const a = markers[ids[i]];
      const b = markers[ids[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * MARKER_R) counts.markerMarkerOverlaps++;
    }
  }
  for (const key of Object.keys(routes).sort()) {
    const entry = routes[key];
    const pts = entry.points.map((p) => ({ x: p[0], y: p[1] }));
    for (let i = 0; i < pts.length - 1; i++) {
      for (const node of nodeList) {
        if (node.id === entry.compound && i === 0) continue;
        if (G.segmentRect(pts[i], pts[i + 1], node.rect)) counts.routeNodePenetrations++;
      }
      for (const label of labelList) {
        if (G.segmentRect(pts[i], pts[i + 1], label.rect)) counts.routeLabelPenetrations++;
      }
      for (const id of ids) {
        if (id === entry.reaction) continue;
        if (G.distPointSeg({ x: markers[id].x, y: markers[id].y }, pts[i], pts[i + 1]) < MARKER_R) {
          counts.routeMarkerPenetrations++;
        }
      }
    }
    if (!markers[entry.reaction]) counts.routeMarkerPenetrations++;
  }
  const report = crossingReport(routes);
  counts.crossingPairs = report.raw;
  return {
    counts: counts,
    crossings: {
      raw: report.raw,
      differentReaction: report.differentReaction,
      pairs: report.pairCount,
      definition: CROSSING_DEFINITION
    }
  };
}

/** 差し替え後にラベル箱との貫通が無いかを最終確認する（安全網）。 */
function labelHits(routes, markers, keys) {
  const labels = Object.keys(markers)
    .filter((id) => markers[id].label && markers[id].label.box)
    .map((id) => ({ id: id, rect: markers[id].label.box }));
  const hits = new Map();
  for (const key of keys) {
    const entry = routes[key];
    if (!entry) continue;
    const found = [];
    for (let i = 0; i < entry.points.length - 1; i++) {
      const a = { x: entry.points[i][0], y: entry.points[i][1] };
      const b = { x: entry.points[i + 1][0], y: entry.points[i + 1][1] };
      for (const label of labels) {
        if (G.segmentRect(a, b, label.rect)) found.push(label.id);
      }
    }
    if (found.length) hits.set(key, found);
  }
  return hits;
}

module.exports = {
  CROSSING_DEFINITION,
  crossingReport,
  finalCollisions,
  relieve,
  labelHits,
  lengthOf,
  lengthOfAll,
  MARKER_R
};
