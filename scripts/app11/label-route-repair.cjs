/**
 * app11 — ラベル保護のための「foreign route 局所回避」helper（純・DOMなし）
 *
 * 目的:
 *   ラベル（own nearest / leader で対応を明示したいもの）の保護 box と、そのラベルから
 *   自反応の線までの短い導線（corridor）の周囲から、他反応の経路だけを局所的に退避させる。
 *   own 反応の経路・leader の端点・ノード座標・facts は変更しない。
 *
 * 入力（plain JSON。academic / normal-proposed の双方で使える）:
 *   {
 *     labels:   { [reactionId]: { box:{x,y,w,h}, leader?:[[x,y],...] } },  // 参照のみ
 *     routes:   { [key]: { reaction, compound, dir, tier, points:[[x,y],...] } },
 *     compounds:{ [id]: { x,y,w,h } },       // ノード矩形（左上）
 *     markers:  { [id]: { x,y } },
 *     classRects: [ {x,y,w,h} ],             // 一般図など（任意）
 *     protect:  { [reactionId]: { corridor?:[[x,y],[x,y]] } } // 保護するラベル
 *   }
 *   options: { clearance=8, cell=6, passes=2 }
 *
 * 出力:
 *   {
 *     routes: 新しい routes（protect の foreign route だけが変わる。他は同一値）,
 *     changed: [key...],
 *     unresolved: [{ id, keys[], reason }],
 *     metrics: { checked, detoured }
 *   }
 *
 * 不変条件:
 *   - 経路の最初/最後の点（ノード接続点・マーカー中心）は変えない。
 *   - ノード・他ラベル・他マーカー・class map への貫通を作らない（paint gap の前提を維持）。
 *   - 決定性: 乱数・時刻なし。同じ入力なら同じ出力。
 */
'use strict';

const G = require('./geometry.cjs');

const DEFAULTS = {
  clearance: 8,
  cell: 6,
  passes: 2,
  margin: 36,        // 旧名（互換）。searchMargin 未指定時に使う
  searchMargin: 36,  // 局所探索 bbox の余白 px
  maxCells: 60000    // 1 detour あたりの格子セル上限（CPU 予算）
};

function toPoint(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
}

function toPoints(list) {
  return (list || []).map(toPoint);
}

function rectOfBox(box) {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function inflate(r, d) {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
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

function nearestPointOnPolylines(polys, p) {
  let best = null;
  polys.forEach((poly) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = G.clamp(t, 0, 1);
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!best || d < best.distance) best = { point: q, distance: d };
    }
  });
  return best;
}

function segmentClear(a, b, rects, markerRects, corridors, ownCompound, ownReaction, clearance) {
  for (const item of rects) {
    if (item.id === ownCompound) continue;
    if (G.segmentRect(a, b, G.inflate(item.rect, 2))) return false;
  }
  for (const item of markerRects) {
    if (item.id === ownReaction) continue;
    if (G.segmentRect(a, b, G.inflate(item.rect, 2))) return false;
  }
  for (const corridor of corridors) {
    if (G.segSegDistance(a, b, corridor.a, corridor.b) < clearance - 0.25) return false;
  }
  return true;
}

function simplifyPath(points, rects, markerRects, corridors, ownCompound, ownReaction, clearance) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let step = points.length - 1 - i;
    while (step > 1) {
      if (segmentClear(points[i], points[i + step], rects, markerRects, corridors, ownCompound, ownReaction, clearance)) break;
      step--;
    }
    out.push(points[i + step]);
    i += step;
  }
  return out;
}

