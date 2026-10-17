// Dynamic quality governor (ticket 0041): watches frame intervals and steps quality down
// when the 95th-percentile frame runs over budget, then carefully back up. Pure and
// allocation-free per sample; both renderers read the stepped preset via effectivePreset().
//
// Hysteresis: a step down needs two slow evaluations in a row; a step up needs a quiet
// spell that doubles every time an upgrade turns out to be too much, so it never flaps.

// Each step keeps the previous ones and gives up a little more: resolution first, then
// post-processing, shadows, effects, draw distance, and finally everything optional.
const LADDER = [
  null,
  { dpr: 0.85, res: 0.9 },
  { dpr: 0.85, res: 0.9, post: false },
  { dpr: 0.7, res: 0.8, post: false, shadows: 0.5 },
  { dpr: 0.7, res: 0.8, post: false, shadows: 0, particles: 0.6 },
  { dpr: 0.6, res: 0.7, post: false, shadows: 0, particles: 0.5, ahead: 0.7 },
  { dpr: 0.5, res: 0.6, post: false, shadows: 0, particles: 0.4, ahead: 0.6, glow: false, env: false },
];
export const MAX_STEP = LADDER.length - 1;

const cache = new Map();
/** The preset after `step` rungs of the ladder (memoised; allocation only on a new pair). */
export function effectivePreset(preset, step) {
  const s = Math.max(0, Math.min(MAX_STEP, step | 0));
  let byStep = cache.get(preset);
  if (!byStep) { byStep = []; cache.set(preset, byStep); }
  if (byStep[s]) return byStep[s];
  const r = LADDER[s];
  const out = { ...preset, step: s };
  if (r) {
    out.dpr = Math.max(0.5, preset.dpr * r.dpr);
    out.res = Math.max(0.5, Math.min(preset.res, r.res));
    if (r.post === false) out.post = false;
    if (r.shadows !== undefined) out.shadows = r.shadows ? Math.round(preset.shadows * r.shadows) : 0;
    if (r.shadows === 0) out.softShadows = false;
    if (r.particles) out.particles = preset.particles * r.particles;
    if (r.ahead) out.ahead = Math.round(preset.ahead * r.ahead);
    if (r.glow === false) out.glow = false;
    if (r.env === false) out.env = false;
  }
  byStep[s] = Object.freeze(out);
  return byStep[s];
}

export const GOV = Object.freeze({ evalMs: 1000, minSamples: 20, upAfterMs: 4000, upMaxMs: 60000, demoteAfterMs: 5000, ignoreMs: 250 });

export function createGovernor({ startStep = 0 } = {}) {
  const win = new Float32Array(240);
  const scratch = new Float32Array(240);
  let n = 0, acc = 0;
  let slowEvals = 0, goodMs = 0, upAfter = GOV.upAfterMs, slowMs = 0, lastWasUp = false;
  const g = {
    step: startStep, p95: 0, refreshMs: 16.7, budgetMs: 22, fps: 60, elapsedMs: 0,
    /** True once quality is at the floor and still slow for a while: lower the tier. */
    shouldDemote: false,
    /** Feed one frame interval in ms. Returns true when the step changed. */
    sample(ms) {
      if (!(ms > 0) || ms > GOV.ignoreMs) return false; // tab switch, pause, GC hiccup
      if (n < win.length) win[n++] = ms;
      acc += ms;
      g.elapsedMs += ms;
      if (acc < GOV.evalMs || n < GOV.minSamples) return false;
      return evaluate();
    },
    /** Forget the current window (after a pause, a resize or a level change). */
    reset() { n = 0; acc = 0; slowEvals = 0; },
  };

  function evaluate() {
    for (let i = 0; i < n; i++) scratch[i] = win[i];
    const view = scratch.subarray(0, n);
    view.sort();
    const p10 = view[Math.floor(n * 0.1)];
    g.p95 = view[Math.min(n - 1, Math.floor(n * 0.95))];
    g.fps = 1000 / (acc / n);
    // The display's refresh: 60 Hz screens bottom out near 16.7 ms, 120 Hz near 8.3 ms. It
    // only ever learns downward, so a run of slow frames can't pass itself off as the refresh.
    g.refreshMs = Math.max(6, Math.min(g.refreshMs, p10));
    g.budgetMs = Math.max(22, g.refreshMs * 1.35);
    const windowMs = acc;
    n = 0; acc = 0;
    const before = g.step;
    if (g.p95 > g.budgetMs) {
      goodMs = 0;
      slowMs += windowMs;
      // Straight after an upgrade one slow window is enough to undo it, and the next try waits longer.
      if (lastWasUp || ++slowEvals >= 2) {
        if (lastWasUp) upAfter = Math.min(GOV.upMaxMs, upAfter * 2);
        if (g.step < MAX_STEP) g.step++;
        slowEvals = 0;
      }
    } else {
      slowEvals = 0;
      slowMs = 0;
      if (g.p95 <= g.refreshMs * 1.15 + 1) {
        goodMs += windowMs;
        if (g.step > 0 && goodMs >= upAfter) { g.step--; goodMs = 0; lastWasUp = true; return true; }
      }
    }
    lastWasUp = false;
    g.shouldDemote = g.step === MAX_STEP && slowMs >= GOV.demoteAfterMs;
    return g.step !== before;
  }
  return g;
}
