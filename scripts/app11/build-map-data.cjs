/**
 * 有機反応マップ（site/app11）のデータ生成
 *
 * 実行:
 *   node scripts/app11/build-map-data.cjs            # site/app11/data.js と layout.json を更新
 *   node scripts/app11/build-map-data.cjs --check    # 生成物が最新かを確認（差分があれば exit 1）
 *
 * - 物質の名称・示性式・分類・ID と、ビルダーの focus 経路（catalog.js の routeFor）だけを
 *   site/app10 からオフラインで抽出する。反応メモなどの自由文は取り込まない。
 * - 反応は site-src/app11/reactions.json（本ツール独自のデータ）だけを根拠にする。
 * - 座標は site-src/app11/layout.json に固定して保存する。既存ノードの位置は再生成しても動かさず、
 *   新しい物質だけをその分野の末尾に追加する。
 * - 実行時に site/app10 を読み込まない。出力する data.js は値だけの静的データ。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP10 = path.join(ROOT, 'site', 'app10');
const SRC = path.join(ROOT, 'site-src', 'app11');
const OUT_DIR = path.join(ROOT, 'site', 'app11');
const OUT_DATA = path.join(OUT_DIR, 'data.js');
const LAYOUT_PATH = path.join(SRC, 'layout.json');

const CELL_W = 152;
const CELL_H = 54;
const NODE_W = 136;
const NODE_H = 34;
const LABEL_MAX = 12;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadApp10() {
  const D = require(path.join(APP10, 'data.js'));
  const C = require(path.join(APP10, 'catalog.js'));
  return { D, C };
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function shortLabel(name) {
  let s = String(name || '');
  const cut = s.indexOf('（');
  if (cut > 0) s = s.slice(0, cut);
  if (s.length > LABEL_MAX) s = s.slice(0, LABEL_MAX - 1) + '…';
  return s;
}

function builderHref(route) {
  if (!route) return null;
  const q = ['mode=' + encodeURIComponent(route.mode)];
  if (route.mode === 'chain') {
    q.push('family=' + encodeURIComponent(route.family));
    q.push('cpartial=' + encodeURIComponent(route.partialC));
    if (route.shape) q.push('shape=' + encodeURIComponent(route.shape));
  } else if (route.mode === 'ring') {
    q.push('system=' + encodeURIComponent(route.system));
    if (route.preset) q.push('preset=' + encodeURIComponent(route.preset));
    else if (route.group) q.push('preset=' + encodeURIComponent(route.group));
  } else {
    q.push('category=' + encodeURIComponent(route.category));
    if (route.family) q.push('family=' + encodeURIComponent(route.family));
  }
  q.push('focus=' + encodeURIComponent(route.focus));
  return '../app10/index.html?' + q.join('&');
}

function emptyLayout() {
  return { version: 1, cellW: CELL_W, cellH: CELL_H, regions: {}, positions: {} };
}

// 公開データには資料名・節番号・確認日だけを載せる（URL・本文抜粋・画像は含めない）。
function publicSource(entry) {
  const name = entry.source || 'OpenStax Organic Chemistry (McMurry)';
  const section = entry.section ? ' ' + entry.section : '';
  const date = entry.date ? '（' + entry.date + ' 確認）' : '';
  return name + section + date;
}

function sortCompounds(compounds, map, categoryOrder) {
  return compounds.slice().sort((a, b) => {
    const ra = categoryOrder.indexOf(a.category);
    const rb = categoryOrder.indexOf(b.category);
    if (ra !== rb) return ra - rb;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

function build() {
  const map = readJson(path.join(SRC, 'map.json'));
  const reactionSource = readJson(path.join(SRC, 'reactions.json'));
  const { D, C } = loadApp10();

  const regionById = new Map(map.regions.map((r) => [r.id, r]));
  const categoryOrder = Object.keys(map.categoryRegions);
  const layout = fs.existsSync(LAYOUT_PATH) ? readJson(LAYOUT_PATH) : emptyLayout();
  if (!layout.positions) layout.positions = {};
  if (!layout.regions) layout.regions = {};

  const compoundIds = Object.keys(D.COMPOUNDS);
  const compoundsById = new Map();
  for (const id of compoundIds) {
    const c = D.COMPOUNDS[id];
    const region = map.regionOverrides[id] || map.categoryRegions[c.category] || null;
    if (!region || !regionById.has(region)) {
      throw new Error('物質 ' + id + ' の分野が決まらない（category=' + c.category + '）');
    }
    compoundsById.set(id, { id, raw: c, region });
  }

  // 座標の割り当て: 既存は保持し、新しい物質だけを分野の末尾へ足す。
  const ordered = sortCompounds(
    [...compoundsById.values()].map((c) => ({ id: c.id, category: c.raw.category })),
    map,
    categoryOrder
  );
  for (const entry of ordered) {
    const region = compoundsById.get(entry.id).region;
    const cols = regionById.get(region).cols;
    const current = layout.positions[entry.id];
    if (current && current.r === region && Number.isInteger(current.i)) continue;
    const regionLayout = layout.regions[region] || (layout.regions[region] = { cols, next: 0 });
    if (regionLayout.cols !== cols) regionLayout.cols = cols;
    if (!Number.isInteger(regionLayout.next)) regionLayout.next = 0;
    layout.positions[entry.id] = { r: region, i: regionLayout.next };
    regionLayout.next += 1;
  }
  // 消えた物質の座標は残さない（再追加時に同じ場所へ戻る）
  for (const id of Object.keys(layout.positions)) {
    if (!compoundsById.has(id)) delete layout.positions[id];
  }

  const regionRows = {};
  const regionCount = {};
  for (const region of map.regions) {
    regionRows[region.id] = 0;
    regionCount[region.id] = 0;
  }
  for (const id of Object.keys(layout.positions)) {
    const pos = layout.positions[id];
    if (regionRows[pos.r] === undefined) continue;
    regionRows[pos.r] = Math.max(regionRows[pos.r], Math.floor(pos.i / regionById.get(pos.r).cols) + 1);
    regionCount[pos.r] += 1;
  }

  const regions = map.regions.map((region) => {
    const cols = region.cols;
    const rows = Math.max(1, regionRows[region.id] || 0);
    return {
      id: region.id,
      name: region.name,
      note: region.note,
      x: region.x,
      y: region.y,
      cols,
      rows,
      count: regionCount[region.id] || 0,
      panel: {
        x: region.x - 28,
        y: region.y - 56,
        w: cols * CELL_W - 16 + 44,
        h: rows * CELL_H - 20 + 76
      }
    };
  });
  const regionOrder = new Map(regions.map((r, i) => [r.id, i]));

  const compounds = [];
  for (const id of compoundIds) {
    const info = compoundsById.get(id);
    const pos = layout.positions[id];
    const region = regionById.get(pos.r);
    const x = region.x + (pos.i % region.cols) * CELL_W;
    const y = region.y + Math.floor(pos.i / region.cols) * CELL_H;
    const route = C.routeFor(id) || null;
    const c = info.raw;
    compounds.push({
      id,
      name: c.name,
      label: shortLabel(c.name),
      formula: c.formula || '',
      region: pos.r,
      category: c.category,
      recordState: c.verified ? 'confirmed' : 'unverified',
      curriculum: D.REQUIRED_CURRICULUM.indexOf(id) !== -1,
      hub: map.hubs.indexOf(id) !== -1,
      x,
      y,
      builder: { href: builderHref(route), route: route ? route.mode : null },
      slot: pos.i
    });
  }
  compounds.sort((a, b) => {
    const ra = regionOrder.get(a.region) - regionOrder.get(b.region);
    if (ra !== 0) return ra;
    return a.slot - b.slot;
  });

  const byId = new Map(compounds.map((c) => [c.id, c]));
  const defaultState = reactionSource.defaultState || 'unverified';
  const types = {};
  for (const key of Object.keys(reactionSource.types)) {
    const t = reactionSource.types[key];
    types[key] = { label: t.label, summary: t.summary, schematic: t.schematic, count: 0 };
  }

  const reactions = [];
  const heldReactions = [];
  const usedSections = new Set();
  const incoming = new Map();
  const outgoing = new Map();
  const seenIds = new Set();
  for (const r of reactionSource.reactions) {
    if (seenIds.has(r.id)) throw new Error('反応IDが重複: ' + r.id);
    seenIds.add(r.id);
    if (!types[r.type]) throw new Error('未定義の反応種別: ' + r.type + '（反応 ' + r.id + '）');
    const subs = r.substrates || [];
    const prods = r.products || [];
    if (!subs.length) throw new Error('基質がない反応: ' + r.id);
    for (const id of subs.concat(prods)) {
      if (!byId.has(id)) throw new Error('未収録の物質ID: ' + id + '（反応 ' + r.id + '）');
    }
    const state = r.state || defaultState;
    // 公開するのは独立資料で確認できた反応だけ。保留は正本に残しても出力しない。
    if (state !== 'confirmed') {
      heldReactions.push({ id: r.id, type: r.type, state });
      continue;
    }
    if (!Array.isArray(r.verification) || !r.verification.length) {
      throw new Error('確認済みの反応に検証記録がない: ' + r.id);
    }
    const subRegions = new Set(subs.map((id) => byId.get(id).region));
    const prodRegions = new Set(prods.map((id) => byId.get(id).region));
    const all = new Set([...subRegions, ...prodRegions]);
    const sx = subs.reduce((sum, id) => sum + byId.get(id).x, 0) / subs.length;
    const sy = subs.reduce((sum, id) => sum + byId.get(id).y, 0) / subs.length;
    const px = prods.length ? prods.reduce((sum, id) => sum + byId.get(id).x, 0) / prods.length : sx;
    const py = prods.length ? prods.reduce((sum, id) => sum + byId.get(id).y, 0) / prods.length : sy + CELL_H;
    const dx = px - sx;
    const dy = py - sy;
    const dist = Math.hypot(dx, dy) || 1;
    // 反応マーカーは基質と生成物の中点から、反応IDだけで決まる量だけ垂直にずらす。
    const offset = ((hashString(r.id) % 41) - 20) * 0.9;
    const mx = Math.round((sx + px) / 2 + (-dy / dist) * offset);
    const my = Math.round((sy + py) / 2 + (dx / dist) * offset);
    reactions.push({
      id: r.id,
      type: r.type,
      typeLabel: types[r.type].label,
      state: 'confirmed',
      substrates: subs,
      reagents: r.reagents || [],
      products: prods,
      productNote: r.productNote || '',
      conditions: r.conditions || '',
      note: r.note || '',
      sources: r.verification.map(publicSource),
      x: mx,
      y: my,
      cross: all.size > 1
    });
    types[r.type].count += 1;
    r.verification.forEach((entry) => { if (entry.section) usedSections.add(entry.section); });
    subs.forEach((id) => outgoing.set(id, (outgoing.get(id) || 0) + 1));
    prods.forEach((id) => incoming.set(id, (incoming.get(id) || 0) + 1));
  }

  for (const c of compounds) {
    c.incoming = incoming.get(c.id) || 0;
    c.outgoing = outgoing.get(c.id) || 0;
    if (c.incoming + c.outgoing > 0) c.pathState = 'covered';
    else if (map.outOfScopeRegions.indexOf(c.region) !== -1 || map.outOfScopeCompounds.indexOf(c.id) !== -1) {
      c.pathState = 'out-of-scope';
    } else c.pathState = 'unverified';
  }

  // 公開する反応がない種別は公開データに載せない（保留の反応は正本にだけ残す）。
  Object.keys(types).forEach((key) => {
    if (!types[key].count) delete types[key];
  });

  const minX = Math.min(...regions.map((r) => r.panel.x));
  const minY = Math.min(...regions.map((r) => r.panel.y));
  const maxX = Math.max(...regions.map((r) => r.panel.x + r.panel.w));
  const maxY = Math.max(...regions.map((r) => r.panel.y + r.panel.h));
  const canvas = { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 };

  const required = D.REQUIRED_CURRICULUM.filter((id, i, arr) => arr.indexOf(id) === i);
  const data = {
    meta: {
      version: '2026-11-10.2',
      generatedAt: '2026-11-10',
      verifiedAt: reactionSource.verifiedAt || '',
      source: 'site/app10 の公開データ（物質名・示性式・分類・ID と focus 経路のみオフライン抽出）',
      compoundCount: compounds.length,
      requiredCount: required.length,
      regionCount: regions.length,
      reactionCount: reactions.length,
      confirmedReactionCount: reactions.length,
      heldReactionCount: heldReactions.length,
      sourceBook: 'OpenStax Organic Chemistry (McMurry)',
      sourceSections: [...usedSections].sort((a, b) => {
        const [a1, a2] = a.split('.').map(Number);
        const [b1, b2] = b.split('.').map(Number);
        return a1 - b1 || a2 - b2;
      }),
      nodeW: NODE_W,
      nodeH: NODE_H,
      cellW: CELL_W,
      cellH: CELL_H,
      canvas,
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

  return { data, layout };
}

function renderData(data) {
  const lines = [];
  lines.push('/*');
  lines.push(' * 有機反応マップ（試験版）— 生成データ');
  lines.push(' *');
  lines.push(' * このファイルは scripts/app11/build-map-data.cjs が生成する。直接編集しない。');
  lines.push(' * 物質名・示性式・分類・ID とビルダーの focus 経路は site/app10 からオフラインで抽出した値で、');
  lines.push(' * 実行時に app10 の実装を読み込むことはない。反応の内容は site-src/app11/reactions.json が正本。');
  lines.push(' * 座標は site-src/app11/layout.json に固定されており、再生成しても既存ノードは動かない。');
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
  const { data, layout } = build();
  const output = renderData(data);

  if (check) {
    const current = fs.existsSync(OUT_DATA) ? fs.readFileSync(OUT_DATA, 'utf8') : '';
    if (current !== output) {
      console.error('data.js が最新ではありません: node scripts/app11/build-map-data.cjs を実行してください。');
      process.exit(1);
    }
    if (fs.existsSync(LAYOUT_PATH)) {
      const onDisk = fs.readFileSync(LAYOUT_PATH, 'utf8');
      const expected = JSON.stringify(sortLayout(layout), null, 2) + '\n';
      if (onDisk !== expected) {
        console.error('layout.json が最新ではありません: node scripts/app11/build-map-data.cjs を実行してください。');
        process.exit(1);
      }
    }
    console.log('app11 data.js / layout.json は最新です（物質 ' + data.meta.compoundCount +
      '、必須 ' + data.meta.requiredCount + '、反応 ' + data.meta.reactionCount + '）。');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_DATA, output, 'utf8');
  fs.writeFileSync(LAYOUT_PATH, JSON.stringify(sortLayout(layout), null, 2) + '\n', 'utf8');
  console.log('生成: site/app11/data.js（物質 ' + data.meta.compoundCount +
    '、必須 ' + data.meta.requiredCount + '、反応 ' + data.meta.reactionCount + '）');
}

function sortLayout(layout) {
  const positions = {};
  Object.keys(layout.positions).sort().forEach((id) => {
    positions[id] = { r: layout.positions[id].r, i: layout.positions[id].i };
  });
  const regions = {};
  Object.keys(layout.regions).sort().forEach((id) => {
    regions[id] = { cols: layout.regions[id].cols, next: layout.regions[id].next };
  });
  return { version: layout.version, cellW: layout.cellW, cellH: layout.cellH, regions, positions };
}

if (require.main === module) main();

module.exports = { build, renderData };
