// Endless hazards (ticket 0186): more ways to lose, endless-runner style — one mistake can end the
// run, but every danger is telegraphed (a roadside sign, a lane highlight, a sound and a call-out
// ~1.6 s before you reach it) so a loss always reads as "my fault", never a cheap shot.
//
// Pure and deterministic: kinds, placement and every rule come from the run seed, the hazard's
// index and what the player did, so two runs with the same inputs play out the same. The glue
// (src/hazard-run.js) applies them to GameState; src/hazard-art.js draws them. Both are lazy.
//
// Units: `z` is track Z (sim units), `x` the lane offset (walls at ±0.72), `y` height above the
// road, times in seconds. `zps` is how many Z units a second the car covers at its speed.

/** Three gameplay lanes across the road (centres) and how far each reaches either side. */
export const LANES = [-0.48, 0, 0.48];
export const LANE_HALF = 0.24;
const LANE_SLACK = 0.04; // straddling a line counts as being in both lanes

/** Lanes (bit i = LANES[i]) the car's centre `x` touches. */
export function lanesAt(x) {
  let m = 0;
  for (let i = 0; i < 3; i++) if (Math.abs(x - LANES[i]) < LANE_HALF + LANE_SLACK) m |= 1 << i;
  return m;
}
export const nearestLane = (x) => (x < -LANE_HALF ? 0 : x > LANE_HALF ? 2 : 1);

//   from   Endless tier it unlocks at · len: Z length · act: the call-out · how: the tutorial line
//   cause: the death card's headline · tip: how to beat it next time
export const HZ = {
  BRIDGE: { from: 2, len: 600, icon: '🌉', sign: 'BRIDGE OUT', act: 'JUMP!', how: 'JUMP JUST BEFORE THE GAP — H · E · SWIPE UP', cause: 'FELL THROUGH THE BROKEN BRIDGE', tip: 'Jump right before the gap.' },
  WRONGWAY: { from: 2, len: 240, icon: '🚘', sign: 'WRONG WAY', act: 'SWERVE!', how: 'HEADLIGHTS COMING AT YOU — CHANGE LANES', cause: 'HEAD-ON WITH A WRONG-WAY DRIVER', tip: 'When headlights come at you, switch lanes.' },
  BEAM: { from: 3, len: 200, icon: '🚧', sign: 'LOW CLEARANCE', act: 'DUCK!', how: 'HOLD BRAKE TO DUCK — OR TAKE THE GREEN LANE', cause: 'SMACKED THE LOW OVERPASS', tip: 'Hold brake to duck under, or take the green lane.' },
  COLLAPSE: { from: 3, len: 1000, icon: '🕳️', sign: 'ROAD CRUMBLING', act: 'GREEN LANE!', how: 'THE ROAD IS CRUMBLING — STEER INTO THE GREEN LANE', cause: 'THE ROAD CRUMBLED UNDER YOU', tip: 'Steer into the lane with the green arrows.' },
  TRAIN: { from: 4, len: 260, icon: '🚂', sign: 'TRAIN CROSSING', act: 'BRAKE!', how: 'BELLS RINGING — BRAKE AND LET THE TRAIN PASS', cause: 'THE TIME TRAIN GOT YOU', tip: 'When the bells ring, brake and wait for the train.' },
  EDGE: { from: 4, len: 2400, icon: '⚠️', sign: 'NO GUARDRAIL', act: 'STAY OFF THE EDGE!', how: 'THE GUARDRAIL IS GONE — KEEP AWAY FROM THAT SIDE', cause: 'DROVE OFF THE BROKEN EDGE', tip: 'Where the guardrail is gone, keep away from that side.' },
  LIGHTNING: { from: 2, storm: true, len: 360, icon: '⚡', sign: 'STORM', act: 'DODGE THE BOLT!', how: 'STEER OUT OF THE GLOWING RING', cause: 'ZAPPED BY STORM LIGHTNING', tip: 'Keep ahead of the Time Storm, and steer out of glowing rings.' },
};
export const PLACED = ['BRIDGE', 'WRONGWAY', 'BEAM', 'COLLAPSE', 'TRAIN', 'EDGE'];

