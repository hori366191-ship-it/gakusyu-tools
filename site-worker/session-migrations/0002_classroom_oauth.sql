-- 0002_classroom_oauth.sql
-- 教室ログインの OAuth/OIDC 状態（Google OAuth Web-server authorization code flow）
--   openid email / offline / PKCE(S256)
--
-- 方針:
--   * 平文の refresh token / id_token / PKCE code_verifier は保存しない。
--     AES-GCM の暗号文 + IV + tag のみ（鍵は env CLASSROOM_ENCRYPTION_KEY）。
--   * 暗号化の AAD には subject を使う（handle_hash 紐付けの行では subject を AAD に固定）。
--   * 時刻はすべて UNIX epoch 秒。
--   * state / nonce / PKCE は 10分で期限切れ、state は一度だけ消費（consumed_at）。
--
-- 手動の管理失効（D1 運用）:
--   * subject 単位: `classroomSessions(db).revokeForSubject(subject)`
--   * セッション行単位: `DELETE FROM classroom_sessions WHERE handle_hash = ?`
--     → classroom_oauth_credentials は ON DELETE CASCADE で同時に消える
--   * OAuth 資格情報だけ無効化: `DELETE FROM classroom_oauth_credentials WHERE handle_hash = ?`
--   * ログアウト（アプリ経由）も classroom_oauth_credentials の行を削除する。

CREATE TABLE IF NOT EXISTS classroom_oauth_credentials (
  handle_hash TEXT PRIMARY KEY
    REFERENCES classroom_sessions (handle_hash) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  id_token_cipher TEXT NOT NULL,
  id_token_iv TEXT NOT NULL,
  id_token_tag TEXT NOT NULL,
  id_token_expires_at INTEGER NOT NULL,
  refresh_token_cipher TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  refresh_token_tag TEXT NOT NULL,
  scope TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_classroom_oauth_credentials_subject
  ON classroom_oauth_credentials (subject);

CREATE INDEX IF NOT EXISTS idx_classroom_oauth_credentials_expiry
  ON classroom_oauth_credentials (id_token_expires_at);

CREATE TABLE IF NOT EXISTS classroom_oauth_states (
  state_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  verifier_tag TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_classroom_oauth_states_expiry
  ON classroom_oauth_states (expires_at);
