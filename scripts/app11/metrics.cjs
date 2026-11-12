/**
 * 有機反応マップ（app11）— 配置・経路の定量計測
 *
 * 改善前（v1/v3）と新案を同じ計算で測るための計測器。DOM も外部依存も使わない。
 *
 * 実行:
 *   node scripts/app11/metrics.cjs                 # 現在の layout v4 を計測
 *   node scripts/app11/metrics.cjs --json          # JSON で出力
 *   node scripts/app11/metrics.cjs --baseline      # 旧 fixture を計測
 *
 * 用語:
 * - 主要/補助: route.tier（無い場合は反応の tier）。PP / PS / SS は枝の組。
 * - 交差: 異なる反応の枝の中心線が交わる事象。同じ反応の枝は sameReaction で別集計。
 * - 共有ポート免除: 2 本が同じ物質（または同じ反応点）を共有し、交点が両方の
 *   その端点から PORT_EXEMPT px 以内にある場合だけ。ノード中心からの距離では免除しない。
 * - ストローク clearance: 中心線距離から線幅の半分を引いた縁間距離。PP/PS は 6px、
 *   SS は 3px を基準にする。交差そのものとは別に数える。
 * - crossingsWithoutGap という旧名は廃止。橋の有無で交差数を減らさない。
 */
'use strict';

const path = require('node:path');
const G = require('./geometry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app11-baseline', 'scene.json');

const MARKER_MIN_DIST = 22;
const PORT_EXEMPT = 8;
const OVERLAP_PORT_EXEMPT = 10;
const STROKE = { primary: 3.0, secondary: 1.1 };
const REQUIRED_GAP = { PP: 6, PS: 6, SS: 3 };

function nodeRect(compound, nodeW, nodeH) {
  return G.rect(compound.x, compound.y, compound.w || nodeW, compound.h || nodeH);
}

function aabb(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function aabbNear(a, b, pad) {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

function sceneFromLayout(layout, routesFile) {
  const regions = layout.regions.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.count,
    focus: r.focus,
    center: r.center
  }));
  const nodeW = layout.nodeW || G.NODE_W;
  const nodeH = layout.nodeH || G.NODE_H;
  const compounds = Object.keys(layout.positions).sort().map((id) => {
    const p = layout.positions[id];
    return { id, x: p.x, y: p.y, w: p.w || nodeW, h: p.h || nodeH, region: p.r };
  });
  const reactionTier = {};
  const reactions = Object.keys(layout.reactions).sort().map((id) => {
    const r = layout.reactions[id];
    const tier = r.tier === 'primary' ? 'primary' : 'secondary';
    reactionTier[id] = tier;
    const labelBoxes = r.label
      ? (r.label.box
        ? { type: { x: r.label.box.x, y: r.label.box.y, w: r.label.box.w, h: r.label.box.h }, cond: null }
        : G.labelLayout(r.x, r.y, r.typeLabel, r.label.cond ? r.conditions : '', r.label.side))
      : null;
    return {
      id,
      x: r.x,
      y: r.y,
      tier,
      substrates: r.substrates,
      products: r.products,
      typeLabel: r.typeLabel,
      conditions: r.conditions,
      cross: r.cross,
      labelBoxes
    };
  });
  const routes = Object.keys(routesFile.edges).sort().map((key) => {
    const e = routesFile.edges[key];
    return {
      key,
      reactionId: e.reaction,
      dir: e.dir,
      compoundId: e.compound,
      tier: e.tier === 'primary' || e.tier === 'secondary' ? e.tier : reactionTier[e.reaction],
      points: e.points.map((p) => ({ x: p[0], y: p[1] })),
      gaps: (e.gaps || []).map((p) => ({ x: p[0], y: p[1] })),
      bridges: (e.bridges || []).map((p) => ({ x: p[0], y: p[1] }))
    };
  });
  return {
    meta: {
      nodeW,
      nodeH,
      canvas: layout.canvas,
      shelf: layout.shelf || null
    },
    regions,
    compounds,
    reactions,
    routes
  };
}