/** Run-ending causes that aren't road hazards (src/hazard-run.js and the race step). */
export const CAUSES = {
  FUEL: { icon: '⛽', cause: 'RAN OUT OF PLUTONIUM', tip: 'Grab the glowing blue cores to keep the tank up.' },
  HEAT: { icon: '🔥', cause: 'BLEW THE ENGINE', tip: 'Ease off NOS when the heat bar turns red.' },
  STALL: { icon: '🐌', cause: 'STALLED OUT', tip: 'Keep moving: the road waits for no one.' },
  PATROL: { icon: '🚨', cause: 'THE PATROL CAUGHT YOU', tip: 'After a slip, drive clean until the Patrol gives up.' },
  TIMEOUT: { icon: '⏱️', cause: 'TIME OUT — MISSED THE CHECKPOINT', tip: 'Keep your speed up between checkpoints.' },
  WRECK: { icon: '💥', cause: 'WRECKED', tip: 'Grab 🔧 wrenches and dodge traffic to keep your HP up.' },
  STORM: { icon: '⛈️', cause: 'CAUGHT BY THE TIME STORM', tip: 'Crashes and slowing down let the Storm close in.' },
};
export const causeOf = (id) => HZ[id] || CAUSES[id] || CAUSES.WRECK;

export const RULES = {
  gentle: 4500,        // run distance (mph·s, ≈50 s at 88 mph) before any run-ending hazard
  ahead: 26000,        // Z ahead of the car where a hazard is laid down (just inside draw range)
  warn: 1.6,           // s before arrival: sign lit, lane highlight, sound, call-out
  warnFirst: 2.6,      // …the first time you ever meet a kind (with the how-to line)
  gapSecs: 9,          // s of road (at 88 mph) between hazards at difficulty 0…
  gapSecsHard: 4.6,    // …and at difficulty 1
  gapJitter: 3,        // + up to this many seconds, seeded
  signLead: 0.8,       // the roadside sign stands this many seconds before the hazard
  jumpCue: 0.3,        // "JUMP NOW" flashes inside this many seconds of a gap
  lowY: 3,             // under this you're on the road (a gap swallows you)
  trainArm: 2.4,       // s before arrival the bells start and the train is scheduled
  trainLead: 0.9,      // the train reaches the road this long before you would…
  trainTail: 0.75,     // …and is clear this long after you would have
  trainHalf: 150,      // Z either side of the rails the train fills
  wrongMph: 46,        // a wrong-way driver's speed toward you
  wrongLock: 1.8,      // s of closing time when it picks your lane (and stops changing)
  wrongHalf: 260,      // Z overlap that counts as a head-on
  wrongY: 44,          // clear it by jumping higher than this
  collapseHoles: 0.9,  // s before arrival the doomed lanes fall away (cracks show from `warn`)
  edgeX: 0.7,          // this close to a missing guardrail is off the road
  boltY: 140,          // lightning reaches this high
  stormWarn: 0.3,      // the Time Storm throws lightning once it's this close (storm.warn)
  boltEvery: 2.6,      // s between strikes while it's that close
  boltAhead: 1.9,      // s ahead of you a strike lands
};

