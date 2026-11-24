'use strict';

/**
 * site-worker/classroom-auth-api.mjs のオフライン回帰テスト。
 * 外部 API / GAS / D1 へは一切アクセスしない（node:sqlite 実SQL + mock fetch）。
 *
 * 実行: node scripts/tests/classroom-auth-api.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const API_ORIGIN = 'https://gakusyu-classroom-auth.hori-shota.workers.dev';
const SITE_ORIGIN = 'https://hori366191-ship-it.github.io';
const COOKIE = '__Host-gakusyu_session';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const CLIENT_SECRET = 'client-secret-value';
const KEY = Buffer.alloc(32, 7).toString('base64url');
const APP2_TOKEN = 'synthetic-app2-token';
const PDFDROP_TOKEN = 'synthetic-pdfdrop-token';
const T0 = 1_700_000_000;
const T0_MS = T0 * 1000;
const DAY = 24 * 60 * 60;

let apiModule;
let gatewayModule;

test.before(async () => {
  apiModule = await import('../../site-worker/classroom-auth-api.mjs');
  gatewayModule = await import('../../site-worker/classroom-gateway.mjs');
});

/* ------------------------------------------------------------------ *
 * DB
 * ------------------------------------------------------------------ */

function loadSchema(sqlite) {
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_classroom_sessions.sql', '0002_classroom_oauth.sql']) {
    sqlite.exec(fs.readFileSync(path.join(__dirname, '../../site-worker/session-migrations', file), 'utf8'));
  }
}

