/**
 * 有機反応マップ（app11）— 反応ネットワークの配置と配線（オフライン）
 *
 * 分類パネルで囲う方式をやめ、反応に関与する101物質と86反応を1つの2部グラフとして
 * 力配置する。孤立326物質は右側のコンパクトな棚に置く（単一キャンバス・削除なし）。
 * 分類はノードの色帯・チップ・カードで保持する。
 *
 * 1. 連結成分ごとに力配置（固定seed、決定的）
 * 2. 成分を詰めて配置し、孤立物質の棚を外縁に追加
 * 3. 反応ラベルを入射辺の少ない側へ置き、矩形の衝突を避ける
 * 4. ノード/マーカーのポートを分散し、直線が障害物に当たる辺だけ可視グラフで迂回
 * 5. 同一区間の重なりは、レーンを変えた再配線で解消
 * 6. 浅い交差だけ小さな橋（バンプ）を付ける。切れ目（ギャップ）は使わない
 *
 * 外部依存なし。乱数は固定seedのLCGのみ。
 */
'use strict';

const G = require('./geometry.cjs');
const S = require('./source-data.cjs');
const M = require('./metrics.cjs');

const SEED = 11011;

const OPTS = {
  k: 20,
  desired: 120,
  spring: 0.34,
  gravity: 0.008,
  nodePad: 10,
  cutoff: 260,
  temp: 30,
  cooling: 0.98,
  iterations: 900,
  collisionPad: 4,
  componentGap: 80,
  columnWidth: 1500,
  shelfGap: 80
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildGraph(source) {
  const incident = new Map();
  for (const r of source.reactions) {
    const ids = [...new Set(r.substrates.concat(r.products))];
    ids.forEach((id) => incident.set(id, (incident.get(id) || 0) + 1));
  }
  const nodes = [];
  for (const c of source.compounds.values()) {
    if (!incident.get(c.id)) continue;
    nodes.push({ id: c.id, kind: 'c', deg: incident.get(c.id), region: c.region, w: G.NODE_W, h: G.NODE_H });
  }
  for (const r of source.reactions) {
    const label = G.labelBoxes(0, 0, r.typeLabel, r.conditions);
    const w = Math.max(label.type.w, label.cond ? label.cond.w : 0) + 24;
    nodes.push({ id: r.id, kind: 'r', deg: r.substrates.length + r.products.length, region: r.regions.join('+'), w, h: 64 });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const r of source.reactions) {
    const ids = [...new Set(r.substrates.concat(r.products))];
    for (const id of ids) {
      adj.get(id).push(r.id);
      adj.get(r.id).push(id);
    }
  }
  return { nodes, byId, adj, incident };
}

function components(graph) {
  const seen = new Set();
  const out = [];
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    const stack = [n.id];
    seen.add(n.id);
    const ids = [];
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const nb of graph.adj.get(id)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    out.push(ids);
  }
  out.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  return out;
}

function layoutComponent(ids, graph, seed, opts) {
  const rand = rng(seed);
  const nodes = ids.map((id) => graph.byId.get(id));
  const n = nodes.length;
  const pos = new Map();
  const radius = Math.sqrt(n) * 62;
  nodes.sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1));
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 + rand() * 0.01;
    pos.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  let temp = opts.temp;
  for (let iter = 0; iter < opts.iterations; iter++) {
    const disp = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = pos.get(a.id);
        const pb = pos.get(b.id);
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const d = Math.hypot(dx, dy) || 0.1;
        const ra = Math.max(a.w, a.h) / 2 + opts.nodePad;
        const rb = Math.max(b.w, b.h) / 2 + opts.nodePad;
        const min = ra + rb;
        let force = d < opts.cutoff ? (opts.k * opts.k) / Math.max(d, min * 0.7) : 0;
        if (d < min) force += (min - d) * 1.6;
        dx /= d;
        dy /= d;
        disp.get(a.id).x += dx * force;
        disp.get(a.id).y += dy * force;
        disp.get(b.id).x -= dx * force;
        disp.get(b.id).y -= dy * force;
      }
    }
    for (const a of nodes) {
      for (const nb of graph.adj.get(a.id)) {
        if (nb < a.id) continue;
        const b = graph.byId.get(nb);
        const pa = pos.get(a.id);
        const pb = pos.get(b.id);
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 0.1;
        const force = (d - opts.desired) * opts.spring;
        dx /= d;
        dy /= d;
        disp.get(a.id).x += dx * force;
        disp.get(a.id).y += dy * force;
        disp.get(b.id).x -= dx * force;
        disp.get(b.id).y -= dy * force;
      }
    }
    for (const node of nodes) {
      const p = pos.get(node.id);
      disp.get(node.id).x -= p.x * opts.gravity;
      disp.get(node.id).y -= p.y * opts.gravity;
    }
    let total = 0;
    for (const node of nodes) {
      const d = disp.get(node.id);
      const len = Math.hypot(d.x, d.y);
      if (len < 1e-9) continue;
      const move = Math.min(len, temp);
      const p = pos.get(node.id);
      p.x += (d.x / len) * move;
      p.y += (d.y / len) * move;
      total += move;
    }
    temp *= opts.cooling;
    if (total / n < 0.02 && iter > 60) break;
  }
  return pos;
}

