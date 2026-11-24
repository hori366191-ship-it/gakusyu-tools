'use strict';

/**
 * site-worker/classroom-gateway.mjs のオフライン回帰テスト。
 * 外部 API / GAS / D1 へは一切アクセスしない（fake fetch / fake session）。
 *
 * 実行: node scripts/tests/classroom-gateway.test.cjs
 */

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://classroom.test';
const PAGES = 'https://hori366191-ship-it.github.io';
const PAGES_PREFIX = PAGES + '/gakusyu-tools/';
const APP2_TOKEN = 'synthetic-app2-token';
const PDFDROP_TOKEN = 'synthetic-pdfdrop-token';
const PEPPER = 'synthetic-pepper';

const REQUEST_ID = 'req-0123456789abcdef';
const RID = 'rid-0123456789';

let gatewayMod;

before(async () => {
  gatewayMod = await import('../../site-worker/classroom-gateway.mjs');
});

/* ── helpers ───────────────────────────────────── */

function env(overrides = {}) {
  return {
    CLASSROOM_ORIGIN: ORIGIN,
    CLASSROOM_APP2_TOKEN: APP2_TOKEN,
    CLASSROOM_PDFDROP_TOKEN: PDFDROP_TOKEN,
    CLASSROOM_CONTEXT_PEPPER: PEPPER,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    handle: 'a'.repeat(64),
    subject: 'google-sub-1',
    idToken: 'synthetic-id-token',
    ...overrides,
  };
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function makeFetch(handler) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const record = { url, init };
    calls.push(record);
    return handler(new URL(url), init, calls.length - 1, record);
  };
  fn.calls = calls;
  return fn;
}

function gasKind(url) {
  if (url.pathname.includes('AKfycbxj8q')) return 'app2';
  if (url.pathname.includes('AKfycbwj7q')) return 'pdfdrop';
  return '';
}

function makeDeps({ fetchImpl, sess = session(), live = true, login } = {}) {
  const extensions = [];
  return {
    deps: {
      fetchImpl,
      authenticate: async () => sess,
      isCurrent: async () => live,
      extendAfterSuccess: async (s, op, result) => {
        extensions.push({ op, result, subject: s.subject });
      },
      login: login === undefined ? { handle: async () => new Response('login-ok') } : login,
      sessions: null,
    },
    extensions,
  };
}

function makeGateway(opts = {}) {
  return gatewayMod.createClassroomGateway(env(opts.env), opts.deps);
}

function opRequest(route, body, overrides = {}) {
  const headers = {
    Origin: ORIGIN,
    'content-type': 'application/json',
    ...(overrides.headers || {}),
  };
  return new Request(`${ORIGIN}/_classroom/${route}`, {
    method: overrides.method || 'POST',
    headers,
    body: overrides.method === 'GET' ? undefined : JSON.stringify(body),
  });
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

async function expectedContext(sess, pepper = PEPPER) {
  return gatewayMod.contextForHandle(sess.handle, pepper);
}

/** 典型的な GAS backend。probe/保存の上書きができる。 */
function gasBackend(overrides = {}) {
  return makeFetch(async (url, init) => {
    const kind = gasKind(url);
    if (!kind) throw new Error('unexpected host ' + url.hostname);

    if (url.hostname === 'script.googleusercontent.com') {
      // 302 追従後（GET, 本文なし）
      if (!overrides.redirected) return json({ ok: false, error: 'unexpected redirect follow' });
      return overrides.redirected(url, init);
    }

    if (init.method === 'POST') {
      const posted = JSON.parse(init.body);
      if (posted.probe) {
        const custom = kind === 'app2' ? overrides.app2Probe : overrides.pdfdropProbe;
        if (typeof custom === 'function') return custom(url, { rid: posted.rid, posted, init });
        return json({
          genkoProbe: true,
          ok: true,
          allowed: true,
          is_owner: kind === 'app2',
          open: kind === 'app2',
          classroom_guard: kind === 'app2',
          rid: posted.rid,
        });
      }
      const custom = kind === 'app2' ? overrides.app2Post : overrides.pdfdropPost;
      if (typeof custom === 'function') return custom(posted, url, init);
      if (kind === 'pdfdrop') {
        return json({ ok: true, name: posted.name, request_id: posted.request_id, rid: posted.rid });
      }
      return json({
        ok: true,
        item: { id: 'tadoku-1234567890-abcd', model: 'test' },
        request_id: posted.request_id,
        rid: posted.rid,
      });
    }
    throw new Error('unexpected GAS call');
  });
}

/* ── pure helpers ──────────────────────────────── */

test('GAS_TARGETS exactly match the existing worker.js targets (app2 keeps the j)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../site-worker/worker.js'), 'utf8');
  const app2 = (source.match(/app2:\s*'([^']+)'/) || [])[1];
  const pdfdrop = (source.match(/pdfdrop:\s*'([^']+)'/) || [])[1];

  assert.ok(app2, 'worker.js app2 target exists');
  assert.ok(pdfdrop, 'worker.js pdfdrop target exists');
  assert.equal(gatewayMod.GAS_TARGETS.app2, app2);
  assert.equal(gatewayMod.GAS_TARGETS.pdfdrop, pdfdrop);
  assert.match(gatewayMod.GAS_TARGETS.app2, /AKfycbxj8q/);
});

