/**
 * 有機反応マップ（app11）— オフライン配置最適化の入口
 *
 * 実行:
 *   node scripts/app11/optimize-layout.cjs          # site-src/app11/layout.json / routes.json を更新
 *   node scripts/app11/optimize-layout.cjs --check  # 同じ入力から同じ出力になるか確認（不一致は exit 1）
 *
 * 順序:
 *   1. route-priority.json + primary-topology.json（平面性の証明書）を検証
 *   2. 主要の部品配置（backbone-layout）
 *   3. 主要のポート・ラベル・配線（priority-router）
 *   4. 補助の配置・配線（secondary-layout）
 *   5. 孤立物質の棚、正規化、保存
 *
 * 力配置の seed 調整は行わない。保存済み座標だけを閲覧時に使う。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const S = require('./source-data.cjs');
const T = require('./primary-topology.cjs');
const B = require('./backbone-layout.cjs');
const R = require('./priority-router.cjs');
const Sec = require('./secondary-layout.cjs');
const M = require('./metrics.cjs');
const F = require('./layout-format.cjs');
const G = require('./geometry.cjs');

const LAYOUT_VERSION = 4;

function buildScene(source, topology) {
  const placed = B.placePrimaryNodes(source);
  const compounds = new Map();
  for (const [id, node] of placed.nodes) {
    compounds.set(id, {
      x: node.x - node.w / 2,
      y: node.y - node.h / 2,
      w: node.w,
      h: node.h,
      tier: 'primary'
    });
  }
  const reactions = new Map();
  const routes = [];
  for (const reaction of source.reactions) {
    if (source.priority.entries.get(reaction.id).tier !== 'primary') continue;
    const point = placed.reactions.get(reaction.id);
    reactions.set(reaction.id, {
      x: point.x,
      y: point.y,
      tier: 'primary',
      typeLabel: reaction.typeLabel,
      conditions: reaction.conditions
    });
    for (const id of reaction.substrates) addPrimaryRoute(routes, reaction, 'in', id, compounds);
    for (const id of reaction.products) addPrimaryRoute(routes, reaction, 'out', id, compounds);
  }
  const primaryRoutes = routes.filter((r) => r.tier === 'primary');
  R.assignCompoundPrimaryPorts(compounds, primaryRoutes, reactions);
  R.assignMarkerPrimaryPorts(primaryRoutes, reactions);
  const scene = {
    compounds,
    reactions,
    routes,
    bounds: computeBounds(compounds, reactions),
    primaryRoutes,
    topology
  };
  const problems = R.routePrimary(scene, source);
  R.placePrimaryLabelsFree(source, reactions, compounds, routes);
  scene.primaryProblems = problems;
  return scene;
}

function addPrimaryRoute(routes, reaction, dir, compoundId, compounds) {
  const key = reaction.id + '|' + dir + '|' + compoundId;
  if (routes.some((r) => r.key === key)) return;
  routes.push({
    key,
    reactionId: reaction.id,
    compoundId,
    dir,
    tier: 'primary',
    compoundNode: compounds.get(compoundId),
    points: null,
    gaps: [],
    bridges: []
  });
}

function computeBounds(compounds, reactions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const node of compounds.values()) add(node.x, node.y), add(node.x + node.w, node.y + node.h);
  for (const r of reactions.values()) {
    add(r.x - 16, r.y - 16);
    add(r.x + 16, r.y + 16);
    if (r.labelBoxes) {
      add(r.labelBoxes.type.x, r.labelBoxes.type.y);
      add(r.labelBoxes.type.x + r.labelBoxes.type.w, r.labelBoxes.type.y + r.labelBoxes.type.h);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function repairPrimaryLabels(scene, source) {
  const edges = scene.routes.filter((r) => r.points && r.points.length > 1);
  const nodes = [...scene.compounds.values()];
  const labels = [...scene.reactions.entries()].filter(([, r]) => r.tier === 'primary');
  for (const [id, marker] of labels) {
    const sourceReaction = source.reactions.find((r) => r.id === id);
    if (!sourceReaction) continue;
    const current = marker.labelBoxes;
    if (!current) continue;
    let hits = 0;
    for (const route of edges) {
      for (const seg of G.polylineSegments(route.points)) {
        if (G.segmentRect(seg.a, seg.b, current.type)) hits++;
      }
    }
    if (!hits) continue;
    let best = null;
    let bestScore = Infinity;
    for (const side of ['N', 'S', 'E', 'W']) {
      for (const extra of [48, 60, 72, 84, 96, 108, 120]) {
        const box = R.labelLayoutAt(marker, sourceReaction, side, extra);
        let score = extra;
        let edgeHits = 0;
        for (const route of edges) {
          for (const seg of G.polylineSegments(route.points)) {
            if (G.segmentRect(seg.a, seg.b, box.type)) edgeHits++;
          }
        }
        score += edgeHits * 10000;
        for (const node of nodes) {
          if (G.rectsOverlap(G.inflate(box.type, 3), G.rect(node.x, node.y, node.w, node.h))) score += 5000;
        }
        for (const [, other] of labels) {
          if (other === marker || !other.labelBoxes) continue;
          if (G.rectsOverlap(G.inflate(box.type, 2), G.inflate(other.labelBoxes.type, 2))) score += 5000;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { side, box };
        }
      }
    }
    if (best) {
      marker.labelSide = best.side;
      marker.labelBoxes = best.box;
    }
  }
}

function countRouteHits(route, obstacles) {
  let hits = 0;
  for (const seg of G.polylineSegments(route.points || [])) {
    for (const rect of obstacles.rects) {
      if (rect.kind === 'node' && rect.id === route.compoundId) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) hits++;
    }
  }
  return hits;
}

// 補助を置いた後に、主要枝が補助ノード・全ラベルを貫通していたら主要側を直す。
function repairPrimaryAfterSecondary(scene, source) {
  const primaryRoutes = scene.routes.filter((r) => r.tier === 'primary' && r.points);
  let changed = 0;
  for (const route of primaryRoutes) {
    const before = R.countPointHits(scene, source, route, route.points);
    if (!before) continue;
    const saved = route.points;
    route.points = null;
    const without = R.makeObstacles(source, scene.compounds, scene.reactions, scene.routes.filter((r) => r.tier === 'primary' && r.points), 'primary', { labels: true });
    const gridObstacles = {
      rects: without.rects.filter((r) => !(r.kind === 'node' && r.id === route.compoundId)),
      discs: without.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId)),
      segments: (without.segments || []).filter((s) => s.route.reactionId !== route.reactionId && s.route.compoundId !== route.compoundId)
    };
    const path = R.gridRoute(route.compoundPort, route.markerPort, gridObstacles, scene.bounds, {
      ownCompound: route.compoundId,
      ownReaction: route.reactionId,
      primary: true
    });
    if (path) {
      const ex = gridObstacles;
      route.points = R.simplifyPath(path, ex, R.PRIMARY_EDGE_PAD);
      const after = R.countPointHits(scene, source, route, route.points);
      if (after === 0) changed++;
      else route.points = saved;
    } else {
      route.points = saved;
    }
  }
  if (changed) R.resolvePrimaryCrossings(scene, source, primaryRoutes);
  return changed;
}

function addIsolatedShelf(scene, source) {
  const isolated = [];
  for (const c of source.compounds.values()) {
    if (!scene.compounds.has(c.id)) isolated.push(c);
  }
  const regionOrder = new Map(source.map.regions.map((r, i) => [r.id, i]));
  isolated.sort((a, b) => {
    const ra = regionOrder.get(a.region);
    const rb = regionOrder.get(b.region);
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : 1;
  });
  const n = isolated.length;
  const cellW = 152;
  const cellH = 54;
  const network = computeBounds(scene.compounds, scene.reactions);
  const gap = 70;
  const options = [];
  for (let cols = 6; cols <= 18; cols++) {
    const rows = Math.ceil(n / cols);
    const shelfW = cols * cellW - 16;
    const shelfH = rows * cellH - 20;
    options.push({
      cols, rows, shelfW, shelfH, side: 'right',
      x: network.x + network.w + gap,
      y: network.y,
      w: network.w + gap + shelfW,
      h: Math.max(network.h, shelfH)
    });
    options.push({
      cols, rows, shelfW, shelfH, side: 'bottom',
      x: network.x,
      y: network.y + network.h + gap,
      w: Math.max(network.w, shelfW),
      h: network.h + gap + shelfH
    });
  }
  for (const option of options) {
    option.fit = G.fitScale({ x: 0, y: 0, w: option.w, h: option.h }, 1236, 475, 14);
  }
  options.sort((a, b) => b.fit - a.fit || (a.side === 'right' ? -1 : 1) || a.cols - b.cols);
  const chosen = options[0];
  const cols = chosen.cols;
  const rows = chosen.rows;
  const x0 = chosen.x;
  const y0 = chosen.y;
  isolated.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x0 + col * cellW + 68;
    const cy = y0 + row * cellH + 17;
    scene.compounds.set(c.id, {
      x: cx - B.BASE_W / 2,
      y: cy - B.BASE_H / 2,
      w: B.BASE_W,
      h: B.BASE_H,
      tier: 'isolated'
    });
  });
  return {
    shelf: { x: x0, y: y0, cols, rows, count: n, side: chosen.side },
    count: n
  };
}

function normalize(scene, shelfInfo) {
  const bounds = computeBounds(scene.compounds, scene.reactions);
  let minX = bounds.x;
  let minY = bounds.y;
  let maxX = bounds.x + bounds.w;
  let maxY = bounds.y + bounds.h;
  for (const route of scene.routes) {
    for (const p of route.points || []) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const margin = 20;
  const dx = margin - minX;
  const dy = margin - minY;
  for (const node of scene.compounds.values()) {
    node.x += dx;
    node.y += dy;
  }
  for (const r of scene.reactions.values()) {
    r.x += dx;
    r.y += dy;
    if (r.labelBoxes && r.labelBoxes.type) {
      r.labelBoxes = {
        type: {
          x: r.labelBoxes.type.x + dx,
          y: r.labelBoxes.type.y + dy,
          w: r.labelBoxes.type.w,
          h: r.labelBoxes.type.h
        },
        cond: null
      };
    }
  }
  for (const route of scene.routes) {
    for (const p of route.points || []) {
      p.x += dx;
      p.y += dy;
    }
  }
  shelfInfo.shelf.x += dx;
  shelfInfo.shelf.y += dy;
  return {
    shiftX: dx,
    shiftY: dy,
    canvas: {
      x: 0,
      y: 0,
      w: Math.ceil(maxX - minX + margin * 2),
      h: Math.ceil(maxY - minY + margin * 2)
    }
  };
}

function buildRegions(scene, source, shift) {
  const incident = new Map();
  for (const r of source.reactions) {
    for (const id of new Set(r.substrates.concat(r.products))) {
      incident.set(id, (incident.get(id) || 0) + 1);
    }
  }
  const regionOrder = new Map(source.map.regions.map((r, i) => [r.id, i]));
  const regions = source.map.regions.map((region, index) => {
    const members = [...source.compounds.values()].filter((c) => c.region === region.id);
    const connected = members.filter((c) => incident.get(c.id) > 0);
    const focusPoints = [];
    for (const c of connected.length ? connected : members) {
      const node = scene.compounds.get(c.id);
      focusPoints.push(G.rect(node.x, node.y, node.w, node.h));
    }
    for (const r of scene.reactions.values()) {
      const reaction = source.reactions.find((x) => x.id === r.id);
      if (!reaction) continue;
      if (!reaction.substrates.concat(reaction.products).some((id) => source.compounds.get(id).region === region.id)) continue;
      if (!connected.some((c) => reaction.substrates.concat(reaction.products).includes(c.id))) continue;
      focusPoints.push(G.rect(r.x - 12, r.y - 12, 24, 24));
      focusPoints.push(r.labelBoxes.type);
      if (r.labelBoxes.cond) focusPoints.push(r.labelBoxes.cond);
    }
    const pad = 30;
    const minX = Math.min(...focusPoints.map((p) => p.x)) - pad;
    const minY = Math.min(...focusPoints.map((p) => p.y)) - pad;
    const maxX = Math.max(...focusPoints.map((p) => p.x + p.w)) + pad;
    const maxY = Math.max(...focusPoints.map((p) => p.y + p.h)) + pad;
    const center = connected.length
      ? {
        x: connected.reduce((s, c) => s + scene.compounds.get(c.id).x + scene.compounds.get(c.id).w / 2, 0) / connected.length,
        y: connected.reduce((s, c) => s + scene.compounds.get(c.id).y + scene.compounds.get(c.id).h / 2, 0) / connected.length
      }
      : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    return {
      id: region.id,
      name: region.name,
      note: region.note,
      count: members.length,
      colorIndex: index,
      focus: {
        x: round2(minX),
        y: round2(minY),
        w: round2(maxX - minX),
        h: round2(maxY - minY)
      },
      center: { x: round2(center.x), y: round2(center.y) },
      members: members.map((c) => c.id).sort()
    };
  });
  regions.sort((a, b) => regionOrder.get(a.id) - regionOrder.get(b.id));
  return regions;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function verifyAllRoutes(scene, source) {
  const obstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
  for (const route of scene.routes) {
    if (!Array.isArray(route.points) || route.points.length < 2) {
      throw new Error('経路が未確定: ' + route.key);
    }
    for (const p of route.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('経路に非有限座標: ' + route.key);
    }
    for (const seg of G.polylineSegments(route.points)) {
      for (const rect of obstacles.rects) {
        if (rect.kind === 'node' && rect.id === route.compoundId) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) {
          throw new Error('経路が障害物を貫通: ' + route.key + ' / ' + rect.kind + ':' + rect.id);
        }
      }
      for (const disc of obstacles.discs) {
        if (disc.kind === 'marker' && disc.id === route.reactionId) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(G.markerBox(disc.x, disc.y), 2))) {
          throw new Error('経路が反応点を貫通: ' + route.key + ' / ' + disc.id);
        }
      }
    }
  }
}

function planLayout() {
  const source = S.loadSource();
  const topology = T.loadTopology(source);
  const scene = buildScene(source, topology);
  Sec.placeSecondary(scene, source);
  verifyAllRoutes(scene, source);
  const shelfInfo = addIsolatedShelf(scene, source);
  const shift = normalize(scene, shelfInfo);
  const regions = buildRegions(scene, source, shift);

  const positions = {};
  for (const id of [...scene.compounds.keys()].sort()) {
    const node = scene.compounds.get(id);
    const compound = source.compounds.get(id);
    positions[id] = {
      r: compound.region,
      x: round2(node.x),
      y: round2(node.y),
      w: node.w,
      h: node.h,
      tier: node.tier
    };
  }
  const reactions = {};
  for (const id of [...scene.reactions.keys()].sort()) {
    const r = scene.reactions.get(id);
    const sourceReaction = source.reactions.find((x) => x.id === id);
    reactions[id] = {
      x: round2(r.x),
      y: round2(r.y),
      tier: r.tier,
      label: r.tier === 'secondary'
        ? null
        : {
          side: r.labelSide,
          type: { x: round2(r.labelBoxes.type.x + r.labelBoxes.type.w / 2), y: round2(r.labelBoxes.type.y + r.labelBoxes.type.h / 2) },
          cond: null,
          box: {
            x: round2(r.labelBoxes.type.x),
            y: round2(r.labelBoxes.type.y),
            w: round2(r.labelBoxes.type.w),
            h: round2(r.labelBoxes.type.h)
          }
        },
      substrates: sourceReaction.substrates,
      products: sourceReaction.products,
      typeLabel: sourceReaction.typeLabel,
      conditions: sourceReaction.conditions,
      cross: sourceReaction.cross
    };
  }
  const edges = {};
  for (const route of scene.routes.slice().sort((a, b) => (a.key < b.key ? -1 : 1))) {
    edges[route.key] = {
      reaction: route.reactionId,
      dir: route.dir,
      compound: route.compoundId,
      tier: route.tier,
      points: route.points.map((p) => [round2(p.x), round2(p.y)]),
      gaps: [],
      bridges: []
    };
  }
  const layout = {
    version: LAYOUT_VERSION,
    seed: 0,
    priorityHash: source.priorityHash,
    topologyNetworkx: topology.certificate.meta.networkx,
    nodeW: B.BASE_W,
    nodeH: B.BASE_H,
    canvas: shift.canvas,
    shelf: shelfInfo.shelf,
    regions,
    positions,
    reactions
  };
  const routes = {
    version: LAYOUT_VERSION,
    seed: 0,
    priorityHash: source.priorityHash,
    edges,
    stats: {}
  };
  const sceneOut = M.sceneFromLayout(layout, routes);
  const report = M.measure(sceneOut);
  routes.stats = {
    edges: report.edges.count,
    primaryBranches: report.tiers.primary.branches,
    secondaryBranches: report.tiers.secondary.branches,
    crossingsPP: report.crossings.PP,
    crossingsPS: report.crossings.PS,
    crossingsSS: report.crossings.SS,
    crossings: report.edges.crossings,
    acuteCrossings: report.edges.acuteCrossings,
    bridgedCrossings: report.edges.bridgedCrossings,
    unbridgedAcute: report.edges.unbridgedAcute,
    nodePenetrations: report.edges.nodePenetrations,
    labelPenetrations: report.edges.labelPenetrations,
    markerPenetrations: report.edges.markerPenetrations,
    overlapSegments: report.edges.overlapSegments,
    clearanceViolations: report.edges.clearanceViolations,
    totalLength: report.edges.totalLength,
    bends: report.edges.bends,
    maxBends: report.edges.maxBends,
    primaryLength: report.tiers.primary.length.total,
    secondaryLength: report.tiers.secondary.length.total
  };
  return { layout, routes, report, source, topology, scene };
}

function main() {
  const check = process.argv.includes('--check');
  const { layout, routes, report, topology, scene } = planLayout();
  const layoutPath = path.join(S.SRC, 'layout.json');
  const routesPath = path.join(S.SRC, 'routes.json');
  if (check) {
    const currentLayout = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, 'utf8') : '';
    const currentRoutes = fs.existsSync(routesPath) ? fs.readFileSync(routesPath, 'utf8') : '';
    if (currentLayout !== F.renderLayout(layout) || currentRoutes !== F.renderRoutes(routes)) {
      console.error('layout.json / routes.json が最新ではありません: node scripts/app11/optimize-layout.cjs を実行してください。');
      process.exit(1);
    }
    console.log('app11 の配置・経路は最新です（主要 ' + report.tiers.primary.branches +
      ' 枝、PP ' + report.crossings.PP + '、PS ' + report.crossings.PS +
      '、SS ' + report.crossings.SS + '、主要長 ' + report.tiers.primary.length.total + '）。');
    return;
  }
  fs.writeFileSync(layoutPath, F.renderLayout(layout), 'utf8');
  fs.writeFileSync(routesPath, F.renderRoutes(routes), 'utf8');
  console.log('生成: site-src/app11/layout.json / routes.json');
  console.log('平面性: ' + (topology.certificate.meta.planar ? 'planar' : 'non-planar') +
    '（主要 ' + topology.certificate.meta.primaryReactions + ' 反応 / ' +
    topology.certificate.meta.primaryBranches + ' 枝、成分 ' + topology.certificate.meta.components +
    '、面 ' + topology.certificate.meta.faces + '）');
  if (scene.primaryProblems.length) {
    console.warn('主要配線の未解決: ' + JSON.stringify(scene.primaryProblems.slice(0, 8)));
  }
  console.log(M.formatReport(report));
}

if (require.main === module) main();

module.exports = {
  LAYOUT_VERSION,
  planLayout,
  buildScene,
  addIsolatedShelf,
  normalize,
  buildRegions,
  renderLayout: F.renderLayout,
  renderRoutes: F.renderRoutes
};