function resolveCollisions(pos, graph, ids, iterations, pad) {
  const nodes = ids.map((id) => graph.byId.get(id));
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = pos.get(a.id);
        const pb = pos.get(b.id);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const ox = a.w / 2 + pad + b.w / 2 - Math.abs(dx);
        const oy = a.h / 2 + pad + b.h / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const move = Math.min(ox, oy) / 2 + 0.1;
        if (ox < oy) {
          const s = dx >= 0 ? 1 : -1;
          pa.x -= s * move;
          pb.x += s * move;
        } else {
          const s = dy >= 0 ? 1 : -1;
          pa.y -= s * move;
          pb.y += s * move;
        }
        moved++;
      }
    }
    if (!moved) break;
  }
}

function packComponents(comps, positions, graph, gap, colW) {
  const boxes = comps.map((ids) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = positions.get(id);
      const n = graph.byId.get(id);
      minX = Math.min(minX, p.x - n.w / 2);
      maxX = Math.max(maxX, p.x + n.w / 2);
      minY = Math.min(minY, p.y - n.h / 2);
      maxY = Math.max(maxY, p.y + n.h / 2);
    }
    return { ids, minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  });
  boxes.sort((a, b) => b.h * b.w - a.h * a.w || (a.ids[0] < b.ids[0] ? -1 : 1));
  const main = boxes[0];
  for (const id of main.ids) {
    const p = positions.get(id);
    p.x += -main.minX;
    p.y += -main.minY;
  }
  let x = main.w + gap;
  let y = 0;
  let rowH = 0;
  for (let i = 1; i < boxes.length; i++) {
    const box = boxes[i];
    if (x > main.w + gap && x + box.w > main.w + gap + colW) {
      x = main.w + gap;
      y += rowH + gap;
      rowH = 0;
    }
    for (const id of box.ids) {
      const p = positions.get(id);
      p.x += x - box.minX;
      p.y += y - box.minY;
    }
    x += box.w + gap;
    rowH = Math.max(rowH, box.h);
  }
}

function layoutNetwork(source) {
  const graph = buildGraph(source);
  const comps = components(graph);
  const positions = new Map();
  comps.forEach((ids, idx) => {
    const pos = layoutComponent(ids, graph, SEED + idx * 17, OPTS);
    resolveCollisions(pos, graph, ids, 120, OPTS.collisionPad);
    for (const [id, p] of pos) positions.set(id, p);
  });
  packComponents(comps, positions, graph, OPTS.componentGap, OPTS.columnWidth);
  return { graph, comps, positions };
}

/* ------------------------------------------------------------------ */
/* ラベル                                                             */
/* ------------------------------------------------------------------ */