/** 32-bit hash of (seed, index, salt) → [0, 1). */
export function hash01(seed, i, salt = 0) {
  let t = (Math.imul((seed | 0) ^ salt, 0x9e3779b1) ^ Math.imul((i | 0) + 0x632be5ab, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
  t = Math.imul(t ^ (t >>> 12), 0x297a2d39) >>> 0;
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

/** Kinds that can be laid down at Endless `tier`. */
export const kindsFor = (tier) => PLACED.filter((k) => HZ[k].from <= tier);

/** Z of road between hazards at `difficulty` (0..1) for hazard `i`; `refZps` = Z/s at 88 mph. */
export function gapZ(seed, i, difficulty, refZps) {
  const d = Math.max(0, Math.min(1, difficulty || 0));
  const secs = RULES.gapSecs + (RULES.gapSecsHard - RULES.gapSecs) * d + RULES.gapJitter * hash01(seed, i, 0x51);
  return secs * refZps;
}

/**
 * The next hazard to lay down: kind and lane layout. Kinds newly unlocked this run come first
 * (`met` = kinds already laid down this run), so each tier opens with its new danger; after that
 * the seed picks, never the same kind twice in a row.
 */
export function planHazard(seed, i, tier, met, last) {
  const kinds = kindsFor(tier);
  if (!kinds.length) return null;
  let kind = kinds.find((k) => !met.includes(k));
  if (!kind) {
    const pool = kinds.length > 1 ? kinds.filter((k) => k !== last) : kinds;
    kind = pool[Math.floor(hash01(seed, i, 0x77) * pool.length) % pool.length];
  }
  const r = hash01(seed, i, 0x3b);
  const lane = Math.floor(r * 3) % 3;
  const h = { kind, len: HZ[kind].len, lanes: 7, safe: -1, side: 0 };
  if (kind === 'BEAM' || kind === 'COLLAPSE') { h.safe = lane; h.lanes = 7 & ~(1 << lane); }
  else if (kind === 'WRONGWAY') h.lanes = 1 << lane;
  else if (kind === 'EDGE') h.side = r < 0.5 ? -1 : 1;
  return h;
}

/** Seconds until the car (at `pz`, covering `zps`/s) reaches `z`; Infinity when stopped. */
export const timeTo = (z, pz, zps) => (z <= pz ? 0 : zps > 1 ? (z - pz) / zps : Infinity);

/** Schedule the train when the car is `t` seconds from the rails at time `now`. */
export function armTrain(h, now, t) {
  h.tOn = now + Math.max(0.45, t - RULES.trainLead);
  h.tOff = now + t + RULES.trainTail;
}

/** Where the train is across the road: -1 (left of it) … 1 (past it); null when not on the move. */
export function trainPos(h, now) {
  if (h.tOn == null) return null;
  const a = h.tOn - 0.6, b = h.tOff + 0.6;
  if (now < a || now > b) return null;
  return -1 + (2 * (now - a)) / (b - a);
}

/**
 * Does hazard `h` end the run for a car at `p` = { z, x, y, duck, now } this step?
 * (z0 = start Z; a wrong-way car's own Z is h.carZ.)
 */
export function hits(h, p) {
  if (h.spent) return false;
  const inZ = p.z >= h.z0 && p.z <= h.z0 + h.len;
  switch (h.kind) {
    case 'BRIDGE': return inZ && p.y < RULES.lowY;
    case 'COLLAPSE': return inZ && p.y < RULES.lowY && (lanesAt(p.x) & h.lanes) !== 0 && (lanesAt(p.x) & (1 << h.safe)) === 0;
    case 'BEAM': return inZ && !p.duck && (lanesAt(p.x) & h.lanes) !== 0 && (lanesAt(p.x) & ~h.lanes & 7) === 0;
    case 'TRAIN': return Math.abs(p.z - (h.z0 + h.len / 2)) < RULES.trainHalf && h.tOn != null && p.now >= h.tOn && p.now <= h.tOff;
    case 'WRONGWAY': return Math.abs(p.z - h.carZ) < RULES.wrongHalf && p.y < RULES.wrongY && (lanesAt(p.x) & h.lanes) !== 0;
    case 'EDGE': return inZ && p.y < RULES.lowY && p.x * h.side >= RULES.edgeX;
    case 'LIGHTNING': return inZ && p.y < RULES.boltY && (lanesAt(p.x) & h.lanes) !== 0;
    default: return false;
  }
}

/** The far end of a hazard (passing it = survived). */
export const endZ = (h) => (h.kind === 'WRONGWAY' ? h.carZ : h.z0 + h.len);

// ---------------------------------------------------------------------------------------
// Resource fails.

// Fuel: the tank drains with road covered (per Z, so every pace mode feels the same) and a
// PLUTONIUM core tops it up. Dry = no throttle: you coast, and `drySecs` without a core ends it.
export const FUEL = { max: 100, perSeg: 10 / (72 * 200), perSegHard: 0.6, core: 22, low: 25, drySecs: 5, refill: 60 };

/** Burn fuel for `dz` Z of road at `difficulty`. Returns the new level. */
export function burnFuel(level, dz, difficulty) {
  const rate = FUEL.perSeg * (1 + FUEL.perSegHard * Math.max(0, Math.min(1, difficulty || 0)));
  return Math.max(0, level - Math.max(0, dz) * rate);
}

// NOS heat: burning heats the engine, not burning cools it. Spamming tank after tank blows it.
export const HEAT = { perSec: 26, cool: 14, hot: 70, max: 100 };

export function stepHeat(heat, burning, dt) {
  return burning ? Math.min(HEAT.max, heat + HEAT.perSec * dt) : Math.max(0, heat - HEAT.cool * dt);
}

// Stalling: crawling for too long ends the run (waiting at a crossing doesn't count). The road
// never lets a car drop under 18 mph, so "crawling" is anything below 25.
export const STALL = { mph: 25, secs: 4, after: 8 };

export function stepStall(t, mph, dt, excused) {
  return excused || mph >= STALL.mph ? 0 : t + dt;
}

// The Patrol: a slip (a crash, a wall grind, crawling) sets it on your tail for a few seconds;
// a second slip before it gives up and you're caught.
export const PATROL = { secs: 8, secsHard: 5, slowMph: 30, slowSecs: 1.5, grindMph: 30 };

export const patrolSecs = (difficulty) => PATROL.secs + (PATROL.secsHard - PATROL.secs) * Math.max(0, Math.min(1, difficulty || 0));

/** One step of the Patrol: `slip` this step → 'on' | 'caught' | 'lost' | ''. */
export function stepPatrol(p, slip, dt, difficulty) {
  if (p.t > 0) {
    if (slip) { p.t = 0; return 'caught'; }
    p.t = Math.max(0, p.t - dt);
    return p.t === 0 ? 'lost' : '';
  }
  if (!slip) return '';
  p.t = p.dur = patrolSecs(difficulty);
  return 'on';
}

// Checkpoints: from tier 3 a gate every `dist` of road, each with a clock; spare time carries.
export const CHECK = { from: 3, dist: 3600, mph: 56, mphHard: 22, carry: 8 };

/** Seconds allowed to reach the next gate at `difficulty`, plus what carries over. */
export function checkSecs(difficulty, spare = 0) {
  const mph = CHECK.mph + CHECK.mphHard * Math.max(0, Math.min(1, difficulty || 0));
  return CHECK.dist / mph + Math.max(0, Math.min(CHECK.carry, spare));
}

// ---------------------------------------------------------------------------------------
// Bookkeeping on the save (save.endless.hz): kinds you've met (first meeting = tutorial: the run
// survives it once) and deaths by cause.

export function ensureHz(save) {
  const e = save.endless || (save.endless = { bestDistance: 0, bestTier: 0, runs: 0 });
  const z = e.hz && typeof e.hz === 'object' ? e.hz : (e.hz = {});
  if (!z.seen || typeof z.seen !== 'object') z.seen = {};
  if (!z.deaths || typeof z.deaths !== 'object') z.deaths = {};
  return z;
}

export function recordDeath(save, cause) {
  const z = ensureHz(save);
  z.deaths[cause] = (z.deaths[cause] | 0) + 1;
  return z.deaths[cause];
}