function detourSegment(a, b, ctx, clearance, cell) {
  const cc = ctx.corridorClearance == null ? clearance : ctx.corridorClearance;
  const pad = cc + ctx.margin;
  // corridor の端点も探索範囲に含める（corridor の先まで回り込めないと detour 不能）。
  let minX = Math.min(a.x, b.x);
  let minY = Math.min(a.y, b.y);
  let maxX = Math.max(a.x, b.x);
  let maxY = Math.max(a.y, b.y);
  (ctx.corridors || []).forEach((corridor) => {
    minX = Math.min(minX, corridor.a.x, corridor.b.x);
    minY = Math.min(minY, corridor.a.y, corridor.b.y);
    maxX = Math.max(maxX, corridor.a.x, corridor.b.x);
    maxY = Math.max(maxY, corridor.a.y, corridor.b.y);
  });
  const x0 = Math.floor((minX - pad) / cell) * cell;
  const y0 = Math.floor((minY - pad) / cell) * cell;
  const x1 = Math.ceil((maxX + pad) / cell) * cell;
  const y1 = Math.ceil((maxY + pad) / cell) * cell;
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const ny = Math.floor((y1 - y0) / cell) + 1;
  if (nx * ny > ctx.options.maxCells) return null;
  const blocked = new Uint8Array(nx * ny);
  const corridorBlocked = new Uint8Array(nx * ny);
  const markRect = (r) => {
    const ix0 = Math.max(0, Math.floor((r.x - x0) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((r.x + r.w - x0) / cell));
    const iy0 = Math.max(0, Math.floor((r.y - y0) / cell));
    const iy1 = Math.min(ny - 1, Math.floor((r.y + r.h - y0) / cell));
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = y0 + iy * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = x0 + ix * cell;
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) blocked[iy * nx + ix] = 1;
      }
    }
  };
  ctx.rects.forEach((item) => { markRect(inflate(item.rect, 2)); });
  ctx.markerRects.forEach((item) => { if (item.id !== ctx.route.reaction) markRect(inflate(item.rect, 2)); });
  ctx.corridors.forEach((corridor) => {
    const r = {
      x: Math.min(corridor.a.x, corridor.b.x) - cc,
      y: Math.min(corridor.a.y, corridor.b.y) - cc,
      w: Math.abs(corridor.a.x - corridor.b.x) + cc * 2,
      h: Math.abs(corridor.a.y - corridor.b.y) + cc * 2
    };
    for (let iy = Math.max(0, Math.floor((r.y - y0) / cell)); iy <= Math.min(ny - 1, Math.floor((r.y + r.h - y0) / cell)); iy++) {
      for (let ix = Math.max(0, Math.floor((r.x - x0) / cell)); ix <= Math.min(nx - 1, Math.floor((r.x + r.w - x0) / cell)); ix++) {
        const p = { x: x0 + ix * cell, y: y0 + iy * cell };
        if (G.distPointSeg(p, corridor.a, corridor.b) < cc + 0.6) {
          blocked[iy * nx + ix] = 1;
          corridorBlocked[iy * nx + ix] = 1;
        }
      }
    }
  });
  const toCell = (p) => ({
    ix: G.clamp(Math.round((p.x - x0) / cell), 0, nx - 1),
    iy: G.clamp(Math.round((p.y - y0) / cell), 0, ny - 1)
  });
  const sc = toCell(a);
  const ec = toCell(b);
  const eIdPre = ec.iy * nx + ec.ix;
  if (blocked[eIdPre]) {
    ctx.lastFailure = 'end-blocked';
    return null;
  }
  // stub 始点だけ node 側のセルを解放する（corridor block は削らない）。
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ix = sc.ix + dx;
      const iy = sc.iy + dy;
      if (ix >= 0 && iy >= 0 && ix < nx && iy < ny && Math.hypot(dx, dy) <= 2.2) {
        const nid = iy * nx + ix;
        if (!corridorBlocked[nid]) blocked[nid] = 0;
      }
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
      const t = heap[parent]; heap[parent] = heap[i]; heap[i] = t;
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
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t;
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
  const raw = [a];
  cells.forEach((id, i) => {
    if (i === 0 || i === cells.length - 1) return;
    raw.push({ x: x0 + (id % nx) * cell, y: y0 + Math.floor(id / nx) * cell });
  });
  raw.push(b);
  const simplified = simplifyPath(raw, ctx.rects, ctx.markerRects, ctx.corridors,
    ctx.route.compound, ctx.route.reaction, cc);
  for (let i = 0; i < simplified.length - 1; i++) {
    if (!segmentClear(simplified[i], simplified[i + 1], ctx.rects, ctx.markerRects, ctx.corridors,
      ctx.route.compound, ctx.route.reaction, cc)) return null;
  }
  return simplified;
}