function chooseLabelSides(layout, source) {
  const { positions } = layout;
  const placed = [];
  const compoundRects = [];
  for (const c of source.compounds.values()) {
    const p = positions.get(c.id);
    if (!p) continue;
    compoundRects.push({ id: c.id, rect: G.rect(p.x - G.NODE_W / 2, p.y - G.NODE_H / 2, G.NODE_W, G.NODE_H) });
  }
  const markers = [];
  const sides = {};
  const normals = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI };
  const reactions = source.reactions.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of reactions) {
    const p = positions.get(r.id);
    const angles = [...new Set(r.substrates.concat(r.products))].map((id) => {
      const q = positions.get(id);
      return Math.atan2(q.y - p.y, q.x - p.x);
    });
    let best = null;
    let bestScore = Infinity;
    for (const side of ['N', 'S', 'E', 'W']) {
      const box = G.labelLayout(p.x, p.y, r.typeLabel, r.conditions, side);
      let score = { N: 0, S: 1, E: 2, W: 3 }[side];
      for (const angle of angles) {
        let d = Math.abs(angle - normals[side]);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < Math.PI * 0.42) score += (1 - d / (Math.PI * 0.42)) * 120;
      }
      for (const node of compoundRects) {
        if (G.rectsOverlap(G.inflate(box.type, 2), node.rect) ||
          (box.cond && G.rectsOverlap(G.inflate(box.cond, 2), node.rect))) score += 1000;
      }
      for (const other of placed) {
        if (G.rectsOverlap(G.inflate(box.type, 2), G.inflate(other.type, 2)) ||
          (box.cond && G.rectsOverlap(G.inflate(box.cond, 2), G.inflate(other.type, 2))) ||
          G.rectsOverlap(G.inflate(box.type, 2), G.inflate(other.cond, 2)) ||
          (box.cond && G.rectsOverlap(G.inflate(box.cond, 2), G.inflate(other.cond, 2)))) score += 2000;
      }
      for (const m of markers) {
        if (G.distPointRect({ x: m.x, y: m.y }, box.type) < 14 ||
          (box.cond && G.distPointRect({ x: m.x, y: m.y }, box.cond) < 14)) score += 1000;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { side, box };
      }
    }
    sides[r.id] = best;
    placed.push(best.box);
    markers.push({ x: p.x, y: p.y });
  }
  return sides;
}

function makeObstacles(source, layout, sides) {
  const rects = [];
  const discs = [];
  for (const c of source.compounds.values()) {
    const p = layout.positions.get(c.id);
    if (!p) continue;
    rects.push({ kind: 'node', id: c.id, rect: G.rect(p.x - G.NODE_W / 2, p.y - G.NODE_H / 2, G.NODE_W, G.NODE_H) });
  }
  for (const r of source.reactions) {
    const p = layout.positions.get(r.id);
    const box = sides[r.id].box;
    rects.push({ kind: 'label', id: r.id, rect: box.type });
    if (box.cond) rects.push({ kind: 'label', id: r.id, rect: box.cond });
    discs.push({ kind: 'marker', id: r.id, x: p.x, y: p.y, r: G.MARKER_PORT_R });
  }
  return { rects, discs };
}

/* ------------------------------------------------------------------ */
/* ポートと配線                                                       */
/* ------------------------------------------------------------------ */

function buildScene(layout, source, sides) {
  const positions = layout.positions;
  const compounds = [];
  const reactions = [];
  const routes = [];
  const cById = new Map();
  for (const c of source.compounds.values()) {
    const p = positions.get(c.id);
    if (!p) continue;
    const x = p.x - G.NODE_W / 2;
    const y = p.y - G.NODE_H / 2;
    compounds.push({ id: c.id, x, y, region: c.region });
    cById.set(c.id, { x, y });
  }
  for (const r of source.reactions) {
    const p = positions.get(r.id);
    const box = sides[r.id].box;
    reactions.push({
      id: r.id,
      x: p.x,
      y: p.y,
      substrates: r.substrates,
      products: r.products,
      typeLabel: r.typeLabel,
      conditions: r.conditions,
      cross: r.cross,
      labelBoxes: box,
      labelSide: sides[r.id].side
    });
    const marker = { x: p.x, y: p.y };
    for (const id of r.substrates) {
      const c = cById.get(id);
      routes.push({
        key: r.id + '|in|' + id,
        reactionId: r.id,
        dir: 'in',
        compoundId: id,
        points: [{ x: c.x + G.NODE_W / 2, y: c.y + G.NODE_H / 2 }, marker],
        gaps: [],
        bridges: []
      });
    }
    for (const id of r.products) {
      const c = cById.get(id);
      routes.push({
        key: r.id + '|out|' + id,
        reactionId: r.id,
        dir: 'out',
        compoundId: id,
        points: [{ x: c.x + G.NODE_W / 2, y: c.y + G.NODE_H / 2 }, marker],
        gaps: [],
        bridges: []
      });
    }
  }
  return { meta: { nodeW: G.NODE_W, nodeH: G.NODE_H, canvas: { x: 0, y: 0, w: 1, h: 1 } }, regions: [], compounds, reactions, routes };
}

