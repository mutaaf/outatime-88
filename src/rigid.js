// Rigid-body world v2 (ticket 0176): real per-object physics for everything that isn't the
// player's own tyres (src/handling.js owns those). Lazy: only the race step imports it.
//
// Every traffic car, rival, wreck, barrier, cone and barrel is an oriented box on the road
// plane with a real mass (kg), a yaw inertia from its footprint, a roll inertia from its
// width and height, and a centre of mass from its car shape (src/car-shapes.js). Contacts are
// found with the separating-axis test, so a car spun sideways is hit on its flank, and they
// are resolved with sequential impulses at the actual contact point: momentum is conserved,
// a 5,800 kg semi shoves a 1,400 kg sedan aside, a glancing blow on a rear corner spins a car
// by its yaw inertia, and sliding contact costs speed through Coulomb friction. Walls are
// static planes with friction: you slide along them, you don't stop dead.
//
// Frame: X = offset × LAT and Z = worldZ, both in world Z units, so boxes keep a car's real
// proportions (a sedan is ~2.5× longer than wide, a semi ~3.3×). Yaw is + nose to the right
// (+X), like GameState.carYaw. Velocities: vx in lane units/s (×LAT for X), vz in Z/s.
// Translation uses the sim dt, rotation and vertical motion the raw dt, as RigidBody3D always
// did. Everything is deterministic: no randomness, no allocation per step.

import { shapeOf } from './car-shapes.js';

export const RIGID = {
  LAT: 300,          // world Z units per lane unit
  G: 1580,           // gravity, Z units/s² (the vertical integrator's)
  GRIP: 2600,        // μ·g for tyres on tarmac, Z/s² (game speeds run hot, so grip does too)
  ROLL_DECEL: 1500,  // a wreck on its tyres/roof scrubbing speed, Z/s²
  iterations: 4,     // contact solver passes per sub-step
  slop: 1.5,         // penetration left alone (Z units), so resting contacts don't jitter
  push: 0.8,         // share of the remaining penetration removed per pass
  mu: 0.45,          // body-to-body sliding friction
  wallX: 0.72,       // wall line, lane units
  wallE: 0.2,        // walls absorb most of a hit
  wallMu: 0.5,       // and drag along you as you scrape
  maxSpin: 9,        // rad/s
  yawInertia: 2.5,   // tyres resist turning during the instant of a hit: effective yaw inertia ×
  stunFrom: 600,     // Z/s of velocity change (~5 mph) before a driver loses the car…
  stunPerDv: 1 / 900, // …and then seconds lost per Z/s beyond it
  stunMax: 1.6,
  recoverYaw: 3.2,   // a driver's countersteer: yaw spring toward the road (1/s²·rad)
  maxDynamicProps: 32,
  cellSize: 400,
};

const LAT = RIGID.LAT;
const isCar = (b) => b.kind === 'RIVAL' || b.kind === 'TRAFFIC';
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Mass properties, recomputed only when mass or size changes. Yaw inertia of a box
 * I = m(w² + l²)/12; roll inertia m(w² + h²)/12; the centre of mass sits at ~45% of the hull
 * for a car shape and at mid-height for props.
 */
export function massProps(b) {
  const key = b.massKg * 1e6 + b.halfW * 1e4 + b.halfL + (b.height || 0) * 1e-3;
  if (b._mpKey === key) return b;
  b._mpKey = key;
  const w = 2 * b.halfW * LAT;
  const l = 2 * b.halfL;
  const h = b.height || 30;
  if (b.isStatic) {
    b.invI = 0; b.invIRoll = 0; b.comY = h * 0.5;
    return b;
  }
  b.invI = 12 / (b.massKg * (w * w + l * l) * RIGID.yawInertia);
  b.invIRoll = 12 / (b.massKg * (w * w + h * h));
  if (isCar(b)) {
    const S = shapeOf(b.shape || b.style);
    const topM = S.cab ? S.cab[3] : S.hull[1];
    b.comY = h * clamp((S.hull[0] + (S.hull[1] - S.hull[0]) * 0.45) / Math.max(0.5, topM), 0.2, 0.6);
  } else {
    b.comY = h * 0.5;
  }
  return b;
}

