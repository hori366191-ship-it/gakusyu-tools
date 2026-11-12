/**
 * 有機反応マップ（app11）— 配置・経路の定量計測
 *
 * 改善前（layout v1 + 直線/2次ベジェ）と改善後（v2 + 保存済み折れ線）を
 * まったく同じ計算で測るための計測器。DOM も外部依存も使わない。
 *
 * 実行:
 *   node scripts/app11/metrics.cjs                 # 現在の layout v2 を計測
 *   node scripts/app11/metrics.cjs --baseline      # v1 スナップショットを計測
 *   node scripts/app11/metrics.cjs --json          # JSON で出力
 *
 * 用語:
 * - 無関係ノード貫通: 辺が、その辺の端点ではない物質の矩形を横切る。
 * - マーカー衝突: 反応マーカー同士・マーカーと物質・マーカーとラベルの接触。
 * - 同一区間重なり: 別の辺が同じ線分上を 2px 以上共有する。
 * - 交差: 同一反応内のマーカー付近（意図した接続）と、同一物質のポート付近を除いた交差。
 */
'use strict';

const path = require('node:path');
const G = require('./geometry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app11-baseline', 'scene.json');

const MARKER_MIN_DIST = 22;
const GAP_MATCH = 4;
const SHARED_NODE_EXEMPT = 32; // 同一物質のポート扇（意図した接続）として重なり判定から除く距離
const SHARED_MARKER_EXEMPT = 30;

function nodeRect(compound, nodeW, nodeH) {
  return G.rect(compound.x, compound.y, nodeW, nodeH);
}

