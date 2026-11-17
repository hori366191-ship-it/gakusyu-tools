/**
 * 有機反応マップ（app11）— 既存レイアウトを動かさない拡張配置
 *
 * legacy-baseline.json の座標・マーカー・経路をそのまま使い、あとから増えた
 * 通常反応（高校標準）だけを、既存の接続先近くの空きへ置く。
 * - 既存の物質・マーカー・経路は書き換えない
 * - 新しいノード・ラベル・マーカーは、既存の線も含めた障害物を避ける
 * - 新しい経路は、既存の線と交差しない（交差許容は平面性証明の対象外の主要だけ）
 * - 新規の孤立物質は作らない（427 物質は固定）
 *
 * すべて決定的。乱数・seed 調整は使わない。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');

const MARKER_R = 6;
const NODE_PAD = 3;
const LABEL_PAD = 2;
const SEG_PAD = 5;
const MIN_X = 24;
const MIN_Y = 24;

function unique(list) {
  const out = [];
  for (const value of list) if (out.indexOf(value) === -1) out.push(value);
  return out;
}

function rectOfNode(node) {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

function centerOf(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function sceneFromBase(source, base) {
  const compounds = new Map();
  for (const [id, pos] of Object.entries(base.positions)) {
    compounds.set(id, { x: pos.x, y: pos.y, w: pos.w, h: pos.h, tier: pos.tier });
  }
  const reactions = new Map();
  for (const [id, entry] of Object.entries(base.reactions)) {
    const src = source.reactions.find((r) => r.id === id);
    const marker = entry.marker;
    const label = marker.label;
    reactions.set(id, {
      x: marker.x,
      y: marker.y,
      tier: marker.tier,
      typeLabel: src ? src.typeLabel : '',
      conditions: src ? src.conditions : '',
      labelSide: label ? label.side : null,
      labelBoxes: label ? { type: { x: label.box.x, y: label.box.y, w: label.box.w, h: label.box.h }, cond: null } : null
    });
  }
  const routes = [];
  for (const [key, edge] of Object.entries(base.edges)) {
    routes.push({
      key: key,
      reactionId: edge.reaction,
      compoundId: edge.compound,
      dir: edge.dir,
      tier: edge.tier,
      legacy: true,
      points: edge.points.map((p) => ({ x: p[0], y: p[1] })),
      gaps: [],
      bridges: []
    });
  }
  return { compounds, reactions, routes, shelf: base.shelf || null };
}

function obstaclesFor(scene, route, opts) {
  const options = opts || {};
  const segPad = options.segPad == null ? SEG_PAD : options.segPad;  const rects = [];
  const discs = [];
  for (const [id, node] of scene.compounds) {
    if (route && id === route.compoundId) continue;
    rects.push({ kind: 'node', id: id, rect: rectOfNode(node) });
  }
  for (const [id, node] of scene.reactions) {
    if (route && id === route.reactionId) continue;
    if (node.labelBoxes) rects.push({ kind: 'label', id: id, rect: node.labelBoxes.type });
    discs.push({ kind: 'marker', id: id, x: node.x, y: node.y, r: MARKER_R });
  }
  const segments = [];
  if (options.segments !== false) {
    for (const other of scene.routes) {
      if (!other.points || other.points.length < 2) continue;
      if (options.segments === 'primary' && (other.tier !== 'primary' || !other.legacy)) continue;
      if (route && (other.reactionId === route.reactionId || other.compoundId === route.compoundId)) continue;
      for (const seg of G.polylineSegments(other.points)) {
        segments.push({ a: seg.a, b: seg.b, pad: segPad, route: other });
      }
    }
  }
  return { rects, discs, segments };
}

function rectFree(rect, obstacles, pad) {
  const box = G.inflate(rect, pad == null ? 0 : pad);
  for (const obstacle of obstacles.rects) {
    if (G.rectsOverlap(box, obstacle.rect)) return false;
  }
  for (const disc of obstacles.discs) {
    if (G.distPointRect({ x: disc.x, y: disc.y }, box) < disc.r) return false;
  }
  for (const seg of obstacles.segments || []) {
    if (G.segmentRect(seg.a, seg.b, G.inflate(box, seg.pad == null ? SEG_PAD : seg.pad))) return false;
  }
  return true;
}

function pointClear(point, obstacles, pad) {
  const distance = pad == null ? 0 : pad;
  if (!R.pointFree(point, obstacles, distance)) return false;
  for (const seg of obstacles.segments || []) {
    const need = Math.max(seg.pad == null ? SEG_PAD : seg.pad, distance);
    if (G.distPointSeg(point, seg.a, seg.b) < need) return false;
  }
  return true;
}

/**
 * ラベルは E → W → S → N の順で、既存の障害物に当たらない最初の位置を選ぶ。
 * 見つからなければ null（そのマーカー候補は採用しない）。
 */
function placeLabel(markerX, markerY, typeLabel, conditions, obstacles, preferredSide) {
  const tryBoxes = (boxes) => {
    if (boxes.type.x < MIN_X || boxes.type.y < MIN_Y) return false;
    if (!rectFree(boxes.type, obstacles, LABEL_PAD)) return false;
    if (boxes.cond && !rectFree(boxes.cond, obstacles, LABEL_PAD)) return false;
    return true;
  };
  const sides = ['E', 'W', 'S', 'N'];
  if (preferredSide) {
    const at = sides.indexOf(preferredSide);
    if (at > 0) sides.splice(at, 1), sides.unshift(preferredSide);
  }
  for (const side of sides) {
    const base = G.labelLayout(markerX, markerY, typeLabel, conditions, side);
    if (tryBoxes(base)) return { side: side, boxes: base };
    // 密集地帯では、同じ側のまま外側へずらした位置も試す。
    for (const extra of [20, 40, 62, 86]) {
      const boxes = {
        side: side,
        type: Object.assign({}, base.type),
        cond: base.cond ? Object.assign({}, base.cond) : null
      };
      if (side === 'E') { boxes.type.x += extra; if (boxes.cond) boxes.cond.x += extra; }
      else if (side === 'W') { boxes.type.x -= extra; if (boxes.cond) boxes.cond.x -= extra; }
      else if (side === 'N') { boxes.type.y -= extra; if (boxes.cond) boxes.cond.y -= extra; }
      else { boxes.type.y += extra; if (boxes.cond) boxes.cond.y += extra; }
      if (tryBoxes(boxes)) return { side: side, boxes: boxes };
    }
  }
  return null;
}

