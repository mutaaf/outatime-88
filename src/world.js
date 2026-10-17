// The rigid-body world step (ticket 0074): integrate every awake body, find touching pairs
// with the Z-hash broadphase, and resolve them with impulses. Carved out of main.js's
// LiveTraffic so it can be unit-tested and benchmarked; behaviour for cars and the classic
// obstacles is the same as before, plus static bodies, sleeping props and a body cap.

import { createZHash } from './broadphase.js';

export const WORLD = {
  subSteps: 2,          // per 1/120 s sim step → 240 Hz integration
  maxDynamicProps: 32,  // knocked-about props beyond this are retired (oldest first)
  cellSize: 400,        // ≥ the longest pair extent (two 160-long trucks = 320)
};

/**
 * Impulse + minimum-translation solver for one pair (cars, obstacles, props).
 * Calls onChain(a, b) when a knocked obstacle hits something end-on (chain reaction).
 */
export function solvePair(a, b, onChain) {
  if (a === b || a.takenDown || b.takenDown || !a.active || !b.active) return false;
  if ((a.sleeping || a.isStatic) && (b.sleeping || b.isStatic)) return false;
  const dz = Math.abs(a.worldZ - b.worldZ);
  const minSepZ = a.halfL + b.halfL;
  if (dz >= minSepZ) return false;
  const dx = Math.abs(a.offset - b.offset);
  const minSepX = a.halfW + b.halfW;
  if (dx >= minSepX) return false;
  const vertOverlap = (a.y < b.y + b.height) && (a.y + a.height > b.y + b.clearanceY);
  if (!vertOverlap) return false;

  // Minimum Translation Vector (MTV) + Newtonian impulse J = -(1+e)(vRel·n)/(1/mA + 1/mB)
  const totalInvMass = a.invMass + b.invMass;
  if (totalInvMass <= 0) return false;
  const e = Math.min(a.restitution, b.restitution);
  const signX = a.offset <= b.offset ? -1 : 1;
  const signZ = a.worldZ <= b.worldZ ? -1 : 1;
  const penX = minSepX - dx;
  const penZ = minSepZ - dz;

  if (penX * 900 < penZ) {
    // Side-to-side
    a.offset += signX * penX * (a.invMass / totalInvMass);
    b.offset -= signX * penX * (b.invMass / totalInvMass);
    const vRelX = a.vx - b.vx;
    const jx = -(1 + e) * vRelX / totalInvMass;
    const lever = (a.worldZ - b.worldZ) / minSepZ;
    a.applyImpulseAndTorque(jx, 45 * Math.min(1, a.massKg / 150), 0, lever);
    b.applyImpulseAndTorque(-jx, 45 * Math.min(1, b.massKg / 150), 0, -lever);
  } else {
    // End-on / ricochet
    a.worldZ += signZ * penZ * (a.invMass / totalInvMass);
    b.worldZ -= signZ * penZ * (b.invMass / totalInvMass);
    const vRelZ = a.vz - b.vz;
    const jz = -(1 + e) * vRelZ / totalInvMass;
    const lever = a.offset - b.offset;
    // The lift/side kick scales with the lighter body's mass so a cone isn't fired into orbit.
    const kick = Math.min(1, Math.min(a.massKg, b.massKg) / 150);
    a.applyImpulseAndTorque(lever * 180 * kick, 140 * kick, jz, lever);
    b.applyImpulseAndTorque(-lever * 180 * kick, 140 * kick, -jz, -lever);
    if (onChain && ((a.kind === 'OBSTACLE' && a.hitCount > 0) || (b.kind === 'OBSTACLE' && b.hitCount > 0))) onChain(a, b);
  }
  return true;
}

/**
 * Creates a world stepper that reuses its arrays (no per-step allocations).
 * step(bodies, dt, rawDt, onChain) integrates WORLD.subSteps sub-steps and solves contacts.
 */
export function createWorld({ subSteps = WORLD.subSteps, cellSize = WORLD.cellSize } = {}) {
  const hash = createZHash(cellSize);
  let onChainFn = null;
  let contacts = 0;
  const solve = (a, b) => { if (solvePair(a, b, onChainFn)) contacts++; };
  const stats = { bodies: 0, awake: 0, pairsTested: 0, contacts: 0 };

  return {
    stats,
    step(bodies, dt, rawDt, onChain) {
      onChainFn = onChain || null;
      contacts = 0;
      let pairs = 0;
      const subDt = dt / subSteps;
      const subRawDt = rawDt / subSteps;
      for (let s = 0; s < subSteps; s++) {
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (!b.takenDown && b.active) b.stepSubPhysics(subDt, subRawDt);
        }
        hash.build(bodies);
        pairs += hash.forEachPair(bodies, solve);
      }
      let awake = 0;
      for (let i = 0; i < bodies.length; i++) if (!bodies[i].sleeping && !bodies[i].isStatic) awake++;
      stats.bodies = bodies.length;
      stats.awake = awake;
      stats.pairsTested = pairs;
      stats.contacts = contacts;
      return stats;
    },
  };
}

/**
 * A fixed pool of props (cones, barrels). Spawning reuses a retired body; when every slot
 * is busy the prop furthest behind is retired to make room, so the world never holds more
 * than `size` props and never allocates mid-race.
 */
export function createPropPool(size, makeBody) {
  const items = [];
  for (let i = 0; i < size; i++) {
    const b = makeBody();
    b.active = false;
    items.push(b);
  }
  return {
    items,
    /** Live props, in a reused array. */
    live: [],
    spawn(opts) {
      let slot = null;
      for (let i = 0; i < items.length; i++) if (!items[i].active) { slot = items[i]; break; }
      if (!slot) {
        slot = items[0];
        for (let i = 1; i < items.length; i++) if (items[i].worldZ < slot.worldZ) slot = items[i];
      }
      slot.reset(opts);
      slot.active = true;
      this.refresh();
      return slot;
    },
    /** Retire props more than `behind` units behind z. */
    retireBehind(z, behind) {
      let changed = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].active && items[i].worldZ < z - behind) { items[i].active = false; changed = true; }
      }
      if (changed) this.refresh();
    },
    clear() {
      for (let i = 0; i < items.length; i++) items[i].active = false;
      this.refresh();
    },
    refresh() {
      this.live.length = 0;
      for (let i = 0; i < items.length; i++) if (items[i].active) this.live.push(items[i]);
    },
  };
}
