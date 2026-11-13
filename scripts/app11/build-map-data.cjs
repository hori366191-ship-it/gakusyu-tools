/**
 * 有機反応マップ（site/app11）のデータ生成
 *
 * 実行:
 *   node scripts/app11/build-map-data.cjs            # site/app11/data.js を更新
 *   node scripts/app11/build-map-data.cjs --check    # 生成物が最新かを確認（差分があれば exit 1）
 *
 * - 物質の名称・示性式・分類・ID と、ビルダーの focus 経路（catalog.js の routeFor）だけを
 *   site/app10 からオフラインで抽出する。反応メモなどの自由文は取り込まない。
 * - 反応は site-src/app11/reactions.json（本ツール独自のデータ）だけを根拠にする。
 * - 12分類の一般図は site-src/app11/class-map.json（独立正本）から classMap キーへ出力し、
 *   物質・反応の配列には混ぜない。資料URLは公開 data.js に含めず、資料名・節・確認日だけを出す。
 * - 座標・反応マーカー・経路の全点列は site-src/app11/layout.json と routes.json に固定済み。
 *   このスクリプトはそれらを読み、data.js に埋め込むだけ（最適化は optimize-layout.cjs が行う）。
 * - 実行時に site/app10 を読み込まない。出力する data.js は値だけの静的データ。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('./source-data.cjs');
const F = require('./layout-format.cjs');

const OUT_DIR = path.join(S.ROOT, 'site', 'app11');
const OUT_DATA = path.join(OUT_DIR, 'data.js');
const LAYOUT_PATH = path.join(S.SRC, 'layout.json');
const ROUTES_PATH = path.join(S.SRC, 'routes.json');
const CLASS_MAP_PATH = path.join(S.SRC, 'class-map.json');
const CLASS_NODE_COUNT = 12;
const CLASS_EDGE_COUNT = 16;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function requireLayout() {
  if (!fs.existsSync(LAYOUT_PATH) || !fs.existsSync(ROUTES_PATH)) {
    throw new Error('site-src/app11/layout.json と routes.json がありません。' +
      'node scripts/app11/optimize-layout.cjs を実行してください。');
  }
  const layout = readJson(LAYOUT_PATH);
  const routes = readJson(ROUTES_PATH);
  if (layout.version !== 4 || routes.version !== 4) {
    throw new Error('layout.json / routes.json の版が古い。optimize-layout.cjs を実行してください。');
  }
  return { layout, routes };
}

/*
 * 12分類だけの一般図（site-src/app11/class-map.json）を、既存の物質・反応とは独立した
 * classMap キーへ変換する。資料URLは正本だけに残し、公開 data.js には資料名・節・確認日だけを出す。
 * 分類・変換の構造式は、正本の species（原子・結合の配列）を custom spec へ展開する。
 */
const R_LABEL = /^R(?:\d+|′)?$/;

function resolveSpecies(speciesById, id, owner) {
  const raw = speciesById.get(id);
  if (!raw) throw new Error(owner + ' の構造種別が未定義: ' + id);
  if (!Array.isArray(raw.atoms) || !raw.atoms.length) throw new Error(owner + ' の構造に原子がない: ' + id);
  if (!Array.isArray(raw.bonds)) throw new Error(owner + ' の構造に結合がない: ' + id);
  const atoms = raw.atoms.map((a, index) => {
    if (!Array.isArray(a) || a.length < 4) throw new Error(owner + ' の原子が不正: ' + id + ' #' + index);
    const el = a[0];
    const x = a[1];
    const y = a[2];
    const h = a[3] || 0;
    const label = a[4] || '';
    if (typeof el !== 'string' || !el) throw new Error(owner + ' の元素が不正: ' + id + ' #' + index);
    if (!isFinite(x) || !isFinite(y)) throw new Error(owner + ' の座標が不正: ' + id + ' #' + index);
    if (!(h >= 0 && h <= 4)) throw new Error(owner + ' の水素数が不正: ' + id + ' #' + index);
    const pseudoR = R_LABEL.test(label);
    if (pseudoR && el !== 'C') throw new Error(owner + ' のRは炭素として扱う: ' + id + ' #' + index);
    return {
      el: el,
      x: x,
      y: y,
      h: h,
      label: label,
      skipValence: pseudoR || !!a[5]
    };
  });
  const bonds = raw.bonds.map((b, index) => {
    if (!Array.isArray(b) || b.length < 2) throw new Error(owner + ' の結合が不正: ' + id + ' #' + index);
    const a = b[0];
    const c = b[1];
    const order = b.length > 2 ? b[2] : 1;
    if (!Number.isInteger(a) || !Number.isInteger(c) || a < 0 || c < 0 ||
      a >= atoms.length || c >= atoms.length || a === c) {
      throw new Error(owner + ' の結合の原子番号が不正: ' + id + ' #' + index);
    }
    if ([1, 2, 3].indexOf(order) === -1) throw new Error(owner + ' の結合次数が不正: ' + id + ' #' + index);
    return { a: a, b: c, order: order };
  });
  return {
    type: 'custom',
    mode: 'condensed',
    width: 420,
    height: 260,
    atoms: atoms,
    bonds: bonds
  };
}

