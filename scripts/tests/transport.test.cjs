/**
 * site/shared/transport.js のオフライン回帰テスト
 * 実行: node scripts/tests/transport.test.cjs
 *
 * 外部API・GAS・Driveには一切アクセスしない（fake DOM / fake fetch / fake storage）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TRANSPORT_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'shared', 'transport.js'), 'utf8');
const SITE_DIR = path.join(__dirname, '..', '..', 'site');
const PAGE_ORIGIN = 'https://hori366191-ship-it.github.io';
const GOOGLE_ORIGIN = 'https://n-abc123xyz.googleusercontent.com';

function readSiteFile(rel) {
  return fs.readFileSync(path.join(SITE_DIR, rel), 'utf8');
}

function extractBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('start marker not found: ' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(i + startMarker.length, j);
}

function createMiniDom() {
  const byId = new Map();
  function createElement(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      style: {},
      textContent: '',
      href: '',
      target: '',
      rel: '',
      type: '',
      disabled: false,
      attributes: {},
      children: [],
      parentNode: null,
      listeners: {},
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (child.id) byId.set(child.id, child);
        return child;
      },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        child.parentNode = null;
        if (child.id && byId.get(child.id) === child) byId.delete(child.id);
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      addEventListener(type, fn) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
      },
      click() {
        const list = this.listeners.click || [];
        for (const fn of list.slice()) fn({ preventDefault() {}, stopPropagation() {} });
      }
    };
    Object.defineProperty(node, 'firstChild', { get() { return this.children[0] || null; } });
    return node;
  }
  const banner = createElement('div');
  banner.id = 'auth-banner-inner';
  byId.set(banner.id, banner);
  const document = {
    createElement,
    getElementById: (id) => byId.get(id) || null
  };
  return { banner, document, byId };
}

function findNodeByText(root, text) {
  if (!root) return null;
  if (root.textContent === text) return root;
  for (const child of root.children || []) {
    const found = findNodeByText(child, text);
    if (found) return found;
  }
  return null;
}

function b64url(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeToken(opts) {
  opts = opts || {};
  if (opts.malformed) return 'not-a-jwt';
  const exp = opts.exp !== undefined ? opts.exp : Math.floor(Date.now() / 1000) + 3600;
  const payload = { email: opts.email || 'student@example.com', exp: exp, aud: 'client-id', iss: 'accounts.google.com' };
  if (opts.noExp) delete payload.exp;
  return b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url(payload) + '.signature';
}

function createElement(env, tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    style: {},
    children: [],
    parentNode: null,
    attributes: {},
    value: '',
    name: '',
    src: '',
    action: '',
    method: '',
    target: '',
    type: '',
    onerror: null,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (this.tagName === 'HEAD' && child.tagName === 'SCRIPT') env.scripts.push(child);
      if (this.tagName === 'BODY' && child.tagName === 'IFRAME') env.iframes.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
      this.removed = true;
    },
    submit() { if (typeof env.onFormSubmit === 'function') env.onFormSubmit(this); }
  };
  if (el.tagName === 'IFRAME') el.contentWindow = { parent: null, __iframe: true };
  return el;
}

function createEnv(options) {
  options = options || {};
  const env = {
    scripts: [],
    iframes: [],
    submitted: [],
    listeners: new Map(),
    storageMap: options.storageMap || new Map(),
    fetchCalls: []
  };
  env.head = createElement(env, 'head');
  env.body = createElement(env, 'body');
  env.document = {
    createElement: (tag) => createElement(env, tag),
    head: env.head,
    body: env.body
  };
  env.storage = {
    getItem: (k) => (env.storageMap.has(k) ? env.storageMap.get(k) : null),
    setItem: (k, v) => { env.storageMap.set(k, String(v)); },
    removeItem: (k) => { env.storageMap.delete(k); }
  };
  env.addEventListener = (type, fn) => {
    if (!env.listeners.has(type)) env.listeners.set(type, new Set());
    env.listeners.get(type).add(fn);
  };
  env.removeEventListener = (type, fn) => {
    const set = env.listeners.get(type);
    if (set) set.delete(fn);
  };
  env.dispatchEvent = (ev) => {
    const set = env.listeners.get(ev && ev.type);
    if (!set) return;
    for (const fn of Array.from(set)) fn(ev);
  };
  env.onFormSubmit = (form) => {
    const input = form.children[0];
    let payload = null;
    try { payload = JSON.parse(input.value); } catch (e) { payload = null; }
    const iframe = env.iframes.filter((f) => f.name === form.target).pop() || null;
    env.submitted.push({ action: form.action, payload, iframe });
  };
  env.message = (data, origin, source) => {
    env.dispatchEvent({ type: 'message', data, origin, source });
  };
  env.listenerCount = (type) => (env.listeners.get(type) ? env.listeners.get(type).size : 0);
  return env;
}

function loadTransport(env, overrides) {
  const sandbox = {
    window: null,
    document: env.document,
    location: { href: PAGE_ORIGIN + '/gakusyu-tools/', origin: PAGE_ORIGIN },
    localStorage: env.storage,
    setTimeout,
    clearTimeout,
    console,
    URL,
    AbortController,
    Uint8Array,
    Promise,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    isFinite,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    TextDecoder,
    CustomEvent: class FakeCustomEvent {
      constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
    },
    fetch: env.fetch || (() => Promise.reject(new Error('fetch stub not configured'))),
    addEventListener: env.addEventListener,
    removeEventListener: env.removeEventListener,
    dispatchEvent: env.dispatchEvent,
    crypto: globalThis.crypto
  };
  Object.assign(sandbox, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext('this.window = this;', sandbox);
  const innerWindow = vm.runInContext('this', sandbox);
  vm.runInContext(TRANSPORT_SRC, sandbox);
  env.window = innerWindow;
  env.T = innerWindow.GakusyuTransport;
  return innerWindow;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function callbackNameFrom(script) {
  const m = /[?&]callback=([^&]+)/.exec(script.src);
  return m ? decodeURIComponent(m[1]) : '';
}

function ridFromUrl(url) {
  const m = /[?&]rid=([^&]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : '';
}

test('request_id / rid は契約の形式を満たし毎回異なる', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const ids = new Set();
  const rids = new Set();
  for (let i = 0; i < 20; i++) {
    const id = T.newRequestId();
    const rid = T.newNonce();
    assert.match(id, /^[A-Za-z0-9_-]{16,128}$/);
    assert.match(rid, /^[A-Za-z0-9_-]{16,128}$/);
    ids.add(id);
    rids.add(rid);
  }
  assert.strictEqual(ids.size, 20);
  assert.strictEqual(rids.size, 20);
});

test('id_token: JWT構造とexpを検証し、壊れた/期限切れは保存から破棄する', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;

  const valid = makeToken({ exp: Math.floor(Date.now() / 1000) + 600 });
  assert.strictEqual(T.inspectToken(valid).valid, true);
  assert.strictEqual(T.inspectToken(makeToken({ malformed: true })).valid, false);
  assert.strictEqual(T.inspectToken(makeToken({ exp: Math.floor(Date.now() / 1000) - 10 })).valid, false);
  assert.strictEqual(T.inspectToken(makeToken({ noExp: true })).valid, false);
  assert.strictEqual(T.inspectToken('').valid, false);

  env.storageMap.set(T.TOKEN_KEY, valid);
  assert.strictEqual(T.getIdToken(), valid);
  assert.strictEqual(env.storageMap.get(T.TOKEN_KEY), valid);

  const expired = makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
  env.storageMap.set(T.TOKEN_KEY, expired);
  assert.strictEqual(T.getIdToken(), '');
  assert.strictEqual(env.storageMap.has(T.TOKEN_KEY), false);

  env.storageMap.set(T.TOKEN_KEY, 'broken.token');
  assert.strictEqual(T.getIdToken(), '');
  assert.strictEqual(env.storageMap.has(T.TOKEN_KEY), false);
});

test('id_token: 破棄は同一originの他画面（共有storage）にも伝播し、storageイベントで通知される', async () => {
  const shared = new Map();
  const envA = createEnv({ storageMap: shared });
  const envB = createEnv({ storageMap: shared });
  loadTransport(envA);
  loadTransport(envB);
  const expires = makeToken({ exp: Math.floor(Date.now() / 1000) - 1 });

  envA.storageMap.set(envA.T.TOKEN_KEY, expires);
  assert.strictEqual(envB.T.getIdToken(), '');
  assert.strictEqual(shared.has(envB.T.TOKEN_KEY), false);

  let notified = 0;
  const off = envA.T.onAuthChange(() => { notified++; });
  const fresh = makeToken({ exp: Math.floor(Date.now() / 1000) + 600 });
  shared.set(envA.T.TOKEN_KEY, fresh);
  envA.dispatchEvent({ type: 'storage', key: envA.T.TOKEN_KEY });
  assert.strictEqual(notified, 1);
  assert.strictEqual(envA.T.getIdToken(), fresh);
  off();
  envA.dispatchEvent({ type: 'storage', key: envA.T.TOKEN_KEY });
  assert.strictEqual(notified, 1);
});

test('origin allowlist はGAS/Worker/開発localのみ許可し、evil suffixを拒否する', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  T.configure({ origins: ['https://gakusyu-tools-proxy.hori-shota.workers.dev'] });

  assert.strictEqual(T.isAllowedOrigin('https://script.google.com'), true);
  assert.strictEqual(T.isAllowedOrigin(GOOGLE_ORIGIN), true);
  assert.strictEqual(T.isAllowedOrigin('https://googleusercontent.com'), true);
  assert.strictEqual(T.isAllowedOrigin('https://gakusyu-tools-proxy.hori-shota.workers.dev'), true);
  assert.strictEqual(T.isAllowedOrigin('http://localhost:8000'), true);
  assert.strictEqual(T.isAllowedOrigin('http://127.0.0.1:8080'), true);
  assert.strictEqual(T.isAllowedOrigin('http://[::1]:5000'), true);

  assert.strictEqual(T.isAllowedOrigin('https://script.google.com.evil.example'), false);
  assert.strictEqual(T.isAllowedOrigin('https://evilgoogleusercontent.com'), false);
  assert.strictEqual(T.isAllowedOrigin('https://googleusercontent.com.evil.example'), false);
  assert.strictEqual(T.isAllowedOrigin('http://script.google.com'), false);
  assert.strictEqual(T.isAllowedOrigin('https://script.google.com/exec'), false);
  assert.strictEqual(T.isAllowedOrigin('https://script.google.com@evil.example'), false);
  assert.strictEqual(T.isAllowedOrigin('null'), false);
  assert.strictEqual(T.isAllowedOrigin(''), false);
});

test('readMessage: rid必須・origin・source（GASネストiframe含む）を検証する', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const iframe = createElement(env, 'iframe');
  const rid = T.newNonce();
  const base = { genkoProbe: true, rid: rid, payload: { genkoProbe: true, ok: true, allowed: true } };

  // 直接のiframe.contentWindow
  let m = T.readMessage({ data: base, origin: GOOGLE_ORIGIN, source: iframe.contentWindow }, { iframe, rids: rid });
  assert.strictEqual(m.ok, true);
  assert.strictEqual(m.kind, 'genkoProbe');

  // GAS userHtmlFrame（1段ネスト）
  const nested = { parent: iframe.contentWindow };
  m = T.readMessage({ data: base, origin: GOOGLE_ORIGIN, source: nested }, { iframe, rids: rid });
  assert.strictEqual(m.ok, true);

  // 2段ネスト（許容）
  const nested2 = { parent: { parent: iframe.contentWindow } };
  m = T.readMessage({ data: base, origin: 'https://script.google.com', source: nested2 }, { iframe, rids: rid });
  assert.strictEqual(m.ok, true);

  // 偽origin（ridが正しくても無視）
  m = T.readMessage({ data: base, origin: 'https://evil.example', source: nested }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'origin');

  // 偽source（正しいrid/originでも無視）
  m = T.readMessage({ data: base, origin: GOOGLE_ORIGIN, source: { parent: null } }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'source');

  // 自分のwindow（親から戻ってきたpostMessage等）は無視
  m = T.readMessage({ data: base, origin: GOOGLE_ORIGIN, source: env.window }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'selfsource');

  // rid不一致 / rid欠落 / payload欠落 / 形不正
  m = T.readMessage({ data: Object.assign({}, base, { rid: T.newNonce() }), origin: GOOGLE_ORIGIN, source: iframe.contentWindow }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'rid_mismatch');

  const noRid = { genkoProbe: true, payload: { ok: true } };
  m = T.readMessage({ data: noRid, origin: GOOGLE_ORIGIN, source: iframe.contentWindow }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'rid_shape');

  m = T.readMessage({ data: { genkoProbe: true, rid: rid }, origin: GOOGLE_ORIGIN, source: iframe.contentWindow }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'payload');

  m = T.readMessage({ data: { payload: {} }, origin: GOOGLE_ORIGIN, source: iframe.contentWindow }, { iframe, rids: rid });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'shape');

  // 深すぎる連鎖は拒否
  let deep = iframe.contentWindow;
  for (let i = 0; i < 6; i++) deep = { parent: deep };
  m = T.readMessage({ data: base, origin: GOOGLE_ORIGIN, source: deep }, { iframe, rids: rid, maxDepth: 3 });
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.reason, 'source');
});

test('jsonp: 成功・onerror・timeoutの全経路で有限にsettleし、script/callback/timerを後始末する', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;

  // 成功
  const pOk = T.jsonp('https://example.test/probe?x=1', { timeoutMs: 1000 });
  assert.strictEqual(env.scripts.length, 1);
  const cbName = callbackNameFrom(env.scripts[0]);
  assert.match(cbName, /^[A-Za-z0-9_.]{1,64}$/);
  env.window[cbName]({ genkoProbe: true, ok: true });
  const rOk = await pOk;
  assert.strictEqual(rOk.ok, true);
  assert.strictEqual(rOk.data.ok, true);
  assert.strictEqual(env.head.children.length, 0);
  assert.strictEqual(typeof env.window[cbName], 'undefined');

  // onerror
  const pErr = T.jsonp('https://example.test/err', { timeoutMs: 1000 });
  env.scripts[env.scripts.length - 1].onerror();
  const rErr = await pErr;
  assert.strictEqual(rErr.ok, false);
  assert.strictEqual(rErr.error, 'onerror');
  assert.strictEqual(env.head.children.length, 0);

  // timeout（callbackが呼ばれない）
  const started = Date.now();
  const pTimeout = T.jsonp('https://example.test/timeout', { timeoutMs: 60 });
  const rTimeout = await pTimeout;
  assert.strictEqual(rTimeout.ok, false);
  assert.strictEqual(rTimeout.error, 'timeout');
  assert.ok(Date.now() - started < 1000, 'timeoutが有限時間で完了する');
  assert.strictEqual(env.head.children.length, 0);
  const timeoutCb = callbackNameFrom({ src: '?callback=__unused' });
  assert.strictEqual(timeoutCb, '__unused');
});

test('getViaIframe: rid/origin/source検証を通った時だけ成功し、iframe/listener/timerを片付ける', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const rid = T.newNonce();
  const p = T.getViaIframe('https://proxy.example/probe?probe=1', { rid, timeoutMs: 800 });
  const iframe = env.iframes[0];
  assert.ok(iframe, 'iframeが生成される');
  assert.strictEqual(ridFromUrl(iframe.src), rid);
  assert.match(iframe.src, /parent_origin=https%3A%2F%2Fhori366191-ship-it\.github\.io/);

  // 偽origin・偽sourceは無視される
  env.message({ genkoProbe: true, rid, payload: { genkoProbe: true, ok: true, allowed: true } }, 'https://evil.example', iframe.contentWindow);
  env.message({ genkoProbe: true, rid, payload: { genkoProbe: true, ok: true, allowed: true } }, GOOGLE_ORIGIN, { parent: null });
  assert.strictEqual(env.listenerCount('message'), 1, '偽メッセージではsettleしない');
  assert.strictEqual(env.body.children.length, 1);

  const nested = { parent: iframe.contentWindow };
  env.message({ genkoProbe: true, rid, payload: { genkoProbe: true, ok: true, allowed: true } }, GOOGLE_ORIGIN, nested);
  const res = await p;
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.allowed, true);
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);

  // 応答なしでもtimeoutで有限完了
  const p2 = T.getViaIframe('https://proxy.example/probe?probe=1', { rid: T.newNonce(), timeoutMs: 40 });
  const res2 = await p2;
  assert.strictEqual(res2.ok, false);
  assert.strictEqual(res2.error, 'timeout');
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);
});

test('postForm: 変更系はrequest_id必須で、無い場合は送信しない', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const res = await T.postForm({
    url: 'https://proxy.example/app2',
    payload: { token: 't', name: 'x.pdf', b64: 'AAA' },
    kind: 'genko'
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'request_id_required');
  assert.strictEqual(env.submitted.length, 0);
  assert.strictEqual(env.body.children.length, 0);
});

test('postForm: rid/origin/source検証を通った応答だけ受理し、request_id/rid/parent_originを送る', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const requestId = T.newRequestId();
  const rid = T.newNonce();
  const p = T.postForm({
    url: 'https://proxy.example/pdfdrop',
    payload: { token: 't', name: 'x.pdf', b64: 'AAA', request_id: requestId },
    rid,
    kind: 'genko',
    timeoutMs: 600
  });
  assert.strictEqual(env.submitted.length, 1);
  assert.strictEqual(env.submitted[0].payload.request_id, requestId);
  assert.strictEqual(env.submitted[0].payload.rid, rid);
  assert.strictEqual(env.submitted[0].payload.parent_origin, PAGE_ORIGIN);
  const iframe = env.submitted[0].iframe;

  // 偽origin / rid不一致 / 偽sourceは無視
  env.message({ genko: true, rid, payload: { genko: true, ok: true } }, 'https://evil.example', iframe.contentWindow);
  env.message({ genko: true, rid: T.newNonce(), payload: { genko: true, ok: true } }, GOOGLE_ORIGIN, iframe.contentWindow);
  env.message({ genko: true, rid, payload: { genko: true, ok: true } }, GOOGLE_ORIGIN, { parent: null });
  env.message({ genko: true, rid, payload: { genko: true, ok: true } }, GOOGLE_ORIGIN, env.window);
  await wait(60);
  assert.strictEqual(env.listenerCount('message'), 1, '偽メッセージではsettleしない');

  // GAS userHtmlFrame（ネスト）からの正しい応答は許可
  env.message({ genko: true, rid, payload: { genko: true, ok: true, name: 'x.pdf' } }, GOOGLE_ORIGIN, { parent: iframe.contentWindow });
  const res = await p;
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);
});

test('jsonp: 応答にridが含まれる場合は送信したridと照合する', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const rid = T.newNonce();
  const p = T.jsonp('https://example.test/probe', { timeoutMs: 300, rid });
  const cbName = callbackNameFrom(env.scripts[0]);
  env.window[cbName]({ genkoProbe: true, rid: T.newNonce() });
  const res = await p;
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'rid_mismatch');
  assert.strictEqual(env.head.children.length, 0);
});

test('jsonp: 履歴/pollのようにridが応答に無い場合はそのまま受理する（timeoutにしない）', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const rid = T.newNonce();
  const p = T.jsonp('https://example.test/saved', { timeoutMs: 300, rid });
  env.window[callbackNameFrom(env.scripts[0])]({ ok: true, items: [] });
  const res = await p;
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(env.head.children.length, 0);
});

test('postFormSequence: Worker→Direct再送でrequest_id/ridを維持し、全経路で後始末する', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const requestId = T.newRequestId();
  const rid = T.newNonce();
  const payload = { token: 't', name: 'genkoshi_x.pdf', b64: 'AAA', request_id: requestId };
  const p = T.postFormSequence(['https://proxy.example/pdfdrop', 'https://script.google.com/exec'], {
    payload, rid, totalMs: 2000, perAttemptMs: 300
  });

  await wait(400);
  assert.strictEqual(env.submitted.length, 2, 'Worker失敗後にDirectへ再送する');
  assert.strictEqual(env.submitted[0].payload.request_id, requestId);
  assert.strictEqual(env.submitted[1].payload.request_id, requestId);
  assert.strictEqual(env.submitted[0].payload.rid, rid);
  assert.strictEqual(env.submitted[1].payload.rid, rid);
  assert.strictEqual(env.submitted[0].payload.parent_origin, PAGE_ORIGIN);

  const second = env.submitted[1];
  env.message({ genko: true, rid, payload: { genko: true, ok: true, name: 'genkoshi_x.pdf' } }, GOOGLE_ORIGIN, second.iframe.contentWindow);
  const res = await p;
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.rid, rid);
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);
});

test('fetchJson: POSTはrequest_id必須・AbortControllerで有限timeout・JSON不正は成功扱いしない', async () => {
  const env = createEnv();
  const calls = env.fetchCalls;
  env.fetch = (url, init) => {
    calls.push({ url, init });
    if (url.indexOf('proxy') !== -1) return Promise.reject(new Error('network down'));
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true, item: { title: 'x' } }))
    });
  };
  loadTransport(env);
  const T = env.T;
  const requestId = T.newRequestId();
  const body = JSON.stringify({ action: 'generateText', request_id: requestId, token: 't' });

  const res = await T.fetchJson({
    urls: ['https://proxy.example/app2', 'https://script.google.com/exec'],
    method: 'POST',
    body,
    requestId,
    timeoutMs: 500,
    totalMs: 2000
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.item.title, 'x');
  assert.strictEqual(calls.length, 2, 'Worker失敗時にDirectへフォールバックする');
  assert.strictEqual(calls[0].init.body, calls[1].init.body, '再送でも同一request_idを含む同一bodyを使う');
  assert.ok(calls[0].init.signal, 'AbortControllerのsignalを渡す');

  // request_idなしのPOSTは送信しない
  const refused = await T.fetchJson({ urls: ['https://proxy.example/app2'], method: 'POST', body: '{}' });
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.error, 'request_id_required');
  assert.strictEqual(calls.length, 2);

  // JSONパース不能は明示エラー（{} の成功扱いにしない）
  const env2 = createEnv();
  env2.fetch = () => Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve('<html>proxy error</html>')
  });
  loadTransport(env2);
  const bad = await env2.T.fetchJson({ urls: ['https://proxy.example/app2'], method: 'GET', timeoutMs: 500 });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.error, 'invalid_json');

  // 応答が返らないfetchはtimeoutで必ずsettleする
  const env3 = createEnv();
  env3.fetch = (url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    }
  });
  loadTransport(env3);
  const started = Date.now();
  const timedOut = await env3.T.fetchJson({ urls: ['https://proxy.example/app2'], method: 'GET', timeoutMs: 60 });
  assert.strictEqual(timedOut.ok, false);
  assert.strictEqual(timedOut.error, 'timeout');
  assert.strictEqual(timedOut.unknown, true);
  assert.ok(Date.now() - started < 1000, 'timeoutが有限時間で完了する');
});

test('probeAuth: 応答なしでも全体予算内でunreachableになり、iframe/form/listenerを残さない', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const started = Date.now();
  const res = await T.probeAuth({
    token: 'token',
    workerUrl: 'https://proxy.example/app2',
    directUrl: 'https://script.google.com/exec',
    totalMs: 800,
    timeouts: { post: 40, jsonp: 40, iframe: 40 }
  });
  assert.strictEqual(res.status, 'unreachable');
  assert.ok(Date.now() - started < 1500, '有限時間で完了する');
  await wait(80);
  assert.strictEqual(env.body.children.length, 0, 'iframe/formが残らない');
  assert.strictEqual(env.listenerCount('message'), 0, 'message listenerが残らない');
  assert.strictEqual(env.head.children.length, 0, 'scriptが残らない');
});

test('probeAuth: POSTが不応答でもJSONP応答で成功し、4状態へ分類できる', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const p = T.probeAuth({
    token: 'token',
    workerUrl: 'https://proxy.example/app2',
    directUrl: 'https://script.google.com/exec',
    totalMs: 900,
    timeouts: { post: 120, jsonp: 400, iframe: 120 }
  });
  await wait(20);
  const script = env.scripts[env.scripts.length - 1];
  const cbName = callbackNameFrom(script);
  env.window[cbName]({ genkoProbe: true, ok: true, allowed: true, is_owner: true });
  const res = await p;
  assert.strictEqual(res.status, 'ok');
  assert.strictEqual(res.isOwner, true);
  assert.strictEqual(res.via, 'jsonp');
  await wait(200);
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);
  assert.strictEqual(env.head.children.length, 0);
});

test('probeAuth: POST/JSONPが全滅してもprobe用iframeへ有限時間でfallbackし、成功後に残留しない', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const p = T.probeAuth({
    token: 'token',
    workerUrl: 'https://proxy.example/app2',
    directUrl: 'https://script.google.com/exec',
    totalMs: 3000,
    timeouts: { post: 50, jsonp: 50, iframe: 800 }
  });
  // GET iframe（src付き）が作られるまで待つ
  const started = Date.now();
  let iframe = null;
  while (Date.now() - started < 1000) {
    iframe = env.iframes.filter((f) => f.src).pop() || null;
    if (iframe) break;
    await wait(20);
  }
  assert.ok(iframe, 'JSONP/POST失敗後にiframe fallbackが起動する');
  const rid = ridFromUrl(iframe.src);
  assert.match(iframe.src, /parent_origin=/);
  env.message({ genkoProbe: true, rid, payload: { genkoProbe: true, ok: true, allowed: true } }, GOOGLE_ORIGIN, { parent: iframe.contentWindow });
  const res = await p;
  assert.strictEqual(res.status, 'ok');
  assert.strictEqual(res.via, 'iframe');
  await wait(100);
  assert.strictEqual(env.body.children.length, 0);
  assert.strictEqual(env.listenerCount('message'), 0);
  assert.strictEqual(env.head.children.length, 0);
});

test('probeAuth: noauth / notallowed を4状態へ分類し、OPEN_GENERATEのopenを保持する', async () => {
  async function runWith(data) {
    const env = createEnv();
    loadTransport(env);
    const p = env.T.probeAuth({
      token: 'token',
      workerUrl: 'https://proxy.example/app2',
      directUrl: 'https://script.google.com/exec',
      totalMs: 1200,
      timeouts: { post: 100, jsonp: 800, iframe: 100 }
    });
    await wait(20);
    const cbName = callbackNameFrom(env.scripts[env.scripts.length - 1]);
    env.window[cbName](data);
    return p;
  }
  const noauth = await runWith({ genkoProbe: true, ok: false, error: 'noauth', open: true });
  assert.strictEqual(noauth.status, 'noauth');
  assert.strictEqual(noauth.open, true);

  const notallowed = await runWith({ genkoProbe: true, ok: true, allowed: false, masked: 'st***@example.com' });
  assert.strictEqual(notallowed.status, 'notallowed');
  assert.strictEqual(notallowed.masked, 'st***@example.com');

  const error = await runWith({ genkoProbe: true, ok: false, error: 'bad token' });
  assert.strictEqual(error.status, 'error');
  assert.strictEqual(error.message, 'bad token');
});

test('buildPdfName: request_idで一意になり、poll照合に使える安全な名前になる', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const date = new env.window.Date(2026, 9, 25, 12, 34, 56);
  const ridA = T.newRequestId();
  const ridB = T.newRequestId();
  const a = T.buildPdfName(20, 20, ridA, date);
  const b = T.buildPdfName(20, 20, ridB, date);
  assert.notStrictEqual(a, b, '同時刻でもrequest_idで別名になる');
  assert.ok(a.indexOf('20261025-123456') !== -1, '日時を含む');
  assert.ok(a.indexOf(ridA.replace(/[^A-Za-z0-9]/g, '')) !== -1, 'request_idを含む');
  assert.match(a, /^genkoshi_\d{8}-\d{6}_[A-Za-z0-9]+_20x20\.pdf$/);
  assert.ok(a.length <= 120);
  assert.match(a, /^[A-Za-z0-9._-]+$/);
});

test('parent_origin: backend allowlist（Pages / http loopback）だけ送り、それ以外は省略する', async () => {
  const env = createEnv();
  loadTransport(env, { location: { href: 'https://example.test/app/', origin: 'https://example.test' } });
  const T = env.T;
  assert.strictEqual(T.parentOriginForBackend(), '');
  const p = T.postForm({
    url: 'https://proxy.example/pdfdrop',
    payload: { token: 't', name: 'x.pdf', b64: 'AAA', request_id: T.newRequestId() },
    rid: T.newNonce(),
    kind: 'genko',
    timeoutMs: 50
  });
  assert.strictEqual(env.submitted[0].payload.parent_origin, undefined);
  await p;

  const local = createEnv();
  loadTransport(local, { location: { href: 'http://localhost:8123/app2/', origin: 'http://localhost:8123' } });
  assert.strictEqual(local.T.parentOriginForBackend(), 'http://localhost:8123');
});

test('waitForGis: GIS不在時は無限リトライせず有限時間でfalse、後から読めればtrue', async () => {
  const env = createEnv();
  const sandbox = loadTransport(env);
  const T = env.T;
  const started = Date.now();
  const ok = await T.waitForGis({ timeoutMs: 120, intervalMs: 20 });
  assert.strictEqual(ok, false);
  assert.ok(Date.now() - started < 1000, '有限時間で諦める');

  sandbox.google = { accounts: { id: { initialize() {} } } };
  const ok2 = await T.waitForGis({ timeoutMs: 120, intervalMs: 20 });
  assert.strictEqual(ok2, true);
});

test('busy / latest-only: 生成の連打防止と履歴の最終選択反映を支える', async () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;

  const busy = T.createBusyFlag();
  assert.strictEqual(busy.tryEnter(), true);
  assert.strictEqual(busy.tryEnter(), false);
  assert.strictEqual(busy.isBusy(), true);
  busy.leave();
  assert.strictEqual(busy.isBusy(), false);
  assert.strictEqual(busy.tryEnter(), true);

  // item単位のbusy（削除連打防止）
  const keyed = T.createKeyedBusy();
  assert.strictEqual(keyed.tryEnter('tadoku-1'), true);
  assert.strictEqual(keyed.tryEnter('tadoku-1'), false);
  assert.strictEqual(keyed.tryEnter('tadoku-2'), true);
  assert.strictEqual(keyed.isBusy('tadoku-1'), true);
  keyed.leave('tadoku-1');
  assert.strictEqual(keyed.isBusy('tadoku-1'), false);
  assert.strictEqual(keyed.tryEnter('tadoku-1'), true);

  const latest = T.createLatestOnly();
  const first = latest.begin();
  const second = latest.begin();
  assert.strictEqual(latest.isLatest(first), false);
  assert.strictEqual(latest.isLatest(second), true);

  // フィルタ変更がロード中に起きても、後から完了した古い応答は反映しない
  const applied = [];
  const run = async (seq, delay) => {
    await wait(delay);
    if (latest.isLatest(seq)) applied.push(seq);
  };
  await Promise.all([run(first, 30), run(second, 10)]);
  assert.deepStrictEqual(applied, [second]);
});

test('fetchJson: 変更系は先行attemptの不明（5xx/timeout/非JSON）を成功確認まで保持する', async () => {
  async function run(steps, opts) {
    opts = opts || {};
    const env = createEnv();
    const calls = [];
    let i = 0;
    env.fetch = (url, init) => {
      calls.push({ url, init });
      const step = steps[i++];
      if (step === 'network') return Promise.reject(new Error('offline'));
      if (step === 'hang') {
        return new Promise((resolve, reject) => {
          if (init && init.signal) {
            init.signal.addEventListener('abort', () => {
              const e = new Error('aborted');
              e.name = 'AbortError';
              reject(e);
            });
          }
        });
      }
      if (step === 'invalid') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html>error</html>') });
      }
      return Promise.resolve({
        ok: step.status >= 200 && step.status < 300,
        status: step.status,
        text: () => Promise.resolve(JSON.stringify(step.json || {}))
      });
    };
    loadTransport(env);
    const T = env.T;
    const requestId = T.newRequestId();
    const body = JSON.stringify({ request_id: requestId, value: 1 });
    const res = await T.fetchJson({
      urls: ['https://proxy.example/app2', 'https://script.google.com/exec'],
      method: 'POST',
      body,
      requestId,
      timeoutMs: opts.timeoutMs || 120,
      totalMs: 3000
    });
    return { res, calls, requestId };
  }

  // Worker 5xx → Direct timeout
  let out = await run([{ status: 503, json: { ok: false } }, 'hang']);
  assert.strictEqual(out.res.ok, false);
  assert.strictEqual(out.res.unknown, true, '5xx→timeoutは不明として保持');

  // network → 5xx
  out = await run(['network', { status: 502, json: { ok: false } }]);
  assert.strictEqual(out.res.unknown, true);

  // 5xx → backendの認証失敗（200 ok:false）でも初回成功の可能性を消さない
  out = await run([{ status: 500, json: { ok: false } }, { status: 200, json: { ok: false, error: 'not allowed', code: 'not_allowed' } }]);
  assert.strictEqual(out.res.ok, false);
  assert.strictEqual(out.res.unknown, true);
  assert.strictEqual(out.res.error, 'not allowed');

  // timeout → Direct同一ID成功：成功が確認できた時だけ不明を解消
  out = await run(['hang', { status: 200, json: { ok: true, item: { id: 'x' } } }], { timeoutMs: 80 });
  assert.strictEqual(out.res.ok, true);
  assert.strictEqual(out.res.unknown, false);
  assert.strictEqual(out.res.data.item.id, 'x');
  assert.strictEqual(out.calls.length, 2);
  assert.strictEqual(out.calls[0].init.body, out.calls[1].init.body, '同一request_idのbodyを再送');
  assert.ok(out.calls[0].init.body.indexOf(out.requestId) !== -1);
});

test('app2 operationError: r.unknown/conflictをunknownOperationとして保持し、GETは通常failure', () => {
  const app2 = readSiteFile('app2/index.html');
  const block = extractBetween(app2, '// TESTABLE-OPERROR-START', '// TESTABLE-OPERROR-END');
  const sandbox = {
    T: { messages: { unknownResult: 'UNKNOWN' } },
    Error,
    String
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(block + '\n;globalThis.__op = operationError;', ctx);
  const op = ctx.__op;

  const unknown = op('生成', { ok: false, unknown: true, error: 'timeout' }, true);
  assert.strictEqual(unknown.unknownOperation, true);
  assert.strictEqual(unknown.message, 'UNKNOWN');

  const authAfter5xx = op('生成', { ok: false, unknown: true, error: 'not allowed' }, true);
  assert.strictEqual(authAfter5xx.unknownOperation, true, '5xx後の認証失敗も不明扱い');

  const conflict = op('生成', { ok: true, data: { ok: false, error: 'conflict', code: 'request_id_conflict' } }, true);
  assert.strictEqual(conflict.unknownOperation, true);
  assert.strictEqual(conflict.code, 'request_id_conflict');

  const getUnknown = op('辞書', { ok: false, unknown: true, error: 'timeout' }, false);
  assert.strictEqual(getUnknown.unknownOperation, undefined, 'GETはpendingを持たない');
  assert.match(getUnknown.message, /通信に失敗/);
});

test('actorKey / decidePendingGenerate: token更新で同一user、account変更やconflictは確認なしに新IDにしない', () => {
  const env = createEnv();
  loadTransport(env);
  const T = env.T;
  const tokenA = makeToken({ email: 'a@example.com', exp: Math.floor(Date.now() / 1000) + 600 });
  const tokenARefreshed = makeToken({ email: 'A@example.com', exp: Math.floor(Date.now() / 1000) + 1200 });
  const tokenB = makeToken({ email: 'b@example.com', exp: Math.floor(Date.now() / 1000) + 600 });
  assert.strictEqual(T.actorKey(tokenA, 'device-1'), 'user:a@example.com');
  assert.strictEqual(T.actorKey(tokenARefreshed, 'device-1'), T.actorKey(tokenA, 'device-1'), 'token更新で同一user');
  assert.notStrictEqual(T.actorKey(tokenB, 'device-1'), T.actorKey(tokenA, 'device-1'));
  assert.strictEqual(T.actorKey('', 'device-1'), 'anon:device-1');
  assert.notStrictEqual(T.actorKey('', 'device-2'), 'anon:device-1');

  const app2 = readSiteFile('app2/index.html');
  const block = extractBetween(app2, '// TESTABLE-GENERATE-DECISION-START', '// TESTABLE-GENERATE-DECISION-END');
  const sandbox = { T: { isRequestId: T.isRequestId } };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(block + '\n;globalThis.__decide = decidePendingGenerate; globalThis.__resolve = resolvePendingGenerateAction;', ctx);
  const decide = ctx.__decide;
  const resolve = ctx.__resolve;
  const requestId = T.newRequestId();

  assert.strictEqual(decide(null, 'S', 'A').action, 'new');
  assert.strictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S', 'A').action, 'reuse');
  assert.strictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S2', 'A').action, 'confirm-settings');
  assert.strictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S', 'B').action, 'confirm-actor');
  assert.strictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A', conflict: true }, 'S', 'B').action, 'confirm-actor');
  assert.strictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A', conflict: true }, 'S', 'A').action, 'confirm-conflict');
  assert.notStrictEqual(decide({ requestId, settingsKey: 'S', actorHash: 'A', conflict: true }, 'S', 'B').action, 'new', 'account変更+conflictでも無条件新IDにしない');

  let confirmCalls = 0;
  let confirmAnswer = false;
  const confirmFn = () => { confirmCalls++; return confirmAnswer; };
  assert.strictEqual(resolve(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S', 'B'), confirmFn).action, 'cancel');
  assert.strictEqual(confirmCalls, 1);
  assert.strictEqual(resolve(decide({ requestId, settingsKey: 'S', actorHash: 'A', conflict: true }, 'S', 'B'), confirmFn).action, 'cancel');
  assert.strictEqual(confirmCalls, 2);
  confirmAnswer = true;
  assert.strictEqual(resolve(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S', 'B'), confirmFn).action, 'new-after-confirm');
  assert.strictEqual(resolve(decide({ requestId, settingsKey: 'S', actorHash: 'A' }, 'S', 'A'), confirmFn).action, 'reuse');
});

test('app2 generate: 長時間AI向け予算（90s/130s）でDirectに30s以上残し、削除/履歴は短いまま', () => {
  const app2 = readSiteFile('app2/index.html');
  const gen = extractBetween(app2, "if (name === 'generateText') {", "if (name === 'deleteText') {");
  assert.match(gen, /timeoutMs:\s*90000/);
  assert.match(gen, /totalMs:\s*130000/);
  const del = extractBetween(app2, "if (name === 'deleteText') {", "// 対訳: mode=get は閲覧");
  assert.match(del, /timeoutMs:\s*9000/);
  assert.match(del, /totalMs:\s*20000/);
  const history = extractBetween(app2, "if (name === 'getSavedTexts') {", "// 辞書・フォーム設定は fetch");
  assert.match(history, /timeoutMs:\s*9000/);
  assert.ok(history.indexOf('getViaIframe') === -1, '履歴にiframe fallbackをしない');
  // 不明時は同じIDを保持し、履歴を一度更新する
  const genBlock = extractBetween(app2, 'async function generate() {', "document.getElementById('genBtn').addEventListener('click', generate);");
  assert.match(genBlock, /pendingGenerate = \{[\s\S]*actorHash/);
  assert.match(genBlock, /loadSavedList\(\{ reset: true \}\)/);
});

test('app2 translate: 取得は request_id 不要・作成は必須で、record_id だけ送る', () => {
  const app2 = readSiteFile('app2/index.html');
  const block = extractBetween(app2, "if (name === 'translateText') {", "// getSavedTexts は JSONP GET");
  assert.match(block, /record_id:/);
  assert.match(block, /requestIdRequired: mode === 'create'/);
  assert.match(block, /timeoutMs: mode === 'create' \? 90000 : 20000/);
  assert.match(block, /totalMs: mode === 'create' \? 130000 : 30000/);
  assert.equal(block.indexOf('payload.text'), -1, 'クライアント本文を送らない');
  assert.equal(block.indexOf('payload.ja'), -1, 'クライアント訳を送らない');
});

test('app2 bilingual: 英文は offset の inline span で描画し、innerHTML を使わない', () => {
  const app2 = readSiteFile('app2/index.html');
  const block = extractBetween(app2, 'const bilingual = {', 'function renderRecord(rec) {');
  assert.ok(block.length > 1000, '対訳ブロックを抽出できる');
  assert.equal(block.indexOf('.innerHTML'), -1, 'XSS 防止のため textContent のみ');
  assert.match(app2, /textContent = text\.slice\(sp\.start, sp\.end\)/, '原文を offset で切り出す');
  assert.match(app2, /body\.bilingual-mode #dict-overlay-fixed/, 'スマホの対訳中は辞書を上側に出す');
  assert.match(app2, /const gutter = Math\.max\(8, vr\.width - 8\)/, 'スマホは右余白を通す');
  assert.match(app2, /scrollJaIntoView\(ja\)/, '訳が見切れるときだけ自動スクロール');
  assert.match(block, /scrollJaIntoView/, 'スクロール補助がある');
  assert.match(block, /is-selected/, '選択は1ペアだけ強調');
});

test('app9 PDF生成: CDN script timeoutとhtml2canvas watchdogでcallback一回・zoom復元・送信開始なし', async () => {
  const app9 = readSiteFile('app9/index.html');
  const block = extractBetween(app9, '// TESTABLE-PDFGEN-START', '// TESTABLE-PDFGEN-END');
  let now = 0;
  let timerId = 0;
  let timers = [];
  const scripts = [];
  const document = {
    createElement: () => {
      const node = {
        removed: false,
        remove() { this.removed = true; }
      };
      scripts.push(node);
      return node;
    },
    head: { appendChild() {} }
  };
  const window = { __loadedScripts: {}, jspdf: { jsPDF: function () { throw new Error('should not render after timeout'); } } };
  const sheet = { style: { zoom: '0.8' } };
  let resolveCanvas = null;
  let html2canvasCalls = 0;
  const sandbox = {
    window,
    document,
    sheet,
    setTimeout: (fn, ms) => {
      const id = ++timerId;
      timers.push({ id, fn, at: now + Number(ms || 0) });
      return id;
    },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    html2canvas: () => {
      html2canvasCalls++;
      return new Promise((resolve) => { resolveCanvas = resolve; });
    },
    Promise,
    Error,
    String,
    Number,
    Math,
    console
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(block + '\n;globalThis.__loadScriptOnce = loadScriptOnce; globalThis.__makePdf = makePdf;', ctx);

  function advanceNext() {
    if (!timers.length) return false;
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers.shift();
    now = Math.max(now, t.at);
    t.fn();
    return true;
  }

  // CDN無応答: 20sでcallback一回、scriptを除去
  let loadCount = 0;
  let loadErr = null;
  ctx.__loadScriptOnce('https://cdn.example/x.js', (err) => { loadCount++; loadErr = err; });
  assert.strictEqual(loadCount, 0);
  advanceNext();
  assert.strictEqual(loadCount, 1);
  assert.match(loadErr.message, /load timeout/);
  assert.strictEqual(scripts[0].removed, true);
  // 遅れてonloadが来ても二重callbackしない
  scripts[0].onload && scripts[0].onload();
  assert.strictEqual(loadCount, 1);

  // script timeout中にmakePdfが終了 → 後からscriptがloadされても描画を始めない
  let earlyPdfCount = 0;
  let earlyPdfErr = null;
  ctx.__makePdf((err) => { earlyPdfCount++; earlyPdfErr = err; });
  const lateScript = scripts[scripts.length - 1];
  const lateOnload = lateScript.onload;
  advanceNext(); // 20s script timeout
  assert.strictEqual(earlyPdfCount, 1);
  assert.match(earlyPdfErr.message, /load timeout/);
  assert.strictEqual(sheet.style.zoom, '0.8', 'script timeoutでzoom復元');
  assert.strictEqual(html2canvasCalls, 0);
  if (lateOnload) lateOnload();
  assert.strictEqual(html2canvasCalls, 0, '完了後の遅いscript loadで描画を開始しない');
  assert.strictEqual(earlyPdfCount, 1);

  // html2canvas無応答: 90s watchdogでcallback一回、zoom復元、後の完了で送信しない
  window.__loadedScripts['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'] = true;
  window.__loadedScripts['https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'] = true;
  let pdfCount = 0;
  let pdfErr = null;
  ctx.__makePdf((err) => { pdfCount++; pdfErr = err; });
  assert.strictEqual(html2canvasCalls, 1);
  assert.strictEqual(sheet.style.zoom, 1, '描画中はzoom=1');
  advanceNext();
  assert.strictEqual(pdfCount, 1);
  assert.match(pdfErr.message, /タイムアウト/);
  assert.strictEqual(sheet.style.zoom, '0.8', 'timeoutでzoom復元');
  resolveCanvas({ width: 100, height: 100, toDataURL: () => 'data:image/jpeg;base64,AAA' });
  await wait(10);
  assert.strictEqual(pdfCount, 1, 'timeout後の遅い完了でPDF送信を開始しない');
});

test('script load: 4ページが同期helperを正しい相対path・順序で参照する', () => {
  const pageCases = [
    { file: 'index.html', src: './shared/transport.js', theme: './themes/theme.js', gis: true },
    { file: 'app2/index.html', src: '../shared/transport.js', theme: '../themes/theme.js', gis: true },
    { file: 'app9/index.html', src: '../shared/transport.js', theme: '../themes/theme.js', gis: true },
    { file: 'debug-probe.html', src: './shared/transport.js', theme: null, gis: false }
  ];
  for (const page of pageCases) {
    const html = readSiteFile(page.file);
    const headEnd = html.indexOf('</head>');
    assert.ok(headEnd > 0, page.file + ': headがある');
    const head = html.slice(0, headEnd);
    const tags = [];
    const re = /<script\b([^>]*)>/g;
    let m;
    while ((m = re.exec(head))) {
      const attrs = m[1] || '';
      const srcMatch = /src\s*=\s*["']([^"']+)["']/.exec(attrs);
      tags.push({ index: m.index, attrs, src: srcMatch ? srcMatch[1] : '' });
    }
    const transportTag = tags.find((t) => t.src === page.src);
    assert.ok(transportTag, page.file + ': headに' + page.src + 'がある');
    assert.ok(!/\basync\b|\bdefer\b/.test(transportTag.attrs), page.file + ': transportは同期load');
    assert.strictEqual((html.match(new RegExp('src=["\']' + page.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g')) || []).length, 1, page.file + ': transportの二重loadなし');

    if (page.theme) {
      const themeTag = tags.find((t) => t.src === page.theme);
      assert.ok(themeTag, page.file + ': theme scriptがある');
      assert.ok(themeTag.index < transportTag.index, page.file + ': themeの後にtransport');
    }
    if (page.gis) {
      const gisTag = tags.find((t) => t.src.indexOf('accounts.google.com/gsi/client') !== -1);
      assert.ok(gisTag, page.file + ': GIS scriptがある');
      assert.ok(gisTag.index < transportTag.index, page.file + ': GISの後にtransport');
    }
    // helperに依存するinline scriptは必ずtransportより後にある
    const inlineRe = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/g;
    let inline;
    while ((inline = inlineRe.exec(html))) {
      if (inline[1].indexOf('GakusyuTransport') !== -1) {
        assert.ok(transportTag.index < inline.index, page.file + ': inline scriptより先にtransport');
      }
    }
    // app9はfixture注入なしでもhelperを実参照できる
    if (page.file === 'app9/index.html') {
      assert.ok(html.indexOf('window.GakusyuTransport') !== -1, 'app9がhelperを実際に参照する');
    }
  }
});

test('app2 fPrompt: 1000文字上限がinput属性と説明・送信値に一致する', () => {
  const html = readSiteFile('app2/index.html');
  const tagMatch = /<textarea\b[^>]*id="fPrompt"[^>]*>/.exec(html);
  assert.ok(tagMatch, 'fPrompt textareaがある');
  assert.match(tagMatch[0], /maxlength="1000"/);
  const labelStart = html.lastIndexOf('<label for="fPrompt">', tagMatch.index);
  assert.ok(labelStart >= 0);
  const label = html.slice(labelStart, tagMatch.index);
  assert.match(label, /1000文字まで/);
  assert.ok(html.indexOf('1000文字を超えるとサーバーで受け付けられません') !== -1);
  assert.match(html, /prompt:\s*document\.getElementById\('fPrompt'\)\.value\.trim\(\)\.slice\(0,\s*1000\)/);
});

test('app2 delete handler: 連打で1操作だけ・finally解除・結果不明は同IDを保持（fakeDOM実行）', async () => {
  const app2 = readSiteFile('app2/index.html');
  const block = extractBetween(app2, '// TESTABLE-DELETE-START', '// TESTABLE-DELETE-END');
  const env = createEnv();
  loadTransport(env);
  const T = env.T;

  const calls = [];
  const toasts = [];
  let reloads = 0;
  let probes = 0;
  let confirmValue = true;
  let handler = null;
  const sandbox = {
    T,
    window: { confirm: () => confirmValue },
    callServer: (name, payload, requestId) => {
      calls.push({ name, payload, requestId });
      return handler(name, payload, requestId);
    },
    showToast: (msg, ms) => toasts.push({ msg, ms }),
    loadSavedList: () => { reloads++; },
    authUi: { lastAt: 1 },
    applyProbeToUI: () => { probes++; },
    console,
    Promise,
    Object,
    String,
    Error,
    setTimeout,
    clearTimeout
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(block + '\n;globalThis.__fn = deleteSavedItem; globalThis.__state = { deleteBusy, pendingDeletes };', ctx);
  const fn = ctx.__fn;
  const state = ctx.__state;

  // 3連打しても1回だけ（JS guard + disabled）
  let resolveFirst;
  handler = () => new Promise((resolve) => { resolveFirst = resolve; });
  const btn = { disabled: false };
  const p1 = fn({ id: 'tadoku-1' }, btn);
  const p2 = fn({ id: 'tadoku-1' }, btn);
  const p3 = fn({ id: 'tadoku-1' }, btn);
  assert.strictEqual(calls.length, 1, '同itemは1操作だけ');
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(state.deleteBusy.isBusy('tadoku-1'), true);
  resolveFirst({ ok: true });
  await Promise.all([p1, p2, p3]);
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(state.deleteBusy.isBusy('tadoku-1'), false);
  assert.strictEqual(reloads, 1);

  // 結果不明は同じrequest_idを保持して再確認する
  handler = () => Promise.reject(Object.assign(new Error('pending_unknown'), { unknownOperation: true }));
  await fn({ id: 'tadoku-2' }, { disabled: false });
  const firstRid = calls[calls.length - 1].requestId;
  assert.strictEqual(state.pendingDeletes['tadoku-2'], firstRid);
  handler = () => Promise.resolve({ ok: true });
  await fn({ id: 'tadoku-2' }, { disabled: false });
  assert.strictEqual(calls[calls.length - 1].requestId, firstRid, '同じ論理削除は同じrequest_id');
  assert.strictEqual(state.pendingDeletes['tadoku-2'], undefined, '成功で保持を解除');

  // 明示失敗は新IDでよい（保持を残さない）
  handler = () => Promise.reject(Object.assign(new Error('not allowed'), { unknownOperation: false }));
  await fn({ id: 'tadoku-3' }, { disabled: false });
  assert.strictEqual(state.pendingDeletes['tadoku-3'], undefined);
  assert.strictEqual(probes, 1, '認証系エラーは再probe導線');

  // キャンセルは送信せずbusyも残さない
  const beforeCancel = calls.length;
  confirmValue = false;
  const cancelBtn = { disabled: false };
  await fn({ id: 'tadoku-4' }, cancelBtn);
  assert.strictEqual(calls.length, beforeCancel);
  assert.strictEqual(cancelBtn.disabled, false);
  assert.strictEqual(state.deleteBusy.isBusy('tadoku-4'), false);

  // 別itemは並行可能、例外でもbusy解除
  handler = () => Promise.reject(new Error('boom'));
  const b1 = { disabled: false };
  const b2 = { disabled: false };
  await Promise.all([fn({ id: 'tadoku-5' }, b1), fn({ id: 'tadoku-6' }, b2)]);
  assert.strictEqual(b1.disabled, false);
  assert.strictEqual(b2.disabled, false);
  assert.strictEqual(state.deleteBusy.isBusy('tadoku-5'), false);
  assert.strictEqual(state.deleteBusy.isBusy('tadoku-6'), false);
  assert.ok(toasts.length >= 1);
});

test('app9 PDF: POST応答不明＋poll失敗はauthではなくunknownで終了しcooldownを起動する（fakeDOM/タイマー）', async () => {
  const app9 = readSiteFile('app9/index.html');
  const block = extractBetween(app9, '// TESTABLE-PDF-START', '// TESTABLE-PDF-END');

  async function runScenario(opts) {
    opts = opts || {};
    const env = createEnv();
    loadTransport(env);
    const T = env.T;
    const results = [];
    const statuses = [];
    let now = 1000000;
    let timerId = 0;
    let timers = [];
    const storage = new Map();
    const sandbox = {
      T: {
        messages: T.messages,
        newNonce: T.newNonce,
        isRequestId: T.isRequestId,
        postForm: () => (opts.postForm ? opts.postForm() : Promise.resolve({ ok: false, error: 'timeout' })),
        jsonp: () => (opts.jsonp ? opts.jsonp() : Promise.resolve({ ok: false, error: 'timeout' }))
      },
      CLASSROOM: { token: 'token' },
      WORKER_PDFDROP_URL: 'https://proxy.example/pdfdrop',
      DIRECT_PDFDROP_URL: 'https://script.google.com/exec',
      getIdToken: () => 'id-token',
      setStatus: (msg) => statuses.push(msg),
      sessionStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v))
      },
      setTimeout: (fn, ms) => {
        const id = ++timerId;
        timers.push({ id, fn, at: now + Number(ms || 0) });
        return id;
      },
      clearTimeout: (id) => {
        timers = timers.filter((t) => t.id !== id);
      },
      Date: { now: () => now },
      Promise,
      String,
      Number,
      parseInt,
      isFinite,
      Error,
      Object,
      console
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(block + '\n;globalThis.__sendPdf = sendPdfToClassroom; globalThis.__pdfState = function(){ return { pdfPendingUnknown: pdfPendingUnknown, pdfPendingUntil: pdfPendingUntil }; };', ctx);
    const donePromise = new Promise((resolve) => {
      ctx.__sendPdf('JVBERi0xLjQK', 'genkoshi_test.pdf', T.newRequestId(), (res) => {
        results.push(res);
        resolve(res);
      });
    });
    async function advance() {
      if (!timers.length) return false;
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = timers.shift();
      now = Math.max(now, t.at);
      t.fn();
      await wait(0);
      return true;
    }
    for (let i = 0; i < 80; i++) {
      await wait(0);
      if (results.length) break;
      if (!timers.length) break;
      await advance();
      await wait(0);
    }
    if (!results.length) await Promise.race([donePromise, wait(200)]);
    return { results, statuses, storage, state: ctx.__pdfState ? ctx.__pdfState() : null };
  }

  // POST timeout ×2 + poll timeout ×3: 以前はsilentStreakでauth確定→button再活性→新ID二重印刷
  const blocked = await runScenario();
  assert.strictEqual(blocked.results.length, 1);
  assert.strictEqual(blocked.results[0].ok, false);
  assert.strictEqual(blocked.results[0].unknown, true);
  assert.notStrictEqual(blocked.results[0].auth, true, 'poll失敗だけでauth確定しない');
  assert.strictEqual(blocked.storage.get('genko_pdf_pending_unknown'), '1', 'cooldown/confirmを起動');
  assert.strictEqual(blocked.state.pdfPendingUnknown, true);

  // POSTがまだ応答待ちの間にpollがbad tokenを返してもauth確定しない（POST保存の可能性）
  const postPending = await runScenario({
    postForm: () => new Promise(() => {}),
    jsonp: () => Promise.resolve({ ok: true, data: { genkoPoll: true, found: false, error: 'bad token' } })
  });
  assert.strictEqual(postPending.results.length, 1);
  assert.strictEqual(postPending.results[0].unknown, true);
  assert.notStrictEqual(postPending.results[0].auth, true);

  // POST timeout後、pollが明示bad tokenでも先行POSTが不明ならunknown優先
  const badToken = await runScenario({
    jsonp: () => Promise.resolve({ ok: true, data: { genkoPoll: true, found: false, error: 'bad token' } })
  });
  assert.strictEqual(badToken.results.length, 1);
  assert.strictEqual(badToken.results[0].unknown, true);
  assert.notStrictEqual(badToken.results[0].auth, true);

  // POSTが明示auth失敗（不明attemptなし）ならauth確定してよい
  const explicitAuth = await runScenario({
    postForm: () => Promise.resolve({ ok: true, data: { ok: false, error: 'not allowed', code: 'not_allowed' } })
  });
  assert.strictEqual(explicitAuth.results.length, 1);
  assert.strictEqual(explicitAuth.results[0].auth, true);
  assert.notStrictEqual(explicitAuth.results[0].unknown, true);
});

test('portal GIS retry: 失敗表示後も#gis-btnを作り直し、再試行で描画・同時initを抑止する（fakeDOM実行）', async () => {
  const html = readSiteFile('index.html');
  const start = html.indexOf('/* ---- 認証プローブ');
  assert.ok(start > 0, 'portal probe blockがある');
  const end = html.indexOf('\n  </script>', start);
  assert.ok(end > start);
  const code = html.slice(start, end);
  const dom = createMiniDom();
  const calls = { wait: 0, initialize: 0, render: 0 };
  let pendingResolve = null;
  let waitCount = 0;
  const T = {
    configure() {},
    getIdToken() { return ''; },
    setIdToken() {},
    onAuthChange() {},
    probeAuth() { return Promise.resolve({ status: 'noauth' }); },
    waitForGis() {
      calls.wait++;
      waitCount++;
      if (waitCount === 1) return Promise.resolve(false);
      return new Promise((resolve) => { pendingResolve = resolve; });
    }
  };
  const google = {
    accounts: {
      id: {
        initialize() { calls.initialize++; },
        renderButton(el) { calls.render++; el.__rendered = true; }
      }
    }
  };
  const sandbox = {
    document: dom.document,
    T: T,
    google: google,
    GIS_CLIENT_ID: 'mock-client-id',
    console,
    Promise,
    Date,
    Object,
    setTimeout,
    clearTimeout
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('this.window = this; this.GakusyuTransport = this.T; this.google = this.google;', ctx);
  vm.runInContext(code, ctx);
  await wait(10);

  assert.match(dom.banner.className, /is-warn/);
  assert.strictEqual(findNodeByText(dom.banner, 'Googleログインを読み込めませんでした') !== null, true);
  assert.ok(dom.byId.get('gis-btn'), '失敗表示でも描画先がある');
  assert.strictEqual(calls.wait, 1);

  // 再試行①: 失敗が続いてもボタン/描画先を再作成し、連打は1回に抑止
  const retry1 = findNodeByText(dom.banner, '再試行');
  assert.ok(retry1, '再試行ボタンがある');
  retry1.click();
  retry1.click();
  assert.strictEqual(calls.wait, 2, '同時initはgisPendingで抑止');
  pendingResolve(false);
  await wait(10);
  assert.strictEqual(calls.wait, 2);
  assert.ok(dom.byId.get('gis-btn'), '2回目の失敗でも描画先がある');
  const retry2 = findNodeByText(dom.banner, '再試行');
  assert.ok(retry2, '再試行ボタンが復旧する');

  // 再試行②: 成功してGISボタンを描画
  retry2.click();
  retry2.click();
  assert.strictEqual(calls.wait, 3, '2回目のretryも同時initしない');
  pendingResolve(true);
  await wait(10);
  assert.strictEqual(calls.initialize, 1);
  assert.strictEqual(calls.render, 1);
  assert.ok(dom.byId.get('gis-btn'));
  assert.strictEqual(dom.byId.get('gis-btn').__rendered, true);
  assert.strictEqual(findNodeByText(dom.banner, '再試行'), null, '成功後は再試行を消す');
});