function portClear(point, obstacles, excludeNode, excludeReaction) {
  for (const o of obstacles.rects) {
    if (o.kind === 'node' && o.id === excludeNode) continue;
    if (G.pointInRect(point, G.inflate(o.rect, 1.5))) return false;
  }
  for (const d of obstacles.discs) {
    if (d.id === excludeReaction) continue;
    if (Math.hypot(point.x - d.x, point.y - d.y) < d.r + 1.5) return false;
  }
  return true;
}

function chooseNodePort(c, side, t, obstacles, compoundId) {
  const sides = [side, 'top', 'bottom', 'left', 'right'].filter((s, i, arr) => arr.indexOf(s) === i);
  const fractions = [t, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  let fallback = null;
  for (const s of sides) {
    for (const frac of fractions) {
      const point = s === 'left' || s === 'right'
        ? { x: s === 'left' ? c.x : c.x + G.NODE_W, y: c.y + 6 + frac * (G.NODE_H - 12) }
        : { x: c.x + 8 + frac * (G.NODE_W - 16), y: s === 'top' ? c.y : c.y + G.NODE_H };
      if (!fallback) fallback = { port: point, side: s };
      if (portClear(point, obstacles, compoundId, null)) return { port: point, side: s };
    }
  }
  return fallback;
}

function assignPorts(scene, obstacles, sides) {
  const edgeByCompound = new Map();
  const edgeByReaction = new Map();
  const reactionById = new Map(scene.reactions.map((r) => [r.id, r]));
  const compoundById = new Map(scene.compounds.map((c) => [c.id, c]));
  for (const route of scene.routes) {
    if (!edgeByCompound.has(route.compoundId)) edgeByCompound.set(route.compoundId, []);
    edgeByCompound.get(route.compoundId).push(route);
    if (!edgeByReaction.has(route.reactionId)) edgeByReaction.set(route.reactionId, []);
    edgeByReaction.get(route.reactionId).push(route);
  }
  for (const [id, list] of edgeByCompound) {
    const c = compoundById.get(id);
    const cx = c.x + G.NODE_W / 2;
    const cy = c.y + G.NODE_H / 2;
    list.sort((a, b) => {
      const ma = reactionById.get(a.reactionId);
      const mb = reactionById.get(b.reactionId);
      return Math.atan2(ma.y - cy, ma.x - cx) - Math.atan2(mb.y - cy, mb.x - cx) || (a.key < b.key ? -1 : 1);
    });
    for (const route of list) {
      const marker = reactionById.get(route.reactionId);
      const dx = marker.x - cx;
      const dy = marker.y - cy;
      const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
      const sameSide = list.filter((r) => {
        const m = reactionById.get(r.reactionId);
        const ddx = m.x - cx;
        const ddy = m.y - cy;
        return (Math.abs(ddx) >= Math.abs(ddy) ? (ddx >= 0 ? 'right' : 'left') : (ddy >= 0 ? 'bottom' : 'top')) === side;
      });
      const idx = sameSide.indexOf(route);
      const t = sameSide.length === 1 ? 0.5 : (idx + 0.5) / sameSide.length;
      const chosen = chooseNodePort(c, side, t, obstacles, id);
      route.port = chosen.port;
      route.nodeSide = chosen.side;
    }
  }
  for (const [rid, list] of edgeByReaction) {
    const r = reactionById.get(rid);
    const labelAngle = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI }[sides[rid].side];
    list.sort((a, b) => {
      const ca = compoundById.get(a.compoundId);
      const cb = compoundById.get(b.compoundId);
      return Math.atan2(ca.y + 17 - r.y, ca.x + 68 - r.x) - Math.atan2(cb.y + 17 - r.y, cb.x + 68 - r.x) || (a.key < b.key ? -1 : 1);
    });
    for (const route of list) {
      const c = compoundById.get(route.compoundId);
      const desired = Math.atan2(c.y + 17 - r.y, c.x + 68 - r.x);
      const candidates = [];
      for (let k = 0; k < 36; k++) {
        const angle = (k / 36) * Math.PI * 2;
        let diff = Math.abs(angle - desired);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        let lab = Math.abs(angle - labelAngle);
        if (lab > Math.PI) lab = Math.PI * 2 - lab;
        if (lab < Math.PI * 0.33) continue;
        candidates.push({ angle, diff });
      }
      candidates.sort((a, b) => a.diff - b.diff || a.angle - b.angle);
      let chosen = candidates.length ? candidates[0] : { angle: desired };
      for (const candidate of candidates) {
        const point = { x: r.x + Math.cos(candidate.angle) * G.MARKER_PORT_R, y: r.y + Math.sin(candidate.angle) * G.MARKER_PORT_R };
        if (portClear(point, obstacles, null, rid)) {
          chosen = candidate;
          break;
        }
      }
      route.markerPort = { x: r.x + Math.cos(chosen.angle) * G.MARKER_PORT_R, y: r.y + Math.sin(chosen.angle) * G.MARKER_PORT_R };
      route.markerAngle = chosen.angle;
    }
  }
}

