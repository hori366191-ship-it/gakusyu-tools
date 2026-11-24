/**
 * site/shared/classroom-session.js と site/index.html の教室セッション UI のオフライン回帰テスト。
 * 実行: node --test scripts/tests/classroom-client.test.cjs
 *
 * 外部API・Worker・D1・GASへは接続しない（fake fetch / fake DOM のみ）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'site', 'shared', 'classroom-session.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
const mod = require(path.join(ROOT, 'site', 'shared', 'classroom-session.js'));

const MARKER_SELECTOR = 'meta[name="gakusyu-classroom-session"][content="1"]';

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

/** fetch 呼び出しを記録する fake。responder(url, init, index) で応答を返す。 */
function fakeFetch(responder) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return Promise.resolve(responder(url, init, calls.length - 1));
  };
  return { fetch, calls };
}

function api(responder) {
  const fake = fakeFetch(responder);
  const win = {
    document: { querySelector: () => null },
    fetch: fake.fetch,
    AbortController,
    crypto: globalThis.crypto,
  };
  return { api: mod.createApi(win), calls: fake.calls };
}

const CONTEXT = 'ctx-verified-123';

test('marker: マーカーが無い公開Pagesではグローバルを公開しない', () => {
  const ctx = vm.createContext({
    Uint8Array,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    crypto: globalThis.crypto,
  });
  vm.runInContext('this.window = this;', ctx);
  vm.runInContext('this.document = { querySelector: function () { return null; } };', ctx);
  vm.runInContext(SRC, ctx);
  assert.equal(typeof ctx.window.GakusyuClassroomSession, 'undefined');
});

test('marker: content="1" の meta がある時だけ window.GakusyuClassroomSession を公開する', () => {
  const queried = [];
  const ctx = vm.createContext({
    Uint8Array,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    crypto: globalThis.crypto,
    __q: (s) => queried.push(s),
  });
  vm.runInContext('this.window = this;', ctx);
  vm.runInContext('this.document = { querySelector: function (s) { __q(s); return {}; } };', ctx);
  vm.runInContext(SRC, ctx);
  assert.deepEqual(queried, [MARKER_SELECTOR]);
  assert.equal(typeof ctx.window.GakusyuClassroomSession.probe, 'function');
  assert.equal(typeof ctx.window.GakusyuClassroomSession.mutate, 'function');
  assert.equal(typeof ctx.window.GakusyuClassroomSession.loginForm, 'function');
  assert.equal(typeof ctx.window.GakusyuClassroomSession.logoutForm, 'function');
});

test('probe: 同一オリジンへ target だけを 1 回 POST する', async () => {
  const { api: C, calls } = api(() => jsonResponse(200, { status: 'ok', isOwner: true, open: true, context: CONTEXT }));
  const res = await C.probe('app2');
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.url, '/_classroom/probe');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.credentials, 'same-origin');
  assert.equal(call.init.cache, 'no-store');
  assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.headers['content-type'], 'application/json');
  assert.deepEqual(call.body, { target: 'app2' });
  assert.deepEqual(
    { status: res.status, isOwner: res.isOwner, open: res.open, context: res.context },
    { status: 'ok', isOwner: true, open: true, context: CONTEXT },
  );
  // context はメモリのみ（storage / URL に出さない）
  assert.equal(C.context(), CONTEXT);
});

test('probe: status は ok/noauth/notallowed/unreachable に正規化する（pdfdrop は open を立てない）', async () => {
  for (const status of ['ok', 'noauth', 'notallowed', 'unreachable']) {
    const { api: C } = api(() => jsonResponse(200, { status, isOwner: false, open: status === 'ok', context: null }));
    const res = await C.probe('pdfdrop');
    assert.equal(res.status, status);
    assert.equal(res.open, false, 'pdfdrop の open は表示に使わない');
  }
  const { api: C2 } = api(() => jsonResponse(200, { status: 'weird', isOwner: true, open: true }));
  const odd = await C2.probe('app2');
  assert.equal(odd.status, 'unreachable');
  assert.equal(odd.isOwner, false);
});

