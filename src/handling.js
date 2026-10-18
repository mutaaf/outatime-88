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
// Lateral model (ticket 0120, v2, road frame, x in half-road widths, ±0.72 is the wall). A
// bicycle model in angles rather than a cursor sliding sideways:
//   - The car travels along a heading θ relative to the road's tangent, so dx/dt = U·tan θ,
//     where U is its forward speed in the road's lateral units (FWD at 88 mph).
//   - The front wheels' angle sets a yaw rate r = U·δ / (L·(1 + (U/Uch)²)): the steady-state
//     yaw response of a real car, with the understeer gradient flattening it at speed.
//   - The tyres can only supply a lateral acceleration U·r up to their grip (more with
//     downforce, less in a power drift). Ask for more and the car understeers: r saturates,
//     the car runs wide and `slip` says by how much.
//   - The road bends under the car: its tangent turns at κ·U, so dθ/dt = r − κ·U. An
//     unsteered car runs wide in a bend; holding the line takes steering into it. A bank
//     cancels part of the turn the tyres must make.
//   - Self-aligning (caster plus the driver's hands): with the wheel centred the heading
//     relaxes back along the road, overdamped, so a tap is a small, smooth lane drift and a
//     release never zig-zags.
//   - The body yaws on a spring toward the travel heading plus a sideslip angle β: a few
//     degrees nose-in with cornering load, more when the tyres saturate, a lot when a power drift breaks the rear loose (and
//     counter-steering swings it back). `yaw` is what the renderers draw.
//   - Anything that shoves the car (contacts, walls, slams) changes `vx` directly; the next
//     step reads the travel heading back from it, so the body lags the shove like a real one.
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
  fwd: 8,             // forward speed in lateral units/s at 88 mph (sets how far a heading moves you)
  minFwd: 5,          // …never less, so the car still steers at a crawl (a parked car doesn't)
  latSpeed: 1.35,     // sideways speed full lock settles at on a straight at 88 mph (calibration)
  yawGain: 0.154,     // yaw rate per unit steer per unit forward speed (δ/L)
  understeerU: 10,    // forward speed where the understeer gradient halves the yaw response
  align: 4.5,         // 1/s; the heading relaxes back along the road (caster + hands)
  tau: 0.09,          // s; yaw response of a 1300 kg car with grip rating 5
  grip: 7,            // lateral units/s² the tyres can supply (grip rating 5, no downforce)
  downforce: 0.22,    // extra grip fraction at 88 mph (∝ v²)
  brakeGrip: 1.08,    // weight forward: more front bite while braking
  throttleGrip: 0.97, // weight back: slightly less turn-in on throttle
  driftGrip: 0.62,    // a power drift breaks the rear loose
  driftLat: 1.15,     // …and the car swings across the road a little faster
  driftBeta: 0.12,    // rad the tail steps out in a full power drift, on top of the cornering load
                      // (≈15–18° of visible yaw in a typical drift; 0.3 read as a spin-out)
  loadBeta: 0.12,     // rad the nose points into a turn at the grip limit
  slipBeta: 0.08,     // rad of sideslip per unit of understeer slip (capped at 1)
  bodyHz: 2.4,        // the body's yaw spring (Hz) …
  bodyDamp: 0.85,     // … and its damping ratio (under 1: a hint of weight, never a wobble)
  corner: 0.152,      // road turn rate (rad/s) per unit of segment curve at 88 mph
  bankRelief: 2.2,    // fraction of the turn a bank cancels, per unit of bank (capped)
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
  return { x, vx: 0, slip: 0, ay: 0, heading: 0, r: 0, yaw: 0, yawVel: 0, beta: 0 };
}

