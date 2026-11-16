/**
 * 有機反応マップ（app11）— アカデミック専用レイアウト（layout version 2）
 *
 * 通常モードの 427 物質座標は変更しない。ここで作るのは「アカデミック表示専用」の
 * 座標一式で、通常データへは書き戻さない。
 *
 * これまでの overlay 方式（通常の右棚に学術マーカーを全部置く）では、
 * 学術反応の端点が右棚のマーカーまで数百〜数千 px 迂回し、全 628 辺の総延長が
 * 54 万 px を超えていた。ここでは
 *   - 通常接続 101 + 学術で新たに接続する 136 = 237 物質を 1 つのネットワークとして
 *     決定的な力配置で圧縮し、
 *   - 通常 86 + 学術 178 = 264 反応マーカーを端点の近傍へ置き、
 *   - 全 628 辺（通常 207 + 学術 421）を同じ座標系で引き直す。
 * 未接続 190 物質だけは、class map（一般図）の外側の専用棚へ別に詰める。
 *
 * 出力は layout version 2 の契約:
 *   positions, normalMarkers, normalRoutes, markers, routes, canvas, regionFocus, stats, warnings
 *
 * すべて固定入力・固定順序の決定的計算。外部依存なし。
 * 交差 0 は数学的に不可能な非平面グラフなので要求しない（crossingPairs として数える）。
 * ノード・ラベル・マーカーの貫通、未配線は hard fail（build を止める）。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');

const LAYOUT_VERSION = 2;

// ネットワーク（接続 237 物質 + 反応 264）を置く領域。class map は x>=4170 なので重ならない。
const NET = { x0: 40, y0: 40, x1: 4000, y1: 3000 };
// 未接続 190 の専用棚。class map の右外側。
const SHELF = { x: 5800, y: 20, cols: 10, pitchX: 148, pitchY: 62 };

const NODE_W = 136;
const NODE_H = 34;
const MARKER_R = 6;
const TYPE_FONT = 10;
const TYPE_H = 18;
const LABEL_GAP = 26; // マーカー中心からラベル箱まで（端点スタブ 18px と干渉しない）
const LABEL_PAD = 5;
const NODE_GAP = 8;
const MARKER_LABEL_GAP = 4;
const ROUTE_PAD = 4;
const PORT_STUB = 16;

// 旧 overlay 方式の実測値（2026-11-17、HEAD 32ac0b1）。テストの比較用に数値だけ保持する。
const BASELINE = {
  version: 1,
  // crossingPairs は build の collisionStats と同じ定義（異なるルートキー同士の線分交差、
  // 同一ルート内は除外、AABB 枝刈り + segSegIntersection）。
  combined: { count: 628, total: 541480.2, median: 503.6, p95: 2518.7, max: 3457.6, ge1000: 227, crossingPairs: 5043 },
  normal: { count: 207, total: 33445.4, median: 123.0, p95: 425.9, max: 1011.7, ge1000: 1, crossingPairs: 50 },
  academic: { count: 421, total: 508034.9, median: 1148.4, p95: 2764.5, max: 3457.6, ge1000: 226, crossingPairs: 4164 },
  academicDetourP95: 1.33 // node -> marker の迂回率（距離そのものが遠い主因）
};

function round2(v) {
  return Math.round(v * 100) / 100;
}

function rectOf(c) {
  return { x: c.x, y: c.y, w: c.w, h: c.h };
}

function rectsOverlap(a, b, pad) {
  return G.rectsOverlap(a, b, pad == null ? 0 : pad);
}

function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function lcg(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function labelWidth(text) {
  return Math.ceil(G.textWidth(text, TYPE_FONT)) + 12;
}

// app.js の描画アンカー規約: E は type.x + 11 = box.x、W は type.x - 11 = box.x + box.w。
function labelFromBox(box, markerX) {
  const side = box.x >= markerX ? 'E' : 'W';
  return {
    side: side,
    type: {
      x: round2(side === 'E' ? box.x - 11 : box.x + box.w + 11),
      y: round2(box.y + box.h / 2)
    },
    cond: null,
    box: { x: round2(box.x), y: round2(box.y), w: round2(box.w), h: round2(box.h) }
  };
}

/* ------------------------------------------------------------------ *
 * 1. 決定論的な力配置（物質 237 + 反応 264）
 * ------------------------------------------------------------------ */

