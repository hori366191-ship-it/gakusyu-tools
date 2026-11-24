/**
 * 教室ログイン専用 API Worker（別オリジン・別デプロイ）
 *
 * 目的:
 *  - 既存 GitHub Pages（https://hori366191-ship-it.github.io）の学習面からだけ使う、
 *    認証専用の API。Pages 側の JS は Google Identity Services の popup code model で
 *    取得した `code` だけをこの Worker に POST する。
 *  - OAuth の code→token 交換、tokeninfo 全 claim 検証、既存 GAS probe 許可、
 *    セッション発行はすべてこの Worker（サーバー側）で行う。ブラウザ JS へは
 *    id_token / refresh_token / セッションハンドルを返さない。
 *  - ブラウザへ渡すのは `__Host-gakusyu_session`
 *    （Secure / HttpOnly / SameSite=None / Partitioned / Path=/ / Max-Age=90日）だけ。
 *  - 既存の同一オリジン実装（classroom-worker.mjs / gateway / login / sessions）は
 *    デフォルト不変。ここでは login の store 発行ヘルパー、gateway の GAS 中継、
 *    classroom-sessions のストアをそのまま再利用する。
 *
 * 公開面（allowlist 以外はすべて 404）:
 *  - POST /_classroom/popup-exchange … GIS popup の code を交換してセッション発行
 *  - POST /_classroom/status         … 保存済みセッションの有無だけ（refresh/延長なし）
 *  - POST /_classroom/logout         … 資格情報削除 + セッション失効
 *  - POST /_classroom/probe|print|generate|translate … 既存 GAS 中継
 *
 * 境界:
 *  - API origin は固定（env で変えない）。Pages preview / workers.dev 別名 / root は 404。
 *  - Origin は exact 一致の Pages origin のみ（opaque `null` / 欠落は拒否）。
 *  - `X-Requested-With: XmlHttpRequest`（GIS 公式 popup CSRF 手順）を必須にする。
 *  - JSON POST のみ。Content-Length と実読取の両方を bounded にする。
 *  - CORS は exact allow-origin + credentials + Vary: Origin + no-store。
 *  - cookie 重複は安全側に拒否する。
 *  - code はログ・応答へ出さない。redirect は一切返さない。
 */

import { classroomSessions } from './classroom-sessions.mjs';
import {
  ClassroomAuthUnavailableError,
  createClassroomLogin,
  revokeClassroomSession,
} from './classroom-login.mjs';
import { LIMITS, createClassroomGateway } from './classroom-gateway.mjs';

export const API_ORIGIN = 'https://gakusyu-classroom-auth.hori-shota.workers.dev';
export const SITE_ORIGIN = 'https://hori366191-ship-it.github.io';
export const PARTITIONED_SESSION_COOKIE = '__Host-gakusyu_session';
export const SESSION_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90日固定（DB が権威）

export const API_PATHS = Object.freeze({
  popupExchange: '/_classroom/popup-exchange',
  status: '/_classroom/status',
  logout: '/_classroom/logout',
  probe: '/_classroom/probe',
  print: '/_classroom/print',
  generate: '/_classroom/generate',
  translate: '/_classroom/translate',
});

const ALLOWED_PATHS = new Set(Object.values(API_PATHS));
const OPERATION_PATHS = new Set([API_PATHS.probe, API_PATHS.print, API_PATHS.generate, API_PATHS.translate]);
const ALLOWED_REQUEST_HEADERS = new Set(['content-type', 'x-requested-with']);
const MAX_HANDLE_LENGTH = 512;
const JSON_BODY_LIMIT = LIMITS.jsonBody;
const PRINT_BODY_LIMIT = LIMITS.printBody;

/* ------------------------------------------------------------------ *
 * レスポンス / ヘッダ
 * ------------------------------------------------------------------ */

