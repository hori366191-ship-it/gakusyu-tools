/**
 * 有機反応マップ（app11）— layout.json / routes.json の正規化と書き出し
 *
 * 生成側（network-layout.cjs）と検証側（build-map-data.cjs / テスト）で同じ形にそろえる。
 */
'use strict';

function canonicalLayout(layout) {
  const positions = {};
  Object.keys(layout.positions).sort().forEach((id) => {
    const p = layout.positions[id];
    positions[id] = { r: p.r, x: p.x, y: p.y };
  });
  const reactions = {};
  Object.keys(layout.reactions).sort().forEach((id) => {
    const r = layout.reactions[id];
    reactions[id] = {
      x: r.x,
      y: r.y,
      label: {
        side: r.label.side,
        type: { x: r.label.type.x, y: r.label.type.y },
        cond: r.label.cond ? { x: r.label.cond.x, y: r.label.cond.y } : null
      },
      substrates: r.substrates,
      products: r.products,
      typeLabel: r.typeLabel,
      conditions: r.conditions,
      cross: r.cross
    };
  });
  return {
    version: layout.version,
    seed: layout.seed,
    nodeW: layout.nodeW,
    nodeH: layout.nodeH,
    canvas: layout.canvas,
    shelf: layout.shelf,
    regions: layout.regions.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      count: r.count,
      colorIndex: r.colorIndex,
      focus: { x: r.focus.x, y: r.focus.y, w: r.focus.w, h: r.focus.h },
      center: { x: r.center.x, y: r.center.y },
      members: r.members
    })),
    positions,
    reactions
  };
}

function canonicalRoutes(routes) {
  const edges = {};
  Object.keys(routes.edges).sort().forEach((key) => {
    const e = routes.edges[key];
    edges[key] = {
      reaction: e.reaction,
      dir: e.dir,
      compound: e.compound,
      points: e.points.map((p) => [p[0], p[1]]),
      gaps: (e.gaps || []).map((p) => [p[0], p[1]]),
      bridges: (e.bridges || []).map((p) => [p[0], p[1]])
    };
  });
  const stats = {};
  Object.keys(routes.stats || {}).sort().forEach((key) => { stats[key] = routes.stats[key]; });
  return { version: routes.version, seed: routes.seed, edges, stats };
}

function renderLayout(layout) {
  return JSON.stringify(canonicalLayout(layout), null, 1) + '\n';
}

function renderRoutes(routes) {
  return JSON.stringify(canonicalRoutes(routes), null, 1) + '\n';
}

module.exports = { canonicalLayout, canonicalRoutes, renderLayout, renderRoutes };
