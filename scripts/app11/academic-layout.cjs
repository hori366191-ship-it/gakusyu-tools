/**
 * 有機反応マップ（app11）— アカデミック（大学レベル追加反応）の配置と経路生成
 *
 * 通常の 427 物質の座標は一切動かさない（Phase 1 は overlay）。
 * アカデミック反応のマーカーだけを、通常のノード・主要ラベル・一般図の枠を避けた
 * 空き位置へ決定的に置き、各端点からマーカーまでを、ノード内部を横断しない
 * 折れ線（格子 A* + 可視化の簡約）で配線する。
 *
 * - 通常の layout.json / routes.json は読むだけで書き換えない。
 * - 迷路状になった場合は経路を捨てず、`fallback: 'card-only'` として記録し、件数を返す
 *   （無言の未描画はしない。呼び出し側がカードのみ表示として報告する）。
 * - 出力は値だけ。座標は 1/100 に丸めた決定的な値。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');

const MARKER_GAP = 14; // マーカー円と障害物の最小間隔
const LABEL_PAD = 3; // ラベル箱と障害物の最小間隔
const ROUTE_PAD = 4; // 経路がノード・ラベルから離す距離
const PORT_STUB = 16; // ノード境界から外へ出る stub 長
const SEARCH_PAD = 560; // 通常 canvas の外側まで探す最大量（アカデミック専用 bounds）
const RING_RADII = [48, 72, 100, 136, 180, 232, 292, 364, 448, 544, 660, 800];
const RING_ANGLES = 24;

function round2(v) {
  return Math.round(v * 100) / 100;
}

function rectOf(c) {
  return { x: c.x, y: c.y, w: c.w, h: c.h };
}

function inflate(r, pad) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function labelSize(text, font) {
  return { w: Math.ceil(G.textWidth(text, font)) + 12, h: 18 };
}

function labelOffsets(marker, size) {
  const gap = 10;
  return [
    { x: marker.x + gap, y: marker.y - size.h / 2 },
    { x: marker.x - gap - size.w, y: marker.y - size.h / 2 },
    { x: marker.x + gap, y: marker.y - size.h - 4 },
    { x: marker.x - gap - size.w, y: marker.y - size.h - 4 },
    { x: marker.x + gap, y: marker.y + 4 },
    { x: marker.x - gap - size.w, y: marker.y + 4 }
  ];
}

// マーカー円・ラベル箱が、既存の障害物と重ならないか。
function markerFree(marker, labelBox, obstacles, placed) {
  const disc = { x: marker.x, y: marker.y, r: 6 };
  for (const rect of obstacles) {
    if (G.distPointRect(disc, rect) < disc.r + MARKER_GAP) return false;
    if (rectsOverlap(labelBox, inflate(rect, LABEL_PAD))) return false;
  }
  for (const item of placed) {
    if (Math.hypot(marker.x - item.marker.x, marker.y - item.marker.y) < MARKER_GAP + 12) return false;
    if (rectsOverlap(labelBox, inflate(item.labelBox, LABEL_PAD))) return false;
    if (rectsOverlap(labelBox, item.markerBox)) return false;
    if (rectsOverlap({ x: marker.x - 6, y: marker.y - 6, w: 12, h: 12 }, item.labelBox)) return false;
  }
  return true;
}

function inside(box, bounds) {
  return box.x >= bounds.x && box.y >= bounds.y &&
    box.x + box.w <= bounds.x + bounds.w && box.y + box.h <= bounds.y + bounds.h;
}

/*
 * ノードの、相手方向を向いた辺のポート（枠の境界上）。
 * 既存 Core の connector と同じ「物質→ハブ」の向きで点列を作る。
 */
function portFor(compound, target, forcedSide) {
  const w = compound.w;
  const h = compound.h;
  const cx = compound.x + w / 2;
  const cy = compound.y + h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const primary = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  const side = forcedSide || primary;
  let point;
  let normal;
  if (side === 'right' || side === 'left') {
    const t = Math.max(0.08, Math.min(0.92, (target.y - compound.y) / h));
    point = { x: side === 'right' ? compound.x + w : compound.x, y: compound.y + h * t };
    normal = { x: side === 'right' ? 1 : -1, y: 0 };
  } else {
    const t = Math.max(0.08, Math.min(0.92, (target.x - compound.x) / w));
    point = { x: compound.x + w * t, y: side === 'bottom' ? compound.y + h : compound.y };
    normal = { x: 0, y: side === 'bottom' ? 1 : -1 };
  }
  return {
    side: side,
    point: point,
    outside: { x: point.x + normal.x * PORT_STUB, y: point.y + normal.y * PORT_STUB }
  };
}

