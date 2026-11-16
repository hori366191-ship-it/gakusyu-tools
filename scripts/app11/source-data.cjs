/**
 * 有機反応マップ（app11）— 入力データの読み込み（ビルド時のみ）
 *
 * site/app10 の公開データから、物質名・示性式・分類・ID とビルダーの focus 経路だけを
 * オフラインで抽出する。precursors / reactions / nature などの自由文は取り込まない。
 * 反応は site-src/app11/reactions.json（本ツール独自データ）だけを根拠にする。
 *
 * build-map-data.cjs と optimize-layout.cjs の両方がこの関数を使い、
 * 「どの物質がどの分野か」「どの反応を公開するか」の判断を一箇所に固定する。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP10 = path.join(ROOT, 'site', 'app10');
const SRC = path.join(ROOT, 'site-src', 'app11');

const SPECIES_PATH = path.join(SRC, 'species.json');

const LABEL_MAX = 12;

// 反応式の元素収支に使う元素記号。ここに無い記号は fail-closed（未知原子）として扱う。
const EQUATION_ELEMENTS = new Set([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S',
  'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Ag', 'Cd',
  'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pt', 'Au', 'Hg', 'Pb', 'Bi'
]);

// 反応式の4つの表示mode:
//   B = 完全な反応式（係数・副生成物まで。元素と電荷の収支を検査する）
//   N = 正味の総括式（収支は合うが、塩の生成・中和・後処理などを省略したと明示する）
//   T = 構造変換図（係数を主張せず、試薬由来の生成物・保護基などを省略したと明示する）
//   P = 重合反応の模式式（繰り返し単位 n。末端を省略し、有限鎖の完全式とはしない）
const EQUATION_MODES = ['B', 'N', 'T', 'P'];
const EQUATION_MODE_LABELS = {
  B: '完全な反応式',
  N: '正味の総括式',
  T: '構造変換図',
  P: '重合反応の模式式'
};

// 通常 86 反応は従来どおり n / 2n だけを許す（出力・検証とも不変）。
// 大学レベルの反応を通常モードへ移す場合だけ、academic-reactions.json と同じ
// 係数記号を明示的に許可する（未知の記号は fail-closed）。
const DEFAULT_POLYMER_SYMBOLS = ['n', '2n'];
const ACADEMIC_POLYMER_SYMBOLS = ['n', 'm', 'p', 'd', 'dn', '2n', '3n', 'x', 'y'];
const POLYMER_VARIANT_KINDS = ['coexistence', 'competition'];

// 通常反応へ追加できる教育メタデータ（既存 86 反応では未指定のまま）。
const EDUCATION_LEVELS = ['high-school-standard', 'high-school-extension'];
const EVIDENCE_KINDS = ['source-illustrated-transformation', 'general-rule-application'];
const STEP_KINDS = ['direct', 'multi-step'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

// 公開データには資料名・節番号・確認日だけを載せる（URL・本文抜粋・画像は含めない）。
function publicSource(entry) {
  const name = entry.source || 'OpenStax Organic Chemistry (McMurry)';
  const section = entry.section ? ' ' + entry.section : '';
  const date = entry.date ? '（' + entry.date + ' 確認）' : '';
  return name + section + date;
}

// app11 の構造図用に、app10 の構造specだけを深いコピーで持ち出す。
// precursors / reactions / nature などの自由文は取り込まない。
function cloneStructureSpec(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function structureFields(compound) {
  const out = {
    structure: cloneStructureSpec(compound.structure || null)
  };
  if (compound.figures && compound.figures.length) {
    out.figures = cloneStructureSpec(compound.figures);
  }
  if (compound.formulaVariable) out.formulaVariable = true;
  if (compound.formulaDisplay) out.formulaDisplay = compound.formulaDisplay;
  if (compound.formulaReference) out.formulaReference = compound.formulaReference;
  return out;
}

function loadApp10() {
  const D = require(path.join(APP10, 'data.js'));
  const C = require(path.join(APP10, 'catalog.js'));
  return { D, C };
}

/*
 * 反応式の元素収支。化合物は登録済みの formula、無機speciesは species.json の formula を
 * 元素の個数へ展開する。[O]・[H] は形式当量としてそれぞれ O・H の1原子分に数える
 * （class-map の元素収支と同じ扱い）。
 */
