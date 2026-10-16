// Flux-meter pacing (pillar 2, ticket 0014): the 88 mph warp is a climax you earn.
// Pure rules so the balance is testable; main.js applies them each frame.

export const FLUX = {
  start: 20,           // meter at the green light
  passiveFast: 3.2,    // %/s while above cruising speed
  passiveSlow: 0.9,    // %/s below it
  cruiseMph: 65,
  warpCooldown: 12,    // s between warps
  boostMin: 35,        // a boost needs at least this much flux…
  boostCost: 30,       // …and spends this much
  warpBoostMin: 92,    // boosting with a nearly-full meter fires the warp itself
  // Every other way to earn flux, in one place. Skill moves pay; things that happen just by
  // holding the gas (driving through coins, brushing traffic) pay little.
  gains: {
    coin: 4,
    plutonium: 10,
    trafficNearMiss: 5,
    rivalNearMiss: 6,
    obstacleSlide: 8,
    obstacleSmash: 6,
    streakPerDodge: 3,
    takedown: 22,
    driftPerSec: 12,
    boosterPadPerSec: 6,
    draftSling: 18,
    skyLoop: 20,
    airTrickPerTrick: 10,
    barrelRoll: 15,
  },
};

export function passiveFluxRate(speedMph, fluxUpgrade = 1) {
  const base = speedMph > FLUX.cruiseMph ? FLUX.passiveFast : FLUX.passiveSlow;
  return base * (1 + (fluxUpgrade - 1) * 0.25);
}

export function warpReady(flux, speedMph, secondsSinceLastWarp) {
  return flux >= 100 && speedMph >= 88 && secondsSinceLastWarp >= FLUX.warpCooldown;
}

/** What pressing boost does at this meter level: 'warp' | 'nitro' | 'none'. */
export function boostOutcome(flux) {
  if (flux >= FLUX.warpBoostMin) return 'warp';
  if (flux >= FLUX.boostMin) return 'nitro';
  return 'none';
}

/** Seconds from a race start until the meter is full, at a steady speed and bonus rate. */
export function simulateSecondsToWarp({ speed, extraPerSec = 0, fluxUpgrade = 1, dt = 0.05 }) {
  let flux = FLUX.start;
  let t = 0;
  while (flux < 100 && t < 600) {
    flux = Math.min(100, flux + (passiveFluxRate(speed, fluxUpgrade) + extraPerSec) * dt);
    t += dt;
  }
  return t;
}
