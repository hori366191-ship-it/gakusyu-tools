/**
 * 教室ログインの OAuth/OIDC 境界（Cloudflare Workers / D1）
 *
 * 目的:
 *  - 既存 GAS の tokeninfo + 全 claim 検証は変更しない。その手前で
 *    「Google OAuth Web-server authorization code flow」(openid email, offline) を行い、
 *    長期ログイン用の refresh token をサーバー側だけに暗号化保存する。
 *  - 長期証明（raw handle / refresh token / id_token）を JS や URL へ渡さない。
 *    ブラウザへ渡すのは `__Host-classroom_session`（Secure / HttpOnly / SameSite=Lax /
 *    Path=/ / Max-Age=90日）のみ。値は raw handle で、DB にはハッシュだけを保存する。
 *  - 30日 idle / 最大90日 absolute の判定は `classroom-sessions.mjs`（D1）が権威。
 *    レスポンスごとの cookie 延長は行わず、cookie の Max-Age は 90日固定。
 *  - 確認済みの印刷 / 生成が成功したときだけ `extendAfterSuccess` で延長する。
 *
 * 管理・運用:
 *  - ログアウトはセッションを tombstone 失効させ、`classroom_oauth_credentials` の行を
 *    削除する（refresh token を残さない）。
 *  - 手動の管理失効は D1 の運用で行う:
 *      ・subject 単位: `classroomSessions(db).revokeForSubject(subject)`
 *      ・セッション行単位: `DELETE FROM classroom_sessions WHERE handle_hash = ?`
 *        （`classroom_oauth_credentials` は ON DELETE CASCADE で同時に消える）
 *      ・OAuth 資格情報だけ無効化: `DELETE FROM classroom_oauth_credentials WHERE handle_hash = ?`
 *  - ログイン form の戻り先 input 名は `return_to`（完全一致の allowlist 以外は `/`）。
 *
 * 設定（env）:
 *  - CLASSROOM_DB                  … D1 binding
 *  - CLASSROOM_ORIGIN              … canonical な https origin（例 https://tools.example）
 *  - CLASSROOM_GOOGLE_CLIENT_ID    … 既存 GIS と同じ OAuth クライアント ID（GAS の aud と一致）
 *  - CLASSROOM_GOOGLE_CLIENT_SECRET … クライアントシークレット（CLASSROOM_SECRET も可）
 *  - CLASSROOM_ENCRYPTION_KEY      … 32 byte を base64url で表現した AES-GCM 鍵
 *  - いずれかが欠落・不正なら fail closed（ログイン開始せず、authenticate は null）。
 *
 * 公開インターフェース:
 *  createClassroomLogin(env, { authorize, fetchImpl = fetch, now = Date.now })
 *    -> { handle(request), authenticate(request), extendAfterSuccess(session, op, result),
 *         isCurrent(session) }
 *  - handle: `/_classroom/login` (POST same-origin) / `/_classroom/callback` (GET) /
 *            `/_classroom/logout` (POST same-origin) を処理する。
 *            教室ルート以外は null を返す（呼び出し側のルーティングを妨げない）。
 *  - authenticate: 有效なら `{ handle, subject, idToken }`（サーバー専用）。無効は null:
 *    cookie 無し / DB 上の失効・期限切れ / 明確な invalid_grant / claim 不一致。
 *    cookie はあるが D1・Google の一時障害、壊れた暗号文、資格情報の不整合など
 *    不確定な場合は `ClassroomAuthUnavailableError` を投げる（gateway は 503 fail closed）。
 *  - extendAfterSuccess: `classroom-sessions` の延長 API へ委譲する。
 *  - authorize({ idToken, subject, email }) は初回発行前に必須。true を返した場合のみ
 *    セッションを発行する。未指定・例外・false は fail closed。
 *  - isCurrent(session): GAS probe 後に呼ぶ小さな再確認。handle を一貫して `read` し、
 *    subject 一致・資格情報の存在まで確認する（延長はしない）。明確な不一致は false、
 *    DB 障害や資格情報欠落などの不確定は ClassroomAuthUnavailableError。
 *  - authenticate は refresh 直後にセッションを再読込し、失効/期限切れなら idToken を返さない。
 *  - Google への検証通信（code exchange / refresh / tokeninfo）は固定 HTTPS エンドポイントに
 *    対して行い、上限付きの deadline（AbortSignal.timeout）を必ず付ける。
 */

import { classroomSessions } from './classroom-sessions.mjs';

export const ROUTES = Object.freeze({
  login: '/_classroom/login',
  callback: '/_classroom/callback',
  logout: '/_classroom/logout',
});

export const SESSION_COOKIE = '__Host-classroom_session';
export const OAUTH_COOKIE = '__Host-classroom_oauth';
export const SESSION_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90日固定（DB が権威）
export const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10分
export const DEFAULT_RETURN_TO_ALLOWLIST = Object.freeze([
  '/',
  '/app2/',
  '/app9/', // 原稿用紙
  '/app12/', // 学習プリント
]);

