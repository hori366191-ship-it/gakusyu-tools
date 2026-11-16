/**
 * 有機反応マップ（app11）— アカデミック（大学レベル追加反応）データの生成
 *
 * 実行:
 *   node scripts/app11/build-academic-data.cjs            # site/app11/academic-data.js を更新
 *   node scripts/app11/build-academic-data.cjs --check    # 生成物が最新かを確認
 *
 * - 正本は site-src/app11/academic-reactions.json。通常の reactions.json / layout.json /
 *   routes.json / data.js は読むだけで書き換えない。
 * - 通常 427 物質の ID だけを参照する overlay。compounds 配列は複製しない。
 * - 反応 ID は academic-* 名前空間。通常 86 反応・held 81 反応の ID と衝突させない。
 * - 既存の S.projectEquation / S.loadSpecies を再利用し、未知の compound・species・
 *   元素収支（B/N）を fail-closed で止める。
 * - 一般則の適用（evidenceKind: general-rule-application）と、資料が個別例として示す
 *   変換（source-illustrated-transformation）を区別して保存する。
 * - 多段階（stepKind: multi-step）は direct と区別し、steps の説明を必須にする。
 * - 出典の URL は正本にだけ保持し、公開データには資料名・節・確認日だけを出す。
 * - 通常データとの整合（meta.version / 件数 / ノード座標ハッシュ）を base に保存し、
 *   実行時に一致しなければアカデミックモードを無効化する（fail-closed）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('./source-data.cjs');
const N = require('./academic-network-layout.cjs');

const ROOT = S.ROOT;
const SRC = S.SRC;
const ACADEMIC_PATH = path.join(SRC, 'academic-reactions.json');
const NORMAL_DATA_PATH = path.join(ROOT, 'site', 'app11', 'data.js');
const LAYOUT_PATH = path.join(SRC, 'layout.json');
const CLASS_MAP_PATH = path.join(SRC, 'class-map.json');
const OUT_DATA = path.join(ROOT, 'site', 'app11', 'academic-data.js');

const EVIDENCE_KINDS = ['general-rule-application', 'source-illustrated-transformation'];
const STEP_KINDS = ['direct', 'multi-step'];
const ID_RE = /^academic-[a-z0-9][a-z0-9-]*$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 実行時（app.js）と同じ FNV-1a 32bit。ノードの座標・寸法だけで作る。
function academicBaseHash(compounds) {
  const lines = compounds
    .map((c) => c.id + ':' + c.x + ',' + c.y + ',' + (c.w == null ? '' : c.w) + ',' + (c.h == null ? '' : c.h))
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < lines.length; i++) {
    hash ^= lines.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ('0000000' + hash.toString(16)).slice(-8);
}

function normalizeTerm(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '');
}

function pairKey(reaction) {
  const subs = reaction.substrates.slice().sort().join('+');
  const prods = reaction.products.slice().sort().join('+');
  return reaction.type + '|' + subs + '>' + prods;
}

function dedupeKey(reaction) {
  return pairKey(reaction) + '|' + normalizeTerm(reaction.conditions);
}

/* ---------------- 正本の展開（group + rows） ---------------- */

// "sodium-methoxide+chloromethane>dimethyl-ether" / "benzaldehyde*2>benzyl-alcohol+sodium-benzoate"
function parseRow(text) {
  const arrow = String(text).indexOf('>');
  if (arrow < 0) throw new Error('academic-reactions.json の行の形式が不正: ' + text);
  const parseSide = (side, owner) => side.split('+').map((raw) => {
    const item = raw.trim();
    const m = /^([a-z0-9][a-z0-9,()-]*?)(?:\*(\d+))?$/i.exec(item);
    if (!m) throw new Error(owner + ' の物質の書き方が不正: ' + item);
    return { id: m[1], coef: m[2] ? parseInt(m[2], 10) : 1 };
  });
  return {
    substrates: parseSide(String(text).slice(0, arrow), 'academic row'),
    products: parseSide(String(text).slice(arrow + 1), 'academic row')
  };
}

