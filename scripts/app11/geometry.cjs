/**
 * 有機反応マップ（app11）— 幾何・ラベル計測の共通部品
 *
 * オフラインの配置最適化・経路探索・計測（metrics.cjs）・回帰テストで同じ計算を使う。
 * DOM・外部依存なしの純関数だけを置く。ブラウザ側（map-core.js）は経路の SVG 文字列化だけを行い、
 * ラベル幅などの近似計算はこのファイルに一本化する。
 */
'use strict';

const NODE_W = 136;
const NODE_H = 34;
const MARKER_R = 6;
const MARKER_PORT_R = 10;
const TYPE_FONT = 10;
const COND_FONT = 9;
const TYPE_DY = -17;
const COND_DY = 21;
const TYPE_H = 12;
const COND_H = 11;
const COND_MAX = 16; // 画面の反応ラベルは従来どおり 16 文字で省略する
const CLEARANCE = 4; // 無関係な辺どうしに確保する最小距離

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// 表示ラベルと同じ文字列（map-core.js の shorten と同じ規則）。
function shorten(text, max) {
  const s = String(text == null ? '' : text);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code === 0x3000
  );
}

// おおよその表示幅。CJK は 1em、欧文は 0.56em、空白は 0.35em。
function textWidth(text, size) {
  const s = String(text == null ? '' : text);
  let width = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === ' ') width += size * 0.35;
    else if (ch === '…' || ch === '・') width += size;
    else if (isWide(code)) width += size;
    else width += size * 0.56;
  }
  return width;
}

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function rectRight(r) {
  return r.x + r.w;
}

function rectBottom(r) {
  return r.y + r.h;
}

function inflate(r, d) {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

function rectsOverlap(a, b, pad) {
  const p = typeof pad === 'number' ? pad : 0;
  return !(
    a.x + a.w + p <= b.x ||
    b.x + b.w + p <= a.x ||
    a.y + a.h + p <= b.y ||
    b.y + b.h + p <= a.y
  );
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function distPointRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// 線分と矩形の交差（Liang–Barsky）。境界の接触も含む。
function segmentRect(p, q, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks = [
    [-dx, p.x - r.x],
    [dx, r.x + r.w - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.h - p.y]
  ];
  for (const [den, num] of checks) {
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function within(a, b, c, eps) {
  const e = typeof eps === 'number' ? eps : 1e-9;
  return Math.min(a, b) - e <= c && c <= Math.max(a, b) + e;
}

// 端点の接触は含めず、交差している場合だけ交点を返す。
function segSegIntersection(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  const eps = 1e-9;
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
      ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    const t = d1 / (d1 - d2);
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  }
  return null;
}

// 線分と線分の距離。交差していれば 0。
function segSegDistance(p1, p2, p3, p4) {
  if (segSegIntersection(p1, p2, p3, p4)) return 0;
  return Math.min(
    distPointSeg(p1, p3, p4),
    distPointSeg(p2, p3, p4),
    distPointSeg(p3, p1, p2),
    distPointSeg(p4, p1, p2)
  );
}

// 同一直線上で重なる長さ（交差しない平行・同一線上だけを対象）。
function collinearOverlap(a, b, c, d) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const len = Math.hypot(ux, uy);
  if (len < 1e-9) return 0;
  const nx = -uy / len;
  const ny = ux / len;
  const off = (p) => Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny);
  if (off(c) > 0.6 || off(d) > 0.6) return 0;
  const t = (p) => ((p.x - a.x) * ux + (p.y - a.y) * uy) / (len * len);
  const t0 = Math.min(t(c), t(d));
  const t1 = Math.max(t(c), t(d));
  const from = Math.max(0, t0);
  const to = Math.min(1, t1);
  return to > from ? (to - from) * len : 0;
}

function distPointSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function distPointPolyline(p, points) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distPointSeg(p, points[i], points[i + 1]));
  }
  return min;
}

function segmentKey(p, q) {
  return (p.x < q.x || (p.x === q.x && p.y <= q.y))
    ? p.x + ',' + p.y + '|' + q.x + ',' + q.y
    : q.x + ',' + q.y + '|' + p.x + ',' + p.y;
}

function polylineSegments(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    out.push({ a, b, index: i });
  }
  return out;
}

function polylineLength(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return sum;
}

function pointAlong(points, distance) {
  if (!points.length) return { x: 0, y: 0, seg: 0, t: 0 };
  let remain = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    if (remain <= len) {
      const t = remain / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, seg: i, t };
    }
    remain -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, seg: points.length - 2, t: 1 };
}

