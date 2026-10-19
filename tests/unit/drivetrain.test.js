// Drivetrain (ticket 0131): gears, traction, brakes and the friction circle.
import { describe, it, expect } from 'vitest';
import { DRIVE, createDrive, stepDrive, gearFor, rpmFor, torqueAt, tractionLimit } from '../../src/drivetrain.js';

const DT = 1 / 120;
const drag = (v) => 0.00105 * v * v; // main.js applies aero drag on top
const ENGINE = 14 * 1.04; // FLUX COUPE on TURBO pace (the old flat rate)

function accelerate(from, to, { engine = ENGINE, grip = 1, lat = 0, cap = 140 } = {}) {
  const d = createDrive();
  let v = from, t = 0, maxSpin = 0;
  const shifts = [];
  while (v < to && t < 60) {
    const g = d.gear;
    v = stepDrive(d, { speed: v, throttle: true, brake: false, cap, engine, dt: DT, grip, lat });
    v = Math.max(18, v - drag(v) * DT);
    if (d.gear !== g) shifts.push(d.gear);
    maxSpin = Math.max(maxSpin, d.spin);
    t += DT;
  }
  return { t, maxSpin, shifts, d };
}

function brake(from, to, { grip = 1, lat = 0 } = {}) {
  const d = createDrive();
  let v = from, t = 0, ft = 0;
  while (v > to && t < 10) {
    v = stepDrive(d, { speed: v, throttle: false, brake: true, cap: 140, engine: ENGINE, dt: DT, grip, lat });
    v -= drag(v) * DT;
    ft += v * 1.4667 * DT;
    t += DT;
  }
  return { t, ft };
}

/** The flat model this replaced: +rate on throttle, −45 mph/s brakes. */
function legacyAccel(from, to, rate) {
  let v = from, t = 0;
  while (v < to && t < 60) { v = Math.min(140, v + rate * DT); v = Math.max(18, v - drag(v) * DT); t += DT; }
  return t;
}

describe('gearbox', () => {
  it('shifts up through all six gears on the old shift points, with no hunting', () => {
    const r = accelerate(18, 110);
    expect(r.shifts).toEqual([2, 3, 4, 5, 6]);
    expect(gearFor(30)).toBe(2);
    expect(gearFor(23, 2)).toBe(2); // hysteresis: just under 24 stays in 2nd
    expect(gearFor(19, 2)).toBe(1);
  });
  it('the tachometer climbs through each gear and drops on the shift', () => {
    expect(rpmFor(30, 2)).toBeLessThan(rpmFor(40, 2));
    expect(rpmFor(44, 3)).toBeLessThan(rpmFor(43, 2));
    expect(rpmFor(200, 6)).toBe(100);
  });
  it('torque peaks mid-band and eases at both ends', () => {
    expect(torqueAt(DRIVE.torque.peakAt)).toBeCloseTo(1, 6);
    expect(torqueAt(0)).toBeLessThan(1);
    expect(torqueAt(1)).toBeLessThan(1);
  });
  it('an upshift cuts the drive for a moment', () => {
    const d = createDrive();
    let v = 23.9;
    v = stepDrive(d, { speed: v, throttle: true, cap: 140, engine: ENGINE, dt: DT });
    v = stepDrive(d, { speed: 24.2, throttle: true, cap: 140, engine: ENGINE, dt: DT });
    expect(d.gear).toBe(2);
    expect(d.ax).toBe(0);
  });
});

describe('launch and acceleration', () => {
  it('pulls hardest in the low gears and keeps the old 18→88 time on every pace', () => {
    for (const pace of [0.75, 1]) {
      const rate = ENGINE * pace;
      const now = accelerate(18, 88, { engine: rate }).t;
      const old = legacyAccel(18, 88, rate);
      expect(Math.abs(now - old) / old).toBeLessThan(0.1);
      // …but it gets there by launching harder: 18→45 is quicker than the flat model.
      expect(accelerate(18, 45, { engine: rate }).t).toBeLessThan(legacyAccel(18, 45, rate));
    }
  });
  it('a launch is traction-limited: a strong engine spins its wheels, more grip puts it down', () => {
    const big = { engine: 30 };
    const loose = accelerate(18, 30, { ...big, grip: 0.85 });
    const grippy = accelerate(18, 30, { ...big, grip: 1.15 });
    expect(loose.maxSpin).toBeGreaterThan(0);
    expect(grippy.t).toBeLessThan(loose.t);
    expect(tractionLimit(1)).toBeCloseTo(DRIVE.traction * DRIVE.g, 6);
  });
  it('cornering hard leaves less grip to accelerate with (friction circle)', () => {
    expect(tractionLimit(1, 0.8)).toBeLessThan(tractionLimit(1, 0) * 0.65);
    const straight = accelerate(18, 30, { engine: 30 });
    const cornering = accelerate(18, 30, { engine: 30, lat: 0.8 });
    expect(cornering.t).toBeGreaterThan(straight.t);
    expect(cornering.maxSpin).toBeGreaterThan(straight.maxSpin);
  });
  it('never passes the cap, and the limiter eases you back above it', () => {
    const d = createDrive();
    let v = 60;
    for (let i = 0; i < 2400; i++) v = stepDrive(d, { speed: v, throttle: true, cap: 92, engine: 40, dt: DT });
    expect(v).toBe(92);
    v = stepDrive(d, { speed: 120, throttle: true, cap: 92, engine: 40, dt: DT });
    expect(v).toBeCloseTo(120 - DRIVE.limiter * DT, 6);
  });
});