// ── Contact geometry ─────────────────────────────────────────────────────────────────────
// Scratch contact (reused): normal from a to b, depth, and the contact point.
const C = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

/**
 * Separating-axis test between two oriented boxes on the road plane. Returns the shared
 * scratch contact (normal points a → b) or null. Vertical overlap is checked too, so a car
 * flying over a cone, or under a gate's beam, doesn't touch it.
 */
export function collide(a, b) {
  if (!(a.y < b.y + b.height && a.y + a.height > b.y + (b.clearanceY || 0))) return null;
  const ax = a.offset * LAT, az = a.worldZ, bx = b.offset * LAT, bz = b.worldZ;
  const dx = bx - ax, dz = bz - az;
  const ahw = a.halfW * LAT, ahl = a.halfL, bhw = b.halfW * LAT, bhl = b.halfL;
  // Cheap reject with bounding circles before any trig.
  const ra = ahw + ahl, rb = bhw + bhl;
  if (dx * dx + dz * dz > (ra + rb) * (ra + rb)) return null;
  const ca = Math.cos(a.yaw || 0), sa = Math.sin(a.yaw || 0);
  const cb = Math.cos(b.yaw || 0), sb = Math.sin(b.yaw || 0);
  // Axes: right = (cos, −sin), forward = (sin, cos).
  let best = Infinity, nx = 0, nz = 0, ref = 0;
  for (let k = 0; k < 4; k++) {
    let lx, lz;
    if (k === 0) { lx = ca; lz = -sa; } else if (k === 1) { lx = sa; lz = ca; } else if (k === 2) { lx = cb; lz = -sb; } else { lx = sb; lz = cb; }
    const pa = ahw * Math.abs(ca * lx - sa * lz) + ahl * Math.abs(sa * lx + ca * lz);
    const pb = bhw * Math.abs(cb * lx - sb * lz) + bhl * Math.abs(sb * lx + cb * lz);
    const d = dx * lx + dz * lz;
    const o = pa + pb - Math.abs(d);
    if (o <= 0) return null;
    // Prefer a's axes on near-ties so a straight rear-ender reads as end-on, not sideways.
    if (o < best - 1e-6) { best = o; const s = d < 0 ? -1 : 1; nx = lx * s; nz = lz * s; ref = k < 2 ? 0 : 1; }
  }
  C.nx = nx; C.nz = nz; C.depth = best;
  // Contact point: the incident box's corner(s) deepest along the normal (averaged when an
  // edge is flush, so a straight rear-end hits the bumper's middle, not a corner).
  const inc = ref === 0 ? b : a;
  const icx = ref === 0 ? bx : ax, icz = ref === 0 ? bz : az;
  const ic = ref === 0 ? cb : ca, is = ref === 0 ? sb : sa;
  const ihw = ref === 0 ? bhw : ahw, ihl = inc.halfL;
  const dir = ref === 0 ? -1 : 1; // b's corner most toward a, or a's corner most toward b
  let bestP = -Infinity, sx = 0, sz = 0, n = 0;
  for (let k = 0; k < 4; k++) {
    const lx = k & 1 ? ihw : -ihw;
    const lz = k & 2 ? ihl : -ihl;
    const wx = icx + lx * ic + lz * is;
    const wz = icz - lx * is + lz * ic;
    const p = dir * (wx * nx + wz * nz);
    if (p > bestP + 0.5) { bestP = p; sx = wx; sz = wz; n = 1; } else if (p > bestP - 0.5) { sx += wx; sz += wz; n++; }
  }
  C.px = sx / n; C.pz = sz / n;
  return C;
}

