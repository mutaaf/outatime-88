// Rival racing AI (ticket 0160): corners, passes, NOS, loops, the tier ramp and determinism.
import { describe, it, expect } from 'vitest';
import { AI, aiTier, driverProfile, createBrain, rampBrain, cornerMph, createAiWorld, stepRival, pickNemesis } from '../../src/rival-ai.js';

const DT = 1 / 120;
const S2W = 125; // sim Z per mph·s (11000 / 88 at pace 1)

function car(z, offset = 0, mph = 80) {
  return { worldZ: z, offset, vx: 0, mph, halfW: 0.14, halfL: 115, progress: 0, finishTime: null, takenDown: false };
}
function brainFor(cls, { pace = 80, seed = 7, grip = 1 } = {}) {
  return createBrain(driverProfile(cls, seed), { seed, pace, carP: { gripMult: grip, accelMult: 1, topMphBonus: 0 } });
}
function world({ curve = () => 0, bank = () => 0, feature = () => null, tier = 0 } = {}) {
  const w = createAiWorld();
  w.curvatureAt = curve; w.bankAt = bank; w.featureAt = feature; w.lineAt = () => 0;
  w.speedToWorld = S2W; w.tier = tier;
  return w;
}
/** Advance the same way the game's world step does: integrate, damp vx, clamp at the walls. */
function integrate(r) {
  r.offset += r.vx * DT;
  r.vx *= 1 - 5.2 * DT;
  r.worldZ += r.mph * S2W * DT;
  if (Math.abs(r.offset) > 0.72) { r.offset = Math.sign(r.offset) * 0.72; r.vx = 0; }
}
function run(w, cars, brains, seconds, each) {
  for (let n = 0; n < seconds / DT; n++) {
    w.time = n * DT;
    for (let i = 0; i < brains.length; i++) if (brains[i]) stepRival(cars[i], brains[i], w, 0, DT);
    for (const c of cars) integrate(c);
    if (each) each(n);
  }
}

const HAIRPIN = (z) => (z > 30000 && z < 38000 ? 2.6 : 0);

describe('rival AI: corners', () => {
  it('a corner speed limit only exists for real bends, and grip and nerve raise it', () => {
    expect(cornerMph(0, 0, 1, 0.5)).toBe(Infinity);
    const novice = cornerMph(2.6, 0, 1, AI.nerve[0]);
    const ace = cornerMph(2.6, 0, 1, AI.nerve[1]);
    expect(novice).toBeLessThan(ace);
    expect(cornerMph(2.6, 0, 1.3, AI.nerve[0])).toBeGreaterThan(novice);
    expect(cornerMph(2.2, 0.9, 1, AI.nerve[0])).toBeGreaterThan(cornerMph(2.2, 0, 1, AI.nerve[0])); // banking helps
  });

  it('brakes before a hairpin (not in it) and stays on the road at every tier', () => {
    for (const tier of [0, 0.5, 1]) {
      const w = world({ curve: HAIRPIN, tier });
      const r = car(1000, 0, 125);
      const b = brainFor('TANK', { pace: 130 });
      let atEntry = null, peak = 0, worstX = 0;
      run(w, [r], [b], 40, () => {
        if (r.worldZ < 30000) peak = Math.max(peak, r.mph);
        if (atEntry == null && r.worldZ >= 30000) atEntry = r.mph;
        worstX = Math.max(worstX, Math.abs(r.offset));
      });
      const limit = cornerMph(2.6, 0, 1, AI.nerve[0] + (AI.nerve[1] - AI.nerve[0]) * b.skill);
      expect(atEntry).toBeLessThan(peak - 3);       // slowed down on the approach
      expect(atEntry).toBeLessThanOrEqual(limit + 2); // already at the corner's speed at the turn-in
      expect(worstX).toBeLessThan(0.72);
    }
  });

  it('an ace carries more speed through the hairpin than a novice', () => {
    const through = (tier) => {
      const w = world({ curve: HAIRPIN, tier });
      const r = car(1000, 0, 95);
      const b = brainFor('TANK', { pace: 110 });
      let min = Infinity;
      run(w, [r], [b], 40, () => { if (r.worldZ > 30000 && r.worldZ < 38000) min = Math.min(min, r.mph); });
      return min;
    };
    expect(through(1)).toBeGreaterThan(through(0) + 5);
  });

  it('cuts toward the inside of a bend (right-hander → right side)', () => {
    const w = world({ curve: (z) => (z > 6000 ? 1.6 : 0), tier: 1 });
    const r = car(1000, 0, 80);
    const b = brainFor('GRIP TUNER');
    run(w, [r], [b], 6);
    expect(r.offset).toBeGreaterThan(0.08);
  });
});