function edgeEndpoints(route, compoundById) {
  const c = compoundById.get(route.compoundId);
  return c ? [{ x: c.x + G.NODE_W / 2, y: c.y + G.NODE_H / 2 }] : [];
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

// 旧レイアウトの描画（nodeCenter → marker の直線、分野横断は2次ベジェ）を折れ線にする。
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
        points,
        gaps: []
      });
    };
    for (const id of r.substrates) {
      const c = compoundById.get(id);
      if (!c) continue;
      add('in', id, { x: c.x + scene.meta.nodeW / 2, y: c.y + scene.meta.nodeH / 2 }, marker);
    }
    for (const id of r.products) {
      const c = compoundById.get(id);
      if (!c) continue;
      add('out', id, marker, { x: c.x + scene.meta.nodeW / 2, y: c.y + scene.meta.nodeH / 2 });
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

function sceneFromLayout(layout, routesFile) {
  const regions = layout.regions.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.count,
    focus: r.focus,
    center: r.center
  }));
  const compounds = Object.keys(layout.positions).sort().map((id) => {
    const p = layout.positions[id];
    return { id, x: p.x, y: p.y, region: p.r };
  });
  const reactions = Object.keys(layout.reactions).sort().map((id) => {
    const r = layout.reactions[id];
    const labelBoxes = G.labelLayout(r.x, r.y, r.typeLabel, r.conditions, r.label ? r.label.side : 'N');
    return {
      id,
      x: r.x,
      y: r.y,
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
      points: e.points.map((p) => ({ x: p[0], y: p[1] })),
      gaps: (e.gaps || []).map((p) => ({ x: p[0], y: p[1] })),
      bridges: (e.bridges || []).map((p) => ({ x: p[0], y: p[1] }))
    };
  });
  return {
    meta: {
      nodeW: layout.nodeW || G.NODE_W,
      nodeH: layout.nodeH || G.NODE_H,
      canvas: layout.canvas
    },
    regions,
    compounds,
    reactions,
    routes
  };
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
    const box = r.labelBoxes || G.labelBoxes(r.x, r.y, r.typeLabel, r.conditions);
    labels.push({ reactionId: r.id, kind: 'type', box: box.type });
    if (box.cond) labels.push({ reactionId: r.id, kind: 'cond', box: box.cond });
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
      if (r.id === label.reactionId) continue;
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

  // --- edge geometry -----------------------------------------------------
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

  for (const route of routes) {
    const segs = G.polylineSegments(route.points).map((s) => ({ a: s.a, b: s.b }));
    totalLength += G.polylineLength(route.points);
    const b = G.bendCount(route.points);
    bends += b;
    maxBends = Math.max(maxBends, b);
    routeSegments.push({ route, segs });
    routeAabb.set(route.key, aabb(route.points));
    const endpoint = route.compoundId;
    const reaction = reactionById.get(route.reactionId);
    for (const seg of segs) {
      // 端点ノードの内側へ入り込んでいないか（ポートから 12px を超える侵入）
      if (endpoint) {
        const endNode = nodeByRectId.get(endpoint);
        if (endNode && G.segmentRect(seg.a, seg.b, G.inflate(endNode.r, -0.5))) {
          const port = distToNodeSurface(route.points, endNode.r);
          if (!port || port.distance > 12) hitEndpoint.add(route.key);
        }
      }
      for (const n of nodeRects) {
        if (n.id === endpoint) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(n.r, -0.5))) hitNode.add(route.key + '|' + n.id);
      }
      for (const label of labels) {
        if (G.segmentRect(seg.a, seg.b, G.inflate(label.box, -0.5))) {
          hitLabel.add(route.key + '|' + label.reactionId + '|' + label.kind);
        }
      }
      for (const title of titles) {
        if (G.segmentRect(seg.a, seg.b, title.box)) hitTitle.add(route.key + '|' + title.regionId);
      }
      for (const other of scene.reactions) {
        if (other.id === route.reactionId) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(G.markerBox(other.x, other.y), 2))) {
          hitMarker.add(route.key + '|' + other.id);
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
  let crossings = 0;
  let acuteCrossings = 0;
  let bridgedCrossings = 0;
  let unbridgedAcute = 0;
  let overlapSegments = 0;
  let overlapLength = 0;
  let overlapSegmentsRaw = 0;
  let overlapLengthRaw = 0;
  let clearanceViolations = 0;
  let minClearance = Infinity;
  const crossingSamples = [];

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
      if (A.route.reactionId === B.route.reactionId) continue; // 同一反応は意図した接続
      if (!aabbNear(routeAabb.get(A.route.key), routeAabb.get(B.route.key), SHARED_MARKER_EXEMPT)) continue;
      const shared = A.route.compoundId && A.route.compoundId === B.route.compoundId
        ? nodeByRectId.get(A.route.compoundId)
        : null;
      for (const sa of A.segs) {
        for (const sb of B.segs) {
          const aabbA = aabb([sa.a, sa.b]);
          const aabbB = aabb([sb.a, sb.b]);
          if (!aabbNear(aabbA, aabbB, G.CLEARANCE + 1)) continue;
          const hit = G.segSegIntersection(sa.a, sa.b, sb.a, sb.b);
          if (hit) {
            if (shared && G.distPointRect(hit, shared.r) < SHARED_NODE_EXEMPT) continue;
            crossings++;
            const aGap = nearestGap(gapPointsByKey.get(A.route.key), hit);
            const bGap = nearestGap(gapPointsByKey.get(B.route.key), hit);
            const aBridge = nearestGap(bridgePointsByKey.get(A.route.key), hit);
            const bBridge = nearestGap(bridgePointsByKey.get(B.route.key), hit);
            const distinguished = Math.min(aGap, bGap) <= GAP_MATCH ||
              Math.min(aBridge, bBridge) <= 8;
            const ax = sa.b.x - sa.a.x;
            const ay = sa.b.y - sa.a.y;
            const bx = sb.b.x - sb.a.x;
            const by = sb.b.y - sb.a.y;
            const dot = Math.abs(ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
            const angle = Math.acos(Math.min(1, dot));
            crossingSamples.push({ x: hit.x, y: hit.y, a: A.route.key, b: B.route.key, angle, distinguished });
            if (angle < (25 * Math.PI) / 180) {
              acuteCrossings++;
              if (distinguished) bridgedCrossings++;
              else unbridgedAcute++;
            }
            continue;
          }
          // 同一線分上の重なり（下を通る辺に切れ目があれば連続共有しない）
          const overlap = G.collinearOverlap(sa.a, sa.b, sb.a, sb.b);
          if (overlap > 2) {
            if (shared && (G.distPointRect(sa.a, shared.r) < SHARED_NODE_EXEMPT ||
              G.distPointRect(sb.a, shared.r) < SHARED_NODE_EXEMPT)) continue;
            const interval = overlapInterval(sa.a, sa.b, sb.a, sb.b);
            overlapSegmentsRaw++;
            overlapLengthRaw += overlap;
            if (interval && (gapsCover(gapPointsByKey.get(A.route.key), interval) ||
              gapsCover(gapPointsByKey.get(B.route.key), interval))) continue;
            overlapSegments++;
            overlapLength += overlap;
            continue;
          }
          const distance = G.segSegDistance(sa.a, sa.b, sb.a, sb.b);
          if (distance > 0.05 && distance < minClearance) minClearance = distance;
          if (distance < G.CLEARANCE && distance > 0.05) {
            if (shared && (G.distPointRect(sa.a, shared.r) < SHARED_NODE_EXEMPT ||
              G.distPointRect(sb.a, shared.r) < SHARED_NODE_EXEMPT)) continue;
            clearanceViolations++;
          }
        }
      }
    }
  }

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
    crossingsWithoutGap: unbridgedAcute,
    unbridgedAcute,
    clearanceViolations
  };

  report.meta = {
    nodeW,
    nodeH,
    canvas: scene.meta.canvas || null,
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
    crossings,
    crossingsWithoutGap: unbridgedAcute,
    acuteCrossings,
    bridgedCrossings,
    unbridgedAcute,
    overlapSegments,
    overlapLength: Math.round(overlapLength * 10) / 10,
    overlapSegmentsRaw,
    overlapLengthRaw: Math.round(overlapLengthRaw * 10) / 10,
    clearanceViolations,
    minClearance: Number.isFinite(minClearance) ? Math.round(minClearance * 100) / 100 : null,
    totalLength: Math.round(totalLength),
    bends,
    maxBends,
    avgBends: routes.length ? Math.round((bends / routes.length) * 100) / 100 : 0
  };
  report.hard = hard;
  report.crossingSamples = crossingSamples.length > 40 ? crossingSamples.slice(0, 40) : crossingSamples;
  report.unbridgedSamples = crossingSamples.filter((s) => s.angle < (25 * Math.PI) / 180 && !s.distinguished);
  return report;
}

