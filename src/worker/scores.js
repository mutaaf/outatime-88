// Global leaderboard API (ticket 0024), on D1. Handlers take their dependencies
// ({ db, now, ip }) so they're unit-testable against a real SQLite.
//
//   POST /outatime/api/run     → { token }                       start of every run
//   POST /outatime/api/scores  { token, initials, score, distance, durationMs, warps, level, mode,
//                                v?, car?, cls?, breakdown?, trace? }   (payload.js, ghost-codec.js)
//                              → { ok, rank: { all, daily }, boards, streak, season, ghost }
//   GET  /outatime/api/scores?board=all|daily|week|friends&mode=ARCADE|INFINITE|DAILY&limit=10
//                              [&level=N] [&cls=A] [&around=ABC]
//                              → { board, mode, day, level, season, entries: [{ rank, initials, score }], me }
//   GET  /outatime/api/standing?initials=ABC&mode=…&level=N&since=ms   rank, rival, who passed you
//   GET  /outatime/api/hall?mode=…                                     weekly champions
//   GET  /outatime/api/ghost?mode=…&level=N[&initials=ABC]              a ghost to race
//   /outatime/api/me, /link, /recovery, /use, /forget → zero-login identity (identity.js)

import { SCHEMA, MIGRATIONS } from './schema.js';
import { handleIdentity, whoIs } from './identity.js';
import { cleanInitials } from './initials.js';
import { implausible } from './plausible.js';
import { signToken, verifyToken, randomId } from './token.js';
import { readPayload } from './payload.js';
import {
  afterSubmit, boardFilter, ghostProblem, hallOfFame, placement, previousBests, prune,
  readGhost, seasonOf, standing, storeGhost,
} from './compete.js';

export const MODES = ['ARCADE', 'INFINITE', 'DAILY'];
export const RATE = { windowMs: 10 * 60e3, maxSubmits: 12 };
const MAX_LIMIT = 25;
const MAX_BODY = 8192; // a ghost trace is ~3 kB
export const PRUNE_CHANCE = 0.04;

export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

let schemaReady = null;
export async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => migrate(db))
      .catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
export function resetSchemaCache() { schemaReady = null; }

async function migrate(db) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema_v'").first();
  let v = Number(row?.value || 0);
  for (const m of MIGRATIONS) {
    if (m.v <= v) continue;
    for (const sql of m.sql) {
      try { await db.prepare(sql).run(); } catch (e) {
        if (!/duplicate column/i.test(String(e?.message))) throw e;
      }
    }
    v = m.v;
    await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_v', ?)").bind(String(v)).run();
  }
}