function resolveOptions(options) {
  const given = options || {};
  const has = Object.prototype.hasOwnProperty;
  const searchMargin = has.call(given, 'searchMargin') ? given.searchMargin
    : has.call(given, 'margin') ? given.margin
      : DEFAULTS.searchMargin;
  const clearance = has.call(given, 'clearance') ? given.clearance : DEFAULTS.clearance;
  const corridorClearance = has.call(given, 'corridorClearance') ? given.corridorClearance : clearance;
  return Object.assign({}, DEFAULTS, given, {
    searchMargin: searchMargin,
    clearance: clearance,
    corridorClearance: corridorClearance
  });
}

function repair(input, options) {
  const opts = resolveOptions(options);
  const labels = input.labels || {};
  const routes = input.routes || {};
  const compounds = input.compounds || {};
  const markers = input.markers || {};
  const classRects = (input.classRects || []).map((r) => ({ id: null, rect: r }));
  const protect = input.protect || {};
  const clearance = opts.clearance;
  const corridorClearance = opts.corridorClearance == null ? clearance : opts.corridorClearance;

  const baseRects = Object.keys(compounds).map((id) => {
    const c = compounds[id];
    return { id: id, rect: { x: c.x, y: c.y, w: c.w, h: c.h } };
  }).concat(classRects);
  Object.keys(labels).forEach((id) => {
    if (!labels[id] || !labels[id].box) return;
    baseRects.push({ id: null, rect: rectOfBox(labels[id].box) });
  });
  const markerRects = Object.keys(markers).map((id) => ({
    id: id,
    rect: G.markerBox(markers[id].x, markers[id].y)
  }));

  const specs = {};
  Object.keys(protect).sort().forEach((id) => {
    const label = labels[id];
    if (!label || !label.box) return;
    const box = rectOfBox(label.box);
    const corridor = (protect[id] || {}).corridor
      ? { a: toPoint(protect[id].corridor[0]), b: toPoint(protect[id].corridor[1]) }
      : null;
    specs[id] = {
      box: box,
      protectRect: { id: '__protect__', rect: inflate(box, Math.max(0, clearance - 2)) },
      paintRect: { id: '__protect__', rect: inflate(box, 2) },
      corridors: corridor ? [corridor] : []
    };
  });

  const out = {};
  Object.keys(routes).forEach((key) => {
    const r = routes[key];
    out[key] = {
      reaction: r.reaction,
      compound: r.compound,
      dir: r.dir,
      tier: r.tier,
      points: r.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y])),
      gaps: (r.gaps || []).map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y])),
      bridges: (r.bridges || []).map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]))
    };
  });

  const changed = [];
  const unresolved = [];
  let detoured = 0;
  const protectIds = Object.keys(specs);
  const targetIds = new Set(protectIds);

  function corridorViolation(corridors, a, b) {
    for (const corridor of corridors) {
      if (G.segSegDistance(a, b, corridor.a, corridor.b) < corridorClearance - 0.5) return true;
    }
    return false;
  }

  function hardViolation(rects, markerRects2, ownCompound, ownReaction, a, b) {
    for (const item of rects) {
      if (item.id === ownCompound) continue;
      if (G.segmentRect(a, b, G.inflate(item.rect, 2))) return true;
    }
    for (const item of markerRects2) {
      if (item.id === ownReaction) continue;
      if (G.segmentRect(a, b, G.inflate(item.rect, 2))) return true;
    }
    return false;
  }

  for (let pass = 0; pass < opts.passes; pass++) {
    let passChanged = false;
    protectIds.forEach((id) => {
      const spec = specs[id];
      const corridors = spec.corridors;
      const rects = baseRects.concat([spec.paintRect]);
      const keyList = Object.keys(out).sort();
      keyList.forEach((key) => {
        const route = out[key];
        if (route.reaction === id) return;
        if (targetIds.has(route.reaction)) return;
        const ctx = {
          options: opts,
          route: { compound: route.compound, reaction: route.reaction },
          rects: rects,
          markerRects: markerRects,
          corridors: corridors,
          margin: opts.searchMargin,
          corridorClearance: corridorClearance,
          lastFailure: null
        };
        let pts = toPoints(route.points);
        let failure = null;
        const countHard = (arr) => {
          let n = 0;
          for (let i = 0; i < arr.length - 1; i++) {
            if (hardViolation(rects, markerRects, route.compound, route.reaction, arr[i], arr[i + 1])) n++;
          }
          return n;
        };
        const badBefore = countHard(pts);
        const protHard = (a, b) => G.segmentRect(a, b, G.inflate(spec.protectRect.rect, 2));
        const paintHard = (a, b) => G.segmentRect(a, b, G.inflate(spec.paintRect.rect, 2));
        const maxIter = Math.min(12, pts.length * 2 + 2);
        for (let iter = 0; iter < maxIter; iter++) {
          let first = -1;
          let last = -1;
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const hard = i === 0 ? protHard(a, b) : paintHard(a, b);
            if (hard || corridorViolation(corridors, a, b)) {
              if (first < 0) first = i;
              last = i;
            }
          }
          if (first < 0) break;
          if (first === 0) {
            const segLen = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            if (segLen <= 18) {
              failure = { reason: protHard(pts[0], pts[1]) ? 'stub-hard' : 'stub-corridor' };
              break;
            }
            // 長い先頭区間は端点固定のまま一般区間として detour する。
          }
          // 最初の衝突 segment 〜 最後の衝突 segment を連続 subchain として置換し、
          // 内部の old waypoint を固定しない（node境界/stub/端点だけ維持）。
          const anchorA = pts[first];
          const anchorB = pts[last + 1];
          const detour = detourSegment(anchorA, anchorB, ctx, clearance, opts.cell);
          if (!detour || detour.length < 2) {
            failure = { reason: ctx.lastFailure || 'no-detour' };
            break;
          }
          pts = pts.slice(0, first).concat(detour, pts.slice(last + 2));
        }
        if (failure) { unresolved.push({ id: id, keys: [key], reason: failure.reason }); return; }
        // 保護帯が残っていないか（stub は clearance 帯、通常区間は paint 帯で判定）。
        for (let i = 0; i < pts.length - 1; i++) {
          const hard = i === 0 ? protHard(pts[i], pts[i + 1]) : paintHard(pts[i], pts[i + 1]);
          if (hard) {
            unresolved.push({ id: id, keys: [key], reason: i === 0 ? 'stub-hard' : 'residual-hard' });
            return;
          }
          if (corridorViolation(corridors, pts[i], pts[i + 1])) {
            unresolved.push({ id: id, keys: [key], reason: i === 0 ? 'stub-corridor' : 'residual-corridor' });
            return;
          }
        }
        if (countHard(pts) > badBefore) {
          unresolved.push({ id: id, keys: [key], reason: 'new-obstacle' });
          return;
        }
        // own compound も含め、ノード内部へ入り込む reroute は拒否する（境界の端点は許容）。
        const countNodeHits = (arr) => {
          let n = 0;
          for (let i = 0; i < arr.length - 1; i++) {
            for (const cid of Object.keys(compounds)) {
              const c = compounds[cid];
              if (G.segmentRect(arr[i], arr[i + 1], {
                x: c.x + 0.5, y: c.y + 0.5, w: Math.max(0, c.w - 1), h: Math.max(0, c.h - 1)
              })) { n++; break; }
            }
          }
          return n;
        };
        if (countNodeHits(pts) > countNodeHits(toPoints(route.points))) {
          unresolved.push({ id: id, keys: [key], reason: 'new-node-penetration' });
          return;
        }
        const first = route.points[0];
        const last = route.points[route.points.length - 1];
        if (pts[0].x !== first[0] || pts[0].y !== first[1]) {
          unresolved.push({ id: id, keys: [key], reason: 'endpoint-moved' });
          return;
        }
        if (pts[pts.length - 1].x !== last[0] || pts[pts.length - 1].y !== last[1]) {
          unresolved.push({ id: id, keys: [key], reason: 'endpoint-moved' });
          return;
        }
        const rounded = pts.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
        const same = rounded.length === route.points.length && rounded.every((pt, i) => pt[0] === route.points[i][0] && pt[1] === route.points[i][1]);
        if (same) return;
        route.points = rounded;
        if (changed.indexOf(key) === -1) changed.push(key);
        detoured++;
        passChanged = true;
      });
    });
    if (!passChanged) break;
  }

  return {
    routes: out,
    changed: changed,
    unresolved: unresolved,
    metrics: { checked: protectIds.length, detoured: detoured }
  };
}

module.exports = {
  DEFAULTS,
  resolveOptions,
  repair,
  // test / adapter 用
  segmentClear,
  detourSegment,
  nearestPointOnPolylines
};