function slugOf(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function expandRows(doc) {
  const out = [];
  const groups = doc.groups || [];
  const seen = new Set();
  groups.forEach((group) => {
    const owner = 'academic group ' + group.key;
    if (!group.key || !group.type) throw new Error(owner + ' に key/type がない');
    if (!Array.isArray(group.rows) || !group.rows.length) throw new Error(owner + ' に行がない');
    if (!group.conditions) throw new Error(owner + ' に conditions がない');
    if (!group.scope) throw new Error(owner + ' に scope がない');
    if (EVIDENCE_KINDS.indexOf(group.evidenceKind) === -1) throw new Error(owner + ' の evidenceKind が不正');
    if (STEP_KINDS.indexOf(group.stepKind) === -1) throw new Error(owner + ' の stepKind が不正');
    if (group.stepKind === 'multi-step' && (!Array.isArray(group.steps) || !group.steps.length)) {
      throw new Error(owner + ' の多段階に steps がない');
    }
    group.rows.forEach((rowEntry, index) => {
      const rowText = typeof rowEntry === 'string' ? rowEntry : rowEntry.row;
      const rowVariants = typeof rowEntry === 'object' && rowEntry.variants === true;
      const parsed = parseRow(rowText);
      const id = 'academic-' + slugOf(group.key) + '-' + slugOf(parsed.substrates.map((s) => s.id).join('-')) +
        '-' + slugOf(parsed.products.map((p) => p.id).join('-'));
      if (!ID_RE.test(id)) throw new Error(owner + ' のIDが不正: ' + id);
      if (seen.has(id)) throw new Error('アカデミック反応IDが重複: ' + id);
      seen.add(id);
      out.push({
        id: id,
        groupKey: group.key,
        type: group.type,
        substrates: parsed.substrates.map((s) => s.id),
        products: parsed.products.map((p) => p.id),
        substrateCoefs: parsed.substrates.map((s) => s.coef),
        productCoefs: parsed.products.map((p) => p.coef),
        reagents: group.reagents || [],
        conditions: rowNoteOf(group, index) || group.conditions,
        note: group.note || '',
        productNote: group.productNote || '',
        scope: group.scope,
        evidenceKind: group.evidenceKind,
        stepKind: group.stepKind,
        steps: group.steps || [],
        sourceIds: group.sourceIds || [],
        basedOnHeld: group.basedOnHeld || null,
        variants: rowVariants || !!group.variants,
        tier: 'academic'
      });
    });
  });
  (doc.reactions || []).forEach((reaction) => {
    if (!reaction.id || !ID_RE.test(reaction.id)) throw new Error('明示反応のIDが不正: ' + reaction.id);
    if (seen.has(reaction.id)) throw new Error('アカデミック反応IDが重複: ' + reaction.id);
    seen.add(reaction.id);
    out.push(Object.assign({ substrateCoefs: reaction.substrates.map(() => 1), productCoefs: reaction.products.map(() => 1), variants: false, tier: 'academic' }, reaction));
  });
  // 高分子・共重合・ネットワークは、係数 n/m/p/d とモード P を明示できる形で持つ。
  (doc.polymerReactions || []).forEach((reaction) => {
    if (!reaction.id || !ID_RE.test(reaction.id)) throw new Error('高分子反応のIDが不正: ' + reaction.id);
    if (seen.has(reaction.id)) throw new Error('アカデミック反応IDが重複: ' + reaction.id);
    seen.add(reaction.id);
    const subs = reaction.substrates.map((s) => (typeof s === 'string' ? { id: s, coef: 1 } : s));
    const prods = reaction.products.map((p) => (typeof p === 'string' ? { id: p, coef: 1 } : p));
    out.push(Object.assign({}, reaction, {
      substrates: subs.map((s) => s.id),
      products: prods.map((p) => p.id),
      substrateCoefs: subs.map((s) => s.coef),
      productCoefs: prods.map((p) => p.coef),
      variants: false,
      tier: 'academic'
    }));
  });
  return out;
}

function rowNoteOf(group, index) {
  if (!Array.isArray(group.rowNotes)) return '';
  return group.rowNotes[index] || '';
}

/* ---------------- 検証と公開データ化 ---------------- */

function build(opts) {
  const options = opts || {};
  const doc = readJson(options.sourcePath || ACADEMIC_PATH);
  if (doc.version !== 1) throw new Error('academic-reactions.json の版が未対応: ' + doc.version);
  const D = options.baseData || require(NORMAL_DATA_PATH);
  const layout = readJson(LAYOUT_PATH);
  const classMap = readJson(CLASS_MAP_PATH);
  const source = options.source || S.loadSource();
  const species = S.loadSpecies();

  const compoundById = new Map(source.compounds);
  const normalReactionById = new Map(D.reactions.map((r) => [r.id, r]));
  const heldIds = new Set(source.heldReactions.map((r) => r.id));
  const normalIds = new Set(D.reactions.map((r) => r.id));

  const sourceById = new Map();
  (doc.sources || []).forEach((s) => {
    if (!s.id || sourceById.has(s.id)) throw new Error('academic-reactions.json の資料IDが重複/欠落: ' + s.id);
    if (!s.book || !s.section || !s.checkedAt) throw new Error('資料情報が不足: ' + s.id);
    if (!/^https:\/\//.test(String(s.url || ''))) throw new Error('資料URLが正本にない: ' + s.id);
    sourceById.set(s.id, s);
  });

  const academicTypes = {};
  Object.keys(doc.types || {}).forEach((key) => {
    const t = doc.types[key];
    if (!t || !t.label || !t.summary) throw new Error('academic type の情報が不足: ' + key);
    if (source.types[key]) throw new Error('academic type が通常 type と重複: ' + key);
    academicTypes[key] = { label: t.label, summary: t.summary, schematic: t.schematic || '' };
  });

  const publicSourceOf = (entry, owner) => {
    if (!entry.book || !entry.section || !entry.checkedAt) throw new Error(owner + ' の資料情報が不足');
    return entry.book + ' ' + entry.section + '（' + entry.checkedAt + ' 確認）';
  };

  const reactions = [];
  const warnings = [];
  const seenIds = new Set();
  const normalPairKeys = new Set();
  D.reactions.forEach((r) => normalPairKeys.add(pairKey(r)));
  const heldPairKeys = new Set(source.heldReactions.map((r) => pairKey({ type: r.type, substrates: r.substrates || [], products: r.products || [] })));
  const seenPairs = new Map();

  const rawList = expandRows(doc);
  // 高分子の式には H2O / HCl などの無機speciesを含む。グラフの端点は既存427物質だけにする。
  rawList.forEach((raw) => {
    if (!raw.equation) return;
    raw.substrates = raw.substrates.filter((id) => compoundById.has(id));
    raw.products = raw.products.filter((id) => compoundById.has(id));
  });
  rawList.forEach((raw) => {
    const owner = 'アカデミック反応 ' + raw.id;
    if (normalIds.has(raw.id)) throw new Error(owner + ' が通常の反応IDと衝突');
    if (heldIds.has(raw.id)) throw new Error(owner + ' が保留反応IDと衝突');
    if (seenIds.has(raw.id)) throw new Error(owner + ' のIDが重複');
    seenIds.add(raw.id);
    if (!source.types[raw.type] && !academicTypes[raw.type]) throw new Error(owner + ' の種別が未定義: ' + raw.type);
    if (!Array.isArray(raw.substrates) || !raw.substrates.length) throw new Error(owner + ' に基質がない');
    if (!Array.isArray(raw.products)) throw new Error(owner + ' の生成物が配列でない');
    if (!raw.products.length && !raw.productNote) throw new Error(owner + ' に生成物も説明もない');
    raw.substrates.concat(raw.products).forEach((id) => {
      if (!compoundById.has(id)) throw new Error(owner + ' の物質IDが既存427にない: ' + id);
    });
    if (!raw.scope || !String(raw.scope).trim()) throw new Error(owner + ' に scope がない');
    if (EVIDENCE_KINDS.indexOf(raw.evidenceKind) === -1) throw new Error(owner + ' の evidenceKind が不正');
    if (STEP_KINDS.indexOf(raw.stepKind) === -1) throw new Error(owner + ' の stepKind が不正');
    if (raw.stepKind === 'multi-step' && (!Array.isArray(raw.steps) || !raw.steps.length)) {
      throw new Error(owner + ' の多段階に steps がない');
    }
    if (!Array.isArray(raw.sourceIds) || !raw.sourceIds.length) throw new Error(owner + ' に資料がない');
    const verification = raw.sourceIds.map((id) => {
      const entry = sourceById.get(id);
      if (!entry) throw new Error(owner + ' の資料IDが未定義: ' + id);
      return entry;
    });
    if (raw.basedOnHeld) {
      if (!heldIds.has(raw.basedOnHeld)) throw new Error(owner + ' の basedOnHeld が保留反応でない: ' + raw.basedOnHeld);
      // 保留は出典が空。新しい根拠（通常データの確認日より後の確認日）を必須にする。
      const older = verification.filter((entry) => entry.checkedAt <= (D.meta.verifiedAt || ''));
      if (older.length) throw new Error(owner + ' が保留を新しい根拠なしに昇格している: ' + raw.basedOnHeld);
    }
    const key = dedupeKey(raw);
    if (seenPairs.has(key)) throw new Error(owner + ' が同一の反応として重複: ' + seenPairs.get(key));
    seenPairs.set(key, raw.id);
    if (normalPairKeys.has(pairKey(raw)) && !raw.note) {
      throw new Error(owner + ' が通常の確認済み反応と同じ組合せ（条件が異なる場合は note で理由を示す）');
    }
    if (heldPairKeys.has(pairKey(raw)) && !raw.basedOnHeld && !raw.note) {
      throw new Error(owner + ' が保留反応と同じ組合せ（新根拠か note が必要）');
    }

    const typeLabel = (source.types[raw.type] && source.types[raw.type].label) ||
      (academicTypes[raw.type] && academicTypes[raw.type].label);
    const equation = raw.equation ? projectAcademicEquation(raw.equation, raw, {
      compounds: source.compounds,
      species: species
    }) : planAcademicEquation(raw, verification, compoundById);
    const regions = new Set();
    raw.substrates.concat(raw.products).forEach((id) => regions.add(compoundById.get(id).region));

    const record = {
      id: raw.id,
      type: raw.type,
      typeLabel: typeLabel,
      state: 'academic',
      academic: true,
      tier: 'academic',
      evidenceKind: raw.evidenceKind,
      stepKind: raw.stepKind,
      steps: raw.steps || [],
      scope: raw.scope,
      basedOnHeld: raw.basedOnHeld || null,
      substrates: raw.substrates,
      reagents: raw.reagents || [],
      products: raw.products,
      productNote: raw.productNote || '',
      conditions: raw.conditions,
      note: raw.note || '',
      sources: verification.map((entry) => publicSourceOf(entry, owner)),
      cross: regions.size > 1,
      equation: equation
    };
    // 高校標準から昇格した行だけが持つ任意メタデータ。既存の学術行の出力は変えない。
    if (raw.educationLevel) record.educationLevel = raw.educationLevel;
    reactions.push(record);
  });
  reactions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 専用レイアウト（layout version 2）。通常 427 物質の座標は読むだけで、ここでは
  // 「アカデミック表示専用」の座標一式を作る。通常データ（site/app11/data.js）は変えない。
  const normalForLayout = D.compounds.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    w: c.w || layout.nodeW,
    h: c.h || layout.nodeH,
    region: c.region,
    regionIndex: c.regionIndex,
    incoming: c.incoming,
    outgoing: c.outgoing
  }));
  const allReactionInputs = D.reactions.map((r) => ({
    id: r.id,
    tier: r.tier,
    typeLabel: r.typeLabel || r.type,
    substrates: r.substrates,
    products: r.products
  })).concat(reactions.map((r) => ({
    id: r.id,
    tier: 'academic',
    typeLabel: r.typeLabel || r.type,
    substrates: r.substrates,
    products: r.products
  })));
  const placed = N.buildLayout({
    compounds: normalForLayout,
    reactions: allReactionInputs,
    classMap: {
      frame: classMap.frame,
      nodes: classMap.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }))
    },
    nodeW: layout.nodeW,
    nodeH: layout.nodeH
  });

  placed.warnings.forEach((w) => warnings.push(w));
  reactions.forEach((r) => {
    const marker = placed.markers[r.id];
    if (!marker) throw new Error('アカデミック反応のマーカーがない: ' + r.id);
    const edges = [];
    const pushEdge = (dir, id) => {
      const key = r.id + '|' + dir + '|' + id;
      const route = placed.routes[key];
      if (!route) {
        warnings.push({ id: key, kind: 'card-only' });
        return;
      }
      edges.push({ dir: dir, id: id, tier: 'academic', points: route.points, gaps: [], bridges: [] });
    };
    r.substrates.forEach((id) => pushEdge('in', id));
    r.products.forEach((id) => pushEdge('out', id));
    r.x = marker.x;
    r.y = marker.y;
    r.label = marker.label;
    r.edges = edges;
  });

  const academicCount = reactions.length;
  const academicConnected = new Set();
  reactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => academicConnected.add(id)));
  const normalIsolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  const newlyConnected = normalIsolated.filter((c) => academicConnected.has(c.id));
  const stillIsolated = normalIsolated.length - newlyConnected.length;
  const drawnIds = new Set(Object.keys(placed.routes).map((key) => placed.routes[key].compound));
  const newlyDrawn = newlyConnected.filter((c) => drawnIds.has(c.id)).length;
  const reactionsWithoutIncoming = reactions.filter((r) => !r.edges.some((e) => e.dir === 'in')).length;
  const reactionsWithoutOutgoing = reactions.filter((r) => !r.edges.some((e) => e.dir === 'out')).length;
  const cardOnlyCount = allReactionInputs
    .filter((r) => r.tier === 'academic')
    .reduce((n, r) => n + r.substrates.length + r.products.length, 0) - Object.keys(placed.routes).length;

  // アカデミック反応だけの弱連結成分（通常ネットワークとは別に数える）。
  const parent = new Map();
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  academicConnected.forEach((id) => parent.set(id, id));
  reactions.forEach((r) => {
    const all = r.substrates.concat(r.products);
    for (let i = 1; i < all.length; i++) {
      const a = find(all[0]);
      const b = find(all[i]);
      if (a !== b) parent.set(a, b);
    }
  });
  const components = new Set(academicConnected.has ? [...academicConnected].map(find) : []).size;

  const evidenceCount = {};
  EVIDENCE_KINDS.forEach((kind) => { evidenceCount[kind] = 0; });
  const stepCount = {};
  STEP_KINDS.forEach((kind) => { stepCount[kind] = 0; });
  reactions.forEach((r) => {
    evidenceCount[r.evidenceKind] += 1;
    stepCount[r.stepKind] += 1;
  });

  const meta = {
    version: 1,
    generatedAt: '2026-11-17',
    verifiedAt: '2026-11-17',
    sourceBook: doc.sourceBook || 'OpenStax Organic Chemistry (McMurry)',
    title: doc.title || 'アカデミック（大学レベルの追加反応）',
    scopeNote: doc.scopeNote || '',
    tierLabel: '大学レベル',
    academicReactionCount: academicCount,
    typeCount: Object.keys(academicTypes).length,
    evidenceCount: evidenceCount,
    stepCount: stepCount,
    newlyConnectedCount: newlyConnected.length,
    stillIsolatedCount: stillIsolated,
    academicComponents: components,
    drawnConnectedCount: drawnIds.size,
    drawnNewlyConnectedCount: newlyDrawn,
    drawnRouteCount: Object.keys(placed.routes).length,
    cardOnlyCount: cardOnlyCount,
    reactionsWithoutIncoming: reactionsWithoutIncoming,
    reactionsWithoutOutgoing: reactionsWithoutOutgoing,
    warnings: warnings,
    enabled: academicCount > 0,
    normalCounts: {
      compoundCount: D.meta.compoundCount,
      reactionCount: D.meta.reactionCount,
      heldReactionCount: D.meta.heldReactionCount
    }
  };

  return {
    meta: meta,
    base: {
      normalVersion: D.meta.version,
      normalGeneratedAt: D.meta.generatedAt,
      compoundCount: D.compounds.length,
      reactionCount: D.reactions.length,
      heldReactionCount: D.meta.heldReactionCount,
      nodeHash: academicBaseHash(D.compounds),
      priorityHash: D.meta.priorityHash
    },
    types: academicTypes,
    reactions: reactions,
    layout: {
      version: placed.version,
      positions: placed.positions,
      normalMarkers: placed.normalMarkers,
      normalRoutes: placed.normalRoutes,
      markers: placed.markers,
      routes: placed.routes,
      canvas: placed.canvas,
      regionFocus: placed.regionFocus,
      stats: placed.stats,
      warnings: placed.warnings
    }
  };
}

