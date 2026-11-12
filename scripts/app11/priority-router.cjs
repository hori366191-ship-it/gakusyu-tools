/**
 * 有機反応マップ（app11）— 主要通路の予約と補助配線
 *
 * 1. 主要（primary）の物質・反応点のポートを、相手方向の順に割り当てる。
 * 2. 主要ラベルを置き、ラベル・物質・反応点を障害物として主要枝を配線する。
 *    直線が通る枝は直線。通らない枝だけ、格子 A* で迂回し、折れ点を最小化する。
 * 3. 補助（secondary）は主要の外側・空いた面に置き、主要線を横切らない候補を選ぶ。
 *    どうしても主要線を横切る場合は隠さず、交差として数える（metrics）。
 *
 * すべて固定入力・固定順序の決定的計算。閲覧時の再配置はしない。
 */
'use strict';

const G = require('./geometry.cjs');
const B = require('./backbone-layout.cjs');

const PRIMARY_PAD = 7; // 主要枝が物質・ラベル・反応点から離す距離
const PRIMARY_EDGE_PAD = 6; // 主要枝同士の最小間隔（中心線）
const SECONDARY_PAD = 5; // 補助枝が障害物から離す距離（反応点の外形も含む）
const SECONDARY_TO_PRIMARY = 4; // 補助枝が主要枝から離す距離
const CELL = 10;