function segmentClear(a, b, obstacles, excludeNode, excludeReaction) {
  for (const o of obstacles.rects) {
    if (o.kind === 'node' && o.id === excludeNode) continue;
    if (G.segmentRect(a, b, G.inflate(o.rect, 1.5))) return false;
  }
  for (const d of obstacles.discs) {
    if (d.id === excludeReaction) continue;
    if (G.distPointSeg(d, a, b) < d.r + 1.5) return false;
  }
  return true;
}

function visibilityRoute(start, end, obstacles, excludeNode, excludeReaction, lane) {
  if (segmentClear(start, end, obstacles, excludeNode, excludeReaction)) return [start, end];
  const bbox = {
    x: Math.min(start.x, end.x) - 80,
    y: Math.min(start.y, end.y) - 80,
    w: Math.abs(end.x - start.x) + 160,
    h: Math.abs(end.y - start.y) + 160
  };
  const points = [start, end];
  const near = obstacles.rects.filter((o) => {
    if (o.kind === 'node' && o.id === excludeNode) return false;
    return G.rectsOverlap(bbox, o.rect, 120);
  });
  for (const o of near) {
    const r = G.inflate(o.rect, lane || 5);
    points.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h });
  }
  const n = points.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      if (!segmentClear(points[u], points[v], obstacles, excludeNode, excludeReaction)) continue;
      const w = dist[u] + Math.hypot(points[v].x - points[u].x, points[v].y - points[u].y);
      if (w < dist[v]) { dist[v] = w; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[1])) return [start, end];
  const path = [];
  let p = 1;
  while (p !== -1) { path.push(points[p]); p = prev[p]; }
  path.reverse();
  return path;
}

function routeScene(scene, obstacles) {
  let fallback = 0;
  for (const route of scene.routes) {
    const direct = segmentClear(route.port, route.markerPort, obstacles, route.compoundId, route.reactionId);
    const path = visibilityRoute(route.port, route.markerPort, obstacles, route.compoundId, route.reactionId, 5);
    if (!direct && path.length === 2) fallback++;
    route.points = path;
  }
  return fallback;
}

function overlapLengthFor(route, scene) {
  const compoundById = new Map(scene.compounds.map((c) => [c.id, c]));
  let total = 0;
  for (const other of scene.routes) {
    if (other === route || other.reactionId === route.reactionId) continue;
    const shared = route.compoundId === other.compoundId ? compoundById.get(route.compoundId) : null;
    const sharedRect = shared ? G.rect(shared.x, shared.y, G.NODE_W, G.NODE_H) : null;
    for (const sa of G.polylineSegments(route.points)) {
      for (const sb of G.polylineSegments(other.points)) {
        const o = G.collinearOverlap(sa.a, sa.b, sb.a, sb.b);
        if (o <= 2) continue;
        if (sharedRect && (G.distPointRect(sa.a, sharedRect) < 32 || G.distPointRect(sb.a, sharedRect) < 32)) continue;
        total += o;
      }
    }
  }
  return total;
}

