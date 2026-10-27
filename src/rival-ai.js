// Rival racing AI (ticket 0160). Each rival is a driver: a profile (skill, aggression,
// consistency, NOS craft) from its roster car, ramped by a progression tier, driving the same
// road the player does. Pure and deterministic per seed: no Math.random, no wall clock, no
// allocation per step (one brain per rival, one reused context per frame).
//
// What a rival does each step (stepRival):
//   - Speed: cruise at its race pace (with a capped, fair rubber band), brake ahead of corners
//     to the speed its grip and nerve allow (a novice lifts for a hairpin, an ace carries it),
//     take booster gates, make sure it meets a loop's entry speed, draft a car ahead, and burn
//     NOS on straights, out of corners, to attack or to defend.
//   - Line: follow the race's clean line (src/cleanline.js — hazards are never placed on it),
//     cut toward the apex in bends, swing round traffic and obstacles, pass slower cars on the
//     side with room, and (the aggressive ones) make one defensive move when you close in.
//   - Mistakes: now and then a lift or running wide, rarer as the tier climbs.
//
// Units: speeds in mph; Z in sim units (speedToWorld converts mph·s → Z), and every look-ahead
// is in seconds of road at the car's speed, so it reads the same on every pace setting; lateral
// offsets in half-road widths (±0.72 is the wall), + is right. A right-hander has curve > 0, so the
// inside of a bend is on the side of sign(curve).
import { LATERAL } from './handling.js';
import { SETPIECE, loopEntryMph } from './setpieces.js';

