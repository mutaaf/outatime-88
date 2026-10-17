// Global leaderboard API (ticket 0024), on D1. Handlers take their dependencies
// ({ db, now, ip }) so they're unit-testable against a real SQLite.
//
//   POST /outatime/api/run     → { token }                       start of every run
//   POST /outatime/api/scores  { token, initials, score, distance, durationMs, warps, level, mode }
//                              → { ok, rank: { all, daily }, best }
//   GET  /outatime/api/scores?board=all|daily&mode=ARCADE|INFINITE|DAILY&limit=10
//                              → { board, mode, day, entries: [{ rank, initials, score }] }

import { SCHEMA } from './schema.js';
import { cleanInitials } from './initials.js';
import { implausible } from './plausible.js';
import { signToken, verifyToken, randomId } from './token.js';

export const MODES = ['ARCADE', 'INFINITE', 'DAILY'];
export const RATE = { windowMs: 10 * 60e3, maxSubmits: 12 };
const MAX_LIMIT = 25;

export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

let schemaReady = null;
export async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
export function resetSchemaCache() { schemaReady = null; }

/** The HMAC key: generated once, stored in D1, never sent anywhere. */
async function signingSecret(db) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'hmac'").first();
  if (row) return row.value;
  const fresh = randomId(32);
  await db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('hmac', ?)").bind(fresh).run();
  return (await db.prepare("SELECT value FROM meta WHERE key = 'hmac'").first()).value;
}

/** Daily-rotating, salted hash: enough to rate-limit, useless for identifying anyone. */
async function ipHash(ip, day, secret) {
  const data = new TextEncoder().encode(`${ip}|${day}|${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function issueRun({ db, now }) {
  await ensureSchema(db);
  const secret = await signingSecret(db);
  const token = await signToken({ id: randomId(), t: now() }, secret);
  return json(200, { token });
}

// Best score per initials on a board, highest first.
function boardQuery(board) {
  const dayClause = board === 'daily' ? 'AND day = ?' : '';
  return `SELECT initials, MAX(score) AS score FROM scores WHERE mode = ? ${dayClause}
          GROUP BY initials ORDER BY score DESC, MIN(created_at) ASC LIMIT ?`;
}

async function rankOf(db, score, mode, day) {
  const binds = day ? [mode, day, score] : [mode, score];
  const dayClause = day ? 'AND day = ?' : '';
  const row = await db.prepare(
    `SELECT COUNT(*) AS above FROM (SELECT MAX(score) AS best FROM scores WHERE mode = ? ${dayClause}
     GROUP BY initials) WHERE best > ?`,
  ).bind(...binds).first();
  return (row?.above ?? 0) + 1;
}

export async function submitScore(body, { db, now, ip }) {
  await ensureSchema(db);
  if (!body || typeof body !== 'object') return json(400, { error: 'bad body' });
  const initials = cleanInitials(body.initials);
  if (!initials) return json(400, { error: 'initials must be three letters' });
  const mode = MODES.includes(body.mode) ? body.mode : null;
  if (!mode) return json(400, { error: 'bad mode' });
  const level = Number.isInteger(body.level) && body.level >= 0 && body.level < 50 ? body.level : null;
  if (level === null) return json(400, { error: 'bad level' });

  const secret = await signingSecret(db);
  const payload = await verifyToken(body.token, secret);
  if (!payload) return json(403, { error: 'invalid run token' });
  const t = now();
  const run = { score: body.score, distance: body.distance, durationMs: body.durationMs, warps: body.warps };
  const why = implausible(run, t - payload.t);
  if (why) return json(422, { error: `rejected: ${why}` });

  const day = utcDay(t);
  const iph = await ipHash(ip || 'unknown', day, secret);
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(iph, t - RATE.windowMs).first();
  if ((recent?.n ?? 0) >= RATE.maxSubmits) return json(429, { error: 'slow down' });

  const res = await db.prepare(
    `INSERT OR IGNORE INTO scores (run_id, initials, score, distance, duration_ms, warps, level, mode, day, created_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(payload.id, initials, run.score, run.distance, run.durationMs, run.warps, level, mode, day, t, iph).run();
  if (!res.meta || res.meta.changes === 0) return json(409, { error: 'run already submitted' });

  const [all, daily] = await Promise.all([rankOf(db, run.score, mode), rankOf(db, run.score, mode, day)]);
  return json(200, { ok: true, initials, score: run.score, mode, day, rank: { all, daily } });
}

export async function readBoard(params, { db, now }) {
  await ensureSchema(db);
  const board = params.get('board') === 'daily' ? 'daily' : 'all';
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'ARCADE';
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') || '10', 10) || 10));
  const day = utcDay(now());
  const binds = board === 'daily' ? [mode, day, limit] : [mode, limit];
  const { results } = await db.prepare(boardQuery(board)).bind(...binds).all();
  const entries = (results || []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score }));
  return json(200, { board, mode, day, entries });
}

export async function handleApi(request, deps) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!deps.db) return json(503, { error: 'leaderboard offline' });
  try {
    if (path === '/outatime/api/run' && request.method === 'POST') return await issueRun(deps);
    if (path === '/outatime/api/scores' && request.method === 'GET') return await readBoard(url.searchParams, deps);
    if (path === '/outatime/api/scores' && request.method === 'POST') {
      if ((request.headers.get('content-length') | 0) > 2048) return json(413, { error: 'too large' });
      let body;
      try { body = await request.json(); } catch { return json(400, { error: 'bad json' }); }
      return await submitScore(body, deps);
    }
    return json(404, { error: 'not found' });
  } catch (e) {
    return json(500, { error: 'leaderboard error' });
  }
}
