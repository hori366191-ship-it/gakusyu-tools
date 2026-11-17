/**
 * 有機反応マップ（app11）— 通常配置案（normal-proposed）の geometry generator
 *
 * 通常 427 物質・162 反応・375 辺を「一から」決定的に配置する。旧 layout.json /
 * routes.json の座標は読まない（比較は生成側が metrics.cjs で行う）。乱数・時刻は使わない。
 *
 * 出力（build の返り値）は proposal-contract.cjs の kind: 'normal-proposed' 契約に沿う:
 *   positions / markers / routes / canvas / regionFocus / stats / warnings
 *
 * 手順:
 *   1. 物質ノードを、反応ハブ（端点重心）へのばねと反発で決定的に配置する。
 *      初期値は「分野ごとの格子」だけで、旧座標は使わない。
 *   2. 反応マーカーを端点重心へ置き、物質・他マーカー・一般図と衝突しない位置へ
 *      決定的な螺旋探索で逃がす。
 *   3. 反応ラベルは reaction-label-layout.cjs（A 担当）を最終パスで使う。
 *   4. 全 375 辺を、ノード・ラベル・他マーカーを避けて配線する（直線優先、必要時のみ格子探索）。
 *   5. 交差数が減る範囲でマーカーを局所移動し、ラベル→配線をやり直す。
 *   6. 自己計測（既存 metrics.cjs と同じ定義）で hard 0 を確認し、stats に入れる。
 *
 * 座標は 1/100 px に丸める。未配線・衝突が残る場合は例外（fail-closed）。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');
const LabelRouteRepair = require('./label-route-repair.cjs');
const LabelQuality = require('./label-quality.cjs');

let LabelSolver = null;
try {
  LabelSolver = require('./reaction-label-layout.cjs');
} catch (err) {
  LabelSolver = null;
}

const NODE_W = 136;
const NODE_H = 34;
const MARKER_R = 6;
const TYPE_H = G.TYPE_H;
const NODE_GAP = 28;
const MARKER_MIN_DIST = 40; // metrics の MARKER_MIN_DIST=22 より少し広い
const MARKER_NODE_CLEAR = 12; // marker 中心と物質矩形の最小距離（hard は 8）
const PORT_STUB = 16;
const ROUTE_NODE_PAD = 2;
const ROUTE_LABEL_PAD = 1;
const LABEL_PAD = 4;

// ネットワーク領域。一般図（x>=4170, y>=1600）と重ならない。
const NET = { x0: 40, y0: 40, x1: 4080, y1: 4000 };
// 未接続 269 の棚。一般図の上（y<1500）に置き、一般図とは重ねない。
const SHELF = { x: 4210, y: 40, cols: 12, pitchX: 152, pitchY: 60 };

const SIDES = ['right', 'left', 'bottom', 'top'];

function round2(v) {
  return Math.round(v * 100) / 100;
}

function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rectOf(p) {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

function inflate(r, d) {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

function labelWidth(text) {
  return Math.ceil(G.textWidth(text, G.TYPE_FONT) * 1.4) + 8;
}

function centerOf(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

/* ------------------------------------------------------------------ *
 * 1. ノード配置（決定的な力配置）
 * ------------------------------------------------------------------ */

function componentIndexOf(compounds, reactions) {
  const parent = new Map();
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  compounds.forEach((c) => parent.set(c.id, c.id));
  reactions.forEach((r) => {
    const all = r.substrates.concat(r.products);
    for (let i = 1; i < all.length; i++) {
      const a = find(all[0]);
      const b = find(all[i]);
      if (a !== b) parent.set(a, b);
    }
  });
  const map = new Map();
  compounds.forEach((c) => map.set(c.id, find(c.id)));
  return map;
}

function seedPositions(compounds, componentOf, order, salt) {
  const byRegion = (a, b) => (a.regionIndex - b.regionIndex) ||
    (componentOf.get(a.id) < componentOf.get(b.id) ? -1 : componentOf.get(a.id) > componentOf.get(b.id) ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byComponent = (a, b) => {
    const ca = componentOf.get(a.id);
    const cb = componentOf.get(b.id);
    const size = componentSize.get(ca) - componentSize.get(cb);
    if (size !== 0) return -size;
    if (ca !== cb) return ca < cb ? -1 : 1;
    return (a.regionIndex - b.regionIndex) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  const componentSize = new Map();
  compounds.forEach((c) => {
    const key = componentOf.get(c.id);
    componentSize.set(key, (componentSize.get(key) || 0) + 1);
  });
  const ordered = compounds.slice().sort(order === 'component' ? byComponent : byRegion);
  const pos = new Map();
  const cols = 12;
  const pitchX = 230;
  const pitchY = 92;
  const width = (cols - 1) * pitchX;
  const height = (Math.ceil(ordered.length / cols) - 1) * pitchY;
  const x0 = (NET.x0 + NET.x1) / 2 - width / 2;
  const y0 = (NET.y0 + NET.y1) / 2 - height / 2;
  ordered.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const saltText = salt == null ? '' : String(salt);
    const jitterAngle = (hash32(c.id + saltText) % 628) / 100;
    const jitterRadius = 18 + (hash32(c.id + '|r' + saltText) % 46);
    pos.set(c.id, {
      x: x0 + col * pitchX + Math.cos(jitterAngle) * jitterRadius,
      y: y0 + row * pitchY + Math.sin(jitterAngle) * jitterRadius
    });
  });
  return pos;
}

function forceLayout(compounds, reactions, iterations, tuning) {
  const tune = tuning || {};
  const NODE_RADIUS = tune.nodeRadius == null ? 80 : tune.nodeRadius;
  const REST = tune.rest == null ? 72 : tune.rest;
  const REACT_K = tune.reactK == null ? 0.048 : tune.reactK;
  const REPULSE = tune.repulse == null ? 0.062 : tune.repulse;
  const REGION_GRAVITY = tune.regionGravity == null ? 0.0006 : tune.regionGravity;
  const CENTER_GRAVITY = tune.centerGravity == null ? 0.0012 : tune.centerGravity;
  const componentOf = componentIndexOf(compounds, reactions);
  const pos = seedPositions(compounds, componentOf, tune.seedOrder || 'component',
    tune.seedSalt == null ? 'd' : tune.seedSalt);
  const ids = compounds.map((c) => c.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  ids.forEach((id, i) => { px[i] = pos.get(id).x; py[i] = pos.get(id).y; });

  // 反応の端点 index
  const reactionEnds = reactions.map((r) => r.substrates.concat(r.products).map((id) => index.get(id)));
  const nodeReactions = ids.map(() => []);
  reactions.forEach((r, ri) => {
    r.substrates.concat(r.products).forEach((id) => nodeReactions[index.get(id)].push(ri));
  });
  const regionIndex = new Map(compounds.map((c) => [c.id, c.regionIndex == null ? 999 : c.regionIndex]));

  const cellSize = 220;
  const iterationsCount = iterations || 640;
  for (let step = 0; step < iterationsCount; step++) {
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);

    // 反発（空間ハッシュ）。
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const bx = Math.floor(px[i] / cellSize);
      const by = Math.floor(py[i] / cellSize);
      const key = bx + ',' + by;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(i);
    }
    for (let i = 0; i < n; i++) {
      const bx = Math.floor(px[i] / cellSize);
      const by = Math.floor(py[i] / cellSize);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get((bx + ox) + ',' + (by + oy));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j <= i) continue;
            let ddx = px[i] - px[j];
            let ddy = py[i] - py[j];
            const dist = Math.hypot(ddx, ddy);
            if (dist < 1e-6) {
              const s = hash32(ids[i] + '|' + ids[j]) % 628 / 100;
              ddx = Math.cos(s);
              ddy = Math.sin(s);
            }
            const d = Math.max(1e-3, Math.hypot(ddx, ddy));
            const min = NODE_RADIUS * 2;
            if (d < min * 1.7) {
              const push = (min * 1.7 - d) * REPULSE;
              const ux = ddx / d;
              const uy = ddy / d;
              dx[i] += ux * push;
              dy[i] += uy * push;
              dx[j] -= ux * push;
              dy[j] -= uy * push;
            }
          }
        }
      }
    }

    // 反応ハブ（端点重心）へのばね。
    for (let ri = 0; ri < reactions.length; ri++) {
      const ends = reactionEnds[ri];
      let cx = 0;
      let cy = 0;
      for (let e = 0; e < ends.length; e++) { cx += px[ends[e]]; cy += py[ends[e]]; }
      cx /= ends.length;
      cy /= ends.length;
      for (let e = 0; e < ends.length; e++) {
        const i = ends[e];
        const ddx = cx - px[i];
        const ddy = cy - py[i];
        const dist = Math.hypot(ddx, ddy);
        if (dist < 1e-6) continue;
        const f = Math.max(-3.6, Math.min(3.6, (dist - REST) * REACT_K));
        dx[i] += (ddx / dist) * f;
        dy[i] += (ddy / dist) * f;
      }
    }

    // 分野 center（弱い保持）と全体 center。
    const regionSum = new Map();
    for (let i = 0; i < n; i++) {
      const ri = regionIndex.get(ids[i]);
      const entry = regionSum.get(ri) || { x: 0, y: 0, c: 0 };
      entry.x += px[i]; entry.y += py[i]; entry.c++;
      regionSum.set(ri, entry);
    }
    const center = { x: (NET.x0 + NET.x1) / 2, y: (NET.y0 + NET.y1) / 2 };
    for (let i = 0; i < n; i++) {
      const entry = regionSum.get(regionIndex.get(ids[i]));
      dx[i] += (entry.x / entry.c - px[i]) * REGION_GRAVITY;
      dy[i] += (entry.y / entry.c - py[i]) * REGION_GRAVITY;
      dx[i] += (center.x - px[i]) * CENTER_GRAVITY;
      dy[i] += (center.y - py[i]) * CENTER_GRAVITY;
    }

    const speed = 1 - step / (iterationsCount * 1.3);
    const cap = 14 * speed + 1.2;
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(dx[i], dy[i]);
      const scale = len > cap ? cap / len : 1;
      px[i] = G.clamp(px[i] + dx[i] * scale, NET.x0 + 80, NET.x1 - 80);
      py[i] = G.clamp(py[i] + dy[i] * scale, NET.y0 + 30, NET.y1 - 30);
    }
  }

  const out = new Map();
  ids.forEach((id, i) => out.set(id, { x: px[i], y: py[i] }));
  return { pos: out, componentOf: componentOf };
}

// 物質矩形の非重複化（中心座標で扱う）。
function separateNodes(compounds, pos, gap) {
  const NODE_GAP_VALUE = gap == null ? NODE_GAP : gap;
  const items = compounds.map((c) => ({
    id: c.id,
    w: c.w || NODE_W,
    h: c.h || NODE_H,
    x: pos.get(c.id).x,
    y: pos.get(c.id).y
  }));
  for (let iter = 0; iter < 140; iter++) {
    let moved = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const overlapX = (a.w + b.w) / 2 + NODE_GAP_VALUE - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 + NODE_GAP_VALUE - Math.abs(a.y - b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved++;
        if (overlapY <= overlapX) {
          const dir = a.y <= b.y ? -1 : 1;
          const push = overlapY / 2 + 0.05;
          a.y += dir * push;
          b.y -= dir * push;
        } else {
          const dir = a.x <= b.x ? -1 : 1;
          const push = overlapX / 2 + 0.05;
          a.x += dir * push;
          b.x -= dir * push;
        }
      }
    }
    items.forEach((it) => {
      it.x = G.clamp(it.x, NET.x0 + it.w / 2, NET.x1 - it.w / 2);
      it.y = G.clamp(it.y, NET.y0 + it.h / 2, NET.y1 - it.h / 2);
    });
    if (!moved) break;
  }
  const out = new Map();
  items.forEach((it) => out.set(it.id, { x: it.x, y: it.y, w: it.w, h: it.h }));
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. 障害物インデックス
 * ------------------------------------------------------------------ */

function RectGrid(cellSize) {
  this.cell = cellSize || 128;
  this.grid = new Map();
  this.rects = [];
}

RectGrid.prototype.add = function (rect, id) {
  this.rects.push({ rect: rect, id: id });
  const x0 = Math.floor(rect.x / this.cell);
  const x1 = Math.floor((rect.x + rect.w) / this.cell);
  const y0 = Math.floor(rect.y / this.cell);
  const y1 = Math.floor((rect.y + rect.h) / this.cell);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const key = cx + ',' + cy;
      let bucket = this.grid.get(key);
      if (!bucket) { bucket = []; this.grid.set(key, bucket); }
      bucket.push({ rect: rect, id: id });
    }
  }
};

RectGrid.prototype.hitSegment = function (a, b, pad) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const x0 = Math.floor((minX - pad) / this.cell);
  const x1 = Math.floor((maxX + pad) / this.cell);
  const y0 = Math.floor((minY - pad) / this.cell);
  const y1 = Math.floor((maxY + pad) / this.cell);
  const seen = new Set();
  const hits = [];
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = this.grid.get(cx + ',' + cy);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        if (G.segmentRect(a, b, inflate(entry.rect, pad))) hits.push(entry);
      }
    }
  }
  return hits;
};

RectGrid.prototype.nearPoint = function (p, radius) {
  const x0 = Math.floor((p.x - radius) / this.cell);
  const x1 = Math.floor((p.x + radius) / this.cell);
  const y0 = Math.floor((p.y - radius) / this.cell);
  const y1 = Math.floor((p.y + radius) / this.cell);
  const seen = new Set();
  const hits = [];
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = this.grid.get(cx + ',' + cy);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        if (G.distPointRect(p, entry.rect) <= radius) hits.push(entry);
      }
    }
  }
  return hits;
};

function rectGridOf(list) {
  const grid = new RectGrid(128);
  list.forEach((item) => grid.add(item.rect || item, item.id));
  return grid;
}

/* ------------------------------------------------------------------ *
 * 3. マーカー配置
 * ------------------------------------------------------------------ */

function markerSpiral(index, baseAngle) {
  const radii = [0, 12, 20, 30, 42, 56, 72, 90, 110, 134, 162, 194, 232, 276, 326, 384, 450];
  if (index === 0) return { radius: 0, angle: 0 };
  const k = index - 1;
  const ring = Math.floor(k / 16) + 1;
  const ai = k % 16;
  if (ring >= radii.length) return null;
  return { radius: radii[ring], angle: baseAngle + (ai / 16) * Math.PI * 2 };
}