function parseFormula(formula, owner) {
  const text = String(formula == null ? '' : formula).trim();
  if (!text) throw new Error(owner + ' の化学式がない');
  const counts = {};
  let i = 0;
  while (i < text.length) {
    let el;
    if (text[i] === '[') {
      const end = text.indexOf(']', i);
      if (end === -1) throw new Error(owner + ' の化学式の形式が不正: ' + text);
      el = text.slice(i + 1, end);
      i = end + 1;
    } else if (/[A-Z]/.test(text[i])) {
      el = text[i];
      if (/[a-z]/.test(text[i + 1] || '')) {
        el += text[i + 1];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      throw new Error(owner + ' の化学式を解釈できない: ' + text);
    }
    if (!EQUATION_ELEMENTS.has(el)) throw new Error(owner + ' の化学式に未知の元素: ' + el + '（' + text + '）');
    const m = /^\d+/.exec(text.slice(i));
    const count = m ? parseInt(m[0], 10) : 1;
    if (!(count > 0)) throw new Error(owner + ' の元素数が不正: ' + text);
    if (m) i += m[0].length;
    counts[el] = (counts[el] || 0) + count;
  }
  return counts;
}

const R_LABEL_RE = /^R(?:\d+|′)?$/;

// species.json の atoms / bonds を、class-map.json と同じ規則で描画specへ展開する。
function resolveSpeciesStructure(raw, owner) {
  if (!raw || !Array.isArray(raw.atoms) || !raw.atoms.length) {
    throw new Error(owner + ' の構造に原子がない');
  }
  if (!Array.isArray(raw.bonds)) throw new Error(owner + ' の構造に結合がない');
  const atoms = raw.atoms.map((a, index) => {
    if (!Array.isArray(a) || a.length < 4) throw new Error(owner + ' の原子が不正: #' + index);
    const el = a[0];
    const x = a[1];
    const y = a[2];
    const h = a[3] || 0;
    const label = a[4] || '';
    if (typeof el !== 'string' || !el) throw new Error(owner + ' の元素が不正: #' + index);
    if (!isFinite(x) || !isFinite(y)) throw new Error(owner + ' の座標が不正: #' + index);
    if (!(h >= 0 && h <= 4)) throw new Error(owner + ' の水素数が不正: #' + index);
    return {
      el: el,
      x: x,
      y: y,
      h: h,
      label: label,
      charge: a[6] || '',
      skipValence: R_LABEL_RE.test(label) || !!a[5]
    };
  });
  const bonds = raw.bonds.map((b, index) => {
    if (!Array.isArray(b) || b.length < 2) throw new Error(owner + ' の結合が不正: #' + index);
    const a = b[0];
    const c = b[1];
    const order = b.length > 2 ? b[2] : 1;
    if (!Number.isInteger(a) || !Number.isInteger(c) || a < 0 || c < 0 ||
      a >= atoms.length || c >= atoms.length || a === c) {
      throw new Error(owner + ' の結合の原子番号が不正: #' + index);
    }
    if ([1, 2, 3].indexOf(order) === -1) throw new Error(owner + ' の結合次数が不正: #' + index);
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

// 反応式にだけ使う無機speciesの正本。427物質（compounds）には加えない。
function loadSpecies() {
  const doc = readJson(SPECIES_PATH);
  if (doc.version !== 1) throw new Error('species.json の版が未対応: ' + doc.version);
  if (!doc.species || typeof doc.species !== 'object') throw new Error('species.json に species がない');
  const out = new Map();
  for (const id of Object.keys(doc.species)) {
    const s = doc.species[id];
    if (!s || !s.name || !s.formula) throw new Error('species.json の情報が不足: ' + id);
    const charge = s.charge == null ? 0 : s.charge;
    if (!Number.isInteger(charge)) throw new Error('species.json の電荷が不正: ' + id);
    parseFormula(s.formula, '無機species ' + id);
    out.set(id, {
      id: id,
      name: s.name,
      formula: s.formula,
      charge: charge,
      structure: resolveSpeciesStructure(s.structure, '無機species ' + id)
    });
  }
  if (!out.size) throw new Error('species.json に無機speciesがない');
  return out;
}

function equationText(value, owner) {
  if (value == null) return '';
  const text = String(value).trim();
  if (text.length > 120) throw new Error(owner + ' が長すぎる（120文字まで）');
  return text;
}

function equationCoef(value, mode, owner, options) {
  const opts = options || {};
  if (mode === 'P') {
    const symbols = opts.polymerSymbols || DEFAULT_POLYMER_SYMBOLS;
    const maxCoef = opts.maxPolymerInteger == null ? 9 : opts.maxPolymerInteger;
    if (typeof value === 'string' && symbols.indexOf(value) !== -1) return value;
    if (Number.isInteger(value) && value >= 1 && value <= maxCoef) return value;
    const allowed = symbols.join(' / ');
    throw new Error(owner + ' の係数が不正（P は ' + allowed + ' / 1〜' + maxCoef + '）: ' + value);
  }
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(owner + ' の係数が不正（1〜9の整数）: ' + value);
  }
  return value;
}

function resolveEquationItems(items, side, ctx, mode, options) {
  if (!Array.isArray(items) || !items.length) throw new Error(ctx.owner + ' の式に' + side + 'がない');
  return items.map((item, index) => {
    const at = ctx.owner + ' の' + side + '#' + (index + 1);
    if (!item || typeof item !== 'object') throw new Error(at + ' の項目が不正');
    const keys = ['compound', 'species', 'text'].filter((key) => item[key] != null);
    if (keys.length !== 1) throw new Error(at + ' は compound / species / text のどれか1つだけを持つ');
    const coef = equationCoef(item.coef == null ? 1 : item.coef, mode, at, options);
    if (keys[0] === 'text') {
      const textAllowed = mode === 'T' || (mode === 'P' && options && options.allowTextInPolymer);
      if (!textAllowed) throw new Error(at + ' の text は構造変換図（T）だけで使う');
      const text = equationText(item.text, at + ' の text');
      if (!text) throw new Error(at + ' の text が空');
      return { kind: 'text', text: text, coef: coef };
    }
    if (keys[0] === 'compound') {
      const id = item.compound;
      if (!ctx.compounds.has(id)) throw new Error(at + ' の物質IDが未収録: ' + id);
      const c = ctx.compounds.get(id);
      if (!c.formula) throw new Error(at + ' の物質に化学式がない: ' + id);
      return { kind: 'compound', id: id, coef: coef, formula: c.formula, label: c.label || '' };
    }
    const id = item.species;
    if (!ctx.species.has(id)) throw new Error(at + ' の無機speciesが未定義: ' + id);
    const s = ctx.species.get(id);
    return { kind: 'species', id: id, coef: coef, formula: s.formula, charge: s.charge, label: s.name };
  });
}

function equationSums(items) {
  const elements = {};
  let charge = 0;
  items.forEach((item) => {
    if (item.kind === 'text') throw new Error('text 項目は元素収支の対象外');
    if (typeof item.coef !== 'number') throw new Error('係数 ' + item.coef + ' は元素収支の対象外');
    const counts = parseFormula(item.formula, item.label || item.id);
    Object.keys(counts).forEach((el) => {
      elements[el] = (elements[el] || 0) + counts[el] * item.coef;
    });
    charge += (item.charge || 0) * item.coef;
  });
  return { elements: elements, charge: charge };
}

function checkEquationBalance(owner, left, right) {
  const a = equationSums(left);
  const b = equationSums(right);
  const names = Object.keys(a.elements).concat(Object.keys(b.elements))
    .filter((el, i, arr) => arr.indexOf(el) === i).sort();
  names.forEach((el) => {
    if ((a.elements[el] || 0) !== (b.elements[el] || 0)) {
      throw new Error(owner + ' の元素収支が合わない: ' + el +
        ' 左' + (a.elements[el] || 0) + ' / 右' + (b.elements[el] || 0));
    }
  });
  if (a.charge !== b.charge) {
    throw new Error(owner + ' の電荷収支が合わない: 左' + a.charge + ' / 右' + b.charge);
  }
}

/*
 * reactions.json の equation を公開データへ投影する。
 * B / N は元素と電荷の収支が合わなければビルドを止める（fail-closed）。
 * T / P は収支を主張しない代わりに、mode に対応する表示名を必ず持つ。
 */
function projectEquation(raw, reaction, ctx, options) {
  if (!raw) return null;
  const opts = options || {};
  const owner = '反応 ' + reaction.id + ' の反応式';
  const mode = raw.mode;
  if (EQUATION_MODES.indexOf(mode) === -1) throw new Error(owner + ' のmodeが不正: ' + mode);
  const arrow = raw.arrow || 'to';
  if (arrow !== 'to' && arrow !== 'equilibrium') throw new Error(owner + ' の矢印が不正: ' + arrow);
  if (mode === 'P' && arrow !== 'to') throw new Error(owner + ' の重合模式式は矢印 to だけを使う');
  const above = equationText(raw.above, owner + ' のabove');
  const below = equationText(raw.below, owner + ' のbelow');
  const title = equationText(raw.title, owner + ' のtitle');
  const explanation = equationText(raw.explanation, owner + ' のexplanation');
  if (mode === 'P' && opts.polymerNoteRequired && !explanation) {
    throw new Error(owner + ' の重合模式式に説明（未定量であることの注記）がない');
  }
  if (raw.variantKind != null) {
    if (POLYMER_VARIANT_KINDS.indexOf(raw.variantKind) === -1) {
      throw new Error(owner + ' のvariantKindが不正: ' + raw.variantKind);
    }
    if (!Array.isArray(raw.variants) || !raw.variants.length) {
      throw new Error(owner + ' のvariantKindにはvariantsが必要');
    }
  }
  const sources = (raw.verification || []).map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error(owner + ' の資料の形式が不正');
    return publicSource(entry);
  });
  const local = { owner: owner, compounds: ctx.compounds, species: ctx.species };

  let variants = [];
  if (raw.variants != null) {
    if (!Array.isArray(raw.variants) || !raw.variants.length) {
      throw new Error(owner + ' のvariantsが空');
    }
    if (mode !== 'T') throw new Error(owner + ' のvariantsは構造変換図（T）だけで使う');
    variants = raw.variants.map((v, i) => {
      const vOwner = owner + ' の代替' + (i + 1);
      const vArrow = v.arrow || 'equilibrium';
      if (vArrow !== 'to' && vArrow !== 'equilibrium') throw new Error(vOwner + ' の矢印が不正: ' + vArrow);
      const vCtx = { owner: vOwner, compounds: ctx.compounds, species: ctx.species };
      return {
        label: equationText(v.label, vOwner + ' のlabel'),
        arrow: vArrow,
        left: resolveEquationItems(v.left, '左辺', vCtx, 'T', opts),
        right: resolveEquationItems(v.right, '右辺', vCtx, 'T', opts)
      };
    });
  }

  let left = [];
  let right = [];
  if (!variants.length) {
    left = resolveEquationItems(raw.left, '左辺', local, mode, opts);
    right = resolveEquationItems(raw.right, '右辺', local, mode, opts);
    if (mode === 'B' || mode === 'N') checkEquationBalance(owner, left, right);
    if (mode === 'P') {
      const hasN = left.concat(right).some((item) => typeof item.coef === 'string');
      if (!hasN) throw new Error(owner + ' の重合模式式に n の係数がない');
      if (opts.polymerUnitCoefOne) {
        // 繰り返し単位の本体（高分子・単量体）の外側係数は 1。副生成物の species だけ
        // 2n / dn などの整数倍を許す。
        left.concat(right).forEach((item) => {
          if (item.kind !== 'species' && item.kind !== 'text' && Number.isInteger(item.coef) && item.coef !== 1) {
            throw new Error(owner + ' の重合模式式で反復単位本体の係数が 1 でない: ' + item.id + ' × ' + item.coef);
          }
        });
      }
    }
  }

  const projected = {
    mode: mode,
    modeLabel: EQUATION_MODE_LABELS[mode],
    title: title,
    arrow: arrow,
    above: above,
    below: below,
    explanation: explanation,
    sources: sources,
    left: left,
    right: right,
    variants: variants
  };
  // 既存 86 反応の出力を変えないため、指定があるときだけ追加する。
  if (raw.variantKind != null) projected.variantKind = raw.variantKind;
  return projected;
}

// 通常反応へ大学レベルの式を移す場合の検証オプション。legacyAcademicId または
// educationLevel を持つ（新規に追加した）反応だけ広い係数記号を許し、既存 86 反応は
// 従来の検証のままにする。
function equationOptionsFor(reaction) {
  if (!reaction || (!reaction.legacyAcademicId && !reaction.educationLevel)) return undefined;
  return {
    polymerSymbols: ACADEMIC_POLYMER_SYMBOLS,
    maxPolymerInteger: 99,
    polymerNoteRequired: true,
    polymerUnitCoefOne: true,
    allowTextInPolymer: true
  };
}

// 通常反応の教育メタデータ。既存 86 反応は未指定のまま（出力に項目を足さない）。
function projectEducationFields(raw, owner) {
  const keys = ['educationLevel', 'evidenceKind', 'scope', 'stepKind', 'steps',
    'legacyAcademicId', 'coverageIds', 'layoutGroup', 'history'];
  const present = keys.filter((key) => raw[key] != null);
  if (!present.length) return null;
  const out = {};
  if (raw.educationLevel != null) {
    if (EDUCATION_LEVELS.indexOf(raw.educationLevel) === -1) {
      throw new Error(owner + ' のeducationLevelが不正: ' + raw.educationLevel);
    }
    out.educationLevel = raw.educationLevel;
  }
  if (raw.evidenceKind != null) {
    if (EVIDENCE_KINDS.indexOf(raw.evidenceKind) === -1) {
      throw new Error(owner + ' のevidenceKindが不正: ' + raw.evidenceKind);
    }
    out.evidenceKind = raw.evidenceKind;
  }
  if (raw.scope != null) {
    const scope = String(raw.scope).trim();
    if (!scope) throw new Error(owner + ' のscopeが空');
    out.scope = scope;
  }
  if (raw.stepKind != null) {
    if (STEP_KINDS.indexOf(raw.stepKind) === -1) {
      throw new Error(owner + ' のstepKindが不正: ' + raw.stepKind);
    }
    out.stepKind = raw.stepKind;
  }
  if (raw.steps != null) {
    if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.some((s) => !String(s || '').trim())) {
      throw new Error(owner + ' のstepsが不正');
    }
    out.steps = raw.steps.map((s) => String(s).trim());
  }
  if (out.stepKind === 'multi-step' && !out.steps) {
    throw new Error(owner + ' の多段階にstepsがない');
  }
  if (raw.legacyAcademicId != null) {
    const legacy = String(raw.legacyAcademicId);
    if (!/^academic-[a-z0-9][a-z0-9-]*$/.test(legacy)) {
      throw new Error(owner + ' のlegacyAcademicIdが不正: ' + legacy);
    }
    out.legacyAcademicId = legacy;
  }
  if (raw.coverageIds != null) {
    if (!Array.isArray(raw.coverageIds) || !raw.coverageIds.length ||
      raw.coverageIds.some((id) => !String(id || '').trim())) {
      throw new Error(owner + ' のcoverageIdsが不正');
    }
    out.coverageIds = raw.coverageIds.map((id) => String(id));
  }
  if (raw.layoutGroup != null) {
    const group = String(raw.layoutGroup).trim();
    if (!group) throw new Error(owner + ' のlayoutGroupが空');
    out.layoutGroup = group;
  }
  if (raw.history != null) {
    if (!Array.isArray(raw.history) || !raw.history.length ||
      raw.history.some((h) => !h || typeof h !== 'object' || !String(h.kind || '').trim())) {
      throw new Error(owner + ' のhistoryが不正（kindを持つオブジェクトの配列）');
    }
    out.history = raw.history.map((h) => Object.assign({}, h));
  }
  return out;
}