/**
 * Advance the car's lateral motion one step (mutates and returns `lt`).
 * @param {{x:number,vx:number,slip:number,ay:number,heading:number,r:number,yaw:number,yawVel:number,beta:number}} lt
 * @param {number} steer -1.25..1.25 (from stepSteer)
 * @param {number} dt step in seconds (player time)
 * @param {object} p
 * @param {number} p.speedMph
 * @param {number} [p.curve] road curvature under the car (track units, + = right-hander)
 * @param {number} [p.bank] road bank (+ leans into a right-hander)
 * @param {number} [p.worldScale=1] slow-motion factor applied to the road's turn
 * @param {{grip:number,tau:number,slipMult?:number}} p.h from handlingFor()
 * @param {boolean} [p.braking]
 * @param {boolean} [p.throttle]
 * @param {boolean} [p.drifting] power drift held
 * @param {number} [p.gripBonus=1] temporary multipliers (e.g. ZONE)
 */
export function stepLateral(lt, steer, dt, p) {
  const v = Math.max(0, p.speedMph) / 88;
  const h = p.h;
  const U = Math.max(LATERAL.minFwd, LATERAL.fwd * v);
  let grip = LATERAL.grip * h.grip * (p.gripBonus || 1) * (1 + LATERAL.downforce * v * v);
  if (p.braking) grip *= LATERAL.brakeGrip;
  else if (p.throttle) grip *= LATERAL.throttleGrip;
  let gain = LATERAL.yawGain;
  if (p.drifting) { grip *= LATERAL.driftGrip; gain *= LATERAL.driftLat; }

  const curve = p.curve || 0;
  const bank = p.bank || 0;
  const relief = curve !== 0 && Math.sign(bank) === Math.sign(curve) ? Math.min(LATERAL.bankMax, Math.abs(bank) * LATERAL.bankRelief) : 0;
  // The road's tangent turns under the car (a right-hander, curve > 0, turns it right, so
  // relative to the road the car's heading swings left, toward -x).
  const roadTurn = LATERAL.corner * curve * v * (1 - relief) * (p.worldScale == null ? 1 : p.worldScale);

  // Travel heading from the sideways speed (contacts and walls may have shoved it).
  let heading = Math.atan2(lt.vx, U);

  // Yaw rate the wheel asks for, then what the tyres can actually give (understeer past grip).
  const ask = steer * U * gain * Math.min(1, p.speedMph / 8) / (1 + (U / LATERAL.understeerU) ** 2);
  const rMax = grip / U;
  const r = clamp(ask, -rMax, rMax);
  lt.slip = Math.abs(ask) > rMax ? (Math.abs(ask) - rMax) / rMax : 0;
  // The car's yaw rate lags the ask by the car's response time.
  lt.r += (r - lt.r) * (1 - Math.exp(-dt / Math.max(0.02, h.tau)));

  // Heading relative to the road: the car's yaw, minus the road turning away, relaxing back.
  heading += (lt.r - roadTurn - LATERAL.align * heading) * dt;
  heading = clamp(heading, -1.2, 1.2);
  const vx = U * Math.tan(heading);
  lt.ay = (vx - lt.vx) / dt;
  lt.vx = vx;
  lt.x += vx * dt;
  lt.heading = heading;

  // Body yaw: the travel heading plus a sideslip angle, on a damped spring.
  const dir = Math.sign(steer || lt.r || 0);
  const slipMult = h.slipMult || 1;
  // Cornering load points the nose a little into the turn (rear sideslip); past the grip
  // limit it slides more; a power drift kicks the tail right out.
  const load = clamp(U * lt.r / grip, -1, 1);
  // The drift kick replaces the understeer slide rather than stacking on it.
  lt.beta = load * LATERAL.loadBeta + (p.drifting
    ? dir * LATERAL.driftBeta * Math.min(1, Math.abs(steer) / 0.6) * slipMult
    : dir * LATERAL.slipBeta * Math.min(1, lt.slip) * slipMult);
  const w = 2 * Math.PI * LATERAL.bodyHz;
  const acc = w * w * (heading + lt.beta - lt.yaw) - 2 * LATERAL.bodyDamp * w * lt.yawVel;
  lt.yawVel += acc * dt;
  lt.yaw += lt.yawVel * dt;
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
