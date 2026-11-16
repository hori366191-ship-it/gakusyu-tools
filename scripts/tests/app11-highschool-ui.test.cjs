/**
 * app11 高校標準 162 反応の根拠表示（normal 新 76 / 旧 86 / academic 152）の UI テスト
 *
 * 実行: node --test scripts/tests/app11-highschool-ui.test.cjs
 *
 * 実ブラウザは使わず、site/app11/app.js の関数を fake データで評価して検査する。
 * - 旧 86（evidenceKind なし）は従来どおり「確認済」。
 * - 新 76（一般則の適用 / 資料が示す変換）は「収録済」とし、適用範囲・段階を表示する。
 * - academic の一般則 / 資料個別例は note と見出しを evidenceKind で区別する。
 * - 件数表示はデータから動的に作り、確認済み固定文言を出さない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');

const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

const STUBS = {
  esc: (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  typeFor: () => ({ label: '反応', summary: '', schematic: '' }),
  typeCommon: () => '',
  compoundName: (id) => id,
  compoundInline: (id) => id,
  regionSpan: () => '分野',
  reactionEquationFigure: () => ''
};

function makeHarness(D, reactions) {
  const byId = {};
  reactions.forEach((r) => { byId[r.id] = r; });
  const code = ['stateBadge', 'reactionEvidenceNote', 'reactionEducationLabel',
    'reactionStateBadge', 'normalReactionCounts', 'normalEvidenceBreakdown',
    'normalReactionCountLabel', 'reactionCard']
    .map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const factory = new Function(
    'D', 'findReaction',
    Object.keys(STUBS).join(', '),
    code + '\nreturn {' +
    ' stateBadge: stateBadge,' +
    ' reactionEvidenceNote: reactionEvidenceNote,' +
    ' reactionEducationLabel: reactionEducationLabel,' +
    ' reactionStateBadge: reactionStateBadge,' +
    ' normalReactionCounts: normalReactionCounts,' +
    ' normalEvidenceBreakdown: normalEvidenceBreakdown,' +
    ' normalReactionCountLabel: normalReactionCountLabel,' +
    ' reactionCard: reactionCard' +
    '};'
  );
  const api = factory.apply(null, [D, (id) => byId[id] || null].concat(
    Object.keys(STUBS).map((key) => STUBS[key])
  ));
  return api;
}

function reaction(overrides) {
  return Object.assign({
    id: 'r',
    type: 'addition',
    typeLabel: '付加',
    state: 'confirmed',
    tier: 'primary',
    substrates: ['a'],
    reagents: [],
    products: ['b'],
    productNote: '',
    conditions: '条件',
    note: '',
    sources: ['資料A'],
    academic: false
  }, overrides);
}

function normalDataset(counts) {
  const reactions = [];
  let n = 0;
  const push = (kind, level, extra) => {
    reactions.push(reaction(Object.assign({
      id: 'r' + (n++),
      evidenceKind: kind,
      educationLevel: level
    }, extra)));
  };
  for (let i = 0; i < (counts.confirmed || 0); i++) {
    reactions.push(reaction({ id: 'legacy' + i }));
  }
  for (let i = 0; i < (counts.general || 0); i++) push('general-rule-application', 'high-school-standard');
  for (let i = 0; i < (counts.illustrated || 0); i++) push('source-illustrated-transformation', 'high-school-standard');
  return { meta: {}, states: { confirmed: { label: '確認済' }, listed: { label: '収録済' } }, reactions };
}

test('[normal] 旧 86 は確認済、新 76 は収録済で適用範囲と段階を示す', () => {
  const D = normalDataset({ confirmed: 1, general: 1, illustrated: 1 });
  const legacy = D.reactions[0];
  const general = D.reactions[1];
  const illustrated = D.reactions[2];
  general.scope = '高校標準の範囲';
  general.stepKind = 'multi-step';
  general.steps = ['第一段階', '第二段階'];
  illustrated.scope = '資料の個別例の範囲';
  illustrated.educationLevel = 'high-school-extension';
  illustrated.stepKind = 'direct';
  const api = makeHarness(D, D.reactions);

  const legacyHtml = api.reactionCard(legacy.id);
  assert.match(legacyHtml, /rp-status--confirmed/, '旧 86 は確認済バッジ');
  assert.match(legacyHtml, /独立資料の本文で確認済み/);
  assert.doesNotMatch(legacyHtml, /収録済/, '旧 86 に収録済は出さない');
  assert.doesNotMatch(legacyHtml, /適用範囲/, 'metadata の無い旧 86 に適用範囲は出さない');
  assert.doesNotMatch(legacyHtml, /高校標準|高校発展/, '旧 86 に教育レベルは足さない');

  const generalHtml = api.reactionCard(general.id);
  assert.match(generalHtml, /class="rp-status">収録済</, '一般則は確認済にしない');
  assert.doesNotMatch(generalHtml, /rp-status--confirmed/);
  assert.match(generalHtml, /<h3>適用範囲<\/h3><p>高校標準の範囲<\/p>/);
  assert.match(generalHtml, /高校標準/, '標準は高校標準と表示');
  assert.match(generalHtml, /一般則を既存の物質に適用した経路/);
  assert.match(generalHtml, /段階（総括）/);
  assert.match(generalHtml, /第一段階/);
  assert.doesNotMatch(generalHtml, /大学レベル/, 'normal の一般則は大学レベルと表示しない');

  const illustratedHtml = api.reactionCard(illustrated.id);
  assert.match(illustratedHtml, /class="rp-status">収録済</);
  assert.match(illustratedHtml, /高校発展/, 'extension は高校発展と表示');
  assert.match(illustratedHtml, /資料が個別例として示す変換/);
  assert.match(illustratedHtml, /<h3>適用範囲<\/h3><p>資料の個別例の範囲<\/p>/);
});

test('[normal] 状態がデータ側で用意されればそのラベルを優先する', () => {
  const D = normalDataset({ confirmed: 0 });
  const r = reaction({ id: 'x', state: 'listed' });
  D.reactions = [r];
  const api = makeHarness(D, D.reactions);
  assert.match(api.reactionStateBadge(r), /収録済/, 'D.states の label を使う');
  assert.equal(api.reactionEducationLabel('high-school-standard'), '高校標準');
  assert.equal(api.reactionEducationLabel('high-school-extension'), '高校発展');
  assert.equal(api.reactionEducationLabel(undefined), '');

  // sourceworker が confirmed の label を収録済系へ変えた場合はそちらに同期する。
  const synced = normalDataset({ confirmed: 0, general: 1 });
  delete synced.states.listed;
  synced.states.confirmed.label = '収録（資料根拠）';
  const syncedApi = makeHarness(synced, synced.reactions);
  assert.match(syncedApi.reactionStateBadge(synced.reactions[0]), /収録（資料根拠）/);
});

test('[normal] 件数表示は内訳をデータから動的に作り、確認済み固定文言を出さない', () => {
  const D = normalDataset({ confirmed: 86, general: 39, illustrated: 37 });
  const api = makeHarness(D, D.reactions);
  assert.equal(api.normalReactionCountLabel(),
    '162 件（資料で確認 86 ＋ 資料が示す変換 37 ＋ 一般則の適用 39）');
  assert.equal(api.normalEvidenceBreakdown(), '資料で確認 86／資料が示す変換 37／一般則の適用 39');

  const legacyOnly = makeHarness(normalDataset({ confirmed: 86 }), normalDataset({ confirmed: 86 }).reactions);
  assert.equal(legacyOnly.normalReactionCountLabel(), '86 件（すべて独立資料で確認済み）');
  assert.equal(legacyOnly.normalEvidenceBreakdown(), '');
});

test('[academic] 一般則と資料個別例を note と適用範囲で区別し、固定の大学レベル注記を出さない', () => {
  const academicGeneral = reaction({
    id: 'ag', academic: true, state: 'academic',
    evidenceKind: 'general-rule-application', stepKind: 'multi-step',
    steps: ['段階A'], scope: '大学の一般則の範囲'
  });
  const academicIllustrated = reaction({
    id: 'ai', academic: true, state: 'academic',
    evidenceKind: 'source-illustrated-transformation', stepKind: 'direct',
    scope: '資料個別例の範囲'
  });
  const D = { meta: {}, states: { academic: { label: 'アカデミック' } }, reactions: [academicGeneral, academicIllustrated] };
  const api = makeHarness(D, D.reactions);

  const generalHtml = api.reactionCard('ag');
  assert.match(generalHtml, /rp-status--academic/);
  assert.match(generalHtml, /大学レベルの一般則を既存の物質に適用した経路/);
  assert.match(generalHtml, /<h3>適用範囲<\/h3><p>大学の一般則の範囲<\/p>/);
  assert.match(generalHtml, /段階（総括）/);
  assert.doesNotMatch(generalHtml, /根拠の種類/, '冗長な二重説明を出さない');

  const illustratedHtml = api.reactionCard('ai');
  assert.match(illustratedHtml, /資料が個別例として示す変換/);
  assert.doesNotMatch(illustratedHtml, /大学レベルの一般則を既存の物質に適用/,
    '資料個別例に大学レベル一般則の注記を付けない');
  assert.match(illustratedHtml, /<h3>適用範囲<\/h3><p>資料個別例の範囲<\/p>/);
});

test('[notice] footer と学術サマリは収録反応と動的件数を使う', () => {
  assert.doesNotMatch(APP_JS, /確認済み反応 ' \+\s*D\.meta\.confirmedReactionCount/);
  const buildNotice = extractFunctionSource(APP_JS, 'buildNotice');
  assert.match(buildNotice, /収録反応 '/);
  assert.match(buildNotice, /D\.meta\.reactionCount/);
  assert.match(buildNotice, /normalEvidenceBreakdown\(\)/, 'summary に内訳を注記する');

  const academicSummary = extractFunctionSource(APP_JS, 'academicSummaryText');
  assert.match(academicSummary, /収録反応 '/);
  assert.match(academicSummary, /D\.meta\.reactionCount/);
  assert.doesNotMatch(academicSummary, /確認済み反応/);
});

test('[about] 反応の説明は個別例と一般則の適用を区別する', () => {
  assert.match(INDEX_HTML, /個別例として資料本文で確認できたもの/);
  assert.match(INDEX_HTML, /一般則を既存の物質に適用した経路を区別/);
  assert.doesNotMatch(INDEX_HTML, /本文で確認できたものだけを「確認済」として表示/);
});