function loadSource() {
  const map = readJson(path.join(SRC, 'map.json'));
  const reactionSource = readJson(path.join(SRC, 'reactions.json'));
  const priorityDoc = readJson(path.join(SRC, 'route-priority.json'));
  const species = loadSpecies();
  const { D, C } = loadApp10();

  const regionById = new Map(map.regions.map((r) => [r.id, r]));
  const categoryOrder = Object.keys(map.categoryRegions);

  const compoundOrder = Object.keys(D.COMPOUNDS).sort((a, b) => {
    const ca = D.COMPOUNDS[a].category;
    const cb = D.COMPOUNDS[b].category;
    const ra = categoryOrder.indexOf(ca);
    const rb = categoryOrder.indexOf(cb);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const compounds = new Map();
  for (const id of compoundOrder) {
    const c = D.COMPOUNDS[id];
    const region = map.regionOverrides[id] || map.categoryRegions[c.category] || null;
    if (!region || !regionById.has(region)) {
      throw new Error('物質 ' + id + ' の分野が決まらない（category=' + c.category + '）');
    }
    const route = C.routeFor(id) || null;
    const structure = structureFields(c);
    compounds.set(id, {
      id,
      name: c.name,
      label: shortLabel(c.name),
      formula: c.formula || '',
      ...structure,
      category: c.category,
      region,
      recordState: c.verified ? 'confirmed' : 'unverified',
      curriculum: D.REQUIRED_CURRICULUM.indexOf(id) !== -1,
      hub: map.hubs.indexOf(id) !== -1,
      builder: { href: builderHref(route), route: route ? route.mode : null },
      raw: c
    });
  }

  const types = {};
  for (const key of Object.keys(reactionSource.types)) {
    const t = reactionSource.types[key];
    types[key] = { label: t.label, summary: t.summary, schematic: t.schematic, count: 0 };
  }

  // 無機speciesは反応式専用。427物質と同じIDを持つと表示の解決先が曖昧になるため許さない。
  for (const id of species.keys()) {
    if (compounds.has(id)) throw new Error('無機speciesのIDが物質と重複: ' + id);
  }

  const reactions = [];
  const heldReactions = [];
  const usedSections = new Set();
  const seenIds = new Set();
  for (const r of reactionSource.reactions) {
    if (seenIds.has(r.id)) throw new Error('反応IDが重複: ' + r.id);
    seenIds.add(r.id);
    if (!types[r.type]) throw new Error('未定義の反応種別: ' + r.type + '（反応 ' + r.id + '）');
    const education = projectEducationFields(r, '反応 ' + r.id);
    const subs = r.substrates || [];
    const prods = r.products || [];
    if (!subs.length) throw new Error('基質がない反応: ' + r.id);
    for (const id of subs.concat(prods)) {
      if (!compounds.has(id)) throw new Error('未収録の物質ID: ' + id + '（反応 ' + r.id + '）');
    }
    const state = r.state || reactionSource.defaultState || 'unverified';
    if (state !== 'confirmed') {
      if (r.equation) throw new Error('保留反応に反応式が付いている: ' + r.id);
      heldReactions.push({ id: r.id, type: r.type, state });
      continue;
    }
    if (!Array.isArray(r.verification) || !r.verification.length) {
      throw new Error('確認済みの反応に検証記録がない: ' + r.id);
    }
    const subRegions = new Set(subs.map((id) => compounds.get(id).region));
    const prodRegions = new Set(prods.map((id) => compounds.get(id).region));
    const all = new Set([...subRegions, ...prodRegions]);
    const equation = projectEquation(r.equation, r, { compounds, species }, equationOptionsFor(r));
    reactions.push(Object.assign({
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
      sources: (r.verification || []).map(publicSource),
      cross: all.size > 1,
      regions: [...all].sort(),
      equation: equation
    }, education || {}));
    types[r.type].count += 1;
    (r.verification || []).forEach((entry) => { if (entry.section) usedSections.add(entry.section); });
  }

  const required = D.REQUIRED_CURRICULUM.filter((id, i, arr) => arr.indexOf(id) === i);

  const priority = validatePriority(priorityDoc, reactions, heldReactions);

  return {
    map,
    regionById,
    reactionSource,
    types,
    compounds,
    compoundOrder,
    species,
    reactions,
    heldReactions,
    usedSections,
    required,
    priority,
    priorityHash: digestPriority(reactions, priority.entries),
    source: {
      verifiedAt: reactionSource.verifiedAt || '',
      sourceBook: 'OpenStax Organic Chemistry (McMurry)'
    }
  };
}

// route-priority.json は公開86反応の全件を明示する正本。未設定・未知ID・保留反応の混入を許さない。
function validatePriority(doc, reactions, heldReactions) {
  if (!doc || doc.version !== 1 || typeof doc.reactions !== 'object') {
    throw new Error('route-priority.json の形式が想定と違う（version=1 と reactions が必要）');
  }
  const entries = doc.reactions;
  const confirmedIds = new Set(reactions.map((r) => r.id));
  const heldIds = new Set(heldReactions.map((r) => r.id));
  const missing = [...confirmedIds].filter((id) => !entries[id]).sort();
  if (missing.length) throw new Error('priority 未設定の確認済反応: ' + missing.join(', '));
  for (const id of Object.keys(entries)) {
    if (heldIds.has(id)) throw new Error('保留反応に priority が付いている: ' + id);
    if (!confirmedIds.has(id)) throw new Error('未確認または未知の反応IDに priority が付いている: ' + id);
    const entry = entries[id];
    if (entry.tier !== 'primary' && entry.tier !== 'secondary') {
      throw new Error('priority の tier が不正: ' + id + '（' + entry.tier + '）');
    }
    if (!entry.topic) throw new Error('priority の topic がない: ' + id);
    if (!entry.reason) throw new Error('priority の reason がない: ' + id);
    if (entry.importanceStatus !== 'editorial-candidate') {
      throw new Error('priority の importanceStatus が editorial-candidate でない: ' + id);
    }
  }
  const byId = new Map(Object.keys(entries).sort().map((id) => [id, entries[id]]));
  return { version: doc.version, updated: doc.updated || '', entries: byId, doc };
}

// embed-primary.py と同じ行形式。改行コードは LF 固定。
function digestPriority(reactions, entries) {
  const lines = [];
  const confirmed = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of confirmed) {
    lines.push('R|' + [
      r.id,
      r.type,
      r.state || 'confirmed',
      r.substrates.join(','),
      r.products.join(',')
    ].join('|'));
  }
  for (const [id, entry] of entries) {
    lines.push('P|' + [id, entry.tier, entry.topic || ''].join('|'));
  }
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

module.exports = {
  ROOT,
  SRC,
  LABEL_MAX,
  EQUATION_MODES,
  EQUATION_MODE_LABELS,
  DEFAULT_POLYMER_SYMBOLS,
  ACADEMIC_POLYMER_SYMBOLS,
  POLYMER_VARIANT_KINDS,
  EDUCATION_LEVELS,
  EVIDENCE_KINDS,
  STEP_KINDS,
  readJson,
  shortLabel,
  builderHref,
  publicSource,
  loadSource,
  loadApp10,
  loadSpecies,
  parseFormula,
  projectEquation,
  equationOptionsFor,
  projectEducationFields,
  checkEquationBalance,
  validatePriority,
  digestPriority
};