function markerCandidates(attachments, scene) {
  const points = attachments.map((id) => centerOf(scene.compounds.get(id)));
  const anchor = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length
  };
  const out = [];
  for (const radius of [56, 76, 98, 124, 154, 188, 226, 268, 314, 364, 418]) {
    for (let k = 0; k < 20; k++) {
      const angle = (k / 20) * Math.PI * 2 + radius * 0.013;
      out.push({ x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius });
    }
  }
  // 接続点ごとの近傍も試す（成分の端に反応点を寄せる）。
  for (const p of points) {
    for (const radius of [52, 80, 112, 150]) {
      for (let k = 0; k < 12; k++) {
        const angle = (k / 12) * Math.PI * 2;
        out.push({ x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius });
      }
    }
  }
  // 接続済みの端点（attachments）に近い候補から試す。未接続の棚座標は評価に使わない。
  const score = (p) => points.reduce((sum, q) => sum + Math.hypot(p.x - q.x, p.y - q.y), 0);
  out.sort((a, b) => score(a) - score(b) || a.x - b.x || a.y - b.y);
  return out;
}

function portFor(node, marker) {
  const c = centerOf(node);
  const dx = marker.x - c.x;
  const dy = marker.y - c.y;
  const side = R.sideOf(dx, dy);
  return { side: side, point: R.sidePoint(node, side, 0.5) };
}

function markerPortFor(marker, node) {
  const c = centerOf(node);
  const dx = c.x - marker.x;
  const dy = c.y - marker.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: marker.x + (dx / len) * (MARKER_R + 2), y: marker.y + (dy / len) * (MARKER_R + 2) };
}

function routeClear(route, scene) {
  // 新規の線は既存の線と交差してよい（新規の主要・補助は平面性証明の対象外）。
  // ただしノード・ラベル・マーカーを貫通せず、既存の線と同一直線で重ならない。
  const obstacles = obstaclesFor(scene, route, { segments: false });
  const own = scene.reactions.get(route.reactionId);
  const ownNode = scene.compounds.get(route.compoundId);
  if (own && own.labelBoxes) {
    obstacles.rects = obstacles.rects.concat({ kind: 'label', id: route.reactionId, rect: own.labelBoxes.type });
  }
  const segmentsOfRoute = G.polylineSegments(route.points);
  const ownRect = ownNode ? G.inflate(rectOfNode(ownNode), -0.5) : null;
  const ownInset = ownNode ? G.inflate(rectOfNode(ownNode), -2.5) : null;
  for (let index = 0; index < segmentsOfRoute.length; index++) {
    const seg = segmentsOfRoute[index];
    if (index === 0 && Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) < 14) return false;
    if (index === 0 && ownNode) {
      const normal = boundaryNormal(ownNode, seg.a);
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1;
      const dot = ((seg.b.x - seg.a.x) / len) * normal.x + ((seg.b.y - seg.a.y) / len) * normal.y;
      if (dot < 0.35) return false;
    }
    for (const rect of obstacles.rects) {
      const pad = rect.kind === 'label' ? 3 : rect.kind === 'node' ? 2 : -0.5;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, pad))) return false;
    }
    if (ownInset && G.segmentRect(seg.a, seg.b, ownInset)) return false;
    if (index > 0 && ownRect && G.segmentRect(seg.a, seg.b, ownRect)) return false;
    if (index === 1 && ownRect && Math.min(G.distPointRect(seg.a, ownRect), G.distPointRect(seg.b, ownRect)) < 2) {
      if (process.env.APP11_EXT_DEBUG_ONE && route.reactionId === process.env.APP11_EXT_DEBUG_ONE) {
        console.error('DEBUG-OWN', route.key, JSON.stringify({ a: seg.a, b: seg.b, ownRect }));
      }
      return false;
    }
    for (const disc of obstacles.discs) {
      if (G.segmentRect(seg.a, seg.b, G.inflate(G.markerBox(disc.x, disc.y), 2))) return false;
    }
  }
  const start = route.points[0];
  for (const other of scene.routes) {
    if (!other.points || other.points.length < 2) continue;
    if (other.reactionId === route.reactionId) continue;
    const shared = other.compoundId === route.compoundId;
    for (const a of segmentsOfRoute) {
      for (const b of G.polylineSegments(other.points)) {
        if (G.collinearOverlap(a.a, a.b, b.a, b.b) <= 2) continue;
        if (shared && (nearPoint(a.a, start, 10) || nearPoint(b.a, other.points[0], 10))) continue;
        return false;
      }
    }
  }
  return true;
}

function nearPoint(a, b, distance) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= distance;
}

function bentCandidates(start, end) {
  const out = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  out.push([start, { x: end.x, y: start.y }, end]);
  out.push([start, { x: start.x, y: end.y }, end]);
  for (const t of [0.3, 0.5, 0.7]) {
    for (const offset of [24, 48, 80, 120, 170, 230, 300]) {
      const bx = start.x + dx * t + px * offset;
      const by = start.y + dy * t + py * offset;
      out.push([start, { x: bx, y: by }, end]);
      out.push([start, { x: bx, y: by }, end]);
      const cx = start.x + dx * t - px * offset;
      const cy = start.y + dy * t - py * offset;
      out.push([start, { x: cx, y: cy }, end]);
    }
  }
  return out;
}

function pathClear(points, obstacles, pad) {
  for (let i = 0; i < points.length - 1; i++) {
    if (!R.segmentClear(points[i], points[i + 1], obstacles, pad)) return false;
  }
  return true;
}

function gridObstaclesFor(scene, route, obstacles) {
  const ownNode = scene.compounds.get(route.compoundId);
  if (!ownNode) return obstacles;
  return {
    rects: obstacles.rects.map((r) => r.kind === 'label'
      ? { kind: r.kind, id: r.id, rect: G.inflate(r.rect, 3) }
      : r.kind === 'node' ? { kind: r.kind, id: r.id, rect: G.inflate(r.rect, 2) } : r)
      .concat({ kind: 'node', id: route.compoundId, rect: rectOfNode(ownNode) }),
    discs: obstacles.discs,
    segments: obstacles.segments
  };
}

