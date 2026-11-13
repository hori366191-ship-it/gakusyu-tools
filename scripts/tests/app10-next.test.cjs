/**
 * 有機化学ビルダー（本番 site/app10・NEXT版）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app10-next.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。本番 site/app10 の data.js / draw.js /
 * catalog.js / index-manifest.js / index-audit.js を Node で読み込み、新版の
 * 分類・総炭素数・級・異性体・索引監査・配線を静的に確認する。docs は
 * design-lab/app10-next に分離し、本番16ファイルとの一致も確認する。
 * 実際のクリック操作は test サブエージェントが担当する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app10');
const NEXT = path.join(ROOT, 'design-lab', 'app10-next');

// 本番として配信する16ファイル（順序はindex.htmlの読込順を含む）
const PRODUCTION_FILES = [
  'index.html', 'app.css', 'data.js', 'draw.js', 'chain-descriptor.js',
  'catalog.js', 'motion.js', 'app.js', 'favicon.svg', 'ledger.html',
  'ledger.js', 'external-coverage.js', 'index-manifest.js', 'index-audit.js',
  'independent-audit.js', 'ocr-audit.js'
];

const D = require(path.join(APP, 'data.js'));
const R = require(path.join(APP, 'draw.js'));
const X = require(path.join(APP, 'chain-descriptor.js'));
const C = require(path.join(APP, 'catalog.js'));
const E = require(path.join(APP, 'external-coverage.js'));
const M = require(path.join(APP, 'index-manifest.js'));
const A = require(path.join(APP, 'index-audit.js'));
const IA = require(path.join(APP, 'independent-audit.js'));
const OA = require(path.join(APP, 'ocr-audit.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function readNext(name) {
  return fs.readFileSync(path.join(NEXT, name), 'utf8');
}

// design-lab の相対パスを本番 site/app10 の相対パスへ正規化する。
function normalizeToProduction(html) {
  return html
    .split('../../site/themes/').join('../themes/')
    .split('../../site/app11/').join('../app11/')
    .split('../../site/credits.html').join('../credits.html');
}

function structureSignature(spec) {
  if (!spec) return null;
  function graphSignature(s) {
    const g = R.buildStructure(s);
    const atoms = g.atoms.map((a) => `${a.el}:${a.h}:${a.charge || ''}`).sort();
    const bonds = g.bonds.map((b) => {
      const lo = Math.min(b.a, b.b);
      const hi = Math.max(b.a, b.b);
      return `${lo}-${hi}:${b.order}`;
    }).sort();
    return atoms.join('|') + '#' + bonds.join('|');
  }
  if (['skeleton', 'sub', 'multi', 'custom'].includes(spec.type)) return 'graph:' + graphSignature(spec);
  if (spec.type === 'ring-sub') return 'ring:' + (spec.subs || []).map((s) => s.at + ':' + s.label).sort().join('|');
  if (spec.type === 'condensed') return 'condensed:' + (spec.lines || []).join('|');
  if (spec.type === 'projection') return 'projection:' + spec.kind + ':' + spec.sugar + ':' + (spec.anomer || '');
  if (spec.type === 'polymer') return 'polymer:' + spec.unit;
  if (spec.type === 'schematic') return 'schematic:' + spec.kind;
  return JSON.stringify(spec);
}

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const EL = ['Cl', 'Br', 'Na', 'Ca', 'Pb', 'Ag', 'Cu', 'Fe', 'Mg', 'Zn', 'Al', 'Ba', 'Li', 'Sn', 'Si', 'C', 'H', 'O', 'N', 'S', 'I', 'P', 'F'];
function independentCondensedFormula(line) {
  let s = String(line).replace(/[₀-₉]/g, (ch) => SUB[ch]);
  s = s.replace(/（[^）]*）/g, '').replace(/\([^A-Za-z0-9)]*\)/g, '');
  s = s.replace(/[—–\-−=≡→←⇄\s⁺⁻·・,、]/g, '');
  let i = 0;
  function parseGroup() {
    const local = {};
    while (i < s.length) {
      const ch = s[i];
      if (ch === ')') { i++; return local; }
      if (ch === '(') {
        i++;
        const inner = parseGroup();
        let num = '';
        while (/[0-9]/.test(s[i] || '')) num += s[i++];
        const mul = num ? Number(num) : 1;
        Object.keys(inner).forEach((k) => { local[k] = (local[k] || 0) + inner[k] * mul; });
        continue;
      }
      let el = null;
      for (const e of EL) {
        if (s.startsWith(e, i)) { el = e; break; }
      }
      if (!el) { i++; continue; }
      i += el.length;
      let num = '';
      while (/[0-9]/.test(s[i] || '')) num += s[i++];
      local[el] = (local[el] || 0) + (num ? Number(num) : 1);
    }
    return local;
  }
  const counts = parseGroup();
  const order = ['C', 'H', ...Object.keys(counts).filter((k) => k !== 'C' && k !== 'H').sort()];
  return order.filter((k) => counts[k]).map((k) => k + (counts[k] > 1 ? counts[k] : '')).join('');
}

function graphRingCount(spec) {
  if (!spec) return 0;
  if (spec.type === 'ring-sub') return 1;
  if (!['skeleton', 'sub', 'multi', 'custom'].includes(spec.type)) return 0;
  const g = R.buildStructure(spec);
  const adj = g.atoms.map(() => []);
  g.bonds.forEach((b) => { adj[b.a].push(b.b); adj[b.b].push(b.a); });
  let components = 0;
  const seen = g.atoms.map(() => false);
  for (let i = 0; i < adj.length; i++) {
    if (seen[i]) continue;
    components++;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const v = stack.pop();
      adj[v].forEach((w) => { if (!seen[w]) { seen[w] = true; stack.push(w); } });
    }
  }
  return g.bonds.length - g.atoms.length + components;
}

const PRESERVED_46 = [
  '1,2-dibromoethane', '1,2-dibromoethene', '1,1,2,2-tetrabromoethane', 'bromoethene',
  'hexachlorocyclohexane', 'cumene-hydroperoxide', 'sodium-methoxide', 'sodium-ethoxide',
  'sodium-benzoate', 'sodium-salicylate', 'p-dichlorobenzene', 'o-nitrophenol',
  'p-nitrophenol', 'terephthaloyl-chloride', 'anthracene', 'cyclohexene', 'pentan-3-one',
  'malic-acid', 'isomaltose', 'lauric-acid', 'myristic-acid', 'arachidonic-acid',
  'eicosapentaenoic-acid', 'docosahexaenoic-acid', 'lead-ii-acetate', 'calcium-acetate',
  'atp', 'silver-acetylide', 'copper-i-acetylide', 'pent-1-ene', 'pent-2-ene',
  'pent-1-yne', 'pent-2-yne', 'atpase', 'zymase', 'maltase', 'sucrase', 'trypsin',
  'protease', 'lipase', 'catalase', 'lactase', 'erepsin', 'urease', 'helicase',
  'chlorocyclohexane'
];

const REQUIRED_26 = [
  '1,2-dibromoethane', '1,2-dibromoethene', '1,1,2,2-tetrabromoethane', 'p-dichlorobenzene',
  'hexachlorocyclohexane', 'cumene-hydroperoxide', 'sodium-methoxide', 'sodium-ethoxide',
  'sodium-benzoate', 'sodium-salicylate', 'terephthaloyl-chloride', 'anthracene',
  'cyclohexene', 'pentan-3-one', 'o-nitrophenol', 'p-nitrophenol', 'malic-acid',
  'isomaltose', 'lauric-acid', 'myristic-acid', 'arachidonic-acid', 'eicosapentaenoic-acid',
  'docosahexaenoic-acid', 'lead-ii-acetate', 'calcium-acetate', 'atp'
];

/* ------------------------------------------------------------------
 * データ
 * ------------------------------------------------------------------ */

test('[data] app10-nextの19分野・全化合物の必須項目と出典', () => {
  assert.equal(D.CATEGORIES.length, 19);
  const catIds = new Set(D.CATEGORIES.map((c) => c.id));
  assert.equal(catIds.size, 19);
  const ids = Object.keys(D.COMPOUNDS);
  assert.ok(ids.length >= 427, '収録化合物が少なすぎます: ' + ids.length);
  for (const id of ids) {
    const c = D.COMPOUNDS[id];
    assert.equal(c.id, id);
    assert.ok(c.name && c.name.length > 0, id + ' の名称がありません');
    assert.ok(c.formula && c.formula.length > 0, id + ' の分子式がありません');
    assert.ok(catIds.has(c.category), id + ' の分類が19分野にありません: ' + c.category);
    assert.ok(c.structure || (c.figures && c.figures.length), id + ' の構造データがありません');
    assert.ok(Array.isArray(c.sources), id + ' の出典配列がありません');
    for (const sid of c.sources) assert.ok(D.SOURCES[sid], id + ' の出典IDが不正: ' + sid);
  }
});

test('[data] 全化合物が分子式・結合価検証に合格する', () => {
  for (const id of Object.keys(D.COMPOUNDS)) {
    const c = D.COMPOUNDS[id];
    const v = R.validate(c);
    assert.equal(v.ok, true, id + ': ' + v.errors.join(' / '));
    if (v.formulaStatus === 'variable' && !v.computed) {
      assert.ok(c.formulaDisplay, id + ' の可変組成の表示式がありません');
    } else {
      assert.ok(v.computed, id + ' の計算分子式がありません');
    }
  }
});

test('[data] 簡略式は独立パーサでも分子式と一致する', () => {
  let checked = 0;
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    if (!c.structure || c.structure.type !== 'condensed') continue;
    checked++;
    const parsed = independentCondensedFormula((c.structure.lines || []).join(''));
    assert.equal(parsed, c.formula, id + ' の簡略式 ' + (c.structure.lines || []).join(' / ') + ' は ' + parsed + ' だが登録は ' + c.formula);
  }
  assert.ok(checked >= 140, '簡略式の確認件数が少なすぎます: ' + checked);
});

test('[data] 同一構造の重複がない', () => {
  const seen = new Map();
  for (const id of Object.keys(D.COMPOUNDS)) {
    const c = D.COMPOUNDS[id];
    const sig = structureSignature(c.structure);
    assert.ok(sig, id + ' の構造シグネチャがありません');
    assert.equal(seen.has(sig), false, id + ' は ' + seen.get(sig) + ' と同じ構造です');
    seen.set(sig, id);
  }
});

test('[data] 保全46物質と必須26物質が全レコード到達可能', () => {
  for (const id of PRESERVED_46) {
    const c = D.COMPOUNDS[id];
    assert.ok(c, '保全対象がない: ' + id);
    assert.ok(c.structure, id + ' の構造がない');
    assert.ok(c.formula, id + ' の式がない');
    assert.ok(c.properties && c.nature, id + ' の説明がない');
    assert.ok((c.sourceEvidence || []).length > 0, id + ' の sourceEvidence がない');
    assert.ok(C.routeFor(id), id + ' の検索経路がない');
  }
  for (const id of REQUIRED_26) {
    const c = D.COMPOUNDS[id];
    assert.ok(c, '必須物質がない: ' + id);
    assert.ok(c.structure, id + ' の構造がない');
    assert.ok(c.formula, id + ' の式がない');
    assert.ok(c.properties && c.nature, id + ' の説明がない');
    assert.ok(Array.isArray(c.sources) && c.sources.length > 0, id + ' の出典がない');
    assert.ok((c.sourceEvidence || []).length > 0, id + ' の出典記録がない');
    for (const ev of c.sourceEvidence) {
      assert.match(ev.source || '', /^(?:s\d+|idx-(?:tryit|kimika)|textbook|mext|pubchem|nist|iupac|csj)$/, id + ' のsource IDが不正: ' + ev.source);
      assert.equal(ev.url, undefined, id + ' に教材URLが残る');
      assert.equal(ev.quote, undefined, id + ' に本文抜粋が残る');
      assert.ok(ev.section, id + ' の節がない');
      assert.ok(ev.note, id + ' の独自補足がない');
    }
    assert.ok(C.routeFor(id), id + ' の検索経路がない');
  }
  assert.equal(D.COMPOUNDS['silver-acetylide'].formula, 'C2Ag2');
  assert.equal(D.COMPOUNDS['copper-i-acetylide'].formula, 'C2Cu2');
});

test('[data] C2/C3アミンの級と必要条件', () => {
  assert.deepEqual(C.chainIds('amine', 2).sort(), ['dimethylamine', 'ethylamine']);
  assert.deepEqual(C.chainIds('amine', 3).sort(), ['ethylmethylamine', 'isopropylamine', 'propylamine', 'trimethylamine']);
  assert.equal(C.AMINE_DEGREE.ethylamine, 1);
  assert.equal(C.AMINE_DEGREE.dimethylamine, 2);
  assert.equal(C.AMINE_DEGREE.ethylmethylamine, 2);
  assert.equal(C.AMINE_DEGREE.trimethylamine, 3);
  assert.equal(C.AMINE_DEGREE.propylamine, 1);
  assert.equal(C.AMINE_DEGREE.isopropylamine, 1);
  assert.deepEqual(C.chainIds('amine', 2).filter((id) => C.AMINE_DEGREE[id] === 3), []);
});

test('[data] エーテル・アルコール・カルボン酸・エステル等の総炭素数', () => {
  assert.deepEqual(C.chainIds('ether', 2), ['dimethyl-ether']);
  assert.deepEqual(C.chainIds('ether', 3), ['methoxyethane']);
  assert.deepEqual(C.chainIds('ether', 4).sort(), ['1-methoxypropane', '2-methoxypropane', 'diethyl-ether']);
  assert.ok(C.chainIds('alcohol', 2).includes('ethanol'));
  assert.ok(C.chainIds('alcohol', 3).includes('propan-1-ol'));
  assert.ok(C.chainIds('alcohol', 3).includes('propan-2-ol'));
  assert.ok(C.chainIds('carboxylic', 2).includes('acetic-acid'));
  assert.ok(C.chainIds('carboxylic', 3).includes('lactic-acid'));
  assert.ok(C.chainIds('carboxylic', 4).includes('butanoic-acid'));
  assert.ok(C.chainIds('ester', 2).includes('methyl-formate'));
  assert.ok(C.chainIds('ester', 3).includes('methyl-acetate'));
  assert.ok(C.chainIds('aldehyde', 1).includes('formaldehyde'));
  assert.ok(C.chainIds('aldehyde', 2).includes('ethanal'));
  assert.ok(C.chainIds('ketone', 3).includes('acetone'));
  assert.ok(C.chainIds('nitrile', 2).includes('acetonitrile'));
  assert.ok(C.chainIds('halogen', 2).includes('bromoethane'));
  assert.ok(C.chainIds('halogen', 2).includes('chloroethane'));
  assert.equal(C.carbonCount(D.COMPOUNDS['lauric-acid']), 12);
  assert.equal(C.carbonCount(D.COMPOUNDS['acetic-acid']), 2);
  assert.equal(C.carbonCount(D.COMPOUNDS['pyruvic-acid']), 3);
});

test('[data] 構造条件（飽和/不飽和/すべて）とC=Oの誤判定防止', () => {
  assert.deepEqual(C.chainIdsFor('alcohol', 3, 'saturated').sort(), ['propan-1-ol', 'propan-2-ol']);
  assert.deepEqual(C.chainIdsFor('alcohol', 3, 'unsaturated').sort(), ['allyl-alcohol', 'prop-1-en-1-ol', 'prop-1-en-2-ol']);
  assert.equal(C.chainIdsFor('alcohol', 3, 'all').length, 5);
  assert.deepEqual(C.chainIdsFor('polyol', 3, 'saturated').sort(), ['glycerol', 'propylene-glycol']);
  assert.deepEqual(C.chainIdsFor('polyol', 3, 'all').sort(), ['glycerol', 'propylene-glycol']);
  assert.equal(C.chainIdsFor('polyol', 3, 'unsaturated').length, 0);
  assert.equal(C.classify('glycerol').family, 'polyol');
  assert.equal(C.classify('ethylene-glycol').family, 'polyol');
  assert.equal(C.structureCondition('glycerol'), 'saturated', '多価アルコールを不飽和扱いしない');
  assert.equal(C.structureCondition('propylene-glycol'), 'saturated');
  assert.equal(C.chainIdsFor('alcohol', 2, 'saturated').includes('ethylene-glycol'), false, '一価アルコールに多価を混ぜない');
  assert.equal(C.chainIdsFor('alkene', 3, 'saturated').length, 0);
  assert.ok(C.chainIdsFor('alkene', 3, 'unsaturated').includes('propene'));
  assert.equal(C.chainIdsFor('alkane', 3, 'unsaturated').length, 0);
  for (const id of ['acetone', 'acetaldehyde', 'acetic-acid', 'methyl-acetate', 'acetonitrile', 'acetamide'].filter((x) => D.COMPOUNDS[x])) {
    assert.equal(C.structureCondition(id), 'saturated', id + ' のC=O/C≡NをC-C不飽和と誤判定');
  }
  for (const id of ['propene', 'propyne', 'but-1-yne', 'pent-1-ene', 'pent-1-yne', 'allyl-alcohol']) {
    assert.equal(C.structureCondition(id), 'unsaturated', id + ' を不飽和と判定できない');
  }
  assert.equal(C.classify('ethanolamine').family, 'amino-alcohol');
  assert.ok(!C.chainIdsFor('amine', 2, 'all').includes('ethanolamine'));
  assert.equal(C.chainIdsFor('amino-alcohol', 2, 'all').includes('ethanolamine'), true);
  assert.notEqual(C.classify('acetanilide').family, 'amine', 'アミドを単純アミンに混ぜない');
  assert.notEqual(C.classify('urea').family, 'amine', '尿素を単純アミンに混ぜない');
  assert.equal(C.routeFor('propan-1-ol').structure, 'saturated');
  assert.equal(C.routeFor('glycerol').structure, 'saturated');
  assert.equal(C.routeFor('ethanolamine').structure, 'all');
  assert.equal(C.routeFor('pent-1-ene').structure, 'unsaturated');
});

test('[data] 官能基異性体を同じfamilyに混ぜない', () => {
  assert.ok(!C.chainIds('alcohol', 2).includes('dimethyl-ether'));
  assert.ok(!C.chainIds('ether', 2).includes('ethanol'));
  assert.ok(!C.chainIds('carboxylic', 2).includes('methyl-formate'));
  assert.ok(!C.chainIds('ester', 2).includes('acetic-acid'));
  assert.ok(!C.chainIds('amine', 2).includes('acetonitrile'));
  assert.ok(!C.chainIds('nitrile', 2).includes('ethylamine'));
  assert.equal(C.classify('ethanol').mode, 'chain');
  assert.equal(C.classify('dimethyl-ether').mode, 'chain');
  assert.equal(C.classify('acetic-acid').family, 'carboxylic');
  assert.equal(C.classify('methyl-formate').family, 'ester');
});

test('[data] 全化合物がいずれかの探し方に配線され、不可視がない', () => {
  const audit = C.auditCoverage();
  assert.equal(audit.total, Object.keys(D.COMPOUNDS).length);
  assert.deepEqual(audit.missing, []);
  assert.equal(audit.modes.chain + audit.modes.ring + audit.modes.other, audit.total);
  for (const id of Object.keys(D.COMPOUNDS)) {
    assert.ok(C.routeFor(id), id + ' のrouteがない');
  }
  assert.equal(C.classify('heptane').mode, 'chain');
  assert.equal(C.classify('heptane').family, 'alkane');
  assert.equal(C.classify('heptane').carbon, 7);
  assert.equal(C.classify('pent-1-ene').family, 'alkene');
  assert.equal(C.classify('pent-1-yne').family, 'alkyne');
});

test('[data] 名前・別名・材料synonym・familyの重複がない', () => {
  const names = new Map();
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    const key = D.normalizeName(c.name);
    assert.equal(names.has(key), false, id + ' と ' + names.get(key) + ' の名称が重複');
    names.set(key, id);
  }
  const aliasKeys = new Map();
  for (const a of D.ALIASES) {
    const key = D.normalizeName(a.term);
    assert.equal(aliasKeys.has(key), false, '別名が重複: ' + a.term);
    aliasKeys.set(key, a.target);
    assert.ok(D.COMPOUNDS[a.target], a.term + ' の対応先がない');
  }
  const materialTerms = new Map();
  for (const m of D.MATERIALS) {
    assert.equal(materialTerms.has(D.normalizeName(m.id)), false, '材料IDが重複: ' + m.id);
    materialTerms.set(D.normalizeName(m.id), m.id);
    assert.ok(!(m.synonyms || []).some((s) => D.normalizeName(s) === D.normalizeName(m.name)), m.id + ' のsynonymに自己名称が残る');
    for (const term of [m.name].concat(m.synonyms || [])) {
      const key = D.normalizeName(term);
      assert.equal(materialTerms.has(key), false, '材料名が重複: ' + term);
      materialTerms.set(key, m.id);
    }
  }
  const familyNames = new Map();
  for (const f of D.FAMILIES) {
    const key = D.normalizeName(f.name);
    assert.equal(familyNames.has(key), false, 'family名が重複: ' + f.name);
    familyNames.set(key, f.id);
  }
});

