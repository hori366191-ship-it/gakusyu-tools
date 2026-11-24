/**
 * 教室タブレット用 同一オリジン Worker のエントリポイント。
 *
 * 既存 `site-worker/worker.js`（gakusyu-tools-proxy）は変更しない。
 * この Worker は別デプロイ・別オリジン（env.CLASSROOM_ORIGIN）専用で、
 *   - 静的 Pages を同一オリジンで配信し（HTML は限定 allowlist のみ）、
 *   - /_classroom/login|callback|logout を classroom-login.mjs に委譲し、
 *   - /_classroom/probe|print|generate|translate を classroom-gateway.mjs で中継する。
 *
 * 定期実行（UTC 日次）では classroomSessions(...).purgeExpired() だけを行う。
 * - 期限切れ/失効済みの classroom_sessions 行を物理削除する。
 * - classroom_oauth_credentials は handle_hash の ON DELETE CASCADE で同時に消える
 *   （refresh token / id_token の暗号文を残さない）。
 * - OAuth state の期限切れ掃除は classroom-login.mjs がログイン開始時に
 *   first-primary で行う（テーブル名をこの Worker に固定しない）。
 */

import { classroomSessions } from './classroom-sessions.mjs';
import { createClassroomLogin } from './classroom-login.mjs';
import { createClassroomGateway } from './classroom-gateway.mjs';

function noStoreText(text, status) {
  return new Response(text, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

function hasD1(env) {
  const db = env && env.CLASSROOM_DB;
  return Boolean(db && typeof db.prepare === 'function');
}

export default {
  async fetch(request, env) {
    try {
      if (!hasD1(env)) return noStoreText('Not Configured', 503);

      let gateway = null;
      // authorize は callback 時だけ使われる。gateway 構築後に参照される。
      const login = createClassroomLogin(env, {
        authorize: (input) => (gateway ? gateway.authorize(input) : false),
      });

      gateway = createClassroomGateway(env, {
        authenticate: login.authenticate,
        isCurrent: login.isCurrent,
        extendAfterSuccess: login.extendAfterSuccess,
        sessions: classroomSessions(env.CLASSROOM_DB),
        login,
      });

      return await gateway.fetch(request);
    } catch {
      // 設定不足・予期しない障害は fail closed（固定文言のみ）
      return noStoreText('Service Unavailable', 503);
    }
  },

  async scheduled(_controller, env) {
    if (!hasD1(env)) {
      console.error('[classroom] purge_expired skipped: db_missing');
      return;
    }
    try {
      const purged = await classroomSessions(env.CLASSROOM_DB).purgeExpired();
      console.log('[classroom] purge_expired ok count=' + (Number(purged) || 0));
    } catch {
      // 例外内容・個人情報・トークンは出さない（固定ラベルのみ）
      console.error('[classroom] purge_expired failed');
    }
  },
};