function routeEnd(scene, route, start, end, bounds, obstacles, debug, soft, directObstacles) {
  const directOk = R.segmentClear(start, end, directObstacles, R.SECONDARY_PAD);
  if (debug) console.error('DEBUG-TRY', route.key, 'end', JSON.stringify(end), 'directClear', directOk);
  if (directOk) {
    route.points = [start, end];
    applyStubStart(scene, route);
    const clear = routeClear(route, scene);
    if (debug) console.error('DEBUG-ROUTE', route.key, 'direct', clear);
    if (clear) return true;
  }
  const gridObstacles = gridObstaclesFor(scene, route, obstacles);
  const path = R.gridRoute(start, end, gridObstacles, bounds, {
    primary: false,
    margin: 1400,
    softSegments: soft
  });
  if (debug) console.error('DEBUG-TRY', route.key, 'gridPath', !!path);
  if (path) {
    route.points = R.simplifyPath(path, gridObstacles, R.SECONDARY_PAD);
    if (route.points) applyStubStart(scene, route);
    const clear = route.points && route.points.length >= 2 && routeClear(route, scene);
    if (debug) console.error('DEBUG-ROUTE', route.key, 'grid', route.points && route.points.length, 'clear', clear);
    if (clear) return true;
  }
  for (const points of bentCandidates(start, end)) {
    if (!pathClear(points, directObstacles, R.SECONDARY_PAD)) continue;
    route.points = points;
    applyStubStart(scene, route);
    if (routeClear(route, scene)) {
      if (debug) console.error('DEBUG-ROUTE', route.key, 'bent', points.length);
      return true;
    }
  }
  return false;
}

function altStarts(scene, route, start, obstacles) {
  const compound = scene.compounds.get(route.compoundId);
  if (!compound) return [];
  const c = centerOf(compound);
  const out = [];
  for (let k = 0; k < 12; k++) {
    const angle = (k / 12) * Math.PI * 2;
    const point = {
      x: c.x + Math.cos(angle) * (compound.w / 2 + 24),
      y: c.y + Math.sin(angle) * (compound.h / 2 + 24)
    };
    if (!R.segmentClear(start, point, obstacles, 3)) continue;
    out.push(point);
  }
  return out;
}

function boundaryNormal(node, point) {
  const dl = Math.abs(point.x - node.x);
  const dr = Math.abs(point.x - (node.x + node.w));
  const dt = Math.abs(point.y - node.y);
  const db = Math.abs(point.y - (node.y + node.h));
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return { x: -1, y: 0 };
  if (min === dr) return { x: 1, y: 0 };
  if (min === dt) return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function applyStubStart(scene, route) {
  const node = scene.compounds.get(route.compoundId);
  if (!node || !route.points || route.points.length < 2) return;
  const p0 = route.points[0];
  const next = route.points[1];
  const dn = Math.hypot(next.x - p0.x, next.y - p0.y) || 1;
  const normal = boundaryNormal(node, p0);
  const dot = ((next.x - p0.x) / dn) * normal.x + ((next.y - p0.y) / dn) * normal.y;
  if (dn >= 18 && dot >= 0.6) return;
  const saved = route.points;
  const tryStub = () => {
    for (const len of [26, 22, 18, 12, 8]) {
      route.points = dedupePoints([p0, { x: p0.x + normal.x * len, y: p0.y + normal.y * len }].concat(saved.slice(1)));
      if (routeClear(route, scene)) return true;
    }
    return false;
  };
  if (tryStub()) return;
  // 自分のラベルが始点スタブを塞いでいる場合は、反対側へラベルを移してから引き直す。
  const marker = scene.reactions.get(route.reactionId);
  if (marker && marker.labelBoxes) {
    const savedLabel = { side: marker.labelSide, boxes: marker.labelBoxes };
    const markerX = marker.x;
    const markerY = marker.y;
    marker.labelBoxes = null;
    marker.labelSide = null;
    const obstacles = obstaclesFor(scene, { compoundId: null, reactionId: route.reactionId });
    const side = normal.y > 0 ? 'N' : normal.y < 0 ? 'S' : normal.x > 0 ? 'W' : 'E';
    const placed = placeLabel(markerX, markerY, marker.typeLabel, marker.conditions, obstacles, side);
    if (placed) {
      marker.labelSide = placed.side;
      marker.labelBoxes = { type: placed.boxes.type, cond: null };
      if (tryStub()) return;
    }
    marker.labelSide = savedLabel.side;
    marker.labelBoxes = savedLabel.boxes;
  }
  route.points = saved;
}

function dedupePoints(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.2) continue;
    out.push(p);
  }
  return out;
}

// --- 事後正規化（配置確定後） ------------------------------------------------
//
// applyStubStart は配置中に「外向き stub」を挿入するが、元の次点が stub より
// 手前にあると 150〜180° の戻り（stub を追い越してノード側へ戻る折れ）になる。
// 配置（ノード・マーカー・ラベル）を動かすと連鎖が起きるため、ここでは
// 「全配置が確定した後」に、その折れを持つ経路の点列だけを引き直す。
// ラベル・ノード・マーカーの貫通 0、始点 14px、外向 dot は維持する。

const HEAD_STUB_LENS = [26, 22, 18, 14];