test('static path helpers reject traversal, scheme injection and _classroom', () => {
  const { safeDecodedPath, buildUpstreamUrl } = gatewayMod;

  assert.equal(safeDecodedPath('/app2/'), '/app2/');
  assert.equal(safeDecodedPath('/%2e%2e/secret'), null);
  assert.equal(safeDecodedPath('/a/../b'), null);
  assert.equal(safeDecodedPath('/%5Cevil'), null);
  assert.equal(safeDecodedPath('//evil.example/x'), null);
  assert.equal(safeDecodedPath('/_classroom/login'), null);

  assert.equal(buildUpstreamUrl(ORIGIN + '/app9/index.html').toString(), PAGES_PREFIX + 'app9/index.html');
  // URL が %2e%2e を正規化しても固定 upstream の外へは出ない
  assert.equal(buildUpstreamUrl(ORIGIN + '/%2e%2e/x').toString(), PAGES_PREFIX + 'x');
  // この純関数は固定 upstream を組み立てるだけ。リクエスト origin は gateway が検査する。
  assert.equal(buildUpstreamUrl('https://evil.example/app9/').toString(), PAGES_PREFIX + 'app9/');
});

test('GAS redirect allowlist only accepts https://script.googleusercontent.com without credentials', () => {
  const { safeGasRedirectUrl } = gatewayMod;
  const base = 'https://script.google.com/a/macros/x/s/abc/exec';

  assert.match(
    safeGasRedirectUrl('https://script.googleusercontent.com/macros/echo?x=1', base),
    /^https:\/\/script\.googleusercontent\.com\//,
  );
  assert.equal(safeGasRedirectUrl('http://script.googleusercontent.com/x', base), null);
  assert.equal(safeGasRedirectUrl('https://user:pass@script.googleusercontent.com/x', base), null);
  assert.equal(safeGasRedirectUrl('https://script.googleusercontent.com:8443/x', base), null);
  assert.equal(safeGasRedirectUrl('https://script.googleusercontent.com.evil.example/x', base), null);
  assert.equal(safeGasRedirectUrl('https://evil.example/x', base), null);
});

/* ── routing / origin ──────────────────────────── */

test('only the exact CLASSROOM_ORIGIN host is served', async () => {
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const wrongHost = await gateway.fetch(new Request('https://other.example/'));
  assert.equal(wrongHost.status, 404);
  assert.equal(fetchImpl.calls.length, 0);

  const wrongOrigin = await gateway.fetch(
    opRequest('probe', { target: 'app2' }, { headers: { Origin: 'https://evil.example' } }),
  );
  assert.equal(wrongOrigin.status, 403);
});

test('missing CLASSROOM_ORIGIN fails closed', async () => {
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl });
  const gateway = gatewayMod.createClassroomGateway({}, deps);
  const response = await gateway.fetch(new Request(ORIGIN + '/'));
  assert.equal(response.status, 503);
  assert.equal(fetchImpl.calls.length, 0);
});

/* ── static Pages ──────────────────────────────── */