describe('brakes', () => {
  it('stop harder at speed (downforce, weight transfer): braking distance grows slower than v²', () => {
    const fast = brake(88, 20), slow = brake(44, 20);
    expect(fast.t).toBeLessThan(1.6);
    expect(fast.ft).toBeLessThan(130);
    const decelFast = (88 - 20) / fast.t, decelSlow = (44 - 20) / slow.t;
    expect(decelFast).toBeGreaterThan(decelSlow);
  });
  it('bite progressively over the first few steps rather than all at once', () => {
    const d = createDrive();
    stepDrive(d, { speed: 88, brake: true, cap: 140, engine: ENGINE, dt: DT });
    const first = -d.ax;
    for (let i = 0; i < 20; i++) stepDrive(d, { speed: 88, brake: true, cap: 140, engine: ENGINE, dt: DT });
    expect(first).toBeLessThan(-d.ax * 0.3);
  });
  it('braking mid-corner stops you less (the tyres are busy turning)', () => {
    expect(brake(88, 20, { lat: 0.85 }).ft).toBeGreaterThan(brake(88, 20).ft * 1.3);
  });
  it('never stop you below 18 mph, as before', () => {
    const d = createDrive();
    let v = 30;
    for (let i = 0; i < 600; i++) v = stepDrive(d, { speed: v, brake: true, cap: 140, engine: ENGINE, dt: DT });
    expect(v).toBe(DRIVE.brakeFloor);
  });
});

describe('off throttle and in the air', () => {
  it('lifting off slows you by engine braking (more in low gears), not a −18 mph/s cliff', () => {
    const d = createDrive();
    d.gear = 5;
    stepDrive(d, { speed: 90, throttle: false, cap: 140, engine: ENGINE, dt: DT });
    expect(-d.ax).toBeLessThan(6);
    const low = createDrive();
    stepDrive(low, { speed: 30, throttle: false, cap: 140, engine: ENGINE, dt: DT });
    expect(-low.ax).toBeGreaterThan(-d.ax);
  });
  it('airborne: no drive, no brakes, no grip used', () => {
    const d = createDrive();
    const v = stepDrive(d, { speed: 80, throttle: true, brake: false, cap: 140, engine: ENGINE, dt: DT, airborne: true });
    expect(v).toBe(80);
    stepDrive(d, { speed: 80, brake: true, cap: 140, engine: ENGINE, dt: DT, airborne: true });
    expect(d.ax).toBe(0);
    expect(d.use).toBe(0);
  });
  it('is deterministic', () => {
    const a = accelerate(18, 100), b = accelerate(18, 100);
    expect(a.t).toBe(b.t);
    expect(a.d).toEqual(b.d);
  });
});

describe('analog pedals (ticket 0183)', () => {
  it('half throttle pulls about half as hard; full or unset is the old full press', () => {
    const full = createDrive(), half = createDrive(), unset = createDrive();
    stepDrive(full, { speed: 50, throttle: true, cap: 140, engine: ENGINE, dt: DT, throttleAmt: 1 });
    stepDrive(half, { speed: 50, throttle: true, cap: 140, engine: ENGINE, dt: DT, throttleAmt: 0.5 });
    stepDrive(unset, { speed: 50, throttle: true, cap: 140, engine: ENGINE, dt: DT });
    expect(half.ax).toBeCloseTo(full.ax / 2, 6);
    expect(unset.ax).toBe(full.ax);
  });
  it('feathering the throttle on a launch keeps the wheels from spinning', () => {
    const strong = ENGINE * 3;
    const flat = createDrive(), feather = createDrive();
    stepDrive(flat, { speed: 5, throttle: true, cap: 140, engine: strong, dt: DT, throttleAmt: 1 });
    stepDrive(feather, { speed: 5, throttle: true, cap: 140, engine: strong, dt: DT, throttleAmt: 0.4 });
    expect(flat.spin).toBeGreaterThan(0);
    expect(feather.spin).toBeLessThan(flat.spin);
  });
  it('a light brake bites less, and easing off releases at once', () => {
    const hard = createDrive(), light = createDrive();
    for (let i = 0; i < 30; i++) {
      stepDrive(hard, { speed: 80, brake: true, cap: 140, engine: ENGINE, dt: DT, brakeAmt: 1 });
      stepDrive(light, { speed: 80, brake: true, cap: 140, engine: ENGINE, dt: DT, brakeAmt: 0.3 });
    }
    expect(light.brake).toBeCloseTo(0.3, 6);
    expect(-light.ax).toBeCloseTo(-hard.ax * 0.3, 4);
    stepDrive(hard, { speed: 80, brake: true, cap: 140, engine: ENGINE, dt: DT, brakeAmt: 0.2 });
    expect(hard.brake).toBe(0.2);
  });
});