function sideNormalOf(side) {
  if (side === 'left') return { x: -1, y: 0 };
  if (side === 'right') return { x: 1, y: 0 };
  if (side === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

// ノード中心から target へ向かう線が矩形境界と交わる点（描画側の自然な端口）。
function portTowards(node, target) {
  const c = centerOf(node);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const sx = dx === 0 ? Infinity : (node.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (node.h / 2) / Math.abs(dy);
  if (sx <= sy) {
    const side = dx >= 0 ? 'right' : 'left';
    return { side: side, point: { x: c.x + (dx >= 0 ? 1 : -1) * (node.w / 2), y: c.y + dy * sx } };
  }
  const side = dy >= 0 ? 'bottom' : 'top';
  return { side: side, point: { x: c.x + dx * sy, y: c.y + (dy >= 0 ? 1 : -1) * (node.h / 2) } };
}

function headProblem(scene, route) {
  const node = scene.compounds.get(route.compoundId);
  const points = route.points;
  if (!node || !points || points.length < 2) return null;
  const p0 = points[0];
  const p1 = points[1];
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (len < 14) return 'short';
  const normal = boundaryNormal(node, p0);
  const dot = len ? ((p1.x - p0.x) / len) * normal.x + ((p1.y - p0.y) / len) * normal.y : 0;
  if (dot < 0.35) return 'dot';
  if (len <= 30 && dot >= 0.98 && points.length > 2 && stubReversal(p0, p1, points[2], normal)) {
    return 'fold';
  }
  return null;
}

// stub（p0→p1）の直後が、stub を追い越してノード側へ戻る折れか。
// 横向きに大きく離れる正当な迂回（例: ノードの反対側へ回る）は折れとみなさない。
function stubReversal(p0, p1, p2, normal) {
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (!len) return false;
  const reach = (p2.x - p0.x) * normal.x + (p2.y - p0.y) * normal.y;
  if (reach >= len - 0.5) return false;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const step = Math.hypot(dx, dy) || 1;
  const dirDot = ((p1.x - p0.x) / len) * (dx / step) + ((p1.y - p0.y) / len) * (dy / step);
  return dirDot < -0.35;
}

// 実描画と同じ当たり判定（metrics.cjs に合わせる: node/label は -0.5、marker は +2）。
function routeObstacleViolation(scene, route) {
  const points = route.points;
  if (!points || points.length < 2) return 'empty';
  const segments = G.polylineSegments(points);
  for (const seg of segments) {
    for (const [id, node] of scene.compounds) {
      if (id === route.compoundId) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rectOfNode(node), -0.5))) return 'node:' + id;
    }
    for (const [id, marker] of scene.reactions) {
      if (marker.labelBoxes && G.segmentRect(seg.a, seg.b, G.inflate(marker.labelBoxes.type, -0.5))) {
        return 'label:' + id;
      }
      if (id !== route.reactionId && G.segmentRect(seg.a, seg.b, G.inflate(G.markerBox(marker.x, marker.y), 2))) {
        return 'marker:' + id;
      }
    }
  }
  const start = points[0];
  for (const other of scene.routes) {
    if (other === route || !other.points || other.points.length < 2) continue;
    if (other.reactionId === route.reactionId) continue;
    const shared = other.compoundId === route.compoundId;
    for (const a of segments) {
      for (const b of G.polylineSegments(other.points)) {
        if (G.collinearOverlap(a.a, a.b, b.a, b.b) <= 2) continue;
        if (shared && (nearPoint(a.a, start, 10) || nearPoint(b.a, other.points[0], 10))) continue;
        return 'overlap:' + other.key;
      }
    }
  }
  return null;
}

// stub を追い越して戻る先頭の点を取り除く（横向きの正当な迂回は残す）。
function trimBehindStub(tail, p0, stub, normal) {
  const rest = tail.slice();
  while (rest.length > 1) {
    if (!stubReversal(p0, stub, rest[0], normal)) break;
    rest.shift();
  }
  return rest;
}

function acceptHead(scene, route, points, end, minGap) {
  const saved = route.points;
  route.points = dedupePoints(points);
  if (route.points.length < 2) { route.points = saved; return false; }
  const last = route.points[route.points.length - 1];
  if (end && Math.hypot(last.x - end.x, last.y - end.y) > 0.3) { route.points = saved; return false; }
  const head = headProblem(scene, route);
  const bad = head || routeObstacleViolation(scene, route) ||
    (minGap ? routeNodeClearance(scene, route, minGap) : null);
  if (bad) {
    route.points = saved;
    return false;
  }
  return true;
}

// 実描画では node 外周の角丸 + stroke 分も避ける必要があるため、任意の余白で検査する。
function routeNodeClearance(scene, route, gap) {
  for (const seg of G.polylineSegments(route.points)) {
    for (const [id, node] of scene.compounds) {
      if (id === route.compoundId) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rectOfNode(node), gap))) return 'node:' + id;
    }
  }
  return null;
}

/**
 * 折れた始点を持つ経路を、確定済みの配置のまま引き直す。
 * 1) 今の端口のまま stub 長を変える / 追い越した点を落とす / 終点へ短絡
 * 2) マーカー方向の端口へ移し、stub + 直線 / 障害物回避
 * 3) ノード境界を走査し、14px 外向きで置ける点から直線 / 回避
 * まずノード角丸 + stroke 分の余白を確保できる候補を探し、無ければ余白 0 で探す。
 * 戻り値 true のとき route.points が更新される。
 */
function repairRouteHead(scene, route, bounds) {
  const node = scene.compounds.get(route.compoundId);
  if (!node) return false;
  const saved = route.points;
  const end = saved[saved.length - 1];
  const p0 = saved[0];
  const normal = boundaryNormal(node, p0);
  const tail = saved.slice(2);

  const search = (minGap) => {
    for (const len of HEAD_STUB_LENS) {
      const stub = { x: p0.x + normal.x * len, y: p0.y + normal.y * len };
      const trimmed = trimBehindStub(tail, p0, stub, normal);
      if (acceptHead(scene, route, [p0, stub].concat(trimmed), end, minGap)) return true;
      if (trimmed.length !== tail.length && acceptHead(scene, route, [p0, stub, end], end, minGap)) return true;
    }

    const port = portTowards(node, end);
    const portNormal = sideNormalOf(port.side);
    const soft = obstaclesFor(scene, route, { segments: true, segPad: SEG_PAD }).segments;
    const flat = obstaclesFor(scene, route, { segments: false });
    const gridObstacles = {
      rects: flat.rects.concat({ kind: 'node', id: route.compoundId, rect: rectOfNode(node) }),
      discs: flat.discs,
      segments: []
    };
    const routeWithGrid = (from, stub) => {
      const path = R.gridRoute(stub, end, gridObstacles, bounds, {
        primary: false,
        margin: 1400,
        softSegments: soft,
        ownCompound: route.compoundId,
        ownReaction: route.reactionId
      });
      if (!path) return false;
      const simplified = R.simplifyPath(path, gridObstacles, R.SECONDARY_PAD);
      if (!simplified) return false;
      return acceptHead(scene, route, [from].concat(simplified), end, minGap);
    };
    for (const len of HEAD_STUB_LENS) {
      const stub = { x: port.point.x + portNormal.x * len, y: port.point.y + portNormal.y * len };
      if (acceptHead(scene, route, [port.point, stub, end], end, minGap)) return true;
      if (routeWithGrid(port.point, stub)) return true;
    }

    const scan = [];
    const step = 4;
    for (let x = node.x; x <= node.x + node.w + 0.001; x += step) {
      scan.push({ p: { x: x, y: node.y }, n: { x: 0, y: -1 } });
      scan.push({ p: { x: x, y: node.y + node.h }, n: { x: 0, y: 1 } });
    }
    for (let y = node.y; y <= node.y + node.h + 0.001; y += step) {
      scan.push({ p: { x: node.x, y: y }, n: { x: -1, y: 0 } });
      scan.push({ p: { x: node.x + node.w, y: y }, n: { x: 1, y: 0 } });
    }
    scan.sort((a, b) => Math.hypot(a.p.x - end.x, a.p.y - end.y) - Math.hypot(b.p.x - end.x, b.p.y - end.y)
      || a.p.x - b.p.x || a.p.y - b.p.y);
    for (const cand of scan) {
      const distance = Math.hypot(end.x - cand.p.x, end.y - cand.p.y);
      if (distance < 14) continue;
      const dot = ((end.x - cand.p.x) * cand.n.x + (end.y - cand.p.y) * cand.n.y) / distance;
      if (dot < 0.35) continue;
      if (acceptHead(scene, route, [cand.p, end], end, minGap)) return true;
      for (const len of [18, 14]) {
        const stub = { x: cand.p.x + cand.n.x * len, y: cand.p.y + cand.n.y * len };
        if (routeWithGrid(cand.p, stub)) return true;
      }
    }
    return false;
  };

  for (const minGap of [1.2, 0]) {
    if (search(minGap)) return true;
  }
  route.points = saved;
  return false;
}