/**
 * A contact along a given normal (a → b), for hits the swept test caught between steps
 * (the boxes no longer overlap, so SAT can't see them): the point sits on a's face toward b,
 * at b's side of the overlap.
 */
export function contactAlong(a, b, nx, nz) {
  const ax = a.offset * LAT, bx = b.offset * LAT;
  C.nx = nx; C.nz = nz; C.depth = 0;
  if (nz) {
    C.pz = a.worldZ + nz * a.halfL;
    C.px = clamp(bx, ax - a.halfW * LAT, ax + a.halfW * LAT);
  } else {
    C.px = ax + nx * a.halfW * LAT;
    C.pz = clamp(b.worldZ, a.worldZ - a.halfL, a.worldZ + a.halfL);
  }
  return C;
}

// ── Impulses ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply impulse (jx, jz) in world units (kg·Z/s) at world point (px, pz), plus an optional
 * vertical impulse jy. Linear: Δv = J/m. Yaw: Δω = (r × J)/I. A sideways shove above the
 * centre of mass rolls the body.
 */
export function applyImpulseAt(b, jx, jz, px, pz, jy = 0, hitY = -1) {
  if (b.isStatic) return;
  massProps(b);
  if (b.sleeping) { b.sleeping = false; b.restTime = 0; }
  b.vx += (jx * b.invMass) / LAT;
  b.vz += jz * b.invMass;
  if (jy) b.vy += jy * b.invMass;
  const rx = px - b.offset * LAT, rz = pz - b.worldZ;
  b.vYaw = clamp(b.vYaw + (rz * jx - rx * jz) * b.invI, -RIGID.maxSpin, RIGID.maxSpin);
  // Roll: the impulse's component across the body, acting at the hit height above the CoM.
  const arm = (hitY < 0 ? b.height * 0.55 : hitY) - b.comY;
  if (arm > 0) {
    const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0);
    const jSide = jx * c - jz * s;
    b.vRot = clamp(b.vRot + jSide * arm * b.invIRoll, -14, 14);
  }
  // Suspension takes the hit.
  b.suspVY -= Math.min(180, Math.abs(jy) * b.invMass * 0.35 + Math.hypot(jx, jz) * b.invMass * 0.02);
  // A big enough change in velocity takes the car out of its driver's hands for a moment.
  if (isCar(b)) {
    const dv = Math.hypot(jx, jz) * b.invMass;
    if (dv > RIGID.stunFrom) b.stun = Math.min(RIGID.stunMax, Math.max(b.stun || 0, 0.25 + (dv - RIGID.stunFrom) * RIGID.stunPerDv));
  }
}

/** Velocity of world point (px, pz) on body b, into OUT.x/OUT.z. */
const OUT = { x: 0, z: 0 };
function pointVel(b, px, pz) {
  const rx = px - b.offset * LAT, rz = pz - b.worldZ;
  const w = b.isStatic || b.sleeping ? 0 : b.vYaw || 0;
  const vX = b.isStatic ? 0 : b.vx * LAT, vZ = b.isStatic ? 0 : b.vz;
  OUT.x = vX + w * rz;
  OUT.z = vZ - w * rx;
  return OUT;
}

/**
 * Resolve one contact between a and b (normal a → b) with restitution e on the first pass.
 * Returns the normal impulse applied (kg·Z/s; 0 if they were separating).
 */