const PORT_SIDES = ['right', 'left', 'top', 'bottom'];

// ラベルの計画 box と、app.js の描画アンカー（E: type.x+11 start / W: type.x-11 end）を一致させる。
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

function segmentHitsRect(a, b, rect) {
  return G.segmentRect(a, b, rect);
}

function pathClear(points, obstacles, exemptions) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const obstacle of obstacles) {
      if (!segmentHitsRect(a, b, inflate(obstacle, ROUTE_PAD))) continue;
      if (exemptions.some((ex) => ex.rect === obstacle && ex.seg === i)) continue;
      return false;
    }
  }
  return true;
}

/*
 * 反応1件のマーカー位置と、各端点からの経路を作る。
 * compounds は通常データ（x/y/w/h 付き）。normal は障害物の材料。
 */
function buildLayout(reactions, normal, options) {
  const opts = options || {};
  const compounds = new Map(normal.compounds.map((c) => [c.id, c]));
  const canvas = normal.canvas;

  // 通常側の障害物。ノード・主要ラベル・一般図の枠と分類ノード。
  const nodeRectById = new Map();
  const obstacles = [];
  normal.compounds.forEach((c) => {
    const rect = rectOf(c);
    nodeRectById.set(c.id, rect);
    obstacles.push(rect);
  });
  (normal.reactionLabels || []).forEach((box) => obstacles.push(box));
  if (normal.classMap) {
    obstacles.push(normal.classMap.frame);
    normal.classMap.nodes.forEach((n) => obstacles.push(rectOf(n)));
  }

  const bounds = {
    x: canvas.x,
    y: canvas.y,
    w: canvas.w + SEARCH_PAD,
    h: canvas.h + SEARCH_PAD * 0.65
  };

  const placed = [];
  const markers = {};
  const warnings = [];
  const ordered = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  ordered.forEach((reaction) => {
    const centers = reaction.substrates.concat(reaction.products).map((id) => {
      const c = compounds.get(id);
      return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    });
    const centroid = centers.reduce((acc, p) => ({ x: acc.x + p.x / centers.length, y: acc.y + p.y / centers.length }), { x: 0, y: 0 });
    const size = labelSize(reaction.typeLabel || reaction.type, G.TYPE_FONT);
    let chosen = null;
    let chosenLabel = null;
    let fallbackMarker = null;
    let fallbackLabel = null;

    const angles = [];
    for (let i = 0; i < RING_ANGLES; i++) angles.push((i / RING_ANGLES) * Math.PI * 2);
    outer:
    for (const radius of RING_RADII) {
      for (const angle of angles) {
        const marker = {
          x: round2(centroid.x + Math.cos(angle) * radius),
          y: round2(centroid.y + Math.sin(angle) * radius)
        };
        const markerBox = { x: marker.x - 6, y: marker.y - 6, w: 12, h: 12 };
        if (!inside(markerBox, bounds)) continue;
        const offsets = labelOffsets(marker, size);
        for (const offset of offsets) {
          const labelBox = { x: round2(offset.x), y: round2(offset.y), w: size.w, h: size.h };
          if (!inside(labelBox, bounds)) continue;
          if (!fallbackMarker) {
            fallbackMarker = marker;
            fallbackLabel = labelBox;
          }
          if (markerFree(marker, labelBox, obstacles, placed)) {
            chosen = marker;
            chosenLabel = labelBox;
            break outer;
          }
        }
      }
    }

    if (!chosen) {
      // 空きが見つからない場合も無言で消さない。ノード内部を避けた予備位置に置き、警告として数える。
      let safe = null;
      let safeLabel = null;
      for (let sy = canvas.y + 20; sy <= canvas.y + canvas.h - 24 && !safe; sy += 36) {
        for (let sx = canvas.x + 20; sx <= canvas.x + canvas.w - 80; sx += 40) {
          const probe = { x: round2(sx), y: round2(sy) };
          const box = { x: round2(probe.x + 10), y: round2(probe.y - size.h / 2), w: size.w, h: size.h };
          let free = true;
          for (const rect of obstacles) {
            if (!free) break;
            if (G.distPointRect(probe, rect) < 18) free = false;
          }
          if (free && markerFree(probe, box, obstacles, placed)) {
            safe = probe;
            safeLabel = box;
          }
        }
      }
      chosen = safe || fallbackMarker || { x: round2(centroid.x + 60), y: round2(centroid.y) };
      chosenLabel = safeLabel || fallbackLabel || { x: round2(chosen.x + 10), y: round2(chosen.y - 9), w: size.w, h: size.h };
      warnings.push({ id: reaction.id, kind: 'marker-crowded' });
    }
    markers[reaction.id] = {
      x: chosen.x,
      y: chosen.y,
      tier: 'academic',
      label: labelFromBox(chosenLabel, chosen.x)
    };
    placed.push({
      marker: chosen,
      markerBox: { x: chosen.x - 6, y: chosen.y - 6, w: 12, h: 12 },
      labelBox: chosenLabel
    });
  });

  // 経路。マーカーを障害物（円）として追加したうえで、端点からマーカーまで配線する。
  const routeObstacles = obstacles.slice();
  const markerDiscs = Object.keys(markers).map((id) => ({ x: markers[id].x, y: markers[id].y, r: 6 }));
  const routes = {};
  let cardOnly = 0;

  const makeRoute = (reactionId, dir, compoundId, marker, bounds2, routeObstacles2, markerDiscs2) => {
    const compound = compounds.get(compoundId);
    if (!compound || !marker) return { error: 'unknown-endpoint' };
    const discObstacles = markerDiscs2.filter((d) => d.x !== marker.x || d.y !== marker.y);
    const routeObs = {
      rects: routeObstacles2.map((rect) => ({ rect: rect })),
      discs: discObstacles,
      segments: []
    };
    // 4辺のポートを順に試す。境界→外側stub→格子→マーカー。
    let lastError = 'no-route';
    for (const side of PORT_SIDES) {
      const port = portFor(compound, marker, side);
      let path = R.gridRoute(port.point, { x: marker.x, y: marker.y }, routeObs, bounds2, { margin: 200, primary: false });
      if (!path) { lastError = 'no-route'; continue; }
      path = R.simplifyPath(path, routeObs, ROUTE_PAD);
      let points = R.dedupe(path.map((p) => ({ x: round2(p.x), y: round2(p.y) })));
      points[points.length - 1] = { x: round2(marker.x), y: round2(marker.y) };
      const exemptions = [{ rect: nodeRectById.get(compoundId), seg: 0 }];
      if (!pathClear(points, routeObstacles2, exemptions)) { lastError = 'route-crosses-node'; continue; }
      return {
        route: {
          reaction: reactionId,
          dir: dir,
          compound: compoundId,
          tier: 'academic',
          points: points.map((p) => [p.x, p.y]),
          gaps: [],
          bridges: []
        }
      };
    }
    return { error: lastError };
  };

  const keys = [];
  ordered.forEach((reaction) => {
    reaction.substrates.forEach((id) => keys.push(reaction.id + '|in|' + id));
    reaction.products.forEach((id) => keys.push(reaction.id + '|out|' + id));
  });
  keys.sort();

  keys.forEach((key) => {
    const parts = key.split('|');
    const reactionId = parts[0];
    const dir = parts[1];
    const compoundId = parts.slice(2).join('|');
    const marker = markers[reactionId];
    const result = makeRoute(reactionId, dir, compoundId, marker, bounds, obstacles, markerDiscs);
    if (!result.route) {
      warnings.push({ id: key, kind: result.error });
      cardOnly++;
      return;
    }
    routes[key] = result.route;
  });

  // 全辺が描けなかった反応だけ、マーカーを空き位置へ移して再試行する（無言の全消失を避ける）。
  const edgeCountByReaction = {};
  Object.keys(routes).forEach((key) => {
    const id = key.split('|')[0];
    edgeCountByReaction[id] = (edgeCountByReaction[id] || 0) + 1;
  });
  ordered.forEach((reaction) => {
    if (edgeCountByReaction[reaction.id]) return;
    const centers = reaction.substrates.concat(reaction.products).map((id) => {
      const c = compounds.get(id);
      return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    });
    const centroid = centers.reduce((acc, p) => ({ x: acc.x + p.x / centers.length, y: acc.y + p.y / centers.length }), { x: 0, y: 0 });
    const size = labelSize(reaction.typeLabel || reaction.type, G.TYPE_FONT);
    const occupied = Object.keys(markers).filter((id) => id !== reaction.id).map((id) => {
      const m = markers[id];
      return {
        marker: { x: m.x, y: m.y },
        markerBox: { x: m.x - 6, y: m.y - 6, w: 12, h: 12 },
        labelBox: m.label.box
      };
    });
    let placedMarker = null;
    let placedLabel = null;
    let placedRoutes = null;
    for (const radius of RING_RADII) {
      for (let ai = 0; ai < RING_ANGLES && !placedMarker; ai++) {
        const angle = (ai / RING_ANGLES) * Math.PI * 2;
        const candidate = { x: round2(centroid.x + Math.cos(angle) * radius), y: round2(centroid.y + Math.sin(angle) * radius) };
        if (!inside({ x: candidate.x - 6, y: candidate.y - 6, w: 12, h: 12 }, bounds)) continue;
        let box = null;
        for (const offset of labelOffsets(candidate, size)) {
          const labelBox = { x: round2(offset.x), y: round2(offset.y), w: size.w, h: size.h };
          if (!inside(labelBox, bounds)) continue;
          if (markerFree(candidate, labelBox, obstacles, occupied)) { box = labelBox; break; }
        }
        if (!box) continue;
        const found = [];
        const tryKeys = reaction.substrates.map((id) => reaction.id + '|in|' + id)
          .concat(reaction.products.map((id) => reaction.id + '|out|' + id));
        for (const key of tryKeys) {
          const parts = key.split('|');
          const result = makeRoute(reaction.id, parts[1], parts.slice(2).join('|'), candidate, bounds, obstacles, markerDiscs);
          if (result.route) found.push({ key: key, route: result.route });
        }
        if (found.length) {
          placedMarker = candidate;
          placedLabel = box;
          placedRoutes = found;
        }
      }
      if (placedMarker) break;
    }
    if (!placedMarker) return;
    markers[reaction.id].x = placedMarker.x;
    markers[reaction.id].y = placedMarker.y;
    markers[reaction.id].label = labelFromBox(placedLabel, placedMarker.x);
    placedRoutes.forEach((item) => { routes[item.key] = item.route; });
  });

  // 最終的な card-only 数を数え直す。
  const routed = Object.keys(routes).length;
  cardOnly = Math.max(0, keys.length - routed);
  for (let wi = warnings.length - 1; wi >= 0; wi--) {
    if (routes[warnings[wi].id]) warnings.splice(wi, 1);
  }
  const drawnCompounds = new Set();
  const withIn = new Set();
  const withOut = new Set();
  Object.keys(routes).forEach((key) => {
    const entry = routes[key];
    drawnCompounds.add(entry.compound);
    if (entry.dir === 'in') withIn.add(entry.reaction);
    else withOut.add(entry.reaction);
  });

  // アカデミック専用の表示範囲。通常 canvas を含み、はみ出した分だけ広げる。
  let minX = canvas.x;
  let minY = canvas.y;
  let maxX = canvas.x + canvas.w;
  let maxY = canvas.y + canvas.h;
  Object.keys(markers).forEach((id) => {
    const m = markers[id];
    const box = m.label.box;
    minX = Math.min(minX, m.x - 8, box.x);
    minY = Math.min(minY, m.y - 8, box.y);
    maxX = Math.max(maxX, m.x + 8, box.x + box.w);
    maxY = Math.max(maxY, m.y + 8, box.y + box.h);
  });
  const academicCanvas = {
    x: round2(minX - (minX === canvas.x ? 0 : 40)),
    y: round2(minY - (minY === canvas.y ? 0 : 40)),
    w: round2((maxX - minX) + (maxX === canvas.x + canvas.w ? 0 : 40)),
    h: round2((maxY - minY) + (maxY === canvas.y + canvas.h ? 0 : 40))
  };

  return {
    markers: markers,
    routes: routes,
    canvas: academicCanvas,
    warnings: warnings,
    stats: {
      reactionCount: ordered.length,
      routeCount: Object.keys(routes).length,
      cardOnlyCount: cardOnly,
      drawnConnectedCount: drawnCompounds.size,
      reactionsWithIncoming: withIn.size,
      reactionsWithOutgoing: withOut.size,
      reactionsWithoutIncoming: ordered.length - withIn.size,
      reactionsWithoutOutgoing: ordered.length - withOut.size,
      extendedCanvas: academicCanvas.w !== canvas.w || academicCanvas.h !== canvas.h ||
        academicCanvas.x !== canvas.x || academicCanvas.y !== canvas.y
    }
  };
}

function renderLayout(layout) {
  return JSON.stringify(layout, null, 1) + '\n';
}

module.exports = {
  MARKER_GAP,
  LABEL_PAD,
  ROUTE_PAD,
  buildLayout,
  renderLayout,
  portFor
};
