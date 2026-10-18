// Handling model (ticket 0120): organic steering and grip-limited lateral motion.
import { describe, it, expect } from 'vitest';
import { STEER, LATERAL, SETPIECE, steerLock, createSteer, stepSteer, handlingFor, createLateral, stepLateral, loopStep, landingKeep } from '../../src/handling.js';

const DT = 1 / 120;
const run = (st, digital, analog, seconds, mph = 60) => {
  const out = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) out.push(stepSteer(st, digital, analog, DT, mph));
  return out;
};

describe('steering from keys', () => {
  it('a tap is a small correction, not full lock', () => {
    const st = createSteer();
    const v = run(st, 1, 0, 0.06); // one ~60 ms key tap
    const peak = v[v.length - 1];
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.4 * steerLock(60));
  });
  it('holding builds smoothly to full lock in about a quarter second', () => {
    const st = createSteer();
    const v = run(st, 1, 0, 0.5);
    const lock = steerLock(60);
    const t90 = v.findIndex((x) => x >= 0.9 * lock) * DT;
    expect(t90).toBeGreaterThan(0.15);
    expect(t90).toBeLessThan(0.35);
    expect(v[v.length - 1]).toBeCloseTo(lock, 6);
    for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBeLessThanOrEqual(STEER.tapFloor * lock + 1e-9); // no jumps
  });
  it('releasing returns to centre quickly, and the opposite key counter-steers faster', () => {
    const a = createSteer();
    run(a, 1, 0, 0.5);
    const rel = run(a, 0, 0, 0.3);
    const tRel = rel.findIndex((x) => x === 0) * DT;
    const b = createSteer();
    run(b, 1, 0, 0.5);
    const ctr = run(b, -1, 0, 0.3);
    const tCtr = ctr.findIndex((x) => x <= 0) * DT;
    expect(tRel).toBeGreaterThan(0.05);
    expect(tRel).toBeLessThan(0.2);
    expect(tCtr).toBeLessThan(tRel);
  });
  it('lock shrinks with speed, and a power drift gives it back', () => {
    expect(steerLock(20)).toBeGreaterThan(0.95);
    expect(steerLock(88)).toBeLessThan(0.75);
    expect(steerLock(130)).toBeLessThan(steerLock(88));
    expect(steerLock(130, true)).toBe(1);
    const st = createSteer();
    run(st, 1, 0, 0.5, 40);
    const slow = st.value;
    run(st, 1, 0, 0.5, 120); // speeding up mid-turn eases the wheel back, never snaps
    expect(st.value).toBeLessThan(slow);
    expect(st.value).toBeCloseTo(steerLock(120), 6);
  });
  it('analog sources go through the same lock with almost no lag', () => {
    const st = createSteer();
    const v = run(st, 0, 1, 0.3, 88);
    expect(v[3]).toBeGreaterThan(0.5 * steerLock(88)); // within 4 steps (33 ms)
    expect(v[v.length - 1]).toBeCloseTo(steerLock(88), 2);
  });
  it('is deterministic', () => {
    const a = run(createSteer(), 1, 0, 0.4).concat(run(createSteer(), -1, 0.3, 0.4));
    const b = run(createSteer(), 1, 0, 0.4).concat(run(createSteer(), -1, 0.3, 0.4));
    expect(a).toEqual(b);
  });
});

