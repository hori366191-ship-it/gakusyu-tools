/**
 * 有機反応マップ（site/app11）— 反応カードの反応式（equation）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app11-reaction-equations.test.cjs
 *
 * 対象: site-src/app11/reactions.json の equation、site-src/app11/species.json、
 *       data.js への投影、structure-draw.js の renderEquation、app.js のカード配線。
 * 元素収支はこのテスト側で独立に数え直す（ビルド側の実装をそのまま使わない）。
 * ブラウザ操作・描画の目視は行わない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const SRC = path.join(ROOT, 'site-src', 'app11');
const D = require(path.join(APP, 'data.js'));
const S = require(path.join(APP, 'structure-draw.js'));
const SRC_DATA = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));

const REACTIONS = JSON.parse(fs.readFileSync(path.join(SRC, 'reactions.json'), 'utf8'));
const SPECIES_DOC = JSON.parse(fs.readFileSync(path.join(SRC, 'species.json'), 'utf8'));
const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(APP, 'structure.css'), 'utf8');

const CONFIRMED = REACTIONS.reactions.filter((r) => r.state === 'confirmed');
const MODE_COUNTS = { B: 0, T: 0, N: 0, P: 0 };
D.reactions.forEach((r) => { MODE_COUNTS[r.equation.mode]++; });
const ALLOWED_SECTIONS = [
  '17.7', '17.4', '17.6', '21.6', '21.5', '27.2', '16.2', '24.8', '17.9',
  '16.8', '25.6', '25.8', '25.9', '26.4', '26.7', '31.4'
];

/* ---- 独立した元素収支（テスト側の実装） ---- */

function countFormula(formula, owner) {
  const counts = {};
  let i = 0;
  const text = String(formula || '');
  if (!text) throw new Error(owner + ' の化学式が空');
  while (i < text.length) {
    let el;
    if (text[i] === '[') {
      const end = text.indexOf(']', i);
      if (end < 0) throw new Error(owner + ' の化学式の括弧が不正');
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
      throw new Error(owner + ' の化学式を読めない: ' + text);
    }
    const m = /^\d+/.exec(text.slice(i));
    const n = m ? Number(m[0]) : 1;
    if (m) i += m[0].length;
    counts[el] = (counts[el] || 0) + n;
  }
  return counts;
}

function labelCharge(label) {
  const text = String(label || '');
  if (/[⁺＋]$/.test(text)) return 1;
  if (/[⁻－]$/.test(text)) return -1;
  return 0;
}

// 電荷は atom.charge かラベルの上付きのどちらか一方だけに書く。両方に書いて二重に数えない。
function atomCharge(atom, owner) {
  const raw = Array.isArray(atom);
  const explicit = (raw ? atom[6] : atom.charge) || '';
  let magnitude = 1;
  let sign = 0;
  if (explicit) {
    const m = /^([1-9]\d*)?([+-])$/.exec(String(explicit));
    if (!m) throw new Error(owner + ' の電荷が不正: ' + explicit);
    magnitude = m[1] ? parseInt(m[1], 10) : 1;
    sign = m[2] === '+' ? 1 : -1;
  }
  const fromExplicit = sign * magnitude;
  const fromLabel = labelCharge(raw ? atom[4] : atom.label);
  if (fromExplicit) {
    assert.equal(fromLabel, 0, owner + ' の電荷が原子とラベルで二重');
    return fromExplicit;
  }
  return fromLabel;
}

function formulaOfItem(item) {
  if (item.kind === 'compound') {
    const c = D.compounds.find((x) => x.id === item.id);
    assert.ok(c, '未収録の物質: ' + item.id);
    assert.ok(c.formula, item.id + ' の化学式がない');
    return c.formula;
  }
  if (item.kind === 'species') {
    const s = SPECIES_DOC.species[item.id];
    assert.ok(s, '未定義の無機species: ' + item.id);
    return s.formula;
  }
  throw new Error('text 項目は収支計算できない');
}