test('probe: 502 / network / JSON 以外は unreachable（再送しない）', async () => {
  const cases = [
    () => jsonResponse(502, { error: 'bad_gateway' }),
    () => jsonResponse(200, 'not-json'),
  ];
  for (const responder of cases) {
    const { api: C, calls } = api(responder);
    const res = await C.probe('app2');
    assert.equal(res.status, 'unreachable');
    assert.equal(res.context, null);
    assert.equal(calls.length, 1);
    assert.equal(res.unknown, true);
  }
  const broken = mod.createApi({ document: null, fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  const res = await broken.probe('app2');
  assert.equal(res.status, 'unreachable');
});

test('probe: 未知の target は通信せず unreachable', async () => {
  const { api: C, calls } = api(() => jsonResponse(200, { status: 'ok' }));
  const res = await C.probe('unknown');
  assert.equal(res.status, 'unreachable');
  assert.equal(calls.length, 0);
});

test('probe: app2 の open は ok/noauth/notallowed の明示応答だけ引き継ぐ（匿名試行モード）', async () => {
  for (const status of ['ok', 'noauth', 'notallowed']) {
    const { api: C } = api(() => jsonResponse(200, { status, isOwner: false, open: true, context: null }));
    const res = await C.probe('app2');
    assert.equal(res.status, status);
    assert.equal(res.open, true, `${status} で GAS の open を保持する`);
  }
  // 明示応答でも open が true でなければ false（引き継がない）
  const { api: closed } = api(() => jsonResponse(200, { status: 'noauth', isOwner: false, open: false, context: null }));
  assert.equal((await closed.probe('app2')).open, false);
  const { api: missing } = api(() => jsonResponse(200, { status: 'notallowed', isOwner: false }));
  assert.equal((await missing.probe('app2')).open, false);
});

test('probe: unreachable・不正 body・その他 status・pdfdrop では open を保持しない', async () => {
  // unreachable 明示
  const { api: down } = api(() => jsonResponse(200, { status: 'unreachable', isOwner: false, open: true, context: null }));
  assert.equal((await down.probe('app2')).open, false, 'unreachable は保持しない');
  // HTTP 失敗 / JSON 以外 / 未知 status
  const cases = [
    () => jsonResponse(502, { status: 'ok', open: true }),
    () => jsonResponse(200, 'not-json'),
    () => jsonResponse(200, { status: 'weird', open: true }),
  ];
  for (const responder of cases) {
    const { api: C } = api(responder);
    assert.equal((await C.probe('app2')).open, false);
  }
  // pdfdrop は ok でも open を保持しない（Portal 表示は open に依存しない）
  const { api: pdf } = api(() => jsonResponse(200, { status: 'ok', isOwner: false, open: true, context: null }));
  assert.equal((await pdf.probe('pdfdrop')).open, false);
});

test('mutate: context 未確定は送信前の既知失敗（unknown:false / predispatch）', async () => {
  const { api: C, calls } = api(() => jsonResponse(200, { ok: true }));
  const res = await C.mutate('print', { request_id: 'r'.repeat(20) });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'context_required');
  assert.equal(res.unknown, false);
  assert.equal(res.predispatch, true);
  assert.equal(calls.length, 0);
  // 未知の operation も同様に送信しない
  const bad = await C.mutate('delete', { request_id: 'r'.repeat(20) }, { context: CONTEXT });
  assert.equal(bad.error, 'unknown_operation');
  assert.equal(calls.length, 0);
});

test('mutate: probe の context を 1 回だけ使い、payload で上書きできない', async () => {
  const requestId = 'req_' + 'a'.repeat(20);
  const rid = 'rid_' + 'b'.repeat(20);
  const { api: C, calls } = api((url) => {
    if (url === '/_classroom/probe') return jsonResponse(200, { status: 'ok', isOwner: false, open: true, context: CONTEXT });
    return jsonResponse(200, { ok: true, rid, request_id: requestId, data: { saved: true } });
  });
  await C.probe('app2');
  const res = await C.mutate('generate', { request_id: requestId, rid, context: 'evil', prompt: 'hi' });

  assert.equal(calls.length, 2, 'probe 1回 + mutate 1回');
  const sent = calls[1];
  assert.equal(sent.url, '/_classroom/generate');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.credentials, 'same-origin');
  assert.equal(sent.init.redirect, 'error');
  assert.deepEqual(sent.body, {
    request_id: requestId,
    rid,
    context: CONTEXT,
    prompt: 'hi',
  });
  assert.equal(res.ok, true);
  assert.equal(res.unknown, false);
  assert.equal(res.data.data.saved, true, '応答 JSON を data として透過する');
});