export const GOOGLE_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

const SCOPE = 'openid email';
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const STATE_BYTES = 32;
const NONCE_BYTES = 32;
const VERIFIER_BYTES = 32;
const MAX_HANDLE_LENGTH = 512;
const MAX_AUTHORIZATION_CODE_LENGTH = 4096;
const MAX_SUBJECT_LENGTH = 512;
const MAX_EMAIL_LENGTH = 320;
const CREDENTIAL_AAD_PREFIX = 'classroom-oauth-credentials:';
const STATE_AAD_PREFIX = 'classroom-oauth-state:';
const ID_TOKEN_SKEW_SECONDS = 60;
export const VERIFICATION_TIMEOUT_MS = 10_000;

export class ClassroomLoginError extends Error {
  constructor(status, code, unavailable = false) {
    super(code);
    this.name = 'ClassroomLoginError';
    this.status = status;
    this.code = code;
    // true = 一時障害・不確定（gateway は 503 fail closed に倒す）
    this.unavailable = unavailable;
  }
}

const LoginError = ClassroomLoginError;

/**
 * `authenticate` が「cookie はあるが確認できない」場合に投げる安全なエラー。
 * 一時障害（D1 / Google の timeout・429・5xx）、壊れた暗号文、資格情報の不整合など
 * 不確定な状態だけを表す。credential / token / subject は一切含めない。
 * 呼び出し側は 503（unreachable）として fail closed し、匿名扱いにしないこと。
 */
export class ClassroomAuthUnavailableError extends Error {
  constructor() {
    super('classroom authentication is temporarily unavailable');
    this.name = 'ClassroomAuthUnavailableError';
    this.code = 'CLASSROOM_AUTH_UNAVAILABLE';
    this.status = 503;
  }
}

/* ------------------------------------------------------------------ *
 * バイト列・ハッシュ・乱数
 * ------------------------------------------------------------------ */

function toBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64url(bytes);
}

async function sha256Bytes(value) {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function sha256Hex(value) {
  const bytes = await sha256Bytes(value);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

async function sha256Base64url(value) {
  return toBase64url(await sha256Bytes(value));
}

/** 同一長の文字列を定数時間で比較する（state / nonce / hash 用）。 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const bytes = fromBase64url(parts[1]);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * AES-GCM（秘密はサーバー側だけ）
 * ------------------------------------------------------------------ */

function encryptionKey(encoded) {
  const bytes = fromBase64url(String(encoded || '').trim());
  if (!bytes || bytes.length !== 32) return null;
  return bytes;
}

async function importAesKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder();
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoded.encode(aad) },
      key,
      encoded.encode(plaintext),
    ),
  );
  const tag = sealed.slice(sealed.length - 16);
  const body = sealed.slice(0, sealed.length - 16);
  return { iv: toBase64url(iv), ciphertext: toBase64url(body), tag: toBase64url(tag) };
}

async function decryptSecret(key, record, aad) {
  const iv = fromBase64url(record.iv);
  const body = fromBase64url(record.ciphertext);
  const tag = fromBase64url(record.tag);
  if (!iv || body === null || !tag || tag.length !== 16) {
    // 壊れた暗号文は「失効」ではなく不確定として扱う
    throw new LoginError(503, 'secret_unreadable', true);
  }
  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body, 0);
  sealed.set(tag, body.length);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
      key,
      sealed,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new LoginError(503, 'secret_unreadable', true);
  }
}

/* ------------------------------------------------------------------ *
 * 設定
 * ------------------------------------------------------------------ */

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
  // canonical: `https://host`（末尾スラッシュやパスなし）と完全一致すること
  if (url.origin !== value) return null;
  return url.origin;
}

function readConfig(env) {
  if (!env || typeof env !== 'object') return null;
  const db = env.CLASSROOM_DB;
  if (!db || typeof db.prepare !== 'function') return null;
  const origin = normalizeOrigin(env.CLASSROOM_ORIGIN);
  if (!origin) return null;
  const clientId = typeof env.CLASSROOM_GOOGLE_CLIENT_ID === 'string' ? env.CLASSROOM_GOOGLE_CLIENT_ID.trim() : '';
  if (!clientId) return null;
  const clientSecret = env.CLASSROOM_GOOGLE_CLIENT_SECRET || env.CLASSROOM_SECRET;
  if (typeof clientSecret !== 'string' || clientSecret === '') return null;
  const keyBytes = encryptionKey(env.CLASSROOM_ENCRYPTION_KEY);
  if (!keyBytes) return null;
  return { db, origin, clientId, clientSecret, keyBytes, redirectUri: origin + ROUTES.callback };
}