// 折れ線の曲がり数（15 度以上の向き変化を数える）。
function bendCount(points) {
  let count = 0;
  let prev = null;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const angle = Math.atan2(dy, dx);
    if (prev !== null) {
      let diff = Math.abs(angle - prev);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > (15 * Math.PI) / 180) count++;
    }
    prev = angle;
  }
  return count;
}

// 2 次ベジェを折れ線に近似（旧レイアウトの描画と同じ形を計測するため）。
function sampleQuadratic(a, c, b, steps) {
  const n = typeof steps === 'number' ? steps : 16;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    out.push({
      x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
      y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y
    });
  }
  return out;
}

function crossBend(a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.min(140, 26 + dist * 0.08);
}

// 反応ラベルの矩形（マーカー座標を基準）。描画側と同じ値。
// 反応ラベルの矩形（マーカー座標を基準）。side は N/S/E/W。
function labelLayout(markerX, markerY, typeLabel, conditions, side) {
  const typeText = String(typeLabel || '');
  const condText = shorten(conditions, COND_MAX);
  const typeW = textWidth(typeText, TYPE_FONT) + 4;
  const condW = condText ? textWidth(condText, COND_FONT) + 4 : 0;
  const blockW = Math.max(typeW, condW);
  const dx = side === 'E' ? blockW / 2 + 12 : side === 'W' ? -(blockW / 2 + 12) : 0;
  const dy = side === 'N' ? -1 : side === 'S' ? 1 : 0;
  const typeY = side === 'E' || side === 'W'
    ? markerY - 6
    : markerY + (dy < 0 ? -26 : 7);
  const condY = side === 'E' || side === 'W'
    ? markerY + 7
    : markerY + (dy < 0 ? -7 : 26);
  const typeBox = rect(markerX + dx - typeW / 2, typeY - TYPE_H / 2, typeW, TYPE_H);
  const condBox = condText
    ? rect(markerX + dx - condW / 2, condY - COND_H / 2, condW, COND_H)
    : null;
  return { side, type: typeBox, cond: condBox };
}

function labelBoxes(markerX, markerY, typeLabel, conditions) {
  const typeText = String(typeLabel || '');
  const condText = shorten(conditions, COND_MAX);
  const typeW = textWidth(typeText, TYPE_FONT) + 4;
  const condW = condText ? textWidth(condText, COND_FONT) + 4 : 0;
  const boxes = {
    type: rect(markerX - typeW / 2, markerY + TYPE_DY - TYPE_H / 2, typeW, TYPE_H)
  };
  if (condText) boxes.cond = rect(markerX - condW / 2, markerY + COND_DY - COND_H / 2, condW, COND_H);
  else boxes.cond = null;
  return boxes;
}

function markerBox(x, y) {
  return rect(x - MARKER_R, y - MARKER_R, MARKER_R * 2, MARKER_R * 2);
}

function regionTitleBox(region) {
  const name = String(region.name || '');
  const countW = textWidth(String(region.count), 11);
  const w = textWidth(name, 12) + countW + 34;
  const h = 24;
  const p = region.panel;
  return rect(p.x + p.w / 2 - w / 2, p.y + 8, w, h);
}

// 反応の端点（基質・生成物）を列挙する。
function reactionEndpointIds(reaction) {
  const ids = [];
  for (const id of reaction.substrates || []) if (!ids.includes(id)) ids.push(id);
  for (const id of reaction.products || []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

module.exports = {
  NODE_W,
  NODE_H,
  MARKER_R,
  MARKER_PORT_R,
  TYPE_FONT,
  COND_FONT,
  TYPE_DY,
  COND_DY,
  TYPE_H,
  COND_H,
  COND_MAX,
  CLEARANCE,
  clamp,
  shorten,
  textWidth,
  rect,
  rectCenter,
  rectRight,
  rectBottom,
  inflate,
  rectsOverlap,
  pointInRect,
  distPointRect,
  segmentRect,
  segSegIntersection,
  segSegDistance,
  collinearOverlap,
  distPointSeg,
  distPointPolyline,
  segmentKey,
  polylineSegments,
  polylineLength,
  pointAlong,
  bendCount,
  sampleQuadratic,
  crossBend,
  labelBoxes,
  labelLayout,
  markerBox,
  regionTitleBox,
  reactionEndpointIds
};