test('[draw] 全化合物とfamily代表構造がSVGで描画できる', () => {
  for (const id of Object.keys(D.COMPOUNDS)) {
    const svg = R.renderCompound(D.COMPOUNDS[id]);
    assert.ok(svg.includes('<svg'), id + ' のSVGがない');
    assert.ok(!svg.includes('NaN'), id + ' のSVGにNaNがある');
    assert.ok(!svg.includes('undefined'), id + ' のSVGにundefinedがある');
    assert.ok(!svg.includes('data-error="1"'), id + ' のSVGが描画エラー');
  }
  for (const f of D.FAMILIES) {
    if (!f.structure) continue;
    const svg = R.renderStructure(f.structure, f.name);
    assert.ok(svg.includes('<svg'), f.id + ' のfamily構造SVGがない');
    assert.ok(!svg.includes('NaN'), f.id + ' のfamily構造SVGにNaNがある');
  }
  const atp = R.renderCompound(D.COMPOUNDS.atp);
  assert.ok(atp.includes('data-nucleotide="atp"'), 'ATPはヌクレオチド模式図で描画する');
  assert.ok(atp.includes('data-phosphate-chain="P-O-P-O-P"'), 'ATPはP-O-P-O-Pで接続する');
  assert.ok(atp.includes('data-phosphate-charge="4-"'), 'ATP⁴⁻の電荷を明示する');
  assert.ok(atp.includes('P—O—P—O—P'), 'ATPの説明文と図の接続が一致する');
  const hch = R.renderCompound(D.COMPOUNDS.hexachlorocyclohexane);
  assert.ok(hch.includes('data-isomer-class="hch"'), 'HCHは異性体総称の模式図で描画する');
  assert.ok(hch.includes('1,2,3,4,5,6'), 'HCHは六置換体として説明する');
  assert.ok(!hch.includes('位置・立体異性体'), 'HCHを位置異性体と誤記しない');
  const hchAudit = A.FINDINGS.filter((f) => f.ref === 'hexachlorocyclohexane')[0];
  assert.ok(hchAudit && hchAudit.supplement.includes('1,2,3,4,5,6'));
  assert.ok(!hchAudit.supplement.includes('位置・立体異性体'));
  const iso = R.renderCompound(D.COMPOUNDS.isomaltose);
  assert.ok(iso.includes('data-glycosidic="α-1,6"'), 'イソマルトースはα-1,6の二糖模式図で描画する');
  assert.ok(iso.includes('data-exocyclic-c6="1"'), 'イソマルトースはC6環外CH2を明示する');
  assert.ok(iso.includes('CH₂'), 'イソマルトースのC6環外CH2');
  // 実座標: donor C5(95,52)→CH2OH up(95,10)、donor C1(230,130)→O(230,220) down、
  // O→acceptor C6(340,220)→acceptor C5(340,268)。edge中点から枝を出さない。
  const point = (s) => s.split(',').map(Number);
  const attr = (name) => (iso.match(new RegExp('data-' + name + '="([^"]+)"')) || [])[1];
  const donorC1 = point(attr('donor-c1'));
  const donorC5 = point(attr('donor-c5'));
  const ch2oh = point(attr('donor-ch2oh'));
  const glyO = point(attr('glycosidic-o'));
  const acceptC6 = point(attr('acceptor-c6'));
  const acceptC5 = point(attr('acceptor-c5'));
  const donorC5Vertex = { x: 140 + 90 * Math.cos(4 * Math.PI / 3), y: 130 + 90 * Math.sin(4 * Math.PI / 3) };
  const acceptC5Vertex = { x: 385 + 90 * Math.cos(4 * Math.PI / 3), y: 346 + 90 * Math.sin(4 * Math.PI / 3) };
  const near = (a, b, d = 15) => {
    const ax = Array.isArray(a) ? a[0] : a.x;
    const ay = Array.isArray(a) ? a[1] : a.y;
    const bx = Array.isArray(b) ? b[0] : b.x;
    const by = Array.isArray(b) ? b[1] : b.y;
    return Math.abs(ax - bx) <= d && Math.abs(ay - by) <= d;
  };
  assert.ok(near(donorC5, donorC5Vertex, 1), 'donor C5は左環の実頂点');
  assert.ok(near(acceptC5, acceptC5Vertex, 1), 'acceptor C5は右環の実頂点');
  assert.ok(ch2oh[1] < donorC5[1], 'donor C5のCH2OHは上向き');
  assert.ok(glyO[1] > donorC1[1], 'donor C1のグリコシドOは下向き（α-D）');
  assert.ok(Math.abs(glyO[1] - acceptC6[1]) < 1, 'O—acceptor C6は水平');
  assert.ok(acceptC5[1] > acceptC6[1], 'acceptor C6からC5へ下向き');
  const lines = [...iso.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map((m) => ({
    a: [Number(m[1]), Number(m[2])], b: [Number(m[3]), Number(m[4])]
  }));
  const touches = (q) => lines.filter((l) => near(l.a, q) || near(l.b, q));
  assert.ok(lines.some((l) => (near(l.a, donorC5) && near(l.b, ch2oh)) || (near(l.b, donorC5) && near(l.a, ch2oh))), 'C5–CH2OH結合');
  assert.ok(lines.some((l) => (near(l.a, glyO) && near(l.b, donorC1)) || (near(l.b, glyO) && near(l.a, donorC1))), 'C1–O結合');
  assert.ok(lines.some((l) => (near(l.a, glyO) && near(l.b, acceptC6)) || (near(l.b, glyO) && near(l.a, acceptC6))), 'O–C6結合');
  assert.ok(lines.some((l) => (near(l.a, acceptC6) && near(l.b, acceptC5)) || (near(l.b, acceptC6) && near(l.a, acceptC5))), 'C6–C5結合');
  assert.equal(touches(glyO).length, 2, 'グリコシドOは2本の結合をもつ');
  assert.ok(!lines.some((l) => (near(l.a, donorC5) && near(l.b, donorC1)) || (near(l.b, donorC5) && near(l.a, donorC1))), 'donor C5–C1直結にしない');
  assert.ok(iso.includes('CH₂OH'), 'donor C5のCH2OHを表示する');
  assert.ok(iso.includes('還元末端'), '受容体還元末端のα/β未特定を注記する');
  assert.ok(D.COMPOUNDS.isomaltose.notes.includes('還元末端'), 'イソマルトースの注記にも還元末端の未特定を残す');
  assert.ok(!D.COMPOUNDS.sucrose.notes.includes('図では六員環で表す'), 'スクロースの古い六員環説明を残さない');
  assert.ok(D.COMPOUNDS.sucrose.notes.includes('五員環'), 'スクロースのフラノース説明を修正する');
  for (const id of ['eicosapentaenoic-acid', 'docosahexaenoic-acid']) {
    const fig = R.renderCompound(D.COMPOUNDS[id]);
    assert.ok(fig.includes('oc-fig--long'), id + ' は長い鎖式をカード内に全体フィット＋拡大で読む');
    assert.ok(!fig.includes('oc-fig--scroll'), id + ' はカード内で横スクロールしない');
  }
});

test('[data] 46追加分のsourceEvidenceはsource IDと独自補足を分離している', () => {
  for (const id of PRESERVED_46) {
    const c = D.COMPOUNDS[id];
    assert.ok((c.sourceEvidence || []).length > 0, id + ' のsourceEvidenceがない');
    for (const ev of c.sourceEvidence) {
      assert.match(ev.source || '', /^(?:s\d+|idx-(?:tryit|kimika)|textbook|mext|pubchem|nist|iupac|csj)$/, id + ' のsource IDが不正');
      assert.equal(ev.url, undefined, id + ' に教材URLが残る');
      assert.equal(ev.quote, undefined, id + ' に本文抜粋が残る');
      assert.ok(ev.section, id + ' の節がない');
      assert.ok(ev.note, id + ' の補足がない');
    }
  }
});

test('[data] 旧site/app10の367化合物は不変fixtureに保全し、本番はNEXT版と一致する', () => {
  const fixturePath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app10-baseline-35120ea', 'data.js');
  delete require.cache[require.resolve(fixturePath)];
  const S = require(fixturePath);
  assert.equal(Object.keys(S.COMPOUNDS).length, 367, 'fixtureは35120ea時点の367化合物');
  assert.equal(S.FAMILIES, undefined, 'fixtureに新版familyを混ぜない');
  assert.equal(S.COMPOUNDS.ethylmethylamine, undefined, 'fixtureに新版の追加アミンを混ぜない');
  assert.equal(Object.keys(D.COMPOUNDS).length, 427, '本番はNEXT版の427化合物');
  assert.equal(D.FAMILIES.length, 31);
  assert.ok(D.COMPOUNDS.ethylmethylamine, '本番にはNEXT版の追加アミンがある');
  assert.equal(fs.readFileSync(path.join(APP, 'data.js')).equals(fs.readFileSync(path.join(NEXT, 'data.js'))), true, '本番data.jsはdesign-labとbyte一致');
});

test('[data] HCH異性体・脂肪酸cis位置・ATPリン酸・金属塩を区別する', () => {
  const hch = D.COMPOUNDS.hexachlorocyclohexane;
  assert.equal(hch.formula, 'C6H6Cl6');
  assert.equal(hch.structure.type, 'schematic');
  assert.ok(/異性体/.test(hch.notes) && /γ/.test(hch.notes));
  assert.deepEqual(hch.structure.composition, { C: 6, H: 6, Cl: 6 });
  const ara = D.COMPOUNDS['arachidonic-acid'].structure.doubleBonds;
  const epa = D.COMPOUNDS['eicosapentaenoic-acid'].structure.doubleBonds;
  const dha = D.COMPOUNDS['docosahexaenoic-acid'].structure.doubleBonds;
  assert.deepEqual(ara.map((b) => b.at), [5, 8, 11, 14]);
  assert.deepEqual(epa.map((b) => b.at), [5, 8, 11, 14, 17]);
  assert.deepEqual(dha.map((b) => b.at), [4, 7, 10, 13, 16, 19]);
  for (const b of ara.concat(epa, dha)) assert.equal(b.geometry, 'cis');
  const atp = D.COMPOUNDS.atp;
  assert.equal(atp.formula, 'C10H16N5O13P3');
  assert.equal(atp.structure.type, 'schematic');
  assert.equal(atp.structure.kind, 'nucleotide-atp');
  assert.deepEqual(atp.structure.composition, { C: 10, H: 16, N: 5, O: 13, P: 3 });
  assert.equal(D.COMPOUNDS['sodium-methoxide'].ion.cation, 'Na⁺');
  assert.equal(D.COMPOUNDS['lead-ii-acetate'].ion.cation, 'Pb²⁺');
  assert.equal(D.COMPOUNDS['calcium-acetate'].ion.cation, 'Ca²⁺');
  assert.equal(D.COMPOUNDS['silver-acetylide'].ion.cation, 'Ag⁺ ×2');
  assert.equal(D.COMPOUNDS['copper-i-acetylide'].ion.cation, 'Cu⁺ ×2');
});

test('[data] 独立監査の5物質/イオン/塩状態を正しく区別する', () => {
  assert.equal(Object.keys(D.COMPOUNDS).length, 427);
  const ea = D.COMPOUNDS.ethanolamine;
  assert.equal(ea.formula, 'C2H7NO');
  assert.equal(C.classify('ethanolamine').family, 'amino-alcohol');
  assert.ok(!C.chainIds('amine', 2).includes('ethanolamine'), 'アミノアルコールをモノアミン一覧に混ぜない');
  assert.deepEqual(C.chainIds('amine', 2).sort(), ['dimethylamine', 'ethylamine']);
  const ino = D.COMPOUNDS.inositol;
  assert.equal(ino.formula, 'C6H12O6');
  assert.equal(C.ringCount(ino.structure), 1);
  assert.equal(C.classify('inositol').family, 'cyclitol');
  assert.equal(C.classify('inositol').mode, 'other');
  const ch = D.COMPOUNDS.choline;
  assert.equal(ch.formula, 'C5H14NO');
  assert.equal(C.classify('choline').family, 'quaternary-ammonium');
  assert.ok(!C.chainIds('amine', 5).includes('choline'), '四級アンモニウムをアミン一覧に混ぜない');
  assert.equal(ch.ion.cation.indexOf('コリン'), 0);
  const pa = D.COMPOUNDS['phenyl-acetate'];
  assert.equal(pa.formula, 'C8H8O2');
  assert.equal(C.classify('phenyl-acetate').mode, 'ring');
  assert.equal(C.classify('phenyl-acetate').system, 'benzene');
  assert.ok(!C.chainIds('ester', 8).includes('phenyl-acetate'), '芳香族エステルを鎖式エステルに混ぜない');
  const ds = D.COMPOUNDS['disodium-salicylate'];
  assert.equal(ds.formula, 'C7H4Na2O3');
  assert.equal(ds.structure.subs.filter((s) => s.label === 'ONa').length, 1);
  assert.equal(ds.structure.subs.filter((s) => s.label === 'COO⁻Na⁺').length, 1);
  assert.equal(ds.ion.cation, 'Na⁺ ×2');
  assert.notEqual(ds.id, 'sodium-salicylate');
  assert.equal(D.aliasTarget('サリチル酸二ナトリウム'), 'disodium-salicylate');
  assert.equal(D.aliasTarget('サリチル酸ナトリウム'), null, '一Na塩を二Na塩の別名にしない');
  for (const id of ['ethanolamine', 'inositol', 'choline', 'phenyl-acetate', 'disodium-salicylate']) {
    const ev = (D.COMPOUNDS[id].sourceEvidence || [])[0];
    assert.ok(ev, id + ' のsourceEvidenceがない');
    assert.equal(ev.evidenceType, 'image-human-read');
    assert.equal(ev.image, undefined, id + ' に画像直リンクが残る');
    assert.equal(ev.quote, undefined, id + ' に本文抜粋が残る');
    assert.match(ev.source || '', /^idx-(?:tryit|kimika)$/, id + ' のsource IDがない');
    assert.ok(ev.note, id + ' の独自補足がない');
  }
});

test('[data] 独立PubChem確認7物質のidentity・接続・電荷・立体metadata', () => {
  const expected = {
    'dimethyl-oxalate': { cid: 11120, formula: 'C4H6O4', mode: 'chain', family: 'ester' },
    'diphenyl-oxalate': { cid: 18475, formula: 'C14H10O4', mode: 'ring', system: 'complex-ring' },
    salicin: { cid: 439503, formula: 'C13H18O7', mode: 'other', family: 'glycoside' },
    '1,3-dibromopropane': { cid: 8001, formula: 'C3H6Br2', mode: 'chain', family: 'halogen' },
    diethylenetriamine: { cid: 8111, formula: 'C4H13N3', mode: 'chain', family: 'amine' },
    adenosine: { cid: 60961, formula: 'C10H13N5O4', mode: 'other', family: 'nucleotide' },
    adp: { cid: 6022, formula: 'C10H15N5O10P2', mode: 'other', family: 'nucleotide' }
  };
  assert.equal(Object.keys(expected).length, 7);
  for (const [id, want] of Object.entries(expected)) {
    const c = D.COMPOUNDS[id];
    assert.ok(c, id + ' のレコードがない');
    assert.equal(c.formula, want.formula, id + ' の分子式');
    assert.equal(c.pubchem, want.cid, id + ' のCID');
    assert.equal(c.formalCharge, 0, id + ' の形式電荷');
    assert.equal(c.charge, 0, id + ' の電荷');
    assert.equal(C.classify(id).mode, want.mode, id + ' の経路');
    if (want.family) assert.equal(C.classify(id).family, want.family, id + ' のfamily');
    if (want.system) assert.equal(C.classify(id).system, want.system, id + ' の環system');
    assert.equal(R.validate(c).ok, true, id + ' の分子式・結合価');
    const ev = (c.sourceEvidence || [])[0];
    assert.equal(ev.source, 'pubchem', id + ' のsourceはPubChem');
    assert.match(ev.section || '', new RegExp('CID\\s*' + want.cid), id + ' のCID section');
    assert.equal(ev.url, undefined, id + ' に教材URLを入れない');
    assert.equal(ev.quote, undefined, id + ' に本文抜粋を入れない');
    assert.equal(ev.imageUrl, undefined, id + ' に画像URLを入れない');
    assert.ok(ev.note && ev.note.length > 10, id + ' の独自note');
  }

  const dimethyl = D.COMPOUNDS['dimethyl-oxalate'];
  const dGraph = R.buildStructure(dimethyl.structure);
  assert.equal(dGraph.atoms.filter((a) => a.el === 'C').length, 4);
  assert.equal(dGraph.atoms.filter((a) => a.el === 'O').length, 4);
  assert.equal(dGraph.bonds.filter((b) => b.order === 2 && dGraph.atoms[b.a].el === 'C' && dGraph.atoms[b.b].el === 'O').length, 2, '2つのC=O');
  const dDesc = C.chainDescriptorFor('dimethyl-oxalate');
  assert.equal(dDesc.role, 'diester', 'ジエステルを一価エステルと表示しない');
  assert.notEqual(dDesc.role, 'monoester');
  assert.equal(dDesc.groups.ester, 2);
  assert.equal(dDesc.descriptorId, 'd-methanex2-c2');
  assert.equal(C.chainRoleLabel('diester'), '二価エステル（ジエステル）');
  assert.equal(C.chainDescriptorFor('dimethyl-oxalate').monoester, undefined);

  const diphenyl = D.COMPOUNDS['diphenyl-oxalate'];
  assert.equal(C.ringCount(diphenyl.structure), 2, '2つのベンゼン環');
  const pGraph = R.buildStructure(diphenyl.structure);
  assert.equal(pGraph.atoms.filter((a) => a.el === 'C').length, 14);
  assert.equal(pGraph.atoms.filter((a) => a.el === 'O').length, 4);
  assert.equal(pGraph.bonds.filter((b) => b.order === 2).length, 8, '2つのC=O＋2環のケクレ二重結合');
  assert.equal(C.classify('diphenyl-oxalate').preset, 'tray', '複合環trayへ入れる');
  assert.ok(C.RING_SYSTEM_MAP['complex-ring'].tray.includes('diphenyl-oxalate'));

  const dibromo = D.COMPOUNDS['1,3-dibromopropane'];
  const bGraph = R.buildStructure(dibromo.structure);
  assert.equal(bGraph.atoms.filter((a) => a.el === 'Br').length, 2);
  assert.equal(C.chainDescriptorFor('1,3-dibromopropane').role, 'multihalogen');
  assert.equal(C.chainDescriptorFor('1,3-dibromopropane').descriptorId, 'd-propane-c3');
  assert.equal(C.chainDescriptorFor('1,3-dibromopropane').groups.halogen, 2);

  const deta = D.COMPOUNDS.diethylenetriamine;
  const detaGraph = R.buildStructure(deta.structure);
  assert.equal(detaGraph.atoms.filter((a) => a.el === 'N').length, 3);
  assert.equal(detaGraph.atoms.filter((a) => a.el === 'C').length, 4);
  const detaDesc = C.chainDescriptorFor('diethylenetriamine');
  assert.deepEqual(detaDesc.groups.amineDegrees, { 1: 2, 2: 1, 3: 0 }, '第一級N2個＋第二級N1個');
  assert.equal(detaDesc.role, 'amine-1-2', '多い方の級だけを表示しない');
  assert.equal(C.chainRoleLabel('amine-1-2'), '第一級アミン×2・第二級アミン×1');
  assert.ok(!/^第二級アミン$/.test(C.chainRoleLabel(detaDesc.role)));
  assert.equal(detaDesc.descriptorId, 'd-ethanex2-c4');

  const salicin = D.COMPOUNDS.salicin;
  assert.equal(salicin.structure.type, 'schematic');
  assert.equal(salicin.structure.kind, 'salicin');
  assert.equal(salicin.structure.identity.linkage, 'phenolic O–β-D-glucopyranoside');
  assert.ok(salicin.structure.identity.synonyms.includes('salicoside'));
  assert.ok(salicin.structure.identity.aglycone.includes('saligenin'));
  assert.equal(salicin.structure.stereo.sugar, 'D-glucopyranose');
  assert.equal(salicin.structure.stereo.anomer, 'beta');
  assert.equal(salicin.structure.stereo.stereocenters, 5);
  assert.equal(salicin.structure.stereo.drawn, false);
  assert.ok(/CH₂OH/.test(salicin.notes) && /立体中心/.test(salicin.notes), '遊離CH2OHと立体省略の注記');
  const salicinSvg = R.renderCompound(salicin);
  assert.ok(salicinSvg.includes('data-sugar="salicin"'));
  assert.ok(salicinSvg.includes('data-glycosidic="beta-D-glucopyranoside"'));
  assert.ok(salicinSvg.includes('data-anomer="beta"'));
  assert.ok(salicinSvg.includes('data-free-hydroxymethyl="2"'));
  assert.ok(salicinSvg.includes('data-stereo-drawn="omitted"'));
  assert.ok(!salicinSvg.includes('data-ring-count="3"'), '多糖3環fallbackに落とさない');

  const adenosine = D.COMPOUNDS.adenosine;
  assert.equal(adenosine.structure.kind, 'nucleoside-adenosine');
  assert.equal(adenosine.structure.stereo.phosphateCount, 0);
  assert.equal(adenosine.structure.stereo.stereocenters, 4);
  assert.ok(adenosine.structure.identity.synonyms.includes('adenine riboside'));
  const adenoSvg = R.renderCompound(adenosine);
  assert.ok(adenoSvg.includes('data-nucleotide="adenosine"'));
  assert.ok(adenoSvg.includes('data-phosphate-count="0"'));
  assert.equal((adenoSvg.match(/>P</g) || []).length, 0, 'アデノシンはP0');
  assert.ok(!adenoSvg.includes('data-ring-count="3"'));

  const adp = D.COMPOUNDS.adp;
  assert.equal(adp.structure.kind, 'nucleotide-adp');
  assert.equal(adp.ion.charge, '0');
  assert.equal(adp.structure.stereo.phosphateCount, 2);
  assert.equal(adp.structure.stereo.phosphateCharge, 0);
  assert.equal(adp.structure.stereo.stereocenters, 4);
  assert.ok(adp.structure.identity.synonyms.includes('ADP'));
  const adpSvg = R.renderCompound(adp);
  assert.ok(adpSvg.includes('data-nucleotide="adp"'));
  assert.ok(adpSvg.includes('data-phosphate-count="2"'));
  assert.ok(adpSvg.includes('data-phosphate-charge="0"'));
  assert.equal((adpSvg.match(/>P</g) || []).length, 2, 'ADPはP2');
  assert.ok(!adpSvg.includes('data-ring-count="3"'));
  assert.equal((adpSvg.match(/O⁻/g) || []).length, 0, '中性酸形にO⁻を4個流用しない');
  assert.ok(!adpSvg.includes('P—O—P—O—P'), 'ATPの三リン酸鎖を流用しない');
  assert.ok(adp.notes.includes('ADP³⁻') && adp.notes.includes('Mg²⁺'), '生理的イオン形とMg錯体を区別');
  assert.ok(adp.structure.identity.phosphate.includes('P(=O)(OH)'));
  const adpAtomSum = Object.values(adp.structure.composition).reduce((n, v) => n + v, 0);
  assert.equal(adpAtomSum, 42, 'ADPの全原子数');
  assert.ok(adpAtomSum > R.GRAPH_ATOM_LIMIT, '40原子上限を超えるため模式図');

  const atpSvg = R.renderCompound(D.COMPOUNDS.atp);
  assert.equal((atpSvg.match(/>P</g) || []).length, 3, '既存ATPのP3表示を維持');
  assert.ok(atpSvg.includes('data-phosphate-charge="4-"'), '既存ATPの4-表示を維持');

  for (const id of ['dimethyl-oxalate', 'diphenyl-oxalate', '1,3-dibromopropane', 'diethylenetriamine']) {
    const plan = R.figurePlan(D.COMPOUNDS[id]);
    assert.equal(plan.mode, 'dual', id + ' は構造式＋簡略構造式');
    const html = R.renderCompound(D.COMPOUNDS[id]);
    assert.ok(html.includes('構造式') && html.includes('簡略構造式'), id + ' の二重表示');
  }
  for (const id of ['salicin', 'adenosine', 'adp']) {
    const plan = R.figurePlan(D.COMPOUNDS[id]);
    assert.equal(plan.mode, 'single', id + ' は模式図の明示例外');
    assert.equal(plan.exception.type, 'schematic');
    assert.ok(plan.exception.reason.length >= 6);
  }

  assert.equal(C.CHAIN_DESCRIPTOR_LIST.length, 47, '新規shapeを増やさない');
  assert.ok(['d-methanex2-c2', 'd-propane-c3', 'd-ethanex2-c4'].every((id) => C.CHAIN_DESCRIPTOR_BY_ID[id]));
  for (const id of Object.keys(D.COMPOUNDS)) assert.ok(C.routeFor(id), id + ' のrouteがない');

  const searches = {
    'シュウ酸ジメチル': 'dimethyl-oxalate',
    'diphenyl oxalate': 'diphenyl-oxalate',
    サリシン: 'salicin',
    salicoside: 'salicin',
    DETA: 'diethylenetriamine',
    'bis(2-aminoethyl)amine': 'diethylenetriamine',
    'trimethylene dibromide': '1,3-dibromopropane',
    'アデノシン二リン酸': 'adp'
  };
  for (const [term, id] of Object.entries(searches)) {
    assert.ok(C.search(term).some((row) => row.id === id), term + ' で ' + id + ' を引けない');
  }
});

test('[draw] 未知のschematic kindを多糖3環fallbackへ落とさない', () => {
  const svg = R.renderStructure({ type: 'schematic', kind: 'unknown-example', composition: { C: 1 } }, '未知');
  assert.ok(svg.includes('data-unsupported-schematic="1"'));
  assert.ok(!svg.includes('data-ring-count="3"'));
  assert.ok(svg.includes('未対応'));
});

/* ------------------------------------------------------------------
 * 模式図の構造/注記分離と、孤立炭素skeletalの空図防止
 * ------------------------------------------------------------------ */

function svgGroupBody(svg, className) {
  const m = svg.match(new RegExp('<g class="' + className + '">([\\s\\S]*?)<\\/g>'));
  return m ? m[1] : '';
}

function svgTextBoxes(fragment) {
  const boxes = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(fragment))) {
    const attrs = {};
    for (const part of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[part[1]] = part[2];
    const text = m[2];
    const fs = Number(attrs['font-size'] || 20);
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    let width = 0;
    for (const ch of text) {
      if (/[₀-₉]/.test(ch)) width += fs * 0.55;
      else if (/[A-Za-z0-9]/.test(ch)) width += fs * 0.62;
      else if (ch === '—' || ch === '–' || ch === '=') width += fs * 0.7;
      else if (/[′″]/.test(ch)) width += fs * 0.4;
      else width += fs;
    }
    boxes.push({
      text, fs,
      left: x - width / 2, right: x + width / 2,
      top: y - fs * 0.8, bottom: y + fs * 0.8
    });
  }
  return boxes;
}

function svgLineBoxes(fragment) {
  const boxes = [];
  const re = /<line\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(fragment))) {
    const attrs = {};
    for (const part of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[part[1]] = part[2];
    const x1 = Number(attrs.x1), y1 = Number(attrs.y1);
    const x2 = Number(attrs.x2), y2 = Number(attrs.y2);
    boxes.push({
      left: Math.min(x1, x2), right: Math.max(x1, x2),
      top: Math.min(y1, y2), bottom: Math.max(y1, y2)
    });
  }
  return boxes;
}

test('[draw] 模式図は構造と注記の座標帯を分離し、注記をCSSで隠さない', () => {
  const css = read('app.css');
  assert.equal(/\.oc-schematic-annotation\s*\{[^}]*display:\s*none/s.test(css), false, '注記をCSSで隠さない');
  const expectedNotes = { salicin: 2, adp: 3 };
  for (const id of Object.keys(expectedNotes)) {
    const svg = R.renderCompound(D.COMPOUNDS[id]);
    const structure = svgGroupBody(svg, 'oc-schematic-structure');
    const annotation = svgGroupBody(svg, 'oc-schematic-annotation');
    assert.ok(structure, id + ' の構造グループ');
    assert.ok(annotation, id + ' の注記グループ');
    const structureBoxes = [...svgTextBoxes(structure), ...svgLineBoxes(structure)];
    const noteBoxes = svgTextBoxes(annotation);
    assert.equal(noteBoxes.length, expectedNotes[id], id + ' の注記数');
    for (const note of noteBoxes) {
      assert.ok(note.fs >= 11, id + ' の注記文字を極小化しない');
    }
    const structureBottom = Math.max(...structureBoxes.map((b) => b.bottom));
    const noteTop = Math.min(...noteBoxes.map((b) => b.top));
    const noteBottom = Math.max(...noteBoxes.map((b) => b.bottom));
    assert.ok(noteTop >= structureBottom + 8, id + ' の注記が構造領域に食い込む');
    assert.ok(noteTop - structureBottom <= 40, id + ' の注記帯までの余白が過剰');
    const ordered = [...noteBoxes].sort((a, b) => a.top - b.top);
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(ordered[i].top > ordered[i - 1].bottom, id + ' の注記行が重なる');
    }
    const vb = R.svgGeometry(svg);
    const all = [...structureBoxes, ...noteBoxes];
    assert.ok(vb.x <= Math.min(...all.map((b) => b.left)), id + ' のviewBox左外に内容');
    assert.ok(vb.y <= Math.min(...all.map((b) => b.top)), id + ' のviewBox上外に内容');
    assert.ok(vb.x + vb.width >= Math.max(...all.map((b) => b.right)), id + ' のviewBox右外に内容');
    assert.ok(vb.y + vb.height >= Math.max(...all.map((b) => b.bottom)), id + ' のviewBox下外に内容');
    assert.ok(noteBottom <= vb.y + vb.height - 8, id + ' の注記がviewBox下端に接する');
  }
});

test('[draw] 孤立炭素のskeletalはCH₄を表示し、連結Cの省略は維持する', () => {
  const plan = R.figurePlan(D.COMPOUNDS.methane);
  assert.equal(plan.mode, 'dual', 'メタンは構造式＋簡略構造式');
  const simple = R.renderStructure(plan.simple.structure, 'メタンの簡略構造式');
  assert.ok(simple.includes('CH₄'), '孤立炭素はCH₄の明示ラベル');
  assert.equal((simple.match(/data-el="C"/g) || []).length, 1);
  const boxes = svgTextBoxes(simple);
  assert.equal(boxes.length, 1, '空図にせずラベル1つを描く');
  const vb = R.svgGeometry(simple);
  assert.ok(boxes[0].left >= vb.x && boxes[0].right <= vb.x + vb.width, 'CH₄がviewBox内');
  assert.ok(boxes[0].top >= vb.y && boxes[0].bottom <= vb.y + vb.height, 'CH₄がviewBox内');
  const full = R.renderStructure(plan.full.structure, 'メタンの構造式');
  assert.equal((full.match(/data-el="C"/g) || []).length, 1);
  assert.equal((full.match(/data-el="H"/g) || []).length, 4, '完全構造式のH4個を維持');

  for (const id of ['ethane', 'propane', 'butane']) {
    const simple = R.renderStructure(R.figurePlan(D.COMPOUNDS[id]).simple.structure, id + 'の簡略構造式');
    assert.equal((simple.match(/data-el="C"/g) || []).length, 0, id + ' の連結Cラベル省略を維持');
    assert.ok((simple.match(/<line /g) || []).length >= 1, id + ' のC–C結合は表示');
    assert.equal(simple.includes('CH₃'), false, id + ' の連結CにCH₃を復活させない');
  }
});

test('[figures] 全化合物の全SVGが空でない', () => {
  let total = 0;
  const empty = [];
  for (const id of Object.keys(D.COMPOUNDS)) {
    const html = R.renderCompound(D.COMPOUNDS[id]);
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
    for (const svg of svgs) {
      total++;
      if (!/<(?:line|text|path|circle|rect|polygon|polyline|ellipse)\b/.test(svg)) empty.push(id);
    }
  }
  assert.deepEqual(empty, [], '描画要素のないSVG: ' + empty.join(','));
  assert.ok(total >= 700, 'SVG総数 ' + total);
});

test('[data] フェノキシドイオンはNaを含まない独立イオンgraphとring presetを持つ', () => {
  const p = D.COMPOUNDS['phenoxide-ion'];
  assert.ok(p, 'フェノキシドイオンのentity');
  assert.equal(p.name, 'フェノキシドイオン');
  assert.equal(p.formula, 'C6H5O');
  assert.equal(p.formulaDisplay, 'C₆H₅O⁻');
  assert.equal(p.ion.charge, '-1');
  assert.equal(p.ion.cation, null);
  assert.ok(p.ion.anion.includes('C₆H₅O⁻'));
  assert.equal(p.pubchem, null, '未確認CIDを作らない');
  assert.ok(!/沸点|融点|固体/.test(p.properties), '純物質の沸点・固体などを捏造しない');
  assert.ok(p.properties && p.uses && p.nature && p.precursors && p.reactions);
  assert.ok(p.reactions.includes('フェノール'), '酸でフェノールに戻る');
  assert.ok(p.precursors.includes('脱プロトン化'));
  const ev = p.sourceEvidence[0];
  assert.equal(ev.url, undefined, '教材URLは配信しない');
  assert.equal(ev.imageUrl, undefined, '画像直リンクは配信しない');
  assert.equal(ev.imageSha256, undefined, '画像sha256は配信しない');
  assert.equal(ev.quote, undefined, '本文抜粋は配信しない');
  assert.equal(ev.source, 's22');
  assert.ok(ev.note, '独自の化学的補足を残す');
  assert.equal(R.validate(p).ok, true);
  const g = R.buildStructure(R.figurePlan(p).full.structure);
  assert.equal(g.atoms.filter((a) => a.el === 'Na').length, 0, 'Naをgraphへ含めない');
  assert.equal(g.atoms.filter((a) => a.el === 'O' && a.charge === '-' && a.h === 0).length, 1, 'O⁻を明示');
  assert.equal(g.bonds.filter((b) => g.atoms[b.a].el === 'O' || g.atoms[b.b].el === 'O').length, 1, 'C–O結合は1本');
  assert.equal(graphRingCount(p.structure), 1);
  assert.equal(R.formulaOfGraph(g), 'C6H5O');
  const plan = R.figurePlan(p);
  assert.equal(plan.mode, 'dual', '構造式＋簡略構造式の二重表示');
  const text = R.condensedTextFor(p);
  assert.equal(text.text, 'C₆H₅−O⁻');
  assert.equal(text.note, '', '対イオン注記を付けない');
  assert.equal(R.IONIC_TEXT === undefined || !Object.prototype.hasOwnProperty.call(R.IONIC_TEXT || {}, 'phenoxide-ion'), true, 'IONIC_TEXTへ入れない');
  assert.equal(D.COMPOUNDS['sodium-phenoxide'].formula, 'C6H5NaO', 'ナトリウム塩は別entity');
  assert.equal(C.classify('phenoxide-ion').mode, 'ring');
  assert.equal(C.classify('phenoxide-ion').system, 'benzene');
  const route = C.routeFor('phenoxide-ion');
  assert.equal(route.preset, 'p-o_x1');
  assert.equal(route.focus, 'phenoxide-ion');
  const preset = C.RING_SYSTEM_MAP.benzene.presets.filter((x) => x.id === route.preset)[0];
  assert.deepEqual(preset.ids, ['phenoxide-ion']);
  assert.equal(C.ringSubsFor('phenoxide-ion')[0].key, 'O-');
  assert.equal(C.ringSubsFor('phenoxide-ion')[0].label, 'O⁻');
  assert.ok(C.search('フェノキシドイオン').some((x) => x.id === 'phenoxide-ion'));
});

test('[data] 既存別名インベルターゼ/トレオニンとリン脂質familyの完全名検索', () => {
  assert.equal(D.ALIASES.length, 228);
  assert.equal(D.aliasTarget('インベルターゼ'), 'sucrase');
  assert.equal(D.aliasTarget('invertase'), 'sucrase', '英語invertaseも同じsucraseへ');
  assert.ok(C.search('invertase').some((x) => x.id === 'sucrase' && x.type === 'compound'), '英語名から実到達');
  assert.deepEqual(C.search('invertase').map((x) => x.id), ['sucrase'], '別名で別物質を増やさない');
  assert.equal(D.aliasTarget('トレオニン'), 'threonine');
  assert.equal(D.COMPOUNDS.threonine.name, 'スレオニン', '表示名はスレオニンを維持');
  const aliasKeys = new Map();
  for (const a of D.ALIASES) {
    const key = D.normalizeName(a.term);
    assert.equal(aliasKeys.has(key), false, '別名の重複: ' + a.term);
    aliasKeys.set(key, a.target);
  }
  assert.equal(D.FAMILIES.length, 31, 'familyの新規追加なし');
  const pc = D.familyById('phosphatidylcholine');
  const pe = D.familyById('phosphatidylethanolamine');
  const pa = D.familyById('phosphatidic-acid');
  for (const f of [pc, pe, pa]) {
    assert.equal(f.formula, null, f.id + ' は固定分子式をもたない');
    assert.ok(!(f.members || []).includes('stearic-acid'), f.id + ' はステアリン酸を唯一の固定鎖にしない');
    assert.ok(f.description.includes('sn-1,2'), f.id + ' のsn-1,2アシル');
    assert.ok(f.description.includes('sn-3'), f.id + ' のsn-3リン酸');
    assert.ok(f.provenanceNote && /P–OH|NH₂/.test(f.provenanceNote), f.id + ' の表記provenance');
  }
  assert.ok(pc.synonyms.includes('ホスファチジルコリン（レシチン）'));
  assert.ok(pa.synonyms.includes('ホスファチジン酸'));
  assert.equal(D.familyByTerm('ホスファチジルコリン（レシチン）').id, 'phosphatidylcholine');
  assert.equal(D.familyByTerm('ホスファチジン酸').id, 'phosphatidic-acid');
  assert.ok(C.search('ホスファチジルコリン（レシチン）').some((x) => x.type === 'family' && x.id === 'phosphatidylcholine'));
  assert.ok(C.search('ホスファチジン酸').some((x) => x.type === 'family' && x.id === 'phosphatidic-acid'));
  assert.ok(pc.description.includes('混合物'), '工業的レシチンの混合物注記');
  assert.equal(pc.formula, null, '固定分子式を主張しない');
  assert.equal(R.formulaOfStructure(pc.structure).includes('R'), true, '一般構造はR¹/R²を残す');
  const pcSvg = R.renderStructure(pc.structure, pc.name);
  assert.ok(pcSvg.includes('<svg') && !pcSvg.includes('NaN'));
  assert.ok(pcSvg.includes('R¹') && pcSvg.includes('R²'));
});

