/**
 * 教室ログアウトの合言葉（スタッフ共有パスフレーズ）検証。
 *
 * - 保存形式: `pbkdf2-sha256$<iterations>$<saltBase64url>$<hashBase64url>`
 * - PBKDF2-SHA256。iterations は保存値（上限 1,000,000）。
 * - salt / hash は base64url 厳格デコード。比較は定数時間。
 * - 合言葉・導出値はログ・応答・例外へ出さない。
 * - 失敗スロットルは isolate 内メモリの best-effort（`cf-connecting-ip` 単位）。
 *   10分で5回失敗したら次の試行を 429 にする。成功で解除。
 */

export const MAX_PASSPHRASE_LENGTH = 256;

const MAX_ITERATIONS = 1_000_000;
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const THROTTLE_MAX_FAILURES = 5;
const THROTTLE_KEY_MAX_LENGTH = 128;

const failureLog = new Map();

function toBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
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

/** base64url の厳格デコード（英数字・-・_ のみ、padding 不可、canonical のみ）。 */
function decodeBase64urlStrict(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  if (value.length % 4 === 1) return null;
  const bytes = fromBase64url(value);
  if (!bytes) return null;
  return toBase64url(bytes) === value ? bytes : null;
}

/**
 * 保存文字列を検証して { iterations, salt, hash } を返す。不正・未設定は null。
 */
export function parseLogoutPassphraseHash(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return null;
  if (!/^[0-9]+$/.test(parts[1])) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return null;

  const salt = decodeBase64urlStrict(parts[2]);
  const hash = decodeBase64urlStrict(parts[3]);
  if (!salt || salt.length === 0 || !hash || hash.length === 0) return null;
  return { iterations, salt, hash };
}

export function isLogoutPassphraseConfigured(value) {
  return parseLogoutPassphraseHash(value) !== null;
}

/** 定数時間でバイト列を比較する（長さ差も早期 return しない）。 */
export function constantTimeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * 合言葉を PBKDF2-SHA256 で導出し、定数時間で比較する。
 * parsed は parseLogoutPassphraseHash の戻り値。例外・導出失敗は false（fail closed）。
 */
export async function verifyLogoutPassphrase(passphrase, parsed) {
  if (
    typeof passphrase !== 'string' ||
    passphrase.length === 0 ||
    passphrase.length > MAX_PASSPHRASE_LENGTH
  ) {
    return false;
  }
  if (
    !parsed ||
    !(parsed.salt instanceof Uint8Array) ||
    !(parsed.hash instanceof Uint8Array) ||
    parsed.hash.length === 0
  ) {
    return false;
  }

  try {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: parsed.salt,
          iterations: parsed.iterations,
        },
        material,
        parsed.hash.length * 8,
      ),
    );
    return constantTimeEqualBytes(derived, parsed.hash);
  } catch {
    return false;
  }
}

function throttleKey(ip) {
  const key = String(ip || 'unknown');
  return key.slice(0, THROTTLE_KEY_MAX_LENGTH);
}

function pruneFailures(list, nowMs) {
  return list.filter((at) => nowMs - at < THROTTLE_WINDOW_MS);
}

/** 現在ブロック中なら true（best-effort / isolate 単位）。 */
export function logoutThrottleBlocked(ip, nowMs = Date.now()) {
  const key = throttleKey(ip);
  const list = failureLog.get(key);
  if (!list || list.length === 0) return false;
  const fresh = pruneFailures(list, nowMs);
  if (fresh.length === 0) {
    failureLog.delete(key);
    return false;
  }
  failureLog.set(key, fresh);
  return fresh.length >= THROTTLE_MAX_FAILURES;
}

export function recordLogoutFailure(ip, nowMs = Date.now()) {
  const key = throttleKey(ip);
  const fresh = pruneFailures(failureLog.get(key) || [], nowMs);
  fresh.push(nowMs);
  failureLog.set(key, fresh);
}

export function clearLogoutFailures(ip) {
  failureLog.delete(throttleKey(ip));
}

/** テスト用。isolate のスロットル状態を全消去する。 */
export function resetLogoutThrottleForTests() {
  failureLog.clear();
}

/**
 * 失敗時の短い遅延。Workers では scheduler.wait を使い、無い環境だけ
 * 同期の有界計算（500ms 上限）へフォールバックする。
 */
export async function delayAfterLogoutFailure(delayMs = 500) {
  const ms = Number(delayMs);
  if (!Number.isFinite(ms) || ms <= 0) return;

  const schedulerRef = typeof scheduler !== 'undefined' ? scheduler : null;
  if (schedulerRef && typeof schedulerRef.wait === 'function') {
    try {
      await schedulerRef.wait(ms);
      return;
    } catch {
      /* fall through to bounded sync delay */
    }
  }

  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* bounded synchronous fallback */
  }
}
