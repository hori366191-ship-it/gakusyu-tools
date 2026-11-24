/**
 * 教室セッションの永続基盤（Cloudflare D1）
 *
 * 目的:
 *  - 30日のアイドル期限、初回作成から最大90日の絶対期限。
 *  - 確認された対象操作（印刷 / 生成）が成功したときだけアイドル期限を延長する。
 *  - プローブ・読み取り・失敗・replay/recovered・対象外操作では延長しない。
 *  - セッションハンドルは暗号乱数。DBには SHA-256 ハッシュのみ保存する。
 *  - Google の検証済み subject に固定し、失効/期限切れ後の復活を認めない。
 *  - 読み取りは D1 first-primary（read-your-writes）で行い、古いレプリカで
 *    失効済みセッションを認証しない。
 *  - DB障害は fail closed（例外）。呼び出し側は拒否に倒すこと。
 *
 * 時刻はすべて UNIX epoch 秒（整数）。
 *
 * extendAfterSuccess の operation / result 契約:
 *  - operation は 'classroom-print' または 'generate-text' のみ。
 *  - result は「信頼された業務結果」だけを渡すこと（クライアント入力や
 *    検証前の値ではない）。`{ ok: true }` であり、かつ
 *    `replayed === true` / `recovered === true` でない場合のみ延長する。
 *  - 画面表示・probe・read はこの関数を呼ばない（延長しない）。
 */

export const IDLE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日
export const ABSOLUTE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90日
export const ALLOWED_EXTEND_OPERATIONS = Object.freeze(['classroom-print', 'generate-text']);

const HANDLE_BYTES = 32;
const MAX_HANDLE_LENGTH = 512;
const STORE_ERROR_CODE = 'CLASSROOM_SESSION_STORE_FAILED';

const ALLOWED_OPERATIONS = new Set(ALLOWED_EXTEND_OPERATIONS);

const COLUMNS = 'subject, created_at, idle_expires_at, absolute_expires_at';

/** D1 first-primary セッション（無ければそのまま使う）。 */
function primary(database) {
  if (database && typeof database.withSession === 'function') {
    return database.withSession('first-primary');
  }
  return database;
}

function storeFailure(operation, error) {
  const wrapped = new Error(
    `classroom session store failed during ${operation}: ` + String((error && error.message) || error),
  );
  wrapped.code = STORE_ERROR_CODE;
  wrapped.cause = error;
  return wrapped;
}

function toSeconds(value) {
  const n = Number(value);
  return Math.max(0, Math.floor(n));
}

function rowToSession(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    subject: String(row.subject),
    createdAt: toSeconds(row.created_at),
    idleExpiresAt: toSeconds(row.idle_expires_at),
    absoluteExpiresAt: toSeconds(row.absolute_expires_at),
  };
}

function isHandleCandidate(handle) {
  return typeof handle === 'string' && handle.length > 0 && handle.length <= MAX_HANDLE_LENGTH;
}

function isNonEmptySubject(subject) {
  return typeof subject === 'string' && subject.trim().length > 0 && subject.length <= 512;
}

/** 信頼された業務結果が「成功」かつ replay/recovered でないこと。 */
function isTrustedSuccessfulResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.ok !== true) return false;
  if (result.replayed === true || result.recovered === true) return false;
  return true;
}

