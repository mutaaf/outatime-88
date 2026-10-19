// Competition layer over the scores table (tickets 0050–0052): weekly seasons, per-track and
// friends boards, rank movement and the next target after every run, rivals and "who passed
// you", daily streaks, a weekly hall of fame, and ghost traces. Pure functions over D1 so
// they're unit-testable. Identity on every board is the 3-letter initials; `dev` is the
// racer's public id (ticket 0050) and powers the friends board and streaks.

import { decodeGhost, GHOST } from '../ghost-codec.js';
import { LIMITS } from './plausible.js';

export const HALL_WEEKS = 8;
const DAY_MS = 86400e3;

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Monday (UTC) of the week containing `day` ('YYYY-MM-DD'). Seasons run Monday → Sunday. */
export function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return utcDay(d.getTime() - back * DAY_MS);
}

export function seasonOf(ms) {
  const week = weekStart(utcDay(ms));
  const start = Date.parse(`${week}T00:00:00Z`);
  return { week, start, endsAt: start + 7 * DAY_MS };
}

/**
 * WHERE clause for a board. board: all | daily | week | friends (devs = racer ids); level
 * narrows any board to one track, cls to one car class. Unranked (flagged) runs only show to
 * the device that made them (`viewer`, its public id). Null if it can't be built.
 */
export function boardFilter(board, { mode, level = null, cls = '', day, devs = [], viewer = '' }) {
  const where = ['mode = ?'];
  const binds = [mode];
  if (viewer) { where.push("(flag = '' OR dev = ?)"); binds.push(viewer); } else where.push("flag = ''");
  if (board === 'daily') { where.push('day = ?'); binds.push(day); }
  if (board === 'week') { where.push('day >= ?'); binds.push(weekStart(day)); }
  if (board === 'friends') {
    if (!devs.length) return null;
    where.push(`dev IN (${devs.map(() => '?').join(',')})`);
    binds.push(...devs);
  }
  if (Number.isInteger(level)) { where.push('level = ?'); binds.push(level); }
  if (cls) { where.push('cls = ?'); binds.push(cls); }
  return { where: where.join(' AND '), binds };
}

// Best score per initials on a filter, excluding one set of initials (the asking player), so
// ranks can be computed for any hypothetical score of theirs.
const othersBest = (f) => `SELECT initials, MAX(score) AS best FROM scores WHERE ${f.where} AND initials != ? GROUP BY initials`;

const rows = (r) => r?.results || [];

/** One round trip for a list of [sql, binds] reads. */
async function reads(db, list) {
  const res = await db.batch(list.map(([sql, binds]) => db.prepare(sql).bind(...binds)));
  return res.map(rows);
}

/**
 * Where `score` would place `initials` on a board: rank, the player just ahead (your target)
 * and just behind. `prev` (their previous best, or null) also yields the previous rank.
 */
export async function placement(db, f, initials, score, prev = null) {
  const sub = othersBest(f);
  const b = [...f.binds, initials];
  const [[cnt], [ahead], [behind]] = await reads(db, [
    [`SELECT COALESCE(SUM(best > ?), 0) AS now, COALESCE(SUM(best > ?), 0) AS prev FROM (${sub})`, [score, prev ?? -1, ...b]],
    [`SELECT initials, best FROM (${sub}) WHERE best > ? ORDER BY best ASC LIMIT 1`, [...b, score]],
    [`SELECT initials, best FROM (${sub}) WHERE best <= ? ORDER BY best DESC LIMIT 1`, [...b, score]],
  ]);
  const rank = (cnt?.now ?? 0) + 1;
  return {
    rank,
    prevRank: prev === null ? null : (cnt?.prev ?? 0) + 1,
    best: score,
    ahead: ahead ? { initials: ahead.initials, score: ahead.best, rank: rank - 1, gap: ahead.best - score } : null,
    behind: behind ? { initials: behind.initials, score: behind.best, rank: rank + 1, gap: score - behind.best } : null,
  };
}

/** The boards a run on (mode, level) counts for. Daily-challenge runs have no track board. */
export function boardsFor(mode, level) {
  const list = [['all', null], ['week', null], ['daily', null]];
  if (mode !== 'DAILY') list.push(['track', level]);
  return list;
}

const filterForKey = (key, lvl, ctx) => boardFilter(key === 'track' ? 'all' : key, { ...ctx, level: lvl });

