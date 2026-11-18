-- Free-text options for each motion. Applied to databases created before
-- the unique-link voting block; db/schema.sql already includes it for new ones.
CREATE TABLE IF NOT EXISTS motion_option (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  motion_id  INTEGER NOT NULL REFERENCES motion(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  UNIQUE (motion_id, position)
);
