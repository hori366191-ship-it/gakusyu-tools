/**
 * 有機反応マップ（app11）— 通常配置案（normal-proposed）データの生成
 *
 * 実行:
 *   node scripts/app11/build-proposed-layout.cjs            # site/app11/proposed-layout-data.js を更新
 *   node scripts/app11/build-proposed-layout.cjs --check    # 生成物が最新かを確認（CI 用）
 *
 * 正本は scripts/app11/proposed-network-layout.cjs（generator）。生成物は公開用の 1 ファイルだけで、
 * 中間 JSON は持たない（二重管理しない）。
 *
 * - 既存の data.js / layout.json / routes.json / academic-data.js は読むだけで書き換えない。
 * - 旧 layout.json の座標は generator に渡さない（比較のため metrics.cjs だけが読む）。
 * - base は proposal-contract.js の facts ハッシュ。runtime 側（C 担当）も同じ module で検証する。
 * - 生成時に契約検証と、metrics.cjs による現行配置との比較、hard 0 の確認を行う（fail-closed）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('./source-data.cjs');
const P = require('./proposed-network-layout.cjs');
const Contract = require(path.join(S.ROOT, 'site', 'app11', 'proposal-contract.js'));
const M = require('./metrics.cjs');

const ROOT = S.ROOT;
const NORMAL_DATA_PATH = path.join(ROOT, 'site', 'app11', 'data.js');
const OUT_DATA = path.join(ROOT, 'site', 'app11', 'proposed-layout-data.js');

const HARD_KEYS = [
  'nodePenetrations',
  'endpointPenetrations',
  'labelPenetrations',
  'markerPenetrations',
  'markerNodeCollisions',
  'markerMarkerCollisions',
  'labelNodeCollisions',
  'labelLabelCollisions',
  'labelMarkerCollisions',
  'labelTitleCollisions',
  'nodeOverlaps'
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toPointArray(points) {
  return points.map((p) => [p.x, p.y]);
}

// 生成した配置案を metrics.cjs の scene 形式へ写す（現行配置と同じ計算で測る）。
function sceneOf(proposal, D) {
  const positions = proposal.positions;
  const markers = proposal.markers;
  return {
    meta: {
      nodeW: D.meta.nodeW,
      nodeH: D.meta.nodeH,
      canvas: proposal.canvas,
      shelf: null
    },
    regions: [],
    compounds: D.compounds.map((c) => {
      const pos = positions[c.id];
      return { id: c.id, x: pos.x, y: pos.y, w: pos.w, h: pos.h, region: c.region };
    }),
    reactions: D.reactions.map((r) => {
      const m = markers[r.id];
      return {
        id: r.id,
        x: m.x,
        y: m.y,
        tier: r.tier,
        substrates: r.substrates,
        products: r.products,
        typeLabel: r.typeLabel,
        conditions: r.conditions,
        cross: r.cross,
        labelBoxes: { type: m.label.box, cond: null }
      };
    }),
    routes: D.reactions.reduce((list, r) => {
      r.edges.forEach((e) => {
        const key = r.id + '|' + e.dir + '|' + e.id;
        const route = proposal.routes[key];
        list.push({
          key: key,
          reactionId: r.id,
          dir: e.dir,
          compoundId: e.id,
          tier: route.tier,
          points: route.points.map((p) => ({ x: p[0], y: p[1] })),
          gaps: [],
          bridges: []
        });
      });
      return list;
    }, [])
  };
}

function summaryOf(report) {
  return {
    crossings: report.edges.crossings,
    crossingsPP: report.crossings.PP,
    crossingsPS: report.crossings.PS,
    crossingsSS: report.crossings.SS,
    totalLength: report.edges.totalLength,
    primaryMedianLength: report.tiers.primary.length.median,
    secondaryP95Length: report.tiers.secondary.length.p95,
    maxLength: Math.max(report.tiers.primary.length.max, report.tiers.secondary.length.max),
    nodePenetrations: report.edges.nodePenetrations,
    labelPenetrations: report.edges.labelPenetrations,
    markerPenetrations: report.edges.markerPenetrations,
    hard: report.hard
  };
}

function build(opts) {
  const options = opts || {};
  const D = options.baseData || require(NORMAL_DATA_PATH);
  const contract = options.contract || Contract;

  const placed = P.buildLayout({
    compounds: D.compounds,
    reactions: D.reactions,
    classMap: D.classMap,
    nodeW: D.meta.nodeW,
    nodeH: D.meta.nodeH,
    tuning: options.tuning
  });

  // 出力を契約の形へ（経路は [x, y] 配列にする）。
  const positions = placed.positions;
  const routes = {};
  Object.keys(placed.routes).forEach((key) => {
    const route = placed.routes[key];
    routes[key] = {
      reaction: route.reaction,
      dir: route.dir,
      compound: route.compound,
      tier: route.tier,
      points: toPointArray(route.points),
      gaps: [],
      bridges: []
    };
  });

  const proposal = {
    version: contract.VERSION,
    kind: contract.KIND,
    base: contract.buildBase(D),
    positions: positions,
    markers: placed.markers,
    routes: routes,
    canvas: placed.canvas,
    regionFocus: placed.regionFocus,
    stats: placed.stats,
    warnings: placed.warnings
  };

  // --- 生成時の fail-closed 検査 ------------------------------------------
  const verdict = contract.verifyProposal(proposal, D);
  if (!verdict.ok) throw new Error('生成した配置案が契約に合わない: ' + verdict.reason);

  // 棚の参加者は現行と同じ 269（新規参加 0）。接続 158 は棚に入れない。
  const connectedIds = new Set(D.compounds.filter((c) => c.incoming + c.outgoing > 0).map((c) => c.id));
  const isolatedIds = new Set(D.compounds.filter((c) => c.incoming + c.outgoing === 0).map((c) => c.id));
  if (connectedIds.size !== 158 || isolatedIds.size !== 269) {
    throw new Error('接続/未接続の件数が想定と違う: ' + connectedIds.size + ' / ' + isolatedIds.size);
  }
  const shelf = shelfRect(placed);
  isolatedIds.forEach((id) => {
    const p = positions[id];
    if (!(p.x >= shelf.x && p.x <= shelf.x + shelf.w && p.y >= shelf.y && p.y <= shelf.y + shelf.h)) {
      throw new Error('未接続の物質が棚の外にある: ' + id);
    }
  });
  connectedIds.forEach((id) => {
    const p = positions[id];
    if (p.x >= shelf.x && p.x <= shelf.x + shelf.w && p.y >= shelf.y && p.y <= shelf.y + shelf.h) {
      throw new Error('接続済みの物質が棚の中にある: ' + id);
    }
  });

  // 一般図（class map）の矩形は動かさない。ネットワーク・棚と重ならないことも確認する。
  const frame = D.classMap && D.classMap.frame;
  if (!frame) throw new Error('classMap.frame がない');
  if (positionsOverlapClassMap(positions, D.classMap)) {
    throw new Error('配置案が一般図の矩形と重なる');
  }
  if (placed.canvas.w < frame.x + frame.w + 10 || placed.canvas.h < frame.y + frame.h + 10) {
    throw new Error('canvas が一般図を含まない');
  }

  // --- 現行配置との比較（同じ metrics.cjs） -------------------------------
  const currentReport = M.measure(M.loadCurrent());
  const proposedReport = M.measure(sceneOf(proposal, D));
  const hardLeft = HARD_KEYS.filter((k) => proposedReport.hard[k] !== 0);
  if (hardLeft.length) {
    throw new Error('配置案に hard 衝突が残る: ' + hardLeft.map((k) => k + '=' + proposedReport.hard[k]).join(', '));
  }
  proposal.stats.crossingsInternal = proposal.stats.crossings;
  proposal.stats.crossings = proposedReport.edges.crossings;
  proposal.stats.compare = {
    current: summaryOf(currentReport),
    proposal: summaryOf(proposedReport),
    notes: [
      '交差は metrics.cjs の events（異なる反応の枝）で数える。',
      '総辺長は現行 ' + currentReport.edges.totalLength + ' → 案 ' + proposedReport.edges.totalLength + ' に増加。',
      '最大辺長は現行 ' + Math.max(currentReport.tiers.primary.length.max, currentReport.tiers.secondary.length.max) +
        ' → 案 ' + Math.max(proposedReport.tiers.primary.length.max, proposedReport.tiers.secondary.length.max) + ' に短縮。',
      '交差は現行 ' + currentReport.edges.crossings + ' → 案 ' + proposedReport.edges.crossings + ' に増加（zone 回避の tradeoff）。'
    ]
  };

  return { proposal: proposal, current: currentReport, proposed: proposedReport };
}

function shelfRect(placed) {
  // generator の棚は 269 を 12 列で並べた矩形。座標から決定的に復元する。
  const points = Object.keys(placed.positions).map((id) => placed.positions[id]);
  const isolated = points.filter((p) => p.x >= P.SHELF.x - 1);
  let maxX = P.SHELF.x;
  let maxY = P.SHELF.y;
  isolated.forEach((p) => {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  });
  return { x: P.SHELF.x, y: P.SHELF.y, w: maxX - P.SHELF.x, h: maxY - P.SHELF.y };
}

function positionsOverlapClassMap(positions, classMap) {
  const rects = [];
  if (classMap.frame) rects.push(classMap.frame);
  (classMap.nodes || []).forEach((n) => rects.push(n));
  for (const id of Object.keys(positions)) {
    const p = positions[id];
    const rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const other of rects) {
      if (rect.x + rect.w > other.x && other.x + other.w > rect.x &&
          rect.y + rect.h > other.y && other.y + other.h > rect.y) return true;
    }
  }
  return false;
}

function renderProposalData(proposal) {
  const lines = [];
  lines.push('/*');
  lines.push(' * 有機反応マップ（app11）— 通常配置案（normal-proposed）データ');
  lines.push(' *');
  lines.push(' * このファイルは scripts/app11/build-proposed-layout.cjs が生成する。直接編集しない。');
  lines.push(' * 正本は scripts/app11/proposed-network-layout.cjs（決定的な geometry generator）。');
  lines.push(' * 通常 427 物質・162 反応・375 辺の座標だけを持ち、化学的な内容（facts / equation /');
  lines.push(' * sources など）は data.js（D）をそのまま使う。base のハッシュで D との一致を検証する。');
  lines.push(' */');
  lines.push('(function (root, factory) {');
  lines.push("  if (typeof module === 'object' && module.exports) module.exports = factory();");
  lines.push('  else root.RPMapLayoutProposal = factory();');
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  lines.push("  'use strict';");
  lines.push('  return ' + JSON.stringify(proposal, null, 1) + ';');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const built = build();
  const output = renderProposalData(built.proposal);
  if (check) {
    const current = fs.existsSync(OUT_DATA) ? fs.readFileSync(OUT_DATA, 'utf8') : '';
    if (current !== output) {
      console.error('proposed-layout-data.js が最新ではありません: node scripts/app11/build-proposed-layout.cjs を実行してください。');
      process.exit(1);
    }
    console.log('proposed-layout-data.js は最新です（427 物質 / 162 反応 / 375 辺、交差 ' +
      built.proposed.edges.crossings + '、総辺長 ' + built.proposed.edges.totalLength + 'px）。');
    return;
  }
  fs.writeFileSync(OUT_DATA, output, 'utf8');
  const c = built.current.edges;
  const p = built.proposed.edges;
  console.log('生成: site/app11/proposed-layout-data.js');
  console.log('  交差 現行 ' + c.crossings + ' → 案 ' + p.crossings +
    ' / 総辺長 ' + c.totalLength + ' → ' + p.totalLength +
    ' / 最大 ' + Math.max(built.current.tiers.primary.length.max, built.current.tiers.secondary.length.max) +
    ' → ' + Math.max(built.proposed.tiers.primary.length.max, built.proposed.tiers.secondary.length.max));
  console.log('  hard 衝突: 現行 ' + hardCount(built.current) + ' / 案 ' + hardCount(built.proposed) +
    '、ラベル ' + built.proposal.stats.labels.direct + ' direct / ' +
    built.proposal.stats.labels.leader + ' leader / ' +
    built.proposal.stats.labels.unresolved + ' unresolved / ' +
    built.proposal.stats.labels.fallback + ' fallback');
}

function hardCount(report) {
  return HARD_KEYS.reduce((n, k) => n + (report.hard[k] || 0), 0);
}

if (require.main === module) main();

module.exports = {
  build,
  renderProposalData,
  sceneOf,
  summaryOf,
  HARD_KEYS,
  OUT_DATA,
  NORMAL_DATA_PATH
};