function round2(v) {
  return Math.round(v * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* 基本ジオメトリ                                                     */
/* ------------------------------------------------------------------ */

function rectOf(node) {
  return G.rect(node.x, node.y, node.w, node.h);
}

function centerOf(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function pointRectDistance(p, rect) {
  return G.distPointRect(p, rect);
}

function rectOfObstacle(obstacle) {
  const rect = obstacle && obstacle.rect ? obstacle.rect : obstacle;
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) {
    throw new Error('障害物矩形が有限値でない: ' + JSON.stringify(obstacle));
  }
  return rect;
}

function pointFree(point, obstacles, pad) {
  for (const rect of obstacles.rects) {
    const box = rectOfObstacle(rect);
    if (pointRectDistance(point, G.inflate(box, pad)) <= 0.01) return false;
  }
  for (const disc of obstacles.discs) {
    if (![disc.x, disc.y, disc.r].every(Number.isFinite)) throw new Error('障害物円が有限値でない');
    if (Math.hypot(point.x - disc.x, point.y - disc.y) < disc.r + pad) return false;
  }
  return true;
}

function segmentClear(a, b, obstacles, pad) {
  for (const rect of obstacles.rects) {
    const box = rectOfObstacle(rect);
    if (G.segmentRect(a, b, G.inflate(box, pad))) return false;
  }
  for (const disc of obstacles.discs) {
    if (![disc.x, disc.y, disc.r].every(Number.isFinite)) throw new Error('障害物円が有限値でない');
    if (G.distPointSeg(disc, a, b) < disc.r + pad) return false;
  }
  if (obstacles.segments) {
    for (const seg of obstacles.segments) {
      if (G.segSegDistance(a, b, seg.a, seg.b) < (seg.pad == null ? PRIMARY_EDGE_PAD : seg.pad)) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* ポート割当                                                         */
/* ------------------------------------------------------------------ */

function sideOf(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function sidePoint(node, side, t) {
  if (side === 'left') return { x: node.x, y: node.y + 6 + t * (node.h - 12) };
  if (side === 'right') return { x: node.x + node.w, y: node.y + 6 + t * (node.h - 12) };
  if (side === 'top') return { x: node.x + 6 + t * (node.w - 12), y: node.y };
  return { x: node.x + 6 + t * (node.w - 12), y: node.y + node.h };
}

function sideT(node, side, point) {
  if (side === 'left' || side === 'right') return (point.y - node.y - 6) / Math.max(1, node.h - 12);
  return (point.x - node.x - 6) / Math.max(1, node.w - 12);
}

function spreadPorts(items, node, side) {
  // items: [{route, desiredT}]
  if (!items.length) return;
  items.sort((a, b) => a.desiredT - b.desiredT || (a.route.key < b.route.key ? -1 : 1));
  const n = items.length;
  const minT = 0.08;
  const maxT = 0.92;
  const span = maxT - minT;
  const step = n > 1 ? Math.min(0.18, span / (n - 1)) : 0;
  const center = (minT + maxT) / 2;
  const total = step * (n - 1);
  let start = center - total / 2;
  if (start < minT) start = minT;
  if (start + total > maxT) start = maxT - total;
  for (let i = 0; i < n; i++) {
    const point = sidePoint(node, side, start + step * i);
    items[i].port = point;
    items[i].side = side;
    items[i].route.compoundPort = point;
    items[i].route.compoundSide = side;
  }
}

function assignCompoundPrimaryPorts(compounds, routes, reactions) {
  const byCompound = new Map();
  for (const route of routes) {
    if (!byCompound.has(route.compoundId)) byCompound.set(route.compoundId, []);
    byCompound.get(route.compoundId).push(route);
  }
  for (const [cid, list] of byCompound) {
    const node = compounds.get(cid);
    const center = centerOf(node);
    const groups = { left: [], right: [], top: [], bottom: [] };
    for (const route of list) {
      const marker = reactions.get(route.reactionId);
      const dx = marker.x - center.x;
      const dy = marker.y - center.y;
      const side = sideOf(dx, dy);
      let t;
      if (side === 'left' || side === 'right') {
        const sx = side === 'left' ? node.x : node.x + node.w;
        const y = center.y + (Math.abs(dx) > 1e-9 ? (dy / dx) * (sx - center.x) : 0);
        t = (y - node.y - 6) / Math.max(1, node.h - 12);
      } else {
        const sy = side === 'top' ? node.y : node.y + node.h;
        const x = center.x + (Math.abs(dy) > 1e-9 ? (dx / dy) * (sy - center.y) : 0);
        t = (x - node.x - 6) / Math.max(1, node.w - 12);
      }
      groups[side].push({ route, desiredT: G.clamp(t, 0.08, 0.92) });
    }
    // 辺ごとの容量を超えたら、隣の辺へ回す（同一点へ収束させない）。
    const cap = { left: 4, right: 4, top: 6, bottom: 6 };
    for (const side of ['left', 'right', 'top', 'bottom']) {
      while (groups[side].length > cap[side]) {
        const item = groups[side].pop();
        const alt = side === 'left' ? 'top' : side === 'right' ? 'bottom' : side === 'top' ? 'left' : 'right';
        groups[alt].push(item);
      }
    }
    for (const side of ['left', 'right', 'top', 'bottom']) spreadPorts(groups[side], node, side);
  }
}

function assignMarkerPrimaryPorts(routes, reactions) {
  const byReaction = new Map();
  for (const route of routes) {
    if (!byReaction.has(route.reactionId)) byReaction.set(route.reactionId, []);
    byReaction.get(route.reactionId).push(route);
  }
  for (const [rid, list] of byReaction) {
    const marker = reactions.get(rid);
    const desired = list.map((route) => {
      const c = route.compoundNode;
      const center = centerOf(c);
      return { route, angle: Math.atan2(center.y - marker.y, center.x - marker.x) };
    });
    desired.sort((a, b) => a.angle - b.angle || (a.route.key < b.route.key ? -1 : 1));
    const n = desired.length;
    const sep = n > 1 ? Math.min(Math.PI - 0.08, Math.max(0.45, (Math.PI * 2) / n)) : 0;
    // 全周に等間隔、ただし相手方向に寄せる。
    const base = desired.map((d) => d.angle);
    const used = [];
    for (let i = 0; i < n; i++) {
      let angle = base[i];
      for (let k = 0; k < 80; k++) {
        let ok = true;
        for (const u of used) {
          if (Math.abs(normalizeAngle(angle - u)) < sep) {
            ok = false;
            break;
          }
        }
        if (ok) break;
        angle += 0.08;
      }
      used.push(angle);
      const route = desired[i].route;
      route.markerPort = { x: marker.x + Math.cos(angle) * G.MARKER_PORT_R, y: marker.y + Math.sin(angle) * G.MARKER_PORT_R };
      route.markerAngle = angle;
    }
  }
}

function normalizeAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/* ------------------------------------------------------------------ */
/* ラベル                                                             */
/* ------------------------------------------------------------------ */

function labelBoxes(reaction) {
  const box = G.labelLayout(reaction.x, reaction.y, reaction.typeLabel, reaction.conditions, reaction.labelSide || 'N');
  return box;
}

function placePrimaryLabelsFree(source, reactions, compounds, routes) {
  const placed = [];
  const nodeRects = [...compounds.values()].map((node) => ({ id: node.id || node, rect: rectOf(node) }));
  const edges = (routes || []).filter((r) => r.points && r.points.length > 1);
  const order = source.reactions
    .filter((r) => source.priority.entries.get(r.id).tier === 'primary')
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const reaction of order) {
    const marker = reactions.get(reaction.id);
    const w = Math.ceil(G.textWidth(reaction.typeLabel, G.TYPE_FONT) * 1.4) + 8;
    const h = G.TYPE_H;
    let best = null;
    let bestScore = Infinity;
    for (let ai = 0; ai < 60; ai++) {
      const angle = (ai / 60) * Math.PI * 2;
      for (const radius of [42, 50, 58, 66, 74, 82, 90, 98, 106]) {
        const cx = marker.x + Math.cos(angle) * radius;
        const cy = marker.y + Math.sin(angle) * radius;
        const box = { x: cx - w / 2, y: cy - h / 2, w, h };
        let score = radius * 0.2;
        // 自反応マーカー・矢印の外形も hard obstacle。自反応でも免除しない。
        if (G.distPointRect({ x: marker.x, y: marker.y }, G.inflate(box, 16)) <= 0.01) score += 1e6;
        for (const edge of edges) {
          for (const seg of G.polylineSegments(edge.points)) {
            if (G.segmentRect(seg.a, seg.b, G.inflate(box, 1))) score += 10000;
          }
        }
        for (const node of nodeRects) {
          if (G.rectsOverlap(G.inflate(box, 2), node.rect)) score += 5000;
        }
        for (const other of placed) {
          if (G.rectsOverlap(G.inflate(box, 2), G.inflate(other.box, 2))) score += 5000;
        }
        for (const [id, other] of reactions) {
          if (id === reaction.id) continue;
          if (G.distPointRect({ x: other.x, y: other.y }, G.inflate(box, 10)) <= 0.01) score += 5000;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { box, angle };
        }
      }
    }
    marker.labelBoxes = { type: best.box, cond: null };
    marker.labelSide = cardinalSide(best.angle);
    marker.labelCenter = { x: best.box.x + best.box.w / 2, y: best.box.y + best.box.h / 2 };
    placed.push({ reactionId: reaction.id, box: best.box });
  }
}

function cardinalSide(angle) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'E' : 'W';
  return y >= 0 ? 'S' : 'N';
}

function labelLayoutAt(marker, reaction, side, extra) {
  const base = G.labelLayout(marker.x, marker.y, reaction.typeLabel, reaction.conditions, side);
  const dx = side === 'E' ? extra : side === 'W' ? -extra : 0;
  const dy = side === 'S' ? extra : side === 'N' ? -extra : 0;
  return {
    side,
    type: { x: base.type.x + dx, y: base.type.y + dy, w: base.type.w, h: base.type.h },
    cond: base.cond
      ? { x: base.cond.x + dx, y: base.cond.y + dy, w: base.cond.w, h: base.cond.h }
      : null
  };
}

/* ------------------------------------------------------------------ */
/* 主要配線                                                           */
/* ------------------------------------------------------------------ */

function makeObstacles(source, compounds, reactions, routes, tierFilter, opts) {
  const rects = [];
  const discs = [];
  for (const [id, node] of compounds) {
    rects.push({ kind: 'node', id, rect: rectOf(node) });
  }
  const includeLabels = !opts || opts.labels !== false;
  for (const [id, node] of reactions) {
    if (includeLabels && node.labelBoxes) {
      rects.push({ kind: 'label', id, rect: node.labelBoxes.type });
      if (node.labelBoxes.cond) rects.push({ kind: 'label-cond', id, rect: node.labelBoxes.cond });
    }
    discs.push({ kind: 'marker', id, x: node.x, y: node.y, r: G.MARKER_R });
  }
  const segments = [];
  for (const route of routes) {
    for (const seg of G.polylineSegments(route.points)) {
      segments.push({ a: seg.a, b: seg.b, pad: tierFilter === 'primary' ? PRIMARY_EDGE_PAD : SECONDARY_TO_PRIMARY, route });
    }
  }
  return { rects, discs, segments };
}

function ownObstacleExclusions(route, obstacles) {
  return obstacles.rects.filter((r) => !(r.kind === 'node' && r.id === route.compoundId) &&
    !(r.kind === 'label' && r.id === route.reactionId) &&
    !(r.kind === 'label-cond' && r.id === route.reactionId));
}

function primaryRouteClear(route, obstacles, compounds, reactions) {
  const ex = ownObstacleExclusions(route, obstacles);
  const discs = obstacles.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId));
  const segments = (obstacles.segments || []).filter((s) => {
    if (s.route.reactionId === route.reactionId) return false;
    if (s.route.compoundId === route.compoundId) return false;
    return true;
  });
  return segmentClear(route.compoundPort, route.markerPort, { rects: ex, discs, segments }, PRIMARY_EDGE_PAD);
}

function routePrimary(scene, source) {
  const routes = scene.routes.filter((r) => r.tier === 'primary');
  routes.sort((a, b) => {
    const la = Math.hypot(a.markerPort.x - a.compoundPort.x, a.markerPort.y - a.compoundPort.y);
    const lb = Math.hypot(b.markerPort.x - b.compoundPort.x, b.markerPort.y - b.compoundPort.y);
    return la - lb || (a.key < b.key ? -1 : 1);
  });
  const problems = [];
  // 主要はまず直線で結ぶ。交差する枝だけを resolvePrimaryCrossings で迂回させる。
  // 力配置の seed ではなく、位相（平面埋め込み）と優先度を先に固定した結果である。
  for (const route of routes) {
    route.points = [route.compoundPort, route.markerPort];
    const via = PRIMARY_VIA[route.key];
    if (via) {
      route.points = [route.compoundPort].concat(via, [route.markerPort]);
      route.fixed = true;
    }
  }
  resolvePrimaryCrossings(scene, source, routes);
  return problems;
}

const PRIMARY_VIA = {};

function countPointHits(scene, source, route, points) {
  const obstacles = makeObstacles(source, scene.compounds, scene.reactions, [], 'primary', { labels: true });
  let hits = 0;
  for (const seg of G.polylineSegments(points || [])) {
    for (const rect of obstacles.rects) {
      if (rect.kind === 'node' && rect.id === route.compoundId) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) hits++;
    }
  }
  return hits;
}

function primaryCrossingPairs(routes) {
  const pairs = [];
  const list = routes.filter((r) => r.points && r.points.length > 1).map((r) => ({
    route: r,
    segs: G.polylineSegments(r.points),
    start: r.points[0]
  }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (A.route.reactionId === B.route.reactionId) continue;
      const sharedCompound = A.route.compoundId === B.route.compoundId;
      for (const sa of A.segs) {
        for (const sb of B.segs) {
          const hit = G.segSegIntersection(sa.a, sa.b, sb.a, sb.b);
          if (!hit) continue;
          if (sharedCompound && Math.hypot(hit.x - A.start.x, hit.y - A.start.y) <= 8 &&
            Math.hypot(hit.x - B.start.x, hit.y - B.start.y) <= 8) continue;
          pairs.push([A.route, B.route]);
        }
      }
    }
  }
  return pairs;
}

function resolvePrimaryCrossings(scene, source, routes) {
  for (let pass = 0; pass < 4; pass++) {
    const pairs = primaryCrossingPairs(routes);
    if (!pairs.length) return;
    let fixed = 0;
    for (const [A, B] of pairs) {
      const candidates = A.fixed ? [B] : B.fixed ? [A] : [B, A];
      if (!candidates.length) continue;
      for (const route of candidates) {
        const saved = route.points;
        route.points = null;
        const obstacles = makeObstacles(source, scene.compounds, scene.reactions, scene.routes.filter((r) => r.tier === 'primary' && r.points), 'primary', { labels: false });
        const path = gridRoute(route.compoundPort, route.markerPort, obstacles, scene.bounds, {
          ownCompound: route.compoundId,
          ownReaction: route.reactionId,
          primary: true
        });
        if (path) {
          const ex = ownObstacleExclusions(route, obstacles);
          const discs = obstacles.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId));
          const segments = (obstacles.segments || []).filter((s) => s.route.reactionId !== route.reactionId && s.route.compoundId !== route.compoundId);
          const candidate = simplifyPath(path, { rects: ex, discs, segments }, PRIMARY_EDGE_PAD);
          if (countPointHits(scene, source, route, candidate) === 0) {
            route.points = candidate;
            fixed++;
            break;
          }
        }
        route.points = saved;
      }
    }
    if (!fixed) return;
  }
}