test('allowlisted HTML is proxied with session meta, CSP, no validators/cookies/auth', async () => {
  const fetchImpl = makeFetch(async (url, init) => {
    assert.equal(url.origin, PAGES);
    assert.equal(init.headers.cookie, undefined);
    assert.equal(init.headers.authorization, undefined);
    // 条件付きリクエストを送らない
    assert.equal(init.headers['if-none-match'], undefined);
    assert.equal(init.headers['if-modified-since'], undefined);
    return new Response('<!doctype html><html><head><title>x</title></head><body>ok</body></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        etag: '"abc"',
        'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      },
    });
  });
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const request = new Request(ORIGIN + '/app9/', {
    headers: {
      cookie: '__Host-classroom_session=secret',
      authorization: 'Bearer secret',
      'if-none-match': '"abc"',
      'if-modified-since': 'Wed, 01 Jan 2025 00:00:00 GMT',
    },
  });
  const response = await gateway.fetch(request);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<head><meta name="gakusyu-classroom-session" content="1">/);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('last-modified'), null);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(
    response.headers.get('content-security-policy'),
    "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' https://accounts.google.com",
  );
  assert.equal(fetchImpl.calls.length, 1);
});

test('HTMLRewriter path prepends the session meta to head (never appends)', async () => {
  const record = { prepend: null, append: 0, selector: '' };
  class FakeRewriter {
    on(selector, handler) {
      record.selector = selector;
      record.handler = handler;
      return this;
    }
    transform(response) {
      record.transformed = true;
      return response;
    }
  }
  const fetchImpl = makeFetch(async () =>
    new Response('<html><head></head><body></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  );
  const { deps } = makeDeps({ fetchImpl });
  deps.HTMLRewriterImpl = FakeRewriter;
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(new Request(ORIGIN + '/app9/'));
  assert.equal(response.status, 200);
  assert.equal(record.selector, 'head');
  assert.equal(record.transformed, true);

  record.handler.element({
    prepend(html, opts) {
      record.prepend = { html, opts };
    },
    append() {
      record.append += 1;
    },
  });
  assert.equal(record.prepend.html, gatewayMod.SESSION_META);
  assert.deepEqual(record.prepend.opts, { html: true });
  assert.equal(record.append, 0);
});

test('non-allowlisted HTML is redirected to GitHub Pages (no session marker, no auth)', async () => {
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(new Request(ORIGIN + '/app1/'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), PAGES_PREFIX + 'app1/');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fetchImpl.calls.length, 0);
});

test('only necessary non-HTML assets are proxied; other paths redirect publicly', async () => {
  const fetchImpl = makeFetch(async (url) => {
    assert.equal(url.origin, PAGES);
    return new Response('body{}', { status: 200, headers: { 'content-type': 'text/css' } });
  });
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const css = await gateway.fetch(new Request(ORIGIN + '/app9/app.css'));
  assert.equal(css.status, 200);
  assert.equal(fetchImpl.calls.length, 1);

  const unknown = await gateway.fetch(new Request(ORIGIN + '/app1/secret.html'));
  assert.equal(unknown.status, 302);
  assert.equal(unknown.headers.get('location'), PAGES_PREFIX + 'app1/secret.html');
  assert.equal(fetchImpl.calls.length, 1);
});

test('upstream redirects are restored to the classroom origin or refused', async () => {
  const fetchImpl = makeFetch(async (url) => {
    if (url.pathname.startsWith('/gakusyu-tools/app2')) {
      return new Response(null, {
        status: 302,
        headers: { location: PAGES_PREFIX + 'app2/' },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/phish' },
    });
  });
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const sameSite = await gateway.fetch(new Request(ORIGIN + '/app2'));
  assert.equal(sameSite.status, 302);
  assert.equal(sameSite.headers.get('location'), ORIGIN + '/app2/');

  const external = await gateway.fetch(new Request(ORIGIN + '/app9/index.html'));
  assert.equal(external.status, 404);
});

/* ── probe ─────────────────────────────────────── */

test('probe returns only status/isOwner/open/context (no subject/email/bearer)', async () => {
  const sess = session();
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(opRequest('probe', { target: 'app2' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);

  const body = await bodyOf(response);
  assert.deepEqual(Object.keys(body).sort(), ['context', 'isOwner', 'open', 'status']);
  assert.equal(body.status, 'ok');
  assert.equal(body.isOwner, true);
  assert.equal(body.open, true);
  assert.match(body.context, /^[0-9a-f]{64}$/);
  assert.equal(body.context, await expectedContext(sess));
  assert.equal(JSON.stringify(body).includes('google-sub-1'), false);
  assert.equal(JSON.stringify(body).includes(sess.idToken), false);
});

test('probe without a session performs one anonymous JSON POST probe and inherits open', async () => {
  const fetchImpl = gasBackend({
    app2Probe: (url, { rid, posted, init }) => {
      assert.equal(init.method, 'POST');
      assert.equal(url.search, ''); // id_token / token を URL に載せない
      assert.equal(posted.id_token, undefined);
      assert.equal(posted.token, APP2_TOKEN);
      return json({ genkoProbe: true, ok: false, error: 'noauth', open: true, rid });
    },
  });
  const { deps } = makeDeps({ fetchImpl, sess: null });
  const gateway = makeGateway({ deps });

  const body = await bodyOf(await gateway.fetch(opRequest('probe', { target: 'app2' })));
  assert.deepEqual(body, { status: 'noauth', isOwner: false, open: true, context: '' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('probe failure is unreachable/closed (token mismatch is not relaxed)', async () => {
  const fetchImpl = gasBackend({
    app2Probe: () => json({ genkoProbe: true, ok: false, error: 'bad token', rid: '' }),
  });
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const body = await bodyOf(await gateway.fetch(opRequest('probe', { target: 'app2' })));
  assert.equal(body.status, 'unreachable');
  assert.equal(body.isOwner, false);
  assert.equal(body.open, false);
  assert.equal(body.context.length, 64);
});

test('probe with expired id_token returns noauth', async () => {
  const fetchImpl = gasBackend({
    app2Probe: (_url, { rid }) =>
      json({ genkoProbe: true, ok: false, error: 'noauth', open: false, rid }),
  });
  const { deps } = makeDeps({ fetchImpl });
  const gateway = makeGateway({ deps });

  const body = await bodyOf(await gateway.fetch(opRequest('probe', { target: 'app2' })));
  assert.equal(body.status, 'noauth');
  assert.equal(body.context.length, 64);
});

/* ── print ─────────────────────────────────────── */

test('print confirms probe + rid + request_id, then extends the session', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    pdfdropPost: (posted) => {
      assert.equal(posted.token, PDFDROP_TOKEN);
      assert.equal(posted.id_token, sess.idToken);
      assert.equal(posted.parent_origin, 'https://invalid.invalid');
      assert.equal(posted.rid, RID);
      assert.equal(posted.request_id, REQUEST_ID);
      // クライアントの未知値は採用しない
      assert.equal(posted.action, undefined);
      assert.equal(posted.device_id, undefined);
      assert.equal(posted.benchmark_model, undefined);
      return json({ ok: true, name: posted.name, request_id: posted.request_id, rid: posted.rid });
    },
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'roster.pdf',
      b64: 'JVBERi0xLjQ=',
      context: await expectedContext(sess),
      action: 'deleteText',
      token: 'evil-token',
      id_token: 'evil-id-token',
      device_id: 'evil-device',
      benchmark_model: 'evil-model',
      parent_origin: 'https://evil.example',
    }),
  );

  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.equal(body.ok, true);
  assert.equal(body.rid, RID);
  assert.equal(body.request_id, REQUEST_ID);
  assert.deepEqual(extensions, [{ op: 'classroom-print', result: { ok: true }, subject: sess.subject }]);
});

/* ── generate / translate ──────────────────────── */

test('generate requires the GAS classroom_guard flag, sends require_allowed and extends', async () => {
  const sess = session();
  let posted = null;
  const fetchImpl = gasBackend({
    app2Post: (body) => {
      posted = body;
      return json({
        ok: true,
        item: { id: 'tadoku-1234567890-abcd' },
        request_id: body.request_id,
        rid: body.rid,
      });
    },
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: {
        level: '3級',
        wordCount: 300,
        world: 'school',
        style: 'plain',
        textType: 'story',
        genre: 'daily',
        development: 'calm',
        ending: 'happy',
        keywords: ['club'],
        prompt: 'short',
        token: 'ignored',
        action: 'deleteText',
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(posted.action, 'generateText');
  assert.equal(posted.require_allowed, true);
  assert.equal(posted.parent_origin, 'https://invalid.invalid');
  assert.equal(posted.device_id, undefined);
  assert.equal(posted.benchmark_model, undefined);
  assert.equal(posted.settings.token, undefined);
  assert.equal(posted.settings.action, undefined);
  assert.deepEqual(extensions, [{ op: 'generate-text', result: { ok: true }, subject: sess.subject }]);
});

test('generate refuses to call GAS when probe lacks classroom_guard', async () => {
  const sess = session();
  let postCount = 0;
  const fetchImpl = gasBackend({
    app2Probe: (_url, { rid }) =>
      json({
        genkoProbe: true,
        ok: true,
        allowed: true,
        is_owner: false,
        open: true,
        rid,
      }),
    app2Post: () => {
      postCount += 1;
      return json({ ok: true, rid: RID, request_id: REQUEST_ID });
    },
  });
  const { deps } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 503);
  assert.equal((await bodyOf(response)).code, 'guard_unavailable');
  assert.equal(postCount, 0);
});

test('probe notallowed denies the privileged path even when open', async () => {
  const sess = session();
  let postCount = 0;
  const fetchImpl = gasBackend({
    app2Probe: (_url, { rid }) =>
      json({
        genkoProbe: true,
        ok: true,
        allowed: false,
        open: true,
        classroom_guard: true,
        rid,
      }),
    app2Post: () => {
      postCount += 1;
      return json({ ok: true, rid: RID, request_id: REQUEST_ID });
    },
  });
  const { deps } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'session_auth');
  assert.equal(postCount, 0);
});

test('translate create success does not extend the session', async () => {
  const sess = session();
  let posted = null;
  const fetchImpl = gasBackend({
    app2Post: (body) => {
      posted = body;
      return json({
        ok: true,
        translation: { lines: ['a'] },
        request_id: body.request_id,
        rid: body.rid,
      });
    },
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('translate', {
      request_id: REQUEST_ID,
      rid: RID,
      record_id: 'tadoku-1234567890-abcd',
      context: await expectedContext(sess),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(posted.mode, 'create');
  assert.equal(posted.require_allowed, true);
  assert.deepEqual(extensions, []);
});

/* ── correlation / auth failures ───────────────── */

test('context mismatch and revoked sessions return 200 session_auth without touching GAS mutations', async () => {
  const sess = session();
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const mismatch = await gateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'a.pdf',
      b64: 'JVBERi0xLjQ=',
      context: 'f'.repeat(64),
    }),
  );
  assert.equal(mismatch.status, 200);
  assert.equal((await bodyOf(mismatch)).code, 'session_auth');

  // probe されたが mutation 前に失効したケース
  const revokedFetch = gasBackend();
  const revoked = makeDeps({ fetchImpl: revokedFetch, sess, live: false });
  const revokedGateway = makeGateway({ deps: revoked.deps });
  const response = await revokedGateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'a.pdf',
      b64: 'JVBERi0xLjQ=',
      context: await expectedContext(sess),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).code, 'session_auth');
  assert.equal(revokedFetch.calls.filter((c) => String(c.init.body || '').includes('"request_id"')).length, 0);
});

test('rid mismatch is an unknown 503 and never extends', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    pdfdropPost: (posted) => json({ ok: true, name: posted.name, request_id: posted.request_id, rid: 'other-rid-1234' }),
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'a.pdf',
      b64: 'JVBERi0xLjQ=',
      context: await expectedContext(sess),
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(extensions, []);
});

test('success without request_id is unknown 502 (never grant) and does not extend', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    pdfdropPost: (posted) => json({ ok: true, name: posted.name, rid: posted.rid }),
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'a.pdf',
      b64: 'JVBERi0xLjQ=',
      context: await expectedContext(sess),
    }),
  );
  assert.equal(response.status, 502);
  assert.equal((await bodyOf(response)).code, 'upstream_unknown');
  assert.deepEqual(extensions, []);
});

