-- 0001_classroom_sessions.sql
-- 教室セッション（30日アイドル / 最大90日絶対期限）。
-- ハンドルは平文保存しない。handle_hash は SHA-256 の hex。
-- 時刻はすべて UNIX epoch 秒。

CREATE TABLE IF NOT EXISTS classroom_sessions (
  handle_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  idle_ttl_seconds INTEGER NOT NULL,
  idle_expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_subject
  ON classroom_sessions (subject);

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_expiry
  ON classroom_sessions (idle_expires_at, absolute_expires_at);