/* ------------------------------------------------------------------ */
/* 格子 A*                                                            */
/* ------------------------------------------------------------------ */

function makeGrid(bounds, obstacles, primary, softSegments) {
  const x0 = Math.floor((bounds.x - 240) / CELL) * CELL;
  const y0 = Math.floor((bounds.y - 240) / CELL) * CELL;
  const x1 = Math.ceil((bounds.x + bounds.w + 240) / CELL) * CELL;
  const y1 = Math.ceil((bounds.y + bounds.h + 240) / CELL) * CELL;
  const nx = Math.ceil((x1 - x0) / CELL) + 1;
  const ny = Math.ceil((y1 - y0) / CELL) + 1;
  const blocked = new Uint8Array(nx * ny);
  const cost = new Uint16Array(nx * ny);
  const pad = primary ? PRIMARY_PAD : SECONDARY_PAD;
  for (const rect of obstacles.rects) {
    markRect(blocked, nx, ny, x0, y0, G.inflate(rectOfObstacle(rect), pad));
  }
  for (const disc of obstacles.discs) {
    markDisc(blocked, nx, ny, x0, y0, disc.x, disc.y, disc.r + pad);
  }
  for (const seg of obstacles.segments || []) {
    markSegment(blocked, nx, ny, x0, y0, seg.a, seg.b, (seg.pad == null ? PRIMARY_EDGE_PAD : seg.pad));
  }
  for (const seg of softSegments || []) {
    markSegmentCost(cost, nx, ny, x0, y0, seg.a, seg.b, 8, 40);
  }
  return { x0, y0, nx, ny, blocked, cost, bounds: { x: x0, y: y0, w: nx * CELL, h: ny * CELL } };
}

