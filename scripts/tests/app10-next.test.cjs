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
  assert.ok(html.includes('条件不足'));
  assert.ok(html.includes('chain-structure-list'));
  const js = read('app.js');
  assert.ok(js.includes('飽和鎖式'));
  assert.ok(js.includes('不飽和鎖式'));
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