function randomHandle() {
  const bytes = new Uint8Array(HANDLE_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

async function hashHandle(handle) {
  const data = new TextEncoder().encode(handle);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function clampTtl(value, fallback, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function classroomSessions(database, { now = Date.now } = {}) {
  if (!database || typeof database.prepare !== 'function') {
    throw new TypeError('classroomSessions requires a D1-like database');
  }

  const nowSeconds = () => Math.floor(now() / 1000);

  return {
    /**
     * 検証済み Google subject に対して新しいセッションを作る。
     * option: { idleTtlSeconds?, absoluteTtlSeconds? }（上限 30日 / 90日）
     * 返却: { subject, createdAt, idleExpiresAt, absoluteExpiresAt, handle }
     *       handle は平文では保存されない。呼び出し側もDBへ保存しないこと。
     */
    async createForVerifiedSubject(subject, option = {}) {
      if (!isNonEmptySubject(subject)) throw new TypeError('subject must be a non-empty string');
      const createdAt = nowSeconds();
      const idleTtl = clampTtl(option.idleTtlSeconds, IDLE_TTL_SECONDS, IDLE_TTL_SECONDS);
      const absoluteTtl = clampTtl(option.absoluteTtlSeconds, ABSOLUTE_TTL_SECONDS, ABSOLUTE_TTL_SECONDS);
      const absoluteExpiresAt = createdAt + absoluteTtl;
      const idleExpiresAt = Math.min(createdAt + idleTtl, absoluteExpiresAt);

      const handle = randomHandle();
      const handleHash = await hashHandle(handle);

      try {
        const result = await primary(database)
          .prepare(
            `INSERT INTO classroom_sessions
               (handle_hash, subject, created_at, idle_ttl_seconds, idle_expires_at, absolute_expires_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          )
          .bind(handleHash, subject, createdAt, idleTtl, idleExpiresAt, absoluteExpiresAt)
          .run();
        if (!result || result.success === false) {
          throw new Error('insert did not succeed');
        }
      } catch (error) {
        throw storeFailure('createForVerifiedSubject', error);
      }

      return { subject, createdAt, idleExpiresAt, absoluteExpiresAt, handle };
    },

    /**
     * ハンドルから有効なセッションを読む。プローブ/表示専用で延長はしない。
     * 不在・失効・期限切れ・期限切れ相当は null。DB障害は例外（fail closed）。
     */
    async read(handle) {
      if (!isHandleCandidate(handle)) return null;
      const handleHash = await hashHandle(handle);
      const nowS = nowSeconds();
      try {
        const row = await primary(database)
          .prepare(
            `SELECT ${COLUMNS}
               FROM classroom_sessions
              WHERE handle_hash = ?
                AND revoked_at IS NULL
                AND idle_expires_at > ?
                AND absolute_expires_at > ?`,
          )
          .bind(handleHash, nowS, nowS)
          .first();
        return rowToSession(row);
      } catch (error) {
        throw storeFailure('read', error);
      }
    },

    /**
     * 対象操作が成功したときだけアイドル期限を延長する。
     * 原子SQLで idle = MIN(absolute, MAX(idle, now + idle_ttl))。
     * 失効・期限切れ・subject不一致・対象外操作・失敗/replay/recovered は延長せず null。
     * 返却: { subject, createdAt, idleExpiresAt, absoluteExpiresAt } | null
     */
    async extendAfterSuccess(handle, subject, operation, result) {
      if (!isHandleCandidate(handle) || !isNonEmptySubject(subject)) return null;
      if (!ALLOWED_OPERATIONS.has(operation)) return null;
      if (!isTrustedSuccessfulResult(result)) return null;

      const handleHash = await hashHandle(handle);
      const nowS = nowSeconds();
      try {
        const row = await primary(database)
          .prepare(
            `UPDATE classroom_sessions
                SET idle_expires_at = MIN(absolute_expires_at, MAX(idle_expires_at, ? + idle_ttl_seconds))
              WHERE handle_hash = ?
                AND subject = ?
                AND revoked_at IS NULL
                AND idle_expires_at > ?
                AND absolute_expires_at > ?
              RETURNING ${COLUMNS}`,
          )
          .bind(nowS, handleHash, subject, nowS, nowS)
          .first();
        return rowToSession(row);
      } catch (error) {
        throw storeFailure('extendAfterSuccess', error);
      }
    },

    /** ログアウト: そのハンドルだけ失効させる。返り値は失効したか。 */
    async revoke(handle) {
      if (!isHandleCandidate(handle)) return false;
      const handleHash = await hashHandle(handle);
      try {
        const result = await primary(database)
          .prepare(
            `UPDATE classroom_sessions
                SET revoked_at = ?
              WHERE handle_hash = ? AND revoked_at IS NULL`,
          )
          .bind(nowSeconds(), handleHash)
          .run();
        if (!result || result.success === false) {
          throw new Error('revoke did not succeed');
        }
        const changes = Number(result.meta && result.meta.changes);
        return Number.isFinite(changes) ? changes > 0 : true;
      } catch (error) {
        throw storeFailure('revoke', error);
      }
    },

    /** subject 単位の管理失効。返り値は失効させた件数。 */
    async revokeForSubject(subject) {
      if (!isNonEmptySubject(subject)) return 0;
      try {
        const result = await primary(database)
          .prepare(
            `UPDATE classroom_sessions
                SET revoked_at = ?
              WHERE subject = ? AND revoked_at IS NULL`,
          )
          .bind(nowSeconds(), subject)
          .run();
        if (!result || result.success === false) {
          throw new Error('revokeForSubject did not succeed');
        }
        const changes = Number(result.meta && result.meta.changes);
        return Number.isFinite(changes) ? changes : 0;
      } catch (error) {
        throw storeFailure('revokeForSubject', error);
      }
    },

    /** 期限切れ（idle/absolute）と失効済みの行を削除する。返り値は削除件数。 */
    async purgeExpired() {
      const nowS = nowSeconds();
      try {
        const result = await primary(database)
          .prepare(
            `DELETE FROM classroom_sessions
              WHERE idle_expires_at <= ?
                 OR absolute_expires_at <= ?
                 OR revoked_at IS NOT NULL`,
          )
          .bind(nowS, nowS)
          .run();
        if (!result || result.success === false) {
          throw new Error('purgeExpired did not succeed');
        }
        const changes = Number(result.meta && result.meta.changes);
        return Number.isFinite(changes) ? changes : 0;
      } catch (error) {
        throw storeFailure('purgeExpired', error);
      }
    },
  };
}

export default classroomSessions;
