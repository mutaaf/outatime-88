// A guaranteed clean line (sprint 4). Every race has an invisible racing line: a smooth,
// seeded centre offset per track Z that the slowest car can always follow. Nothing that
// costs points (obstacles, cones, barrels, traffic) is ever placed on it or allowed to drive
// into it, so there is always at least one way through without losing a point. Pure: no DOM,
// no game state.
import { materialFor } from './materials.js';

export const LINE = {
  playerHalfW: 0.14,   // the widest car's half-width (src/main.js playerHalfW)
  margin: 0.07,        // breathing room either side of the car
  maxCentre: 0.42,     // the line stays this far inside the walls (player wall at ±0.72)
  gap: 14000,          // sim Z between line waypoints
  maxStep: 0.4,        // most the line moves between waypoints
  minLateral: 0.55,    // lane units/s the slowest car can always steer (handling: keep ≥ this)
  topWorldSpeed: 11500, // sim Z/s at the fastest speed in the game (≈140 mph on TURBO pace)
  startClear: 3000,    // nothing that costs points this close to the start
  shoulder: 0.84,      // traffic may pull onto the shoulder to keep the line clear
  section: 26000,      // rhythm section length (normal → dense → breather → normal)
};

/** Deterministic hash → [0, 1). */
function unit(seed, k) {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 0x632be5ab, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** The racing line for one race. `centreAt(z)` is its lateral offset at track Z. */
export function createLine(seed = 1) {
  const w = [0, 0]; // waypoints; the first two sit on the centre so the grid starts on the line
  const wp = (k) => {
    while (w.length <= k) {
      const prev = w[w.length - 1];
      const target = (unit(seed, w.length) * 2 - 1) * LINE.maxCentre;
      w.push(prev + Math.max(-LINE.maxStep, Math.min(LINE.maxStep, target - prev)));
    }
    return w[k];
  };
  return {
    seed,
    centreAt(z) {
      if (!(z > 0)) return 0;
      const f = z / LINE.gap;
      const k = Math.floor(f);
      const t = f - k;
      const a = wp(k);
      return a + (wp(k + 1) - a) * t * t * (3 - 2 * t);
    },
    /** How far a body (half-width, half-length) is outside the line's keep-out; ≥ 0 is clear. */
    clearance(z, offset, halfW, halfL = 0) {
      const need = halfW + LINE.playerHalfW + LINE.margin;
      let m = Math.abs(offset - this.centreAt(z)) - need;
      if (halfL > 0) {
        m = Math.min(m, Math.abs(offset - this.centreAt(z - halfL)) - need, Math.abs(offset - this.centreAt(z + halfL)) - need);
      }
      return m;
    },
    isClear(z, offset, halfW, halfL = 0) { return this.clearance(z, offset, halfW, halfL) >= 0; },
  };
}

/**
 * Hazard density at Z (0 = breather). Sections repeat normal → dense → breather → easy, and
 * the whole thing grows gently with level and wave.
 */
export function densityAt(z, level = 0, wave = 1) {
  if (z < LINE.startClear) return 0;
  const phase = Math.floor(z / LINE.section) % 4;
  const base = [1, 1.25, 0, 0.85][phase];
  return base * (0.75 + 0.07 * Math.max(0, level | 0)) * Math.min(1.3, 1 + 0.05 * Math.max(0, (wave | 0) - 1));
}

/** Start of the next section with any hazards at or after z. */
function pastBreather(z, level, wave) {
  let zz = z;
  for (let n = 0; n < 4 && densityAt(zz, level, wave) === 0; n++) {
    zz = (Math.floor(zz / LINE.section) + 1) * LINE.section + 1;
  }
  return zz;
}

const OBSTACLE_TYPES = ['PINE_TREE_HAZARD', 'LOW_LASER_BAR', 'PINE_TREE_HAZARD', 'HIGH_LIGHT_GATE', 'HOLO_BARRIER'];
const OBSTACLE_LANES = [-0.46, 0, 0.46];
const TRAFFIC_LANES = [-0.48, 0.48, -0.2, 0.2];

/**
 * Where every hazard goes. main.js (LiveTraffic) and the tests drive the same planner, so the
 * clean-line property test checks the code the game runs. `rand` is the race's traffic RNG.
 */
export function createHazardPlanner({ line, rand = Math.random, level = 0, avoid = null }) {
  // `avoid(z0, z1)` → true where set pieces (loops, gaps, ramps, half-pipes) live: no hazards there.
  const blocked = (z0, z1) => Boolean(avoid && avoid(z0, z1));
  return {
    line,
    /** Base spacing between the recycled obstacles, before density. */
    obstacleGap: 5200,

    /** The next spot for obstacle slot `i` at or after `fromZ`: { type, z, offset }. */
    placeObstacle(i, fromZ, wave = 1) {
      const type = OBSTACLE_TYPES[(i + wave) % OBSTACLE_TYPES.length];
      const m = materialFor(type);
      let z = pastBreather(fromZ, level, wave);
      const pref = (i * 7 + wave) % 3;
      for (let tries = 0; tries < 40; tries++) {
        if (!blocked(z - m.halfL - 600, z + m.halfL + 600)) {
          for (let k = 0; k < 3; k++) {
            const offset = OBSTACLE_LANES[(pref + k) % 3];
            if (line.isClear(z, offset, m.halfW, m.halfL)) return { type, z, offset };
          }
        }
        z = pastBreather(z + 1500, level, wave);
      }
      return null; // unreachable in practice (some lane is always clear); the caller parks it
    },

    /** Spacing to the next obstacle after one at z. */
    obstacleSpacing(z, wave = 1) {
      const d = densityAt(z, level, wave);
      return this.obstacleGap / Math.max(0.4, d || 0.4);
    },

    /**
     * A prop pattern at z (cones and barrels), built around the line: a cone wall closes the
     * half of the road the line isn't on, a cone gate is threaded by the line, barrels huddle on
     * the far side. Returns { items: [{ type, z, offset }], nextZ }.
     */
    planProps(z0, wave = 1) {
      const items = [];
      const z = pastBreather(z0, level, wave);
      if (blocked(z - 600, z + 1400)) return { items, nextZ: z + 2400 };
      const pattern = Math.floor(rand() * 3);
      const c = line.centreAt(z);
      const far = c >= 0 ? -1 : 1; // the side of the road away from the line
      const push = (type, zz, offset) => {
        const m = materialFor(type);
        const o = Math.max(-0.7, Math.min(0.7, offset));
        if (line.isClear(zz, o, m.halfW, m.halfL)) items.push({ type, z: zz, offset: o });
      };
      if (pattern === 0) {
        for (let k = 0; k < 5; k++) push('TRAFFIC_CONE', z + k * 140, far * (0.62 - k * 0.09));
      } else if (pattern === 1) {
        for (let k = 0; k < 3; k++) {
          const cz = line.centreAt(z + k * 220);
          push('TRAFFIC_CONE', z + k * 220, cz - 0.3);
          push('TRAFFIC_CONE', z + k * 220, cz + 0.3);
        }
      } else {
        const lane = far * 0.5;
        push('OIL_BARREL', z, lane - 0.08);
        push('OIL_BARREL', z, lane + 0.08);
        push('OIL_BARREL', z + 110, lane);
      }
      const d = densityAt(z, level, wave) || 0.4;
      return { items, nextZ: z + (9000 + rand() * 6000) / Math.max(0.4, d) };
    },

    /** A clear lane for traffic car `i` spawning at z (checked over the stretch ahead of it). */
    trafficLane(i, z, wave, halfW, halfL) {
      const pref = (i + wave) % 4;
      for (let k = 0; k < 4; k++) {
        const o = TRAFFIC_LANES[(pref + k) % 4];
        if (this.trafficClear(z, o, halfW, halfL)) return o;
      }
      const c = line.centreAt(z);
      return c >= 0 ? -LINE.shoulder : LINE.shoulder;
    },

    trafficClear(z, offset, halfW, halfL) {
      return line.isClear(z, offset, halfW, halfL) && line.isClear(z + 2500, offset, halfW, halfL);
    },

    /**
     * Where a traffic car at (z, offset) should steer: stay put while clear, otherwise the
     * nearest clear lane (or shoulder) on the same side of the line. It never crosses the line.
     */
    trafficTarget(z, offset, halfW, halfL) {
      if (this.trafficClear(z, offset, halfW, halfL)) return offset;
      const c = line.centreAt(z);
      const side = offset >= c ? 1 : -1;
      let best = side * LINE.shoulder;
      let bestD = Infinity;
      for (let k = 0; k < TRAFFIC_LANES.length; k++) {
        const o = TRAFFIC_LANES[k];
        if ((o - c) * side <= 0 || !this.trafficClear(z, o, halfW, halfL)) continue;
        const d = Math.abs(o - offset);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    },
  };
}

/** How fast traffic changes lanes to keep the line clear (lane units/s). */
export const TRAFFIC_LATERAL = 0.6;