function reduceOverlapsByLane(scene, obstacles) {
  for (let pass = 0; pass < 3; pass++) {
    let fixed = 0;
    const offenders = scene.routes
      .map((route) => ({ route, length: overlapLengthFor(route, scene) }))
      .filter((x) => x.length > 2)
      .sort((a, b) => b.length - a.length || (a.route.key < b.route.key ? -1 : 1));
    if (!offenders.length) return;
    for (const { route } of offenders) {
      const before = overlapLengthFor(route, scene);
      if (before <= 2) continue;
      for (const lane of [8, 11, 14, 17, 20]) {
        const path = visibilityRoute(route.port, route.markerPort, obstacles, route.compoundId, route.reactionId, lane);
        if (path.length < 2) continue;
        const previous = route.points;
        route.points = path;
        const after = overlapLengthFor(route, scene);
        if (after < before - 0.5) {
          fixed++;
          break;
        }
        route.points = previous;
      }
    }
    if (!fixed) return;
  }
}

/* ------------------------------------------------------------------ */
/* 成分・棚・橋                                                       */
/* ------------------------------------------------------------------ */

function fullBounds(scene, sides) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (r) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  };
  for (const c of scene.compounds) add(G.rect(c.x, c.y, G.NODE_W, G.NODE_H));
  for (const r of scene.reactions) {
    add(G.rect(r.x - 10, r.y - 10, 20, 20));
    add(r.labelBoxes.type);
    if (r.labelBoxes.cond) add(r.labelBoxes.cond);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function addIsolatedShelf(scene, source, layout) {
  const isolated = [];
  for (const c of source.compounds.values()) {
    if (!layout.positions.has(c.id)) isolated.push(c);
  }
  const regionOrder = new Map(source.map.regions.map((r, i) => [r.id, i]));
  isolated.sort((a, b) => {
    const ra = regionOrder.get(a.region);
    const rb = regionOrder.get(b.region);
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : 1;
  });
  const connectedBounds = fullBounds(scene, layout.sides);
  const refW = 1236;
  const refH = 475;
  const options = [];
  for (let cols = 6; cols <= 18; cols++) {
    const rows = Math.ceil(isolated.length / cols);
    const shelfW = cols * 152 - 16;
    const shelfH = rows * 54 - 20;
    const rightW = connectedBounds.w + OPTS.shelfGap + shelfW;
    const rightH = Math.max(connectedBounds.h, shelfH);
    const rightFit = Math.min(refW / rightW, refH / rightH);
    const bottomW = Math.max(connectedBounds.w, shelfW);
    const bottomH = connectedBounds.h + OPTS.shelfGap + shelfH;
    const bottomFit = Math.min(refW / bottomW, refH / bottomH);
    options.push({ cols, rows, shelfW, shelfH, side: 'right', fit: rightFit, w: rightW, h: rightH });
    options.push({ cols, rows, shelfW, shelfH, side: 'bottom', fit: bottomFit, w: bottomW, h: bottomH });
  }
  options.sort((a, b) => b.fit - a.fit || (a.side === 'right' ? -1 : 1) || a.cols - b.cols);
  const shelf = options[0];
  const x0 = shelf.side === 'right' ? connectedBounds.x + connectedBounds.w + OPTS.shelfGap : connectedBounds.x;
  const y0 = shelf.side === 'right' ? connectedBounds.y : connectedBounds.y + connectedBounds.h + OPTS.shelfGap;
  isolated.forEach((c, i) => {
    const col = i % shelf.cols;
    const row = Math.floor(i / shelf.cols);
    layout.positions.set(c.id, { x: x0 + col * 152 + 68, y: y0 + row * 54 + 17 });
    scene.compounds.push({ id: c.id, x: x0 + col * 152, y: y0 + row * 54, region: c.region });
  });
  return {
    shelf: { x: x0, y: y0, cols: shelf.cols, rows: shelf.rows, count: isolated.length, side: shelf.side },
    count: isolated.length
  };
}

function addBridges(scene) {
  const keys = scene.routes.map((r) => r.key).sort();
  const byKey = new Map(scene.routes.map((r) => [r.key, r]));
  const compoundById = new Map(scene.compounds.map((c) => [c.id, c]));
  let acute = 0;
  let bridged = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const A = byKey.get(keys[i]);
      const B = byKey.get(keys[j]);
      if (A.reactionId === B.reactionId) continue;
      const shared = A.compoundId === B.compoundId ? compoundById.get(A.compoundId) : null;
      const sharedRect = shared ? G.rect(shared.x, shared.y, G.NODE_W, G.NODE_H) : null;
      for (const sa of G.polylineSegments(A.points)) {
        for (const sb of G.polylineSegments(B.points)) {
          const hit = G.segSegIntersection(sa.a, sa.b, sb.a, sb.b);
          if (!hit) continue;
          if (sharedRect && G.distPointRect(hit, sharedRect) < 32) continue;
          const ax = sa.b.x - sa.a.x;
          const ay = sa.b.y - sa.a.y;
          const bx = sb.b.x - sb.a.x;
          const by = sb.b.y - sb.a.y;
          const dot = Math.abs(ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
          const angle = Math.acos(Math.min(1, dot));
          if (angle >= (25 * Math.PI) / 180) continue;
          acute++;
          const over = keys[i] > keys[j] ? A : B;
          if (!over.bridges.some((p) => Math.hypot(p.x - hit.x, p.y - hit.y) < 8)) {
            over.bridges.push({ x: Math.round(hit.x * 10) / 10, y: Math.round(hit.y * 10) / 10 });
            over.bridges.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
            bridged++;
          }
        }
      }
    }
  }
  return { acute, bridged };
}

