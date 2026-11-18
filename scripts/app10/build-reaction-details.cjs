/**
 * 有機化学ビルダー（site/app10）— 化合物カードの反応詳細パック生成
 *
 * 実行:
 *   node scripts/app10/build-reaction-details.cjs            # 3ファイルを更新
 *   node scripts/app10/build-reaction-details.cjs --check    # 生成物が最新か確認（差分あれば exit 1）
 *
 * 入力（公開済みの CommonJS 事実データのみ）:
 *   site/app10/data.js          … 化合物ID・名称（カード側の表示名）
 *   site/app11/data.js          … 公開済み 162 反応・種（species）・型
 *   site/app11/academic-data.js … 公開済み 152 反応・型
 *   site/app11/reaction-groups.js … 公開モジュール（同じ端点の反応のグループ化）
 *   site/shared/organic-structure.js … 既存の正準レンダラ（構造ビューの解決にのみ使用）
 *
 * 出力（site/shared。app10 の固定16ファイル構成を変えないため）:
 *   app10-reaction-detail-counts.js … 先に読む小さな件数表
 *   app10-reaction-details.js       … 初回の外側展開で読む反応詳細（式の図形を含まない）
 *   app10-reaction-equations.js     … 初回の内側展開で読む反応式（構造specを含む）
 *
 * - 座標・ラベル配置・経路点列・cross など、マップ描画のためだけの値は出力しない。
 * - 保留（held）の反応は入力に含まれない。basedOnHeld はIDの注記だけを残す。
 * - 出力は入力の並びと固定キー順だけで決まる（2Dレイアウトを変えても不変）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP10 = path.join(ROOT, 'site', 'app10');
const SHARED_DIR = path.join(ROOT, 'site', 'shared');

const D10 = require(path.join(APP10, 'data.js'));
const D11 = require(path.join(ROOT, 'site', 'app11', 'data.js'));
const A11 = require(path.join(ROOT, 'site', 'app11', 'academic-data.js'));
const GROUPS = require(path.join(ROOT, 'site', 'app11', 'reaction-groups.js'));
const SHARED = require(path.join(ROOT, 'site', 'shared', 'organic-structure.js'));
const { sameText } = require('./generated-text.cjs');

const R = SHARED.createRenderer({ structurePrefix: 'oc-', equationPrefix: 'oc-eq-' });

const PACK_VERSION = 'app10-reactions/1';

const OUT_COUNTS = path.join(SHARED_DIR, 'app10-reaction-detail-counts.js');
const OUT_DETAILS = path.join(SHARED_DIR, 'app10-reaction-details.js');
const OUT_EQUATIONS = path.join(SHARED_DIR, 'app10-reaction-equations.js');

const COMPOUND_IDS = Object.keys(D10.COMPOUNDS).sort();

// 表示・グループ化は「高校内容 / 大学内容」の2段階だけ。
// 旧86件（educationLevelなし）は「従来の高校」として、標準タグを発明しない。
const BUCKETS = [
  {
    key: 'high-school',
    level: 'high-school',
    label: '高校',
    reactions: D11.reactions.slice()
  },
  {
    key: 'university',
    level: 'university',
    label: '大学レベル',
    reactions: A11.reactions.slice()
  }
];

const LEVELS = [
  { key: 'high-school', label: '高校内容', buckets: ['high-school'] },
  { key: 'university', label: '大学内容', buckets: ['university'] }
];

function educationLabelFor(r) {
  if (r.academic) return '大学レベル';
  if (r.educationLevel === 'high-school-standard') return '高校標準';
  if (r.educationLevel === 'high-school-extension') return '高校発展';
  return '高校';
}

function educationKeyFor(r) {
  if (r.academic) return 'university';
  return r.educationLevel || 'untagged';
}

const EVIDENCE_LABELS = {
  'general-rule-application': '一般則の適用',
  'source-illustrated-transformation': '資料が示す変換'
};

function compoundName(id) {
  const c = D10.COMPOUNDS[id];
  return c ? c.name : id;
}

// 試薬は文字列（日本語）で入っている場合がある。完全一致する既存IDだけを解決し、
// 名前の部分一致や推測はしない。
const NAME_TO_ID = (() => {
  const map = Object.create(null);
  const dup = Object.create(null);
  COMPOUND_IDS.forEach((id) => {
    const name = D10.COMPOUNDS[id].name;
    if (map[name] != null) dup[name] = true;
    else map[name] = id;
  });
  Object.keys(dup).forEach((name) => { delete map[name]; });
  return map;
})();

function resolveReagent(value) {
  if (typeof value !== 'string' || !value) return null;
  if (D10.COMPOUNDS[value]) return value;
  return NAME_TO_ID[value] || null;
}

const D11_COMPOUND_BY_ID = (() => {
  const map = Object.create(null);
  (D11.compounds || []).forEach((c) => { map[c.id] = c; });
  return map;
})();

function structureForCompound(id) {
  const c = D11_COMPOUND_BY_ID[id] || D10.COMPOUNDS[id];
  if (!c) return null;
  let spec = c.structure || null;
  let fallback = !spec;
  try {
    const view = R.structureView(c);
    const fig = view && view.figures && view.figures[0];
    if (fig && fig.structure) spec = fig.structure;
    if (view && (view.kind === 'fallback' || view.kind === 'missing')) fallback = true;
  } catch (err) {
    // 登録specのまま描く。式は名称で代替表示される。
  }
  return { structure: spec, fallback: fallback };
}

function compoundEquationItem(id, coef) {
  const resolved = structureForCompound(id);
  if (!resolved) {
    return { coef: coef, name: compoundName(id), structure: null, fallback: true };
  }
  return {
    coef: coef,
    name: compoundName(id),
    structure: resolved.structure,
    fallback: resolved.fallback
  };
}

function speciesEquationItem(id, coef) {
  const sp = D11.species && D11.species[id];
  if (!sp) return { coef: coef, name: id, structure: null, fallback: true };
  return {
    coef: coef,
    name: sp.name || id,
    structure: sp.structure || null,
    fallback: !sp.structure
  };
}

function equationItemOf(item) {
  if (!item) return null;
  if (item.kind === 'species') return speciesEquationItem(item.id, item.coef);
  if (item.kind === 'text') {
    return { coef: item.coef, name: item.text, structure: null, fallback: true };
  }
  return compoundEquationItem(item.id, item.coef);
}

function equationItems(list) {
  return (list || []).map(equationItemOf).filter(Boolean);
}

// app11 の reactionEquationPlan と同じ優先順位。式が無い場合は係数を推定せず、
// 反応物と主生成物の構造だけを描く。
function equationPlan(r) {
  const eq = r.equation;
  if (!eq) {
    return {
      mode: 'derived',
      equations: [{
        label: '',
        arrow: 'to',
        above: '',
        below: '',
        left: (r.substrates || []).map((id) => compoundEquationItem(id, 1)),
        right: (r.products || []).length
          ? r.products.map((id) => compoundEquationItem(id, 1))
          : [{ coef: 1, name: r.productNote || '生成物の記載なし', structure: null, fallback: true }]
      }]
    };
  }
  if (eq.variants && eq.variants.length) {
    return {
      mode: eq.mode || '',
      equations: eq.variants.map((variant) => ({
        label: variant.label || '',
        arrow: variant.arrow || eq.arrow || 'to',
        above: eq.above || '',
        below: eq.below || '',
        left: equationItems(variant.left),
        right: equationItems(variant.right)
      }))
    };
  }
  return {
    mode: eq.mode || '',
    equations: [{
      label: '',
      arrow: eq.arrow || 'to',
      above: eq.above || '',
      below: eq.below || '',
      left: equationItems(eq.left),
      right: equationItems(eq.right)
    }]
  };
}

function stateLabel(r) {
  if (r.academic) return '大学レベル';
  if (r.state && r.state !== 'confirmed') {
    const s = D11.states && D11.states[r.state];
    return (s && s.label) || r.state;
  }
  if (r.evidenceKind === 'general-rule-application' ||
      r.evidenceKind === 'source-illustrated-transformation') {
    return '収録済';
  }
  return '確認済';
}

function evidenceLabel(r) {
  return EVIDENCE_LABELS[r.evidenceKind] || '本文で確認';
}

const TYPE_MAP = Object.create(null);
function typeKeyFor(r) {
  return (r.academic ? 'academic:' : 'normal:') + (r.type || '');
}

function typeInfo(r) {
  const types = r.academic ? A11.types : D11.types;
  const t = types && types[r.type];
  return {
    label: r.typeLabel || (t && t.label) || r.type || '',
    summary: (t && t.summary) || '',
    schematic: (t && t.schematic) || ''
  };
}

function memberRecord(r, bucket) {
  const eq = r.equation || {};
  const variants = eq.variants || [];
  const plan = equationPlan(r);
  const typeKey = typeKeyFor(r);
  if (!TYPE_MAP[typeKey]) TYPE_MAP[typeKey] = typeInfo(r);
  const reagents = (r.reagents || []).map((value) => {
    const id = resolveReagent(value);
    return id ? { id: id } : { name: String(value) };
  });
  return {
    id: r.id,
    typeKey: typeKey,
    academic: !!r.academic,
    education: educationLabelFor(r),
    educationKey: educationKeyFor(r),
    state: r.state || '',
    stateLabel: stateLabel(r),
    evidence: r.evidenceKind || '',
    evidenceLabel: evidenceLabel(r),
    conditions: r.conditions || '',
    note: r.note || '',
    productNote: r.productNote || '',
    scope: r.scope || '',
    stepKind: r.stepKind || '',
    steps: (r.steps || []).slice(),
    basedOnHeld: r.basedOnHeld || '',
    sources: (r.sources || []).slice(),
    reagents: reagents,
    equation: {
      mode: eq.mode || plan.mode || '',
      modeLabel: eq.modeLabel || '',
      title: eq.title || '',
      explanation: eq.explanation || '',
      hasVariants: variants.length > 0,
      variantLabels: variants.map((v) => v.label || ''),
      sources: (eq.sources || []).slice()
    }
  };
}

// 化合物IDごとの役割。1反応につき1役割だけ（基質 > 生成物 > 試薬 > 反応式中）。
// 逆向きの反応では基質と生成物が入れ替わるため、向きはそのまま保たれる。
function roleMapForReaction(r) {
  const roles = Object.create(null);
  (r.substrates || []).forEach((id) => { if (D10.COMPOUNDS[id] && !roles[id]) roles[id] = 'substrate'; });
  (r.products || []).forEach((id) => { if (D10.COMPOUNDS[id] && !roles[id]) roles[id] = 'product'; });
  (r.reagents || []).forEach((value) => {
    const id = resolveReagent(value);
    if (id && !roles[id]) roles[id] = 'reagent';
  });
  if (r.equation) {
    const left = Object.create(null);
    const right = Object.create(null);
    const walk = (eq) => {
      (eq.left || []).forEach((item) => {
        if (item && item.kind === 'compound' && D10.COMPOUNDS[item.id]) left[item.id] = true;
      });
      (eq.right || []).forEach((item) => {
        if (item && item.kind === 'compound' && D10.COMPOUNDS[item.id]) right[item.id] = true;
      });
      (eq.variants || []).forEach(walk);
    };
    walk(r.equation);
    const ids = Object.keys(left).concat(Object.keys(right));
    ids.forEach((id) => {
      if (roles[id]) return;
      if (left[id] && !right[id]) roles[id] = 'reactant';
      else if (right[id] && !left[id]) roles[id] = 'byproduct';
      else roles[id] = 'equation';
    });
  }
  return roles;
}

function endpointIds(list) {
  return (list || []).slice();
}

// グループ化キーは昇順だが、表示は最初の反応の並び（A ＋ B → C ＋ D）を保つ。
function orderedEndpoints(sortedIds, originalList) {
  const keep = new Set(sortedIds || []);
  const out = [];
  (originalList || []).forEach((id) => {
    if (keep.has(id) && out.indexOf(id) === -1) out.push(id);
  });
  (sortedIds || []).forEach((id) => {
    if (out.indexOf(id) === -1) out.push(id);
  });
  return out;
}

// 教育段階バケットごとに既存の公開モジュールでグループ化する。
const bucketData = BUCKETS.map((bucket) => {
  const built = GROUPS.build(bucket.reactions);
  const rawById = Object.create(null);
  bucket.reactions.forEach((r) => { rawById[r.id] = r; });
  return {
    bucket: bucket,
    built: built,
    groups: built.groups.map((group, index) => {
      const first = rawById[group.memberIds[0]] || {};
      const members = group.members.map((r) => memberRecord(r, bucket));
      const labels = [];
      members.forEach((m) => {
        if (labels.indexOf(m.education) === -1) labels.push(m.education);
      });
      return {
        id: group.id,
        index: index,
        typeLabel: group.typeLabel,
        size: group.size,
        memberIds: group.memberIds.slice(),
        substrates: orderedEndpoints(group.substrateIds, first.substrates),
        products: orderedEndpoints(group.productIds, first.products),
        education: labels.length === 1 ? labels[0] : '高校',
        members: members
      };
    })
  };
});

const BUCKET_BY_KEY = Object.create(null);
bucketData.forEach((entry) => { BUCKET_BY_KEY[entry.bucket.key] = entry; });

// グループ本体は1回だけ持ち、各化合物からは参照IDで指す（重複を避ける）。
const groupById = Object.create(null);
const byCompound = Object.create(null);
COMPOUND_IDS.forEach((id) => { byCompound[id] = { levels: [] }; });

bucketData.forEach((entry) => {
  const reactionById = Object.create(null);
  entry.bucket.reactions.forEach((r) => { reactionById[r.id] = r; });
  entry.groups.forEach((group) => {
    // 同じ端点でも教育段階が違えば別グループにする。
    const groupKey = entry.bucket.key + '|' + group.id;
    groupById[groupKey] = {
      id: groupKey,
      bucket: entry.bucket.key,
      education: entry.bucket.label,
      typeLabel: group.typeLabel,
      size: group.size,
      substrates: group.substrates,
      products: group.products,
      members: group.members
    };
    const participants = Object.create(null);
    group.memberIds.forEach((rid) => {
      const roles = roleMapForReaction(reactionById[rid]);
      Object.keys(roles).forEach((id) => {
        if (participants[id] == null) participants[id] = roles[id];
      });
      // グループ内の同じ化合物は1回だけ（役割の重複を出さない）。
    });
    Object.keys(participants).forEach((id) => {
      const record = byCompound[id];
      if (!record) return;
      const levelKey = entry.bucket.level;
      let level = record.levels.filter((l) => l.key === levelKey)[0];
      if (!level) {
        const meta = LEVELS.filter((l) => l.key === levelKey)[0];
        level = { key: levelKey, label: meta.label, groups: [] };
        record.levels.push(level);
      }
      level.groups.push({
        groupId: groupKey,
        role: participants[id],
        order: entry.bucket.key + ':' + group.index
      });
    });
  });
});

const LEVEL_ORDER = { 'high-school': 0, 'university': 1 };
COMPOUND_IDS.forEach((id) => {
  const record = byCompound[id];
  record.levels.sort((a, b) => LEVEL_ORDER[a.key] - LEVEL_ORDER[b.key]);
  record.levels.forEach((level) => {
    level.groups.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    level.groups.forEach((ref) => { delete ref.order; });
  });
});

const countsByCompound = Object.create(null);
COMPOUND_IDS.forEach((id) => {
  const record = byCompound[id];
  let hs = 0;
  let uni = 0;
  record.levels.forEach((level) => {
    level.groups.forEach((ref) => {
      const group = groupById[ref.groupId];
      if (!group) throw new Error('グループ参照が不正です: ' + ref.groupId);
      group.members.forEach(() => {
        if (level.key === 'university') uni += 1;
        else hs += 1;
      });
    });
  });
  countsByCompound[id] = [hs, uni];
});

// self-check: 公開済みの反応だけが入り、保留は入らない。
const PUBLISHED = D11.reactions.length + A11.reactions.length;
const seenReactionIds = Object.create(null);
bucketData.forEach((entry) => {
  entry.bucket.reactions.forEach((r) => {
    if (seenReactionIds[r.id]) throw new Error('反応IDが重複しています: ' + r.id);
    seenReactionIds[r.id] = true;
  });
});
if (Object.keys(seenReactionIds).length !== PUBLISHED) {
  throw new Error('公開反応の件数が一致しません: ' + Object.keys(seenReactionIds).length + ' / ' + PUBLISHED);
}
if (bucketData[0].bucket.reactions.length !== 162 ||
    bucketData[1].bucket.reactions.length !== 152) {
  throw new Error('教育段階の反応数が想定と異なります（162/152）。');
}
const normalStages = { untagged: 0, 'high-school-standard': 0, 'high-school-extension': 0 };
D11.reactions.forEach((r) => {
  const key = r.educationLevel || 'untagged';
  if (normalStages[key] != null) normalStages[key] += 1;
});
if (normalStages.untagged !== 86 ||
    normalStages['high-school-standard'] !== 72 ||
    normalStages['high-school-extension'] !== 4) {
  throw new Error('通常反応の教育段階内訳が想定と異なります（86/72/4）。');
}
if (bucketData[0].groups.length !== 156 || bucketData[1].groups.length !== 152) {
  throw new Error('2段階グループ数が想定と異なります（156/152）。');
}

// 反応式パック（内側展開時のみ読む）。
const equationsById = Object.create(null);
bucketData.forEach((entry) => {
  entry.bucket.reactions.forEach((r) => {
    equationsById[r.id] = equationPlan(r);
  });
});

function uModule(comment, name, value) {
  return '/*\n' + comment.split('\n').map((line) => ' * ' + line).join('\n') + '\n */\n' +
    '(function (root, factory) {\n' +
    "  if (typeof module === 'object' && module.exports) module.exports = factory();\n" +
    '  else root.' + name + ' = factory();\n' +
    "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n" +
    "  'use strict';\n" +
    '  return ' + JSON.stringify(value) + ';\n' +
    '});\n';
}