function seedPositions(compounds, reactions) {
  const pos = new Map();
  const ordered = compounds.slice().sort((a, b) =>
    (a.regionIndex - b.regionIndex) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cols = 16;
  const pitchX = 240;
  const pitchY = 180;
  ordered.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pos.set(c.id, { x: NET.x0 + 120 + col * pitchX, y: NET.y0 + 100 + row * pitchY });
  });
  const regionSum = new Map();
  ordered.forEach((c) => {
    const p = pos.get(c.id);
    const entry = regionSum.get(c.region) || { x: 0, y: 0, n: 0 };
    entry.x += p.x;
    entry.y += p.y;
    entry.n += 1;
    regionSum.set(c.region, entry);
  });
  const regionCenter = new Map();
  regionSum.forEach((entry, id) => regionCenter.set(id, { x: entry.x / entry.n, y: entry.y / entry.n }));

  reactions.forEach((r, i) => {
    const ends = r.substrates.concat(r.products);
    let sx = 0;
    let sy = 0;
    ends.forEach((id) => { const p = pos.get(id); sx += p.x; sy += p.y; });
    const angle = i * 2.399963229728653;
    const jitter = 10 + (hash32(r.id) % 17);
    pos.set(r.id, { x: sx / ends.length + Math.cos(angle) * jitter, y: sy / ends.length + Math.sin(angle) * jitter });
  });
  return { pos: pos, regionCenter: regionCenter };
}

function forceLayout(compounds, reactions, seeds, iterations) {
  const compIds = compounds.map((c) => c.id);
  const rxIds = reactions.map((r) => r.id);
  const ids = compIds.concat(rxIds);
  const isCompound = new Set(compIds);
  const radius = new Map();
  compIds.forEach((id) => radius.set(id, 76));
  rxIds.forEach((id) => radius.set(id, 52));
  const pos = seeds.pos;
  const edges = [];
  reactions.forEach((r) => {
    r.substrates.concat(r.products).forEach((id) => edges.push([r.id, id]));
  });
  const center = { x: (NET.x0 + NET.x1) / 2, y: (NET.y0 + NET.y1) / 2 };
  const regionOf = new Map(compounds.map((c) => [c.id, c.region]));
  const remaining = iterations || 420;

  for (let step = 0; step < remaining; step++) {
    const disp = new Map();
    ids.forEach((id) => disp.set(id, { x: 0, y: 0 }));

    // 反発（空間ハッシュ、近傍だけ）。
    const cell = 200;
    const buckets = new Map();
    ids.forEach((id, index) => {
      const p = pos.get(id);
      const key = Math.floor(p.x / cell) + ',' + Math.floor(p.y / cell);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(index);
    });
    for (let a = 0; a < ids.length; a++) {
      const ida = ids[a];
      const pa = pos.get(ida);
      const bx = Math.floor(pa.x / cell);
      const by = Math.floor(pa.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get((bx + ox) + ',' + (by + oy));
          if (!bucket) continue;
          for (const b of bucket) {
            if (b <= a) continue;
            const idb = ids[b];
            const pb = pos.get(idb);
            let dx = pa.x - pb.x;
            let dy = pa.y - pb.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 1e-6) {
              const rnd = lcg(hash32(ida + '|' + idb));
              dx = rnd() - 0.5;
              dy = rnd() - 0.5;
              dist = Math.hypot(dx, dy) || 1;
            }
            const min = radius.get(ida) + radius.get(idb);
            if (dist < min * 1.35) {
              const push = (min * 1.35 - dist) * 0.24;
              const ux = dx / dist;
              const uy = dy / dist;
              const da = disp.get(ida);
              const db = disp.get(idb);
              da.x += ux * push;
              da.y += uy * push;
              db.x -= ux * push;
              db.y -= uy * push;
            }
          }
        }
      }
    }

    // ばね（反応→端点）。
    edges.forEach((edge) => {
      const rid = edge[0];
      const cid = edge[1];
      const pr = pos.get(rid);
      const pc = pos.get(cid);
      const dx = pc.x - pr.x;
      const dy = pc.y - pr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const rest = 140;
      const f = Math.max(-6, Math.min(6, (dist - rest) * 0.03));
      const ux = dx / dist;
      const uy = dy / dist;
      const dr = disp.get(rid);
      const dc = disp.get(cid);
      dr.x += ux * f;
      dr.y += uy * f;
      dc.x -= ux * f;
      dc.y -= uy * f;
    });

    // 領域への弱い引き戻しと全体の重心。
    compIds.forEach((id) => {
      const p = pos.get(id);
      const region = seeds.regionCenter.get(regionOf.get(id));
      const d = disp.get(id);
      d.x += (region.x - p.x) * 0.0003;
      d.y += (region.y - p.y) * 0.0003;
      d.x += (center.x - p.x) * 0.0008;
      d.y += (center.y - p.y) * 0.0008;
    });

    const speed = 1 - step / (remaining * 1.35);
    ids.forEach((id) => {
      const p = pos.get(id);
      const d = disp.get(id);
      const len = Math.hypot(d.x, d.y);
      const cap = 12 * speed + 1.5;
      const scale = len > cap ? cap / len : 1;
      p.x = G.clamp(p.x + d.x * scale, NET.x0 + 80, NET.x1 - 80);
      p.y = G.clamp(p.y + d.y * scale, NET.y0 + 55, NET.y1 - 55);
    });
  }
  return pos;
}