function placeMarkers(reactions, nodeRects, classRects) {
  const nodeGrid = rectGridOf(nodeRects);
  const classGrid = rectGridOf(classRects);
  const nodeById = new Map(nodeRects.map((item) => [item.id, item.rect]));
  const markers = {};
  const placed = [];
  const centroid = new Map();
  const ordered = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  ordered.forEach((reaction) => {
    const ends = reaction.substrates.concat(reaction.products);
    let sx = 0;
    let sy = 0;
    ends.forEach((id) => {
      const p = nodeById.get(id);
      sx += p.x + p.w / 2;
      sy += p.y + p.h / 2;
    });
    const base = { x: sx / ends.length, y: sy / ends.length };
    centroid.set(reaction.id, base);
    const baseAngle = (hash32(reaction.id) % 628) / 100;

    const isFree = (p) => {
      if (p.x < NET.x0 + 14 || p.x > NET.x1 - 14 || p.y < NET.y0 + 14 || p.y > NET.y1 - 14) return false;
      for (const hit of nodeGrid.nearPoint(p, MARKER_R + MARKER_NODE_CLEAR)) {
        if (G.distPointRect(p, hit.rect) < MARKER_R + MARKER_NODE_CLEAR) return false;
      }
      for (const hit of classGrid.nearPoint(p, MARKER_R + 8)) {
        if (G.distPointRect(p, hit.rect) < MARKER_R + 8) return false;
      }
      for (const item of placed) {
        if (Math.hypot(p.x - item.x, p.y - item.y) < MARKER_MIN_DIST) return false;
      }
      return true;
    };
    // 直線で全端点から届く位置を優先する（折れ線・交差を増やさない）。
    const lineOfSight = (p) => {
      const ends = reaction.substrates.concat(reaction.products);
      for (const id of ends) {
        const rect = nodeById.get(id);
        const port = portFor(rect, p);
        const a = { x: port.point.x, y: port.point.y };
        for (const hit of nodeGrid.hitSegment(a, p, ROUTE_NODE_PAD)) {
          if (hit.id === id) continue;
          if (G.segmentRect(a, p, G.inflate(hit.rect, ROUTE_NODE_PAD))) return false;
        }
      }
      return true;
    };

    let chosen = null;
    let fallback = null;
    for (let i = 0; i < 400; i++) {
      const spec = markerSpiral(i, baseAngle);
      if (!spec) break;
      const p = spec.radius === 0 ? base : {
        x: base.x + Math.cos(spec.angle) * spec.radius,
        y: base.y + Math.sin(spec.angle) * spec.radius
      };
      if (!isFree(p)) continue;
      if (!fallback) fallback = p;
      if (!lineOfSight(p)) continue;
      chosen = p;
      break;
    }
    if (!chosen) chosen = fallback;
    if (!chosen) {
      // 領域内を粗く走査する最終候補（決定的）。
      for (let gy = NET.y0 + 20; gy <= NET.y1 - 20 && !chosen; gy += 24) {
        for (let gx = NET.x0 + 20; gx <= NET.x1 - 20; gx += 24) {
          const p = { x: gx, y: gy };
          if (isFree(p)) { chosen = p; break; }
        }
      }
    }
    if (!chosen) throw new Error('通常配置案: マーカーの空き位置がない: ' + reaction.id);
    markers[reaction.id] = { x: round2(chosen.x), y: round2(chosen.y) };
    placed.push(chosen);
  });

  return { markers: markers, centroid: centroid };
}

let nodeRectsById = null;

/* ------------------------------------------------------------------ *
 * 3c. ラベルの線回避（A ソルバと同じ「線から 4px」を自前の後処理でも守る）
 * ------------------------------------------------------------------ */

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

function makeLineIndex(routes) {
  const cell = 48;
  const grid = new Map();
  const segs = [];
  Object.keys(routes).forEach((key) => {
    const pts = routes[key].points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      const index = segs.length;
      segs.push({ a: a, b: b });
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
        for (let cy = Math.floor(minY / cell); cy <= Math.floor(maxY / cell); cy++) {
          const k = cx + ',' + cy;
          let bucket = grid.get(k);
          if (!bucket) { bucket = []; grid.set(k, bucket); }
          bucket.push(index);
        }
      }
    }
  });
  return {
    anyWithin: function (box, radius) {
      const minX = box.x - radius;
      const maxX = box.x + box.w + radius;
      const minY = box.y - radius;
      const maxY = box.y + box.h + radius;
      const seen = new Set();
      for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
        for (let cy = Math.floor(minY / cell); cy <= Math.floor(maxY / cell); cy++) {
          const bucket = grid.get(cx + ',' + cy);
          if (!bucket) continue;
          for (const index of bucket) {
            if (seen.has(index)) continue;
            seen.add(index);
            if (segRectDistance(segs[index].a, segs[index].b, G.inflate(box, radius)) <= 0.01) return true;
          }
        }
      }
      return false;
    }
  };
}

let currentLineIndex = null;

/* ------------------------------------------------------------------ *
 * 3b. 配線不能なマーカーの局所移動（決定的）
 * ------------------------------------------------------------------ */

function repairMarkers(reactions, markers, classRects) {
  const nodeList = Array.from(nodeRectsById.entries()).map((entry) => ({ id: entry[0], rect: entry[1].rect }));
  const nodeGrid = rectGridOf(nodeList);
  const classGrid = rectGridOf(classRects);
  const reactionById = new Map(reactions.map((r) => [r.id, r]));
  let routes = null;
  for (let pass = 0; pass < 5; pass++) {
    const built = buildRoutesFor(reactions, markers, null);
    routes = built.routes;
    if (!built.failures.length) return routes;
    const byReaction = new Map();
    built.failures.forEach((key) => {
      const rid = key.split('|')[0];
      byReaction.set(rid, (byReaction.get(rid) || 0) + 1);
    });
    const ids = Array.from(byReaction.keys()).sort();
    let movedAny = false;
    for (const rid of ids) {
      const reaction = reactionById.get(rid);
      const ends = reaction.substrates.concat(reaction.products);
      let sx = 0;
      let sy = 0;
      ends.forEach((id) => {
        const p = nodeRectsById.get(id).rect;
        sx += p.x + p.w / 2;
        sy += p.y + p.h / 2;
      });
      const base = { x: sx / ends.length, y: sy / ends.length };
      const baseAngle = (hash32(rid) % 628) / 100;
      let fixed = false;
      let fallbackCandidate = null;
      for (let i = 0; i < 400 && !fixed; i++) {
        const spec = markerSpiral(i, baseAngle);
        if (!spec) break;
        const candidate = spec.radius === 0 ? base : {
          x: base.x + Math.cos(spec.angle) * spec.radius,
          y: base.y + Math.sin(spec.angle) * spec.radius
        };
        const p = { x: round2(candidate.x), y: round2(candidate.y) };
        if (!markerFreeFor(p, rid, markers, nodeGrid, classGrid)) continue;
        const attempt = buildRoutesFor([reaction], Object.assign({}, markers, { [rid]: p }), new Set([rid]));
        if (attempt.failures.length) continue;
        const extra = extraPoints(attempt.routes);
        if (extra === 0) {
          markers[rid] = p;
          fixed = true;
          movedAny = true;
          break;
        }
        if (!fallbackCandidate || extra < fallbackCandidate.extra) {
          fallbackCandidate = { p: p, extra: extra };
        }
      }
      if (!fixed && fallbackCandidate) {
        markers[rid] = fallbackCandidate.p;
        movedAny = true;
      }
    }
    if (!movedAny) break;
  }
  const built = buildRoutesFor(reactions, markers, null);
  if (built.failures.length) {
    throw new Error('通常配置案: 未配線 ' + built.failures.length + ' 件: ' +
      built.failures.slice(0, 6).join(', '));
  }
  return built.routes;
}

function fillMissingLabels(labels, reactions, markers, routes) {
  const filled = [];
  const placed = Object.keys(labels).map((id) => ({ id: id, box: labels[id].box }));
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  const free = (box, ownId) => {
    if (box.x < NET.x0 || box.y < NET.y0 || box.x + box.w > NET.x1 || box.y + box.h > NET.y1) return false;
    for (const hit of nodeGrid.nearPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, LABEL_PAD), hit.rect)) return false;
    }
    for (const hit of classGrid.nearPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, LABEL_PAD), hit.rect)) return false;
    }
    for (const m of currentMarkers) {
      if (G.rectsOverlap(inflate(box, LABEL_PAD), G.markerBox(m.x, m.y))) return false;
    }
    for (const item of placed) {
      if (item.id === ownId) continue;
      if (G.rectsOverlap(inflate(box, LABEL_PAD), item.box)) return false;
    }
    return true;
  };
  const ordered = reactions.filter((r) => !labels[r.id]).map((r) => r.id).sort();
  ordered.forEach((id) => {
    const marker = markers[id];
    const reaction = reactions.find((r) => r.id === id);
    const size = { w: labelWidth(reaction.typeLabel), h: TYPE_H };
    let chosen = null;
    let lineFallback = null;
    const tryAt = (cx, cy) => {
      const box = { x: round2(cx - size.w / 2), y: round2(cy - size.h / 2), w: size.w, h: size.h };
      if (!free(box, id)) return false;
      if (currentLineIndex && currentLineIndex.anyWithin(box, 4)) {
        if (!lineFallback) lineFallback = box;
        return false;
      }
      chosen = box;
      return true;
    };
    // マーカー直近の上下左右 → 同心円状に広げる（決定的）。
    // 自反応の保存線に沿って置く（marker 近傍より対応が明確）。
    const ownPolys = [];
    if (routes) {
      Object.keys(routes).forEach((key) => {
        if (routes[key].reaction === id) ownPolys.push(routes[key].points);
      });
    }
    const foreignPolys = [];
    if (routes) {
      Object.keys(routes).forEach((key) => {
        if (routes[key].reaction !== id) foreignPolys.push(routes[key].points);
      });
    }
    let bestOwn = null;
    let bestScore = Infinity;
    ownPolys.forEach((poly) => {
      const total = polylineLength(poly);
      for (let t = 6; t < total; t += 10) {
        const point = G.pointAlong(poly, t);
        if (!point) continue;
        const a = poly[point.seg];
        const b = poly[point.seg + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const gap of [4, 8, 12, 16, 20]) {
          for (const sign of [-1, 1]) {
            const box = {
              x: round2(point.x + nx * sign * (size.h / 2 + gap) - size.w / 2),
              y: round2(point.y + ny * sign * (size.h / 2 + gap) - size.h / 2),
              w: size.w,
              h: size.h
            };
            if (!free(box, id)) continue;
            let own = Infinity;
            ownPolys.forEach((p) => {
              for (let i = 0; i < p.length - 1; i++) own = Math.min(own, segRectDistance(p[i], p[i + 1], box));
            });
            let foreign = Infinity;
            foreignPolys.forEach((p) => {
              for (let i = 0; i < p.length - 1; i++) foreign = Math.min(foreign, segRectDistance(p[i], p[i + 1], box));
            });
            if (foreign < 1.5) continue;
            const penalty = foreign < own + 5 ? (own + 5 - foreign) * 3 : 0;
            const score = own + penalty + (gap - 4) * 0.2;
            if (score < bestScore) { bestScore = score; bestOwn = box; }
          }
        }
      }
    });
    if (bestOwn) chosen = bestOwn;
    const radii = [0, 8, 16, 24, 34, 46, 60, 76, 94, 114, 138, 166, 198, 234, 280, 340];
    for (const radius of radii) {
      if (chosen) break;
      const steps = radius === 0 ? 1 : 16;
      for (let ai = 0; ai < steps; ai++) {
        const angle = (ai / steps) * Math.PI * 2 + (hash32(id) % 628) / 100;
        const cx = marker.x + Math.cos(angle) * (radius + size.w / 2 + 10);
        const cy = marker.y + Math.sin(angle) * (radius + size.h / 2 + 10);
        if (tryAt(cx, cy)) break;
      }
    }
    if (!chosen && lineFallback) chosen = lineFallback;
    if (chosen) {
      labels[id] = {
        side: chosen.x + chosen.w / 2 >= marker.x ? 'E' : 'W',
        type: { x: round2(chosen.x + chosen.w / 2), y: round2(chosen.y + chosen.h / 2) },
        cond: null,
        box: chosen,
        leader: null
      };
      placed.push({ id: id, box: chosen });
      filled.push(id);
    }
  });
  return { labels: labels, filled: filled };
}

function resolveLabelCollisions(labels, markers) {
  const ids = Object.keys(labels).sort();
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  const free = (box, ownId) => {
    if (box.x < NET.x0 + 2 || box.y < NET.y0 + 2 ||
      box.x + box.w > NET.x1 - 2 || box.y + box.h > NET.y1 - 2) return false;
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const reach = Math.max(box.w, box.h) / 2 + 6;
    for (const hit of nodeGrid.nearPoint(c, reach + box.w)) {
      if (G.rectsOverlap(inflate(box, 3), hit.rect)) return false;
    }
    for (const hit of classGrid.nearPoint(c, reach + box.w)) {
      if (G.rectsOverlap(inflate(box, 3), hit.rect)) return false;
    }
    for (const m of currentMarkers) {
      if (G.rectsOverlap(inflate(box, 3), G.markerBox(m.x, m.y))) return false;
    }
    for (const id of ids) {
      if (id === ownId) continue;
      if (G.rectsOverlap(inflate(box, 3), labels[id].box)) return false;
    }
    if (currentLineIndex && currentLineIndex.anyWithin(box, 4)) return false;
    return true;
  };
  for (let pass = 0; pass < 10; pass++) {
    let overlaps = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = labels[ids[i]];
        const b = labels[ids[j]];
        if (!G.rectsOverlap(G.inflate(a.box, 1), G.inflate(b.box, 1))) continue;
        overlaps++;
        const target = a.box.y <= b.box.y ? a : b;
        const otherId = target === a ? ids[j] : ids[i];
        const start = { x: target.box.x + target.box.w / 2, y: target.box.y + target.box.h / 2 };
        const radii = [0, 6, 12, 20, 28, 38, 50, 64, 80, 100, 124, 150, 180, 214, 254, 300];
        let moved = false;
        for (const radius of radii) {
          if (moved) break;
          const steps = radius === 0 ? 1 : 20;
          for (let ai = 0; ai < steps; ai++) {
            const angle = (ai / steps) * Math.PI * 2 + (hash32(ids[i] + '|' + ids[j]) % 628) / 100;
            const box = {
              x: round2(start.x + Math.cos(angle) * radius - target.box.w / 2),
              y: round2(start.y + Math.sin(angle) * radius - target.box.h / 2),
              w: target.box.w,
              h: target.box.h
            };
            if (!free(box, target === a ? ids[i] : ids[j])) continue;
            const id = target === a ? ids[i] : ids[j];
            labels[id] = {
              side: box.x + box.w / 2 >= markers[id].x ? 'E' : 'W',
              type: { x: round2(box.x + box.w / 2), y: round2(box.y + box.h / 2) },
              cond: null,
              box: box,
              leader: null
            };
            moved = true;
            break;
          }
        }
        void otherId;
      }
    }
    if (!overlaps) break;
  }
  return labels;
}

function countRouteLabelPenetrations(routes, labels) {
  const grid = rectGridOf(Object.keys(labels).map((id) => ({ id: id, rect: labels[id].box })));
  let count = 0;
  Object.keys(routes).forEach((key) => {
    const pts = routes[key].points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (const hit of grid.hitSegment(a, b, 0)) {
        if (G.segmentRect(a, b, G.inflate(hit.rect, -0.5))) count++;
      }
    }
  });
  return count;
}