function markSegmentCost(cost, nx, ny, x0, y0, a, b, pad, penalty) {
  const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - x0) / CELL));
  const ix1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + pad - x0) / CELL));
  const iy0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad - y0) / CELL));
  const iy1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + pad - y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    const cy = y0 + iy * CELL;
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = x0 + ix * CELL;
      if (G.distPointSeg({ x: cx, y: cy }, a, b) < pad) {
        const idx = iy * nx + ix;
        if (penalty > cost[idx]) cost[idx] = penalty;
      }
    }
  }
}

function markRect(blocked, nx, ny, x0, y0, rect) {
  const ix0 = Math.max(0, Math.floor((rect.x - x0) / CELL));
  const ix1 = Math.min(nx - 1, Math.ceil((rect.x + rect.w - x0) / CELL));
  const iy0 = Math.max(0, Math.floor((rect.y - y0) / CELL));
  const iy1 = Math.min(ny - 1, Math.ceil((rect.y + rect.h - y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    const cy = y0 + iy * CELL;
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = x0 + ix * CELL;
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
        blocked[iy * nx + ix] = 1;
      }
    }
  }
}

function markDisc(blocked, nx, ny, x0, y0, x, y, r) {
  const ix0 = Math.max(0, Math.floor((x - r - x0) / CELL));
  const ix1 = Math.min(nx - 1, Math.ceil((x + r - x0) / CELL));
  const iy0 = Math.max(0, Math.floor((y - r - y0) / CELL));
  const iy1 = Math.min(ny - 1, Math.ceil((y + r - y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    const cy = y0 + iy * CELL;
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = x0 + ix * CELL;
      if (Math.hypot(cx - x, cy - y) <= r) blocked[iy * nx + ix] = 1;
    }
  }
}

function markSegment(blocked, nx, ny, x0, y0, a, b, pad) {
  const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - x0) / CELL));
  const ix1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + pad - x0) / CELL));
  const iy0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad - y0) / CELL));
  const iy1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + pad - y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    const cy = y0 + iy * CELL;
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = x0 + ix * CELL;
      if (G.distPointSeg({ x: cx, y: cy }, a, b) < pad) blocked[iy * nx + ix] = 1;
    }
  }
}