/* ------------------------------------------------------------------ *
 * 2. 物质矩形の非重複化
 * ------------------------------------------------------------------ */

function separateNodes(compounds, pos) {
  const items = compounds.map((c) => ({
    id: c.id,
    w: c.w || NODE_W,
    h: c.h || NODE_H,
    x: pos.get(c.id).x,
    y: pos.get(c.id).y
  }));
  for (let iter = 0; iter < 90; iter++) {
    let moved = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const overlapX = (a.w + b.w) / 2 + NODE_GAP - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 + NODE_GAP - Math.abs(a.y - b.y);
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
  items.forEach((it) => out.set(it.id, { x: round2(it.x), y: round2(it.y) }));
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. マーカー + ラベルの collision-free 配置
 * ------------------------------------------------------------------ */

function labelOffsets(marker, size) {
  const g = LABEL_GAP;
  return [
    { x: marker.x + g, y: marker.y - size.h / 2 },
    { x: marker.x - g - size.w, y: marker.y - size.h / 2 },
    { x: marker.x + g, y: marker.y - size.h - 5 },
    { x: marker.x - g - size.w, y: marker.y - size.h - 5 },
    { x: marker.x + g, y: marker.y + 5 },
    { x: marker.x - g - size.w, y: marker.y + 5 }
  ];
}

function placeMarkers(reactions, nodeRects, classRects, seeds, pos, hints) {
  const placed = [];
  const markers = {};
  const obstaclesForLabel = nodeRects.concat(classRects);
  const ordered = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const RADII = [0, 10, 20, 32, 46, 62, 80, 100, 124, 150, 180, 214, 252, 294, 340, 390, 444];
  const ANGLES = 16;
  const hintOf = (id) => (hints && hints.get(id)) || 0;

  const pointFreeForEscape = (point, ownLabel) => {
    for (const rect of nodeRects) {
      if (G.distPointRect(point, rect) < 4) return false;
    }
    for (const item of placed) {
      if (G.distPointRect(point, item.labelBox) < 4) return false;
      if (Math.hypot(point.x - item.marker.x, point.y - item.marker.y) < MARKER_R + 5) return false;
    }
    if (ownLabel && G.distPointRect(point, ownLabel) < 3) return false;
    return true;
  };
  const hasEscape = (marker, ownLabel) => {
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
    ];
    let free = 0;
    dirs.forEach((dir) => {
      const a = { x: marker.x + dir.x * 24, y: marker.y + dir.y * 24 };
      const b = { x: marker.x + dir.x * 44, y: marker.y + dir.y * 44 };
      if (pointFreeForEscape(a, ownLabel) && pointFreeForEscape(b, ownLabel)) free++;
    });
    return free >= 2;
  };

  ordered.forEach((reaction) => {
    const seed = pos.get(reaction.id) || seeds.pos.get(reaction.id);
    const size = { w: labelWidth(reaction.typeLabel), h: TYPE_H };
    const hint = hintOf(reaction.id);
    const baseAngle = (hash32(reaction.id) % 360) * Math.PI / 180 + hint * 0.71;
    const startRing = Math.min(RADII.length - 1, Math.floor(hint / 2));
    let chosen = null;
    let chosenLabel = null;

    outer:
    for (let ri = startRing; ri < RADII.length; ri++) {
      const radius = RADII[ri];
      for (let ai = 0; ai < ANGLES; ai++) {
        const angle = baseAngle + (ai / ANGLES) * Math.PI * 2;
        const marker = {
          x: round2(seed.x + Math.cos(angle) * radius),
          y: round2(seed.y + Math.sin(angle) * radius)
        };
        if (marker.x < NET.x0 + 30 || marker.x > NET.x1 - 30 ||
            marker.y < NET.y0 + 30 || marker.y > NET.y1 - 30) continue;
        const disc = { x: marker.x, y: marker.y, r: MARKER_R };
        let blocked = false;
        for (const rect of nodeRects) {
          if (G.distPointRect(disc, rect) < MARKER_R + 10) { blocked = true; break; }
        }
        if (blocked) continue;
        for (const item of placed) {
          if (Math.hypot(marker.x - item.marker.x, marker.y - item.marker.y) < 2 * MARKER_R + 52) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        for (const offset of labelOffsets(marker, size)) {
          const box = { x: round2(offset.x), y: round2(offset.y), w: size.w, h: size.h };
          if (box.x < NET.x0 + 6 || box.x + box.w > NET.x1 - 6 ||
              box.y < NET.y0 + 6 || box.y + box.h > NET.y1 - 6) continue;
          let free = true;
          for (const rect of obstaclesForLabel) {
            if (rectsOverlap(box, rect, LABEL_PAD)) { free = false; break; }
          }
          if (!free) continue;
          for (const item of placed) {
            if (rectsOverlap(box, item.labelBox, LABEL_PAD)) { free = false; break; }
            if (G.distPointRect({ x: item.marker.x, y: item.marker.y }, box) < MARKER_R + MARKER_LABEL_GAP) {
              free = false;
              break;
            }
          }
          if (!free) continue;
          if (!hasEscape(marker, box)) continue;
          chosen = marker;
          chosenLabel = box;
          break outer;
        }
      }
    }

    if (!chosen) {
      throw new Error('学術レイアウト: マーカー/ラベルの空き位置が見つからない: ' + reaction.id);
    }
    markers[reaction.id] = {
      x: chosen.x,
      y: chosen.y,
      tier: reaction.tier,
      label: labelFromBox(chosenLabel, chosen.x)
    };
    placed.push({ marker: chosen, labelBox: chosenLabel });
  });
  return markers;
}

/* ------------------------------------------------------------------ *
 * 4. 配線（全 628 辺）
 * ------------------------------------------------------------------ */

const PORT_SIDES = ['right', 'left', 'top', 'bottom'];

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

function routePenetration(points, obstacles, ownCompoundId, ownMarkerId, ownLabelId) {
  const problems = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const item of obstacles.nodes) {
      if (item.id === ownCompoundId && i === 0) continue;
      if (G.segmentRect(a, b, G.inflate(item.rect, 2))) problems.push('node:' + item.id);
    }
    for (const item of obstacles.labels) {
      if (G.segmentRect(a, b, G.inflate(item.rect, 1))) problems.push('label:' + item.id);
    }
    for (const disc of obstacles.markers) {
      if (disc.id === ownMarkerId) continue;
      if (G.distPointSeg(disc, a, b) < MARKER_R + 1) problems.push('marker:' + disc.id);
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) problems.push('zero-segment');
  }
  return problems;
}