/** 確定済み配置のまま、折れた始点だけを直す（座標・マーカー・ラベルは不変）。 */
function normalizeRouteHeads(scene, bounds) {
  const changed = [];
  for (const route of scene.routes) {
    if (route.legacy) continue;
    if (!headProblem(scene, route)) continue;
    if (repairRouteHead(scene, route, bounds)) changed.push(route.key);
  }
  return changed;
}

// --- 同一反応の入出線が交差する場合の局所修理 -------------------------------
//
// 自反応ラベルが入出線の通り道を塞ぐと、片側が大きく回り込んで他方と交差する
// ことがある。ラベル側を E/W/N/S の候補へ置き直し、その反応の経路だけを
// 引き直して交差が消える組み合わせを採用する（ノード・マーカーは動かさない）。

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a, b, c, d) {
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function routeSelfCrossings(points) {
  let count = 0;
  for (let i = 0; i < points.length - 2; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      if (segmentsCross(points[i], points[i + 1], points[j], points[j + 1])) count++;
    }
  }
  return count;
}

function crossingsBetween(a, b) {
  let count = 0;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) count++;
    }
  }
  return count;
}

function reactionCrossings(routes) {
  let count = 0;
  for (const route of routes) count += routeSelfCrossings(route.points);
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) count += crossingsBetween(routes[i].points, routes[j].points);
  }
  return count;
}

// 反応の入出線が他反応の線と交差する数（局所修理で外へ悪化させないための比較用）。
function foreignCrossings(scene, routes) {
  let count = 0;
  for (const route of routes) {
    for (const other of scene.routes) {
      if (other.reactionId === route.reactionId || !other.points || other.points.length < 2) continue;
      count += crossingsBetween(route.points, other.points);
    }
  }
  return count;
}

function routeLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

function labelCrossedByOwn(routes, box) {
  const rect = G.inflate(box, -0.5);
  for (const route of routes) {
    for (const seg of G.polylineSegments(route.points || [])) {
      if (G.segmentRect(seg.a, seg.b, rect)) return true;
    }
  }
  return false;
}

function rerouteReaction(scene, routes, bounds) {
  const marker = scene.reactions.get(routes[0].reactionId);
  if (!marker) return false;
  const saved = routes.map((r) => r.points);
  let ok = true;
  for (const route of routes) {
    const compound = scene.compounds.get(route.compoundId);
    if (!compound) { ok = false; break; }
    const port = portFor(compound, marker);
    const target = markerPortFor(marker, compound);
    let placed = routeOne(scene, route, port.point, target, bounds, { markerCenter: false });
    if (!placed) {
      // 事後修理では全経路が既に存在するため、配置時と同じ候補列では通らないことがある。
      // 端口と終点を固定したまま、stub・端口移動・境界走査で引き直す。
      route.points = [port.point, target];
      placed = repairRouteHead(scene, route, bounds);
    }
    if (!placed) { ok = false; break; }
    if (headProblem(scene, route) && !repairRouteHead(scene, route, bounds)) { ok = false; break; }
  }
  if (!ok) {
    routes.forEach((route, index) => { route.points = saved[index]; });
    return false;
  }
  return true;
}

function rerouteSubset(scene, subset, bounds) {
  if (!subset.length) return false;
  const saved = subset.map((route) => route.points);
  const ok = rerouteReaction(scene, subset, bounds);
  if (!ok) subset.forEach((route, index) => { route.points = saved[index]; });
  return ok;
}

/**
 * 同一反応の経路が自分自身・兄弟と交差しているとき、ラベル側を E/W 候補へ
 * 局所再配置し、その反応の経路だけを引き直す。座標・マーカーは不変。
 */
function repairOwnCrossings(scene, source, bounds) {
  const changed = [];
  const ids = [...scene.reactions.keys()].sort();
  for (const id of ids) {
    const routes = scene.routes.filter((route) => route.reactionId === id && route.points && route.points.length > 1);
    if (routes.length < 2) continue;
    if (routes.some((route) => route.legacy)) continue;  // 旧 86 反応の経路・ラベルは凍結
    const before = reactionCrossings(routes);
    if (!before) continue;
    const marker = scene.reactions.get(id);
    const reaction = source.reactions.find((r) => r.id === id);
    if (!reaction) continue;
    const savedPoints = routes.map((r) => r.points);
    const savedLabel = { side: marker.labelSide, boxes: marker.labelBoxes };
    const savedForeign = foreignCrossings(scene, routes);
    const options = [{ side: marker.labelSide, boxes: marker.labelBoxes }];
    const obstacles = obstaclesFor(scene, { compoundId: null, reactionId: id });
    for (const side of ['E', 'W', 'N', 'S']) {
      if (marker.labelBoxes && side === marker.labelSide) continue;
      const placed = placeLabel(marker.x, marker.y, marker.typeLabel, marker.conditions, obstacles, side);
      if (!placed) continue;
      options.push({ side: placed.side, boxes: { type: placed.boxes.type, cond: null } });
    }
    let accepted = null;
    const plans = routes.map((_, index) => [routes[index]]);
    plans.push(routes);
    const within = (plan, limit) => plan.every((route) => routeLength(route.points) <= limit * 1.35);
    for (const option of options) {
      marker.labelSide = option.side;
      marker.labelBoxes = option.boxes;
      for (const plan of plans) {
        const planSaved = plan.map((route) => route.points);
        const routesOk = rerouteSubset(scene, plan, bounds);
        const selfCross = reactionCrossings(routes);
        const labelHit = option.boxes ? labelCrossedByOwn(routes, option.boxes.type) : false;
        const foreign = foreignCrossings(scene, routes);
        const lengthOk = within(plan, Math.max(1, plan.reduce((sum, r) => sum + routeLength(planSaved[plan.indexOf(r)]), 0) / plan.length));
        const cleaner = routesOk && selfCross === 0 && !labelHit && foreign <= savedForeign && lengthOk;
        if (cleaner) { accepted = option; break; }
        plan.forEach((route, index) => { route.points = planSaved[index]; });
      }
      if (accepted) break;
    }
    if (accepted) {
      changed.push(id);
      continue;
    }
    marker.labelSide = savedLabel.side;
    marker.labelBoxes = savedLabel.boxes;
    routes.forEach((route, index) => { route.points = savedPoints[index]; });
  }
  return changed;
}

