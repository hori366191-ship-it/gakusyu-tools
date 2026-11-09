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
const E = require(path.join(APP, 'external-coverage.js'));

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

test('[plan §10] 未対応の組合せは分類された理由を返す', () => {
  assert.deepEqual(combo('alkane-c6', 'oh'), []);
  assert.match(D.unsupportedReason('alkane-c6', 'oh'), /C6アルカン/);
  assert.match(D.unsupportedReason('alkane-c1', 'no2'), /ニトロアルカン/);
  assert.match(D.unsupportedReason('alkene-c2', 'nh2'), /エナミン/);
  assert.match(D.unsupportedReason('alkene-c4', 'oh'), /C4アルケン/);
  assert.match(D.unsupportedReason('alkyne-c4', 'ch3'), /アルキン/);
  assert.match(D.unsupportedReason('cyclo-c3', 'oh'), /環状炭化水素/);
  assert.match(D.unsupportedReason('aromatic-naphthalene', 'oh'), /ナフトール/);
  assert.equal(D.unsupportedReason('alkane-c1', 'oh'), null);
  const entry = D.unsupportedEntry('alkene-c2', 'nh2');
  assert.equal(entry.type, 'out-of-scope');
  assert.ok(entry.examples.length > 0);
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
  assert.equal(v.verification.short, '一般式');
});

test('[data] 検証方法を原子レベルと登録データ整合で区別する', () => {
  assert.equal(R.validate(D.COMPOUNDS.methane).verification.level, 'atom');
  assert.equal(R.validate(D.COMPOUNDS.methane).verification.short, '原子レベル');
  assert.equal(R.validate(D.COMPOUNDS.styrene).verification.level, 'composition');
  assert.equal(R.validate(D.COMPOUNDS.styrene).verification.short, '分子式整合');
  assert.equal(R.validate(D.COMPOUNDS.glucose).verification.short, '投影式');
  assert.equal(R.validate(D.COMPOUNDS.tristearin).verification.short, '構造式');
  assert.equal(R.validate(D.COMPOUNDS.polyethylene).verification.short, '重合体');
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
  assert.match(text, /水素置換/);
  assert.match(text, /範囲外/);
  assert.match(text, /データ不備/);
  assert.match(text, /可変組成/);
  assert.match(text, /核酸/);
  assert.match(text, /C5アルコール/);
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
  assert.match(html, /href="\.\.\/credits\.html"/);
  assert.match(html, /登録データの整合/);
  assert.equal(/目視確認/.test(html), false);
  assert.equal(/href="\.\.\/"/.test(html), false);
  assert.equal(/INTERACTIVE MOCK|UIモック|モックです/.test(html), false);

  const ledger = read('app10/ledger.html');
  assert.match(ledger, /\.\/data\.js/);
  assert.match(ledger, /\.\/draw\.js/);
  assert.match(ledger, /\.\/ledger\.js/);
  assert.match(ledger, /id="ledger-rows"/);
  assert.match(ledger, /検証方法/);
  assert.equal(/href="\.\.\/"/.test(ledger), false);
  assert.match(ledger, /href="\.\/"/);
  assert.match(ledger, /href="\.\.\/credits\.html"/);
  const ledgerJs = read('app10/ledger.js');
  assert.match(ledgerJs, /分子式・登録データ整合/);
  assert.equal(/目視確認/.test(ledgerJs), false);
  assert.match(ledgerJs, /自動検証の対象外/);

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
  assert.match(js, /unsupportedEntry/);
  assert.match(js, /aria-pressed/);
});

test('[data] 検証ラベルは自動検証の範囲だけを示す', () => {
  const seen = new Set();
  for (const id of Object.keys(D.COMPOUNDS)) {
    const v = R.validate(D.COMPOUNDS[id]).verification;
    assert.ok(v && v.short && v.label, id + ' の検証ラベルがありません');
    assert.equal(/目視確認/.test(v.short + ' ' + v.label), false, id + ' の検証ラベル');
    seen.add(v.short);
  }
  for (const short of ['原子レベル', '分子式整合', '投影式', '簡略式', '構造式', '重合体', '模式図', '一般式', '模式図（可変組成）', '可変組成（原子検証対象外）']) {
    assert.ok(seen.has(short), short + ' の検証ラベルが使われていません');
  }
});

test('[static] 表示用ソースに「目視確認」の表記が残らない', () => {
  for (const rel of ['app10/app.js', 'app10/draw.js', 'app10/index.html', 'app10/ledger.html', 'app10/ledger.js', 'app10/app.css']) {
    assert.equal(/目視確認/.test(read(rel)), false, rel + ' に目視確認が残っています');
  }
});