function baseHeaders(extra = {}) {
  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

function corsHeaders(extra = {}) {
  const headers = baseHeaders(extra);
  headers.set('access-control-allow-origin', SITE_ORIGIN);
  headers.set('access-control-allow-credentials', 'true');
  const vary = headers.get('vary');
  if (!vary) headers.set('vary', 'Origin');
  else if (!/(^|,)\s*origin\s*($|,)/i.test(vary)) headers.set('vary', `${vary}, Origin`);
  return headers;
}

function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json; charset=utf-8', ...extra }),
  });
}

function plainResponse(text, status, extra = {}) {
  return new Response(text, {
    status,
    headers: baseHeaders({ 'content-type': 'text/plain; charset=utf-8', ...extra }),
  });
}

function corsWrap(response) {
  const headers = corsHeaders();
  response.headers.forEach((value, key) => {
    // CORS / cache 系はこちらで固定する（上流の値を反映しない）。
    if (key.startsWith('access-control-')) return;
    if (key === 'vary' || key === 'cache-control') return;
    if (key === 'set-cookie') return;
    headers.set(key, value);
  });
  // Set-Cookie を含む複数ヘッダを保持する。
  const setCookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
  } else {
    const cookie = response.headers.get('set-cookie');
    if (cookie) headers.append('set-cookie', cookie);
  }
  return new Response(response.body, { status: response.status, headers });
}

function notFound() {
  return plainResponse('Not Found', 404);
}

/* ------------------------------------------------------------------ *
 * cookie
 * ------------------------------------------------------------------ */

function sessionCookieValues(request) {
  const header = request.headers.get('cookie');
  const values = [];
  if (!header) return values;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === PARTITIONED_SESSION_COOKIE) {
      // 空値も 1 個として数える（同名 cookie の重複判定を曖昧にしない）。
      values.push(part.slice(index + 1).trim());
    }
  }
  return values;
}

function partitionedSessionCookie(handle) {
  return (
    `${PARTITIONED_SESSION_COOKIE}=${handle}; Path=/; Secure; HttpOnly; ` +
    `SameSite=None; Partitioned; Max-Age=${SESSION_COOKIE_MAX_AGE}`
  );
}

function clearPartitionedSessionCookie() {
  return (
    `${PARTITIONED_SESSION_COOKIE}=; Path=/; Secure; HttpOnly; ` +
    'SameSite=None; Partitioned; Max-Age=0'
  );
}

/* ------------------------------------------------------------------ *
 * request body
 * ------------------------------------------------------------------ */

/** Content-Length を先に確認し、実読取も上限で打ち切る。 */
async function readBodyBounded(request, maxBytes) {
  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader !== null) {
    const declared = Number(declaredHeader);
    if (!Number.isFinite(declared) || declared < 0) return { bad: true };
    if (declared > maxBytes) return { tooLarge: true };
  }
  if (!request.body) return { text: '' };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { bad: true };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged) };
}

function parseJsonObject(text) {
  if (!text.trim()) return { value: {} };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { bad: true };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { bad: true };
  return { value };
}

/* ------------------------------------------------------------------ *
 * エラー
 * ------------------------------------------------------------------ */

