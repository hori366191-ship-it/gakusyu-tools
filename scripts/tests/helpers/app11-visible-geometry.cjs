/**
 * app11 — 実 visible geometry の独立監査 helper（テスト専用・A所有）
 *
 * 実行時モジュールの測定結果を鵜呑みにせず、Core.reactionConnectors →
 * separateSharedPorts → enforcePaintClearance → routePath → samplePath(0.25) と
 * arrow triangle 塗りから、実際に描かれる線・距離・leader 接続を再構築する。
 *
 * scripts/tests/**\/*.test.cjs の自動走査対象外（require 専用）。
 * B の P162 ゲートからも read-only で再利用できる。
 */
'use strict';

const path = require('node:path');
const G = require(path.join(__dirname, '..', '..', 'app11', 'geometry.cjs'));

let Core = null;
try {
  Core = require(path.join(__dirname, '..', '..', '..', 'site', 'app11', 'map-core.js'));
} catch (error) {
  Core = null;
}

function toPoint(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
}

function segRectDistance(a, b, r) {
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

/**
 * layout/routes から実描画 paint を作る。
 * positions: {id:{x,y,w,h}}, markers:{id:{x,y}}, edges:{key:{reaction,compound,dir,tier,points}}
 */
function buildPaint(input) {
  if (!Core) throw new Error('map-core.js が読めません');
  const positions = input.positions || {};
  const markers = input.markers || {};
  const edges = input.edges || {};
  const nodeW = input.nodeW || 136;
  const nodeH = input.nodeH || 34;
  const compoundById = {};
  for (const id of Object.keys(positions)) {
    const p = positions[id];
    compoundById[id] = { id, x: p.x, y: p.y, w: p.w, h: p.h };
  }
  const byReaction = {};
  for (const key of Object.keys(edges)) {
    const e = edges[key];
    if (!Array.isArray(e.points) || e.points.length < 2) continue;
    if (!byReaction[e.reaction]) byReaction[e.reaction] = [];
    byReaction[e.reaction].push({
      dir: e.dir, id: e.compound, tier: e.tier,
      points: e.points.map(toPoint), gaps: e.gaps || [], bridges: e.bridges || []
    });
  }
  const conns = {};
  const all = [];
  for (const id of Object.keys(markers)) {
    const m = markers[id];
    const list = Core.reactionConnectors({ id, x: m.x, y: m.y, edges: byReaction[id] || [] }, {
      compoundById, nodeW, nodeH
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
        if (sp && sp.length > 1) lines[id].push(sp.map(toPoint));
      }
      if (c.arrowHead) {
        const hd = Core.arrowHeadPath(c.arrowHead);
        for (const sp of Core.samplePath(hd, 0.25) || []) {
          if (sp && sp.length > 1) lines[id].push(sp.map(toPoint));
        }
        triangles[id].push([c.arrowHead.tip, c.arrowHead.left, c.arrowHead.right]);
      }
    }
  }
  return { lines, triangles, positions, markers };
}

function SegmentGrid(paint, cell) {
  this.cell = cell || 64;
  this.grid = new Map();
  this.segments = [];
  for (const id of Object.keys(paint.lines)) {
    for (const poly of paint.lines[id]) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const index = this.segments.length;
        this.segments.push({ id, a, b });
        const cs = this.cell;
        const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x);
        const miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
        for (let cx = Math.floor(minx / cs); cx <= Math.floor(maxx / cs); cx++) {
          for (let cy = Math.floor(miny / cs); cy <= Math.floor(maxy / cs); cy++) {
            const key = cx + ',' + cy;
            let bucket = this.grid.get(key);
            if (!bucket) { bucket = []; this.grid.set(key, bucket); }
            bucket.push(index);
          }
        }
      }
    }
  }
}

