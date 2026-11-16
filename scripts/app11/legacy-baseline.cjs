/**
 * 有機反応マップ（app11）— 既存レイアウトの凍結基準
 *
 * 通常モードの既存データ（確認済み反応・接続済み物質・配線）を snapshot として固定し、
 * 高校標準の反応を追加しても「旧 86 反応 / 旧 101 物質 / 旧 207 経路」が動かないことを
 * ビルドとテストの両方で検証する。
 *
 * snapshot は scripts/app11/make-legacy-baseline.cjs で作り直す。
 * レイアウトを意図的に作り直す場合だけ、この snapshot を更新する。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const S = require('./source-data.cjs');

const BASELINE_PATH = path.join(S.SRC, 'legacy-baseline.json');
const TOPOLOGY_PATH = path.join(S.SRC, 'primary-topology.json');

const BASELINE_VERSION = 1;
const COORD_FIELDS = ['x', 'y', 'w', 'h'];
const FACT_FIELDS = ['type', 'conditions', 'note'];
const FACT_ARRAYS = ['substrates', 'products', 'sources'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sameList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

function samePoints(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((p, i) => Array.isArray(p) && Array.isArray(b[i]) &&
    p[0] === b[i][0] && p[1] === b[i][1]);
}

function incidentCounts(source) {
  const counts = new Map();
  for (const reaction of source.reactions) {
    for (const id of new Set(reaction.substrates.concat(reaction.products))) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

function loadBaseline(file) {
  const target = file || BASELINE_PATH;
  if (!fs.existsSync(target)) return null;
  const base = readJson(target);
  if (base.version !== BASELINE_VERSION) {
    throw new Error('legacy-baseline.json の版が未対応: ' + base.version);
  }
  return base;
}

/**
 * 現在の正本・レイアウト・経路から snapshot を作る。
 * 反応の事実（条件・式mode・出典など）と座標・経路を、比較可能な形で固定する。
 */
function buildBaseline(opts) {
  const options = opts || {};
  const source = options.source || S.loadSource();
  const layout = options.layout || readJson(path.join(S.SRC, 'layout.json'));
  const routes = options.routes || readJson(path.join(S.SRC, 'routes.json'));
  const topology = options.topology || (fs.existsSync(TOPOLOGY_PATH) ? readJson(TOPOLOGY_PATH) : null);

  const reactions = {};
  const tiers = source.priority.entries;
  for (const reaction of source.reactions) {
    const marker = layout.reactions[reaction.id];
    if (!marker) throw new Error('layout.json に反応マーカーがない: ' + reaction.id);
    const tier = tiers.get(reaction.id);
    if (!tier) throw new Error('route-priority に反応がない: ' + reaction.id);
    const equation = reaction.equation;
    reactions[reaction.id] = {
      tier: tier.tier,
      type: reaction.type,
      substrates: reaction.substrates.slice(),
      products: reaction.products.slice(),
      conditions: reaction.conditions,
      note: reaction.note,
      sources: reaction.sources.slice(),
      equation: equation ? {
        mode: equation.mode,
        title: equation.title,
        above: equation.above,
        below: equation.below
      } : null,
      marker: {
        x: marker.x,
        y: marker.y,
        tier: marker.tier,
        label: clone(marker.label || null)
      }
    };
  }

  const compoundIds = Object.keys(layout.positions);
  const connected = compoundIds.filter((id) => (incidentCounts(source).get(id) || 0) > 0).length;

  return {
    version: BASELINE_VERSION,
    note: '通常モードの旧 86 反応・旧 101 物質・旧 207 経路の凍結基準。意図的な作り直しのときだけ更新する。',
    createdAt: options.createdAt || '2026-11-17',
    priorityHash: layout.priorityHash,
    topologyInputHash: topology && topology.meta ? topology.meta.inputHash || null : null,
    counts: {
      compounds: compoundIds.length,
      connected: connected,
      isolated: compoundIds.length - connected,
      reactions: source.reactions.length,
      heldReactions: source.heldReactions.length,
      primaryReactions: source.reactions.filter((r) => tiers.get(r.id).tier === 'primary').length,
      secondaryReactions: source.reactions.filter((r) => tiers.get(r.id).tier === 'secondary').length,
      edges: Object.keys(routes.edges).length
    },
    reactions,
    positions: clone(layout.positions),
    edges: clone(routes.edges),
    shelf: clone(layout.shelf),
    canvas: clone(layout.canvas),
    nodeW: layout.nodeW,
    nodeH: layout.nodeH
  };
}

/**
 * 正本が snapshot の事実と一致するか。反応の追加は許すが、
 * snapshot に載っている反応の削除・条件変更・出典変更は許さない。
 */
function verifySource(source, base) {
  const problems = [];
  if (!base) return problems;
  const reactionsById = new Map(source.reactions.map((r) => [r.id, r]));
  const heldIds = new Set(source.heldReactions.map((r) => r.id));
  for (const id of Object.keys(base.reactions).sort()) {
    const want = base.reactions[id];
    const got = reactionsById.get(id);
    if (!got) {
      problems.push({ kind: 'missing-reaction', id: id, held: heldIds.has(id) });
      continue;
    }
    const tier = source.priority.entries.get(id);
    if (!tier || tier.tier !== want.tier) {
      problems.push({ kind: 'tier-changed', id: id, want: want.tier, got: tier ? tier.tier : null });
    }
    for (const field of FACT_FIELDS) {
      if (got[field] !== want[field]) {
        problems.push({ kind: 'fact-changed', id: id, field: field });
      }
    }
    for (const field of FACT_ARRAYS) {
      if (!sameList(got[field], want[field])) {
        problems.push({ kind: 'fact-changed', id: id, field: field });
      }
    }
    const wantEq = want.equation;
    const gotEq = got.equation;
    if (!wantEq !== !gotEq) {
      problems.push({ kind: 'equation-changed', id: id, field: 'presence' });
    } else if (wantEq) {
      for (const field of ['mode', 'title', 'above', 'below']) {
        if ((gotEq[field] || '') !== (wantEq[field] || '')) {
          problems.push({ kind: 'equation-changed', id: id, field: field });
        }
      }
    }
  }
  for (const id of Object.keys(base.positions).sort()) {
    if (!source.compounds.has(id)) problems.push({ kind: 'missing-compound', id: id });
  }
  return problems;
}