function polishLabels(labels, markers) {
  const ids = Object.keys(labels).sort();
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  let movedCount = 0;
  const clear = (box, ownId) => {
    if (box.x < NET.x0 + 2 || box.y < NET.y0 + 2 ||
      box.x + box.w > NET.x1 - 2 || box.y + box.h > NET.y1 - 2) return false;
    for (const hit of nodeGrid.nearPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
    }
    for (const hit of classGrid.nearPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
    }
    for (const m of currentMarkers) {
      if (G.rectsOverlap(inflate(box, 3), G.markerBox(m.x, m.y))) return false;
    }
    for (const id of ids) {
      if (id === ownId) continue;
      if (G.rectsOverlap(inflate(box, 2), labels[id].box)) return false;
    }
    if (currentLineIndex && currentLineIndex.anyWithin(box, 3)) return false;
    return true;
  };
  ids.forEach((id) => {
    const label = labels[id];
    if (clear(label.box, id)) return;
    const marker = markers[id];
    let chosen = null;
    for (const radius of [0, 6, 12, 20, 30, 42, 56, 72, 92, 116, 144, 176, 212, 252, 300]) {
      if (chosen) break;
      const steps = radius === 0 ? 1 : 20;
      for (let ai = 0; ai < steps; ai++) {
        const angle = (ai / steps) * Math.PI * 2 + (hash32(id) % 628) / 100;
        const box = {
          x: round2(label.box.x + Math.cos(angle) * radius),
          y: round2(label.box.y + Math.sin(angle) * radius),
          w: label.box.w,
          h: label.box.h
        };
        if (!clear(box, id)) continue;
        chosen = box;
        break;
      }
    }
    if (!chosen) {
      // 最終手段: 線の直近は許し、配線側を後で引き直す。
      for (const radius of [0, 6, 12, 20, 30, 42, 56, 72, 92, 116, 144, 176, 212, 252, 300, 360]) {
        if (chosen) break;
        const steps = radius === 0 ? 1 : 20;
        for (let ai = 0; ai < steps; ai++) {
          const angle = (ai / steps) * Math.PI * 2 + (hash32(id) % 628) / 100;
          const box = {
            x: round2(label.box.x + Math.cos(angle) * radius),
            y: round2(label.box.y + Math.sin(angle) * radius),
            w: label.box.w,
            h: label.box.h
          };
          const saved = currentLineIndex;
          currentLineIndex = null;
          const ok = clear(box, id);
          currentLineIndex = saved;
          if (!ok) continue;
          chosen = box;
          break;
        }
      }
    }
    if (!chosen) return;
    labels[id] = {
      side: chosen.x + chosen.w / 2 >= marker.x ? 'E' : 'W',
      type: { x: round2(chosen.x + chosen.w / 2), y: round2(chosen.y + chosen.h / 2) },
      cond: null,
      box: chosen,
      leader: null
    };
    movedCount++;
  });
  return movedCount;
}

function routeEdgesMap(routes) {
  const edges = {};
  Object.keys(routes).forEach((key) => {
    const r = routes[key];
    edges[key] = {
      reaction: r.reaction, compound: r.compound, dir: r.dir, tier: r.tier,
      points: r.points.map((p) => [p.x, p.y]), gaps: [], bridges: []
    };
  });
  return edges;
}

function actualDrawn(labels, markers, routes, positions, nodeW, nodeH) {
  const edges = routeEdgesMap(routes);
  const drawn = LabelQuality.buildDrawnLines({ positions: positions, markers: markers, edges: edges, nodeW: nodeW, nodeH: nodeH });
  const measured = LabelQuality.measureLabels(labels, drawn.lines, { ownerLines: drawn.lines });
  return { lines: drawn.lines, measured: measured, edges: edges, drawn: drawn.drawn !== false };
}

function resolveLabelRouteConflicts(labels, routes, markers) {
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries()).map((e) => ({ id: e[0], rect: e[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  const rawLines = {};
  Object.keys(routes).forEach((key) => {
    const r = routes[key];
    if (!rawLines[r.reaction]) rawLines[r.reaction] = [];
    rawLines[r.reaction].push(r.points);
  });
  const allPolys = [];
  Object.keys(rawLines).forEach((rid) => rawLines[rid].forEach((poly) => allPolys.push(poly)));
  const free = (box, ownId) => {
    if (box.x < NET.x0 + 2 || box.y < NET.y0 + 2 || box.x + box.w > NET.x1 - 2 || box.y + box.h > NET.y1 - 2) return false;
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    for (const hit of nodeGrid.nearPoint(c, Math.max(box.w, box.h))) if (G.rectsOverlap(inflate(box, 1.5), hit.rect)) return false;
    for (const hit of classGrid.nearPoint(c, Math.max(box.w, box.h))) if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
    for (const m of currentMarkers) if (G.rectsOverlap(inflate(box, 1.5), G.markerBox(m.x, m.y))) return false;
    for (const oid of Object.keys(labels)) {
      if (oid === ownId) continue;
      if (G.rectsOverlap(inflate(box, 1.5), labels[oid].box)) return false;
    }
    for (const poly of allPolys) {
      for (let i = 0; i < poly.length - 1; i++) if (segRectDistance(poly[i], poly[i + 1], box) < 1.2) return false;
    }
    return true;
  };
  let moved = 0;
  Object.keys(labels).sort().forEach((id) => {
    const label = labels[id];
    let conflict = false;
    for (const poly of allPolys) {
      for (let i = 0; i < poly.length - 1; i++) {
        if (segRectDistance(poly[i], poly[i + 1], label.box) < 1) { conflict = true; break; }
      }
      if (conflict) break;
    }
    if (!conflict) return;
    const own = rawLines[id] || [];
    const current = { x: label.box.x, y: label.box.y };
    let best = null;
    let bestScore = Infinity;
    for (const radius of [0, 6, 12, 20, 30, 42, 56, 72, 92, 116, 144, 176, 220, 280, 360, 460]) {
      const steps = radius === 0 ? 1 : 20;
      for (let ai = 0; ai < steps; ai++) {
        const angle = (ai / steps) * Math.PI * 2 + (hash32(id) % 628) / 100;
        const box = {
          x: round2(current.x + Math.cos(angle) * radius),
          y: round2(current.y + Math.sin(angle) * radius),
          w: label.box.w, h: label.box.h
        };
        if (!free(box, id)) continue;
        let ownD = Infinity;
        own.forEach((poly) => { for (let i = 0; i < poly.length - 1; i++) ownD = Math.min(ownD, segRectDistance(poly[i], poly[i + 1], box)); });
        const score = ownD + radius * 0.2;
        if (score < bestScore) { bestScore = score; best = box; }
      }
    }
    if (!best) return;
    labels[id] = {
      side: best.x + best.w / 2 >= markers[id].x ? 'E' : 'W',
      type: { x: round2(best.x + best.w / 2), y: round2(best.y + best.h / 2) },
      cond: null,
      box: best,
      leader: null
    };
    moved++;
  });
  return moved;
}

function repositionTargetsNearOwnLine(targets, actualLines, labels, markers, routes) {
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries()).map((e) => ({ id: e[0], rect: e[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  const allLines = {};
  Object.keys(actualLines || {}).forEach((rid) => {
    allLines[rid] = actualLines[rid].map((poly) => poly.map((p) => ({ x: p.x, y: p.y })));
  });
  let moved = 0;
  targets.forEach((target) => {
    const id = target.id;
    const own = allLines[id] || [];
    const foreign = [];
    Object.keys(allLines).forEach((rid) => { if (rid !== id) allLines[rid].forEach((poly) => foreign.push(poly)); });
    if (!own.length) return;
    const cur = labels[id];
    const size = { w: cur.box.w, h: cur.box.h };
    const clean = (box) => {
      if (box.x < NET.x0 + 2 || box.y < NET.y0 + 2 || box.x + box.w > NET.x1 - 2 || box.y + box.h > NET.y1 - 2) return false;
      const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      for (const hit of nodeGrid.nearPoint(c, Math.max(box.w, box.h))) if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
      for (const hit of classGrid.nearPoint(c, Math.max(box.w, box.h))) if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
      for (const m of currentMarkers) if (G.rectsOverlap(inflate(box, 2), G.markerBox(m.x, m.y))) return false;
      for (const oid of Object.keys(labels)) {
        if (oid === id) continue;
        if (G.rectsOverlap(inflate(box, 2), labels[oid].box)) return false;
      }
      for (const poly of foreign) {
        for (let i = 0; i < poly.length - 1; i++) if (segRectDistance(poly[i], poly[i + 1], box) < 2) return false;
      }
      return true;
    };
    let best = null;
    let bestScore = Infinity;
    own.forEach((poly) => {
      const total = polylineLength(poly);
      for (let t = 6; t < total; t += 8) {
        const point = G.pointAlong(poly, t);
        if (!point) continue;
        const a = poly[point.seg];
        const b = poly[point.seg + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const gap of [4, 8, 12, 16, 20, 26]) {
          for (const sign of [-1, 1]) {
            const box = { x: round2(point.x + nx * sign * (size.h / 2 + gap) - size.w / 2), y: round2(point.y + ny * sign * (size.h / 2 + gap) - size.h / 2), w: size.w, h: size.h };
            if (!clean(box)) continue;
            let ownD = Infinity;
            own.forEach((p) => { for (let i = 0; i < p.length - 1; i++) ownD = Math.min(ownD, segRectDistance(p[i], p[i + 1], box)); });
            let foreignD = Infinity;
            foreign.forEach((p) => { for (let i = 0; i < p.length - 1; i++) foreignD = Math.min(foreignD, segRectDistance(p[i], p[i + 1], box)); });
            const penalty = foreignD < ownD + 2 ? (ownD + 2 - foreignD) * 3 : 0;
            const score = ownD + penalty + (gap - 4) * 0.2;
            if (score < bestScore) { bestScore = score; best = box; }
          }
        }
      }
    });
    if (!best) return;
    labels[id] = {
      side: best.x + best.w / 2 >= markers[id].x ? 'E' : 'W',
      type: { x: round2(best.x + best.w / 2), y: round2(best.y + best.h / 2) },
      cond: null,
      box: best,
      leader: null
    };
    moved++;
  });
  return moved;
}

function rerouteForeignAroundTargets(targets, actualLines, routes, markers, reactionById, labels) {
  const targetIds = new Set(targets.map((t) => t.id));
  let changed = 0;
  const index = prepareRouteIndex(markers);
  const processed = new Set();
  targets.forEach((target) => {
    const id = target.id;
    if (!target.box) return;
    let barrier = G.inflate(target.box, 8);
    const leaderPts = labels && labels[id] && Array.isArray(labels[id].leader) ? labels[id].leader : [];
    leaderPts.forEach((p) => {
      barrier = {
        x: Math.min(barrier.x, p.x) - 2,
        y: Math.min(barrier.y, p.y) - 2,
        w: Math.max(barrier.x + barrier.w, p.x) - Math.min(barrier.x, p.x) + 4,
        h: Math.max(barrier.y + barrier.h, p.y) - Math.min(barrier.y, p.y) + 4
      };
    });
    const polys = actualLines && actualLines[id]
      ? actualLines[id].map((poly) => poly.map((p) => ({ x: p.x, y: p.y })))
      : [];
    const center = { x: target.box.x + target.box.w / 2, y: target.box.y + target.box.h / 2 };
    let corridor = null;
    if (polys.length) {
      let best = null;
      polys.forEach((poly) => {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = poly[i];
          const b = poly[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          let t = len2 > 1e-9 ? ((center.x - a.x) * dx + (center.y - a.y) * dy) / len2 : 0;
          t = G.clamp(t, 0, 1);
          const q = { x: a.x + dx * t, y: a.y + dy * t };
          const d = Math.hypot(q.x - center.x, q.y - center.y);
          if (!best || d < best.d) best = { q: q, d: d };
        }
      });
      if (best && best.d <= 76) {
        corridor = { a: center, b: best.q };
        barrier = {
          x: Math.min(barrier.x, best.q.x) - 2,
          y: Math.min(barrier.y, best.q.y) - 2,
          w: Math.max(barrier.x + barrier.w, best.q.x) - Math.min(barrier.x, best.q.x) + 4,
          h: Math.max(barrier.y + barrier.h, best.q.y) - Math.min(barrier.y, best.q.y) + 4
        };
      }
    }
    const keyList = Object.keys(routes).sort();
    keyList.forEach((key) => {
      const route = routes[key];
      if (route.reaction === id) return;
      // 他の保護対象の own route は動かさない（その label の対応を壊さない）。
      if (targetIds.has(route.reaction)) return;
      if (processed.has(target.id + '|' + key)) return;
      let near = false;
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i];
        const b = route.points[i + 1];
        if (G.segmentRect(a, b, G.inflate(barrier, 1))) { near = true; break; }
        if (corridor && G.segSegDistance(a, b, corridor.a, corridor.b) < 8 - 0.5) { near = true; break; }
      }
      if (!near) return;
      const reaction = reactionById.get(route.reaction);
      const marker = markers[route.reaction];
      if (!reaction || !marker) return;
      extraBlockers = [barrier];
      const def = {
        key: key, reaction: route.reaction, dir: route.dir, compound: route.compound, tier: route.tier
      };
      const points = routeEdge(def, rectOf(nodeRectsById.get(route.compound).rect), marker, index);
      extraBlockers = [];
      if (!points) return;
      routes[key] = {
        reaction: route.reaction, dir: route.dir, compound: route.compound, tier: route.tier,
        points: points, gaps: [], bridges: []
      };
      processed.add(target.id + '|' + key);
      changed++;
    });
  });
  extraBlockers = [];
  return changed;
}

function labelsCrossedByRoutes(labels, routes) {
  const ids = [];
  Object.keys(labels).sort().forEach((id) => {
    const box = labels[id].box;
    let bad = false;
    Object.keys(routes).forEach((key) => {
      if (bad) return;
      const pts = routes[key].points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (G.segmentRect(pts[i], pts[i + 1], G.inflate(box, 1))) { bad = true; break; }
      }
    });
    if (bad) ids.push(id);
  });
  return ids;
}

function repairForeignRoutesForLabels(labels, markers, routes, actualLines, options) {
  const dist = labelDistances(labels, routes);
  const protect = {};
  Object.keys(labels).sort().forEach((id) => {
    const d = dist[id];
    if (!d || d.own == null) return;
    const foreign = d.foreign == null ? Infinity : d.foreign;
    if (!(d.own > foreign || d.own >= 25)) return;
    const ownPolys = [];
    if (actualLines && actualLines[id]) {
      actualLines[id].forEach((poly) => ownPolys.push(poly.map((p) => ({ x: p.x, y: p.y }))));
    } else {
      Object.keys(routes).forEach((key) => {
        if (routes[key].reaction === id) ownPolys.push(routes[key].points.map((p) => ({ x: p.x, y: p.y })));
      });
    }
    const box = labels[id].box;
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const near = LabelRouteRepair.nearestPointOnPolylines(ownPolys, center);
    if (!near) return;
    // leader 上限 80 を超える導線は保護しない（巨大 corridor で過剰 reroute しない）。
    if (near.distance <= 76) {
      protect[id] = { corridor: [[center.x, center.y], [round2(near.point.x), round2(near.point.y)]] };
    } else {
      protect[id] = {};
    }
  });
  if (!Object.keys(protect).length) return routes;
  const compounds = {};
  nodeRectsById.forEach((item, id) => {
    compounds[id] = { x: item.rect.x, y: item.rect.y, w: item.rect.w, h: item.rect.h };
  });
  const routeInput = {};
  Object.keys(routes).forEach((key) => {
    const r = routes[key];
    routeInput[key] = {
      reaction: r.reaction, compound: r.compound, dir: r.dir, tier: r.tier,
      points: r.points.map((p) => [p.x, p.y]), gaps: [], bridges: []
    };
  });
  const result = LabelRouteRepair.repair({
    labels: labels,
    routes: routeInput,
    compounds: compounds,
    markers: markers,
    classRects: currentClassRects,
    protect: protect
  }, Object.assign({ clearance: 8, passes: 2 }, options || {}));
  const out = {};
  Object.keys(result.routes).forEach((key) => {
    const r = result.routes[key];
    out[key] = {
      reaction: r.reaction, compound: r.compound, dir: r.dir, tier: r.tier,
      points: r.points.map((p) => ({ x: p[0], y: p[1] })), gaps: [], bridges: []
    };
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 5b. ラベルの対応診断（真逆転と strict 未達の区別）と優先反応の寄せ直し
 * ------------------------------------------------------------------ */

const STRONG5 = [
  'ethanol-dehydration-ethene',
  'ethyne-full-hydrogenation',
  'acetic-acid-sodium-carbonate',
  'ethanol-sodium',
  'methanol-cuo-oxidation'
];

function labelDistances(labels, routes) {
  const byReaction = new Map();
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    if (!byReaction.has(route.reaction)) byReaction.set(route.reaction, []);
    for (let i = 0; i < route.points.length - 1; i++) {
      byReaction.get(route.reaction).push({ a: route.points[i], b: route.points[i + 1] });
    }
  });
  const out = {};
  Object.keys(labels).forEach((id) => {
    const box = labels[id].box;
    let own = Infinity;
    let foreign = Infinity;
    byReaction.forEach((segs, rid) => {
      let d = Infinity;
      segs.forEach((seg) => { d = Math.min(d, segRectDistance(seg.a, seg.b, box)); });
      if (rid === id) own = d;
      else foreign = Math.min(foreign, d);
    });
    out[id] = {
      own: own === Infinity ? null : round2(own),
      foreign: foreign === Infinity ? null : round2(foreign)
    };
  });
  return out;
}

// 未解決ラベルの内訳: 真逆転（own>foreign または own>=25）と、strict margin だけ未達
// （own<=12 かつ own<foreign）を分ける。fallback は別枠。
function diagnoseLabels(labels, routes, fallbackIds, metrics, distancesOverride) {
  const dist = distancesOverride || labelDistances(labels, routes);
  const fallback = new Set(fallbackIds || []);
  const groups = { inversion: [], strictOnly: [], other: [], fallback: [] };
  Object.keys(labels).sort().forEach((id) => {
    if (fallback.has(id)) { groups.fallback.push(id); return; }
    const state = metrics && metrics[id] ? metrics[id].state : null;
    if (state === 'direct' || state === 'leader') return;
    const d = dist[id];
    if (!d || d.own == null) return;
    const foreign = d.foreign == null ? Infinity : d.foreign;
    if (d.own > foreign || d.own >= 25) groups.inversion.push(id);
    else if (d.own <= 12 && d.own < foreign) groups.strictOnly.push(id);
    else groups.other.push(id);
  });
  return { groups: groups, distances: dist };
}

function boundaryPointOf(box, target) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: box.x + box.w, y: cy };
  const tx = dx > 0 ? (box.x + box.w - cx) / dx : dx < 0 ? (box.x - cx) / dx : Infinity;
  const ty = dy > 0 ? (box.y + box.h - cy) / dy : dy < 0 ? (box.y - cy) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: round2(cx + dx * t), y: round2(cy + dy * t) };
}

// 逆転したラベルに、自線までの短い導線（leader）を付ける。A の最終契約と同じ
// 「ラベル枠の境界に接する」「終点は自線の中心線」を満たすものだけ採用する。
function attachLeader(labels, id, ownPolys, otherPolys, nodeRects, markers, maxLen) {
  const box = labels[id].box;
  const anchors = [];
  for (const poly of ownPolys) {
    const total = polylineLength(poly);
    for (let t = 3; t < total; t += 3) {
      const p = G.pointAlong(poly, t);
      if (p) anchors.push({ x: p.x, y: p.y });
    }
  }
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  anchors.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const border = boundaryPointOf(box, anchor);
    const leader = [border, anchor];
    if (polylineLength(leader) > (maxLen || 48) + 1e-6) continue;
    let bad = false;
    for (let s = 0; s < leader.length - 1; s++) {
      const a = leader[s];
      const b = leader[s + 1];
      for (const item of nodeRects) {
        if (G.segmentRect(a, b, G.inflate(item.rect, 1))) { bad = true; break; }
      }
      for (const otherId of Object.keys(labels)) {
        if (otherId === id) continue;
        if (G.segmentRect(a, b, G.inflate(labels[otherId].box, 0.5))) { bad = true; break; }
      }
      for (const mid of Object.keys(markers)) {
        if (mid === id) continue;
        if (G.segmentRect(a, b, G.inflate(G.markerBox(markers[mid].x, markers[mid].y), 1))) { bad = true; break; }
      }
      if (bad) break;
    }
    if (bad) continue;
    labels[id].leader = leader;
    return true;
  }
  return false;
}

