/**
 * 有機反応マップ（app11）— アカデミック表示の実描画（paint）ジオメトリ
 *
 * site/app11/map-core.js の描画パイプライン（reactionConnectors →
 * separateSharedPorts → enforcePaintClearance → routePath → samplePath）と
 * 矢印の塗りから、実際に画面へ出る線分を作る。
 *
 * 用途: 交差低減で辺を差し替えたとき、ラベルの leader（引き出し線）の終点を
 * 実描画線へ合わせ直し、実描画で検証するため。テスト専用 helper とは独立で、
 * 同じ Core API を呼ぶだけ（build から使える）。
 *
 * すべて固定入力・固定順序。外部依存は site/app11/map-core.js のみ。
 */
'use strict';

const path = require('node:path');

let Core = null;
try {
  Core = require(path.join(__dirname, '..', '..', 'site', 'app11', 'map-core.js'));
} catch (error) {
  Core = null;
}

function toPoint(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
}

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
    compoundById[id] = { id: id, x: p.x, y: p.y, w: p.w, h: p.h };
  }
  const byReaction = {};
  for (const key of Object.keys(edges)) {
    const e = edges[key];
    if (!Array.isArray(e.points) || e.points.length < 2) continue;
    if (!byReaction[e.reaction]) byReaction[e.reaction] = [];
    byReaction[e.reaction].push({
      dir: e.dir,
      id: e.compound,
      tier: e.tier,
      points: e.points.map(toPoint),
      gaps: e.gaps || [],
      bridges: e.bridges || []
    });
  }
  const conns = {};
  const all = [];
  for (const id of Object.keys(markers)) {
    const m = markers[id];
    const list = Core.reactionConnectors({ id: id, x: m.x, y: m.y, edges: byReaction[id] || [] }, {
      compoundById: compoundById,
      nodeW: nodeW,
      nodeH: nodeH
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
      const drawn = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
      for (const sp of Core.samplePath(drawn, 0.25) || []) {
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
  return { lines: lines, triangles: triangles, positions: positions, markers: markers };
}

function distSegRect(a, b, r) {
  if (segmentsCrossRect(a, b, r)) return 0;
  let d = Math.min(distPointBox(a, r), distPointBox(b, r));
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h }
  ];
  for (const c of corners) d = Math.min(d, pointSegDistance(c, a, b));
  return d;
}
function closestOnPolylines(polylines, p) {
  let best = null;
  let bestDist = Infinity;
  for (const poly of polylines) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestDist) { bestDist = d; best = q; }
    }
  }
  return best ? { point: best, distance: bestDist } : null;
}

function boxCenter(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function boundaryToward(box, point) {
  const center = boxCenter(box);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return center;
  const tx = Math.abs(dx) > 1e-9 ? (box.w / 2) / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-9 ? (box.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: center.x + dx * t, y: center.y + dy * t };
}

function distPointBox(p, box) {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

function segSegDistance(a, b, c, d) {
  // 交差していれば 0、そうでなければ端点-線分距離の最小。
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegDistance(a, c, d), pointSegDistance(b, c, d),
    pointSegDistance(c, a, b), pointSegDistance(d, a, b));
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointSegDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * 実描画線に沿った leader を 1 本作る。
 * @returns {{leader:[[number,number],[number,number]]|null, reason:string|null}}
 */
function buildLeader(paint, id, label) {
  const box = label && label.box;
  if (!box) return { leader: null, reason: 'no-box' };
  const nearest = closestOnPolylines(paint.lines[id] || [], boxCenter(box));
  if (!nearest) return { leader: null, reason: 'no-own-line' };
  const start = boundaryToward(box, nearest.point);
  const leader = [
    [Math.round(start.x * 100) / 100, Math.round(start.y * 100) / 100],
    [Math.round(nearest.point.x * 100) / 100, Math.round(nearest.point.y * 100) / 100]
  ];
  return { leader: leader, reason: null };
}

/**
 * 実描画線に沿った leader 候補を、箱の中心に近い順に返す。
 * @returns {Array<[[number,number],[number,number]]>}
 */
function leaderCandidates(paint, id, label, limit) {
  const box = label && label.box;
  if (!box) return [];
  const center = boxCenter(box);
  const samples = [];
  const seen = new Set();
  for (const poly of paint.lines[id] || []) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.min(40, Math.ceil(len / 6)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const key = Math.round(q.x * 2) + ',' + Math.round(q.y * 2);
        if (seen.has(key)) continue;
        seen.add(key);
        samples.push({ point: q, distance: Math.hypot(q.x - center.x, q.y - center.y) });
      }
    }
  }
  samples.sort((p, q) => p.distance - q.distance || (p.point.x - q.point.x) || (p.point.y - q.point.y));
  const out = [];
  const max = limit == null ? 60 : limit;
  for (const sample of samples.slice(0, max)) {
    const start = boundaryToward(box, sample.point);
    out.push([
      [Math.round(start.x * 100) / 100, Math.round(start.y * 100) / 100],
      [Math.round(sample.point.x * 100) / 100, Math.round(sample.point.y * 100) / 100]
    ]);
  }
  return out;
}

