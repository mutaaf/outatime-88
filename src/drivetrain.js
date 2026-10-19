// Drivetrain (ticket 0131): how throttle and brake become forward speed.
//
// Pure and deterministic, like src/handling.js: main.js calls stepDrive() once per 120 Hz step
// and reads the new speed back. Aero drag and slope gravity stay in main.js (they act on the
// car whatever the pedals do); this module owns what the pedals do.
//
// Why: speed used to change at a flat rate: +N mph/s on throttle in every gear, −45 mph/s on
// the brake at any speed, −18 mph/s off throttle. That reads as a cursor too. A car pulls
// hardest in the low gears, feels each upshift, can only put down what its tyres grip, brakes
// harder at speed (downforce, weight on the front), and the tyres share one grip budget
// between cornering and pedals (the friction circle).
//
// Model, mph and seconds:
//   - Six gears on the old shift points. Wheel thrust = engine rate × gear ratio × torque
//     curve across the gear's rev band; a short torque cut on every upshift.
//   - Traction limit μ·g·grip, shrunk by the share of grip cornering is using. Asking for
//     more spins the wheels (`spin`), which the renderers can smoke and the audio can scream.
//   - Brakes ramp in over ~70 ms (weight moving forward), then decelerate by a base plus an
//     aero term ∝ v², shrunk by cornering load: braking mid-corner stops you less.
//   - Off throttle: engine braking by gear plus rolling resistance (no more −18 mph/s cliff).
//   - Over the cap (top speed, a warp ending) the limiter eases you back as before.
// Calibrated so 18→88 mph takes the same time as the flat model on every pace setting (the
// race clock, medals and the server's bounds were tuned on it); the launch is punchier and
// the top end longer instead.