function attachLeadersForInversions(labels, routes, markers, actualLines) {
  const dist = labelDistances(labels, routes);
  const ownPolys = new Map();
  const otherPolys = [];
  if (actualLines) {
    Object.keys(actualLines).forEach((rid) => {
      ownPolys.set(rid, actualLines[rid].map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))));
    });
  } else {
    Object.keys(routes).forEach((key) => {
      const route = routes[key];
      if (!ownPolys.has(route.reaction)) ownPolys.set(route.reaction, []);
      ownPolys.get(route.reaction).push(route.points);
    });
  }
  // priority（strong5 と逆転）以外は foreign 側として扱う
  const ids = Object.keys(labels).sort();
  let attached = 0;
  const nodeRectList = Array.from(nodeRectsById.entries()).map((entry) => ({ id: entry[0], rect: entry[1].rect }));
  ids.forEach((id) => {
    const d = dist[id];
    if (!d || d.own == null) return;
    const foreign = d.foreign == null ? Infinity : d.foreign;
    const inverted = d.own > foreign || d.own >= 25;
    const weak = d.own > 12 && !labels[id].leader;
    if (!inverted && !weak) return;
    // 経路を引き直した後の leader は古い可能性があるため、逆転ラベルは必ず付け直す。
    if (inverted) labels[id].leader = null;
    const own = ownPolys.get(id) || [];
    const others = [];
    ownPolys.forEach((polys, rid) => {
      if (rid === id) return;
      polys.forEach((poly) => others.push(poly));
    });
    if (attachLeader(labels, id, own, others, nodeRectList, markers, 48) ||
      attachLeader(labels, id, own, others, nodeRectList, markers, 80)) attached++;
  });
  return attached;
}

// 真逆転の反応と strong5 を、own が近く foreign より手前になる位置へ寄せ直す。
function guideBlocked(box, ownPolys, otherPolys) {
  const candidates = [];
  ownPolys.forEach((poly) => {
    const total = polylineLength(poly);
    for (let t = 2; t < total; t += 4) {
      const q = G.pointAlong(poly, t);
      if (q) candidates.push({ x: q.x, y: q.y });
    }
  });
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  candidates.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  for (let k = 0; k < Math.min(6, candidates.length); k++) {
    const anchor = candidates[k];
    const border = boundaryPointOf(box, anchor);
    let blocked = false;
    for (const poly of otherPolys) {
      for (let i = 0; i < poly.length - 1; i++) {
        if (G.segSegDistance(border, anchor, poly[i], poly[i + 1]) < 1) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (!blocked) return false;
  }
  return candidates.length > 0;
}

function refinePriorityLabels(labels, markers, routes) {
  const dist = labelDistances(labels, routes);
  const priority = new Set(STRONG5.filter((id) => labels[id]));
  Object.keys(labels).forEach((id) => {
    const d = dist[id];
    if (!d || d.own == null) return;
    const foreign = d.foreign == null ? Infinity : d.foreign;
    if (d.own > foreign || d.own >= 25 || (d.own > 18 && !labels[id].leader)) priority.add(id);
  });
  if (!priority.size) return 0;
  const ownPolys = new Map();
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    if (!priority.has(route.reaction)) return;
    if (!ownPolys.has(route.reaction)) ownPolys.set(route.reaction, []);
    ownPolys.get(route.reaction).push(route.points);
  });
  const otherPolys = [];
  const allPolys = [];
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    allPolys.push(route.points);
    if (priority.has(route.reaction)) return;
    otherPolys.push(route.points);
  });
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  const nodeRectList = Array.from(nodeRectsById.entries()).map((entry) => ({ id: entry[0], rect: entry[1].rect }));
  let moved = 0;

  const clean = (box, ownId) => {
    if (box.x < NET.x0 + 2 || box.y < NET.y0 + 2 ||
      box.x + box.w > NET.x1 - 2 || box.y + box.h > NET.y1 - 2) return false;
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    for (const hit of nodeGrid.nearPoint(c, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
    }
    for (const hit of classGrid.nearPoint(c, Math.max(box.w, box.h))) {
      if (G.rectsOverlap(inflate(box, 2), hit.rect)) return false;
    }
    for (const m of currentMarkers) {
      if (G.rectsOverlap(inflate(box, 2), G.markerBox(m.x, m.y))) return false;
    }
    for (const id of Object.keys(labels)) {
      if (id === ownId) continue;
      if (G.rectsOverlap(inflate(box, 2), labels[id].box)) return false;
    }
    for (const poly of allPolys) {
      for (let i = 0; i < poly.length - 1; i++) {
        if (segRectDistance(poly[i], poly[i + 1], box) < 1.5) return false;
      }
    }
    return true;
  };

  priority.forEach((id) => {
    const polys = ownPolys.get(id) || [];
    if (!polys.length) return;
    const current = labels[id];
    const size = { w: current.box.w, h: current.box.h };
    let best = null;
    let bestScore = Infinity;
    for (const poly of polys) {
      const total = polylineLength(poly);
      for (let t = 6; t < total; t += 10) {
        const point = G.pointAlong(poly, t);
        if (!point) continue;
        const a = poly[point.seg];
        const b = poly[point.seg + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const gap of [4, 8, 12, 16, 20]) {
          for (const sign of [-1, 1]) {
            for (const shift of [0, -24, 24]) {
              const cx = point.x + nx * sign * (size.h / 2 + gap) + (dx / len) * shift;
              const cy = point.y + ny * sign * (size.h / 2 + gap) + (dy / len) * shift;
              const box = {
                x: round2(cx - size.w / 2),
                y: round2(cy - size.h / 2),
                w: size.w,
                h: size.h
              };
              if (!clean(box, id)) continue;
              let own = Infinity;
              polys.forEach((p) => {
                for (let i = 0; i < p.length - 1; i++) own = Math.min(own, segRectDistance(p[i], p[i + 1], box));
              });
              let foreign = Infinity;
              otherPolys.forEach((p) => {
                for (let i = 0; i < p.length - 1; i++) foreign = Math.min(foreign, segRectDistance(p[i], p[i + 1], box));
              });
              const penalty = foreign < own + 5 ? (own + 5 - foreign) * 3 : 0;
              const guidePenalty = guideBlocked(box, polys, otherPolys) ? 30 : 0;
              const score = own + penalty + guidePenalty + (gap - 4) * 0.2;
              if (score < bestScore) { bestScore = score; best = box; }
            }
          }
        }
      }
    }
    if (best) {
    labels[id] = {
      side: best.x + best.w / 2 >= markers[id].x ? 'E' : 'W',
      type: { x: round2(best.x + best.w / 2), y: round2(best.y + best.h / 2) },
      cond: null,
      box: best,
      leader: null
    };
    moved++;
    }
    // まだ逆転している場合は、自線までの短い導線で対応を明示する。
    const box = labels[id].box;
    let own = Infinity;
    polys.forEach((poly) => {
      for (let i = 0; i < poly.length - 1; i++) own = Math.min(own, segRectDistance(poly[i], poly[i + 1], box));
    });
    let foreign = Infinity;
    otherPolys.forEach((poly) => {
      for (let i = 0; i < poly.length - 1; i++) foreign = Math.min(foreign, segRectDistance(poly[i], poly[i + 1], box));
    });
    if (own > foreign || own >= 25 || !(own < foreign - 5)) {
      if (attachLeader(labels, id, polys, otherPolys, nodeRectList, markers, 48) ||
        attachLeader(labels, id, polys, otherPolys, nodeRectList, markers, 80)) moved++;
    }
  });
  return moved;
}

/* ------------------------------------------------------------------ *
 * 4b. 細格子 A*（ノード間の狭い通路を通すための局所探索）
 * ------------------------------------------------------------------ */

function fineRoute(start, end, ownCompound, ownReaction, index) {
  const pad = 220;
  const x0 = Math.max(NET.x0 - 40, Math.floor((Math.min(start.x, end.x) - pad) / 10) * 10);
  const y0 = Math.max(NET.y0 - 40, Math.floor((Math.min(start.y, end.y) - pad) / 10) * 10);
  const x1 = Math.min(NET.x1 + 40, Math.ceil((Math.max(start.x, end.x) + pad) / 10) * 10);
  const y1 = Math.min(NET.y1 + 40, Math.ceil((Math.max(start.y, end.y) + pad) / 10) * 10);
  const cell = 10;
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const ny = Math.floor((y1 - y0) / cell) + 1;
  const blocked = new Uint8Array(nx * ny);
  const markRect = (rect) => {
    const ix0 = Math.max(0, Math.floor((rect.x - x0) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((rect.x + rect.w - x0) / cell));
    const iy0 = Math.max(0, Math.floor((rect.y - y0) / cell));
    const iy1 = Math.min(ny - 1, Math.floor((rect.y + rect.h - y0) / cell));
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = y0 + iy * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = x0 + ix * cell;
        if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
          blocked[iy * nx + ix] = 1;
        }
      }
    }
  };
  index.nodes.rects.forEach((entry) => {
    markRect(G.inflate(entry.rect, ROUTE_NODE_PAD));
  });
  index.labels.rects.forEach((entry) => markRect(G.inflate(entry.rect, ROUTE_LABEL_PAD)));
  extraBlockers.forEach((b) => markRect(G.inflate(b, 1)));
  currentZoneObstacles.forEach((rect, zid) => {
    if (zid === ownReaction) return;
    markRect(rect);
  });
  index.markers.rects.forEach((entry) => {
    if (entry.id === ownReaction) return;
    markRect(G.inflate(entry.rect, 4));
  });

  const toCell = (p) => ({ ix: G.clamp(Math.round((p.x - x0) / cell), 0, nx - 1), iy: G.clamp(Math.round((p.y - y0) / cell), 0, ny - 1) });
  const sc = toCell(start);
  const ec = toCell(end);
  const cellPoint = (ix, iy) => ({ x: x0 + ix * cell, y: y0 + iy * cell });
  // 端点まわりは障害物判定の外なので少し空ける（外向き stub 前提）。
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ix = sc.ix + dx;
      const iy = sc.iy + dy;
      if (ix >= 0 && iy >= 0 && ix < nx && iy < ny && Math.hypot(dx, dy) <= 2.2) blocked[iy * nx + ix] = 0;
    }
  }
  const sId = sc.iy * nx + sc.ix;
  const eId = ec.iy * nx + ec.ix;
  const dist = new Float64Array(nx * ny).fill(Infinity);
  const prev = new Int32Array(nx * ny).fill(-1);
  const heap = [];
  const push = (id, f) => {
    heap.push({ id: id, f: f });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= heap[i].f) break;
      const tmp = heap[parent]; heap[parent] = heap[i]; heap[i] = tmp;
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        const tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp;
        i = m;
      }
    }
    return top;
  };
  const h = (ix, iy) => Math.hypot(ix - ec.ix, iy - ec.iy) * cell;
  dist[sId] = 0;
  push(sId, h(sc.ix, sc.iy));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (cur.id === eId) { found = true; break; }
    const cx = cur.id % nx;
    const cy = Math.floor(cur.id / nx);
    for (const dir of dirs) {
      const nxi = cx + dir[0];
      const nyi = cy + dir[1];
      if (nxi < 0 || nyi < 0 || nxi >= nx || nyi >= ny) continue;
      const nid = nyi * nx + nxi;
      if (blocked[nid]) continue;
      if (dir[0] !== 0 && dir[1] !== 0 && (blocked[cy * nx + nxi] || blocked[nyi * nx + cx])) continue;
      const step = (dir[0] !== 0 && dir[1] !== 0 ? Math.SQRT2 : 1) * cell;
      const nd = dist[cur.id] + step;
      if (nd + 1e-9 >= dist[nid]) continue;
      dist[nid] = nd;
      prev[nid] = cur.id;
      push(nid, nd + h(nxi, nyi));
    }
  }
  if (!found) return null;
  const cells = [];
  let cursor = eId;
  while (cursor !== -1) {
    cells.push(cursor);
    if (cursor === sId) break;
    cursor = prev[cursor];
  }
  cells.reverse();
  const raw = [start];
  cells.forEach((id, i) => {
    if (i === 0 || i === cells.length - 1) return;
    raw.push(cellPoint(id % nx, Math.floor(id / nx)));
  });
  raw.push(end);
  const simplified = simplifyExact(raw, ownCompound, ownReaction, index);
  return simplified;
}