function routeOne(scene, route, start, end, bounds, opts) {
  // 新規の線は既存の線と交差してよい（新規の主要・補助は平面性証明の対象外）。
  // 既存線は「重ならない」ためのソフトコストとして渡し、直線・折れ線では 5px 離す。
  const options = opts || {};
  const soft = obstaclesFor(scene, route, { segments: true, segPad: SEG_PAD }).segments;
  const directObstacles = obstaclesFor(scene, route, { segments: true, segPad: SEG_PAD });
  const obstacles = obstaclesFor(scene, route, { segments: false });
  const debug = process.env.APP11_EXT_DEBUG_ONE &&
    (route.reactionId === process.env.APP11_EXT_DEBUG_ONE || route.compoundId === process.env.APP11_EXT_DEBUG_ONE);
  const marker = scene.reactions.get(route.reactionId);
  const ends = [end];
  // 配置時の従来挙動はマーカー中心への短絡も許す。事後修理では端口へ揃える。
  if (marker && options.markerCenter !== false) ends.push({ x: marker.x, y: marker.y });
  // ノード境界の始点セルが障害物に覆われる場合に備え、外向きに 14px 出た点からも試す。
  const compound = scene.compounds.get(route.compoundId);
  const starts = [start];
  if (compound) {
    const c = centerOf(compound);
    const dx = start.x - c.x;
    const dy = start.y - c.y;
    const side = R.sideOf(dx, dy);
    const offset = 14;
    starts.push(side === 'right' ? { x: start.x + offset, y: start.y }
      : side === 'left' ? { x: start.x - offset, y: start.y }
        : side === 'top' ? { x: start.x, y: start.y - offset }
          : { x: start.x, y: start.y + offset });
  }
  for (const from of starts) {
    const prepend = from !== start;
    for (const target of ends) {
      if (!routeEnd(scene, route, from, target, bounds, obstacles, debug, soft, directObstacles)) continue;
      if (!prepend) {
        applyStubStart(scene, route);
        return true;
      }
      route.points = [start].concat(route.points);
      if (routeClear(route, scene)) {
        applyStubStart(scene, route);
        return true;
      }
    }
  }
  if (debug) {
    const tiny = { x: start.x + (end.x - start.x) * 0.002, y: start.y + (end.y - start.y) * 0.002 };
    const blockedRects = obstacles.rects
      .filter((r) => G.segmentRect(start, tiny, G.inflate(r.rect, R.SECONDARY_PAD)))
      .map((r) => r.kind + ':' + r.id);
    const blockedDiscs = obstacles.discs
      .filter((d) => G.distPointSeg(d, start, tiny) < d.r + R.SECONDARY_PAD)
      .map((d) => d.id);
    const blockedSegs = obstacles.segments
      .filter((s) => G.segSegDistance(start, tiny, s.a, s.b) < s.pad)
      .map((s) => s.route.key);
    console.error('DEBUG-BLOCK', route.key, JSON.stringify({ start, blockedRects, blockedDiscs, blockedSegs }));
    console.error('DEBUG-ROUTE', route.key, 'no path', JSON.stringify({ start, end, bounds }));
  }
  return false;
}

function sceneBounds(scene) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of scene.compounds.values()) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  for (const node of scene.reactions.values()) {
    minX = Math.min(minX, node.x - 16);
    minY = Math.min(minY, node.y - 16);
    maxX = Math.max(maxX, node.x + 16);
    maxY = Math.max(maxY, node.y + 16);
    if (node.labelBoxes) {
      minX = Math.min(minX, node.labelBoxes.type.x);
      minY = Math.min(minY, node.labelBoxes.type.y);
      maxX = Math.max(maxX, node.labelBoxes.type.x + node.labelBoxes.type.w);
      maxY = Math.max(maxY, node.labelBoxes.type.y + node.labelBoxes.type.h);
    }
  }
  return { x: minX - 60, y: minY - 60, w: maxX - minX + 120, h: maxY - minY + 120 };
}

function shelfRect(base) {
  const shelf = base.shelf;
  return { x: shelf.x - 6, y: shelf.y - 6, w: shelf.cols * 152 + 12, h: shelf.rows * 54 + 12 };
}

/**
 * 棚にあった物質を、新しい反応点の近くの空きへ移す。
 * 旧 101 物質は network に入っているので、ここへは来ない。
 */
function moveCompoundNear(scene, compoundId, marker, tier, base) {
  const node = scene.compounds.get(compoundId);
  const size = { w: node.w, h: node.h };
  const obstacles = obstaclesFor(scene, { compoundId: compoundId, reactionId: null });
  const forbidden = shelfRect(base);
  for (const radius of [92, 118, 148, 182, 222, 268, 320, 380, 448, 520, 600, 690]) {
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * Math.PI * 2 + radius * 0.011;
      const center = { x: marker.x + Math.cos(angle) * radius, y: marker.y + Math.sin(angle) * radius };
      const rect = {
        x: center.x - size.w / 2,
        y: center.y - size.h / 2,
        w: size.w,
        h: size.h
      };
      if (rect.x < MIN_X || rect.y < MIN_Y) continue;
      if (G.rectsOverlap(rect, forbidden)) continue;
      if (base.shelf && base.shelf.side === 'right' && rect.x + rect.w > base.shelf.x - 270) continue;
      if (base.shelf && base.shelf.side !== 'right' && rect.y + rect.h > base.shelf.y - 40) continue;
      if (!rectFree(rect, obstacles, 6)) continue;
      return rect;
    }
  }
  return null;
}

