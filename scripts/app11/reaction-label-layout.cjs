/**
 * 有機反応マップ（app11）— 反応ラベル配置ソルバ（純モジュール）
 *
 * 目的:
 *   反応ラベル（typeLabel）を「自分の配線の近く」に置き、他の反応の配線に
 *   近すぎる誤対応をなくす。通常モード・アカデミックモード・新しい配置案の
 *   すべてから同じ入力契約で呼べるよう、DOM に触らない純関数だけを置く。
 *
 * 入力契約（plain JSON。座標は world の px）:
 *   {
 *     compounds: { [id]: { x, y, w, h } },                 // 物質ノード矩形（左上原点）
 *     reactions: { [id]: { x, y, tier, typeLabel,
 *                          conditions, substrates, products } },
 *     edges:     { [key]: { reaction, compound, dir, tier,
 *                           points: [[x,y], ...] } },        // 保存済み経路（stored）
 *     lines:     { [reactionId]: [ [ {x,y}, ... ], ... ] }, // 実際に描かれる線（drawn）
 *     labels:    { [id]: { box:{x,y,w,h}, side, type?, cond?, leader? } }, // 現配置（任意）
 *     blockers:  [ { x, y, w, h, id? } ]                    // 追加の障害物（一般図など・任意）
 *   }
 *
 * 出力:
 *   {
 *     labels: { [id]: { side:'E'|'W', type:{x,y}, box:{x,y,w,h}, cond:null,
 *                       leader:null|[[x,y],...] } },
 *     metrics: { [id]: { state:'direct'|'leader'|'unresolved',
 *                        ownerDistance, foreignDistance, margin,
 *                        leaderLength, originDistance, changed, reason } },
 *     summary: { targets, direct, leader, unresolved, changed }
 *   }
 *
 * 規約:
 *   - box は左上原点の実描画矩形（唯一の正）。
 *   - type は box の中心（通常モードの app.js と同じ center 規約）。
 *     アカデミックの旧アンカー規約への変換は生成側アダプタが行う。
 *   - leader は [[x,y],[x,y],...] の plain 配列。不要なら null。
 *
 * 評価する線:
 *   stored（保存点列）と drawn（Core.reactionConnectors → separateSharedPorts →
 *   enforcePaintClearance → routePath の実形状）の両方。drawn が渡されない場合は
 *   edges から折れ線を作って代用する。
 *
 * 決定性: 乱数・時刻・seed は使わない。入力が同じなら出力も同じ。
 */
'use strict';

const G = require('./geometry.cjs');

const DEFAULTS = {
  typeH: G.TYPE_H,
  nodePad: 3,
  labelPad: 3,
  markerPad: 4,
  blockerPad: 3,
  lineClear: 4,          // すべての線（自線を含む）から確保する最小距離
  ownTarget: 12,         // 自線までの距離の目標
  foreignMargin: 8,      // 異名線までの距離 - 自線までの距離 の目標
  anchorStep: 20,        // 長い線分上の候補間隔
  anchorFractions: [0.25, 0.5, 0.75],
  maxAnchorsPerReaction: 48,
  gaps: [4, 8, 12],      // 自線からの垂直余白
  maxLeader: 48,
  maxRescueLeader: 80,   // 真の逆転/遠距離ラベルだけ、L字・2bendで局所回避する上限
  leaderGaps: [20, 28, 36, 44],
  repairPasses: 1,
  width: null,           // (text) => px。null なら通常モードの式
};

function defaultWidth(text) {
  return Math.ceil(G.textWidth(text, G.TYPE_FONT) * 1.4) + 8;
}

function pt(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
}

