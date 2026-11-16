/**
 * app11 アカデミックの重合化学量論（外側係数）専用テスト
 *
 * 通常データのハッシュ・件数には触れない。係数と出典の独立検査だけを行う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const A = require(path.join(APP, 'academic-data.js'));
const D = require(path.join(APP, 'data.js'));
const B = require(path.join(ROOT, 'scripts', 'app11', 'build-academic-data.cjs'));

// 構造が高分子（repeat を unit に持つ）または高分子として扱う ID。
const POLYMERIC = new Set([
  'pan', 'pmma', 'ptfe', 'pvac', 'pvdc', 'br', 'natural-rubber', 'chloroprene-rubber',
  'sbr', 'nbr', 'abs', 'iir', 'pva', 'pla', 'nylon6', 'aramid', 'polycarbonate',
  'phenol-resin', 'urea-resin', 'melamine-resin', 'epoxy-resin',
  'cellulose', 'glycogen', 'cellulose-acetate', 'cellulose-nitrate'
]);
const P_REACTIONS = A.reactions.filter((r) => r.equation && r.equation.mode === 'P');

function coefMap(reaction) {
  const map = {};
  reaction.equation.left.forEach((item) => {
    if (item.kind === 'compound') map[item.id] = item.coef;
    else if (item.kind === 'species') map[item.id] = item.coef;
  });
  return map;
}

test('[P] 全25件で高分子 item の外側係数は 1（繰返しは構造側の _n）', () => {
  assert.equal(P_REACTIONS.length, 25);
  const bad = [];
  P_REACTIONS.forEach((r) => {
    r.equation.left.concat(r.equation.right).forEach((item) => {
      if (item.kind !== 'compound') return;
      if (!POLYMERIC.has(item.id)) return;
      if (item.coef !== 1) bad.push(r.id + ':' + item.id + '=' + item.coef);
    });
  });
  assert.deepEqual(bad, []);
});

test('[P] セルロース/グリコーゲン/誘導体の係数を直値で固定する', () => {
  const co = (id) => coefMap(A.reactions.find((r) => r.id === id));
  assert.equal(co('academic-cellulose-hydrolysis').cellulose, 1);
  assert.equal(co('academic-glycogen-hydrolysis').glycogen, 1);
  assert.equal(co('academic-cellulose-acetate').cellulose, 1);
  assert.equal(co('academic-cellulose-acetate')['acetic-anhydride'], 'dn');
  assert.equal(co('academic-cellulose-nitrate').cellulose, 1);
  assert.equal(co('academic-cellulose-nitrate').HNO3, 'dn');
  const acetate = A.reactions.find((r) => r.id === 'academic-cellulose-acetate');
  assert.equal(acetate.equation.right.find((i) => i.id === 'cellulose-acetate').coef, 1);
  assert.equal(acetate.equation.right.find((i) => i.id === 'acetic-acid').coef, 'dn');
  const nitrate = A.reactions.find((r) => r.id === 'academic-cellulose-nitrate');
  assert.equal(nitrate.equation.right.find((i) => i.id === 'cellulose-nitrate').coef, 1);
  assert.equal(nitrate.equation.right.find((i) => i.id === 'H2O').coef, 'dn');
  assert.ok(acetate.note.includes('0〜3'), '置換度の範囲を注記');
  assert.ok(nitrate.note.includes('可変'), '置換度可変を注記');
});

test('[P] SBR/NBR の単量体係数は既存 polymer 構造の繰返し記号と一致する', () => {
  const sbr = A.reactions.find((r) => r.id === 'academic-sbr');
  const nbr = A.reactions.find((r) => r.id === 'academic-nbr');
  assert.deepEqual(coefMap(sbr), { butadiene: 'm', styrene: 'n' });
  assert.deepEqual(coefMap(nbr), { butadiene: 'm', acrylonitrile: 'n' });
  // 通常の構造 unit は変更されていない。独立に記号の順序を確認する。
  const sbrUnit = D.compounds.find((c) => c.id === 'sbr').structure.unit;
  const nbrUnit = D.compounds.find((c) => c.id === 'nbr').structure.unit;
  assert.ok(sbrUnit.indexOf(')ₘ') < sbrUnit.indexOf(')ₙ'), sbrUnit);
  assert.ok(sbrUnit.indexOf('C₆H₅') > sbrUnit.indexOf(')ₘ'), 'styrene は n 側');
  assert.ok(nbrUnit.indexOf(')ₘ') < nbrUnit.indexOf(')ₙ'), nbrUnit);
  assert.ok(nbrUnit.indexOf('CN') > nbrUnit.indexOf(')ₘ'), 'acrylonitrile は n 側');
  assert.equal(D.compounds.find((c) => c.id === 'sbr').structure.unit, sbrUnit, '通常構造は不変');
});

test('[source] bisphenol-a は PF だけを引き、step-growth を混ぜない', () => {
  const r = A.reactions.find((x) => x.id === 'academic-bisphenol-a');
  assert.deepEqual(r.sources, ['Organic Chemistry Data (Reusch) Reusch 高分子（2026-11-17 確認）']);
  assert.equal(r.sources.join(' ').includes('31.4'), false);
});

test('[immutable] 正本から academic-data.js を決定的に再生成できる', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'app11', 'build-academic-data.cjs'), '--check'], {
    cwd: ROOT, encoding: 'utf8', timeout: 600000
  });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.equal(B.renderAcademicData(B.build()), fs.readFileSync(path.join(APP, 'academic-data.js'), 'utf8'));
});
