/**
 * app11-3d 画面モデル（データ・グループ・検索・層）の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-model.test.cjs
 *
 * 対象: site/app11/3d/scene-model.js
 *   - 427 物質と 156 / 308 グループを共有データから作る
 *   - 既存 reation-groups の統合・代表・逆向き別グループを保つ
 *   - 通常層は academic 専用グループを隠し、大学層は全部見せる
 *   - 全物質（未接続含む）を検索できる
 *   - academic-data.js の暫定 x/y を読まない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const S = require(path.join(ROOT, 'site', 'app11', '3d', 'scene-model.js'));

function model() {
  return S.createModel(D, A, G);
}

const MERGED = [
  ['methanol-oxidation-formaldehyde', ['methanol-oxidation-formaldehyde', 'methanol-cuo-oxidation'], ['methanol'], ['formaldehyde']],
  ['ethanol-oxidation-ethanal', ['ethanol-oxidation-ethanal', 'ethanol-cuo-oxidation', 'ethanol-dichromate-oxidation-ethanal'], ['ethanol'], ['ethanal']],
  ['ethanol-oxidation-acetic', ['ethanol-oxidation-acetic', 'ethanol-dichromate-oxidation-acetic-acid'], ['ethanol'], ['acetic-acid']],
  ['propan-2-ol-oxidation', ['propan-2-ol-oxidation', 'propan-2-ol-cuo-oxidation'], ['propan-2-ol'], ['acetone']],
  ['acetic-acid-neutralization', ['acetic-acid-neutralization', 'acetic-acid-sodium-carbonate'], ['acetic-acid'], ['sodium-acetate']]
];

test('[counts] 427 物質、通常 156 グループ、大学込み 308 グループ', () => {
  const m = model();
  assert.equal(m.compounds.length, 427);
  assert.equal(m.reactionCount, D.reactions.length + A.reactions.length);
  assert.equal(m.groupCount, 308);
  assert.equal(m.collapsedCount, 6);
  assert.equal(m.normalGroups.length, 156);
  assert.equal(m.academicGroups.length, 308);
  assert.equal(m.stats('normal').compounds, 427);
  assert.equal(m.stats('normal').groups, 156);
  assert.equal(m.stats('academic').groups, 308);
  assert.deepEqual(m.warnings, []);
  // data.js の connectedCount / academic の newlyConnectedCount と同じ数え方
  assert.equal(m.stats('normal').connected, 158);
  assert.equal(m.stats('academic').connected, 158 + A.meta.newlyConnectedCount);
});

test('[groups] 既存の重複統合 5 グループを同じ代表・member で保つ', () => {
  const m = model();
  for (const [representative, members, substrates, products] of MERGED) {
    const group = m.groups.find((item) => item.representativeId === representative && item.size > 1);
    assert.ok(group, representative);
    assert.deepEqual(group.memberIds, members);
    assert.deepEqual(group.substrateIds, substrates);
    assert.deepEqual(group.productIds, products);
    assert.equal(group.hasNormal, true);
    assert.equal(group.academicOnly, false);
  }
});

test('[facts] 条件・出典・型は member に残り、グループ化で捨てない', () => {
  const m = model();
  const group = m.groupById[m.compoundEdges['ethanol'].out[0].groupId];
  assert.ok(group);
  assert.ok(group.members.length >= 1);
  const withCondition = m.groups.find((item) => item.members.some((member) => member.conditions));
  assert.ok(withCondition);
  const member = withCondition.members.find((item) => item.conditions);
  assert.equal(typeof member.conditions, 'string');
  assert.ok(Array.isArray(member.sources));
  assert.equal(typeof member.equation === 'object' || member.equation === null, true);
});

test('[direction] 逆向きは別グループ・別エッジになる', () => {
  const reactions = [
    { id: 'a-to-b', substrates: ['a'], products: ['b'], typeLabel: '酸化', tier: 'primary' },
    { id: 'b-to-a', substrates: ['b'], products: ['a'], typeLabel: '還元', tier: 'primary' }
  ];
  const data = {
    compounds: [
      { id: 'a', name: 'A', label: 'A', tier: 'primary', region: 'x', regionIndex: 0 },
      { id: 'b', name: 'B', label: 'B', tier: 'primary', region: 'x', regionIndex: 0 }
    ],
    reactions
  };
  const m = S.createModel(data, { reactions: [] }, G);
  assert.equal(m.groupCount, 2);
  assert.equal(m.edges.length, 2);
  const forward = m.edges.find((edge) => edge.from === 'a' && edge.to === 'b');
  const reverse = m.edges.find((edge) => edge.from === 'b' && edge.to === 'a');
  assert.ok(forward);
  assert.ok(reverse);
  assert.notEqual(forward.groupId, reverse.groupId);
});

test('[layers] 通常層は academic 専用を隠し、大学層は通常＋大学を出す', () => {
  const m = model();
  const normal = m.groupsForLayer('normal');
  const academic = m.groupsForLayer('academic');
  assert.equal(normal.length, 156);
  assert.equal(academic.length, 308);
  assert.equal(normal.every((group) => group.hasNormal), true);
  assert.equal(academic.some((group) => group.academicOnly), true);
  const academicOnly = academic.find((group) => group.academicOnly);
  assert.ok(academicOnly);
  assert.equal(normal.some((group) => group.id === academicOnly.id), false);
  assert.equal(academic.some((group) => group.id === academicOnly.id), true);
  assert.ok(m.edgesForLayer('academic').length > m.edgesForLayer('normal').length);
});

test('[all-compounds] 全 427 物質を検索でき、未接続も索引にある', () => {
  const m = model();
  for (const compound of m.compounds) {
    const results = m.search(compound.id, 50);
    assert.ok(results.some((result) => result.id === compound.id), compound.id);
  }
  const normal = m.stats('normal');
  assert.equal(normal.connected + normal.unconnected, 427);
  assert.equal(normal.connected, 158);
  assert.equal(normal.unconnected, 269);
  assert.ok(normal.unconnected > 200);
  const isolated = m.compounds.find((compound) => !m.connectedIds('normal')[compound.id]);
  assert.ok(isolated);
  assert.ok(m.search(isolated.id, 5).some((result) => result.id === isolated.id));
});

test('[search] 名前・別名・示性式・部分一致の順位', () => {
  const m = model();
  assert.equal(m.search('エタノール', 5)[0].id, 'ethanol');
  assert.equal(m.search('C2H6O', 5)[0].id, 'ethanol');
  assert.equal(m.search('ethanol', 5)[0].id, 'ethanol');
  assert.equal(m.search('ベンゼン', 5)[0].id, 'benzene');
  const partial = m.search('エタン', 10);
  assert.ok(partial.some((result) => result.id === 'ethane'));
  assert.deepEqual(m.search('   ', 5), []);
  assert.deepEqual(m.search('存在しない物質XYZ', 5), []);
});

test('[academic-xy] academic-data.js の x/y を読まない（最終再生成に耐える）', () => {
  const m = model();
  const tampered = {
    reactions: A.reactions.map((reaction) => Object.assign({}, reaction, { x: -999999, y: 999999 }))
  };
  const m2 = S.createModel(D, tampered, G);
  assert.equal(m2.groupCount, m.groupCount);
  assert.deepEqual(m2.edges.map((edge) => [edge.id, edge.from, edge.to, edge.academicOnly]),
    m.edges.map((edge) => [edge.id, edge.from, edge.to, edge.academicOnly]));
  assert.deepEqual(m2.stats('academic'), m.stats('academic'));
});

test('[unknown] academic が未知の物質を参照しても落ちず、警告に残す', () => {
  const data = {
    compounds: [{ id: 'a', name: 'A', label: 'A', tier: 'primary', region: 'x', regionIndex: 0 }],
    reactions: []
  };
  const academic = {
    reactions: [{ id: 'bad', substrates: ['a'], products: ['missing'], tier: 'academic', academic: true, typeLabel: 'x' }]
  };
  const m = S.createModel(data, academic, G);
  assert.equal(m.groupCount, 1);
  assert.equal(m.edges.length, 0);
  assert.equal(m.warnings.length, 1);
  assert.deepEqual(m.warnings[0].ids, ['missing']);
});

test('[routes] 選択物質のグループと可視エッジが層に従う', () => {
  const m = model();
  const normalGroups = m.groupsForCompound('ethanol', 'normal');
  const academicGroups = m.groupsForCompound('ethanol', 'academic');
  assert.ok(normalGroups.length > 0);
  assert.ok(academicGroups.length >= normalGroups.length);
  assert.equal(normalGroups.every((group) => group.hasNormal), true);
  const normalEdges = m.visibleEdgesForCompound('ethanol', 'normal');
  assert.ok(normalEdges.length > 0);
  assert.equal(normalEdges.every((edge) => edge.from === 'ethanol' || edge.to === 'ethanol'), true);
});
