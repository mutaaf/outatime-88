// Endless runner loop (ticket 0151): the one-more-run layer on top of the Endless Highway
// (src/endless.js). Pure and deterministic; main.js owns the DOM and the sim hooks.
//
//   Time Storm   an original pursuer: a crackling storm front behind you. It closes in when you
//                crash, grind a wall or slow down, and falls back when you drive clean. Caught
//                = run over (alongside HP 0). Shown as a rear glow + a distance meter, never gory.
//   Run goals    src/runner-goals.js (lazy, with the UI): three objectives at a time; all three
//                done raises your Endless level, a permanent points multiplier (runnerMult).
//   Continue     one per run, paid only in earned FLUX cash (no money, no ads), costlier the
//                further you got.

export const STORM = {
  startGap: 650,     // distance units behind you at the start (mph·s)
  maxGap: 900,       // clean driving pushes it back to here, no further
  baseMph: 50,       // the storm's speed at difficulty 0…
  mphPerDiff: 38,    // …plus this much at full difficulty
  crash: 240,        // a hit lets it jump this much closer
  wallPerSec: 150,   // grinding a wall feeds it this much per second
  warnAt: 330,       // inside this the meter shows and the glow builds
  respite: 450,      // a continue pushes it back to at least this
};

export function createStorm() {
  return { gap: STORM.startGap, warn: 0 };
}

/**
 * One step of the storm. `mph` your speed, `difficulty` 0..1, `dt` seconds, `scraping` a wall
 * this step, `crashed` a hit this step. Returns 'caught' | null; `st.warn` is 0..1 (how close).
 */
export function stepStorm(st, mph, difficulty, dt, scraping, crashed) {
  const stormMph = STORM.baseMph + STORM.mphPerDiff * Math.max(0, Math.min(1, difficulty));
  st.gap += (Math.max(0, mph) - stormMph) * dt;
  if (scraping) st.gap -= STORM.wallPerSec * dt;
  if (crashed) st.gap -= STORM.crash;
  if (st.gap > STORM.maxGap) st.gap = STORM.maxGap;
  st.warn = st.gap >= STORM.warnAt ? 0 : Math.max(0, Math.min(1, 1 - st.gap / STORM.warnAt));
  return st.gap <= 0 ? 'caught' : null;
}

/** After a continue: the storm falls back so you get a fair restart. */
export function stormRespite(st) {
  st.gap = Math.max(st.gap, STORM.respite);
  st.warn = 0;
}

export const MULT_STEP = 0.1;
export const MULT_MAX = 2;

/** The permanent distance-points multiplier at Endless level `lv` (goals: src/runner-goals.js). */
export const runnerMult = (lv) => Math.min(MULT_MAX, 1 + MULT_STEP * Math.max(0, lv | 0));

// ---------------------------------------------------------------------------------------
// Continue (one per run, in-game cash only).

export const CONTINUE = { base: 150, perTier: 60, hpFrac: 0.6, invuln: 3, offerSecs: 6 };

/** FLUX cash a continue costs after reaching `tier`. */
export const continueCost = (tier) => CONTINUE.base + CONTINUE.perTier * Math.max(0, (tier | 0) - 1);

/** Whether a continue can be offered: once per run, and only if you can pay for it. */
export function canContinue(usedThisRun, coins, tier) {
  return !usedThisRun && coins >= continueCost(tier);
}