// 折れ線から、貫通しない範囲でできるだけ頂点を落とす。
function simplifyExact(points, ownCompound, ownReaction, index) {
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let step = points.length - 1 - i;
    while (step > 1) {
      if (routePenetrations([points[i], points[i + step]], ownCompound, ownReaction, index).length === 0) break;
      step--;
    }
    out.push(points[i + step]);
    i += step;
  }
  return R.dedupe(out);
}

/* ------------------------------------------------------------------ *
 * 4. ポート・経路
 * ------------------------------------------------------------------ */

function portFor(rect, target, forcedSide) {
  const w = rect.w;
  const h = rect.h;
  const cx = rect.x + w / 2;
  const cy = rect.y + h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const primary = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  const side = forcedSide || primary;
  let point;
  let normal;
  if (side === 'right' || side === 'left') {
    const t = Math.max(0.08, Math.min(0.92, (target.y - rect.y) / h));
    point = { x: side === 'right' ? rect.x + w : rect.x, y: rect.y + h * t };
    normal = { x: side === 'right' ? 1 : -1, y: 0 };
  } else {
    const t = Math.max(0.08, Math.min(0.92, (target.x - rect.x) / w));
    point = { x: rect.x + w * t, y: side === 'bottom' ? rect.y + h : rect.y };
    normal = { x: 0, y: side === 'bottom' ? 1 : -1 };
  }
  return {
    side: side,
    point: point,
    outside: { x: point.x + normal.x * PORT_STUB, y: point.y + normal.y * PORT_STUB }
  };
}

function routePenetrations(points, ownCompound, ownReaction, index) {
  const problems = [];
  const query = index || routeIndex;
  const ownRect = ownCompound && nodeRectsById.get(ownCompound) ? nodeRectsById.get(ownCompound).rect : null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const item of query.nodes.hitSegment(a, b, ROUTE_NODE_PAD)) {
      if (item.id === ownCompound) continue;
      if (G.segmentRect(a, b, G.inflate(item.rect, ROUTE_NODE_PAD))) problems.push('node:' + item.id);
    }
    if (ownRect && i > 0 && G.segmentRect(a, b, G.inflate(ownRect, ROUTE_NODE_PAD))) {
      problems.push('node:self');
    }
    for (const blocker of extraBlockers) {
      if (G.segmentRect(a, b, G.inflate(blocker, 1))) { problems.push('protected'); break; }
    }
    for (const item of query.labels.hitSegment(a, b, ROUTE_LABEL_PAD)) {
      if (G.segmentRect(a, b, G.inflate(item.rect, ROUTE_LABEL_PAD))) problems.push('label:' + item.id);
    }
    currentZoneObstacles.forEach((rect, zid) => {
      if (zid === ownReaction) return;
      if (G.segmentRect(a, b, rect)) problems.push('zone:' + zid);
    });
    for (const item of query.markers.hitSegment(a, b, 4)) {
      if (item.id === ownReaction) continue;
      if (G.segmentRect(a, b, G.inflate(item.rect, 4))) problems.push('marker:' + item.id);
    }
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) problems.push('zero');
  }
  return problems;
}

let currentLabels = [];
let currentMarkers = [];
let extraBlockers = [];
let currentZones = new Map();
let currentZoneRects = new Map();
let currentZoneObstacles = new Map();
let routeIndex = null;

function prepareRouteIndex(markers) {
  const nodes = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const labels = rectGridOf(currentLabels.map((label) => ({ id: label.id, rect: label.rect })));
  const markerList = Object.keys(markers).map((id) => ({
    id: id,
    rect: G.markerBox(markers[id].x, markers[id].y)
  }));
  const markerGrid = rectGridOf(markerList);
  routeIndex = { nodes: nodes, labels: labels, markers: markerGrid };
  return routeIndex;
}

function obstacleSet(excludeCompound, excludeReaction) {
  const rects = [];
  nodeRectsById.forEach((item) => {
    if (item.id !== excludeCompound) rects.push({ rect: item.rect });
  });
  currentLabels.forEach((label) => rects.push({ rect: label.rect }));
  extraBlockers.forEach((b) => rects.push({ rect: b }));
  currentZoneObstacles.forEach((rect, zid) => {
    if (zid === excludeReaction) return;
    rects.push({ rect: rect });
  });
  const discs = currentMarkers
    .filter((m) => m.id !== excludeReaction)
    .map((m) => ({ x: m.x, y: m.y, r: MARKER_R + 4 }));
  return { rects: rects, discs: discs };
}

function routingBounds() {
  return {
    x: NET.x0 - 20,
    y: NET.y0 - 20,
    w: NET.x1 - NET.x0 + 40,
    h: NET.y1 - NET.y0 + 40
  };
}

function portAt(rect, side, along) {
  const w = rect.w;
  const h = rect.h;
  let point;
  let normal;
  if (side === 'right' || side === 'left') {
    const y = G.clamp(along, rect.y + 8, rect.y + h - 8);
    point = { x: side === 'right' ? rect.x + w : rect.x, y: y };
    normal = { x: side === 'right' ? 1 : -1, y: 0 };
  } else {
    const x = G.clamp(along, rect.x + 8, rect.x + w - 8);
    point = { x: x, y: side === 'bottom' ? rect.y + h : rect.y };
    normal = { x: 0, y: side === 'bottom' ? 1 : -1 };
  }
  return {
    side: side,
    point: point,
    outside: { x: point.x + normal.x * PORT_STUB, y: point.y + normal.y * PORT_STUB }
  };
}

// 同じ物質・同じ辺に集まる配線のポートを、辺に沿って決定的に分ける。
// 近接ポートの重複線と clearance 不足を減らす（同一反応内の合流は対象外）。
function assignPorts(defs) {
  const groups = new Map();
  defs.forEach((def) => {
    const rect = nodeRectsById.get(def.compound).rect;
    const marker = def.marker;
    const base = portFor(rect, marker);
    const along = (base.side === 'right' || base.side === 'left') ? base.point.y : base.point.x;
    const key = def.compound + '|' + base.side;
    let group = groups.get(key);
    if (!group) { group = { rect: rect, side: base.side, items: [] }; groups.set(key, group); }
    group.items.push({ def: def, along: along });
  });
  const assigned = new Map();
  groups.forEach((group) => {
    const rect = group.rect;
    const side = group.side;
    const lo = (side === 'right' || side === 'left') ? rect.y + 8 : rect.x + 8;
    const hi = (side === 'right' || side === 'left') ? rect.y + rect.h - 8 : rect.x + rect.w - 8;
    const items = group.items.slice().sort((a, b) =>
      (a.along - b.along) || (a.def.key < b.def.key ? -1 : a.def.key > b.def.key ? 1 : 0));
    const spacing = 14;
    // 近接しているものだけクラスタ化し、クラスタ内を等間隔にする。
    let start = 0;
    while (start < items.length) {
      let end = start;
      while (end + 1 < items.length && items[end + 1].along - items[end].along <= spacing) end++;
      const cluster = items.slice(start, end + 1);
      if (cluster.length === 1) {
        assigned.set(cluster[0].def.key, portAt(rect, side, cluster[0].along));
      } else {
        const center = cluster.reduce((s, it) => s + it.along, 0) / cluster.length;
        const step = Math.min(spacing, Math.max(4, (hi - lo) / Math.max(1, cluster.length - 1)));
        const first = Math.max(lo, Math.min(hi, center - (step * (cluster.length - 1)) / 2));
        cluster.forEach((item, index) => {
          assigned.set(item.def.key, portAt(rect, side, first + step * index));
        });
      }
      start = end + 1;
    }
  });
  return assigned;
}

function routeEdge(edge, compoundRect, markerPoint, index, preferred, scorer) {
  const bounds = routingBounds();
  let best = null;
  let bestScore = Infinity;
  let feasible = 0;
  const take = (points) => {
    feasible++;
    if (!scorer) { best = points; return true; }
    const score = scorer(points);
    if (score < bestScore) { bestScore = score; best = points; }
    return false;
  };
  const sides = SIDES.slice().sort((a, b) => {
    if (preferred && a === preferred.side) return -1;
    if (preferred && b === preferred.side) return 1;
    const pa = portFor(compoundRect, markerPoint, a).outside;
    const pb = portFor(compoundRect, markerPoint, b).outside;
    return Math.hypot(pa.x - markerPoint.x, pa.y - markerPoint.y) -
      Math.hypot(pb.x - markerPoint.x, pb.y - markerPoint.y) ||
      (a < b ? -1 : a > b ? 1 : 0);
  });
  const clear = (points) => R.dedupe(points.map((p) => ({ x: round2(p.x), y: round2(p.y) })))
    .filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 1e-6);
  const sidePorts = sides.map((side) => ({
    side: side,
    port: (preferred && preferred.side === side) ? preferred : portFor(compoundRect, markerPoint, side)
  }));
  for (const margin of [180, 300, 440, 600]) {
    for (const entry of sidePorts) {
      const port = entry.port;
      const start = { x: port.point.x, y: port.point.y };
      const end = { x: markerPoint.x, y: markerPoint.y };
      const outside = { x: port.outside.x, y: port.outside.y };
      const away = (bend) => {
        if (entry.side === 'right') return bend.x >= start.x - 0.01;
        if (entry.side === 'left') return bend.x <= start.x + 0.01;
        if (entry.side === 'bottom') return bend.y >= start.y - 0.01;
        return bend.y <= start.y + 0.01;
      };
      const ownZone = currentZoneRects.get(edge.reaction);
      const gate = ownZone ? { x: round2(ownZone.x - 4), y: round2(end.y) } : null;
      const gateOuter = ownZone ? { x: round2(ownZone.x - 12), y: round2(end.y) } : null;
      const shapes = [];
      if (ownZone) {
        shapes.push([start, outside, gateOuter, gate, end]);
        shapes.push([start, outside, { x: gateOuter.x, y: outside.y }, gateOuter, gate, end]);
      }
      shapes.push([start, outside, end]);
      if (away({ x: end.x, y: outside.y })) shapes.push([start, outside, { x: end.x, y: outside.y }, end]);
      if (away({ x: outside.x, y: end.y })) shapes.push([start, outside, { x: outside.x, y: end.y }, end]);
      shapes.push([start, outside, { x: end.x, y: outside.y }, end]);
      shapes.push([start, outside, { x: outside.x, y: end.y }, end]);
      for (const points of shapes) {
        const cleaned = clear(points);
        if (cleaned.length < 2) continue;
        if (routePenetrations(cleaned, edge.compound, edge.reaction, index).length === 0) {
          if (take(cleaned)) return cleaned;
        }
      }
      // 終点まわりの迂回（他マーカーの環を避ける）。
      for (const radius of [24, 34, 46, 60, 78]) {
        for (let ai = 0; ai < 16; ai++) {
          const angle = (hash32(edge.key + '|' + radius + '|' + ai) % 628) / 100;
          const waypoint = { x: end.x + Math.cos(angle) * radius, y: end.y + Math.sin(angle) * radius };
          const viaOutside = clear([start, outside, waypoint, end]);
          if (viaOutside.length >= 3 &&
            routePenetrations(viaOutside, edge.compound, edge.reaction, index).length === 0) {
            if (take(viaOutside)) return viaOutside;
          }
        }
      }
      if (scorer && feasible >= 3) continue;
      const fineEnd = ownZone ? gateOuter : end;
      const fine = fineRoute(port.outside, fineEnd, edge.compound, edge.reaction, index);
      if (fine && fine.length >= 2) {
        const tail = ownZone ? [gate, end] : [];
        const withPort = R.dedupe([{ x: round2(port.point.x), y: round2(port.point.y) }]
          .concat(fine, tail));
        if (routePenetrations(withPort, edge.compound, edge.reaction, index).length === 0) {
          if (take(withPort)) return withPort;
        }
      }
      const obstacles = obstacleSet(edge.compound, edge.reaction);
      let path = R.gridRoute(port.outside, markerPoint, obstacles, bounds, { margin: margin, primary: false });
      if (!path) continue;
      path = R.simplifyPath(path, obstacles, ROUTE_NODE_PAD);
      const gridPoints = path.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
      const points = R.dedupe([{ x: round2(port.point.x), y: round2(port.point.y) }].concat(gridPoints));
      points[points.length - 1] = { x: round2(markerPoint.x), y: round2(markerPoint.y) };
      if (points.length < 2) continue;
      if (routePenetrations(points, edge.compound, edge.reaction, index).length === 0) {
        if (take(points)) return points;
      }
    }
  }
  return best;
}

function makeIncrementalSegIndex(cellSize) {
  const cs = cellSize || 64;
  const grid = new Map();
  const segs = [];
  return {
    addRoute: function (reactionId, points) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const index = segs.length;
        segs.push({ reaction: reactionId, a: a, b: b });
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
          for (let cy = Math.floor(minY / cs); cy <= Math.floor(maxY / cs); cy++) {
            const key = cx + ',' + cy;
            let bucket = grid.get(key);
            if (!bucket) { bucket = []; grid.set(key, bucket); }
            bucket.push(index);
          }
        }
      }
    },
    crossings: function (points, excludeReaction) {
      let count = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
          for (let cy = Math.floor(minY / cs); cy <= Math.floor(maxY / cs); cy++) {
            const bucket = grid.get(cx + ',' + cy);
            if (!bucket) continue;
            const seen = new Set();
            for (const index of bucket) {
              if (seen.has(index)) continue;
              seen.add(index);
              const other = segs[index];
              if (other.reaction === excludeReaction) continue;
              if (G.segSegIntersection(a, b, other.a, other.b)) count++;
            }
          }
        }
      }
      return count;
    }
  };
}