function center(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function boxOf(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function clampBox(box, bounds) {
  if (!bounds) return box;
  const dx = box.x < bounds.x ? bounds.x - box.x
    : box.x + box.w > bounds.x + bounds.w ? bounds.x + bounds.w - (box.x + box.w) : 0;
  const dy = box.y < bounds.y ? bounds.y - box.y
    : box.y + box.h > bounds.y + bounds.h ? bounds.y + bounds.h - (box.y + box.h) : 0;
  if (!dx && !dy) return box;
  return { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
}

/* ------------------------------------------------------------------ *
 * 区間・矩形の距離
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

/* ------------------------------------------------------------------ *
 * 空間インデックス（線・矩形・マーカー）
 * ------------------------------------------------------------------ */

function cellKey(cx, cy) {
  return cx + ',' + cy;
}

function SegmentIndex(cellSize) {
  this.cell = cellSize || 48;
  this.grid = new Map();
  this.segments = [];
}

SegmentIndex.prototype.add = function (reactionId, polyline) {
  const points = polyline.map(pt);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    const index = this.segments.length;
    this.segments.push({ rid: reactionId, a, b });
    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y);
    const maxy = Math.max(a.y, b.y);
    const cs = this.cell;
    for (let cx = Math.floor(minx / cs); cx <= Math.floor(maxx / cs); cx++) {
      for (let cy = Math.floor(miny / cs); cy <= Math.floor(maxy / cs); cy++) {
        const key = cellKey(cx, cy);
        let bucket = this.grid.get(key);
        if (!bucket) { bucket = []; this.grid.set(key, bucket); }
        bucket.push(index);
      }
    }
  }
};

SegmentIndex.prototype.near = function (box, radius, accept) {
  const found = new Map();
  const cs = this.cell;
  const minx = box.x - radius;
  const maxx = box.x + box.w + radius;
  const miny = box.y - radius;
  const maxy = box.y + box.h + radius;
  const seen = new Set();
  for (let cx = Math.floor(minx / cs); cx <= Math.floor(maxx / cs); cx++) {
    for (let cy = Math.floor(miny / cs); cy <= Math.floor(maxy / cs); cy++) {
      const bucket = this.grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const index of bucket) {
        if (seen.has(index)) continue;
        seen.add(index);
        const segment = this.segments[index];
        if (accept && !accept(segment.rid)) continue;
        const d = segRectDistance(segment.a, segment.b, box);
        if (d > radius) continue;
        const prev = found.get(segment.rid);
        if (prev === undefined || d < prev) found.set(segment.rid, d);
      }
    }
  }
  return found;
};

SegmentIndex.prototype.anyWithin = function (box, radius, accept) {
  const near = this.near(box, radius, accept);
  for (const value of near.values()) if (value <= radius + 1e-9) return true;
  return false;
};

function RectIndex(cellSize) {
  this.cell = cellSize || 64;
  this.grid = new Map();
  this.rects = [];
}

RectIndex.prototype.add = function (entry) {
  const index = this.rects.length;
  this.rects.push(entry);
  const r = entry.rect;
  const cs = this.cell;
  for (let cx = Math.floor(r.x / cs); cx <= Math.floor((r.x + r.w) / cs); cx++) {
    for (let cy = Math.floor(r.y / cs); cy <= Math.floor((r.y + r.h) / cs); cy++) {
      const key = cellKey(cx, cy);
      let bucket = this.grid.get(key);
      if (!bucket) { bucket = []; this.grid.set(key, bucket); }
      bucket.push(index);
    }
  }
};