function insideShelf(position, shelf) {
  if (!shelf) return false;
  const shelfW = shelf.cols * 152;
  const shelfH = shelf.rows * 54;
  return position.x >= shelf.x - 1 && position.x <= shelf.x + shelfW &&
    position.y >= shelf.y - 1 && position.y <= shelf.y + shelfH;
}

/**
 * 出力レイアウトが snapshot と一致するか。
 * 棚にあった物質が新しい反応で接続された場合だけ、その座標の移動を許す
 * （ただし棚の中に残してはいけない）。
 */
function verifyLayout(layout, routes, base, source) {
  const problems = [];
  if (!base) return problems;
  const incident = incidentCounts(source);

  for (const id of Object.keys(base.positions).sort()) {
    const want = base.positions[id];
    const got = layout.positions[id];
    if (!got) {
      problems.push({ kind: 'missing-position', id: id });
      continue;
    }
    const becameConnected = want.tier === 'isolated' && (incident.get(id) || 0) > 0;
    if (becameConnected) {
      if (got.r !== want.r || got.w !== want.w || got.h !== want.h) {
        problems.push({ kind: 'position-meta-changed', id: id, field: 'region/size' });
      }
      if (insideShelf(got, layout.shelf)) {
        problems.push({ kind: 'connected-still-on-shelf', id: id });
      }
      continue;
    }
    if (got.r !== want.r || got.tier !== want.tier ||
      got.w !== want.w || got.h !== want.h) {
      problems.push({
        kind: 'position-meta-changed',
        id: id,
        want: { r: want.r, tier: want.tier, w: want.w, h: want.h },
        got: { r: got.r, tier: got.tier, w: got.w, h: got.h }
      });
    }
    for (const field of COORD_FIELDS) {
      if (got[field] !== want[field]) {
        problems.push({ kind: 'position-moved', id: id, field: field, want: want[field], got: got[field] });
      }
    }
  }

  for (const id of Object.keys(base.reactions).sort()) {
    const want = base.reactions[id].marker;
    const got = layout.reactions[id];
    if (!got) {
      problems.push({ kind: 'missing-marker', id: id });
      continue;
    }
    if (got.x !== want.x || got.y !== want.y || got.tier !== want.tier) {
      problems.push({
        kind: 'marker-moved',
        id: id,
        want: { x: want.x, y: want.y, tier: want.tier },
        got: { x: got.x, y: got.y, tier: got.tier }
      });
    }
  }

  for (const key of Object.keys(base.edges).sort()) {
    const want = base.edges[key];
    const got = routes.edges[key];
    if (!got) {
      problems.push({ kind: 'missing-edge', key: key });
      continue;
    }
    if (!samePoints(got.points, want.points)) {
      problems.push({ kind: 'edge-rerouted', key: key });
    }
    if (got.reaction !== want.reaction || got.dir !== want.dir ||
      got.compound !== want.compound || got.tier !== want.tier) {
      problems.push({ kind: 'edge-meta-changed', key: key });
    }
  }

  const connected = [...source.compounds.keys()].filter((id) => (incident.get(id) || 0) > 0).length;
  const isolated = source.compounds.size - connected;
  if (layout.shelf && layout.shelf.count !== isolated) {
    problems.push({ kind: 'shelf-count', want: isolated, got: layout.shelf.count });
  }
  if (layout.canvas && base.canvas) {
    if (layout.canvas.x !== base.canvas.x || layout.canvas.y !== base.canvas.y ||
      layout.canvas.w < base.canvas.w || layout.canvas.h < base.canvas.h) {
      problems.push({ kind: 'canvas-shrunk', want: base.canvas, got: layout.canvas });
    }
  }
  return problems;
}

function describeProblems(problems, limit) {
  const max = limit || 6;
  return problems.slice(0, max).map((p) => {
    if (p.kind === 'fact-changed' || p.kind === 'equation-changed') return p.kind + ':' + p.id + '/' + p.field;
    if (p.kind === 'position-moved') return p.kind + ':' + p.id + '/' + p.field;
    return p.kind + ':' + (p.id || p.key || '');
  }).join(', ') + (problems.length > max ? ' …他 ' + (problems.length - max) + ' 件' : '');
}

function newReactionIds(source, base) {
  if (!base) return [];
  const legacy = new Set(Object.keys(base.reactions));
  return source.reactions.map((r) => r.id).filter((id) => !legacy.has(id)).sort();
}

module.exports = {
  BASELINE_PATH,
  BASELINE_VERSION,
  buildBaseline,
  loadBaseline,
  verifySource,
  verifyLayout,
  describeProblems,
  newReactionIds,
  incidentCounts,
  insideShelf,
  sameList,
  samePoints
};