// 交差を優先して 1 本ずつ配線する（貪欲）。最後の仕上げにだけ使う。
function buildRoutesGreedy(reactions, markers) {
  const routes = {};
  const failures = [];
  const index = prepareRouteIndex(markers);
  const defs = [];
  reactions.forEach((reaction) => {
    const marker = markers[reaction.id];
    if (!marker) throw new Error('通常配置案: マーカーがない: ' + reaction.id);
    reaction.substrates.forEach((id) => defs.push({
      key: reaction.id + '|in|' + id, reaction: reaction.id, dir: 'in', compound: id,
      tier: reaction.tier, marker: marker
    }));
    reaction.products.forEach((id) => defs.push({
      key: reaction.id + '|out|' + id, reaction: reaction.id, dir: 'out', compound: id,
      tier: reaction.tier, marker: marker
    }));
  });
  defs.forEach((def) => {
    const rect = nodeRectsById.get(def.compound).rect;
    const c = centerOf(rect);
    def.straight = Math.hypot(def.marker.x - c.x, def.marker.y - c.y);
  });
  defs.sort((a, b) => (a.straight - b.straight) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const segIndex = makeIncrementalSegIndex(64);
  defs.forEach((def) => {
    const rect = rectOf(nodeRectsById.get(def.compound).rect);
    const scorer = (points) =>
      segIndex.crossings(points, def.reaction) * 8 +
      polylineLength(points) * 0.06 +
      (points.length - 2) * 2;
    const points = routeEdge(def, rect, def.marker, index, undefined, scorer);
    if (!points) { failures.push(def.key); return; }
    routes[def.key] = {
      reaction: def.reaction,
      dir: def.dir,
      compound: def.compound,
      tier: def.tier,
      points: points,
      gaps: [],
      bridges: []
    };
    segIndex.addRoute(def.reaction, points);
  });
  return { routes: routes, failures: failures };
}

/* 異なる反応の完全重複区間（同一区間の重なり）を減らす。 */
function collectOverlapPairs(routes) {
  const segs = [];
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    for (let i = 0; i < route.points.length - 1; i++) {
      segs.push({ key: key, reaction: route.reaction, a: route.points[i], b: route.points[i + 1] });
    }
  });
  const pairs = [];
  for (let i = 0; i < segs.length; i++) {
    const A = segs[i];
    const minXA = Math.min(A.a.x, A.b.x);
    const maxXA = Math.max(A.a.x, A.b.x);
    const minYA = Math.min(A.a.y, A.b.y);
    const maxYA = Math.max(A.a.y, A.b.y);
    for (let j = i + 1; j < segs.length; j++) {
      const B = segs[j];
      if (A.reaction === B.reaction) continue;
      if (Math.max(B.a.x, B.b.x) < minXA - 2 || Math.min(B.a.x, B.b.x) > maxXA + 2 ||
          Math.max(B.a.y, B.b.y) < minYA - 2 || Math.min(B.a.y, B.b.y) > maxYA + 2) continue;
      if (G.collinearOverlap(A.a, A.b, B.a, B.b) > 2) {
        pairs.push(A.key < B.key ? [A.key, B.key] : [B.key, A.key]);
      }
    }
  }
  return pairs;
}

function countOverlapsForKey(routes, key) {
  const route = routes[key];
  let count = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    Object.keys(routes).forEach((otherKey) => {
      if (otherKey === key) return;
      const other = routes[otherKey];
      if (other.reaction === route.reaction) return;
      for (let j = 0; j < other.points.length - 1; j++) {
        if (G.collinearOverlap(a, b, other.points[j], other.points[j + 1]) > 2) count++;
      }
    });
  }
  return count;
}

function countCrossingsForKey(routes, key) {
  const route = routes[key];
  let count = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    Object.keys(routes).forEach((otherKey) => {
      if (otherKey === key) return;
      const other = routes[otherKey];
      if (other.reaction === route.reaction) return;
      for (let j = 0; j < other.points.length - 1; j++) {
        if (G.segSegIntersection(a, b, other.points[j], other.points[j + 1])) count++;
      }
    });
  }
  return count;
}

function repairRouteOverlaps(routes, markers) {
  const index = prepareRouteIndex(markers);
  for (let pass = 0; pass < 2; pass++) {
    const pairs = collectOverlapPairs(routes);
    if (!pairs.length) break;
    let changed = false;
    const tried = new Set();
    for (const pair of pairs) {
      for (const key of [pair[1], pair[0]]) {
        if (tried.has(key)) continue;
        const route = routes[key];
        if (!route) continue;
        const rect = nodeRectsById.get(route.compound).rect;
        const marker = markers[route.reaction];
        const before = countOverlapsForKey(routes, key);
        if (!before) continue;
        const beforeCross = countCrossingsForKey(routes, key);
        const basePort = portFor(rect, marker);
        const along = (basePort.side === 'right' || basePort.side === 'left') ? basePort.point.y : basePort.point.x;
        let accepted = false;
        for (const offset of [12, -12, 20, -20, 28, -28]) {
          const preferred = portAt(rect, basePort.side, along + offset);
          const points = routeEdge(route, rectOf(rect), marker, index, preferred);
          if (!points) continue;
          const saved = route.points;
          route.points = points;
          const after = countOverlapsForKey(routes, key);
          const afterCross = countCrossingsForKey(routes, key);
          if (after < before && afterCross <= beforeCross) {
            accepted = true;
            changed = true;
            break;
          }
          route.points = saved;
        }
        if (accepted) { tried.add(key); break; }
        tried.add(key);
      }
    }
    if (!changed) break;
  }
  return routes;
}

function buildRoutesFor(reactions, markers, onlyIds) {
  const routes = {};
  const failures = [];
  const index = prepareRouteIndex(markers);
  const defs = [];
  reactions.forEach((reaction) => {
    if (onlyIds && !onlyIds.has(reaction.id)) return;
    const marker = markers[reaction.id];
    if (!marker) throw new Error('通常配置案: マーカーがない: ' + reaction.id);
    reaction.substrates.forEach((id) => {
      defs.push({
        key: reaction.id + '|in|' + id,
        reaction: reaction.id,
        dir: 'in',
        compound: id,
        tier: reaction.tier,
        marker: marker
      });
    });
    reaction.products.forEach((id) => {
      defs.push({
        key: reaction.id + '|out|' + id,
        reaction: reaction.id,
        dir: 'out',
        compound: id,
        tier: reaction.tier,
        marker: marker
      });
    });
  });
  const ports = null;
  defs.forEach((def) => {
    const points = routeEdge(def, rectOf(nodeRectsById.get(def.compound).rect), def.marker, index,
      ports ? ports.get(def.key) : undefined);
    if (!points) { failures.push(def.key); return; }
    routes[def.key] = {
      reaction: def.reaction,
      dir: def.dir,
      compound: def.compound,
      tier: def.tier,
      points: points,
      gaps: [],
      bridges: []
    };
  });
  return { routes: routes, failures: failures };
}

/* ------------------------------------------------------------------ *
 * 5. ラベル（A 担当ソルバを最終パスで使う。無い場合は scaffold）
 * ------------------------------------------------------------------ */

function labelScaffold(reactions, markers) {
  const labels = {};
  const placed = [];
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.values()));
  const ordered = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offsets = (size) => [
    { x: 10, y: -size.h / 2 },
    { x: -10 - size.w, y: -size.h / 2 },
    { x: 10, y: -size.h - 6 },
    { x: -10 - size.w, y: -size.h - 6 },
    { x: 10, y: 6 },
    { x: -10 - size.w, y: 6 },
    { x: -size.w / 2, y: -size.h - 14 },
    { x: -size.w / 2, y: 14 },
    { x: -size.w / 2, y: -size.h / 2 }
  ];
  const free = (box, ownId) => {
    if (box.x < NET.x0 || box.y < NET.y0 || box.x + box.w > NET.x1 || box.y + box.h > NET.y1) return false;
    for (const hit of nodeGrid.hitSegment({ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, LABEL_PAD)) {
      if (G.rectsOverlap(inflate(box, LABEL_PAD), hit.rect)) return false;
    }
    for (const marker of currentMarkers) {
      if (G.rectsOverlap(inflate(box, LABEL_PAD), G.markerBox(marker.x, marker.y))) return false;
    }
    for (const item of placed) {
      if (item.id === ownId) continue;
      if (G.rectsOverlap(inflate(box, LABEL_PAD), item.box)) return false;
    }
    return true;
  };
  ordered.forEach((reaction) => {
    const marker = markers[reaction.id];
    const size = { w: labelWidth(reaction.typeLabel), h: TYPE_H };
    for (const offset of offsets(size)) {
      const box = { x: round2(marker.x + offset.x), y: round2(marker.y + offset.y), w: size.w, h: size.h };
      if (!free(box, reaction.id)) continue;
      labels[reaction.id] = {
        side: box.x + box.w / 2 >= marker.x ? 'E' : 'W',
        type: { x: round2(box.x + box.w / 2), y: round2(box.y + box.h / 2) },
        cond: null,
        box: box,
        leader: null
      };
      placed.push({ id: reaction.id, box: box });
      break;
    }
  });
  return { labels: labels, metrics: {}, summary: { targets: ordered.length, placed: Object.keys(labels).length } };
}

function solveLabels(reactions, markers, routes, actualLines) {
  currentMarkers = Object.keys(markers).map((id) => ({ id: id, x: markers[id].x, y: markers[id].y }));
  const lines = {};
  if (actualLines) {
    Object.keys(actualLines).forEach((rid) => {
      lines[rid] = actualLines[rid].map((poly) => poly.map((p) => ({ x: p.x, y: p.y })));
    });
  } else {
    Object.keys(routes).forEach((key) => {
      const route = routes[key];
      if (!lines[route.reaction]) lines[route.reaction] = [];
      lines[route.reaction].push(route.points);
    });
  }
  if (!LabelSolver || typeof LabelSolver.solveLabels !== 'function') {
    return labelScaffold(reactions, markers);
  }
  const reactionMap = {};
  reactions.forEach((r) => {
    reactionMap[r.id] = {
      x: markers[r.id].x,
      y: markers[r.id].y,
      tier: r.tier,
      typeLabel: r.typeLabel,
      conditions: r.conditions || '',
      substrates: r.substrates,
      products: r.products
    };
  });
  const compounds = {};
  nodeRectsById.forEach((item, id) => { compounds[id] = { x: item.rect.x, y: item.rect.y, w: item.rect.w, h: item.rect.h }; });
  const blockers = currentClassRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  let result = null;
  try {
    result = LabelSolver.solveLabels({
      compounds: compounds,
      reactions: reactionMap,
      edges: routes,
      lines: lines,
      labels: {},
      blockers: blockers
    }, {
      width: labelWidth,
      typeH: TYPE_H,
      targets: Object.keys(reactionMap),
      repairPasses: 6,
      ownTarget: 18,
      foreignMargin: 5,
      maxLeader: 64,
      gaps: [4, 8, 12, 16],
      leaderGaps: [20, 28, 36, 44, 52, 60],
      anchorStep: 10,
      maxAnchorsPerReaction: 128,
      bounds: { x: 0, y: 0, w: NET.x1 + 40, h: NET.y1 + 40 }
    });
  } catch (err) {
    result = null;
  }
  if (!result || !result.labels) return labelScaffold(reactions, markers);
  const labels = {};
  Object.keys(result.labels).forEach((id) => {
    const label = result.labels[id];
    if (!label || !label.box || !label.type) return;
    labels[id] = {
      side: label.side || (label.box.x + label.box.w / 2 >= markers[id].x ? 'E' : 'W'),
      type: { x: round2(label.type.x), y: round2(label.type.y) },
      cond: null,
      box: { x: round2(label.box.x), y: round2(label.box.y), w: round2(label.box.w), h: round2(label.box.h) },
      leader: normalizeLeader(label.leader)
    };
  });
  const summary = Object.assign({ targets: reactions.length }, result.summary || {});
  return { labels: labels, metrics: result.metrics || {}, summary: summary };
}

let currentClassRects = [];

/* ------------------------------------------------------------------ *
 * 6. 交差数（局所最適化用の近似）
 * ------------------------------------------------------------------ */

function routeSegments(routes) {
  const segs = [];
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    for (let i = 0; i < route.points.length - 1; i++) {
      segs.push({
        key: key,
        reaction: route.reaction,
        compound: route.compound,
        a: route.points[i],
        b: route.points[i + 1]
      });
    }
  });
  return segs;
}

function segmentGrid(segs, cellSize) {
  const cs = cellSize || 96;
  const grid = new Map();
  segs.forEach((seg, index) => {
    const minX = Math.min(seg.a.x, seg.b.x);
    const maxX = Math.max(seg.a.x, seg.b.x);
    const minY = Math.min(seg.a.y, seg.b.y);
    const maxY = Math.max(seg.a.y, seg.b.y);
    for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
      for (let cy = Math.floor(minY / cs); cy <= Math.floor(maxY / cs); cy++) {
        const key = cx + ',' + cy;
        let bucket = grid.get(key);
        if (!bucket) { bucket = []; grid.set(key, bucket); }
        bucket.push(index);
      }
    }
  });
  return { cell: cs, grid: grid, segs: segs };
}

function countCrossingsFor(segIndex, candidateSegs, excludedReactions) {
  let count = 0;
  for (const seg of candidateSegs) {
    const minX = Math.min(seg.a.x, seg.b.x);
    const maxX = Math.max(seg.a.x, seg.b.x);
    const minY = Math.min(seg.a.y, seg.b.y);
    const maxY = Math.max(seg.a.y, seg.b.y);
    const cs = segIndex.cell;
    for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
      for (let cy = Math.floor(minY / cs); cy <= Math.floor(maxY / cs); cy++) {
        const bucket = segIndex.grid.get(cx + ',' + cy);
        if (!bucket) continue;
        const seen = new Set();
        for (const index of bucket) {
          if (seen.has(index)) continue;
          seen.add(index);
          const other = segIndex.segs[index];
          if (other.reaction === seg.reaction || excludedReactions.has(other.reaction)) continue;
          if (G.segSegIntersection(seg.a, seg.b, other.a, other.b)) count++;
        }
      }
    }
  }
  return count;
}

function countNearSegments(segIndex, point, radius) {
  const cs = segIndex.cell;
  const seen = new Set();
  let count = 0;
  for (let cx = Math.floor((point.x - radius) / cs); cx <= Math.floor((point.x + radius) / cs); cx++) {
    for (let cy = Math.floor((point.y - radius) / cs); cy <= Math.floor((point.y + radius) / cs); cy++) {
      const bucket = segIndex.grid.get(cx + ',' + cy);
      if (!bucket) continue;
      for (const index of bucket) {
        if (seen.has(index)) continue;
        seen.add(index);
        const seg = segIndex.segs[index];
        if (G.distPointSeg(point, seg.a, seg.b) <= radius) count++;
      }
    }
  }
  return count;
}

