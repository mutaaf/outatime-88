// Handling (ticket 0120): how input becomes steering, and steering becomes lateral motion.
//
// Pure and deterministic. Same inputs and step size always give the same result, with no
// randomness or wall clock, so ghosts, live rooms and the server's checks stay valid. main.js
// calls stepSteer() then stepLateral() once per 120 Hz simulation step.
//
// Why: keyboard steering used to be binary. A key press set full lock instantly and the car
// slid sideways at a fixed rate like a cursor, with no feel for speed, weight or grip.
//
// Steering model:
//   - Keys ramp toward lock. A tap gives a small correction; holding builds to full lock.
//   - Release returns quickly to centre; the opposite key counter-steers faster still.
//   - Analog sources (touch stick, gamepad, tilt, mouse wheel) are lightly smoothed and go
//     through the same speed-sensitive lock, so every input feels like the same car.
//   - Lock shrinks with speed: twitchy at a crawl would be fine, at 120 mph it is not.
//
// Lateral model (road frame, x in half-road widths, ±0.72 is the wall):
//   - Steering asks for a lateral velocity. The tyres supply the acceleration to reach it,
//     limited by grip, which grows with downforce and shifts with braking/throttle.
//   - Corners pull the car outward with a force ∝ curvature · v², and banking cancels part
//     of it. Holding the line takes steering into the corner; if that asks the tyres for
//     more than their grip they saturate, the car slides wide, and `slip` says by how much.
//   - Heavier cars respond more slowly; grippier cars respond faster and hold more.

export const STEER = {
  rampIn: 4.2,        // lock per second while a key is held (≈0.22 s to full lock)
  tapFloor: 0.12,     // the first step of a press jumps to at least this, so taps register
  returnRate: 8,    // lock per second back to centre on release
  counterRate: 13,    // lock per second when the opposite key is pressed
  analogTau: 0.03,    // s; smoothing on analog sources (well under a frame of latency at 60 fps)
  lockMph: 105,       // speed where lock has fallen to lockHigh
  lockHigh: 0.62,     // fraction of full lock left at lockMph
  driftLock: 1.0,     // in a power drift you get full lock back to swing the tail
  max: 1.25,          // analog sources may reach slightly past 1 (touch stick overdrive)
};