RectIndex.prototype.anyOverlap = function (box, pad, accept) {
  const b = G.inflate(box, pad);
  const cs = this.cell;
  const seen = new Set();
  for (let cx = Math.floor(b.x / cs); cx <= Math.floor((b.x + b.w) / cs); cx++) {
    for (let cy = Math.floor(b.y / cs); cy <= Math.floor((b.y + b.h) / cs); cy++) {
      const bucket = this.grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const index of bucket) {
        if (seen.has(index)) continue;
        seen.add(index);
        const entry = this.rects[index];
        if (accept && !accept(entry)) continue;
        if (G.rectsOverlap(b, entry.rect)) return entry;
      }
    }
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * 入力の正規化
 * ------------------------------------------------------------------ */

function normalizeInput(input, opts) {
  const reactions = input.reactions || {};
  const labels = input.labels || {};
  const edges = input.edges || {};
  const ownerLines = {};
  for (const id of Object.keys(input.lines || {})) {
    ownerLines[id] = (input.lines[id] || []).map((poly) => poly.map(pt));
  }
  const edgeLines = {};
  for (const key of Object.keys(edges)) {
    const edge = edges[key];
    if (!Array.isArray(edge.points) || edge.points.length < 2) continue;
    if (!edgeLines[edge.reaction]) edgeLines[edge.reaction] = [];
    edgeLines[edge.reaction].push(edge.points.map(pt));
  }
  for (const id of Object.keys(edgeLines)) {
    if (!ownerLines[id]) ownerLines[id] = [];
    if (!ownerLines[id].length) ownerLines[id] = edgeLines[id];
  }
  // 障害物用: 実描画線 + 保存経路。owner 接続の正当化には ownerLines（実描画）だけを使う。
  const lines = {};
  for (const id of Object.keys(ownerLines)) lines[id] = ownerLines[id].slice();
  for (const id of Object.keys(edgeLines)) lines[id] = (lines[id] || []).concat(edgeLines[id]);
  const blockers = (input.blockers || []).map((b) => ({ id: b.id, rect: b }));
  return { reactions, labels, lines, ownerLines, blockers, compounds: input.compounds || {}, opts };
}

/* ------------------------------------------------------------------ *
 * ソルバ本体
 * ------------------------------------------------------------------ */

function solveLabels(input, options) {
  const opts = Object.assign({}, DEFAULTS, options || {});
  if (!opts.width) opts.width = defaultWidth;
  const scene = normalizeInput(input, opts);

  // 線のインデックス（障害物用 = 実描画 + 保存経路）
  const lines = new SegmentIndex(48);
  for (const id of Object.keys(scene.lines)) {
    for (const poly of scene.lines[id]) lines.add(id, poly);
  }
  // owner 接続の評価は実際に描かれる線（drawn）だけ
  const ownerIndex = new SegmentIndex(48);
  for (const id of Object.keys(scene.ownerLines)) {
    for (const poly of scene.ownerLines[id]) ownerIndex.add(id, poly);
  }
  // 障害物（物質・追加障害物・ラベル・マーカー）
  const staticRects = new RectIndex(64);
  for (const id of Object.keys(scene.compounds)) {
    const c = scene.compounds[id];
    staticRects.add({ kind: 'node', id, rect: { x: c.x, y: c.y, w: c.w, h: c.h } });
  }
  for (const blocker of scene.blockers) {
    staticRects.add({ kind: 'blocker', id: blocker.id, rect: blocker.rect });
  }
  const labelRects = new RectIndex(64);
  const markers = new RectIndex(32);
  for (const id of Object.keys(scene.reactions)) {
    const r = scene.reactions[id];
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    markers.add({
      kind: 'marker',
      id,
      rect: G.markerBox(r.x, r.y)
    });
  }

  const targets = (opts.targets || Object.keys(scene.labels)).slice().sort();
  const results = {};
  const chosen = {};
  const debugInfo = {};
  const debugFail = {};

  // 既存配置（無い場合は null）
  function existingOf(id) {
    const label = scene.labels[id];
    if (!label || !label.box) return null;
    const box = {
      x: label.box.x,
      y: label.box.y,
      w: label.box.w,
      h: label.box.h
    };
    return { box, side: label.side || (box.x >= (scene.reactions[id] || {}).x ? 'E' : 'W'), leader: label.leader || null };
  }

  const queryRadius = opts.queryRadius || 160;

  function ownerDistance(id, box, radius) {
    const near = ownerIndex.near(box, radius || queryRadius, (rid) => rid === id);
    const own = near.get(id);
    return own === undefined ? Infinity : own;
  }

  function foreignDistance(id, box, radius) {
    const near = lines.near(box, radius || queryRadius, (rid) => rid !== id);
    let min = Infinity;
    for (const value of near.values()) min = Math.min(min, value);
    return min;
  }

  function hardClean(id, box, leader, debugKey, params) {
    const p = params || {};
    const lineClear = p.lineClear == null ? opts.lineClear : p.lineClear;
    const nodePad = p.nodePad == null ? opts.nodePad : p.nodePad;
    const markerPad = p.markerPad == null ? opts.markerPad : p.markerPad;
    const fail = (reason) => {
      if (debugKey) {
        if (!debugFail[debugKey]) debugFail[debugKey] = {};
        debugFail[debugKey][reason] = (debugFail[debugKey][reason] || 0) + 1;
      }
      return false;
    };
    if (staticRects.anyOverlap(box, nodePad)) return fail('node');
    if (labelRects.anyOverlap(box, opts.labelPad, (entry) => entry.id !== id)) return fail('label');
    if (markers.anyOverlap(box, markerPad)) return fail('marker');
    if (lines.anyWithin(box, lineClear)) return fail('line');
    if (leader) {
      for (let i = 0; i < leader.length - 1; i++) {
        const a = pt(leader[i]);
        const b = pt(leader[i + 1]);
        if (staticRects.anyOverlap(segmentBox(a, b), Math.max(0, nodePad - 1))) return fail('leader-node');
        if (labelRects.anyOverlap(segmentBox(a, b), opts.labelPad, (entry) => entry.id !== id)) return fail('leader-label');
        if (lines.anyWithin(segmentBox(a, b), lineClear, (rid) => rid !== id)) return fail('leader-line');
      }
    }
    return true;
  }

  function score(id, box, leader, ownHint) {
    const own = leader && leader.length > 1
      ? leaderLength(leader)
      : (ownHint !== undefined ? ownHint : ownerDistance(id, box));
    const radius = Number.isFinite(own)
      ? Math.max(opts.foreignMargin + own + 2, 14)
      : opts.foreignMargin + opts.ownTarget + 2;
    const foreign = foreignDistance(id, box, radius);
    const visibleForeign = leader && leader.length > 1
      ? Math.min(foreign, foreignDistance(id, segmentBox(pt(leader[0]), pt(leader[leader.length - 1])), radius))
      : foreign;
    const margin = visibleForeign - own;
    const violation = Math.max(0, opts.foreignMargin - margin);
    const origin = existingOf(id);
    let originDistance = 0;
    if (origin) {
      const a = center(origin.box);
      const b = center(box);
      originDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
    return {
      violation,
      own,
      foreign: visibleForeign,
      margin,
      leader: leader && leader.length > 1,
      leaderLength: leader && leader.length > 1 ? leaderLength(leader) : 0,
      originDistance
    };
  }

  function keyOf(metrics) {
    return [
      round(metrics.violation, 3),
      round(metrics.own === Infinity ? 1e6 : metrics.own, 3),
      metrics.leader ? 1 : 0,
      round(metrics.originDistance, 3)
    ];
  }

  function better(a, b) {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return true;
      if (ka[i] > kb[i]) return false;
    }
    return false;
  }

  function addCandidate(list, id, box, side, leader, ownHint) {
    list.push({ box, side, leader: leader || null, ownHint });
  }

  const candidateCache = new Map();
  function candidatesFor(id) {
    if (candidateCache.has(id)) return candidateCache.get(id);
    const reaction = scene.reactions[id] || {};
    const text = String(reaction.typeLabel || '');
    const w = Math.max(1, opts.width(text));
    const h = opts.typeH;
    const direct = [];
    const leaderList = [];
    const polys = scene.ownerLines[id] || [];
    const anchors = [];
    for (const poly of polys) {
      if (poly.length < 2) continue;
      const total = G.polylineLength(poly);
      const distances = [0, total];
      for (const fraction of opts.anchorFractions) distances.push(total * fraction);
      for (let d = opts.anchorStep; d < total; d += opts.anchorStep) distances.push(d);
      distances.sort((a, b) => a - b);
      let last = -Infinity;
      for (const d of distances) {
        if (d - last < opts.anchorStep * 0.6) continue;
        last = d;
        const point = G.pointAlong(poly, d);
        const dir = tangentAt(poly, point);
        if (!dir) continue;
        anchors.push({ point, dir });
        if (anchors.length >= opts.maxAnchorsPerReaction) break;
      }
      if (anchors.length >= opts.maxAnchorsPerReaction) break;
    }
    const seen = new Set();
    for (const anchor of anchors) {
      const p = anchor.point;
      // 線の向きに依存せず、左右・上下の4方向へ置く（横長ラベルが別の自線区間に
      // 近づくケースも拾う）。gap は線とラベルの余白。
      for (const gap of opts.gaps) {
        const boxes = [
          { box: clampBox({ x: p.x + gap, y: p.y - h / 2, w, h }, opts.bounds), side: 'E' },
          { box: clampBox({ x: p.x - gap - w, y: p.y - h / 2, w, h }, opts.bounds), side: 'W' },
          { box: clampBox({ x: p.x - w / 2, y: p.y + gap, w, h }, opts.bounds), side: 'E' },
          { box: clampBox({ x: p.x - w / 2, y: p.y - gap - h, w, h }, opts.bounds), side: 'W' }
        ];
        for (const entry of boxes) {
          const box = entry.box;
          const tag = box.x + ',' + box.y;
          if (seen.has(tag)) continue;
          seen.add(tag);
          addCandidate(direct, id, box, entry.side, null, gap);
        }
      }
    }
    // leader 候補（直接置けないときだけ使う）。粗いアンカーから8方向×複数半径へ逃がす。
    // 線が密集して「線のすぐ横」に置けない場合でも、短い引き出し線で自線へ結ぶ。
    const coarse = [];
    for (const poly of polys) {
      if (poly.length < 2) continue;
      const total = G.polylineLength(poly);
      for (let d = 0; d <= total; d += 60) coarse.push(G.pointAlong(poly, d));
    }
    for (const p of coarse) {
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        for (const radius of [16, 28, 40, 52, 64]) {
          const cx = p.x + Math.cos(angle) * radius;
          const cy = p.y + Math.sin(angle) * radius;
          const box = clampBox(boxOf(cx, cy, w, h), opts.bounds);
          const edge = { x: G.clamp(p.x, box.x, box.x + box.w), y: G.clamp(p.y, box.y, box.y + box.h) };
          const leader = [edge, { x: p.x, y: p.y }];
          if (leaderLength(leader) > opts.maxLeader) continue;
          const tag = 'C' + box.x + ',' + box.y;
          if (seen.has(tag)) continue;
          seen.add(tag);
          addCandidate(leaderList, id, box, (box.x + box.w / 2) >= (reaction.x || 0) ? 'E' : 'W', leader, leaderLength(leader));
        }
      }
    }
    const result = { direct, leader: leaderList };
    candidateCache.set(id, result);
    return result;
  }
  const order = targets.slice().sort((a, b) => {
    const pa = (opts.priority || []).indexOf(a);
    const pb = (opts.priority || []).indexOf(b);
    if (pa !== -1 || pb !== -1) {
      if (pa === -1) return 1;
      if (pb === -1) return -1;
      if (pa !== pb) return pa - pb;
    }
    const oa = existingOf(a);
    const ob = existingOf(b);
    const ma = oa ? score(a, oa.box, null).margin : -Infinity;
    const mb = ob ? score(b, ob.box, null).margin : -Infinity;
    if (ma !== mb) return ma - mb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  function evaluateCandidates(id, list, tiers) {
    for (let t = 0; t < tiers.length; t++) {
      let best = null;
      let accepted = 0;
      for (const candidate of list) {
        if (!hardClean(id, candidate.box, candidate.leader, opts.debugId === id ? id : null, tiers[t])) continue;
        accepted++;
        const metrics = score(id, candidate.box, candidate.leader, candidate.ownHint);
        if (!best || better(metrics, best.metrics)) {
          best = { box: candidate.box, side: candidate.side, leader: candidate.leader, metrics };
        }
      }
      if (accepted > 0) return { best, accepted, tier: t };
    }
    return { best: null, accepted: 0, tier: -1 };
  }

  function chooseBest(id, tiersOverride, bypassFreeze) {
    const list = candidatesFor(id);
    const origin = existingOf(id);
    const originClean = origin ? hardClean(id, origin.box, origin.leader ? origin.leader.map(pt) : null) : false;
    if (origin && originClean) {
      const originMetrics = score(id, origin.box, origin.leader ? origin.leader.map(pt) : null);
      // 公式の要改善条件: own >= 25、または own >= 12 かつ own-foreign >= 5（真の逆転）。
      const officialCandidate = originMetrics.own >= 25 ||
        (originMetrics.own >= 12 && Number.isFinite(originMetrics.foreign) &&
          originMetrics.own - originMetrics.foreign >= 5);
      if (!officialCandidate && !bypassFreeze) {
        return {
          box: origin.box,
          side: origin.side,
          leader: origin.leader ? origin.leader.map(pt) : null,
          metrics: originMetrics
        };
      }
    }
    const tiers = tiersOverride || [
      {},
      { lineClear: 0.5 },
      { lineClear: 0.5, markerPad: 0 },
      { lineClear: 0.5, markerPad: 0, nodePad: 0 }
    ];
    let accepted = 0;
    const lists = candidatesFor(id);
    // 直接候補を先に全段評価。目標を満たす direct が出たら leader 探索はしない（高速化）。
    const directEval = evaluateCandidates(id, lists.direct, tiers);
    let best = directEval.best;
    accepted += directEval.accepted;
    const meets = best && best.metrics.own <= opts.ownTarget + 1e-9 && best.metrics.margin >= opts.foreignMargin - 1e-9;
    if (!meets) {
      const leaderEval = evaluateCandidates(id, lists.leader, tiers);
      accepted += leaderEval.accepted;
      if (leaderEval.best && (!best || better(leaderEval.best.metrics, best.metrics))) best = leaderEval.best;
    }
    if (opts.debugId === id) {
      debugInfo[id] = {
        candidates: lists.direct.length + lists.leader.length,
        accepted,
        fails: debugFail[id] || {},
        best: best ? { own: best.metrics.own, margin: best.metrics.margin, leader: !!best.leader } : null
      };
    }
    if (origin && originClean) {
      const originMetrics = score(id, origin.box, origin.leader ? origin.leader.map(pt) : null);
      if (!best || !better(best.metrics, originMetrics)) {
        best = {
          box: origin.box,
          side: origin.side,
          leader: origin.leader ? origin.leader.map(pt) : null,
          metrics: originMetrics
        };
      }
    }
    if (!best) {
      return origin
        ? { box: origin.box, side: origin.side, leader: origin.leader ? origin.leader.map(pt) : null, metrics: score(id, origin.box, null), failed: true }
        : null;
    }
    if (best.metrics.own > opts.ownTarget + 1e-9 || best.metrics.margin < opts.foreignMargin - 1e-9) {
      // 目標未達。既存へ戻さず、達成できた最良の候補を残して unresolved として正直に報告する。
      best.failed = true;
    }
    if (best) best.accepted = accepted;
    return best;
  }

  function rebuildLabelRects(exceptId) {
    // 選択済みラベルのうち、指定 id 以外を障害物として作り直す。
    const fresh = new RectIndex(64);
    for (const id of Object.keys(chosen)) {
      if (id === exceptId) continue;
      fresh.add({ kind: 'label', id, rect: chosen[id].box });
    }
    labelRects.grid = fresh.grid;
    labelRects.rects = fresh.rects;
  }

  function rebuildLabelRectsExcept(exceptSet) {
    const fresh = new RectIndex(64);
    for (const id of Object.keys(chosen)) {
      if (exceptSet.has(id)) continue;
      fresh.add({ kind: 'label', id, rect: chosen[id].box });
    }
    labelRects.grid = fresh.grid;
    labelRects.rects = fresh.rects;
  }

  // Pass 0: 難易度順に greedy。確定したラベルを障害物へ足していく。
  for (const id of order) {
    const best = chooseBest(id);
    if (best) {
      chosen[id] = best;
      labelRects.add({ kind: 'label', id, rect: best.box });
    }
  }

  // Pass 1..: 局所 repair。全体を作り直し、各ラベルを「他ラベルだけ」の障害物で再評価する。
  for (let pass = 0; pass < opts.repairPasses; pass++) {
    for (const id of order) {
      const current = chosen[id];
      if (!current) {
        const best = chooseBest(id);
        if (best) chosen[id] = best;
        continue;
      }
      rebuildLabelRects(id);
      const best = chooseBest(id);
      if (!best) continue;
      const currentClean = hardClean(id, current.box, current.leader);
      if (!currentClean || better(best.metrics, current.metrics)) chosen[id] = best;
    }
  }

  // 最終整合: ラベル同士の重なりだけは必ず 0 にする（他ラベルと重ならない候補へ移す）。
  function overlapsChosen(id, box) {
    for (const other of Object.keys(chosen)) {
      if (other === id) continue;
      if (G.rectsOverlap(box, chosen[other].box)) return true;
    }
    return false;
  }

  function overlapsExcept(id, box, exceptSet) {
    for (const other of Object.keys(chosen)) {
      if (other === id || exceptSet.has(other)) continue;
      if (G.rectsOverlap(box, chosen[other].box)) return true;
    }
    return false;
  }
  function resolveOverlaps() {
    for (let guard = 0; guard < 32; guard++) {
      let pair = null;
      for (let i = 0; i < order.length && !pair; i++) {
        const a = chosen[order[i]];
        if (!a) continue;
        for (let j = i + 1; j < order.length; j++) {
          const b = chosen[order[j]];
          if (!b) continue;
          if (G.rectsOverlap(a.box, b.box)) { pair = [order[i], order[j]]; break; }
        }
      }
      if (!pair) break;
      let resolved = false;
      const priorities = opts.priority || [];
      const tryOrder = [pair[0], pair[1]].sort((a, b) => {
        const pa = priorities.indexOf(a); const pb = priorities.indexOf(b);
        return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
      });
      for (const id of tryOrder) {
        rebuildLabelRects(id);
        const current = chosen[id];
        if (hardClean(id, current.box, current.leader)) continue;
        let best = priorities.indexOf(id) !== -1 ? chooseBest(id, [{}], true) : null;
        if (!best || overlapsChosen(id, best.box)) best = chooseBest(id, null, true);
        if (best && !overlapsChosen(id, best.box)) {
          chosen[id] = best;
          resolved = true;
          break;
        }
      }
      if (!resolved) break;
    }
  }
  resolveOverlaps();

  // 代表ラベルは線の余白 4px を優先して復元する（緩和候補しか無い場合は現状維持）。
  for (const id of opts.priority || []) {
    if (!chosen[id]) continue;
    rebuildLabelRects(id);
    const strict = chooseBest(id, [{}]);
    if (strict && strict.accepted > 0 && !overlapsChosen(id, strict.box)) chosen[id] = strict;
  }

  // 局所救済: 未達ラベルの近隣2〜3枚を一時的に動かして余地を作る。
  // 非対象ラベルも「十分な余裕を保ったまま微移動」してよい（旧位置維持義務はない）。
  for (const id of targets) {
    const current = chosen[id];
    if (!current) continue;
    const m = current.metrics;
    const strict = m.own <= opts.ownTarget + 1e-9 && m.margin >= opts.foreignMargin - 1e-9;
    const clearanceOk = !lines.anyWithin(current.box, opts.lineClear);
    if (strict && clearanceOk) continue;
    const c = { x: current.box.x + current.box.w / 2, y: current.box.y + current.box.h / 2 };
    const neighbors = Object.keys(chosen)
      .filter((n) => n !== id)
      .map((n) => {
        const b = chosen[n].box;
        return { id: n, d: Math.hypot((b.x + b.w / 2) - c.x, (b.y + b.h / 2) - c.y) };
      })
      .filter((n) => n.d <= 170)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((n) => n.id);
    if (!neighbors.length) continue;
    const snapshot = { target: current, neighbors: {} };
    for (const n of neighbors) snapshot.neighbors[n] = chosen[n];
    const except = new Set([id].concat(neighbors));
    rebuildLabelRectsExcept(except);
    const targetNext = chooseBest(id, null, true);
    const targetFixesClearance = !clearanceOk && targetNext && !lines.anyWithin(targetNext.box, opts.lineClear);
    if (!targetNext || (!better(targetNext.metrics, current.metrics) && !targetFixesClearance) ||
      overlapsExcept(id, targetNext.box, except)) {
      rebuildLabelRects(null);
      continue;
    }
    chosen[id] = targetNext;
    const neighborNext = {};
    let okay = true;
    for (const n of neighbors) {
      rebuildLabelRects(n);
      const next = chooseBest(n, null, true);
      if (!next) { okay = false; break; }
      if (better(snapshot.neighbors[n].metrics, next.metrics)) { okay = false; break; }
      if (overlapsExcept(n, next.box, except)) { okay = false; break; }
      neighborNext[n] = next;
      chosen[n] = next;
    }
    if (!okay) {
      chosen[id] = snapshot.target;
      for (const n of neighbors) chosen[n] = snapshot.neighbors[n];
      rebuildLabelRects(null);
      continue;
    }
    rebuildLabelRects(null);
  }

  resolveOverlaps();

  // 出力
  function nearestOwnPoint(id, box) {
    let best = null;
    const polys = scene.ownerLines[id] || [];
    for (const poly of polys) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(len / 2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          const d = G.distPointRect(p, box);
          if (!best || d < best.dist) best = { dist: d, point: p };
        }
      }
    }
    return best;
  }

  function leaderSegmentValid(id, leader) {
    if (!leader || leader.length < 2) return false;
    const a = pt(leader[0]);
    const b = pt(leader[leader.length - 1]);
    const sb = segmentBox(a, b);
    if (staticRects.anyOverlap(sb, 0)) return false;
    if (markers.anyOverlap(sb, 0)) return false;
    if (labelRects.anyOverlap(sb, 0, (entry) => entry.id !== id)) return false;
    for (const other of Object.keys(chosen)) {
      if (other === id) continue;
      if (G.rectsOverlap(sb, chosen[other].box)) return false;
    }
    if (lines.anyWithin(sb, 0.5, (rid) => rid !== id)) return false;
    for (const seg of placedLeaders) {
      if (G.segSegDistance(a, b, seg.a, seg.b) < 0.5) return false;
    }
    return true;
  }

  const placedLeaders = [];

  // 直線で通らない救済用に、直角L字・2bendの局所迂回を試す。
  function findLeaderPath(id, box, maxLen) {
    const polys = scene.ownerLines[id] || [];
    const starts = [];
    for (const poly of polys) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(len / 8));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          const d = G.distPointRect(p, box);
          if (d > maxLen) continue;
          starts.push({ d, p });
        }
      }
    }
    starts.sort((u, v) => u.d - v.d || u.p.x - v.p.x || u.p.y - v.p.y);
    const limit = Math.min(starts.length, 40);
    let best = null;
    for (let si = 0; si < limit; si++) {
      const p = starts[si].p;
      const q = {
        x: G.clamp(p.x, box.x, box.x + box.w),
        y: G.clamp(p.y, box.y, box.y + box.h)
      };
      if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) continue;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const candidates = [
        [q, p],
        [q, { x: p.x, y: q.y }, p],
        [q, { x: q.x, y: p.y }, p]
      ];
      for (const off of [12, 22, 34]) {
        const mx = (q.x + p.x) / 2 + nx * off;
        const my = (q.y + p.y) / 2 + ny * off;
        candidates.push([q, { x: mx, y: my }, p]);
        candidates.push([q, { x: (q.x + p.x) / 2 - nx * off, y: (q.y + p.y) / 2 - ny * off }, p]);
      }
      for (const pts of candidates) {
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (total > maxLen + 1e-9) continue;
        let valid = true;
        for (let i = 0; i < pts.length - 1; i++) {
          if (!leaderSegmentValid(id, [pts[i], pts[i + 1]])) { valid = false; break; }
        }
        if (!valid) continue;
        const score = total + (pts.length - 2) * 3 + starts[si].d * 0.01;
        if (!best || score < best.score) best = { score, pts, total };
      }
      if (best && best.total <= starts[si].d + 1) break;
    }
    void best;
    return best ? best.pts : null;
  }

  const labels = {};
  const metrics = {};
  let direct = 0;
  let leader = 0;
  let unresolved = 0;
  let changed = 0;
  for (const id of targets) {
    const result = chosen[id];
    if (!result) {
      const origin = existingOf(id);
      metrics[id] = {
        state: 'unresolved',
        ownerDistance: null,
        foreignDistance: null,
        margin: null,
        leaderLength: 0,
        originDistance: 0,
        changed: false,
        reason: 'no-candidate'
      };
      unresolved++;
      if (origin) labels[id] = { side: origin.side, type: center(origin.box), box: origin.box, cond: null, leader: null };
      continue;
    }
    const box = {
      x: round(result.box.x, 2),
      y: round(result.box.y, 2),
      w: round(result.box.w, 2),
      h: round(result.box.h, 2)
    };
    const withLeader = result.leader && result.leader.length > 1;
    let finalLeader = withLeader ? result.leader.map(pt) : null;
    let state = result.failed ? 'unresolved'
      : result.metrics.margin >= opts.foreignMargin - 1e-9 && result.metrics.own <= opts.ownTarget + 1e-9
        ? (withLeader ? 'leader' : 'direct')
        : 'unresolved';
    // direct で margin を満たせない場合、自線へ確実に接続する短い leader で関連付ける。
    // これは「strict direct」ではなく leader カテゴリとして扱う（真の取り違えとは区別）。
    if (state === 'unresolved') {
      const m = result.metrics;
      const severe = (m.foreign !== Infinity && m.own > m.foreign) || m.own >= 25;
      const maxLen = severe ? opts.maxRescueLeader : opts.maxLeader;
      const path = findLeaderPath(id, box, maxLen);
      if (path) {
        finalLeader = path;
        state = 'leader';
        for (let i = 0; i < path.length - 1; i++) {
          placedLeaders.push({ a: pt(path[i]), b: pt(path[i + 1]) });
        }
      }
    }
    if (state === 'direct') direct++;
    else if (state === 'leader') leader++;
    else unresolved++;
    const origin = existingOf(id);
    const isChanged = !origin || Math.abs(origin.box.x - box.x) > 0.01 || Math.abs(origin.box.y - box.y) > 0.01;
    if (isChanged) changed++;
    labels[id] = {
      side: result.side,
      type: { x: round(box.x + box.w / 2, 2), y: round(box.y + box.h / 2, 2) },
      box,
      cond: null,
      leader: finalLeader ? finalLeader.map((p) => [round(p.x, 2), round(p.y, 2)]) : null
    };
    metrics[id] = {
      state,
      ownerDistance: result.metrics.own === Infinity ? null : round(result.metrics.own, 2),
      foreignDistance: result.metrics.foreign === Infinity ? null : round(result.metrics.foreign, 2),
      margin: result.metrics.margin === Infinity ? null : round(result.metrics.margin, 2),
      strictMargin: result.metrics.margin === Infinity || result.metrics.margin >= opts.foreignMargin - 1e-9,
      leaderLength: finalLeader ? round(leaderLength(finalLeader), 2) : 0,
      originDistance: round(result.metrics.originDistance, 2),
      changed: isChanged,
      reason: state === 'unresolved'
        ? describeFailure(result.metrics, opts)
        : null
    };
  }

  return {
    labels,
    metrics,
    debug: opts.debugId ? debugInfo : undefined,
    summary: {
      targets: targets.length,
      direct,
      leader,
      unresolved,
      changed
    }
  };
}

