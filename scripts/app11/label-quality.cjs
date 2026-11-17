/**
 * 有機反応マップ（app11）— ラベル品質の計測と生成側アダプタ
 *
 * - 実際に描画される線（map-core.js の reactionConnectors → separateSharedPorts
 *   → enforcePaintClearance → routePath → samplePath）と、保存済み経路の両方から
 *   「ラベル矩形 ↔ 線」の距離を測る。
 * - 通常モード（layout.json / routes.json）とアカデミック配置（placed）の
 *   ラベル後処理（label post-process）を同じソルバへ渡す。
 *
 * 出力ラベルの規約（C と合意した共通 API）:
 *   { side, type:{x,y}=box中心, anchor:'center', box:{x,y,w,h}, cond, leader|null }
 *
 * DOM には触らない。ブラウザ検証は行わない。
 */
'use strict';

const path = require('node:path');
const G = require('./geometry.cjs');
const solver = require('./reaction-label-layout.cjs');

let Core = null;
try {
  Core = require(path.join(__dirname, '..', '..', 'site', 'app11', 'map-core.js'));
} catch (error) {
  Core = null;
}

function pt(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalWidth(text) {
  return Math.ceil(G.textWidth(text, G.TYPE_FONT) * 1.4) + 8;
}

function academicWidth(text) {
  return Math.ceil(G.textWidth(text, G.TYPE_FONT)) + 12;
}

/* ------------------------------------------------------------------ *
 * 実描画ジオメトリ
 * ------------------------------------------------------------------ */

/**
 * 反応ごとの実描画ポリライン（複数 subpath を含む）を作る。
 * Core が読めない場合は保存経路だけで代用する（偽の成功はしない。呼び出し側が
 * meta.drawn=false を確認できる）。
 */
function buildDrawnLines(input) {
  const positions = input.positions || {};
  const markers = input.markers || {};
  const edges = input.edges || {};
  const nodeW = input.nodeW || 136;
  const nodeH = input.nodeH || 34;
  const stored = {};
  for (const key of Object.keys(edges)) {
    const edge = edges[key];
    if (!Array.isArray(edge.points) || edge.points.length < 2) continue;
    if (!stored[edge.reaction]) stored[edge.reaction] = [];
    stored[edge.reaction].push(edge.points.map(pt));
  }
  if (!Core) return { lines: clone(stored), stored, drawn: false };

  const compoundById = {};
  for (const id of Object.keys(positions)) {
    const p = positions[id];
    compoundById[id] = { id, x: p.x, y: p.y, w: p.w, h: p.h };
  }
  const byReaction = {};
  for (const key of Object.keys(edges)) {
    const edge = edges[key];
    if (!Array.isArray(edge.points) || edge.points.length < 2) continue;
    if (!byReaction[edge.reaction]) byReaction[edge.reaction] = [];
    byReaction[edge.reaction].push({
      dir: edge.dir,
      id: edge.compound,
      tier: edge.tier || 'secondary',
      points: edge.points.map(pt),
      gaps: edge.gaps || [],
      bridges: edge.bridges || []
    });
  }
  const connectors = {};
  const all = [];
  for (const id of Object.keys(markers)) {
    const marker = markers[id];
    const list = Core.reactionConnectors({
      id,
      x: marker.x,
      y: marker.y,
      edges: byReaction[id] || []
    }, { compoundById, nodeW, nodeH });
    (list || []).forEach((connector) => { connector.rid = id; });
    connectors[id] = list || [];
    for (const connector of connectors[id]) all.push(connector);
  }
  Core.separateSharedPorts(all);
  Core.enforcePaintClearance(all);
  const lines = {};
  for (const id of Object.keys(connectors)) {
    if (!lines[id]) lines[id] = [];
    for (const connector of connectors[id]) {
      const d = Core.routePath(connector.shaft || connector.points, connector.gaps, connector.bridges);
      const subpaths = Core.samplePath(d, 0.5) || [];
      for (const subpath of subpaths) {
        if (subpath && subpath.length > 1) lines[id].push(subpath.map(pt));
      }
      if (connector.arrowHead) {
        const headPath = Core.arrowHeadPath(connector.arrowHead);
        for (const subpath of Core.samplePath(headPath, 0.5) || []) {
          if (subpath && subpath.length > 1) lines[id].push(subpath.map(pt));
        }
      }
    }
  }
  return { lines, stored, drawn: true };
}

function mergeLines(a, b) {
  const out = {};
  for (const id of Object.keys(a)) out[id] = (out[id] || []).concat(a[id]);
  for (const id of Object.keys(b)) out[id] = (out[id] || []).concat(b[id]);
  return out;
}

/* ------------------------------------------------------------------ *
 * 計測
 * ------------------------------------------------------------------ */

function boxPolylineDistance(box, polyline) {
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = solver.segRectDistance(polyline[i], polyline[i + 1], box);
    if (d < min) min = d;
  }
  return min;
}