function buildRoutes(edgeDefs, markers, nodeRectsById, labelsById, bounds) {
  const nodes = [];
  nodeRectsById.forEach((rect, id) => nodes.push({ id: id, rect: rect }));
  const labels = Object.keys(labelsById).map((id) => ({ id: id, rect: labelsById[id] }));
  const markerDiscs = Object.keys(markers).map((id) => ({
    id: id, x: markers[id].x, y: markers[id].y, r: MARKER_R
  }));
  const routes = {};
  const warnings = [];
  const failures = [];

  edgeDefs.forEach((def) => {
    const compound = nodeRectsById.get(def.compound);
    const marker = markers[def.reaction];
    if (!compound || !marker) throw new Error('学術レイアウト: 端点が未定義: ' + def.key);
    const markerPoint = { x: marker.x, y: marker.y };
    const obstacles = {
      nodes: nodes,
      labels: labels,
      markers: markerDiscs
    };
    const rectObs = {
      rects: nodes.map((n) => ({ rect: n.rect })).concat(labels.map((l) => ({ rect: l.rect }))),
      discs: markerDiscs.filter((d) => d.id !== def.reaction).map((d) => ({ x: d.x, y: d.y, r: d.r })),
      segments: []
    };
    const sides = PORT_SIDES.slice().sort((a, b) => {
      const pa = portFor(compound, markerPoint, a);
      const pb = portFor(compound, markerPoint, b);
      return Math.hypot(pa.outside.x - markerPoint.x, pa.outside.y - markerPoint.y) -
        Math.hypot(pb.outside.x - markerPoint.x, pb.outside.y - markerPoint.y) ||
        (a < b ? -1 : a > b ? 1 : 0);
    });
    let route = null;
    let lastProblems = null;
    for (const margin of [160, 260]) {
      for (const side of sides) {
        const port = portFor(compound, markerPoint, side);
        // ノード境界の点から配線を始めると自ノードの障害物判定に巻き込まれるため、
        // 外向き stub の先（outside）から格子探索し、境界点を先頭に足す。
        let path = R.gridRoute(port.outside, markerPoint, rectObs, bounds, { margin: margin, primary: false });
        if (!path) continue;
        path = R.simplifyPath(path, rectObs, ROUTE_PAD);
        const gridPoints = path.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
        let points = R.dedupe([{ x: round2(port.point.x), y: round2(port.point.y) }].concat(gridPoints));
        points[points.length - 1] = { x: round2(markerPoint.x), y: round2(markerPoint.y) };
        if (points.length < 2) continue;
        const problems = routePenetration(points, obstacles, def.compound, def.reaction, def.reaction);
        if (problems.length) { lastProblems = problems; continue; }
        route = {
          reaction: def.reaction,
          dir: def.dir,
          compound: def.compound,
          tier: def.tier,
          points: points.map((p) => [p.x, p.y]),
          gaps: [],
          bridges: []
        };
        break;
      }
      if (route) break;
    }
    if (!route) {
      failures.push({ key: def.key, problems: lastProblems || [] });
      return;
    }
    routes[def.key] = route;
  });
  return { routes: routes, warnings: warnings, failures: failures };
}

