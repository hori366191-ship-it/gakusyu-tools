'use strict';

// 教室ログイン（OAuth/OIDC 境界）の回帰テスト（オフライン / node:sqlite 実SQL / mock fetch）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const loginModule = import('../../site-worker/classroom-login.mjs');
const sessionsModule = import('../../site-worker/classroom-sessions.mjs');
const logoutModule = import('../../site-worker/classroom-logout.mjs');

const ORIGIN = 'https://tools.example';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const CLIENT_SECRET = 'client-secret-value';
const KEY = Buffer.alloc(32, 7).toString('base64url');
const T0 = 1_700_000_000;
const T0_MS = T0 * 1000;
const DAY = 24 * 60 * 60;
const LOGOUT_PASSPHRASE = 'staff-passphrase-123';
const LOGOUT_SALT = Buffer.alloc(16, 3);
const LOGOUT_HASH = crypto.pbkdf2Sync(LOGOUT_PASSPHRASE, LOGOUT_SALT, 1000, 32, 'sha256');
const LOGOUT_HASH_VALUE =
  `pbkdf2-sha256$1000$${LOGOUT_SALT.toString('base64url')}$${LOGOUT_HASH.toString('base64url')}`;

/* ------------------------------------------------------------------ *
 * DB / 環境
 * ------------------------------------------------------------------ */

function loadSchema(sqlite) {
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_classroom_sessions.sql', '0002_classroom_oauth.sql']) {
    sqlite.exec(fs.readFileSync(path.join(__dirname, '../../site-worker/session-migrations', file), 'utf8'));
  }
}

/** node:sqlite を D1 風インターフェースで包む（実SQLを実行）。 */
function d1(sqlite) {
  const sessions = [];
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
    withSession(constraint) {
      sessions.push(constraint);
      return db;
    },
  };
  return { db, sessions };
}

function baseEnv(db) {
  return {
    CLASSROOM_DB: db,
    CLASSROOM_ORIGIN: ORIGIN,
    CLASSROOM_GOOGLE_CLIENT_ID: CLIENT_ID,
    CLASSROOM_GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    CLASSROOM_ENCRYPTION_KEY: KEY,
    CLASSROOM_LOGOUT_PASSPHRASE_HASH: LOGOUT_HASH_VALUE,
  };
}

/* ------------------------------------------------------------------ *
 * Google のモック
 * ------------------------------------------------------------------ */

const { publicKey: PUBLIC_KEY_1, privateKey: PRIVATE_KEY_1 } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const { publicKey: PUBLIC_KEY_2, privateKey: PRIVATE_KEY_2 } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const KID_1 = 'test-kid-1';
const KID_2 = 'test-kid-2';
const JWK_1 = { ...PUBLIC_KEY_1.export({ format: 'jwk' }), kid: KID_1, alg: 'RS256', use: 'sig' };
const JWK_2 = { ...PUBLIC_KEY_2.export({ format: 'jwk' }), kid: KID_2, alg: 'RS256', use: 'sig' };

function makeJwt(payload, { kid = KID_1, privateKey = PRIVATE_KEY_1, alg = 'RS256', header = {} } = {}) {
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg, typ: 'JWT', kid, ...header }),
  ).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature =
    alg === 'RS256'
      ? crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')
      : '';
  return `${signingInput}.${signature}`;
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function createGoogleDouble() {
  const calls = [];
  const state = {
    idToken: null,
    refreshToken: 'refresh-token-1',
    refreshIdToken: null,
    exchangeStatus: 200,
    refreshStatus: 200,
    jwks: { keys: [JWK_1] },
    jwksStatus: 200,
    jwksCacheControl: 'public, max-age=3600',
    onJwks: null,
    onRefresh: null,
    omitRefreshIdToken: false,
    refreshNetworkError: false,
    jwksNetworkError: false,
  };
  async function fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    calls.push({
      url: String(input),
      method,
      body: init.body === undefined ? null : String(init.body),
      hasSignal: Boolean(init.signal),
      signal: init.signal || null,
      cache: init.cache,
      hasCache: Object.prototype.hasOwnProperty.call(init, 'cache'),
      redirect: init.redirect,
    });

    if (url.origin + url.pathname === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(String(init.body || ''));
      const grant = params.get('grant_type');
      if (grant === 'authorization_code') {
        if (state.exchangeStatus !== 200) return jsonResponse({ error: 'invalid_grant' }, state.exchangeStatus);
        return jsonResponse({
          id_token: state.idToken,
          refresh_token: state.refreshToken,
          scope: 'openid email',
          token_type: 'Bearer',
          access_token: 'ignored-access-token',
          expires_in: 3599,
        });
      }
      if (grant === 'refresh_token') {
        if (state.onRefresh) await state.onRefresh();
        if (state.refreshNetworkError) throw new TypeError('fetch failed');
        if (state.refreshStatus !== 200) return jsonResponse({ error: 'invalid_grant' }, state.refreshStatus);
        const body = { scope: 'openid email', token_type: 'Bearer', access_token: 'ignored' };
        if (!state.omitRefreshIdToken) {
          if (state.refreshIdToken !== null) body.id_token = state.refreshIdToken;
          else if (state.idToken) body.id_token = state.idToken;
        }
        if (state.rotatedRefreshToken) body.refresh_token = state.rotatedRefreshToken;
        return jsonResponse(body);
      }
      return jsonResponse({ error: 'unsupported_grant' }, 400);
    }

    if (url.origin + url.pathname === 'https://www.googleapis.com/oauth2/v3/certs') {
      if (state.onJwks) await state.onJwks();
      if (state.jwksNetworkError) throw new TypeError('fetch failed');
      if (state.jwksStatus !== 200) return jsonResponse({ error: 'server_error' }, state.jwksStatus);
      return jsonResponse(state.jwks, 200, { 'cache-control': state.jwksCacheControl });
    }

    throw new Error('unexpected fetch: ' + url);
  }
  return { fetch, calls, state };
}

/* ------------------------------------------------------------------ *
 * セットアップ / 操作ヘルパー
 * ------------------------------------------------------------------ */