test('mutate: op ごとの path（print / translate）と payload の透過', async () => {
  const { api: C, calls } = api(() => jsonResponse(200, { ok: true }));
  await C.mutate('print', { request_id: 'p'.repeat(20), rid: 'q'.repeat(20) }, { context: CONTEXT });
  await C.mutate('translate', { request_id: 't'.repeat(20), rid: 'u'.repeat(20) }, { context: CONTEXT });
  assert.deepEqual(calls.map((c) => c.url), ['/_classroom/print', '/_classroom/translate']);
});

test('mutate: rid / request_id が返らない・一致しない応答は unknown（適用不明）', async () => {
  const requestId = 'req_' + 'c'.repeat(20);
  const rid = 'rid_' + 'd'.repeat(20);
  const responders = [
    () => jsonResponse(200, { ok: true }), // id が無い
    () => jsonResponse(200, { ok: true, rid: 'other'.padEnd(20, 'x'), request_id: requestId }), // rid 不一致
    () => jsonResponse(200, { ok: true, rid, request_id: 'other'.padEnd(20, 'y') }), // request_id 不一致
  ];
  for (const responder of responders) {
    const { api: C, calls } = api(responder);
    const res = await C.mutate('print', { request_id: requestId, rid }, { context: CONTEXT });
    assert.equal(res.ok, false);
    assert.equal(res.unknown, true);
    assert.equal(calls.length, 1, '再送しない');
  }
});

test('mutate: 502 / timeout / network は unknown で 1 回だけ', async () => {
  const payload = { request_id: 'z'.repeat(20), rid: 'y'.repeat(20) };
  const cases = [
    () => jsonResponse(502, { error: 'bad_gateway' }),
    () => { throw new TypeError('Failed to fetch'); },
  ];
  for (const responder of cases) {
    const { api: C, calls } = api(responder);
    const res = await C.mutate('print', payload, { context: CONTEXT, timeoutMs: 500 });
    assert.equal(res.ok, false);
    assert.equal(res.unknown, true);
    assert.equal(calls.length, 1);
  }
  const hanging = fakeFetch(() => new Promise(() => {}));
  const C = mod.createApi({
    document: null,
    fetch: hanging.fetch,
    AbortController,
    crypto: globalThis.crypto,
  });
  const timedOut = await C.mutate('generate', payload, { context: CONTEXT, timeoutMs: 500 });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error, 'timeout');
  assert.equal(timedOut.unknown, true);
  assert.equal(hanging.calls.length, 1);
});

test('mutate: 4xx と検証済み ok:false は既知失敗（unknown:false）', async () => {
  const requestId = 'req_' + 'e'.repeat(20);
  const rid = 'rid_' + 'f'.repeat(20);
  const { api: C } = api(() => jsonResponse(403, { error: 'forbidden' }));
  const denied = await C.mutate('print', { request_id: requestId, rid }, { context: CONTEXT });
  assert.equal(denied.ok, false);
  assert.equal(denied.unknown, false);
  assert.equal(denied.status, 403);

  const { api: C2 } = api(() => jsonResponse(200, { ok: false, rid, request_id: requestId, error: 'print_failed' }));
  const failed = await C2.mutate('print', { request_id: requestId, rid }, { context: CONTEXT });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'print_failed');
  assert.equal(failed.unknown, false);
});