function legacyRoutes(scene) {
  const compoundById = new Map(scene.compounds.map((c) => [c.id, c]));
  const routes = [];
  for (const r of scene.reactions) {
    const marker = { x: r.x, y: r.y };
    const add = (dir, id, a, b) => {
      let points;
      if (!r.cross) {
        points = [a, b];
      } else {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const bend = G.crossBend(a, b);
        const control = {
          x: (a.x + b.x) / 2 + (-dy / dist) * bend,
          y: (a.y + b.y) / 2 + (dx / dist) * bend
        };
        points = G.sampleQuadratic(a, control, b, 18);
      }
      routes.push({
        key: 'legacy:' + r.id + ':' + dir + ':' + id,
        reactionId: r.id,
        dir,
        compoundId: id,
        tier: r.tier === 'primary' ? 'primary' : 'secondary',
        points,
        gaps: []
      });
    };
    for (const id of r.substrates) {
      const c = compoundById.get(id);
      if (!c) continue;
      add('in', id, { x: c.x + (c.w || scene.meta.nodeW) / 2, y: c.y + (c.h || scene.meta.nodeH) / 2 }, marker);
    }
    for (const id of r.products) {
      const c = compoundById.get(id);
      if (!c) continue;
      add('out', id, marker, { x: c.x + (c.w || scene.meta.nodeW) / 2, y: c.y + (c.h || scene.meta.nodeH) / 2 });
    }
  }
  return routes;
}

function sceneFromBaseline() {
  const scene = JSON.parse(require('node:fs').readFileSync(BASELINE, 'utf8'));
  scene.meta.nodeW = scene.meta.nodeW || G.NODE_W;
  scene.meta.nodeH = scene.meta.nodeH || G.NODE_H;
  scene.routes = legacyRoutes(scene);
  return scene;
}

function tierPair(a, b) {
  if (a === 'primary' && b === 'primary') return 'PP';
  if (a === 'secondary' && b === 'secondary') return 'SS';
  return 'PS';
}

function stats(values) {
  const arr = values.slice().sort((a, b) => a - b);
  if (!arr.length) return { count: 0, total: 0, median: 0, p95: 0, max: 0, mean: 0 };
  const total = arr.reduce((s, v) => s + v, 0);
  const median = arr.length % 2
    ? arr[(arr.length - 1) / 2]
    : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;
  const p95 = arr[Math.min(arr.length - 1, Math.ceil(arr.length * 0.95) - 1)];
  return {
    count: arr.length,
    total: round(total),
    median: round(median),
    p95: round(p95),
    max: round(arr[arr.length - 1]),
    mean: round(total / arr.length)
  };
}

function round(v) {
  return Math.round(v * 100) / 100;
}

