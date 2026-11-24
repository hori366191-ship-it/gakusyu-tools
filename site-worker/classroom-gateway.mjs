/**
 * 教室タブレット用の同一オリジン Gateway（Cloudflare Worker 本体ロジック）
 *
 * 役割:
 *  - CLASSROOM_ORIGIN の正確な https host でのみ動作する専用 Worker。
 *  - 静的 Pages project のパスを固定 upstream（hori366191-ship-it.github.io/gakusyu-tools/）
 *    から取得して返す。Cookie / Authorization は Pages へ転送しない。
 *  - 全 HTML に <meta name="gakusyu-classroom-session" content="1"> を挿入する
 *    （クライアント側の opt-in。既存 Worker / 既存 URL には一切触れない）。
 *  - /_classroom/login|callback|logout は別モジュールのログインハンドラへ委譲する。
 *  - /_classroom/probe|print|generate|translate は「教室セッション」で認証し、
 *    現在の GAS（site-app2-backend / site-pdfdrop）へサーバ側で中継する。
 *
 * セキュリティ不変条件:
 *  - 操作系は strict Origin POST JSON、no-store、CORS ヘッダ無し。
 *  - GAS へ渡す token / id_token / parent_origin / action 等は body から採用せず、
 *    サーバ env と検証済みセッションから組み立てる。
 *  - GAS 応答は rid（+ 変更系は request_id）で必ず相関を確認する。結果不明は
 *    502/503（フロントの二重送信ガード）。確認済み成功のみセッションを延長する。
 *  - GAS のリダイレクトは 302/303 で script.googleusercontent.com への GET のみ許可。
 *    307/308・userinfo/port 付き・任意ホストへの追従はしない（token/本文を渡さない）。
 *
 * 依存（呼び出し側から注入）:
 *  - authenticate(request): Promise<null | { handle, subject, idToken }>
 *  - sessions: classroom-sessions.mjs のストア（extendAfterSuccess / read）
 *  - loginFactory(authorize) -> { handle(request) } もしくは login: { handle(request) }
 *  - fetchImpl: テスト用 fetch
 */

export const PAGES_ORIGIN = 'https://hori366191-ship-it.github.io';
export const PAGES_BASE_PATH = '/gakusyu-tools/';
export const PAGES_UPSTREAM = PAGES_ORIGIN + PAGES_BASE_PATH;
export const SESSION_META = '<meta name="gakusyu-classroom-session" content="1">';
export const FIXED_PARENT_ORIGIN = 'https://invalid.invalid';
export const GAS_REDIRECT_HOST = 'script.googleusercontent.com';

/** 現行固定デプロイ（site-worker/worker.js と同じ。既存 Worker は変更しない）。 */
export const GAS_TARGETS = Object.freeze({
  pdfdrop:
    'https://script.google.com/a/macros/hori-shota.com/s/AKfycbwj7qTaMDmKGa-KTEEwa2jcP7wtZ8xh_rVMANzfwKapz5u8tThqjxc2pQsbN-lAWU5L7Q/exec',
  app2:
    'https://script.google.com/a/macros/hori-shota.com/s/AKfycbxj8qyLzCLC_13B4kKDPZSX2rtdHjjOd2l8DTNisFbBb0xmPzQ0QyVCyYGIuTl6u75i/exec',
});

export const LIMITS = Object.freeze({
  jsonBody: 64 * 1024,
  // site-pdfdrop の MAX_BYTES = 10MiB。base64 後の上限より少し広く取る。
  printBody: 15 * 1024 * 1024,
  b64: 14_000_000,
  name: 160,
  settingText: 120,
  prompt: 1000,
  keywords: 10,
  keyword: 60,
  recordId: 128,
});

const RID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CONTEXT_RE = /^[0-9a-f]{64}$/;
const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const SETTING_TEXT_KEYS = ['world', 'style', 'textType', 'genre', 'development', 'ending'];
const FORWARD_FIELDS = [
  'ok',
  'error',
  'code',
  'retryable',
  'item',
  'translation',
  'name',
  'can_create',
  'replayed',
  'recovered',
];

const CLASSROOM_ROUTES = new Set(['login', 'callback', 'logout']);

/**
 * 新認証オリジンで HTML を配信してよいパス（XSS 面を減らすための限定 allowlist）。
 * それ以外の公開教材ページは GitHub Pages へ 302 で戻す（auth cookie は送られない）。
 */