test('forms: login の return_to は許可パスだけ・logout は値を送らない', () => {
  const created = [];
  function createElement(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      className: '',
      textContent: '',
      type: '',
      children: [],
      attributes: {},
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
    };
    created.push(node);
    return node;
  }
  const C = mod.createApi({ document: { createElement, querySelector: () => null } });

  const login = C.loginForm('/app2/', '教室用ログイン');
  assert.equal(login.method, 'POST');
  assert.equal(login.action, '/_classroom/login');
  assert.equal(login.attributes['data-gakusyu-classroom-form'], 'login');
  assert.deepEqual(
    login.children.filter((n) => n.tagName === 'INPUT').map((n) => [n.name, n.value]),
    [['return_to', '/app2/']],
  );
  assert.equal(login.children[login.children.length - 1].textContent, '教室用ログイン');

  for (const allowed of ['/', '/app2/', '/app9/', '/app12/']) {
    const form = C.loginForm(allowed);
    const input = form.children.find((n) => n.tagName === 'INPUT');
    assert.equal(input.value, allowed);
  }
  for (const bad of ['https://evil.example/', '//evil.example/app2/', '/admin/', '/app2', '', null, undefined]) {
    const form = C.loginForm(bad);
    const input = form.children.find((n) => n.tagName === 'INPUT');
    assert.equal(input.value, '/', '許可外 return_to は / に落とす: ' + String(bad));
  }

  const logout = C.logoutForm('ログアウト');
  assert.equal(logout.method, 'POST');
  assert.equal(logout.action, '/_classroom/logout');
  assert.equal(logout.attributes['data-gakusyu-classroom-form'], 'logout');
  assert.equal(logout.children.filter((n) => n.tagName === 'INPUT').length, 0);
  assert.equal(logout.children[logout.children.length - 1].textContent, 'ログアウト');
});