describe('rival AI: racecraft', () => {
  it('passes a slower car without touching it', () => {
    const w = world({ tier: 0.6 });
    const slow = car(4000, 0, 55);
    const r = car(1000, 0, 80);
    const b = brainFor('GRIP TUNER', { pace: 92 });
    w.cars.push(r, slow);
    let touched = false;
    run(w, [r, slow], [b, null], 25, () => {
      if (Math.abs(r.worldZ - slow.worldZ) < r.halfL + slow.halfL && Math.abs(r.offset - slow.offset) < r.halfW + slow.halfW) touched = true;
    });
    expect(r.worldZ).toBeGreaterThan(slow.worldZ + 300);
    expect(touched).toBe(false);
    expect(b.stats.passes).toBeGreaterThanOrEqual(1);
    expect(b.lastPass).toBe(slow);
  });

  it('swings round a hazard on its line', () => {
    const w = world({ tier: 0.3 });
    const cone = { worldZ: 9000, offset: 0, halfW: 0.12, halfL: 40 };
    w.hazards.push(cone);
    const r = car(1000, 0, 80);
    const b = brainFor('ALL-ROUNDER');
    let hit = false;
    run(w, [r], [b], 6, () => { if (Math.abs(r.worldZ - cone.worldZ) < 155 && Math.abs(r.offset) < 0.27) hit = true; });
    expect(hit).toBe(false);
  });

  it('burns NOS when it is behind on a straight, and the tank runs down and refills', () => {
    const w = world({ tier: 0.5 });
    const r = car(1000, 0, 70);
    const b = brainFor('DRAG KING', { pace: 80 });
    let used = false, maxMph = 0;
    for (let n = 0; n < 8 / DT; n++) {
      w.time = n * DT;
      stepRival(r, b, w, -600, DT); // well behind the player
      integrate(r);
      used = used || r.nosActive;
      maxMph = Math.max(maxMph, r.mph);
    }
    expect(used).toBe(true);
    expect(b.stats.nos).toBeGreaterThan(0);
    expect(maxMph).toBeGreaterThan(80 + AI.tierPace * 0.5 + 5);
    expect(b.nosTank).toBeGreaterThanOrEqual(0);
  });

  it('drafts a car ahead when there is no room to pass', () => {
    const w = world({ tier: 0.5 });
    const lead = car(2000, 0, 80);
    const wallL = car(1700, -0.36, 80), wallR = car(1700, 0.36, 80); // boxed in either side
    const r = car(1000, 0, 80);
    const b = brainFor('ALL-ROUNDER', { pace: 82 });
    w.cars.push(r, lead, wallL, wallR);
    let drafted = false;
    run(w, [r, lead, wallL, wallR], [b, null, null, null], 3, () => { drafted = drafted || b.drafting; });
    expect(drafted).toBe(true);
  });

  it('meets a loop at its entry speed and never falls off', () => {
    const loop = { kind: 'LOOP', z0: 20000, length: 9425, minMph: 40 };
    const w = world({ feature: (z) => (z >= loop.z0 && z < loop.z0 + loop.length ? loop : null), tier: 0 });
    const r = car(1000, 0, 45);
    const b = brainFor('TANK', { pace: 50 });
    let inLoopMin = Infinity;
    run(w, [r], [b], 30, () => { if (r.worldZ > loop.z0 && r.worldZ < loop.z0 + loop.length) inLoopMin = Math.min(inLoopMin, r.mph); });
    expect(b.mistakeKind).not.toBe('peel');
    expect(inLoopMin).toBeGreaterThanOrEqual(40);
  });
});

