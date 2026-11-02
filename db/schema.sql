PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS person (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  birthdate   TEXT,
  gender      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS election (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  opens_at    TEXT,
  closes_at   TEXT
);

CREATE TABLE IF NOT EXISTS voter_roll (
  election_id INTEGER NOT NULL REFERENCES election(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES person(id)   ON DELETE CASCADE,
  weight      REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (election_id, person_id)
);

CREATE TABLE IF NOT EXISTS motion (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES election(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ballot_token (
  token       TEXT PRIMARY KEY,
  election_id INTEGER NOT NULL REFERENCES election(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES person(id)   ON DELETE CASCADE,
  used_at     TEXT,
  UNIQUE (election_id, person_id)
);

CREATE TABLE IF NOT EXISTS vote (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  motion_id      INTEGER NOT NULL REFERENCES motion(id) ON DELETE CASCADE,
  person_id      INTEGER NOT NULL REFERENCES person(id),
  choice         TEXT NOT NULL,
  weight_at_cast REAL NOT NULL,
  cast_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (motion_id, person_id)
);

CREATE TABLE IF NOT EXISTS questionnaire (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  owner_id    INTEGER NOT NULL REFERENCES person(id),
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS question (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  questionnaire_id INTEGER NOT NULL REFERENCES questionnaire(id) ON DELETE CASCADE,
  category_id      INTEGER REFERENCES category(id),
  body             TEXT NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0
);

-- UNIQUE garantiza que solo una persona sea responsable de cada pregunta.
CREATE TABLE IF NOT EXISTS assignment (
  question_id  INTEGER PRIMARY KEY REFERENCES question(id) ON DELETE CASCADE,
  assignee_id  INTEGER NOT NULL REFERENCES person(id),
  assigned_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answer (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES person(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delegation_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  from_id     INTEGER NOT NULL REFERENCES person(id),
  to_id       INTEGER NOT NULL REFERENCES person(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vote_motion ON vote(motion_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_owner ON questionnaire(owner_id);
CREATE INDEX IF NOT EXISTS idx_question_questionnaire ON question(questionnaire_id);
