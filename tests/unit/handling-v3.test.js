// Handling v3 (ticket 0131): friction circle, weight transfer, airborne yaw, walls, landings.
import { describe, it, expect } from 'vitest';
import { LATERAL, WALL, SETPIECE, TYRE, handlingFor, createLateral, stepLateral, wallContact, landingKeep } from '../../src/handling.js';

const DT = 1 / 120;
const base = { gripMult: 1, slipMult: 1, massKg: 1300 };
const sim = (steer, seconds, p, lt = createLateral(0)) => {
  const h = handlingFor(p.car || base);
  for (let i = 0; i < Math.round(seconds / DT); i++) stepLateral(lt, steer, DT, { h, ...p });
  return lt;
};

describe('friction circle', () => {
  it('hard braking in a bend leaves less grip to turn: the car runs wide', () => {
    // A bend taken at the limit: full lock at speed saturates the tyres.
    const coast = sim(1.25, 1.2, { speedMph: 120, curve: 1.6, use: 0 });
    const braking = sim(1.25, 1.2, { speedMph: 120, curve: 1.6, use: 0.9, braking: true });
    expect(braking.x).toBeLessThan(coast.x);
    expect(braking.slip).toBeGreaterThan(coast.slip);
  });
  it('the lateral grip never drops below its floor however hard the pedals work', () => {
    const lt = sim(1.25, 1, { speedMph: 150, use: 0.95, braking: true });
    const v = 150 / 88;
    const U = LATERAL.fwd * v;
    const grip = LATERAL.grip * (1 + LATERAL.downforce * v * v);
    // Overdriven this hard the tyres are sliding, so they give their slide level (v4 tyre curve).
    expect(U * Math.abs(lt.r)).toBeGreaterThanOrEqual(grip * LATERAL.circleFloor * (1 - TYRE.fall) * 0.98);
  });
  it('without `use` the old fixed brake/throttle factors still apply (older callers)', () => {
    // At the limit the old +8% brake bite shows; the circle with no pedal load gives plain grip.
    const a = sim(1.25, 1, { speedMph: 140, braking: true });
    const b = sim(1.25, 1, { speedMph: 140, braking: true, use: 0 });
    expect(a.slip).toBeLessThan(b.slip);
  });
  it('reports how much lateral grip is in use for the drivetrain', () => {
    const lt = sim(1.25, 1, { speedMph: 110 });
    expect(Math.abs(lt.load)).toBeGreaterThan(0.6);
    expect(Math.abs(lt.load)).toBeLessThanOrEqual(1);
    expect(sim(0, 1, { speedMph: 110 }).load).toBeCloseTo(0, 6);
  });
});

describe('weight transfer', () => {
  it('trail-braking rotates the car: sharper turn-in and the tail steps out', () => {
    const neutral = sim(0.5, 0.5, { speedMph: 70, use: 0 });
    const trail = sim(0.5, 0.5, { speedMph: 70, use: 0.4, braking: true });
    expect(trail.yaw - trail.heading).toBeGreaterThan(neutral.yaw - neutral.heading);
  });
  it('throttle out of a corner pushes a little', () => {
    const neutral = sim(0.4, 0.6, { speedMph: 60, use: 0 });
    const power = sim(0.4, 0.6, { speedMph: 60, use: 0.6, throttle: true });
    expect(power.x).toBeLessThan(neutral.x);
  });
});

describe('airborne', () => {
  it('steering does almost nothing with the wheels off the road', () => {
    const ground = sim(1, 0.5, { speedMph: 88 });
    const air = sim(1, 0.5, { speedMph: 88, airborne: true });
    expect(Math.abs(air.x)).toBeLessThan(Math.abs(ground.x) * 0.25);
  });
  it('the yaw rate you take off with carries through the air instead of self-aligning', () => {
    const lt = sim(1, 0.6, { speedMph: 88 });
    const r0 = lt.r;
    sim(0, 0.3, { speedMph: 88, airborne: true }, lt);
    expect(lt.r).toBeGreaterThan(r0 * 0.7);
    const grounded = sim(1, 0.6, { speedMph: 88 });
    sim(0, 0.3, { speedMph: 88 }, grounded);
    expect(grounded.r).toBeLessThan(lt.r * 0.2);
  });
  it('landing crooked costs speed; landing straight keeps it', () => {
    expect(landingKeep(0, 0, 0)).toBe(1);
    expect(landingKeep(0, 0, 0.4)).toBeCloseTo(1 - 0.4 * SETPIECE.landYaw, 6);
    expect(landingKeep(0, 0, -0.4)).toBe(landingKeep(0, 0, 0.4));
    expect(landingKeep(5, 1, 2)).toBeCloseTo(1 - SETPIECE.landMax, 6);
  });
});

describe('walls', () => {
  it('a hit bounces you off with restitution and knocks the nose away from the wall', () => {
    const lt = createLateral(0.72);
    lt.vx = 1.2; lt.r = 0.5;
    const lost = wallContact(lt, 1, 88, DT);
    expect(lt.vx).toBeCloseTo(-1.2 * WALL.restitution, 9);
    expect(lt.yawVel).toBeLessThan(0);
    expect(lt.r).toBeCloseTo(0.25, 9);
    expect(lost).toBeGreaterThan(3);
  });
  it('a harder hit scrubs more speed; the left wall mirrors the right', () => {
    const soft = createLateral(); soft.vx = 0.4;
    const hard = createLateral(); hard.vx = 1.4;
    const a = wallContact(soft, 1, 88, DT), b = wallContact(hard, 1, 88, DT);
    expect(b).toBeGreaterThan(a * 2.5);
    const left = createLateral(); left.vx = -1.4;
    expect(wallContact(left, -1, 88, DT)).toBeCloseTo(b, 9);
    expect(left.vx).toBeCloseTo(1.4 * WALL.restitution, 9);
    expect(left.yawVel).toBeGreaterThan(0);
  });
  it('grinding along a wall scrubs speed steadily; moving away from it is free', () => {
    const lt = createLateral(); lt.vx = 0;
    let lost = 0;
    for (let i = 0; i < 120; i++) lost += wallContact(lt, 1, 88, DT);
    expect(lost).toBeCloseTo(WALL.scrape, 6);
    const away = createLateral(); away.vx = -0.5;
    wallContact(away, 1, 88, DT);
    expect(away.vx).toBe(-0.5);
  });
});