const CLASSROOM_HTML_PATHS = new Set([
  '/',
  '/index.html',
  '/app2',
  '/app2/',
  '/app2/index.html',
  '/app9',
  '/app9/',
  '/app9/index.html',
  '/app12',
  '/app12/',
  '/app12/index.html',
]);

/** 固定 upstream から中継してよい非 HTML 資産の拡張子。 */
const ASSET_EXTENSIONS = new Set([
  'css',
  'js',
  'mjs',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'json',
  'map',
]);

/* ── 基本ユーティリティ ─────────────────────────── */

function noStoreHeaders(extra) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (extra instanceof Headers) {
    extra.forEach((value, key) => headers.set(key, value));
  } else if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return headers;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: noStoreHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function textResponse(text, status, headers) {
  return new Response(text, { status, headers: noStoreHeaders(headers) });
}

function toHex(bytes) {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/** ログイン確定時に固定長で作る非認証識別子。credential として使えない。 */
export async function contextForHandle(handle, pepper = '') {
  return sha256Hex(`gakusyu-classroom-context\n${String(pepper || '')}\n${String(handle || '')}`);
}

function constantTimeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function normalizeOrigin(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol !== 'https:') return '';
    if (u.username || u.password || u.port) return '';
    if (u.pathname !== '/' || u.search || u.hash) return '';
    return u.origin;
  } catch {
    return '';
  }
}

function newRid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/* ── Pages 静的配信（パス/リダイレクト制限） ─────── */

/**
 * リクエストパスを安全にデコードする。.. / . / 制御文字 / バックスラッシュ /
 * 二重スラッシュ / _classroom は null（明示拒否）。
 */
export function safeDecodedPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(pathname || ''));
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  if (decoded.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  if (decoded.includes('//')) return null;

  const segments = decoded.split('/');
  if (segments.some((s, i) => i > 0 && (s === '..' || s === '.'))) return null;
  if (segments[1] === '_classroom') return null;
  return decoded;
}

function isAllowedAssetPath(decodedPath) {
  const name = String(decodedPath).split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return false;
  return ASSET_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * リクエストパスから固定 upstream の URL を作る。
 * scheme 注入・任意オリジンは URL 構築後の origin 検査で拒否する。
 * 返り値は URL または null（null は 400/404 として扱う）。
 */
export function buildUpstreamUrl(requestUrl) {
  let u;
  try {
    u = new URL(String(requestUrl));
  } catch {
    return null;
  }
  const decoded = safeDecodedPath(u.pathname);
  if (!decoded) return null;

  const rel = decoded
    .split('/')
    .filter((s, i) => !(i === 0 && s === ''))
    .map((s) => encodeURIComponent(s))
    .join('/');

  let target;
  try {
    target = new URL(PAGES_UPSTREAM + rel + u.search);
  } catch {
    return null;
  }
  if (target.origin !== PAGES_ORIGIN) return null;
  if (!target.pathname.startsWith(PAGES_BASE_PATH)) return null;
  return target;
}

/**
 * upstream の Location を同一サイト（CLASSROOM_ORIGIN）へ復元する。
 * github.io/gakusyu-tools/ 配下以外・別オリジン・不正 URL は null（=明示拒否）。
 */
export function mapUpstreamRedirectLocation(location, upstreamUrl, classroomOrigin) {
  if (!location) return null;
  let abs;
  try {
    abs = new URL(String(location), upstreamUrl);
  } catch {
    return null;
  }
  if (abs.protocol !== 'https:' || abs.origin !== PAGES_ORIGIN) return null;
  if (abs.username || abs.password) return null;
  if (!abs.pathname.startsWith(PAGES_BASE_PATH)) return null;

  const rel = abs.pathname.slice(PAGES_BASE_PATH.length);
  if (rel.split('/').some((s) => s === '..' || s === '.')) return null;

  let mapped;
  try {
    mapped = new URL('/' + rel + abs.search + abs.hash, classroomOrigin);
  } catch {
    return null;
  }
  if (mapped.origin !== classroomOrigin) return null;
  return mapped.toString();
}

/* ── GAS 中継（安全なリダイレクトのみ） ─────────── */

/** 302/303 の Location が script.googleusercontent.com の https URL かを厳密確認。 */
export function safeGasRedirectUrl(location, baseUrl) {
  if (!location) return null;
  let u;
  try {
    u = new URL(String(location), baseUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.hostname !== GAS_REDIRECT_HOST) return null;
  if (u.username || u.password || u.port) return null;
  return u.toString();
}

/* ── body 検証 ──────────────────────────────────── */

async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true };
  let text;
  try {
    text = await request.text();
  } catch {
    return { bad: true };
  }
  if (text.length > maxBytes) return { tooLarge: true };
  if (!text.trim()) return { bad: true };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { bad: true };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { bad: true };
  return { value };
}

function pickSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};

  if (value.level !== undefined) {
    if (typeof value.level !== 'string' || value.level.length === 0 || value.level.length > 40) return null;
    out.level = value.level;
  }
  if (value.wordCount !== undefined) {
    const n = Number(value.wordCount);
    if (!Number.isFinite(n)) return null;
    out.wordCount = n;
  }
  for (const key of SETTING_TEXT_KEYS) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || value[key].length > LIMITS.settingText) return null;
    out[key] = value[key];
  }
  if (value.prompt !== undefined) {
    if (typeof value.prompt !== 'string' || value.prompt.length > LIMITS.prompt) return null;
    out.prompt = value.prompt;
  }
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords) || value.keywords.length > LIMITS.keywords) return null;
    const list = [];
    for (const k of value.keywords) {
      if (typeof k !== 'string' || k.length === 0 || k.length > LIMITS.keyword) return null;
      list.push(k);
    }
    out.keywords = list;
  }
  return out;
}

/* ── Gateway 本体 ───────────────────────────────── */

export function createClassroomGateway(env, deps = {}) {
  const settings = env || {};
  const classroomOrigin = normalizeOrigin(settings.CLASSROOM_ORIGIN);
  const app2Token = String(settings.CLASSROOM_APP2_TOKEN || '');
  const pdfdropToken = String(settings.CLASSROOM_PDFDROP_TOKEN || '');
  const contextPepper = String(settings.CLASSROOM_CONTEXT_PEPPER || '');

  const fetchImpl = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
  const authenticate = deps.authenticate;
  const isCurrent = typeof deps.isCurrent === 'function' ? deps.isCurrent : null;
  const extendAfterSuccess =
    typeof deps.extendAfterSuccess === 'function' ? deps.extendAfterSuccess : null;
  const sessions = deps.sessions || null;
  const HTMLRewriterImpl =
    deps.HTMLRewriterImpl || (typeof globalThis.HTMLRewriter === 'function' ? globalThis.HTMLRewriter : null);

  if (!fetchImpl) throw new TypeError('createClassroomGateway requires fetch');

  /* GAS fetch: リダイレクトは 302/303 → script.googleusercontent.com の GET のみ。 */
  async function gasFetch(url, init) {
    let resp;
    try {
      resp = await fetchImpl(url, { ...init, redirect: 'manual' });
    } catch {
      return { state: 'transport' };
    }
    if (!resp) return { state: 'transport' };

    if (resp.status >= 300 && resp.status < 400) {
      // 307/308/301 は token や本文を別 URL へ渡し得るため追従しない
      if (resp.status !== 302 && resp.status !== 303) return { state: 'unsafe_redirect' };
      const safe = safeGasRedirectUrl(resp.headers.get('location'), url);
      if (!safe) return { state: 'unsafe_redirect' };
      try {
        // 秘密ヘッダや本文は付けない（GET のみ）
        resp = await fetchImpl(safe, {
          method: 'GET',
          redirect: 'manual',
          headers: { accept: 'application/json' },
        });
      } catch {
        return { state: 'transport' };
      }
      if (!resp || resp.status !== 200) return { state: 'redirect_status' };
    }
    if (resp.status !== 200) return { state: 'http_' + resp.status };
    return { state: 'ok', resp };
  }

  async function probeTarget(target, idToken, rid) {
    const base = GAS_TARGETS[target];
    const token = target === 'pdfdrop' ? pdfdropToken : app2Token;
    const empty = { status: 'unreachable', isOwner: false, open: false, raw: null };
    if (!base || !token) return empty;

    // 新経路は両 GAS の doPost JSON `body.probe` を使う（id_token / token を URL に載せない）。
    const body = {
      probe: 1,
      token,
      rid,
      parent_origin: FIXED_PARENT_ORIGIN,
    };
    if (idToken) body.id_token = idToken;

    const result = await gasFetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (result.state !== 'ok') return { ...empty, reason: result.state };

    let json;
    try {
      json = await result.resp.json();
    } catch {
      return { ...empty, reason: 'bad_json' };
    }
    if (!json || typeof json !== 'object') return { ...empty, reason: 'bad_json' };
    if (json.genkoProbe !== true || json.rid !== rid) return { ...empty, reason: 'rid_mismatch' };

    const isOwner = json.is_owner === true;
    const open = json.open === true;

    if (json.ok === true) {
      if (json.allowed === true) return { status: 'ok', isOwner, open, raw: json };
      return { status: 'notallowed', isOwner, open, raw: json };
    }
    if (json.error === 'noauth') return { status: 'noauth', isOwner, open, raw: json };
    return { ...empty, open, reason: String(json.code || json.error || 'probe_failed') };
  }

  async function postGas(target, payload, rid) {
    const base = GAS_TARGETS[target];
    const token = target === 'pdfdrop' ? pdfdropToken : app2Token;
    if (!base || !token) return { state: 'config' };

    const result = await gasFetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (result.state !== 'ok') return { state: result.state };

    let json;
    try {
      json = await result.resp.json();
    } catch {
      return { state: 'bad_json' };
    }
    if (!json || typeof json !== 'object') return { state: 'bad_json' };
    if (json.rid !== rid) return { state: 'rid_mismatch' };
    return { state: 'ok', json };
  }

  function sessionAuth(requestId, rid, message) {
    return jsonResponse(
      {
        ok: false,
        error: message || 'authentication required',
        code: 'session_auth',
        rid: rid || '',
        request_id: requestId || '',
      },
      200,
    );
  }

  function unknownResult(requestId, rid) {
    return jsonResponse(
      {
        ok: false,
        error: 'upstream result is unknown; do not resend without checking saved data',
        code: 'upstream_unknown',
        rid: rid || '',
        request_id: requestId || '',
      },
      502,
    );
  }

  function unavailable(requestId, rid, code) {
    return jsonResponse(
      {
        ok: false,
        error: 'classroom upstream is temporarily unavailable',
        code: code || 'upstream_unreachable',
        rid: rid || '',
        request_id: requestId || '',
      },
      503,
    );
  }

  async function currentSession(request) {
    if (typeof authenticate !== 'function') return { error: 'unavailable' };
    try {
      const session = await authenticate(request);
      if (!session) return { session: null };
      if (
        typeof session.handle !== 'string' ||
        typeof session.subject !== 'string' ||
        typeof session.idToken !== 'string' ||
        !session.handle ||
        !session.subject ||
        !session.idToken
      ) {
        return { session: null };
      }
      return { session };
    } catch {
      return { error: 'unavailable' };
    }
  }

  /** probe→mutation の間に失効していないことを再確認する（isCurrent 優先）。 */
  async function isSessionLive(session) {
    if (isCurrent) {
      try {
        return (await isCurrent(session)) === true;
      } catch {
        return 'store_error';
      }
    }
    if (!sessions || typeof sessions.read !== 'function') return true;
    let live;
    try {
      live = await sessions.read(session.handle);
    } catch {
      return 'store_error';
    }
    if (!live) return false;
    return live.subject === session.subject;
  }

  /** ログイン確定用: 両 GAS の検証済み rid と ok && allowed の「どちらか」で許可。 */
  async function authorize(input) {
    const idToken =
      typeof input === 'string'
        ? input
        : (input && (input.idToken || input.id_token)) || '';
    if (!idToken) return false;

    const rid = newRid();
    const [app2, pdfdrop] = await Promise.all([
      probeTarget('app2', idToken, rid),
      probeTarget('pdfdrop', idToken, rid),
    ]);
    return (
      (app2.status === 'ok' && app2.raw && app2.raw.rid === rid && app2.raw.ok === true && app2.raw.allowed === true) ||
      (pdfdrop.status === 'ok' &&
        pdfdrop.raw &&
        pdfdrop.raw.rid === rid &&
        pdfdrop.raw.ok === true &&
        pdfdrop.raw.allowed === true)
    );
  }

  const login =
    typeof deps.loginFactory === 'function'
      ? deps.loginFactory(authorize)
      : deps.login || null;

  /* ── 操作系 ────────────────────────────────── */

  async function handleOperation(request, route) {
    if (request.method !== 'POST') {
      return textResponse('Method Not Allowed', 405, { allow: 'POST' });
    }
    if (request.headers.get('Origin') !== classroomOrigin) {
      return jsonResponse({ ok: false, error: 'bad origin', code: 'bad_origin' }, 403);
    }
    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return jsonResponse({ ok: false, error: 'content-type must be application/json' }, 415);
    }

    const maxBytes = route === 'print' ? LIMITS.printBody : LIMITS.jsonBody;
    const parsed = await readJsonBody(request, maxBytes);
    if (parsed.tooLarge) {
      return jsonResponse({ ok: false, error: 'payload too large', code: 'payload_too_large' }, 413);
    }
    if (parsed.bad) {
      return jsonResponse({ ok: false, error: 'invalid JSON body', code: 'bad_request' }, 400);
    }
    const body = parsed.value;

    if (route === 'probe') {
      const target = body.target;
      if (target !== 'app2' && target !== 'pdfdrop') {
        return jsonResponse({ ok: false, error: 'target must be app2 or pdfdrop', code: 'bad_target' }, 400);
      }
      const auth = await currentSession(request);
      if (auth.error) return unavailable('', '', 'session_store_unavailable');
      const session = auth.session || null;

      const rid = newRid();
      const probe = await probeTarget(target, session ? session.idToken : '', rid);
      let context = '';
      if (session) context = await contextForHandle(session.handle, contextPepper);

      return jsonResponse(
        {
          status: probe.status,
          isOwner: probe.isOwner === true,
          open: probe.open === true,
          context,
        },
        200,
      );
    }

    // 変更系: request_id / rid はクライアント生成値を使い、応答と照合する。
    const requestId = typeof body.request_id === 'string' ? body.request_id : '';
    const rid = typeof body.rid === 'string' ? body.rid : '';
    if (!REQUEST_ID_RE.test(requestId)) {
      return jsonResponse({ ok: false, error: 'request_id is invalid', code: 'bad_request', rid }, 400);
    }
    if (!RID_RE.test(rid)) {
      return jsonResponse(
        { ok: false, error: 'rid is invalid', code: 'bad_request', rid: '', request_id: requestId },
        400,
      );
    }

    const auth = await currentSession(request);
    if (auth.error) return unavailable(requestId, rid, 'session_store_unavailable');
    const session = auth.session;
    if (!session) return sessionAuth(requestId, rid, 'authentication required');

    const expectedContext = await contextForHandle(session.handle, contextPepper);
    const givenContext = typeof body.context === 'string' ? body.context : '';
    if (!CONTEXT_RE.test(givenContext) || !constantTimeEqual(givenContext, expectedContext)) {
      return sessionAuth(requestId, rid, 'session authentication context mismatch');
    }

    const target = route === 'print' ? 'pdfdrop' : 'app2';
    const probe = await probeTarget(target, session.idToken, rid);
    if (probe.status === 'noauth') return sessionAuth(requestId, rid, 'session authentication expired');
    if (probe.status === 'notallowed') return sessionAuth(requestId, rid, 'not authorized for classroom session');
    if (probe.status !== 'ok') return unavailable(requestId, rid, 'probe_unavailable');

    // app2 は classroom guard（require_allowed 優先）対応を確認できない限り呼ばない。
    if (target === 'app2' && !(probe.raw && probe.raw.classroom_guard === true)) {
      return unavailable(requestId, rid, 'guard_unavailable');
    }

    const live = await isSessionLive(session);
    if (live === 'store_error') return unavailable(requestId, rid, 'session_store_unavailable');
    if (live === false) return sessionAuth(requestId, rid, 'session authentication is no longer valid');

    let payload;
    let extendOperation = '';

    if (route === 'print') {
      const name = typeof body.name === 'string' ? body.name : '';
      const b64 = typeof body.b64 === 'string' ? body.b64 : '';
      if (!name || name.length > LIMITS.name) {
        return jsonResponse({ ok: false, error: 'name is invalid', code: 'bad_request', rid, request_id: requestId }, 400);
      }
      if (!b64 || b64.length > LIMITS.b64) {
        return jsonResponse(
          { ok: false, error: 'b64 is invalid or too large', code: 'bad_request', rid, request_id: requestId },
          400,
        );
      }
      payload = {
        token: pdfdropToken,
        id_token: session.idToken,
        request_id: requestId,
        rid,
        name,
        b64,
        parent_origin: FIXED_PARENT_ORIGIN,
      };
      extendOperation = 'classroom-print';
    } else if (route === 'generate') {
      const picked = pickSettings(body.settings);
      if (!picked) {
        return jsonResponse(
          { ok: false, error: 'settings are invalid', code: 'bad_request', rid, request_id: requestId },
          400,
        );
      }
      payload = {
        action: 'generateText',
        token: app2Token,
        id_token: session.idToken,
        request_id: requestId,
        rid,
        require_allowed: true,
        settings: picked,
        parent_origin: FIXED_PARENT_ORIGIN,
      };
      extendOperation = 'generate-text';
    } else if (route === 'translate') {
      const recordId = typeof body.record_id === 'string' ? body.record_id : '';
      if (!RECORD_ID_RE.test(recordId) || recordId.length > LIMITS.recordId) {
        return jsonResponse(
          { ok: false, error: 'record_id is invalid', code: 'bad_request', rid, request_id: requestId },
          400,
        );
      }
      payload = {
        action: 'translateText',
        token: app2Token,
        id_token: session.idToken,
        request_id: requestId,
        rid,
        mode: 'create',
        record_id: recordId,
        require_allowed: true,
        parent_origin: FIXED_PARENT_ORIGIN,
      };
    } else {
      return jsonResponse({ ok: false, error: 'not found' }, 404);
    }

    const result = await postGas(target, payload, rid);
    if (result.state !== 'ok') return unavailable(requestId, rid, 'upstream_' + result.state);

    const json = result.json;

    // 変更系の相関: rid は postGas で確認済み。request_id を必ず照合する。
    if (Object.prototype.hasOwnProperty.call(json, 'request_id')) {
      if (json.request_id !== requestId) return unknownResult(requestId, rid);
    } else if (json.ok === true) {
      // 成功なのに request_id が無い＝操作を特定できない。付与しない（never grant）。
      return unknownResult(requestId, rid);
    }

    // 明示的な noauth / no permission は session_auth（transport uncertain と区別）。
    if (json.ok !== true && isExplicitAuthFailure(json)) {
      return sessionAuth(requestId, rid, 'session authentication or permission is no longer valid');
    }

    const responseJson = { ok: json.ok === true };
    for (const key of FORWARD_FIELDS) {
      if (key === 'ok') continue;
      if (json[key] !== undefined) responseJson[key] = json[key];
    }
    responseJson.rid = rid;
    responseJson.request_id = requestId;

    // 確認済み成功のみ延長。replay/recovered は延長しない。延長失敗は成功を巻き戻さない。
    if (
      extendOperation &&
      responseJson.ok === true &&
      json.replayed !== true &&
      json.recovered !== true
    ) {
      try {
        if (extendAfterSuccess) {
          await extendAfterSuccess(session, extendOperation, { ok: true });
        } else if (sessions && typeof sessions.extendAfterSuccess === 'function') {
          await sessions.extendAfterSuccess(session.handle, session.subject, extendOperation, { ok: true });
        }
      } catch {
        /* 成功済み操作をエラーにしない */
      }
    }

    return jsonResponse(responseJson, 200);
  }

  /* ── 静的 Pages 配信 ───────────────────────── */

  async function injectSessionMeta(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html')) return response;

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('set-cookie');
    // HTML は本文を書き換えるため validator を引き継がない（条件付き再検証もしない）。
    headers.delete('etag');
    headers.delete('last-modified');
    headers.set('cache-control', 'no-cache');
    // 認証 HTML だけの最小 CSP。script/style/default-src は制限しない
    // （既存の読み込み経路を壊さない）。
    // form-action に accounts.google.com を含める: 303 redirect を Chrome が止めるため（実測）。
    headers.set(
      'content-security-policy',
      "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' https://accounts.google.com",
    );

    if (HTMLRewriterImpl) {
      let inserted = false;
      const rewriter = new HTMLRewriterImpl().on('head', {
        element(el) {
          if (inserted) return;
          inserted = true;
          // 必ず head の先頭に置く（クライアント初期化より前）。
          el.prepend(SESSION_META, { html: true });
        },
      });
      return rewriter.transform(
        new Response(response.body, { status: response.status, headers }),
      );
    }

    // HTMLRewriter が無い環境（テスト等）のフォールバック（head 先頭に挿入）
    let text = await response.text();
    if (!text.includes('name="gakusyu-classroom-session"')) {
      const match = /<head[^>]*>/i.exec(text);
      if (match) {
        const at = match.index + match[0].length;
        text = text.slice(0, at) + SESSION_META + text.slice(at);
      } else {
        text = SESSION_META + text;
      }
    }
    return new Response(text, { status: response.status, headers });
  }

  async function handleStatic(request, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('Method Not Allowed', 405, { allow: 'GET, HEAD' });
    }
    const decoded = safeDecodedPath(url.pathname);
    if (!decoded) return textResponse('Not Found', 404);

    // HTML は限定 allowlist のみ新オリジンで配信する。それ以外の公開教材は
    // GitHub Pages へ 302 で戻す（クロスオリジンなので auth cookie は送られない）。
    const htmlAllowed = CLASSROOM_HTML_PATHS.has(decoded);
    const assetAllowed = !htmlAllowed && isAllowedAssetPath(decoded);
    if (!htmlAllowed && !assetAllowed) {
      const target = buildUpstreamUrl(request.url);
      if (!target) return textResponse('Not Found', 404);
      return new Response(null, {
        status: 302,
        headers: noStoreHeaders({ location: target.toString() }),
      });
    }

    const upstreamUrl = buildUpstreamUrl(request.url);
    if (!upstreamUrl) return textResponse('Not Found', 404);

    // Cookie / Authorization / その他のブラウザ秘密は転送しない
    const headers = { accept: request.headers.get('accept') || '*/*' };
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) headers['accept-language'] = acceptLanguage;

    let upstream;
    try {
      upstream = await fetchImpl(upstreamUrl.toString(), {
        method: request.method,
        headers,
        redirect: 'manual',
      });
    } catch {
      return textResponse('Bad Gateway', 502);
    }

    const status = upstream.status;
    const responseHeaders = new Headers();
    for (const key of ['content-type', 'cache-control', 'etag', 'last-modified']) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    responseHeaders.set('x-content-type-options', 'nosniff');

    if (status >= 300 && status < 400) {
      const location = upstream.headers.get('location');
      const mapped = mapUpstreamRedirectLocation(location, upstreamUrl.toString(), classroomOrigin);
      if (!mapped) return textResponse('Not Found', 404);
      responseHeaders.set('location', mapped);
      return new Response(null, { status, headers: noStoreHeaders(responseHeaders) });
    }

    // 明示的な拒否（401/403 等）も legacy fallback せずそのまま返す
    const response = new Response(upstream.body, { status, headers: responseHeaders });
    if (request.method === 'HEAD') return response;
    return injectSessionMeta(response);
  }

  /* ── ルーティング ─────────────────────────── */

  async function fetch(request) {
    if (!classroomOrigin) return textResponse('Not Configured', 503);

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return textResponse('Bad Request', 400);
    }
    // CLASSROOM_ORIGIN の正確な https host のみ
    if (url.origin !== classroomOrigin) return textResponse('Not Found', 404);
    if (url.pathname === '/_classroom' || url.pathname.startsWith('/_classroom/')) {
      const route = url.pathname.slice('/_classroom/'.length).replace(/\/+$/, '');
      if (CLASSROOM_ROUTES.has(route)) {
        if (!login || typeof login.handle !== 'function') {
          // 認証エンドポイントの soft-disable。未設定は fail closed。
          return textResponse('Not Configured', 503);
        }
        try {
          const response = await login.handle(request);
          if (response instanceof Response) {
            const headers = new Headers(response.headers);
            headers.set('cache-control', 'no-store');
            headers.set('x-content-type-options', 'nosniff');
            return new Response(response.body, { status: response.status, headers });
          }
          return response;
        } catch {
          return textResponse('Internal Error', 500);
        }
      }
      if (route === 'probe' || route === 'print' || route === 'generate' || route === 'translate') {
        return handleOperation(request, route);
      }
      return jsonResponse({ ok: false, error: 'not found' }, 404);
    }

    return handleStatic(request, url);
  }

  return { fetch, authorize, probeTarget };
}

function isExplicitAuthFailure(json) {
  if (!json || json.ok === true) return false;
  if (json.code === 'not_allowed') return true;
  if (json.code === 'bad_token' || json.code === 'token_not_configured') return false;
  const error = String(json.error || '');
  return /noauth|not allowed/i.test(error);
}

export default createClassroomGateway;