function rLabelsOf(spec) {
  const labels = [];
  spec.atoms.forEach((a) => {
    if (R_LABEL.test(a.label) && labels.indexOf(a.label) === -1) labels.push(a.label);
  });
  return labels;
}

function rDefKeys(defs, owner) {
  if (!Array.isArray(defs) || !defs.length) throw new Error(owner + ' にRの定義がない');
  const keys = [];
  defs.forEach((text) => {
    const m = /^\s*(R(?:\d+|′)?)\s*=/.exec(String(text));
    if (!m) throw new Error(owner + ' のR定義の形式が不正: ' + text);
    if (keys.indexOf(m[1]) !== -1) throw new Error(owner + ' のR定義が重複: ' + m[1]);
    keys.push(m[1]);
  });
  return keys;
}

function checkRDefs(specs, defs, owner) {
  const keys = rDefKeys(defs, owner);
  const labels = [];
  specs.forEach((spec) => {
    rLabelsOf(spec).forEach((label) => {
      if (labels.indexOf(label) === -1) labels.push(label);
      if (keys.indexOf(label) === -1) throw new Error(owner + ' のR定義がない: ' + label);
    });
  });
  keys.forEach((key) => {
    if (labels.indexOf(key) === -1) throw new Error(owner + ' のR定義が式にない: ' + key);
  });
}

// R置換基は具体元素の収支に数えない（式ごとに H/アルキル等の変数を表す）。
// [O]/[H] は形式当量として O/H の1原子分に数え、係数で反応式の収支を検査する。
function formulaCounts(spec) {
  const counts = {};
  const add = (el, n) => { if (n) counts[el] = (counts[el] || 0) + n; };
  spec.atoms.forEach((a) => {
    if (R_LABEL.test(a.label)) return;
    add(a.el, 1);
    add('H', a.h);
  });
  return counts;
}

function addCounts(total, counts, coef) {
  Object.keys(counts).forEach((el) => {
    total[el] = (total[el] || 0) + counts[el] * coef;
  });
}

function checkEquationBalance(edge, left, right) {
  const sum = (list) => {
    const total = {};
    list.forEach((item) => addCounts(total, formulaCounts(item.structure), item.coef));
    return total;
  };
  const a = sum(left);
  const b = sum(right);
  const keys = Object.keys(a).concat(Object.keys(b)).filter((el, i, arr) => arr.indexOf(el) === i);
  keys.forEach((el) => {
    if ((a[el] || 0) !== (b[el] || 0)) {
      throw new Error('変換 ' + edge.id + ' の元素収支が合わない: ' + el +
        ' 左' + (a[el] || 0) + ' / 右' + (b[el] || 0));
    }
  });
}

