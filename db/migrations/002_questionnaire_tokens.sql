/*
  For databases created before the questionnaire block existed.

  A fresh database already contains this table through db/schema.sql; the
  migration script skips it there thanks to CREATE TABLE IF NOT EXISTS. The
  UNIQUE pair keeps one stable link per person and questionnaire, even after
  delegations move the responsibility back and forth.
*/

CREATE TABLE IF NOT EXISTS questionnaire_token (
  token            TEXT PRIMARY KEY,
  questionnaire_id INTEGER NOT NULL REFERENCES questionnaire(id) ON DELETE CASCADE,
  person_id        INTEGER NOT NULL REFERENCES person(id)   ON DELETE CASCADE,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (questionnaire_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_token_q ON questionnaire_token(questionnaire_id);