function sumSide(items) {
  const elements = {};
  let charge = 0;
  items.forEach((item) => {
    const coef = item.coef == null ? 1 : item.coef;
    assert.equal(typeof coef, 'number', '係数 ' + coef + ' は元素収支の対象外');
    const counts = countFormula(formulaOfItem(item), item.id);
    Object.keys(counts).forEach((el) => {
      elements[el] = (elements[el] || 0) + counts[el] * coef;
    });
    if (item.kind === 'species') charge += (SPECIES_DOC.species[item.id].charge || 0) * coef;
  });
  return { elements, charge };
}

function balanceOf(eq) {
  return { left: sumSide(eq.left || []), right: sumSide(eq.right || []) };
}

/* ---- 投影済みデータの反応式 ---- */

const byId = {};
D.reactions.forEach((r) => { byId[r.id] = r; });

function speciesStructure(id) {
  const s = D.species[id];
  assert.ok(s, 'data.js に無機speciesがない: ' + id);
  return s.structure;
}

function resolveItems(items) {
  return items.map((item) => {
    if (item.kind === 'species') return { coef: item.coef, name: item.id, structure: speciesStructure(item.id) };
    if (item.kind === 'text') return { coef: item.coef, name: item.text, structure: null };
    const c = D.compounds.find((x) => x.id === item.id);
    assert.ok(c && c.structure, item.id + ' の構造がない');
    return { coef: item.coef, name: c.name, structure: c.structure };
  });
}

function renderStoredEquation(r) {
  const eq = r.equation;
  assert.ok(eq, r.id + ' の反応式がない');
  const base = {
    arrow: eq.arrow,
    above: eq.above,
    below: eq.below,
    left: resolveItems(eq.left),
    right: resolveItems(eq.right)
  };
  const pixel = S.renderEquation(base, r.id, REACTION_OPTS);
  return pixel;
}

// app.js の REACTION_EQUATION_OPTS と同じ値。大きい分子を潰さない縮小率の下限を持つ。
const REACTION_OPTS = { row: 200, maxWidth: 300, minScale: 0.55 };

/* ---- schema ---- */

test('[schema] 確認済み86反応すべてが反応式を持ち、mode は B/N/T/P のいずれか', () => {
  assert.equal(CONFIRMED.length, D.reactions.length);
  assert.equal(D.reactions.length, D.meta.reactionCount);
  const counts = { B: 0, N: 0, T: 0, P: 0 };
  CONFIRMED.forEach((r) => {
    assert.ok(r.equation, r.id + ' に equation がない');
    assert.ok(Object.prototype.hasOwnProperty.call(MODE_COUNTS, r.equation.mode), r.id + ' のmode: ' + r.equation.mode);
    counts[r.equation.mode]++;
    if (!r.educationLevel) {
      assert.ok(r.equation.above || r.equation.below, r.id + ' に矢印の上下の条件がない');
      assert.notEqual(r.equation.above, r.equation.below, r.id + ' のabove/belowが同じ');
    }
    assert.ok(['to', 'equilibrium'].includes(r.equation.arrow), r.id + ' の矢印');
    if (r.equation.mode === 'P') assert.equal(r.equation.arrow, 'to', r.id + ' の重合模式式の矢印');
  });
  assert.deepEqual(counts, MODE_COUNTS, 'mode別の件数');
  REACTIONS.reactions.filter((r) => r.state !== 'confirmed').forEach((r) => {
    assert.equal(r.equation, undefined, '保留反応に式を付けない: ' + r.id);
  });
});