test('source: セッション識別子を storage / Cookie / URL へ保存しない（非機密opt-inのみ許可）', () => {
  // コメントは仕様説明なので除外し、実行コードだけを見る
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const forbidden of ['sessionStorage', 'document.cookie', 'history.pushState', 'history.replaceState']) {
    assert.equal(code.indexOf(forbidden), -1, 'classroom-session.js が ' + forbidden + ' を使わない');
  }
  // localStorage は「保持する」非機密boolean（OPT_IN_KEY）だけ。credential/context/code は置かない。
  assert.equal(/localStorage\s*\.\s*setItem\(\s*['"]/.test(code), false, '直接キー文字列で保存しない');
  assert.equal(/localStorage[^\n]*(context|credential|code|id_token)/i.test(code), false);
  assert.equal(/location\.(href|search|hash)\s*=/.test(code), false);
});

test('index.html: marker 時だけ教室セッション UI を有効にし、app2/pdfdrop を別々に probe する', () => {
  assert.ok(INDEX.includes('./shared/classroom-session.js'), 'classroom-session.js を読み込む');
  const headEnd = INDEX.indexOf('</head>');
  const head = INDEX.slice(0, headEnd);
  assert.ok(head.includes('./shared/classroom-session.js'));
  assert.ok(head.indexOf('./shared/transport.js') < head.indexOf('./shared/classroom-session.js'), 'transport の後に読む');

  // GIS バナーはマーカー時に早期 return する（公開Pagesは従来どおり）
  assert.ok(
    INDEX.includes('if (window.GakusyuClassroomSession) return;'),
    'marker ページでは GIS/GAS probe バナーを使わない',
  );

  const start = INDEX.indexOf('/* ---- 教室セッション');
  assert.ok(start > 0, '教室セッション UI ブロックがある');
  const block = INDEX.slice(start, INDEX.indexOf('\n  </script>', start));
  assert.ok(block.includes("var C = window.GakusyuClassroomSession;"));
  assert.ok(block.includes('if (!C || !banner) return;'), 'C が無ければ何もしない');
  assert.ok(block.includes("C.probe(t)"), 'probe を呼ぶ');
  assert.ok(block.includes("TARGETS.map"), 'app2 / pdfdrop を並列に probe する');
  assert.ok(block.includes("'app2'") && block.includes("'pdfdrop'"));
  assert.ok(block.includes('C.loginForm(') && block.includes('C.logoutForm('), 'login / logout form を出す');
  assert.ok(block.includes('再確認'), '失敗・時限の案内として再確認を出す');
  assert.equal(/C\.mutate\(/.test(block), false, '表示だけで変更系は送らない（期限延長なし）');
  assert.equal(/localStorage|sessionStorage/.test(block), false, 'storage を使わない');
});

test('index.html: バナーは専用API基準・1回のポップアップで保持・オプトイン無しは status だけ', () => {
  assert.ok(INDEX.includes('window.GakusyuClassroomApi'), '専用APIを使う');
  assert.ok(INDEX.includes('CS.popupLogin()'), 'ログインボタンで popup を開始する');
  assert.ok(INDEX.includes('CS.status()'), '読み込み時は status を使う');
  assert.ok(INDEX.includes("CS.probe('app2')") && INDEX.includes("CS.probe('pdfdrop')"), '権限は probe で確認');
  assert.ok(INDEX.includes('isOwner === true'), '先生判定は probe の isOwner');
  // 二段階（GISログイン→保持）の導線・文言は撤去
  assert.equal(INDEX.includes('この端末でログインを保持'), false);
  assert.equal(INDEX.includes('保持を解除'), false);
  assert.equal(INDEX.includes('initGis('), false);
  assert.equal(INDEX.includes('waitForGis('), false);
  // オプトイン無しでも status 以外の通信をしない（probe は active の時だけ）
  const block = INDEX.slice(INDEX.indexOf('教室タブレットのバナー'), INDEX.indexOf('教室セッション（Worker'));
  assert.ok(block.indexOf('CS.hasOptIn && CS.hasOptIn()') < block.indexOf('checkActive(true)'));
  // 非機密の opt-in boolean 以外（context/code/credential）を保存しない
  assert.equal(/localStorage[^\n]*(context|code|credential|id_token)/i.test(INDEX), false);
  assert.ok(!/gakusyu-classroom-persist[^\n]*(context|code|credential)/i.test(INDEX));
});

test('index.html: 保持中のログアウトは合言葉入力・入力値を保存しない・未設定は無効化', () => {
  assert.ok(INDEX.includes("'合言葉'"), '合言葉ラベル');
  assert.ok(INDEX.includes("input.type = 'password'"), 'password入力');
  assert.ok(INDEX.includes("input.setAttribute('autocomplete', 'off')"));
  assert.ok(INDEX.includes("input.setAttribute('autocapitalize', 'off')"));
  assert.ok(INDEX.includes('input.spellcheck = false'));
  assert.ok(INDEX.includes('ログアウトする') && INDEX.includes('やめる'));
  assert.ok(INDEX.includes('CS.logout(value)'), '入力値をその場で渡す');
  assert.ok(INDEX.includes('入力値は保持しない'));
  assert.ok(INDEX.includes('passphraseRequired === false'), '未設定時はログアウト無効化');
  // 保持中の表示は「ログイン中」＋ログアウトだけ（古い二重導線なし）
  assert.ok(INDEX.includes("'教室タブレットとしてログイン中'"));
  assert.equal(INDEX.includes('appendPersistControl'), false);
  // 入力値を storage / URL へ保存しない
  assert.equal(/localStorage[^\n]*passphrase/i.test(INDEX), false);
  assert.equal(/sessionStorage[^\n]*passphrase/i.test(INDEX), false);
  assert.equal(/location\.[a-z]+\s*=[^\n]*passphrase/i.test(INDEX), false);
});

// ---- index.html の教室セッション UI を fake DOM で実行する ----

function miniDom() {
  const byId = new Map();
  function createElement(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      title: '',
      type: '',
      disabled: false,
      children: [],
      attributes: {},
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        return child;
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      addEventListener() {},
    };
    Object.defineProperty(node, 'firstChild', { get() { return this.children[0] || null; } });
    return node;
  }
  const banner = createElement('div');
  banner.id = 'auth-banner-inner';
  byId.set(banner.id, banner);
  return { banner, document: { createElement, getElementById: (id) => byId.get(id) || null } };
}

function texts(node, out = []) {
  if (!node) return out;
  if (node.textContent) out.push(node.textContent);
  if (node.title) out.push(node.title);
  for (const child of node.children || []) texts(child, out);
  return out;
}

async function runClassroomUi(probeResults) {
  const start = INDEX.indexOf('/* ---- 教室セッション');
  const block = INDEX.slice(start, INDEX.indexOf('\n  </script>', start));
  const dom = miniDom();
  const probed = [];
  function formNode(label, kind) {
    const node = dom.document.createElement('form');
    node.method = 'POST';
    node.textContent = label;
    node.attributes['data-gakusyu-classroom-form'] = kind;
    return node;
  }
  const C = {
    probe(target) {
      probed.push(target);
      const r = probeResults[target] || { status: 'unreachable', isOwner: false, open: false, context: null };
      return Promise.resolve(r);
    },
    loginForm: (returnTo, label) => formNode(label, 'login'),
    logoutForm: (label) => formNode(label, 'logout'),
  };
  const ctx = vm.createContext({ Promise, document: dom.document, console });
  vm.runInContext('this.window = this;', ctx);
  ctx.window.GakusyuClassroomSession = C;
  vm.runInContext(block, ctx);
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  return {
    banner: dom.banner,
    probed,
    state: dom.banner.attributes['data-auth-state'],
    texts: texts(dom.banner),
    forms: (function walk(node, out = []) {
      if (!node) return out;
      if (node.attributes && node.attributes['data-gakusyu-classroom-form']) out.push(node.attributes['data-gakusyu-classroom-form']);
      for (const child of node.children || []) walk(child, out);
      return out;
    })(dom.banner),
  };
}

test('UI: app2 だけ許可でも利用可能として表示し、owner を区別して logout を出す', async () => {
  const ui = await runClassroomUi({
    app2: { status: 'ok', isOwner: true, open: true, context: 'c'.repeat(64) },
    pdfdrop: { status: 'notallowed', isOwner: false, open: false, context: 'c'.repeat(64) },
  });
  assert.deepEqual(ui.probed.sort(), ['app2', 'pdfdrop']);
  assert.equal(ui.state, 'ok');
  const joined = ui.texts.join(' / ');
  assert.ok(joined.includes('先生アカウントでログイン中'), joined);
  assert.ok(joined.includes('英語長文'), joined);
  assert.ok(joined.includes('印刷は要確認'), joined);
  assert.deepEqual(ui.forms, ['logout']);
});

test('UI: 両方 unreachable は接続案内、notallowed は教室外の案内、未ログインは教室用ログイン', async () => {
  const down = await runClassroomUi({
    app2: { status: 'unreachable', isOwner: false, open: false, context: null },
    pdfdrop: { status: 'unreachable', isOwner: false, open: false, context: null },
  });
  assert.equal(down.state, 'unreachable');
  assert.ok(down.texts.join(' / ').includes('接続を確認できませんでした'));
  assert.deepEqual(down.forms, ['login']);
  assert.ok(down.texts.includes('再確認'));

  const denied = await runClassroomUi({
    app2: { status: 'notallowed', isOwner: false, open: false, context: null },
    pdfdrop: { status: 'noauth', isOwner: false, open: false, context: null },
  });
  assert.equal(denied.state, 'notallowed');
  assert.ok(denied.texts.join(' / ').includes('教室外のアカウントです'));
  assert.deepEqual(denied.forms, ['login']);

  const anon = await runClassroomUi({
    app2: { status: 'noauth', isOwner: false, open: false, context: null },
    pdfdrop: { status: 'noauth', isOwner: false, open: false, context: null },
  });
  assert.equal(anon.state, 'login');
  assert.deepEqual(anon.forms, ['login']);
});