/** Previous bests of `initials` on every board a run counts for, read before the insert. */
export async function previousBests(db, { mode, level, day, initials }) {
  const [[r]] = await reads(db, [[
    `SELECT MAX(score) AS all_best, MAX(CASE WHEN day >= ? THEN score END) AS week_best,
            MAX(CASE WHEN day = ? THEN score END) AS daily_best, MAX(CASE WHEN level = ? THEN score END) AS track_best
     FROM scores WHERE mode = ? AND initials = ?`,
    [weekStart(day), day, level, mode, initials],
  ]]);
  return { all: r?.all_best ?? null, week: r?.week_best ?? null, daily: r?.daily_best ?? null, track: r?.track_best ?? null };
}

/** Consecutive UTC days with a daily-challenge run from this device, ending today or yesterday. */
export async function streakFor(db, dev, day) {
  if (!dev) return { days: 0, today: false };
  const [list] = await reads(db, [[
    "SELECT DISTINCT day FROM scores WHERE dev = ? AND mode = 'DAILY' AND day >= ? ORDER BY day DESC",
    [dev, utcDay(Date.parse(`${day}T00:00:00Z`) - 60 * DAY_MS)],
  ]]);
  const days = new Set(list.map((r) => r.day));
  const today = days.has(day);
  let t = Date.parse(`${day}T00:00:00Z`) - (today ? 0 : DAY_MS);
  let n = 0;
  while (days.has(utcDay(t))) { n++; t -= DAY_MS; }
  return { days: n, today };
}

/** Everything the results screen needs after an accepted run. */
export async function afterSubmit(db, { mode, level, day, initials, score, prev, dev }) {
  const ctx = { mode, day };
  const boards = {};
  await Promise.all(boardsFor(mode, level).map(async ([key, lvl]) => {
    const p = prev[key];
    const best = Math.max(score, p ?? 0);
    const place = await placement(db, filterForKey(key, lvl, ctx), initials, best, p);
    boards[key] = { ...place, prevBest: p, pb: p === null || score > p };
  }));
  const streak = mode === 'DAILY' ? await streakFor(db, dev, day) : null;
  return { boards, streak, season: seasonOf(Date.parse(`${day}T12:00:00Z`)) };
}

/** Your standing on every board plus anyone who passed you since `since` (pull, no push). */
export async function standing(db, { mode, level, initials, since, dev, now }) {
  const day = utcDay(now);
  const ctx = { mode, day };
  const prev = await previousBests(db, { mode, level: Number.isInteger(level) ? level : -1, day, initials });
  const boards = {};
  await Promise.all(boardsFor(mode, Number.isInteger(level) ? level : null).map(async ([key, lvl]) => {
    if (key === 'track' && lvl === null) return;
    const best = prev[key];
    boards[key] = best === null ? null : await placement(db, filterForKey(key, lvl, ctx), initials, best);
  }));
  let overtaken = [];
  if (prev.all !== null && Number.isFinite(since) && since > 0) {
    [overtaken] = await reads(db, [[
      `SELECT initials, MAX(score) AS score FROM scores
       WHERE mode = ? AND initials != ? AND score > ? AND created_at > ? AND flag = ''
         AND initials NOT IN (SELECT initials FROM scores WHERE mode = ? AND score > ? AND created_at <= ? AND flag = '')
       GROUP BY initials ORDER BY score DESC LIMIT 3`,
      [mode, initials, prev.all, since, mode, prev.all, since],
    ]]);
  }
  const champion = (await hallOfFame(db, mode, now, 1))[0] || null;
  return {
    initials, mode, day,
    boards,
    overtaken: overtaken.map((r) => ({ initials: r.initials, score: r.score })),
    streak: await streakFor(db, dev, day),
    season: seasonOf(now),
    champion,
  };
}

/** Fill the champions table for weeks that have closed since we last looked. */
async function fillChampions(db, mode, now) {
  const current = seasonOf(now).week;
  const key = `champ_through_${mode}`;
  const mark = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  const from = mark?.value || '0000-00-00';
  if (from >= current) return;
  const [weeks] = await reads(db, [[
    `SELECT DISTINCT date(day, '-6 days', 'weekday 1') AS w FROM scores WHERE mode = ? AND day >= ? AND day < ?`,
    [mode, from, current],
  ]]);
  for (const { w } of weeks) {
    const end = utcDay(Date.parse(`${w}T00:00:00Z`) + 7 * DAY_MS);
    await db.prepare(
      `INSERT OR IGNORE INTO champions (week, mode, initials, score)
       SELECT ?, mode, initials, score FROM scores WHERE mode = ? AND day >= ? AND day < ? AND flag = ''
       ORDER BY score DESC, created_at ASC LIMIT 1`,
    ).bind(w, mode, w, end).run();
  }
  await db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(key, current).run();
}