function normalizeAllowlist(list) {
  const source = Array.isArray(list) && list.length > 0 ? list : DEFAULT_RETURN_TO_ALLOWLIST;
  const entries = new Set();
  for (const item of source) {
    const value = normalizeLocalPath(item);
    if (value) entries.add(value);
  }
  entries.add('/');
  return entries;
}

/** ローカルパスのみ（scheme/host/`//`/バックスラッシュ/制御文字を拒否）。 */
function normalizeLocalPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid') return null;
    if (url.username || url.password) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * HTTP ヘルパー
 * ------------------------------------------------------------------ */

function noStoreHeaders(extra = {}) {
  const headers = new Headers({ 'cache-control': 'no-store', pragma: 'no-cache' });
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

function errorResponse(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: noStoreHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function redirectResponse(location, cookies = []) {
  const headers = noStoreHeaders({ location });
  headers.set('referrer-policy', 'no-referrer');
  const response = new Response(null, { status: 303, headers });
  for (const cookie of cookies) response.headers.append('set-cookie', cookie);
  return response;
}

/** callback 失敗時の redirect は常に固定ローカル（`/?login_error=<code>`）へ。 */
function callbackErrorResponse(code) {
  return redirectResponse('/?login_error=' + encodeURIComponent(code), [clearOauthCookie()]);
}

function sessionCookie(cookieName, handle) {
  return `${cookieName}=${handle}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}`;
}

function clearSessionCookie(cookieName) {
  return `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function oauthCookie(state, nonce) {
  return `${OAUTH_COOKIE}=${state}.${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_SECONDS}`;
}

function clearOauthCookie() {
  return `${OAUTH_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cookieValue(request, name) {
  const values = cookieValues(request, name);
  return values.length > 0 ? values[0] || null : null;
}

function cookieValues(request, name, { includeEmpty = false } = {}) {
  const header = request.headers.get('cookie');
  const values = [];
  if (!header) return values;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      // 既定（cookieValue 等）は従来どおり空値を無視する。
      // 重複判定だけは includeEmpty: true で空値も 1 個として数える。
      if (value || includeEmpty) values.push(value);
    }
  }
  return values;
}

function isSameOrigin(request, origin) {
  const header = request.headers.get('origin');
  if (!header) return false;
  return timingSafeEqual(header, origin);
}

/** リクエスト自体が canonical origin 上にあること（Authorization URL を固定する）。 */
function isCanonicalRequest(request, origin) {
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

async function readForm(request) {
  try {
    const form = await request.formData();
    return form;
  } catch {
    return new FormData();
  }
}

/** フロントの form input 名は `return_to`。完全一致の allowlist 以外は `/` に落とす。 */
function pickReturnTo(form, allowlist) {
  const value =
    form && typeof form.get === 'function'
      ? form.get('return_to') ?? form.get('returnTo')
      : null;
  const normalized = normalizeLocalPath(value);
  if (normalized && allowlist.has(normalized)) return normalized;
  return '/';
}

/* ------------------------------------------------------------------ *
 * Google 側の検証
 * ------------------------------------------------------------------ */

/** Google への検証通信に必ず上限付き deadline を付ける（無応答で処理を吊らせない）。 */
function withVerificationDeadline(init) {
  if (init.signal) return init;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...init, signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MS) };
  }
  return init;
}

async function postTokenEndpoint(fetchImpl, params) {
  let response;
  try {
    response = await fetchImpl(
      GOOGLE_TOKEN_ENDPOINT,
      withVerificationDeadline({
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams(params).toString(),
      }),
    );
  } catch {
    throw new LoginError(503, 'token_endpoint_unreachable', true);
  }
  if (!response) throw new LoginError(503, 'token_endpoint_unreachable', true);
  if (response.status === 429 || response.status >= 500) {
    throw new LoginError(503, 'token_endpoint_unavailable', true);
  }
  return response;
}

async function readJsonBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * tokeninfo で Google 検証済み claim を取得し、必須 claim をすべて確認する。
 * 署名未検証 JWT の claim だけで許可しない（tokeninfo の HTTP 200 + 全 claim が条件）。
 */
async function verifyIdToken(config, idToken, fetchImpl, nowMs) {
  let response;
  try {
    response = await fetchImpl(
      `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`,
      withVerificationDeadline({
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      }),
    );
  } catch {
    throw new LoginError(503, 'tokeninfo_unreachable', true);
  }
  if (!response) throw new LoginError(503, 'tokeninfo_unreachable', true);
  if (response.status === 429 || response.status >= 500) {
    throw new LoginError(503, 'tokeninfo_unavailable', true);
  }
  if (response.status !== 200) throw new LoginError(401, 'tokeninfo_rejected');

  const claims = await readJsonBody(response);
  if (!claims || typeof claims !== 'object') throw new LoginError(502, 'tokeninfo_invalid', true);

  const audMatches = Array.isArray(claims.aud)
    ? claims.aud.includes(config.clientId)
    : claims.aud === config.clientId;
  if (!audMatches) throw new LoginError(401, 'aud_mismatch');

  if (!ALLOWED_ISSUERS.has(claims.iss)) throw new LoginError(401, 'iss_mismatch');

  const nowSeconds = Math.floor(nowMs / 1000);
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp <= nowSeconds) throw new LoginError(401, 'token_expired');

  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!emailVerified) throw new LoginError(401, 'email_not_verified');

  const sub = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  if (!sub || sub.length > MAX_SUBJECT_LENGTH) throw new LoginError(401, 'sub_invalid');

  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes('@')) {
    throw new LoginError(401, 'email_invalid');
  }

  return { sub, email, exp };
}

