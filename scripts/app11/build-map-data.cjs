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

function build() {
  const source = S.loadSource();
  const { layout, routes } = requireLayout();

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
  Object.keys(types).forEach((key) => {
    if (!types[key].count) delete types[key];
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
      version: '2026-11-13.1',
      generatedAt: '2026-11-13',
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
    reactions
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
  lines.push('  return { meta: META, states: STATES, regions: REGIONS, types: TYPES, compounds: COMPOUNDS, reactions: REACTIONS };');
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
