/**
 * app11 反応グループ化（reaction-groups.js）の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-reaction-groups.test.cjs
 *
 * 目的:
 *   - 通常 162 反応 → 156 グループ、アカデミック結合 314 反応 → 308 グループ。
 *   - 実際に統合される 5 グループ / 11 反応の member・代表 ID を固定する。
 *   - 逆向きは統合しない / 多入力多出力は集合完全一致のみ / 空の端は単独扱い。
 *   - 条件・係数・type/tier/出典・座標が違っても同じグループ、各 member は元の値のまま。
 *   - 決定性・入力不変・単独グループの表示 ID 維持。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));

const NORMAL_IDS = D.reactions.map((r) => r.id);
const ACADEMIC_IDS = A.reactions.map((r) => r.id);
const COMBINED = D.reactions.concat(A.reactions);
const COMBINED_ORDER = NORMAL_IDS.concat(ACADEMIC_IDS);

const EXPECTED = [
  {
    representativeId: 'methanol-oxidation-formaldehyde',
    memberIds: ['methanol-oxidation-formaldehyde', 'methanol-cuo-oxidation'],
    substrateIds: ['methanol'],
    productIds: ['formaldehyde']
  },
  {
    representativeId: 'ethanol-oxidation-ethanal',
    memberIds: [
      'ethanol-oxidation-ethanal',
      'ethanol-cuo-oxidation',
      'ethanol-dichromate-oxidation-ethanal'
    ],
    substrateIds: ['ethanol'],
    productIds: ['ethanal']
  },
  {
    representativeId: 'ethanol-oxidation-acetic',
    memberIds: ['ethanol-oxidation-acetic', 'ethanol-dichromate-oxidation-acetic-acid'],
    substrateIds: ['ethanol'],
    productIds: ['acetic-acid']
  },
  {
    representativeId: 'propan-2-ol-oxidation',
    memberIds: ['propan-2-ol-oxidation', 'propan-2-ol-cuo-oxidation'],
    substrateIds: ['propan-2-ol'],
    productIds: ['acetone']
  },
  {
    representativeId: 'acetic-acid-neutralization',
    memberIds: ['acetic-acid-neutralization', 'acetic-acid-sodium-carbonate'],
    substrateIds: ['acetic-acid'],
    productIds: ['sodium-acetate']
  }
];

function expectedByRepresentative(built) {
  const found = new Map();
  built.groups.forEach((group) => {
    if (group.size > 1) found.set(group.representativeId, group);
  });
  return found;
}

function realMultiGroups(built) {
  return built.groups.filter((g) => g.size > 1);
}

test('[module] CommonJS と window グローバルの両方で読める', () => {
  assert.equal(typeof G.build, 'function');
  assert.equal(typeof G.groupKey, 'function');
  assert.equal(G.VERSION, 1);

  const source = fs.readFileSync(path.join(APP, 'reaction-groups.js'), 'utf8');
  // ブラウザ同様、window がグローバル自身である sandbox で評価する。
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.RPReactionGroups.build, 'function');

  const browser = sandbox.window.RPReactionGroups;
  const built = browser.build([
    { id: 'a', substrates: ['x'], products: ['y'], typeLabel: '酸化' }
  ]);
  assert.equal(built.groupCount, 1);
  const nodeBuilt = G.build([
    { id: 'a', substrates: ['x'], products: ['y'], typeLabel: '酸化' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(built)), JSON.parse(JSON.stringify(nodeBuilt)));
});

test('[normal] 162 反応 → 156 グループ、統合は 5 グループ / 11 反応だけ', () => {
  const built = G.build(D.reactions);
  assert.equal(built.reactionCount, 162);
  assert.equal(built.groupCount, 156);
  assert.equal(built.collapsedCount, 6);
  assert.equal(built.groups.length, 156);
  assert.equal(built.representatives.length, 156);
  assert.equal(new Set(built.representatives).size, 156);

  const multi = realMultiGroups(built);
  assert.equal(multi.length, 5);
  assert.deepEqual(new Set(multi.flatMap((g) => g.memberIds)), new Set(EXPECTED.flatMap((e) => e.memberIds)));
  assert.equal(new Set(multi.flatMap((g) => g.memberIds)).size, 11);

  const found = expectedByRepresentative(built);
  for (const expected of EXPECTED) {
    const group = found.get(expected.representativeId);
    assert.ok(group, '代表グループがない: ' + expected.representativeId);
    assert.deepEqual(group.memberIds, expected.memberIds);
    assert.deepEqual(group.substrateIds, expected.substrateIds);
    assert.deepEqual(group.productIds, expected.productIds);
    assert.equal(group.key, JSON.stringify([expected.substrateIds, expected.productIds]));
    group.members.forEach((member) => assert.equal(built.byReactionId[member.id], group.id));
  }
});

test('[normal] 代表は canonical 順でラベルを持つ最初の反応（無ければ先頭）', () => {
  const built = G.build(D.reactions);
  const found = expectedByRepresentative(built);

  // ラベルあり: 3 件のうち canonical で先頭の ethanol-oxidation-ethanal。
  assert.equal(found.get('ethanol-oxidation-ethanal').members[0].label != null, true);
  // ラベルなし: 2 件とも label が null なので先頭の ethanol-oxidation-acetic。
  const acetic = found.get('ethanol-oxidation-acetic');
  assert.ok(acetic.members.every((m) => !m.label));

  // 明示 canonicalOrder を逆にしても、同じ集合の代表は「その順でラベル有の最初」になる。
  const reversed = D.reactions.slice().reverse().map((r) => r.id);
  const rebuilt = G.build(D.reactions, reversed);
  assert.equal(rebuilt.groupCount, 156);
  assert.equal(
    rebuilt.groupById[rebuilt.byReactionId['ethanol-oxidation-ethanal']].representativeId,
    'ethanol-dichromate-oxidation-ethanal'
  );
  // ラベルが無いグループは逆順で先頭が変わる（＝label 優先が効いている）。
  assert.equal(
    rebuilt.groupById[rebuilt.byReactionId['ethanol-oxidation-acetic']].representativeId,
    'ethanol-dichromate-oxidation-acetic-acid'
  );
});

test('[academic] 314 反応 → 308 グループ、通常の 5 グループの代表は変わらない', () => {
  const normal = G.build(D.reactions);
  const academic = G.build(COMBINED);
  const withExplicitOrder = G.build(COMBINED, COMBINED_ORDER);

  assert.equal(academic.reactionCount, 314);
  assert.equal(academic.groupCount, 308);
  assert.equal(academic.collapsedCount, 6);
  assert.deepEqual(academic.representatives, withExplicitOrder.representatives);

  const normalFound = expectedByRepresentative(normal);
  const academicFound = expectedByRepresentative(academic);
  assert.equal(academicFound.size, 5);
  for (const expected of EXPECTED) {
    const a = academicFound.get(expected.representativeId);
    const n = normalFound.get(expected.representativeId);
    assert.ok(a && n, '代表が変わった: ' + expected.representativeId);
    assert.equal(a.representativeId, n.representativeId);
    assert.equal(a.id, n.id, 'グループ ID もモードで変わらない');
    assert.deepEqual(a.memberIds, expected.memberIds);
  }
});

test('[key] 向きが固定で、逆向きは別グループになる', () => {
  const forward = { id: 'fwd', substrates: ['ethanol'], products: ['ethanal'] };
  const reverse = { id: 'rev', substrates: ['ethanal'], products: ['ethanol'] };
  assert.notEqual(G.groupKey(forward), G.groupKey(reverse));

  const built = G.build([forward, reverse]);
  assert.equal(built.groupCount, 2);
  assert.equal(built.collapsedCount, 0);
  assert.notEqual(built.byReactionId.fwd, built.byReactionId.rev);
});

test('[key] 多入力・多出力は順序/重複を無視し、集合の完全一致だけでまとめる', () => {
  const a = {
    id: 'multi-a',
    substrates: ['b', 'a', 'a'],
    products: ['d', 'c'],
    typeLabel: '酸化'
  };
  const b = {
    id: 'multi-b',
    substrates: ['a', 'b'],
    products: ['c', 'd'],
    typeLabel: '酸化'
  };
  assert.equal(G.groupKey(a), G.groupKey(b));
  assert.equal(G.groupKey(a), JSON.stringify([['a', 'b'], ['c', 'd']]));

  const partialSubstrate = { id: 'part-s', substrates: ['a'], products: ['c', 'd'] };
  const partialProduct = { id: 'part-p', substrates: ['a', 'b'], products: ['c'] };
  const built = G.build([a, b, partialSubstrate, partialProduct]);
  assert.equal(built.groupCount, 3);
  const main = G.getGroup(built, 'multi-a');
  assert.deepEqual(main.memberIds, ['multi-a', 'multi-b']);
  assert.notEqual(built.byReactionId['multi-a'], built.byReactionId['part-s']);
  assert.notEqual(built.byReactionId['multi-a'], built.byReactionId['part-p']);
});

test('[key] 基質か生成物が空の反応はグループ化せず、それぞれ単独', () => {
  const emptySubstrate1 = { id: 'empty-s1', substrates: [], products: ['x'] };
  const emptySubstrate2 = { id: 'empty-s2', substrates: [], products: ['x'] };
  const emptyProduct = { id: 'empty-p', substrates: ['x'], products: [] };
  const missing = { id: 'missing', typeLabel: '分解' };

  for (const r of [emptySubstrate1, emptySubstrate2, emptyProduct, missing]) {
    assert.equal(G.groupKey(r), null);
  }

  const built = G.build([emptySubstrate1, emptySubstrate2, emptyProduct, missing]);
  assert.equal(built.groupCount, 4);
  for (const r of [emptySubstrate1, emptySubstrate2, emptyProduct, missing]) {
    const group = G.getGroup(built, r.id);
    assert.equal(group.size, 1);
    assert.equal(group.representativeId, r.id);
    assert.equal(group.key, null);
    assert.equal(G.displayId(built, r.id), r.id);
  }
});

test('[facts] 条件・試薬・係数・type/tier/出典・座標が違っても同じグループで、値は保持される', () => {
  const reactionA = {
    id: 'facts-a',
    substrates: ['ethanol'],
    products: ['ethanal'],
    type: 'oxidation',
    tier: 'primary',
    typeLabel: '酸化',
    conditions: '条件A',
    reagents: ['r1'],
    sources: ['source-a'],
    equation: { left: [{ id: 'ethanol', coef: '1' }], right: [{ id: 'ethanal', coef: '1' }] },
    label: { side: 'W', box: { x: 1, y: 2, w: 3, h: 4 } }
  };
  const reactionB = {
    id: 'facts-b',
    substrates: ['ethanol'],
    products: ['ethanal'],
    type: 'oxidation',
    tier: 'secondary',
    typeLabel: '酸化',
    conditions: '条件B',
    reagents: ['r2', 'r3'],
    sources: ['source-b'],
    equation: { left: [{ id: 'ethanol', coef: '2' }], right: [{ id: 'ethanal', coef: '2' }] },
    label: null
  };

  assert.equal(G.groupKey(reactionA), G.groupKey(reactionB));
  const built = G.build([reactionA, reactionB]);
  assert.equal(built.groupCount, 1);
  const group = G.getGroup(built, 'facts-a');
  assert.deepEqual(group.memberIds, ['facts-a', 'facts-b']);
  assert.deepEqual(group.types, ['oxidation']);
  assert.deepEqual(group.tiers, ['primary', 'secondary']);

  // member は元オブジェクトのままで、条件・係数・出典が書き換わらない。
  assert.equal(group.members[0], reactionA);
  assert.equal(group.members[1], reactionB);
  assert.equal(group.members[1].conditions, '条件B');
  assert.equal(group.members[1].equation.left[0].coef, '2');
  assert.deepEqual(group.members[1].sources, ['source-b']);

  // 座標だけを変えてもキー・グループは変わらない。
  const moved = Object.assign({}, reactionA, {
    id: 'facts-c',
    label: { side: 'E', box: { x: 900, y: 800, w: 30, h: 12 } }
  });
  assert.equal(G.groupKey(moved), G.groupKey(reactionA));
  assert.equal(G.build([reactionA, moved]).groupCount, 1);
});

test('[typeLabel] 全 member 同一ならその名前、異なる場合は「反応 N件」', () => {
  const same = G.build([
    { id: 't1', substrates: ['a'], products: ['b'], typeLabel: '酸化' },
    { id: 't2', substrates: ['a'], products: ['b'], typeLabel: '酸化' }
  ]);
  assert.equal(same.groups[0].typeLabel, '酸化');

  const mixed = G.build([
    { id: 't3', substrates: ['a'], products: ['b'], typeLabel: '酸化' },
    { id: 't4', substrates: ['a'], products: ['b'], typeLabel: '中和' }
  ]);
  assert.equal(mixed.groups[0].typeLabel, '反応 2件');

  const missing = G.build([
    { id: 't5', substrates: ['a'], products: ['b'], typeLabel: '酸化' },
    { id: 't6', substrates: ['a'], products: ['b'] }
  ]);
  assert.equal(missing.groups[0].typeLabel, '反応 2件');

  assert.equal(same.groups[0].typeLabel, G.getGroup(same, 't2').typeLabel);
});

test('[display] 単独グループは元 ID、統合グループは代表 ID、未知 ID は null', () => {
  const built = G.build(D.reactions);
  const singleId = D.reactions.find((r) => G.getGroup(built, r.id).size === 1).id;
  assert.equal(G.displayId(built, singleId), singleId);
  assert.equal(G.getGroup(built, singleId).memberIds[0], singleId);

  for (const expected of EXPECTED) {
    for (const memberId of expected.memberIds) {
      assert.equal(G.displayId(built, memberId), expected.representativeId);
    }
  }
  assert.equal(G.displayId(built, 'no-such-reaction'), null);
  assert.equal(G.getGroup(built, 'no-such-reaction'), null);
});

test('[determinism] 同じ入力なら同じ出力、入力順が違っても canonicalOrder で一致する', () => {
  const first = G.build(D.reactions);
  const second = G.build(D.reactions);
  assert.deepEqual(first, second);

  const shuffled = D.reactions.slice().reverse();
  const byOrder = G.build(shuffled, NORMAL_IDS);
  assert.deepEqual(
    byOrder.groups.map((g) => [g.id, g.representativeId, g.memberIds]),
    first.groups.map((g) => [g.id, g.representativeId, g.memberIds])
  );
  assert.deepEqual(byOrder.representatives, first.representatives);
});

test('[immutable] 入力の反応配列・オブジェクトを変更しない', () => {
  const snapshot = JSON.stringify(D.reactions);
  const academicSnapshot = JSON.stringify(A.reactions);
  G.build(D.reactions);
  G.build(COMBINED, COMBINED_ORDER);
  assert.equal(JSON.stringify(D.reactions), snapshot);
  assert.equal(JSON.stringify(A.reactions), academicSnapshot);

  // 凍結した入力でも例外にならない（配列を破壊的にソートしていない）。
  const frozen = Object.freeze([
    Object.freeze({
      id: 'frozen-a',
      substrates: Object.freeze(['b', 'a']),
      products: Object.freeze(['d', 'c']),
      typeLabel: '酸化'
    }),
    Object.freeze({
      id: 'frozen-b',
      substrates: Object.freeze(['a', 'b']),
      products: Object.freeze(['c', 'd']),
      typeLabel: '酸化'
    })
  ]);
  const built = G.build(frozen);
  assert.equal(built.groupCount, 1);
  assert.deepEqual(built.groups[0].memberIds, ['frozen-a', 'frozen-b']);
  assert.deepEqual(built.groups[0].substrateIds, ['a', 'b']);
  assert.deepEqual(built.groups[0].productIds, ['c', 'd']);
});

test('[invalid] 配列でない入力・ID の欠落・ID 重複は fail-closed', () => {
  assert.throws(() => G.build(null), /配列でない/);
  assert.throws(() => G.build([{}]), /id のない反応/);
  assert.throws(
    () => G.build([
      { id: 'dup', substrates: ['a'], products: ['b'] },
      { id: 'dup', substrates: ['c'], products: ['d'] }
    ]),
    /重複/
  );
});