/** GIS popup code model からも同じ tokeninfo 全 claim 検証を使う。 */
export const verifyGoogleIdToken = verifyIdToken;

/**
 * authorization code を token endpoint で交換する。
 * - 既存 callback は redirect_uri = CLASSROOM_ORIGIN + /_classroom/callback と PKCE verifier を渡す。
 * - GIS popup code model は redirect_uri に呼び出しページの origin を固定し、verifier は使わない。
 */
export async function exchangeAuthorizationCode(config, { code, verifier, redirectUri }, fetchImpl) {
  const params = {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri || config.redirectUri,
    grant_type: 'authorization_code',
  };
  if (verifier) params.code_verifier = verifier;
  const response = await postTokenEndpoint(fetchImpl, params);
  if (!response || response.status !== 200) throw new LoginError(401, 'code_exchange_failed');
  const body = await readJsonBody(response);
  if (!body || typeof body.id_token !== 'string' || body.id_token === '') {
    throw new LoginError(401, 'id_token_missing');
  }
  if (typeof body.refresh_token !== 'string' || body.refresh_token === '') {
    // offline で refresh token が無いと長期ログインを維持できないため fail closed
    throw new LoginError(401, 'refresh_token_missing');
  }
  return {
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    scope: typeof body.scope === 'string' ? body.scope : null,
  };
}

/* ------------------------------------------------------------------ *
 * D1 ヘルパー
 * ------------------------------------------------------------------ */

function primary(database) {
  if (database && typeof database.withSession === 'function') {
    return database.withSession('first-primary');
  }
  return database;
}

const STATE_COLUMNS =
  'state_hash, nonce_hash, verifier_cipher, verifier_iv, verifier_tag, return_to, expires_at';
const CREDENTIAL_COLUMNS =
  'handle_hash, subject, id_token_cipher, id_token_iv, id_token_tag, id_token_expires_at, ' +
  'refresh_token_cipher, refresh_token_iv, refresh_token_tag';

/* ------------------------------------------------------------------ *
 * セッション + OAuth 資格情報の発行 / 失効（callback と popup で共用）
 * ------------------------------------------------------------------ */

/**
 * 検証済み subject に対してセッションを作成し、id_token / refresh_token を
 * サーバー側だけで暗号化保存する。refresh_token が無ければ fail closed。
 * 資格情報の保存に失敗した場合はセッションを revoke して例外を投げる。
 */