/* ------------------------------------------------------------------ *
 * 5. 計測
 * ------------------------------------------------------------------ */

function lengthOf(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return sum;
}

function summary(values) {
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

function collisionStats(markers, nodeRects, labelsById, routes, classRects) {
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
  const nodeList = [];
  nodeRects.forEach((rect, id) => nodeList.push({ id: id, rect: rect }));
  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      if (rectsOverlap(nodeList[i].rect, nodeList[j].rect, 0)) counts.nodeNodeOverlaps++;
    }
  }
  const ids = Object.keys(markers).sort();
  const labelList = [];
  ids.forEach((id) => {
    const m = markers[id];
    const box = m.label.box;
    labelList.push({ id: id, rect: box });
    nodeList.forEach((n) => {
      if (rectsOverlap(box, n.rect, 0)) counts.labelNodeOverlaps++;
      if (G.distPointRect({ x: m.x, y: m.y }, n.rect) < MARKER_R + 2) counts.markerNodeOverlaps++;
    });
    classRects.forEach((r) => {
      if (rectsOverlap(box, r, 0)) counts.labelClassMapOverlaps++;
    });
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (rectsOverlap(labelList[i].rect, labelList[j].rect, 0)) counts.labelLabelOverlaps++;
      const a = markers[ids[i]];
      const b = markers[ids[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * MARKER_R) counts.markerMarkerOverlaps++;
    }
  }

  const segments = [];
  Object.keys(routes).sort().forEach((key) => {
    const entry = routes[key];
    const pts = entry.points.map((p) => ({ x: p[0], y: p[1] }));
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({ key: key, a: pts[i], b: pts[i + 1] });
    }
    const marker = markers[entry.reaction];
    for (let i = 0; i < pts.length - 1; i++) {
      for (const n of nodeList) {
        if (n.id === entry.compound && i === 0) continue;
        if (G.segmentRect(pts[i], pts[i + 1], n.rect)) counts.routeNodePenetrations++;
      }
      for (const l of labelList) {
        if (G.segmentRect(pts[i], pts[i + 1], l.rect)) counts.routeLabelPenetrations++;
      }
      for (const id of ids) {
        if (id === entry.reaction) continue;
        if (G.distPointSeg({ x: markers[id].x, y: markers[id].y }, pts[i], pts[i + 1]) < MARKER_R) {
          counts.routeMarkerPenetrations++;
        }
      }
    }
    if (!marker) counts.routeMarkerPenetrations++;
  });

  // 交差数（異なるルート同士の線分交差）。数学的に 0 にはできないため比較用に数える。
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const minX = Math.min(s.a.x, s.b.x);
    const maxX = Math.max(s.a.x, s.b.x);
    const minY = Math.min(s.a.y, s.b.y);
    const maxY = Math.max(s.a.y, s.b.y);
    for (let j = i + 1; j < segments.length; j++) {
      const t = segments[j];
      if (t.key === s.key) continue;
      if (Math.max(t.a.x, t.b.x) < minX || Math.min(t.a.x, t.b.x) > maxX ||
          Math.max(t.a.y, t.b.y) < minY || Math.min(t.a.y, t.b.y) > maxY) continue;
      if (G.segSegIntersection(s.a, s.b, t.a, t.b)) counts.crossingPairs++;
    }
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * 6. エントリポイント
 * ------------------------------------------------------------------ */