test('[draw] PE/PC頭部はP–O–CH₂–CH₂–N…を明示し、長い頭部名を原子ラベルに置かない', () => {
  function graphOf(id) {
    return R.buildStructure(D.familyById(id).structure);
  }
  function pathElements(g, from, to) {
    const prev = new Array(g.atoms.length).fill(-1);
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const v = queue.shift();
      if (v === to) break;
      for (const b of g.bonds) {
        const w = b.a === v ? b.b : (b.b === v ? b.a : -1);
        if (w >= 0 && !seen.has(w)) { seen.add(w); prev[w] = v; queue.push(w); }
      }
    }
    const out = [];
    let v = to;
    while (v !== -1) { out.push(v); if (v === from) break; v = prev[v]; }
    return out.reverse();
  }
  function bondOrder(g, a, b) {
    const hit = g.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    assert.ok(hit, `結合がない: ${a}-${b}`);
    return hit.order;
  }
  function headPath(id) {
    const g = graphOf(id);
    const p = g.atoms.findIndex((a) => a.el === 'P');
    const n = g.atoms.findIndex((a) => a.el === 'N');
    assert.ok(p >= 0 && n >= 0, id + ' のP/N原子がない');
    const idx = pathElements(g, p, n);
    assert.deepEqual(idx.map((i) => g.atoms[i].el), ['P', 'O', 'C', 'C', 'N'], id + ' の頭部がP–O–C–C–Nでない');
    for (let i = 0; i < idx.length - 1; i++) assert.equal(bondOrder(g, idx[i], idx[i + 1]), 1, id + ' の頭部結合次数');
    return { g, n, idx };
  }
  const pe = headPath('phosphatidylethanolamine');
  assert.equal(pe.g.atoms[pe.n].label, 'NH₃⁺', 'PEのNはNH₃⁺として表示');
  const pc = headPath('phosphatidylcholine');
  assert.equal(pc.g.atoms[pc.n].label, 'N⁺(CH₃)₃', 'PCのNは四級アンモニウムN⁺(CH₃)₃として表示');
  for (const [id, head] of [['phosphatidylethanolamine', pe], ['phosphatidylcholine', pc]]) {
    const g = head.g;
    assert.equal(g.atoms.some((a) => /エタノールアミン|コリン/.test(a.label || '')), false, id + ' の原子ラベルに頭部の長い名称を残さない');
    assert.equal(g.atoms[head.n].charge, undefined, id + ' はNラベル内に電荷を表示し、別電荷textを重ねない');
    assert.equal(g.bonds.some((b) => {
      const ea = g.atoms[b.a].el;
      const eb = g.atoms[b.b].el;
      return (ea === 'O' && eb === 'N') || (ea === 'N' && eb === 'O');
    }), false, id + ' にO–N直接結合を作らない');
    assert.equal(g.atoms.some((a) => a.label === 'R¹') && g.atoms.some((a) => a.label === 'R²'), true, id + ' のR¹/R²可変ラベル');
    const svg = R.renderStructure(D.familyById(id).structure, D.familyById(id).name);
    assert.ok(svg.includes('<svg') && !svg.includes('NaN'), id + ' のSVG');
    const texts = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    assert.equal(texts.some((t) => /エタノールアミン|コリン/.test(t)), false, id + ' の表示文字に頭部名を重ねない');
  }
  assert.ok(pe.g.atoms.some((a) => a.label === 'NH₃⁺'));
  assert.ok(pc.g.atoms.some((a) => a.label === 'N⁺(CH₃)₃'));
  const pa = graphOf('phosphatidic-acid');
  assert.equal(pa.atoms.some((a) => a.charge), false, 'PAは中性形で不正な形式電荷を作らない');
  assert.equal(pa.atoms.some((a) => a.el === 'N'), false);
  const pIndex = pa.atoms.findIndex((a) => a.el === 'P');
  const pValence = pa.bonds.filter((b) => b.a === pIndex || b.b === pIndex).reduce((sum, b) => sum + b.order, 0);
  assert.equal(pValence, 5, 'PAのPは5価');
  assert.ok(pa.atoms.some((a) => a.label === 'R¹') && pa.atoms.some((a) => a.label === 'R²'));
  for (const id of ['phosphatidylcholine', 'phosphatidylethanolamine', 'phosphatidic-acid']) {
    const f = D.familyById(id);
    assert.ok(f.provenanceNote && /P–OH|NH₂/.test(f.provenanceNote), id + ' のprovenance維持');
    assert.ok(f.description.includes('sn-1,2') && f.description.includes('sn-3'), id + ' の結合位置説明');
  }
});

test('[independent] 625語全分類・42 mapping・5実証物質が未解決0', () => {
  assert.equal(IA.ENTRIES.length, 625);
  assert.equal(IA.MANDATORY.length, 42);
  assert.equal(IA.TRUE_MISSING.length, 5);
  assert.equal(IA.CROSSWALK.length, 65);
  assert.equal(IA.META.finalCompounds, 419);
  const result = IA.audit(D);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.mandatoryUnresolved, []);
  assert.deepEqual(result.trueMissingMissing, []);
  assert.deepEqual(result.crosswalkUnresolved, []);
  assert.equal(result.total, 625);
  assert.deepEqual(result.byLabel, IA.META.labels);
  for (const e of IA.ENTRIES) {
    assert.ok(e.mappingType && e.target, 'mappingなし: ' + e.term);
    assert.ok(['resolved', 'classified'].includes(e.status), e.term + ' のstatusがない');
    if (e.mappingType === 'compound') assert.ok(D.COMPOUNDS[e.target], e.term + ' の化合物IDなし: ' + e.target);
    if (e.mappingType === 'family') assert.ok(D.familyById(e.target), e.term + ' のfamily IDなし: ' + e.target);
    if (e.mappingType === 'material') assert.ok(D.materialById(e.target), e.term + ' の材料IDなし: ' + e.target);
  }
  const byLabel = {};
  IA.ENTRIES.forEach((e) => { byLabel[e.label] = byLabel[e.label] || []; byLabel[e.label].push(e); });
  for (const e of byLabel['general-word-noise'] || []) assert.equal(e.mappingType, 'noise');
  for (const e of byLabel['functional-group-or-word-fragment'] || []) assert.equal(e.mappingType, 'noise');
  for (const e of byLabel['general-chemistry-concept-not-substance'] || []) assert.equal(e.mappingType, 'concept');
  for (const e of byLabel['qualified-name-fragment'] || []) assert.equal(e.mappingType, 'fragment');
  for (const e of byLabel['inorganic-or-reagent'] || []) assert.ok(['inorganic', 'material'].includes(e.mappingType), e.term);
  for (const e of byLabel['material-or-preparation'] || []) assert.ok(['material', 'material-family'].includes(e.mappingType), e.term);
  for (const e of byLabel['mixture-not-single-molecule'] || []) assert.ok(['mixture-name', 'mixture'].includes(e.mappingType), e.term);
  for (const e of byLabel['class-or-family'] || []) assert.ok(['class', 'family'].includes(e.mappingType), e.term);
  for (const m of IA.MANDATORY) {
    assert.equal(m.status, 'implemented');
    if (m.targetType === 'family') {
      const f = D.familyById(m.target);
      assert.ok(f, m.term + ' のfamilyがない');
      assert.ok(f.summary && f.description, m.term + ' の説明がない');
    } else if (m.targetType === 'compound') {
      assert.ok(D.COMPOUNDS[m.target], m.term + ' の化合物がない');
    }
    assert.ok(C.search(m.term).length > 0, '名称検索で到達できない: ' + m.term);
  }
  for (const x of IA.TRUE_MISSING) {
    assert.equal(x.status, 'added');
    assert.ok(D.COMPOUNDS[x.id], x.id + ' がない');
    assert.ok(C.routeFor(x.id), x.id + ' のrouteがない');
    assert.equal(x.provenance, 'image-human-read');
    assert.ok(x.identity, x.id + ' のidentityがない');
    assert.equal(x.url, undefined, x.id + ' に教材URLが残る');
    assert.equal(x.image, undefined, x.id + ' に画像直リンクが残る');
    assert.equal(x.source, 'idx-kimika');
  }
  const phenEntry = IA.ENTRIES.filter((e) => e.term === 'フェノキシドイオン')[0];
  assert.equal(phenEntry.label, 'class-or-family', '独立監査時点のラベルを改竄しない');
  assert.equal(phenEntry.mappingType, 'class', '過去監査のmappingTypeを履歴として残す');
  assert.equal(phenEntry.currentMapping.mappingType, 'compound', '現在の対応を明示');
  assert.equal(phenEntry.currentMapping.target, 'phenoxide-ion');
  assert.ok(D.COMPOUNDS[phenEntry.currentMapping.target]);
  assert.equal(IA.PROVENANCE['idx-kimika/image-human-read'], 7);
  assert.equal(IA.IMAGE_REVIEW.all1399OcrCompleted, false);
  assert.ok(IA.META.limits.some((t) => /1399/.test(t)));
  assert.ok(IA.META.limits.some((t) => /動画/.test(t)));
  for (const x of IA.CROSSWALK) {
    assert.ok(x.target, 'crosswalk targetなし: ' + x.term);
    assert.ok(D.COMPOUNDS[x.target] || D.materialById(x.target) || D.familyById(x.target), 'crosswalk target未解決: ' + x.term);
  }
});

test('[ocr] 二pass統合・51 empty・確定不足・動画未確認をmetadataで記録する', () => {
  assert.equal(OA.META.urls, 1399);
  assert.equal(OA.META.uniqueImages, 1398);
  assert.deepEqual(OA.META.twoPass, { ok: 1347, empty: 51, error: 0 });
  assert.equal(OA.META.ocrRows, 1398);
  assert.equal(OA.META.pageMapRows, 1399);
  assert.equal(OA.META.candidates.total, 766);
  assert.equal(OA.META.candidates.katakana, 249);
  assert.equal(OA.META.candidates.kanji, 403);
  assert.equal(OA.META.candidates.formula, 114);
  const classSum = Object.values(OA.META.candidates.classificationCounts).reduce((a, b) => a + b, 0);
  assert.equal(classSum, 766, '766候補の分類合計');
  assert.equal(OA.META.candidates.classificationCounts.confirmed_missing_specific_organic_ion, 1);
  assert.equal(OA.META.candidates.classificationCounts.confirmed_missing_generic_lipid_family, 3);
  assert.equal(OA.META.alternatePass.uniqueCandidates, 188);
  assert.equal(OA.META.alternatePass.occurrences, 280);
  assert.equal(OA.META.alternatePass.differingLines, 1941);
  assert.equal(OA.META.emptyImages.total, 51);
  const emptySum = Object.values(OA.META.emptyImages.byStatus).reduce((a, b) => a + b, 0);
  assert.equal(emptySum, 51);
  assert.equal(OA.META.emptyImages.byStatus.structure_or_reaction_only_no_compound_name, 36);
  assert.equal(OA.META.emptyImages.byStatus.schematic_or_icon_no_compound_name, 8);
  assert.equal(OA.META.emptyImages.byStatus.photo_or_product_photo, 6);
  assert.equal(OA.META.emptyImages.byStatus.annotation_only_no_compound_name, 1);
  assert.equal(OA.META.emptyImages.missedCompoundNames, 0);
  assert.equal(OA.META.emptyImages.reviewed, true);
  assert.equal(OA.META.history.independentAuditFinalCompounds, 419, '履歴値は419のまま');
  assert.equal(OA.META.history.ocrBaselineCompounds, 420, 'OCR監査時点の420を履歴として残す');
  assert.equal(OA.META.history.currentCompounds, 427);
  assert.ok(/420/.test(OA.META.history.note) && /427/.test(OA.META.history.note), '420と427を混同しない説明');
  assert.equal(OA.INDEPENDENT_ADDITIONS.length, 7, 'OCRとは別の独立追加7件');
  for (const add of OA.INDEPENDENT_ADDITIONS) {
    const c = D.COMPOUNDS[add.id];
    assert.ok(c, add.id + ' のレコード');
    assert.equal(add.cid, c.pubchem, add.id + ' のCID一致');
    assert.equal(add.formula, c.formula, add.id + ' の分子式一致');
    assert.equal(add.charge, 0, add.id + ' の電荷0');
    assert.equal(c.formalCharge, 0);
    assert.equal(add.source, 'pubchem');
    assert.ok(D.aliasTarget(add.id) === null || C.search(add.id).some((r) => r.id === add.id), add.id + ' の検索到達');
  }
  assert.ok(OA.META.limitations.some((t) => /7物質/.test(t) && /PubChem API/.test(t)), '7物質がOCR由来でない説明');
  assert.equal(OA.META.claims.allImagesChemicallyFullyRead, false);
  assert.equal(OA.META.claims.allVideosTranscribed, false);
  assert.equal(OA.META.imageManifest.rawOcrTextStoredInRepo, false);
  assert.equal(OA.META.imageManifest.urls, 1399);
  assert.ok(OA.META.limitations.some((t) => /漢字403/.test(t)));
  assert.ok(OA.META.limitations.some((t) => /動画127/.test(t)));
  const phen = OA.CONFIRMED_ADDITIONS.filter((x) => x.type === 'compound')[0];
  assert.equal(phen.id, 'phenoxide-ion');
  assert.equal(phen.source, 'idx-tryit');
  assert.equal(phen.imageSha256, undefined, '画像sha256は配信しない');
  assert.equal(phen.imageUrl, undefined, '画像直リンクは配信しない');
  assert.ok(D.COMPOUNDS[phen.id]);
  const aliases = OA.CONFIRMED_ADDITIONS.filter((x) => x.type === 'alias');
  assert.equal(aliases.length, 2);
  assert.equal(D.aliasTarget('インベルターゼ'), 'sucrase');
  assert.equal(D.aliasTarget('トレオニン'), 'threonine');
  for (const x of OA.FAMILY_LOOKUP_CORRECTIONS) {
    assert.ok(D.familyById(x.target), x.term + ' の既存family');
  }
  assert.equal(OA.VIDEO.totalVideos, 127);
  assert.equal(OA.VIDEO.reviewed, false);
  assert.equal(OA.VIDEO.mainVideoId, 'pIdeL8PT2DM');
  assert.equal(OA.VIDEO.httpStatus, 400);
  assert.match(OA.VIDEO.error, /FAILED_PRECONDITION/);
  assert.equal(OA.VIDEO.segments, 0);
  assert.equal(OA.VIDEO.tokensRecorded, false);
  assert.equal(OA.VIDEO.cookiesRecorded, false);
  assert.equal(OA.VIDEO.headersRecorded, false);
  assert.equal(OA.VIDEO.bypassAttempted, false);
  assert.equal(OA.VIDEO.evidenceFile, 'media-audit-evidence-20261109');
  assert.equal(OA.META.sources.mediaEvidence, 'media-audit-evidence-20261109');
  assert.equal(OA.META.sources.reviewBundle, 'ocr-review-20261109');
  const ledgerHtml = read('ledger.html');
  assert.ok(ledgerHtml.includes('ocr-audit.js'));
  assert.ok(ledgerHtml.includes('id="ledger-ocr-audit"'));
  assert.ok(ledgerHtml.includes('id="ledger-verification"'));
  const ledgerJs = read('ledger.js');
  assert.ok(ledgerJs.includes('OCOcrAudit'));
  assert.ok(ledgerJs.includes('ledger-ocr-confirmed'));
});

test('[data] 46追加分のうち金属アセチリドの式順序が検証済み', () => {
  for (const id of ['silver-acetylide', 'copper-i-acetylide']) {
    const v = R.validate(D.COMPOUNDS[id]);
    assert.equal(v.ok, true, id + ': ' + v.errors.join(' / '));
  }
});

/* ------------------------------------------------------------------
 * 環式
 * ------------------------------------------------------------------ */

test('[ring] 固定骨格＋一置換生成と、多置換体familyの分離', () => {
  const benzene = C.RING_SYSTEM_MAP.benzene;
  assert.ok(benzene);
  const generated = D.COMBOS['aromatic-benzene'].oh.map((e) => e.id);
  assert.deepEqual(generated, ['phenol']);
  assert.ok(benzene.generated.includes('toluene'));
  assert.ok(!benzene.generated.includes('p-dichlorobenzene'), 'p-ジクロロベンゼンを一置換生成に混ぜない');
  assert.ok(benzene.registeredMulti.includes('p-dichlorobenzene'), '多置換体familyにp-ジクロロベンゼンが必要');
  assert.ok(!benzene.registeredSingle.includes('p-dichlorobenzene'));
  assert.ok(!benzene.generated.includes('salicylic-acid'), 'サリチル酸は多置換体として別family');
  assert.equal(C.classify('p-dichlorobenzene').mode, 'ring');
  assert.equal(C.classify('p-dichlorobenzene').system, 'benzene');
  assert.ok(C.RING_SYSTEM_MAP.naphthalene.generated.includes('1-naphthol'));
  assert.equal(C.classify('cyclohexene').mode, 'ring');
  assert.equal(C.classify('cyclohexene').system, 'cyclohexene');
  assert.equal(C.classify('anthracene').system, 'anthracene');
  assert.equal(C.classify('anthracene').mode, 'ring');
});

test('[ring] 環の数と鎖式への混入がない', () => {
  assert.equal(graphRingCount(D.COMPOUNDS.benzene.structure), 1);
  assert.equal(graphRingCount(D.COMPOUNDS.naphthalene.structure), 2);
  assert.equal(graphRingCount(D.COMPOUNDS.anthracene.structure), 3);
  assert.equal(graphRingCount(D.COMPOUNDS.cyclohexene.structure), 1);
  assert.equal(graphRingCount(D.COMPOUNDS.cyclohexane.structure), 1);
  for (const id of Object.keys(D.COMPOUNDS)) {
    const r = C.classify(id);
    if (r.mode === 'chain') {
      assert.equal(C.hasRing(D.COMPOUNDS[id].structure), false, id + ' は環をもつが鎖式に入っている');
    }
  }
});

/* ------------------------------------------------------------------
 * その他・family・材料
 * ------------------------------------------------------------------ */

test('[other] family・材料の索引が実データへ解決する', () => {
  assert.equal(D.FAMILIES.length, 31);
  for (const f of D.FAMILIES) {
    assert.ok(f.id && f.name && f.kind && f.summary && f.description, f.id + ' の説明項目が不足');
    if (f.representativeId) assert.ok(D.COMPOUNDS[f.representativeId], f.id + ' の代表IDがない');
    for (const id of f.members || []) assert.ok(D.COMPOUNDS[id], f.id + ' のmemberがない: ' + id);
    for (const id of f.relatedFamilyIds || []) assert.ok(D.familyById(id), f.id + ' のrelatedFamilyIdがない: ' + id);
    for (const id of f.relatedMaterialIds || []) assert.ok(D.materialById(id), f.id + ' のrelatedMaterialIdがない: ' + id);
    if (f.structure) assert.ok(['condensed', 'schematic', 'custom', 'projection', 'polymer'].includes(f.structure.type), f.id + ' の構造型が不正');
  }
  for (const id of ['pentene-class', 'hexene-class', 'pentyne-class', 'hexyne-class', 'phosphatidylcholine', 'phosphatidylethanolamine', 'phosphatidylserine', 'phosphatidylinositol', 'alkyl-sulfate']) {
    assert.ok(D.familyById(id), 'familyがない: ' + id);
  }
  for (const id of ['lignin', 'cellulose-xanthate', 'alkali-cellulose', 'dinitrocellulose', 'diacetylcellulose', 'novolac', 'resol', 'glyptal', 'collodion', 'ebonite', 'latex', 'schweizer-reagent', 'celluloid', 'salomethyl']) {
    assert.ok(D.materialById(id), '材料がない: ' + id);
  }
  assert.equal(D.materialById('novolac').of, 'phenol-resin');
  assert.equal(D.materialById('resol').of, 'phenol-resin');
  assert.equal(D.materialById('salomethyl').of, 'methyl-salicylate');
  assert.equal(D.materialById('dinitrocellulose').kind, 'variant');
  assert.equal(D.materialById('diacetylcellulose').kind, 'variant');
});

test('[other] category→familyのまとまりで全対象を選べる', () => {
  const categories = C.OTHER_CATEGORIES.map((c) => c.id);
  assert.ok(categories.includes('sugar'));
  assert.ok(categories.includes('materials'));
  assert.ok(categories.includes('organic-salt'));
  for (const cat of C.OTHER_CATEGORIES) {
    const groups = C.otherFamilies(cat.id);
    assert.ok(groups.length > 0, cat.id + ' のfamilyがない');
    for (const g of groups) {
      const ids = C.otherMembers(g.id);
      for (const id of ids) assert.ok(D.COMPOUNDS[id], g.id + ' のmemberがない: ' + id);
      for (const fid of g.familyIds || []) assert.ok(D.familyById(fid), g.id + ' のfamilyIdがない: ' + fid);
      for (const mid of g.materialIds || []) assert.ok(D.materialById(mid), g.id + ' のmaterialIdがない: ' + mid);
    }
  }
  assert.ok(C.otherMembers('monosaccharide').includes('glucose'));
  assert.ok(C.otherMembers('disaccharide').includes('isomaltose'));
  assert.ok(C.otherMembers('enzyme').includes('atpase'));
  assert.ok(C.otherMembers('fatty-acid').includes('docosahexaenoic-acid'));
  assert.ok(C.OTHER_GROUP_MAP.phospholipid.familyIds.includes('phosphatidylcholine'));
  assert.ok(C.OTHER_GROUP_MAP['regenerated-cellulose'].materialIds.includes('rayon'));
  assert.ok(C.OTHER_GROUP_MAP['synthetic-detergent'].ids.includes('las'));
  const materialReach = new Set();
  C.OTHER_GROUPS.forEach((g) => (g.materialIds || []).forEach((id) => materialReach.add(id)));
  for (const m of D.MATERIALS) assert.ok(materialReach.has(m.id), '材料が台帳・画面のfamilyから辿れない: ' + m.id);
});

/* ------------------------------------------------------------------
 * 索引
 * ------------------------------------------------------------------ */

test('[index] 431頁マニフェストのURL・title・節・種別・status・hash', () => {
  assert.equal(M.COUNTS.total, 431);
  assert.equal(M.PAGES.length, 431);
  assert.equal(M.COUNTS.bySource['idx-tryit'], 371);
  assert.equal(M.COUNTS.bySource['idx-kimika'], 60);
  assert.equal(M.CHAPTERS.length, 7);
  assert.equal(M.COUNTS.byKind.lesson, 127);
  for (const ch of M.CHAPTERS) {
    assert.equal(ch.expectedLessons, ch.obtainedLessons, ch.name + ' のlesson数が不一致');
    assert.match(ch.id, /^ch-\d+$/, '章のlogical IDがない');
    assert.equal(ch.url, undefined, '章の教材URLを配信しない');
  }
  const pageIds = new Set();
  for (const p of M.PAGES) {
    assert.match(p.id, /^idx-(?:tryit|kimika)-\d{3}$/, 'entry IDが不正: ' + p.id);
    assert.equal(pageIds.has(p.id), false, 'entry IDが重複: ' + p.id);
    pageIds.add(p.id);
    assert.equal(p.url, undefined, '教材URLを配信しない: ' + p.id);
    assert.ok(p.title && p.title.length > 0, p.id + ' のtitleがない');
    assert.ok(p.section, p.id + ' のsectionがない');
    assert.ok(p.type, p.id + ' のtypeがない');
    assert.equal(p.status, 200, p.id + ' のstatusが200でない');
    assert.match(p.hash, /^[0-9a-f]{64}$/, p.id + ' のhashが不正');
  }
  assert.equal(M.IMAGES.count, 1399);
  assert.equal(M.IMAGES.reviewed, false);
  assert.equal(M.VIDEOS.reviewed, false);
  assert.ok(M.LIMITS.some((t) => /画像/.test(t)));
});

test('[index] 65件の索引監査が全件解決する', () => {
  assert.equal(A.FINDINGS.length, 65);
  const result = A.audit(D);
  assert.deepEqual(result.missing, []);
  assert.equal(result.findings, 65);
  assert.deepEqual(result.byResolution, { compound: 40, family: 9, material: 13, variant: 2, inorganic: 1 });
  for (const f of A.FINDINGS) {
    assert.ok(f.term && f.kind && f.resolution, '必須項目がない');
    assert.ok(Array.isArray(f.sources) && f.sources.length > 0, f.term + ' のsource IDがない');
    for (const s of f.sources) assert.match(s, /^idx-(?:tryit|kimika)$/, f.term + ' のsource IDが不正');
    assert.equal(typeof f.sourceCount, 'number', f.term + ' のsourceCountがない');
    assert.ok(f.sourceCount > 0, f.term + ' のsourceCountが0');
    assert.equal(f.urls, undefined, f.term + ' にURL配列が残る');
    assert.equal(f.quote, undefined, f.term + ' に本文抜粋が残る');
    assert.ok(f.supplement, f.term + ' のsupplementがない');
    if (f.resolution === 'compound') assert.ok(D.COMPOUNDS[f.ref], f.term + ' の化合物IDがない');
    if (f.resolution === 'material' || f.resolution === 'variant') assert.ok(D.materialById(f.ref), f.term + ' の材料IDがない');
    if (f.resolution === 'family') assert.ok(D.familyById(f.ref), f.term + ' のfamily IDがない');
    if (f.resolution === 'inorganic') assert.equal(f.ref, null);
  }
  assert.ok(A.LIMITS.some((t) => /画像/.test(t)));
  assert.equal(A.EXCERPTS.distributed, false, '本文抜粋は配信しない');
  assert.equal(A.SOURCE_URLS.distributed, false, '教材URLは配信しない');
});

test('[index] 既存21資料・153原文mappingを維持する', () => {
  assert.equal(Object.keys(E.SOURCES).length, 21);
  assert.equal(E.ROWS.length, 153);
  const result = E.audit(D);
  assert.deepEqual(result.missing, []);
  assert.equal(result.rows, 153);
  assert.equal(result.sources, 21);
});

test('[index] マニフェストと監査の取得日・件数・要約が一致する', () => {
  assert.equal(M.RETRIEVED, '2026-11-09');
  assert.equal(A.RETRIEVED, '2026-11-09');
  assert.equal(A.SUMMARY.findings, 65);
  assert.equal(A.SUMMARY.registered, 64);
  assert.equal(A.SUMMARY.excludedInorganic, 1);
  assert.equal(A.SUMMARY.registered + A.SUMMARY.excludedInorganic, 65);
  assert.equal(M.COUNTS.total, M.PAGES.length);
  assert.equal(M.COUNTS.byKind.lesson, 127);
  assert.equal(M.COUNTS.byKind.article, 60);
});

test('[static] ローカルリンク・台帳アンカーが実在する', () => {
  for (const file of ['index.html', 'ledger.html']) {
    const html = read(file);
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|#|mailto:|data:)/.test(ref)) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      const target = path.resolve(APP, clean);
      assert.equal(fs.existsSync(target), true, file + ' のリンク先がない: ' + ref);
    }
  }
  const ledger = read('ledger.html');
  for (const id of D.FAMILIES.map((f) => 'f-' + f.id).concat(D.MATERIALS.map((m) => 'm-' + m.id))) {
    assert.ok(ledger.includes('id="' + id + '"') || ledger.includes("'" + id + "'") || ledger.includes('f-') || ledger.includes('m-'), '台帳アンカー: ' + id);
  }
});

test('[search] 全ID・別名・材料・familyを名前で引ける', () => {
  assert.equal(C.search('エタノール').some((r) => r.id === 'ethanol'), true);
  assert.equal(C.search('再生セルロース').some((r) => r.id === 'rayon'), true);
  assert.equal(C.search('ホスファチジルコリン').some((r) => r.id === 'phosphatidylcholine'), true);
  assert.equal(C.search('サロメチール').some((r) => r.id === 'salomethyl'), true);
  assert.equal(C.search('サリチル酸メチル').some((r) => r.id === 'methyl-salicylate'), true);
  assert.equal(C.search('ABS樹脂').some((r) => r.id === 'abs'), true);
  assert.equal(C.search('合成洗剤').some((r) => r.id === 'synthetic-detergent'), true);
  assert.equal(C.search('石けん').some((r) => r.id === 'fatty-acid-salt'), true);
  assert.equal(D.aliasTarget('サロメチール'), null, '商品名を純物質の別名にしない');
  assert.equal(D.aliasTarget('ABS樹脂'), null, '材料・商品名を純物質の別名にしない');
  assert.equal(D.searchTermsFor('methyl-salicylate').includes('サロメチール'), false, '商品名を純物質の検索語に混ぜない');
  assert.equal(D.searchTermsFor('methyl-salicylate').includes('サリチル酸メチル'), true);
  assert.equal(D.aliasTarget('エタノール'), 'ethanol');
  assert.equal(D.materialByTerm('再生セルロース').id, 'rayon');
  assert.equal(D.familyByTerm('phosphatidylcholine').id, 'phosphatidylcholine');
  for (const id of Object.keys(D.COMPOUNDS)) {
    const route = C.routeFor(id);
    assert.ok(route, id + ' のrouteがない');
    assert.ok(['chain', 'ring', 'other'].includes(route.mode), id + ' のmodeが不正');
  }
  for (const id of ['lignin', 'novolac', 'resol', 'collodion', 'ebonite', 'latex', 'celluloid', 'salomethyl']) {
    assert.ok(C.search(D.materialById(id).name).some((r) => r.id === id), id + ' を名前で引けない');
  }
});

test('[search] 索引監査の全用語を名前検索で引ける', () => {
  for (const f of A.FINDINGS) {
    const hits = C.search(f.term);
    assert.ok(hits.length > 0, '索引用語を引けない: ' + f.term);
  }
});

/* ------------------------------------------------------------------
 * 静的配線
 * ------------------------------------------------------------------ */

