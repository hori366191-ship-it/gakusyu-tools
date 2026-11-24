/**
 * 専用API（gakusyu-classroom-auth / 任意オプトイン）クライアントのオフライン回帰テスト。
 * 実行: node --test scripts/tests/classroom-api-client.test.cjs
 *
 * 外部API・GIS・Cloudflare へは接続しない（fake fetch / fake google / fake localStorage のみ）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'site', 'shared', 'classroom-session.js'), 'utf8');
const mod = require(path.join(ROOT, 'site', 'shared', 'classroom-session.js'));

const API_ORIGIN = 'https://gakusyu-classroom-auth.hori-shota.workers.dev';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body))
  };
}

function fakeFetch(responder) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return Promise.resolve(responder(url, init, calls.length - 1));
  };
  return { fetch, calls };
}

function harness({ responder, storage, google } = {}) {
  const fake = fakeFetch(responder || (() => jsonResponse(200, { ok: true, authenticated: true })));
  const events = [];
  const win = {
    document: { querySelector: () => null },
    fetch: fake.fetch,
    localStorage: storage || memoryStorage(),
    AbortController,
    crypto: globalThis.crypto,
    CustomEvent: class {
      constructor(name) { this.type = name; }
    },
    dispatchEvent: (ev) => { events.push(ev.type); return true; },
    GIS_CLIENT_ID: CLIENT_ID,
    google: google
  };
  return { api: mod.createRemoteApi(win), calls: fake.calls, win, events };
}

test('anonymous load: マーカーもopt-inも無ければ通信せず、公開APIオブジェクトだけを持つ', () => {
  const calls = [];
  const ctx = vm.createContext({
    Uint8Array, Promise, setTimeout, clearTimeout, AbortController,
    crypto: globalThis.crypto,
    CustomEvent: class { constructor(n) { this.type = n; } },
    __fetchCalls: calls
  });
  vm.runInContext('this.window = this;', ctx);
  vm.runInContext('this.localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} };', ctx);
  vm.runInContext('this.document = { querySelector: function(){ return null; } };', ctx);
  vm.runInContext('this.addEventListener = function(){}; this.dispatchEvent = function(){};', ctx);
  vm.runInContext('this.fetch = function(u, i){ __fetchCalls.push([u, i]); return Promise.resolve({ status: 200, text: function(){ return Promise.resolve(JSON.stringify({ok:true,authenticated:true})); } }); };', ctx);
  vm.runInContext(SRC, ctx);
  assert.equal(typeof ctx.window.GakusyuClassroomApi, 'object');
  assert.equal(typeof ctx.window.GakusyuClassroomSession, 'undefined');
  assert.equal(ctx.window.__GakusyuClassroomActive, undefined);
  assert.equal(calls.length, 0, '匿名は status も送らない');
});

test('opt-in load: readonly status を1回だけ読み、authenticatedなら有効クライアントを公開する', async () => {
  const { api, calls, win, events } = harness({
    storage: memoryStorage({ 'gakusyu-classroom-persist': '1' }),
    responder: () => jsonResponse(200, { ok: true, authenticated: true })
  });
  const st = await api.statusOnce();
  assert.equal(st.active, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API_ORIGIN + '/_classroom/status');
  assert.deepEqual(calls[0].body, {});
  assert.equal(win.__GakusyuClassroomActive, api);
  assert.ok(events.includes('gakusyu-classroom-session-active'));
});

test('probe: 固定originへ target だけをPOSTし、credentials/headers/redirectを守る', async () => {
  const { api, calls } = harness({
    responder: () => jsonResponse(200, { status: 'ok', isOwner: false, open: true, context: 'ctx-1' })
  });
  const res = await api.probe('app2');
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.url, API_ORIGIN + '/_classroom/probe');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.credentials, 'include');
  assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.headers['content-type'], 'application/json');
  assert.equal(call.init.headers['x-requested-with'], 'XmlHttpRequest');
  assert.deepEqual(call.body, { target: 'app2' });
  assert.equal(res.status, 'ok');
  assert.equal(res.context, 'ctx-1');
  assert.equal(api.context(), 'ctx-1');
});

test('mutate: request_id/rid を固定し、1操作1POST（再送しない）・4xxは既知失敗', async () => {
  const requestId = 'req_' + 'a'.repeat(20);
  const rid = 'rid_' + 'b'.repeat(20);
  const { api, calls } = harness({
    responder: () => jsonResponse(200, { ok: true, rid, request_id: requestId, name: 'x.pdf' })
  });
  const res = await api.mutate(
    'print',
    { request_id: requestId, rid, name: 'x.pdf' },
    { rid, context: 'ctx-explicit' }
  );
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API_ORIGIN + '/_classroom/print');
  assert.deepEqual(calls[0].body, {
    request_id: requestId,
    rid,
    name: 'x.pdf',
    context: 'ctx-explicit'
  });

  const denied = harness({ responder: () => jsonResponse(429, { error: 'rate_limited' }) });
  const d = await denied.api.mutate(
    'print',
    { request_id: 'r'.repeat(20), rid: 'q'.repeat(20) },
    { context: 'ctx-deny' }
  );
  assert.equal(d.ok, false);
  assert.equal(d.unknown, false);
  assert.equal(denied.calls.length, 1);

  const broken = harness({ responder: () => jsonResponse(502, { error: 'bad_gateway' }) });
  const b = await broken.api.mutate(
    'print',
    { request_id: 'r'.repeat(20), rid: 'q'.repeat(20) },
    { context: 'ctx-broken' }
  );
  assert.equal(b.unknown, true);
  assert.equal(broken.calls.length, 1, '結果不明でも再送しない');
});

test('mutate: context は opts → memory の順で必ず body に載り、payload で上書きできない', async () => {
  const requestId = 'req_' + 'a'.repeat(20);
  const rid = 'rid_' + 'b'.repeat(20);

  // opts.context を優先（probe 前でも送れる）
  const explicit = harness({
    responder: () => jsonResponse(200, { ok: true, rid, request_id: requestId })
  });
  const r1 = await explicit.api.mutate(
    'generate',
    { request_id: requestId, rid, context: 'eviltory' },
    { context: 'ctx-ok', rid }
  );
  assert.equal(r1.ok, true);
  assert.equal(explicit.calls.length, 1);
  assert.equal(explicit.calls[0].body.context, 'ctx-ok', 'payload の context で上書きされない');

  // probe が memoryContext に入れ、opts 無しでも body に載る
  const remembered = harness({
    responder: (url) => {
      if (url.indexOf('/probe') !== -1) {
        return jsonResponse(200, { status: 'ok', isOwner: false, open: true, context: 'ctx-memory' });
      }
      return jsonResponse(200, { ok: true, rid, request_id: requestId });
    }
  });
  await remembered.api.probe('app2');
  const r2 = await remembered.api.mutate('generate', { request_id: requestId, rid });
  assert.equal(r2.ok, true);
  assert.equal(remembered.calls.length, 2, 'probe 1回 + mutate 1回');
  assert.deepEqual(remembered.calls[1].body, { request_id: requestId, rid, context: 'ctx-memory' });
});

test('mutate: context が無ければ通信ゼロで predispatch(context_required)', async () => {
  const { api, calls } = harness({ responder: () => jsonResponse(200, { ok: true }) });
  const res = await api.mutate('print', { request_id: 'r'.repeat(20), rid: 'q'.repeat(20) });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'context_required');
  assert.equal(res.unknown, false);
  assert.equal(res.predispatch, true);
  assert.equal(calls.length, 0, 'context 無しは送信しない');
});

test('popupLogin: code だけを送り、status が authenticated のときだけ opt-in を保存する', async () => {
  const storage = memoryStorage();
  const { api, calls } = harness({
    storage,
    responder: (url) => {
      if (url.indexOf('/popup-exchange') !== -1) return jsonResponse(200, { ok: true, authenticated: true });
      return jsonResponse(200, { ok: true, authenticated: true });
    },
    google: {
      accounts: {
        oauth2: {
          initCodeClient(config) {
            // 契約: 公式 GIS の code client（popup / openid email / 追加スコープなし）
            assert.equal(config.client_id, CLIENT_ID);
            assert.equal(config.scope, 'openid email');
            assert.equal(config.ux_mode, 'popup');
            assert.equal(config.include_granted_scopes, false);
            return { requestCode() { config.callback({ code: 'auth-code-1' }); } };
          }
        }
      }
    }
  });
  const res = await api.popupLogin();
  assert.deepEqual(res, { ok: true, active: true });
  const exchange = calls.find((c) => c.url.indexOf('/popup-exchange') !== -1);
  assert.ok(exchange);
  assert.deepEqual(Object.keys(exchange.body), ['code'], 'code 以外の credential を送らない');
  assert.equal(exchange.body.code, 'auth-code-1');
  assert.equal(storage.getItem('gakusyu-classroom-persist'), '1');
});

test('popupLogin: authenticated=false なら opt-in を保存せず、従来ログインへ戻れる', async () => {
  const storage = memoryStorage();
  const { api } = harness({
    storage,
    responder: (url) => {
      if (url.indexOf('/popup-exchange') !== -1) return jsonResponse(200, { ok: true, authenticated: true });
      return jsonResponse(200, { ok: true, authenticated: false });
    },
    google: {
      accounts: { oauth2: { initCodeClient(c) { return { requestCode() { c.callback({ code: 'c' }); } }; } } }
    }
  });
  const res = await api.popupLogin();
  assert.equal(res.ok, false);
  assert.equal(res.error, 'not_active');
  assert.equal(storage.getItem('gakusyu-classroom-persist'), null);
});

test('popupLogin: GIS が無い/初期化できない環境は unsupported（通信しない）', async () => {
  const { api, calls } = harness({ google: undefined });
  const res = await api.popupLogin();
  assert.equal(res.ok, false);
  assert.equal(res.error, 'unsupported');
  assert.equal(calls.length, 0);
});

test('status: authenticated boolean を active として正規化する（active キーには依存しない）', async () => {
  const on = harness({ responder: () => jsonResponse(200, { ok: true, authenticated: true }) });
  const st = await on.api.status();
  assert.equal(st.active, true);
  assert.equal(st.authenticated, true);

  const off = harness({ responder: () => jsonResponse(200, { ok: true, authenticated: false }) });
  const st2 = await off.api.status();
  assert.equal(st2.active, false);
  assert.equal(st2.authenticated, false);
  assert.equal(st2.ok, true);
});

test('popupLogin: refresh_token_missing は fallback=legacy_gis を返し、旧経路へ自動送信しない', async () => {
  const storage = memoryStorage();
  const { api, calls } = harness({
    storage,
    responder: (url) => {
      if (url.indexOf('/popup-exchange') !== -1) {
        return jsonResponse(401, { ok: false, error: 'refresh_token_missing', fallback: 'legacy_gis' });
      }
      return jsonResponse(200, { ok: true, authenticated: false });
    },
    google: {
      accounts: { oauth2: { initCodeClient(c) { return { requestCode() { c.callback({ code: 'c' }); } }; } } }
    }
  });
  const res = await api.popupLogin();
  assert.equal(res.ok, false);
  assert.equal(res.error, 'refresh_token_missing');
  assert.equal(res.fallback, 'legacy_gis');
  assert.equal(calls.length, 1, 'exchange 以外へ送らない（GAS/GISへの自動fallbackなし）');
  assert.equal(storage.getItem('gakusyu-classroom-persist'), null);
});

test('logout: {} を送り、サーバ成功時だけ opt-in と有効状態を解除する', async () => {
  const storage = memoryStorage({ 'gakusyu-classroom-persist': '1' });
  const { api, calls, win } = harness({
    storage,
    responder: (url) => jsonResponse(200, { ok: true, authenticated: url.indexOf('/status') !== -1 })
  });
  await api.statusOnce();
  assert.equal(win.__GakusyuClassroomActive, api);
  const res = await api.logout();
  assert.equal(res.ok, true);
  const last = calls[calls.length - 1];
  assert.equal(last.url, API_ORIGIN + '/_classroom/logout');
  assert.deepEqual(last.body, {});
  assert.equal(storage.getItem('gakusyu-classroom-persist'), null);
  assert.equal(win.__GakusyuClassroomActive, null);
});

test('logout: サーバ失敗では opt-in と有効状態を残す（成功に見せない）', async () => {
  const storage = memoryStorage({ 'gakusyu-classroom-persist': '1' });
  const { api, win } = harness({
    storage,
    responder: (url) => {
      if (url.indexOf('/logout') !== -1) return jsonResponse(503, { ok: false, error: 'session_store_unavailable' });
      return jsonResponse(200, { ok: true, authenticated: true });
    }
  });
  await api.statusOnce();
  const res = await api.logout();
  assert.equal(res.ok, false);
  assert.equal(storage.getItem('gakusyu-classroom-persist'), '1');
  assert.equal(win.__GakusyuClassroomActive, api);
});

test('activate: 有効セッションのときだけ probe の context を返す（未確認は従来経路へ）', async () => {
  const off = harness({ responder: () => jsonResponse(200, { ok: true, authenticated: false }) });
  const offRes = await off.api.activate('app2');
  assert.equal(offRes.active, false);

  const on = harness({
    responder: (url) => {
      if (url.indexOf('/status') !== -1) return jsonResponse(200, { ok: true, authenticated: true });
      return jsonResponse(200, { status: 'ok', isOwner: false, open: true, context: 'ctx-9' });
    }
  });
  const res = await on.api.activate('app2');
  assert.equal(res.active, true);
  assert.equal(res.session, true);
  assert.equal(res.context, 'ctx-9');
  assert.equal(on.api.context(), 'ctx-9', 'activate の context は memoryContext に入る');
});