function measure(scene) {
  const nodeW = scene.meta.nodeW || G.NODE_W;
  const nodeH = scene.meta.nodeH || G.NODE_H;
  const compounds = scene.compounds;
  const compoundById = new Map(compounds.map((c) => [c.id, c]));
  const reactionById = new Map(scene.reactions.map((r) => [r.id, r]));
  const routes = scene.routes || [];
  const report = {};

  const nodeRects = compounds.map((c) => ({ id: c.id, r: nodeRect(c, nodeW, nodeH), c }));
  const nodeByRectId = new Map(nodeRects.map((n) => [n.id, n]));

  // --- node / node -------------------------------------------------------
  let nodeOverlaps = 0;
  const sortedRects = nodeRects.slice().sort((a, b) => a.r.x - b.r.x);
  for (let i = 0; i < sortedRects.length; i++) {
    for (let j = i + 1; j < sortedRects.length; j++) {
      if (sortedRects[j].r.x >= sortedRects[i].r.x + sortedRects[i].r.w) break;
      if (G.rectsOverlap(sortedRects[i].r, sortedRects[j].r)) nodeOverlaps++;
    }
  }

  // --- labels ------------------------------------------------------------
  const labels = [];
  for (const r of scene.reactions) {
    const box = r.labelBoxes !== undefined
      ? r.labelBoxes
      : G.labelBoxes(r.x, r.y, r.typeLabel, r.conditions);
    if (!box) continue;
    labels.push({ reactionId: r.id, tier: r.tier || 'secondary', kind: 'type', box: box.type });
    if (box.cond) labels.push({ reactionId: r.id, tier: r.tier || 'secondary', kind: 'cond', box: box.cond });
  }
  const titles = scene.regions.filter((region) => region.panel).map((region) => ({
    regionId: region.id,
    box: G.regionTitleBox(region)
  }));

  // --- markers vs nodes / markers / labels -------------------------------
  let markerNodeCollisions = 0;
  const markerCollisionIds = new Set();
  for (const r of scene.reactions) {
    for (const n of nodeRects) {
      if (G.rectsOverlap(G.inflate(G.markerBox(r.x, r.y), 2), n.r)) {
        markerNodeCollisions++;
        markerCollisionIds.add(r.id);
      }
    }
  }
  let markerMarkerCollisions = 0;
  for (let i = 0; i < scene.reactions.length; i++) {
    for (let j = i + 1; j < scene.reactions.length; j++) {
      const a = scene.reactions[i];
      const b = scene.reactions[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < MARKER_MIN_DIST) {
        markerMarkerCollisions++;
        markerCollisionIds.add(a.id);
        markerCollisionIds.add(b.id);
      }
    }
  }
  let labelNodeCollisions = 0;
  let labelLabelCollisions = 0;
  let labelMarkerCollisions = 0;
  let labelTitleCollisions = 0;
  for (const label of labels) {
    for (const n of nodeRects) {
      if (G.rectsOverlap(G.inflate(label.box, 1), n.r)) labelNodeCollisions++;
    }
    for (const r of scene.reactions) {
      if (G.rectsOverlap(G.inflate(label.box, 1), G.markerBox(r.x, r.y))) labelMarkerCollisions++;
    }
    for (const title of titles) {
      if (G.rectsOverlap(label.box, title.box)) labelTitleCollisions++;
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (labels[i].reactionId === labels[j].reactionId) continue;
      if (G.rectsOverlap(G.inflate(labels[i].box, 1), G.inflate(labels[j].box, 1))) labelLabelCollisions++;
    }
  }

  // --- edge geometry / tier stats ---------------------------------------
  let nodePenetrations = 0;
  let labelPenetrations = 0;
  let markerPenetrations = 0;
  let titlePenetrations = 0;
  let endpointPenetrations = 0;
  let totalLength = 0;
  let bends = 0;
  let maxBends = 0;
  const routeSegments = [];
  const routeAabb = new Map();
  const hitNode = new Set();
  const hitLabel = new Set();
  const hitMarker = new Set();
  const hitTitle = new Set();
  const hitEndpoint = new Set();
  const tierStats = {
    primary: { lengths: [], detours: [], bends: [], reactionLengths: new Map(), labelHits: 0, nodeHits: 0, markerHits: 0 },
    secondary: { lengths: [], detours: [], bends: [], reactionLengths: new Map(), labelHits: 0, nodeHits: 0, markerHits: 0 }
  };

  for (const route of routes) {
    const tier = route.tier === 'primary' ? 'primary' : 'secondary';
    const segs = G.polylineSegments(route.points).map((s) => ({ a: s.a, b: s.b }));
    const length = G.polylineLength(route.points);
    totalLength += length;
    const b = G.bendCount(route.points);
    bends += b;
    maxBends = Math.max(maxBends, b);
    const start = route.points[0] || { x: 0, y: 0 };
    const end = route.points[route.points.length - 1] || start;
    const straight = Math.hypot(end.x - start.x, end.y - start.y);
    tierStats[tier].lengths.push(length);
    tierStats[tier].bends.push(b);
    tierStats[tier].detours.push(length / Math.max(1, straight));
    tierStats[tier].reactionLengths.set(route.reactionId, (tierStats[tier].reactionLengths.get(route.reactionId) || 0) + length);
    routeSegments.push({ route, segs, tier, start, end, length });
    routeAabb.set(route.key, aabb(route.points));
    const endpoint = route.compoundId;
    for (const seg of segs) {
      if (endpoint) {
        const endNode = nodeByRectId.get(endpoint);
        if (endNode && G.segmentRect(seg.a, seg.b, G.inflate(endNode.r, -0.5))) {
          const port = distToNodeSurface(route.points, endNode.r);
          if (!port || port.distance > 12) hitEndpoint.add(route.key);
        }
      }
      for (const n of nodeRects) {
        if (n.id === endpoint) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(n.r, -0.5))) {
          hitNode.add(route.key + '|' + n.id);
          tierStats[tier].nodeHits++;
        }
      }
      for (const label of labels) {
        if (G.segmentRect(seg.a, seg.b, G.inflate(label.box, -0.5))) {
          hitLabel.add(route.key + '|' + label.reactionId + '|' + label.kind);
          tierStats[tier].labelHits++;
        }
      }
      for (const title of titles) {
        if (G.segmentRect(seg.a, seg.b, title.box)) hitTitle.add(route.key + '|' + title.regionId);
      }
      for (const other of scene.reactions) {
        if (other.id === route.reactionId) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(G.markerBox(other.x, other.y), 2))) {
          hitMarker.add(route.key + '|' + other.id);
          tierStats[tier].markerHits++;
        }
      }
    }
  }
  nodePenetrations = hitNode.size;
  labelPenetrations = hitLabel.size;
  markerPenetrations = hitMarker.size;
  titlePenetrations = hitTitle.size;
  endpointPenetrations = hitEndpoint.size;

  // --- edge / edge -------------------------------------------------------
  const crossings = {
    PP: 0, PS: 0, SS: 0, total: 0, sameReaction: 0,
    pairsPP: 0, pairsPS: 0, pairsSS: 0,
    reactionPairsPP: 0, reactionPairsPS: 0, reactionPairsSS: 0,
    events: 0,
    samples: []
  };
  const pairSets = { PP: new Set(), PS: new Set(), SS: new Set() };
  const reactionPairSets = { PP: new Set(), PS: new Set(), SS: new Set() };
  let acuteCrossings = 0;
  let bridgedCrossings = 0;
  let unbridgedAcute = 0;
  let overlapSegments = 0;
  let overlapLength = 0;
  let overlapSegmentsSameReaction = 0;
  let clearanceViolations = 0;
  let clearanceViolationsPP = 0;
  let clearanceViolationsPS = 0;
  let clearanceViolationsSS = 0;
  let clearanceViolationsSameReaction = 0;
  let protectedCorridorViolations = 0;
  let minClearance = Infinity;
  let minStrokeClearance = Infinity;
  let sameReactionCrossings = 0;
  const clearanceSamples = [];

  const gapPointsByKey = new Map();
  const bridgePointsByKey = new Map();
  for (const route of routes) {
    gapPointsByKey.set(route.key, route.gaps || []);
    bridgePointsByKey.set(route.key, route.bridges || []);
  }

  for (let i = 0; i < routeSegments.length; i++) {
    for (let j = i + 1; j < routeSegments.length; j++) {
      const A = routeSegments[i];
      const B = routeSegments[j];
      if (!aabbNear(routeAabb.get(A.route.key), routeAabb.get(B.route.key), 24)) continue;
      const sameReaction = A.route.reactionId === B.route.reactionId;
      const sharedCompound = A.route.compoundId && A.route.compoundId === B.route.compoundId;
      const pair = tierPair(A.tier, B.tier);
      for (const sa of A.segs) {
        for (const sb of B.segs) {
          const aabbA = aabb([sa.a, sa.b]);
          const aabbB = aabb([sb.a, sb.b]);
          if (!aabbNear(aabbA, aabbB, 10)) continue;
          const hit = G.segSegIntersection(sa.a, sa.b, sb.a, sb.b);
          if (hit) {
            if (sameReaction) {
              if (!near(hit, A.end, PORT_EXEMPT)) sameReactionCrossings++;
              continue;
            }
            if (sharedCompound && near(hit, A.start, PORT_EXEMPT) && near(hit, B.start, PORT_EXEMPT)) continue;
            crossings[pair]++;
            crossings.total++;
            crossings.events++;
            pairSets[pair].add(A.route.key + '\u0000' + B.route.key);
            const rp = A.route.reactionId < B.route.reactionId
              ? A.route.reactionId + '\u0000' + B.route.reactionId
              : B.route.reactionId + '\u0000' + A.route.reactionId;
            reactionPairSets[pair].add(rp);
            const ax = sa.b.x - sa.a.x;
            const ay = sa.b.y - sa.a.y;
            const bx = sb.b.x - sb.a.x;
            const by = sb.b.y - sb.a.y;
            const dot = Math.abs(ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
            const angle = Math.acos(Math.min(1, dot));
            const aGap = nearestGap(gapPointsByKey.get(A.route.key), hit);
            const bGap = nearestGap(gapPointsByKey.get(B.route.key), hit);
            const aBridge = nearestGap(bridgePointsByKey.get(A.route.key), hit);
            const bBridge = nearestGap(bridgePointsByKey.get(B.route.key), hit);
            const distinguished = Math.min(aGap, bGap) <= 4 || Math.min(aBridge, bBridge) <= 8;
            if (crossings.samples.length < 80) {
              crossings.samples.push({
                x: round(hit.x), y: round(hit.y), pair,
                a: A.route.key, b: B.route.key, angle: round(angle), distinguished
              });
            }
            if (angle < (25 * Math.PI) / 180) {
              acuteCrossings++;
              if (distinguished) bridgedCrossings++;
              else unbridgedAcute++;
            }
            continue;
          }
          const overlap = G.collinearOverlap(sa.a, sa.b, sb.a, sb.b);
          if (overlap > 2) {
            if (sameReaction) {
              overlapSegmentsSameReaction++;
              continue;
            }
            if (sharedCompound && (near(sa.a, A.start, OVERLAP_PORT_EXEMPT) || near(sb.a, B.start, OVERLAP_PORT_EXEMPT))) continue;
            overlapSegments++;
            overlapLength += overlap;
            continue;
          }
          const distance = G.segSegDistance(sa.a, sa.b, sb.a, sb.b);
          if (distance > 0.05 && distance < minClearance) minClearance = distance;
          if (distance <= 0.05) continue;
          // 同一物質のポート扇の直近だけを免除する（ノード中心からの距離では免除しない）。
          if (sharedCompound && nearSegment(sa, A.start, 18) && nearSegment(sb, B.start, 18)) continue;
          const gap = distance - (STROKE[A.tier] + STROKE[B.tier]) / 2;
          if (gap < minStrokeClearance) minStrokeClearance = gap;
          if (sameReaction) {
            if (gap < REQUIRED_GAP[pair]) clearanceViolationsSameReaction++;
            continue;
          }
          if (gap < REQUIRED_GAP[pair]) {
            clearanceViolations++;
            if (pair === 'PP') clearanceViolationsPP++;
            else if (pair === 'PS') clearanceViolationsPS++;
            else clearanceViolationsSS++;
            if (clearanceSamples.length < 120) {
              clearanceSamples.push({
                pair,
                a: A.route.key,
                b: B.route.key,
                d: round(distance),
                gap: round(gap),
                shared: !!sharedCompound,
                segA: [[round(sa.a.x), round(sa.a.y)], [round(sa.b.x), round(sa.b.y)]],
                segB: [[round(sb.a.x), round(sb.a.y)], [round(sb.b.x), round(sb.b.y)]]
              });
            }
            if (pair === 'PS' && A.tier !== B.tier) {
              const secondary = A.tier === 'secondary' ? A : B;
              const primary = A.tier === 'primary' ? A : B;
              if (G.segSegDistance(sa.a, sa.b, sb.a, sb.b) < 6) protectedCorridorViolations++;
            }
          }
        }
      }
    }
  }
  crossings.pairsPP = pairSets.PP.size;
  crossings.pairsPS = pairSets.PS.size;
  crossings.pairsSS = pairSets.SS.size;
  crossings.reactionPairsPP = reactionPairSets.PP.size;
  crossings.reactionPairsPS = reactionPairSets.PS.size;
  crossings.reactionPairsSS = reactionPairSets.SS.size;
  crossings.sameReaction = sameReactionCrossings;

  const hard = {
    nodePenetrations,
    endpointPenetrations,
    labelPenetrations,
    titlePenetrations,
    markerPenetrations,
    markerNodeCollisions,
    markerMarkerCollisions,
    labelNodeCollisions,
    labelLabelCollisions,
    labelMarkerCollisions,
    labelTitleCollisions,
    nodeOverlaps,
    overlapSegments,
    overlapSegmentsSameReaction,
    crossingsPP: crossings.PP,
    crossingsPS: crossings.PS,
    crossingsSS: crossings.SS,
    clearanceViolations,
    protectedCorridorViolations
  };

  const tierReport = {};
  for (const tier of ['primary', 'secondary']) {
    const s = tierStats[tier];
    const reactionLengths = [...s.reactionLengths.values()];
    tierReport[tier] = {
      branches: s.lengths.length,
      reactions: s.reactionLengths.size,
      length: stats(s.lengths),
      reactionLength: stats(reactionLengths),
      bends: stats(s.bends),
      detour: stats(s.detours.filter((v) => Number.isFinite(v))),
      labelHits: s.labelHits,
      nodeHits: s.nodeHits,
      markerHits: s.markerHits
    };
  }
  tierReport.primary.length.total = round(tierReport.primary.length.total);
  tierReport.secondary.length.total = round(tierReport.secondary.length.total);

  report.meta = {
    nodeW,
    nodeH,
    canvas: scene.meta.canvas || null,
    shelf: scene.meta.shelf || null,
    routes: routes.length,
    reactions: scene.reactions.length,
    compounds: compounds.length
  };
  report.nodes = { count: compounds.length, overlaps: nodeOverlaps };
  report.markers = {
    count: scene.reactions.length,
    nodeCollisions: markerNodeCollisions,
    markerCollisions: markerMarkerCollisions,
    labelNodeCollisions,
    labelLabelCollisions,
    labelMarkerCollisions,
    labelTitleCollisions,
    colliding: markerCollisionIds.size
  };
  report.labels = { boxes: labels.length, titles: titles.length };
  report.edges = {
    count: routes.length,
    nodePenetrations,
    endpointPenetrations,
    labelPenetrations,
    titlePenetrations,
    markerPenetrations,
    crossings: crossings.total,
    acuteCrossings,
    bridgedCrossings,
    unbridgedAcute,
    overlapSegments,
    overlapLength: round(overlapLength),
    overlapSegmentsSameReaction,
    clearanceViolations,
    clearanceViolationsPP,
    clearanceViolationsPS,
    clearanceViolationsSS,
    clearanceViolationsSameReaction,
    protectedCorridorViolations,
    minClearance: Number.isFinite(minClearance) ? round(minClearance) : null,
    minStrokeClearance: Number.isFinite(minStrokeClearance) ? round(minStrokeClearance) : null,
    totalLength: Math.round(totalLength),
    bends,
    maxBends,
    avgBends: routes.length ? round(bends / routes.length) : 0
  };
  report.crossings = crossings;
  report.clearanceSamples = clearanceSamples;
  report.tiers = tierReport;
  report.hard = hard;
  report.bounds = {
    network: scene.meta.canvas
      ? { x: 0, y: 0, w: scene.meta.canvas.w, h: scene.meta.canvas.h }
      : null,
    canvas: scene.meta.canvas || null
  };
  if (scene.meta.canvas) {
    const c = scene.meta.canvas;
    report.fit = {
      panel1236x475: Math.round(G.fitScale(c, 1236, 475, 14) * 1000) / 1000,
      pc1280x900: Math.round(G.fitScale(c, 1280, 900, 0) * 1000) / 1000,
      mobile390x844: Math.round(G.fitScale(c, 390, 844, 14) * 1000) / 1000
    };
  }
  return report;
}