describe('rival AI: progression', () => {
  it('the tier climbs with level and wave, and an explicit difficulty wins', () => {
    let prev = -1;
    for (let level = 0; level < 5; level++) for (let wave = 1; wave < 12; wave += 3) {
      const t = aiTier({ level, wave });
      expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1);
      if (wave === 1) { expect(t).toBeGreaterThan(prev); prev = t; }
    }
    expect(aiTier({ level: 0, wave: 1 })).toBeLessThan(aiTier({ level: 0, wave: 10 }));
    expect(aiTier({ difficulty: 0.8, level: 0 })).toBe(0.8);
  });

  it('skill, aggression, consistency and NOS craft never drop as the tier rises', () => {
    for (const cls of ['TANK', 'RAMMER', 'GRIP TUNER', 'GLASS CANNON']) {
      const b = brainFor(cls);
      let last = null;
      for (let t = 0; t <= 1.0001; t += 0.1) {
        rampBrain(b, t);
        const now = [b.skill, b.aggression, b.consistency, b.nosCraft];
        if (last) now.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(last[i] - 1e-9));
        last = now;
      }
    }
  });

  it('mistakes get rarer as the tier rises', () => {
    const count = (tier) => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const w = world({ curve: (z) => (Math.floor(z / 9000) % 2 ? 1.6 : 0), tier });
        const r = car(1000, 0, 80);
        const b = brainFor('RAMMER', { seed });
        run(w, [r], [b], 30);
        n += b.stats.mistakes;
      }
      return n;
    };
    expect(count(1)).toBeLessThan(count(0));
  });

  it('picks the most aggressive rival as the nemesis and sharpens it', () => {
    const brains = ['GRIP TUNER', 'RAMMER', 'TANK'].map((c, i) => brainFor(c, { seed: i + 1 }));
    const i = pickNemesis(brains, 80);
    expect(i).toBe(1);
    expect(brains[1].nemesis).toBe(true);
    rampBrain(brains[1], 0.2); rampBrain(brains[0], 0.2);
    expect(brains[1].aggression).toBeGreaterThan(brains[0].aggression);
  });
});

describe('rival AI: determinism and footprint', () => {
  const scenario = (seed) => {
    const w = world({ curve: (z) => Math.sin(z / 7000) * 1.4, tier: 0.4 });
    const cars = [car(1000, -0.3, 70), car(1600, 0.3, 75), car(2600, 0, 60)];
    const brains = cars.map((_, i) => brainFor(['RAMMER', 'DRIFTER', 'TANK'][i], { seed: seed + i }));
    w.cars.push(...cars);
    run(w, cars, brains, 40);
    return { cars: cars.map((c) => [c.worldZ, c.offset, c.mph]), stats: brains.map((b) => b.stats) };
  };

  it('the same seed gives the same race', () => {
    expect(scenario(42)).toEqual(scenario(42));
  });

  it('a step allocates no new state: the brain keeps its shape over a long run', () => {
    const w = world({ curve: HAIRPIN, tier: 0.5 });
    const r = car(1000, 0, 80);
    const b = brainFor('LAUNCHER');
    run(w, [r], [b], 2);
    const keys = Object.keys(b).length;
    const stats = b.stats;
    run(w, [r], [b], 60);
    expect(Object.keys(b).length).toBe(keys);
    expect(b.stats).toBe(stats);
    expect(w.cars.length).toBe(0);
  });
});