/**
 * ラベルごとの「自線距離 / 異名線距離 / 差」を実測する。
 * lines は反応ID → ポリライン配列。保存経路と実描画を結合して渡す。
 */
function measureLabels(labels, lines, options) {
  const opts = options || {};
  const radius = opts.radius || 200;
  const index = new solver.SegmentIndex(48);
  for (const id of Object.keys(lines)) {
    for (const polyline of lines[id]) index.add(id, polyline);
  }
  const ownerLines = opts.ownerLines || lines;
  const ownerIndex = new solver.SegmentIndex(48);
  for (const id of Object.keys(ownerLines)) {
    for (const polyline of ownerLines[id]) ownerIndex.add(id, polyline);
  }
  const out = {};
  for (const id of Object.keys(labels)) {
    const label = labels[id];
    const box = label && label.box ? label.box : null;
    if (!box) continue;
    const ownNear = ownerIndex.near(box, radius, (rid) => rid === id);
    const foreignNear = index.near(box, radius, (rid) => rid !== id);
    const own = ownNear.get(id);
    let foreign = Infinity;
    let foreignId = null;
    for (const [rid, value] of foreignNear.entries()) {
      if (value < foreign) { foreign = value; foreignId = rid; }
    }
    out[id] = {
      ownerDistance: own === undefined ? null : round(own, 2),
      foreignDistance: foreign === Infinity ? null : round(foreign, 2),
      foreignId: foreignId,
      margin: own === undefined ? null : round(foreign - own, 2)
    };
  }
  return out;
}

/**
 * 正式な「要改善」判定（ユーザー要件）:
 *   own >= 25、または own >= 12 かつ own - foreign >= 5（別線により近い＝真の逆転）
 * ラベル box と実 visible path の距離で判定する。
 */