test('[schema] 各項目は compound / species / text のどれか1つで、係数は 1〜9（P は n / 2n）', () => {
  CONFIRMED.forEach((r) => {
    const eq = r.equation;
    const sides = eq.variants && eq.variants.length
      ? eq.variants.reduce((a, v) => a.concat(v.left, v.right), [])
      : eq.left.concat(eq.right);
    assert.ok(sides.length, r.id + ' の式が空');
    sides.forEach((item) => {
      const keys = ['compound', 'species', 'text'].filter((k) => item[k] != null);
      assert.equal(keys.length, 1, r.id + ' の項目: ' + JSON.stringify(item));
      if (eq.mode === 'P') {
        assert.ok(item.coef == null || [1, 2, 3, 9, 'n', '2n', 'dn', '3n', 'm', 'p', 'd', 'x'].includes(item.coef), r.id + ' の係数: ' + item.coef);
      } else {
        const coef = item.coef == null ? 1 : item.coef;
        assert.ok(Number.isInteger(coef) && coef >= 1 && coef <= 9,
          r.id + ' の係数: ' + item.coef);
      }
      if (keys[0] === 'compound') {
        assert.ok(D.compounds.some((c) => c.id === item.compound), r.id + ' の未収録物質: ' + item.compound);
      }
      if (keys[0] === 'species') {
        assert.ok(D.species[item.species], r.id + ' の未定義species: ' + item.species);
      }
      if (keys[0] === 'text') {
        assert.equal(eq.mode, 'T', r.id + ' の text は T だけ');
        assert.ok(item.text, r.id + ' の text が空');
      }
    });
  });
  assert.equal(D.reactions.some((r) => r.equation.variants.length), true, '代替経路（平衡）を1件以上持つ');
});
/* ---- 収支 ---- */

test('[balance] B/N の86式中すべてが元素収支と電荷収支に合う（テスト側で数え直す）', () => {
  let checked = 0;
  D.reactions.forEach((r) => {
    const eq = r.equation;
    if (eq.mode !== 'B' && eq.mode !== 'N') return;
    const { left, right } = balanceOf(eq);
    Object.keys(left.elements).concat(Object.keys(right.elements))
      .filter((el, i, arr) => arr.indexOf(el) === i)
      .forEach((el) => {
        assert.equal(left.elements[el] || 0, right.elements[el] || 0,
          r.id + ' の元素収支: ' + el);
      });
    assert.equal(left.charge, right.charge, r.id + ' の電荷収支');
    checked++;
  });
  assert.equal(checked, D.reactions.filter((r) => r.equation.mode === 'B' || r.equation.mode === 'N').length);
});

test('[balance] species.json の formula・全原子＋implicitH・電荷が整合する（全種）', () => {
  const ids = Object.keys(SPECIES_DOC.species);
  assert.equal(ids.length, Object.keys(D.species).length);
  ids.forEach((id) => {
    const s = SPECIES_DOC.species[id];
    const fromFormula = countFormula(s.formula, id);
    const fromAtoms = {};
    let charge = 0;
    s.structure.atoms.forEach((a) => {
      const el = a[0];
      const h = a[3] || 0;
      fromAtoms[el] = (fromAtoms[el] || 0) + 1;
      if (h) fromAtoms.H = (fromAtoms.H || 0) + h;
      charge += atomCharge(a, id);
    });
    assert.deepEqual(fromAtoms, fromFormula, id + ' の式と構造（原子＋implicitH）');
    assert.equal(charge, s.charge || 0, id + ' の電荷の合計');
  });
});

test('[balance] 無機speciesの形式電荷は構造どおり（NaNO2 の N は中性、HNO3 の N は +）', () => {
  const na = (id, i) => SPECIES_DOC.species[id].structure.atoms[i];
  const nano2 = SPECIES_DOC.species.NaNO2.structure;
  assert.equal(na('NaNO2', 0)[0], 'Na');
  assert.equal(na('NaNO2', 0)[6], '+');
  assert.equal(na('NaNO2', 1)[0], 'N');
  assert.equal(na('NaNO2', 1)[6] || '', '', '亜硝酸イオンの N は中性（+ を付けない）');
  assert.equal(labelCharge(na('NaNO2', 1)[4]), 0, 'N のラベルにも + を付けない');
  assert.equal(na('NaNO2', 3)[6], '-');
  assert.deepEqual(nano2.bonds, [[1, 2, 2], [1, 3]], 'N=O と N–O⁻ の2結合');

  assert.equal(na('HNO3', 2)[0], 'N');
  assert.equal(na('HNO3', 2)[6], '+', 'HNO3 の N は4結合で +');
  assert.equal(na('HNO3', 4)[6], '-');

  const naoh = SPECIES_DOC.species.NaOH.structure;
  assert.equal(naoh.atoms[0][6], '+');
  assert.equal(naoh.atoms[1][6], '-');
  assert.equal(naoh.atoms[1][3], 1, 'OH⁻ の O は implicit H を1つ持つ');
  assert.equal(naoh.atoms.filter((a) => a[0] === 'H').length, 0, 'H を原子として重複させない');
});

