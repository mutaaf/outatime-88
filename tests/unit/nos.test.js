// NOS (ticket 0122): tank, burn, refill, speed cap and per-car balance.
import { describe, it, expect } from 'vitest';
import { NOS, nosFor, createNos, stepNos, addNos, nosSpeed, nosFill } from '../../src/nos.js';
import { CAR_SPECS, carParams } from '../../src/cars.js';

const DT = 1 / 120;
const steps = (n, held, sec, ev) => { let b = 0; for (let i = 0; i < Math.round(sec / DT); i++) if (stepNos(n, held, DT, ev)) b++; return b * DT; };

describe('tank and burn', () => {
  it('starts half full, burns one second of tank per second, then cuts out', () => {
    const n = createNos(nosFor(5));
    expect(nosFill(n)).toBeCloseTo(0.5);
    const burned = steps(n, true, 4);
    expect(burned).toBeCloseTo(n.max * 0.5, 1);
    expect(n.tank).toBe(0);
    expect(n.burning).toBe(false);
  });
  it('an almost-empty tank does not flicker on', () => {
    const n = createNos(nosFor(5));
    n.tank = NOS.minToStart * 0.5;
    expect(stepNos(n, true, DT)).toBe(false);
  });
  it('refills from drifting, airtime, near misses, canisters and clean driving — never while burning', () => {
    const n = createNos(nosFor(5));
    n.tank = 0;
    steps(n, false, 1, { drifting: true });
    expect(n.tank).toBeCloseTo(NOS.refill.driftPerSec, 2);
    const before = n.tank;
    addNos(n, 'nearMiss');
    addNos(n, 'canister');
    expect(n.tank).toBeCloseTo(before + NOS.refill.nearMiss + NOS.refill.canister, 5);
    n.tank = 1;
    steps(n, true, 0.5, { drifting: true });
    expect(n.tank).toBeCloseTo(0.5, 2);
    const m = createNos(nosFor(5));
    m.tank = 0;
    steps(m, false, 4.9);
    expect(m.tank).toBe(0); // clean bonus needs 5 s without a penalty
    steps(m, false, 2);
    expect(m.tank).toBeGreaterThan(0);
    steps(m, false, 1, { penalised: true });
    const after = m.tank;
    steps(m, false, 2);
    expect(m.tank).toBe(after); // a hit resets the clean timer
  });
  it('is deterministic', () => {
    const run = () => { const n = createNos(nosFor(7)); const out = []; for (let i = 0; i < 600; i++) { stepNos(n, i % 90 < 40, DT, { drifting: i % 50 < 10 }); out.push(n.tank); } return out; };
    expect(run()).toEqual(run());
  });
});

describe('speed', () => {
  it('adds thrust up to top speed + the bonus, never past the warp ceiling', () => {
    let v = 90;
    for (let i = 0; i < 240; i++) v = nosSpeed(v, DT, 98, 140);
    expect(v).toBeCloseTo(98 + NOS.capBonus, 5);
    let w = 130;
    for (let i = 0; i < 240; i++) w = nosSpeed(w, DT, 125, 134);
    expect(w).toBe(134);
  });
});

describe('balance', () => {
  it('a bigger tank comes from the FLUX rating, so it costs other stats', () => {
    expect(nosFor(8).tank).toBeGreaterThan(nosFor(5).tank);
    expect(nosFor(8).refillMult).toBeGreaterThan(nosFor(5).refillMult);
  });
  it('no car beats another at top speed, grip, launch, NOS and armour all at once', () => {
    const cars = Object.entries(CAR_SPECS).map(([id, spec]) => {
      const p = carParams({ id });
      const n = nosFor(spec.stats.flux);
      return { id, v: [p.topMphBonus, p.accelMult, p.gripMult, n.tank, p.maxHp] };
    });
    for (const a of cars) for (const b of cars) {
      if (a === b) continue;
      const dominates = a.v.every((x, i) => x >= b.v[i]) && a.v.some((x, i) => x > b.v[i]);
      expect(dominates, `${a.id} beats ${b.id} at everything`).toBe(false);
    }
  });
});