test('legacy error without request_id may pass through only when rid matches (no extension)', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    app2Post: (posted) => json({ ok: false, error: 'quota exhausted', code: 'quota_failed', rid: posted.rid }),
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'quota_failed');
  assert.equal(body.request_id, REQUEST_ID);
  assert.deepEqual(extensions, []);
});

test('explicit not_allowed from GAS maps to 200 session_auth', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    app2Post: (posted) =>
      json({ ok: false, error: 'not allowed (classroom session requires allowlisted account)', code: 'not_allowed', request_id: posted.request_id, rid: posted.rid }),
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).code, 'session_auth');
  assert.deepEqual(extensions, []);
});

test('replayed success is forwarded but does not extend', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    app2Post: (posted) =>
      json({ ok: true, item: { id: 'tadoku-1234567890-abcd' }, replayed: true, request_id: posted.request_id, rid: posted.rid }),
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(extensions, []);
});

test('GAS POST transport failure is 503 and does not extend', async () => {
  const sess = session();
  const fetchImpl = makeFetch(async (init_url, init) => {
    const posted = JSON.parse(init.body || '{}');
    if (posted.probe) {
      return json({
        genkoProbe: true,
        ok: true,
        allowed: true,
        is_owner: true,
        open: true,
        classroom_guard: true,
        rid: posted.rid,
      });
    }
    throw new Error('network down');
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: await expectedContext(sess),
      settings: { level: '3級', wordCount: 300 },
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(extensions, []);
});

/* ── GAS redirect safety ──────────────────────── */

test('302 to script.googleusercontent.com is followed as a bodyless GET', async () => {
  const sess = session();
  const fetchImpl = makeFetch(async (url, init) => {
    if (url.hostname === 'script.google.com') {
      const posted = JSON.parse(init.body || '{}');
      if (posted.probe) {
        return json({ genkoProbe: true, ok: true, allowed: true, classroom_guard: true, rid: posted.rid });
      }
      assert.equal(init.method, 'POST');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://script.googleusercontent.com/macros/echo?x=1' },
      });
    }
    if (url.hostname === 'script.googleusercontent.com') {
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      assert.equal(init.headers.authorization, undefined);
      assert.equal(init.headers.cookie, undefined);
      return json({ ok: true, name: 'a.pdf', request_id: REQUEST_ID, rid: RID });
    }
    throw new Error('unexpected host');
  });
  const { deps, extensions } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('print', {
      request_id: REQUEST_ID,
      rid: RID,
      name: 'a.pdf',
      b64: 'JVBERi0xLjQ=',
      context: await expectedContext(sess),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(extensions, [{ op: 'classroom-print', result: { ok: true }, subject: sess.subject }]);
});

test('307/308 and off-host redirects are refused without a second request', async () => {
  for (const [status, location] of [
    [307, 'https://script.googleusercontent.com/x'],
    [308, 'https://script.googleusercontent.com/x'],
    [302, 'https://evil.example/x'],
  ]) {
    const fetchImpl = makeFetch(async (url, init) => {
      const posted = JSON.parse(init.body || '{}');
      if (posted.probe) {
        return json({ genkoProbe: true, ok: true, allowed: true, classroom_guard: true, rid: posted.rid });
      }
      return new Response(null, { status, headers: { location } });
    });
    const sess = session();
    const { deps, extensions } = makeDeps({ fetchImpl, sess });
    const gateway = makeGateway({ deps });

    const response = await gateway.fetch(
      opRequest('generate', {
        request_id: REQUEST_ID,
        rid: RID,
        context: await expectedContext(sess),
        settings: { level: '3級', wordCount: 300 },
      }),
    );
    assert.equal(response.status, 503);
    assert.equal(fetchImpl.calls.filter((c) => c.url.includes('script.googleusercontent.com') || c.url.includes('evil.example')).length, 0);
    assert.deepEqual(extensions, []);
  }
});

/* ── misc ──────────────────────────────────────── */

test('oversized JSON body is rejected before any upstream call', async () => {
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl, sess: null });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(
    opRequest('generate', {
      request_id: REQUEST_ID,
      rid: RID,
      context: 'a'.repeat(64),
      settings: { level: '3級', wordCount: 300, prompt: 'x'.repeat(70 * 1024) },
    }),
  );
  assert.equal(response.status, 413);
  assert.equal(fetchImpl.calls.length, 0);
});

test('login endpoints are soft-disabled (503 fail closed) when no login handler is configured', async () => {
  const fetchImpl = gasBackend();
  const { deps } = makeDeps({ fetchImpl, login: null });
  const gateway = makeGateway({ deps });

  const response = await gateway.fetch(new Request(ORIGIN + '/_classroom/login', { method: 'POST' }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('authorize accepts when either GAS probe is verified ok && allowed', async () => {
  const sess = session();
  const fetchImpl = gasBackend({
    pdfdropProbe: (_url, { rid }) =>
      json({ genkoProbe: true, ok: true, allowed: true, rid }),
    app2Probe: () => json({ genkoProbe: true, ok: false, error: 'noauth', open: false, rid: '' }),
  });
  const { deps } = makeDeps({ fetchImpl, sess });
  const gateway = makeGateway({ deps });

  assert.equal(await gateway.authorize({ idToken: sess.idToken, subject: 's', email: 'e@example.com' }), true);
  assert.equal(await gateway.authorize({ idToken: '' }), false);
});