SegmentGrid.prototype.near = function (box, radius, accept) {
  const found = new Map();
  const cs = this.cell;
  const seen = new Set();
  const minx = box.x - radius, maxx = box.x + box.w + radius;
  const miny = box.y - radius, maxy = box.y + box.h + radius;
  for (let cx = Math.floor(minx / cs); cx <= Math.floor(maxx / cs); cx++) {
    for (let cy = Math.floor(miny / cs); cy <= Math.floor(maxy / cs); cy++) {
      const bucket = this.grid.get(cx + ',' + cy);
      if (!bucket) continue;
      for (const index of bucket) {
        if (seen.has(index)) continue;
        seen.add(index);
        const seg = this.segments[index];
        if (accept && !accept(seg.id)) continue;
        const d = segRectDistance(seg.a, seg.b, box);
        if (d > radius) continue;
        const prev = found.get(seg.id);
        if (prev === undefined || d < prev) found.set(seg.id, d);
      }
    }
  }
  return found;
};

SegmentGrid.prototype.anyWithin = function (box, radius, accept) {
  const near = this.near(box, radius, accept);
  for (const value of near.values()) if (value <= radius + 1e-9) return true;
  return false;
};

function paintDistance(paint, id, p) {
  let best = Infinity;
  for (const poly of paint.lines[id] || []) {
    for (let i = 0; i < poly.length - 1; i++) best = Math.min(best, G.distPointSeg(p, poly[i], poly[i + 1]));
  }
  for (const tri of paint.triangles[id] || []) if (pointInTriangle(p, tri)) best = 0;
  return best;
}

/**
 * 全ラベルの own / foreign 距離を実 visible paint だけで測る。
 * own は同一 reaction の線、foreign は他 reaction の線（最大 512px まで探索）。
 */
function measureActual(paint, labels, grid) {
  const g = grid || new SegmentGrid(paint, 64);
  const out = {};
  for (const id of Object.keys(labels)) {
    const box = labels[id].box;
    if (!box) continue;
    let own = Infinity;
    for (const radius of [24, 64, 160, 320, 512]) {
      const near = g.near(box, radius, (rid) => rid === id);
      if (near.has(id)) { own = near.get(id); break; }
      if (radius === 512) own = Infinity;
    }
    let foreign = Infinity;
    let foreignId = null;
    const radius = Number.isFinite(own) ? Math.min(512, own + 1.5) : 512;
    const nearForeign = g.near(box, radius, (rid) => rid !== id);
    for (const [rid, value] of nearForeign.entries()) {
      if (value < foreign) { foreign = value; foreignId = rid; }
    }
    out[id] = {
      ownerDistance: own === Infinity ? null : own,
      foreignDistance: foreign === Infinity ? null : foreign,
      foreignId: foreignId
    };
  }
  return out;
}

/** leader が実際の paint に接続し、他要素と交差しないか。 */
function validateLeader(paint, labels, layout, id) {
  const label = labels[id];
  if (!label || !Array.isArray(label.leader) || label.leader.length < 2) return { valid: false, reason: 'no-leader' };
  const pts = label.leader.map(toPoint);
  const box = label.box;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  if (length <= 0.5 || length > 80 + 1e-6) return { valid: false, reason: 'length' };
  const start = pts[0];
  const boundary = Math.min(
    G.distPointSeg(start, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }),
    G.distPointSeg(start, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }),
    G.distPointSeg(start, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }),
    G.distPointSeg(start, { x: box.x, y: box.y + box.h }, { x: box.x, y: box.y })
  );
  if (boundary > 0.8) return { valid: false, reason: 'start' };
  const end = pts[pts.length - 1];
  if (paintDistance(paint, id, end) > 0.7) return { valid: false, reason: 'end' };

  const grid = new SegmentGrid(paint, 64);
  const otherLabels = [];
  const otherLeaders = [];
  for (const other of Object.keys(labels)) {
    if (other === id) continue;
    if (labels[other].box) otherLabels.push(labels[other]);
    if (Array.isArray(labels[other].leader) && labels[other].leader.length > 1) {
      otherLeaders.push(labels[other].leader.map(toPoint));
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const sb = {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)
    };
    if (grid.anyWithin(sb, 0.4, (rid) => rid !== id)) return { valid: false, reason: 'foreign' };
    for (const nid of Object.keys(layout.positions)) {
      const n = layout.positions[nid];
      if (G.segmentRect(a, b, { x: n.x, y: n.y, w: n.w, h: n.h })) return { valid: false, reason: 'node' };
    }
    for (const other of otherLabels) {
      if (G.segmentRect(a, b, other.box)) return { valid: false, reason: 'label' };
    }
    for (const ol of otherLeaders) {
      for (let k = 0; k < ol.length - 1; k++) {
        if (G.segSegDistance(a, b, ol[k], ol[k + 1]) < 0.4) return { valid: false, reason: 'leader' };
      }
    }
  }
  return { valid: true, length: length };
}

