/**
 * app11 高校化学カバレッジ（source 契約）回帰テスト
 *
 * 実行: node --test scripts/tests/app11-highschool-content.test.cjs
 *
 * 対象:
 * - site-src/app11/coverage-manifest.json（教育項目の正本）
 * - scripts/app11/source-data.cjs の教育メタデータ投影と、通常へ移す大学レベル式の
 *   厳密な係数記号ホワイトリスト
 * - 通常反応・保留反応・アカデミック反応の漏れ/重複/二重描画
 *
 * 生成物（data.js / academic-data.js / layout / routes）は生成前でも動くよう、
 * source と正本だけを読む。ブラウザ操作・外部 API は行わない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site-src', 'app11');
const S = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'coverage-manifest.json'), 'utf8'));
const reactionsDoc = JSON.parse(fs.readFileSync(path.join(SRC, 'reactions.json'), 'utf8'));
const academicDoc = JSON.parse(fs.readFileSync(path.join(SRC, 'academic-reactions.json'), 'utf8'));
const source = S.loadSource();

const LEVELS = ['standard', 'advanced', 'held', 'missing-material', 'card-only'];

function slugOf(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function parseRow(text) {
  const arrow = String(text).indexOf('>');
  const side = (part) => part.split('+').map((raw) => /^([a-z0-9][a-z0-9,()-]*?)(?:\*\d+)?$/i.exec(raw.trim())[1]);
  return { substrates: side(String(text).slice(0, arrow)), products: side(String(text).slice(arrow + 1)) };
}
function academicRows() {
  const out = [];
  (academicDoc.groups || []).forEach((group) => {
    (group.rows || []).forEach((entry) => {
      const text = typeof entry === 'string' ? entry : entry.row;
      const parsed = parseRow(text);
      out.push({
        id: 'academic-' + slugOf(group.key) + '-' + slugOf(parsed.substrates.join('-')) + '-' + slugOf(parsed.products.join('-')),
        type: group.type,
        substrates: parsed.substrates,
        products: parsed.products,
        conditions: group.conditions || '',
        reason: group.note || group.scope || ''
      });
    });
  });
  (academicDoc.polymerReactions || []).forEach((r) => {
    out.push({
      id: r.id,
      type: r.type,
      substrates: (r.substrates || []).map((s) => (typeof s === 'string' ? s : s.id)),
      products: (r.products || []).map((p) => (typeof p === 'string' ? p : p.id)),
      conditions: r.conditions || '',
      reason: r.note || r.scope || ''
    });
  });
  (academicDoc.reactions || []).forEach((r) => {
    out.push({ id: r.id, type: r.type, substrates: r.substrates, products: r.products, conditions: r.conditions || '', reason: r.note || '' });
  });
  return out;
}
const academic = academicRows();
const normalIds = new Set(source.reactions.map((r) => r.id));
const heldIds = new Set(source.heldReactions.map((r) => r.id));
const academicIds = new Set(academic.map((r) => r.id));

function pairOf(type, subs, prods) {
  return type + '|' + subs.slice().sort().join('+') + '>' + prods.slice().sort().join('+');
}

test('coverage-manifest は全水準を含み、item id が一意', () => {
  assert.equal(manifest.version, 1);
  assert.equal(typeof manifest.note, 'string');
  assert.ok(Array.isArray(manifest.sources) && manifest.sources.length > 0);
  manifest.sources.forEach((s) => {
    assert.ok(s.id, 'source id');
    assert.match(String(s.url), /^https?:\/\//, 'source URL は公開教材URL: ' + s.id);
  });
  const ids = new Set();
  manifest.items.forEach((item) => {
    assert.ok(item.id, 'item id');
    assert.ok(!ids.has(item.id), 'item id 重複: ' + item.id);
    ids.add(item.id);
    assert.ok(LEVELS.includes(item.level), 'level: ' + item.id);
    assert.equal(typeof item.requiresEquation, 'boolean');
    assert.equal(typeof item.requiresDrawing, 'boolean');
    assert.ok(String(item.reason || '').trim(), 'reason: ' + item.id);
    assert.ok(Array.isArray(item.reactionIds), 'reactionIds: ' + item.id);
    assert.ok(Array.isArray(item.sources), 'sources: ' + item.id);
    item.sources.forEach((sid) => assert.ok(manifest.sources.some((s) => s.id === sid), '未知 source: ' + sid));
  });
});

test('standard は通常の確認済み反応だけで満たし、全通常反応を漏れなく覆う', () => {
  const standard = manifest.items.filter((i) => i.level === 'standard');
  const covered = new Set();
  standard.forEach((item) => {
    assert.ok(item.reactionIds.length, 'standard に reactionIds: ' + item.id);
    assert.ok(item.sources.length, 'standard に sources: ' + item.id);
    item.reactionIds.forEach((id) => {
      assert.ok(normalIds.has(id), 'standard は通常公開のみ: ' + id);
      assert.ok(!covered.has(id), 'standard の重複: ' + id);
      covered.add(id);
    });
  });
  assert.equal(covered.size, source.reactions.length, '通常の確認済み反応をすべて standard で覆う');
  normalIds.forEach((id) => assert.ok(covered.has(id), 'standard 欠落: ' + id));
});

test('held は残る全保留を覆い、holdReason を根拠待ちの理由として保持', () => {
  const heldItems = manifest.items.filter((i) => i.level === 'held');
  const covered = new Set();
  heldItems.forEach((item) => {
    item.reactionIds.forEach((id) => {
      assert.ok(heldIds.has(id), 'held は保留反応のみ: ' + id);
      assert.ok(!covered.has(id), 'held の重複: ' + id);
      covered.add(id);
    });
  });
  assert.equal(covered.size, source.heldReactions.length);
  heldIds.forEach((id) => assert.ok(covered.has(id), 'held 欠落: ' + id));
});

test('advanced は全アカデミック反応を漏れなく覆い、通常反応を混ぜない', () => {
  const advanced = manifest.items.filter((i) => i.level === 'advanced');
  const covered = new Set();
  advanced.forEach((item) => {
    assert.ok(item.reactionIds.length, 'advanced に reactionIds');
    assert.ok(item.sources.length, 'advanced に sources');
    item.reactionIds.forEach((id) => {
      assert.ok(academicIds.has(id), 'advanced はアカデミックのみ: ' + id);
      assert.ok(!normalIds.has(id), 'advanced に通常反応を混ぜない: ' + id);
      assert.ok(!covered.has(id), 'advanced の重複: ' + id);
      covered.add(id);
    });
  });
  assert.equal(covered.size, academic.length);
  academicIds.forEach((id) => assert.ok(covered.has(id), 'advanced 欠落: ' + id));
});

test('missing-material は 427 物質に存在しない ID を明示する', () => {
  const D = S.loadApp10().D;
  const missing = manifest.items.filter((i) => i.level === 'missing-material');
  assert.ok(missing.length > 0);
  missing.forEach((item) => {
    assert.equal(item.reactionIds.length, 0, 'missing は反応ノードを持たない: ' + item.id);
    assert.ok(Array.isArray(item.compoundIds) && item.compoundIds.length, 'missing compoundIds: ' + item.id);
    item.compoundIds.forEach((id) => {
      assert.equal(D.COMPOUNDS[id], undefined, 'missing ID は 427 に存在しない: ' + id);
    });
  });
  const ids = missing.reduce((a, i) => a.concat(i.compoundIds), []);
  ['ethylene-oxide', '1,2-dichloroethane', 'vulcanized-rubber'].forEach((id) => {
    assert.ok(ids.includes(id), '既知の未収録材料を明示: ' + id);
  });
});

test('card-only は未実装をカード済みと偽らない', () => {
  const cardOnly = manifest.items.filter((i) => i.level === 'card-only');
  assert.ok(cardOnly.length > 0);
  cardOnly.forEach((item) => {
    assert.ok(item.pendingKind || item.cardRef, 'card-only の扱いを明示: ' + item.id);
    if (item.pendingKind === 'detection-ui') {
      assert.equal(item.reactionIds.length, 0, '検出UI未対応は反応ノードを持たない: ' + item.id);
    }
    if (item.pendingKind === 'existing-card-note') {
      assert.ok(item.cardRef, 'existing-card-note は cardRef が必要');
      item.reactionIds.forEach((id) => assert.ok(normalIds.has(id), '既存カードは通常反応のみ: ' + id));
    }
  });
});

test('重要Reviewは47項目（A26 + B20 + TNT保留1）で確定している', () => {
  const review = manifest.importantReview;
  assert.equal(review.status, 'confirmed');
  assert.equal(review.expectedCount, 47);
  assert.equal(review.items.length, 47);
  const normal = review.items.filter((x) => x.level === 'standard');
  const held = review.items.filter((x) => x.level === 'held');
  assert.equal(normal.length, 46);
  assert.equal(held.length, 1);
  assert.equal(held[0].id, 'held-toluene-trinitration');
  review.items.forEach((entry) => {
    const item = manifest.items.find((x) => x.id === entry.id);
    assert.ok(item, '重要Reviewのitemがmanifestにない: ' + entry.id);
    assert.equal(item.level, entry.level);
  });
});

test('実件数（通常162 / 保留35 / アカデミック152）と生成前 source の整合', () => {
  assert.equal(source.reactions.length, 162);
  assert.equal(source.heldReactions.length, 35);
  assert.equal(academic.length, 152);
  assert.equal(manifest.items.filter((i) => i.level === 'standard').length, 162);
});

test('通常とアカデミックで同一組合せ・同一条件を二重描画しない', () => {
  const normalByPair = new Map();
  source.reactions.forEach((r) => {
    const key = pairOf(r.type, r.substrates, r.products);
    if (!normalByPair.has(key)) normalByPair.set(key, []);
    normalByPair.get(key).push(r);
  });
  academic.forEach((row) => {
    const same = normalByPair.get(pairOf(row.type, row.substrates, row.products));
    if (!same) return;
    const identical = same.some((r) => String(r.conditions || '').replace(/\s+/g, '') === String(row.conditions || '').replace(/\s+/g, ''));
    assert.ok(!identical, '同一条件の二重描画: ' + row.id);
    assert.ok(String(row.reason || '').trim(), '同 pair は条件差の理由が必要: ' + row.id);
  });
});

test('通常へ移した反応の legacyAcademicId はアカデミック側に残さない', () => {
  source.reactions.forEach((r) => {
    if (!r.legacyAcademicId) return;
    assert.match(r.legacyAcademicId, /^academic-[a-z0-9][a-z0-9-]*$/);
    assert.ok(!academicIds.has(r.legacyAcademicId), '二重描画になる legacyAcademicId: ' + r.legacyAcademicId);
  });
});

test('既存86反応には新しい任意フィールドを足さない（生成物の互換）', () => {
  const optional = ['educationLevel', 'evidenceKind', 'scope', 'stepKind', 'steps', 'legacyAcademicId', 'coverageIds', 'layoutGroup', 'history'];
  const old = source.reactions.filter((r) => r.educationLevel === undefined);
  assert.equal(old.length, 86);
  old.forEach((r) => {
    optional.forEach((key) => assert.equal(r[key], undefined, r.id + ' に ' + key + ' が付いている'));
  });
});

test('高校代表条件5件（CuO / 酸性二クロム酸塩）を通常反応として追加している', () => {
  const expected = {
    'methanol-cuo-oxidation': { mode: 'B', evidence: 'source-illustrated-transformation', step: 'direct' },
    'ethanol-cuo-oxidation': { mode: 'B', evidence: 'general-rule-application', step: 'direct' },
    'propan-2-ol-cuo-oxidation': { mode: 'B', evidence: 'general-rule-application', step: 'direct' },
    'ethanol-dichromate-oxidation-ethanal': { mode: 'N', evidence: 'source-illustrated-transformation', step: 'direct' },
    'ethanol-dichromate-oxidation-acetic-acid': { mode: 'N', evidence: 'source-illustrated-transformation', step: 'multi-step' }
  };
  Object.keys(expected).forEach((id) => {
    const r = source.reactions.find((x) => x.id === id);
    assert.ok(r, '追加反応がない: ' + id);
    assert.equal(r.educationLevel, 'high-school-standard');
    assert.equal(r.evidenceKind, expected[id].evidence);
    assert.equal(r.stepKind, expected[id].step);
    assert.equal(r.layoutGroup, 'high-school');
    assert.ok(r.scope && r.coverageIds.length, id + ' の scope / coverageIds');
    assert.equal(r.equation.mode, expected[id].mode);
    if (expected[id].step === 'multi-step') assert.ok(r.steps.length >= 2);
  });

  // CuO は酸化剤。Cu が生成物、水が副生する。
  source.reactions.filter((r) => /-cuo-oxidation$/.test(r.id)).forEach((r) => {
    assert.ok(r.equation.left.some((i) => i.kind === 'species' && i.id === 'CuO'), 'CuO を式の基質に持つ: ' + r.id);
    assert.ok(r.equation.right.some((i) => i.kind === 'species' && i.id === 'Cu'), 'Cu を式の生成物に持つ: ' + r.id);
    assert.ok(r.equation.right.some((i) => i.kind === 'species' && i.id === 'H2O'), '水を副生する: ' + r.id);
    assert.ok(!/触媒/.test(r.equation.above || ''), 'CuO を触媒と書かない: ' + r.id);
  });

  // 酸性二クロム酸塩は [O] の形式当量で N。Cr を含む完全式とは主張しない。
  source.reactions.filter((r) => /dichromate/.test(r.id)).forEach((r) => {
    assert.equal(r.equation.mode, 'N');
    assert.ok(r.equation.left.some((i) => i.kind === 'species' && i.id === 'O'), '[O] を使う: ' + r.id);
    assert.ok(/形式当量/.test(r.equation.explanation || ''), '形式当量の注記: ' + r.id);
    assert.ok(!/触媒/.test(r.conditions || ''), '酸化剤を触媒と書かない: ' + r.id);
  });

  // 既存 86 に同じ pair があっても、条件が異なり理由を明示していれば許容する
  // （メタノール→ホルムアルデヒドの DMP 酸化と CuO 酸化など）。
  const oldByPair = new Map();
  source.reactions.filter((r) => r.educationLevel === undefined).forEach((r) => {
    const key = pairOf(r.type, r.substrates, r.products);
    if (!oldByPair.has(key)) oldByPair.set(key, []);
    oldByPair.get(key).push(r);
  });
  Object.keys(expected).forEach((id) => {
    const r = source.reactions.find((x) => x.id === id);
    const same = oldByPair.get(pairOf(r.type, r.substrates, r.products)) || [];
    if (!same.length) return;
    assert.ok(String(r.note || '').trim(), '同 pair は条件差の理由（note）が必要: ' + id);
    same.forEach((old) => {
      assert.notEqual(
        String(old.conditions || '').replace(/\s+/g, ''),
        String(r.conditions || '').replace(/\s+/g, ''),
        '同 pair・同条件にしない: ' + id
      );
    });
  });
});

test('CuO / Cu / [O] の species はレンダラの原子価・分子式検査を通る', () => {
  const R = require(path.join(ROOT, 'site', 'app11', 'structure-draw.js'));
  const species = S.loadSpecies();
  const cases = [
    { id: 'CuO', formula: 'CuO', label: 'Cu', charge: '2+' },
    { id: 'Cu', formula: 'Cu', label: 'Cu', charge: '' },
    { id: 'O', formula: 'O', label: '[O]', charge: '' }
  ];
  cases.forEach((c) => {
    const sp = species.get(c.id);
    assert.ok(sp, 'species がない: ' + c.id);
    assert.equal(sp.formula, c.formula);
    const result = R.validate({ structure: sp.structure, formula: sp.formula });
    assert.equal(result.ok, true, c.id + ' の構造検証: ' + JSON.stringify(result.errors));
  });
  const cuo = species.get('CuO');
  assert.equal(cuo.structure.atoms[0].label, 'Cu');
  assert.equal(cuo.structure.atoms[1].label, 'O');
  assert.equal(cuo.structure.bonds.length, 0, 'CuO を分子の Cu=O として描かない');
  assert.equal(species.get('O').structure.atoms[0].label, '[O]');
});

test('教育メタデータは既知の値だけを受け付け、通常の投影に保持する', () => {
  const valid = S.projectEducationFields({
    educationLevel: 'high-school-standard',
    evidenceKind: 'source-illustrated-transformation',
    scope: '高校化学の教科書範囲',
    stepKind: 'multi-step',
    steps: ['酸化', '脱水'],
    legacyAcademicId: 'academic-example',
    coverageIds: ['held-example'],
    layoutGroup: 'high-school',
    history: [{ kind: 'held-correction', note: '旧条件を修正' }]
  }, 'test');
  assert.equal(valid.educationLevel, 'high-school-standard');
  assert.deepEqual(valid.steps, ['酸化', '脱水']);
  assert.equal(valid.layoutGroup, 'high-school');
  assert.equal(S.projectEducationFields({}, 'test'), null);

  assert.throws(() => S.projectEducationFields({ educationLevel: 'university' }, 't'), /educationLevel/);
  assert.throws(() => S.projectEducationFields({ evidenceKind: 'guess' }, 't'), /evidenceKind/);
  assert.throws(() => S.projectEducationFields({ stepKind: 'multi-step' }, 't'), /steps/);
  assert.throws(() => S.projectEducationFields({ legacyAcademicId: 'normal-id' }, 't'), /legacyAcademicId/);
  assert.throws(() => S.projectEducationFields({ history: [{ note: 'kind なし' }] }, 't'), /history/);
});

test('通常へ移す大学レベル式は m/n/p/d と説明・反復単位係数1を厳密に検証する', () => {
  const ctx = { compounds: source.compounds, species: source.species };
  const reaction = { id: 'academic-example' };
  const options = S.equationOptionsFor({ legacyAcademicId: 'academic-example' });
  assert.ok(options, 'legacyAcademicId で広い係数記号を許可');
  assert.equal(S.equationOptionsFor({ id: 'normal' }), undefined, '既存通常反応は従来の検証');

  const base = {
    mode: 'P',
    arrow: 'to',
    above: '触媒',
    explanation: '共重合の組成比は一定でないため模式的に示す。',
    left: [
      { compound: 'butadiene', coef: 'm' },
      { compound: 'styrene', coef: 'n' }
    ],
    right: [{ compound: 'sbr', coef: 1 }]
  };
  const projected = S.projectEquation(JSON.parse(JSON.stringify(base)), reaction, ctx, options);
  assert.equal(projected.mode, 'P');
  assert.equal(projected.left[0].coef, 'm');
  assert.equal(projected.right[0].coef, 1);

  const unknown = JSON.parse(JSON.stringify(base));
  unknown.left[0].coef = 'q';
  assert.throws(() => S.projectEquation(unknown, reaction, ctx, options), /係数が不正/);

  const noteMissing = JSON.parse(JSON.stringify(base));
  delete noteMissing.explanation;
  assert.throws(() => S.projectEquation(noteMissing, reaction, ctx, options), /説明/);

  const unitCoef = JSON.parse(JSON.stringify(base));
  unitCoef.right[0].coef = 2;
  assert.throws(() => S.projectEquation(unitCoef, reaction, ctx, options), /反復単位本体/);

  // 既存の通常 P（n / 2n）は options なしでそのまま通る。
  const normalP = {
    mode: 'P',
    arrow: 'to',
    above: '開始剤',
    left: [{ compound: 'ethene', coef: 'n' }],
    right: [{ compound: 'polyethylene', coef: 1 }]
  };
  assert.doesNotThrow(() => S.projectEquation(normalP, { id: 'normal-p' }, ctx));
  const normalUnknown = JSON.parse(JSON.stringify(normalP));
  normalUnknown.left[0].coef = 'm';
  assert.throws(() => S.projectEquation(normalUnknown, { id: 'normal-p' }, ctx), /係数が不正/);
});

test('source note は confirmed を「個別本文確認済み」と一律に主張しない', () => {
  const fresh = source.reactions.filter((r) => r.educationLevel);
  const counts = fresh.reduce((m, r) => (m[r.evidenceKind] = (m[r.evidenceKind] || 0) + 1, m), {});
  assert.equal(fresh.length, 76);
  assert.equal(counts['source-illustrated-transformation'], 37);
  assert.equal(counts['general-rule-application'], 39);
  assert.match(reactionsDoc.note, /一般則/);
  assert.match(reactionsDoc.note, /個別本文での実験確認を一律に保証しない/);
  assert.match(reactionsDoc.source.note, /個別例または一般則/);
  assert.doesNotMatch(reactionsDoc.source.note, /本文で確認した反応だけ/);
});

test('監査修正: ニトロ化の順序非固定・出典名・type説明の適用範囲', () => {
  const nitration = source.reactions.find((r) => r.id === 'phenol-nitration');
  assert.ok(nitration);
  assert.equal(nitration.equation.mode, 'T', '副反応注記のため T を維持');
  assert.match(nitration.conditions, /濃硝酸/);
  assert.doesNotMatch(nitration.conditions, /混酸|加熱/);
  assert.equal(nitration.equation.above, '濃硝酸');
  assert.ok(!/加熱/.test(nitration.equation.below || ''), '未支持の加熱条件を残さない');
  assert.ok(nitration.steps.every((s) => !/→/.test(s)), '置換順序を固定しない: ' + nitration.steps.join(' / '));
  assert.match(nitration.steps.join(' '), /2,4,6-位/);

  const types = reactionsDoc.types;
  assert.match(types.saponification.summary, /カルボン酸塩とアルコール/);
  assert.match(types.saponification.summary, /油脂/);
  assert.match(types['condensation-polymerization'].summary, /多官能性/);
  assert.doesNotMatch(types['condensation-polymerization'].summary, /2種類以上/);

  const names = (id) => source.reactions.find((r) => r.id === id).sources;
  assert.ok(names('methanol-cuo-oxidation').some((x) => x.includes('埼玉県立松山高等学校')));
  assert.ok(names('phenol-phthalein').some((x) => x.includes('市立札幌山の手支援学校')));
  assert.ok(names('nylon66-acid-chloride-condensation').some((x) => x.includes('市立札幌山の手支援学校')));
  const src = (id) => manifest.sources.find((s) => s.id === id).book;
  assert.equal(src('MATSUYAMA-CUO'), '埼玉県立松山高等学校 公開記事');
  assert.equal(src('SAPP'), '市立札幌山の手支援学校');

  const docs = fs.readFileSync(path.join(ROOT, 'docs', 'app11-highschool-coverage.md'), 'utf8');
  assert.doesNotMatch(docs, /愛媛県立松山高等学校/);
  assert.doesNotMatch(docs, /札幌市立高校/);
});

test('variantKind は coexistence / competition だけを許可し、variants を必須にする', () => {
  const ctx = { compounds: source.compounds, species: source.species };
  const raw = {
    mode: 'T',
    arrow: 'equilibrium',
    variantKind: 'competition',
    variants: [
      { label: 'A', left: [{ compound: 'but-2-ene' }], right: [{ compound: 'butan-2-ol' }] },
      { label: 'B', left: [{ compound: 'but-2-ene' }], right: [{ compound: 'butan-1-ol' }] }
    ]
  };
  const out = S.projectEquation(raw, { id: 'variant' }, ctx);
  assert.equal(out.variantKind, 'competition');
  assert.equal(out.variants.length, 2);
  assert.throws(() => S.projectEquation(Object.assign({}, raw, { variantKind: 'both' }), { id: 'v2' }, ctx), /variantKind/);
  const noVariants = { mode: 'T', arrow: 'to', variantKind: 'competition', left: [{ compound: 'ethanol' }], right: [{ compound: 'ethene' }] };
  assert.throws(() => S.projectEquation(noVariants, { id: 'v3' }, ctx), /variants/);
});