test('[chain] 157件すべてが検証済みexact graphからデスクリプタを持つ', () => {
  const chainIds = Object.keys(D.COMPOUNDS).filter((id) => C.classify(id).mode === 'chain');
  assert.equal(chainIds.length, 157);
  assert.equal(C.CHAIN_DESCRIPTOR_LIST.length, 47, '位置異性体4組＋C0の直結を分離した実測デスクリプタ数');
  assert.deepEqual(C.CHAIN_DESCRIPTOR_WARNINGS, []);
  // 件数だけで受理しない: 全デスクリプタのexact tree canonicalが相異なり、
  // 同じkeyへ別構造が混ざっていないことを確認する。
  const exactKeys = new Set(C.CHAIN_DESCRIPTOR_LIST.map((d) => d.uniqueFragments.map((f) => f.skeleton + '|' + f.doubleBonds + '|' + f.tripleBonds + 'x' + (f.count || 1)).join('*')));
  assert.equal(exactKeys.size, C.CHAIN_DESCRIPTOR_LIST.length, 'exact canonical multisetが重複しない');
  assert.equal(new Set(C.CHAIN_DESCRIPTOR_LIST.map((d) => d.id)).size, C.CHAIN_DESCRIPTOR_LIST.length);
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    assert.ok(d.key && d.id, 'descriptor key/id');
    if (d.id === 'd-direct-c0') assert.equal(d.uniqueFragments.length, 0, '官能基どうしの直結はH断片にしない');
    else assert.ok(d.uniqueFragments.length > 0, d.id + ' の断片');
    assert.equal(d.compoundIds.length > 0, true, d.id + ' の化合物');
  }
  const sources = { build: 0, condensed: 0, manual: 0 };
  for (const id of chainIds) {
    const c = D.COMPOUNDS[id];
    const g = X.exactGraphFor(c);
    assert.ok(g.graph, id + ': exact graph がない（' + g.reason + '）');
    sources[g.source] = (sources[g.source] || 0) + 1;
    assert.equal(R.formulaOfGraph(g.graph), c.formula, id + ': exact graphの分子式が不一致');
    assert.equal(R._internal.checkValence(g.graph).ok, true, id + ': exact graphの結合価');
    const d = C.chainDescriptorFor(id);
    assert.ok(d, id + ': 鎖式デスクリプタがない');
    assert.equal(d.descriptorId, C.chainDescriptorById(d.descriptorId).id);
    assert.equal(d.formulaOk, true, id + ': graph分子式の独立照合');
    assert.equal(d.independentPartial, d.partialC, id + ': 部分C数（分子全体C－functional core C）の独立照合');
    assert.equal(d.fragments.reduce((n, f) => n + f.carbonCount, 0), d.partialC, id + ': 断片C数の合計');
    const route = C.routeFor(id);
    assert.equal(route.mode, 'chain');
    assert.equal(route.partialC, d.partialC, id + ': routeのpartialC');
    assert.equal(route.shape, d.descriptorId, id + ': routeのshape');
    assert.ok(C.chainDescriptorById(route.shape), id + ': routeのshapeが実在');
  }
  assert.deepEqual(sources, { build: 83, condensed: 71, manual: 3 });
  assert.equal(X.exactGraphFor(D.COMPOUNDS['maleic-acid']).source, 'manual');
  assert.equal(X.exactGraphFor(D.COMPOUNDS['fumaric-acid']).source, 'manual');
  assert.equal(X.exactGraphFor(D.COMPOUNDS.eicosane).source, 'manual');
  const reached = new Set();
  for (const d of C.CHAIN_DESCRIPTOR_LIST) d.compoundIds.forEach((id) => reached.add(id));
  assert.equal(reached.size, 157, '全157件が①から到達可能');
});

test('[chain] 34件の代表mapping（部分C数・断片数・ラベル）', () => {
  const expected = {
    ethanol: [2, 1, 'エタン由来'],
    methanol: [1, 1, 'メタン由来'],
    'acetic-acid': [1, 1, 'メタン由来'],
    'propionic-acid': [2, 1, 'エタン由来'],
    acetone: [2, 2, 'メチル基×2'],
    'methyl-acetate': [2, 2, 'メチル基×2'],
    'methyl-formate': [1, 2, 'H＋メチル基'],
    acetonitrile: [1, 1, 'メタン由来'],
    'acetic-anhydride': [2, 2, 'メチル基×2'],
    'dimethyl-ether': [2, 2, 'メチル基×2'],
    dimethylamine: [2, 2, 'メチル基×2'],
    trimethylamine: [3, 3, 'メチル基×3'],
    triacetin: [6, 4, 'プロパン骨格＋メチル基×3'],
    'pyruvic-acid': [1, 1, 'メタン由来'],
    'adipoyl-chloride': [4, 1, 'ブタン由来'],
    'oxalic-acid': [0, 0, '官能基どうしが直接結合'],
    'formic-acid': [0, 1, 'Hが結合'],
    formaldehyde: [0, 1, 'Hが結合'],
    glycerol: [3, 1, 'プロパン由来'],
    'ethylene-glycol': [2, 1, 'エタン由来'],
    'propylene-glycol': [3, 1, 'プロパン由来'],
    'lactic-acid': [2, 1, 'エタン由来'],
    'citric-acid': [3, 1, 'プロパン由来'],
    'tartaric-acid': [2, 1, 'エタン由来'],
    'ethyl-acetate': [3, 2, 'エチル基＋メチル基'],
    'methyl-propionate': [3, 2, 'エチル基＋メチル基'],
    'butan-1-ol': [4, 1, 'ブタン由来'],
    '2-methylpropan-1-ol': [4, 1, '2-メチルプロパン由来'],
    'but-1-ene': [4, 1, 'ブタ-1-エン由来'],
    isobutene: [4, 1, '2-メチルプロペン由来'],
    'dimethyl-oxalate': [2, 2, 'メチル基×2'],
    '1,3-dibromopropane': [3, 1, 'プロパン由来'],
    diethylenetriamine: [4, 2, 'エチル基×2'],
    'propan-1-ol': [3, 1, 'プロパン由来']
  };
  assert.equal(Object.keys(expected).length, 34);
  for (const [id, want] of Object.entries(expected)) {
    const d = C.chainDescriptorFor(id);
    assert.equal(d.partialC, want[0], id + ' の部分C数');
    assert.equal(d.fragments.reduce((n, f) => n + (f.carbonCount ? 1 : 1), 0), want[1], id + ' の断片数');
    assert.equal(C.chainDescriptorLabel(d.descriptorId), want[2], id + ' のラベル');
  }
  assert.equal(C.chainDescriptorFor('triacetin').groups.ester, 3, 'triacetinはエステル3つ');
  assert.equal(C.chainDescriptorFor('triacetin').independentPartial, 6, '総C9－カルボニルC3＝C6（C3ではない）');
  assert.equal(C.chainDescriptorFor('pyruvic-acid').independentPartial, 1, 'ピルビン酸はC1');
  assert.equal(C.chainDescriptorFor('adipoyl-chloride').independentPartial, 4, 'アジポイルクロリドはブタンC4');
  const ethylFormate = C.chainDescriptorFor('ethyl-formate');
  assert.equal(ethylFormate.partialC, 2);
  assert.equal(C.chainDescriptorLabel(ethylFormate.descriptorId), 'H＋エチル基', 'ギ酸エチルはH＋エチル');
});