function isCandidate(metrics) {
  if (!metrics || metrics.ownerDistance == null) return false;
  if (metrics.ownerDistance >= 25) return true;
  if (metrics.ownerDistance >= 12 && metrics.foreignDistance != null &&
    metrics.ownerDistance - metrics.foreignDistance >= 5) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * 通常モード
 * ------------------------------------------------------------------ */

function normalInput(layout, routes) {
  const reactions = {};
  for (const id of Object.keys(layout.reactions)) {
    const marker = layout.reactions[id];
    reactions[id] = {
      x: marker.x,
      y: marker.y,
      tier: marker.tier,
      typeLabel: marker.typeLabel,
      conditions: marker.conditions,
      substrates: marker.substrates,
      products: marker.products
    };
  }
  const labels = {};
  for (const id of Object.keys(layout.reactions)) {
    if (layout.reactions[id].label) labels[id] = layout.reactions[id].label;
  }
  return { kind: 'normal', reactions, labels };
}

/**
 * 通常モードのラベルを後処理する。位置・マーカー・経路・tier は変更しない。
 * 変更するのは layout.reactions[id].label だけ。
 */
function applyNormalLabelLayout(layout, routes, options) {
  const opts = options || {};
  const geo = buildDrawnLines({
    positions: layout.positions,
    markers: layout.reactions,
    edges: routes.edges,
    nodeW: layout.nodeW,
    nodeH: layout.nodeH
  });
  const lines = mergeLines(geo.lines, geo.stored);
  const base = normalInput(layout, routes);
  const targets = (opts.targets ? opts.targets.slice() : Object.keys(base.labels)).sort();
  const before = measureLabels(base.labels, lines, { ownerLines: geo.lines });
  const result = solver.solveLabels({
    compounds: layout.positions,
    reactions: base.reactions,
    edges: routes.edges,
    lines: geo.lines,
    labels: base.labels
  }, {
    targets,
    width: normalWidth,
    typeH: G.TYPE_H,
    priority: opts.priority,
    repairPasses: opts.repairPasses,
    debugId: opts.debugId
  });
  const applied = {};
  for (const id of targets) {
    const label = result.labels[id];
    if (!label) continue;
    layout.reactions[id].label = projectLabel(label);
    applied[id] = {
      before: before[id],
      after: result.metrics[id],
      candidate: isCandidate(before[id]),
      strong: (opts.strong || []).indexOf(id) !== -1
    };
  }
  // 報告用の距離は実際の最終配置から測り直す（ソルバ内は探索半径を絞っている）。
  const finalLabels = {};
  for (const id of targets) {
    if (layout.reactions[id].label) finalLabels[id] = layout.reactions[id].label;
  }
  const afterExact = measureLabels(finalLabels, lines, { ownerLines: geo.lines });
  for (const id of Object.keys(applied)) {
    const exact = afterExact[id];
    if (exact) {
      applied[id].after.ownerDistance = exact.ownerDistance;
      applied[id].after.foreignDistance = exact.foreignDistance;
      applied[id].after.margin = exact.margin;
    }
  }
  const summary = finalizeAfter(applied, finalLabels, opts, { ownerLines: geo.lines, obstacleLines: lines, labels: finalLabels, reactions: base.reactions, compounds: layout.positions });
  return {
    kind: 'normal',
    drawn: geo.drawn,
    summary,
    debug: result.debug,
    labels: applied,
    candidates: Object.keys(applied).filter((id) => applied[id].candidate),
    strong: Object.keys(applied).filter((id) => applied[id].strong),
    unresolved: Object.keys(applied).filter((id) => applied[id].after.state === 'unresolved')
  };
}

/* ------------------------------------------------------------------ *
 * アカデミック配置
 * ------------------------------------------------------------------ */

function academicInput(placed, classMap, reactionMeta, options) {
  const opts = options || {};
  const markers = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
  const edges = Object.assign({}, placed.normalRoutes || {}, placed.routes || {});
  const reactions = {};
  for (const id of Object.keys(markers)) {
    const meta = (reactionMeta || {})[id] || {};
    reactions[id] = {
      x: markers[id].x,
      y: markers[id].y,
      tier: markers[id].tier || meta.tier || 'academic',
      typeLabel: meta.typeLabel || markers[id].typeLabel || '',
      conditions: meta.conditions || '',
      substrates: meta.substrates || [],
      products: meta.products || []
    };
  }
  const labels = {};
  for (const id of Object.keys(markers)) {
    if (markers[id].label) labels[id] = markers[id].label;
  }
  const blockers = [];
  if (classMap) {
    if (classMap.frame) blockers.push(Object.assign({ id: 'classmap-frame' }, classMap.frame));
    (classMap.nodes || []).forEach((node, index) => {
      blockers.push(Object.assign({ id: 'classmap-node-' + index }, node));
    });
  }
  return { markers, edges, reactions, labels, blockers };
}

/**
 * アカデミック配置のラベルを後処理する。マーカー座標・経路・物質座標は変更しない。
 * 変更するのは placed.markers / placed.normalMarkers の label だけ。
 */
function applyAcademicLabelLayout(placed, classMap, reactionMeta, options) {
  const opts = options || {};
  const input = academicInput(placed, classMap, reactionMeta, opts);
  const geo = buildDrawnLines({
    positions: placed.positions,
    markers: input.markers,
    edges: input.edges,
    nodeW: opts.nodeW || 136,
    nodeH: opts.nodeH || 34
  });
  const lines = mergeLines(geo.lines, geo.stored);
  const targets = Object.keys(input.labels).sort();
  const before = measureLabels(input.labels, lines, { ownerLines: geo.lines });
  const result = solver.solveLabels({
    compounds: placed.positions,
    reactions: input.reactions,
    edges: input.edges,
    lines: geo.lines,
    labels: input.labels,
    blockers: input.blockers
  }, {
    targets,
    width: academicWidth,
    typeH: opts.typeH || 18,
    priority: opts.priority,
    repairPasses: opts.repairPasses
  });
  const applied = {};
  for (const id of targets) {
    const label = result.labels[id];
    if (!label) continue;
    const projected = projectLabel(label);
    if (placed.markers && placed.markers[id]) placed.markers[id].label = projected;
    else if (placed.normalMarkers && placed.normalMarkers[id]) placed.normalMarkers[id].label = projected;
    applied[id] = {
      before: before[id],
      after: result.metrics[id],
      candidate: isCandidate(before[id])
    };
  }
  const finalLabels = {};
  for (const id of targets) {
    const label = (placed.markers && placed.markers[id] && placed.markers[id].label) ||
      (placed.normalMarkers && placed.normalMarkers[id] && placed.normalMarkers[id].label);
    if (label) finalLabels[id] = label;
  }
  const afterExact = measureLabels(finalLabels, lines, { ownerLines: geo.lines });
  for (const id of Object.keys(applied)) {
    const exact = afterExact[id];
    if (exact) {
      applied[id].after.ownerDistance = exact.ownerDistance;
      applied[id].after.foreignDistance = exact.foreignDistance;
      applied[id].after.margin = exact.margin;
    }
  }
  const summary = finalizeAfter(applied, finalLabels, opts, { ownerLines: geo.lines, obstacleLines: lines, labels: finalLabels, reactions: input.reactions, compounds: placed.positions });
  return {
    kind: 'academic',
    drawn: geo.drawn,
    summary,
    labels: applied,
    candidates: Object.keys(applied).filter((id) => applied[id].candidate),
    unresolved: Object.keys(applied).filter((id) => applied[id].after.state === 'unresolved')
  };
}

/* ------------------------------------------------------------------ *
 * 出力整形
 * ------------------------------------------------------------------ */

function projectLabel(label) {
  return {
    side: label.side,
    type: { x: label.type.x, y: label.type.y },
    anchor: 'center',
    cond: label.cond || null,
    box: { x: label.box.x, y: label.box.y, w: label.box.w, h: label.box.h },
    leader: label.leader && label.leader.length > 1
      ? label.leader.map((p) => [round(p[0], 2), round(p[1], 2)])
      : null
  };
}

const OWN_TARGET = 12;
const FOREIGN_MARGIN = 8;
const MAX_LEADER = 48;

/**
 * leader が「実際に描かれる線（ownerLines）」へ接続し、他要素を横断しないか検証する。
 * state 文字列や長さだけでは判定しない（raw 保存経路と描画経路のズレを排除）。
 */
function validateLeaderGeometry(input) {
  const id = input.id;
  const label = input.label;
  const leader = label && label.leader;
  if (!Array.isArray(leader) || leader.length < 2) return { valid: false, reason: 'no-leader' };
  const pts = leader.map((p) => ({ x: p[0], y: p[1] }));
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  if (length <= 0.5 || length > 80 + 1e-6) return { valid: false, reason: 'length ' + round(length, 2) };
  const box = label.box;
  const start = pts[0];
  const edges = [
    [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }],
    [{ x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }],
    [{ x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }],
    [{ x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }]
  ];
  let boundary = Infinity;
  for (const [a, b] of edges) boundary = Math.min(boundary, G.distPointSeg(start, a, b));
  if (boundary > 0.8) return { valid: false, reason: 'start-not-on-box ' + round(boundary, 2) };
  const end = pts[pts.length - 1];
  const ownerPolys = (input.ownerLines || {})[id] || [];
  let ownDist = Infinity;
  for (const poly of ownerPolys) {
    for (let i = 0; i < poly.length - 1; i++) ownDist = Math.min(ownDist, G.distPointSeg(end, poly[i], poly[i + 1]));
  }
  if (ownDist > 0.7) return { valid: false, reason: 'end-not-on-own ' + round(ownDist, 2) };
  const obstacle = input.obstacleLines || {};
  const labels = input.labels || {};
  const reactions = input.reactions || {};
  const compounds = input.compounds || {};
  const otherLeaders = [];
  for (const other of Object.keys(labels)) {
    if (other === id) continue;
    const l = labels[other].leader;
    if (Array.isArray(l) && l.length > 1) otherLeaders.push(l.map((p) => ({ x: p[0], y: p[1] })));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    for (const rid of Object.keys(obstacle)) {
      if (rid === id) continue;
      for (const poly of obstacle[rid]) {
        for (let k = 0; k < poly.length - 1; k++) {
          if (G.segSegDistance(a, b, poly[k], poly[k + 1]) < 0.5) {
            return { valid: false, reason: 'foreign-cross ' + rid };
          }
        }
      }
    }
    for (const nid of Object.keys(compounds)) {
      const n = compounds[nid];
      if (G.segmentRect(a, b, { x: n.x, y: n.y, w: n.w, h: n.h })) {
        return { valid: false, reason: 'node-cross ' + nid };
      }
    }
    for (const other of Object.keys(labels)) {
      if (other === id) continue;
      if (labels[other].box && G.segmentRect(a, b, labels[other].box)) {
        return { valid: false, reason: 'label-cross ' + other };
      }
    }
    for (const ol of otherLeaders) {
      for (let k = 0; k < ol.length - 1; k++) {
        if (G.segSegDistance(a, b, ol[k], ol[k + 1]) < 0.5) {
          return { valid: false, reason: 'leader-cross' };
        }
      }
    }
    for (const mid of Object.keys(reactions)) {
      if (mid === id) continue;
      const m = reactions[mid];
      if (G.segmentRect(a, b, G.markerBox(m.x, m.y))) {
        return { valid: false, reason: 'marker-cross ' + mid };
      }
    }
  }
  return { valid: true, length: length, ownDist: ownDist };
}
function finalizeAfter(applied, labels, opts, geometry) {
  const ownTarget = (opts && opts.ownTarget) || OWN_TARGET;
  const marginTarget = (opts && opts.foreignMargin) || FOREIGN_MARGIN;
  const summary = { targets: Object.keys(applied).length, direct: 0, leader: 0, unresolved: 0, changed: 0 };
  for (const id of Object.keys(applied)) {
    const entry = applied[id];
    const after = entry.after;
    const label = labels[id];
    let hasLeader = !!(label && label.leader && label.leader.length > 1);
    let leaderValid = false;
    if (hasLeader && geometry) {
      const check = validateLeaderGeometry({
        id: id,
        label: label,
        ownerLines: geometry.ownerLines,
        obstacleLines: geometry.obstacleLines,
        labels: labels,
        reactions: geometry.reactions,
        compounds: geometry.compounds
      });
      leaderValid = check.valid;
      if (check.valid) after.leaderLength = round(check.length, 2);
      if (!check.valid) {
        // 実描画線へ届かない/横断する leader はデータから外す（false pass を残さない）。
        label.leader = null;
        after.leaderLength = 0;
        hasLeader = false;
        after.leaderError = check.reason;
      }
    } else {
      leaderValid = hasLeader;
    }
    const nearOwn = after.ownerDistance != null && after.ownerDistance <= ownTarget + 1e-9;
    const marginOk = after.margin != null && after.margin >= marginTarget - 1e-9;
    if (hasLeader && nearOwn && marginOk) {
      label.leader = null;
      after.leaderLength = 0;
      hasLeader = false;
    }
    let state;
    if (nearOwn && marginOk) state = 'direct';
    else if (hasLeader && leaderValid && after.leaderLength <= 80 + 1e-9) state = 'leader';
    else state = 'unresolved';
    after.state = state;
    after.strictMargin = marginOk;
    if (state === 'unresolved') {
      after.reason = describeFailure(after, ownTarget, marginTarget);
    } else {
      after.reason = null;
    }
    if (state === 'direct') summary.direct++;
    else if (state === 'leader') summary.leader++;
    else summary.unresolved++;
    if (after.changed) summary.changed++;
  }
  return summary;
}

