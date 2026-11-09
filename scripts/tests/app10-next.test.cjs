/**
 * 有機化学ビルダー（design-lab/app10-next）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app10-next.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。data.js / draw.js / catalog.js /
 * index-manifest.js / index-audit.js を Node で読み込み、新版の分類・
 * 総炭素数・級・異性体・索引監査・配線を静的に確認する。実際のクリック操作は
 * test サブエージェントが担当する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'design-lab', 'app10-next');

const D = require(path.join(APP, 'data.js'));
const R = require(path.join(APP, 'draw.js'));
const X = require(path.join(APP, 'chain-descriptor.js'));
const C = require(path.join(APP, 'catalog.js'));
const E = require(path.join(APP, 'external-coverage.js'));
const M = require(path.join(APP, 'index-manifest.js'));
const A = require(path.join(APP, 'index-audit.js'));
const IA = require(path.join(APP, 'independent-audit.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
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
  assert.ok(ids.length >= 419, '収録化合物が少なすぎます: ' + ids.length);
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
    assert.ok((c.sourceEvidence || []).length > 0, id + ' の引用根拠がない');
    for (const ev of c.sourceEvidence) {
      assert.ok(/^https?:\/\//.test(ev.url), id + ' の根拠URLが不正: ' + ev.url);
      assert.ok(ev.quote && ev.quote.length >= 8, id + ' の引用が短い');
      assert.ok(ev.section, id + ' の節がない');
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
    assert.ok(fig.includes('oc-fig--scroll'), id + ' は長い鎖式を局所スクロールにする');
  }
});

test('[data] 46追加分のsourceEvidenceは引用と補足を分離している', () => {
  for (const id of PRESERVED_46) {
    const c = D.COMPOUNDS[id];
    assert.ok((c.sourceEvidence || []).length > 0, id + ' のsourceEvidenceがない');
    for (const ev of c.sourceEvidence) {
      assert.ok(/^https?:\/\//.test(ev.url), id + ' のURLが不正');
      assert.ok(ev.section, id + ' の節がない');
      assert.ok(ev.quote && ev.quote.length >= 8, id + ' の引用が短い');
      assert.ok(ev.note, id + ' の補足がない');
    }
  }
});

test('[data] 本番site/app10のデータを独立して保持している', () => {
  const siteDataPath = path.join(ROOT, 'site', 'app10', 'data.js');
  delete require.cache[require.resolve(siteDataPath)];
  const S = require(siteDataPath);
  assert.equal(Object.keys(S.COMPOUNDS).length, 367, 'site/app10はHEAD検証済みの367化合物');
  assert.equal(S.FAMILIES, undefined, 'site/app10に新版familyを混ぜない');
  assert.equal(S.COMPOUNDS.ethylmethylamine, undefined, 'site/app10に新版の追加アミンを混ぜない');
  assert.equal(Object.keys(D.COMPOUNDS).length, 419);
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
  assert.equal(Object.keys(D.COMPOUNDS).length, 419);
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
    assert.ok(ev.image && /^https?:\/\//.test(ev.image), id + ' の画像URLがない');
    assert.ok(ev.quote && ev.note && ev.quote !== ev.note, id + ' の原文出現と化学補足が分離されていない');
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
    assert.ok(x.identity && x.url && x.image, x.id + ' のprovenance/identityがない');
  }
  assert.equal(IA.PROVENANCE['idx-kimika/image-human-read'], 7);
  assert.equal(IA.IMAGE_REVIEW.all1399OcrCompleted, false);
  assert.ok(IA.META.limits.some((t) => /1399/.test(t)));
  assert.ok(IA.META.limits.some((t) => /動画/.test(t)));
  for (const x of IA.CROSSWALK) {
    assert.ok(x.target, 'crosswalk targetなし: ' + x.term);
    assert.ok(D.COMPOUNDS[x.target] || D.materialById(x.target) || D.familyById(x.target), 'crosswalk target未解決: ' + x.term);
  }
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
  for (const ch of M.CHAPTERS) assert.equal(ch.expectedLessons, ch.obtainedLessons, ch.name + ' のlesson数が不一致');
  for (const p of M.PAGES) {
    assert.ok(/^https?:\/\//.test(p.url), 'URLが不正: ' + p.url);
    assert.ok(p.title && p.title.length > 0, p.url + ' のtitleがない');
    assert.ok(p.section, p.url + ' のsectionがない');
    assert.ok(p.type, p.url + ' のtypeがない');
    assert.equal(p.status, 200, p.url + ' のstatusが200でない');
    assert.match(p.hash, /^[0-9a-f]{64}$/, p.url + ' のhashが不正');
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
    assert.ok(Array.isArray(f.urls) && f.urls.length > 0, f.term + ' のURLがない');
    for (const u of f.urls) assert.ok(/^https?:\/\//.test(u), f.term + ' のURLが不正');
    assert.ok(f.quote && f.quote.length >= 8, f.term + ' の引用が短い');
    assert.ok(f.supplement, f.term + ' のsupplementがない');
    if (f.resolution === 'compound') assert.ok(D.COMPOUNDS[f.ref], f.term + ' の化合物IDがない');
    if (f.resolution === 'material' || f.resolution === 'variant') assert.ok(D.materialById(f.ref), f.term + ' の材料IDがない');
    if (f.resolution === 'family') assert.ok(D.familyById(f.ref), f.term + ' のfamily IDがない');
    if (f.resolution === 'inorganic') assert.equal(f.ref, null);
  }
  assert.ok(A.LIMITS.some((t) => /画像/.test(t)));
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

test('[chain] 154件すべてが検証済みexact graphからデスクリプタを持つ', () => {
  const chainIds = Object.keys(D.COMPOUNDS).filter((id) => C.classify(id).mode === 'chain');
  assert.equal(chainIds.length, 154);
  assert.equal(C.CHAIN_DESCRIPTOR_LIST.length, 46, '位置異性体4組を分離した実測デスクリプタ数');
  assert.deepEqual(C.CHAIN_DESCRIPTOR_WARNINGS, []);
  // 件数だけで受理しない: 全デスクリプタのexact tree canonicalが相異なり、
  // 同じkeyへ別構造が混ざっていないことを確認する。
  const exactKeys = new Set(C.CHAIN_DESCRIPTOR_LIST.map((d) => d.uniqueFragments.map((f) => f.skeleton + '|' + f.doubleBonds + '|' + f.tripleBonds + 'x' + (f.count || 1)).join('*')));
  assert.equal(exactKeys.size, C.CHAIN_DESCRIPTOR_LIST.length, 'exact canonical multisetが重複しない');
  assert.equal(new Set(C.CHAIN_DESCRIPTOR_LIST.map((d) => d.id)).size, C.CHAIN_DESCRIPTOR_LIST.length);
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    assert.ok(d.key && d.id, 'descriptor key/id');
    assert.ok(d.uniqueFragments.length > 0, d.id + ' の断片');
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
  assert.deepEqual(sources, { build: 80, condensed: 71, manual: 3 });
  assert.equal(X.exactGraphFor(D.COMPOUNDS['maleic-acid']).source, 'manual');
  assert.equal(X.exactGraphFor(D.COMPOUNDS['fumaric-acid']).source, 'manual');
  assert.equal(X.exactGraphFor(D.COMPOUNDS.eicosane).source, 'manual');
  const reached = new Set();
  for (const d of C.CHAIN_DESCRIPTOR_LIST) d.compoundIds.forEach((id) => reached.add(id));
  assert.equal(reached.size, 154, '全154件が①から到達可能');
});

test('[chain] 31件の代表mapping（部分C数・断片数・ラベル）', () => {
  const expected = {
    ethanol: [2, 1, 'エタン由来'],
    methanol: [1, 1, 'メチル基（メタン由来）'],
    'acetic-acid': [1, 1, 'メチル基（メタン由来）'],
    'propionic-acid': [2, 1, 'エタン由来'],
    acetone: [2, 2, 'メチル基×2'],
    'methyl-acetate': [2, 2, 'メチル基×2'],
    'methyl-formate': [1, 2, 'H＋メチル基'],
    acetonitrile: [1, 1, 'メチル基（メタン由来）'],
    'acetic-anhydride': [2, 2, 'メチル基×2'],
    'dimethyl-ether': [2, 2, 'メチル基×2'],
    dimethylamine: [2, 2, 'メチル基×2'],
    trimethylamine: [3, 3, 'メチル基×3'],
    triacetin: [6, 4, 'プロパン骨格＋メチル基×3'],
    'pyruvic-acid': [1, 1, 'メチル基（メタン由来）'],
    'adipoyl-chloride': [4, 1, 'ブタン由来'],
    'oxalic-acid': [0, 1, '炭化水素基なし〈H〉'],
    'formic-acid': [0, 1, '炭化水素基なし〈H〉'],
    formaldehyde: [0, 1, '炭化水素基なし〈H〉'],
    glycerol: [3, 1, 'プロパン由来'],
    'ethylene-glycol': [2, 1, 'エタン由来'],
    'propylene-glycol': [3, 1, 'プロパン由来'],
    'lactic-acid': [2, 1, 'エタン由来'],
    'citric-acid': [3, 1, 'プロパン由来'],
    'tartaric-acid': [2, 1, 'エタン由来'],
    'ethyl-acetate': [3, 2, 'エチル基＋メチル基'],
    'methyl-propionate': [3, 2, 'エチル基＋メチル基'],
    'butan-1-ol': [4, 1, 'ブタン由来'],
    '2-methylpropan-1-ol': [4, 1, 'イソブタン由来'],
    'but-1-ene': [4, 1, 'ブタ-1-エン'],
    isobutene: [4, 1, 'イソブテン由来'],
    'propan-1-ol': [3, 1, 'プロパン由来']
  };
  assert.equal(Object.keys(expected).length, 31);
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
  assert.equal(C.chainDescriptorLabel(methyl.descriptorId), 'メチル基（メタン由来）');
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

  // ②は −CHO を主表示、アルデヒド基を補足。結果の分類名は「アルデヒド」を保持。
  assert.deepEqual(C.chainFamilyPick('aldehyde'), {
    main: '−CHO',
    sub: 'アルデヒド基',
    note: '末端のカルボニル基。R−C(=O)−H。'
  });
  assert.equal(C.CHAIN_FAMILY_LABEL.aldehyde, 'アルデヒド', '結果分類名はアルデヒドのまま');
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

  // アルデヒド以外の分類は従来表記のまま（エステルを含む）。
  for (const f of C.CHAIN_FAMILIES) {
    if (f.id === 'aldehyde') continue;
    assert.equal(C.chainFamilyPick(f.id).main, f.label, f.id + ' は従来の分類名');
    assert.equal(C.chainFamilyPick(f.id).sub, '', f.id + ' に補足を足さない');
  }
  assert.equal(C.classify('methyl-acetate').family, 'ester', 'エステルfamilyは不変');
  assert.equal(C.chainDescriptorFor('methyl-acetate').descriptorId, 'd-methanex2-c2', 'エステルdescriptorは不変');
  assert.equal(C.chainDescriptorLabel('d-methanex2-c2'), 'メチル基×2');
  assert.equal(C.chainDescriptorFor('methyl-acetate').role, 'monoester');
  assert.deepEqual(C.chainIdsForDescriptor('d-methanex2-c2', 'ester'), ['methyl-acetate']);
  assert.equal(C.chainDescriptorFor('ethyl-acetate').descriptorId, 'd-ethane+methane-c3',
    'エステルのacyl/alkoxyは①で分けない既存挙動');

  const js = read('app.js');
  const familyFn = js.slice(js.indexOf('function renderChainFamilyList'), js.indexOf('function genCard'));
  assert.ok(familyFn.includes('C.chainFamilyPick(f.id)'), '②は分類ごとの表示を使う');
  assert.ok(familyFn.includes('pick.main') && familyFn.includes('pick.sub'));
  assert.equal(familyFn.includes('state.chainShape ='), false, '②から①を書き換えない');
  const previewFn = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.ok(previewFn.includes('R−C(=O)−H'), '右プレビューは R−C(=O)−H で示す');
  assert.ok(previewFn.includes('O–H ではありません'), 'CHOをO–Hと誤解させない');
  assert.ok(js.includes("aldehyde: ['R−C(=O)−H'"), '一般構造カードも同じ表記');
  const leftFn = js.slice(js.indexOf('function renderChainLeftFigure'), js.indexOf('function renderChainFamilyList'));
  assert.equal(leftFn.includes('CHO'), false, '左①はCHOを描かず骨格だけ');
  const resultFn = js.slice(js.indexOf('function renderChainResults'), js.indexOf('/* ------------------------------------------------------------------\n   * 芳香族・環式'));
  assert.ok(resultFn.includes('C.CHAIN_FAMILY_LABEL[state.chainFamily]'), '結果見出しは分類名（アルデヒド）');
  assert.equal((resultFn.match(/class="oc-cards/g) || []).length, 1, '2列グリッドを維持');
});

test('[chain] −CHO固定Hとギ酸/ギ酸エステルR=Hを独立に分離する', () => {
  const cases = [
    ['ethanal', 'd-methane-c1', 'メチル基（メタン由来）', 'aldehyde', 1, 0, false],
    ['propanal', 'd-ethane-c2', 'エタン由来', 'aldehyde', 1, 0, false],
    ['formaldehyde', 'd-h-c0', '炭化水素基なし〈H〉', 'aldehyde', 1, 1, true],
    ['formic-acid', 'd-h-c0', '炭化水素基なし〈H〉', 'carboxyl', 0, 1, true],
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
  assert.equal(c0.length, 1);
  assert.equal(c0[0].label, '炭化水素基なし〈H〉');
  assert.deepEqual(c0[0].compoundIds.sort(), ['formaldehyde', 'formic-acid', 'oxalic-acid']);
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
    assert.equal(C.chainDescriptorLabel(da.descriptorId), la, a + ' のlabel');
    assert.equal(C.chainDescriptorLabel(db.descriptorId), lb, b + ' のlabel');
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

test('[chain] 多官能25件のroleとC数をgraphで確認する', () => {
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
    triacetin: 'triester'
  };
  assert.equal(Object.keys(roles).length, 25);
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
  const c0Roles = C.chainDescriptorRoles('d-h-c0', 'carboxylic');
  assert.deepEqual(c0Roles.map((r) => r.role).sort(), ['dicarboxy', 'monocarboxy']);
  assert.equal(c0Roles.find((r) => r.role === 'dicarboxy').label, '二価カルボン酸（2COOH）');
  const c3Roles = C.chainDescriptorRoles('d-propane-c3', 'carboxylic');
  assert.ok(c3Roles.length > 1, '一価の一般式だけを当てはめない');
  assert.ok(c3Roles.some((r) => r.role === 'monocarboxy'));
  assert.ok(c3Roles.some((r) => r.role === 'dicarboxy'));
  assert.ok(c3Roles.some((r) => r.role === 'hydroxy-polycarboxy'));
});

test('[chain] 全154件の①到達と全419件のroute維持・旧API互換', () => {
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
  assert.equal(C.auditCoverage().modes.chain, 154);
  const ledger = read('ledger.js');
  assert.ok(ledger.includes('cpartial'));
  assert.ok(ledger.includes('route.partialC'));
  assert.ok(ledger.includes('chainDescriptorLabel'));
});

test('[chain] ①previewは親炭化水素を分離し、②は一般fragmentのみ', () => {
  const methyl2 = C.chainDescriptorPreview('d-methanex2-c2');
  assert.equal(methyl2.length, 2, 'メチル基×2は2枚に分ける');
  assert.deepEqual(methyl2.map((t) => t.label), ['メチル基', 'メチル基']);
  for (const tile of methyl2) {
    assert.equal(tile.kind, 'hydrocarbon');
    assert.equal(tile.marks.length, 1, '接続点を1つ○で示す');
    const svg = R.renderStructure(tile.structure, tile.label);
    assert.ok(svg.includes('<svg'));
    assert.ok(!svg.includes('NaN'));
  }
  const tri = C.chainDescriptorPreview('d-methanex3+propane-c6');
  assert.equal(tri.length, 4, 'プロパン＋メチル×3を4断片に分離');
  assert.equal(tri[0].label, 'プロパン骨格');
  assert.equal(tri[0].marks.length, 3);
  assert.deepEqual(tri.slice(1).map((t) => t.label), ['メチル基', 'メチル基', 'メチル基']);
  const h = C.chainDescriptorPreview('d-h+methane-c1');
  assert.equal(h.length, 2);
  assert.equal(h[0].kind, 'hydrogen');
  assert.equal(h[1].label, 'メチル基');
  const js = read('app.js');
  const previewFn = js.slice(js.indexOf('function renderChainPreview'), js.indexOf('function chainCardBadges'));
  assert.equal(previewFn.includes('renderStructure'), false, '②に骨格SVGを出さない');
  assert.equal(previewFn.includes('renderCompound'), false, '②に分子図を出さない');
  assert.ok(js.includes('function renderChainLeftFigure'));
  assert.ok(js.includes('oc-attach-mark'));
  for (const d of C.CHAIN_DESCRIPTOR_LIST) {
    const tiles = C.chainDescriptorPreview(d.id);
    assert.ok(tiles.length > 0, d.id + ' のpreviewがない');
    for (const tile of tiles) {
      if (tile.kind !== 'hydrocarbon') continue;
      const svg = R.renderStructure(tile.structure, tile.label);
      assert.ok(svg.includes('<svg'), d.id + ' のpreview SVG');
      assert.ok(!svg.includes('NaN'), d.id + ' のpreviewにNaN');
      assert.equal(tile.marks.length, tile.attachmentCount, d.id + ' の接続点○数');
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
  assert.ok(html.includes('../../site/themes/theme.js'));
  assert.ok(html.includes('../../site/themes/pop.css'));
  assert.ok(html.includes('../../site/themes/forest.css'));
  assert.ok(!html.includes('../themes/'), '本流の旧相対パスが残っている');
  assert.ok(html.includes('../../site/credits.html'));
  assert.ok(html.includes('favicon.svg'));
  assert.ok(html.includes('./ledger.html'));
  assert.ok(html.includes('実合成手順') || html.includes('合成手順'));
  assert.ok(html.includes('条件不足') || html.includes('役割'));
  assert.ok(html.includes('chain-shape-list'));
  assert.equal(html.includes('chain-structure-list'), false, '旧・構造条件のUIを残さない');
  const js = read('app.js');
  assert.ok(js.includes('chainShapeOptions'));
  assert.ok(js.includes('chainDescriptorFamilyValid'));
  assert.equal(js.includes('飽和鎖式'), false, '旧・飽和/不飽和の選択を残さない');
  assert.equal(js.includes('data-carbon='), false, '旧・総炭素数の選択を残さない');
  const css = read('app.css');
  assert.ok(css.includes('[hidden] { display: none !important; }'), 'hidden属性をdisplay:gridが上書きしない');
  assert.ok(css.includes('.oc-fig--scroll'), '長い鎖式の局所スクロール');
  assert.ok(css.includes('min-width: 720px'), '長い鎖式を6pxまで縮小しない');
  assert.ok(/\.oc-fig--scroll\s*\{[^}]*align-items:\s*flex-start/s.test(css), 'スクロール領域を左寄せにする');
  assert.ok(/\.oc-fig--scroll\s+\.oc-svg\s*\{[^}]*flex:\s*0 0 auto/s.test(css), '長鎖SVGを縮小しない');
});

test('[static] ledger.htmlは索引監査・family/材料索引・テーマ共有をもつ', () => {
  const html = read('ledger.html');
  assert.ok(html.includes('../../site/themes/theme.js'));
  assert.ok(html.includes('../../site/credits.html'));
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
  assert.ok(js.includes('prefers-reduced-motion'));
  assert.ok(js.includes('Element.prototype.animate'));
  assert.ok(js.includes('resetHeight'));
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

test('[static] READMEが機能・収録数・family・制限・ローカルURLを説明する', () => {
  const md = fs.readFileSync(path.join(APP, 'README.md'), 'utf8');
  assert.ok(md.includes('app10-next'));
  assert.ok(md.includes('総炭素数'));
  assert.ok(md.includes('固定'));
  assert.ok(md.includes('family'));
  assert.ok(md.includes('1399'));
  assert.ok(md.includes('625'));
  assert.ok(md.includes('http://localhost:8000/design-lab/app10-next/'));
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
  assert.equal(C.chainDescriptorLabel('d-h-c0'), '炭化水素基なし〈H〉');
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
  assert.equal(C.RING_SYSTEM_MAP.benzene.registeredSingle.length, 11);
  assert.equal(C.RING_SYSTEM_MAP.benzene.registeredMulti.length, 35);
  const sections = ['single', 'same', 'combo'];
  for (const kind of sections) assert.ok(C.RING_SYSTEM_MAP.benzene.presets.some((p) => p.kind === kind), kind);
  const js = read('app.js');
  for (const label of ['置換基1つ', '同じ置換基を複数', '異なる置換基組み合わせ']) assert.ok(js.includes(label), label);
});

test('[ring] routeForは全419件でpresetを返し、legacy/focusの行先が有効', () => {
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
  assert.equal(audit.total, 419);
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
  assert.ok(css.includes('min-width: 400px'), 'モバイルは図の最小可読幅を確保');
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
    assert.ok(text.includes('../../site/themes/theme.js'));
    assert.ok(text.includes('../../site/themes/pop.css'));
    assert.ok(text.includes('../../site/themes/forest.css'));
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