test('[chain] アルデヒドだけ −CHO を主表示にし、①の炭化水素部分・分類ID・エステルは変えない', () => {
  // ①の炭化水素部分デスクリプタ → ②アルデヒド（methyl C1 / ethyl C2 / H C0）。
  const methyl = C.chainDescriptorFor('ethanal');
  assert.equal(methyl.partialC, 1, 'メチルC1');
  assert.equal(methyl.totalC, 2, 'エタナールは分子全体C2');
  assert.equal(methyl.coreC, 1, 'CHOの炭素は官能基側');
  assert.equal(methyl.descriptorId, 'd-methane-c1', 'CHO内のaldehydic Hは①のHにしない');
  assert.equal(C.chainDescriptorLabel(methyl.descriptorId), 'メタン由来');
  assert.equal(methyl.coreHydrogen.rHydrogen, false);
  assert.equal(methyl.coreHydrogen.details[0].type, 'aldehyde');
  assert.equal(methyl.coreHydrogen.details[0].hydrogens, 1, 'CHO固定H1');
  assert.equal(methyl.coreHydrogen.details[0].rHydrogens, 0, 'CHO固定HをRに数えない');
  assert.deepEqual(C.chainIdsForDescriptor(methyl.descriptorId, 'aldehyde'), ['ethanal']);

  const ethyl = C.chainDescriptorFor('propanal');
  assert.equal(ethyl.partialC, 2, 'エチルC2');
  assert.equal(ethyl.totalC, 3, 'プロパナールは分子全体C3');
  assert.equal(ethyl.coreC, 1);
  assert.equal(ethyl.descriptorId, 'd-ethane-c2', 'CHO内のaldehydic Hは①のHにしない');
  assert.equal(C.chainDescriptorLabel(ethyl.descriptorId), 'エタン由来');
  assert.equal(ethyl.coreHydrogen.rHydrogen, false);
  assert.deepEqual(C.chainIdsForDescriptor(ethyl.descriptorId, 'aldehyde'), ['propanal']);

  const hydrogen = C.chainDescriptorFor('formaldehyde');
  assert.equal(hydrogen.partialC, 0, 'H（炭化水素基なし）');
  assert.equal(hydrogen.totalC, 1, 'ホルムアルデヒドは分子全体C1');
  assert.equal(hydrogen.coreC, 1);
  assert.equal(hydrogen.descriptorId, 'd-h-c0');
  assert.equal(hydrogen.coreHydrogen.details[0].fixedHydrogens, 1, 'CHO固定H1');
  assert.equal(hydrogen.coreHydrogen.details[0].rHydrogens, 1, 'HCHOの残りH1はR=H');
  assert.deepEqual(C.chainIdsForDescriptor(hydrogen.descriptorId, 'aldehyde'), ['formaldehyde']);

  // CHOの炭素を二重に引かない（部分C = 全体C − coreC = 断片Cの合計）。
  for (const [id, d] of [['ethanal', methyl], ['propanal', ethyl], ['formaldehyde', hydrogen]]) {
    assert.equal(d.partialC, d.totalC - d.coreC, id + ' の二重減算なし');
    assert.equal(d.independentPartial, d.partialC, id + ' の独立照合');
    assert.equal(d.fragments.reduce((n, f) => n + f.carbonCount, 0), d.partialC, id + ' の断片C合計');
    assert.equal(d.role, 'aldehyde', id + ' の結果roleはアルデヒド');
    assert.equal(C.classify(id).family, 'aldehyde', id + ' のfamily IDはaldehydeのまま');
    const route = C.routeFor(id);
    assert.equal(route.family, 'aldehyde', id + ' の旧route family');
    assert.equal(route.shape, d.descriptorId, id + ' の旧route shape');
    assert.equal(route.partialC, d.partialC, id + ' の旧route partialC');
  }

  // ②は −CHO を主表示、分類名「アルデヒド」を下段に。結果の分類名も保持。
  assert.deepEqual(C.chainFamilyPick('aldehyde', 'd-methane-c1'), {
    main: '−CHO',
    sub: 'アルデヒド',
    note: '末端のカルボニル基。R−C(=O)−H。'
  });
  assert.equal(C.CHAIN_FAMILY_LABEL.aldehyde, 'アルデヒド', '結果分類名はアルデヒドのまま');
  assert.equal(C.chainFamilyPick('ketone', 'd-propane-c3').main, '−CO−');
  assert.equal(C.chainFamilyPick('carboxylic', 'd-propane-c3').main, '−COOH');
  assert.equal(C.chainFamilyPick('ester', 'd-ethane-c2').main, '−COO−');
  assert.equal(C.chainFamilyPick('anhydride', 'd-propane-c3').main, '−CO−O−CO−');
  assert.equal(C.chainFamilyPick('amine', 'd-ethane-c2').main, '−NH₂ など', '第二・第三級を排除しない');
  assert.equal(C.chainFamilyPick('alkane', 'd-methane-c1').main, 'CH₄', 'C1アルカンにC−Cを要求しない');
  for (const family of C.CHAIN_FAMILIES) {
    const pick = C.chainFamilyPick(family.id, 'd-ethane-c2');
    assert.ok(pick.main, family.id + ' の上段');
    assert.ok(pick.sub, family.id + ' の下段');
    assert.equal(/C\(=O\)/.test(pick.main), false, family.id + ' の選択カードでC(=O)括弧表記を使わない');
    const sub = family.id === 'amine' ? 'アミン（1〜3級）'
      : (family.id === 'alcohol' ? 'アルコール'
        : (family.id === 'amino-alcohol' ? 'アミノアルコール' : C.CHAIN_FAMILY_LABEL[family.id]));
    assert.equal(pick.sub, sub);
  }
  assert.deepEqual(C.chainFamiliesForDescriptor('d-methane-c1').map((f) => f.id).sort(),
    ['alcohol', 'aldehyde', 'alkane', 'amine', 'carboxylic', 'halogen', 'nitrile', 'nitro'],
    'methyl選択からアルデヒドとカルボン酸などを②で選べる');
  assert.equal(C.chainDescriptorFor('ethanal').descriptorId, C.chainDescriptorFor('acetic-acid').descriptorId,
    'methyl+CHOとmethyl+COOHは同じ①methyl選択');
  assert.equal(C.chainDescriptorFor('methanol').descriptorId, C.chainDescriptorFor('ethanal').descriptorId);
  assert.notEqual(C.chainDescriptorFor('ethanal').descriptorId, C.chainDescriptorFor('propanal').descriptorId,
    'エタナールを別shapeへ追い出さない（C1 methylのまま）');
  // formateのcarbonyl C–HはR=Hとして①に必要。CHO固定Hとは別扱い。
  const formic = C.chainDescriptorFor('formic-acid');
  assert.equal(formic.descriptorId, 'd-h-c0');
  assert.equal(formic.coreHydrogen.details[0].type, 'carboxyl');
  assert.equal(formic.coreHydrogen.details[0].rHydrogens, 1, 'HCOOHのHはR=H');
  const methylFormate = C.chainDescriptorFor('methyl-formate');
  assert.equal(methylFormate.descriptorId, 'd-h+methane-c1');
  assert.equal(methylFormate.coreHydrogen.details[0].type, 'ester');
  assert.equal(methylFormate.coreHydrogen.details[0].rHydrogens, 1, 'HCOORのHはR=H');
  assert.ok(methylFormate.fragments.some((f) => f.isHydrogen), 'formateのH断片を失わない');
  assert.equal(C.chainDescriptorFor('ethyl-formate').descriptorId, 'd-ethane+h-c2');
  assert.equal(C.chainDescriptorFor('propyl-formate').descriptorId, 'd-h+propane-c3');

  // アルデヒド以外も「上段=簡単な形／下段=分類名」に統一（C(=O)は使わない）。
  assert.equal(C.classify('methyl-acetate').family, 'ester', 'エステルfamilyは不変');
  assert.equal(C.chainDescriptorFor('methyl-acetate').descriptorId, 'd-methanex2-c2', 'エステルdescriptorは不変');
  assert.equal(C.chainDescriptorLabel('d-methanex2-c2'), 'メチル基×2');
  assert.equal(C.chainDescriptorFor('methyl-acetate').role, 'monoester');
  assert.deepEqual(C.chainIdsForDescriptor('d-methanex2-c2', 'ester'), ['methyl-acetate', 'dimethyl-oxalate'],
    '同じshapeのエステルは結果カードで区別する');
  assert.equal(C.chainDescriptorFor('ethyl-acetate').descriptorId, 'd-ethane+methane-c3',
    'エステルのacyl/alkoxyは①で分けない既存挙動');

  const js = read('app.js');
  const familyFn = js.slice(js.indexOf('function renderChainFamilyList'), js.indexOf('function genCard'));
  assert.ok(familyFn.includes('C.chainFamilyPick(f.id, state.chainShape)'), '②は分類ごとの表示を使う');
  assert.ok(familyFn.includes('pick.main') && familyFn.includes('pick.sub'));
  assert.equal(familyFn.includes('state.chainShape ='), false, '②から①を書き換えない');
  const previewFn = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.equal(previewFn.includes('O–H ではありません'), false, 'O–H説明を常時繰り返さない');
  assert.ok(js.includes("aldehyde: ['R−C(=O)−H'"), '一般構造カードも同じ表記');
  assert.ok(read('index.html').includes('O–Hではありません'), '詳細折畳みにO–H説明を残す');
  const leftFn = js.slice(js.indexOf('function renderChainLeftFigure'), js.indexOf('function renderChainFamilyList'));
  assert.equal(leftFn.includes('CHO'), false, '左①はCHOを描かず骨格だけ');
  const resultFn = js.slice(js.indexOf('function renderChainResults'), js.indexOf('/* ------------------------------------------------------------------\n   * 芳香族・環式'));
  assert.ok(resultFn.includes('C.CHAIN_FAMILY_LABEL[state.chainFamily]'), '結果見出しは分類名（アルデヒド）');
  assert.equal((resultFn.match(/class="oc-cards/g) || []).length, 1, '2列グリッドを維持');
});

test('[chain] −CHO固定Hとギ酸/ギ酸エステルR=Hを独立に分離する', () => {
  const cases = [
    ['ethanal', 'd-methane-c1', 'メタン由来', 'aldehyde', 1, 0, false],
    ['propanal', 'd-ethane-c2', 'エタン由来', 'aldehyde', 1, 0, false],
    ['formaldehyde', 'd-h-c0', 'Hが結合', 'aldehyde', 1, 1, true],
    ['formic-acid', 'd-h-c0', 'Hが結合', 'carboxyl', 0, 1, true],
    ['methyl-formate', 'd-h+methane-c1', 'H＋メチル基', 'ester', 0, 1, true],
    ['ethyl-formate', 'd-ethane+h-c2', 'H＋エチル基', 'ester', 0, 1, true]
  ];
  for (const [id, shape, label, coreType, fixed, rH, needH] of cases) {
    const d = C.chainDescriptorFor(id);
    assert.equal(d.descriptorId, shape, id + ' のshape');
    assert.equal(C.chainDescriptorLabel(shape), label, id + ' のlabel');
    assert.equal(d.coreHydrogen.details[0].type, coreType, id + ' のcore type');
    assert.equal(d.coreHydrogen.details[0].fixedHydrogens, fixed, id + ' の固定H');
    assert.equal(d.coreHydrogen.details[0].rHydrogens, rH, id + ' のR=H');
    assert.equal(d.coreHydrogen.rHydrogen, needH, id + ' のH断片要否');
    assert.equal(d.fragments.some((f) => f.isHydrogen), needH, id + ' のH断片');
  }
  assert.equal(C.chainDescriptorFor('ethanal').descriptorId, C.chainDescriptorFor('methanol').descriptorId);
  assert.equal(C.chainDescriptorFor('ethanal').descriptorId, C.chainDescriptorFor('acetic-acid').descriptorId);
  assert.equal(C.chainDescriptorFamilyValid('d-methane-c1', 'aldehyde'), true);
  assert.equal(C.chainDescriptorFamilyValid('d-methane-c1', 'carboxylic'), true);
  assert.deepEqual(C.chainIdsForDescriptor('d-methane-c1', 'aldehyde'), ['ethanal']);
  assert.ok(C.chainIdsForDescriptor('d-methane-c1', 'carboxylic').includes('acetic-acid'));
  assert.equal(C.chainDescriptorFor('ethanal').descriptorId !== C.chainDescriptorFor('propanal').descriptorId, true);
});

test('[chain] 同じ骨格はまとめ、分岐・不飽和の別骨格は分ける', () => {
  const shape = (id) => C.chainDescriptorFor(id).descriptorId;
  assert.equal(shape('ethanol'), shape('ethane'));
  assert.equal(shape('propan-1-ol'), shape('propan-2-ol'));
  assert.equal(shape('butan-1-ol'), shape('butan-2-ol'));
  assert.notEqual(shape('butan-1-ol'), shape('2-methylpropan-1-ol'), 'イソブタノールはイソブタン別');
  assert.equal(shape('2-methylpropan-1-ol'), shape('2-methylpropan-2-ol'));
  assert.notEqual(shape('but-1-ene'), shape('but-2-ene'), 'ブタ-1-エンとブタ-2-エンは結合位置が違う別骨格');
  assert.notEqual(shape('but-1-yne'), shape('but-2-yne'), 'ブタ-1-インとブタ-2-インは別骨格');
  assert.notEqual(shape('pent-1-ene'), shape('pent-2-ene'), 'ペンタ-1-エンとペンタ-2-エンは別骨格');
  assert.notEqual(shape('pent-1-yne'), shape('pent-2-yne'), 'ペンタ-1-インとペンタ-2-インは別骨格');
  assert.notEqual(shape('but-1-ene'), shape('isobutene'), 'イソブテンは別骨格');
  assert.equal(shape('ethyl-acetate'), shape('methyl-propionate'), 'エステルのacyl/alkoxyは①では分けない');
  assert.deepEqual(
    C.chainIdsForDescriptor(shape('ethyl-acetate'), 'ester').sort(),
    ['ethyl-acetate', 'methyl-propionate'],
    '同じmethyl+ethylの結果異性体として両表示'
  );
  assert.notEqual(C.chainDescriptorLabel(shape('ethane')), C.chainDescriptorLabel(shape('ethene')));
  assert.notEqual(C.chainDescriptorLabel(shape('ethene')), C.chainDescriptorLabel(shape('ethyne')));
  const frag = (id) => X.descriptorFor(id).fragments[0];
  assert.equal(X.sameFragmentShape(frag('but-1-ene'), frag('but-2-ene')), false, 'edge order位置を含む完全canonicalで別');
  assert.equal(X.sameFragmentShape(frag('pent-1-yne'), frag('pent-2-yne')), false);
  assert.equal(X.sameFragmentShape(frag('butane'), frag('isobutane')), false);
  assert.equal(X.sameFragmentShape(frag('ethanol'), frag('ethane')), true);
  assert.equal(frag('butane').skeleton !== frag('isobutane').skeleton, true, '同原子数でも完全canonical符号で区別');
  assert.equal(frag('but-1-ene').skeleton !== frag('but-2-ene').skeleton, true, 'bondorder位置をcanonicalに含める');
  assert.equal(X.sameFragmentShape(
    { wl: 'same-hash', skeleton: '(())', doubleBonds: 0, tripleBonds: 0 },
    { wl: 'same-hash', skeleton: '(()())', doubleBonds: 0, tripleBonds: 0 }
  ), false, 'WL hashが同じでも実同型でなければ別断片');
  const c2 = C.chainShapeOptions(2).map((d) => d.label);
  assert.deepEqual(c2.slice(0, 4), ['エタン由来', 'エテン由来', 'エチン由来', 'メチル基×2']);
  const c0 = C.chainShapeOptions(0);
  assert.equal(c0.length, 2, 'C0は「Hが結合」と「官能基どうしが直接結合」を分ける');
  assert.deepEqual(c0.map((d) => d.id), ['d-direct-c0', 'd-h-c0']);
  assert.deepEqual(c0.map((d) => d.label), ['官能基どうしが直接結合', 'Hが結合']);
  assert.deepEqual(c0[0].compoundIds.sort(), ['oxalic-acid']);
  assert.deepEqual(c0[1].compoundIds.sort(), ['formaldehyde', 'formic-acid']);
});

test('[chain] 4組の位置異性体を別shape・別label・別親図にし、原子順序に依存しない', () => {
  const pairs = [
    ['but-1-ene', 'but-2-ene', 'ブタ-1-エン', 'ブタ-2-エン'],
    ['but-1-yne', 'but-2-yne', 'ブタ-1-イン', 'ブタ-2-イン'],
    ['pent-1-ene', 'pent-2-ene', 'ペンタ-1-エン', 'ペンタ-2-エン'],
    ['pent-1-yne', 'pent-2-yne', 'ペンタ-1-イン', 'ペンタ-2-イン']
  ];
  for (const [a, b, la, lb] of pairs) {
    const da = C.chainDescriptorFor(a);
    const db = C.chainDescriptorFor(b);
    assert.notEqual(da.descriptorId, db.descriptorId, a + '/' + b + ' のshape');
    assert.equal(C.chainDescriptorLabel(da.descriptorId), la + '由来', a + ' のlabel');
    assert.equal(C.chainDescriptorLabel(db.descriptorId), lb + '由来', b + ' のlabel');
    assert.deepEqual(C.chainIdsForDescriptor(da.descriptorId, 'alkene').concat(C.chainIdsForDescriptor(da.descriptorId, 'alkyne')), [a]);
    assert.deepEqual(C.chainIdsForDescriptor(db.descriptorId, 'alkene').concat(C.chainIdsForDescriptor(db.descriptorId, 'alkyne')), [b]);
    const ta = C.chainDescriptorPreview(da.descriptorId)[0];
    const tb = C.chainDescriptorPreview(db.descriptorId)[0];
    assert.equal(ta.label, la, a + ' の親図label');
    assert.equal(tb.label, lb, b + ' の親図label');
    const ordersA = ta.structure.bonds.filter((x) => x.order > 1).map((x) => x.a + '-' + x.b + ':' + x.order);
    const ordersB = tb.structure.bonds.filter((x) => x.order > 1).map((x) => x.a + '-' + x.b + ':' + x.order);
    assert.notDeepEqual(ordersA, ordersB, a + '/' + b + ' の親図の多重結合位置');
    assert.equal(ordersA.length, 1);
    assert.equal(ordersB.length, 1);
  }
  for (const oldShape of ['d-butene-c4', 'd-butyne-c4', 'd-pentene-c5', 'd-pentyne-c5']) {
    assert.equal(C.chainDescriptorById(oldShape), null, '誤統合した旧shapeIDを残さない: ' + oldShape);
  }
  // 結合位置が末端か内部かまで確認する（親図の多重結合位置）。
  function terminalMultiple(id) {
    const d = C.chainDescriptorFor(id);
    const t = C.chainDescriptorPreview(d.descriptorId)[0];
    const b = t.structure.bonds.filter((x) => x.order > 1)[0];
    const degree = (v) => t.structure.bonds.filter((x) => x.a === v || x.b === v).length;
    return degree(b.a) === 1 || degree(b.b) === 1;
  }
  for (const id of ['but-1-ene', 'but-1-yne', 'pent-1-ene', 'pent-1-yne']) {
    assert.equal(terminalMultiple(id), true, id + ' の多重結合は末端');
  }
  for (const id of ['but-2-ene', 'but-2-yne', 'pent-2-ene', 'pent-2-yne']) {
    assert.equal(terminalMultiple(id), false, id + ' の多重結合は内部');
  }
  // atomの並び順を変えても完全canonicalが一致する（root全頂点min）。
  const g = R.buildStructure({ type: 'skeleton', skeleton: 'isopentane' });
  const adj = X._internal.atomAdjacency(g);
  const coreSet = {};
  const order = g.atoms.map((_, i) => i);
  const info1 = X._internal.componentInfo(order, g, adj, coreSet);
  const shape1 = X._internal.componentShape(order, g, adj, info1);
  const reversed = order.slice().reverse();
  const info2 = X._internal.componentInfo(reversed, g, adj, coreSet);
  const shape2 = X._internal.componentShape(reversed, g, adj, info2);
  assert.equal(shape1.key, shape2.key, '頂点順序に依存しない');
  assert.equal(shape1.skeleton, shape2.skeleton);
});

test('[chain] 多官能28件のroleとC数をgraphで確認する', () => {
  const roles = {
    'ethylene-glycol': 'polyol', glycerol: 'polyol', 'propylene-glycol': 'polyol',
    ethanolamine: 'amino-alcohol',
    'lactic-acid': 'hydroxy-acid',
    'malic-acid': 'hydroxy-polycarboxy', 'tartaric-acid': 'hydroxy-polycarboxy', 'citric-acid': 'hydroxy-polycarboxy',
    'pyruvic-acid': 'keto-acid',
    'oxalic-acid': 'dicarboxy', 'malonic-acid': 'dicarboxy', 'succinic-acid': 'dicarboxy',
    'glutaric-acid': 'dicarboxy', 'adipic-acid': 'dicarboxy', 'maleic-acid': 'dicarboxy', 'fumaric-acid': 'dicarboxy',
    'adipoyl-chloride': 'acid-chloride',
    'dichloromethane': 'multihalogen', chloroform: 'multihalogen', 'carbon-tetrachloride': 'multihalogen',
    iodoform: 'multihalogen', '1,2-dibromoethane': 'multihalogen', '1,2-dibromoethene': 'multihalogen',
    '1,1,2,2-tetrabromoethane': 'multihalogen',
    '1,3-dibromopropane': 'multihalogen',
    triacetin: 'triester',
    'dimethyl-oxalate': 'diester',
    diethylenetriamine: 'amine-1-2'
  };
  assert.equal(Object.keys(roles).length, 28);
  for (const [id, role] of Object.entries(roles)) {
    assert.equal(C.chainRoleFor(id), role, id + ' のrole');
    assert.equal(C.chainDescriptorFor(id).role, role);
    assert.equal(C.classify(id).mode, 'chain', id + ' をotherへ逃がさない');
  }
  assert.equal(C.chainDescriptorFor('triacetin').groups.ester, 3);
  assert.equal(C.chainDescriptorFor('adipoyl-chloride').groups.acidChloride, 2);
  assert.equal(C.chainDescriptorFor('oxalic-acid').groups.carboxyl, 2);
  assert.equal(C.chainDescriptorFor('pyruvic-acid').groups.carboxyl, 1);
  assert.equal(C.chainDescriptorFor('pyruvic-acid').groups.ketone, 1);
  assert.equal(C.chainDescriptorFor('dimethylamine').groups.amineDegrees[2], 1);
  assert.equal(C.chainDescriptorFor('trimethylamine').groups.amineDegrees[3], 1);
  assert.equal(C.chainDescriptorFor('glycerol').groups.hydroxyl, 3);
  assert.equal(C.chainDescriptorFor('dimethyl-oxalate').groups.ester, 2, 'dimethyl-oxalateはジエステル');
  assert.equal(C.chainRoleFor('dimethyl-oxalate'), 'diester');
  assert.notEqual(C.chainRoleFor('dimethyl-oxalate'), 'monoester');
  assert.equal(C.chainRoleLabel('diester'), '二価エステル（ジエステル）');
  assert.deepEqual(C.chainDescriptorFor('diethylenetriamine').groups.amineDegrees, { 1: 2, 2: 1, 3: 0 });
  assert.equal(C.chainRoleFor('diethylenetriamine'), 'amine-1-2');
  assert.equal(C.chainRoleLabel('amine-1-2'), '第一級アミン×2・第二級アミン×1');
  const appJs = read('app.js');
  assert.ok(appJs.includes("diester: ['R–COO"), '②previewにジエステルの一般形');
  assert.ok(appJs.includes("'amine-1-2': ['H₂N–R–NH–R′–NH₂ など'"), '②previewに混合級アミンの一般形');
  const c0Roles = C.chainDescriptorRoles('d-direct-c0', 'carboxylic');
  assert.deepEqual(c0Roles.map((r) => r.role), ['dicarboxy'], 'シュウ酸はC0の直結shape');
  assert.equal(c0Roles.find((r) => r.role === 'dicarboxy').label, '二価カルボン酸（2COOH）');
  assert.deepEqual(C.chainDescriptorRoles('d-h-c0', 'carboxylic').map((r) => r.role), ['monocarboxy'], 'ギ酸はHが結合');
  const c3Roles = C.chainDescriptorRoles('d-propane-c3', 'carboxylic');
  assert.ok(c3Roles.length > 1, '一価の一般式だけを当てはめない');
  assert.ok(c3Roles.some((r) => r.role === 'monocarboxy'));
  assert.ok(c3Roles.some((r) => r.role === 'dicarboxy'));
  assert.ok(c3Roles.some((r) => r.role === 'hydroxy-polycarboxy'));
});

test('[chain] 全157件の①到達と全427件のroute維持・旧API互換', () => {
  const chainIds = Object.keys(D.COMPOUNDS).filter((id) => C.classify(id).mode === 'chain');
  const reach = new Set();
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    assert.ok(C.chainPartialOptions().includes(d.partialC));
    for (const id of d.compoundIds) reach.add(id);
  }
  assert.equal(reach.size, chainIds.length);
  for (const id of Object.keys(D.COMPOUNDS)) {
    const route = C.routeFor(id);
    assert.ok(route, id + ' のrouteがない');
    assert.equal(route.focus, id);
    if (route.mode === 'chain') {
      assert.ok(route.partialC !== null && route.partialC !== undefined, id + ' のpartialC');
      assert.ok(route.shape, id + ' のshape');
    }
  }
  assert.equal(C.chainIds('amine', 2).sort().join(','), 'dimethylamine,ethylamine');
  assert.ok(C.allCarbonOptions().includes(2));
  assert.equal(C.chainIdsFor('ether', 2, 'saturated').length, 1);
  assert.equal(C.chainFamilyValid('ether', 1, 'saturated'), false);
  assert.equal(C.structureCondition('acetone'), 'saturated');
  assert.deepEqual(C.auditCoverage().missing, []);
  assert.equal(C.auditCoverage().modes.chain, 157);
  const ledger = read('ledger.js');
  assert.ok(ledger.includes('cpartial'));
  assert.ok(ledger.includes('route.partialC'));
  assert.ok(ledger.includes('chainDescriptorLabel'));
});

test('[chain] ①previewは親炭化水素を明示Hの構造式で分離し、②は一般fragmentのみ', () => {
  const methyl2 = C.chainDescriptorPreview('d-methanex2-c2');
  assert.equal(methyl2.length, 2, 'メチル基×2は2枚に分ける');
  assert.deepEqual(methyl2.map((t) => t.label), ['メチル基', 'メチル基']);
  for (const tile of methyl2) {
    assert.equal(tile.kind, 'hydrocarbon');
    assert.equal(tile.figure.kind, 'graph', '選択後の①は文字式ではなく構造式');
    assert.equal(tile.marks.length, 1, '接続点metadataを内部に保持する');
    const svg = R.renderStructure(tile.structure, tile.label);
    assert.ok(svg.includes('<svg'));
    assert.ok(!svg.includes('NaN'));
    assert.equal((svg.match(/data-el="C"/g) || []).length, 1, 'メチル親graphのC');
    assert.equal((svg.match(/data-el="H"/g) || []).length, 4, 'Hを明示（CH₄の4H）');
  }
  const tri = C.chainDescriptorPreview('d-methanex3+propane-c6');
  assert.equal(tri.length, 4, 'プロパン＋メチル×3を4断片に分離');
  assert.equal(tri[0].label, 'プロパン骨格');
  assert.equal(tri[0].marks.length, 3);
  assert.equal((R.renderStructure(tri[0].structure, tri[0].label).match(/data-el="H"/g) || []).length, 8, 'プロパンC3H8のH');
  assert.deepEqual(tri.slice(1).map((t) => t.label), ['メチル基', 'メチル基', 'メチル基']);
  const h = C.chainDescriptorPreview('d-h+methane-c1');
  assert.equal(h.length, 2);
  assert.equal(h[0].kind, 'hydrogen');
  assert.equal(h[1].label, 'メチル基');
  assert.equal(C.chainDescriptorPreview('d-direct-c0').length, 0, 'シュウ酸はH親図を作らない');
  const js = read('app.js');
  const previewFn = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.equal(previewFn.includes('renderStructure'), false, '②に骨格SVGを出さない');
  assert.equal(previewFn.includes('renderCompound'), false, '②に分子図を出さない');
  assert.ok(js.includes('function renderChainLeftFigure'));
  assert.equal(js.includes('oc-attach-mark'), false, '炭素の点線circleを描画しない');
  assert.equal(js.includes('markAttachmentSvg'), false, 'attachment markのSVG注入を撤去');
  assert.equal(js.includes('oc-attach-legend'), false, '○凡例を撤去');
  assert.ok(js.includes('oc-frag-tile--single'), '選択後の①を大きく表示');
  assert.ok(js.includes('oc-frag-preview--single'), '①previewの単一骨格を横幅いっぱいに');
  assert.ok(/\.oc-frag-tile--single\s+\.oc-frag-tile__fig\s+svg\s*\{[^}]*max-height:\s*230px/s.test(read('app.css')), '①previewの図を大きく');
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    const tiles = C.chainDescriptorPreview(d.id);
    if (d.zeroKind === 'direct') {
      assert.equal(tiles.length, 0, d.id + ' は炭化水素図を作らない');
      continue;
    }
    assert.ok(tiles.length > 0, d.id + ' のpreviewがない');
    for (const tile of tiles) {
      if (tile.kind !== 'hydrocarbon') continue;
      assert.equal(tile.marks.length, tile.attachmentCount, d.id + ' の接続点metadata数');
      if (tile.contracted) {
        assert.equal(tile.figure.kind, 'formula', d.id + ' の長鎖は縮約式');
        assert.ok(tile.note && tile.note.includes('圧縮'), d.id + ' の縮約注記');
        continue;
      }
      assert.equal(tile.figure.kind, 'graph', d.id + ' の小さい親は構造式');
      const svg = R.renderStructure(tile.structure, tile.label);
      assert.ok(svg.includes('<svg'), d.id + ' のpreview SVG');
      assert.ok(!svg.includes('NaN'), d.id + ' のpreviewにNaN');
      assert.ok(!svg.includes('undefined'), d.id + ' のpreviewにundefined');
      assert.equal(R._internal.checkValence(tile.structure).ok, true, d.id + ' のpreview結合価');
    }
  }
});

test('[chain] 2列は全結果を通した同一グリッドで、グループ別fullwidthを作らない', () => {
  const js = read('app.js');
  const chainFn = js.slice(js.indexOf('function renderChainResults'), js.indexOf('/* ------------------------------------------------------------------\n   * 芳香族・環式'));
  assert.equal((chainFn.match(/class="oc-cards/g) || []).length, 1, '鎖式結果のグリッドは1つ');
  assert.equal(chainFn.includes('oc-subgroup'), false, 'グループ別グリッドを作らない');
  assert.ok(chainFn.includes("ids.length === 1 ? ' oc-cards--single' : ''"), '1件だけ半幅グリッドを許可');
  const ringFn = js.slice(js.indexOf('function renderRingResults'), js.indexOf('/* ------------------------------------------------------------------\n   * その他'));
  assert.equal((ringFn.match(/class="oc-cards/g) || []).length, 1, '環式結果のグリッドは1つ');
  assert.equal(ringFn.includes('oc-subgroup'), false);
  const otherFn = js.slice(js.indexOf('function renderOtherResults'), js.indexOf('/* ------------------------------------------------------------------\n   * カード'));
  assert.equal((otherFn.match(/class="oc-cards/g) || []).length, 1, 'その他結果のグリッドは1つ');
  assert.equal(otherFn.includes('oc-subgroup'), false);
  const css = read('app.css');
  assert.ok(/\.oc-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-cards\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.ok(/@media \(max-width: 430px\)[\s\S]*?\.oc-cards\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css));
});

test('[static] ②の分類・置換基カードは320/390でも最低2列、C0だけfull-row', () => {
  const css = read('app.css');
  const js = read('app.js');
  assert.ok(/#chain-family-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css), '鎖式②は2列');
  assert.ok(/#chain-shape-list\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(120px,\s*1fr\)\)/s.test(css), 'desktopは余裕に応じて多列');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?#chain-shape-list\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css), 'モバイルは2列以上');
  assert.equal(/@media[^{]*\{[\s\S]*?#chain-shape-list\s*\{[^}]*grid-template-columns:\s*(minmax\(0,\s*1fr\)|1fr)/s.test(css), false, 'モバイルで1列へ戻さない');
  assert.ok(/#chain-shape-list\s+\.oc-shape\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s.test(css), 'shapeカードのmin-width0');
  assert.ok(/#chain-shape-list\s+\.oc-frag-formula\s*\{[^}]*overflow-wrap:\s*normal/s.test(css), 'shape文字は化学単位の区切りで折り返す');
  assert.equal(/#chain-shape-list\s+\.oc-frag-formula[^{]*\{[^}]*overflow-wrap:\s*anywhere/s.test(css), false, '文字の途中で無条件に切らない');
  assert.equal(css.includes('ellipsis'), false, '省略記号で意味を欠落させない');
  assert.ok(js.includes('esc(chemBreakable(text))'), 'compact構造文字を化学単位で折り返す');
  assert.ok(js.includes('R.chemBreakable'), '折返し処理をdraw.jsと共有する');
  assert.ok(/\.oc-preset-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css), '環式②preset行は2列');
  assert.equal(/@media[^{]*\{[\s\S]*?\.oc-preset-row\s*\{[^}]*grid-template-columns:\s*(minmax\(0,\s*1fr\)|1fr)/s.test(css), false, 'preset行をmobileで1列へ落とさない');
  assert.equal(/\.oc-family-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s.test(css), false, 'その他モードのfamily listへ2列を波及させない');
  assert.ok(/\.oc-carbon--none\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(css), 'C0だけfull-row');
  assert.ok(/\.oc-carbon\s*\{[^}]*min-height:\s*38px/s.test(css), 'C1等の通常ボタン高さを維持');
  assert.ok(/#carbon-list\s*\{[^}]*repeat\(auto-fit,\s*minmax\(52px,\s*1fr\)\)/s.test(css), 'desktopは6列以上可');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?#carbon-list\s*\{[^}]*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s.test(css), '320/390でも6列');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?#carbon-list\s+\.oc-carbon\s*\{[^}]*min-height:\s*44px[^}]*padding:\s*4px 1px/s.test(css), 'mobileの44pxタップと余白');
  assert.equal(/@media[^{]*\{[\s\S]*?#carbon-list\s*\{[^}]*grid-template-columns:\s*(minmax\(0,\s*1fr\)|1fr)/s.test(css), false, 'carbon gridを1列へ戻さない');
  assert.ok(/#carbon-list\s+\.oc-carbon__main\s*\{[^}]*font-size:\s*clamp\(/s.test(css), 'C20まで収まる数値font');
  assert.equal(css.includes('ellipsis'), false, '文字をellipsisで欠落させない');
  const options = C.chainPartialOptions();
  assert.deepEqual(options, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20], '実在optionsだけ');
  for (const n of [11, 12, 13, 14, 15, 16, 17, 18, 19]) assert.equal(options.includes(n), false, 'C' + n + 'のdummyを作らない');
  assert.ok(/\.oc-carbon--none\s+\.oc-carbon__main\s*\{[^}]*white-space:\s*nowrap/s.test(css), 'C0ラベルを1本で表示');
  const html = read('index.html');
  assert.equal(html.includes('oc-selection'), false, '選択中statusの3重表示を残さない');
  assert.equal((html.match(/class="oc-micro"/g) || []).length, 0, 'パネル見出しの6 microを残さない');
  assert.ok(html.includes('数え方・図について'));
  assert.equal(html.includes('図の読み方'), false, '①の図の読み方UI説明を残さない');
  assert.equal(html.includes('一覧を並べすぎない'), false, 'その他のUI設計説明を残さない');
  assert.ok(js.includes('function chemBreakable'), '化学単位の折返し補助');
  assert.ok(js.includes('chemBreakable(pick.main)') && js.includes('chemBreakable(card.main)'));
  assert.ok(js.includes('収録・検証の詳細'));
  const ledger = read('ledger.html');
  assert.ok(ledger.includes('収録・検証の詳細'));
});

test('[static] 公開16 assetだけを配信し、ローカル絶対パス・認証パスを含まない', () => {
  assert.deepEqual(fs.readdirSync(APP).sort(), PRODUCTION_FILES.slice().sort(), '本番は16ファイルのみ');
  const banned = [
    { name: 'Windows absolute path', re: /(^|[^A-Za-z0-9])[A-Za-z]:[\\/]/ },
    { name: 'Users path', re: /\/Users\// },
    { name: 'AppData path', re: /AppData[\\/]/i },
    { name: 'local user name', re: /hori3/i },
    { name: 'clasp auth path', re: /\.clasprc|AUTH_FILE/i }
  ];
  for (const file of [...PRODUCTION_FILES, 'README.md']) {
    const text = file === 'README.md' ? readNext(file) : read(file);
    for (const b of banned) {
      assert.equal(b.re.test(text), false, file + ' に' + b.name + 'が残っている');
    }
  }
  assert.equal(fs.existsSync(path.join(APP, 'README.md')), false, '本番にREADMEを配信しない');
  assert.equal(fs.existsSync(path.join(APP, 'catalog-audit.md')), false, '本番に監査mdを配信しない');
  assert.equal(fs.existsSync(path.join(APP, 'ocr-audit.json')), false, '本番にOCR raw jsonを配信しない');
  assert.equal(fs.existsSync(path.join(APP, 'migration-backup')), false, '本番にbackupを配信しない');
  assert.equal(fs.existsSync(path.join(NEXT, 'migration-backup')), false, 'design-labのtracked treeに旧backupを残さない');
  const readme = readNext('README.md');
  assert.equal(/migration-backup\/(?:manifest\.json|README\.md)/.test(readme), false, '不存在のbackupファイルを参照しない');
  assert.ok(readme.includes('temp/opencode/rights-audit-20261110/migration-backup'), '退避先を明示する');
  assert.ok(readme.includes('完全消去は主張しません'), 'git履歴に原文が残ることを隠さない');
});

test('[static] 教材出典URL・本文抜粋・画像直リンクを配信データと画面に残さない', () => {
  const textbookHosts = [
    'try-it\\.jp', 'kimika\\.net', 'jikkyo\\.co\\.jp', 'shinko-keirin\\.co\\.jp',
    'fromhimuka\\.com', 'examist\\.jp', 'yorikuwa\\.com', 'kagakulab\\.com',
    'daigaku-kagaku\\.com', 'jstage\\.jst\\.go\\.jp', 'students\\.csj\\.jp',
    'cst\\.nihon-u\\.ac\\.jp', 'cloudfront\\.net'
  ];
  const re = new RegExp('(?:' + textbookHosts.join('|') + ')', 'i');
  for (const file of PRODUCTION_FILES) {
    assert.equal(re.test(read(file)), false, file + ' に教材出典URL/画像ホストが残る');
  }
  const credits = fs.readFileSync(path.join(ROOT, 'site', 'credits.html'), 'utf8');
  assert.equal(re.test(credits), false, 'credits.html に教材出典URLが残る');
  assert.ok(credits.includes('教材出典ページのURLと本文は配信せず'), 'creditsに出典の扱いを明記');
  // 本文抜粋（quote）は全公開データで0件
  for (const [name, mod] of [['data.js', D], ['index-audit.js', A], ['independent-audit.js', IA], ['ocr-audit.js', OA], ['index-manifest.js', M], ['external-coverage.js', E]]) {
    assert.equal(JSON.stringify(mod).includes('"quote"'), false, name + ' にquoteフィールドが残る');
  }
  for (const c of Object.values(D.COMPOUNDS)) {
    for (const ev of (c.sourceEvidence || [])) {
      assert.equal(ev.quote, undefined, c.id + ' の本文抜粋が残る');
      assert.equal(ev.url, undefined, c.id + ' の教材URLが残る');
      assert.equal(ev.image, undefined, c.id + ' の画像直リンクが残る');
      assert.equal(ev.imageUrl, undefined, c.id + ' の画像直リンクが残る');
      assert.equal(ev.imageSha256, undefined, c.id + ' の画像sha256が残る');
    }
  }
  assert.equal(Object.keys(D.SOURCES).filter((k) => D.SOURCES[k].url).sort().join(','), 'csj,iupac,mext,nist,pubchem', '化学DB・基準のリンクだけを残す');
  assert.equal(Object.keys(E.SOURCES).some((k) => E.SOURCES[k].url || E.SOURCES[k].domain), false, '外部照合の教材URL/domainを配信しない');
  assert.equal(M.PAGES.some((p) => p.url), false, 'manifestに教材URLを残さない');
  assert.equal(IA.ENTRIES.some((e) => e.url), false, 'independent監査に教材URLを残さない');
  assert.equal(IA.MANDATORY.some((m) => m.url), false, 'mappingに教材URLを残さない');
  assert.equal(OA.CONFIRMED_ADDITIONS.some((x) => x.sourceUrl || x.imageUrl || x.imageSha256), false, 'OCR監査にURL/shaを残さない');
  assert.equal(OA.META.sourcePolicy.distributed, false);
  assert.equal(IA.META.sourcePolicy.distributed, false);
  assert.ok(D.LEDGER_NOTES.some((n) => /教材出典ページのURLと本文抜粋は配信していません/.test(n.detail)), '台帳に配信ポリシーを明記');
  assert.ok(read('ledger.html').includes('教材出典ページのURLと本文抜粋は配信せず'), 'ledgerに方針を明記');
});

test('[static] 教材出典URLに依存する検索・行・テストはlogical IDで代替する', () => {
  const ids = new Set(M.PAGES.map((p) => p.id));
  assert.equal(ids.size, 431, '431件のentry IDが一意');
  assert.equal([...ids].every((id) => /^idx-(?:tryit|kimika)-\d{3}$/.test(id)), true);
  assert.equal(M.CHAPTERS.length, 7);
  assert.equal(M.CHAPTERS.every((ch) => /^ch-\d+$/.test(ch.id)), true);
  for (const f of A.FINDINGS) {
    assert.ok(f.sources.every((s) => /^idx-(?:tryit|kimika)$/.test(s)), f.term);
    assert.ok(f.sourceCount >= f.sources.length, f.term);
  }
  const ledgerJs = read('ledger.js');
  assert.equal(ledgerJs.includes('f.quote'), false, '台帳は本文抜粋を描画しない');
  assert.equal(ledgerJs.includes('ch.url'), false, '章URLを描画しない');
  assert.equal(ledgerJs.includes('E.SOURCES[row.source].url'), false, '外部資料URLを描画しない');
  assert.equal(ledgerJs.includes('imageSha256'), false, '画像shaを描画しない');
  assert.ok(ledgerJs.includes('entry ID') || ledgerJs.includes('source ID'));
});

test('[static] 本番16ファイルはdesign-labとHTML正規化後・非HTML byteで一致する', () => {
  assert.equal(fs.existsSync(path.join(NEXT, 'README.md')), true, 'docsはdesign-labに分離');
  for (const file of PRODUCTION_FILES) {
    const production = fs.readFileSync(path.join(APP, file));
    const lab = fs.readFileSync(path.join(NEXT, file));
    if (file.endsWith('.html')) {
      assert.equal(production.toString('utf8'), normalizeToProduction(lab.toString('utf8')), file + ' のHTMLが正規化後に一致しない');
      assert.equal(production.toString('utf8').includes('../../site/'), false, file + ' にdesign-lab用の../../site/が残る');
    } else {
      assert.equal(production.equals(lab), true, file + ' がbyte一致しない');
    }
  }
  const index = read('index.html');
  const scripts = [...index.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['data.js', 'draw.js', 'chain-descriptor.js', 'catalog.js', 'motion.js', 'app.js'], 'motionを含む読込順');
  assert.ok(index.includes('../themes/theme.js') && index.includes('../themes/pop.css') && index.includes('../themes/forest.css'));
  assert.ok(index.includes('../credits.html'));
  const ledger = read('ledger.html');
  assert.ok(ledger.includes('../themes/theme.js') && ledger.includes('../credits.html'));
  for (const file of ['index.html', 'ledger.html']) {
    for (const m of read(file).matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|#|mailto:|data:)/.test(ref)) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      assert.equal(fs.existsSync(path.resolve(APP, clean)), true, file + ' の相対dependencyがない: ' + ref);
    }
  }
});

test('[chain] 旧totalC URLは一意なら移行し、複数なら明示して選び直す', () => {
  const js = read('app.js');
  assert.ok(js.includes("params.get('cpartial')"));
  assert.ok(js.includes("params.get('shape')"));
  assert.ok(js.includes('chainCandidatesForLegacy'));
  assert.ok(js.includes('先頭の物質へは自動で移動しません'));
  assert.ok(js.includes('focusを優先'));
  assert.ok(js.includes("url.searchParams.set('cpartial'"));
  assert.ok(js.includes("url.searchParams.delete('c')"));
  assert.ok(js.includes("url.searchParams.delete('structure')"));
  assert.equal(js.includes("url.searchParams.set('c', String(state.chainCarbon))"), false);
  assert.ok(js.includes('legacySkeletonRoute'), '旧ind互換を残す');
  assert.ok(js.includes('旧URLの骨格'));
  const html = read('index.html');
  assert.ok(html.includes('chain-shape-list'));
  assert.equal(html.includes('chain-structure-list'), false);
});

test('[static] index.htmlは3モード・テーマ共有・クレジット・favicon・台帳導線をもつ', () => {
  const html = read('index.html');
  assert.ok(html.includes('data-mode="chain"'));
  assert.ok(html.includes('data-mode="ring"'));
  assert.ok(html.includes('data-mode="other"'));
  assert.ok(html.includes('../themes/theme.js'));
  assert.ok(html.includes('../themes/pop.css'));
  assert.ok(html.includes('../themes/forest.css'));
  assert.ok(!html.includes('../../site/themes/'), 'design-lab用の相対パスが残っている');
  assert.ok(html.includes('../credits.html'));
  assert.ok(html.includes('favicon.svg'));
  assert.ok(html.includes('./ledger.html'));
  assert.ok(html.includes('合成') && html.includes('手順'), '実合成・実験手順ではない注意をfooterに残す');
  assert.ok(html.includes('数え方・図について'), '詳細折畳みに数え方・図の説明を残す');
  assert.ok(html.includes('C=O・C≡Nの炭素は官能基側に数えます'), '常時表示は短い数え方1文');
  assert.equal(html.includes('oc-selection'), false, '選択中statusの3重表示を残さない');
  assert.equal(html.includes('oc-attach-legend'), false, '○凡例を残さない');
  assert.ok(html.includes('chain-shape-list'));
  assert.equal(html.includes('chain-structure-list'), false, '旧・構造条件のUIを残さない');
  const js = read('app.js');
  assert.ok(js.includes('chainShapeOptions'));
  assert.ok(js.includes('chainDescriptorFamilyValid'));
  assert.equal(js.includes('飽和鎖式'), false, '旧・飽和/不飽和の選択を残さない');
  assert.equal(js.includes('data-carbon='), false, '旧・総炭素数の選択を残さない');
  const css = read('app.css');
  assert.ok(css.includes('[hidden] { display: none !important; }'), 'hidden属性をdisplay:gridが上書きしない');
  assert.ok(css.includes('.oc-fig--long'), '長い鎖式はカード内フィット＋拡大で読む');
  assert.equal(/min-width:\s*720px/.test(css), false, 'カード内に強制min-widthを残さない');
  assert.equal(/min-width:\s*400px/.test(css), false, '全SVGへの400px強制を残さない');
  assert.ok(/\.oc-fig--long\s+\.oc-svg\s*\{[^}]*width:\s*100%/s.test(css), '長鎖SVGをカード幅に収める');
});

test('[static] ledger.htmlは索引監査・family/材料索引・テーマ共有をもつ', () => {
  const html = read('ledger.html');
  assert.ok(html.includes('../themes/theme.js'));
  assert.ok(html.includes('../credits.html'));
  assert.ok(html.includes('./index.html'));
  assert.ok(html.includes('index-manifest.js'));
  assert.ok(html.includes('index-audit.js'));
  assert.ok(html.includes('ledger-index-stats'));
  assert.ok(html.includes('ledger-audit-rows'));
  assert.ok(html.includes('ledger-families'));
  assert.ok(html.includes('ledger-materials'));
  assert.ok(html.includes('ledger-global-results'));
  assert.ok(html.includes('探し方'));
  const js = read('ledger.js');
  assert.ok(js.includes('C.search'));
  assert.ok(js.includes('renderGlobalSearch'));
  assert.ok(js.includes('family/材料/状態として'));
});

test('[static] UIは常時最大1accordion・keyboard・reduced motion・motion fallbackを維持する', () => {
  const js = read('app.js');
  assert.ok(js.includes('activeDetails'));
  assert.ok(js.includes('desiredDetails'));
  assert.ok(js.includes('summary.addEventListener'));
  assert.ok(js.includes("e.preventDefault()"));
  assert.ok(js.includes('resetHeight'));
  const motion = read('motion.js');
  assert.ok(motion.includes('prefers-reduced-motion'));
  assert.ok(/Element[\s\S]{0,60}prototype[\s\S]{0,60}animate/.test(motion), 'WAAPI対応を判定');
  assert.ok(motion.includes('addEventListener') || motion.includes('addListener'), '設定変更を監視');
  const css = read('app.css');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});

test('[static] 旧個別選択の重複左リストを復活させず、旧URLは明示的に移行する', () => {
  const js = read('app.js');
  assert.ok(!js.includes('skeleton-list'));
  assert.ok(!js.includes('INDIVIDUAL_SECTIONS'));
  assert.ok(!js.includes("D.SKELETONS"));
  assert.ok(js.includes('legacySkeletonRoute'));
  assert.ok(js.includes('旧URL'));
  const html = read('index.html');
  assert.ok(!html.includes('id="skeleton-list"'));
  assert.ok(!html.includes('id="group-list"'));
});

test('[static] 図の二重表示をせず、カードは構造を1回だけ描画する', () => {
  const js = read('app.js');
  const cardFn = js.slice(js.indexOf('function renderCard'), js.indexOf('function renderFamilyCard'));
  const count = (cardFn.match(/R\.renderCompound\(/g) || []).length;
  assert.equal(count, 1, 'renderCard内の構造描画は1回だけ');
  assert.ok(cardFn.includes('R.renderCompound(c)'));
});

test('[static] 未対応理由は2分類だけで、データ不備を範囲外にしない', () => {
  const types = new Set(Object.values(D.UNSUPPORTED_REASONS).map((r) => r.type));
  assert.ok([...types].every((t) => t === 'out-of-scope' || t === 'chemically-invalid'));
  assert.ok(types.size >= 1);
  for (const [key, value] of Object.entries(D.UNSUPPORTED_REASONS)) {
    assert.ok(value.reason && value.reason.length > 0, key + ' の理由がない');
    assert.ok(value.type === 'out-of-scope' || value.type === 'chemically-invalid');
  }
  assert.ok(D.unsupportedEntry, 'unsupportedEntryがない');
  assert.equal(D.unsupportedEntry('alkane-c6', 'ch3').type, 'out-of-scope');
});

test('[static] READMEが機能・収録数・公開昇格・保全・未確認範囲を説明する', () => {
  const md = readNext('README.md');
  assert.ok(md.includes('app10-next'));
  assert.ok(md.includes('総炭素数'));
  assert.ok(md.includes('固定'));
  assert.ok(md.includes('family'));
  assert.ok(md.includes('1399'));
  assert.ok(md.includes('625'));
  assert.ok(md.includes('http://localhost:8000/design-lab/app10-next/'));
  assert.ok(md.includes('site/app10'), '本番昇格先');
  assert.ok(md.includes('35120ea'), '旧版の保全基準');
  assert.ok(md.includes('archive/site-app10-35120ea-20261110'), '完全snapshot');
  assert.ok(md.includes('scripts/tests/fixtures/app10-baseline-35120ea'), '旧テスト fixture');
  assert.ok(md.includes('動画127') && md.includes('未確認'), '動画127本の未確認');
  assert.ok(md.includes('完全網羅') && md.includes('主張しません'), '全高校化学の絶対網羅を断定しない');
});

/* ------------------------------------------------------------------
 * 新版: 鎖式の選択モデル / 環式プリセット / 二重表示 / 2カラム
 * ------------------------------------------------------------------ */

test('[chain] 分類順・初期値・炭化水素部分Cの選択肢が分類に依存しない', () => {
  assert.deepEqual(C.CHAIN_FAMILIES.map((f) => f.id), [
    'alkane', 'alkene', 'alkyne', 'halogen',
    'alcohol', 'polyol', 'ether', 'aldehyde', 'ketone', 'carboxylic', 'anhydride', 'ester',
    'amine', 'nitrile', 'nitro', 'amino-alcohol'
  ]);
  const js = read('app.js');
  assert.match(js, /chainFamily:\s*'alkane'/, '初期分類はアルカン');
  assert.match(js, /chainPartialC:\s*2/, '初期の炭化水素部分はC2');
  assert.match(js, /chainShape:\s*'d-ethane-c2'/, '初期の骨格はエタン由来を明示');
  assert.equal(js.includes('ensureFamilyStructure'), false, '②から①を書き換える旧補正を残さない');
  const partials = C.chainPartialOptions();
  assert.ok(partials.includes(0) && partials.includes(1) && partials.includes(2) && partials.includes(20));
  assert.equal(C.chainPartialOptions().join(','), partials.join(','), 'C選択肢は毎回同じ');
  const c2 = C.chainShapeOptions(2).map((d) => d.id);
  for (const shape of ['d-ethane-c2', 'd-ethene-c2', 'd-ethyne-c2', 'd-methanex2-c2']) {
    assert.ok(c2.includes(shape), 'C2の骨格に ' + shape + ' が必要');
  }
  assert.equal(C.chainDescriptorLabel('d-ethane-c2'), 'エタン由来');
  assert.equal(C.chainDescriptorLabel('d-ethene-c2'), 'エテン由来');
  assert.equal(C.chainDescriptorLabel('d-ethyne-c2'), 'エチン由来');
  assert.equal(C.chainDescriptorLabel('d-methanex2-c2'), 'メチル基×2');
  assert.equal(C.chainDescriptorLabel('d-h-c0'), 'Hが結合');
  assert.equal(C.chainDescriptorLabel('d-direct-c0'), '官能基どうしが直接結合');
  assert.equal(C.chainDescriptorById(C.INITIAL_CHAIN_SHAPE).partialC, 2);
  assert.equal(C.chainDescriptorFamilyValid('d-ethane-c2', 'alkane'), true);
  assert.equal(C.chainDescriptorFamilyValid('d-ethyne-c2', 'alkane'), false);
  for (const partial of partials) {
    for (const d of C.chainShapeOptions(partial)) {
      assert.equal(d.partialC, partial);
      assert.ok(d.compoundIds.length > 0);
      assert.ok(d.label && d.label.length > 0);
      for (const family of C.chainFamiliesForDescriptor(d.id)) {
        assert.ok(C.chainIdsForDescriptor(d.id, family.id).length > 0, `0件の分類を表示しない: ${d.id} ${family.id}`);
        assert.equal(C.chainDescriptorFamilyValid(d.id, family.id), true);
      }
    }
  }
  assert.equal(C.chainDescriptorFamilyValid('d-ethane-c2', 'ether'), false, '0件の分類を選ばせない');
  assert.ok(js.includes('C.chainFamiliesForDescriptor'), '表示はchainFamiliesForDescriptorで0件を除外');
  assert.ok(js.includes('C.chainPartialOptions'), '炭素選択肢はデスクリプタから作る');
  assert.ok(js.includes("state.chainShape = '';"), '無効時は骨格の形を解除する');
  assert.ok(js.includes('骨格の形を選んでください'), '未選択時の案内');
  assert.equal(js.includes('state.chainCarbon ='), false, '新UIで総炭素数を選択しない');
});

test('[chain] ①変更は②だけを解除し、上流デスクリプタを変更しない', () => {
  const before = JSON.stringify(C.CHAIN_DESCRIPTOR_BY_COMPOUND);
  const indexBefore = JSON.stringify(C.CHAIN_INDEX);
  const ethanolBefore = JSON.stringify(C.classify('ethanol'));
  C.chainShapeOptions(2);
  C.chainFamiliesForDescriptor('d-ethane-c2');
  C.chainIdsForDescriptor('d-ethane-c2', 'alcohol');
  C.chainDescriptorRoles('d-propane-c3', 'carboxylic');
  C.chainDescriptorPreview('d-methanex2-c2');
  C.chainPartialOptions();
  C.chainFamiliesFor(2, 'saturated');
  assert.equal(JSON.stringify(C.CHAIN_DESCRIPTOR_BY_COMPOUND), before, '選択ヘルパーがデスクリプタを書き換えない');
  assert.equal(JSON.stringify(C.CHAIN_INDEX), indexBefore, '旧・総炭素数インデックスも書き換えない');
  assert.equal(JSON.stringify(C.classify('ethanol')), ethanolBefore, '分類結果を書き換えない');
  const js = read('app.js');
  const partialFn = js.slice(js.indexOf('function selectChainPartial'), js.indexOf('function selectChainShape'));
  const shapeFn = js.slice(js.indexOf('function selectChainShape'), js.indexOf('function selectRingSystem'));
  const familyFn = js.slice(js.indexOf('function selectChainFamily'), js.indexOf('function selectChainPartial'));
  assert.ok(partialFn.includes("state.chainShape = '';"), 'C変更で骨格の形を解除する');
  assert.ok(partialFn.includes("state.chainFamily = '';"), 'C変更で分類も解除する');
  assert.ok(partialFn.includes('骨格の形を選んでください'), '勝手に別骨格へ飛ばさない案内');
  assert.equal(shapeFn.includes('state.chainPartialC ='), false, '骨格選択でC数を書き換えない');
  assert.ok(shapeFn.includes('chainDescriptorFamilyValid'), '骨格変更時は分類の有効性だけ確認する');
  assert.equal(shapeFn.includes('骨格の形が変わったため'), false, '骨格変更では分類解除の案内文を出さない');
  assert.ok(shapeFn.includes("state.chainFamily = '';"), '骨格変更で無効な分類は解除する');
  assert.ok(shapeFn.includes("state.notice = '';"), '骨格変更時は案内文を空のままにする');
  assert.ok(shapeFn.includes('update();'), '骨格変更後も再描画する');
  assert.equal(familyFn.includes('state.chainShape ='), false, '②から①の骨格を書き換えない');
  assert.equal(familyFn.includes('state.chainPartialC ='), false, '②から①のC数を書き換えない');
  assert.ok(familyFn.includes('chainDescriptorFamilyValid'), '②は有効な分類だけ選ぶ');
  assert.ok(js.includes('if (!C.chainDescriptorFamilyValid(state.chainShape, family)) return;'),
    '非表示分類へのstaleイベントは①を変えない');
});

test('[ring] 追加なしは骨格単体だけを返す', () => {
  const benzeneNone = C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.kind === 'none')[0];
  const naphNone = C.RING_SYSTEM_MAP.naphthalene.presets.filter((p) => p.kind === 'none')[0];
  assert.deepEqual(benzeneNone.ids, ['benzene']);
  assert.deepEqual(naphNone.ids, ['naphthalene']);
  assert.deepEqual(C.RING_SYSTEM_MAP.cyclopropane.presets.filter((p) => p.kind === 'none')[0].ids, ['cyclopropane']);
  assert.equal(benzeneNone.ids.includes('phenol'), false);
  const js = read('app.js');
  assert.equal(js.includes('showRegistered'), false, 'group noneで登録46種を出す旧処理を残さない');
});

test('[ring] 置換基プリセットと位置異性体のまとまり', () => {
  function presetBySubs(system, subs) {
    const key = subs.slice().sort().join('+');
    return C.RING_SYSTEM_MAP[system].presets.filter((p) =>
      p.subs.map((s) => s.key + 'x' + s.count).sort().join('+') === key
    )[0];
  }
  const phenol = presetBySubs('benzene', ['OHx1']);
  assert.deepEqual(phenol.ids, ['phenol']);
  const toluene = presetBySubs('benzene', ['CH3x1']);
  assert.deepEqual(toluene.ids, ['toluene']);
  assert.deepEqual(presetBySubs('benzene', ['C2H5x1']).ids, ['ethylbenzene']);
  assert.deepEqual(presetBySubs('benzene', ['CH(CH3)2x1']).ids, ['cumene']);
  assert.deepEqual(presetBySubs('benzene', ['CH=CH2x1']).ids, ['styrene']);
  assert.deepEqual(presetBySubs('benzene', ['CH=CH2x2']).ids, ['p-divinylbenzene']);
  assert.deepEqual(presetBySubs('benzene', ['OHx2']).ids.sort(), ['catechol', 'hydroquinone', 'resorcinol']);
  assert.deepEqual(presetBySubs('benzene', ['CH3x2']).ids.sort(), ['m-xylene', 'o-xylene', 'p-xylene']);
  assert.deepEqual(presetBySubs('benzene', ['COOHx1', 'OHx1']).ids.sort(),
    ['m-hydroxybenzoic-acid', 'p-hydroxybenzoic-acid', 'salicylic-acid']);
  assert.deepEqual(presetBySubs('benzene', ['CH3x1', 'OHx1']).ids.sort(), ['m-cresol', 'o-cresol', 'p-cresol']);
  assert.deepEqual(presetBySubs('benzene', ['COOHx1', 'OCOCH3x1']).ids, ['aspirin']);
  assert.deepEqual(presetBySubs('benzene', ['NO2x1', 'OHx1']).ids.sort(), ['o-nitrophenol', 'p-nitrophenol']);
  const tri = C.ringSubsFor('2,4,6-tribromophenol');
  assert.equal(tri.reduce((n, s) => n + s.count, 0), 4, 'トリブロモフェノールはOH+3Br=4置換');
  assert.deepEqual(tri.filter((s) => s.key === 'Br')[0].positions.sort(), [2, 4, 6]);
  assert.ok(C.ringPositionText('catechol').includes('1位'));
  assert.ok(C.ringPositionText('catechol').includes('2位'));
  const covered = new Set(C.RING_SYSTEM_MAP.benzene.presets.reduce((a, p) => a.concat(p.ids), []));
  for (const id of C.RING_SYSTEM_MAP.benzene.registeredSingle.concat(C.RING_SYSTEM_MAP.benzene.registeredMulti)) {
    assert.ok(covered.has(id), '登録済み置換体の受け皿がない: ' + id);
  }
  assert.equal(C.RING_SYSTEM_MAP.benzene.registeredSingle.length, 12);
  assert.equal(C.RING_SYSTEM_MAP.benzene.registeredMulti.length, 35);
  const phenoxidePreset = C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.ids.includes('phenoxide-ion'))[0];
  assert.ok(phenoxidePreset, 'フェノキシドイオンの専用preset');
  assert.equal(phenoxidePreset.kind, 'single');
  assert.deepEqual(phenoxidePreset.ids, ['phenoxide-ion'], '塩や追加なしへ混ぜない');
  assert.equal(C.RING_SYSTEM_MAP.benzene.presets[0].ids.includes('phenoxide-ion'), false, '追加なしに混ぜない');
  assert.equal(C.RING_SYSTEM_MAP.benzene.tray.includes('phenoxide-ion'), false, 'trayに混ぜない');
  const sections = ['single', 'same', 'combo'];
  for (const kind of sections) assert.ok(C.RING_SYSTEM_MAP.benzene.presets.some((p) => p.kind === kind), kind);
  const js = read('app.js');
  for (const label of ['置換基1つ', '同じ置換基を複数', '異なる置換基組み合わせ']) assert.ok(js.includes(label), label);
});

test('[ring] routeForは全427件でpresetを返し、legacy/focusの行先が有効', () => {
  let ring = 0;
  for (const id of Object.keys(D.COMPOUNDS)) {
    const route = C.routeFor(id);
    assert.ok(route, id + ' のrouteがない');
    assert.equal(route.focus, id, id + ' のfocusが自分自身でない');
    if (route.mode === 'ring') {
      ring++;
      assert.ok(route.preset, id + ' のring routeにpresetがない');
      const rs = C.RING_SYSTEM_MAP[route.system];
      assert.ok(rs, id + ' のring systemがない');
      const preset = rs.presets.filter((p) => p.id === route.preset)[0];
      assert.ok(preset, id + ' のpresetが実在しない: ' + route.preset);
      assert.ok(preset.ids.includes(id), id + ' がpresetのidsにない');
    }
  }
  assert.ok(ring >= 80, '環式の配線件数: ' + ring);
  const seen = new Set();
  for (const id of Object.keys(D.COMPOUNDS)) {
    const sig = JSON.stringify(Object.assign({}, C.routeFor(id), { focus: undefined, id: undefined }));
    assert.equal(seen.has(sig + '|' + id), false, 'routeの重複ID: ' + id);
    seen.add(sig + '|' + id);
  }
  const ledger = read('ledger.js');
  assert.ok(ledger.includes('C.routeFor'));
});

test('[figures] 構造式と簡略構造式の二重表示・例外理由・原子数閾値', () => {
  const ethanol = R.figurePlan(D.COMPOUNDS.ethanol);
  assert.equal(ethanol.mode, 'dual');
  assert.equal(ethanol.full.structure.type, 'custom');
  assert.equal(ethanol.simple.structure.type, 'custom');
  const ethanolHtml = R.renderCompound(D.COMPOUNDS.ethanol);
  assert.ok(ethanolHtml.includes('構造式'));
  assert.ok(ethanolHtml.includes('簡略構造式'));
  assert.ok(ethanolHtml.includes('CH₃CH₂OH'), '小分子はcondensed併記');
  const amine = R.figurePlan(D.COMPOUNDS.ethylamine);
  assert.equal(amine.mode, 'dual');
  assert.equal(amine.simple.structure.type, 'condensed');
  const salicylic = R.figurePlan(D.COMPOUNDS['salicylic-acid']);
  assert.equal(salicylic.mode, 'dual');
  assert.equal(salicylic.full.structure.type, 'custom', 'ring-subの高校基礎は原子グラフを組む');
  const aspirin = R.figurePlan(D.COMPOUNDS.aspirin);
  assert.equal(aspirin.full.structure.type, 'custom', 'エステル置換基も明示結合から原子グラフを組む');
  const fallback = R.figurePlan(D.COMPOUNDS['aniline-hydrochloride']);
  assert.equal(fallback.mode, 'dual');
  assert.equal(fallback.full.structure.type, 'ring-sub', '塩は検証済みring-sub表示に残す');
  const glucose = R.figurePlan(D.COMPOUNDS.glucose);
  assert.equal(glucose.mode, 'multi');
  assert.equal(glucose.figures.length, 3);
  for (const label of ['フィッシャー投影式', 'ハース投影式']) {
    assert.ok(glucose.figures.some((f) => (f.label || '').includes(label)), label);
  }
  const audit = R.figureAudit(D.COMPOUNDS);
  assert.equal(audit.total, 427);
  assert.ok(audit.dual >= 250, '二重表示の件数: ' + audit.dual);
  assert.ok(audit.multi >= 2);
  for (const ex of audit.exceptions) assert.ok(ex.reason && ex.reason.length >= 6, ex.id + ' の例外理由が短い');
  for (const type of ['projection', 'polymer', 'schematic', 'triglyceride', 'atom-limit', 'stereo', 'complex']) {
    assert.ok(audit.byType[type] > 0, type + ' の例外がない');
  }
  assert.equal(audit.byType['condensed-only'] || 0, 0, '実装未対応だけのcondensed-only例外を残さない');
  assert.equal(R.GRAPH_ATOM_LIMIT, 40);
  for (const id of ['carthamin', 'carminic-acid', 'heme']) {
    assert.equal(R.figurePlan(D.COMPOUNDS[id]).exception.type, 'atom-limit', id);
  }
  let dualChecked = 0;
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    const plan = R.figurePlan(c);
    if (plan.mode !== 'dual') continue;
    dualChecked++;
    for (const part of [plan.full, plan.simple]) {
      if (!part || !part.structure) continue;
      if (part.structure.type === 'custom') {
        const g = R.buildStructure(part.structure);
        assert.equal(R.formulaOfGraph(g), c.formula, id + ' の図の原子数/分子式が不一致');
      } else if (part.structure.type === 'condensed') {
        assert.equal(R.formulaOfStructure(part.structure), c.formula, id + ' の簡略式が不一致');
      }
    }
  }
  assert.ok(dualChecked >= 250);
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    const plan = R.figurePlan(c);
    if (plan.mode !== 'dual' || !plan.full || plan.full.structure.type !== 'custom') continue;
    assert.equal(R._internal.checkValence(R.buildStructure(plan.full.structure)).ok, true, id + ' の派生graph結合価');
  }
  let parsed = 0;
  let minDistance = Infinity;
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    const result = R.condensedGraphFor(c);
    if (!result.graph) continue;
    parsed++;
    const g = result.graph;
    for (let i = 0; i < g.atoms.length; i++) {
      for (let j = i + 1; j < g.atoms.length; j++) {
        const d = Math.hypot(g.atoms[i].x - g.atoms[j].x, g.atoms[i].y - g.atoms[j].y);
        if (d < minDistance) minDistance = d;
      }
    }
  }
  assert.ok(parsed >= 70, '簡略式から構造式を作れた件数: ' + parsed);
  assert.ok(minDistance >= 40, '簡略式graphの原子間距離: ' + minDistance);
  let ringGraphs = 0;
  let ringMin = Infinity;
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    if (c.structure.type !== 'ring-sub') continue;
    const p = R.figurePlan(c);
    if (!p.full || p.full.structure.type !== 'custom') continue;
    ringGraphs++;
    const g = R.buildStructure(p.full.structure);
    for (let i = 0; i < g.atoms.length; i++) {
      for (let j = i + 1; j < g.atoms.length; j++) {
        const d = Math.hypot(g.atoms[i].x - g.atoms[j].x, g.atoms[i].y - g.atoms[j].y);
        if (d < ringMin) ringMin = d;
      }
    }
  }
  assert.ok(ringGraphs >= 30, 'ring-subの原子グラフ件数: ' + ringGraphs);
  assert.ok(ringMin >= 30, 'ring-sub graphの原子間距離: ' + ringMin);
});

test('[static] 2カラム維持・図の縦併記・拡大dialog・3テーマ', () => {
  const css = read('app.css');
  assert.ok(/\.oc-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css), '結果カードは2列');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-top\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css), 'モバイルでも上段2列');
  assert.ok(/\.oc-card__figs\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(css), 'カード内は構造式と簡略式を縦併記');
  assert.equal(/\.oc-top\s*\{[^}]*grid-template-columns:\s*1fr/s.test(css), false, '上段を1列に落とさない');
  assert.ok(css.includes('.oc-fig-dialog'));
  assert.ok(css.includes('body.oc-dialog-open'));
  assert.ok(css.includes('.oc-fig__zoom-btn'), '明示的な拡大ボタン');
  assert.equal(css.includes('min-width: 400px'), false, 'モバイルでも全SVGへ最小幅を強制しない');
  assert.equal(/@media \(max-width: 900px\)[\s\S]{0,200}?\.oc-modes\s*\{[^}]*grid-template-columns:\s*1fr/s.test(css), false, 'モードボタンを1列に落とさない');
  assert.ok(/\.oc-modes\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s.test(css), 'モードは3列');
  assert.ok(/@media \(max-width: 430px\)[\s\S]*?\.oc-mode\s*\{[^}]*padding:/s.test(css), '320pxでも3列が収まる余白');
  assert.ok(/\.oc-mode\s*\{[^}]*min-height:\s*44px/s.test(css), '押しやすい高さ');
  const html = read('index.html');
  assert.ok(html.includes('id="fig-dialog"'));
  assert.ok(html.includes('id="fig-dialog-close"'));
  assert.ok(html.includes('aria-labelledby="fig-dialog-title"'));
  assert.ok(html.includes('id="chain-left-figure"'), '鎖式①側の炭素配分例');
  assert.ok(html.includes('id="ring-left-figure"'), '環式①側の固定骨格');
  assert.ok(!html.includes('id="mode-note"'), '旧mode-noteを削除');
  assert.ok(html.includes('oc-mode__main'));
  assert.ok(html.includes('oc-mode__sub'));
  assert.ok(html.includes('置換基・組み合わせを選ぶ'));
  const js = read('app.js');
  assert.ok(js.includes('showModal'));
  assert.ok(js.includes("addEventListener('close'"));
  assert.ok(js.includes('lastScrollY'));
  assert.ok(js.includes("e.key !== 'Enter'"));
  assert.ok(js.includes("fig.querySelector('.oc-fig__zoom-btn')"), '復帰先は明示拡大ボタン');
  assert.ok(js.includes('focusResultsFallback'), '削除時の安全fallback');
  assert.ok(js.includes('data-ring-preset'));
  assert.ok(js.includes('is-current'));
  assert.equal(js.includes('data-ring-group'), false);
  for (const file of ['index.html', 'ledger.html']) {
    const text = read(file);
    assert.ok(text.includes('../themes/theme.js'));
    assert.ok(text.includes('../themes/pop.css'));
    assert.ok(text.includes('../themes/forest.css'));
  }
  assert.ok(js.includes('ringSubPreviewHtml'));
  assert.ok(js.includes('置換基を追加しません'));
});

test('[figures] 派生graph32件＋複合3件の独立構造signatureと結合価', () => {
  const expected = {
    glycylalanine: 'N:2,C:2,C:0,O:0,N:1,C:1,C:3,C:0,O:0,O:1|0-1:1,1-2:1,2-3:2,2-4:1,4-5:1,5-6:1,5-7:1,7-8:2,7-9:1',
    '2-methoxypropane': 'C:3,O:0,C:1,C:3,C:3|0-1:1,1-2:1,2-3:1,2-4:1',
    trimethylamine: 'N:0,C:3,C:3,C:3|0-1:1,0-2:1,0-3:1',
    triethylamine: 'N:0,C:2,C:3,C:2,C:3,C:2,C:3|0-1:1,0-3:1,0-5:1,1-2:1,3-4:1,5-6:1',
    'n-methylpropan-2-amine': 'C:3,N:1,C:1,C:3,C:3|0-1:1,1-2:1,2-3:1,2-4:1',
    'methacrylic-acid': 'C:2,C:0,C:3,C:0,O:0,O:1|0-1:2,1-2:1,1-3:1,3-4:2,3-5:1',
    'isoamyl-acetate': 'C:3,C:0,O:0,O:0,C:2,C:2,C:1,C:3,C:3|0-1:1,1-2:2,1-3:1,3-4:1,4-5:1,5-6:1,6-7:1,6-8:1',
    cumene: 'C:0,C:1,C:1,C:1,C:1,C:1,C:1,C:3,C:3|0-1:2,0-5:1,0-6:1,1-2:1,2-3:2,3-4:1,4-5:2,6-7:1,6-8:1',
    'benzenesulfonic-acid': 'C:0,C:1,C:1,C:1,C:1,C:1,S:0,O:0,O:0,O:1|0-1:2,0-5:1,0-6:1,1-2:1,2-3:2,3-4:1,4-5:2,6-7:2,6-8:2,6-9:1',
    valine: 'N:2,C:1,C:1,C:3,C:3,C:0,O:0,O:1|0-1:1,1-2:1,1-5:1,2-3:1,2-4:1,5-6:2,5-7:1',
    leucine: 'N:2,C:1,C:2,C:1,C:3,C:3,C:0,O:0,O:1|0-1:1,1-2:1,1-6:1,2-3:1,3-4:1,3-5:1,6-7:2,6-8:1',
    isoleucine: 'N:2,C:1,C:1,C:3,C:2,C:3,C:0,O:0,O:1|0-1:1,1-2:1,1-6:1,2-3:1,2-4:1,4-5:1,6-7:2,6-8:1',
    serine: 'N:2,C:1,C:2,O:1,C:0,O:0,O:1|0-1:1,1-2:1,1-4:1,2-3:1,4-5:2,4-6:1',
    cysteine: 'N:2,C:1,C:2,S:0,H:0,C:0,O:0,O:1|0-1:1,1-2:1,1-5:1,2-3:1,3-4:1,5-6:2,5-7:1',
    methionine: 'N:2,C:1,C:2,C:2,S:0,C:3,C:0,O:0,O:1|0-1:1,1-2:1,1-6:1,2-3:1,3-4:1,4-5:1,6-7:2,6-8:1',
    arginine: 'N:2,C:0,N:1,N:1,C:2,C:2,C:2,C:1,N:2,C:0,O:0,O:1|0-1:1,1-2:2,1-3:1,3-4:1,4-5:1,5-6:1,6-7:1,7-8:1,7-9:1,9-10:2,9-11:1',
    proline: 'N:1,C:1,C:2,C:2,C:2,C:0,O:0,O:1|0-1:1,0-4:1,1-2:1,1-5:1,2-3:1,3-4:1,5-6:2,5-7:1',
    alanylglycine: 'N:2,C:1,C:3,C:0,O:0,N:1,C:2,C:0,O:0,O:1|0-1:1,1-2:1,1-3:1,3-4:2,3-5:1,5-6:1,6-7:1,7-8:2,7-9:1',
    glutathione: 'N:2,C:1,C:0,O:0,O:1,C:2,C:2,C:0,O:0,N:1,C:1,C:2,S:0,H:0,C:0,O:0,N:1,C:2,C:0,O:0,O:1|0-1:1,1-2:1,1-5:1,10-11:1,10-14:1,11-12:1,12-13:1,14-15:2,14-16:1,16-17:1,17-18:1,18-19:2,18-20:1,2-3:2,2-4:1,5-6:1,6-7:1,7-8:2,7-9:1,9-10:1',
    sorbitol: 'O:1,C:2,C:1,O:1,C:1,O:1,C:1,O:1,C:1,O:1,C:2,O:1|0-1:1,1-2:1,10-11:1,2-3:1,2-4:1,4-5:1,4-6:1,6-7:1,6-8:1,8-10:1,8-9:1',
    isoprene: 'C:2,C:0,C:3,C:1,C:2|0-1:2,1-2:1,1-3:1,3-4:2',
    'vinylidene-chloride': 'C:2,C:0,Cl:0,Cl:0|0-1:2,1-2:1,1-3:1',
    'methyl-methacrylate': 'C:2,C:0,C:3,C:0,O:0,O:0,C:3|0-1:2,1-2:1,1-3:1,3-4:2,3-5:1,5-6:1',
    caprolactam: 'N:1,C:0,C:2,C:2,C:2,C:2,C:2,O:0|0-1:1,0-6:1,1-2:1,1-7:2,2-3:1,3-4:1,4-5:1,5-6:1',
    melamine: 'C:0,N:0,C:0,N:0,C:0,N:0,N:2,N:2,N:2|0-1:2,0-5:1,0-6:1,1-2:1,2-3:2,2-7:1,3-4:1,4-5:2,4-8:1',
    tetrafluoroethylene: 'C:0,F:0,F:0,C:0,F:0,F:0|0-1:1,0-2:1,0-3:2,3-4:1,3-5:1',
    phosgene: 'C:0,O:0,Cl:0,Cl:0|0-1:2,0-2:1,0-3:1',
    epichlorohydrin: 'C:2,C:1,O:0,C:2,Cl:0|0-1:1,0-2:1,1-2:1,1-3:1,3-4:1',
    dimethyldichlorosilane: 'Si:0,C:3,C:3,Cl:0,Cl:0|0-1:1,0-2:1,0-3:1,0-4:1',
    '1,1,2,2-tetrabromoethane': 'C:1,Br:0,Br:0,C:1,Br:0,Br:0|0-1:1,0-2:1,0-3:1,3-4:1,3-5:1',
    choline: 'O:1,C:2,C:2,N:0+,C:3,C:3,C:3|0-1:1,1-2:1,2-3:1,3-4:1,3-5:1,3-6:1',
    '2-chloropropene': 'C:2,C:0,Cl:0,C:3|0-1:2,1-2:1,1-3:1',
    'cumene-hydroperoxide': 'C:0,C:1,C:1,C:1,C:1,C:1,C:0,C:3,C:3,O:0,O:0,H:0|0-1:2,0-5:1,0-6:1,1-2:1,10-11:1,2-3:2,3-4:1,4-5:2,6-7:1,6-8:1,6-9:1,9-10:1',
    'bisphenol-a': 'C:0,C:1,C:1,C:0,C:1,C:1,C:0,C:1,C:1,C:0,C:1,C:1,C:0,C:3,C:3,O:1,O:1|0-12:1,0-1:1,0-5:2,1-2:2,10-11:1,12-13:1,12-14:1,2-3:1,3-15:1,3-4:2,4-5:1,6-11:2,6-12:1,6-7:1,7-8:2,8-9:1,9-10:2,9-16:1',
    aspartame: 'C:0,O:0,O:1,C:2,C:1,N:2,C:0,O:0,N:1,C:1,C:2,C:0,O:0,O:0,C:3,C:0,C:1,C:1,C:1,C:1,C:1|0-1:2,0-2:1,0-3:1,10-15:1,11-12:2,11-13:1,13-14:1,15-16:1,15-20:2,16-17:2,17-18:1,18-19:2,19-20:1,3-4:1,4-5:1,4-6:1,6-7:2,6-8:1,8-9:1,9-10:1,9-11:1'
  };
  for (const [id, want] of Object.entries(expected)) {
    const plan = R.figurePlan(D.COMPOUNDS[id]);
    assert.equal(plan.mode, 'dual', id);
    const g = R.buildStructure(plan.full.structure);
    const sig = g.atoms.map((a) => a.el + ':' + a.h + (a.charge || '')).join(',') + '|' +
      g.bonds.map((b) => Math.min(b.a, b.b) + '-' + Math.max(b.a, b.b) + ':' + b.order).sort().join(',');
    assert.equal(sig, want, id + ' の構造signature');
    assert.equal(R._internal.checkValence(g).ok, true, id + ' の結合価');
    assert.equal(R.formulaOfGraph(g), D.COMPOUNDS[id].formula, id + ' の分子式');
  }
  const tri = R.buildStructure(R.figurePlan(D.COMPOUNDS.trimethylamine).full.structure);
  assert.equal(tri.bonds.filter((b) => b.a === 0 || b.b === 0).length, 3, 'Nは3つのメチルに結合');
  const tfe = R.buildStructure(R.figurePlan(D.COMPOUNDS.tetrafluoroethylene).full.structure);
  assert.equal(tfe.bonds.filter((b) => gAtom(tfe, b.a) === 'F' || gAtom(tfe, b.b) === 'F').every((b) => b.order === 1), true, 'Fは単結合のみ');
  assert.equal(tfe.bonds.some((b) => gAtom(tfe, b.a) === 'F' && gAtom(tfe, b.b) === 'F'), false, 'F-F結合なし');
  assert.equal(graphRingCount(R.figurePlan(D.COMPOUNDS.melamine).full.structure), 1);
  assert.equal(graphRingCount(R.figurePlan(D.COMPOUNDS.caprolactam).full.structure), 1);
  assert.equal(graphRingCount(R.figurePlan(D.COMPOUNDS.proline).full.structure), 1);
  assert.equal(graphRingCount(R.figurePlan(D.COMPOUNDS.epichlorohydrin).full.structure), 1);
  const ch = R.buildStructure(R.figurePlan(D.COMPOUNDS['cumene-hydroperoxide']).full.structure);
  assert.equal(ch.atoms[6].el, 'C');
  assert.equal(ch.bonds.filter((b) => b.a === 0 || b.b === 0).length, 3, 'ベンゼン環Cは置換基と環2結合');
  assert.equal(ch.bonds.some((b) => (b.a === 9 && b.b === 10) || (b.a === 10 && b.b === 9)), true, 'O-O結合');
  const bpa = R.buildStructure(R.figurePlan(D.COMPOUNDS['bisphenol-a']).full.structure);
  assert.equal(bpa.bonds.filter((b) => b.a === 12 || b.b === 12).length, 4, '中央Cは2環+2メチル');
  assert.equal(bpa.atoms.filter((a) => a.el === 'O' && a.h === 1).length, 2, 'パラOHが2つ');
  const asp = R.buildStructure(R.figurePlan(D.COMPOUNDS.aspartame).full.structure);
  assert.equal(asp.bonds.filter((b) => b.a === 8 || b.b === 8).length, 2, 'アミドNは2結合');
  assert.equal(asp.atoms.filter((a) => a.el === 'N').length, 2, 'Asp-Pheの2窒素');
  assert.equal(asp.atoms.filter((a) => a.el === 'O').length, 5, 'Asp-Pheメチルエステルの5酸素');
  assert.deepEqual(asp.bonds.filter((b) => b.a === 4 || b.b === 4).map((b) => b.a === 4 ? b.b : b.a).sort((a, b) => a - b), [3, 5, 6], 'Asp αCは側鎖CH2/N/peptide Cに結合');
  assert.equal(asp.bonds.some((b) => (b.a === 0 && b.b === 4) || (b.a === 4 && b.b === 0)), false, 'Asp αCをカルボキシルに直結しない');
  assert.deepEqual(asp.bonds.filter((b) => b.a === 3 || b.b === 3).map((b) => b.a === 3 ? b.b : b.a).sort((a, b) => a - b), [0, 4], '側鎖CH2は遊離COOHとαCに結合');
  assert.deepEqual(asp.bonds.filter((b) => b.a === 6 || b.b === 6).map((b) => b.a === 6 ? b.b : b.a).sort((a, b) => a - b), [4, 7, 8], 'peptide C=OはαC/酸素/アミドNに結合');
  assert.deepEqual(asp.bonds.filter((b) => b.a === 9 || b.b === 9).map((b) => b.a === 9 ? b.b : b.a).sort((a, b) => a - b), [8, 10, 11], 'Phe αCはN/CH2Ph/エステルCに結合');
});

function gAtom(g, i) { return g.atoms[i] ? g.atoms[i].el : ''; }

test('[figures] 14件の環置換基で結合線が非端点原子を貫通しない', () => {
  function segDist(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  }
  const ids = ['salicylic-acid', 'aspirin', 'phthalic-acid', 'isophthalic-acid', 'terephthalic-acid', 'methyl-salicylate', 'o-nitrotoluene', 'm-nitrotoluene', 'p-nitrotoluene', 'tnt', 'picric-acid', 'o-nitrophenol', 'p-nitrophenol', 'terephthaloyl-chloride'];
  for (const id of ids) {
    const plan = R.figurePlan(D.COMPOUNDS[id]);
    const g = R.buildStructure(plan.full.structure);
    for (let bi = 0; bi < g.bonds.length; bi++) {
      const b = g.bonds[bi];
      if (g.atoms[b.a].ion || g.atoms[b.b].ion) continue;
      for (let ai = 0; ai < g.atoms.length; ai++) {
        if (ai === b.a || ai === b.b || g.atoms[ai].ion) continue;
        assert.ok(segDist(g.atoms[ai], g.atoms[b.a], g.atoms[b.b]) >= 5,
          id + ' の結合' + bi + 'が原子' + ai + '(' + g.atoms[ai].el + ')を貫通');
      }
    }
  }
});

test('[figures] 小分子塩は電荷分離graphでfull+condensed', () => {
  for (const id of ['sodium-acetate', 'sodium-methoxide', 'sodium-ethoxide', 'sodium-phenoxide', 'sodium-benzoate', 'sodium-laurate', 'calcium-acetate', 'lead-ii-acetate']) {
    const plan = R.figurePlan(D.COMPOUNDS[id]);
    assert.equal(plan.mode, 'dual', id + ' を単独簡略式に逃がさない');
    const g = R.buildStructure(plan.full.structure);
    assert.ok(g.atoms.some((a) => a.ion), id + ' の対イオンがない');
    assert.ok(g.atoms.some((a) => a.charge), id + ' の電荷がない');
    assert.equal(g.bonds.some((b) => ['Na', 'Ca', 'Pb'].includes(g.atoms[b.a].el) || ['Na', 'Ca', 'Pb'].includes(g.atoms[b.b].el)), false, id + ' の金属-有機共有結合');
    assert.equal(R.formulaOfGraph(g), D.COMPOUNDS[id].formula, id + ' の分子式');
    assert.equal(R._internal.checkValence(g).ok, true, id + ' の結合価');
  }
  for (const id of ['silver-acetylide', 'copper-i-acetylide']) {
    const g = R.buildStructure(R.figurePlan(D.COMPOUNDS[id]).full.structure);
    assert.ok(g.atoms.some((a) => a.ion), id + ' の金属イオン');
    assert.ok(!g.bonds.some((b) => ['Ag', 'Cu'].includes(g.atoms[b.a].el) || ['Ag', 'Cu'].includes(g.atoms[b.b].el)), id + ' の金属-有機共有結合');
  }
  for (const id of ['sodium-stearate', 'sodium-palmitate', 'sodium-oleate', 'sds']) {
    const ex = R.figurePlan(D.COMPOUNDS[id]).exception;
    assert.ok(ex && (ex.type === 'atom-limit'), id + ' は原子数例外');
  }
});

test('[text] 簡略構造式の文字併記（glycerol/propylene glycol/ethanol/塩/ptext）', () => {
  assert.equal(R.condensedTextFor(D.COMPOUNDS.ethanol).text, 'CH₃CH₂OH');
  assert.equal(R.condensedTextFor(D.COMPOUNDS.glycerol).text, 'HOCH₂CH(OH)CH₂OH');
  assert.equal(R.condensedTextFor(D.COMPOUNDS['propylene-glycol']).text, 'CH₃CH(OH)CH₂OH');
  const salt = R.condensedTextFor(D.COMPOUNDS['sodium-acetate']).text;
  assert.ok(salt.includes('Na⁺') && salt.includes('⁻'), salt);
  assert.ok(R.condensedTextFor(D.COMPOUNDS['sodium-methoxide']).text.includes('Na⁺'));
  assert.ok(R.condensedTextFor(D.COMPOUNDS['calcium-acetate']).text.includes('Ca²⁺'));
  assert.ok(R.condensedTextFor(D.COMPOUNDS.glucose).note.includes('立体'));
  assert.equal(R.condensedTextFor(D.COMPOUNDS.glucose).text, 'CHO[CH(OH)]₄CH₂OH');
  assert.equal(R.condensedTextFor(D.COMPOUNDS.fructose).text, 'CH₂OH-C(=O)-[CH(OH)]₃-CH₂OH');
  for (const id of C.OTHER_GROUP_MAP.monosaccharide.ids) {
    const t = R.condensedTextFor(D.COMPOUNDS[id]);
    assert.ok(t.text && t.note.includes('立体'), id + ' の単糖code/立体注記');
  }
  for (const id of C.OTHER_GROUP_MAP.disaccharide.ids) {
    const t = R.condensedTextFor(D.COMPOUNDS[id]);
    assert.ok(t.text && /Glc|Gal|Fru/.test(t.text), id + ' の二糖結合略記');
  }
  for (const id of ['starch', 'cellulose', 'glycogen', 'chitin']) {
    assert.ok(R.condensedTextFor(D.COMPOUNDS[id]).text.includes('n'), id + ' の多糖一般式');
  }
  assert.ok(R.condensedTextFor(D.COMPOUNDS.polyethylene).text.includes('繰返単位'));
  assert.ok(R.condensedTextFor(D.COMPOUNDS.aspartame).text.includes('HOOC—CH₂—CH(NH₂)—C(=O)—NH'), 'Asp-Phe α結合の文字');
  assert.ok(R.renderCompound(D.COMPOUNDS.isomaltose).includes('data-font-base="20"'));
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    const t = R.condensedTextFor(c);
    assert.ok(t.text || t.note, id + ' の簡略構造式表示がない');
  }
  const js = read('app.js');
  assert.ok(js.includes('oc-condensed-text'));
  assert.ok(js.includes('簡略構造式'));
  assert.ok(read('app.css').includes('.oc-condensed-text code'));
  assert.ok(read('app.css').includes('.oc-micro { font-size: 11px; color: var(--oc-muted); white-space: normal;'));
});

test('[static] 右②は置換基fragmentのみ・骨格は①側', () => {
  const js = read('app.js');
  const start = js.indexOf('function renderRingPreview');
  const end = js.indexOf('function renderRingResults');
  const preview = js.slice(start, end);
  assert.equal(preview.includes('baseRingStructure'), false, '右previewに骨格図を出さない');
  assert.equal(preview.includes('renderStructure'), false, '右previewにSVGを出さない');
  assert.equal(preview.includes('renderCompound'), false, '右previewにbenzeneを出さない');
  assert.ok(js.includes('function renderRingLeftFigure'));
  assert.ok(js.includes('function renderChainLeftFigure'));
  assert.ok(js.includes('ringSubPreviewHtml'));
});

/* ------------------------------------------------------------------
 * 選択カード（compact）と①プレビュー（明示Hの構造式）の分離
 * ------------------------------------------------------------------ */

function svgCount(svg, re) {
  return (svg.match(re) || []).length;
}

test('[chain] 選択カードはcompact・①プレビューは明示Hの構造式で全shape成功', () => {
  assert.equal(C.CHAIN_DESCRIPTOR_LIST.length, 47);
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    const card = C.chainShapeFigure(d.id);
    assert.ok(card, d.id + ' の選択カード図');
    assert.equal(card.label, d.label, d.id + ' の下段ラベル');
    assert.ok(['none', 'hydrogen', 'single', 'multi'].includes(card.kind), d.id + ' のカード種別');
    if (card.kind === 'single' && card.figure.kind === 'graph') {
      const compactSvg = R.renderStructure(card.figure.structure, card.label);
      assert.equal(svgCount(compactSvg, /data-el="H"/g), 0, d.id + ' のcompactカードはHを省略');
    }
    const tiles = C.chainDescriptorPreview(d.id);
    if (d.zeroKind === 'direct') {
      assert.equal(card.kind, 'none');
      assert.equal(tiles.length, 0, d.id + ' はH親図を作らない');
      continue;
    }
    assert.ok(tiles.length > 0, d.id + ' の①プレビュー');
    for (const tile of tiles) {
      assert.ok(tile.label, d.id + ' のプレビュー役割名');
      assert.notEqual(tile.label, card.label, d.id + ' はcompactカードの名前と役割名を分離');
      assert.ok(tile.figure, d.id + ' のプレビュー図');
      if (tile.kind === 'hydrogen') {
        assert.equal(tile.figure.kind, 'hydrogen');
        continue;
      }
      if (tile.contracted) {
        assert.equal(tile.figure.kind, 'formula', d.id + ' の長鎖は縮約式');
        assert.ok(tile.figure.text && tile.figure.text.includes('CH₂'), d.id + ' の繰返し表記');
        assert.ok(tile.note && /圧縮/.test(tile.note), d.id + ' の縮約注記');
        continue;
      }
      assert.equal(tile.figure.kind, 'graph', d.id + ' の小さい親は構造式');
      const svg = R.renderStructure(tile.structure, tile.label);
      assert.ok(svg.includes('<svg'), d.id + ' のSVG');
      assert.ok(!svg.includes('NaN'), d.id + ' のNaN');
      assert.ok(!svg.includes('undefined'), d.id + ' のundefined');
      assert.equal(svgCount(svg, /data-el="C"/g), tile.structure.atoms.filter((a) => a.el === 'C').length, d.id + ' のC数');
      assert.equal(svgCount(svg, /data-el="H"/g), tile.structure.atoms.reduce((n, a) => n + (a.h || 0), 0), d.id + ' のH数');
      const vb = R.svgGeometry(svg);
      assert.ok(vb && vb.width > 0 && vb.height > 0, d.id + ' のviewBox');
    }
  }
  // 複数fragmentはcompactカードでも実分離し、CH₃−CH₃に連結しない。
  const halves = C.chainShapeFigure('d-methanex2-c2').halves.map((h) => h.text);
  assert.deepEqual(halves, ['CH₃−', '−CH₃']);
  assert.equal(halves.join('').includes('CH₃−CH₃'), false);
  const separate = C.chainDescriptorPreview('d-methanex2-c2');
  assert.equal(separate.length, 2);
  assert.notEqual(separate[0].structure, separate[1].structure, '独立fragmentは別graph');
  const js = read('app.js');
  assert.ok(js.includes('oc-shape__fig') && js.includes('oc-shape__name'), '上段図・下段名');
  assert.ok(js.includes('oc-shape__gap'), 'fragment間のすき間');
});

test('[chain] ethane/methane/propane/neohexane/but-2-yneの①プレビューが正しい構造式', () => {
  function previewTile(id) {
    return C.chainDescriptorPreview(C.chainDescriptorFor(id).descriptorId)[0];
  }
  const cases = [
    ['ethane', 2, 6, 7],
    ['methane', 1, 4, 4],
    ['propane', 3, 8, 10],
    ['2,2-dimethylbutane', 6, 14, 19],
    ['but-2-yne', 4, 6, 11]
  ];
  assert.ok(R.renderCompound(D.COMPOUNDS.methane).includes('CH₄'), 'メタンはCH₄（CH₃にしない）');
  for (const [id, c, h, lines] of cases) {
    const tile = previewTile(id);
    assert.equal(tile.figure.kind, 'graph', id + ' は文字fallbackにしない');
    const svg = R.renderStructure(tile.structure, tile.label);
    assert.equal(svgCount(svg, /data-el="C"/g), c, id + ' のC数');
    assert.equal(svgCount(svg, /data-el="H"/g), h, id + ' の明示H数');
    assert.equal(svgCount(svg, /<line /g), lines, id + ' の結合線数');
    assert.equal(R._internal.checkValence(tile.structure).ok, true, id + ' の結合価');
  }
  const neo = previewTile('2,2-dimethylbutane').structure;
  const center = neo.atoms.filter((a) => a.h === 0)[0];
  assert.ok(center, '四級炭素');
  const degree = (i) => neo.bonds.filter((b) => b.a === i || b.b === i).length;
  const centerIndex = neo.atoms.indexOf(center);
  assert.equal(degree(centerIndex), 4, '中心Cは4本のC–C');
  assert.equal(neo.atoms.filter((a) => a.h === 3).length, 4, 'CH₃×4');
  assert.equal(neo.atoms.filter((a) => a.h === 2).length, 1, 'CH₂×1');
  const butyne = previewTile('but-2-yne').structure;
  const triple = butyne.bonds.filter((b) => b.order === 3)[0];
  assert.ok(triple, 'C≡C');
  const carbonDegree = (v) => butyne.bonds.filter((b) => (b.a === v || b.b === v)).length;
  assert.equal(carbonDegree(triple.a), 2, '三重結合は内部');
  assert.equal(carbonDegree(triple.b), 2, '三重結合は内部');
  const butene = previewTile('but-1-ene').structure;
  const dbl = butene.bonds.filter((b) => b.order === 2)[0];
  const dblDegree = (v) => butene.bonds.filter((b) => (b.a === v || b.b === v)).length;
  assert.equal(dblDegree(dbl.a) === 1 || dblDegree(dbl.b) === 1, true, 'ブタ-1-エンは末端C=C');
  const five = ['hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane']
    .map((id) => C.chainDescriptorFor(id).descriptorId);
  assert.equal(new Set(five).size, 5, 'C6の5異性体は別shape');
  assert.equal(new Set(five.map((s) => C.chainDescriptorLabel(s))).size, 5, 'C6の5異性体は別label');
  const neoCard = C.chainShapeFigure(C.chainDescriptorFor('2,2-dimethylbutane').descriptorId);
  assert.equal(neoCard.label, '2,2-ジメチルブタン由来');
  assert.equal(neoCard.commonName, 'ネオヘキサン');
  assert.ok(C.search('ネオヘキサン').some((r) => r.id === '2,2-dimethylbutane'), '別名で検索できる');
  assert.equal(Object.keys(D.COMPOUNDS).filter((id) => D.COMPOUNDS[id].name.includes('ネオヘキサン')).length, 1, '物質レコードを重複追加しない');
});

test('[chain] C0は「Hが結合」と「官能基どうしが直接結合」を分ける', () => {
  const h = C.chainDescriptorById('d-h-c0');
  const direct = C.chainDescriptorById('d-direct-c0');
  assert.equal(h.label, 'Hが結合');
  assert.deepEqual(h.compoundIds.sort(), ['formaldehyde', 'formic-acid']);
  assert.equal(direct.label, '官能基どうしが直接結合');
  assert.deepEqual(direct.compoundIds, ['oxalic-acid']);
  assert.equal(direct.uniqueFragments.length, 0, 'H断片を作らない');
  assert.equal(direct.fragments, undefined);
  assert.equal(C.chainDescriptorFor('oxalic-acid').descriptorId, 'd-direct-c0');
  assert.equal(C.chainDescriptorFor('formic-acid').descriptorId, 'd-h-c0');
  assert.equal(C.chainDescriptorFor('formaldehyde').descriptorId, 'd-h-c0');
  assert.equal(C.chainDescriptorFor('oxalic-acid').coreHydrogen.rHydrogen, false, 'R=Hはない');
  assert.deepEqual(C.chainDescriptorRoles('d-direct-c0', 'carboxylic').map((r) => r.role), ['dicarboxy']);
  assert.deepEqual(C.chainDescriptorRoles('d-h-c0', 'carboxylic').map((r) => r.role), ['monocarboxy']);
  assert.equal(C.chainDescriptorPreview('d-h-c0')[0].kind, 'hydrogen');
  assert.equal(C.chainDescriptorPreview('d-direct-c0').length, 0);
  assert.equal(C.routeFor('oxalic-acid').shape, 'd-direct-c0', 'focusは新shapeへ移行');
  assert.ok(read('app.js').includes('focusParam'), '旧URLはfocus優先');
  assert.ok(C.chainPartialOptions().includes(0));
  const js = read('app.js');
  assert.ok(js.includes('炭化水素部分なし'), 'C0の大項目');
  assert.ok(js.includes('官能基どうしが直接結合'), '直結の説明');
  assert.ok(js.includes('Hを補った親炭化水素の図には置き換えません'), 'H親図に偽装しない');
});

test('[figures] ②の一般構造は実二重結合線で示し、選択カードは括弧表記を使わない', () => {
  assert.ok(R.renderFunctionalFigure('aldehyde', { partialC: 3 }).includes('<svg'));
  const lineCount = (family) => svgCount(R.renderFunctionalFigure(family, { partialC: 3 }), /<line /g);
  assert.equal(lineCount('aldehyde'), 4, 'R–CHO（C=Oは2本）');
  assert.equal(lineCount('ketone'), 4, 'R–CO–R′（C=Oは2本）');
  assert.ok(lineCount('anhydride') >= 8, '無水物はC=Oを2つ');
  assert.ok(lineCount('nitrile') >= 4, 'C≡Nは3本');
  assert.equal(R.renderFunctionalFigure('amine'), '', 'アミンは1〜3級カードで示す');
  for (const family of ['aldehyde', 'ketone', 'carboxylic', 'ester', 'anhydride', 'nitrile']) {
    const svg = R.renderFunctionalFigure(family, { partialC: 3 });
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), family);
    assert.ok(!/>C\(=O\)</.test(svg), family + ' は文字のC(=O)ではなく結合線');
  }
  const js = read('app.js');
  const previewFn = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.ok(previewFn.includes('R.renderFunctionalFigure'), '右previewに結合線図');
  assert.ok(js.includes('C=O・C≡Nは結合線'), '縮合COとの違いを説明');
});

test('[ring] ②の置換基カードは上段fragment・下段置換基名、noneは骨格図なし', () => {
  const none = C.ringPresetCard(C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.kind === 'none')[0]);
  assert.equal(none.kind, 'none');
  assert.equal(none.main, '追加なし');
  assert.equal(none.sub, '骨格単体のみ');
  assert.equal(none.main.includes('ベンゼン'), false);
  const phenol = C.ringPresetCard(C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.id === 'p-ohx1')[0]);
  assert.equal(phenol.main, '−OH');
  assert.equal(phenol.sub, 'ヒドロキシ基');
  const carboxylic = C.ringPresetCard(C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.id === 'p-coohx1')[0]);
  assert.equal(carboxylic.main, '−COOH', '環式の選択カードもC(=O)を使わない');
  const combo = C.ringPresetCard(C.RING_SYSTEM_MAP.benzene.presets.filter((p) => p.kind === 'combo')[0]);
  assert.ok(combo.main.includes('＋'), '複数置換基を分けて示す');
  assert.ok(combo.types >= 2);
  const js = read('app.js');
  assert.ok(js.includes('oc-ring-frag__fig') && js.includes('oc-ring-frag__name'));
  assert.ok(js.includes('C.ringPresetCard'));
});

test('[static] モードボタンは320/390/1280で3列、横はみ出しを防ぐ', () => {
  const css = read('app.css');
  assert.ok(/\.oc-modes\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.equal(/@media\s*\(max-width:\s*900px\)[\s\S]{0,300}?\.oc-modes\s*\{[^}]*grid-template-columns:\s*1fr/s.test(css), false, '900pxで1列に落とさない');
  assert.ok(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.oc-mode\s*\{[^}]*padding:\s*9px 8px/s.test(css), '390pxの余白');
  assert.ok(/@media\s*\(max-width:\s*430px\)[\s\S]*?\.oc-mode\s*\{[^}]*padding:\s*8px 6px/s.test(css), '320pxの余白');
  assert.ok(/\.oc-mode__main\s*\{[^}]*font-size:\s*13\.5px/s.test(css), '320pxの主ラベル');
  assert.ok(/\.oc-mode\s*\{[^}]*min-height:\s*44px/s.test(css), 'タップ領域44px');
  assert.ok(/\.oc-mode__main\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(css));
  const html = read('index.html');
  assert.equal(svgCountText(html, /data-mode="/g), 3, '3モード');
  assert.ok(html.includes('芳香族・<wbr>環式'), '長いラベルを折り返し可能');
  assert.ok(html.includes('aria-label="探し方のモード"'));
});

function svgCountText(text, re) { return (text.match(re) || []).length; }

test('[figures] 全SVGのviewBoxは内容bboxにフィットし、カード内スクロールをしない', () => {
  const css = read('app.css');
  assert.equal(css.includes('.oc-fig--scroll'), false, 'カード内横スクロールを残さない');
  assert.ok(css.includes('.oc-fig--long'), '長い図はフィット＋拡大');
  assert.equal(/min-width:\s*(400|720)px/.test(css), false, '全SVGへのmin-width強制を残さない');
  assert.ok(/\.oc-card\s*\{[^}]*min-width:\s*0/s.test(css));
  assert.ok(/\.oc-fig\s*\{[^}]*min-width:\s*0/s.test(css));
  assert.ok(/\.oc-fig__canvas\s*\{[^}]*min-width:\s*0/s.test(css));
  assert.equal(/\.oc-shape__fig\s*\{[^}]*overflow:\s*hidden/s.test(css), false, '選択図をoverflow:hiddenで切らない');
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    for (const tile of C.chainDescriptorPreview(d.id)) {
      if (tile.figure && tile.figure.kind === 'graph') {
        const svg = R.renderStructure(tile.structure, tile.label);
        const vb = R.svgGeometry(svg);
        const b = R._internal.graphContentBounds(tile.structure);
        assert.ok(vb.x <= b.minX - 11 && vb.y <= b.minY - 11,
          d.id + ' のviewBox左/上に余白');
        assert.ok(vb.x + vb.width >= b.maxX + 11 && vb.y + vb.height >= b.maxY + 11,
          d.id + ' のviewBox右/下に余白');
      }
    }
  }
  for (const id of Object.keys(D.COMPOUNDS)) {
    const svg = R.renderCompound(D.COMPOUNDS[id]);
    const first = R.svgGeometry(svg);
    assert.ok(first && first.width > 0 && first.height > 0, id + ' のviewBox');
    assert.ok(first.width < 5000 && first.height < 5000, id + ' の過大viewBox');
  }
  for (const f of D.FAMILIES) {
    if (!f.structure) continue;
    const svg = R.renderStructure(f.structure, f.name);
    assert.ok(!svg.includes('NaN'), f.id + ' のNaN');
    assert.ok(!svg.includes('undefined'), f.id + ' のundefined');
  }
});

test('[text] 長い簡略式は化学単位の途中で切らず、複数行にする', () => {
  const line = 'CH₃CH₂CH=CHCH₂CH=CHCH₂CH=CHCH₂CH=CHCH₂CH=CHCH₂CH₂CH₂COOH';
  const wrapped = R.wrapCondensedText(line, 24);
  assert.ok(wrapped.length > 2, '複数行');
  assert.equal(wrapped.join(''), line, '文字を欠落させない');
  for (const part of wrapped) assert.ok(part.length <= 24, '行長');
  for (const part of wrapped.slice(0, -1)) {
    assert.ok(/[=≡]$/.test(part) || part.endsWith(')') || /[₀-₉]$/.test(part), '化学単位の区切りで折る');
  }
});

/* ------------------------------------------------------------------
 * 本番前の最終残件: shape 2列はみ出し / multi SVG / 長い組成式 / 収録範囲表記
 * ------------------------------------------------------------------ */

test('[layout] shape複数fragmentは等分トラックで子SVGを幅100%にし、0x0へ潰れない', () => {
  const css = read('app.css');
  assert.ok(/\.oc-shape__halves\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+10px\s+minmax\(0,\s*1fr\)/s.test(css),
    '複数fragmentはminmax(0,1fr)の等分トラック');
  assert.ok(/\.oc-shape__half\s*\{[^}]*width:\s*100%/s.test(css), 'halfはトラック幅いっぱい');
  assert.ok(/\.oc-shape__half\s+svg\s*\{[^}]*width:\s*100%/s.test(css), '子SVGはwidth100%');
  assert.equal(/\.oc-shape__half\s+svg\s*\{[^}]*width:\s*auto/s.test(css), false, 'width:autoで0に潰さない');
  assert.ok(/\.oc-shape__fig\s+\.oc-shape__halves\s*\{[^}]*width:\s*100%/s.test(css));
  assert.ok(/@media \(max-width: 620px\)[\s\S]*?\.oc-shape__halves\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(css),
    '狭幅ではfragmentを縦積みにして化学単位を守る');
  assert.ok(/@media \(max-width: 430px\)[\s\S]*?\.oc-shape__fig\s*\{[^}]*padding-right:\s*0/s.test(css),
    '狭いカードではバッジ用22px余白を外す');
  assert.ok(/@media \(max-width: 430px\)[\s\S]*?\.oc-shape \.oc-tag\s*\{[^}]*position:\s*static/s.test(css),
    '狭いカードでは件数バッジを名前行へ移す');
  assert.equal(/\.oc-shape__fig\s*\{[^}]*overflow:\s*hidden/s.test(css), false, 'hiddenで切らない');
});

test('[text] chemBreakableは化学単位の区切りだけで折り、47shapeの文字を欠落させない', () => {
  assert.deepEqual(R.chemBreakable('CH₃(CH₂)₁₈CH₃').split('\u200b'), ['CH₃', '(CH₂)₁₈', 'CH₃']);
  assert.deepEqual(R.chemBreakable('CH₃−CH₂−CH₂−').split('\u200b'), ['CH₃−', 'CH₂−', 'CH₂−']);
  assert.equal(R.chemBreakable('CH₃(CH₂)₁₈CH₃').replace(/\u200b/g, ''), 'CH₃(CH₂)₁₈CH₃');
  const texts = [];
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    const card = C.chainShapeFigure(d.id);
    if (card.kind === 'single' && card.figure && card.figure.kind === 'formula') texts.push(card.figure.text);
    if (card.kind === 'multi') card.halves.forEach((h) => { if (h && h.kind === 'formula') texts.push(h.text); });
  }
  assert.ok(texts.length > 0);
  for (const t of texts) {
    const broken = R.chemBreakable(t);
    assert.equal(broken.replace(/\u200b/g, ''), t, '文字を欠落させない: ' + t);
    const maxSegment = Math.max(...broken.split('\u200b').map((s) => s.length));
    assert.ok(maxSegment <= 8, '化学単位の最大長: ' + t + ' (' + maxSegment + ')');
  }
  assert.equal(C.CHAIN_DESCRIPTOR_LIST.length, 47, 'shape候補数は維持');
  assert.equal(new Set(C.CHAIN_DESCRIPTOR_LIST.map((d) => d.id)).size, 47);
  for (const rs of C.RING_SYSTEMS) {
    for (const p of rs.presets) {
      const card = C.ringPresetCard(p);
      for (const t of [card.main, card.sub]) {
        assert.equal(R.chemBreakable(t).replace(/\u200b/g, ''), t, '環式カードの文字を欠落させない: ' + t);
      }
    }
  }
});

test('[layout] 結果カードの分子式・組成表示は折り返し、hiddenで切らない', () => {
  const css = read('app.css');
  assert.ok(/\.oc-card__formula\s*\{[^}]*overflow-wrap:\s*break-word/s.test(css), '長い組成表示を折り返す');
  assert.ok(/\.oc-card__formula\s*\{[^}]*min-width:\s*0/s.test(css));
  const abs = D.COMPOUNDS.abs;
  assert.ok(abs && abs.formulaDisplay.length > 30, 'ABSは長い組成表示');
  const broken = R.chemBreakable(abs.formulaDisplay);
  assert.equal(broken.replace(/\u200b/g, ''), abs.formulaDisplay);
  assert.ok(broken.includes('\u200b'), '長い組成表示に化学的な折返し点');
  assert.ok(/\.oc-card__formula/.test(css));
});

test('[static] 収録範囲は二pass処理済み1398uniqueと未完の限界を短く正しく書く', () => {
  const html = read('index.html');
  assert.ok(html.includes('1398 unique'));
  assert.ok(/二pass処理済/.test(html));
  assert.ok(html.includes('empty 51'));
  assert.ok(html.includes('原画像'));
  assert.ok(html.includes('動画127'));
  assert.equal(html.includes('画像1399枚の全OCR'), false, '旧表記を残さない');
  assert.equal(html.includes('全動画の視聴'), false, '旧表記を残さない');
  assert.ok(html.includes('625'), '625語監査の履歴は残す');
  assert.equal(html.includes('625語を収録'), false, '監査語数を収録数と混同しない');
});

/* ------------------------------------------------------------------
 * 伸縮アニメーション（fake DOM / fake WAAPI。実タイミングは使わない）
 * ------------------------------------------------------------------ */
function motionModule() {
  return require(path.join(APP, 'motion.js'));
}

function makeAnimEnv(options) {
  options = options || {};
  const env = {
    animations: [],
    getComputedStyle(el) {
      return { height: String(el._computed != null ? el._computed : el._h) + 'px' };
    },
    matchMedia() {
      return { matches: !!options.reduced, addEventListener() {}, addListener() {} };
    },
    Element: { prototype: {} }
  };
  if (!options.noWaapi) env.Element.prototype.animate = function () { return { cancel() {} }; };
  return env;
}

function makeAnimEl(height) {
  const el = {
    _h: height,
    _computed: null,
    _anim: null,
    style: {},
    hidden: false,
    renders: 0,
    animateCalls: [],
    getBoundingClientRect() { return { height: this._h }; },
    animate(keyframes, options) {
      this.animateCalls.push({
        keyframes: keyframes.map((k) => Object.assign({}, k)),
        options: Object.assign({}, options)
      });
      this._computed = parseFloat(keyframes[0].height);
      const anim = {
        cancelled: false,
        cancel() { this.cancelled = true; },
        finish() { if (this.onfinish) this.onfinish(); }
      };
      this._anim = anim;
      return anim;
    }
  };
  return el;
}

test('[motion] 3要素を1回ずつ描画し、同じduration/easingで同時に伸縮してstyleを解除する', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv());
  const a = makeAnimEl(100);
  const b = makeAnimEl(40);
  const r = makeAnimEl(200);
  motion.animateMany([
    { el: a, render() { a.renders++; a._h = 160; } },
    { el: b, render() { b.renders++; b._h = 40; } },
    { el: r, render() { r.renders++; r._h = 300; } }
  ]);
  assert.equal(a.renders, 1);
  assert.equal(b.renders, 1);
  assert.equal(r.renders, 1);
  assert.equal(a.animateCalls.length, 1);
  assert.equal(b.animateCalls.length, 0, '高さが変わらない要素はanimateしない');
  assert.equal(r.animateCalls.length, 1);
  assert.equal(a.animateCalls[0].options.duration, Motion.MOTION_MS);
  assert.equal(a.animateCalls[0].options.easing, Motion.EASING);
  assert.equal(r.animateCalls[0].options.duration, Motion.MOTION_MS);
  assert.equal(a.animateCalls[0].keyframes[0].height, '100px');
  assert.equal(a.animateCalls[0].keyframes[1].height, '160px');
  assert.equal(a.style.height, '100px');
  assert.equal(a.style.overflow, 'hidden');
  a._anim.finish();
  r._anim.finish();
  assert.equal(a.style.height, '');
  assert.equal(a.style.overflow, '');
  assert.equal(r.style.height, '');
});

test('[motion] 連打は現在の見えている高さから継続し、cancel後もstyleを残さない', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv());
  const el = makeAnimEl(100);
  motion.animateMany([{ el, render() { el._h = 200; } }]);
  const first = el._anim;
  el._computed = 150;
  el._h = 150;
  motion.animateMany([{ el, render() { el._h = 260; } }]);
  assert.equal(first.cancelled, true, '途中のアニメーションをcancel');
  assert.equal(el.animateCalls.length, 2);
  assert.equal(el.animateCalls[1].keyframes[0].height, '150px', '見えている高さから継続');
  motion.restoreAll();
  assert.equal(el.style.height, '');
  assert.equal(el.style.overflow, '');
});

test('[motion] reduced motion / WAAPI未対応では即時反映し、styleを残さない', () => {
  const Motion = motionModule();
  for (const env of [makeAnimEnv({ reduced: true }), makeAnimEnv({ noWaapi: true })]) {
    const motion = Motion.create(env);
    const el = makeAnimEl(60);
    let renders = 0;
    motion.animateMany([{ el, render() { renders++; el._h = 120; } }]);
    assert.equal(renders, 1, '描画はする');
    assert.equal(el.animateCalls.length, 0, 'アニメーションしない');
    assert.equal(el.style.height, '');
    assert.equal(el.style.overflow, '');
  }
});

test('[motion] hidden要素はanimateせず、描画だけ行う', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv());
  const el = makeAnimEl(20);
  el.hidden = true;
  let renders = 0;
  motion.animateMany([{ el, render() { renders++; el._h = 90; } }]);
  assert.equal(renders, 1);
  assert.equal(el.animateCalls.length, 0);
  assert.equal(el.style.height, '');
});

test('[motion] 初回はanimate:falseで描画のみ、モード切替はstageと結果だけを対象にする', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv());
  const stage = makeAnimEl(300);
  const left = makeAnimEl(400);
  const right = makeAnimEl(380);
  const results = makeAnimEl(500);
  motion.animateMany([
    { el: stage, render() { stage._h = 480; } },
    { el: results, render() { results._h = 600; } }
  ], { animate: false });
  assert.equal(stage.animateCalls.length, 0, '初回はアニメーションしない');
  assert.equal(results.animateCalls.length, 0);
  motion.animateMany([
    { el: left, render() { left._h = 460; } },
    { el: right, render() { right._h = 420; } },
    { el: results, render() { results._h = 640; } }
  ]);
  assert.equal(left.animateCalls.length, 1);
  assert.equal(right.animateCalls.length, 1);
  assert.equal(results.animateCalls.length, 1);
  motion.animateMany([
    { el: stage, before: 470, render() { stage._h = 520; } },
    { el: results, render() { results._h = 700; } }
  ]);
  assert.equal(stage.animateCalls.length, 1, '切替はstageだけ');
  assert.equal(stage.animateCalls[0].keyframes[0].height, '470px', '切替前の見えている高さから');
  assert.equal(results.animateCalls.length, 2);
  assert.equal(left.animateCalls.length, 1, 'bodyは二重にanimateしない');
  assert.equal(right.animateCalls.length, 1);
  assert.equal(left.style.height, '', 'hiddenになるbodyのstyleを解除');
  assert.equal(right.style.overflow, '');
});

test('[motion] oc-helpはbody高さで開閉し、閉じ切ってからopen=falseにする', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv());
  const body = makeAnimEl(0);
  let open = false;
  const details = {
    get open() { return open; },
    set open(v) { open = v; body._h = v ? 120 : 0; },
    querySelector() { return body; }
  };
  const done = [];
  motion.animateDisclosure(details, body, true, () => done.push('opened'));
  assert.equal(details.open, true);
  assert.equal(body.animateCalls.length, 1);
  assert.equal(body.animateCalls[0].keyframes[0].height, '0px');
  assert.equal(body.animateCalls[0].keyframes[1].height, '120px');
  body._anim.finish();
  assert.deepEqual(done, ['opened']);
  assert.equal(body.style.height, '');
  motion.animateDisclosure(details, body, false, () => done.push('closed'));
  assert.equal(details.open, true, '閉じ切るまではopenのまま');
  assert.equal(body.animateCalls.length, 2);
  assert.equal(body.animateCalls[1].keyframes[0].height, '120px');
  assert.equal(body.animateCalls[1].keyframes[1].height, '0px');
  body._anim.finish();
  assert.equal(details.open, false);
  assert.deepEqual(done, ['opened', 'closed']);
  assert.equal(body.style.height, '');
  assert.equal(body.style.overflow, '');
});

