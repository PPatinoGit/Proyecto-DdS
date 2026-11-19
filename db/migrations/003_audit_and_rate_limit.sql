/*
  Hardening tables for databases created before this block.

  A fresh database already contains them through db/schema.sql; CREATE TABLE
  IF NOT EXISTS keeps this migration harmless there.

  audit_log keeps a redacted trail of successful mutations (and failed logins).
  rate_limit implements a fixed window counter shared by all Vercel functions,
  because an in-memory map would be different in every serverless instance.
*/

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       TEXT NOT NULL,
  identifier   TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier)
);