export const DRIVE = {
  shift: [0, 24, 44, 64, 82, 102, 140],          // mph where each gear starts (and the box tops out)
  ratio: [1.4, 1.22, 1.12, 1.08, 1.06, 1.04],      // wheel thrust per gear vs the engine rate
  torque: { low: 0.92, peakAt: 0.55, red: 0.94 }, // shape across a gear's rev band (peak = 1)
  shiftCut: 0.08,     // s of no drive on an upshift
  hyst: 4,            // mph under a gear's start before it drops back (no gear hunting)
  g: 21.94,           // 1 g in mph/s
  traction: 1.05,     // tyre μ for launches at grip 1 (rating 5)
  roll: 0.6,          // rolling resistance off throttle, mph/s (on throttle it's in the engine rate)
  engineBrake: [8, 6.5, 5, 4.2, 3.6, 3.1],       // lift-off decel by gear, mph/s
  brake: 36,          // mph/s of braking at a crawl at grip 1 …
  brakeAero: 18,      // … plus this × (v/88)² from downforce and weight transfer
  brakeRamp: 0.07,    // s for the brakes to bite fully
  brakeFloor: 18,     // the brake never stops you below this (the old rule)
  cornerKeep: 0.45,   // braking never drops below this share however hard you corner
  limiter: 14,        // mph/s the limiter eases you back over the cap
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Gear (1..6) for a speed, on the old shift points; pass the current gear for hysteresis. */
export function gearFor(mph, current = 0) {
  if (!current) {
    let g = 1;
    for (let i = 1; i <= 6; i++) if (mph >= DRIVE.shift[i - 1]) g = i;
    return g;
  }
  let g = current;
  while (g < 6 && mph >= DRIVE.shift[g]) g++;
  while (g > 1 && mph < DRIVE.shift[g - 1] - DRIVE.hyst) g--;
  return g;
}

/** Rev-band position 0..1 inside the gear. */
export function revFrac(mph, gear) {
  const lo = DRIVE.shift[gear - 1], hi = DRIVE.shift[gear];
  return clamp((mph - lo) / Math.max(1, hi - lo), 0, 1);
}

/** The tachometer, 18..100 (the HUD's old scale). */
export function rpmFor(mph, gear) {
  return Math.min(100, Math.max(18, revFrac(mph, gear) * 82 + 18));
}

/** Torque curve 0..1 across the rev band: soft at the bottom, peak mid-band, easing at the red line. */
export function torqueAt(f) {
  const T = DRIVE.torque;
  if (f <= T.peakAt) return T.low + (1 - T.low) * Math.sin((f / T.peakAt) * Math.PI / 2);
  return 1 - (1 - T.red) * ((f - T.peakAt) / (1 - T.peakAt)) ** 2;
}

/** Most longitudinal acceleration the tyres can take (mph/s), with cornering using `lat` of it. */
export function tractionLimit(grip = 1, lat = 0) {
  const l = clamp(Math.abs(lat), 0, 0.95);
  return DRIVE.traction * DRIVE.g * grip * Math.sqrt(1 - l * l);
}

export function createDrive() {
  return { gear: 1, cut: 0, brake: 0, ax: 0, spin: 0, use: 0 };
}

/**
 * One step of the pedals (mutates `d`, returns the new speed in mph).
 * @param {{gear:number,cut:number,brake:number,ax:number,spin:number,use:number}} d
 * @param {object} i
 * @param {number} i.speed mph now
 * @param {boolean} i.throttle
 * @param {boolean} i.brake (wins over throttle, as before)
 * @param {number} i.cap the speed the engine may push you to (top speed, warp, booster)
 * @param {number} i.engine the car's engine rate, mph/s (the old flat accel rate)
 * @param {number} i.dt
 * @param {number} [i.grip=1] the car's grip multiplier (handlingFor().grip)
 * @param {number} [i.lat=0] share of grip cornering is using (stepLateral's `load`)
 * @param {boolean} [i.airborne] wheels off the road: no drive, no brakes, no engine braking
 * @param {number} [i.throttleAmt=1] how far the throttle is pressed, 0..1 (gamepad RT; keys are 1)
 * @param {number} [i.brakeAmt=1] how hard the brake is pressed, 0..1 (gamepad LT; keys are 1)
 */
export function stepDrive(d, i) {
  const v = Math.max(0, i.speed);
  const dt = i.dt;
  const grip = i.grip || 1;
  const lat = clamp(Math.abs(i.lat || 0), 0, 0.95);
  const g = gearFor(v, d.gear);
  if (g > d.gear) d.cut = DRIVE.shiftCut;
  d.gear = g;
  d.spin = 0;
  let s;
  if (i.airborne) {
    d.brake = 0;
    s = v;
  } else if (i.brake) {
    // Analog pedals (ticket 0180): the brakes bite up to how hard you press, at the same rate.
    const want = i.brakeAmt == null ? 1 : clamp(i.brakeAmt, 0, 1);
    d.brake = d.brake < want ? Math.min(want, d.brake + dt / DRIVE.brakeRamp) : want;
    const vv = v / 88;
    const keep = Math.max(DRIVE.cornerKeep, Math.sqrt(1 - lat * lat));
    const decel = (DRIVE.brake + DRIVE.brakeAero * vv * vv) * grip * keep * d.brake;
    s = Math.max(DRIVE.brakeFloor, v - decel * dt);
  } else {
    d.brake = 0;
    if (i.throttle && v < i.cap) {
      const amt = i.throttleAmt == null ? 1 : clamp(i.throttleAmt, 0, 1);
      let thrust = d.cut > 0 ? 0 : i.engine * DRIVE.ratio[g - 1] * torqueAt(revFrac(v, g)) * amt;
      const limit = tractionLimit(grip, lat);
      if (thrust > limit) { d.spin = (thrust - limit) / limit; thrust = limit; }
      s = Math.min(i.cap, v + thrust * dt);
    } else if (i.throttle) {
      s = Math.max(i.cap, v - DRIVE.limiter * dt);
    } else {
      s = Math.max(0, v - (DRIVE.engineBrake[g - 1] + DRIVE.roll) * dt);
    }
  }
  if (d.cut > 0) d.cut = Math.max(0, d.cut - dt);
  d.ax = (s - v) / dt;
  // Share of the tyres' longitudinal grip in use, for the lateral friction circle.
  d.use = i.airborne ? 0 : clamp(Math.abs(d.ax) / tractionLimit(grip, 0), 0, 0.9);
  return s;
}
