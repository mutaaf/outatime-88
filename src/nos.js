// NOS (ticket 0122): a nitrous tank you burn on demand, separate from the Flux/88 mph warp.
//
// Pure and deterministic: fixed-step, no randomness, so runs replay the same. The tank is in
// "seconds of burn". Holding NOS burns it for extra thrust and a higher speed cap, capped at
// the warp ceiling so live rooms and the server's speed bounds still hold. It refills from
// driving well: drifting, near misses, airtime, clean driving and pickup canisters.
//
// Balance: tank size and refill rate come from the car's FLUX/BOOST rating. That rating is
// part of the same 30-point budget as every other stat, so a big tank costs speed, grip or
// armour (tests/unit/nos.test.js checks no car is best at everything).

export const NOS = {
  tankBase: 1.9,        // s of burn at flux rating 0
  tankPerFlux: 0.12,    // + per flux rating point (rating 5 → 2.5 s, rating 8 → 2.86 s)
  startFill: 0.5,       // races start half full
  minToStart: 0.25,     // s of burn needed to light it (no flicker on an empty tank)
  thrust: 26,           // extra mph/s while burning
  capBonus: 18,         // mph above the normal top speed while burning
  refill: {
    driftPerSec: 0.22,  // s of burn gained per second of drifting
    airPerSec: 0.3,     // per second airborne
    cleanPerSec: 0.035, // per second with no penalty in the last `cleanAfter` s
    cleanAfter: 5,
    nearMiss: 0.18,     // per close shave
    canister: 0.8,      // per pickup canister
  },
  refillFluxScale: 0.04, // refill × (0.8 + flux × this): flux 5 → ×1.0
};

/** NOS numbers for a car from its FLUX/BOOST rating (0..10). */
export function nosFor(fluxRating = 5) {
  return {
    tank: NOS.tankBase + NOS.tankPerFlux * fluxRating,
    refillMult: 0.8 + fluxRating * NOS.refillFluxScale,
  };
}

export function createNos(spec) {
  return { tank: spec.tank * NOS.startFill, max: spec.tank, refillMult: spec.refillMult, burning: false, burnTime: 0, sinceClean: 0, used: 0 };
}

/**
 * Advance the tank one step.
 * @param n state from createNos
 * @param {boolean} held NOS button held this step
 * @param {number} dt seconds
 * @param {{drifting?:boolean, airborne?:boolean, penalised?:boolean}} ev what happened this step
 * @returns {boolean} burning this step
 */
export function stepNos(n, held, dt, ev = {}) {
  const r = NOS.refill;
  n.sinceClean = ev.penalised ? 0 : n.sinceClean + dt;
  let gain = 0;
  if (ev.drifting) gain += r.driftPerSec * dt;
  if (ev.airborne) gain += r.airPerSec * dt;
  if (n.sinceClean >= r.cleanAfter) gain += r.cleanPerSec * dt;
  if (held && n.tank > 0 && (n.burning || n.tank >= NOS.minToStart)) {
    n.burning = true;
    n.tank = Math.max(0, n.tank - dt);
    n.burnTime += dt;
    n.used += dt;
    if (n.tank === 0) n.burning = false;
  } else {
    n.burning = false;
    n.burnTime = 0;
    n.tank = Math.min(n.max, n.tank + gain * n.refillMult);
  }
  return n.burning;
}

/** One-off refills: 'nearMiss' or 'canister'. */
export function addNos(n, kind) {
  const amt = NOS.refill[kind] || 0;
  n.tank = Math.min(n.max, n.tank + amt * n.refillMult);
}

/**
 * Speed while burning: extra thrust toward a raised cap, never above `ceiling` (the warp
 * ceiling, which the live-room and leaderboard bounds already allow).
 */
export function nosSpeed(speed, dt, topMph, ceiling) {
  const cap = Math.min(ceiling, topMph + NOS.capBonus);
  return speed >= cap ? speed : Math.min(cap, speed + NOS.thrust * dt);
}

/** 0..1 for the HUD gauge. */
export const nosFill = (n) => (n.max > 0 ? n.tank / n.max : 0);