/**
 * leader の実描画検証（Core paint 基準）。
 * 始点は自分の箱の境界、終点は自分の実描画線、長さ ≤80、
 * 他反応の線・ノード・他ラベル・他 leader・他マーカーを横切らない。
 */
function validateLeader(input) {
  const paint = input.paint;
  const id = input.id;
  const label = input.label;
  const leader = label && label.leader;
  if (!Array.isArray(leader) || leader.length < 2) return { valid: false, reason: 'no-leader' };
  const pts = leader.map((p) => ({ x: p[0], y: p[1] }));
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  if (length <= 0.5 || length > 80 + 1e-6) return { valid: false, reason: 'length' };
  const box = label.box;
  const start = pts[0];
  let boundary = Infinity;
  const edges = [
    [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }],
    [{ x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }],
    [{ x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }],
    [{ x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }]
  ];
  for (const [a, b] of edges) boundary = Math.min(boundary, pointSegDistance(start, a, b));
  if (boundary > 0.8) return { valid: false, reason: 'start' };
  const end = pts[pts.length - 1];
  if (paintDistance(paint, id, end) > 0.7) return { valid: false, reason: 'end' };

  const labels = input.labels || {};
  const positions = input.positions || {};
  const foreignSegments = [];
  for (const rid of Object.keys(paint.lines)) {
    if (rid === id) continue;
    for (const poly of paint.lines[rid]) {
      for (let k = 0; k < poly.length - 1; k++) foreignSegments.push({ a: poly[k], b: poly[k + 1] });
    }
  }
  const otherLabels = [];
  const otherLeaders = [];
  for (const other of Object.keys(labels)) {
    if (other === id) continue;
    if (labels[other].box) otherLabels.push(labels[other]);
    const ol = labels[other].leader;
    if (Array.isArray(ol) && ol.length > 1) otherLeaders.push(ol.map((q) => ({ x: q[0], y: q[1] })));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const sb = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y)
    };
    for (const seg of foreignSegments) {
      if (distSegRect(seg.a, seg.b, sb) <= 0.4) return { valid: false, reason: 'foreign' };
    }
    for (const nid of Object.keys(positions)) {
      const n = positions[nid];
      if (segmentsCrossRect(a, b, n)) return { valid: false, reason: 'node' };
    }
    for (const other of otherLabels) {
      if (segmentsCrossRect(a, b, other.box)) return { valid: false, reason: 'label' };
    }
    for (const ol of otherLeaders) {
      for (let k = 0; k < ol.length - 1; k++) {
        if (segSegDistance(a, b, ol[k], ol[k + 1]) < 0.4) return { valid: false, reason: 'leader' };
      }
    }
  }
  return { valid: true, length: length };
}

function paintDistance(paint, id, p) {
  let best = Infinity;
  for (const poly of paint.lines[id] || []) {
    for (let i = 0; i < poly.length - 1; i++) best = Math.min(best, pointSegDistance(p, poly[i], poly[i + 1]));
  }
  for (const tri of paint.triangles[id] || []) {
    if (pointInTriangle(p, tri)) best = 0;
  }
  return best;
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
function segmentsCrossRect(a, b, rect) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ];
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    const d = corners[(i + 1) % 4];
    if (segSegDistance(a, b, c, d) <= 0.0001) return true;
  }
  return false;
}

module.exports = {
  buildPaint,
  buildLeader,
  leaderCandidates,
  validateLeader,
  closestOnPolylines,
  boxCenter,
  boundaryToward
};
