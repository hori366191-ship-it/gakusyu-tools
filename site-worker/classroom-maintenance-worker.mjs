/**
 * 教室セッション D1 の日次 purge 専用 Worker（Cloudflare Pages は cron 非対応のため分離）。
 *
 * 不変条件:
 *  - Web 入口を持たない。routes を定義せず、workers_dev / preview_urls も無効にする
 *    （`wrangler.classroom-maintenance.toml.example` を参照）。
 *  - 万一 fetch が呼ばれても常に 404 の固定文言を返す（ページ配信・認証・中継をしない）。
 *  - D1 binding は `CLASSROOM_DB` のみ。secret は要求しない。
 *  - 実体は `classroom-sessions.mjs` の purgeExpired()（Web 側と同一 DB・同一ロジック）。
 *
 * 日次 purge の内容（classroom-worker.mjs の scheduled と同じ）:
 *  - 期限切れ（idle / absolute）・失効済みの classroom_sessions を物理削除する。
 *  - classroom_oauth_credentials は handle_hash の ON DELETE CASCADE で同時に消える。
 *  - OAuth state の期限切れ掃除は classroom-login.mjs がログイン開始時に行う。
 */

import { classroomSessions } from './classroom-sessions.mjs';

function hasD1(env) {
  const db = env && env.CLASSROOM_DB;
  return Boolean(db && typeof db.prepare === 'function');
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export default {
  /** 入口なしの保険。Web からは何も提供しない。 */
  async fetch() {
    return notFound();
  },

  async scheduled(_controller, env) {
    if (!hasD1(env)) {
      console.error('[classroom-maintenance] purge_expired skipped: db_missing');
      return;
    }
    try {
      const purged = await classroomSessions(env.CLASSROOM_DB).purgeExpired();
      console.log('[classroom-maintenance] purge_expired ok count=' + (Number(purged) || 0));
    } catch {
      // 例外内容・個人情報・トークンは出さない（固定ラベルのみ）
      console.error('[classroom-maintenance] purge_expired failed');
    }
  },
};
