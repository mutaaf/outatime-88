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

describe('lateral motion', () => {
  const base = { gripMult: 1, slipMult: 1, massKg: 1300 };
  const sim = (steer, seconds, p) => {
    const lt = createLateral(0);
    const h = handlingFor(p.car || base);
    for (let i = 0; i < Math.round(seconds / DT); i++) stepLateral(lt, steer, DT, { h, ...p });
    return lt;
  };
  it('on a straight, full lock settles at a steady sideways speed with no jumps', () => {
    const lt = sim(1, 1, { speedMph: 88 });
    expect(lt.vx).toBeCloseTo(LATERAL.latSpeed, 2);
    expect(lt.slip).toBe(0);
  });
  it('a corner pulls you wide; steering into it holds the line', () => {
    const drift = sim(0, 1, { speedMph: 88, curve: 1.15 });
    expect(drift.x).toBeLessThan(-0.15);
    const lt = createLateral(0);
    const h = handlingFor(base);
    const hold = (LATERAL.corner * 1.15 * h.tau) / LATERAL.latSpeed;
    for (let i = 0; i < 240; i++) stepLateral(lt, hold, DT, { h, speedMph: 88, curve: 1.15 });
    expect(Math.abs(lt.vx)).toBeLessThan(0.01);
  });
  it('the pull grows with v², and too fast for the grip means sliding (slip > 0)', () => {
    const slow = sim(0, 0.5, { speedMph: 44, curve: 1 });
    const fast = sim(0, 0.5, { speedMph: 88, curve: 1 });
    expect(Math.abs(fast.x) / Math.abs(slow.x)).toBeGreaterThan(3);
    const over = sim(-1, 1, { speedMph: 130, curve: 4 }); // full lock into a hairpin at 130
    expect(over.slip).toBeGreaterThan(0);
    expect(over.x).toBeLessThan(-0.2); // still slides wide
    const ok = sim(-1, 1, { speedMph: 70, curve: 4 });
    expect(ok.slip).toBe(0);
  });
  it('banking cancels part of the pull', () => {
    const flat = sim(0, 1, { speedMph: 88, curve: 1 });
    const banked = sim(0, 1, { speedMph: 88, curve: 1, bank: 0.25 });
    expect(Math.abs(banked.x)).toBeLessThan(Math.abs(flat.x) * 0.6);
  });
  it('grippy light cars respond faster than heavy loose ones', () => {
    const quick = handlingFor({ gripMult: 1.12, slipMult: 0.8, massKg: 1100 });
    const heavy = handlingFor({ gripMult: 0.97, slipMult: 1.05, massKg: 2600 });
    expect(quick.tau).toBeLessThan(heavy.tau);
    const a = sim(1, 0.15, { speedMph: 88, car: { gripMult: 1.12, massKg: 1100 } });
    const b = sim(1, 0.15, { speedMph: 88, car: { gripMult: 0.97, massKg: 2600 } });
    expect(a.vx).toBeGreaterThan(b.vx);
  });
  it('a power drift loosens grip so the same corner slides', () => {
    const grip = sim(-1, 1, { speedMph: 95, curve: 2.2 });
    const drift = sim(-1, 1, { speedMph: 95, curve: 2.2, drifting: true });
    expect(grip.slip).toBe(0);
    expect(drift.slip).toBeGreaterThan(0);
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