test('[balance] 原子価skipは孤立イオンだけに限定し、通常原子の誤りを隠さない', () => {
  Object.keys(SPECIES_DOC.species).forEach((id) => {
    const g = S.buildStructure(D.species[id].structure);
    g.atoms.forEach((a, i) => {
      if (!a.skipValence) return;
      const ionic = a.charge || ['Na', 'K', 'Li', 'Cu', 'Ag', 'Fe', 'Zn', 'Mg', 'Al', 'Ca'].includes(a.el);
      if (ionic) return; // イオン・金属は結合線で表しても原子価計算の対象外
      const degree = g.bonds.filter((b) => b.a === i || b.b === i).length;
      assert.equal(degree, 0, id + ' の原子' + i + ' は結合を持つのでskip不可');
      assert.equal(a.h || 0, 0, id + ' の原子' + i + ' は implicitH を持つのでskip不可');
    });
  });
  // 構造の描画検証も通り、skipで原子価エラーを握りつぶしていないこと。
  Object.keys(SPECIES_DOC.species).forEach((id) => {
    const g = S.buildStructure(D.species[id].structure);
    assert.equal(S._internal.checkValence(g).ok, true, id + ' の原子価');
  });
});

test('[balance] 15種すべてが実原子・結合で描画され、名称boxやerrorに落ちない', () => {
  Object.keys(SPECIES_DOC.species).forEach((id) => {
    const s = D.species[id];
    const svg = S.renderStructure(s.structure, id);
    assert.ok(svg.startsWith('<svg'), id);
    assert.equal(svg.includes('data-error="1"'), false, id + ' が描画エラー');
    assert.ok(svg.includes('rp-struct-atom'), id + ' に原子ラベルがない');
    s.structure.atoms.forEach((a) => {
      assert.ok(svg.includes('>' + a.label + '<'), id + ' の原子ラベル ' + a.label + ' が出ていない');
    });
    if (s.structure.bonds.length) {
      assert.ok(svg.includes('<line'), id + ' に結合線がない');
    }
    // 反応式に置いても文字boxへ落ちない。
    const eq = S.renderEquation({
      arrow: 'to', above: '', below: '',
      left: [{ coef: 1, name: s.name, structure: s.structure }],
      right: []
    }, id);
    assert.equal(eq.includes('data-eq-text="1"'), false, id + ' が文字boxに落ちる');
    assert.equal(eq.includes('data-error="1"'), false, id + ' が式で描画エラー');
  });
});

test('[balance] 無機speciesは427物質に混ざらず、反応式の参照先としてだけ存在する', () => {
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.compounds.length, 427);
  Object.keys(D.species).forEach((id) => {
    assert.equal(D.compounds.some((c) => c.id === id), false, 'species が物質一覧に混ざる: ' + id);
  });
  const used = new Set();
  D.reactions.forEach((r) => {
    r.equation.left.concat(r.equation.right).forEach((item) => {
      if (item.kind === 'species') used.add(item.id);
    });
  });
  assert.ok(used.size >= 10, '無機speciesが反応式で使われている');
});