function cellIndex(grid, p) {
  const ix = Math.round((p.x - grid.x0) / CELL);
  const iy = Math.round((p.y - grid.y0) / CELL);
  return { ix: G.clamp(ix, 0, grid.nx - 1), iy: G.clamp(iy, 0, grid.ny - 1) };
}

function clearEndpoint(blocked, grid, p, radius) {
  const c = cellIndex(grid, p);
  const r = Math.ceil(radius / CELL);
  for (let iy = c.iy - r; iy <= c.iy + r; iy++) {
    for (let ix = c.ix - r; ix <= c.ix + r; ix++) {
      if (ix < 0 || iy < 0 || ix >= grid.nx || iy >= grid.ny) continue;
      const cx = grid.x0 + ix * CELL;
      const cy = grid.y0 + iy * CELL;
      if (Math.hypot(cx - p.x, cy - p.y) <= radius) blocked[iy * grid.nx + ix] = 0;
    }
  }
}

// 端点の外向きスタブだけを空ける。全方向の円で他のノードを解放しない。
function clearStub(blocked, grid, p, toward, length, width) {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ix0 = Math.max(0, Math.floor((p.x - width - grid.x0) / CELL));
  const ix1 = Math.min(grid.nx - 1, Math.ceil((p.x + ux * length + width - grid.x0) / CELL));
  const iy0 = Math.max(0, Math.floor((p.y - width - grid.y0) / CELL));
  const iy1 = Math.min(grid.ny - 1, Math.ceil((p.y + uy * length + width - grid.y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = grid.x0 + ix * CELL;
      const cy = grid.y0 + iy * CELL;
      const rx = cx - p.x;
      const ry = cy - p.y;
      const t = rx * ux + ry * uy;
      const perp = Math.abs(rx * uy - ry * ux);
      if (t >= -4 && t <= length && perp <= width) blocked[iy * grid.nx + ix] = 0;
    }
  }
}

function gridRoute(start, end, obstacles, bounds, opts) {
  if (!bounds) return null;
  const margin = opts && opts.margin ? opts.margin : 220;
  const local = {
    x: Math.min(start.x, end.x) - margin,
    y: Math.min(start.y, end.y) - margin,
    w: Math.abs(end.x - start.x) + margin * 2,
    h: Math.abs(end.y - start.y) + margin * 2
  };
  const clipped = {
    x: Math.max(bounds.x - 60, local.x),
    y: Math.max(bounds.y - 60, local.y),
    w: Math.min(bounds.x + bounds.w + 60, local.x + local.w) - Math.max(bounds.x - 60, local.x),
    h: Math.min(bounds.y + bounds.h + 60, local.y + local.h) - Math.max(bounds.y - 60, local.y)
  };
  const grid = makeGrid(clipped, obstacles, opts.primary !== false, opts.softSegments);
  const blocked = Uint8Array.from(grid.blocked);
  clearStub(blocked, grid, start, end, 18, 6);
  clearStub(blocked, grid, end, start, 18, 6);
  const startCell = cellIndex(grid, start);
  const endCell = cellIndex(grid, end);
  const startId = startCell.iy * grid.nx + startCell.ix;
  const endId = endCell.iy * grid.nx + endCell.ix;
  if (blocked[startId] || blocked[endId]) {
    // 端点が障害物の内側にある場合は、最寄りの空きセルへ逃がす。
    const alt = nearestFree(blocked, grid, startCell, endCell);
    if (!alt) return null;
    if (alt.start) {
      startCell.ix = alt.start.ix;
      startCell.iy = alt.start.iy;
    }
    if (alt.end) {
      endCell.ix = alt.end.ix;
      endCell.iy = alt.end.iy;
    }
  }
  const heap = new MinHeap();
  const dist = new Float64Array(grid.nx * grid.ny).fill(Infinity);
  const prev = new Int32Array(grid.nx * grid.ny).fill(-1);
  const sId = startCell.iy * grid.nx + startCell.ix;
  const eId = endCell.iy * grid.nx + endCell.ix;
  dist[sId] = 0;
  heap.push({ id: sId, f: heuristic(startCell, endCell) });
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];
  let found = false;
  while (heap.size()) {
    const cur = heap.pop();
    if (cur.id === eId) {
      found = true;
      break;
    }
    if (cur.f > dist[cur.id] + heuristic(cellOf(cur.id, grid), endCell) + 1e-9) continue;
    const cx = cur.id % grid.nx;
    const cy = Math.floor(cur.id / grid.nx);
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.nx || ny >= grid.ny) continue;
      const nid = ny * grid.nx + nx;
      if (blocked[nid]) continue;
      if (dx !== 0 && dy !== 0) {
        // 斜め移動は角の2セルが空いているときだけ。
        if (blocked[cy * grid.nx + nx] || blocked[ny * grid.nx + cx]) continue;
      }
      const nd = dist[cur.id] + cost * CELL + grid.cost[nid] * CELL;
      if (nd + 1e-9 >= dist[nid]) continue;
      dist[nid] = nd;
      prev[nid] = cur.id;
      heap.push({ id: nid, f: nd + heuristic({ ix: nx, iy: ny }, endCell) });
    }
  }
  if (!found) return null;
  const cells = [];
  let cursor = eId;
  while (cursor !== -1) {
    cells.push(cellOf(cursor, grid));
    if (cursor === sId) break;
    cursor = prev[cursor];
  }
  cells.reverse();
  const pts = [start];
  for (const cell of cells.slice(1, -1)) {
    pts.push({ x: grid.x0 + cell.ix * CELL, y: grid.y0 + cell.iy * CELL });
  }
  pts.push(end);
  return dedupe(pts);
}

