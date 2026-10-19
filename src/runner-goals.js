// Endless run goals (ticket 0151), Subway-Surfers style: three objectives at a time, each "in
// one run". Finish all three and your Endless level rises — a permanent distance-points
// multiplier (src/runner.js runnerMult: +0.1× per level, max 2×) — and a fresh, slightly harder
// set is dealt. Pure; lives in the lazy runner UI chunk (src/runner-ui.js).

// `stat` is the run's tally key (main.js runStats).
export const GOALS = [
  { type: 'COINS', stat: 'coins', base: 20, step: 12, label: (n) => `GRAB ${n} COINS IN ONE RUN` },
  { type: 'DRIFT', stat: 'driftSecs', base: 3, step: 2, label: (n) => `DRIFT ${n} SECONDS IN ONE RUN` },
  { type: 'LOOPS', stat: 'loops', base: 1, step: 1, label: (n) => `CLEAR ${n} LOOP${n > 1 ? 'S' : ''} IN ONE RUN` },
  { type: 'CLEAN', stat: 'cleanBest', base: 900, step: 500, label: (n) => `${n.toLocaleString()} m WITHOUT A WALL` },
  { type: 'TIER', stat: 'tier', base: 2, step: 1, label: (n) => `REACH TIER ${n}` },
  { type: 'NEAR', stat: 'nearMisses', base: 3, step: 2, label: (n) => `${n} NEAR MISSES IN ONE RUN` },
  { type: 'NOS', stat: 'nosSecs', base: 3, step: 2, label: (n) => `BURN NOS FOR ${n} SECONDS` },
  // Power-up goals (0177): magnet, shield and 2X coins (src/powerups.js).
  { type: 'MAGNET', stat: 'magnetCoins', base: 12, step: 10, label: (n) => `GRAB ${n} COINS WITH THE 🧲 MAGNET` },
  { type: 'SHIELD', stat: 'shieldSaves', base: 1, step: 1, label: (n) => `BLOCK ${n} CRASH${n > 1 ? 'ES' : ''} WITH A 🛡️ SHIELD` },
  { type: 'POWER', stat: 'powerups', base: 2, step: 1, label: (n) => `GRAB ${n} POWER-UPS IN ONE RUN` },
  { type: 'DOUBLER', stat: 'doubledCash', base: 40, step: 30, label: (n) => `EARN ${n} ⚡ ON 2X COINS` },
];

/** The three goals for Endless level `lv` (deterministic; consecutive levels rotate kinds). */
export function goalsFor(lv) {
  const out = [];
  const n = GOALS.length;
  const start = ((lv | 0) * 3) % n;
  for (let i = 0; i < 3; i++) {
    const g = GOALS[(start + i) % n];
    const round = Math.floor(((lv | 0) * 3 + i) / n); // each full rotation asks a bit more
    const target = g.base + g.step * round;
    out.push({ type: g.type, target, done: false });
  }
  return out;
}

/** The save's goal state, repaired or created. */
export function ensureGoals(save) {
  const e = save.endless || (save.endless = { bestDistance: 0, bestTier: 0, runs: 0 });
  const ok = e.goals && Number.isInteger(e.goals.level) && Array.isArray(e.goals.active) && e.goals.active.length === 3
    && e.goals.active.every((g) => GOALS.some((d) => d.type === g.type) && Number.isFinite(g.target));
  if (!ok) e.goals = { level: Math.max(0, (e.goals && e.goals.level) | 0), active: goalsFor((e.goals && e.goals.level) | 0) };
  return e.goals;
}

export const goalDef = (type) => GOALS.find((g) => g.type === type);
export const goalLabel = (g) => goalDef(g.type).label(g.target);

/**
 * Check the run's stats against the active goals. Marks newly met ones done and returns them
 * (for a call-out). When all three are done the level rises and a new set is dealt; the
 * returned array then has `levelUp` set to the new level.
 */
export function checkGoals(goals, stats) {
  const fresh = [];
  for (const g of goals.active) {
    if (g.done) continue;
    const v = stats[goalDef(g.type).stat] || 0;
    if (v >= g.target) { g.done = true; fresh.push(g); }
  }
  if (goals.active.every((g) => g.done)) {
    goals.level++;
    goals.active = goalsFor(goals.level);
    fresh.levelUp = goals.level;
  }
  return fresh;
}

/** Progress text for a goal against this run's stats ("12/20"). */
export function goalProgress(g, stats) {
  if (g.done) return '✓';
  const v = Math.min(g.target, Math.floor(stats[goalDef(g.type).stat] || 0));
  return `${v.toLocaleString()}/${g.target.toLocaleString()}`;
}