function insideShelfZone(point, shelf) {
  if (!shelf) return false;
  const w = shelf.cols * 152;
  const h = shelf.rows * 54;
  if (shelf.side === 'right') {
    return point.x >= shelf.x - 260;
  }
  return point.y >= shelf.y - 40;
}

function preferredLabelSide(point, anchors, scene) {
  const centers = anchors.map((id) => centerOf(scene.compounds.get(id)));
  const ax = centers.reduce((sum, p) => sum + p.x, 0) / centers.length;
  const ay = centers.reduce((sum, p) => sum + p.y, 0) / centers.length;
  const dx = ax - point.x;
  const dy = ay - point.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'W' : 'E';
  return dy >= 0 ? 'N' : 'S';
}

function markerOptions(scene, reaction, tier, anchors, limit) {
  const obstacles = obstaclesFor(scene, { compoundId: null, reactionId: reaction.id });
  const out = [];
  for (const point of markerCandidates(anchors, scene)) {
    if (point.x < MIN_X + 20 || point.y < MIN_Y + 20) continue;
    if (scene.shelf && insideShelfZone(point, scene.shelf)) continue;
    if (!pointClear(point, obstacles, MARKER_R + 16)) continue;
    let label = null;
    if (tier === 'primary') {
      const placed = placeLabel(point.x, point.y, reaction.typeLabel, reaction.conditions, obstacles,
        preferredLabelSide(point, anchors, scene));
      if (!placed) continue;
      label = { side: placed.side, boxes: { type: placed.boxes.type, cond: null } };
    }
    out.push({ point: point, label: label });
    if (out.length >= (limit || 48)) break;
  }
  return out;
}

function fallbackMarkerOptions(scene, reaction, tier, anchors) {
  const centers = anchors.map((id) => centerOf(scene.compounds.get(id)));
  const anchor = {
    x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
    y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length
  };
  const obstacles = obstaclesFor(scene, { compoundId: null, reactionId: reaction.id });
  const bounds = sceneBounds(scene);
  const points = [];
  for (let y = bounds.y; y <= bounds.y + bounds.h; y += 52) {
    for (let x = bounds.x; x <= bounds.x + bounds.w; x += 52) {
      if (x < MIN_X + 20 || y < MIN_Y + 20) continue;
      points.push({ x: x, y: y });
    }
  }
  points.sort((a, b) => {
    const da = Math.hypot(a.x - anchor.x, a.y - anchor.y);
    const db = Math.hypot(b.x - anchor.x, b.y - anchor.y);
    return da - db || a.x - b.x || a.y - b.y;
  });
  const out = [];
  for (const point of points) {
    if (scene.shelf && insideShelfZone(point, scene.shelf)) continue;
    if (!pointClear(point, obstacles, MARKER_R + 16)) continue;
    let label = null;
    if (tier === 'primary') {
      const placed = placeLabel(point.x, point.y, reaction.typeLabel, reaction.conditions, obstacles,
        preferredLabelSide(point, anchors, scene));
      if (!placed) continue;
      label = { side: placed.side, boxes: { type: placed.boxes.type, cond: null } };
    }
    out.push({ point: point, label: label });
    if (out.length >= 160) break;
  }
  return out;
}

function tryPlace(scene, source, reaction, tier, base, network) {
  const endpoints = unique(reaction.substrates.concat(reaction.products));
  for (const id of endpoints) {
    if (!scene.compounds.has(id)) {
      throw new Error('拡張配置の端点が既存の物質にない: ' + id + '（反応 ' + reaction.id + '）');
    }
  }
  const attachments = endpoints.filter((id) => network.has(id));
  if (!attachments.length) return false;
  const options = markerOptions(scene, reaction, tier, attachments);
  const attempt = (list) => {
    for (const option of list) {
      if (placeAt(scene, reaction, tier, base, network, option)) return true;
    }
    return false;
  };
  if (attempt(options)) return true;
  return attempt(fallbackMarkerOptions(scene, reaction, tier, attachments));
}

function placeAt(scene, reaction, tier, base, network, option) {
  const endpoints = unique(reaction.substrates.concat(reaction.products));
  const point = option.point;
  const node = {
    x: point.x,
    y: point.y,
    tier: tier,
    typeLabel: reaction.typeLabel,
    conditions: reaction.conditions,
    labelSide: option.label ? option.label.side : null,
    labelBoxes: option.label ? option.label.boxes : null
  };
  scene.reactions.set(reaction.id, node);
  const created = [];
  const moved = [];
  let ok = true;
  for (const id of endpoints) {
    if (network.has(id)) continue;
    const rect = moveCompoundNear(scene, id, point, tier, base);
    if (!rect) { ok = false; break; }
    moved.push({ id: id, before: Object.assign({}, scene.compounds.get(id)) });
    scene.compounds.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, tier: tier });
    network.add(id);
  }
  const bounds = sceneBounds(scene);
  if (ok) {
    for (const dir of ['in', 'out']) {
      const ids = dir === 'in' ? reaction.substrates : reaction.products;
      for (const id of unique(ids)) {
        const compound = scene.compounds.get(id);
        const port = portFor(compound, point);
        const route = {
          key: reaction.id + '|' + dir + '|' + id,
          reactionId: reaction.id,
          compoundId: id,
          dir: dir,
          tier: tier,
          points: null,
          gaps: [],
          bridges: []
        };
        scene.routes.push(route);
        created.push(route);
        if (!routeOne(scene, route, port.point, markerPortFor(point, compound), bounds)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
  }
  if (ok) return true;
  for (const route of created) {
    const index = scene.routes.indexOf(route);
    if (index !== -1) scene.routes.splice(index, 1);
  }
  for (const entry of moved) {
    scene.compounds.set(entry.id, entry.before);
    network.delete(entry.id);
  }
  scene.reactions.delete(reaction.id);
  return false;
}

function packComponent(scene, source, reactions, tier) {
  // 既存ネットワークに接しない反応群は、地図の下側へまとめて置く。
  // 端点は互いに近接させ、棚には置かない。
  let minX = Infinity;
  let maxY = -Infinity;
  for (const node of scene.compounds.values()) {
    minX = Math.min(minX, node.x);
    maxY = Math.max(maxY, node.y + node.h);
  }
  const baseY = maxY + 180;
  const sorted = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const packedIds = new Set();
  sorted.forEach((reaction, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const point = { x: minX + 260 + col * 520, y: baseY + row * 220 };
    let label = null;
    const reactionTier = source.priority.entries.get(reaction.id).tier;
    if (reactionTier === 'primary') {
      const placed = placeLabel(point.x, point.y, reaction.typeLabel, reaction.conditions,
        { rects: [], discs: [], segments: [] }, 'W');
      if (placed) label = { side: placed.side, boxes: { type: placed.boxes.type, cond: null } };
    }
    const node = {
      x: point.x,
      y: point.y,
      tier: source.priority.entries.get(reaction.id).tier,
      typeLabel: reaction.typeLabel,
      conditions: reaction.conditions,
      labelSide: label ? label.side : null,
      labelBoxes: label ? label.boxes : null
    };
    scene.reactions.set(reaction.id, node);
    const endpoints = unique(reaction.substrates.concat(reaction.products));
    endpoints.forEach((id, i) => {
      if (packedIds.has(id)) return;
      const existing = scene.compounds.get(id);
      const size = { w: existing.w, h: existing.h };
      const rect = {
        x: point.x + 120,
        y: point.y - size.h / 2 + (i - (endpoints.length - 1) / 2) * 54,
        w: size.w,
        h: size.h
      };
      scene.compounds.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, tier: tier });
      packedIds.add(id);
    });
  });
  const bounds = sceneBounds(scene);
  for (const reaction of sorted) {
    const tier = source.priority.entries.get(reaction.id).tier;
    const point = scene.reactions.get(reaction.id);
    for (const dir of ['in', 'out']) {
      const ids = dir === 'in' ? reaction.substrates : reaction.products;
      for (const id of unique(ids)) {
        const compound = scene.compounds.get(id);
        const port = portFor(compound, point);
        const route = {
          key: reaction.id + '|' + dir + '|' + id,
          reactionId: reaction.id,
          compoundId: id,
          dir: dir,
          tier: tier,
          points: null,
          gaps: [],
          bridges: []
        };
        scene.routes.push(route);
        if (!routeOne(scene, route, port.point, markerPortFor(point, compound), bounds)) {
          throw new Error('まとめた反応群の配線に失敗: ' + reaction.id + '|' + dir + '|' + id);
        }
      }
    }
  }
}

