// Pickups: coins, flux cores, repair wrenches and NOS canisters as typed objects.
//
// One definition per kind says what it is worth, how close you need to be, whether it is
// magnetic, how it looks (src/pickup-art.js, a lazy chunk, owns the icon art) and which cue it
// plays. Placement is deterministic (segment index + the race's clean line, src/cleanline.js),
// so ghosts, live rooms and dailies see the same pickups. Every pickup sits within `LINE_HUG` of
// the clean line: the hazard planner keeps everything that costs points at least the line's
// keep-out away, so no pickup ever sits inside a hazard, and following the coins teaches the
// line through the curves. Pickup objects are the track ring's pooled items (src/track.js
// addItem): nothing here allocates per frame. Point values are the ones the game always paid,
// so medal targets and the server's rate checks (src/worker/plausible.js) still hold.

export const PICKUPS = {
  //            pts: × combo · coins: currency · flux: FLUX.gains key · reach: lane units · color: fallback / FX tint
  HW_COIN: { pts: 300, coins: 4, flux: 'coin', combo: true, reach: 0.44, magnet: true, cue: 'coin', color: '#facc15' },
  PLUTONIUM: { pts: 500, coins: 8, flux: 'plutonium', combo: true, reach: 0.44, magnet: true, cue: 'coin', power: true, color: '#22d3ee' },
  REPAIR_WRENCH: { pts: 400, heal: 25, combo: false, reach: 0.42, magnet: false, cue: 'repair', power: true, color: '#10b981' },
  NOS_CAN: { pts: 0, nos: 'canister', combo: false, reach: 0.44, magnet: true, cue: 'nos', power: true, color: '#3b82f6' },
  // Runner power-ups (0177, Endless solo only; effects in src/powerups.js). No points: the
  // reward is the effect, so scores and the server's checks are unchanged.
  MAGNET: { pts: 0, powerup: true, combo: false, reach: 0.46, magnet: false, cue: 'power', power: true, color: '#f43f5e' },
  SHIELD: { pts: 0, powerup: true, combo: false, reach: 0.46, magnet: false, cue: 'power', power: true, color: '#38bdf8' },
  DOUBLER: { pts: 0, powerup: true, combo: false, reach: 0.46, magnet: false, cue: 'power', power: true, color: '#facc15' },
};

export const isPickup = (type) => Object.prototype.hasOwnProperty.call(PICKUPS, type);

export const PICKUP = {
  LINE_HUG: 0.08,     // most a pickup sits off the clean line (keep-out is ≥ 0.21 + hazard half-width)
  apexPull: 0.05,     // per unit of segment curve, toward the inside of the bend
  trailEvery: 72,     // segments between coin trails
  trail: [0, 3, 6, 9], // a trail: four coins, three segments apart
  coreAt: 36,         // a flux core halfway between trails
  wrenchEvery: 38,    // repair wrenches (from segment 30 on)
  nosEvery: 150,      // NOS canisters
  nosAt: 111,         // …this far into each 150 (clear of trails and cores)
  gap: 2,             // no two pickups within this many segments of each other
  magnetRange: 2.4,   // × reach: how far a magnetic pickup starts to drift toward you
  magnetSegs: 6,      // …and only this many segments ahead
  magnetRate: 5,      // lane units/s-ish pull (exponential approach)
  touchAssist: 1.15,  // touch players get a slightly larger reach
  speedReach: 0.12,   // extra reach at top speed for magnetic kinds
};

/** Which pickup kind (if any) the rhythm puts at segment index `i`. Pure. */
export function kindAt(i, patternType = '') {
  if (i < 12) return null;
  const t = i % PICKUP.trailEvery;
  if (PICKUP.trail.includes(t)) return patternType === 'STUNT_LOOP' ? 'PLUTONIUM' : 'HW_COIN';
  if (t === PICKUP.coreAt) return 'PLUTONIUM';
  if (i % PICKUP.nosEvery === PICKUP.nosAt) return 'NOS_CAN';
  if (i > 30 && i % PICKUP.wrenchEvery === 0) {
    // A wrench yields to anything else nearby so pickups never stack.
    for (let d = -PICKUP.gap; d <= PICKUP.gap; d++) {
      if (d === 0) continue;
      const j = i + d;
      const u = j % PICKUP.trailEvery;
      if (PICKUP.trail.includes(u) || u === PICKUP.coreAt || j % PICKUP.nosEvery === PICKUP.nosAt) return null;
    }
    return 'REPAIR_WRENCH';
  }
  return null;
}

