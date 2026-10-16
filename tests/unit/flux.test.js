import { describe, it, expect } from 'vitest';
import { FLUX, passiveFluxRate, warpReady, boostOutcome, simulateSecondsToWarp } from '../../src/flux.js';

describe('earned warp pacing (ticket 0014)', () => {
  it('passive-only flux from a race start takes ≥ 15 s to fill at 88 mph', () => {
    const t = simulateSecondsToWarp({ speed: 88, extraPerSec: 0 });
    expect(t).toBeGreaterThanOrEqual(15);
  });

  it('skilled play (drifts, drafts, near-misses) still reaches a warp within ~25 s', () => {
    // ~30% of the time drifting plus a slipstream sling every ~8 s.
    const t = simulateSecondsToWarp({ speed: 92, extraPerSec: 0.3 * FLUX.gains.driftPerSec + FLUX.gains.draftSling / 8 });
    expect(t).toBeLessThanOrEqual(25);
  });

  it('a warp needs full flux, 88 mph and the cooldown to have elapsed', () => {
    expect(warpReady(100, 88, FLUX.warpCooldown)).toBe(true);
    expect(warpReady(99, 120, 99)).toBe(false);
    expect(warpReady(100, 87.9, 99)).toBe(false);
    expect(warpReady(100, 120, FLUX.warpCooldown - 0.1)).toBe(false);
  });

  it('boost is a nitro purge, not an instant warp, unless the meter is nearly full', () => {
    expect(boostOutcome(20)).toBe('none');
    expect(boostOutcome(FLUX.boostMin)).toBe('nitro');
    expect(boostOutcome(80)).toBe('nitro');
    expect(boostOutcome(FLUX.warpBoostMin)).toBe('warp');
  });

  it('incidental gains (coins, brushing traffic) pay far less than skill moves', () => {
    const g = FLUX.gains;
    for (const incidental of [g.coin, g.trafficNearMiss, g.obstacleSmash]) {
      expect(incidental).toBeLessThan(g.takedown / 2);
      expect(incidental).toBeLessThan(g.draftSling / 2);
    }
  });

  it('passive rate is slower below cruising speed and scales with the flux upgrade', () => {
    expect(passiveFluxRate(40, 1)).toBeLessThan(passiveFluxRate(80, 1));
    expect(passiveFluxRate(80, 3)).toBeGreaterThan(passiveFluxRate(80, 1));
  });
});
