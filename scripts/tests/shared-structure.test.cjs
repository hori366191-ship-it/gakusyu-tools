/**
 * 共有構造描画モジュール（site/shared/organic-structure.js）の回帰テスト
 *
 * 実行: node --test scripts/tests/shared-structure.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。共有モジュール単体の独立性、両アプリの
 * 薄いアダプタが同じcanonical実装を使うこと、マレイン酸（シス）/フマル酸（トランス）の
 * 明示結合グラフの幾何、既存SVGがこの2物質以外で変わらないことを静的に確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SHARED = path.join(ROOT, 'site', 'shared', 'organic-structure.js');
const APP10 = path.join(ROOT, 'site', 'app10');
const APP11 = path.join(ROOT, 'site', 'app11');
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));

const shared = require(SHARED);
const R10 = require(path.join(APP10, 'draw.js'));
const R11 = require(path.join(APP11, 'structure-draw.js'));
const D10 = require(path.join(APP10, 'data.js'));
const D11 = require(path.join(APP11, 'data.js'));

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeClasses(svg) {
  return String(svg).split('rp-struct-').join('oc-').split('rp-eq-').join('oc-eq-');
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function compound(table, id) {
  return table.COMPOUNDS[id];
}

test('[module] 共有canonicalはDOM・ネットワーク・アプリdataに依存しない', () => {
  const code = read(SHARED);
  assert.equal(/\bdocument\.|\bwindow\.|XMLHttpRequest|\bfetch\s*\(/.test(code), false, 'ブラウザAPIを使わない');
  assert.equal(/\brequire\s*\(/.test(code), false, '他モジュールをrequireしない');
  assert.equal(/\bdefine\s*\(/.test(code), false, 'AMDローダーに依存しない');
  assert.ok(code.includes('root.GakusyuOrganicStructure = factory();'), 'UMD共有名');
  assert.equal(typeof shared.createRenderer, 'function');
  const canonical = shared.createRenderer();
  ['renderStructure', 'renderEquation', 'renderCompound', 'figurePlan', 'structureView',
    'skeletalSpecFromCompound', 'hasSpecifiedStereo', 'svgGeometry', '_internal']
    .forEach((key) => assert.equal(typeof canonical[key] !== 'undefined', true, key + ' を公開する'));
});

test('[adapter] 両アプリの薄いアダプタは同じcanonicalのAPIを再エクスポートする', () => {
  const shim10 = read(path.join(APP10, 'draw.js'));
  const shim11 = read(path.join(APP11, 'structure-draw.js'));
  [shim10, shim11].forEach((code, index) => {
    const name = index === 0 ? 'app10/draw.js' : 'app11/structure-draw.js';
    assert.ok(code.includes("require('../shared/organic-structure.js')"), name + ' は共有モジュールをrequireする');
    assert.equal(code.includes('function renderStructure'), false, name + ' に描画ロジックを複製しない');
    assert.equal(code.includes('function figurePlan'), false, name + ' に表示計画を複製しない');
    assert.equal(code.includes('function renderEquation'), false, name + ' に反応式ロジックを複製しない');
    assert.ok(code.length < 2500, name + ' は薄いアダプタに保つ: ' + code.length);
  });
  assert.ok(shim10.includes('root.OCDraw = factory(root.GakusyuOrganicStructure)'));
  assert.ok(shim11.includes('root.RPStructure = factory(root.GakusyuOrganicStructure)'));
  assert.ok(shim11.includes("structurePrefix: 'rp-struct-'"), 'app11の接頭辞');
  assert.ok(shim11.includes("equationPrefix: 'rp-eq-'"), 'app11の式接頭辞');
  // 共有canonicalのAPI名を両方とも持つ（和集合）。
  const keys10 = Object.keys(R10).sort();
  const keys11 = Object.keys(R11).sort();
  assert.deepEqual(keys10, keys11, 'app10/app11の公開APIが同一');
  ['renderEquation', 'structureView', 'skeletalSpecFromCompound', 'hasSpecifiedStereo'].forEach((key) => {
    assert.equal(typeof R10[key], 'function', 'app10 に ' + key);
    assert.equal(typeof R11[key], 'function', 'app11 に ' + key);
  });
  // すべてのSVG出力が接頭辞だけの違いであること。
  const sample = D11.compounds.find((c) => c.id === 'ethanol');
  assert.equal(normalizeClasses(R11.renderStructure(sample.structure, sample.name)),
    R10.renderStructure(sample.structure, sample.name), '接頭辞正規化後に同一SVG');
});

test('[stereo] マレイン酸（シス）/フマル酸（トランス）は明示結合グラフで両アプリ同一',
  () => {
    ['maleic-acid', 'fumaric-acid'].forEach((id) => {
      const c10 = compound(D10, id);
      const c11 = D11.compounds.find((c) => c.id === id);
      assert.equal(c10.structure.type, 'custom', id + ' は明示結合グラフ');
      assert.equal(c10.structure.mode, 'expanded', id + ' は水素を明示');
      assert.equal(c10.structure.skeletal, false, id);
      assert.equal(c10.structure.atoms.length, 12, id + ' は12原子');
      assert.equal(c10.structure.bonds.length, 11, id + ' は11結合');
      const geometry = id === 'maleic-acid' ? 'cis' : 'trans';
      assert.equal(c10.structure.stereo.doubleBond, 'C=C', id);
      assert.equal(c10.structure.stereo.geometry, geometry, id);
      assert.equal(c10.structure.geometry, geometry, id);
      assert.equal(c10.structure.ez, id === 'maleic-acid' ? 'Z' : 'E', id);
      assert.equal(R10.hasSpecifiedStereo(c10), true, id + ' の立体指定');
      assert.equal(JSON.stringify(c11.structure), JSON.stringify(c10.structure), id + ' は両アプリ同一spec');
      const view10 = R10.structureView(c10);
      const view11 = R11.structureView(c11);
      assert.equal(view10.kind, 'structure', id + ' はfallbackにしない');
      assert.equal(view11.kind, 'structure', id);
      assert.equal(view10.caption, '構造式', id);
      assert.equal(view11.figures[0].structure.type, 'custom', id);

      const g = R10.buildStructure(c10.structure);
      assert.equal(R10.formulaOfGraph(g), 'C4H4O4', id + ' の分子式');
      assert.equal(R10._internal.checkValence(g).ok, true, id + ' の原子価');
      const explicitH = g.atoms.filter((a) => a.el === 'H').length;
      assert.equal(explicitH, 4, id + ' はHを4個明示');
      const bondsOf = (elA, order, elB) => g.bonds.filter((b) => b.order === order &&
        g.atoms[b.a].el === elA && g.atoms[b.b].el === elB).length;
      assert.equal(bondsOf('C', 2, 'O'), 2, id + ' に C=O が2本');
      assert.equal(g.bonds.filter((b) => b.order === 1 &&
        ((g.atoms[b.a].el === 'O' && g.atoms[b.b].el === 'H') ||
          (g.atoms[b.a].el === 'H' && g.atoms[b.b].el === 'O'))).length, 2, id + ' に O-H が2本');
      assert.equal(bondsOf('C', 2, 'C'), 1, id + ' に C=C が1本');
      const doubleC = g.bonds.find((b) => b.order === 2 && g.atoms[b.a].el === 'C' && g.atoms[b.b].el === 'C');
      assert.ok(doubleC, id + ' のC=C');
      assert.equal(g.atoms.filter((a, i) => a.el === 'H' && g.bonds.some((b) =>
        (b.a === i && (b.b === doubleC.a || b.b === doubleC.b)) ||
        (b.b === i && (b.a === doubleC.a || b.a === doubleC.b)))).length, 2,
      id + ' のC=C両炭素にH各1');

      // COOH 側の外積: シスは同符号、トランスは異符号。
      const left = g.bonds.find((b) => b.a === doubleC.a && b.b !== doubleC.b ||
        b.b === doubleC.a && b.a !== doubleC.b);
      const right = g.bonds.find((b) => b.a === doubleC.b && b.b !== doubleC.a ||
        b.b === doubleC.b && b.a !== doubleC.a);
      const leftIdx = left.a === doubleC.a ? left.b : left.a;
      const rightIdx = right.a === doubleC.b ? right.b : right.a;
      const lc = cross(g.atoms[doubleC.a], g.atoms[doubleC.b], g.atoms[leftIdx]);
      const rc = cross(g.atoms[doubleC.a], g.atoms[doubleC.b], g.atoms[rightIdx]);
      // シス（マレイン酸）は COOH を下・H を上にする上下鏡映のため、外積の符号がトランスと逆になる。
      assert.equal(lc, geometry === 'cis' ? 5600 : -5600, id + ' の左COOH外積');
      assert.equal(rc, 5600, id + ' の右COOH外積');
      assert.equal(lc * rc > 0, geometry === 'cis', id + ' のシス/トランス判定');

      // 非接続辺の交差・非接続原子との近接・ラベル衝突がない。
      const edges = g.bonds.map((b, i) => ({ i, a: g.atoms[b.a], b: g.atoms[b.b], ba: b.a, bb: b.b }));
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const A = edges[i];
          const B = edges[j];
          if (A.ba === B.ba || A.ba === B.bb || A.bb === B.ba || A.bb === B.bb) continue;
          assert.equal(G.segSegIntersection(A.a, A.b, B.a, B.b), null, id + ' の枝交差');
        }
      }
      edges.forEach((e) => {
        g.atoms.forEach((a, i) => {
          if (i === e.ba || i === e.bb) return;
          assert.ok(G.distPointSeg(a, e.a, e.b) >= 8, id + ' の非接続原子-辺');
        });
      });
      const labels = g.atoms.map((a, i) => {
        const text = a.label || a.el;
        const w = G.textWidth(text, 23);
        return { i, text, box: { x: a.x - w / 2 - 2, y: a.y - 13, w: w + 4, h: 26 } };
      });
      labels.forEach((label) => {
        edges.forEach((e) => {
          if (e.ba === label.i || e.bb === label.i) return;
          assert.equal(G.segmentRect(e.a, e.b, label.box), false, id + ' のラベルと非接続辺');
        });
      });
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          assert.equal(G.rectsOverlap(labels[i].box, labels[j].box), false,
            id + ' のラベル衝突: ' + labels[i].text + '/' + labels[j].text);
        }
      }

      // viewBox が原子座標を含み、両アプリの接頭辞だけが異なる。
      const svg10 = R10.renderStructure(c10.structure, c10.name);
      const svg11 = R11.renderStructure(c11.structure, c11.name);
      assert.equal(normalizeClasses(svg11), svg10, id + ' は両アプリで同一geometry');
      assert.ok(svg10.includes('oc-atom'), id + ' のapp10クラス');
      assert.ok(svg11.includes('rp-struct-atom'), id + ' のapp11クラス');
      const geo = R10.svgGeometry(svg10);
      assert.ok(geo, id + ' のsvgGeometry');
      const vb = (svg10.match(/viewBox="([^"]+)"/) || [])[1].trim().split(/\s+/).map(Number);
      g.atoms.forEach((a) => {
        assert.ok(a.x >= vb[0] && a.x <= vb[0] + vb[2], id + ' のx範囲');
        assert.ok(a.y >= vb[1] && a.y <= vb[1] + vb[3], id + ' のy範囲');
      });
    });

    // 反応式の中でも同じcanonicalから描き、両接頭辞で同値。
    const maleic = compound(D10, 'maleic-acid');
    const fumaric = compound(D10, 'fumaric-acid');
    const eq = {
      left: [{ coef: 1, structure: maleic.structure }],
      right: [{ coef: 1, structure: fumaric.structure }],
      arrow: 'to'
    };
    const eq10 = R10.renderEquation(eq, '異性化');
    const eq11 = R11.renderEquation(eq, '異性化');
    assert.equal(normalizeClasses(eq11), eq10, '反応式も両アプリで同一geometry');
    assert.ok(eq10.includes('oc-eq-species'), 'app10の式クラス');
    assert.ok(eq11.includes('rp-eq-species'), 'app11の式クラス');
  });

test('[stereo] マレイン酸は上下鏡映（COOHが下・C=CのHが上）で、フマル酸の座標は不変', () => {
  const maleic = compound(D10, 'maleic-acid');
  const fumaric = compound(D10, 'fumaric-acid');
  const g = R10.buildStructure(maleic.structure);
  const doubleC = g.bonds.find((b) => b.order === 2 && g.atoms[b.a].el === 'C' && g.atoms[b.b].el === 'C');
  const cY = (g.atoms[doubleC.a].y + g.atoms[doubleC.b].y) / 2;
  const neighboursOf = (idx) => g.bonds
    .filter((b) => b.a === idx || b.b === idx)
    .map((b) => (b.a === idx ? b.b : b.a));
  const coohCarbons = [];
  const doubleHs = [];
  [doubleC.a, doubleC.b].forEach((idx) => {
    neighboursOf(idx).forEach((n) => {
      if (n === doubleC.a || n === doubleC.b) return;
      if (g.atoms[n].el === 'C') coohCarbons.push(g.atoms[n]);
      if (g.atoms[n].el === 'H') doubleHs.push(g.atoms[n]);
    });
  });
  assert.equal(coohCarbons.length, 2, 'C=C の両炭素に COOH 炭素');
  assert.equal(doubleHs.length, 2, 'C=C の両炭素に H');
  // 元素記号は正立のまま（SVG の scaleY(-1) は使わずデータ座標で鏡映）、COOH が下・H が上。
  coohCarbons.forEach((a) => assert.ok(a.y > cY, 'COOH 炭素が C=C より下'));
  doubleHs.forEach((a) => assert.ok(a.y < cY, 'C=C の H が C=C より上'));
  assert.equal(R10.formulaOfGraph(g), 'C4H4O4', 'マレイン酸の分子式');
  assert.equal(g.atoms.length, 12, 'マレイン酸は12原子');
  // 既存 bbox は維持（上下反転しても高さ・幅は変えない）。
  const ys = g.atoms.map((a) => a.y);
  assert.equal(Math.min(...ys), 40, 'マレイン酸の y 上限は据え置き');
  assert.equal(Math.max(...ys), 230, 'マレイン酸の y 下限は据え置き');
  // フマル酸（トランス）は座標を一切変えない。
  const f = R10.buildStructure(fumaric.structure);
  assert.deepEqual(f.atoms.map((a) => [a.el, a.x, a.y]), [
    ['C', 140, 90], ['O', 100, 40], ['O', 80, 120], ['H', 50, 150],
    ['C', 200, 160], ['H', 200, 230], ['C', 280, 160], ['H', 280, 90],
    ['C', 340, 230], ['O', 380, 280], ['O', 400, 200], ['H', 430, 170]
  ], 'フマル酸の座標は不変');
  // 描画以外の立体情報はシスのまま。
  assert.equal(maleic.structure.geometry, 'cis');
  assert.equal(maleic.structure.ez, 'Z');
  assert.equal(maleic.structure.stereo.geometry, 'cis');
});

test('[baseline] 既存の構造SVGはマレイン酸/フマル酸以外で変化しない', () => {
  const app10Baseline = JSON.parse(read(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app10-draw-baseline.json')));
  const changed10 = [];
  Object.keys(D10.COMPOUNDS).forEach((id) => {
    if (sha(R10.renderCompound(D10.COMPOUNDS[id])) !== app10Baseline[id]) changed10.push(id);
  });
  assert.deepEqual(changed10.sort(), ['fumaric-acid', 'maleic-acid'],
    'app10で変わるのは今回の2物質だけ');

  const app11Baseline = JSON.parse(read(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app11-structure-baseline.json')));
  const changed11 = [];
  D11.compounds.forEach((c) => {
    const view = R11.structureView(c);
    const current = {
      kind: view.kind,
      svgs: (view.figures || []).map((f) => sha(R11.renderStructure(f.structure, c.name)))
    };
    if (JSON.stringify(current) !== JSON.stringify(app11Baseline[c.id])) changed11.push(c.id);
  });
  assert.deepEqual(changed11.sort(), ['fumaric-acid', 'maleic-acid'],
    'app11で変わるのは今回の2物質だけ（他はSVG完全同値）');

  const eqBaseline = JSON.parse(read(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app11-equation-baseline.json')));
  const changedEq = [];
  D11.reactions.forEach((r) => {
    if (!r.equation) return;
    const key = 'normal:' + r.id;
    if (sha(R11.renderEquation(r.equation, r.label || '反応式')) !== eqBaseline[key]) changedEq.push(key);
  });
  (D11.classMap.edges || []).forEach((e) => {
    const key = 'class:' + e.id;
    if (sha(R11.renderEquation(e.equation, e.label || '一般反応式')) !== eqBaseline[key]) changedEq.push(key);
  });
  assert.deepEqual(changedEq, [], '反応式・一般図のSVGは不変');
});

test('[static] 共有モジュールは全HTMLでアダプタより先に読み込まれる', () => {
  const files = [
    path.join(APP10, 'index.html'),
    path.join(APP10, 'ledger.html'),
    path.join(APP11, 'index.html'),
    path.join(ROOT, 'design-lab', 'app10-next', 'index.html'),
    path.join(ROOT, 'design-lab', 'app10-next', 'ledger.html')
  ];
  files.forEach((file) => {
    const html = read(file);
    const sharedAt = html.indexOf('organic-structure.js');
    assert.ok(sharedAt !== -1, file + ' は共有モジュールを読み込む');
    const shimAt = Math.max(html.indexOf('./draw.js'), html.indexOf('./structure-draw.js'));
    assert.ok(shimAt !== -1 && sharedAt < shimAt, file + ' は共有モジュールを先に読み込む');
  });
});