function errorResponse(error) {
  if (
    error instanceof ClassroomAuthUnavailableError ||
    (error && error.code === 'CLASSROOM_AUTH_UNAVAILABLE')
  ) {
    return jsonResponse({ ok: false, error: 'auth_unavailable' }, 503);
  }
  if (error && error.name === 'ClassroomLoginError') {
    const code = String(error.code || 'login_failed');
    const status = Number.isInteger(error.status) ? error.status : 400;
    const body = { ok: false, error: code };
    // refresh token が無い場合だけ、フロントが従来 GIS へ安全に戻れる印を付ける。
    if (code === 'refresh_token_missing') body.fallback = 'legacy_gis';
    return jsonResponse(body, status);
  }
  if (error && error.code === 'CLASSROOM_SESSION_STORE_FAILED') {
    return jsonResponse({ ok: false, error: 'session_store_unavailable' }, 503);
  }
  return jsonResponse({ ok: false, error: 'internal_error' }, 503);
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export function createClassroomAuthApi(env, deps = {}) {
  const settings = env || {};
  const db = settings.CLASSROOM_DB;
  const hasDb = Boolean(db && typeof db.prepare === 'function');
  const fetchImpl = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  if (!fetchImpl) throw new TypeError('createClassroomAuthApi requires fetch');

  const loginEnv = { ...settings, CLASSROOM_ORIGIN: API_ORIGIN };
  const store = hasDb ? classroomSessions(db, { now }) : null;
  let gateway = null;

  const login = createClassroomLogin(loginEnv, {
    authorize: (input) => (gateway ? gateway.authorize(input) : false),
    fetchImpl,
    now,
    sessionCookieName: PARTITIONED_SESSION_COOKIE,
    popupRedirectUri: SITE_ORIGIN,
  });

  gateway = createClassroomGateway(loginEnv, {
    fetchImpl,
    authenticate: login.authenticate,
    isCurrent: login.isCurrent,
    extendAfterSuccess: login.extendAfterSuccess,
    sessions: store,
    login: null,
  });

  function isSiteOrigin(request) {
    return request.headers.get('origin') === SITE_ORIGIN;
  }

  function isXmlHttpRequest(request) {
    return request.headers.get('x-requested-with') === 'XmlHttpRequest';
  }

  function readHandles(request) {
    const handles = sessionCookieValues(request);
    // 同名 cookie の重複はどれが正か決められない（注入の可能性）ため安全に拒否。
    if (handles.length > 1) return { duplicate: true };
    return { handle: handles.length === 1 ? handles[0] : null };
  }

  function handleOptions(request) {
    if (!isSiteOrigin(request)) return plainResponse('Forbidden', 403);
    const requestedMethod = request.headers.get('access-control-request-method');
    if (requestedMethod !== 'POST') return plainResponse('Forbidden', 403);

    const requestedHeaders = request.headers.get('access-control-request-headers');
    if (requestedHeaders) {
      for (const raw of requestedHeaders.split(',')) {
        const name = raw.trim().toLowerCase();
        if (name && !ALLOWED_REQUEST_HEADERS.has(name)) return plainResponse('Forbidden', 403);
      }
    }

    return new Response(null, {
      status: 204,
      headers: corsHeaders({
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-requested-with',
        'access-control-max-age': '600',
      }),
    });
  }

  async function handleStatus(request) {
    const { duplicate, handle } = readHandles(request);
    if (duplicate) return jsonResponse({ ok: false, error: 'duplicate_session_cookie' }, 400);
    if (!handle) return jsonResponse({ ok: true, authenticated: false }, 200);
    if (!store) return jsonResponse({ ok: false, error: 'session_store_unavailable' }, 503);
    if (handle.length > MAX_HANDLE_LENGTH) {
      return jsonResponse({ ok: true, authenticated: false }, 200);
    }

    let session;
    try {
      session = await store.read(handle);
    } catch {
      // DB 障害は「未ログイン」に倒さない（fail closed）
      return jsonResponse({ ok: false, error: 'session_store_unavailable' }, 503);
    }
    // refresh しない・延長しない。保存された正当なセッションの有無だけを返す。
    return jsonResponse({ ok: true, authenticated: Boolean(session) }, 200);
  }

  async function handleLogout(request) {
    const { duplicate, handle } = readHandles(request);
    if (duplicate) return jsonResponse({ ok: false, error: 'duplicate_session_cookie' }, 400);

    if (handle && handle.length <= MAX_HANDLE_LENGTH && store) {
      try {
        await revokeClassroomSession({ db, store, handle });
      } catch {
        // 失効結果が不明なまま cookie だけ消さない（再試行できる）。
        return jsonResponse({ ok: false, error: 'session_store_unavailable' }, 503);
      }
    }

    return jsonResponse({ ok: true, authenticated: false }, 200, {
      'set-cookie': clearPartitionedSessionCookie(),
    });
  }

  async function handlePopupExchange(request, body) {
    const { duplicate, handle: previousHandle } = readHandles(request);
    if (duplicate) return jsonResponse({ ok: false, error: 'duplicate_session_cookie' }, 400);

    // code 以外（redirect_uri / state / token 等）は一切採用しない。
    const code = typeof body.code === 'string' ? body.code : '';
    const result = await login.exchangePopupCode(code);

    // 既存セッションの cookie があれば、新規発行後に古い資格情報を残さない。
    if (previousHandle && previousHandle !== result.handle && store) {
      try {
        await revokeClassroomSession({ db, store, handle: previousHandle });
      } catch {
        /* 新規セッションの発行結果は巻き戻さない（古い側は期限切れで消える） */
      }
    }

    return jsonResponse({ ok: true, authenticated: true }, 200, {
      'set-cookie': partitionedSessionCookie(result.handle),
    });
  }

  async function handleOperation(request, pathname, bodyText) {
    const headers = new Headers({ origin: API_ORIGIN, 'content-type': 'application/json' });
    const cookie = request.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);

    const rewritten = new Request(API_ORIGIN + pathname, {
      method: 'POST',
      headers,
      body: bodyText === '' ? '{}' : bodyText,
    });
    const response = await gateway.fetch(rewritten);
    return corsWrap(response);
  }

  async function fetch(request) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return plainResponse('Bad Request', 400);
    }

    // API origin は固定。Pages preview / 別 workers.dev / root はすべて 404。
    // allowlist 判定は DB 設定より先に行う（root / 非 API は DB 欠如でも 404）。
    if (url.origin !== API_ORIGIN) return notFound();
    if (!ALLOWED_PATHS.has(url.pathname)) return notFound();
    if (!hasDb) return plainResponse('Not Configured', 503);

    if (request.method === 'OPTIONS') return handleOptions(request);

    if (!isSiteOrigin(request)) return plainResponse('Forbidden', 403);
    if (!isXmlHttpRequest(request)) return plainResponse('Forbidden', 403);
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, {
        allow: 'POST, OPTIONS',
      });
    }

    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    // `application/json` または `application/json; charset=...` だけを許可する
    // （application/jsonp 等の別 type を受け入れない）。
    if (!/^application\/json(?:\s*;.*)?$/.test(contentType.trim())) {
      return jsonResponse({ ok: false, error: 'content_type_must_be_json' }, 415);
    }

    const maxBytes = url.pathname === API_PATHS.print ? PRINT_BODY_LIMIT : JSON_BODY_LIMIT;
    const bounded = await readBodyBounded(request, maxBytes);
    if (bounded.tooLarge) return jsonResponse({ ok: false, error: 'payload_too_large' }, 413);
    if (bounded.bad) return jsonResponse({ ok: false, error: 'bad_request' }, 400);

    // 同名 session cookie の重複は、どの経路でも安全側に拒否する。
    if (sessionCookieValues(request).length > 1) {
      return jsonResponse({ ok: false, error: 'duplicate_session_cookie' }, 400);
    }

    try {
      if (url.pathname === API_PATHS.status) {
        return await handleStatus(request);
      }
      if (url.pathname === API_PATHS.logout) {
        return await handleLogout(request);
      }

      const parsed = parseJsonObject(bounded.text);
      if (parsed.bad) return jsonResponse({ ok: false, error: 'bad_request' }, 400);

      if (url.pathname === API_PATHS.popupExchange) {
        return await handlePopupExchange(request, parsed.value);
      }
      if (OPERATION_PATHS.has(url.pathname)) {
        return await handleOperation(request, url.pathname, bounded.text);
      }
      return notFound();
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { fetch };
}

export default {
  async fetch(request, env) {
    try {
      return await createClassroomAuthApi(env).fetch(request);
    } catch {
      // 設定不足・予期しない障害は fail closed（固定文言のみ）。
      return plainResponse('Service Unavailable', 503);
    }
  },
};