/* ------------------------------------------------------------------ */
/* 出力                                                               */
/* ------------------------------------------------------------------ */

function planNetworkLayout() {
  const source = S.loadSource();
  const layout = layoutNetwork(source);
  const sides = chooseLabelSides(layout, source);
  layout.sides = sides;
  const obstacles = makeObstacles(source, layout, sides);
  const scene = buildScene(layout, source, sides);
  assignPorts(scene, obstacles, sides);
  const fallback = routeScene(scene, obstacles);
  reduceOverlapsByLane(scene, obstacles);
  const bridgeInfo = addBridges(scene);
  const shelf = addIsolatedShelf(scene, source, layout);

  // 全体の範囲を正規化し、キャンバスを決める
  const bounds = fullBounds(scene, sides);
  const margin = 40;
  const shiftX = margin - bounds.x;
  const shiftY = margin - bounds.y;
  for (const c of scene.compounds) { c.x += shiftX; c.y += shiftY; }
  for (const r of scene.reactions) {
    r.x += shiftX; r.y += shiftY;
    r.labelBoxes = shiftBox(r.labelBoxes, shiftX, shiftY);
  }
  for (const route of scene.routes) {
    for (const p of route.points) { p.x += shiftX; p.y += shiftY; }
    for (const p of route.bridges) { p.x += shiftX; p.y += shiftY; }
  }
  shelf.shelf.x += shiftX;
  shelf.shelf.y += shiftY;
  const canvas = {
    x: 0,
    y: 0,
    w: Math.ceil(bounds.w + margin * 2),
    h: Math.ceil(bounds.h + margin * 2)
  };

  const regionOrder = new Map(source.map.regions.map((r, i) => [r.id, i]));
  const incident = new Map();
  for (const r of source.reactions) {
    [...new Set(r.substrates.concat(r.products))].forEach((id) => incident.set(id, (incident.get(id) || 0) + 1));
  }
  const regions = source.map.regions.map((region, index) => {
    const members = [...source.compounds.values()].filter((c) => c.region === region.id);
    const connected = members.filter((c) => incident.get(c.id) > 0);
    const focusPoints = [];
    for (const c of connected.length ? connected : members) {
      const p = layout.positions.get(c.id);
      focusPoints.push(G.rect(p.x - G.NODE_W / 2 + shiftX, p.y - G.NODE_H / 2 + shiftY, G.NODE_W, G.NODE_H));
    }
    for (const r of scene.reactions) {
      if (!r.substrates.concat(r.products).some((id) => source.compounds.get(id).region === region.id)) continue;
      if (!connected.some((c) => r.substrates.concat(r.products).includes(c.id))) continue;
      focusPoints.push(G.rect(r.x - 12, r.y - 12, 24, 24));
      focusPoints.push(r.labelBoxes.type);
      if (r.labelBoxes.cond) focusPoints.push(r.labelBoxes.cond);
    }
    const pad = 30;
    const minX = Math.min(...focusPoints.map((p) => p.x)) - pad;
    const minY = Math.min(...focusPoints.map((p) => p.y)) - pad;
    const maxX = Math.max(...focusPoints.map((p) => p.x + p.w)) + pad;
    const maxY = Math.max(...focusPoints.map((p) => p.y + p.h)) + pad;
    const center = {
      x: connected.length ? connected.reduce((s, c) => s + layout.positions.get(c.id).x + shiftX, 0) / connected.length : (minX + maxX) / 2,
      y: connected.length ? connected.reduce((s, c) => s + layout.positions.get(c.id).y + shiftY, 0) / connected.length : (minY + maxY) / 2
    };
    return {
      id: region.id,
      name: region.name,
      note: region.note,
      count: members.length,
      colorIndex: index,
      focus: { x: round2(minX), y: round2(minY), w: round2(maxX - minX), h: round2(maxY - minY) },
      center: { x: round2(center.x), y: round2(center.y) },
      members: members.map((c) => c.id).sort()
    };
  });
  regions.sort((a, b) => regionOrder.get(a.id) - regionOrder.get(b.id));

  const positions = {};
  for (const c of scene.compounds) {
    positions[c.id] = { r: c.region, x: round2(c.x), y: round2(c.y) };
  }
  const reactions = {};
  for (const r of scene.reactions) {
    const type = r.labelBoxes.type;
    const cond = r.labelBoxes.cond;
    reactions[r.id] = {
      x: round2(r.x),
      y: round2(r.y),
      label: {
        side: r.labelSide,
        type: { x: round2(type.x + type.w / 2), y: round2(type.y + type.h / 2) },
        cond: cond ? { x: round2(cond.x + cond.w / 2), y: round2(cond.y + cond.h / 2) } : null
      },
      substrates: r.substrates,
      products: r.products,
      typeLabel: r.typeLabel,
      conditions: r.conditions,
      cross: r.cross
    };
  }
  const edges = {};
  for (const route of scene.routes.slice().sort((a, b) => (a.key < b.key ? -1 : 1))) {
    edges[route.key] = {
      reaction: route.reactionId,
      dir: route.dir,
      compound: route.compoundId,
      points: route.points.map((p) => [round2(p.x), round2(p.y)]),
      gaps: [],
      bridges: route.bridges.map((p) => [round2(p.x), round2(p.y)])
    };
  }
  const layoutOut = {
    version: 3,
    seed: SEED,
    nodeW: G.NODE_W,
    nodeH: G.NODE_H,
    canvas,
    shelf: shelf.shelf,
    regions,
    positions,
    reactions
  };
  const routesOut = { version: 3, seed: SEED, edges };
  const sceneOut = M.sceneFromLayout(layoutOut, routesOut);
  const report = M.measure(sceneOut);
  routesOut.stats = {
    edges: report.edges.count,
    crossings: report.edges.crossings,
    unbridgedAcute: report.edges.unbridgedAcute,
    acuteCrossings: report.edges.acuteCrossings,
    bridgedCrossings: report.edges.bridgedCrossings,
    nodePenetrations: report.edges.nodePenetrations,
    labelPenetrations: report.edges.labelPenetrations,
    markerPenetrations: report.edges.markerPenetrations,
    overlapSegments: report.edges.overlapSegments,
    clearanceViolations: report.edges.clearanceViolations,
    totalLength: report.edges.totalLength,
    bends: report.edges.bends,
    maxBends: report.edges.maxBends,
    fallback,
    bridges: bridgeInfo.bridged
  };
  return { layout: layoutOut, routes: routesOut, report, source, shelf, fallback };
}

function shiftBox(box, dx, dy) {
  const out = {
    side: box.side,
    type: { x: box.type.x + dx, y: box.type.y + dy, w: box.type.w, h: box.type.h }
  };
  out.cond = box.cond ? { x: box.cond.x + dx, y: box.cond.y + dy, w: box.cond.w, h: box.cond.h } : null;
  return out;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  planNetworkLayout,
  SEED,
  OPTS
};