/* ------------------------------------------------------------------ *
 * 補助
 * ------------------------------------------------------------------ */

function tangentAt(poly, point) {
  const a = poly[point.seg];
  const b = poly[point.seg + 1];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return { x: dx / len, y: dy / len };
}

function segmentBox(a, b) {
  if (!b) return { x: a.x, y: a.y, w: 0, h: 0 };
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y)
  };
}

function leaderLength(leader) {
  let sum = 0;
  for (let i = 0; i < leader.length - 1; i++) {
    const a = pt(leader[i]);
    const b = pt(leader[i + 1]);
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function describeFailure(metrics, opts) {
  if (metrics.own === Infinity) return 'own-line-missing';
  const reasons = [];
  if (metrics.own > opts.ownTarget) reasons.push('owner ' + round(metrics.own, 1) + '>' + opts.ownTarget);
  if (metrics.margin < opts.foreignMargin) reasons.push('margin ' + round(metrics.margin, 1) + '<' + opts.foreignMargin);
  return reasons.join(', ') || 'threshold';
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 2);
  return Math.round(value * factor) / factor;
}

module.exports = {
  DEFAULTS,
  solveLabels,
  // テスト・計測用
  segRectDistance,
  SegmentIndex,
  RectIndex,
  leaderLength,
  defaultWidth
};
