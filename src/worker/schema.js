// D1 schema (ticket 0024). Applied idempotently by the Worker itself on the first API call of
// each isolate (CREATE ... IF NOT EXISTS), so a fresh, auto-provisioned database works with
// no migration step. Changing a column means a new statement here that is also idempotent.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    distance INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    warps INTEGER NOT NULL,
    level INTEGER NOT NULL,
    mode TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ip_hash TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS scores_all ON scores (mode, score DESC)',
  'CREATE INDEX IF NOT EXISTS scores_day ON scores (day, mode, score DESC)',
  'CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created_at)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
];