// 通常の projectEquation は P の係数を n/2n に限定する。通常データは変えず、
// アカデミックの高分子・共重合・可変置換だけ、係数トークンを厳密なホワイトリストで許可する。
const ACADEMIC_P_COEFS = ['n', 'm', 'p', 'd', 'dn', '2n', '3n'];

function projectAcademicEquation(raw, reaction, ctx) {
  const owner = 'アカデミック反応 ' + reaction.id + ' の反応式';
  if (!raw || raw.mode !== 'P') {
    // B / N / T は通常の検証（元素・電荷収支、未知ID）をそのまま使う。
    return S.projectEquation(raw, reaction, ctx);
  }
  const arrow = raw.arrow || 'to';
  if (arrow !== 'to' && arrow !== 'equilibrium') throw new Error(owner + ' の矢印が不正');
  const text = (value, at) => {
    if (value == null) return '';
    const s = String(value).trim();
    if (s.length > 160) throw new Error(at + ' が長すぎる');
    return s;
  };
  const resolveSide = (items, side) => {
    if (!Array.isArray(items) || !items.length) throw new Error(owner + ' の' + side + 'がない');
    return items.map((item, index) => {
      const at = owner + ' の' + side + '#' + (index + 1);
      const coef = item.coef == null ? 1 : item.coef;
      const ok = (typeof coef === 'number' && Number.isInteger(coef) && coef >= 1 && coef <= 99) ||
        (typeof coef === 'string' && ACADEMIC_P_COEFS.indexOf(coef) !== -1);
      if (!ok) throw new Error(at + ' の係数が不正（1〜99 か ' + ACADEMIC_P_COEFS.join('/') + '）: ' + coef);
      if (item.text != null) {
        const value = text(item.text, at + ' の text');
        if (!value) throw new Error(at + ' の text が空');
        return { kind: 'text', text: value, coef: coef };
      }
      if (item.compound != null) {
        const c = ctx.compounds.get(item.compound);
        if (!c) throw new Error(at + ' の物質IDが未収録: ' + item.compound);
        if (!c.formula) throw new Error(at + ' の物質に化学式がない: ' + item.compound);
        return { kind: 'compound', id: item.compound, coef: coef, formula: c.formula, label: c.label || '' };
      }
      const sp = ctx.species.get(item.species);
      if (!sp) throw new Error(at + ' の無機speciesが未定義: ' + item.species);
      return { kind: 'species', id: item.species, coef: coef, formula: sp.formula, charge: sp.charge, label: sp.name };
    });
  };
  const left = resolveSide(raw.left, '左辺');
  const right = resolveSide(raw.right, '右辺');
  const all = left.concat(right);
  if (!all.some((item) => typeof item.coef === 'string' && item.coef !== '' && item.coef !== 'd')) {
    throw new Error(owner + ' の重合模式式に繰り返し係数（n など）がない');
  }
  if (all.some((item) => item.kind === 'text') && raw.mode !== 'T' && raw.mode !== 'P') {
    throw new Error(owner + ' の text は T / P だけで使う');
  }
  return {
    mode: 'P',
    modeLabel: S.EQUATION_MODE_LABELS.P,
    title: text(raw.title, owner + ' のtitle'),
    arrow: arrow,
    above: text(raw.above, owner + ' のabove'),
    below: text(raw.below, owner + ' のbelow'),
    explanation: text(raw.explanation, owner + ' のexplanation'),
    sources: (raw.verification || []).map((entry) => S.publicSource(entry)),
    left: left,
    right: right,
    variants: []
  };
}