/** The HMAC key: generated once, stored in D1, never sent anywhere. */
export async function signingSecret(db) {
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
function boardQuery(f) {
  return `SELECT initials, MAX(score) AS score FROM scores WHERE ${f.where}
          GROUP BY initials ORDER BY score DESC, MIN(created_at) ASC LIMIT ?`;
}

const intParam = (params, key) => {
  const raw = params.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 50 ? n : null;
};
const clsParam = (params) => (/^[A-Z]$/.test(params.get('cls') || '') ? params.get('cls') : '');

async function rankOf(db, score, mode, day) {
  const binds = day ? [mode, day, score] : [mode, score];
  const dayClause = day ? 'AND day = ?' : '';
  const row = await db.prepare(
    `SELECT COUNT(*) AS above FROM (SELECT MAX(score) AS best FROM scores WHERE mode = ? ${dayClause}
     GROUP BY initials) WHERE best > ?`,
  ).bind(...binds).first();
  return (row?.above ?? 0) + 1;
}

export async function submitScore(body, { db, now, ip, request, rand = Math.random }) {
  await ensureSchema(db);
  if (!body || typeof body !== 'object') return json(400, { error: 'bad body' });
  const initials = cleanInitials(body.initials);
  if (!initials) return json(400, { error: 'initials must be three letters' });
  const mode = MODES.includes(body.mode) ? body.mode : null;
  if (!mode) return json(400, { error: 'bad mode' });
  const level = Number.isInteger(body.level) && body.level >= 0 && body.level < 50 ? body.level : null;
  if (level === null) return json(400, { error: 'bad level' });
  const payloadInfo = readPayload(body);
  if (payloadInfo.error) return json(400, { error: payloadInfo.error });
  const { pv, car, cls } = payloadInfo;

  const secret = await signingSecret(db);
  const payload = await verifyToken(body.token, secret);
  if (!payload) return json(403, { error: 'invalid run token' });
  const t = now();
  const run = { score: body.score, distance: body.distance, durationMs: body.durationMs, warps: body.warps, earned: body.earned, pen: body.pen };
  const why = implausible(run, t - payload.t);
  if (why) return json(422, { error: `rejected: ${why}` });

  const day = utcDay(t);
  const iph = await ipHash(ip || 'unknown', day, secret);
  // The racer this device is (ticket 0090): cookie, or the mirrored header. '' = anonymous.
  const dev = request ? (await whoIs(request, secret)).pub || '' : '';
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(iph, t - RATE.windowMs).first();
  if ((recent?.n ?? 0) >= RATE.maxSubmits) return json(429, { error: 'slow down' });

  const prev = await previousBests(db, { mode, level, day, initials });
  const res = await db.prepare(
    `INSERT OR IGNORE INTO scores (run_id, initials, score, distance, duration_ms, warps, level, mode, day, created_at, ip_hash, dev, car, cls, pv)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(payload.id, initials, run.score, run.distance, run.durationMs, run.warps, level, mode, day, t, iph, dev, car, cls, pv).run();
  if (!res.meta || res.meta.changes === 0) return json(409, { error: 'run already submitted' });
  // The address hash only exists for the rate-limit window, then it's wiped (AGENTS.md privacy).
  await db.prepare("UPDATE scores SET ip_hash = '' WHERE ip_hash != '' AND created_at < ?").bind(t - RATE.windowMs).run();
  if (dev) {
    await db.prepare(
      `INSERT INTO profiles (pub, initials, created_at, seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(pub) DO UPDATE SET seen_at = excluded.seen_at, initials = CASE WHEN profiles.initials = '' THEN excluded.initials ELSE profiles.initials END`,
    ).bind(dev, initials, t, t).run();
  }

  // A bad ghost never costs the player their score; it just isn't stored.
  let ghost = null;
  if (typeof body.trace === 'string' && body.trace) {
    ghost = ghostProblem(body.trace, run) || 'kept';
    if (ghost === 'kept' && !(await storeGhost(db, { runId: payload.id, mode, level, initials, dev, score: run.score, trace: body.trace, t }))) ghost = 'not a best';
  }
  const [all, daily, extra] = await Promise.all([
    rankOf(db, run.score, mode), rankOf(db, run.score, mode, day),
    afterSubmit(db, { mode, level, day, initials, score: run.score, prev, dev }),
  ]);
  if (rand() < PRUNE_CHANCE) await prune(db, t).catch(() => {});
  return json(200, { ok: true, initials, score: run.score, mode, day, rank: { all, daily }, ...extra, ghost });
}

export const BOARDS = ['all', 'daily', 'week', 'friends'];

/** Friends board ids: you plus the friends in your profile (cookie / mirrored credential). */
async function friendIds(db, request) {
  if (!request) return [];
  const { pub } = await whoIs(request, await signingSecret(db));
  if (!pub) return [];
  const row = await db.prepare('SELECT friends FROM profiles WHERE pub = ?').bind(pub).first();
  let ids = [];
  try { ids = JSON.parse(row?.friends || '[]'); } catch { ids = []; }
  return [pub, ...ids];
}

export async function readBoard(params, { db, now, request }) {
  await ensureSchema(db);
  const board = BOARDS.includes(params.get('board')) ? params.get('board') : 'all';
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'ARCADE';
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') || '10', 10) || 10));
  const level = intParam(params, 'level');
  const cls = clsParam(params);
  const t = now();
  const day = utcDay(t);
  const devs = board === 'friends' ? await friendIds(db, request) : [];
  const f = boardFilter(board, { mode, level, cls, day, devs });
  const base = { board, mode, day, level, cls, season: seasonOf(t) };
  if (!f) return json(200, { ...base, entries: [], me: null });
  const { results } = await db.prepare(boardQuery(f)).bind(...f.binds, limit).all();
  const entries = (results || []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score }));
  // Your own row even when you're outside the top N, so the board always shows where you are.
  let me = null;
  const around = cleanInitials(params.get('around'));
  if (around) {
    me = entries.find((e) => e.initials === around) || null;
    if (!me) {
      const row = await db.prepare(`SELECT MAX(score) AS best FROM scores WHERE ${f.where} AND initials = ?`).bind(...f.binds, around).first();
      if (row?.best != null) me = { rank: (await placement(db, f, around, row.best)).rank, initials: around, score: row.best };
    }
  }
  return json(200, { ...base, entries, me });
}

async function readStanding(params, { db, now, request }) {
  await ensureSchema(db);
  const initials = cleanInitials(params.get('initials'));
  if (!initials) return json(400, { error: 'initials must be three letters' });
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'ARCADE';
  const since = Number(params.get('since')) || 0;
  const { pub } = await whoIs(request, await signingSecret(db));
  return json(200, await standing(db, { mode, level: intParam(params, 'level'), initials, since, dev: pub || '', now: now() }));
}

async function readHall(params, { db, now }) {
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'ARCADE';
  return json(200, { mode, season: seasonOf(now()), champions: await hallOfFame(db, mode, now()) });
}

async function readGhostApi(params, { db }) {
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'ARCADE';
  const level = intParam(params, 'level') ?? 0;
  const g = await readGhost(db, { mode, level, initials: cleanInitials(params.get('initials')) });
  return g ? json(200, { mode, level, initials: g.initials, score: g.score, trace: g.trace }) : json(404, { error: 'no ghost yet' });
}

export async function handleApi(request, deps) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!deps.db) return json(503, { error: 'leaderboard offline' });
  try {
    await ensureSchema(deps.db);
    const ident = await handleIdentity(request, path, { ...deps, secret: () => signingSecret(deps.db) });
    if (ident) return ident;
    if (path === '/outatime/api/run' && request.method === 'POST') return await issueRun(deps);
    if (request.method === 'GET') {
      const read = { '/outatime/api/scores': readBoard, '/outatime/api/standing': readStanding, '/outatime/api/hall': readHall, '/outatime/api/ghost': readGhostApi }[path];
      if (read) return await read(url.searchParams, { ...deps, request });
    }
    if (path === '/outatime/api/scores' && request.method === 'POST') {
      if ((request.headers.get('content-length') | 0) > MAX_BODY) return json(413, { error: 'too large' });
      const text = await request.text();
      if (text.length > MAX_BODY) return json(413, { error: 'too large' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: 'bad json' }); }
      return await submitScore(body, { ...deps, request });
    }
    return json(404, { error: 'not found' });
  } catch (e) {
    return json(500, { error: 'leaderboard error' });
  }
}