export async function issueClassroomSession({
  db,
  store,
  key,
  subject,
  idToken,
  refreshToken,
  scope = null,
  idTokenExpiresAt,
  nowSeconds,
}) {
  if (!db || !store) throw new LoginError(503, 'session_store_unavailable', true);
  if (typeof subject !== 'string' || subject === '' || subject.length > MAX_SUBJECT_LENGTH) {
    throw new LoginError(401, 'sub_invalid');
  }
  if (typeof idToken !== 'string' || idToken === '') throw new LoginError(401, 'id_token_missing');
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    throw new LoginError(401, 'refresh_token_missing');
  }
  const expiresAt = Number(idTokenExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
    throw new LoginError(401, 'token_expired');
  }

  const session = await store.createForVerifiedSubject(subject);
  const aad = CREDENTIAL_AAD_PREFIX + subject;
  const sealedIdToken = await encryptSecret(key, idToken, aad);
  const sealedRefresh = await encryptSecret(key, refreshToken, aad);

  try {
    const result = await primary(db)
      .prepare(
        `INSERT INTO classroom_oauth_credentials
           (handle_hash, subject,
            id_token_cipher, id_token_iv, id_token_tag, id_token_expires_at,
            refresh_token_cipher, refresh_token_iv, refresh_token_tag,
            scope, created_at, updated_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        await sha256Hex(session.handle),
        subject,
        sealedIdToken.ciphertext,
        sealedIdToken.iv,
        sealedIdToken.tag,
        expiresAt,
        sealedRefresh.ciphertext,
        sealedRefresh.iv,
        sealedRefresh.tag,
        scope,
        nowSeconds,
        nowSeconds,
      )
      .run();
    if (!result || result.success === false) throw new Error('credential insert failed');
  } catch (error) {
    // セッションだけ残さない（fail closed）
    await store.revoke(session.handle).catch(() => {});
    throw new LoginError(503, 'credential_store_failed');
  }

  return session;
}

/**
 * ログアウト: OAuth 資格情報（refresh token の暗号文）を削除してから
 * セッションを tombstone 失効させる。DB 障害は例外（呼び出し側が fail closed）。
 */
export async function revokeClassroomSession({ db, store, handle }) {
  if (!db || !store) throw new LoginError(503, 'session_store_unavailable', true);
  if (typeof handle !== 'string' || handle === '' || handle.length > MAX_HANDLE_LENGTH) return false;
  const handleHash = await sha256Hex(handle);
  await primary(db)
    .prepare('DELETE FROM classroom_oauth_credentials WHERE handle_hash = ?')
    .bind(handleHash)
    .run();
  return store.revoke(handle);
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export function createClassroomLogin(
  env,
  {
    authorize,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    returnToAllowlist,
    sessionCookieName,
    popupRedirectUri,
  } = {},
) {
  const config = readConfig(env);
  const allowlist = normalizeAllowlist(returnToAllowlist);
  const store = config ? classroomSessions(config.db, { now }) : null;
  const cookieName =
    typeof sessionCookieName === 'string' && /^__Host-[A-Za-z0-9_-]+$/.test(sessionCookieName)
      ? sessionCookieName
      : SESSION_COOKIE;
  const popupRedirect = normalizeOrigin(popupRedirectUri);
  let keyPromise = null;

  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  async function getAesKey() {
    if (!keyPromise) keyPromise = importAesKey(config.keyBytes);
    return keyPromise;
  }

  async function cleanupExpiredStates(nowSeconds) {
    await primary(config.db)
      .prepare(
        `DELETE FROM classroom_oauth_states
          WHERE expires_at <= ?
             OR (consumed_at IS NOT NULL AND consumed_at <= ?)`,
      )
      .bind(nowSeconds, nowSeconds)
      .run();
  }

  /* ------------------------- login ------------------------- */

  async function handleLogin(request) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed');
    if (!isCanonicalRequest(request, config.origin)) return errorResponse(403, 'host_rejected');
    if (!isSameOrigin(request, config.origin)) return errorResponse(403, 'origin_rejected');

    const form = await readForm(request);
    const returnTo = pickReturnTo(form, allowlist);
    const nowMs = now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const state = randomToken(STATE_BYTES);
    const nonce = randomToken(NONCE_BYTES);
    const verifier = randomToken(VERIFIER_BYTES);
    const stateHash = await sha256Hex(state);
    const nonceHash = await sha256Hex(nonce);
    const challenge = await sha256Base64url(verifier);
    const sealed = await encryptSecret(await getAesKey(), verifier, STATE_AAD_PREFIX + stateHash);

    await cleanupExpiredStates(nowSeconds);

    const result = await primary(config.db)
      .prepare(
        `INSERT INTO classroom_oauth_states
           (state_hash, nonce_hash, verifier_cipher, verifier_iv, verifier_tag,
            return_to, created_at, expires_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        stateHash,
        nonceHash,
        sealed.ciphertext,
        sealed.iv,
        sealed.tag,
        returnTo,
        nowSeconds,
        nowSeconds + OAUTH_STATE_TTL_SECONDS,
      )
      .run();
    if (!result || result.success === false) throw new LoginError(503, 'state_store_failed');

    const location =
      GOOGLE_AUTHORIZE_ENDPOINT +
      '?' +
      new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: SCOPE,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
      }).toString();

    return redirectResponse(location, [oauthCookie(state, nonce)]);
  }

  /* ------------------------ callback ----------------------- */

  async function consumeState(stateHash, nowSeconds) {
    const row = await primary(config.db)
      .prepare(
        `UPDATE classroom_oauth_states
            SET consumed_at = ?
          WHERE state_hash = ?
            AND consumed_at IS NULL
            AND expires_at > ?
          RETURNING ${STATE_COLUMNS}`,
      )
      .bind(nowSeconds, stateHash, nowSeconds)
      .first();
    return row || null;
  }

  async function handleCallback(request) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed');
    if (!isCanonicalRequest(request, config.origin)) return errorResponse(403, 'host_rejected');

    const url = new URL(request.url);
    // Google が同意拒否などを返した場合もローカルへ redirect で戻す（state は消費しない）
    if (url.searchParams.get('error')) {
      return redirectResponseError('oauth_error', [clearOauthCookie()]);
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauth = cookieValue(request, OAUTH_COOKIE);
    const clearCookie = clearOauthCookie();
    if (!code || !state || !oauth) {
      return redirectResponseError('invalid_callback', [clearCookie]);
    }

    const dot = oauth.indexOf('.');
    if (dot <= 0) return redirectResponseError('invalid_callback', [clearCookie]);
    const cookieState = oauth.slice(0, dot);
    const cookieNonce = oauth.slice(dot + 1);
    if (!cookieNonce || !timingSafeEqual(cookieState, state)) {
      return redirectResponseError('state_mismatch', [clearCookie]);
    }

    const nowMs = now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const stateHash = await sha256Hex(state);
    const row = await consumeState(stateHash, nowSeconds);
    if (!row) return redirectResponseError('state_rejected', [clearCookie]);

    // cookie の nonce が DB の nonce と一致すること（ブラウザ束縛）
    const nonceHash = await sha256Hex(cookieNonce);
    if (!timingSafeEqual(nonceHash, String(row.nonce_hash))) {
      return redirectResponseError('nonce_mismatch', [clearCookie]);
    }

    let verifier;
    try {
      verifier = await decryptSecret(
        await getAesKey(),
        { ciphertext: row.verifier_cipher, iv: row.verifier_iv, tag: row.verifier_tag },
        STATE_AAD_PREFIX + stateHash,
      );
    } catch {
      return redirectResponseError('state_unreadable', [clearCookie]);
    }

    const tokens = await exchangeAuthorizationCode(config, { code, verifier }, fetchImpl);
    const claims = await verifyIdToken(config, tokens.idToken, fetchImpl, nowMs);
    const payload = decodeJwtPayload(tokens.idToken);
    if (!payload || !timingSafeEqual(String(payload.nonce || ''), cookieNonce)) {
      return redirectResponseError('nonce_mismatch', [clearCookie]);
    }
    if (String(payload.sub || '') !== claims.sub) {
      return redirectResponseError('sub_mismatch', [clearCookie]);
    }

    // 親側の許可判定（既存 GAS probe が app2/pdfdrop のどちらかを許可）を必ず先に行う
    let permitted = false;
    if (typeof authorize === 'function') {
      try {
        permitted = (await authorize({ idToken: tokens.idToken, subject: claims.sub, email: claims.email })) === true;
      } catch {
        permitted = false;
      }
    }
    if (!permitted) return redirectResponseError('not_authorized', [clearCookie]);

    const session = await issueClassroomSession({
      db: config.db,
      store,
      key: await getAesKey(),
      subject: claims.sub,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      idTokenExpiresAt: Number(payload.exp),
      nowSeconds,
    });

    return redirectResponse(String(row.return_to || '/'), [
      sessionCookie(cookieName, session.handle),
      clearCookie,
    ]);
  }

  function redirectResponseError(code) {
    // エラー時も情報を漏らさず、ログイン画面へ戻す（no-store / oauth cookie 破棄）
    return callbackErrorResponse(code);
  }

  /* ------------------------- logout ------------------------ */

  async function handleLogout(request) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed');
    if (!isCanonicalRequest(request, config.origin)) return errorResponse(403, 'host_rejected');
    if (!isSameOrigin(request, config.origin)) return errorResponse(403, 'origin_rejected');

    const form = await readForm(request);
    const returnTo = pickReturnTo(form, allowlist);
    const handle = cookieValue(request, cookieName);
    if (handle && handle.length <= MAX_HANDLE_LENGTH) {
      // ログアウトでは OAuth 資格情報そのものを削除し、将来の refresh を不可能にする
      // （refresh token の暗号文・id_token を残さない）。セッションは tombstone で失効。
      await revokeClassroomSession({ db: config.db, store, handle });
    }
    return redirectResponse(returnTo, [clearSessionCookie(cookieName)]);
  }

  /* ------------------------ 認証 -------------------------- */

  async function readCredential(handleHash) {
    return primary(config.db)
      .prepare(
        `SELECT ${CREDENTIAL_COLUMNS}
           FROM classroom_oauth_credentials
          WHERE handle_hash = ? AND revoked_at IS NULL`,
      )
      .bind(handleHash)
      .first();
  }

  /**
   * refresh token で Google から新しい id_token を取得し、claim を検証して返す。
   * ここでは永続化しない（呼び出し側がセッション再確認後に persistRefreshed する）。
   */
  async function refreshTokens(row, sessionSubject, nowMs) {
    const key = await getAesKey();
    const aad = CREDENTIAL_AAD_PREFIX + sessionSubject;
    const refreshToken = await decryptSecret(
      key,
      { ciphertext: row.refresh_token_cipher, iv: row.refresh_token_iv, tag: row.refresh_token_tag },
      aad,
    );

    const response = await postTokenEndpoint(fetchImpl, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    if (!response || response.status !== 200) throw new LoginError(401, 'refresh_rejected');
    const body = await readJsonBody(response);
    if (!body || typeof body.id_token !== 'string' || body.id_token === '') {
      throw new LoginError(502, 'refresh_id_token_missing', true);
    }

    // refresh でも tokeninfo + 全 claim を再検証し、同一 subject だけ許可する
    const claims = await verifyIdToken(config, body.id_token, fetchImpl, nowMs);
    if (claims.sub !== sessionSubject) throw new LoginError(401, 'refresh_subject_mismatch');

    const payload = decodeJwtPayload(body.id_token);
    const expiresAt = Number(payload && payload.exp);
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(nowMs / 1000)) {
      throw new LoginError(401, 'refresh_token_expired');
    }

    return {
      idToken: body.id_token,
      expiresAt,
      rotatedRefreshToken:
        typeof body.refresh_token === 'string' && body.refresh_token !== '' ? body.refresh_token : null,
    };
  }

  async function persistRefreshed(row, subject, tokens, nowMs) {
    const key = await getAesKey();
    const aad = CREDENTIAL_AAD_PREFIX + subject;
    const sealedId = await encryptSecret(key, tokens.idToken, aad);
    const rotated = tokens.rotatedRefreshToken
      ? await encryptSecret(key, tokens.rotatedRefreshToken, aad)
      : null;
    const nowSeconds = Math.floor(nowMs / 1000);

    const result = await primary(config.db)
      .prepare(
        `UPDATE classroom_oauth_credentials
            SET id_token_cipher = ?, id_token_iv = ?, id_token_tag = ?, id_token_expires_at = ?,
                refresh_token_cipher = COALESCE(?, refresh_token_cipher),
                refresh_token_iv = COALESCE(?, refresh_token_iv),
                refresh_token_tag = COALESCE(?, refresh_token_tag),
                updated_at = ?
          WHERE handle_hash = ? AND revoked_at IS NULL`,
      )
      .bind(
        sealedId.ciphertext,
        sealedId.iv,
        sealedId.tag,
        tokens.expiresAt,
        rotated ? rotated.ciphertext : null,
        rotated ? rotated.iv : null,
        rotated ? rotated.tag : null,
        nowSeconds,
        row.handle_hash,
      )
      .run();
    if (!result || result.success === false) throw new LoginError(503, 'credential_update_failed', true);
    const changes = Number(result.meta && result.meta.changes);
    if (Number.isFinite(changes) && changes === 0) {
      // 資格情報が消えている（ログアウト等と競合）→ 新規権限を出さない
      throw new LoginError(503, 'credential_update_failed', true);
    }
  }

  /**
   * cookie からセッションを解決する。
   *  - cookie 無し → null（匿名表示は既存方針どおり許可）
   *  - DB 上の失効 / 期限切れ / 明確な invalid_grant / claim 不一致 → null
   *  - 一時障害・不確定（D1/Google の timeout/429/5xx、壊れた暗号文、資格情報不整合）
   *    → ClassroomAuthUnavailableError（gateway は 503 fail closed。匿名へ倒さない）
   */
  async function authenticate(request) {
    // 空値も重複として数える（同名 cookie の注入を曖昧にしない）。戻り値の既定は不変。
    const handles = cookieValues(request, cookieName, { includeEmpty: true });
    if (handles.length === 0) return null;
    if (handles.length > 1) {
      // 同名 cookie の重複はどれが正か決められない（注入の可能性）ため不確定扱い
      throw new ClassroomAuthUnavailableError();
    }
    if (!config || !store) throw new ClassroomAuthUnavailableError();

    const handle = handles[0];
    if (handle.length > MAX_HANDLE_LENGTH) return null;

    try {
      const session = await store.read(handle);
      if (!session) return null;

      const row = await readCredential(await sha256Hex(handle));
      if (!row || String(row.subject) !== session.subject) {
        // セッションは有効なのに資格情報が無い/食い違う = 不確定（破損・運用ミス）
        throw new ClassroomAuthUnavailableError();
      }

      const nowMs = now();
      const expiresAt = Number(row.id_token_expires_at);
      const aad = CREDENTIAL_AAD_PREFIX + session.subject;

      if (Number.isFinite(expiresAt) && expiresAt > Math.floor(nowMs / 1000) + ID_TOKEN_SKEW_SECONDS) {
        const idToken = await decryptSecret(
          await getAesKey(),
          { ciphertext: row.id_token_cipher, iv: row.id_token_iv, tag: row.id_token_tag },
          aad,
        );
        return { handle, subject: session.subject, idToken };
      }

      // 外部 Google refresh を行ったら、idToken を返す前に必ずセッションを再読込する。
      // backend 処理中に失効/期限切れになった場合は新しい権限を出さない。
      const refreshed = await refreshTokens(row, session.subject, nowMs);
      const afterRefresh = await store.read(handle);
      if (!afterRefresh || afterRefresh.subject !== session.subject) return null;

      await persistRefreshed(row, afterRefresh.subject, refreshed, nowMs);

      const afterPersist = await store.read(handle);
      if (!afterPersist || afterPersist.subject !== session.subject) return null;

      return { handle, subject: afterPersist.subject, idToken: refreshed.idToken };
    } catch (error) {
      if (error instanceof ClassroomAuthUnavailableError) throw error;
      // 明確な認証失敗だけ null。それ以外（不確定）は 503 fail closed。
      if (error instanceof LoginError && error.unavailable === false) return null;
      throw new ClassroomAuthUnavailableError();
    }
  }

  /**
   * GAS probe 後の再確認（延長しない）。handle を一貫して `read` し、subject と
   * OAuth 資格情報の存在を確認する。
   *  - 明確に失効/期限切れ/不一致 → false
   *  - DB 障害・資格情報欠落など不確定 → ClassroomAuthUnavailableError
   */
  async function isCurrent(session) {
    if (!config || !store) return false;
    if (!session || typeof session !== 'object') return false;
    const handle = session.handle;
    if (typeof handle !== 'string' || !handle || handle.length > MAX_HANDLE_LENGTH) return false;
    if (typeof session.subject !== 'string' || session.subject === '') return false;

    try {
      const current = await store.read(handle);
      if (!current || current.subject !== session.subject) return false;

      const row = await readCredential(await sha256Hex(handle));
      if (!row) throw new ClassroomAuthUnavailableError();
      if (String(row.subject) !== current.subject) return false;
      return true;
    } catch (error) {
      if (error instanceof ClassroomAuthUnavailableError) throw error;
      throw new ClassroomAuthUnavailableError();
    }
  }

  async function extendAfterSuccess(session, operation, result) {
    if (!store || !session || typeof session !== 'object') return null;
    return store.extendAfterSuccess(session.handle, session.subject, operation, result);
  }

  /* -------------------- GIS popup code model ---------------- */

  /**
   * Google Identity Services の popup code model から受け取った code だけを交換する。
   * - 入力は code のみ。redirect_uri は呼び出しページの origin（固定）を使う。
   * - state/nonce は使わない（popup は公式の exact Origin + X-Requested-With で CSRF 防御）。
   * - 既存 callback と同じ tokeninfo 全 claim 検証と GAS probe 許可を必須にする。
   * - refresh token が無ければ LoginError('refresh_token_missing') を投げ、
   *   呼び出し側が従来 GIS へ安全に戻せるようにする。
   * 返却は { handle, subject } のみ（id_token / refresh token は返さない）。
   */
  async function exchangePopupCode(code) {
    if (!config || !store) throw new ClassroomAuthUnavailableError();
    if (!popupRedirect) throw new LoginError(503, 'popup_not_configured', true);

    const value = typeof code === 'string' ? code : '';
    if (
      value === '' ||
      value.length > MAX_AUTHORIZATION_CODE_LENGTH ||
      /[\u0000-\u0020\u007f]/.test(value)
    ) {
      throw new LoginError(400, 'code_invalid');
    }

    const tokens = await exchangeAuthorizationCode(
      config,
      { code: value, redirectUri: popupRedirect },
      fetchImpl,
    );
    const nowMs = now();
    const claims = await verifyIdToken(config, tokens.idToken, fetchImpl, nowMs);
    const payload = decodeJwtPayload(tokens.idToken);
    if (!payload || String(payload.sub || '') !== claims.sub) {
      throw new LoginError(401, 'sub_mismatch');
    }
    const nowSeconds = Math.floor(nowMs / 1000);
    const idTokenExpiresAt = Number(payload.exp);
    if (!Number.isFinite(idTokenExpiresAt) || idTokenExpiresAt <= nowSeconds) {
      throw new LoginError(401, 'token_expired');
    }

    let permitted = false;
    if (typeof authorize === 'function') {
      try {
        permitted =
          (await authorize({ idToken: tokens.idToken, subject: claims.sub, email: claims.email })) === true;
      } catch {
        permitted = false;
      }
    }
    if (!permitted) throw new LoginError(403, 'not_authorized');

    const session = await issueClassroomSession({
      db: config.db,
      store,
      key: await getAesKey(),
      subject: claims.sub,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      idTokenExpiresAt,
      nowSeconds,
    });
    return { handle: session.handle, subject: session.subject };
  }

  /* ------------------------- handle ------------------------ */

  async function handle(request) {
    let pathname;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return null;
    }
    if (!pathname.startsWith('/_classroom/')) return null;

    try {
      if (pathname === ROUTES.login) return await handleLogin(request);
      if (pathname === ROUTES.callback) return await handleCallback(request);
      if (pathname === ROUTES.logout) return await handleLogout(request);
      return errorResponse(404, 'not_found');
    } catch (error) {
      // callback の検証失敗は redirect で返す（access_token 等は決して応答に載せない）
      if (pathname === ROUTES.callback && error instanceof LoginError) {
        return callbackErrorResponse(error.code);
      }
      if (error instanceof LoginError) return errorResponse(error.status, error.code);
      return errorResponse(503, 'login_unavailable');
    }
  }

  return { handle, authenticate, extendAfterSuccess, isCurrent, exchangePopupCode };
}

export default createClassroomLogin;