// 明示の equation がない場合も、通常カードと同じ描画器で読める T（構造変換図）を持つ。
function planAcademicEquation(raw, verification, compoundById) {
  const itemOf = (id, coef) => {
    const c = compoundById.get(id);
    return { kind: 'compound', id: id, coef: coef, formula: c.formula || '', label: c.label || '' };
  };
  const left = raw.substrates.map((id, i) => itemOf(id, raw.substrateCoefs[i] || 1));
  const right = raw.products.map((id, i) => itemOf(id, raw.productCoefs[i] || 1));
  const verificationPublic = verification.map((entry) => ({ source: entry.book, section: entry.section, date: entry.checkedAt }));
  const base = {
    mode: 'T',
    arrow: 'to',
    title: '構造変換図',
    explanation: '大学レベルの一般則に基づく構造変換です。係数・副生成物・中間体は省略しています。',
    verification: verificationPublic
  };
  if (raw.variants) {
    return Object.assign({}, base, {
      arrow: 'equilibrium',
      explanation: '代表的な競合生成物のうち1つを示す構造変換です。混合比・全生成物は主張しません。',
      left: left,
      right: [],
      variants: raw.products.map((id, i) => ({
        label: '生成物' + (i + 1) + '（代表）',
        arrow: 'to',
        left: left,
        right: [itemOf(id, raw.productCoefs[i] || 1)]
      }))
    });
  }
  if (!right.length) {
    // 生成物が文字列でしか示せない反応は、左辺の構造変換だけを式にし、右辺は text 1件。
    return Object.assign({}, base, {
      left: left,
      right: [{ kind: 'text', text: raw.productNote || '生成物の記載なし', coef: 1 }]
    });
  }
  return Object.assign({}, base, { left: left, right: right });
}