function optimizeMarkers(reactions, markers, routes) {
  const nodeGrid = rectGridOf(Array.from(nodeRectsById.entries())
    .map((entry) => ({ id: entry[0], rect: entry[1].rect })));
  const classGrid = rectGridOf(currentClassRects);
  let segs = routeSegments(routes);
  let index = segmentGrid(segs);
  const reactionById = new Map(reactions.map((r) => [r.id, r]));

  const order = reactions.map((r) => r.id).sort((a, b) => (a < b ? -1 : 1));
  for (let sweep = 0; sweep < 2; sweep++) for (const rid of order) {
    const reaction = reactionById.get(rid);
    const marker = markers[rid];
    const ends = reaction.substrates.concat(reaction.products);
    let sx = 0;
    let sy = 0;
    ends.forEach((id) => {
      const p = nodeRectsById.get(id).rect;
      sx += p.x + p.w / 2;
      sy += p.y + p.h / 2;
    });
    const base = { x: sx / ends.length, y: sy / ends.length };
    const baseAngle = (hash32(rid) % 628) / 100;

    // 現在の反応ぶんを index から除外し、他反応だけの index を作る。
    const ownKeys = new Set(Object.keys(routes).filter((key) => routes[key].reaction === rid));
    const others = index.segs.filter((s) => s.reaction !== rid);
    const otherIndex = segmentGrid(others);
    const currentSegs = routeSegments(routes).filter((s) => s.reaction === rid);
    let best = {
      cross: countCrossingsFor(otherIndex, currentSegs, new Set()),
      extra: extraPointsOfReaction(routes, rid),
      length: ownLength(routes, ownKeys),
      marker: marker
    };
    best.cost = best.cross + best.extra * 3;
    for (let i = 0; i < 120; i++) {
      const spec = markerSpiral(i, baseAngle);
      if (!spec) break;
      const candidate = spec.radius === 0 ? base : {
        x: base.x + Math.cos(spec.angle) * spec.radius,
        y: base.y + Math.sin(spec.angle) * spec.radius
      };
      const dist = Math.hypot(candidate.x - marker.x, candidate.y - marker.y);
      if (dist > 320) continue;
      const p = { x: round2(candidate.x), y: round2(candidate.y) };
      if (p.x < NET.x0 + 14 || p.x > NET.x1 - 14 || p.y < NET.y0 + 14 || p.y > NET.y1 - 14) continue;
      if (!markerFreeFor(p, rid, markers, nodeGrid, classGrid)) continue;
      const attempt = buildRoutesFor([reaction], Object.assign({}, markers, { [rid]: p }), new Set([rid]));
      if (attempt.failures.length) continue;
      const ownSegs = routeSegments(attempt.routes);
      const cross = countCrossingsFor(otherIndex, ownSegs, new Set());
      const extra = extraPointsOfReaction(attempt.routes, rid);
      const length = ownLength(attempt.routes, new Set(Object.keys(attempt.routes)));
      const cost = cross + extra * 3;
      if (cost > best.cost) continue;
      if (cost < best.cost || length < best.length - 0.5) {
        best = { cross: cross, extra: extra, length: length, cost: cost, marker: p, routes: attempt.routes };
      }
    }
    if (best.marker !== marker) {
      markers[rid] = best.marker;
      Object.keys(best.routes || {}).forEach((key) => { routes[key] = best.routes[key]; });
      segs = routeSegments(routes);
      index = segmentGrid(segs);
    }
  }
  return { markers: markers, routes: routes };
}

function extraPoints(routes) {
  let extra = 0;
  Object.keys(routes).forEach((key) => { extra += Math.max(0, routes[key].points.length - 2); });
  return extra;
}

function extraPointsOfReaction(routes, rid) {
  let extra = 0;
  Object.keys(routes).forEach((key) => {
    if (routes[key].reaction !== rid) return;
    extra += Math.max(0, routes[key].points.length - 2);
  });
  return extra;
}

function ownLength(routes, keys) {
  let sum = 0;
  keys.forEach((key) => {
    const pts = routes[key].points;
    for (let i = 0; i < pts.length - 1; i++) sum += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  });
  return sum;
}

function markerFreeFor(p, ownId, markers, nodeGrid, classGrid) {
  for (const hit of nodeGrid.nearPoint(p, MARKER_R + MARKER_NODE_CLEAR)) {
    if (G.distPointRect(p, hit.rect) < MARKER_R + MARKER_NODE_CLEAR) return false;
  }
  for (const hit of classGrid.nearPoint(p, MARKER_R + 8)) {
    if (G.distPointRect(p, hit.rect) < MARKER_R + 8) return false;
  }
  for (const id of Object.keys(markers)) {
    if (id === ownId) continue;
    if (Math.hypot(p.x - markers[id].x, p.y - markers[id].y) < MARKER_MIN_DIST) return false;
  }
  return true;
}

function normalizeLeader(leader) {
  if (!leader) return null;
  if (!Array.isArray(leader) || leader.length < 2) return null;
  return leader.map((p) => (Array.isArray(p)
    ? { x: round2(p[0]), y: round2(p[1]) }
    : { x: round2(p.x), y: round2(p.y) }));
}

// 導線（leader）の幾何検証。A の最終契約と同じ「自線の接続点 ↔ ラベル枠境界」を満たさない
// leader は破棄する（ラベル自体は残す）。数値の欠落はデータ不正として fail-closed。
function validateLabelLeaders(labels, markers, routes, nodeRects, actualLines) {
  const dropped = [];
  const short = [];
  const extended = [];
  const byReaction = new Map();
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    if (!byReaction.has(route.reaction)) byReaction.set(route.reaction, []);
    byReaction.get(route.reaction).push(route.points);
  });
  const labelList = Object.keys(labels).map((id) => ({ id: id, rect: labels[id].box }));
  const markerList = Object.keys(markers).map((id) => ({ id: id, x: markers[id].x, y: markers[id].y }));

  const geometryOk = (id) => {
    const leader = labels[id].leader;
    const box = labels[id].box;
    const first = leader[0];
    const last = leader[leader.length - 1];
    if (G.distPointRect(first, box) > 0.75) return false;
    const ownPolys = actualLines && actualLines[id]
      ? actualLines[id]
      : (byReaction.get(id) || []);
    let best = Infinity;
    ownPolys.forEach((poly) => {
      for (let i = 0; i < poly.length - 1; i++) {
        best = Math.min(best, G.distPointSeg(last, poly[i], poly[i + 1]));
      }
    });
    if (!(best <= 2)) return false;
    if (polylineLength(leader) > 80 + 1e-6) return false;
    for (let i = 0; i < leader.length - 1; i++) {
      const a = leader[i];
      const b = leader[i + 1];
      for (const item of nodeRects) {
        if (G.segmentRect(a, b, G.inflate(item.rect, 1))) return false;
      }
      for (const item of labelList) {
        if (item.id === id) continue;
        if (G.segmentRect(a, b, G.inflate(item.rect, 0.5))) return false;
      }
      for (const item of markerList) {
        if (item.id === id) continue;
        if (G.segmentRect(a, b, G.inflate(G.markerBox(item.x, item.y), 1))) return false;
      }
      const foreignLines = actualLines || {};
      for (const rid of Object.keys(foreignLines)) {
        if (rid === id) continue;
        for (const poly of foreignLines[rid]) {
          for (let k = 0; k < poly.length - 1; k++) {
            if (G.segSegDistance(a, b, poly[k], poly[k + 1]) < 1) return false;
          }
        }
      }
      for (const oid of Object.keys(labels)) {
        if (oid === id) continue;
        const ol = labels[oid] && labels[oid].leader;
        if (!ol) continue;
        for (let k = 0; k < ol.length - 1; k++) {
          if (G.segSegDistance(a, b, ol[k], ol[k + 1]) < 1) return false;
        }
      }
    }
    return true;
  };

  Object.keys(labels).forEach((id) => {
    if (!labels[id].leader) return;
    labels[id].leader.forEach((p) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new Error('通常配置案: leader に非有限点: ' + id);
      }
    });
    if (!geometryOk(id)) {
      labels[id].leader = null;
      dropped.push(id);
    } else if (polylineLength(labels[id].leader) > 48 + 1e-6) {
      extended.push(id);
    } else {
      short.push(id);
    }
  });
  return { dropped: dropped, short: short, extended: extended };
}

/* ------------------------------------------------------------------ *
 * 7. 自己計測（metrics.cjs と同じ定義）
 * ------------------------------------------------------------------ */

function measure(positions, markers, labels, routes, classRects) {
  const nodeRects = [];
  Object.keys(positions).forEach((id) => nodeRects.push({ id: id, rect: rectOf(positions[id]) }));
  let nodeOverlaps = 0;
  for (let i = 0; i < nodeRects.length; i++) {
    for (let j = i + 1; j < nodeRects.length; j++) {
      if (G.rectsOverlap(nodeRects[i].rect, nodeRects[j].rect)) nodeOverlaps++;
    }
  }
  let markerNode = 0;
  let markerMarker = 0;
  const markerIds = Object.keys(markers).sort();
  markerIds.forEach((id, i) => {
    const m = markers[id];
    nodeRects.forEach((n) => {
      if (G.distPointRect({ x: m.x, y: m.y }, n.rect) < MARKER_R + 2) markerNode++;
    });
    for (let j = i + 1; j < markerIds.length; j++) {
      const o = markers[markerIds[j]];
      if (Math.hypot(m.x - o.x, m.y - o.y) < 22) markerMarker++;
    }
  });

  const labelList = markerIds.map((id) => ({ id: id, rect: labels[id].box }));
  let labelNode = 0;
  let labelLabel = 0;
  let labelMarker = 0;
  labelList.forEach((label, i) => {
    nodeRects.forEach((n) => { if (G.rectsOverlap(G.inflate(label.rect, 1), n.rect)) labelNode++; });
    markerIds.forEach((id) => {
      if (G.rectsOverlap(G.inflate(label.rect, 1), G.markerBox(markers[id].x, markers[id].y))) labelMarker++;
    });
    for (let j = i + 1; j < labelList.length; j++) {
      if (labelList[i].id === labelList[j].id) continue;
      if (G.rectsOverlap(G.inflate(label.rect, 1), G.inflate(labelList[j].rect, 1))) labelLabel++;
    }
  });
  let labelClass = 0;
  labelList.forEach((label) => {
    classRects.forEach((r) => { if (G.rectsOverlap(label.rect, r)) labelClass++; });
  });

  let nodePenetrations = 0;
  let labelPenetrations = 0;
  let markerPenetrations = 0;
  let endpointPenetrations = 0;
  let totalLength = 0;
  const hitNode = new Set();
  const hitLabel = new Set();
  const hitMarker = new Set();
  const hitEndpoint = new Set();
  const segs = [];
  Object.keys(routes).forEach((key) => {
    const route = routes[key];
    const pts = route.points;
    totalLength += polylineLength(pts);
    const endNode = nodeRectsById.get(route.compound);
    let ownDistance = Infinity;
    if (endNode) {
      pts.forEach((p) => { ownDistance = Math.min(ownDistance, G.distPointRect(p, endNode.rect)); });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      segs.push({ key: key, reaction: route.reaction, compound: route.compound, a: a, b: b });
      if (endNode) {
        if (G.segmentRect(a, b, G.inflate(endNode.rect, -0.5)) && ownDistance > 12) {
          hitEndpoint.add(key);
        }
      }
      nodeRects.forEach((n) => {
        if (n.id === route.compound) return;
        if (G.segmentRect(a, b, G.inflate(n.rect, -0.5))) hitNode.add(key + '|' + n.id);
      });
      labelList.forEach((l) => {
        if (G.segmentRect(a, b, G.inflate(l.rect, -0.5))) hitLabel.add(key + '|' + l.id);
      });
      markerIds.forEach((id) => {
        if (id === route.reaction) return;
        if (G.segmentRect(a, b, G.inflate(G.markerBox(markers[id].x, markers[id].y), 2))) hitMarker.add(key + '|' + id);
      });
    }
  });
  nodePenetrations = hitNode.size;
  labelPenetrations = hitLabel.size;
  markerPenetrations = hitMarker.size;
  endpointPenetrations = hitEndpoint.size;

  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    const A = segs[i];
    const minX = Math.min(A.a.x, A.b.x);
    const maxX = Math.max(A.a.x, A.b.x);
    const minY = Math.min(A.a.y, A.b.y);
    const maxY = Math.max(A.a.y, A.b.y);
    for (let j = i + 1; j < segs.length; j++) {
      const B = segs[j];
      if (A.reaction === B.reaction) continue;
      if (Math.max(B.a.x, B.b.x) < minX || Math.min(B.a.x, B.b.x) > maxX ||
          Math.max(B.a.y, B.b.y) < minY || Math.min(B.a.y, B.b.y) > maxY) continue;
      const hit = G.segSegIntersection(A.a, A.b, B.a, B.b);
      if (!hit) continue;
      if (A.compound === B.compound &&
          Math.hypot(hit.x - A.a.x, hit.y - A.a.y) <= 8 &&
          Math.hypot(hit.x - B.a.x, hit.y - B.a.y) <= 8) continue;
      crossings++;
    }
  }

  return {
    nodeOverlaps: nodeOverlaps,
    markerNodeCollisions: markerNode,
    markerMarkerCollisions: markerMarker,
    labelNodeCollisions: labelNode,
    labelLabelCollisions: labelLabel,
    labelMarkerCollisions: labelMarker,
    labelClassMapOverlaps: labelClass,
    routeNodePenetrations: nodePenetrations,
    routeLabelPenetrations: labelPenetrations,
    routeMarkerPenetrations: markerPenetrations,
    endpointPenetrations: endpointPenetrations,
    crossingPairs: crossings,
    totalLength: round2(totalLength)
  };
}

function polylineLength(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return sum;
}

/* ------------------------------------------------------------------ *
 * 8. エントリポイント
 * ------------------------------------------------------------------ */

