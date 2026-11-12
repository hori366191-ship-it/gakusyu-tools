/**
 * 有機反応マップ（app11）— layout.json / routes.json の正規化と書き出し
 *
 * 生成側（optimize-layout.cjs）と検証側（build-map-data.cjs / テスト）で同じ形にそろえる。
 * v4 では priority hash・tier・物質ごとの幅/高さを保存する。
 */
'use strict';

function num(v) {
  return Math.round(v * 100) / 100;
}

function canonicalLayout(layout) {
  const positions = {};
  Object.keys(layout.positions).sort().forEach((id) => {
    const p = layout.positions[id];
    positions[id] = {
      r: p.r,
      x: num(p.x),
      y: num(p.y),
      w: p.w,
      h: p.h,
      tier: p.tier
    };
  });
  const reactions = {};
  Object.keys(layout.reactions).sort().forEach((id) => {
    const r = layout.reactions[id];
    reactions[id] = {
      x: num(r.x),
      y: num(r.y),
      tier: r.tier,
      label: r.label
        ? {
          side: r.label.side,
          type: { x: num(r.label.type.x), y: num(r.label.type.y) },
          cond: r.label.cond ? { x: num(r.label.cond.x), y: num(r.label.cond.y) } : null,
          box: r.label.box
            ? { x: num(r.label.box.x), y: num(r.label.box.y), w: num(r.label.box.w), h: num(r.label.box.h) }
            : null
        }
        : null,
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
    priorityHash: layout.priorityHash,
    topologyNetworkx: layout.topologyNetworkx || null,
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
      focus: { x: num(r.focus.x), y: num(r.focus.y), w: num(r.focus.w), h: num(r.focus.h) },
      center: { x: num(r.center.x), y: num(r.center.y) },
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
      tier: e.tier,
      points: e.points.map((p) => [num(p[0]), num(p[1])]),
      gaps: (e.gaps || []).map((p) => [num(p[0]), num(p[1])]),
      bridges: (e.bridges || []).map((p) => [num(p[0]), num(p[1])])
    };
  });
  const stats = {};
  Object.keys(routes.stats || {}).sort().forEach((key) => { stats[key] = routes.stats[key]; });
  return {
    version: routes.version,
    seed: routes.seed,
    priorityHash: routes.priorityHash,
    edges,
    stats
  };
}

function renderLayout(layout) {
  return JSON.stringify(canonicalLayout(layout), null, 1) + '\n';
}

function renderRoutes(routes) {
  return JSON.stringify(canonicalRoutes(routes), null, 1) + '\n';
}

module.exports = { canonicalLayout, canonicalRoutes, renderLayout, renderRoutes };