function buildClassMap() {
  const raw = readJson(CLASS_MAP_PATH);
  if (raw.version !== 1) throw new Error('class-map.json の版が未対応: ' + raw.version);
  if (raw.nodes.length !== CLASS_NODE_COUNT) {
    throw new Error('class-map.json の分類数が ' + CLASS_NODE_COUNT + ' ではない: ' + raw.nodes.length);
  }
  if (raw.edges.length !== CLASS_EDGE_COUNT) {
    throw new Error('class-map.json の変換数が ' + CLASS_EDGE_COUNT + ' ではない: ' + raw.edges.length);
  }
  if (!raw.species || typeof raw.species !== 'object') throw new Error('class-map.json に species がない');
  const speciesById = new Map(Object.keys(raw.species).map((id) => [id, raw.species[id]]));

  const sourceById = new Map();
  raw.sources.forEach((s) => {
    if (sourceById.has(s.id)) throw new Error('class-map.json の資料IDが重複: ' + s.id);
    if (!s.book || !s.section || !s.checkedAt) throw new Error('class-map.json の資料情報が不足: ' + s.id);
    sourceById.set(s.id, s);
  });
  const publicSources = (ids, owner) => {
    if (!Array.isArray(ids) || !ids.length) throw new Error(owner + ' に資料がない');
    return ids.map((id) => {
      const s = sourceById.get(id);
      if (!s) throw new Error(owner + ' の資料IDが未定義: ' + id);
      return s.book + ' ' + s.section + '（' + s.checkedAt + ' 確認）';
    });
  };

  const area = raw.area;
  const frame = raw.frame;
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const nodeIds = new Set();
  const nodes = raw.nodes.map((n) => {
    if (nodeIds.has(n.id)) throw new Error('class-map.json の分類IDが重複: ' + n.id);
    nodeIds.add(n.id);
    if (!n.name || !n.summary || !n.scope || !Array.isArray(n.exceptions)) {
      throw new Error('class-map.json の分類情報が不足: ' + n.id);
    }
    if (!(n.w > 0 && n.h > 0) || !inRect(n.x, n.y, frame) ||
      !inRect(n.x + n.w, n.y + n.h, frame)) {
      throw new Error('class-map.json の分類が枠の外: ' + n.id);
    }
    if (!n.structure) throw new Error('class-map.json の分類に一般構造がない: ' + n.id);
    const structure = resolveSpecies(speciesById, n.structure, '分類 ' + n.id);
    checkRDefs([structure], n.rDefs, '分類 ' + n.id);
    return {
      id: n.id,
      name: n.name,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      summary: n.summary,
      scope: n.scope,
      exceptions: n.exceptions,
      structure: structure,
      rDefs: n.rDefs,
      sources: publicSources(n.sourceIds, '分類 ' + n.id),
      incoming: 0,
      outgoing: 0
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edgeIds = new Set();
  const edges = raw.edges.map((e) => {
    if (edgeIds.has(e.id)) throw new Error('class-map.json の変換IDが重複: ' + e.id);
    edgeIds.add(e.id);
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from) throw new Error('class-map.json の変換元が未定義: ' + e.id + ' -> ' + e.from);
    if (!to) throw new Error('class-map.json の変換先が未定義: ' + e.id + ' -> ' + e.to);
    if (e.from === e.to) throw new Error('class-map.json の自己変換: ' + e.id);
    if (!Array.isArray(e.points) || e.points.length < 2) throw new Error('class-map.json の経路が不足: ' + e.id);
    e.points.forEach((p) => {
      if (!Array.isArray(p) || p.length !== 2 || !inRect(p[0], p[1], frame)) {
        throw new Error('class-map.json の経路点が枠の外: ' + e.id);
      }
    });
    const lp = e.labelPos;
    if (!lp || !inRect(lp.x, lp.y, frame) || ['start', 'middle', 'end'].indexOf(lp.anchor) === -1) {
      throw new Error('class-map.json のラベル位置が不正: ' + e.id);
    }
    if (!e.label || !e.conditions || !e.note) throw new Error('class-map.json の変換情報が不足: ' + e.id);
    if (!e.type) throw new Error('class-map.json の変換に共通説明の種別がない: ' + e.id);
    if (!e.equation || ['to', 'equilibrium'].indexOf(e.equation.arrow) === -1) {
      throw new Error('class-map.json の一般反応式が不正: ' + e.id);
    }
    const resolveItems = (items, side) => {
      if (!Array.isArray(items) || !items.length) {
        throw new Error('class-map.json の一般反応式に' + side + 'がない: ' + e.id);
      }
      return items.map((item) => {
        if (!item || !item.species) throw new Error('class-map.json の式の種別がない: ' + e.id);
        if (!Number.isInteger(item.coef) || item.coef < 1 || item.coef > 9) {
          throw new Error('class-map.json の係数が不正: ' + e.id);
        }
        return {
          coef: item.coef,
          structure: resolveSpecies(speciesById, item.species, '変換 ' + e.id + ' の式')
        };
      });
    };
    const left = resolveItems(e.equation.left, '反応物');
    const right = resolveItems(e.equation.right, '生成物');
    checkRDefs(left.concat(right).map((item) => item.structure), e.rDefs, '変換 ' + e.id);
    checkEquationBalance(e, left, right);
    from.outgoing++;
    to.incoming++;
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.label,
      conditions: e.conditions,
      note: e.note,
      type: e.type,
      equation: {
        arrow: e.equation.arrow,
        left: left,
        right: right
      },
      rDefs: e.rDefs,
      labelPos: { x: lp.x, y: lp.y, anchor: lp.anchor },
      points: e.points,
      sources: publicSources(e.sourceIds, '変換 ' + e.id)
    };
  });

  // 弱連結1成分であること（外部の図へ線を出さない自己完結した一般図）。
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  edges.forEach((e) => {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(a, b);
  });
  const roots = new Set(nodes.map((n) => find(n.id)));
  if (roots.size !== 1) throw new Error('class-map.json が弱連結1成分ではない: ' + roots.size);

  const sourceStrings = [];
  nodes.concat(edges).forEach((item) => {
    item.sources.forEach((s) => {
      if (sourceStrings.indexOf(s) === -1) sourceStrings.push(s);
    });
  });
  sourceStrings.sort((a, b) => {
    const na = parseFloat((a.match(/(\d+\.\d+)/) || [])[1] || '0');
    const nb = parseFloat((b.match(/(\d+\.\d+)/) || [])[1] || '0');
    return na - nb;
  });

  return {
    title: raw.title,
    note: raw.note,
    verifiedAt: raw.verifiedAt,
    sourceBook: raw.sourceBook,
    area: { x: area.x, y: area.y, w: area.w, h: area.h },
    frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    sources: sourceStrings
  };
}

function build() {
  const source = S.loadSource();
  const { layout, routes } = requireLayout();
  const classMap = buildClassMap();

  const layoutRegionIds = new Set(layout.regions.map((r) => r.id));
  for (const region of source.map.regions) {
    if (!layoutRegionIds.has(region.id)) throw new Error('layout.json に分野がない: ' + region.id);
  }

  const regionOrder = new Map(layout.regions.map((r, i) => [r.id, i]));

  const incoming = new Map();
  const outgoing = new Map();
  for (const r of source.reactions) {
    r.substrates.forEach((id) => outgoing.set(id, (outgoing.get(id) || 0) + 1));
    r.products.forEach((id) => incoming.set(id, (incoming.get(id) || 0) + 1));
  }

  const regionColorIndex = new Map(layout.regions.map((r) => [r.id, r.colorIndex]));
  const memberIndex = new Map();
  for (const region of layout.regions) {
    (region.members || []).forEach((id, i) => memberIndex.set(id, i));
  }
  const compounds = [];
  for (const c of source.compounds.values()) {
    const pos = layout.positions[c.id];
    if (!pos) {
      throw new Error('layout.json に物質の位置がない: ' + c.id +
        '（データを追加した場合は node scripts/app11/optimize-layout.cjs を実行してください）');
    }
    const ins = incoming.get(c.id) || 0;
    const outs = outgoing.get(c.id) || 0;
    let pathState;
    if (ins + outs > 0) pathState = 'covered';
    else if (source.map.outOfScopeRegions.indexOf(c.region) !== -1 ||
      source.map.outOfScopeCompounds.indexOf(c.id) !== -1) pathState = 'out-of-scope';
    else pathState = 'unverified';
    compounds.push({
      id: c.id,
      name: c.name,
      label: c.label,
      formula: c.formula,
      structure: c.structure || null,
      figures: c.figures || null,
      formulaVariable: c.formulaVariable || false,
      formulaDisplay: c.formulaDisplay || '',
      formulaReference: c.formulaReference || '',
      region: pos.r,
      regionIndex: regionColorIndex.get(pos.r),
      category: c.category,
      recordState: c.recordState,
      curriculum: c.curriculum,
      hub: c.hub,
      tier: pos.tier || 'isolated',
      x: pos.x,
      y: pos.y,
      w: pos.w || layout.nodeW,
      h: pos.h || layout.nodeH,
      incoming: ins,
      outgoing: outs,
      pathState,
      builder: c.builder,
      slot: memberIndex.has(c.id) ? memberIndex.get(c.id) : 0
    });
  }
  compounds.sort((a, b) => {
    const ra = regionOrder.get(a.region) - regionOrder.get(b.region);
    if (ra !== 0) return ra;
    if (a.slot !== b.slot) return a.slot - b.slot;
    return a.id < b.id ? -1 : 1;
  });

  const types = {};
  for (const key of Object.keys(source.types)) {
    const t = source.types[key];
    types[key] = { label: t.label, summary: t.summary, schematic: t.schematic, count: t.count };
  }
  // 一般図の変換が参照する共通説明は、既存の確認済み反応が0件でも残す。
  const classTypeKeys = new Set(classMap.edges.map((e) => e.type));
  classTypeKeys.forEach((key) => {
    if (!source.types[key]) throw new Error('class-map.json の変換種別が未定義: ' + key);
  });
  Object.keys(types).forEach((key) => {
    if (!types[key].count && !classTypeKeys.has(key)) delete types[key];
  });

  const reactions = [];
  for (const r of source.reactions) {
    const marker = layout.reactions[r.id];
    if (!marker) {
      throw new Error('layout.json に反応マーカーがない: ' + r.id +
        '（node scripts/app11/optimize-layout.cjs を実行してください）');
    }
    const edges = [];
    const pushEdge = (dir, id) => {
      const key = r.id + '|' + dir + '|' + id;
      const route = routes.edges[key];
      if (!route) throw new Error('routes.json に経路がない: ' + key);
      edges.push({
        dir,
        id,
        tier: route.tier,
        points: route.points,
        gaps: route.gaps || [],
        bridges: route.bridges || []
      });
    };
    r.substrates.forEach((id) => pushEdge('in', id));
    r.products.forEach((id) => pushEdge('out', id));
    reactions.push({
      id: r.id,
      type: r.type,
      typeLabel: r.typeLabel,
      state: 'confirmed',
      tier: marker.tier,
      substrates: r.substrates,
      reagents: r.reagents,
      products: r.products,
      productNote: r.productNote,
      conditions: r.conditions,
      note: r.note,
      sources: r.sources,
      x: marker.x,
      y: marker.y,
      label: marker.label,
      cross: r.cross,
      edges
    });
  }

  const regions = layout.regions.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    count: r.count,
    colorIndex: r.colorIndex,
    focus: r.focus,
    center: r.center,
    members: r.members
  }));
  // 画面の分野チップは、分類の並び（map.json の順）で見せる。
  const mapOrder = new Map(source.map.regions.map((r, i) => [r.id, i]));
  regions.sort((a, b) => mapOrder.get(a.id) - mapOrder.get(b.id));

  const usedSections = [...source.usedSections].sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number);
    const [b1, b2] = b.split('.').map(Number);
    return a1 - b1 || a2 - b2;
  });

  const data = {
    meta: {
      version: '2026-11-14.3',
      generatedAt: '2026-11-14',
      verifiedAt: source.source.verifiedAt,
      source: 'site/app10 の公開データ（物質名・示性式・分類・ID と focus 経路のみオフライン抽出）',
      compoundCount: compounds.length,
      requiredCount: source.required.length,
      regionCount: regions.length,
      reactionCount: reactions.length,
      confirmedReactionCount: reactions.length,
      heldReactionCount: source.heldReactions.length,
      primaryReactionCount: reactions.filter((r) => r.tier === 'primary').length,
      secondaryReactionCount: reactions.filter((r) => r.tier === 'secondary').length,
      primaryCompoundCount: compounds.filter((c) => c.tier === 'primary').length,
      secondaryCompoundCount: compounds.filter((c) => c.tier === 'secondary').length,
      isolatedCount: compounds.filter((c) => c.incoming + c.outgoing === 0).length,
      connectedCount: compounds.filter((c) => c.incoming + c.outgoing > 0).length,
      classMapNodeCount: classMap.nodeCount,
      classMapEdgeCount: classMap.edgeCount,
      classMapVerifiedAt: classMap.verifiedAt,
      classMapNote:
        '右下の「' + classMap.title + '」は、12分類の間の代表的な変換を独立資料の各節で確認した一般化。' +
        '個別物質の確認済み反応 ' + reactions.length + ' 件とは別枠で、この件数には加算しない。' +
        '未検証の別データではない。変換線またはそのラベルを選ぶと、一般反応式のカードを開く。',
      sourceBook: source.source.sourceBook,
      sourceSections: usedSections,
      nodeW: layout.nodeW,
      nodeH: layout.nodeH,
      layoutVersion: layout.version,
      layoutSeed: layout.seed,
      priorityHash: layout.priorityHash,
      topologyNetworkx: layout.topologyNetworkx,
      canvas: layout.canvas,
      shelf: layout.shelf,
      tierLegend: {
        primary: { label: '主要経路', note: '大学入試を想定した代表系列。太い実線。' },
        secondary: { label: '補助経路', note: '同族体・組合せ・代表系列と重なる経路。細い点線。' }
      },
      scopeNote:
        '高校「化学」の有機化学で扱う物質を広く収録する。物質だけを収録した孤立ノードは、' +
        'この地図に収録した確認済み反応の中に経路が見つかっていないことを示す（「生成しない」という意味ではない）。',
      dataNote:
        '反応は独立資料の各節で確認できたものだけを表示する。確認できなかった反応は公開データに含めない。' +
        '試薬量・濃度・具体的な操作手順・装置手順は収録しない。'
    },
    regions,
    states: {
      confirmed: { label: '確認済', note: '独立した資料で確認できた内容。' },
      unverified: {
        label: '未確認',
        note: '対象だが未検証・情報不足・判断不能。成立しないと確認したわけではない。'
      },
      outOfScope: { label: '収録外', note: 'このツールの収録範囲に含めていない。' },
      impossible: {
        label: '該当しない',
        note: '明確な根拠により成立しないと確認できた場合にだけ使う（理由を添える）。'
      }
    },
    types,
    compounds,
    reactions,
    classMap
  };

  return data;
}