// Power-up slots (0177): one candidate every `every` segments (fewer segments apart each tier),
// kept only where nothing else sits within PICKUP.gap, and a seeded coin-flip decides whether it
// shows and which of the three it is. Off (level 0) outside Endless solo runs.
export const POWER_SPAWN = { from: 60, every: 160, perTier: 10, minEvery: 90, chance: 0.55, chancePerTier: 0.05, kinds: ['MAGNET', 'SHIELD', 'DOUBLER'] };

function hash01(seed, i) {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i + 0x632be5ab, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
  return ((t ^ (t >>> 13)) >>> 0) / 4294967296;
}

/** The power-up (if any) at segment `i` for Endless tier `level` (0 = off) and track `seed`. Pure. */
export function powerupAt(i, level, seed = 0) {
  const S = POWER_SPAWN;
  if (!(level > 0) || i < S.from) return null;
  const every = Math.max(S.minEvery, S.every - S.perTier * (level - 1));
  if (i % every !== every >> 1) return null;
  for (let d = -PICKUP.gap; d <= PICKUP.gap; d++) if (kindAt(i + d)) return null;
  const r = hash01(seed, i);
  if (r >= Math.min(0.85, S.chance + S.chancePerTier * (level - 1))) return null;
  return S.kinds[Math.floor(hash01(seed + 7, i) * S.kinds.length)];
}

/**
 * Lateral spot for a pickup on segment `seg` at track Z `z`: the clean line, nudged toward the
 * inside of a bend (the apex) but never more than LINE_HUG off it, and inside the lanes.
 */
export function pickupOffset(line, z, curve) {
  const c = line ? line.centreAt(z) : 0;
  const nudge = Math.max(-PICKUP.LINE_HUG, Math.min(PICKUP.LINE_HUG, (curve || 0) * PICKUP.apexPull));
  return Math.max(-0.6, Math.min(0.6, c + nudge));
}

/**
 * Put this segment's pickup (if the rhythm has one) on it. `add` is track.js addItem.
 * Set pieces (except booster gates) and checkpoints stay clear; callers skip those segments.
 */
export function placePickup(seg, i, patternType, line, add, power = 0, seed = 0) {
  const kind = kindAt(i, patternType) || powerupAt(i, power, seed);
  if (!kind) return null;
  return add(seg, pickupOffset(line, seg.p1.world.z, seg.curve), kind, true, i * 0.8);
}

/** How close (lane units) the car must be to collect `def` this step. */
export function pickupReach(def, speedMph, touch, magnetActive) {
  let r = def.reach;
  if (def.magnet) {
    if (magnetActive) r = Math.max(r, 1.25);
    r += PICKUP.speedReach * Math.min(1, Math.max(0, speedMph) / 120);
  }
  return touch ? r * PICKUP.touchAssist : r;
}

/**
 * Magnetic pickups close to the car drift toward it (mutates `it.offset`). Deterministic: a
 * function of the sim state only. `aheadSegs` is how many segments in front of the car it is.
 */
export function magnetPull(it, def, playerX, aheadSegs, reach, dt) {
  if (!def.magnet || it.collected || aheadSegs < 0 || aheadSegs > PICKUP.magnetSegs) return false;
  const d = playerX - it.offset;
  if (Math.abs(d) > reach * PICKUP.magnetRange) return false;
  const near = 1 - aheadSegs / (PICKUP.magnetSegs + 1);
  it.offset += d * Math.min(1, dt * PICKUP.magnetRate * near);
  return true;
}