function summarize(values) {
  const arr = values.slice().sort((a, b) => a - b);
  if (!arr.length) return { count: 0, total: 0, mean: 0, median: 0, p95: 0, max: 0, ge1000: 0 };
  const total = arr.reduce((s, v) => s + v, 0);
  const median = arr.length % 2 ? arr[(arr.length - 1) / 2] :
    (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;
  return {
    count: arr.length,
    total: round2(total),
    mean: round2(total / arr.length),
    median: round2(median),
    p95: round2(arr[Math.min(arr.length - 1, Math.ceil(arr.length * 0.95) - 1)]),
    max: round2(arr[arr.length - 1]),
    ge1000: arr.filter((v) => v >= 1000).length
  };
}

function packShelf(isolated, positions) {
  const ordered = isolated.slice().sort((a, b) =>
    (a.regionIndex - b.regionIndex) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let maxX = SHELF.x;
  let maxY = SHELF.y;
  ordered.forEach((c, i) => {
    const col = i % SHELF.cols;
    const row = Math.floor(i / SHELF.cols);
    const x = SHELF.x + col * SHELF.pitchX;
    const y = SHELF.y + row * SHELF.pitchY;
    positions[c.id] = { x: round2(x), y: round2(y), w: c.w, h: c.h };
    maxX = Math.max(maxX, x + c.w);
    maxY = Math.max(maxY, y + c.h);
  });
  return {
    x: SHELF.x,
    y: SHELF.y,
    w: round2(maxX - SHELF.x),
    h: round2(maxY - SHELF.y),
    cols: SHELF.cols,
    count: ordered.length
  };
}

function buildRegionFocus(compounds, connected, positions, isolated) {
  const regions = [];
  const seen = new Set();
  compounds.forEach((c) => { if (!seen.has(c.region)) { seen.add(c.region); regions.push(c.region); } });
  const focus = {};
  regions.forEach((region) => {
    const connectedHere = connected.filter((c) => c.region === region);
    const list = connectedHere.length ? connectedHere : isolated.filter((c) => c.region === region);
    if (!list.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    list.forEach((c) => {
      const p = positions[c.id];
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    });
    const pad = 28;
    focus[region] = {
      x: round2(minX - pad),
      y: round2(minY - pad),
      w: round2(maxX - minX + pad * 2),
      h: round2(maxY - minY + pad * 2),
      connected: connectedHere.length > 0
    };
  });
  return focus;
}

function canvasBounds(positions, markers, classRects, shelf) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  Object.keys(positions).forEach((id) => {
    const p = positions[id];
    grow(p.x, p.y);
    grow(p.x + p.w, p.y + p.h);
  });
  classRects.forEach((r) => {
    grow(r.x, r.y);
    grow(r.x + r.w, r.y + r.h);
  });
  Object.keys(markers).forEach((id) => {
    const m = markers[id];
    grow(m.x - 10, m.y - 10);
    grow(m.x + 10, m.y + 10);
    if (!m.label || !m.label.box) return;
    const b = m.label.box;
    grow(b.x, b.y);
    grow(b.x + b.w, b.y + b.h);
  });
  const pad = 40;
  return {
    x: 0,
    y: 0,
    w: round2(Math.max(maxX, 0) + pad),
    h: round2(Math.max(maxY, 0) + pad)
  };
}

/* ------------------------------------------------------------------ *
 * Zone 方式（marker + label + owner stub を保護矩形として予約し、
 * foreign route は zone を避ける。label の帰属を構成的に保証する）
 * ------------------------------------------------------------------ */

function buildLayoutZoned(input) {
  currentZones = new Map();
  currentZoneRects = new Map();
  currentZoneObstacles = new Map();
  const nodeW = input.nodeW || NODE_W;
  const nodeH = input.nodeH || NODE_H;
  const compounds = input.compounds.map((c) => ({
    id: c.id, x: null, y: null, w: c.w || nodeW, h: c.h || nodeH,
    region: c.region || 'unknown', regionIndex: c.regionIndex == null ? 999 : c.regionIndex,
    incoming: c.incoming || 0, outgoing: c.outgoing || 0
  }));
  const byId = new Map(compounds.map((c) => [c.id, c]));
  const reactions = input.reactions.map((r) => {
    const subs = r.substrates.slice();
    const prods = r.products.slice();
    subs.concat(prods).forEach((id) => {
      if (!byId.has(id)) throw new Error('通常配置案: 未知の物質ID: ' + id);
    });
    return { id: r.id, tier: r.tier, typeLabel: r.typeLabel, conditions: r.conditions || '',
      substrates: subs, products: prods };
  });
  const endpointIds = new Set();
  reactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => endpointIds.add(id)));
  const connected = compounds.filter((c) => endpointIds.has(c.id));
  const isolated = compounds.filter((c) => !endpointIds.has(c.id));

  // 反応 zone（marker 左 + label 右 + 24px 余白）
  const ZONE_PAD = 24;
  const zoneOf = (reaction) => {
    const labelW = labelWidth(reaction.typeLabel);
    return { w: labelW + 24 + 8 + ZONE_PAD, h: 16 + ZONE_PAD * 2 };
  };

  // --- compound と reaction zone を同時に配置（force + 矩形分離） ---
  const componentOf = componentIndexOf(connected, reactions);
  const compSeeds = seedPositions(connected, componentOf, 'component',
    (input.tuning && input.tuning.seedSalt != null) ? input.tuning.seedSalt : 'k');
  const zoneOrder = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const items = [];
  connected.forEach((c) => {
    const seed = compSeeds.get(c.id);
    items.push({ key: 'c:' + c.id, type: 'c', ref: c, w: c.w, h: c.h,
      x: seed.x, y: seed.y, regionIndex: c.regionIndex });
  });
  const zoneItems = new Map();
  zoneOrder.forEach((reaction, index) => {
    const size = zoneOf(reaction);
    const ends = reaction.substrates.concat(reaction.products);
    let sx = 0;
    let sy = 0;
    ends.forEach((id) => { const seed = compSeeds.get(id); sx += seed.x; sy += seed.y; });
    const base = { x: sx / ends.length + 140, y: sy / ends.length + (index % 5) * 24 - 48 };
    const item = { key: 'z:' + reaction.id, type: 'z', ref: reaction, w: size.w, h: size.h,
      x: base.x, y: base.y, ends: ends };
    items.push(item);
    zoneItems.set(reaction.id, item);
  });

  const itemRadius = (item) => Math.max(item.w, item.h) * 0.5;
  const cell = 260;
  const iterations = input.iterations || 520;
  for (let step = 0; step < iterations; step++) {
    const dx = new Map();
    const dy = new Map();
    items.forEach((it) => { dx.set(it.key, 0); dy.set(it.key, 0); });
    const buckets = new Map();
    items.forEach((it) => {
      const bx = Math.floor(it.x / cell);
      const by = Math.floor(it.y / cell);
      const key = bx + ',' + by;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(it);
    });
    items.forEach((a) => {
      const bx = Math.floor(a.x / cell);
      const by = Math.floor(a.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get((bx + ox) + ',' + (by + oy));
          if (!bucket) continue;
          for (const b of bucket) {
            if (b.key <= a.key) continue;
            let ddx = a.x - b.x;
            let ddy = a.y - b.y;
            const dist = Math.hypot(ddx, ddy) || 1;
            const min = itemRadius(a) + itemRadius(b) + 14;
            if (dist >= min * 1.6) continue;
            const push = (min * 1.6 - dist) * 0.05;
            const ux = ddx / dist;
            const uy = ddy / dist;
            dx.set(a.key, dx.get(a.key) + ux * push);
            dy.set(a.key, dy.get(a.key) + uy * push);
            dx.set(b.key, dx.get(b.key) - ux * push);
            dy.set(b.key, dy.get(b.key) - uy * push);
          }
        }
      }
    });
    zoneItems.forEach((item, rid) => {
      item.ends.forEach((cid) => {
        const c = items.find((it) => it.key === 'c:' + cid);
        if (!c) return;
        const ddx = c.x - item.x;
        const ddy = c.y - item.y;
        const dist = Math.hypot(ddx, ddy) || 1;
        const f = Math.max(-3.5, Math.min(3.5, (dist - 150) * 0.02));
        dx.set(item.key, dx.get(item.key) + (ddx / dist) * f);
        dy.set(item.key, dy.get(item.key) + (ddy / dist) * f);
        dx.set(c.key, dx.get(c.key) - (ddx / dist) * f);
        dy.set(c.key, dy.get(c.key) - (ddy / dist) * f);
      });
    });
    const center = { x: (NET.x0 + NET.x1) / 2, y: (NET.y0 + NET.y1) / 2 };
    items.forEach((it) => {
      dx.set(it.key, dx.get(it.key) + (center.x - it.x) * 0.0012);
      dy.set(it.key, dy.get(it.key) + (center.y - it.y) * 0.0012);
    });
    const speed = 1 - step / (iterations * 1.3);
    const cap = 16 * speed + 1.5;
    items.forEach((it) => {
      const ddx = dx.get(it.key);
      const ddy = dy.get(it.key);
      const len = Math.hypot(ddx, ddy);
      const scale = len > cap ? cap / len : 1;
      it.x = G.clamp(it.x + ddx * scale, NET.x0 + it.w / 2, NET.x1 - it.w / 2);
      it.y = G.clamp(it.y + ddy * scale, NET.y0 + it.h / 2, NET.y1 - it.h / 2);
    });
  }

  // 矩形分離（compound-compound 28 / compound-zone 24 / zone-zone 10）
  const gapOf = (a, b) => {
    if (a.type === 'c' && b.type === 'c') return 28;
    if (a.type === 'z' && b.type === 'z') return 10;
    return 24;
  };
  for (let iter = 0; iter < 220; iter++) {
    let moved = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const gap = gapOf(a, b);
        const overlapX = (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved++;
        if (overlapY <= overlapX) {
          const dir = a.y <= b.y ? -1 : 1;
          const push = overlapY / 2 + 0.05;
          a.y += dir * push;
          b.y -= dir * push;
        } else {
          const dir = a.x <= b.x ? -1 : 1;
          const push = overlapX / 2 + 0.05;
          a.x += dir * push;
          b.x -= dir * push;
        }
      }
    }
    items.forEach((it) => {
      it.x = G.clamp(it.x, NET.x0 + it.w / 2, NET.x1 - it.w / 2);
      it.y = G.clamp(it.y, NET.y0 + it.h / 2, NET.y1 - it.h / 2);
    });
    if (!moved) break;
  }

  const positions = {};
  const itemByCompound = new Map();
  items.forEach((it) => {
    if (it.type !== 'c') return;
    const c = it.ref;
    positions[c.id] = { x: round2(it.x - c.w / 2), y: round2(it.y - c.h / 2), w: c.w, h: c.h };
    itemByCompound.set(c.id, it);
  });
  const shelf = packShelf(isolated, positions);
  nodeRectsById = new Map();
  Object.keys(positions).forEach((id) => nodeRectsById.set(id, { id: id, rect: rectOf(positions[id]) }));

  const classRects = [];
  if (input.classMap) {
    if (input.classMap.frame) classRects.push(rectOf(input.classMap.frame));
    (input.classMap.nodes || []).forEach((n) => classRects.push(rectOf(n)));
  }
  currentClassRects = classRects;

  const markers = {};
  const labels = {};
  zoneItems.forEach((item, rid) => {
    const zone = { x: round2(item.x - item.w / 2), y: round2(item.y - item.h / 2),
      w: round2(item.w), h: round2(item.h) };
    currentZones.set(rid, zone);
    currentZoneRects.set(rid, zone);
    const marker = { x: round2(zone.x + 24), y: round2(zone.y + zone.h / 2) };
    const labelW = labelWidth(item.ref.typeLabel);
    const box = { x: round2(marker.x + 8), y: round2(marker.y - 8), w: labelW, h: 16 };
    markers[rid] = marker;
    labels[rid] = {
      side: 'E',
      type: { x: round2(box.x + box.w / 2), y: round2(box.y + box.h / 2) },
      cond: null, box: box, anchor: 'center', leader: null
    };
    currentZoneObstacles.set(rid, G.inflate(box, 20));
  });
  currentMarkers = Object.keys(markers).map((id) => ({ id: id, x: markers[id].x, y: markers[id].y }));
  currentLabels = Object.keys(labels).map((id) => ({ id: id, rect: labels[id].box }));

  let built = buildRoutesGreedy(reactions, markers);
  if (built.failures.length) {
    const fallback = buildRoutesFor(reactions, markers, null);
    built = { routes: fallback.routes, failures: fallback.failures };
  }
  let zoneBypassed = false;
  if (built.failures.length) {
    // 閉塞した反応だけ、その反応の経路を zone 障害なしで引き直す（全体は zone 回避を維持）。
    const failedReactions = new Set(built.failures.map((key) => key.split('|')[0]));
    failedReactions.forEach((rid) => {
      const reaction = reactions.find((r) => r.id === rid);
      if (!reaction) return;
      const saved = currentZoneObstacles;
      currentZoneObstacles = new Map();
      const attempt = buildRoutesFor([reaction], markers, new Set([rid]));
      currentZoneObstacles = saved;
      if (attempt.failures.length) return;
      Object.keys(attempt.routes).forEach((key) => { built.routes[key] = attempt.routes[key]; });
      zoneBypassed = true;
    });
    built.failures = built.failures.filter((key) => {
      const rid = key.split('|')[0];
      return !failedReactions.has(rid);
    });
    // 反応単位で引き直した結果、まだ未配線が残る場合だけ全体を zone なしで再試行。
    if (built.failures.length) {
      const saved = currentZoneObstacles;
      currentZoneObstacles = new Map();
      const retry = buildRoutesGreedy(reactions, markers);
      currentZoneObstacles = saved;
      if (!retry.failures.length) {
        built = retry;
        zoneBypassed = true;
      }
    }
  }
  if (built.failures.length) {
    throw new Error('通常配置案: 未配線 ' + built.failures.length + ' 件: ' + built.failures.slice(0, 6).join(', '));
  }
  const routes = repairRouteOverlaps(built.routes, markers);

  const counts = measure(positions, markers, labels, routes, classRects);
  const hard = [
    'nodeOverlaps', 'markerNodeCollisions', 'markerMarkerCollisions',
    'labelNodeCollisions', 'labelLabelCollisions', 'labelMarkerCollisions',
    'labelClassMapOverlaps',
    'routeNodePenetrations', 'routeLabelPenetrations', 'routeMarkerPenetrations',
    'endpointPenetrations'
  ];
  const hardFail = hard.filter((k) => counts[k] !== 0);
  if (hardFail.length) {
    throw new Error('通常配置案: 衝突が残る: ' + hardFail.map((k) => k + '=' + counts[k]).join(', '));
  }

  const dist = labelDistances(labels, routes);
  const strong5 = {};
  STRONG5.forEach((id) => {
    const d = dist[id];
    strong5[id] = { own: d ? d.own : null, foreign: d ? d.foreign : null, state: 'direct' };
  });

  const markerOut = {};
  Object.keys(markers).forEach((id) => {
    const r = reactions.find((x) => x.id === id);
    markerOut[id] = { x: markers[id].x, y: markers[id].y, tier: r.tier, label: labels[id] };
  });

  const canvas = canvasBounds(positions, markerOut, classRects, shelf);
  const regionFocus = buildRegionFocus(compounds, connected, positions, isolated);
  const routesLengths = Object.keys(routes).map((key) => polylineLength(routes[key].points));
  const stats = {
    layoutVersion: 1,
    kind: 'normal-proposed',
    counts: {
      compounds: compounds.length, connected: connected.length, isolated: isolated.length,
      shelf: shelf.count, reactions: reactions.length, markers: Object.keys(markers).length,
      routes: Object.keys(routes).length, labels: Object.keys(labels).length
    },
    collisions: counts,
    crossings: counts.crossingPairs,
    length: summarize(routesLengths),
    labels: {
      mode: 'reaction-zone', solver: null, targets: reactions.length, direct: reactions.length,
      leader: 0, unresolved: 0, fallback: 0, fallbackIds: [], leaderDropped: 0,
      leaderActual: 0, leaderShort: 0, leaderExtended: 0, extendedLeaderIds: [],
      breakdown: { inversion: 0, strictOnly: 0, other: 0, fallback: 0 },
      inversionIds: [], strictOnlyIds: [], strong5: strong5, missing: 0
    },
    warnings: zoneBypassed ? 1 : 0
  };

  return {
    positions: positions, markers: markerOut, routes: routes, canvas: canvas,
    regionFocus: regionFocus, stats: stats, warnings: []
  };
}

function buildLayout(input) {
  return buildLayoutZoned(input);
}

module.exports = {
  buildLayout,
  portFor,
  measure,
  RectGrid,
  rectGridOf,
  placeMarkers,
  NET,
  SHELF,
  NODE_W,
  NODE_H,
  MARKER_R,
  markerBox: (m) => ({ x: m.x - MARKER_R, y: m.y - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2 })
};