/** ラベル群のゲート判定（strict margin は補助分類で fail にしない）。 */
function gate(paint, labels, layout, options) {
  const opts = options || {};
  const meta = opts.reactionMeta || {};
  const nameOf = (id) => {
    if (typeof opts.typeLabelOf === 'function') return opts.typeLabelOf(id);
    const entry = meta[id];
    return entry ? (entry.typeLabel || entry.type || '') : '';
  };
  const normalizeName = (value) => String(value == null ? '' : value).replace(/\s+/g, '').trim();
  const grid = new SegmentGrid(paint, 64);
  const measured = measureActual(paint, labels, grid);
  const invalidLeaders = [];
  const valid = {};
  for (const id of Object.keys(labels)) {
    if (!Array.isArray(labels[id].leader) || labels[id].leader.length < 2) continue;
    const check = validateLeader(paint, labels, layout, id);
    valid[id] = check.valid;
    if (!check.valid) invalidLeaders.push({ id, reason: check.reason });
  }
  const inversionDifferentNameNoLeader = [];
  const sameNameNearer = [];
  const farNoLeader = [];
  const strictMarginOnly = [];
  for (const id of Object.keys(measured)) {
    const m = measured[id];
    if (m.ownerDistance == null || m.foreignDistance == null) continue;
    const hasValidLeader = !!valid[id];
    const inversion = m.ownerDistance > m.foreignDistance + 0.25;
    const sameName = m.foreignId
      ? normalizeName(nameOf(id)) !== '' && normalizeName(nameOf(id)) === normalizeName(nameOf(m.foreignId))
      : false;
    if (inversion && !hasValidLeader) {
      if (sameName) sameNameNearer.push({ id, own: m.ownerDistance, foreign: m.foreignDistance, foreignId: m.foreignId });
      else inversionDifferentNameNoLeader.push({ id, own: m.ownerDistance, foreign: m.foreignDistance, foreignId: m.foreignId });
    }
    if (m.ownerDistance >= 25 && !hasValidLeader) {
      farNoLeader.push({ id, own: m.ownerDistance, foreign: m.foreignDistance, foreignId: m.foreignId });
    }
    if (!inversion && m.ownerDistance <= 12 && m.ownerDistance < m.foreignDistance && m.foreignDistance - m.ownerDistance < 8) {
      strictMarginOnly.push(id);
    }
  }
  return {
    measured,
    invalidLeaders,
    inversionDifferentNameNoLeader,
    sameNameNearer,
    farNoLeader,
    strictMarginOnly,
    counts: {
      labels: Object.keys(measured).length,
      invalidLeaders: invalidLeaders.length,
      inversionDifferentNameNoLeader: inversionDifferentNameNoLeader.length,
      sameNameNearer: sameNameNearer.length,
      farNoLeader: farNoLeader.length,
      strictMarginOnly: strictMarginOnly.length
    }
  };
}

module.exports = {
  buildPaint,
  SegmentGrid,
  measureActual,
  validateLeader,
  gate,
  paintDistance,
  pointInTriangle
};