function renderData(data) {
  const lines = [];
  lines.push('/*');
  lines.push(' * 有機反応マップ（試験版）— 生成データ');
  lines.push(' *');
  lines.push(' * このファイルは scripts/app11/build-map-data.cjs が生成する。直接編集しない。');
  lines.push(' * 物質名・示性式・分類・ID とビルダーの focus 経路は site/app10 からオフラインで抽出した値で、');
  lines.push(' * 実行時に app10 の実装を読み込むことはない。反応の内容は site-src/app11/reactions.json が正本。');
  lines.push(' * 12分類の一般図は site-src/app11/class-map.json が正本で、classMap キーに独立して出力する。');
  lines.push(' * 座標・反応マーカー・経路の全点列は site-src/app11/layout.json / routes.json に固定されている。');
  lines.push(' */');
  lines.push('(function (root, factory) {');
  lines.push("  if (typeof module === 'object' && module.exports) module.exports = factory();");
  lines.push('  else root.RPMapData = factory();');
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  lines.push("  'use strict';");
  lines.push('  var META = ' + JSON.stringify(data.meta) + ';');
  lines.push('  var STATES = ' + JSON.stringify(data.states) + ';');
  lines.push('  var REGIONS = [');
  data.regions.forEach((r) => lines.push('    ' + JSON.stringify(r) + ','));
  lines.push('  ];');
  lines.push('  var TYPES = ' + JSON.stringify(data.types) + ';');
  lines.push('  var COMPOUNDS = [');
  data.compounds.forEach((c) => lines.push('    ' + JSON.stringify(c) + ','));
  lines.push('  ];');
  lines.push('  var REACTIONS = [');
  data.reactions.forEach((r) => lines.push('    ' + JSON.stringify(r) + ','));
  lines.push('  ];');
  lines.push('  var CLASS_MAP = ' + JSON.stringify(data.classMap) + ';');
  lines.push('  return { meta: META, states: STATES, regions: REGIONS, types: TYPES, compounds: COMPOUNDS, reactions: REACTIONS, classMap: CLASS_MAP };');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const data = build();
  const output = renderData(data);

  if (check) {
    const current = fs.existsSync(OUT_DATA) ? fs.readFileSync(OUT_DATA, 'utf8') : '';
    if (current !== output) {
      console.error('data.js が最新ではありません: node scripts/app11/build-map-data.cjs を実行してください。');
      process.exit(1);
    }
    const layout = readJson(LAYOUT_PATH);
    const routes = readJson(ROUTES_PATH);
    if (fs.readFileSync(LAYOUT_PATH, 'utf8') !== F.renderLayout(layout)) {
      console.error('layout.json の並びが正規形と違います: node scripts/app11/optimize-layout.cjs を実行してください。');
      process.exit(1);
    }
    if (fs.readFileSync(ROUTES_PATH, 'utf8') !== F.renderRoutes(routes)) {
      console.error('routes.json の並びが正規形と違います: node scripts/app11/optimize-layout.cjs を実行してください。');
      process.exit(1);
    }
    console.log('app11 data.js / layout.json / routes.json は最新です（物質 ' + data.meta.compoundCount +
      '、必須 ' + data.meta.requiredCount + '、反応 ' + data.meta.reactionCount + '）。');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_DATA, output, 'utf8');
  console.log('生成: site/app11/data.js（物質 ' + data.meta.compoundCount +
    '、必須 ' + data.meta.requiredCount + '、反応 ' + data.meta.reactionCount + '）');
}

if (require.main === module) main();

module.exports = { build, renderData };