function nearestFree(blocked, grid, startCell, endCell) {
  const find = (cell) => {
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ix = cell.ix + dx;
          const iy = cell.iy + dy;
          if (ix < 0 || iy < 0 || ix >= grid.nx || iy >= grid.ny) continue;
          if (!blocked[iy * grid.nx + ix]) return { ix, iy };
        }
      }
    }
    return null;
  };
  return { start: find(startCell), end: find(endCell) };
}

function cellOf(id, grid) {
  return { ix: id % grid.nx, iy: Math.floor(id / grid.nx) };
}

function heuristic(a, b) {
  return Math.hypot(a.ix - b.ix, a.iy - b.iy) * CELL;
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  size() {
    return this.items.length;
  }
  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (compare(items[p], items[i]) <= 0) break;
      [items[p], items[i]] = [items[i], items[p]];
      i = p;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && compare(items[l], items[best]) < 0) best = l;
        if (r < items.length && compare(items[r], items[best]) < 0) best = r;
        if (best === i) break;
        [items[best], items[i]] = [items[i], items[best]];
        i = best;
      }
    }
    return top;
  }
}

function compare(a, b) {
  if (a.f !== b.f) return a.f - b.f;
  return a.id - b.id;
}

function simplifyPath(points, obstacles, pad) {
  const pts = dedupe(points);
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) {
      if (segmentClear(pts[i], pts[j], obstacles, pad)) break;
    }
    out.push(pts[j]);
    i = j;
  }
  return collapseCollinear(out);
}

function collapseCollinear(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    const dot = abx * bcx + aby * bcy;
    if (Math.abs(cross) < 0.5 && dot > 0) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 0.2) out.push(p);
  }
  return out;
}

module.exports = {
  PRIMARY_PAD,
  PRIMARY_EDGE_PAD,
  SECONDARY_PAD,
  SECONDARY_TO_PRIMARY,
  CELL,
  rectOf,
  rectOfObstacle,
  centerOf,
  pointFree,
  segmentClear,
  sideOf,
  sidePoint,
  sideT,
  assignCompoundPrimaryPorts,
  assignMarkerPrimaryPorts,
  placePrimaryLabelsFree,
  cardinalSide,
  labelLayoutAt,
  makeObstacles,
  primaryRouteClear,
  routePrimary,
  primaryCrossingPairs,
  resolvePrimaryCrossings,
  countPointHits,
  gridRoute,
  simplifyPath,
  collapseCollinear,
  dedupe
};
