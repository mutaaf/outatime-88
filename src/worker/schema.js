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

// Versioned migrations, applied in order after SCHEMA by ensureSchema(); the applied version
// lives in meta.schema_v. Every statement must be safe for a racing isolate to re-run: an
// ADD COLUMN that fails with "duplicate column" counts as already applied.
export const MIGRATIONS = [
  {
    // Zero-login identity (ticket 0090). A player is a random public id; nothing personal is
    // stored. scores.dev is that public id ('' for runs posted before identity existed).
    v: 1,
    sql: [
      "ALTER TABLE scores ADD COLUMN dev TEXT NOT NULL DEFAULT ''",
      'CREATE INDEX IF NOT EXISTS scores_dev ON scores (dev, mode, level)',
      `CREATE TABLE IF NOT EXISTS profiles (
        pub TEXT PRIMARY KEY, initials TEXT NOT NULL DEFAULT '', car TEXT NOT NULL DEFAULT '',
        friends TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL
      )`,
      // Single-use, 10-minute codes that move a racer onto another device. Only a salted hash
      // of the code is stored.
      `CREATE TABLE IF NOT EXISTS link_codes (
        code_hash TEXT PRIMARY KEY, pub TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
      )`,
      // One long-lived recovery code per racer ("Save my racer"), also stored hashed.
      'CREATE TABLE IF NOT EXISTS recovery (pub TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
      // Attempt counters for code redemption. Keys are salted, hourly-rotating hashes and rows
      // are deleted after an hour: transient rate-limit state, never identity.
      'CREATE TABLE IF NOT EXISTS throttle (key TEXT NOT NULL, at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS throttle_key ON throttle (key, at)',
    ],
  },
  {
    // Competition (ticket 0091): per-track boards, car classes and a payload version so
    // scoring rules (e.g. 0073 penalties) can be told apart per run.
    v: 2,
    sql: [
      "ALTER TABLE scores ADD COLUMN car TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE scores ADD COLUMN cls TEXT NOT NULL DEFAULT ''",
      'ALTER TABLE scores ADD COLUMN pv INTEGER NOT NULL DEFAULT 1',
      'CREATE INDEX IF NOT EXISTS scores_level ON scores (mode, level, score DESC)',
      'CREATE INDEX IF NOT EXISTS scores_initials ON scores (initials, mode)',
      // Weekly season champions, filled lazily once a week has closed.
      `CREATE TABLE IF NOT EXISTS champions (
        week TEXT NOT NULL, mode TEXT NOT NULL, initials TEXT NOT NULL, score INTEGER NOT NULL,
        PRIMARY KEY (week, mode)
      )`,
      // One ghost (compact position trace, src/ghost-codec.js) per initials per track.
      `CREATE TABLE IF NOT EXISTS ghosts (
        run_id TEXT PRIMARY KEY, mode TEXT NOT NULL, level INTEGER NOT NULL,
        initials TEXT NOT NULL, dev TEXT NOT NULL, score INTEGER NOT NULL,
        trace TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS ghosts_board ON ghosts (mode, level, score DESC)',
    ],
  },
  {
    // Sponsor boards (ticket 0140, docs/ADS.md): impressions per campaign per UTC day. Nothing
    // else: no racer, device, address or time of day.
    v: 3,
    sql: [
      `CREATE TABLE IF NOT EXISTS ad_impressions (
        day TEXT NOT NULL, campaign TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, campaign)
      )`,
    ],
  },
  {
    // Fair play (ticket 0180): why a run is unranked ('' = ranked). Flagged runs stay in the
    // table and on their own device's boards, hidden from everyone else's.
    v: 4,
    sql: ["ALTER TABLE scores ADD COLUMN flag TEXT NOT NULL DEFAULT ''"],
  },
];