function renderAcademicData(data) {
  const lines = [];
  lines.push('/*');
  lines.push(' * 有機反応マップ（試験版）— アカデミック（大学レベルの追加反応）データ');
  lines.push(' *');
  lines.push(' * このファイルは scripts/app11/build-academic-data.cjs が生成する。直接編集しない。');
  lines.push(' * 正本は site-src/app11/academic-reactions.json。');
  lines.push(' * 通常 427 物質を参照する overlay で、compounds 配列は持たない。');
  lines.push(' * 通常の data.js / layout.json / routes.json は変更しない。');
  lines.push(' * 資料の URL は正本だけに残し、このファイルには資料名・節・確認日だけを出す。');
  lines.push(' */');
  lines.push('(function (root, factory) {');
  lines.push("  if (typeof module === 'object' && module.exports) module.exports = factory();");
  lines.push('  else root.RPMapAcademic = factory();');
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  lines.push("  'use strict';");
  lines.push('  var META = ' + JSON.stringify(data.meta) + ';');
  lines.push('  var BASE = ' + JSON.stringify(data.base) + ';');
  lines.push('  var TYPES = ' + JSON.stringify(data.types) + ';');
  lines.push('  var REACTIONS = [');
  data.reactions.forEach((r) => lines.push('    ' + JSON.stringify(r) + ','));
  lines.push('  ];');
  lines.push('  var LAYOUT = ' + JSON.stringify(data.layout) + ';');
  lines.push('  return { meta: META, base: BASE, types: TYPES, reactions: REACTIONS, layout: LAYOUT };');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const data = build();
  const output = renderAcademicData(data);
  if (check) {
    const current = fs.existsSync(OUT_DATA) ? fs.readFileSync(OUT_DATA, 'utf8') : '';
    if (current !== output) {
      console.error('academic-data.js が最新ではありません: node scripts/app11/build-academic-data.cjs を実行してください。');
      process.exit(1);
    }
    console.log('academic-data.js は最新です（アカデミック反応 ' + data.meta.academicReactionCount +
      '、ルート ' + Object.keys(data.layout.routes).length + '、warnings ' + data.meta.warnings.length + '）。');
    return;
  }
  fs.writeFileSync(OUT_DATA, output, 'utf8');
  console.log('生成: site/app11/academic-data.js（アカデミック反応 ' + data.meta.academicReactionCount +
    '、種別 ' + data.meta.typeCount + '、経路 ' + Object.keys(data.layout.routes).length +
    '、通常 ' + Object.keys(data.layout.normalRoutes).length + '、card-only ' + data.meta.cardOnlyCount + '）');
}

if (require.main === module) main();

module.exports = { build, renderAcademicData, academicBaseHash, projectAcademicEquation, ACADEMIC_PATH, OUT_DATA };