/**
 * @param {object} input
 *   compounds: [{id,x,y,w,h,region,regionIndex,incoming,outgoing}] 全 427（通常座標は読むだけ）
 *   reactions: [{id,tier,typeLabel,substrates,products}] 通常 86 + 学術 178
 *   classMap: {frame,nodes:[{x,y,w,h}]}
 *   nodeW, nodeH
 */
function buildLayout(input) {
  const compounds = input.compounds.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    w: c.w || input.nodeW || NODE_W,
    h: c.h || input.nodeH || NODE_H,
    region: c.region || 'unknown',
    regionIndex: c.regionIndex == null ? 999 : c.regionIndex,
    incoming: c.incoming || 0,
    outgoing: c.outgoing || 0
  }));
  const byId = new Map(compounds.map((c) => [c.id, c]));
  const reactions = input.reactions.map((r) => {
    const ends = r.substrates.concat(r.products);
    ends.forEach((id) => {
      if (!byId.has(id)) throw new Error('学術レイアウト: 未知の物質ID: ' + id);
    });
    return {
      id: r.id,
      tier: r.tier,
      typeLabel: r.typeLabel,
      substrates: r.substrates.slice(),
      products: r.products.slice()
    };
  });

  const endpointIds = new Set();
  reactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => endpointIds.add(id)));
  const connected = compounds.filter((c) => endpointIds.has(c.id));
  const isolated = compounds.filter((c) => !endpointIds.has(c.id));

  // 1. 力配置
  const seeds = seedPositions(connected, reactions);
  const raw = forceLayout(connected, reactions, seeds, 420);
  const separated = separateNodes(connected, raw);

  // 2. 座標確定（接続ノードはネットワーク、未接続は棚）
  const positions = {};
  connected.forEach((c) => {
    const p = separated.get(c.id);
    positions[c.id] = { x: round2(p.x - c.w / 2), y: round2(p.y - c.h / 2), w: c.w, h: c.h };
  });
  const shelf = packShelf(isolated, positions);

  const nodeRectsById = new Map();
  Object.keys(positions).forEach((id) => nodeRectsById.set(id, rectOf(positions[id])));
  const classRects = [];
  if (input.classMap) {
    if (input.classMap.frame) classRects.push(rectOf(input.classMap.frame));
    (input.classMap.nodes || []).forEach((n) => classRects.push(rectOf(n)));
  }
  const connectedRects = connected.map((c) => rectOf(positions[c.id]));
  const classForNet = classRects.filter((r) => rectsOverlap(r, { x: NET.x0 - 10, y: NET.y0 - 10, w: NET.x1 - NET.x0 + 20, h: NET.y1 - NET.y0 + 20 }));
  // ネットワーク領域は class map と重ならない設計。念のため配置前に検査する。
  if (classForNet.length) throw new Error('学術レイアウト: ネットワーク領域が class map と重なる');

  // 3. 配線対象（通常 86 + 学術 178 の全端点）
  const edgeDefs = [];
  reactions.forEach((r) => {
    r.substrates.forEach((id) => edgeDefs.push({
      key: r.id + '|in|' + id, reaction: r.id, dir: 'in', compound: id, tier: r.tier
    }));
    r.products.forEach((id) => edgeDefs.push({
      key: r.id + '|out|' + id, reaction: r.id, dir: 'out', compound: id, tier: r.tier
    }));
  });
  edgeDefs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // マーカーは接続ノード矩形だけを障害物にする（棚は遠く、干渉しない）。
  const routeBounds = canvasBounds(positions, {}, classRects, shelf);
  const hints = new Map();
  let markersAll = null;
  let routing = null;
  let labelsById = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    markersAll = placeMarkers(reactions, connectedRects, classRects, seeds, separated, hints);
    labelsById = {};
    Object.keys(markersAll).forEach((id) => { labelsById[id] = markersAll[id].label.box; });
    routing = buildRoutes(edgeDefs, markersAll, nodeRectsById, labelsById, routeBounds);
    if (!routing.failures.length) break;
    const move = new Set();
    routing.failures.forEach((failure) => {
      move.add(failure.key.split('|')[0]);
      failure.problems.forEach((problem) => {
        if (problem.indexOf('label:') === 0) move.add(problem.slice(6));
      });
    });
    move.forEach((id) => hints.set(id, (hints.get(id) || 0) + 1));
  }
  const routes = routing.routes;
  if (routing.failures.length) {
    console.error('route failures: ' + routing.failures.length);
    routing.failures.slice(0, 8).forEach((f) => console.error('  ' + f.key + ' ' + f.problems.slice(0, 3).join(',')));
  }
  const missing = edgeDefs.filter((d) => !routes[d.key]);
  if (missing.length) throw new Error('学術レイアウト: 未配線 ' + missing.length + ' 件');

  // 4. 出力を分ける（通常 86 / 学術 178）
  const normalMarkers = {};
  const academicMarkers = {};
  reactions.forEach((r) => {
    const entry = markersAll[r.id];
    if (r.tier === 'academic') academicMarkers[r.id] = entry;
    else normalMarkers[r.id] = entry;
  });
  const normalRoutes = {};
  const academicRoutes = {};
  Object.keys(routes).forEach((key) => {
    const entry = routes[key];
    if (entry.tier === 'academic') academicRoutes[key] = entry;
    else normalRoutes[key] = entry;
  });

  // 5. 計測
  const normalIds = new Set(reactions.filter((r) => r.tier !== 'academic').map((r) => r.id));
  const lengths = { normal: [], academic: [] };
  const detours = { normal: [], academic: [] };
  Object.keys(routes).forEach((key) => {
    const entry = routes[key];
    const tier = normalIds.has(entry.reaction) ? 'normal' : 'academic';
    const len = lengthOf(entry.points);
    lengths[tier].push(len);
    const compound = positions[entry.compound];
    const marker = markersAll[entry.reaction];
    const straight = Math.hypot(marker.x - (compound.x + compound.w / 2),
      marker.y - (compound.y + compound.h / 2));
    detours[tier].push(len / Math.max(1, straight));
  });
  const allLengths = lengths.normal.concat(lengths.academic);
  const allDetours = detours.normal.concat(detours.academic);
  const collisions = collisionStats(markersAll, nodeRectsById, labelsById, routes, classRects);
  const counts = {
    nodeNodeOverlaps: collisions.nodeNodeOverlaps,
    labelLabelOverlaps: collisions.labelLabelOverlaps,
    labelNodeOverlaps: collisions.labelNodeOverlaps,
    labelClassMapOverlaps: collisions.labelClassMapOverlaps,
    markerNodeOverlaps: collisions.markerNodeOverlaps,
    markerMarkerOverlaps: collisions.markerMarkerOverlaps,
    routeNodePenetrations: collisions.routeNodePenetrations,
    routeLabelPenetrations: collisions.routeLabelPenetrations,
    routeMarkerPenetrations: collisions.routeMarkerPenetrations
  };
  const hardFail = Object.keys(counts).filter((k) => counts[k] !== 0);
  if (hardFail.length) {
    throw new Error('学術レイアウト: 衝突が残る: ' + hardFail.map((k) => k + '=' + counts[k]).join(', '));
  }

  const after = summary(allLengths);
  const afterNormal = summary(lengths.normal);
  const afterAcademic = summary(lengths.academic);
  const detourSummary = summary(allDetours);
  const stats = {
    layoutVersion: LAYOUT_VERSION,
    before: BASELINE,
    after: {
      combined: after,
      normal: afterNormal,
      academic: afterAcademic,
      detour: {
        median: detourSummary.median,
        p95: detourSummary.p95,
        max: detourSummary.max
      },
      reduction: {
        total: round2(1 - after.total / BASELINE.combined.total),
        p95: round2(1 - after.p95 / BASELINE.combined.p95),
        max: round2(1 - after.max / BASELINE.combined.max),
        ge1000: after.ge1000
      }
    },
    counts: {
      compounds: compounds.length,
      connected: connected.length,
      isolated: isolated.length,
      normalMarkers: Object.keys(normalMarkers).length,
      academicMarkers: Object.keys(academicMarkers).length,
      normalRoutes: Object.keys(normalRoutes).length,
      academicRoutes: Object.keys(academicRoutes).length,
      routes: Object.keys(routes).length
    },
    collisions: Object.assign({}, counts, { crossingPairs: collisions.crossingPairs }),
    warnings: 0
  };
  const regionFocus = buildRegionFocus(compounds, connected, positions, isolated);
  const canvas = canvasBounds(positions, markersAll, classRects, shelf, true);

  return {
    version: LAYOUT_VERSION,
    positions: positions,
    normalMarkers: normalMarkers,
    normalRoutes: normalRoutes,
    markers: academicMarkers,
    routes: academicRoutes,
    canvas: canvas,
    regionFocus: regionFocus,
    stats: stats,
    warnings: []
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

function canvasBounds(positions, markers, classRects, shelf, withMargin) {
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
  if (withMargin) {
    Object.keys(markers).forEach((id) => {
      const m = markers[id];
      grow(m.x - 10, m.y - 10);
      grow(m.x + 10, m.y + 10);
      const b = m.label.box;
      grow(b.x, b.y);
      grow(b.x + b.w, b.y + b.h);
    });
  }
  const pad = 40;
  // 通常 canvas を必ず含む（x=0 起点を維持し、UI の clamp 差分を単純にする）。
  return {
    x: 0,
    y: 0,
    w: round2(Math.max(maxX, 0) + pad),
    h: round2(Math.max(maxY, 0) + pad)
  };
}

module.exports = {
  LAYOUT_VERSION,
  BASELINE,
  buildLayout,
  portFor,
  markerBox: (m) => ({ x: m.x - MARKER_R, y: m.y - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2 })
};