const counts = {
  version: 1,
  packVersion: PACK_VERSION,
  source: {
    normal: D11.meta.version,
    normalGeneratedAt: D11.meta.generatedAt,
    academic: A11.meta.version,
    academicGeneratedAt: A11.meta.generatedAt
  },
  totals: {
    compounds: COMPOUND_IDS.length,
    publishedReactions: PUBLISHED,
    normalReactions: D11.reactions.length,
    academicReactions: A11.reactions.length,
    highSchoolReactions: 162,
    universityReactions: 152,
    highSchoolGroups: bucketData[0].groups.length,
    universityGroups: bucketData[1].groups.length,
    normalUntagged: 86,
    normalStandard: 72,
    normalExtension: 4
  },
  byCompound: countsByCompound
};

const details = {
  version: 1,
  packVersion: PACK_VERSION,
  types: TYPE_MAP,
  groups: groupById,
  byCompound: byCompound
};

const equations = {
  version: 1,
  packVersion: PACK_VERSION,
  byReactionId: equationsById
};

const outputs = [
  {
    file: OUT_COUNTS,
    text: uModule(
      '有機化学ビルダー（app10）— 反応詳細の件数（自動生成・直接編集しない）\n' +
      '生成: node scripts/app10/build-reaction-details.cjs\n' +
      '化合物カードの見出しに出す件数だけを持つ小さな表。',
      'OCReactionCounts', counts)
  },
  {
    file: OUT_DETAILS,
    text: uModule(
      '有機化学ビルダー（app10）— 反応詳細パック（自動生成・直接編集しない）\n' +
      '生成: node scripts/app10/build-reaction-details.cjs\n' +
      '外側の展開で遅延読込する。反応式の図形（構造spec）は含まない。',
      'OCReactionDetails', details)
  },
  {
    file: OUT_EQUATIONS,
    text: uModule(
      '有機化学ビルダー（app10）— 反応式パック（自動生成・直接編集しない）\n' +
      '生成: node scripts/app10/build-reaction-details.cjs\n' +
      '内側の展開で遅延読込する。既存の共有レンダラで描く構造specを含む。',
      'OCReactionEquations', equations)
  }
];

const check = process.argv.indexOf('--check') !== -1;
let stale = 0;
outputs.forEach((entry) => {
  const current = fs.existsSync(entry.file) ? fs.readFileSync(entry.file, 'utf8') : null;
  if (check) {
    // checkout が CRLF でも、生成物の正準は LF。改行だけの差は stale にしない。
    if (!sameText(current, entry.text)) {
      stale += 1;
      console.error('差分: ' + path.relative(ROOT, entry.file));
    }
    return;
  }
  // 常に LF で書く（Windows でも fs.writeFileSync は改行を変換しない）。
  fs.writeFileSync(entry.file, entry.text, 'utf8');
});

if (check) {
  if (stale) {
    console.error(stale + ' ファイルが最新ではありません。node scripts/app10/build-reaction-details.cjs を実行してください。');
    process.exit(1);
  }
  console.log('OK: app10 反応詳細パックは最新です。');
} else {
  outputs.forEach((entry) => {
    const size = Buffer.byteLength(entry.text, 'utf8');
    console.log(path.relative(ROOT, entry.file) + ': ' + size + ' bytes');
  });
}