function near(point, endpoint, radius) {
  return endpoint && Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <= radius;
}

function nearSegment(segment, point, radius) {
  if (!point) return false;
  return G.distPointSeg(point, segment.a, segment.b) <= radius;
}

function nearestGap(gaps, point) {
  if (!gaps || !gaps.length) return Infinity;
  let min = Infinity;
  for (const g of gaps) {
    min = Math.min(min, Math.hypot(g.x - point.x, g.y - point.y));
  }
  return min;
}

function distToNodeSurface(points, rect) {
  let min = Infinity;
  for (const p of points) {
    const d = G.distPointRect(p, rect);
    if (d < min) min = d;
  }
  return { distance: min };
}

function formatReport(report) {
  const e = report.edges;
  const m = report.markers;
  const p = report.tiers.primary;
  const s = report.tiers.secondary;
  const c = report.crossings;
  return [
    '物質 ' + report.nodes.count + ' 件 / 反応 ' + report.markers.count + ' 件 / 辺 ' + e.count +
      ' 本（主要 ' + p.branches + ' / 補助 ' + s.branches + '）',
    '交差: PP ' + c.PP + ' / PS ' + c.PS + ' / SS ' + c.SS +
      '（枝ペア PP ' + c.pairsPP + ' / PS ' + c.pairsPS + ' / SS ' + c.pairsSS +
      '、反応ペア PP ' + c.reactionPairsPP + ' / PS ' + c.reactionPairsPS + ' / SS ' + c.reactionPairsSS + '）',
    '浅い交差 ' + e.acuteCrossings + '（橋あり ' + e.bridgedCrossings + ' / 橋なし ' + e.unbridgedAcute +
      '） / 同一反応内 ' + c.sameReaction,
    '主要: 長さ ' + p.length.total + 'px（p95 ' + p.length.p95 + ' / 最大 ' + p.length.max +
      '） / 曲がり p95 ' + p.bends.p95 + '・最大 ' + p.bends.max +
      ' / 迂回率 p95 ' + p.detour.p95,
    '補助: 長さ ' + s.length.total + 'px（p95 ' + s.length.p95 + '） / 曲がり p95 ' + s.bends.p95 +
      ' / 迂回率 p95 ' + s.detour.p95,
    '無関係ノード貫通: ' + e.nodePenetrations + '（主要 ' + p.nodeHits + ' / 補助 ' + s.nodeHits +
      '） / ラベル貫通: ' + e.labelPenetrations + '（主要 ' + p.labelHits + ' / 補助 ' + s.labelHits +
      '） / 他マーカー貫通: ' + e.markerPenetrations,
    'マーカー衝突: 物質 ' + m.nodeCollisions + ' / 相互 ' + m.markerCollisions +
      ' / ラベル-物質 ' + m.labelNodeCollisions + ' / ラベル-ラベル ' + m.labelLabelCollisions +
      ' / ラベル-マーカー ' + m.labelMarkerCollisions + ' / ラベル-見出し ' + m.labelTitleCollisions,
    'ノード重なり: ' + report.nodes.overlaps + ' / 同一区間重なり: ' + e.overlapSegments +
      ' 区間（合計 ' + e.overlapLength + 'px、同一反応内 ' + e.overlapSegmentsSameReaction + '）',
    'ストローク clearance 不足: ' + e.clearanceViolations +
      '（PP ' + e.clearanceViolationsPP + ' / PS ' + e.clearanceViolationsPS + ' / SS ' + e.clearanceViolationsSS +
      '、主要保護帯 ' + e.protectedCorridorViolations + '、最小縁間 ' + e.minStrokeClearance + 'px）',
    '総辺長: ' + e.totalLength + 'px / 曲がり: 合計 ' + e.bends + '・最大 ' + e.maxBends + '・平均 ' + e.avgBends +
      (report.fit ? ' / fit map ' + report.fit.panel1236x475 + '・PC ' + report.fit.pc1280x900 + '・mobile ' + report.fit.mobile390x844 : '')
  ].join('\n');
}

function loadCurrent() {
  const fs = require('node:fs');
  const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-src', 'app11', 'layout.json'), 'utf8'));
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-src', 'app11', 'routes.json'), 'utf8'));
  return sceneFromLayout(layout, routes);
}

function main() {
  const json = process.argv.includes('--json');
  const baseline = process.argv.includes('--baseline');
  const scene = baseline ? sceneFromBaseline() : loadCurrent();
  const report = measure(scene);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(baseline ? '=== 旧 fixture ===' : '=== 現在（layout v4・主要バックボーン） ===');
    console.log(formatReport(report));
  }
  return report;
}

if (require.main === module) main();

module.exports = {
  measure,
  formatReport,
  sceneFromBaseline,
  sceneFromLayout,
  legacyRoutes,
  loadCurrent,
  MARKER_MIN_DIST,
  PORT_EXEMPT,
  OVERLAP_PORT_EXEMPT,
  STROKE,
  REQUIRED_GAP
};