function nearestGap(gaps, point) {
  if (!gaps || !gaps.length) return Infinity;
  let min = Infinity;
  for (const g of gaps) {
    min = Math.min(min, Math.hypot(g.x - point.x, g.y - point.y));
  }
  return min;
}

function overlapInterval(a, b, c, d) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const len2 = ux * ux + uy * uy;
  if (len2 < 1e-9) return null;
  const t = (p) => ((p.x - a.x) * ux + (p.y - a.y) * uy) / len2;
  const t0 = Math.max(0, Math.min(t(c), t(d)));
  const t1 = Math.min(1, Math.max(t(c), t(d)));
  if (t1 <= t0) return null;
  return {
    a: { x: a.x + ux * t0, y: a.y + uy * t0 },
    b: { x: a.x + ux * t1, y: a.y + uy * t1 }
  };
}

function gapsCover(gaps, interval) {
  if (!gaps || !gaps.length) return false;
  const steps = Math.max(2, Math.ceil(Math.hypot(interval.b.x - interval.a.x, interval.b.y - interval.a.y) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = {
      x: interval.a.x + (interval.b.x - interval.a.x) * t,
      y: interval.a.y + (interval.b.y - interval.a.y) * t
    };
    if (nearestGap(gaps, point) > 4) return false;
  }
  return true;
}

function distToNodeSurface(points, rect) {
  let min = Infinity;
  for (const p of points) {
    const d = G.distPointRect(p, rect);
    if (d < min) min = d;
  }
  return { distance: min };
}

// 計測結果を 1 行ずつ読みやすく整形する。
function formatReport(report) {
  const e = report.edges;
  const m = report.markers;
  return [
    '物質 ' + report.nodes.count + ' 件 / 反応 ' + report.markers.count + ' 件 / 辺 ' + e.count + ' 本',
    '無関係ノード貫通: ' + e.nodePenetrations + '（端点ノード内への侵入 ' + e.endpointPenetrations + '）',
    'ラベル貫通: ' + e.labelPenetrations + ' / 分野見出し貫通: ' + e.titlePenetrations + ' / 他マーカー貫通: ' + e.markerPenetrations,
    'マーカー衝突: 物質 ' + m.nodeCollisions + ' / 相互 ' + m.markerCollisions +
      ' / ラベル-物質 ' + m.labelNodeCollisions + ' / ラベル-ラベル ' + m.labelLabelCollisions +
      ' / ラベル-マーカー ' + m.labelMarkerCollisions + ' / ラベル-見出し ' + m.labelTitleCollisions,
    'ノード重なり: ' + report.nodes.overlaps + ' / 同一区間重なり: ' + e.overlapSegments +
      ' 区間（合計 ' + e.overlapLength + 'px）' +
      (e.overlapSegmentsRaw ? '（切れ目を入れる前の共有 ' + e.overlapSegmentsRaw + ' 区間 ' + e.overlapLengthRaw + 'px）' : ''),
    '交差: ' + e.crossings + '（浅い交差 ' + e.acuteCrossings + ' / 橋あり ' +
      e.bridgedCrossings + ' / 橋なし ' + e.unbridgedAcute + '）',
    '辺間クリアランス不足: ' + e.clearanceViolations + '（最小 ' + e.minClearance + 'px）',
    '総辺長: ' + e.totalLength + 'px / 曲がり: 合計 ' + e.bends + '・最大 ' + e.maxBends + '・平均 ' + e.avgBends
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
    console.log(baseline ? '=== 改善前（layout v1） ===' : '=== 現在（layout v3・ネットワーク配置） ===');
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
  GAP_MATCH,
  SHARED_NODE_EXEMPT,
  SHARED_MARKER_EXEMPT
};
