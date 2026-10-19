// Endless Highway progression (ticket 0150): the default mode is an infinite run that levels up.
//
// Pure and deterministic: everything comes from run distance (GameState.distance, mph·s), so
// ghosts, the server's checks and two runs over the same road agree. main.js reads it once a
// step; other systems read the published contract:
//
//   GameState.tier        integer ≥ 1. Endless: the tier reached. Other modes: 1 + level index.
//   GameState.difficulty  0..1, smooth and never decreasing within a run. Endless: grows with
//                         tier (0 at the start, ≈0.43 at tier 5, ≈0.72 at tier 10, → 1).
//                         Arcade/daily: the level's base plus a little for race progress.
//                         Live: the level's base only (identical on every client).
//
// A tier is a stretch of road; each one is a little longer than the last.

export const ENDLESS = {
  firstTier: 4800,   // distance of tier 1 (≈50 s at 100 mph; docs/BALANCE.md)
  growth: 1000,      // each later tier is this much longer
  ramp: 7,           // tiers to reach ~63% difficulty
  maxWave: 13,       // the arcade wave scale the difficulty maps onto (speed, traffic, density)
  intensity: 0.3,    // extra curve amplitude at full difficulty
  healFrac: 0.08,    // a level-up patches this share of max HP (docs/BALANCE.md: HP has to matter)
  coinStep: 0.2,     // coin multiplier gained per tier
  coinMax: 3,
  cash: 0.35,        // Endless pays this share of the campaign's cash rate (docs/BALANCE.md)
};

/**
 * Endless FLUX cash (docs/BALANCE.md): every coin, warp and takedown pays `ENDLESS.cash` of its
 * campaign value. The remainder carries over in `acc` (whole thousandths, so it never drifts),
 * so small coins still add up exactly. Returns the whole coins to pay now.
 */
export function endlessCash(acc, n) {
  acc.milli = (acc.milli || 0) + Math.round(Math.max(0, n) * ENDLESS.cash * 1000);
  const whole = Math.floor(acc.milli / 1000);
  acc.milli -= whole * 1000;
  return whole;
}

/** Distance at which tier `n` (≥1) starts. */
export function tierStart(n) {
  const k = Math.max(0, (n | 0) - 1);
  return k * ENDLESS.firstTier + (ENDLESS.growth * k * (k - 1)) / 2;
}

/** The tier at run distance `d`. */
export function tierFor(d) {
  const dist = Math.max(0, d || 0);
  // Solve tierStart(n) = d for k = n - 1, then settle on the exact integer.
  const a = ENDLESS.growth / 2, b = ENDLESS.firstTier - a;
  let k = Math.floor((-b + Math.sqrt(b * b + 4 * a * dist)) / (2 * a));
  while (k > 0 && tierStart(k + 1) > dist) k--;
  while (tierStart(k + 2) <= dist) k++;
  return k + 1;
}

/** { tier, frac (0..1 through it), toNext (distance left) } at run distance `d`. */
export function tierProgress(d) {
  const tier = tierFor(d);
  const s = tierStart(tier), e = tierStart(tier + 1);
  const dist = Math.max(0, d || 0);
  return { tier, frac: (dist - s) / (e - s), toNext: e - dist };
}

/** Endless difficulty 0..1 at run distance `d` (continuous through tiers). */
export function endlessDifficulty(d) {
  const { tier, frac } = tierProgress(d);
  return 1 - Math.exp(-(tier - 1 + frac) / ENDLESS.ramp);
}

/**
 * The contract values for any mode.
 * @param {{mode:string, distance:number, levelIndex:number, levels:number, raceLength?:number}} p
 * @param {{tier?:number, difficulty?:number}} [out] reused to avoid garbage in the sim loop
 * @returns {{tier:number, difficulty:number}}
 */
export function difficultyOf(p, out = {}) {
  if (p.mode === 'INFINITE') {
    out.tier = tierFor(p.distance);
    out.difficulty = endlessDifficulty(p.distance);
    return out;
  }
  const levels = Math.max(2, p.levels | 0);
  const base = 0.15 + 0.6 * Math.max(0, Math.min(1, (p.levelIndex | 0) / (levels - 1)));
  const prog = p.mode === 'LIVE' || !p.raceLength ? 0 : Math.max(0, Math.min(1, (p.distance || 0) / p.raceLength));
  out.tier = 1 + (p.levelIndex | 0);
  out.difficulty = Math.min(1, base + 0.2 * prog);
  return out;
}

/** What a difficulty means for the road (endless only; arcade keeps its own wave clock). */
export function endlessTuning(difficulty, tier, out = {}) {
  const d = Math.max(0, Math.min(1, difficulty));
  out.wave = 1 + Math.round(d * (ENDLESS.maxWave - 1));
  out.intensity = 1 + ENDLESS.intensity * d;
  out.coinMult = Math.min(ENDLESS.coinMax, 1 + ENDLESS.coinStep * Math.max(0, tier - 1));
  return out;
}

/** Best-run bookkeeping on the save. Returns { best, bestTier, isBest }. */
export function recordEndless(save, distance, tier) {
  const e = save.endless || (save.endless = { bestDistance: 0, bestTier: 0, runs: 0 });
  const d = Math.max(0, Math.round(distance || 0));
  const isBest = d > (e.bestDistance || 0);
  if (isBest) e.bestDistance = d;
  if (tier > (e.bestTier || 0)) e.bestTier = tier;
  e.runs = (e.runs || 0) + 1;
  return { best: e.bestDistance, bestTier: e.bestTier, isBest };
}
