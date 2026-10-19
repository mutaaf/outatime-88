// TV mode wire format and steering (ticket 0175).
import { describe, it, expect } from 'vitest';
import { encodeInput, decodeInput, encodeHud, decodeHud, tapped, newer, wheelAngle, wheelSteer, createPadState, RATE, WHEEL } from '../../src/tv/proto.js';

describe('input frames', () => {
  it('round-trip compactly', () => {
    const f = encodeInput({ seq: 7, steer: -0.4567, gas: true, brake: false, nos: true, hover: false, boostN: 3, startN: 258, ms: 123.4, echo: 99, fitN: 1 });
    expect(JSON.stringify(f).length).toBeLessThan(40);
    expect(decodeInput(f)).toEqual({ seq: 7, steer: -0.457, gas: true, brake: false, nos: true, hover: false, boostN: 3, startN: 2, ms: 123, echo: 99, fitN: 1 });
  });
  it('clamp steering and reject junk', () => {
    expect(decodeInput(encodeInput({ seq: 1, steer: 9 })).steer).toBe(1);
    for (const bad of [null, 'x', [1, 2, 3], [0, 1]]) expect(decodeInput(bad)).toBeNull();
  });
  it('HUD frames round-trip', () => {
    const h = decodeHud(encodeHud({ mph: 88.6, hp: 42, hpMax: 120, coins: 15, status: 'PLAYING', rumbleN: 4, rumble: 'hit', ms: 5, echo: 6 }));
    expect(h).toEqual({ mph: 89, hp: 42, hpMax: 120, coins: 15, status: 'PLAYING', rumbleN: 4, rumble: 'hit', ms: 5, echo: 6 });
  });
});

describe('taps and sequence numbers', () => {
  it('a tap counter fires once per press, across the 8-bit wrap', () => {
    expect(tapped(null, 1)).toBe(false); // the first frame only sets the baseline
    expect(tapped(1, 1)).toBe(false);
    expect(tapped(1, 2)).toBe(true);
    expect(tapped(255, 0)).toBe(true);
    expect(tapped(5, 4)).toBe(false);
  });
  it('sequence numbers wrap', () => {
    expect(newer(5, 4)).toBe(true);
    expect(newer(4, 5)).toBe(false);
    expect(newer(0, 0xffffffff)).toBe(true);
    expect(newer(3, null)).toBe(true);
  });
});

describe('wheel steering', () => {
  it('uses beta held sideways and gamma upright', () => {
    expect(wheelAngle(10, 3, 90)).toBe(10);
    expect(wheelAngle(10, 3, 270)).toBe(-10);
    expect(wheelAngle(10, 3, 0)).toBe(3);
    expect(wheelAngle(10, 3, -90)).toBe(-10);
  });
  it('rests at zero, is gentle near centre and hits full lock at the range', () => {
    expect(wheelSteer(1, 0)).toBe(0);
    const small = wheelSteer(6, 0);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(6 / WHEEL.range); // expo: finer than linear near centre
    expect(wheelSteer(WHEEL.range, 0)).toBeCloseTo(1, 5);
    expect(wheelSteer(80, 0)).toBe(1);
    expect(wheelSteer(-80, 0)).toBe(-1);
    expect(wheelSteer(-170, 170)).toBeGreaterThan(0); // shortest way round
    expect(wheelSteer(20, 0, { invert: true })).toBeLessThan(0);
    expect(wheelSteer(10, 0, { sens: 2 })).toBeGreaterThan(wheelSteer(10, 0));
  });
});

describe('the TV side of a pad', () => {
  it('holds input through a hiccup, then lets go — never a stuck throttle', () => {
    const p = createPadState();
    p.take(decodeInput(encodeInput({ seq: 1, steer: 0.5, gas: true, boostN: 0, startN: 0 })), 1000);
    expect(p.live(1000 + RATE.staleMs - 1)).toMatchObject({ gas: true, steer: 0.5, stale: false });
    expect(p.live(1000 + RATE.staleMs + 1)).toMatchObject({ gas: false, steer: 0, stale: true, lost: false });
    expect(p.live(1000 + RATE.lostMs + 1).lost).toBe(true);
  });
  it('drops late frames and fires taps once', () => {
    const p = createPadState();
    p.take(decodeInput(encodeInput({ seq: 5, steer: 0, boostN: 1, startN: 0 })), 0);
    expect(p.take(decodeInput(encodeInput({ seq: 6, steer: 0, boostN: 2, startN: 0 })), 10).boost).toBe(true);
    expect(p.take(decodeInput(encodeInput({ seq: 4, steer: 1, boostN: 9, startN: 0 })), 20).boost).toBe(false); // late
    expect(p.s.steer).toBe(0);
    expect(p.take(decodeInput(encodeInput({ seq: 7, steer: 0, boostN: 2, startN: 1 })), 30)).toEqual({ boost: false, start: true, fit: false });
  });
});