test('[balance] 未確認の不均衡・未知元素・不正係数・未定義IDはビルドで fail-closed になる', () => {
  const src = SRC_DATA.loadSource();
  const ctx = { compounds: src.compounds, species: src.species };
  const reaction = { id: 'fixture', state: 'confirmed' };
  const base = {
    mode: 'B',
    above: '',
    below: '',
    left: [{ compound: 'methane' }, { species: 'Cl2' }],
    right: [{ compound: 'chloromethane' }, { species: 'HCl' }]
  };
  const ok = SRC_DATA.projectEquation(base, reaction, ctx);
  assert.equal(ok.mode, 'B');
  assert.equal(ok.left.length, 2);

  const throws = (patch, pattern, message) => {
    const raw = Object.assign({}, base, patch);
    assert.throws(() => SRC_DATA.projectEquation(raw, reaction, ctx), pattern, message);
  };
  throws({ left: [{ compound: 'methane' }], right: [{ compound: 'chloromethane' }, { species: 'HCl' }] },
    /元素収支が合わない|式に/, '不足した反応物を黙って通さない');
  throws({ right: [{ compound: 'chloromethane' }, { species: 'HCl', coef: 2 }] }, /元素収支が合わない/, '過剰な係数');
  throws({ left: [{ compound: 'methane', coef: 0 }], right: [{ compound: 'chloromethane' }] }, /係数が不正/, '係数0');
  throws({ left: [{ compound: 'methane', coef: 10 }], right: [{ compound: 'chloromethane' }] }, /係数が不正/, '係数10');
  throws({ left: [{ compound: 'unknown-compound' }], right: [{ compound: 'chloromethane' }] }, /未収録/, '未収録ID');
  throws({ left: [{ species: 'Xx2' }], right: [{ species: 'Cl2' }] }, /未定義/, '未定義species');
  throws({ left: [{ text: '何か' }], right: [{ compound: 'chloromethane' }] }, /text は構造変換図/, 'Bでのtext');
  throws({ mode: 'Z' }, /modeが不正/, '未対応mode');
  throws({ right: [{ compound: 'chloromethane' }, { species: 'HCl', coef: 'n' }] }, /係数が不正/, 'Bでのn');

  // 未知元素は化学式の解析で止まる（species を差し替えて検査）。
  const species = new Map(src.species);
  species.set('Xx2', { id: 'Xx2', name: '未知', formula: 'Xx2', charge: 0, structure: { atoms: [{ el: 'Xx', x: 0, y: 0, h: 0 }], bonds: [] } });
  assert.throws(() => SRC_DATA.projectEquation({
    mode: 'B', above: '', below: '',
    left: [{ species: 'Xx2' }],
    right: [{ species: 'Xx2' }]
  }, reaction, { compounds: src.compounds, species }), /未知の元素/, '未知元素');

  // 電荷収支（同じ元素数で電荷だけが違う fixture。Na⁺ を中性の Na に置き換える）。
  const chargeSpecies = new Map(src.species);
  chargeSpecies.set('Na-neutral', { id: 'Na-neutral', name: 'Na（中性）', formula: 'Na', charge: 0, structure: { atoms: [{ el: 'Na', x: 0, y: 0, h: 0, label: 'Na' }], bonds: [] } });
  assert.throws(() => SRC_DATA.projectEquation({
    mode: 'N', above: '', below: '',
    left: [{ compound: 'sodium-phenoxide' }, { species: 'H+' }],
    right: [{ compound: 'phenol' }, { species: 'Na-neutral' }]
  }, reaction, { compounds: src.compounds, species: chargeSpecies }), /電荷収支が合わない/, '電荷収支');
});

test('[balance] 酸化の形式当量 [O] は O 原子1個として数える（元素定義を明示）', () => {
  assert.deepEqual(SRC_DATA.parseFormula('[O]', 'fixture'), { O: 1 });
  assert.deepEqual(SRC_DATA.parseFormula('[H]2[O]', 'fixture'), { H: 2, O: 1 });
  assert.throws(() => SRC_DATA.parseFormula('[Q]', 'fixture'), /未知の元素/, '未定義の形式記号');
});
/* ---- 表示modeの区別 ---- */