export function resolve(a, b, c, e, mu = RIGID.mu) {
  massProps(a); massProps(b);
  const wa = a.isStatic ? 0 : a.invMass, wb = b.isStatic ? 0 : b.invMass;
  if (wa + wb <= 0) return 0;
  const { nx, nz, px, pz } = c;
  const rax = px - a.offset * LAT, raz = pz - a.worldZ;
  const rbx = px - b.offset * LAT, rbz = pz - b.worldZ;
  pointVel(a, px, pz); const vax = OUT.x, vaz = OUT.z;
  pointVel(b, px, pz); const vbx = OUT.x, vbz = OUT.z;
  const rvx = vbx - vax, rvz = vbz - vaz;
  const vn = rvx * nx + rvz * nz;
  let jn = 0;
  if (vn < 0) {
    const ran = raz * nx - rax * nz, rbn = rbz * nx - rbx * nz;
    const k = wa + wb + ran * ran * a.invI + rbn * rbn * b.invI;
    jn = (-(1 + e) * vn) / k;
    applyPair(a, b, jn * nx, jn * nz, px, pz);
    noteBlocked(a, b, nx, nz, 1);
    noteBlocked(b, a, nx, nz, -1);
    // Coulomb friction along the contact, capped at μ·jn.
    const tx = -nz, tz = nx;
    const vt = rvx * tx + rvz * tz;
    const rat = raz * tx - rax * tz, rbt = rbz * tx - rbx * tz;
    const kt = wa + wb + rat * rat * a.invI + rbt * rbt * b.invI;
    const jt = clamp(-vt / kt, -mu * jn, mu * jn);
    if (jt) applyPair(a, b, jt * tx, jt * tz, px, pz);
  }
  // Push them apart (split by inverse mass), leaving a little slop.
  const corr = Math.max(0, c.depth - RIGID.slop) * RIGID.push / (wa + wb);
  if (corr > 0) {
    if (wa) { a.offset -= (nx * corr * wa) / LAT; a.worldZ -= nz * corr * wa; }
    if (wb) { b.offset += (nx * corr * wb) / LAT; b.worldZ += nz * corr * wb; }
  }
  return jn;
}

/** A driver whose nose is in the contact (the normal points along its heading) is blocked. */
function noteBlocked(car, other, nx, nz, sign) {
  if (!isCar(car) || car.takenDown) return;
  // Cones and barrels get driven through; only something a fair share of its weight stops it.
  if (!other.isStatic && other.massKg < car.massKg * 0.3) return;
  const fwd = sign * (nx * Math.sin(car.yaw || 0) + nz * Math.cos(car.yaw || 0));
  if (fwd < 0.7) return;
  car.blockedT = 0.6;
  car.blockVz = other.isStatic ? -1 : other.vz;
  // …and steers round it: away from its centre, or toward the open road when it's dead ahead.
  const d = car.offset - other.offset;
  car.blockSide = Math.abs(d) > 0.5 * (car.halfW + other.halfW) ? Math.sign(d) : (car.offset > 0 ? -1 : 1);
}

function applyPair(a, b, jx, jz, px, pz) {
  applyImpulseAt(a, -jx, -jz, px, pz);
  applyImpulseAt(b, jx, jz, px, pz);
}

/** Body against the wall on its `side` (+1 right, −1 left): a static plane with friction. */
export function wallImpulse(b) {
  const ahw = b.halfW * LAT;
  const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0);
  // The wall line sits where the old clamp left a straight car's centre, so lane widths hold.
  const limit = (RIGID.wallX - b.halfW * 0.25) * LAT + ahw;
  const reach = ahw * Math.abs(c) + b.halfL * Math.abs(s);
  const x = b.offset * LAT;
  const side = x > 0 ? 1 : -1;
  const depth = side * x + reach - limit;
  if (depth <= 0) return 0;
  // Contact at the corner that sticks out furthest toward the wall.
  let px = 0, pz = 0, bestP = -Infinity;
  for (let k = 0; k < 4; k++) {
    const lx = k & 1 ? ahw : -ahw;
    const lz = k & 2 ? b.halfL : -b.halfL;
    const wx = x + lx * c + lz * s;
    const wz = b.worldZ - lx * s + lz * c;
    if (side * wx > bestP) { bestP = side * wx; px = wx; pz = wz; }
  }
  massProps(b);
  b.offset -= (side * depth) / LAT;
  if (b.isStatic) return 0;
  pointVel(b, px, pz);
  const vIn = side * OUT.x; // into the wall
  let jn = 0;
  if (vIn > 0) {
    const rx = px - b.offset * LAT, rz = pz - b.worldZ;
    const rn = rz * side; // (r × n) with n = (side, 0)
    jn = ((1 + RIGID.wallE) * vIn) / (b.invMass + rn * rn * b.invI);
    applyImpulseAt(b, -side * jn, 0, px, pz, 0, b.comY);
    pointVel(b, px, pz);
    const vt = OUT.z;
    const rt = -rx; // (r × t) with t = (0, 1)
    const jt = clamp(-vt / (b.invMass + rt * rt * b.invI), -RIGID.wallMu * jn, RIGID.wallMu * jn);
    applyImpulseAt(b, 0, jt, px, pz, 0, b.comY);
  }
  return jn;
}

