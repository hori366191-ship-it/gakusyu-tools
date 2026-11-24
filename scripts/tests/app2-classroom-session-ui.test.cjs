/**
 * site/app2「教室の長期セッション（shared/classroom-session.js）連携」のオフライン回帰テスト
 * 実行: node --test scripts/tests/app2-classroom-session-ui.test.cjs
 *
 * 外部API・GAS・Drive・CDN・gateway にはアクセスしない（純関数を vm で評価するだけ）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const PAGE = path.join(SITE, 'app2', 'index.html');

function read(rel) {
  return fs.readFileSync(path.join(SITE, rel), 'utf8');
}

function extractBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('start marker not found: ' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(i + startMarker.length, j);
}

const EXPORTS = `
;globalThis.__cs = {
  csReadModule, csMapProbe, csResolveMode, csAccountKey,
  csNormalizeMutateResult, csIsSessionAuthError, csDeleteAllowedOnPage,
  csDeleteVerifyFresh, csTakeDeleteToken, csPendingActorHash, csFallbackActorHash,
  CS_DELETE_VERIFY_MAX_MS, CS_PUBLIC_APP2_URL
};`;

function loadBlock() {
  const src = fs.readFileSync(PAGE, 'utf8');
  const block = extractBetween(src, '// TESTABLE-CLASSROOM-SESSION-START', '// TESTABLE-CLASSROOM-SESSION-END');
  // WebCrypto / TextEncoder はコンテキストごとの組み込みではないため明示的に渡す
  const ctx = vm.createContext({
    TextEncoder: global.TextEncoder,
    crypto: (typeof global.crypto !== 'undefined' ? global.crypto : undefined)
  });
  vm.runInContext(block + EXPORTS, ctx);
  return { src, block, api: ctx.__cs };
}

const { src: PAGE_SRC, block: BLOCK, api } = loadBlock();

// ---- モジュール検出（無ければ従来挙動） ----
test('契約を満たすモジュールだけを採用し、無ければ従来挙動（null）', () => {
  assert.equal(api.csReadModule(undefined), null);
  assert.equal(api.csReadModule({}), null);
  assert.equal(api.csReadModule({ GakusyuClassroomSession: { probe() {} } }), null); // mutate 欠落
  assert.equal(api.csReadModule({ GakusyuClassroomSession: { mutate() {} } }), null); // probe 欠落
  const m = { probe() {}, mutate() {} };
  assert.equal(api.csReadModule({ GakusyuClassroomSession: m }), m);
});

// ---- 長期セッションの無効化はページ構成で決める（query では外せない） ----
test('長期セッションのオン/オフはページの構成だけで決まる', () => {
  // query 文字列を受け取る関数は持たない（?classroom=off による強制回避を作らない）
  assert.equal(typeof api.csDisabledByQuery, 'undefined');
  assert.ok(!/classroom=off/.test(PAGE_SRC));
});

// ---- probe の写像 ----
test('probe 応答を既存UIの state へ写す', () => {
  const ok = api.csMapProbe({ status: 'ok', isOwner: true, open: true, context: { h: 1 } });
  assert.equal(ok.state, 'ok');
  assert.equal(ok.session, true);
  assert.equal(ok.isOwner, true);
  assert.equal(ok.context.h, 1);

  const noauth = api.csMapProbe({ status: 'noauth', open: true });
  assert.equal(noauth.state, 'noauth');
  assert.equal(noauth.session, false);
  assert.equal(noauth.open, true);
  assert.equal(noauth.context, null);

  const notallowed = api.csMapProbe({ status: 'notallowed', open: false });
  assert.equal(notallowed.state, 'notallowed');
  assert.equal(notallowed.session, false);

  // 未知 status / 例外相当は unreachable（fail closed）
  assert.equal(api.csMapProbe({ status: 'weird', open: true }).state, 'unreachable');
  assert.equal(api.csMapProbe(null).state, 'unreachable');
  assert.equal(api.csMapProbe({ status: 'unreachable', open: true }).open, false);
});

// ---- 生成・対訳create の経路判定 ----
test('長期セッションありなら gateway のみ（session）', () => {
  const probe = api.csMapProbe({ status: 'ok', isOwner: false, open: true, context: { k: 1 } });
  assert.equal(api.csResolveMode(probe, true), 'session');
});

test('モジュールが無ければ従来（legacy）', () => {
  assert.equal(api.csResolveMode(null, false), 'legacy');
  assert.equal(api.csResolveMode({ state: 'unreachable' }, false), 'legacy');
});

test('匿名利用は probe が明示 noauth/notallowed かつ open のときだけ trial', () => {
  const noauthOpen = api.csMapProbe({ status: 'noauth', open: true });
  assert.equal(api.csResolveMode(noauthOpen, true), 'trial');
  const notallowedOpen = api.csMapProbe({ status: 'notallowed', open: true });
  assert.equal(api.csResolveMode(notallowedOpen, true), 'trial');
  const noauthClosed = api.csMapProbe({ status: 'noauth', open: false });
  assert.equal(api.csResolveMode(noauthClosed, true), 'denied');
});

test('transient error（unreachable）は fail closed（denied）', () => {
  assert.equal(api.csResolveMode(api.csMapProbe({ status: 'unreachable', open: true }), true), 'denied');
  assert.equal(api.csResolveMode(null, true), 'denied');
});

test('session なのに context が無い（壊れた応答）は denied（旧認証へ落とさない）', () => {
  assert.equal(api.csResolveMode({ state: 'ok', session: true, context: null }, true), 'denied');
  assert.equal(api.csResolveMode({ state: 'file' }, true), 'legacy');
});

// ---- mutate 結果の正規化 ----
test('mutate 応答は T.fetchJson 互換に正規化され unknown を保持する', () => {
  const ok = api.csNormalizeMutateResult({ ok: true, data: { ok: true, item: 1 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.item, 1);
  assert.equal(ok.data.ok, true);
  const unk = api.csNormalizeMutateResult({ ok: false, unknown: true, error: 'timeout' });
  assert.equal(unk.ok, false);
  assert.equal(unk.unknown, true);
  assert.equal(unk.error, 'timeout');
  const bad = api.csNormalizeMutateResult(null);
  assert.equal(bad.ok, false);
  assert.equal(bad.unknown, true);
  assert.equal(bad.error, 'invalid_mutate_result');
});

test('セッション起因の認証エラーだけ検出する', () => {
  assert.equal(api.csIsSessionAuthError({ ok: false, error: 'noauth' }), true);
  assert.equal(api.csIsSessionAuthError({ ok: false, error: 'x', data: { code: 'session_expired' } }), true);
  assert.equal(api.csIsSessionAuthError({ ok: false, error: 'quota' }), false);
  assert.equal(api.csIsSessionAuthError(null), false);
});

// ---- 削除の扱い ----
test('長期セッションのページでは削除しない（probe の一時状態に依存しない）', () => {
  assert.equal(api.csDeleteAllowedOnPage(true), false);
  assert.equal(api.csDeleteAllowedOnPage(false), true);
});

test('削除の本人確認はメモリ5分・同一人物のみ', () => {
  const now = 1_700_000_000_000;
  const rec = { token: 't', at: now, sub: 'sub-1' };
  assert.equal(api.csDeleteVerifyFresh(rec, now, 'sub-1'), true);
  assert.equal(api.csDeleteVerifyFresh(rec, now, 'sub-2'), false); // 別アカウント
  assert.equal(api.csDeleteVerifyFresh(rec, now, ''), true); // 現在のsub不明でも直近確認は使える
  assert.equal(api.csDeleteVerifyFresh(rec, now + api.CS_DELETE_VERIFY_MAX_MS, 'sub-1'), true);
  assert.equal(api.csDeleteVerifyFresh(rec, now + api.CS_DELETE_VERIFY_MAX_MS + 1, 'sub-1'), false);
  assert.equal(api.csDeleteVerifyFresh({ token: 't', at: now, sub: '' }, now, ''), false);
  assert.equal(api.csDeleteVerifyFresh({ token: '', at: now, sub: 'sub-1' }, now, 'sub-1'), false);
  assert.equal(api.csDeleteVerifyFresh(rec, now - 1, 'sub-1'), false); // 未来時刻は拒否
});

test('削除トークンは1回で使い捨てる', () => {
  const rec = { token: 'cred', at: 1, sub: 'sub-1' };
  assert.equal(api.csTakeDeleteToken(rec), 'cred');
  assert.equal(rec.token, '');
  assert.equal(rec.at, 0);
  assert.equal(rec.sub, '');
  assert.equal(api.csTakeDeleteToken(rec), '');
  assert.equal(api.csTakeDeleteToken(null), '');
});

test('actorKey は transport に委譲し、無ければ空文字（例外にしない）', () => {
  const T = { actorKey: (t, d) => 'user:' + (t ? 'x' : '') + d };
  assert.equal(api.csAccountKey(T, 'tok', 'dev'), 'user:xdev');
  assert.equal(api.csAccountKey(null, 'tok', 'dev'), '');
  assert.equal(api.csAccountKey({ actorKey() { throw new Error('boom'); } }, 't', 'd'), '');
});

// ---- ページ構造の不変条件 ----
test('classroom-session.js は transport の後に読み込み、無くても従来挙動', () => {
  const iTransport = PAGE_SRC.indexOf('../shared/transport.js');
  const iSession = PAGE_SRC.indexOf('../shared/classroom-session.js');
  assert.ok(iTransport > 0, 'transport.js が無い');
  assert.ok(iSession > iTransport, 'classroom-session.js は transport の後');
});

test('削除は長期ゲートウェイ（mutate）を使わない', () => {
  const i = PAGE_SRC.indexOf("if (name === 'deleteText')");
  const j = PAGE_SRC.indexOf("if (name === 'translateText')", i);
  assert.ok(i > 0 && j > i, 'deleteText 分岐が見つからない');
  const branch = PAGE_SRC.slice(i, j);
  assert.ok(!/csMutateSession/.test(branch), 'deleteText から gateway を呼んではいけない');
  assert.ok(/csTakeDeleteToken/.test(branch), 'deleteText は使い捨て本人確認トークンを使う');
  assert.ok(/csDeleteAllowedOnPage\(csState\.enabled\)/.test(branch), '長期ページでは削除を拒否する');
});

test('セッション資格情報（context）を永続保存しない', () => {
  // context を storage へ書くコードが無いこと（csState.context はメモリのみ）
  assert.ok(!/localStorage[^\n]*context/i.test(PAGE_SRC));
  assert.ok(!/sessionStorage[^\n]*context/i.test(PAGE_SRC));
  assert.ok(!/JSON\.stringify\([^\n]*csState\.context/.test(PAGE_SRC));
  assert.ok(/const csState = \{ enabled: false, module: null, probe: null, context: null/.test(PAGE_SRC) ||
    /csState = \{[^}]*context: null/.test(PAGE_SRC));
});

test('保留 operation の actor は context 由来の一方向ハッシュ（context を保存しない）', async () => {
  // WebCrypto 相当（node:crypto の digest を模す）
  const nodeCrypto = require('node:crypto');
  const subtle = {
    digest: async (alg, bytes) => nodeCrypto.createHash('sha256').update(Buffer.from(bytes)).digest()
  };
  // TextEncoder はブロック評価時のスコープに無いため、フォールバック側で決定的に評価する
  const fakeEncoder = true;
  global.TextEncoder = global.TextEncoder || class { encode(s) { return Buffer.from(s, 'utf8'); } };

  const a1 = await api.csPendingActorHash('ctx-A', subtle);
  const a2 = await api.csPendingActorHash('ctx-A', subtle);
  const b = await api.csPendingActorHash('ctx-B', subtle);
  assert.match(a1, /^s256:[0-9a-f]{64}$/, 'SHA-256 の hex');
  assert.equal(a1, a2, '同じ context では stable');
  assert.notEqual(a1, b, 'context が変われば変わる');
  assert.ok(!a1.includes('ctx-A'), 'context の平文を残さない');
  assert.equal(a1.startsWith('s256:'), true);

  // 空 context は actor を作らない（anon device での代替をさせない）
  assert.equal(await api.csPendingActorHash('', subtle), '');

  // 非暗号フォールバックも決定的で、平文を含まない
  const f1 = api.csFallbackActorHash('pending-actor\u0000ctx-A');
  const f2 = api.csFallbackActorHash('pending-actor\u0000ctx-A');
  const f3 = api.csFallbackActorHash('pending-actor\u0000ctx-B');
  assert.equal(f1, f2);
  assert.notEqual(f1, f3);
  assert.match(f1, /^fnv:[0-9a-f]{16}$/);
  assert.ok(!f1.includes('ctx-A'));
  void fakeEncoder;

  // WebCrypto が使えない環境でも空にはしない（fallback）
  const fb = await api.csPendingActorHash('ctx-A', null);
  assert.match(fb, /^fnv:/);
});

test('generate は長期セッションの actor を context ハッシュで決め、receipt は消さない', () => {
  assert.match(PAGE_SRC, /const actorHash = await currentPendingActorHash\(\)/);
  assert.match(PAGE_SRC, /async function currentPendingActorHash\(\)/);
  assert.match(PAGE_SRC, /if \(csState\.enabled && csState\.mode === 'session' && csState\.pendingActor\) return csState\.pendingActor/);
  // アカウント切替で pending の receipt を消して新規生成させない
  const start = PAGE_SRC.indexOf('function csOnAccountChange()');
  const end = PAGE_SRC.indexOf('async function currentPendingActorHash()');
  const block = PAGE_SRC.slice(start, end);
  assert.ok(!/pendingGenerate\s*=/.test(block));
  assert.ok(!/delete pendingDeletes/.test(block));
  assert.ok(!/delete pendingTranslate/.test(block));
});

test('対訳の保留 receipt は actor 付きで保持し、別 actor では確認を挟む', () => {
  assert.match(PAGE_SRC, /pendingTranslate\[recordId\] = \{ id: created, actor: String\(actor \|\| ''\) \}/);
  assert.match(PAGE_SRC, /function peekTranslateRequestId\(recordId\)/);
  const start = PAGE_SRC.indexOf('const pendingTx = peekTranslateRequestId(rec.id);');
  const tail = PAGE_SRC.slice(start, start + 900);
  assert.match(tail, /pendingTx\.actor !== txActor/);
  assert.match(tail, /window\.confirm\(/);
});

test('長期ページのログイン導線は loginForm のみ（GIS を使わない）', () => {
  const start = PAGE_SRC.indexOf('function showAuthHelp(kind) {');
  const end = PAGE_SRC.indexOf('function renderClassroomLogin()');
  assert.ok(start > 0 && end > start, 'showAuthHelp が見つからない');
  const branch = PAGE_SRC.slice(start, end);
  assert.match(branch, /if \(csState\.enabled\) \{[\s\S]*?renderClassroomLogin\(\)[\s\S]*?return;/, '長期分岐は loginForm を出して抜ける');
  const init = PAGE_SRC.slice(PAGE_SRC.indexOf('function initGisApp2()'), PAGE_SRC.indexOf('function renderGisButtonWhenReady'));
  assert.match(init, /if \(csState\.enabled\) return;/, '長期ページでは GIS を初期化しない');
  assert.ok(PAGE_SRC.includes("m.loginForm('/app2/', '教室用ログイン')"));
});

test('長期モードの削除は公式ページ（通常のGoogleログイン）へ案内する', () => {
  assert.match(api.CS_PUBLIC_APP2_URL, /^https:\/\/hori366191-ship-it\.github\.io\/gakusyu-tools\/app2\/$/);
  assert.ok(PAGE_SRC.includes('id="delete-guidance"'));
  assert.ok(PAGE_SRC.includes('id="delete-guidance-link"'));
  assert.ok(PAGE_SRC.includes('id="delete-verify"'));
});

test('生成と対訳createだけが gateway を通る', () => {
  const iGen = PAGE_SRC.indexOf("if (name === 'generateText')");
  const iTr = PAGE_SRC.indexOf("if (name === 'translateText')");
  assert.ok(iGen > 0 && iTr > iGen);
  assert.ok(/csMutateSession\('generate'/.test(PAGE_SRC.slice(iGen, iTr)));
  const tail = PAGE_SRC.slice(iTr, PAGE_SRC.indexOf("if (name === 'getSavedTexts')", iTr));
  assert.ok(/csMutateSession\('translate'/.test(tail));
  // get（閲覧）は従来の read 経路のまま
  assert.ok(/mode === 'create'/.test(tail));
  assert.ok(!/csMutateSession[^\n]*'get'/.test(tail));
});

test('抽出ブロックは ES5 相当の構文で評価できる（vmで実行済み）', () => {
  assert.ok(BLOCK.length > 0);
  assert.ok(BLOCK.includes('CS_DELETE_VERIFY_MAX_MS'));
});