function describeFailure(after, ownTarget, marginTarget) {
  if (after.ownerDistance == null) return 'own-line-missing';
  const reasons = [];
  if (after.ownerDistance > ownTarget) reasons.push('owner ' + round(after.ownerDistance, 1) + '>' + ownTarget);
  if (after.margin == null || after.margin < marginTarget) {
    reasons.push('margin ' + round(after.margin, 1) + '<' + marginTarget);
  }
  return reasons.join(', ') || 'threshold';
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 2);
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ *
 * B の label-route-repair helper 向けアダプタ
 * ------------------------------------------------------------------ */

/**
 * 真の逆転（own > foreign）または own >= 25 で、有効 leader を持たないラベルの
 * 修復候補を JSON で返す。B は own / foreign の route key だけを局所 reroute する。
 *
 * input = { labels, lines, edges, reactions }
 * - lines: label-quality.buildDrawnLines(...).lines と mergeLines の union 推奨
 * - edges: 保存経路（route key → { reaction, compound, dir, points }）
 */
function collectRepairTargets(input) {
  const labels = input.labels || {};
  const edges = input.edges || {};
  const measured = measureLabels(labels, input.lines || {}, { ownerLines: input.ownerLines || input.lines });
  const keysByReaction = {};
  for (const key of Object.keys(edges)) {
    const edge = edges[key];
    if (!keysByReaction[edge.reaction]) keysByReaction[edge.reaction] = [];
    keysByReaction[edge.reaction].push(key);
  }
  const targets = [];
  for (const id of Object.keys(measured)) {
    const m = measured[id];
    if (m.ownerDistance == null) continue;
    const label = labels[id] || {};
    const hasLeader = Array.isArray(label.leader) && label.leader.length > 1;
    if (hasLeader) {
      const check = validateLeaderGeometry({
        id: id,
        label: label,
        ownerLines: input.ownerLines || input.lines || {},
        obstacleLines: input.lines || {},
        labels: labels,
        reactions: input.reactions || {},
        compounds: input.compounds || {}
      });
      if (check.valid) continue;
    }
    const strict = m.ownerDistance <= 12 && (m.margin == null || m.margin >= 8);
    if (strict) continue;
    const inversion = m.foreignDistance != null && m.ownerDistance > m.foreignDistance;
    const far = m.ownerDistance >= 25;
    if (!inversion && !far) continue;
    targets.push({
      id: id,
      box: label.box,
      anchor: label.anchor || 'center',
      type: label.type || null,
      ownerDistance: m.ownerDistance,
      foreignDistance: m.foreignDistance,
      margin: m.margin,
      foreignId: m.foreignId || null,
      inversion: inversion,
      far: far,
      ownerRouteKeys: keysByReaction[id] || [],
      foreignRouteKeys: m.foreignId ? (keysByReaction[m.foreignId] || []) : []
    });
  }
  targets.sort((a, b) => (b.ownerDistance - a.ownerDistance) || (a.id < b.id ? -1 : 1));
  return targets;
}

/**
 * アカデミック配置（placed）から B helper 用の geometry を組み立てる。
 * nodepositions / 反応 facts は固定。classMap は blockers として渡す。
 */
function academicRepairGeometry(placed, classMap, reactionMeta) {
  const input = academicInput(placed, classMap, reactionMeta, {});
  const geo = buildDrawnLines({
    positions: placed.positions,
    markers: input.markers,
    edges: input.edges,
    nodeW: 136,
    nodeH: 34
  });
  const lines = mergeLines(geo.lines, geo.stored);
  return {
    labels: input.labels,
    lines: lines,
    ownerLines: geo.lines,
    edges: input.edges,
    reactions: input.reactions,
    compounds: placed.positions,
    blockers: input.blockers,
    classMap: classMap || null,
    drawn: geo.drawn
  };
}

module.exports = {
  buildDrawnLines,
  mergeLines,
  measureLabels,
  isCandidate,
  applyNormalLabelLayout,
  applyAcademicLabelLayout,
  normalWidth,
  academicWidth,
  projectLabel,
  boxPolylineDistance,
  collectRepairTargets,
  academicRepairGeometry,
  validateLeaderGeometry
};
