// Penalty scoring (ticket 0073): sloppy driving costs points. Pure and shared by the game
// and the leaderboard Worker, so the server recomputes the exact penalty from the run log.
//
//   final score = max(0, earned − penalty)
//   earned  = everything the run scored (distance, style, takedowns, placement…)
//   penalty = Σ obstacle hits (scaled by impact speed) + Σ traffic hits + Σ cones knocked
//             (ticket 0074) + wall-scrape time
//
// The run log is tiny: the impact speed of each hit and the total milliseconds spent
// grinding a wall. Penalties are big enough to matter next to a ~1M-point race.

export const PENALTY = {
  obstacle: { base: 5000, perMph: 150, label: 'HIT' },
  traffic: { base: 6000, perMph: 180, label: 'CRASH' },
  cone: { base: 800, perMph: 12, label: 'CONE' },
  wallPerSec: 4000,
  wallMinMph: 30,       // brushing the wall while crawling doesn't count
  maxHits: 300,         // log cap (a run can't plausibly hit more)
  maxMph: 260,
};

/** Points one hit costs. Impact speed is clamped and rounded so client and server agree. */
export function hitPenalty(kind, mph) {
  const p = PENALTY[kind] && PENALTY[kind].base ? PENALTY[kind] : PENALTY.obstacle;
  const v = Math.max(0, Math.min(PENALTY.maxMph, Math.round(mph || 0)));
  return p.base + p.perMph * v;
}

export const wallPenalty = (ms) => Math.floor((Math.max(0, ms) * PENALTY.wallPerSec) / 1000);

/** A fresh run log. */
export function createPenaltyLog() {
  return { obstacle: [], traffic: [], cone: [], wallMs: 0 };
}

/** Total penalty for a log (the number the server recomputes). */
export function penaltyPoints(log) {
  if (!log) return 0;
  let total = 0;
  for (const v of log.obstacle || []) total += hitPenalty('obstacle', v);
  for (const v of log.traffic || []) total += hitPenalty('traffic', v);
  for (const v of log.cone || []) total += hitPenalty('cone', v);
  return total + wallPenalty(log.wallMs || 0);
}

/**
 * Records a hit; returns the points it costs (0 once the log is full).
 * @param kind 'obstacle' | 'traffic'
 */
export function logHit(log, kind, mph) {
  if (!log.cone) log.cone = [];
  const list = kind === 'traffic' ? log.traffic : kind === 'cone' ? log.cone : log.obstacle;
  if (log.obstacle.length + log.traffic.length + log.cone.length >= PENALTY.maxHits) return 0;
  const v = Math.max(0, Math.min(PENALTY.maxMph, Math.round(mph || 0)));
  list.push(v);
  return hitPenalty(kind, v);
}

/** Adds wall-scrape time; returns the extra points it costs (integer, never double-counts). */
export function logWall(log, ms, mph) {
  if (mph < PENALTY.wallMinMph || ms <= 0) return 0;
  const before = wallPenalty(log.wallMs);
  // Whole milliseconds only (what the server sees); the fraction carries to the next step.
  log.wallAcc = (log.wallAcc || 0) + ms;
  const whole = Math.floor(log.wallAcc);
  log.wallAcc -= whole;
  log.wallMs = Math.min(3600e3, log.wallMs + whole);
  return wallPenalty(log.wallMs) - before;
}

/** The log as sent to the server (integers only). */
export const logPayload = (log) => ({ obstacle: log.obstacle.slice(), traffic: log.traffic.slice(), cone: (log.cone || []).slice(), wallMs: log.wallMs });

/** Results-screen breakdown. */
export function breakdown(earned, log) {
  const penalty = penaltyPoints(log);
  return {
    earned: Math.max(0, Math.round(earned)),
    penalty,
    final: Math.max(0, Math.round(earned) - penalty),
    obstacleHits: (log && log.obstacle.length) || 0,
    trafficHits: (log && log.traffic.length) || 0,
    coneHits: (log && log.cone && log.cone.length) || 0,
    wallSec: Math.round(((log && log.wallMs) || 0) / 100) / 10,
  };
}

/**
 * Server check: the submitted score must equal max(0, earned − recomputed penalty).
 * Returns null when consistent, else a short reason. A run without a log is accepted as
 * before (older clients), with earned = score.
 */
export function penaltyMismatch(run) {
  if (run.pen === undefined && run.earned === undefined) return null;
  const pen = run.pen;
  if (!pen || typeof pen !== 'object') return 'bad penalty log';
  const cones = pen.cone === undefined ? [] : pen.cone; // older clients have no cone list
  const lists = [pen.obstacle, pen.traffic, cones];
  if (!lists.every((l) => Array.isArray(l) && l.every((v) => Number.isInteger(v) && v >= 0 && v <= PENALTY.maxMph))) return 'bad penalty log';
  if (pen.obstacle.length + pen.traffic.length + cones.length > PENALTY.maxHits) return 'bad penalty log';
  if (!Number.isInteger(pen.wallMs) || pen.wallMs < 0 || pen.wallMs > 3600e3) return 'bad penalty log';
  if (!Number.isInteger(run.earned) || run.earned < 0) return 'bad earned';
  if (pen.wallMs > (run.durationMs || 0) + 1000) return 'bad penalty log';
  const expected = Math.max(0, run.earned - penaltyPoints(pen));
  return run.score === expected ? null : 'score does not match penalties';
}