export const LATERAL = {
  latSpeed: 1.35,     // half-widths/s asked for at full lock at 88 mph
  lowSpeedFloor: 0.5, // fraction of latSpeed still available at a crawl
  tau: 0.09,          // s; response time of a 1300 kg car with grip rating 5
  grip: 9.5,          // half-widths/s² the tyres can supply (grip rating 5, no downforce)
  downforce: 0.22,    // extra grip fraction at 88 mph (∝ v²)
  brakeGrip: 1.08,    // weight forward: more front bite while braking
  throttleGrip: 0.97, // weight back: slightly less turn-in on throttle
  driftGrip: 0.62,    // a power drift breaks the rear loose
  driftLat: 1.15,     // …and lets the car swing across the road a little faster
  corner: 3.0,        // outward pull per unit of road curve at 88 mph (half-widths/s²)
  bankRelief: 2.2,    // fraction of the pull a bank cancels, per unit of bank (capped)
  bankMax: 0.6,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Fraction of full steering lock available at this speed. */
export function steerLock(speedMph, drifting = false) {
  if (drifting) return STEER.driftLock;
  const s = Math.max(0, speedMph) / STEER.lockMph;
  const k = 1 / STEER.lockHigh - 1;
  return 1 / (1 + k * s * s);
}

export function createSteer() {
  return { value: 0 };
}

/**
 * Advance the steering wheel one step.
 * @param {{value:number}} st mutable steering state
 * @param {number} digital -1, 0 or 1 from keys / d-pad
 * @param {number} analog -1.25..1.25 from stick, tilt, wheel (0 when idle)
 * @param {number} dt step in seconds
 * @param {number} speedMph
 * @param {boolean} [drifting]
 * @returns {number} the new steering value (-1.25..1.25)
 */
export function stepSteer(st, digital, analog, dt, speedMph, drifting = false) {
  const lock = steerLock(speedMph, drifting);
  const v = st.value;
  if (analog !== 0) {
    // Analog (alone or with a key held too): follow the stick, lightly smoothed.
    const target = clamp(analog + digital * 0.35, -STEER.max, STEER.max) * lock;
    st.value = v + (target - v) * (1 - Math.exp(-dt / STEER.analogTau));
  } else if (digital !== 0) {
    // Work in the key's direction: m is "how far toward this key" the wheel is turned.
    const m = v * digital;
    let next;
    if (m < 0) next = Math.min(lock, m + STEER.counterRate * dt);              // counter-steer
    else if (m > lock) next = Math.max(lock, m - STEER.returnRate * dt);       // lock shrank with speed
    else next = Math.min(lock, Math.max(m + STEER.rampIn * dt, m < STEER.tapFloor * lock ? STEER.tapFloor * lock : 0));
    st.value = next * digital;
  } else {
    const step = STEER.returnRate * dt;
    st.value = Math.abs(v) <= step ? 0 : v - Math.sign(v) * step;
  }
  return st.value;
}

/**
 * Car-specific handling numbers from the roster params (src/cars.js carParams).
 * @param {{gripMult:number, slipMult:number, massKg:number}} carP
 * @param {number} [tireLevel=1] global tyre upgrade level
 */
export function handlingFor(carP, tireLevel = 1) {
  const tire = 1 + (tireLevel - 1) * 0.1;
  const grip = (carP.gripMult || 1) * tire;
  const mass = Math.sqrt((carP.massKg || 1300) / 1300);
  return {
    grip,
    tau: LATERAL.tau * mass / grip,
    slipMult: carP.slipMult || 1,
  };
}

export function createLateral(x = 0) {
  return { x, vx: 0, slip: 0, ay: 0 };
}

/**
 * Advance the car's lateral motion one step (mutates and returns `lt`).
 * @param {{x:number,vx:number,slip:number,ay:number}} lt
 * @param {number} steer -1.25..1.25 (from stepSteer)
 * @param {number} dt step in seconds (player time)
 * @param {object} p
 * @param {number} p.speedMph
 * @param {number} [p.curve] road curvature under the car (track units, + = right-hander)
 * @param {number} [p.bank] road bank (+ leans into a right-hander)
 * @param {number} [p.worldScale=1] slow-motion factor applied to the road's pull
 * @param {{grip:number,tau:number}} p.h from handlingFor()
 * @param {boolean} [p.braking]
 * @param {boolean} [p.throttle]
 * @param {boolean} [p.drifting] power drift held
 * @param {number} [p.gripBonus=1] temporary multipliers (e.g. ZONE)
 */
export function stepLateral(lt, steer, dt, p) {
  const v = Math.max(0, p.speedMph) / 88;
  const h = p.h;
  let latMax = LATERAL.latSpeed * (LATERAL.lowSpeedFloor + (1 - LATERAL.lowSpeedFloor) * Math.min(1.35, v));
  let grip = LATERAL.grip * h.grip * (p.gripBonus || 1) * (1 + LATERAL.downforce * v * v);
  if (p.braking) grip *= LATERAL.brakeGrip;
  else if (p.throttle) grip *= LATERAL.throttleGrip;
  if (p.drifting) { grip *= LATERAL.driftGrip; latMax *= LATERAL.driftLat; }

  const curve = p.curve || 0;
  const bank = p.bank || 0;
  const relief = curve !== 0 && Math.sign(bank) === Math.sign(curve) ? Math.min(LATERAL.bankMax, Math.abs(bank) * LATERAL.bankRelief) : 0;
  // Outward pull (a right-hander, curve > 0, pushes the car toward -x).
  const pull = LATERAL.corner * curve * v * v * (1 - relief) * (p.worldScale == null ? 1 : p.worldScale);

  // The tyres chase the lateral velocity the wheel asks for; the road's pull acts on top.
  // With the wheel straight in a corner the car runs wide (it keeps going where it points
  // while the road turns away); holding the line means steering into the corner.
  const target = steer * latMax;
  const want = (target - lt.vx) / Math.max(0.02, h.tau);
  const tyre = clamp(want, -grip, grip);
  lt.slip = Math.abs(want) > grip ? (Math.abs(want) - grip) / grip : 0;
  lt.ay = tyre - pull;                      // net lateral acceleration
  lt.vx += lt.ay * dt;
  lt.x += lt.vx * dt;
  return lt;
}

// ---------------------------------------------------------------------------------------
// Set pieces (with the track lead's road contract: src/track.js featureAt(z)).
// A feature is { kind, z0, length, ...params }; t = (z - z0) / length is progress through it.

export const SETPIECE = {
  loopMinMph: 62,      // default speed needed over the top of a loop (feature.minMph overrides)
  loopTop: [0.38, 0.62], // the stretch of a loop where you're upside down
  loopGravity: 30,     // mph/s lost climbing the first half, regained coming down (net zero)
  landVx: 0.12,        // landing speed lost per half-width/s of sideways slide
  landSteer: 0.05,     // …and per unit of steering lock held on touchdown
  landMax: 0.25,       // never lose more than a quarter of your speed on a landing
};

/**
 * One step through a loop. Returns 'peel' if you're too slow at the top (you fall off),
 * otherwise the speed change from gravity along the loop.
 * @param {number} speedMph
 * @param {{minMph?:number}} feature
 * @param {number} t progress through the loop, 0..1
 * @param {number} dt
 */
export function loopStep(speedMph, feature, t, dt) {
  const min = (feature && feature.minMph) || SETPIECE.loopMinMph;
  if (t >= SETPIECE.loopTop[0] && t <= SETPIECE.loopTop[1] && speedMph < min) return { peel: true, dv: 0 };
  return { peel: false, dv: -SETPIECE.loopGravity * Math.sin(2 * Math.PI * t) * dt };
}

/** Fraction of speed kept on touchdown: land straight to keep it all. */
export function landingKeep(vx, steer) {
  const loss = Math.abs(vx) * SETPIECE.landVx + Math.abs(steer) * SETPIECE.landSteer;
  return 1 - Math.min(SETPIECE.landMax, loss);
}