export const AI = {
  brake: 42,          // mph/s a rival brakes at (the player's brakes: ~47 at speed)
  lift: 16,           // mph/s coasting off the throttle
  accel: 22,          // mph/s off the line with accelMult 1 (fades toward the target)
  launch: [10, 38],   // mph a driver gets off the line at GO: a bogged start → an ace's rocket start
  samples: 8,         // curvature probes ahead of the car (the first under it)
  probeMs: 26,        // mph·s of road between probes (×7 ≈ the stop from top speed to a hairpin)
  nerve: [0.14, 0.5], // share of tyre grip a driver dares use in a corner: novice → ace
  bankTrust: 0.5,     // …and how much of a bank's help it trusts
  apex: 0.3,          // most a rival cuts toward the inside of a bend
  latSpeed: [0.6, 1.25], // lane units/s a rival moves across the road: novice → ace
  latAccel: 9,        // lane units/s² it can change that at (the world step damps vx at ~5/s)
  passLook: 1.1,      // s of road ahead it looks for a car to pass
  passGap: 0.33,      // lateral room it leaves beside the car it passes
  avoidLook: 0.75,    // s of road ahead it reacts to a hazard
  draft: [0.06, 0.45], // s behind a car where its wake helps
  draftMph: 5,
  nosMph: 13,         // NOS pushes this far over the cruise target
  nosBurn: 0.34,      // tank per second
  nosFill: 0.035,     // tank per second, always
  defendLook: 0.4,    // s behind it watches for an attacker
  defendShift: 0.2,   // most one defensive move shifts across
  band: { push: 14, ease: 18 }, // mph either way the rubber band may move a rival
  tierPace: 9,        // extra mph of race pace at the top tier
  mistakeRate: 0.09,  // mistakes per second for a fully inconsistent novice at tier 0
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerpN = (a, b, t) => a + (b - a) * t;

/** Deterministic PRNG (mulberry32) on a state object, so a brain carries its own stream. */
function next(rng) {
  let t = (rng.s = (rng.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Progression tier 0..1: how sharp the field is. An explicit difficulty (GameState.difficulty,
 * 0..1, from the progression system) wins; otherwise the level and the race's wave.
 */
export function aiTier({ difficulty, level = 0, wave = 1 } = {}) {
  if (Number.isFinite(difficulty)) return clamp(difficulty, 0, 1);
  return clamp(0.12 * Math.max(0, level | 0) + 0.045 * Math.max(0, (wave | 0) - 1), 0, 1);
}

// Personality by car class (src/cars.js CAR_SPECS cls): [skill, aggression, consistency, nos].
const PERSONA = {
  'ALL-ROUNDER': [0.6, 0.45, 0.65, 0.55], DRIFTER: [0.7, 0.5, 0.55, 0.5], TANK: [0.4, 0.75, 0.6, 0.4],
  BRAWLER: [0.5, 0.9, 0.45, 0.45], 'GRIP TUNER': [0.8, 0.4, 0.75, 0.55], JUMPER: [0.55, 0.5, 0.6, 0.6],
  RAMMER: [0.45, 0.95, 0.4, 0.45], LAUNCHER: [0.65, 0.6, 0.5, 0.8], 'DRAG KING': [0.6, 0.55, 0.55, 0.9],
  'GLASS CANNON': [0.75, 0.7, 0.4, 0.7], 'SELF-HEALER': [0.7, 0.45, 0.8, 0.5],
};

/** A driver profile for roster car `cls`, with a little per-seed character. */
export function driverProfile(cls, seed = 1) {
  const p = PERSONA[cls] || PERSONA['ALL-ROUNDER'];
  const rng = { s: seed | 0 };
  const j = () => (next(rng) - 0.5) * 0.12;
  return { skill: clamp(p[0] + j(), 0, 1), aggression: clamp(p[1] + j(), 0, 1), consistency: clamp(p[2] + j(), 0, 1), nos: clamp(p[3] + j(), 0, 1) };
}

/**
 * One rival's brain. `carP` is src/cars.js carParams for its car (grip, accel, top speed);
 * `pace` its race pace in mph (difficulty applied).
 */
export function createBrain(profile, { seed = 1, carP = null, pace = 80 } = {}) {
  return {
    profile, pace,
    grip: (carP && carP.gripMult) || 1,
    accelMult: (carP && carP.accelMult) || 1,
    topBonus: (carP && carP.topMphBonus) || 0,
    rng: { s: (seed | 0) ^ 0x5bd1e995 },
    // Effective numbers for the current tier (see rampBrain).
    tier: -1, skill: 0, aggression: 0, consistency: 0, nosCraft: 0,
    nosTank: 0.5, nosOn: false,
    mode: 'line',        // 'line' | 'pass' | 'defend' | 'avoid' | 'draft' | 'wide'
    passSide: 0, passTimer: 0, passTarget: null,
    defendCd: 0, defendTimer: 0, defendTo: 0,
    mistake: 0, mistakeKind: '', mistakeDir: 0,
    nemesis: false,
    target: 0,           // the lateral offset it is steering for
    wantMph: 0,          // the speed it is driving for this step
    drafting: false,
    stats: { passes: 0, nos: 0, mistakes: 0, brakes: 0 },
    lastPass: null,      // { victim, how, at } — the latest pass this rival made
    launched: false,
    lastPassHow: '',
    lastPassAt: -1e9,
    passing: null,       // the car it is passing now
  };
}

/** Recompute a brain's effective skill/aggression/etc. for a tier (cheap; cached per tier). */
export function rampBrain(b, tier) {
  const t = b.nemesis ? Math.min(1, tier + 0.15) : tier;
  if (t === b.tier) return b;
  b.tier = t;
  const p = b.profile;
  b.skill = clamp(p.skill * (0.75 + 0.25 * t) + 0.3 * t, 0, 1);
  b.aggression = clamp(p.aggression * (0.55 + 0.55 * t) + (b.nemesis ? 0.2 : 0), 0, 1);
  b.consistency = clamp(p.consistency + (1 - p.consistency) * t * 0.85, 0, 1);
  b.nosCraft = clamp(p.nos * (0.6 + 0.4 * t) + 0.2 * t, 0, 1);
  return b;
}

/** Fastest a car may take a bend of `curve` (and `bank`) using `share` of its grip. */
export function cornerMph(curve, bank, grip, share) {
  const c = Math.abs(curve);
  if (c < 1e-4) return Infinity;
  const relief = Math.sign(bank) === Math.sign(curve) ? AI.bankTrust * Math.min(LATERAL.bankMax, Math.abs(bank) * LATERAL.bankRelief) : 0;
  // Lateral accel needed to hold the bend at v (in 88-mph units): fwd · turnRate ∝ curve · v².
  const need = LATERAL.fwd * LATERAL.corner * c * (1 - relief);
  const g = LATERAL.grip * grip * share;
  const k = need - g * LATERAL.downforce; // grip grows with v² too (downforce)
  if (k <= 0) return Infinity;
  return 88 * Math.sqrt(g / k);
}

/**
 * The world a rival sees this frame. Create once, refill each frame (no allocation).
 * Road access is through functions so the AI never touches segment internals.
 */
export function createAiWorld() {
  return {
    tier: 0, time: 0, speedToWorld: 125,
    band: 1,        // rubber-band scale this race (GameState.catchUp, ticket 0211)
    curvatureAt: () => 0, // road curve at Z in segment `curve` units (+ bends right)
    bankAt: () => 0, featureAt: () => null, lineAt: () => 0,
    cars: [],       // every car on the road that drives (rivals + the player proxy), any order
    hazards: [],    // traffic, obstacles and props ahead (bodies with worldZ, offset, halfW)
    // You, as the AI sees you (a proxy in `cars`), and the last rival that got past you.
    player: { id: 'YOU', worldZ: 0, offset: 0, mph: 0, halfW: 0.14, halfL: 105, isPlayer: true, takenDown: false },
    passedYou: null, passedYouAt: -1e9, nemesisCalled: false,
    loopEntry: loopEntryMph(),
  };
}

const passCandidates = [0, 0];

/**
 * One step of a rival. `r` is its body (worldZ, offset, vx, mph, halfW, progress, finishTime);
 * `b` its brain; `w` the shared world; `lead` its progress minus the player's (+ = ahead);
 * `dt` real seconds. Writes r.mph, r.vx, r.nosActive and the brain's state.
 */
export function stepRival(r, b, w, lead, dt) {
  rampBrain(b, w.tier);
  const s2w = w.speedToWorld;
  // Off the line: like the player, a car leaves the grid rolling (the 18 mph floor), and a
  // sharp driver nails the launch.
  if (!b.launched) {
    b.launched = true;
    r.mph = Math.max(r.mph, 18 + lerpN(AI.launch[0], AI.launch[1], b.skill * (0.6 + 0.4 * next(b.rng))));
  }
  const z = r.worldZ;
  const v = Math.max(0, r.mph);
  const s = b.skill;
  const zs = Math.max(30, v) * s2w; // Z this car covers in a second

  // --- 1. The speed it wants -------------------------------------------------------------
  let cruise = b.pace + AI.tierPace * w.tier + b.topBonus * 0.5;
  if (r.finishTime != null) cruise = 60;
  else {
    // Rubber band, capped and fair: a rival far behind pushes; one far ahead eases off, less
    // so as the tier rises (a top-tier leader doesn't wait for you). The nemesis stays close.
    // w.band scales both ways (Settings → RIVALS, src/fair-field.js; 1 = the close pack).
    const near = b.nemesis ? 0.5 : 1;
    if (lead < -220 * near) cruise += w.band * AI.band.push * Math.min(1, (-lead - 220 * near) / 500);
    else if (lead > 350 * near) cruise -= w.band * AI.band.ease * (1 - 0.7 * w.tier) * Math.min(1, (lead - 350 * near) / 450);
  }

  // Corners: probe ahead; the speed it may carry now so it can brake down to each bend in time.
  const share = lerpN(AI.nerve[0], AI.nerve[1], s);
  let limit = Infinity;
  let curveAhead = 0;
  for (let k = 0; k < AI.samples; k++) {
    const dms = k * AI.probeMs;
    const d = dms * s2w;
    const c = w.curvatureAt(z + d);
    if (k > 0 && k < 4) curveAhead += c;
    const vc = cornerMph(c, w.bankAt(z + d), b.grip, share);
    if (vc === Infinity) continue;
    // v² = vc² + 2·a·distance (distance in mph·s), so it reaches vc at the bend. The bend may
    // start anywhere since the last probe, so brake for the earliest point it could.
    const can = Math.sqrt(vc * vc + 2 * AI.brake * 0.9 * Math.max(0, dms - AI.probeMs));
    if (can < limit) limit = can;
  }
  let want = Math.min(cruise, limit);

  // Set pieces: a booster gate tops it up; a loop ahead needs its entry speed (no lifting).
  const f = w.featureAt(z);
  if (f && f.kind === 'BOOSTER' && f.boostTo && r.mph < f.boostTo) r.mph = f.boostTo;
  let needNos = false;
  const fAhead = w.featureAt(z + zs * 1.5);
  if (fAhead && fAhead.kind === 'LOOP') {
    const entry = (fAhead.minMph || SETPIECE.LOOP.minMph) + 14;
    if (want < entry) want = entry;
    if (v < entry) needNos = true;
  }
  // In a loop: too slow over the top and it falls off (a costly mistake, like the player's).
  if (f && f.kind === 'LOOP') {
    const t = (z - f.z0) / f.length;
    if (t > 0.38 && t < 0.62 && v < (f.minMph || SETPIECE.LOOP.minMph) && b.mistakeKind !== 'peel') {
      b.mistakeKind = 'peel'; b.mistake = 1.2; b.stats.mistakes++;
      r.mph = Math.min(r.mph, 34);
    }
  }

  // --- 2. Who's around: car ahead to pass/draft, attacker behind -------------------------
  let ahead = null, aheadDz = Infinity, behind = null, behindDz = Infinity;
  const cars = w.cars;
  for (let i = 0; i < cars.length; i++) {
    const o = cars[i];
    if (o === r || o.takenDown) continue;
    const dz = o.worldZ - z;
    const dx = Math.abs(o.offset - r.offset);
    if (dz > 0 && dz < AI.passLook * zs && dx < 0.42 && dz < aheadDz) { ahead = o; aheadDz = dz; }
    if (dz < 0 && -dz < AI.defendLook * zs && -dz < behindDz) { behind = o; behindDz = -dz; }
  }
  b.drafting = Boolean(ahead && aheadDz > AI.draft[0] * zs && aheadDz < AI.draft[1] * zs && Math.abs(ahead.offset - r.offset) < 0.2);
  if (b.drafting) want += AI.draftMph;

  // --- 3. NOS ------------------------------------------------------------------------------
  b.nosTank = Math.min(1, b.nosTank + AI.nosFill * dt);
  const straight = Math.abs(curveAhead) < 0.9;
  const attacking = ahead && aheadDz < 0.8 * zs && ahead.mph > v - 4;
  const defending = behind && behind.isPlayer && behindDz < 0.3 * zs && behind.mph > v;
  const craft = b.nosCraft;
  let nosWant = needNos;
  if (!nosWant && r.finishTime == null && straight && b.nosTank > 0.25) {
    nosWant = (attacking && craft > 0.35) || (defending && craft > 0.5) ||
      (lead < -300 && craft > 0.3) || (b.nosTank > 0.92 && limit === Infinity);
  }
  if (b.nosOn) { if (!nosWant && b.nosTank < 0.9 && !straight) b.nosOn = false; }
  else if (nosWant && b.nosTank > 0.2) { b.nosOn = true; b.stats.nos++; }
  if (b.nosOn) {
    b.nosTank -= AI.nosBurn * dt;
    if (b.nosTank <= 0) { b.nosTank = 0; b.nosOn = false; }
    else want = Math.max(want, Math.min(cruise + AI.nosMph, limit + 4));
  }

  // --- 4. Mistakes -------------------------------------------------------------------------
  if (b.mistake > 0) {
    b.mistake -= dt;
    if (b.mistake <= 0) { b.mistakeKind = ''; b.mistake = 0; }
  } else if (r.finishTime == null && v > 40) {
    const rate = AI.mistakeRate * (1 - b.consistency) * (1 - 0.8 * w.tier);
    if (next(b.rng) < rate * dt) {
      b.stats.mistakes++;
      if (Math.abs(curveAhead) > 1.2) { b.mistakeKind = 'wide'; b.mistakeDir = -Math.sign(curveAhead); b.mistake = 0.9; }
      else { b.mistakeKind = 'lift'; b.mistake = 0.7; }
    }
  }
  if (b.mistakeKind === 'lift') want = Math.min(want, v - 6);

  // --- 5. Integrate speed ------------------------------------------------------------------
  b.wantMph = want;
  if (v < want) {
    const top = Math.max(40, want);
    r.mph = Math.min(want, v + AI.accel * b.accelMult * Math.max(0.2, 1 - (v / (top + 20)) ** 2) * dt * (b.nosOn ? 1.9 : 1));
  } else if (v > want) {
    const hard = limit < cruise && v > limit - 0.5;
    if (hard && v > want + 0.2) b.stats.brakes += dt;
    r.mph = Math.max(want, v - (hard ? AI.brake : AI.lift) * dt);
  }
  r.nosActive = b.nosOn;

  // --- 6. The line it steers for ---------------------------------------------------------
  const look = 0.3 * zs;
  let target = w.lineAt(z + look);
  // Apex: cut toward the inside of the bend coming up (skilled drivers commit more).
  const cNow = w.curvatureAt(z + look * 1.6);
  target += clamp(cNow * 0.14, -AI.apex, AI.apex) * (0.4 + 0.6 * s);
  b.mode = 'line';

  // Pass a slower car ahead on the side with room (held for a moment so it commits).
  if (b.passTimer > 0) b.passTimer -= dt;
  if (ahead && aheadDz < 0.9 * zs && (ahead.mph < want - 1 || b.drafting) && r.finishTime == null) {
    if (b.passTimer <= 0 || b.passTarget !== ahead) {
      // Inside of the next bend first for a skilled driver, else whichever side is roomier.
      const inside = Math.sign(cNow) || (r.offset >= ahead.offset ? 1 : -1);
      passCandidates[0] = s > 0.55 ? inside : (r.offset >= ahead.offset ? 1 : -1);
      passCandidates[1] = -passCandidates[0];
      let side = 0;
      for (let k = 0; k < 2 && !side; k++) {
        const cand = clamp(ahead.offset + passCandidates[k] * AI.passGap, -0.62, 0.62);
        if (Math.abs(cand - ahead.offset) > AI.passGap * 0.7 && roomAt(w, r, cand, z, aheadDz, zs)) side = passCandidates[k];
      }
      b.passSide = side;
      b.passTarget = ahead;
      b.passTimer = side ? 2.2 : 0.6;
    }
    if (b.passSide) {
      target = clamp(ahead.offset + b.passSide * AI.passGap, -0.62, 0.62);
      b.mode = 'pass';
      b.passing = ahead;
    } else if (b.drafting || aheadDz > AI.draft[0] * zs) {
      // No room yet: tuck into the wake and wait.
      target = ahead.offset;
      b.mode = 'draft';
    }
  } else if (b.passTimer <= 0) {
    b.passTarget = null; b.passing = null;
  }

  // Defend: an aggressive rival makes one move toward an attacker closing from behind.
  if (b.defendCd > 0) b.defendCd -= dt;
  if (b.defendTimer > 0) {
    b.defendTimer -= dt;
    target = b.defendTo;
    b.mode = 'defend';
  } else if (behind && behindDz < 0.3 * zs && behind.mph > v + 2 && b.defendCd <= 0 && b.mode === 'line' &&
    next(b.rng) < b.aggression * (behind.isPlayer ? 1 : 0.4) * 2 * dt) {
    b.defendTo = clamp(r.offset + clamp(behind.offset - r.offset, -AI.defendShift, AI.defendShift), -0.6, 0.6);
    b.defendTimer = 0.9;
    b.defendCd = 4 - 2 * b.aggression;
  }

  // Hazards (traffic, obstacles, props): swing round anything in the way.
  const avoid = AI.avoidLook * zs;
  for (let i = 0; i < w.hazards.length; i++) {
    const h = w.hazards[i];
    if (h.takenDown || h.collected) continue;
    const dz = h.worldZ - z;
    if (dz < -(h.halfL || 100) || dz > avoid) continue;
    const need = (h.halfW || 0.14) + r.halfW + 0.06;
    if (Math.abs(h.offset - target) < need) {
      const l = h.offset - need, rr = h.offset + need;
      const goL = l > -0.66, goR = rr < 0.66;
      target = goL && goR ? (Math.abs(l - r.offset) < Math.abs(rr - r.offset) ? l : rr) : goL ? l : rr;
      b.mode = 'avoid';
    }
  }

  // Boxed in behind a car (no pass on yet): match its speed rather than run into it.
  if (ahead && b.mode !== 'pass' && Math.abs(ahead.offset - r.offset) < (ahead.halfW || 0.14) + r.halfW + 0.04 &&
    aheadDz < (ahead.halfL || 110) + (r.halfL || 110) + 0.12 * zs && r.mph > ahead.mph) {
    r.mph = Math.max(ahead.mph, r.mph - AI.brake * dt);
  }
  if (b.mistakeKind === 'wide') { target += b.mistakeDir * 0.28; b.mode = 'wide'; }
  if (b.mistakeKind === 'peel') b.mode = 'wide';
  b.target = clamp(target, -0.66, 0.66);

  // --- 7. Steer: a speed-limited, accel-limited chase of the target -----------------------
  const maxLat = lerpN(AI.latSpeed[0], AI.latSpeed[1], s) * (v < 30 ? 0.6 : 1);
  const desired = clamp((b.target - r.offset) * 3.2, -maxLat, maxLat);
  const dv = clamp(desired - r.vx, -AI.latAccel * dt, AI.latAccel * dt);
  r.vx += dv;

  // A finished pass: the car it was passing is now behind it.
  const p = b.passing;
  if (p && p.worldZ < z - (p.halfL || 110) - (r.halfL || 110)) {
    b.stats.passes++;
    b.lastPass = p;
    b.lastPassHow = b.nosOn ? 'NOS' : b.drafting ? 'SLIPSTREAM' : Math.abs(cNow) > 1 ? 'INSIDE LINE' : 'CLEAN PASS';
    b.lastPassAt = w.time;
    if (p === w.player) { w.passedYou = r; w.passedYouAt = w.time; }
    b.passing = null; b.passTarget = null; b.passTimer = 0;
  }
  return b;
}

/** Is lateral `offset` free of other cars and hazards over the next stretch? */
function roomAt(w, r, offset, z, span, zs) {
  if (Math.abs(offset) > 0.64) return false;
  for (let i = 0; i < w.cars.length; i++) {
    const o = w.cars[i];
    if (o === r || o.takenDown) continue;
    const dz = o.worldZ - z;
    if (dz > -0.15 * zs && dz < span + 0.25 * zs && Math.abs(o.offset - offset) < (o.halfW || 0.14) + r.halfW + 0.03) return false;
  }
  for (let i = 0; i < w.hazards.length; i++) {
    const h = w.hazards[i];
    if (h.takenDown || h.collected) continue;
    const dz = h.worldZ - z;
    if (dz > 0 && dz < span + 0.6 * zs && Math.abs(h.offset - offset) < (h.halfW || 0.14) + r.halfW + 0.05) return false;
  }
  return true;
}

/** Pick the race's nemesis: the most aggressive rival among those with paces near yours. */
export function pickNemesis(brains, playerPace = 80) {
  let best = -1, score = -Infinity;
  for (let i = 0; i < brains.length; i++) {
    const b = brains[i];
    const sc = b.profile.aggression * 2 - Math.abs(b.pace - playerPace) / 20;
    if (sc > score) { score = sc; best = i; }
  }
  if (best >= 0) { brains[best].nemesis = true; brains[best].tier = -1; }
  return best;
}

// ---------------------------------------------------------------------------------------
// Game glue (kept here so the main bundle only carries a few calls into this lazy chunk).

/**
 * Give every rival in `racers` a brain and pick the nemesis. `cls(r)` is a rival's car class,
 * `carP(r)` its carParams. Returns the nemesis body (or null).
 */
export function setupField(w, racers, { seed = 1, pace = 1, cls, carP }) {
  w.passedYou = null; w.passedYouAt = -1e9; w.nemesisCalled = false;
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    r.ai = createBrain(driverProfile(cls(r), (seed | 0) + i * 7919), { seed: (seed | 0) ^ (i * 0x9e37), carP: carP(r), pace: r.pace });
  }
  const n = pickNemesis(racers.map((r) => r.ai), 80 * pace);
  for (const r of racers) r.nemesis = r.ai.nemesis;
  return n >= 0 ? racers[n] : null;
}

const zeroLine = () => 0;
let lineRef, lineAt = zeroLine;

/**
 * Refill the AI's view of the road for this frame (no allocation): the rivals and you (`me`,
 * a reused proxy), traffic and obstacles as hazards, the race's clean line and the tier.
 * `road` = { curvatureAt, bankAt, featureAt, line }; `g` the GameState.
 */
export function fillWorld(w, field, playerZ, road, g, s2w) {
  const me = w.player;
  me.worldZ = playerZ; me.offset = g.playerX; me.mph = g.speed;
  w.time = g.raceTime;
  w.speedToWorld = s2w;
  w.tier = aiTier({ difficulty: g.difficulty, level: g.levelIndex, wave: g.waveTier });
  w.band = g.catchUp || 1;
  w.curvatureAt = road.curvatureAt; w.bankAt = road.bankAt; w.featureAt = road.featureAt;
  if (lineRef !== road.line) { lineRef = road.line; lineAt = lineRef ? (z) => lineRef.centreAt(z) : zeroLine; }
  w.lineAt = lineAt;
  const c = w.cars;
  c.length = 0;
  for (let i = 0; i < field.racers.length; i++) c.push(field.racers[i]);
  c.push(me);
  const h = w.hazards;
  h.length = 0;
  for (let i = 0; i < field.traffic.length; i++) h.push(field.traffic[i]);
  for (let i = 0; i < field.drawObstacles.length; i++) h.push(field.drawObstacles[i]);
  return w;
}

/**
 * Race-call extras for this frame. `c` is the position callout (or null): when a rival's pass
 * just dropped you, its sub-line says who and how. Returns the nemesis intro [main, sub] once,
 * about 7 s in, when nothing else is being called.
 */
export function raceCalls(w, field, c) {
  const by = w.passedYou;
  if (c && c.kind === 'down' && by && w.time - w.passedYouAt < 3) c.sub = `${by.nemesis ? '😈 ' : ''}${by.short} — ${by.ai.lastPassHow}`;
  if (w.nemesisCalled || w.time < 7 || c) return null;
  w.nemesisCalled = true;
  const n = field.racers.find((r) => r.nemesis);
  return n ? [`😈 NEMESIS: ${n.short}`, `${n.driver.toUpperCase()} IS GUNNING FOR YOU`] : null;
}