// ── Integration ──────────────────────────────────────────────────────────────────────────

/**
 * One sub-step for one body. Cars: a driver holds the car on its line (the AI or traffic
 * controller sets vx and driveVz) and steers the nose where it's going; a stunned car is
 * only tyres: they kill sideways slip up to μ·g, so a car hit sideways skids, spins down and
 * stops sliding, then its driver countersteers back. Props: Coulomb sliding friction on the
 * ground, drag in the air, tumbling that rolls to a stop.
 */
export function integrate(b, dt, rawDt) {
  if (b.isStatic || b.sleeping || !b.active) return;
  massProps(b);
  const ground = b.y <= 1;
  const car = isCar(b);
  if (car) {
    if (b.stun > 0) b.stun = Math.max(0, b.stun - rawDt);
    if (b.yaw > Math.PI || b.yaw < -Math.PI) b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw));
    const driver = !(b.stun > 0) && !b.takenDown;
    // Facing the wrong way the driver can only steer the nose back round, not drive.
    const control = driver && Math.abs(b.yaw) < 1.0;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    let VX = b.vx * LAT, VZ = b.vz;
    if (ground) {
      const vLong = VX * s + VZ * c;
      const vLat = VX * c - VZ * s;
      const grip = RIGID.GRIP * dt;
      if (control) {
        // The driver: speed toward the target along the nose, sideways motion is theirs
        // (lane changes), and the nose follows the car's path with a countersteer spring.
        let want = b.driveVz != null ? b.driveVz : vLong;
        // Something in front of the nose (resolve() noted it): the driver brakes to its speed
        // rather than shoving it down the road.
        if (b.blockedT > 0) {
          b.blockedT -= rawDt;
          // A car ahead: match its speed. Something fixed: slow right down and steer round it.
          want = b.blockVz >= 0 ? Math.min(want, b.blockVz - 40) : Math.min(want, want * 0.35);
          VX += b.blockSide * LAT * (b.blockVz >= 0 ? 0.6 : 3.0) * dt;
        }
        // Braking is tyre-limited and speeding up is the driver's call (the rival AI already
        // limits it); traffic's cruise control eases both ways (driveAccel), so a car you shunt
        // keeps the push for a while instead of braking straight back into you.
        const up = b.driveAccel != null ? b.driveAccel * dt : Infinity;
        const down = b.blockedT > 0 || b.driveAccel == null ? grip * 1.6 : b.driveAccel * dt;
        const dLong = clamp(want - vLong, -down, up);
        VX += dLong * s; VZ += dLong * c;
        const path = Math.atan2(VX, Math.max(600, Math.abs(VZ)));
        const target = clamp(path, -0.45, 0.45);
        b.vYaw += ((target - b.yaw) * RIGID.recoverYaw * 6 - b.vYaw * 4.5) * rawDt;
        // Self-aligning lateral damping (the old grip model, so the AI's lane changes feel
        // the same): sideways speed bleeds off as the tyres bite.
        const damp = Math.abs(b.yaw - target) > 0.35 ? 2.2 : 5.2;
        VX *= Math.max(0, 1 - damp * rawDt);
      } else {
        // Tyres only: kill sideways slip up to grip, scrub speed along the nose.
        const dLat = clamp(-vLat, -grip, grip);
        const scrub = b.takenDown ? RIGID.ROLL_DECEL : RIGID.ROLL_DECEL * 0.35;
        const dLong = clamp(-vLong, -scrub * dt, scrub * dt);
        VX += dLat * c + dLong * s;
        VZ += -dLat * s + dLong * c;
        // Spinning tyres scrub yaw rate; once the stun wears off the driver steers it round.
        b.vYaw *= Math.max(0, 1 - 3.0 * rawDt);
        if (driver) b.vYaw += (-b.yaw * RIGID.recoverYaw * 6 - b.vYaw * 4) * rawDt;
      }
      b.vx = VX / LAT; b.vz = VZ;
    }
    // Body roll: lean into lane changes while upright; past the tip point it's a tumble.
    if (ground && Math.abs(b.rot) < 0.9 && Math.abs(b.vRot) < 6) {
      const lean = control ? b.vx * -0.14 + b.yaw * 0.25 : 0;
      b.vRot += ((lean - b.rot) * 90 - b.vRot * 11) * rawDt;
    }
  } else if (ground) {
    // Sliding friction (Coulomb, so it actually stops) plus the material's damping.
    const VX = b.vx * LAT, VZ = b.vz;
    const sp = Math.hypot(VX, VZ);
    if (sp > 0) {
      const dec = Math.min(sp, b.friction * 600 * rawDt);
      const k = (sp - dec) / sp * Math.max(0, 1 - b.friction * 0.5 * rawDt);
      b.vx *= k; b.vz *= k;
    }
    b.vYaw *= Math.max(0, 1 - 4.0 * rawDt);
  } else {
    // Air drag while flying.
    const k = Math.max(0, 1 - 0.35 * rawDt);
    b.vz *= k; b.vx *= k;
  }

  b.offset += b.vx * dt;
  b.worldZ += b.vz * dt;
  b.yaw += b.vYaw * rawDt;
  b.rot += b.vRot * rawDt;

  // Suspension: a spring-damper (F = −k·y − c·v).
  b.suspVY += (-210 * b.suspY - 19 * b.suspVY) * rawDt;
  b.suspY += b.suspVY * rawDt;

  // Gravity, and landings that compress the suspension and bounce by restitution.
  if (b.y > 0 || b.vy !== 0) {
    b.vy -= RIGID.G * rawDt;
    b.y += b.vy * rawDt;
    if (b.y <= 0) {
      b.y = 0;
      if (b.vy < -110) {
        b.suspVY = b.vy * 0.28;
        b.vy = -b.vy * b.restitution;
        b.vRot *= 0.72;
        b.vYaw *= 0.8;
      } else {
        b.vy = 0;
      }
    }
  }
  // On the ground a tumble rolls to a stop and settles on its wheels (or its side).
  if (b.y <= 0 && Math.abs(b.rot) >= 0.9) {
    const rest = Math.round(b.rot / (Math.PI / 2)) * (Math.PI / 2);
    const settle = car ? Math.round(b.rot / (Math.PI * 2)) * (Math.PI * 2) : rest;
    const goal = Math.abs(b.vRot) < 2.5 ? settle : rest;
    b.vRot += ((goal - b.rot) * 30 - b.vRot * 6) * rawDt;
  } else if (!car && b.y <= 0) {
    b.vRot *= Math.max(0, 1 - 5.0 * rawDt);
    b.rot *= Math.max(0, 1 - 6.0 * rawDt);
  }
  b.vYaw = clamp(b.vYaw, -RIGID.maxSpin, RIGID.maxSpin);

  wallImpulse(b);

  // Props fall asleep once settled.
  if (!car) {
    const still = b.y <= 0 && b.vy === 0 && Math.abs(b.vx) < 0.01 && Math.abs(b.vz) < 4 && Math.abs(b.vRot) < 0.2;
    b.restTime = still ? b.restTime + rawDt : 0;
    if (b.restTime > 0.35) {
      b.sleeping = true;
      b.vx = 0; b.vz = 0; b.vRot = 0; b.vYaw = 0;
    }
  }
}