test('[motion] reduced motionではoc-helpも即時開閉する', () => {
  const Motion = motionModule();
  const motion = Motion.create(makeAnimEnv({ reduced: true }));
  const body = makeAnimEl(0);
  let open = false;
  const details = {
    get open() { return open; },
    set open(v) { open = v; body._h = v ? 90 : 0; },
    querySelector() { return body; }
  };
  motion.animateDisclosure(details, body, true);
  assert.equal(details.open, true);
  assert.equal(body.animateCalls.length, 0);
  assert.equal(body.style.height, '');
});

test('[static] 更新はstage/body/resultsを1回ずつ描画し、preview単体の二重renderを残さない', () => {
  const js = read('app.js');
  assert.equal(js.includes('animateHeight('), false, 'preview単体のheightアニメを残さない');
  assert.ok(js.includes('function animateMany'));
  assert.ok(js.includes('firstUpdate'));
  assert.ok(js.includes('modeChanged'));
  assert.ok(js.includes('els.stage'));
  assert.ok(js.includes('bindHelp'));
  assert.ok(js.includes('motion.animateDisclosure'));
  const updateFn = js.slice(js.indexOf('function update('), js.indexOf('function renderQueryNotice'));
  assert.equal((updateFn.match(/renderChainPreview\(/g) || []).length, 1);
  assert.equal((updateFn.match(/renderRingPreview\(/g) || []).length, 1);
  assert.equal((updateFn.match(/renderOtherPreview\(/g) || []).length, 1);
  assert.equal((updateFn.match(/renderModeResults/g) || []).length, 2, '通常時とモード切替で1回ずつ');
  const resultsFn = js.slice(js.indexOf('function renderModeResults'), js.indexOf('// 左パネルbody'));
  assert.equal((resultsFn.match(/renderChainResults\(/g) || []).length, 1);
  assert.equal((resultsFn.match(/renderRingResults\(/g) || []).length, 1);
  assert.equal((resultsFn.match(/renderOtherResults\(/g) || []).length, 1);
  const html = read('index.html');
  assert.ok(html.includes('id="oc-stage"'), '3モード共通stage');
  assert.ok(html.includes('./motion.js'), 'motion.jsを読み込む');
  const motion = read('motion.js');
  assert.ok(motion.includes('animateMany'));
  assert.ok(motion.includes('onfinish'));
  assert.ok(motion.includes('oncancel'));
});

/* ------------------------------------------------------------------
 * ②「?」分類ガイド（分類別 / 比較一覧）
 * ------------------------------------------------------------------ */

const GUIDE_FIELDS = ['key', 'label', 'functional', 'general', 'generalNote', 'examples', 'acidBase', 'solubility', 'natureShort', 'solubleShort', 'properties', 'isomer'];

function guideBlock(js) {
  const start = js.indexOf("var guideDialog = document.getElementById('guide-dialog')");
  const end = js.indexOf("els.results.addEventListener('click'");
  assert.ok(start > 0 && end > start, 'guideダイアログのブロックが見つからない');
  return js.slice(start, end);
}

test('[guide] 16分類＋関連3が実データの分類・代表例に接続する', () => {
  const chainIds = C.CHAIN_FAMILIES.map((f) => f.id);
  assert.deepEqual(Object.keys(D.CHAIN_FAMILY_GUIDE), chainIds, 'ガイドの16分類がCHAIN_FAMILIESと一致');
  assert.deepEqual(Object.keys(D.CHAIN_FAMILY_GUIDE_RELATED), ['phenol', 'amide', 'aromatic'], '関連3項目');
  for (const key of chainIds) {
    const g = D.CHAIN_FAMILY_GUIDE[key];
    assert.equal(g.key, key, key + ' のkey');
    assert.equal(g.label, C.CHAIN_FAMILY_LABEL[key], key + ' の表示名は既存ラベルと一致');
    for (const field of GUIDE_FIELDS) {
      assert.ok(g[field] != null && String(g[field]).length > 0, key + ' の' + field + 'がない');
    }
    assert.ok(Array.isArray(g.examples) && g.examples.length >= 1 && g.examples.length <= 3, key + ' の代表例は1〜3件');
    for (const id of g.examples) {
      assert.ok(D.COMPOUNDS[id], key + ' の代表例IDがない: ' + id);
      assert.equal(C.classify(id).family, key, key + ' の代表例が別family: ' + id);
    }
    assert.ok(g.properties.length >= 1 && g.properties.length <= 3, key + ' の代表変換は1〜3件');
    assert.equal(g.related, undefined, key + ' は本体の16分類であり関連項目ではない');
  }
  // 関連項目は②の本体分類に混ぜない。
  for (const key of Object.keys(D.CHAIN_FAMILY_GUIDE_RELATED)) {
    const g = D.CHAIN_FAMILY_GUIDE_RELATED[key];
    assert.equal(g.related, true, key + ' は関連項目');
    assert.equal(chainIds.includes(key), false, key + ' を②の16分類に追加しない');
    assert.equal(C.CHAIN_FAMILY_LABEL[key], undefined, key + ' に本体ラベルを作らない');
    assert.ok(g.examples.length >= 1 && g.examples.length <= 3);
    for (const id of g.examples) assert.ok(D.COMPOUNDS[id], key + ' の代表例IDがない: ' + id);
  }
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.symbols.includes('R=炭化水素基'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.formula.includes('分子全体の炭素数'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.formula.includes('分子式そのものではありません'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.tendency.includes('純物質のpH'));
});

test('[guide] 一般式の条件・異性体の例・代表変換がデータと整合する', () => {
  const G = D.CHAIN_FAMILY_GUIDE;
  const formulas = {
    alkane: ['CₙH₂ₙ₊₂', 'n≥1'],
    alkene: ['CₙH₂ₙ', 'n≥2'],
    alkyne: ['CₙH₂ₙ₋₂', 'n≥2'],
    halogen: ['CₙH₂ₙ₊₁X', 'n≥1'],
    alcohol: ['CₙH₂ₙ₊₂O', 'n≥1'],
    ether: ['CₙH₂ₙ₊₂O', 'n≥2'],
    aldehyde: ['CₙH₂ₙO', 'n≥1'],
    ketone: ['CₙH₂ₙO', 'n≥3'],
    carboxylic: ['CₙH₂ₙO₂', 'n≥1'],
    ester: ['CₙH₂ₙO₂', 'n≥2'],
    amine: ['CₙH₂ₙ₊₃N', 'n≥1'],
    nitrile: ['CₙH₂ₙ₋₁N', 'n≥2'],
    nitro: ['CₙH₂ₙ₊₁NO₂', 'n≥1']
  };
  for (const [key, [formula, condition]] of Object.entries(formulas)) {
    assert.equal(G[key].general, formula, key + ' の一般式');
    assert.ok(G[key].generalNote.includes(condition), key + ' のn条件');
  }
  // 単一の一般式を当てない分類（固定式・一価式の流用をしない）。
  for (const key of ['polyol', 'anhydride', 'amino-alcohol']) {
    assert.equal(G[key].general, '—', key + ' は一般式を固定しない');
  }
  assert.ok(G.polyol.generalNote.includes('当てはめない'));
  assert.ok(G.polyol.isomer.includes('分子式が一致する場合だけ'), '異性体は式一致が条件');
  assert.ok(G['amino-alcohol'].generalNote.includes('当てはめない'));
  assert.ok(G.anhydride.acidBase.includes('中性と断言しない'));
  assert.equal(G.anhydride.isomer.includes('一般機能異性'), true);
  assert.ok(G.ether.solubility.includes('受容'), 'エーテルの水素結合は受容/供与を区別');
  assert.ok(G.ether.isomer.includes('必ず'), '対応アルコールより必ず難とは断定しない');
  assert.ok(G.alkane.solubility.includes('溶けない'));
  assert.ok(G.amine.acidBase.includes('塩基性'));
  const Amide = D.CHAIN_FAMILY_GUIDE_RELATED.amide;
  assert.ok(Amide.acidBase.includes('ほぼ中性'));
  assert.ok(Amide.properties.join('').includes('受容体にならない'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_RELATED.phenol.acidBase.includes('カルボン酸より弱い'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_RELATED.phenol.properties.join('').includes('CO₂を発生しない'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_RELATED.phenol.isomer.includes('異性体とは言わない'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_RELATED.aromatic.generalNote.includes('n≥6'));

  // 同じ分子式で結合・官能基が違う例（実データの式で確認）。
  const formulaPair = (a, b) => [D.COMPOUNDS[a].formula, D.COMPOUNDS[b].formula];
  assert.deepEqual(formulaPair('ethanol', 'dimethyl-ether'), ['C2H6O', 'C2H6O'], 'アルコール/エーテル');
  assert.deepEqual(formulaPair('propanal', 'acetone'), ['C3H6O', 'C3H6O'], 'アルデヒド/ケトン');
  assert.deepEqual(formulaPair('acetic-acid', 'methyl-formate'), ['C2H4O2', 'C2H4O2'], 'カルボン酸/エステル');
  assert.deepEqual(formulaPair('ethylamine', 'dimethylamine'), ['C2H7N', 'C2H7N'], 'アミン1級/2級');
  assert.deepEqual(formulaPair('butane', 'isobutane'), ['C4H10', 'C4H10'], '骨格異性');
  assert.deepEqual(formulaPair('ethyne', 'ethene'), ['C2H2', 'C2H4'], 'アルキン/アルケンは式が違う');
  assert.ok(G.alkene.isomer.includes('シクロプロパン'), 'プロペンとシクロプロパンの環/鎖');
  assert.ok(G.alkyne.isomer.includes('プロパジエン'), 'プロピンとプロパジエン');
  assert.ok(G.carboxylic.isomer.includes('ギ酸メチル'), '酢酸とギ酸メチル');
  // 代表変換の例外・条件
  assert.ok(G.alcohol.properties.join('').includes('三級アルコール'));
  assert.ok(G.halogen.properties.join('').includes('競合'));
  assert.ok(G.nitrile.properties.join('').includes('アミドを経て'));
  assert.ok(G.aldehyde.properties.join('').includes('銀鏡'));
});

test('[static] ②見出しの「?」は専用dialogを開き、aria・focus/scroll復帰・閉じる経路をもつ', () => {
  const html = read('index.html');
  const openTag = html.match(/<button[^>]*id="chain-family-guide-open"[^>]*>/);
  assert.ok(openTag, '?ボタンがない');
  assert.ok(openTag[0].includes('aria-haspopup="dialog"'), 'aria-haspopup=dialog');
  assert.ok(openTag[0].includes('aria-controls="guide-dialog"'), 'aria-controls');
  assert.ok(openTag[0].includes('aria-label="'), 'aria-label');
  const dialogTag = html.match(/<dialog[^>]*id="guide-dialog"[^>]*>/);
  assert.ok(dialogTag, '専用dialogがない');
  assert.ok(dialogTag[0].includes('aria-labelledby="guide-dialog-title"'), 'dialogのラベル');
  assert.ok(dialogTag[0].includes('class="oc-guide-dialog"'), '既存fig-dialogとは別のクラス');
  assert.equal(/<dialog[^>]*id="guide-dialog"[^>]*role="dialog"/.test(html), false, 'native dialogに冗長roleを付けない');
  assert.ok(html.includes('role="tablist"'));
  assert.equal((html.match(/data-guide-tab=/g) || []).length, 2, '分類別/比較一覧の2タブ');
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.ok(html.includes('aria-selected="true"') && html.includes('tabindex="-1"'), '選択タブとroving tabindex');
  assert.ok(html.includes('id="guide-panel-detail"') && html.includes('id="guide-panel-compare"'), 'tabpanel');
  assert.ok(html.includes('aria-controls="guide-panel-detail"') && html.includes('aria-controls="guide-panel-compare"'));
  assert.ok(html.includes('id="guide-dialog-close"'), 'X/閉じるボタン');
  // 通常画面に長い説明を足さない（?だけ）。
  assert.equal(html.includes('分類を選ぶと、官能基'), false, '通常画面に詳細説明を出さない');
  assert.ok(/<button[^>]*class="oc-guide-open"[^>]*>\?<\/button>/.test(html), '見出し右端は?アイコンだけ');

  const js = read('app.js');
  const block = guideBlock(js);
  assert.ok(block.includes('showModal'), 'native showModal');
  assert.ok(block.includes('setAttribute(\'open\', \'\')'), 'showModal未対応のfallback');
  assert.ok(block.includes("addEventListener('close'"), 'closeイベントで復帰');
  assert.ok(block.includes("addEventListener('cancel'") && block.includes('e.preventDefault()'), 'Escapeを閉じる');
  assert.ok(block.includes('e.target === guideDialog'), '外側clickで閉じる');
  assert.ok(block.includes('lastGuideTrigger') && block.includes('lastGuideScrollY'), 'focus/scroll復帰');
  assert.ok(block.includes('guideFocusables') && block.includes('!e.shiftKey'), 'Tabトラップ');
  assert.ok(block.includes("addEventListener('keydown', guideKeydown)"));
  assert.ok(block.includes("e.key === 'ArrowRight'") && block.includes("e.key === 'Home'"), 'タブのキーボード操作');
  assert.ok(block.includes("guideState.key = D.CHAIN_FAMILY_GUIDE[state.chainFamily] ? state.chainFamily : ''"), '開いた時点の分類を表示');
  assert.ok(block.includes('分類を選ぶと、官能基'), '未選択はneutral案内');
  assert.ok(block.includes('R.renderFunctionalFigure'), '既存の一般構造図を再利用');
  assert.ok(block.includes('figure === \'amine\''), 'amineは専用の小型構造式');
  // dialog操作から本体の選択・URL・履歴を変えない。
  assert.equal(block.includes('writeQuery'), false, 'URLを書換えない');
  assert.equal(block.includes('history.'), false, 'historyを触らない');
  assert.equal(block.includes('selectChainFamily'), false, '本体の分類選択を呼ばない');
  assert.equal(block.includes('selectChainShape'), false);
  assert.equal(block.includes('update('), false, 'updateを呼ばない');
  assert.equal(/(?:^|[^A-Za-z])state\.[A-Za-z]+\s*=/.test(block), false, '本体stateを書き換えない');
  assert.ok(block.includes('guideState'), '表示専用のlocal stateをもつ');
});

test('[guide] 比較一覧はレスポンシブなカードグリッドで、詳細はdialog内で切り替える', () => {
  const js = read('app.js');
  const c = js.slice(js.indexOf('function guideCompareHtml'), js.indexOf('function renderGuide'));
  assert.ok(c.includes('oc-guide-compare'), 'カードグリッド');
  assert.ok(c.includes('data-guide-detail'), '各カードから詳細へ');
  assert.ok(c.includes('natureShort') && c.includes('solubleShort'), '性質・溶け方を短く並べる');
  assert.equal(c.includes('<table'), false, '巨大な横tableを作らない');
  const click = js.slice(js.indexOf("guideCompareEl.addEventListener('click'"), js.indexOf("els.results.addEventListener('click'"));
  assert.ok(click.includes("guideState.tab = 'detail'"), '同じdialog内で分類別へ切替');
  assert.equal(click.includes('state.chainFamily'), false);
  const css = read('app.css');
  assert.ok(/\.oc-guide-compare\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(230px,\s*1fr\)\)/s.test(css), 'PCは可変カード');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-guide-compare\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(css), 'スマホは1列');
  assert.ok(/\.oc-guide-dialog__body\s*\{[^}]*overflow-x:\s*hidden/s.test(css), '横overflowを出さない');
  assert.ok(/\.oc-guide-dialog\s*\{[^}]*width:\s*min\(1180px,\s*96vw\)/s.test(css), 'PCの幅');
  assert.ok(/\.oc-guide-dialog\s*\{[^}]*max-height:\s*92vh/s.test(css), 'PCの高さ');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-guide-dialog\s*\{[^}]*width:\s*100vw/s.test(css), 'スマホはほぼ全画面');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-guide-dialog\s*\{[^}]*height:\s*100dvh/s.test(css));
  assert.ok(/\.oc-guide-open\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s.test(css), 'タップ領域44px');
  assert.ok(/\.oc-guide-tab\s*\{[^}]*min-height:\s*40px/s.test(css));
  assert.ok(css.includes('.oc-guide-dialog[open]'), '閉じている間はUAのdisplay:noneを保つ');
  // 3テーマは--oc-*トークン経由で追随する。
  const guideCss = css.slice(css.indexOf('.oc-guide-open {'), css.indexOf('@media (max-width: 760px)', css.indexOf('.oc-guide-open {')));
  assert.ok(guideCss.includes('var(--oc-panel)') && guideCss.includes('var(--oc-accent)'), 'テーマトークンを使う');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(guideCss.replace(/rgba?\([^)]*\)/g, '')), false, '色を直書きしない');
  assert.equal(guideCss.includes('animation'), false, 'アニメーションを足さない');
});

test('[guide] フェノール類の酸性は代表例に合わせ、NaHCO₃のCO₂を一律に否定しない', () => {
  const p = D.CHAIN_FAMILY_GUIDE_RELATED.phenol;
  assert.deepEqual(p.examples, ['phenol', 'o-cresol', 'picric-acid'], '代表例にピクリン酸を含む');
  assert.ok(p.acidBase.includes('フェノール・クレゾール'), '弱酸の代表を限定する');
  assert.ok(p.acidBase.includes('ニトロ基'), '置換で酸性が強まることを書く');
  assert.ok(p.acidBase.includes('強まる'));
  assert.equal(p.acidBase.includes('カルボン酸より弱い。'), false, 'フェノール類全体を一律にカルボン酸より弱いとしない');
  const text = p.properties.join('');
  assert.ok(text.includes('フェノール・クレゾールなどはNaHCO₃と通常反応せずCO₂を発生しない'));
  assert.ok(text.includes('ピクリン酸'));
  assert.ok(text.includes('NaHCO₃と反応してCO₂を発生する'), 'ピクリン酸のCO₂発生を明記');
  assert.equal(text.includes('カルボン酸より弱い酸性のため'), false, '一律の理由づけを残さない');
  assert.ok(D.COMPOUNDS['picric-acid'], '代表IDが実在する');
  assert.equal(C.classify('picric-acid').preset, 'p-no2x3_ohx1', 'ピクリン酸はフェノール性OH＋3ニトロ');
});

test('[guide] 多価アルコールの図は代表構造（エチレングリコール）で、一般式図と区別する', () => {
  const js = read('app.js');
  const fn = js.slice(js.indexOf('function guideFigureHtml'), js.indexOf('function guideFact'));
  assert.ok(fn.includes("entry.key === 'polyol'"), 'polyol専用の分岐がある');
  assert.ok(fn.includes('代表構造：エチレングリコール'));
  assert.ok(fn.indexOf("entry.key === 'polyol'") < fn.indexOf('R.renderFunctionalFigure'), '一般図より先に代表図を返す');
  assert.ok(fn.includes('一般式の図ではなく'), '一般式図との区別を書く');
  const svgFn = js.slice(js.indexOf('function guidePolyolSvg'), js.indexOf('function guideFigureHtml'));
  assert.ok(svgFn.includes('HO') && svgFn.includes('CH₂') && svgFn.includes('OH'), 'エチレングリコールの原子を明示');
  assert.ok((svgFn.match(/<line /g) || []).length >= 3, 'C–CとC–Oの結合線を描く');
  assert.equal(svgFn.includes('renderFunctionalFigure'), false, 'geminal diolの一般図を使わない');
  // 本体のpreview・結果は従来の一般構造図のまま変更しない。
  const preview = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.ok(preview.includes('R.renderFunctionalFigure(family'), '本体previewは既存の一般図');
  assert.equal(preview.includes('guidePolyolSvg'), false, '本体previewをガイド図へ差し替えない');
});

test('[guide] 多価アルコールのOH数はmで表し、n（分子全体の炭素数）と衝突しない', () => {
  const g = D.CHAIN_FAMILY_GUIDE.polyol;
  assert.ok(g.functional.includes('m≥2'), 'OHの数はm');
  assert.equal(g.functional.includes('n≥2'), false, '分子全体のnと混同しない');
  assert.ok(g.generalNote.includes('mはOHの数'));
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.symbols.includes('m=OHの数'), '記号説明にmを短く追加');
  const all = JSON.stringify(D.CHAIN_FAMILY_GUIDE) + JSON.stringify(D.CHAIN_FAMILY_GUIDE_RELATED);
  assert.equal(all.includes('R−(OH)ₙ'), false, 'OH数をnで書かない');
  assert.ok(D.CHAIN_FAMILY_GUIDE_META.formula.includes('分子全体の炭素数'), 'nは分子全体の炭素数のまま');
});

test('[static] ②見出しの「?」は320/390でも右端に残り、見出しは左列内で折り返す', () => {
  const html = read('index.html');
  const heads = [...html.matchAll(/<div class="oc-panel__head([^"]*)">/g)].map((m) => m[1]);
  assert.equal(heads.filter((c) => /oc-panel__head--guide/.test(c)).length, 1, '専用classは②だけ');
  const guideHead = html.slice(html.indexOf('oc-panel__head--guide'), html.indexOf('oc-panel__head--guide') + 600);
  assert.ok(guideHead.includes('化合物分類を選ぶ') && guideHead.includes('id="chain-family-guide-open"'), '②見出しと?が同じhead');
  const css = read('app.css');
  assert.ok(/\.oc-panel__head--guide\s*\{[^}]*flex-wrap:\s*nowrap/s.test(css), '②だけnowrap');
  assert.ok(/\.oc-panel__head--guide h2\s*\{[^}]*min-width:\s*0/s.test(css), '見出しは左列内で折返し可能');
  assert.ok(/\.oc-panel__head--guide h2\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(css));
  assert.ok(/\.oc-guide-open\s*\{[^}]*flex:\s*0 0 auto[^}]*width:\s*44px[^}]*height:\s*44px/s.test(css), '?は44x44で縮まない');
  assert.ok(css.indexOf('.oc-panel__head--guide {') > css.indexOf('.oc-panel__head { flex-wrap: wrap;'), 'モバイルの全体wrapより後で上書き');
  // 他パネルのモバイル折返しは残し、全headerをnowrapにしない。
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-panel__head\s*\{[^}]*flex-wrap:\s*wrap/s.test(css), '他パネルのwrapを維持');
  assert.equal(/\.oc-panel__head\s*\{[^}]*flex-wrap:\s*nowrap/s.test(css), false, '全headerをnowrapにしない');
  // モバイルの列数（①carbon/shape・②分類・結果）は不変。
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-top\s*\{[^}]*repeat\(2,?\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?#carbon-list\s*\{[^}]*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?#chain-shape-list\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css));
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-cards\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css));
});