test('[mode] T/P は完全な反応式と名乗らず、B/N は収支の種類を明示する', () => {
  assert.match(APP_JS, /B: '係数・副生成物まで含む反応式です/);
  assert.match(APP_JS, /N: '元素収支は合うが、塩の生成・中和・後処理などを省略した総括式です/);
  assert.match(APP_JS, /T: '反応物と生成物の構造だけを示す変換図です/);
  assert.match(APP_JS, /完全な反応式ではありません/);
  assert.match(APP_JS, /P: '繰り返し単位 n で示す重合の模式式です/);
  assert.match(APP_JS, /有限の鎖の完全な反応式ではありません/);
  assert.match(APP_JS, /主な物質の変換（係数・副生成物省略）/);

  D.reactions.forEach((r) => {
    assert.ok(['完全な反応式', '正味の総括式', '構造変換図', '重合反応の模式式'].includes(r.equation.modeLabel),
      r.id + ' のmode表示名');
  });
  const p = D.reactions.filter((r) => r.equation.mode === 'P');
  assert.equal(p.length, D.reactions.filter((r) => r.equation.mode === 'P').length);
  p.forEach((r) => {
    const coefs = r.equation.left.concat(r.equation.right).map((i) => i.coef);
    assert.ok(coefs.includes('n') || coefs.includes('2n') || coefs.some((c) => typeof c === 'string'), r.id + ' に繰り返し係数がない');
    assert.equal(r.equation.left.concat(r.equation.right)
      .some((i) => typeof i.coef === 'string' && !['n', '2n', '3n', 'dn', 'm', 'p', 'd', 'x'].includes(i.coef)), false);
  });
});

/* ---- 資料の機械検査 ---- */

test('[source] 追加した式の根拠は OpenStax の節・URL・確認日 2026-11-16 と一致する', () => {
  let added = 0;
  CONFIRMED.forEach((r) => {
    const list = r.equation.verification || [];
    list.forEach((entry) => {
      added++;
      assert.equal(entry.source, 'OpenStax Organic Chemistry (McMurry)', r.id);
      assert.equal(entry.date, '2026-11-16', r.id);
      assert.ok(ALLOWED_SECTIONS.includes(entry.section), r.id + ' の節: ' + entry.section);
      assert.equal(entry.url, 'https://openstax.org/books/organic-chemistry/pages/' +
        entry.section.replace('.', '-') + '-' + entry.url.split('/pages/')[1].split('-').slice(2).join('-'),
        r.id + ' のURLと節');
      assert.ok(entry.title, r.id + ' の資料名');
    });
  });
  assert.ok(added >= 25, '式の根拠が節ごとに付いている: ' + added);
});

test('[source] 未取得の節に確認日だけを付けず、既存の検証記録へフォールバックする', () => {
  const raw = (id) => CONFIRMED.find((r) => r.id === id);
  // review: 節の割り当てが不適合だった追加資料は削除済み。式の根拠は reactions[].verification を使う。
  const expectExisting = {
    'ethanol-dehydration-ether': '18.2',
    'ethene-polymerization': '8.10',
    'propene-polymerization': '8.10',
    'vinyl-chloride-polymerization': '8.10',
    'styrene-polymerization': '8.10',
    'phenol-acid-neutralization': '17.2',
    'sodium-phenoxide-acidification': '17.2'
  };
  Object.keys(expectExisting).forEach((id) => {
    const r = raw(id);
    assert.deepEqual(r.equation.verification || [], [], id + ' に未取得の節を残さない');
    const sections = (r.verification || []).map((e) => e.section);
    assert.ok(sections.indexOf(expectExisting[id]) !== -1, id + ' の既存資料: ' + expectExisting[id]);
  });
  // 付加重合（n 付加）に縮重合の節 31.4 を付けない。縮重合は既存の 31.4 をそのまま使う。
  ['ethene-polymerization', 'propene-polymerization', 'styrene-polymerization', 'vinyl-chloride-polymerization']
    .forEach((id) => {
      assert.equal(((raw(id).equation.verification) || []).some((e) => e.section === '31.4'), false,
        id + ' は付加重合なので31.4を使わない');
    });
  ['nylon66-condensation', 'pet-condensation'].forEach((id) => {
    assert.ok((raw(id).verification || []).some((e) => e.section === '31.4'), id + ' の既存資料は31.4');
  });
  // app.js は式の資料が無いとき、既存の反応資料を式の根拠として表示する。
  assert.match(APP_JS, /sources: \(eq\.sources && eq\.sources\.length\) \? eq\.sources : \(r\.sources \|\| \[\]\)/);
});

test('[source] 既存の反応の検証記録は式の追加で変わらない', () => {
  const byData = {};
  D.reactions.forEach((r) => { byData[r.id] = r; });
  CONFIRMED.forEach((r) => {
    const data = byData[r.id];
    assert.ok(data, r.id);
    assert.deepEqual(data.sources, (r.verification || []).map((e) => SRC_DATA.publicSource(e)),
      r.id + ' の検証記録');
  });
  D.reactions.forEach((r) => {
    const raw = CONFIRMED.find((x) => x.id === r.id);
    assert.equal(r.conditions, raw.conditions || '', r.id + ' の条件を書き換えない');
    assert.equal(r.note, raw.note || '', r.id + ' の注記を書き換えない');
    assert.equal(r.productNote, raw.productNote || '', r.id + ' の生成物注記を書き換えない');
  });
});

/* ---- 実SVG ---- */

test('[svg] 86件すべてが係数・＋・矢印を含むSVGを実際に返す', () => {
  let rendered = 0;
  D.reactions.forEach((r) => {
    if (r.equation.variants && r.equation.variants.length) {
      r.equation.variants.forEach((variant) => {
        const svg = S.renderEquation({
          arrow: variant.arrow,
          above: r.equation.above,
          below: r.equation.below,
          left: resolveItems(variant.left),
          right: resolveItems(variant.right)
        }, r.id + ':' + variant.label, REACTION_OPTS);
        assert.ok(svg.startsWith('<svg'), r.id + ' の代替式');
        assert.ok(svg.includes('rp-eq-arrow'), r.id + ' の矢印');
        assert.equal(svg.includes('data-error="1"'), false, r.id + ' の構造エラー');
        rendered++;
      });
      return;
    }
    const svg = renderStoredEquation(r);
    assert.ok(svg.startsWith('<svg'), r.id);
    assert.ok(svg.includes('rp-eq-arrow'), r.id + ' の矢印');
    assert.equal(svg.includes('data-error="1"'), false, r.id + ' の構造エラー');
    const hasCoef = r.equation.left.concat(r.equation.right)
      .some((item) => (item.coef == null ? 1 : item.coef) !== 1);
    if (hasCoef) assert.ok(svg.includes('rp-eq-coef'), r.id + ' の係数');
    rendered++;
  });
  assert.equal(rendered, D.reactions.length + 1, '全反応 + 代替経路1件');
});

test('[svg] 係数・条件はエスケープされ、矢印の上下に条件が入る', () => {
  const svg = S.renderEquation({
    arrow: 'to',
    above: '<script>alert(1)</script>',
    below: 'A&B',
    left: [{ coef: 2, name: 'メタン', structure: D.compounds.find((c) => c.id === 'methane').structure }],
    right: [{ coef: 1, name: '生成物', structure: null }]
  }, 'fixture <x>');
  assert.equal(svg.includes('<script>'), false);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('A&amp;B'));
  assert.ok(svg.includes('rp-eq-cond'));
  assert.ok(svg.includes('aria-label="fixture &lt;x&gt;"'));
  assert.ok(svg.includes('>2</text>'), '係数2を表示');
});

test('[svg] 構造specを持たない項目は示性式と偽らず文字の箱で描く', () => {
  const svg = S.renderEquation({
    arrow: 'to',
    above: '',
    below: '',
    left: [{ coef: 1, name: 'アミノ酸類', structure: null }],
    right: [{ coef: 1, name: '生成物', structure: null }]
  }, 'fixture');
  assert.ok(svg.includes('data-eq-text="1"'));
  assert.ok(svg.includes('アミノ酸類'));
  assert.equal(svg.includes('data-error="1"'), false);
});

test('[svg] 反応カードは大きい分子を潰さず、行の高さを広げて文字サイズを保つ', () => {
  assert.match(APP_JS, /var REACTION_EQUATION_OPTS = \{ row: 200, maxWidth: 300, minScale: 0\.55 \};/);
  assert.match(APP_JS, /function buildReactionEquationSvg\(eq, ariaLabel\) \{\n    return SD\.renderEquation\(eq, ariaLabel, REACTION_EQUATION_OPTS\);/);
  assert.match(APP_JS, /function equationFigureBlock[\s\S]{0,200}buildCardEquationSvg\(equation, aria\)/);
  const svg = renderStoredEquation(D.reactions.find((r) => r.id === 'glycerol-stearic-esterification'));
  const vb = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg);
  assert.ok(Number(vb[2]) >= 250, '条件の行を含めて高さを確保する: ' + vb[2]);
  // 既定（一般図）は従来と同じ行の高さで描く。
  const defaultSvg = S.renderEquation({
    arrow: 'to',
    above: '',
    below: '',
    left: [{ coef: 1, name: 'x', structure: D.compounds.find((c) => c.id === 'methane').structure }],
    right: []
  }, 'x');
  assert.ok(/viewBox="0 0 [0-9.]+ 152\.0"/.test(defaultSvg), '既定は従来の高さ152');
});

test('[svg] 一般図16変換のSVGは従来と同じ（条件なし・above/belowを足さない）', () => {
  assert.equal(APP_JS.includes('function buildEquationSvg(eq, ariaLabel) {\n    return SD.renderEquation(eq, ariaLabel);\n  }'), true,
    '一般図と反応カードは同じ描画関数を使う');
  D.classMap.edges.forEach((e) => {
    assert.deepEqual(Object.keys(e.equation).sort(), ['arrow', 'left', 'right'], e.id + ' の一般反応式の形');
    const svg = S.renderEquation(e.equation, e.id);
    assert.equal(svg.includes('rp-eq-cond'), false, e.id + ' に条件を足さない');
    assert.ok(svg.includes('rp-eq-arrow'), e.id);
  });
});

/* ---- カード配線とCSS ---- */

test('[card] 個別情報の直前に反応式を出し、既存の説明（基質・試薬・生成物・条件・注意・分野）を残す', () => {
  const start = APP_JS.indexOf("html += '<h3>この反応の個別情報</h3>';");
  assert.ok(start > 0);
  const after = APP_JS.slice(start, start + 400);
  assert.ok(after.indexOf('reactionEquationFigure(r)') > 0, '反応式は個別情報の見出し直後');
  assert.ok(after.indexOf("html += '<dl class=\"rp-dl\">';") > 0, '既存のdlは残す');
  ['基質', '試薬', '生成物', '条件', '例外・注意', '分野'].forEach((label) => {
    const at = APP_JS.indexOf("'<div><dt>" + label + '</dt>');
    assert.ok(at > 0, label + ' の行を消さない');
  });
  assert.ok(APP_JS.includes('function reactionEquationFigure('));
  assert.ok(APP_JS.includes("if (!r.equation)") || APP_JS.includes('if (!eq)'), '式が無い反応の分岐');
  assert.ok(APP_JS.includes('view.kind === \'fallback\''), '示性式fallbackの区別を保つ');
});

test('[css] 反応式はカード内で横スクロールせず全体を縮小し、条件の文字色をテーマ変数で持つ', () => {
  assert.match(CSS, /\.rp-eq-fig \.rp-struct__canvas\s*\{[^}]*overflow:\s*hidden/);
  assert.match(CSS, /\.rp-eq-fig \.rp-struct__canvas svg\s*\{[^}]*width:\s*100%[^}]*max-height:\s*none/);
  assert.match(CSS, /\.rp-eq-fig \.rp-eq-open\s*\{[^}]*display:\s*block[^}]*width:\s*100%/);
  assert.match(CSS, /\.rp-eq-fig \.rp-eq-open:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--rp-focus\)/);
  assert.match(CSS, /\.rp-eq-svg \.rp-eq-cond\s*\{[^}]*fill:\s*var\(--rp-accent-2\)/);
});

test('[data] data.js は生成物と一致し、反応式は反応ごとに equation キーへ投影される', () => {
  const { build, renderData } = require(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'));
  assert.equal(renderData(build()), fs.readFileSync(path.join(APP, 'data.js'), 'utf8'));
  D.reactions.forEach((r) => {
    assert.ok(r.equation, r.id);
    assert.equal(r.equation.mode, r.equation.mode.toUpperCase());
    assert.deepEqual(r.equation.sources, (CONFIRMED.find((x) => x.id === r.id).equation.verification || [])
      .map((e) => SRC_DATA.publicSource(e)), r.id + ' の式の資料');
  });
});