function d1(sqlite) {
  function wrap(sql) {
    return {
      bind(...params) {
        return {
          async first() {
            return sqlite.prepare(sql).get(...params) ?? null;
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...params) };
          },
          async run() {
            const result = sqlite.prepare(sql).run(...params);
            return { success: true, meta: { changes: Number(result.changes) } };
          },
        };
      },
    };
  }
  const db = {
    prepare: wrap,
    withSession() {
      return db;
    },
  };
  return db;
}

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature-not-verified-here`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/* ------------------------------------------------------------------ *
 * Google / GAS mock
 * ------------------------------------------------------------------ */

function createUpstreamDouble() {
  const calls = [];
  const state = {
    claims: null,
    idToken: null,
    refreshToken: 'refresh-token-1',
    omitRefreshToken: false,
    exchangeStatus: 200,
    tokeninfoOverrides: {},
    gasAllowed: true,
  };

  async function fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    calls.push({ url: String(input), method, body: init.body === undefined ? null : String(init.body) });

    if (url.origin + url.pathname === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(String(init.body || ''));
      if (params.get('grant_type') === 'authorization_code') {
        if (state.exchangeStatus !== 200) return jsonResponse({ error: 'invalid_grant' }, state.exchangeStatus);
        const body = {
          id_token: state.idToken,
          scope: 'openid email',
          token_type: 'Bearer',
          access_token: 'ignored-access-token',
        };
        if (!state.omitRefreshToken) body.refresh_token = state.refreshToken;
        return jsonResponse(body);
      }
      if (params.get('grant_type') === 'refresh_token') {
        const body = { id_token: state.idToken, scope: 'openid email', token_type: 'Bearer' };
        return jsonResponse(body);
      }
      return jsonResponse({ error: 'unsupported_grant' }, 400);
    }

    if (url.pathname === '/tokeninfo') {
      const token = url.searchParams.get('id_token') || '';
      let payload = {};
      try {
        payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      } catch {
        return jsonResponse({ error: 'invalid_token' }, 400);
      }
      return jsonResponse({ ...payload, ...state.tokeninfoOverrides });
    }

    if (url.hostname === 'script.google.com') {
      let body = {};
      try {
        body = JSON.parse(String(init.body || '{}'));
      } catch {
        body = {};
      }
      if (body.probe === 1) {
        return jsonResponse({
          genkoProbe: true,
          rid: body.rid,
          ok: true,
          allowed: state.gasAllowed,
          is_owner: true,
          open: true,
          classroom_guard: true,
        });
      }
      return jsonResponse({
        ok: true,
        rid: body.rid,
        request_id: body.request_id,
        name: 'saved-name',
        translation: 'translated-text',
      });
    }

    throw new Error('unexpected fetch: ' + url);
  }

  return { fetch, calls, state };
}

/* ------------------------------------------------------------------ *
 * setup / helpers
 * ------------------------------------------------------------------ */

async function setup(overrides = {}) {
  const sqlite = new DatabaseSync(':memory:');
  loadSchema(sqlite);
  const db = d1(sqlite);
  const upstream = createUpstreamDouble();
  let clockMs = T0_MS;

  const claims = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    email: 'person@example.com',
    email_verified: true,
    exp: T0 + 100 * DAY,
    iat: T0,
  };
  upstream.state.claims = claims;
  upstream.state.idToken = makeJwt(claims);

  const env = {
    CLASSROOM_DB: db,
    CLASSROOM_GOOGLE_CLIENT_ID: CLIENT_ID,
    CLASSROOM_GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    CLASSROOM_ENCRYPTION_KEY: KEY,
    CLASSROOM_APP2_TOKEN: APP2_TOKEN,
    CLASSROOM_PDFDROP_TOKEN: PDFDROP_TOKEN,
    CLASSROOM_CONTEXT_PEPPER: 'pepper',
    ...overrides,
  };

  const api = apiModule.createClassroomAuthApi(env, {
    fetchImpl: upstream.fetch,
    now: () => clockMs,
  });

  return {
    api,
    db,
    sqlite,
    upstream,
    env,
    sqliteRows: (sql, ...params) => sqlite.prepare(sql).all(...params),
    count(table) {
      return Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    },
    advance(seconds) {
      clockMs += seconds * 1000;
    },
  };
}

function apiRequest(pathname, body, options = {}) {
  const headers = {
    Origin: options.origin === undefined ? SITE_ORIGIN : options.origin,
    'X-Requested-With': options.xrw === undefined ? 'XmlHttpRequest' : options.xrw,
    'content-type': options.contentType || 'application/json',
    ...(options.headers || {}),
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete headers[key];
  }
  return new Request(API_ORIGIN + pathname, {
    method: options.method || 'POST',
    headers,
    body: options.method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
  });
}

async function post(api, pathname, body, options = {}) {
  return api.fetch(apiRequest(pathname, body, options));
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

function setCookies(response) {
  return typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
}

function findCookie(response, name) {
  return setCookies(response).find((value) => value.startsWith(name + '=')) || null;
}

function cookiePair(setCookie) {
  return setCookie ? setCookie.split(';')[0] : null;
}

async function login(ctx) {
  const response = await post(ctx.api, '/_classroom/popup-exchange', {
    code: '4/auth-code-1',
    redirect_uri: 'https://evil.example',
  });
  assert.equal(response.status, 200);
  const cookie = findCookie(response, COOKIE);
  assert.ok(cookie);
  return { response, cookie, pair: cookiePair(cookie) };
}

/* ------------------------------------------------------------------ *
 * 公開面 / CORS / 入力境界
 * ------------------------------------------------------------------ */

test('non-API origins, root and non-allowlisted paths are 404 without CORS', async () => {
  const ctx = await setup();
  for (const url of [
    'https://gakusyu-classroom-auth.pages.dev/',
    'https://gakusyu-classroom-auth.hori-shota.workers.dev.example.com/',
    API_ORIGIN + '/',
    API_ORIGIN + '/index.html',
    API_ORIGIN + '/_classroom/login',
    API_ORIGIN + '/_classroom/callback',
    API_ORIGIN + '/_classroom/unknown',
  ]) {
    const response = await ctx.api.fetch(new Request(url, { method: 'POST' }));
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get('access-control-allow-origin'), null, url);
  }
});

test('missing, opaque or wrong Origin is rejected; exact Origin + X-Requested-With is required', async () => {
  const ctx = await setup();
  const path = '/_classroom/status';

  for (const origin of [null, 'null', 'https://evil.example', API_ORIGIN, SITE_ORIGIN + '/']) {
    const response = await post(ctx.api, path, {}, { origin });
    assert.equal(response.status, 403, String(origin));
    assert.equal(response.headers.get('access-control-allow-origin'), null, String(origin));
  }

  const missingXrw = await post(ctx.api, path, {}, { xrw: null });
  assert.equal(missingXrw.status, 403);

  const wrongMethod = await post(ctx.api, path, undefined, { method: 'GET' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(wrongMethod.headers.get('access-control-allow-origin'), SITE_ORIGIN);
});

test('OPTIONS is strict and only answers the exact Pages origin', async () => {
  const ctx = await setup();
  const preflight = (headers) =>
    ctx.api.fetch(
      new Request(API_ORIGIN + '/_classroom/popup-exchange', { method: 'OPTIONS', headers }),
    );

  const ok = await preflight({
    Origin: SITE_ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type, x-requested-with',
  });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  assert.match(ok.headers.get('access-control-allow-methods'), /POST/);
  assert.match(ok.headers.get('access-control-allow-headers'), /x-requested-with/);
  assert.match(ok.headers.get('vary'), /Origin/);

  for (const headers of [
    { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    { Origin: SITE_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    {
      Origin: SITE_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization',
    },
  ]) {
    const response = await preflight(headers);
    assert.equal(response.status, 403);
  }

  const unknown = await ctx.api.fetch(
    new Request(API_ORIGIN + '/_classroom/login', {
      method: 'OPTIONS',
      headers: { Origin: SITE_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    }),
  );
  assert.equal(unknown.status, 404);
});

test('JSON content type and bounded body are enforced before any upstream call', async () => {
  const ctx = await setup();

  const notJson = await post(ctx.api, '/_classroom/popup-exchange', { code: 'x' }, {
    contentType: 'text/plain',
  });
  assert.equal(notJson.status, 415);
  assert.equal(notJson.headers.get('access-control-allow-origin'), SITE_ORIGIN);

  // application/json の prefix 一致だけでは通さない（jsonp 等を拒否）。
  const jsonp = await post(ctx.api, '/_classroom/popup-exchange', { code: 'x' }, {
    contentType: 'application/jsonp',
  });
  assert.equal(jsonp.status, 415);
  assert.equal(findCookie(jsonp, COOKIE), null);

  const declaredTooLarge = await ctx.api.fetch(
    new Request(API_ORIGIN + '/_classroom/popup-exchange', {
      method: 'POST',
      headers: {
        Origin: SITE_ORIGIN,
        'X-Requested-With': 'XmlHttpRequest',
        'content-type': 'application/json',
        'content-length': String(65 * 1024),
      },
      body: '{}',
    }),
  );
  assert.equal(declaredTooLarge.status, 413);

  const malformed = await ctx.api.fetch(
    new Request(API_ORIGIN + '/_classroom/popup-exchange', {
      method: 'POST',
      headers: {
        Origin: SITE_ORIGIN,
        'X-Requested-With': 'XmlHttpRequest',
        'content-type': 'application/json',
      },
      body: '{bad json',
    }),
  );
  assert.equal(malformed.status, 400);

  // Content-Length を付けないストリームでも実読取で打ち切る。
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(70 * 1024)));
      controller.close();
    },
  });
  const chunkedTooLarge = await ctx.api.fetch(
    new Request(API_ORIGIN + '/_classroom/popup-exchange', {
      method: 'POST',
      duplex: 'half',
      headers: {
        Origin: SITE_ORIGIN,
        'X-Requested-With': 'XmlHttpRequest',
        'content-type': 'application/json',
      },
      body: stream,
    }),
  );
  assert.equal(chunkedTooLarge.status, 413);
  assert.equal(ctx.upstream.calls.length, 0);

  // application/json の optional parameter（charset）は許可する。
  const accepted = await setup();
  const withCharset = await post(
    accepted.api,
    '/_classroom/popup-exchange',
    { code: '4/auth-code-1' },
    { contentType: 'application/json; charset=UTF-8' },
  );
  assert.equal(withCharset.status, 200);
  assert.ok(findCookie(withCharset, COOKIE));
});

test('missing D1 fails closed without issuing a cookie', async () => {
  const api = apiModule.createClassroomAuthApi(
    { CLASSROOM_GOOGLE_CLIENT_ID: CLIENT_ID, CLASSROOM_GOOGLE_CLIENT_SECRET: CLIENT_SECRET, CLASSROOM_ENCRYPTION_KEY: KEY },
    { fetchImpl: async () => jsonResponse({}) },
  );
  const response = await post(api, '/_classroom/status', {});
  assert.equal(response.status, 503);
  assert.equal(findCookie(response, COOKIE), null);

  // allowlist 外（root / 非 API）は DB 欠如でも 404。
  for (const pathname of ['/', '/index.html', '/_classroom/login']) {
    const notFound = await api.fetch(
      new Request(API_ORIGIN + pathname, {
        method: 'POST',
        headers: {
          Origin: SITE_ORIGIN,
          'X-Requested-With': 'XmlHttpRequest',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );
    assert.equal(notFound.status, 404, pathname);
    assert.equal(notFound.headers.get('access-control-allow-origin'), null, pathname);
  }
});

/* ------------------------------------------------------------------ *
 * popup-exchange
 * ------------------------------------------------------------------ */

test('popup-exchange exchanges only the code with a fixed site redirect_uri and issues a partitioned HttpOnly cookie', async () => {
  const ctx = await setup();
  const { response, cookie } = await login(ctx);

  assert.match(cookie, new RegExp('^' + COOKIE + '=[^;]+'));
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Partitioned/);
  assert.match(cookie, /Max-Age=7776000/);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');

  const body = await bodyOf(response);
  assert.deepEqual(body, { ok: true, authenticated: true });
  const text = JSON.stringify(body);
  assert.ok(!text.includes('auth-code-1'));
  assert.ok(!text.includes('refresh-token-1'));
  assert.ok(!text.includes(cookiePair(cookie).split('=')[1]));

  const tokenCall = ctx.upstream.calls.find(
    (call) => call.url === 'https://oauth2.googleapis.com/token',
  );
  assert.ok(tokenCall);
  const params = new URLSearchParams(tokenCall.body);
  assert.equal(params.get('code'), '4/auth-code-1');
  assert.equal(params.get('redirect_uri'), SITE_ORIGIN);
  assert.equal(params.get('client_id'), CLIENT_ID);
  assert.equal(params.get('grant_type'), 'authorization_code');
  assert.equal(params.get('code_verifier'), null);

  assert.equal(ctx.count('classroom_sessions'), 1);
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);
  const row = ctx.sqliteRows('SELECT * FROM classroom_oauth_credentials')[0];
  for (const value of Object.values(row)) {
    assert.ok(!String(value || '').includes('refresh-token-1'));
  }
});

test('popup-exchange fails closed when Google omits the refresh token, with a legacy fallback marker', async () => {
  const ctx = await setup();
  ctx.upstream.state.omitRefreshToken = true;

  const response = await post(ctx.api, '/_classroom/popup-exchange', { code: '4/auth-code-1' });
  assert.equal(response.status, 401);
  const body = await bodyOf(response);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'refresh_token_missing');
  assert.equal(body.fallback, 'legacy_gis');
  assert.equal(findCookie(response, COOKIE), null);
  assert.equal(ctx.count('classroom_sessions'), 0);
  assert.equal(ctx.count('classroom_oauth_credentials'), 0);
});

test('popup-exchange re-verifies every Google claim, subject consistency and the existing GAS probe', async () => {
  const cases = [
    { name: 'aud', overrides: { aud: 'other-client' }, status: 401, error: 'aud_mismatch' },
    { name: 'iss', overrides: { iss: 'https://evil.example' }, status: 401, error: 'iss_mismatch' },
    { name: 'exp', overrides: { exp: T0 - 1 }, status: 401, error: 'token_expired' },
    { name: 'email_verified', overrides: { email_verified: false }, status: 401, error: 'email_not_verified' },
  ];

  for (const item of cases) {
    const ctx = await setup();
    ctx.upstream.state.tokeninfoOverrides = item.overrides;
    const response = await post(ctx.api, '/_classroom/popup-exchange', { code: '4/auth-code-1' });
    assert.equal(response.status, item.status, item.name);
    assert.equal((await bodyOf(response)).error, item.error, item.name);
    assert.equal(findCookie(response, COOKIE), null, item.name);
    assert.equal(ctx.count('classroom_sessions'), 0, item.name);
  }

  const mismatch = await setup();
  const payload = { ...mismatch.upstream.state.claims, sub: 'sub-other' };
  mismatch.upstream.state.idToken = makeJwt(payload);
  // tokeninfo は sub-1 を返すが JWT payload は sub-other（不一致は拒否）。
  mismatch.upstream.state.tokeninfoOverrides = { sub: 'sub-1' };
  const mismatchRes = await post(mismatch.api, '/_classroom/popup-exchange', { code: '4/auth-code-1' });
  assert.equal(mismatchRes.status, 401);
  assert.equal((await bodyOf(mismatchRes)).error, 'sub_mismatch');
  assert.equal(mismatch.count('classroom_sessions'), 0);

  const denied = await setup();
  denied.upstream.state.gasAllowed = false;
  const deniedRes = await post(denied.api, '/_classroom/popup-exchange', { code: '4/auth-code-1' });
  assert.equal(deniedRes.status, 403);
  assert.equal((await bodyOf(deniedRes)).error, 'not_authorized');
  assert.equal(findCookie(deniedRes, COOKIE), null);
  assert.equal(denied.count('classroom_sessions'), 0);
});

/* ------------------------------------------------------------------ *
 * status / logout
 * ------------------------------------------------------------------ */

test('status reports only the stored session, never refreshes or extends it', async () => {
  const ctx = await setup();
  const before = await post(ctx.api, '/_classroom/status', {});
  assert.equal(before.status, 200);
  assert.deepEqual(await bodyOf(before), { ok: true, authenticated: false });
  assert.equal(findCookie(before, COOKIE), null);

  const { pair } = await login(ctx);
  const idleBefore = ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at;
  const tokenCalls = ctx.upstream.calls.length;

  const after = await post(ctx.api, '/_classroom/status', {}, { headers: { cookie: pair } });
  assert.equal(after.status, 200);
  assert.deepEqual(await bodyOf(after), { ok: true, authenticated: true });
  assert.equal(findCookie(after, COOKIE), null);
  assert.equal(ctx.upstream.calls.length, tokenCalls);
  assert.equal(
    ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at,
    idleBefore,
  );

  const duplicate = await post(ctx.api, '/_classroom/status', {}, { headers: { cookie: `${pair}; ${pair}` } });
  assert.equal(duplicate.status, 400);
  assert.equal((await bodyOf(duplicate)).error, 'duplicate_session_cookie');
});

test('logout deletes OAuth credentials, revokes the session and clears the partitioned cookie', async () => {
  const ctx = await setup();
  const { pair } = await login(ctx);

  const response = await post(ctx.api, '/_classroom/logout', {}, { headers: { cookie: pair } });
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { ok: true, authenticated: false });
  const cookie = findCookie(response, COOKIE);
  assert.ok(cookie);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Partitioned/);

  assert.equal(ctx.count('classroom_oauth_credentials'), 0);
  const session = ctx.sqliteRows('SELECT revoked_at FROM classroom_sessions')[0];
  assert.ok(Number(session.revoked_at) > 0);

  const status = await post(ctx.api, '/_classroom/status', {}, { headers: { cookie: pair } });
  assert.deepEqual(await bodyOf(status), { ok: true, authenticated: false });
});

/* ------------------------------------------------------------------ *
 * operations reuse
 * ------------------------------------------------------------------ */

test('probe/generate/translate reuse the gateway with the partitioned session and CORS', async () => {
  const ctx = await setup();
  const { pair } = await login(ctx);

  const probe = await post(
    ctx.api,
    '/_classroom/probe',
    { target: 'app2' },
    { headers: { cookie: pair } },
  );
  assert.equal(probe.status, 200);
  assert.equal(probe.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  assert.equal(probe.headers.get('cache-control'), 'no-store');
  assert.equal(findCookie(probe, COOKIE), null);
  const probeBody = await bodyOf(probe);
  assert.equal(probeBody.status, 'ok');
  assert.match(probeBody.context, /^[0-9a-f]{64}$/);

  const context = probeBody.context;
  ctx.advance(DAY);
  const idleBeforeGenerate = ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at;

  const generate = await post(
    ctx.api,
    '/_classroom/generate',
    {
      request_id: 'req-0123456789abcdef',
      rid: 'rid-0123456789',
      context,
      settings: { level: 'basic' },
    },
    { headers: { cookie: pair } },
  );
  assert.equal(generate.status, 200);
  assert.equal(generate.headers.get('access-control-allow-origin'), SITE_ORIGIN);
  const generateBody = await bodyOf(generate);
  assert.equal(generateBody.ok, true);
  assert.equal(generateBody.request_id, 'req-0123456789abcdef');

  const idleAfterGenerate = ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at;
  assert.ok(idleAfterGenerate > idleBeforeGenerate);

  ctx.advance(DAY);
  const idleBeforeTranslate = ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at;
  const translate = await post(
    ctx.api,
    '/_classroom/translate',
    {
      request_id: 'req-abcdef0123456789',
      rid: 'rid-abcdef0123',
      context,
      record_id: 'record-1',
    },
    { headers: { cookie: pair } },
  );
  assert.equal(translate.status, 200);
  const translateBody = await bodyOf(translate);
  assert.equal(translateBody.ok, true);

  assert.equal(
    ctx.sqliteRows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at,
    idleBeforeTranslate,
  );

  const gasCalls = ctx.upstream.calls.filter((call) => call.url.includes('script.google.com'));
  assert.ok(gasCalls.some((call) => String(call.body).includes('generateText')));
  assert.ok(gasCalls.some((call) => String(call.body).includes('translateText')));
});

test('operations reject duplicate session cookies before calling GAS', async () => {
  const ctx = await setup();
  const { pair } = await login(ctx);
  const before = ctx.upstream.calls.length;

  const response = await post(
    ctx.api,
    '/_classroom/probe',
    { target: 'app2' },
    { headers: { cookie: `${pair}; ${pair}` } },
  );
  assert.equal(response.status, 400);
  assert.equal((await bodyOf(response)).error, 'duplicate_session_cookie');
  assert.equal(ctx.upstream.calls.length, before);

  // 空値 + 有効値も同名 cookie の重複として拒否する。
  const emptyDuplicate = await post(
    ctx.api,
    '/_classroom/probe',
    { target: 'app2' },
    { headers: { cookie: `${COOKIE}=; ${pair}` } },
  );
  assert.equal(emptyDuplicate.status, 400);
  assert.equal((await bodyOf(emptyDuplicate)).error, 'duplicate_session_cookie');
  assert.equal(ctx.upstream.calls.length, before);

  // status も同じく重複を安全拒否する。
  const statusDuplicate = await post(
    ctx.api,
    '/_classroom/status',
    {},
    { headers: { cookie: `${COOKIE}=; ${pair}` } },
  );
  assert.equal(statusDuplicate.status, 400);
  assert.equal((await bodyOf(statusDuplicate)).error, 'duplicate_session_cookie');
});

test('unconfigured Google exchange fails closed with CORS and no cookie', async () => {
  const ctx = await setup({
    CLASSROOM_GOOGLE_CLIENT_ID: undefined,
    CLASSROOM_GOOGLE_CLIENT_SECRET: undefined,
    CLASSROOM_ENCRYPTION_KEY: undefined,
  });
  const response = await post(ctx.api, '/_classroom/popup-exchange', { code: '4/auth-code-1' });
  assert.equal(response.status, 503);
  assert.equal((await bodyOf(response)).error, 'auth_unavailable');
  assert.equal(findCookie(response, COOKIE), null);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE_ORIGIN);
});