// ── World ────────────────────────────────────────────────────────────────────────────────

/** Can these two touch at all? (Both asleep/static never; wrecks only hit props and debris.) */
function pairOk(a, b) {
  if (a === b || !a.active || !b.active) return false;
  if ((a.sleeping || a.isStatic) && (b.sleeping || b.isStatic)) return false;
  // A wreck already flying out of the race doesn't pinball the field.
  if ((a.takenDown && isCar(b)) || (b.takenDown && isCar(a))) return false;
  return true;
}

/**
 * The world stepper: integrate, broadphase on Z (sorted, reused arrays), then a few passes of
 * the contact solver. onChain(a, b) fires when a knocked obstacle slams into something.
 */
export function createRigidWorld({ subSteps = 2, iterations = RIGID.iterations, cellSize = RIGID.cellSize } = {}) {
  const keys = [];
  const order = [];
  const pairA = [];
  const pairB = [];
  const stats = { bodies: 0, awake: 0, pairsTested: 0, contacts: 0 };

  function broadphase(bodies) {
    const n = bodies.length;
    for (let i = 0; i < n; i++) { keys[i] = Math.floor(bodies[i].worldZ / cellSize); order[i] = i; }
    order.length = n;
    for (let i = 1; i < n; i++) {
      const v = order[i]; const k = keys[v]; let j = i - 1;
      while (j >= 0 && (keys[order[j]] > k || (keys[order[j]] === k && order[j] > v))) { order[j + 1] = order[j]; j--; }
      order[j + 1] = v;
    }
    let m = 0;
    for (let a = 0; a < n; a++) {
      const ia = order[a];
      for (let b = a + 1; b < n; b++) {
        const ib = order[b];
        if (keys[ib] > keys[ia] + 1) break;
        stats.pairsTested++;
        if (!pairOk(bodies[ia], bodies[ib])) continue;
        // Stable order inside a pair, so results never depend on the list's order.
        pairA[m] = ia < ib ? ia : ib; pairB[m] = ia < ib ? ib : ia; m++;
      }
    }
    return m;
  }

  return {
    stats,
    step(bodies, dt, rawDt, onChain) {
      stats.pairsTested = 0; stats.contacts = 0;
      const sd = dt / subSteps, srd = rawDt / subSteps;
      for (let s = 0; s < subSteps; s++) {
        for (let i = 0; i < bodies.length; i++) integrate(bodies[i], sd, srd);
        const m = broadphase(bodies);
        for (let it = 0; it < iterations; it++) {
          for (let p = 0; p < m; p++) {
            const a = bodies[pairA[p]], b = bodies[pairB[p]];
            const c = collide(a, b);
            if (!c) continue;
            const e = it === 0 ? Math.min(a.restitution, b.restitution) : 0;
            const j = resolve(a, b, c, e);
            if (it === 0 && j > 0) {
              stats.contacts++;
              if (onChain && ((a.kind === 'OBSTACLE' && a.hitCount > 0) || (b.kind === 'OBSTACLE' && b.hitCount > 0))) onChain(a, b);
            }
          }
        }
      }
      let awake = 0;
      for (let i = 0; i < bodies.length; i++) if (!bodies[i].sleeping && !bodies[i].isStatic) awake++;
      stats.bodies = bodies.length;
      stats.awake = awake;
      return stats;
    },
  };
}

/** A position/velocity hash of the world, for replay tests and desync checks. */
export function worldHash(bodies) {
  let h = 2166136261 >>> 0;
  const mix = (v) => {
    const q = Math.round(v * 1000) | 0;
    h = Math.imul(h ^ q, 16777619) >>> 0;
  };
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    mix(b.offset); mix(b.worldZ); mix(b.vx); mix(b.vz); mix(b.yaw); mix(b.vYaw); mix(b.y); mix(b.rot);
  }
  return h;
}