describe('lateral motion (heading/yaw model, ticket 0120, v2)', () => {
  const base = { gripMult: 1, slipMult: 1, massKg: 1300 };
  const sim = (steer, seconds, p, lt = createLateral(0)) => {
    const h = handlingFor(p.car || base);
    for (let i = 0; i < Math.round(seconds / DT); i++) stepLateral(lt, typeof steer === 'function' ? steer(i * DT) : steer, DT, { h, ...p });
    return lt;
  };
  it('on a straight, full lock settles at a steady sideways speed, the car pointing where it goes', () => {
    const lt = sim(1, 2, { speedMph: 88 });
    expect(lt.vx).toBeCloseTo(LATERAL.latSpeed, 1);
    expect(lt.slip).toBe(0);
    expect(lt.heading).toBeCloseTo(Math.atan2(lt.vx, LATERAL.fwd), 6); // dx/dt = U·tan θ
    expect(lt.yaw).toBeGreaterThan(lt.heading); // nose a touch into the turn
    expect(lt.yaw).toBeLessThan(0.3);
  });
  it('sideways motion builds smoothly from the heading, with no jumps', () => {
    const lt = createLateral(0);
    const h = handlingFor(base);
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      stepLateral(lt, 1, DT, { h, speedMph: 88 });
      expect(lt.vx).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(lt.vx - prev).toBeLessThan(0.05);
      prev = lt.vx;
    }
  });
  it('an unsteered car runs wide in a bend; steering into it holds the line', () => {
    const wide = sim(0, 1, { speedMph: 88, curve: 1.15 });
    expect(wide.x).toBeLessThan(-0.15);
    expect(wide.heading).toBeLessThan(0); // pointing out of the bend relative to the road
    let lo = 0, hi = 1.25;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (sim(m, 2, { speedMph: 88, curve: 1.15 }).vx < 0) lo = m; else hi = m; }
    const held = sim(lo, 3, { speedMph: 88, curve: 1.15 });
    expect(Math.abs(held.vx)).toBeLessThan(0.01);
    expect(lo).toBeGreaterThan(0.05);
    expect(lo).toBeLessThan(steerLock(88));
  });
  it('the outward run grows with v², and banking cancels part of it', () => {
    const slow = sim(0, 1, { speedMph: 44, curve: 1 });
    const fast = sim(0, 1, { speedMph: 88, curve: 1 });
    expect(Math.abs(fast.x) / Math.abs(slow.x)).toBeGreaterThan(2.5);
    const banked = sim(0, 1, { speedMph: 88, curve: 1, bank: 0.25 });
    expect(Math.abs(banked.x)).toBeLessThan(Math.abs(fast.x) * 0.6);
  });
  it('the yaw rate is capped by grip: ask too much at speed and the car understeers (slip > 0)', () => {
    const ok = sim(1, 1, { speedMph: 70 });
    expect(ok.slip).toBe(0);
    const over = sim(1.25, 1, { speedMph: 150, drifting: true, car: { gripMult: 0.85, massKg: 2200 } });
    expect(over.slip).toBeGreaterThan(0);
    // Saturated: the lateral acceleration the tyres give never exceeds their grip.
    const h = handlingFor({ gripMult: 0.85, massKg: 2200 });
    const U = LATERAL.fwd * 150 / 88;
    const v = 150 / 88;
    expect(U * Math.abs(over.r)).toBeLessThanOrEqual(LATERAL.grip * h.grip * (1 + LATERAL.downforce * v * v) * LATERAL.driftGrip * 1.0001);
  });
  it('releasing the wheel straightens the car smoothly, with no zig-zag', () => {
    const lt = sim(1, 1, { speedMph: 88 });
    const xs = [];
    const h = handlingFor(base);
    for (let i = 0; i < 240; i++) { stepLateral(lt, 0, DT, { h, speedMph: 88 }); xs.push(lt.vx); }
    for (const v of xs) expect(v).toBeGreaterThanOrEqual(-1e-9); // never swings back across
    expect(Math.abs(xs[xs.length - 1])).toBeLessThan(0.01);
    expect(Math.abs(lt.yaw)).toBeLessThan(0.02);
  });
  it('a shove moves the travel heading at once and the body follows it', () => {
    const lt = createLateral(0);
    lt.vx = 1.5; // a contact impulse
    const h = handlingFor(base);
    stepLateral(lt, 0, DT, { h, speedMph: 88 });
    expect(lt.heading).toBeGreaterThan(0.1);
    expect(lt.yaw).toBeLessThan(lt.heading * 0.2); // body lags the shove
  });
  it('grippy light cars respond faster than heavy loose ones', () => {
    const quick = handlingFor({ gripMult: 1.12, slipMult: 0.8, massKg: 1100 });
    const heavy = handlingFor({ gripMult: 0.97, slipMult: 1.05, massKg: 2600 });
    expect(quick.tau).toBeLessThan(heavy.tau);
    const a = sim(1, 0.15, { speedMph: 88, car: { gripMult: 1.12, massKg: 1100 } });
    const b = sim(1, 0.15, { speedMph: 88, car: { gripMult: 0.97, massKg: 2600 } });
    expect(a.vx).toBeGreaterThan(b.vx);
  });
  it('a power drift breaks the rear loose: the tail steps out, and counter-steering swings it back', () => {
    const grip = sim(1, 1, { speedMph: 95, curve: 2.2 });
    const drift = sim(1, 1, { speedMph: 95, curve: 2.2, drifting: true });
    expect(drift.yaw - drift.heading).toBeGreaterThan(grip.yaw - grip.heading + 0.1);
    // A typical cornering drift reads as a slide, not a spin: about 15–18° of visible yaw.
    const deg = drift.yaw * 180 / Math.PI;
    expect(deg).toBeGreaterThan(14);
    expect(deg).toBeLessThan(20);
    const caught = sim(-0.5, 0.6, { speedMph: 95, curve: 2.2, drifting: true }, drift);
    expect(caught.yaw - caught.heading).toBeLessThan(0);
  });
  it('a parked car does not steer', () => {
    const lt = sim(1, 1, { speedMph: 0 });
    expect(lt.x).toBe(0);
  });
  it('is deterministic', () => {
    const go = () => sim((t) => Math.sin(t * 5), 3, { speedMph: 96, curve: 1.4, bank: 0.2, braking: true });
    expect(go()).toEqual(go());
  });
});

describe('set pieces', () => {
  it('a loop needs speed over the top; too slow peels you off', () => {
    expect(loopStep(80, {}, 0.5, DT).peel).toBe(false);
    expect(loopStep(50, {}, 0.5, DT).peel).toBe(true);
    expect(loopStep(50, {}, 0.1, DT).peel).toBe(false); // only upside down
    expect(loopStep(70, { minMph: 75 }, 0.5, DT).peel).toBe(true); // feature can demand more
  });
  it('gravity along a loop slows the climb and gives it back on the way down', () => {
    let v = 90;
    for (let i = 0; i < 120; i++) v += loopStep(v, {}, i / 120, DT).dv;
    expect(v).toBeCloseTo(90, 6);
    expect(loopStep(90, {}, 0.25, DT).dv).toBeLessThan(0);
    expect(loopStep(90, {}, 0.75, DT).dv).toBeGreaterThan(0);
  });
  it('landing straight keeps your speed; landing sideways costs up to a quarter', () => {
    expect(landingKeep(0, 0)).toBe(1);
    expect(landingKeep(0.8, 0.5)).toBeLessThan(0.9);
    expect(landingKeep(9, 1)).toBeCloseTo(1 - SETPIECE.landMax);
  });
});