test('[static] 骨格分類detailsはopen属性が常に最大1で、初期選択の分類を維持する', () => {
  const js = read('app10/app.js');
  assert.match(js, /<div class="oc-group__body">/);
  assert.match(js, /function bindSkeletonGroups\(\)/);
  assert.match(js, /querySelectorAll\('details\.oc-group'\)/);
  assert.match(js, /function reconcileDetails\(\)/);
  assert.match(js, /activeDetails === desiredDetails/);
  assert.match(js, /detailsPhase === 'closing'/);
  assert.match(js, /desiredDetails = desiredDetails === details \? null : details/);
  assert.match(js, /summary\.addEventListener\('click'/);
  assert.match(js, /e\.preventDefault\(\)/);
  // 閉じ切ってから次を開く逐次方式（open=true の代入は1か所だけ）
  assert.equal((js.match(/details\.open = true/g) || []).length, 1);
  assert.match(js, /details\.open = open;[\s\S]{0,240}reconcileDetails\(\);/);
  // 閉じた状態から開くときは高さ0を起点にアニメーションする
  assert.match(js, /var current = 0;/);
  assert.match(js, /else if \(details\.open\) \{/);
  // 初期選択の分類は open 属性付きで生成し、それ以外は閉じる
  assert.match(js, /section\.name === currentSection/);
  assert.match(js, /\(open \? 'open' : ''\)/);
  assert.match(js, /activeDetails = els\.skeletonList\.querySelector\('details\.oc-group\[open\]'\)/);
});

test('[static] 高さアニメーションはprefers-reduced-motionとWAAPI非対応で無効化できる', () => {
  const js = read('app10/app.js');
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /typeof Element\.prototype\.animate === 'function'/);
  assert.match(js, /function canAnimate\(\)/);
  assert.match(js, /el\.style\.height = ''/);
  assert.match(js, /\.style\.overflow = ''/);
  assert.match(js, /anim\.onfinish/);
  assert.match(js, /anim\.oncancel/);
  assert.match(js, /animateHeight\(els\.results, renderResults\)/);
  assert.match(js, /animateHeight\(els\.skeletonPreview, renderSkeletonPreview\)/);
  assert.match(js, /animateHeight\(els\.groupPreview, renderGroupPreview\)/);
  const css = read('app10/app.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /transition: none !important/);
});

test('[data] 全化合物に主要反応・前駆体の解説と出典がある', () => {
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    assert.ok(typeof c.precursors === 'string' && c.precursors.length >= 4, id + ' の前駆体解説がありません');
    assert.ok(typeof c.reactions === 'string' && c.reactions.length >= 4, id + ' の反応解説がありません');
    assert.ok(Array.isArray(c.sources) && c.sources.length > 0, id + ' の出典がありません');
    assert.equal(/^情報未登録/.test(c.properties), false, id + ' の性質が未登録です');
    assert.equal(/^情報未登録/.test(c.uses), false, id + ' の用途が未登録です');
    assert.equal(/^情報未登録/.test(c.nature), false, id + ' の由来が未登録です');
  }
});

/* ------------------------------------------------------------------
 * 収録カバレッジ
 * ------------------------------------------------------------------ */

function coverageIds() {
  const set = new Set();
  for (const group of D.COVERAGE) for (const id of group.items) set.add(id);
  return set;
}

function emptyCombos() {
  const out = [];
  for (const sk of D.SKELETONS) {
    if (sk.locked) continue;
    for (const g of D.GROUPS) {
      if (g.id === 'none') continue;
      const list = (D.COMBOS[sk.id] || {})[g.id] || [];
      if (!list.length) out.push({ skeleton: sk.id, group: g.id, section: sk.section, label: sk.label, groupLabel: g.label });
    }
  }
  return out;
}

test('[coverage] チェックリストの全項目が登録され、全化合物がいずれかに含まれる', () => {
  const covered = coverageIds();
  const ids = Object.keys(D.COMPOUNDS);
  const externalIds = new Set(E.ROWS.filter((r) => r.kind === 'compound' || r.kind === 'alias').map((r) => r.ref));
  assert.ok(ids.length >= 260, '収録化合物が少なすぎます: ' + ids.length);
  for (const id of covered) {
    assert.ok(D.COMPOUNDS[id], 'カバレッジ項目が未登録: ' + id);
    assert.equal(R.validate(D.COMPOUNDS[id]).ok, true, 'カバレッジ項目の検証に失敗: ' + id);
  }
  const notCovered = ids.filter((id) => !covered.has(id) && !externalIds.has(id));
  assert.deepEqual(notCovered, [], '標準カバレッジにも外部照合台帳にも含まれない化合物: ' + notCovered.join(', '));
  assert.equal(D.COVERAGE.length, 19, 'カバレッジ区分の数');
  for (const group of D.COVERAGE) {
    assert.ok(D.SOURCES[group.source], 'カバレッジの出典が不正: ' + group.source);
    assert.ok(group.label && group.items.length > 0, 'カバレッジ項目が空です');
  }
  assert.match(D.COVERAGE_META.scope, /網羅したとは主張しません/);
  assert.match(D.COVERAGE_META.note, /件数/);
  assert.match(D.COVERAGE_META.exclusions, /データ不備/);
});

test('[coverage] 標準20アミノ酸と主要グループの収録', () => {
  const amino = [
    'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'serine', 'threonine',
    'cysteine', 'methionine', 'aspartic-acid', 'glutamic-acid', 'asparagine', 'glutamine',
    'lysine', 'arginine', 'histidine', 'phenylalanine', 'tyrosine', 'tryptophan', 'proline'
  ];
  for (const id of amino) {
    assert.ok(D.COMPOUNDS[id], '標準アミノ酸が未登録: ' + id);
    assert.equal(D.COMPOUNDS[id].category, 'amino', id + ' の分類');
  }
  assert.ok(D.COMPOUNDS.cystine && D.COMPOUNDS.glutathione && D.COMPOUNDS.protein);
  assert.equal(D.COMPOUNDS.protein.formulaVariable, true);

  const required = {
    'C5アルコール': ['pentan-1-ol', 'pentan-2-ol', 'pentan-3-ol', '2-methylbutan-1-ol', '2-methylbutan-2-ol', '3-methylbutan-1-ol', '3-methylbutan-2-ol', '2,2-dimethylpropan-1-ol'],
    'C6アルカン': ['hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane'],
    'エーテル異性体': ['methoxyethane', '1-methoxypropane', '2-methoxypropane'],
    '多価アルコール': ['ethylene-glycol', 'glycerol', 'propylene-glycol'],
    '核酸': ['dna', 'rna'],
    '糖類': ['galactose', 'mannose', 'ribose', 'deoxyribose', 'sorbitol', 'amylopectin', 'dextrin', 'chitin', 'cellulose-acetate', 'cellulose-nitrate'],
    '単量体': ['butadiene', 'isoprene', 'vinyl-chloride', 'vinylidene-chloride', 'chloroprene', 'acrylonitrile', 'vinyl-acetate', 'methyl-methacrylate', 'caprolactam', 'hexamethylenediamine', 'urea', 'melamine', 'tetrafluoroethylene'],
    '合成高分子': ['pmma', 'pan', 'ptfe', 'pvac', 'pvdc', 'nylon6', 'phenol-resin', 'urea-resin', 'melamine-resin', 'epoxy-resin', 'silicone', 'polyurethane', 'sbr', 'br', 'chloroprene-rubber', 'pla', 'polycarbonate', 'sodium-polyacrylate', 'aramid', 'abs']
  };
  for (const [label, list] of Object.entries(required)) {
    for (const id of list) assert.ok(D.COMPOUNDS[id], label + ' が未登録: ' + id);
  }
  assert.match(D.COMPOUNDS.pva.name, /ポリビニルアルコール/);
  assert.equal(/ビニロン/.test(D.COMPOUNDS.pva.name), false, 'PVAとビニロンは別物質');
  assert.ok(D.COMPOUNDS.vinylon, 'ビニロンが未登録');
  assert.equal(D.COMPOUNDS.vinylon.formulaVariable, true);
  assert.match(D.COMPOUNDS.vinylon.notes, /アセタール環/);
  assert.match(D.COMPOUNDS.vinylon.notes, /水に溶け/);
});

test('[coverage] 主要なカルボン酸・エステル・油脂・芳香族誘導体', () => {
  const acids = ['formic-acid', 'lactic-acid', 'palmitic-acid', 'linolenic-acid', 'elaidic-acid', 'maleic-acid', 'fumaric-acid', 'adipic-acid', 'tartaric-acid', 'citric-acid', 'acrylic-acid', 'methacrylic-acid', 'phthalic-acid', 'isophthalic-acid', 'terephthalic-acid', 'succinic-acid', 'glutaric-acid', 'malonic-acid'];
  for (const id of acids) assert.ok(D.COMPOUNDS[id], 'カルボン酸が未登録: ' + id);
  assert.equal(D.COMPOUNDS['fumaric-acid'].formula, 'C4H4O4');
  assert.equal(D.COMPOUNDS['maleic-acid'].formula, 'C4H4O4');

  const esters = ['methyl-formate', 'ethyl-formate', 'propyl-formate', 'methyl-acetate', 'ethyl-acetate', 'methyl-propionate', 'ethyl-propionate', 'isoamyl-acetate', 'methyl-salicylate', 'ethyl-butyrate', 'butyl-acetate', 'triacetin'];
  for (const id of esters) assert.ok(D.COMPOUNDS[id], 'エステルが未登録: ' + id);

  const lipids = ['tripalmitin', 'triolein', 'trilinolein', 'sodium-palmitate', 'sodium-oleate', 'sodium-laurate', 'las'];
  for (const id of lipids) assert.ok(D.COMPOUNDS[id], '脂質・セッケンが未登録: ' + id);
  assert.deepEqual(D.COMPOUNDS.tripalmitin.structure.chains, ['C₁₅H₃₁', 'C₁₅H₃₁', 'C₁₅H₃₁']);
  assert.deepEqual(D.COMPOUNDS.triolein.structure.chains, ['C₁₇H₃₃', 'C₁₇H₃₃', 'C₁₇H₃₃']);
  assert.deepEqual(D.COMPOUNDS.trilinolein.structure.chains, ['C₁₇H₃₁', 'C₁₇H₃₁', 'C₁₇H₃₁']);

  const aromatics = ['o-xylene', 'm-xylene', 'p-xylene', 'o-cresol', 'm-cresol', 'p-cresol', 'catechol', 'resorcinol', 'hydroquinone', '1-naphthol', '2-naphthol', 'o-nitrotoluene', 'm-nitrotoluene', 'p-nitrotoluene', 'tnt', 'picric-acid', 'benzenesulfonic-acid', 'acetanilide', 'aniline-hydrochloride', 'benzenediazonium-chloride', 'methyl-orange', 'phenolphthalein', 'cumene', 'ethylbenzene', 'bisphenol-a'];
  for (const id of aromatics) assert.ok(D.COMPOUNDS[id], '芳香族誘導体が未登録: ' + id);
  assert.equal(D.COMPOUNDS.tnt.formula, 'C7H5N3O6');
  assert.equal(D.COMPOUNDS['picric-acid'].formula, 'C6H3N3O7');
  assert.equal(D.COMPOUNDS['1-naphthol'].formula, 'C10H8O');
});

/* ------------------------------------------------------------------
 * 未対応理由の分類
 * ------------------------------------------------------------------ */

test('[reason] 空の組合せは2分類だけを使い、未分類・汎用理由がない', () => {
  const empties = emptyCombos();
  const keys = new Set(empties.map((e) => e.skeleton + '|' + e.group));
  const tableKeys = new Set(Object.keys(D.UNSUPPORTED_REASONS));
  assert.deepEqual([...keys].sort(), [...tableKeys].sort(), '空の組合せと理由テーブルが一致しません');
  for (const e of empties) {
    const entry = D.unsupportedEntry(e.skeleton, e.group);
    assert.ok(entry, '理由がありません: ' + e.skeleton + '|' + e.group);
    assert.ok(['out-of-scope', 'chemically-invalid'].includes(entry.type), '不正な分類: ' + entry.type);
    assert.ok(entry.reason.length >= 20, '理由が短すぎます: ' + entry.reason);
    assert.ok(Array.isArray(entry.examples), '具体例がありません: ' + e.skeleton + '|' + e.group);
    assert.equal(/本版未収録|データ不足|未収録です/.test(entry.reason), false, '汎用の未収録理由が残っています: ' + entry.reason);
    assert.equal(/^この組み合わせは本版未収録/.test(entry.reason), false);
  }
  assert.ok(empties.length > 0);
  const types = new Set(Object.values(D.UNSUPPORTED_REASONS).map((e) => e.type));
  for (const type of types) assert.ok(['out-of-scope', 'chemically-invalid'].includes(type));
  assert.ok(types.has('out-of-scope'));
  assert.equal(D.unsupportedReason('alkane-c1', 'oh'), null);
  assert.equal(D.unsupportedEntry('alkane-c1', 'oh'), null);
});

test('[static] 検証失敗は範囲外にせず、データ不備として表示する', () => {
  const js = read('app10/app.js');
  assert.match(js, /function rawEntriesFor/);
  assert.match(js, /function invalidEntryErrors/);
  assert.match(js, /raw\.length/);
  assert.match(js, /oc-empty--error/);
  assert.match(js, /登録データの検証に失敗しました/);
  assert.match(js, /範囲外の組み合わせとして扱いません/);
  assert.match(js, /unsupportedEntry/);
  assert.match(js, /未対応理由のデータがありません/);
  const ledger = read('app10/ledger.js');
  assert.match(ledger, /D\.COVERAGE/);
  assert.match(ledger, /COVERAGE_STATS/);
  assert.match(ledger, /REQUIRED_CURRICULUM/);
  assert.match(ledger, /unsupportedEntry/);
  assert.match(ledger, /高校化学の範囲外/);
  assert.match(ledger, /化学的に成立しない/);
  assert.match(ledger, /データ不備/);
  assert.match(read('app10/ledger.html'), /ledger-coverage-checklist/);
});

/* ------------------------------------------------------------------
 * 追加収録の化学的な確認
 * ------------------------------------------------------------------ */

test('[data] C5アルコール8種とC6アルカン5種', () => {
  const c5 = combo('alkane-c5', 'oh');
  assert.equal(c5.length, 8);
  assert.deepEqual(new Set(c5).size, 8);
  for (const id of c5) assert.equal(D.COMPOUNDS[id].formula, 'C5H12O');
  assert.deepEqual(combo('alkane-c6', 'none'), [
    'hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane'
  ]);
  for (const id of combo('alkane-c6', 'none')) assert.equal(D.COMPOUNDS[id].formula, 'C6H14');
});

test('[data] アルケンの水素置換生成物を付加物と混同しない', () => {
  assert.deepEqual(combo('alkene-c2', 'oh'), ['ethenol']);
  assert.deepEqual(combo('alkene-c2', 'cl'), ['vinyl-chloride']);
  assert.deepEqual(combo('alkene-c2', 'cooh'), ['acrylic-acid']);
  assert.deepEqual(combo('alkene-c2', 'cho'), ['acrolein']);
  assert.equal(combo('alkene-c2', 'oh').includes('ethanol'), false);
  assert.equal(combo('alkene-c2', 'cl').includes('chloroethane'), false);
  assert.match(D.COMPOUNDS.ethenol.notes, /付加反応で得られるエタノールとは異なる/);
  assert.match(D.COMPOUNDS['vinyl-chloride'].name, /塩化ビニル/);
  assert.equal(combo('alkene-c3', 'oh').length, 3);
  assert.equal(combo('alkene-c3', 'cl').length, 3);
  assert.ok(combo('alkene-c3', 'oh').includes('allyl-alcohol'));
  assert.ok(combo('alkene-c3', 'cl').includes('3-chloropropene'));
});

test('[draw] 糖のフィッシャー投影式の立体配置', () => {
  const cases = [
    ['galactose', [/data-oh-c2="right"/, /data-oh-c3="left"/, /data-oh-c4="left"/, /data-oh-c5="right"/]],
    ['mannose', [/data-oh-c2="left"/, /data-oh-c3="left"/, /data-oh-c4="right"/, /data-oh-c5="right"/]],
    ['ribose', [/data-oh-c2="right"/, /data-oh-c3="right"/, /data-oh-c4="right"/]],
    ['deoxyribose', [/data-oh-c2="none"/, /data-oh-c3="right"/, /data-oh-c4="right"/]]
  ];
  for (const [id, patterns] of cases) {
    const svg = R.renderStructure(D.COMPOUNDS[id].structure, id);
    assert.match(svg, /data-kind="fischer"/, id);
    for (const re of patterns) assert.match(svg, re, id);
  }
  assert.match(R.renderStructure(D.COMPOUNDS.deoxyribose.structure, 'deoxyribose'), /data-carbons="5"/);
});

test('[draw] フルクトースのフラノース環（α/β）', () => {
  const c = D.COMPOUNDS.fructose;
  assert.equal(c.figures.length, 3);
  assert.equal(c.figures[0].structure.ketose, true);
  assert.equal(c.figures[1].structure.ring, 'furanose');
  assert.equal(c.figures[2].structure.ring, 'furanose');
  assert.equal(c.figures[1].structure.stereo.c1ch2oh, 'up');
  assert.equal(c.figures[2].structure.stereo.c1ch2oh, 'down');
  assert.equal(c.figures[1].structure.stereo.c2, 'down');
  assert.equal(c.figures[2].structure.stereo.c2, 'up');
  const alpha = R.renderStructure(c.figures[1].structure, 'alpha');
  const beta = R.renderStructure(c.figures[2].structure, 'beta');
  assert.match(alpha, /data-ring="furanose"/);
  assert.match(alpha, /data-anomer="alpha"/);
  assert.match(alpha, /data-c2oh="down"/);
  assert.match(alpha, /data-c3oh="up"/);
  assert.match(alpha, /data-c4oh="down"/);
  assert.match(beta, /data-anomer="beta"/);
  assert.match(beta, /data-c2oh="up"/);
});

test('[draw] トリグリセリドは脂肪酸鎖ごとの表示', () => {
  const pal = R.renderStructure(D.COMPOUNDS.tripalmitin.structure, 'tripalmitin');
  assert.equal((pal.match(/O—CO—C₁₅H₃₁/g) || []).length, 3);
  assert.equal(pal.includes('C₁₇H₃₅'), false);
  const ole = R.renderStructure(D.COMPOUNDS.triolein.structure, 'triolein');
  assert.equal((ole.match(/O—CO—C₁₇H₃₃/g) || []).length, 3);
  const lin = R.renderStructure(D.COMPOUNDS.trilinolein.structure, 'trilinolein');
  assert.equal((lin.match(/O—CO—C₁₇H₃₁/g) || []).length, 3);
});

test('[data] 可変組成を固定の分子式と偽らない', () => {
  const variable = ['protein', 'dna', 'rna', 'phenol-resin', 'urea-resin', 'melamine-resin', 'epoxy-resin', 'polyurethane', 'sbr', 'abs', 'cellulose-acetate', 'cellulose-nitrate', 'vinylon', 'nbr', 'iir', 'unsaturated-polyester', 'alkyd-resin', 'polyacetylene', 'polyaniline'];
  for (const id of variable) {
    const c = D.COMPOUNDS[id];
    assert.equal(c.formulaVariable, true, id + ' は可変組成のはず');
    assert.ok(c.formulaDisplay && c.formulaDisplay.length > 0, id + ' の表示式');
    const v = R.validate(c);
    assert.equal(v.ok, true, id + ': ' + v.errors.join(' / '));
    assert.equal(v.formulaStatus, 'variable', id);
  }
  assert.equal(D.COMPOUNDS.dna.structure.type, 'schematic');
  assert.equal(D.COMPOUNDS.rna.structure.type, 'schematic');
  assert.equal(D.COMPOUNDS['cellulose-acetate'].structure.composition, null);
  assert.equal(D.COMPOUNDS['cellulose-nitrate'].structure.composition, null);
  assert.equal(D.COMPOUNDS.abs.structure.type, 'polymer');
  assert.match(D.COMPOUNDS.abs.formulaDisplay, /共重合比/);
  assert.equal(R.validate(D.COMPOUNDS.dna).verification.short, '模式図（可変組成）');
  assert.equal(R.validate(D.COMPOUNDS.vinylon).verification.short, '模式図（可変組成）');
  assert.equal(R.validate(D.COMPOUNDS['cellulose-acetate']).verification.short, '模式図（可変組成）');
  assert.equal(R.validate(D.COMPOUNDS.sbr).verification.short, '可変組成（原子検証対象外）');
  assert.equal(R.validate(D.COMPOUNDS.nbr).verification.short, '可変組成（原子検証対象外）');
  assert.equal(R.validate(D.COMPOUNDS.polyacetylene).verification.short, '一般式');
  assert.equal(R.validate(D.COMPOUNDS.protein).verification.short, '一般式');
});

test('[data] S・ハロゲンの許容価数', () => {
  const ids = ['benzenesulfonic-acid', 'sds', 'las', 'cysteine', 'methionine', 'bromoethane', '1-bromopropane', 'iodoethane', 'vinyl-chloride', 'vinylidene-chloride'];
  for (const id of ids) {
    const v = R.validate(D.COMPOUNDS[id]);
    assert.equal(v.ok, true, id + ': ' + v.errors.join(' / '));
  }
  const badS = {
    id: 'bad-s', name: 'bad', formula: 'H2S', category: 'alkane',
    structure: { type: 'custom', atoms: [{ el: 'S', x: 100, y: 100, h: 2 }], bonds: [] },
    sources: ['textbook']
  };
  assert.equal(R.validate(badS).ok, true);
  const badS2 = {
    id: 'bad-s2', name: 'bad', formula: 'H3S', category: 'alkane',
    structure: { type: 'custom', atoms: [{ el: 'S', x: 100, y: 100, h: 3 }], bonds: [] },
    sources: ['textbook']
  };
  assert.equal(R.validate(badS2).ok, false);
  const sulfonic = {
    id: 'methanesulfonic-acid', name: 'メタンスルホン酸', formula: 'CH4O3S', category: 'carboxylic',
    structure: {
      type: 'custom',
      atoms: [
        { el: 'C', x: 80, y: 100, h: 3 },
        { el: 'S', x: 160, y: 100, h: 0 },
        { el: 'O', x: 230, y: 100, h: 1 },
        { el: 'O', x: 160, y: 40, h: 0 },
        { el: 'O', x: 160, y: 160, h: 0 }
      ],
      bonds: [
        { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 },
        { a: 1, b: 3, order: 2 }, { a: 1, b: 4, order: 2 }
      ]
    },
    sources: ['textbook']
  };
  assert.equal(R.validate(sulfonic).ok, true, R.validate(sulfonic).errors.join(' / '));
});

test('[data] PubChem CIDは確認済みの数値だけで、捏造しない', () => {
  const seen = new Map();
  for (const [id, c] of Object.entries(D.COMPOUNDS)) {
    if (c.pubchem == null) continue;
    assert.equal(typeof c.pubchem, 'number', id + ' のCIDが数値ではありません');
    assert.ok(Number.isInteger(c.pubchem) && c.pubchem > 0, id + ' のCIDが不正');
    assert.equal(seen.has(c.pubchem), false, id + ' と ' + seen.get(c.pubchem) + ' のCIDが重複');
    seen.set(c.pubchem, id);
  }
  assert.ok(seen.size >= 60, 'CID照合済みの化合物が少なすぎます');
});

test('[coverage] 独立requiredリストと延べ/ユニーク件数', () => {
  assert.ok(D.REQUIRED_CURRICULUM.length >= 250, 'requiredリストが少なすぎます');
  assert.equal(new Set(D.REQUIRED_CURRICULUM).size, D.REQUIRED_CURRICULUM.length, 'requiredリストに重複');
  const covered = coverageIds();
  const externalIds = new Set(E.ROWS.filter((r) => r.kind === 'compound' || r.kind === 'alias').map((r) => r.ref));
  for (const id of D.REQUIRED_CURRICULUM) {
    assert.ok(D.COMPOUNDS[id], 'requiredが未登録: ' + id);
    assert.ok(covered.has(id), 'requiredがカバレッジにない: ' + id);
  }
  for (const id of Object.keys(D.COMPOUNDS)) {
    assert.ok(D.REQUIRED_CURRICULUM.includes(id) || externalIds.has(id), '固定requiredリストにも外部照合台帳にもない化合物: ' + id);
  }
  const mustHave = ['vinylon', 'nbr', 'iir', 'unsaturated-polyester', 'alkyd-resin', 'polyacetylene', 'polyaniline', 'epichlorohydrin', 'p-phenylenediamine', 'dimethyldichlorosilane'];
  for (const id of mustHave) assert.ok(D.REQUIRED_CURRICULUM.includes(id), '必須物質がrequiredにない: ' + id);

  const total = D.COVERAGE.reduce((n, g) => n + g.items.length, 0);
  assert.equal(D.COVERAGE_STATS.totalItems, total);
  assert.equal(D.COVERAGE_STATS.uniqueItems, covered.size);
  assert.equal(D.COVERAGE_STATS.duplicateItems, total - D.COVERAGE_STATS.uniqueItems);
  assert.deepEqual(D.COVERAGE_STATS.missing, []);
  assert.equal(D.COVERAGE_STATS.uncovered.length, Object.keys(D.COMPOUNDS).length - covered.size);
  for (const id of D.COVERAGE_STATS.uncovered) assert.ok(externalIds.has(id), '外部照合台帳にない未カバレッジ化合物: ' + id);
  assert.ok(D.COVERAGE_STATS.duplicateItems > 0, '延べとユニークの区別がない');
});

test('[external] 外部資料の期待名称を独立リストで照合し、未対応0件', () => {
  const expected = {
    s1: ['セロビオース', 'β-グルコース'],
    s2: ['エタノール', '酢酸', '酢酸エチル', '1-ペンタノール', '酢酸ナトリウム', 'ヨードホルム'],
    s3: ['メタン', 'エタン', 'プロパン', 'ブタン', 'ペンタン', 'ヘキサン', 'ヘプタン', 'オクタン', 'ノナン', 'デカン', '酢酸Na', 'クロロメタン', 'ジクロロメタン', 'トリクロロメタン', 'テトラクロロメタン'],
    s4: ['メタン', 'エタン', 'プロパン', 'ブタン', 'ペンタン', 'ヘキサン', 'ヘプタン', 'オクタン', 'ノナン', 'デカン', 'エイコサン', 'クロロメタン', 'ジクロロメタン', 'トリクロロメタン', 'テトラクロロメタン'],
    s5: ['酢酸', '無水酢酸'],
    s6: ['塩化ベンゼンジアゾニウム', 'ナトリウムフェノキシド', 'p-ヒドロキシアゾベンゼン'],
    s7: ['DNA', 'RNA', 'リボース', 'デオキシリボース', 'アデニン', 'グアニン', 'シトシン', 'チミン', 'ウラシル'],
    s8: ['セルロース', 'セロビオース', 'グルコース', 'セルラーゼ', 'セロビアーゼ'],
    s9: ['ニンヒドリン', 'アミノ酸'],
    s10: ['セルロース', 'レーヨン', 'セロファン', 'クプラ', 'シュヴァイツァー試薬'],
    s11: ['ビスコースレーヨン', 'ビスコース', 'セルロース', '二硫化炭素'],
    s12: ['スチレン', 'p-ジビニルベンゼン', '陽イオン交換樹脂'],
    s13: ['陰イオン交換樹脂'],
    s14: ['インスリン', 'ヘモグロビン', 'ヘム', 'アルブミン', 'グロブリン', 'グルテリン', 'ケラチン', 'コラーゲン', 'フィブロイン', 'ムチン', 'カゼイン', 'ニンヒドリン'],
    s15: ['アルブミン', 'グロブリン', 'ケラチン', 'コラーゲン', 'フィブロイン', 'グルテリン', 'アミラーゼ', 'カゼイン', 'ヘモグロビン'],
    s16: ['アルブミン', 'グロブリン', 'ケラチン', 'コラーゲン', 'フィブロイン', 'グルテリン', 'アミラーゼ', 'カゼイン', 'ヘモグロビン', 'ゼラチン', 'ペプシン', 'ヒストン', 'プロタミン', 'グルテニン', 'オリゼニン', 'グリアジン', 'ホルデイン', 'グロビン', 'サルミン', 'ヘモシアニン'],
    s17: ['グルコース', 'ガラクトース', 'フルクトース', 'マルトース', 'セロビオース', 'ラクトース', 'スクロース', 'トレハロース', '無水マレイン酸', '無水フタル酸'],
    s18: ['ベンゼンスルホン酸ナトリウム', '無水酢酸', 'ナトリウムフェノキシド', 'p-ヒドロキシアゾベンゼン'],
    s19: ['メチルオレンジ', '2-ナフトール', 'レゾルシノール', 'グアイアコール', 'N,N-ジメチルアニリン', 'スルファニル酸', 'ポリアニリン', 'アニリンブラック', 'インジゴ', 'アリザリン', 'シコニン', 'カルミン酸', 'ジブロモインジゴ', 'カルタミン', '2-ニトロベンズアルデヒド', 'ケルセチン'],
    s20: ['アルギン酸', 'アルギン酸ナトリウム', 'アジピン酸ジクロリド', '6-アミノヘキサン酸'],
    s21: ['アスピリン', 'サリチル酸メチル', 'アセトアミノフェン', 'イブプロフェン', 'スルファニルアミド', 'p-ヒドロキシ安息香酸', 'm-ヒドロキシ安息香酸', '2,4,6-トリブロモフェノール']
  };
  const missing = [];
  for (const [sid, names] of Object.entries(expected)) {
    assert.ok(E.SOURCES[sid], '資料IDがありません: ' + sid);
    for (const name of names) {
      const key = D.normalizeName(name);
      const rows = E.ROWS.filter((r) => r.source === sid && D.normalizeName(r.name) === key);
      if (!rows.length) { missing.push(sid + ':' + name); continue; }
      for (const row of rows) {
        const res = E.resolveRow(row, D);
        if (!res.ok) missing.push(sid + ':' + name + ' (' + res.reason + ')');
      }
    }
  }
  assert.deepEqual(missing, [], '外部資料の期待名称が未対応: ' + missing.join(', '));
  assert.equal(E.ROWS.length, Object.values(expected).reduce((n, a) => n + a.length, 0));
  assert.deepEqual(E.audit(D).missing, []);
});

test('[external] 台帳は9列・URL・title・section・取得日・domainをもつ', () => {
  assert.equal(E.ROWS.length >= 150, true);
  for (const [sid, s] of Object.entries(E.SOURCES)) {
    assert.match(s.url, /^https:\/\//, sid + ' のURL');
    assert.ok(D.SOURCES[sid], sid + ' が data.js の SOURCES にない');
    assert.equal(D.SOURCES[sid].url, s.url, sid + ' のURLが data.js と不一致');
    assert.ok(s.title && s.title.length > 4, sid + ' のtitle');
    assert.ok(s.section && s.section.length > 2, sid + ' のsection');
    assert.equal(s.retrieved, E.RETRIEVED, sid + ' の取得日');
    const host = new URL(s.url).hostname;
    assert.equal(host, s.domain, sid + ' のdomain');
    assert.ok(['標準', '発展', '探究'].includes(s.level), sid + ' のラベル');
  }
  const keys = ['name', 'kind', 'ref', 'source', 'section', 'date', 'evidence', 'level', 'note'];
  for (const row of E.ROWS) {
    assert.deepEqual(Object.keys(row), keys, row.name + ' の列');
    assert.ok(E.KINDS.includes(row.kind), row.name + ' の種別');
    assert.ok(row.evidence && row.evidence.length >= 8, row.name + ' の根拠');
    assert.equal(row.date, E.RETRIEVED, row.name + ' の取得日');
    assert.ok(['標準', '発展', '探究'].includes(row.level), row.name + ' のラベル');
  }
  const seen = new Set();
  for (const row of E.ROWS) {
    const key = row.source + '|' + D.normalizeName(row.name);
    assert.equal(seen.has(key), false, '同一資料内で名称が重複: ' + key);
    seen.add(key);
  }
  const ledger = read('app10/ledger.html');
  assert.match(ledger, /id="ledger-external-rows"/);
  assert.match(ledger, /\.\/external-coverage\.js/);
  assert.match(ledger, /取得日/);
  const extSec = ledger.slice(ledger.indexOf('外部公開資料との照合'), ledger.indexOf('化合物一覧'));
  assert.equal((extSec.match(/<th /g) || []).length, 9, '外部照合表は9列');
  const js = read('app10/ledger.js');
  assert.match(js, /E\.audit\(D\)/);
  assert.match(js, /未対応/);
  const css = read('app10/app.css');
  assert.match(css, /\.oc-ext-table \{/);
  assert.match(css, /\.oc-ext-table td \{/);
  assert.equal(/\.oc-ext-table td[^{]*\{[^}]*white-space:\s*nowrap/.test(css), false);
});

test('[external] 材料・混合物・無機の扱いを水増ししない', () => {
  assert.equal(D.COMPOUNDS.rayon, undefined, 'レーヨンを化合物として重複収録しない');
  assert.equal(D.COMPOUNDS.cellophane, undefined, 'セロファンを化合物として重複収録しない');
  assert.equal(D.COMPOUNDS.cupra, undefined, 'キュプラを化合物として重複収録しない');
  assert.equal(D.materialByTerm('レーヨン').of, 'cellulose');
  assert.equal(D.materialByTerm('ビスコースレーヨン').of, 'cellulose');
  assert.equal(D.materialByTerm('セロファン').of, 'cellulose');
  assert.equal(D.materialByTerm('クプラ').of, 'cellulose');
  assert.equal(D.materialByTerm('ビスコース').kind, 'mixture');
  assert.equal(D.materialByTerm('アニリンブラック').of, 'polyaniline');
  assert.ok(D.searchTermsFor('cellulose').includes('レーヨン'));
  assert.ok(D.searchTermsFor('cellulose').includes('セロファン'));
  assert.ok(D.searchTermsFor('cellulose').includes('クプラ'));
  const inorganic = E.ROWS.filter((r) => r.kind === 'inorganic');
  assert.equal(inorganic.length, 2);
  for (const row of inorganic) {
    assert.equal(row.ref, null);
    assert.match(row.note, /無機/);
  }
});

test('[alias] 既存別名の正規化漏れと対応先の欠落がない', () => {
  const seen = new Map();
  for (const a of D.ALIASES) {
    assert.ok(D.COMPOUNDS[a.target], a.term + ' の対応先が未収録: ' + a.target);
    const key = D.normalizeName(a.term);
    assert.ok(key.length > 0, a.term + ' の正規化結果が空');
    if (seen.has(key)) assert.equal(seen.get(key), a.target, '別名の対応先が衝突: ' + a.term);
    seen.set(key, a.target);
  }
  assert.equal(D.aliasTarget('１−ペンタノール'), 'pentan-1-ol');
  assert.equal(D.aliasTarget(' 塩化メチレン '), 'dichloromethane');
  assert.equal(D.aliasTarget('ＣＨＬＯＲＯＦＯＲＭ'), null);
  assert.equal(D.aliasTarget('クロロホルム'), 'chloroform');
  assert.equal(D.aliasTarget('四塩化炭素'), 'carbon-tetrachloride');
  assert.equal(D.aliasTarget('p-フェニルアゾフェノール'), 'p-hydroxyazobenzene');
  assert.equal(D.aliasTarget('酢酸Na'), 'sodium-acetate');
  for (const id of Object.keys(D.COMPOUNDS)) {
    for (const term of D.searchTermsFor(id)) {
      assert.ok(term && D.normalizeName(term).length > 0, id + ' の検索語');
    }
  }
});

test('[data] 反応・前駆体は個別情報で、カテゴリ一律コピーをしない', () => {
  assert.equal(typeof D.CATEGORY_REACTION_DEFAULTS, 'undefined');
  assert.match(D.COMPOUNDS.phosgene.precursors, /一酸化炭素/);
  assert.match(D.COMPOUNDS.phosgene.precursors, /塩素/);
  assert.match(D.COMPOUNDS.phosgene.reactions, /ポリカーボネート/);
  assert.doesNotMatch(D.COMPOUNDS.isoprene.precursors, /重合から生成/);
  assert.match(D.COMPOUNDS.isoprene.precursors, /天然ゴム/);
  assert.match(D.COMPOUNDS.protein.precursors, /ペプチド結合/);
  assert.doesNotMatch(D.COMPOUNDS.protein.precursors, /タンパク質の加水分解から生成/);
  assert.match(D.COMPOUNDS.starch.precursors, /光合成/);
  assert.match(D.COMPOUNDS['cellulose-acetate'].precursors, /アセチル化/);
  assert.match(D.COMPOUNDS['cellulose-nitrate'].precursors, /ニトロ化/);
  assert.match(D.COMPOUNDS.polyethylene.reactions, /加水分解は受けない/);
  assert.match(D.COMPOUNDS.methanol.precursors, /合成ガス/);
  assert.match(D.COMPOUNDS.methanol.precursors, /発酵では得られない/);
  assert.match(D.COMPOUNDS.pva.precursors, /けん化/);
});

test('[data] 新規の合成ゴム・樹脂・導電性高分子・単量体', () => {
  const variable = ['vinylon', 'nbr', 'iir', 'unsaturated-polyester', 'alkyd-resin', 'polyacetylene', 'polyaniline'];
  for (const id of variable) {
    assert.ok(D.COMPOUNDS[id], '未登録: ' + id);
    assert.equal(D.COMPOUNDS[id].formulaVariable, true, id + ' は可変組成');
    assert.ok(D.COMPOUNDS[id].formulaDisplay, id + ' の表示式');
    assert.equal(R.validate(D.COMPOUNDS[id]).ok, true, id);
  }
  assert.equal(D.COMPOUNDS.epichlorohydrin.formula, 'C3H5ClO');
  assert.equal(D.COMPOUNDS['p-phenylenediamine'].formula, 'C6H8N2');
  assert.equal(D.COMPOUNDS.dimethyldichlorosilane.formula, 'C2H6Cl2Si');
  assert.match(D.COMPOUNDS.polyacetylene.structure.unit, /CH=CH/);
  assert.match(D.COMPOUNDS.polyaniline.structure.unit, /C₆H₄/);
  assert.match(D.COMPOUNDS.vinylon.structure.kind, /vinylon/);
});

test('[data] 簡略式・環置換の組成は分子式から独立に計算される（改ざん検出）', () => {
  const bad1 = Object.assign({}, D.COMPOUNDS['lactic-acid'], { formula: 'C3H8O3' });
  assert.equal(R.validate(bad1).ok, false, '簡略式の分子式改ざんを検出できません');
  const bad2 = Object.assign({}, D.COMPOUNDS.toluene, { formula: 'C7H9' });
  assert.equal(R.validate(bad2).ok, false, '環置換の分子式改ざんを検出できません');
  const bad3 = Object.assign({}, D.COMPOUNDS['stearic-acid'], { formula: 'C18H34O2' });
  assert.equal(R.validate(bad3).ok, false, '高級脂肪酸の分子式改ざんを検出できません');
  const bad4 = Object.assign({}, D.COMPOUNDS.tnt, { formula: 'C7H6N3O6' });
  assert.equal(R.validate(bad4).ok, false, 'TNTの分子式改ざんを検出できません');
  const bad5 = Object.assign({}, D.COMPOUNDS.phenolphthalein, { formula: 'C20H16O4' });
  assert.equal(R.validate(bad5).ok, false, 'フェノールフタレインの分子式改ざんを検出できません');
});

test('[draw] フェノールフタレインのラクトン環が閉じている', () => {
  const c = D.COMPOUNDS.phenolphthalein;
  assert.equal(c.structure.type, 'custom');
  const g = R.buildStructure(c.structure);
  assert.equal(g.atoms.filter((a) => a.el === 'C').length, 20);
  assert.equal(g.atoms.filter((a) => a.el === 'O').length, 4);
  assert.equal(g.atoms.reduce((n, a) => n + a.h, 0), 14);
  const central = 18;
  const centralBonds = g.bonds.filter((b) => b.a === central || b.b === central);
  assert.equal(centralBonds.length, 4, '中央sp3炭素の結合数');
  assert.ok(centralBonds.every((b) => b.order === 1), '中央炭素は単結合のみ');
  const hasBond = (a, b) => g.bonds.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  for (const pair of [[18, 20], [20, 19], [19, 13], [13, 12], [12, 18]]) {
    assert.ok(hasBond(pair[0], pair[1]), 'ラクトン環の結合がない: ' + pair.join('-'));
  }
  assert.equal(R.validate(c).computed, 'C20H14O4');
});

test('[draw] ナフトールはナフタレン環の1位/2位にOHをもつ', () => {
  for (const [id, pos] of [['1-naphthol', 1], ['2-naphthol', 2]]) {
    const c = D.COMPOUNDS[id];
    assert.equal(c.structure.type, 'custom');
    const g = R.buildStructure(c.structure);
    assert.equal(g.atoms.filter((a) => a.el === 'C').length, 10);
    assert.equal(g.atoms.filter((a) => a.el === 'O').length, 1);
    const oIndex = g.atoms.findIndex((a) => a.el === 'O');
    const bond = g.bonds.find((b) => (b.a === oIndex || b.b === oIndex));
    const ringAtom = bond.a === oIndex ? bond.b : bond.a;
    assert.equal(ringAtom, pos, id + ' のOH位置');
    assert.equal(R.validate(c).computed, 'C10H8O');
  }
});

test('[data] アルケン水素置換の説明が付加物と混同しない', () => {
  assert.match(D.COMPOUNDS['prop-1-en-1-ol'].notes, /末端ビニル炭素/);
  assert.doesNotMatch(D.COMPOUNDS['prop-1-en-1-ol'].notes, /末端メチル水素/);
  assert.match(D.COMPOUNDS['1-chloropropene'].notes, /末端ビニル炭素/);
  assert.match(D.COMPOUNDS.ethenol.notes, /酢酸ビニル/);
  assert.doesNotMatch(D.COMPOUNDS.ethenol.notes, /重合でポリビニルアルコールの前駆体/);
});

test('[draw] 二糖・多糖は糖環とグリコシド酸素を模式図で示す', () => {
  for (const id of ['sucrose', 'maltose', 'lactose']) {
    const svg = R.renderStructure(D.COMPOUNDS[id].structure, id);
    assert.match(svg, /data-ring-count="2"/, id);
    assert.ok((svg.match(/oc-schematic-ring/g) || []).length >= (id === 'sucrose' ? 11 : 12), id + ' の糖環');
    assert.match(svg, /data-glycosidic="(α|β)-1,[24]"/, id + ' の結合様式');
    assert.match(svg, /x="210\.0" y="101\.0"[^>]*>O<\/text>/, id + ' のグリコシド酸素');
  }
  const sucrose = R.renderStructure(D.COMPOUNDS.sucrose.structure, 'sucrose');
  assert.equal((sucrose.match(/oc-schematic-ring/g) || []).length, 11, 'スクロースはピラノース＋フラノース');
  assert.match(sucrose, /data-fructose-ring="furanose"/);
  assert.match(sucrose, /data-anomer-glucose="alpha"/);
  assert.match(sucrose, /data-anomer-fructose="beta"/);
  assert.match(sucrose, /x1="220\.0" y1="101\.0" x2="255\.0" y2="101\.0"/, 'フルクトースC2へのグリコシド結合');
  assert.match(sucrose, />β-D-フルクトフラノース</);
  for (const id of ['starch', 'amylopectin', 'dextrin', 'cellulose', 'glycogen', 'chitin']) {
    const svg = R.renderStructure(D.COMPOUNDS[id].structure, id);
    assert.match(svg, /data-ring-count="3"/, id);
    assert.ok((svg.match(/oc-schematic-ring/g) || []).length >= 18, id + ' の糖環');
  }
});

test('[draw] フルクトフラノースのC1CH2OHはα上・β下', () => {
  const alpha = R.renderStructure(D.COMPOUNDS.fructose.figures[1].structure, 'alpha');
  const beta = R.renderStructure(D.COMPOUNDS.fructose.figures[2].structure, 'beta');
  assert.match(alpha, /data-c1ch2oh="up"/);
  assert.match(alpha, /data-c2oh="down"/);
  assert.match(beta, /data-c1ch2oh="down"/);
  assert.match(beta, /data-c2oh="up"/);
  assert.match(beta, /y="174\.0"[^>]*>CH₂OH<\/text>/);
  assert.doesNotMatch(alpha, /data-c2oh="up"/);
});

test('[draw] アラニンのOH酸素がα炭素-メチル結合に重ならない', () => {
  const g = R.buildStructure(D.COMPOUNDS.alanine.structure);
  const c0 = g.atoms[0];
  const c1 = g.atoms[1];
  assert.ok(g.bonds.some((b) => (b.a === 0 && b.b === 1) || (b.a === 1 && b.b === 0)), 'αC-CH3結合');
  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx, y = a.y + t * dy;
    return Math.hypot(p.x - x, p.y - y);
  }
  for (const o of g.atoms.filter((a) => a.el === 'O')) {
    assert.ok(distToSegment(o, c0, c1) > 20, 'OH酸素がC-C結合に近すぎる: ' + distToSegment(o, c0, c1).toFixed(1));
  }
});

test('[draw] ビニロンのPVA主鎖がアセタール環の両側で連続する', () => {
  const svg = R.renderStructure(D.COMPOUNDS.vinylon.structure, 'vinylon');
  assert.match(svg, /x1="250\.0" y1="130\.0" x2="300\.0" y2="155\.0"/, 'アセタール環C3からCH2へ');
  assert.match(svg, /x1="300\.0" y1="155\.0" x2="360\.0" y2="130\.0"/, 'CH2から残存CH(OH)へ');
  assert.match(svg, /x1="360\.0" y1="130\.0" x2="410\.0" y2="130\.0"/, '右側の主鎖継続');
  assert.match(svg, /x1="50\.0" y1="130\.0" x2="130\.0" y2="130\.0"/, '左側の主鎖継続');
  assert.ok((svg.match(/>CH₂<\/text>/g) || []).length >= 2, 'CH2が2つ以上');
  assert.ok((svg.match(/>CH<\/text>/g) || []).length >= 3, 'CHが3つ以上');
  assert.match(svg, /x1="360\.0" y1="130\.0" x2="382\.0" y2="105\.0"/, '残存OH結合');
  const oh = svg.match(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>OH<\/text>/);
  assert.ok(oh, '残存OH表記');
  const ohX = Number(oh[1]);
  const ohY = Number(oh[2]);
  // 右閉括弧の下端横線 (420,170)-(432,170) とOH表記の推定bboxが交差しない
  const ohBox = { x: ohX - 13, y: ohY - 13, w: 26, h: 26 };
  const intersects = ohBox.x < 432 && ohBox.x + ohBox.w > 420 && ohBox.y < 170 && ohBox.y + ohBox.h > 170;
  assert.equal(intersects, false, 'OH表記が右閉括弧下端と接触');
  assert.ok(ohBox.y + ohBox.h < 170, 'OH表記は括弧下端より上');
});

test('[data] ポリウレタンの繰り返し単位と製法', () => {
  const c = D.COMPOUNDS.polyurethane;
  assert.match(c.structure.unit, /^—O—R′—O—CO—NH—R—NH—CO—$/);
  assert.doesNotMatch(c.structure.unit, /—O—NH—/);
  assert.match(c.nature, /重付加/);
  assert.doesNotMatch(c.nature, /付加縮合/);
  assert.match(c.precursors, /重付加/);
});

test('[draw] ビニロンはアセタール環と残存OHの模式図', () => {
  const svg = R.renderStructure(D.COMPOUNDS.vinylon.structure, 'vinylon');
  assert.match(svg, /data-sugar="vinylon"/);
  assert.match(svg, /アセタール環/);
  assert.match(svg, /OH/);
  assert.match(svg, />O<\/text>/);
});

test('[data] 外部照合で追加した糖・タンパク質・染料の構造データ', () => {
  assert.equal(D.COMPOUNDS.cellobiose.structure.type, 'schematic');
  assert.match(R.renderStructure(D.COMPOUNDS.cellobiose.structure, 'cellobiose'), /data-glycosidic="β-1,4"/);
  assert.match(R.renderStructure(D.COMPOUNDS.cellobiose.structure, 'cellobiose'), /還元性あり/);
  assert.equal(D.COMPOUNDS.trehalose.structure.kind, 'trehalose');
  assert.match(R.renderStructure(D.COMPOUNDS.trehalose.structure, 'trehalose'), /data-glycosidic="α,α-1,1"/);
  assert.match(R.renderStructure(D.COMPOUNDS.trehalose.structure, 'trehalose'), /非還元性/);
  assert.equal(D.COMPOUNDS.cellobiose.formula, 'C12H22O11');
  assert.equal(D.COMPOUNDS.trehalose.formula, 'C12H22O11');

  assert.equal(D.COMPOUNDS.albumin.formulaVariable, true);
  assert.match(D.COMPOUNDS.albumin.formulaDisplay, /組成/);
  assert.match(R.renderStructure(D.COMPOUNDS.albumin.structure, 'albumin'), /data-protein="1"/);
  assert.match(R.renderStructure(D.COMPOUNDS.albumin.structure, 'albumin'), /組成不定/);
  const proteins = Object.values(D.COMPOUNDS).filter((c) => c.structure && c.structure.type === 'schematic' && /^protein-/.test(c.structure.kind));
  assert.ok(proteins.length >= 20, 'タンパク質・酵素の収録数: ' + proteins.length);
  for (const c of proteins) {
    assert.equal(c.formulaVariable, true, c.id + ' は可変組成');
    assert.ok(c.formulaDisplay, c.id + ' の表示式');
  }

  assert.equal(D.COMPOUNDS.heme.structure.type, 'custom');
  assert.equal(D.COMPOUNDS.heme.formula, 'C34H32FeN4O4');
  assert.equal(D.COMPOUNDS.heme.pubchem, 4973);
  assert.ok(D.COMPOUNDS.heme.structure.atoms.some((a) => a.skipValence), '金属配位の原子価除外');
  assert.equal(R.validate(D.COMPOUNDS.heme).ok, true);

  for (const id of ['indigo', 'alizarin', 'shikonin', 'carminic-acid', 'dibromoindigo', 'carthamin', 'quercetin']) {
    assert.equal(D.COMPOUNDS[id].structure.type, 'custom', id + ' は構造グラフ');
    assert.equal(R.validate(D.COMPOUNDS[id]).ok, true, id + ' の検証');
  }
  assert.equal(D.COMPOUNDS['malonic-acid'].formula, 'C3H4O4');
  assert.equal(D.COMPOUNDS['maleic-anhydride'].formula, 'C4H2O3');
  assert.equal(D.COMPOUNDS['phthalic-anhydride'].formula, 'C8H4O3');
});

test('[static] 外部照合の出典がクレジットに記載される', () => {
  const credits = read('credits.html');
  assert.match(credits, /external-coverage\.js/);
  assert.match(credits, /実教出版/);
  assert.match(credits, /啓林館/);
  assert.match(credits, /Try IT/);
  assert.match(credits, /日本化学会/);
  assert.match(credits, /jstage\.jst\.go\.jp/);
  assert.match(credits, /標準的に暗記する範囲であることを意味しません/);
});

test('[static] 台帳の全セルはnowrapせず、4列目・7列目の幅を確保する', () => {
  const css = read('app10/app.css');
  assert.equal(/\.oc-table td[^{]*\{[^}]*white-space:\s*nowrap/.test(css), false);
  assert.match(css, /\.oc-table th:nth-child\(4\) \{ width: 128px; \}/);
  assert.match(css, /\.oc-table th:nth-child\(7\) \{ width: 104px; \}/);
  assert.match(css, /\.oc-table \{ width: 100%; border-collapse: collapse; min-width: 1170px;/);
  assert.match(css, /\.oc-table td \{ overflow-wrap: anywhere; \}/);
});
