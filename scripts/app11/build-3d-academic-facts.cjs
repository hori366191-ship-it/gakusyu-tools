#!/usr/bin/env node
/*
 * 有機反応マップ 3D — 大学レベル追加反応の「事実データ」生成
 *
 * 入力: site/app11/academic-data.js（2D 用。scripts/app11/build-academic-data.cjs の生成物）
 * 出力: site/app11/3d/academic-facts.js（window.RPMapAcademicFacts）
 *
 * 3D の公開ページは 2D 用の academic-data.js を読み込まない。この生成物だけを読む。
 * - 反応の事実（ID・基質・生成物・条件・出典・反応式・種類）はそのまま残す
 * - 2D 配置（x / y / label / edges / layout）は一切含めない
 * - 並びは元データの順（決定的）。乱数・時刻・環境依存の値は増やさない
 *
 * 使い方:
 *   node scripts/app11/build-3d-academic-facts.cjs           # 生成
 *   node scripts/app11/build-3d-academic-facts.cjs --check   # 既存ファイルと一致するか確認
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'site', 'app11', 'academic-data.js');
const NORMAL = path.join(ROOT, 'site', 'app11', 'data.js');
const GROUPS = path.join(ROOT, 'site', 'app11', 'reaction-groups.js');
const TARGET = path.join(ROOT, 'site', 'app11', '3d', 'academic-facts.js');

const EXPECTED = {
  academicReactions: 152,
  normalReactions: 162,
  normalGroups: 156,
  combinedGroups: 308
};

// 反応から残す事実フィールド（順序も固定）
const REACTION_FIELDS = [
  'id',
  'type',
  'typeLabel',
  'state',
  'academic',
  'tier',
  'evidenceKind',
  'stepKind',
  'steps',
  'scope',
  'basedOnHeld',
  'substrates',
  'reagents',
  'products',
  'productNote',
  'conditions',
  'note',
  'sources',
  'cross',
  'equation'
];

const META_FIELDS = [
  'version',
  'generatedAt',
  'verifiedAt',
  'sourceBook',
  'title',
  'scopeNote',
  'tierLabel',
  'academicReactionCount',
  'typeCount',
  'evidenceCount',
  'stepCount',
  'newlyConnectedCount',
  'normalCounts'
];

const GEOMETRY_KEYS = ['x', 'y', 'label', 'edges', 'layout', 'markers', 'routes', 'positions'];

function fail(message) {
  throw new Error('[build-3d-academic-facts] ' + message);
}

function loadData() {
  if (!fs.existsSync(SOURCE)) fail('site/app11/academic-data.js がありません');
  // require キャッシュを避けるため毎回読み直す。
  delete require.cache[require.resolve(SOURCE)];
  const academic = require(SOURCE);
  if (!academic || !Array.isArray(academic.reactions) || !academic.reactions.length) {
    fail('academic-data.js から reactions を読めません');
  }
  return academic;
}

function pickMeta(meta) {
  const out = {};
  for (const key of META_FIELDS) {
    if (meta[key] === undefined) continue;
    out[key] = meta[key];
  }
  return out;
}

function pickReaction(raw, index) {
  if (!raw || typeof raw.id !== 'string' || raw.id === '') fail(index + ' 番目の反応に id がない');
  const out = {};
  for (const key of REACTION_FIELDS) {
    if (raw[key] === undefined) continue;
    out[key] = raw[key];
  }
  if (out.academic !== true) out.academic = true;
  if (!out.tier) out.tier = 'academic';
  if (!out.state) out.state = 'academic';
  if (!Array.isArray(out.substrates) || out.substrates.length === 0) {
    fail(raw.id + ': 基質がない');
  }
  for (const key of GEOMETRY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) fail(raw.id + ': 座標フィールド ' + key + ' が残っている');
  }
  return out;
}

function build() {
  const academic = loadData();
  const normal = require(NORMAL);
  const groupModule = require(GROUPS);

  const compoundIds = new Set((normal.compounds || []).map((c) => c.id));
  const meta = pickMeta(academic.meta || {});
  const types = academic.types || {};
  const reactions = academic.reactions.map(pickReaction);

  // 参照の整合（未知の物質 ID を公開データへ持ち込まない）
  const unknown = new Set();
  for (const reaction of reactions) {
    for (const id of (reaction.substrates || []).concat(reaction.products || [], reaction.reagents || [])) {
      if (!compoundIds.has(id)) unknown.add(id);
    }
  }
  if (unknown.size) fail('通常データに無い物質 ID: ' + Array.from(unknown).sort().join(', '));

  // 件数のパリティ（427 物質 / 通常 162 + 大学 152 / 合計 308 グループ）
  const normalReactions = normal.reactions || [];
  if (normal.compounds.length !== 427) fail('通常物質が 427 件ではない: ' + normal.compounds.length);
  if (normalReactions.length !== EXPECTED.normalReactions) {
    fail('通常反応が ' + EXPECTED.normalReactions + ' 件ではない: ' + normalReactions.length);
  }
  if (reactions.length !== EXPECTED.academicReactions) {
    fail('大学レベル反応が ' + EXPECTED.academicReactions + ' 件ではない: ' + reactions.length);
  }
  const combined = normalReactions.concat(reactions);
  const built = groupModule.build(combined, combined.map((r) => r.id));
  const normalGroups = groupModule.build(normalReactions, normalReactions.map((r) => r.id)).groupCount;
  if (normalGroups !== EXPECTED.normalGroups) fail('通常グループ数が一致しない: ' + normalGroups);
  if (built.groupCount !== EXPECTED.combinedGroups) fail('合成グループ数が一致しない: ' + built.groupCount);

  return { meta, types, reactions };
}

function render(data) {
  const lines = [
    '/*',
    ' * 有機反応マップ 3D — 大学レベル追加反応の事実データ（座標なし）',
    ' *',
    ' * このファイルは scripts/app11/build-3d-academic-facts.cjs が生成する。直接編集しない。',
    ' * 元: site/app11/academic-data.js（2D 用）。x / y / label / edges / layout は含めない。',
    ' * 3D 公開ページはこのファイルだけを読み、academic-data.js は読み込まない。',
    ' */',
    '(function (root, factory) {',
    "  if (typeof module === 'object' && module.exports) module.exports = factory();",
    "  else root.RPMapAcademicFacts = factory();",
    "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
    "  'use strict';",
    '  var META = ' + JSON.stringify(data.meta) + ';',
    '  var TYPES = ' + JSON.stringify(data.types) + ';',
    '  var REACTIONS = ['
  ];
  data.reactions.forEach((reaction, index) => {
    lines.push('    ' + JSON.stringify(reaction) + (index === data.reactions.length - 1 ? '' : ','));
  });
  lines.push(
    '  ];',
    '  return { meta: META, types: TYPES, reactions: REACTIONS, geometry: false };',
    '});',
    ''
  );
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const data = build();
  const text = render(data);

  if (check) {
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
    if (current !== text) fail('site/app11/3d/academic-facts.js が最新ではありません（再生成してください）');
    console.log('ok: academic-facts.js は最新（反応 ' + data.reactions.length + ' 件）');
    return;
  }
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, text);
  console.log('wrote ' + path.relative(ROOT, TARGET) + '（反応 ' + data.reactions.length + ' 件）');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = { build, render, TARGET, SOURCE, EXPECTED };