/**
 * base の scene に、追加反応だけを配置する。
 * - 既存ネットワークに接する反応は、その近傍の空きへ置く
 * - 端点に棚の物質があれば、ネットワーク側へ移す（棚に残さない）
 * - 既存ネットワークに接しない反応群は、まとめて右側のベイへ置く
 */
function extend(source, base) {
  const scene = sceneFromBase(source, base);
  const legacy = new Set(Object.keys(base.reactions));
  const added = source.reactions
    .filter((reaction) => !legacy.has(reaction.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const network = new Set();
  for (const [id, pos] of Object.entries(base.positions)) {
    if (pos.tier !== 'isolated') network.add(id);
  }
  let pending = added.slice();
  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    const rest = [];
    for (const reaction of pending) {
      const tier = source.priority.entries.get(reaction.id).tier;
      const endpoints = unique(reaction.substrates.concat(reaction.products));
      if (!endpoints.some((id) => network.has(id))) {
        rest.push(reaction);
        continue;
      }
      if (!tryPlace(scene, source, reaction, tier, base, network)) {
        rest.push(reaction);
        continue;
      }
      progressed = true;
    }
    pending = rest;
  }
  if (pending.length) {
    const unattached = [];
    const failed = [];
    for (const reaction of pending) {
      const endpoints = unique(reaction.substrates.concat(reaction.products));
      if (endpoints.some((id) => network.has(id))) failed.push(reaction.id);
      else unattached.push(reaction);
    }
    if (failed.length) {
      if (process.env.APP11_EXT_DEBUG) {
        for (const id of failed) {
          const reaction = pending.find((r) => r.id === id);
          const tier = source.priority.entries.get(id).tier;
          const endpoints = unique(reaction.substrates.concat(reaction.products));
          console.error('DEBUG', id, tier, JSON.stringify(endpoints),
            'markerOptions', markerOptions(scene, reaction, tier).length);
        }
      }
      throw new Error('拡張配置に失敗: ' + failed.slice(0, 5).join(', ') +
        (failed.length > 5 ? ' …他 ' + (failed.length - 5) + ' 件' : '') +
        '（既存の線・ノード・ラベルを避けられる位置が見つかりません）');
    }
    // 残りは弱連結成分に分け、成分ごとに地図の下へまとめる。
    const pendingIds = new Set(unattached.map((r) => r.id));
    const seen = new Set();
    const components = [];
    for (const reaction of unattached) {
      if (seen.has(reaction.id)) continue;
      const comp = [];
      const stack = [reaction];
      seen.add(reaction.id);
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        for (const id of unique(cur.substrates.concat(cur.products))) {
          for (const next of unattached) {
            if (seen.has(next.id) || !pendingIds.has(next.id)) continue;
            if (next.substrates.includes(id) || next.products.includes(id)) {
              seen.add(next.id);
              stack.push(next);
            }
          }
        }
      }
      components.push(comp);
    }
    components.sort((a, b) => (a[0].id < b[0].id ? -1 : 1));
    for (const comp of components) {
      const tier = source.priority.entries.get(comp[0].id).tier;
      packComponent(scene, source, comp, tier);
    }
  }
  // 配置をすべて確定させた後に、stub 追い越しで折れた経路の点列だけを直す
  // （ノード・マーカー・ラベルの座標は動かさない）。
  const headChanges = normalizeRouteHeads(scene, sceneBounds(scene));
  // 同一反応の入出線が交差する場合は、その反応のラベル側と経路だけを局所修理する。
  const crossChanges = repairOwnCrossings(scene, source, sceneBounds(scene));
  if (headChanges.length) scene.routeChanges = headChanges;
  if (crossChanges.length) scene.crossChanges = crossChanges;
  return { scene: scene, added: added.map((r) => r.id), routeChanges: headChanges, crossChanges: crossChanges };
}

module.exports = {
  MARKER_R,
  SEG_PAD,
  HEAD_STUB_LENS,
  sceneFromBase,
  obstaclesFor,
  placeLabel,
  markerCandidates,
  routeOne,
  routeClear,
  headProblem,
  routeObstacleViolation,
  routeNodeClearance,
  repairRouteHead,
  normalizeRouteHeads,
  reactionCrossings,
  repairOwnCrossings,
  extend
};