/** Past weekly champions, newest first. */
export async function hallOfFame(db, mode, now, limit = HALL_WEEKS) {
  await fillChampions(db, mode, now);
  const [list] = await reads(db, [[
    'SELECT week, initials, score FROM champions WHERE mode = ? ORDER BY week DESC LIMIT ?', [mode, limit],
  ]]);
  return list.map((r) => ({ week: r.week, initials: r.initials, score: r.score }));
}

/** Null if the trace is a believable record of this run, otherwise a short reason. */
export function ghostProblem(trace, run) {
  const g = decodeGhost(trace);
  if (!g) return 'malformed';
  const n = g.d.length;
  const secs = n / g.hz;
  if (secs < 3) return 'too short';
  if (secs * 1000 > run.durationMs + 2500) return 'longer than the run';
  const maxStep = (LIMITS.maxMetersPerSec / g.hz) * 1.25 + 2;
  for (let i = 0; i < n; i++) if (g.d[i] - (i ? g.d[i - 1] : 0) > maxStep) return 'too fast';
  const end = g.d[n - 1];
  if (Math.abs(end - run.distance) > run.distance * 0.04 + 40) return 'distance mismatch';
  return null;
}

/** Keep the trace if it beats this initials' stored ghost on the track; one ghost per initials per track. */
export async function storeGhost(db, { runId, mode, level, initials, dev, score, trace, t }) {
  const have = await db.prepare('SELECT MAX(score) AS best FROM ghosts WHERE mode = ? AND level = ? AND initials = ?')
    .bind(mode, level, initials).first();
  if (have?.best != null && have.best >= score) return false;
  await db.batch([
    db.prepare('DELETE FROM ghosts WHERE mode = ? AND level = ? AND initials = ?').bind(mode, level, initials),
    db.prepare('INSERT OR IGNORE INTO ghosts (run_id, mode, level, initials, dev, score, trace, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(runId, mode, level, initials, dev, score, trace, t),
  ]);
  return true;
}

/** The ghost to race: a named player's best on the track, else the track record. */
export async function readGhost(db, { mode, level, initials }) {
  const byName = initials
    ? await db.prepare('SELECT initials, score, trace FROM ghosts WHERE mode = ? AND level = ? AND initials = ?').bind(mode, level, initials).first()
    : null;
  return byName || db.prepare('SELECT initials, score, trace FROM ghosts WHERE mode = ? AND level = ? ORDER BY score DESC, created_at ASC LIMIT 1')
    .bind(mode, level).first();
}

export const PRUNE = { dominatedAfterMs: DAY_MS, bestOnlyAfterMs: 60 * DAY_MS, maxGhosts: 4000 };

/**
 * Keep D1 small (free tier): after a day, a lower run on the same day/track by the same
 * initials adds nothing to any board; after 60 days only each initials' best per track
 * remains. Champions are recorded first so closed seasons keep their winner.
 */
export async function prune(db, now) {
  for (const mode of ['ARCADE', 'INFINITE', 'DAILY']) await fillChampions(db, mode, now);
  await db.batch([
    db.prepare(
      `DELETE FROM scores WHERE created_at < ? AND EXISTS (SELECT 1 FROM scores b WHERE b.initials = scores.initials
         AND b.mode = scores.mode AND b.level = scores.level AND b.day = scores.day AND (b.flag = '' OR scores.flag != '')
         AND (b.score > scores.score OR (b.score = scores.score AND b.id < scores.id)))`,
    ).bind(now - PRUNE.dominatedAfterMs),
    db.prepare(
      `DELETE FROM scores WHERE created_at < ? AND EXISTS (SELECT 1 FROM scores b WHERE b.initials = scores.initials
         AND b.mode = scores.mode AND b.level = scores.level AND (b.flag = '' OR scores.flag != '')
         AND (b.score > scores.score OR (b.score = scores.score AND b.id < scores.id)))`,
    ).bind(now - PRUNE.bestOnlyAfterMs),
    db.prepare(
      `DELETE FROM ghosts WHERE run_id IN (SELECT run_id FROM ghosts ORDER BY score DESC, created_at DESC LIMIT -1 OFFSET ?)`,
    ).bind(PRUNE.maxGhosts),
  ]);
}

export { GHOST };
