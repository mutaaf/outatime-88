// Fair play (ticket 0180): the rules that stop button-mashing from breaking the game, and the
// server checks that catch runs which broke them anyway. Pure and deterministic, shared by
// the race step (lazy chunk) and the leaderboard Worker, like src/scoring.js.
//
// In the sim (sim-clock milliseconds, never wall time):
//   jump   only from the ground (or within `coyoteMs` of leaving it), at most once every
//          `cooldownMs` after landing; a press up to `bufferMs` early fires on landing, so
//          honest timing always works and mashing gains nothing.
//   trick  only in the air, `gapMs` apart, at most `perAir` per airborne stretch. The UP
//          trick's hang time and heal happen once per air, so holding a key can't fly forever.
//   juke   `cooldownMs` apart; its invulnerability lasts `invulnS`, so jukes can't chain into
//          permanent invulnerability.
//   self-hops (your own jumps) don't fill the NOS tank; ramps and crests still do.
//
// On the server (payload v4): the run's counters must fit the same caps for its sim time.
// A run that doesn't is kept but hidden from everyone else's boards (`flag`), so a kid who
// found a glitch still sees their own score; forged numbers are rejected outright.

export const FAIR = {
  airY: 4,                                            // above this the wheels are off the road
  jump: { groundY: 3, cooldownMs: 250, bufferMs: 120, coyoteMs: 100 },
  trick: { airY: 10, gapMs: 350, perAir: 3 },
  juke: { cooldownMs: 900, invulnS: 0.35 },
  maxMph: 260,                                        // = PENALTY.maxMph: nothing in the game goes faster
  // Server bounds (generous: honest runs sit far inside them).
  check: {
    simSlackMs: 2000,       // sim time can't run ahead of the wall clock (it slows down instead)
    jumpCycleMs: 700,       // cooldown + the shortest possible hop
    airCycleMs: 150,        // the shortest air any launch can make
    autoFrac: 0.1,          // more than this much autopilot = an assisted run (not ranked)
  },
};

export const FP_KEYS = ['simMs', 'jumps', 'airs', 'tricks', 'airMs', 'topMph', 'jukes', 'autoMs'];

export function createFair() {
  return {
    t: 0, groundAt: 0, landAt: -1e9, queuedAt: -1e9, air: false, selfAir: false,
    airTricks: 0, trickAt: -1e9, hangUsed: false, healUsed: false, jukeAt: -1e9,
    simMs: 0, jumps: 0, airs: 0, tricks: 0, airMs: 0, topMph: 0, jukes: 0, autoMs: 0,
  };
}

/**
 * One sim step. `y` height above the road, `mph` speed, `auto` the autopilot drove this step.
 * Returns true on the step the car lands.
 */
export function fairStep(f, dtMs, y, mph, auto = false) {
  f.t += dtMs;
  f.simMs = Math.round(f.t);
  if (mph > f.topMph) f.topMph = Math.min(FAIR.maxMph, Math.ceil(mph)); // up, so distance ≤ top × time holds
  if (auto) f.autoMs += dtMs;
  const up = y > FAIR.airY;
  if (y <= FAIR.jump.groundY) f.groundAt = f.t;
  if (up) f.airMs += dtMs;
  if (up && !f.air) { f.air = true; f.airs++; }
  if (!up && f.air) {
    f.air = false; f.selfAir = false; f.airTricks = 0; f.hangUsed = false; f.healUsed = false;
    f.landAt = f.t;
    // A press just before touchdown fires the moment the landing cooldown ends.
    if (f.t - f.queuedAt <= FAIR.jump.bufferMs) f.queuedAt = f.t + FAIR.jump.cooldownMs;
    return true;
  }
  return false;
}

/** A jump press (key, tap, pad): remembered for `bufferMs` (from the end of a landing cooldown). */
export function pressJump(f) {
  const ready = f.landAt + FAIR.jump.cooldownMs;
  f.queuedAt = !f.air && f.t < ready ? ready : f.t;
}

/** Fire a queued jump if the rules allow it now; true = jump this step. */
export function takeJump(f, y) {
  const J = FAIR.jump;
  if (f.t - f.queuedAt > J.bufferMs) return false;
  const grounded = y <= J.groundY || (!f.selfAir && f.t - f.groundAt <= J.coyoteMs);
  if (!grounded || f.t - f.landAt < J.cooldownMs - 1e-6) return false; // (float steps)
  f.queuedAt = -1e9;
  f.selfAir = true;
  f.jumps++;
  return true;
}

/** May an air trick start now? Counts it if so. */
export function takeTrick(f, y) {
  const T = FAIR.trick;
  if (y <= T.airY || f.airTricks >= T.perAir || f.t - f.trickAt < T.gapMs) return false;
  f.trickAt = f.t;
  f.airTricks++;
  f.tricks++;
  return true;
}

/** The UP trick's extra hang (and its heal) only once per air. */
export function takeHang(f) {
  if (f.hangUsed) return false;
  f.hangUsed = true;
  return true;
}

export function takeJuke(f) {
  if (f.t - f.jukeAt < FAIR.juke.cooldownMs) return false;
  f.jukeAt = f.t;
  f.jukes++;
  return true;
}

/** Does airtime fill the NOS tank? Not on your own hops. */
export const airRefills = (f) => f.air && !f.selfAir;

/** The counters as sent with a run (integers only). */
export function fairPayload(f) {
  const out = {};
  for (const k of FP_KEYS) out[k] = Math.max(0, Math.round(f[k] || 0));
  return out;
}

/** Server: is `fp` well-formed? Null if so, else a reason (the run is rejected). */
export function fairMalformed(fp) {
  if (!fp || typeof fp !== 'object' || Array.isArray(fp)) return 'bad fair-play log';
  for (const k of FP_KEYS) if (!Number.isInteger(fp[k]) || fp[k] < 0 || fp[k] > 1e8) return 'bad fair-play log';
  return null;
}

/**
 * Server: do the counters fit the rules for this run? Null if so, else why the run is
 * flagged (kept, hidden from other players' boards). `run` = { durationMs, distance }.
 */
export function fairProblem(fp, run) {
  const C = FAIR.check;
  const sim = fp.simMs;
  if (sim > (run.durationMs || 0) + C.simSlackMs) return 'sim clock ahead of the run';
  if (fp.airMs > sim + 50) return 'more air than race';
  if (fp.topMph > FAIR.maxMph) return 'too fast';
  if ((run.distance || 0) > (fp.topMph * sim) / 1000 + 200) return 'distance beyond top speed';
  if (fp.jumps > fp.airs + 1 || fp.jumps > 2 + sim / C.jumpCycleMs) return 'jump spam';
  if (fp.airs > 2 + sim / C.airCycleMs) return 'too many launches';
  if (fp.tricks > FAIR.trick.perAir * fp.airs || fp.tricks > 1 + sim / FAIR.trick.gapMs) return 'trick spam';
  if (fp.jukes > 1 + sim / FAIR.juke.cooldownMs) return 'juke spam';
  if (fp.autoMs > C.autoFrac * sim + 1000) return 'assist';
  return null;
}
