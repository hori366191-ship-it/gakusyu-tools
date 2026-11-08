/**
 * 有機化学ビルダー（site/app10）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app10-organic.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。data.js / draw.js を Node で読み込み、
 * 収録データの整合性・分子式と結合価の検証・異性体の組合せ・投影式の立体情報・
 * ポータル/テーマ/台帳の配線を静的に確認する。実際のクリック操作と最終回帰は
 * test サブエージェントが担当する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const APP = path.join(SITE, 'app10');

const D = require(path.join(APP, 'data.js'));
const R = require(path.join(APP, 'draw.js'));

function read(relPath) {
  return fs.readFileSync(path.join(SITE, relPath), 'utf8');
}

function combo(skeleton, group) {
  return ((D.COMBOS[skeleton] || {})[group] || []).map((e) => e.id);
}

function graphSignature(spec) {
  const g = R.buildStructure(spec);
  const atoms = g.atoms.map((a) => `${a.el}:${a.h}:${a.charge || ''}`).sort();
  const bonds = g.bonds.map((b) => {
    const lo = Math.min(b.a, b.b);
    const hi = Math.max(b.a, b.b);
    return `${lo}-${hi}:${b.order}`;
  }).sort();
  return atoms.join('|') + '#' + bonds.join('|');
}

function structureSignature(spec) {
  if (!spec) return null;
  if (['skeleton', 'sub', 'multi', 'custom'].includes(spec.type)) {
    return 'graph:' + graphSignature(spec);
  }
  if (spec.type === 'ring-sub') {
    return 'ring:' + (spec.subs || []).map((s) => s.at + ':' + s.label).sort().join('|');
  }
  if (spec.type === 'condensed') return 'condensed:' + (spec.lines || []).join('|');
  if (spec.type === 'projection') return 'projection:' + spec.kind + ':' + spec.sugar + ':' + (spec.anomer || '');
  if (spec.type === 'polymer') return 'polymer:' + spec.unit;
  if (spec.type === 'schematic') return 'schematic:' + spec.kind;
  return JSON.stringify(spec);
}

test('[data] 19分野と化合物IDの整合性', () => {
  assert.equal(D.CATEGORIES.length, 19);
  const catIds = new Set(D.CATEGORIES.map((c) => c.id));
  assert.equal(catIds.size, 19);
  assert.equal(new Set(D.SKELETONS.map((s) => s.id)).size, D.SKELETONS.length);
  assert.equal(new Set(D.GROUPS.map((g) => g.id)).size, D.GROUPS.length);
  const compoundIds = Object.keys(D.COMPOUNDS);
  assert.ok(compoundIds.length >= 90, '収録化合物が少なすぎます');
  for (const id of compoundIds) {
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

test('[data] すべての化合物が分子式・結合価の検証に合格する', () => {
  for (const id of Object.keys(D.COMPOUNDS)) {
    const v = R.validate(D.COMPOUNDS[id]);
    assert.equal(v.ok, true, id + ': ' + v.errors.join(' / '));
    assert.ok(v.computed, id + ' の計算分子式がありません');
  }
});

test('[data] 炭素骨格リストの化合物IDが存在する', () => {
  for (const sk of D.SKELETONS) {
    assert.ok(sk.id && sk.section && sk.label, '骨格の必須項目');
    assert.ok(Array.isArray(sk.ids) && sk.ids.length > 0, sk.id + ' の化合物IDがありません');
    for (const id of sk.ids) {
      assert.ok(D.COMPOUNDS[id], sk.id + ' の化合物IDが未登録: ' + id);
      assert.equal(R.validate(D.COMPOUNDS[id]).ok, true, sk.id + ' の構造検証に失敗: ' + id);
    }
    assert.ok(D.COMBOS[sk.id], sk.id + ' の組合せ表がありません');
  }
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

test('[data] すべての組合せが既存の化合物を参照し、重複しない', () => {
  for (const sid of Object.keys(D.COMBOS)) {
    assert.ok(D.skeletonById(sid), '未登録の骨格ID: ' + sid);
    for (const gid of Object.keys(D.COMBOS[sid])) {
      assert.ok(D.groupById(gid), '未登録の官能基ID: ' + sid + '/' + gid);
      const ids = D.COMBOS[sid][gid].map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, '組合せ内で化合物が重複: ' + sid + '/' + gid);
      for (const id of ids) {
        assert.ok(D.COMPOUNDS[id], '未登録の化合物ID: ' + sid + '/' + gid + '/' + id);
        assert.equal(R.validate(D.COMPOUNDS[id]).ok, true, '組合せ先の構造検証に失敗: ' + id);
      }
    }
  }
});

test('[data] 19分野すべてに1件以上の化合物がある', () => {
  const counts = {};
  for (const c of Object.values(D.COMPOUNDS)) counts[c.category] = (counts[c.category] || 0) + 1;
  for (const cat of D.CATEGORIES) {
    assert.ok(counts[cat.id] > 0, cat.id + ' の化合物がありません');
  }
});

test('[plan §10] 炭素骨格のみの選択', () => {
  assert.deepEqual(combo('alkane-c1', 'none'), ['methane']);
  assert.deepEqual(combo('alkane-c2', 'none'), ['ethane']);
  assert.deepEqual(combo('alkane-c4', 'none'), ['butane', 'isobutane']);
  assert.deepEqual(combo('aromatic-benzene', 'none'), ['benzene']);
  assert.deepEqual(combo('alkane-c5', 'none'), ['pentane', 'isopentane', 'neopentane']);
});

test('[plan §10] 官能基との組合せ', () => {
  assert.deepEqual(combo('alkane-c1', 'oh'), ['methanol']);
  assert.deepEqual(combo('alkane-c1', 'cooh'), ['acetic-acid']);
  assert.deepEqual(combo('alkane-c2', 'oh'), ['ethanol']);
  assert.deepEqual(combo('alkane-c2', 'cooh'), ['propionic-acid']);
  assert.deepEqual(combo('alkane-c3', 'oh'), ['propan-1-ol', 'propan-2-ol']);
  assert.deepEqual(combo('alkane-c4', 'oh'), [
    'butan-1-ol', 'butan-2-ol', '2-methylpropan-1-ol', '2-methylpropan-2-ol'
  ]);
  assert.deepEqual(combo('aromatic-benzene', 'oh'), ['phenol']);
  assert.deepEqual(combo('aromatic-benzene', 'ch3'), ['toluene']);
});

test('[plan §10] 同じ化合物は複数経路でも同じIDを参照する', () => {
  assert.deepEqual(combo('alkane-c1', 'ch3'), combo('alkane-c2', 'none'));
  assert.deepEqual(combo('alkene-c2', 'ch3'), combo('alkene-c3', 'none'));
  assert.deepEqual(combo('alkyne-c2', 'ch3'), combo('alkyne-c3', 'none'));
  assert.deepEqual(combo('alkane-c4', 'ch3').slice(0, 1), combo('alkane-c5', 'none').slice(0, 1));
});

test('[plan §10] 未対応の組合せは理由を返す', () => {
  assert.deepEqual(combo('alkane-c5', 'oh'), []);
  assert.match(D.unsupportedReason('alkane-c5', 'oh'), /炭素数5以上/);
  assert.match(D.unsupportedReason('alkane-c1', 'nh2'), /脂肪族アミン/);
  assert.match(D.unsupportedReason('alkane-c1', 'no2'), /脂肪族ニトロ/);
  assert.match(D.unsupportedReason('alkene-c2', 'oh'), /アルケン/);
  assert.match(D.unsupportedReason('alkene-c4', 'ch3'), /炭素数4のアルケン/);
  assert.match(D.unsupportedReason('alkyne-c4', 'ch3'), /炭素数4のアルキン/);
  assert.match(D.unsupportedReason('cyclo-c3', 'oh'), /環状炭化水素/);
  assert.match(D.unsupportedReason('aromatic-naphthalene', 'oh'), /ナフタレン/);
});

test('[plan §10] グルコースは鎖状・α・βの3形態', () => {
  assert.deepEqual(combo('ind-glucose', 'none'), ['glucose']);
  const sk = D.skeletonById('ind-glucose');
  assert.equal(sk.locked, true);
  const c = D.COMPOUNDS.glucose;
  assert.equal(c.figures.length, 3);
  assert.equal(c.figures[0].structure.kind, 'fischer');
  assert.equal(c.figures[0].structure.stereo.c2, 'right');
  assert.equal(c.figures[0].structure.stereo.c3, 'left');
  assert.equal(c.figures[0].structure.stereo.c4, 'right');
  assert.equal(c.figures[0].structure.stereo.c5, 'right');
  assert.equal(c.figures[1].structure.anomer, 'alpha');
  assert.equal(c.figures[1].structure.stereo.c1, 'down');
  assert.equal(c.figures[2].structure.anomer, 'beta');
  assert.equal(c.figures[2].structure.stereo.c1, 'up');
  const alphaSvg = R.renderStructure(c.figures[1].structure, 'alpha');
  const betaSvg = R.renderStructure(c.figures[2].structure, 'beta');
  assert.match(alphaSvg, /data-anomer="alpha"/);
  assert.match(alphaSvg, /data-c1oh="down"/);
  assert.match(alphaSvg, /data-c2oh="down"/);
  assert.match(alphaSvg, /data-c3oh="up"/);
  assert.match(alphaSvg, /data-c4oh="down"/);
  assert.match(alphaSvg, /data-c5ch2oh="up"/);
  assert.match(betaSvg, /data-anomer="beta"/);
  assert.match(betaSvg, /data-c1oh="up"/);
});

test('[draw] ベンゼンはケクレ式（二重結合3本）で、水素6個を明示', () => {
  const g = R.buildStructure({ type: 'skeleton', skeleton: 'benzene' });
  assert.equal(g.aromatic, true);
  assert.equal(g.atoms.filter((a) => a.el === 'C').length, 6);
  assert.equal(g.atoms.reduce((n, a) => n + a.h, 0), 6);
  assert.equal(g.bonds.filter((b) => b.order === 2).length, 3);
  assert.equal(g.bonds.filter((b) => b.order === 1).length, 3);
  const svg = R.renderStructure({ type: 'skeleton', skeleton: 'benzene' }, 'benzene');
  assert.equal((svg.match(/data-el="H"/g) || []).length, 6);
});

test('[draw] ベンゼン環の二重結合は環内側の追加線', () => {
  const benzene = R.renderStructure({ type: 'skeleton', skeleton: 'benzene' }, 'benzene');
  assert.equal((benzene.match(/oc-bond--inner/g) || []).length, 3);
  const phenol = R.renderStructure(D.COMPOUNDS.phenol.structure, 'phenol');
  assert.equal((phenol.match(/oc-bond--inner/g) || []).length, 3);
  const styrene = R.renderStructure(D.COMPOUNDS.styrene.structure, 'styrene');
  assert.equal((styrene.match(/oc-bond--inner/g) || []).length, 3);
  const naph = R.renderStructure({ type: 'skeleton', skeleton: 'naphthalene' }, 'naphthalene');
  assert.equal((naph.match(/oc-bond--inner/g) || []).length, 5);
});

test('[draw] 環置換基の結合は環頂点から始まる', () => {
  const svg = R.renderStructure(D.COMPOUNDS.styrene.structure, 'styrene');
  assert.match(svg, /x1="272\.0" y1="135\.0"/);
});

test('[draw] フルクトースのC2=Oは主鎖上のCとOを分離して描画', () => {
  const svg = R.renderStructure(D.COMPOUNDS.fructose.structure, 'fructose');
  assert.match(svg, /data-carbonyl="C2"/);
  assert.match(svg, /data-el="O"/);
  assert.equal(/C=O/.test(svg), false);
});

test('[draw] トリステアリンはグリセリン骨格のC-C結合を明示', () => {
  assert.equal(D.COMPOUNDS.tristearin.structure.type, 'triglyceride');
  const svg = R.renderStructure(D.COMPOUNDS.tristearin.structure, 'tristearin');
  assert.match(svg, /data-kind="triglyceride"/);
  assert.equal((svg.match(/oc-bond--backbone/g) || []).length, 2);
  assert.equal((svg.match(/O—CO—C₁₇H₃₅/g) || []).length, 3);
});

test('[data] タンパク質はR依存の一般式として検証する', () => {
  const c = D.COMPOUNDS.protein;
  assert.equal(c.formula, 'R依存');
  assert.equal(c.formulaVariable, true);
  assert.match(c.formulaDisplay, /R=H/);
  assert.equal(c.structure.unitFormula, undefined);
  assert.equal(c.structure.formulaReference, 'C2H3NO');
  const v = R.validate(c);
  assert.equal(v.ok, true);
  assert.equal(v.formulaStatus, 'variable');
  assert.equal(v.verification.short, '一般式（目視確認）');
});

test('[data] 検証方法を原子レベルと登録データ整合で区別する', () => {
  assert.equal(R.validate(D.COMPOUNDS.methane).verification.level, 'atom');
  assert.equal(R.validate(D.COMPOUNDS.methane).verification.short, '原子レベル');
  assert.equal(R.validate(D.COMPOUNDS.styrene).verification.level, 'composition');
  assert.equal(R.validate(D.COMPOUNDS.styrene).verification.short, '分子式整合（目視確認）');
  assert.equal(R.validate(D.COMPOUNDS.glucose).verification.short, '投影式（目視確認）');
  assert.equal(R.validate(D.COMPOUNDS.tristearin).verification.short, '構造式（目視確認）');
  assert.equal(R.validate(D.COMPOUNDS.polyethylene).verification.short, '重合体（目視確認）');
});

test('[draw] 小分子は水素を明示する', () => {
  const cases = [
    ['methane', 4], ['ethane', 6], ['propane', 8], ['ethene', 4], ['ethyne', 2]
  ];
  for (const [id, h] of cases) {
    const svg = R.renderStructure({ type: 'skeleton', skeleton: id }, id);
    assert.equal((svg.match(/data-el="H"/g) || []).length, h, id + ' のH数');
  }
  const isobutane = R.renderStructure({ type: 'skeleton', skeleton: 'isobutane' }, 'isobutane');
  assert.match(isobutane, /CH₃/);
});

test('[draw] ナフタレンの分子式と水素数', () => {
  const g = R.buildStructure({ type: 'skeleton', skeleton: 'naphthalene' });
  assert.equal(g.atoms.filter((a) => a.el === 'C').length, 10);
  assert.equal(g.atoms.reduce((n, a) => n + a.h, 0), 8);
  assert.equal(R.formulaOfGraph(g), 'C10H8');
});

test('[draw] 分子式の表示形式', () => {
  assert.equal(R.formatFormula('C6H12O6'), 'C₆H₁₂O₆');
  assert.equal(R.formatFormula('(C2H4)n'), '(C₂H₄)ₙ');
  assert.equal(R.formatFormula('C18H35NaO2'), 'C₁₈H₃₅NaO₂');
  assert.equal(R.unitFormula('(C6H10O5)n'), 'C6H10O5');
});

test('[draw] 不正な分子式・結合価は検証で落ちる', () => {
  const badFormula = Object.assign({}, D.COMPOUNDS.methane, { formula: 'CH5' });
  assert.equal(R.validate(badFormula).ok, false);
  const badValence = {
    id: 'bad', name: 'bad', formula: 'CH5', category: 'alkane',
    structure: {
      type: 'custom',
      atoms: [{ el: 'C', x: 100, y: 100, h: 5 }],
      bonds: [], mode: 'condensed'
    },
    sources: ['textbook']
  };
  assert.equal(R.validate(badValence).ok, false);
});

test('[draw] 全化合物がSVGで描画でき、NaNや未定義がない', () => {
  for (const id of Object.keys(D.COMPOUNDS)) {
    const svg = R.renderCompound(D.COMPOUNDS[id]);
    assert.ok(svg.includes('role="img"'), id + ' にrole=imgがありません');
    assert.ok(svg.includes('aria-label='), id + ' にaria-labelがありません');
    assert.equal(svg.includes('data-error="1"'), false, id + ' の描画に失敗');
    assert.equal(/NaN|undefined/.test(svg), false, id + ' のSVGにNaN/undefined');
  }
});

test('[draw] 簡略構造式・重合体・模式図には注記が付く', () => {
  const cases = [
    ['stearic-acid', /簡略構造式/],
    ['tristearin', /グリセリン骨格/],
    ['polyethylene', /繰り返し単位/],
    ['sucrose', /模式図/]
  ];
  for (const [id, re] of cases) {
    const html = R.renderCompound(D.COMPOUNDS[id]);
    assert.match(html, re, id + ' の注記');
  }
});

test('[draw] 二糖の模式図は糖—O—糖が連続接続', () => {
  for (const id of ['sucrose', 'maltose', 'lactose']) {
    const svg = R.renderStructure(D.COMPOUNDS[id].structure, id);
    assert.match(svg, /x="210\.0" y="101\.0"[^>]*>O<\/text>/, id + ' のO位置');
    assert.match(svg, /x1="165\.0" y1="101\.0" x2="200\.0" y2="101\.0"/, id + ' の左側結合');
    assert.match(svg, /x1="220\.0" y1="101\.0" x2="255\.0" y2="101\.0"/, id + ' の右側結合');
    assert.equal(/y="70\.0"[^>]*>O<\/text>/.test(svg), false, id + ' のOが浮いている');
  }
});

test('[draw] 官能基プレビューはR-基の形で描画される', () => {
  for (const gid of ['oh', 'cooh', 'nh2', 'cho', 'no2', 'ch3', 'cl']) {
    const svg = R.renderGroupPreview(gid, gid);
    assert.ok(svg.includes('>R<'), gid + ' のR表記');
    assert.ok(svg.includes('data-kind="graph"'), gid + ' のSVG種別');
  }
  assert.match(R.renderGroupPreview('none', 'なし'), /追加なし/);
});

test('[data] PubChem CIDは数値で、重複しない', () => {
  const seen = new Map();
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    if (c.pubchem == null) continue;
    assert.equal(typeof c.pubchem, 'number', id + ' のCIDが数値ではありません');
    assert.equal(seen.has(c.pubchem), false, id + ' と ' + seen.get(c.pubchem) + ' のCIDが重複');
    seen.set(c.pubchem, id);
  }
  assert.ok(seen.size >= 60, 'CID照合済みの化合物が少なすぎます');
});

test('[data] 台帳の未対応事項と出典', () => {
  const text = D.LEDGER_NOTES.map((n) => n.title + n.detail).join(' ');
  assert.match(text, /幾何異性体/);
  assert.match(text, /光学異性体/);
  assert.match(text, /C5以上/);
  assert.match(text, /糖類の環状構造/);
  for (const sid of ['textbook', 'mext', 'pubchem', 'nist', 'iupac', 'csj']) {
    assert.ok(D.SOURCES[sid], '出典がありません: ' + sid);
  }
  assert.match(D.SOURCES.mext.url, /mext\.go\.jp/);
  assert.match(D.SOURCES.pubchem.url, /pubchem\.ncbi\.nlm\.nih\.gov/);
});

test('[static] 本体・台帳・ポータル・クレジット・テーマの配線', () => {
  const html = read('app10/index.html');
  assert.match(html, /themes\/theme\.js/);
  assert.match(html, /themes\/pop\.css/);
  assert.match(html, /themes\/forest\.css/);
  assert.match(html, /\.\/app\.css/);
  assert.match(html, /\.\/data\.js/);
  assert.match(html, /\.\/draw\.js/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /id="skeleton-list"/);
  assert.match(html, /id="group-list"/);
  assert.match(html, /id="results"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="\.\/ledger\.html"/);
  assert.match(html, /登録データの整合/);
  assert.match(html, /目視確認/);
  assert.equal(/INTERACTIVE MOCK|UIモック|モックです/.test(html), false);

  const ledger = read('app10/ledger.html');
  assert.match(ledger, /\.\/data\.js/);
  assert.match(ledger, /\.\/draw\.js/);
  assert.match(ledger, /\.\/ledger\.js/);
  assert.match(ledger, /id="ledger-rows"/);
  assert.match(ledger, /検証方法/);
  const ledgerJs = read('app10/ledger.js');
  assert.match(ledgerJs, /分子式・登録データ整合/);
  assert.match(ledgerJs, /目視確認/);

  const portal = read('index.html');
  assert.match(portal, /href="\.\/app10\/"/);
  assert.match(portal, /有機化学ビルダー/);
  assert.match(portal, /sec--sci/);

  const credits = read('credits.html');
  assert.match(credits, /PubChem/);
  assert.match(credits, /文部科学省/);
  assert.match(credits, /有機化学ビルダー/);

  const pop = read('themes/pop.css');
  const forest = read('themes/forest.css');
  assert.match(pop, /app10 — 有機化学ビルダー/);
  assert.match(pop, /html\[data-theme="pop"\] body\.oc-app/);
  assert.match(forest, /app10 — 有機化学ビルダー/);
  assert.match(forest, /html\[data-theme="forest"\] body\.oc-app/);
});

test('[static] ポータル理科カードの学年とリンク', () => {
  const portal = read('index.html');
  const idx = portal.indexOf('href="./app10/"');
  assert.ok(idx > 0);
  const block = portal.slice(Math.max(0, idx - 500), idx + 500);
  assert.match(block, /subj--sci/);
  assert.match(block, /高校生以上/);
  assert.match(block, /target="_blank"/);
});

test('[static] アプリは個別化合物で官能基を無効化する', () => {
  const js = read('app10/app.js');
  assert.match(js, /locked/);
  assert.match(js, /btn\.disabled = !!sk\.locked/);
  assert.match(js, /個別登録された化合物です/);
  assert.match(js, /新しい官能基の追加はできません/);
  assert.match(js, /unsupportedReason/);
  assert.match(js, /aria-pressed/);
});