async function setup({ authorize, envOverrides } = {}) {
  const { createClassroomLogin } = await loginModule;
  const { resetLogoutThrottleForTests } = await logoutModule;
  resetLogoutThrottleForTests();
  const sqlite = new DatabaseSync(':memory:');
  loadSchema(sqlite);
  const { db, sessions } = d1(sqlite);
  const google = createGoogleDouble();
  let clockMs = T0_MS;
  const authorizeCalls = [];
  const env = { ...baseEnv(db), ...(envOverrides || {}) };
  const login = createClassroomLogin(env, {
    authorize: authorize === undefined ? async (ctx) => {
      authorizeCalls.push(ctx);
      return true;
    } : authorize,
    fetchImpl: google.fetch,
    now: () => clockMs,
    logoutDelayMs: 0,
  });
  return {
    sqlite,
    db,
    sessions,
    google,
    login,
    authorizeCalls,
    advance(seconds) {
      clockMs += seconds * 1000;
    },
    nowMs: () => clockMs,
    rows: (sql, ...params) => sqlite.prepare(sql).all(...params),
    count: (table) => Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseSetCookies(res) {
  return typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
}

function findCookie(res, name) {
  return parseSetCookies(res).find((value) => value.startsWith(name + '=')) || null;
}

function cookiePair(setCookie) {
  return setCookie ? setCookie.split(';')[0] : null;
}

async function startLogin(login, { returnTo = '/', origin = ORIGIN, field = 'return_to' } = {}) {
  const body = new URLSearchParams();
  if (returnTo !== undefined) body.set(field, returnTo);
  const request = new Request(`${ORIGIN}/_classroom/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const res = await login.handle(request);
  const location = res.headers.get('location') ? new URL(res.headers.get('location')) : null;
  const oauthCookie = findCookie(res, '__Host-classroom_oauth');
  return {
    res,
    location,
    state: location ? location.searchParams.get('state') : null,
    nonce: location ? location.searchParams.get('nonce') : null,
    cookie: cookiePair(oauthCookie),
  };
}

async function doCallback(login, { state, cookie, code = 'auth-code-1', extraQuery = '' }) {
  const query =
    `code=${encodeURIComponent(code)}&state=${encodeURIComponent(state ?? '')}` +
    (extraQuery ? '&' + extraQuery : '');
  const headers = cookie ? { cookie } : {};
  return login.handle(new Request(`${ORIGIN}/_classroom/callback?${query}`, { headers }));
}

function loginPayload(ctx, start, { sub = 'sub-1', email = 'person@example.com', overrides = {} } = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub,
    email,
    email_verified: true,
    exp: Math.floor(ctx.nowMs() / 1000) + 3600,
    iat: Math.floor(ctx.nowMs() / 1000),
    nonce: start.nonce,
    ...overrides,
  };
}

/** ログイン開始→Google 応答→callback まで通す。 */
async function fullLogin(ctx, options = {}) {
  const start = await startLogin(ctx.login, { returnTo: options.returnTo });
  const claims = loginPayload(ctx, start, options);
  ctx.google.state.idToken = makeJwt(claims, options.jwt || {});
  const res = await doCallback(ctx.login, { state: start.state, cookie: start.cookie });
  return { start, res, claims, sessionCookie: findCookie(res, '__Host-classroom_session') };
}

function authRequest(cookie) {
  return new Request(`${ORIGIN}/app2/`, cookie ? { headers: { cookie } } : {});
}

/** 不確定な認証失敗が credential を漏らさない安全な 503 エラーであること。 */
async function assertUnavailable(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'CLASSROOM_AUTH_UNAVAILABLE');
    assert.equal(error.status, 503);
    assert.match(error.message, /temporarily unavailable/);
    assert.equal(error.handle, undefined);
    assert.equal(error.subject, undefined);
    assert.equal(error.idToken, undefined);
    return true;
  });
}

function logoutRequest(
  ctx,
  cookie,
  { origin = ORIGIN, passphrase = LOGOUT_PASSPHRASE, ip = '203.0.113.1' } = {},
) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (origin !== null) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (ip) headers['cf-connecting-ip'] = ip;
  const body = new URLSearchParams({ return_to: '/' });
  if (passphrase !== undefined && passphrase !== null) body.set('passphrase', passphrase);
  return ctx.login.handle(
    new Request(`${ORIGIN}/_classroom/logout`, { method: 'POST', headers, body: body.toString() }),
  );
}

/* ------------------------------------------------------------------ *
 * スキーマ
 * ------------------------------------------------------------------ */

test('migration binds OAuth credentials to the session handle with ON DELETE CASCADE', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../site-worker/session-migrations/0002_classroom_oauth.sql'),
    'utf8',
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS classroom_oauth_credentials/);
  assert.match(sql, /handle_hash TEXT PRIMARY KEY\s+REFERENCES classroom_sessions \(handle_hash\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS classroom_oauth_states/);
  assert.match(sql, /state_hash TEXT PRIMARY KEY/);
  assert.match(sql, /consumed_at INTEGER/);
  assert.match(sql, /expires_at INTEGER NOT NULL/);
});

/* ------------------------------------------------------------------ *
 * login
 * ------------------------------------------------------------------ */

test('login returns a Google authorization redirect with state, nonce and PKCE, and stores only hashes', async () => {
  const ctx = await setup();
  const start = await startLogin(ctx.login, { returnTo: '/app2/' });

  assert.equal(start.res.status, 303);
  assert.equal(start.location.origin, 'https://accounts.google.com');
  assert.equal(start.location.pathname, '/o/oauth2/v2/auth');
  const params = start.location.searchParams;
  assert.equal(params.get('client_id'), CLIENT_ID);
  assert.equal(params.get('redirect_uri'), `${ORIGIN}/_classroom/callback`);
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('scope'), 'openid email');
  assert.equal(params.get('include_granted_scopes'), null);
  assert.equal(params.get('access_type'), 'offline');
  assert.equal(params.get('prompt'), 'consent');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.ok((params.get('state') || '').length >= 40);
  assert.ok((params.get('nonce') || '').length >= 40);
  assert.ok((params.get('code_challenge') || '').length >= 40);
  assert.equal(start.res.headers.get('cache-control'), 'no-store');

  const oauthCookie = findCookie(start.res, '__Host-classroom_oauth');
  assert.ok(oauthCookie);
  assert.match(oauthCookie, /^__Host-classroom_oauth=[^;]+\.[^;]+;/);
  assert.match(oauthCookie, /Path=\//);
  assert.match(oauthCookie, /Secure/);
  assert.match(oauthCookie, /HttpOnly/);
  assert.match(oauthCookie, /SameSite=Lax/);
  assert.match(oauthCookie, /Max-Age=600/);

  const rows = ctx.rows('SELECT * FROM classroom_oauth_states');
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.state_hash, sha256(params.get('state')));
  assert.notEqual(row.state_hash, params.get('state'));
  assert.equal(row.nonce_hash, sha256(params.get('nonce')));
  assert.equal(row.return_to, '/app2/');
  assert.equal(row.created_at, T0);
  assert.equal(row.expires_at, T0 + 600);
  assert.equal(row.consumed_at, null);
  for (const column of ['verifier_cipher', 'verifier_iv', 'verifier_tag']) {
    assert.match(row[column], /^[A-Za-z0-9_-]+$/, column);
  }
  // PKCE verifier は平文では保存されない
  assert.ok(!Object.values(row).includes(params.get('code_challenge')));
});

test('login rejects wrong methods and cross-origin POSTs, and falls back to / for non-allowlisted return_to', async () => {
  const ctx = await setup();
  const forbidden = [
    { origin: null },
    { origin: 'https://evil.example' },
    { origin: 'http://tools.example' },
    { origin: `${ORIGIN}/` },
  ];
  for (const { origin } of forbidden) {
    const res = await startLogin(ctx.login, { origin });
    assert.equal(res.res.status, 403, String(origin));
    assert.equal(res.res.headers.get('cache-control'), 'no-store');
    assert.equal(res.res.headers.get('location'), null);
  }

  const getRes = await ctx.login.handle(
    new Request(`${ORIGIN}/_classroom/login`, { method: 'GET', headers: { origin: ORIGIN } }),
  );
  assert.equal(getRes.status, 405);

  for (const returnTo of [
    'https://evil.example/app2/',
    '//evil.example/',
    '/app2/../etc/',
    '/app9/?x=1',
    'javascript:alert(1)',
    '',
  ]) {
    const { res } = await startLogin(ctx.login, { returnTo });
    assert.equal(res.status, 303, String(returnTo));
    const row = ctx.rows('SELECT return_to FROM classroom_oauth_states ORDER BY created_at DESC LIMIT 1')[0];
    assert.equal(row.return_to, '/', String(returnTo));
  }

  const allowed = await startLogin(ctx.login, { returnTo: '/app9/' });
  assert.equal(allowed.res.status, 303);
  assert.equal(
    ctx.rows('SELECT return_to FROM classroom_oauth_states ORDER BY rowid DESC LIMIT 1')[0].return_to,
    '/app9/',
  );
});

test('login fails closed when configuration is missing or invalid', async () => {
  const { createClassroomLogin } = await loginModule;
  const sqlite = new DatabaseSync(':memory:');
  loadSchema(sqlite);
  const { db } = d1(sqlite);
  const valid = baseEnv(db);

  const broken = [
    undefined,
    { ...valid, CLASSROOM_DB: undefined },
    { ...valid, CLASSROOM_ORIGIN: 'http://tools.example' },
    { ...valid, CLASSROOM_ORIGIN: ORIGIN + '/' },
    { ...valid, CLASSROOM_ORIGIN: ORIGIN + '/path' },
    { ...valid, CLASSROOM_GOOGLE_CLIENT_ID: '' },
    { ...valid, CLASSROOM_GOOGLE_CLIENT_SECRET: '', CLASSROOM_SECRET: '' },
    { ...valid, CLASSROOM_ENCRYPTION_KEY: Buffer.alloc(31, 1).toString('base64url') },
    { ...valid, CLASSROOM_ENCRYPTION_KEY: 'not-base64url!!' },
  ];
  for (const env of broken) {
    const login = createClassroomLogin(env, { fetchImpl: async () => jsonResponse({}), now: () => T0_MS });
    const res = await login.handle(
      new Request(`${ORIGIN}/_classroom/login`, {
        method: 'POST',
        headers: { origin: ORIGIN },
        body: 'return_to=%2F',
      }),
    );
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('location'), null);
    assert.equal(findCookie(res, '__Host-classroom_oauth'), null);
    // cookie 無しの匿名表示は null、cookie 有りは不確定として 503 相当の例外
    assert.equal(await login.authenticate(authRequest(null)), null);
    await assertUnavailable(login.authenticate(authRequest('__Host-classroom_session=abc')));
  }

  // CLASSROOM_SECRET は client secret の別名として使える
  const aliasEnv = { ...valid };
  delete aliasEnv.CLASSROOM_GOOGLE_CLIENT_SECRET;
  aliasEnv.CLASSROOM_SECRET = 'alias-secret';
  const alias = createClassroomLogin(aliasEnv, { fetchImpl: async () => jsonResponse({}), now: () => T0_MS });
  const aliasRes = await alias.handle(
    new Request(`${ORIGIN}/_classroom/login`, { method: 'POST', headers: { origin: ORIGIN }, body: '' }),
  );
  assert.equal(aliasRes.status, 303);
});

/* ------------------------------------------------------------------ *
 * callback: 正常系
 * ------------------------------------------------------------------ */

test('callback verifies the token, issues a __Host- session cookie and stores encrypted credentials', async () => {
  const ctx = await setup();
  const { res, claims, start, sessionCookie } = await fullLogin(ctx, { returnTo: '/app9/' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app9/');
  assert.equal(res.headers.get('cache-control'), 'no-store');

  assert.ok(sessionCookie);
  assert.match(sessionCookie, /^__Host-classroom_session=[0-9a-f]{64};/);
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.match(sessionCookie, /Max-Age=7776000/);

  const oauthClear = findCookie(res, '__Host-classroom_oauth');
  assert.ok(oauthClear);
  assert.match(oauthClear, /Max-Age=0/);

  // authorize は発行前に idToken/subject/email で一度だけ呼ばれる
  assert.equal(ctx.authorizeCalls.length, 1);
  assert.deepEqual(Object.keys(ctx.authorizeCalls[0]).sort(), ['email', 'idToken', 'subject']);
  assert.equal(ctx.authorizeCalls[0].subject, 'sub-1');
  assert.equal(ctx.authorizeCalls[0].email, 'person@example.com');
  assert.equal(ctx.authorizeCalls[0].idToken, ctx.google.state.idToken);

  const sessionRows = ctx.rows('SELECT * FROM classroom_sessions');
  assert.equal(sessionRows.length, 1);
  assert.equal(sessionRows[0].subject, 'sub-1');
  assert.equal(sessionRows[0].revoked_at, null);

  const credentials = ctx.rows('SELECT * FROM classroom_oauth_credentials');
  assert.equal(credentials.length, 1);
  const row = credentials[0];
  assert.equal(row.handle_hash, sha256(sessionCookie.split(';')[0].split('=')[1]));
  assert.equal(row.subject, 'sub-1');
  assert.equal(row.email, undefined, 'email must not be persisted');
  assert.equal(row.id_token_expires_at, claims.exp);
  assert.ok(row.refresh_token_cipher && row.refresh_token_iv && row.refresh_token_tag);
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes('person@example.com'), 'email must not be persisted in plaintext');
  assert.ok(!serialized.includes('refresh-token-1'), 'refresh token must not be stored in plaintext');
  assert.ok(!serialized.includes(ctx.google.state.idToken), 'id token must not be stored in plaintext');
  const columns = ctx.rows('PRAGMA table_info(classroom_oauth_credentials)').map((column) => column.name);
  assert.ok(!columns.includes('email'), 'credentials table must not have an email column');

  // token exchange / JWKS は固定 HTTPS エンドポイントへ
  const tokenCall = ctx.google.calls.find((call) => call.url === 'https://oauth2.googleapis.com/token');
  assert.ok(tokenCall);
  const tokenParams = new URLSearchParams(tokenCall.body);
  assert.equal(tokenParams.get('grant_type'), 'authorization_code');
  assert.equal(tokenParams.get('code'), 'auth-code-1');
  assert.equal(tokenParams.get('redirect_uri'), `${ORIGIN}/_classroom/callback`);
  assert.equal(tokenParams.get('client_id'), CLIENT_ID);
  assert.equal(tokenParams.get('client_secret'), CLIENT_SECRET);
  assert.equal((tokenParams.get('code_verifier') || '').length, 43);
  assert.ok(!tokenCall.body.includes(start.state));

  assert.ok(ctx.google.calls.some((call) => call.url === 'https://www.googleapis.com/oauth2/v3/certs'));

  const auth = await ctx.login.authenticate(authRequest(cookiePair(sessionCookie)));
  assert.ok(auth);
  assert.equal(auth.handle, sessionCookie.split(';')[0].split('=')[1]);
  assert.equal(auth.subject, 'sub-1');
  assert.equal(auth.idToken, ctx.google.state.idToken);
  // authenticate は延長しない
  assert.equal(Number(ctx.rows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at), T0 + 30 * DAY);
});

/* ------------------------------------------------------------------ *
 * callback: 拒否系
 * ------------------------------------------------------------------ */

test('callback is single-use, cookie-bound and expires after ten minutes', async () => {
  const ctx = await setup();
  const start = await startLogin(ctx.login);
  ctx.google.state.idToken = makeJwt(loginPayload(ctx, start));

  const ok = await doCallback(ctx.login, { state: start.state, cookie: start.cookie });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/');
  assert.ok(findCookie(ok, '__Host-classroom_session'));

  const replay = await doCallback(ctx.login, { state: start.state, cookie: start.cookie });
  assert.equal(replay.status, 303);
  assert.match(replay.headers.get('location'), /^\/\?login_error=state_rejected/);
  assert.equal(findCookie(replay, '__Host-classroom_session'), null);
  assert.equal(ctx.count('classroom_sessions'), 1);

  // cookie 無し / state 不一致は state を消費しない
  const noCookie = await doCallback(ctx.login, { state: start.state, cookie: null });
  assert.match(noCookie.headers.get('location'), /login_error=invalid_callback/);

  const second = await startLogin(ctx.login);
  const mismatched = await doCallback(ctx.login, {
    state: second.state,
    cookie: `__Host-classroom_oauth=${start.state}.${second.nonce}`,
  });
  assert.match(mismatched.headers.get('location'), /login_error=state_mismatch/);
  assert.equal(
    ctx.rows('SELECT consumed_at FROM classroom_oauth_states WHERE state_hash = ?', sha256(second.state))[0].consumed_at,
    null,
  );
  ctx.google.state.idToken = makeJwt(loginPayload(ctx, second));
  const recovered = await doCallback(ctx.login, { state: second.state, cookie: second.cookie });
  assert.equal(recovered.headers.get('location'), '/');

  // 期限切れ state
  const stale = await startLogin(ctx.login);
  ctx.advance(601);
  const expired = await doCallback(ctx.login, { state: stale.state, cookie: stale.cookie });
  assert.match(expired.headers.get('location'), /login_error=state_rejected/);

  const unknown = await doCallback(ctx.login, { state: 'x'.repeat(43), cookie: `__Host-classroom_oauth=${'x'.repeat(43)}.${'y'.repeat(43)}` });
  assert.match(unknown.headers.get('location'), /login_error=state_rejected/);
  assert.equal(ctx.count('classroom_sessions'), 2);
});

test('successful login returns to the exact allowlisted app route (原稿用紙 / 学習プリント) or /', async () => {
  const cases = [
    ['/app9/', '/app9/'],
    ['/app12/', '/app12/'],
    ['/app2/', '/app2/'],
    ['/', '/'],
    ['/app12/?print=1', '/'],
    ['/app99/', '/'],
    ['https://evil.example/app12/', '/'],
  ];
  for (const [returnTo, expected] of cases) {
    const ctx = await setup();
    const { res } = await fullLogin(ctx, { returnTo });
    assert.equal(res.status, 303, returnTo);
    assert.equal(res.headers.get('location'), expected, returnTo);
    assert.ok(findCookie(res, '__Host-classroom_session'), returnTo);
    assert.equal(ctx.count('classroom_sessions'), 1, returnTo);
    assert.equal(ctx.count('classroom_oauth_credentials'), 1, returnTo);
    assert.equal(
      ctx.rows('SELECT return_to FROM classroom_oauth_states')[0].return_to,
      expected,
      returnTo,
    );
  }
});

test('callback rejects nonce mismatch and any unverified Google claim without issuing a session', async () => {
  const variants = [
    { name: 'nonce', overrides: { nonce: 'a-different-nonce' } },
    { name: 'aud', overrides: { aud: 'someone-else.apps.googleusercontent.com' } },
    { name: 'iss', overrides: { iss: 'https://evil.example' } },
    { name: 'iss-missing', overrides: { iss: 'accounts.evil.example' } },
    { name: 'exp', overrides: { exp: T0 - 1 } },
    { name: 'email_verified', overrides: { email_verified: false } },
    { name: 'sub', overrides: { sub: '' } },
    { name: 'email', overrides: { email: '' } },
  ];
  for (const variant of variants) {
    const ctx = await setup();
    const { res } = await fullLogin(ctx, { overrides: variant.overrides });
    assert.equal(res.status, 303, variant.name);
    assert.match(res.headers.get('location'), /login_error=/, variant.name);
    assert.equal(findCookie(res, '__Host-classroom_session'), null, variant.name);
    assert.equal(ctx.count('classroom_sessions'), 0, variant.name);
    assert.equal(ctx.count('classroom_oauth_credentials'), 0, variant.name);
  }

  // JWKS が 200 以外なら拒否（fail closed）
  const ctx = await setup();
  const start = await startLogin(ctx.login);
  ctx.google.state.idToken = makeJwt(loginPayload(ctx, start));
  ctx.google.state.jwksStatus = 500;
  const res = await doCallback(ctx.login, { state: start.state, cookie: start.cookie });
  assert.match(res.headers.get('location'), /login_error=jwks_http_server/);
  assert.equal(ctx.count('classroom_sessions'), 0);
});

test('JWKS verifies RS256, rejects tampering/none, and refetches exactly once for an unknown kid', async () => {
  // payload 改ざん（署名は元のまま）
  const tampered = await setup();
  const tamperedStart = await startLogin(tampered.login);
  const valid = makeJwt(loginPayload(tampered, tamperedStart));
  const [header, , signature] = valid.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...loginPayload(tampered, tamperedStart), sub: 'sub-evil' }),
  ).toString('base64url');
  tampered.google.state.idToken = `${header}.${forgedPayload}.${signature}`;
  const tamperedRes = await doCallback(tampered.login, {
    state: tamperedStart.state,
    cookie: tamperedStart.cookie,
  });
  assert.match(tamperedRes.headers.get('location'), /login_error=signature_invalid/);
  assert.equal(tampered.count('classroom_sessions'), 0);

  // alg=none
  const none = await setup();
  const noneStart = await startLogin(none.login);
  none.google.state.idToken = makeJwt(loginPayload(none, noneStart), { alg: 'none' });
  const noneRes = await doCallback(none.login, { state: noneStart.state, cookie: noneStart.cookie });
  assert.match(noneRes.headers.get('location'), /login_error=alg_rejected/);
  assert.equal(none.count('classroom_sessions'), 0);

  // 未知 kid → 1 回だけ再取得し、2 回目の JWKS に新鍵があれば成功
  const rotated = await setup();
  const rotatedStart = await startLogin(rotated.login);
  rotated.google.state.idToken = makeJwt(loginPayload(rotated, rotatedStart), {
    kid: KID_2,
    privateKey: PRIVATE_KEY_2,
  });
  let rotatedCalls = 0;
  rotated.google.state.onJwks = async () => {
    rotatedCalls += 1;
    if (rotatedCalls === 2) rotated.google.state.jwks = { keys: [JWK_1, JWK_2] };
  };
  const rotatedRes = await doCallback(rotated.login, {
    state: rotatedStart.state,
    cookie: rotatedStart.cookie,
  });
  assert.equal(rotatedRes.headers.get('location'), '/');
  assert.equal(rotatedCalls, 2);
  assert.equal(rotated.count('classroom_sessions'), 1);

  // 再取得しても無ければ 401 key_not_found（再取得は 1 回だけ）
  const unknown = await setup();
  const unknownStart = await startLogin(unknown.login);
  unknown.google.state.idToken = makeJwt(loginPayload(unknown, unknownStart), {
    kid: 'unknown-kid',
    privateKey: PRIVATE_KEY_2,
  });
  let unknownCalls = 0;
  unknown.google.state.onJwks = async () => {
    unknownCalls += 1;
  };
  const unknownRes = await doCallback(unknown.login, {
    state: unknownStart.state,
    cookie: unknownStart.cookie,
  });
  assert.match(unknownRes.headers.get('location'), /login_error=key_not_found/);
  assert.equal(unknownCalls, 2);
  assert.equal(unknown.count('classroom_sessions'), 0);
});

test('JWKS cache avoids refetching within the max-age window (including a 5 minute floor)', async () => {
  const ctx = await setup();
  ctx.google.state.jwksCacheControl = 'max-age=0';
  await fullLogin(ctx);
  await fullLogin(ctx);
  const certCalls = ctx.google.calls.filter(
    (call) => call.url === 'https://www.googleapis.com/oauth2/v3/certs',
  ).length;
  assert.equal(certCalls, 1);
});

test('callback requires authorize before the first issue and fails closed when it is absent, denies or throws', async () => {
  for (const authorize of [null, async () => false, async () => { throw new Error('probe down'); }]) {
    const ctx = await setup({ authorize });
    const { res } = await fullLogin(ctx);
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location'), /login_error=not_authorized/);
    assert.equal(findCookie(res, '__Host-classroom_session'), null);
    assert.equal(ctx.count('classroom_sessions'), 0);
    assert.equal(ctx.count('classroom_oauth_credentials'), 0);
  }
});

test('callback fails closed when the code exchange fails or returns no refresh token', async () => {
  const failed = await setup();
  failed.google.state.exchangeStatus = 400;
  const start = await startLogin(failed.login);
  failed.google.state.idToken = makeJwt(loginPayload(failed, start));
  const res = await doCallback(failed.login, { state: start.state, cookie: start.cookie });
  assert.match(res.headers.get('location'), /login_error=code_exchange_failed/);
  assert.equal(failed.count('classroom_sessions'), 0);
  assert.equal(failed.count('classroom_oauth_credentials'), 0);

  const noRefresh = await setup();
  noRefresh.google.state.refreshToken = null;
  const start2 = await startLogin(noRefresh.login);
  noRefresh.google.state.idToken = makeJwt(loginPayload(noRefresh, start2));
  const res2 = await doCallback(noRefresh.login, { state: start2.state, cookie: start2.cookie });
  assert.match(res2.headers.get('location'), /login_error=refresh_token_missing/);
  assert.equal(noRefresh.count('classroom_sessions'), 0);
});

/* ------------------------------------------------------------------ *
 * authenticate / refresh
 * ------------------------------------------------------------------ */

test('authenticate returns null for absent or expired sessions, fails closed for broken credentials, and never extends', async () => {
  const ctx = await setup();
  assert.equal(await ctx.login.authenticate(authRequest(null)), null);
  assert.equal(await ctx.login.authenticate(authRequest('__Host-classroom_session=' + 'a'.repeat(64))), null);

  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const session = await ctx.login.authenticate(authRequest(cookie));
  assert.ok(session);
  ctx.advance(10 * DAY);
  assert.equal(Number(ctx.rows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at), T0 + 30 * DAY);

  // セッションは有効なのに資格情報が無い状態は「不明」なので 503 相当
  ctx.sqlite.prepare('DELETE FROM classroom_oauth_credentials').run();
  await assertUnavailable(ctx.login.authenticate(authRequest(cookie)));
});

test('authenticate refreshes an expired id_token for the same subject only', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const handle = sessionCookie.split(';')[0].split('=')[1];
  const originalExpiry = Number(ctx.rows('SELECT id_token_expires_at FROM classroom_oauth_credentials')[0].id_token_expires_at);

  ctx.advance(2 * 60 * 60);
  const refreshedClaims = {
    iss: 'accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    email: 'person@example.com',
    email_verified: true,
    iat: Math.floor(ctx.nowMs() / 1000),
    exp: Math.floor(ctx.nowMs() / 1000) + 3600,
  };
  ctx.google.state.refreshIdToken = makeJwt(refreshedClaims);
  ctx.google.state.rotatedRefreshToken = 'refresh-token-2';
  ctx.google.calls.length = 0;

  const auth = await ctx.login.authenticate(authRequest(cookie));
  assert.ok(auth);
  assert.equal(auth.subject, 'sub-1');
  assert.equal(auth.idToken, ctx.google.state.refreshIdToken);

  const refreshCall = ctx.google.calls.find((call) => call.url === 'https://oauth2.googleapis.com/token');
  assert.ok(refreshCall);
  const params = new URLSearchParams(refreshCall.body);
  assert.equal(params.get('grant_type'), 'refresh_token');
  assert.equal(params.get('refresh_token'), 'refresh-token-1');
  assert.equal(params.get('client_secret'), CLIENT_SECRET);

  const row = ctx.rows('SELECT * FROM classroom_oauth_credentials WHERE handle_hash = ?', sha256(handle))[0];
  assert.notEqual(Number(row.id_token_expires_at), originalExpiry);
  assert.equal(Number(row.id_token_expires_at), refreshedClaims.exp);
  assert.ok(!JSON.stringify(row).includes('refresh-token-2'));
  assert.ok(row.refresh_token_cipher);

  // 期限切れ id_token のまま（refresh しない）経路でも cookie は 90日固定
  assert.match(sessionCookie, /Max-Age=7776000/);
});

test('refreshed tokens fail closed: clear invalid_grant/subject mismatch -> null, transient/uncertain -> 503', async () => {
  const clearCases = [
    {
      name: 'subject changed',
      prepare(ctx) {
        ctx.google.state.refreshIdToken = makeJwt({
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          sub: 'sub-2',
          email: 'other@example.com',
          email_verified: true,
          iat: Math.floor(ctx.nowMs() / 1000),
          exp: Math.floor(ctx.nowMs() / 1000) + 3600,
        });
      },
    },
    { name: 'refresh rejected (400 invalid_grant)', prepare(ctx) { ctx.google.state.refreshStatus = 400; } },
    { name: 'refresh rejected (401)', prepare(ctx) { ctx.google.state.refreshStatus = 401; } },
    {
      name: 'expired refreshed token',
      prepare(ctx) {
        ctx.google.state.refreshIdToken = makeJwt({
          iss: 'https://accounts.google.com',
          aud: CLIENT_ID,
          sub: 'sub-1',
          email: 'person@example.com',
          email_verified: true,
          iat: Math.floor(ctx.nowMs() / 1000),
          exp: Math.floor(ctx.nowMs() / 1000),
        });
      },
    },
    {
      name: 'claim mismatch',
      prepare(ctx) {
        ctx.google.state.refreshIdToken = makeJwt({
          iss: 'https://accounts.google.com',
          aud: 'other-client.apps.googleusercontent.com',
          sub: 'sub-1',
          email: 'person@example.com',
          email_verified: true,
          iat: Math.floor(ctx.nowMs() / 1000),
          exp: Math.floor(ctx.nowMs() / 1000) + 3600,
        });
      },
    },
  ];

  for (const item of clearCases) {
    const ctx = await setup();
    const { sessionCookie } = await fullLogin(ctx);
    const cookie = cookiePair(sessionCookie);
    ctx.advance(2 * 60 * 60);
    item.prepare(ctx);
    assert.equal(await ctx.login.authenticate(authRequest(cookie)), null, item.name);
  }

  const unavailableCases = [
    { name: 'refresh 400 rate limited', prepare(ctx) { ctx.google.state.refreshStatus = 429; } },
    { name: 'refresh 500', prepare(ctx) { ctx.google.state.refreshStatus = 500; } },
    { name: 'refresh network error', prepare(ctx) { ctx.google.state.refreshNetworkError = true; } },
    { name: 'JWKS 500', prepare(ctx) { ctx.google.state.jwksStatus = 500; } },
    { name: 'JWKS network error', prepare(ctx) { ctx.google.state.jwksNetworkError = true; } },
    { name: 'refresh response without id_token', prepare(ctx) { ctx.google.state.omitRefreshIdToken = true; } },
  ];

  const { clearJwksCacheForTests } = await loginModule;
  for (const item of unavailableCases) {
    const ctx = await setup();
    const { sessionCookie } = await fullLogin(ctx);
    const cookie = cookiePair(sessionCookie);
    ctx.advance(2 * 60 * 60);
    item.prepare(ctx);
    // 初回ログインで温まった JWKS キャッシュを消し、refresh 後の検証で再取得させる。
    clearJwksCacheForTests(ctx.google.fetch);
    await assertUnavailable(ctx.login.authenticate(authRequest(cookie)));
  }
});

test('authenticate fails closed instead of anonymous when D1 is unavailable', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const session = await ctx.login.authenticate(authRequest(cookie));
  assert.ok(session);

  ctx.sqlite.close();
  // cookie 無しの匿名表示は既存方針どおり null（特権変更は不可）
  assert.equal(await ctx.login.authenticate(authRequest(null)), null);
  await assertUnavailable(ctx.login.authenticate(authRequest(cookie)));
  await assertUnavailable(ctx.login.isCurrent(session));
});

test('authenticate only trusts the __Host- session cookie handle and ignores injected headers', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const handle = cookie.split('=')[1];

  const injected = await ctx.login.authenticate(
    new Request(`${ORIGIN}/app2/`, {
      headers: {
        cookie,
        'x-classroom-subject': 'sub-evil',
        'x-classroom-handle': 'f'.repeat(64),
        'x-forwarded-user': 'evil@example.com',
      },
    }),
  );
  assert.equal(injected.subject, 'sub-1');
  assert.equal(injected.handle, handle);

  // __Host- 以外の名前の cookie は無視（匿名）
  assert.equal(await ctx.login.authenticate(authRequest(`classroom_session=${handle}`)), null);
  assert.equal(await ctx.login.authenticate(authRequest(`gakusyu-classroom-session=${handle}`)), null);
  assert.equal(
    await ctx.login.authenticate(authRequest('__Host-classroom_session=' + 'a'.repeat(513))),
    null,
  );
  // 同名 cookie の重複はどちらが正当か決められないため不確定扱い
  await assertUnavailable(
    ctx.login.authenticate(authRequest(`${cookie}; __Host-classroom_session=${'b'.repeat(64)}`)),
  );
});

test('authenticate fails closed when the credential disappears during the refresh race', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  ctx.advance(2 * 60 * 60);
  ctx.google.state.refreshIdToken = makeJwt({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    email: 'person@example.com',
    email_verified: true,
    iat: Math.floor(ctx.nowMs() / 1000),
    exp: Math.floor(ctx.nowMs() / 1000) + 3600,
  });
  ctx.google.state.onRefresh = async () => {
    ctx.sqlite.prepare('DELETE FROM classroom_oauth_credentials').run();
  };
  await assertUnavailable(ctx.login.authenticate(authRequest(cookie)));
});

/* ------------------------------------------------------------------ *
 * 延長
 * ------------------------------------------------------------------ */

test('extendAfterSuccess extends only confirmed print/generate operations for that session', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const session = await ctx.login.authenticate(authRequest(cookie));
  assert.ok(session);

  ctx.advance(10 * DAY);
  assert.equal(await ctx.login.extendAfterSuccess(session, 'probe', { ok: true }), null);
  assert.equal(await ctx.login.extendAfterSuccess(session, 'classroom-print', { ok: false }), null);
  assert.equal(await ctx.login.extendAfterSuccess(session, 'generate-text', { ok: true, replayed: true }), null);
  assert.equal(await ctx.login.extendAfterSuccess(session, 'read', { ok: true }), null);
  assert.equal(await ctx.login.extendAfterSuccess(null, 'classroom-print', { ok: true }), null);

  const printed = await ctx.login.extendAfterSuccess(session, 'classroom-print', { ok: true });
  assert.ok(printed);
  assert.equal(printed.subject, 'sub-1');
  assert.equal(printed.idleExpiresAt, T0 + 40 * DAY);

  ctx.advance(DAY);
  const generated = await ctx.login.extendAfterSuccess(session, 'generate-text', { ok: true });
  assert.equal(generated.idleExpiresAt, T0 + 41 * DAY);

  // 別 subject を騙るセッションでは延長しない
  const forged = { ...session, subject: 'sub-other' };
  assert.equal(await ctx.login.extendAfterSuccess(forged, 'classroom-print', { ok: true }), null);
  assert.equal(Number(ctx.rows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at), T0 + 41 * DAY);
});

/* ------------------------------------------------------------------ *
 * logout / 管理失効
 * ------------------------------------------------------------------ */

test('logout is same-origin only, deletes the OAuth credentials and clears the session cookie', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);

  const crossOrigin = await logoutRequest(ctx, cookie, { origin: 'https://evil.example' });
  assert.equal(crossOrigin.status, 403);
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);
  assert.ok(await ctx.login.authenticate(authRequest(cookie)));

  const res = await logoutRequest(ctx, cookie);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const cleared = findCookie(res, '__Host-classroom_session');
  assert.match(cleared, /Max-Age=0/);

  assert.equal(ctx.count('classroom_oauth_credentials'), 0);
  assert.equal(Number(ctx.rows('SELECT revoked_at FROM classroom_sessions')[0].revoked_at), T0);
  assert.equal(await ctx.login.authenticate(authRequest(cookie)), null);

  // 再ログアウトも安全（cookie 無し / 失効済み）
  const again = await logoutRequest(ctx, cookie);
  assert.equal(again.status, 303);
  assert.equal(ctx.count('classroom_oauth_credentials'), 0);
});

test('logout is disabled when the passphrase secret is absent and keeps the session', async () => {
  const ctx = await setup({ envOverrides: { CLASSROOM_LOGOUT_PASSPHRASE_HASH: undefined } });
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);

  const res = await logoutRequest(ctx, cookie, { passphrase: LOGOUT_PASSPHRASE });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'logout_disabled');
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);
  assert.ok(await ctx.login.authenticate(authRequest(cookie)));
});

test('logout requires the exact passphrase, rejects bad shapes, and never logs the value', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const wrong = 'wrong-passphrase-123';
  const captured = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...args) => captured.push(args.map(String).join(' '));
  console.error = (...args) => captured.push(args.map(String).join(' '));
  console.warn = (...args) => captured.push(args.map(String).join(' '));

  try {
    const invalid = await logoutRequest(ctx, cookie, { passphrase: wrong });
    assert.equal(invalid.status, 403);
    assert.equal((await invalid.json()).error, 'passphrase_invalid');

    for (const passphrase of [null, '', 'x'.repeat(257)]) {
      const badShape = await logoutRequest(ctx, cookie, { passphrase });
      assert.equal(badShape.status, 400, String(passphrase));
      assert.equal((await badShape.json()).error, 'bad_request');
    }
  } finally {
    console.log = original.log;
    console.error = original.error;
    console.warn = original.warn;
  }

  assert.ok(!captured.join('\n').includes(wrong));
  assert.ok(!captured.join('\n').includes(LOGOUT_PASSPHRASE));
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);
  assert.ok(await ctx.login.authenticate(authRequest(cookie)));
});

test('logout throttles 5 failures per IP (best-effort) without deleting the session', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const ip = '198.51.100.7';

  for (let i = 0; i < 5; i += 1) {
    const res = await logoutRequest(ctx, cookie, { passphrase: 'wrong-' + i, ip });
    assert.equal(res.status, 403, 'failure ' + i);
  }
  const blocked = await logoutRequest(ctx, cookie, { passphrase: LOGOUT_PASSPHRASE, ip });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'too_many_attempts');
  assert.equal(ctx.count('classroom_oauth_credentials'), 1);
  assert.ok(await ctx.login.authenticate(authRequest(cookie)));
});

test('successful logout clears the failure counter for that IP', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const ip = '198.51.100.8';

  for (let i = 0; i < 4; i += 1) {
    assert.equal((await logoutRequest(ctx, cookie, { passphrase: 'wrong-' + i, ip })).status, 403);
  }
  const ok = await logoutRequest(ctx, cookie, { passphrase: LOGOUT_PASSPHRASE, ip });
  assert.equal(ok.status, 303);
  assert.equal(ctx.count('classroom_oauth_credentials'), 0);

  const second = await fullLogin(ctx);
  const secondCookie = cookiePair(second.sessionCookie);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(
      (await logoutRequest(ctx, secondCookie, { passphrase: 'again-' + i, ip })).status,
      403,
      'counter must be cleared after success',
    );
  }
});

test('constantTimeEqualBytes compares equal, differing and length-mismatched bytes', async () => {
  const { constantTimeEqualBytes } = await logoutModule;
  assert.equal(constantTimeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(constantTimeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(constantTimeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
  assert.equal(constantTimeEqualBytes('abc', new Uint8Array([1, 2, 3])), false);
});

test('manual revocation via revokeForSubject or row delete invalidates login and cascades credentials', async () => {
  const ctx = await setup();
  const { classroomSessions } = await sessionsModule;

  const first = await fullLogin(ctx);
  const firstCookie = cookiePair(first.sessionCookie);
  assert.ok(await ctx.login.authenticate(authRequest(firstCookie)));

  const store = classroomSessions(ctx.db, { now: () => ctx.nowMs() });
  assert.equal(await store.revokeForSubject('sub-1'), 1);
  assert.equal(await ctx.login.authenticate(authRequest(firstCookie)), null);

  // 行削除は資格情報へ ON DELETE CASCADE する
  const second = await fullLogin(ctx);
  assert.equal(ctx.count('classroom_oauth_credentials'), 2);
  const handle = second.sessionCookie.split(';')[0].split('=')[1];
  ctx.sqlite.prepare('DELETE FROM classroom_sessions WHERE handle_hash = ?').run(sha256(handle));
  assert.equal(
    ctx.count('classroom_oauth_credentials'),
    1,
    'deleting a session row must cascade only its own credential',
  );
  assert.equal(await ctx.login.authenticate(authRequest(cookiePair(second.sessionCookie))), null);

  // purgeExpired でも資格情報が残らない
  ctx.advance(91 * DAY);
  assert.equal(await store.purgeExpired(), 1);
  assert.equal(ctx.count('classroom_sessions'), 0);
  assert.equal(ctx.count('classroom_oauth_credentials'), 0);
});

/* ------------------------------------------------------------------ *
 * ルーティング / state cleanup
 * ------------------------------------------------------------------ */

test('handle ignores unrelated paths, rejects other hosts, 404s unknown classroom routes, and cleans up used states', async () => {
  const ctx = await setup();
  assert.equal(await ctx.login.handle(new Request(`${ORIGIN}/app2/`)), null);
  assert.equal(await ctx.login.handle(new Request(`${ORIGIN}/index.html`)), null);

  const otherHost = await ctx.login.handle(
    new Request('https://other.example/_classroom/login', {
      method: 'POST',
      headers: { origin: ORIGIN },
      body: '',
    }),
  );
  assert.equal(otherHost.status, 403);
  assert.equal((await otherHost.json()).error, 'host_rejected');

  const unknown = await ctx.login.handle(new Request(`${ORIGIN}/_classroom/other`));
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('cache-control'), 'no-store');

  await fullLogin(ctx);
  assert.equal(ctx.count('classroom_oauth_states'), 1);
  ctx.advance(601);
  await startLogin(ctx.login);
  assert.equal(ctx.count('classroom_oauth_states'), 1, 'expired/consumed states are purged on the next login');
});

test('OAuth error redirects return to a fixed local page without issuing a session', async () => {
  const ctx = await setup();
  const start = await startLogin(ctx.login);
  const res = await ctx.login.handle(
    new Request(`${ORIGIN}/_classroom/callback?error=access_denied&state=${encodeURIComponent(start.state)}`, {
      headers: { cookie: start.cookie },
    }),
  );
  assert.equal(res.status, 303);
  assert.equal(new URL(res.headers.get('location'), ORIGIN).origin, ORIGIN);
  assert.match(res.headers.get('location'), /^\/\?login_error=oauth_error$/);
  assert.equal(findCookie(res, '__Host-classroom_session'), null);
  assert.equal(ctx.count('classroom_sessions'), 0);
});

test('isCurrent re-reads the session, matches the subject and never extends', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const session = await ctx.login.authenticate(authRequest(cookie));
  assert.ok(session);
  const idle = () => Number(ctx.rows('SELECT idle_expires_at FROM classroom_sessions')[0].idle_expires_at);

  assert.equal(await ctx.login.isCurrent(session), true);
  ctx.advance(10 * DAY);
  assert.equal(await ctx.login.isCurrent(session), true);
  assert.equal(idle(), T0 + 30 * DAY);

  assert.equal(await ctx.login.isCurrent(null), false);
  assert.equal(await ctx.login.isCurrent(undefined), false);
  assert.equal(await ctx.login.isCurrent({ handle: session.handle }), false);
  assert.equal(await ctx.login.isCurrent({ subject: session.subject }), false);
  assert.equal(await ctx.login.isCurrent({ ...session, subject: 'sub-2' }), false);
  assert.equal(await ctx.login.isCurrent({ ...session, handle: 'b'.repeat(64) }), false);
  assert.equal(await ctx.login.isCurrent({ ...session, handle: 'c'.repeat(513) }), false);

  // 資格情報が消えたら「不明」なので 503 相当
  ctx.sqlite.prepare('DELETE FROM classroom_oauth_credentials').run();
  await assertUnavailable(ctx.login.isCurrent(session));

  // 失効（tombstone）でも false
  const second = await fullLogin(ctx);
  const secondSession = await ctx.login.authenticate(authRequest(cookiePair(second.sessionCookie)));
  assert.ok(secondSession);
  const { classroomSessions } = await sessionsModule;
  const store = classroomSessions(ctx.db, { now: () => ctx.nowMs() });
  await store.revokeForSubject('sub-1');
  assert.equal(await ctx.login.isCurrent(secondSession), false);

  // idle 期限切れでも false
  const third = await fullLogin(ctx);
  const thirdSession = await ctx.login.authenticate(authRequest(cookiePair(third.sessionCookie)));
  assert.ok(thirdSession);
  ctx.advance(31 * DAY);
  assert.equal(await ctx.login.isCurrent(thirdSession), false);
});

test('authenticate re-reads the session after Google refresh and returns no idToken when revoked meanwhile', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  const cookie = cookiePair(sessionCookie);
  const handle = sessionCookie.split(';')[0].split('=')[1];
  const before = ctx.rows('SELECT id_token_cipher, id_token_expires_at FROM classroom_oauth_credentials')[0];

  ctx.advance(2 * 60 * 60);
  const { classroomSessions } = await sessionsModule;
  const store = classroomSessions(ctx.db, { now: () => ctx.nowMs() });
  let refreshed = false;
  ctx.google.state.onRefresh = async () => {
    refreshed = true;
    await store.revoke(handle);
  };
  ctx.google.state.refreshIdToken = makeJwt({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    email: 'person@example.com',
    email_verified: true,
    iat: Math.floor(ctx.nowMs() / 1000),
    exp: Math.floor(ctx.nowMs() / 1000) + 3600,
  });

  assert.equal(await ctx.login.authenticate(authRequest(cookie)), null);
  assert.equal(refreshed, true);

  const after = ctx.rows('SELECT id_token_cipher, id_token_expires_at FROM classroom_oauth_credentials')[0];
  assert.equal(after.id_token_expires_at, before.id_token_expires_at, 'refreshed token must not be persisted');
  assert.equal(after.id_token_cipher, before.id_token_cipher);
});

test('every Google verification call uses a fixed HTTPS endpoint with a bounded abort deadline', async () => {
  const ctx = await setup();
  const { sessionCookie } = await fullLogin(ctx);
  ctx.advance(2 * 60 * 60);
  ctx.google.state.refreshIdToken = makeJwt({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    email: 'person@example.com',
    email_verified: true,
    iat: Math.floor(ctx.nowMs() / 1000),
    exp: Math.floor(ctx.nowMs() / 1000) + 3600,
  });
  assert.ok(await ctx.login.authenticate(authRequest(cookiePair(sessionCookie))));

  assert.ok(ctx.google.calls.length >= 3);
  for (const call of ctx.google.calls) {
    const url = new URL(call.url);
    assert.equal(url.protocol, 'https:', call.url);
    assert.ok(
      ['oauth2.googleapis.com', 'accounts.google.com', 'www.googleapis.com'].includes(url.hostname),
      'unexpected Google host: ' + url.hostname,
    );
    assert.equal(call.hasSignal, true, 'missing abort deadline: ' + call.url);
    assert.ok(call.signal instanceof AbortSignal);
    // Cloudflare Workers は RequestInit.cache 未実装 / redirect:'error' 非対応。
    assert.equal(call.hasCache, false, 'RequestInit.cache must not be used: ' + call.url);
    assert.notEqual(call.redirect, 'error', "RequestInit.redirect must not be 'error': " + call.url);
  }
});
