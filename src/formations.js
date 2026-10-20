// Traffic formations (ticket 0027). Civilian traffic arrives in readable patterns instead of
// one car at a random lane: a staggered pair, a slalom, a convoy, a gate you thread, a wall
// with one gap. Harder patterns unlock with the wave. Pure: no DOM, no game state.
//
// A formation is a list of cars, each `dz` sim units ahead of the formation's head and on a
// `side` of the racing line (-1 left, +1 right, 0 either), or `follow`ing an earlier car's lane.
// The stream hands formations out one car at a time as traffic slots free (LiveTraffic has a
// fixed pool), and its head moves with the traffic so the shape holds. Every car must be clear
// of the racing line (src/cleanline.js), so the line is always the open lane.

export const FORMATION_LANES = [-0.48, -0.2, 0.2, 0.48];

export const FORMATIONS = [
  { id: 'SOLO', wave: 1, mph: 42, cars: [{ dz: 0, side: 0 }] },
  { id: 'STAGGER', wave: 1, mph: 42, cars: [{ dz: 0, side: -1 }, { dz: 1600, side: 1 }] },
  { id: 'CONVOY', wave: 2, mph: 40, cars: [{ dz: 0, side: 0 }, { dz: 700, follow: 0 }, { dz: 1400, follow: 0 }] },
  { id: 'SLALOM', wave: 2, mph: 44, cars: [{ dz: 0, side: -1 }, { dz: 1500, side: 1 }, { dz: 3000, side: -1 }] },
  { id: 'GATE', wave: 3, mph: 44, cars: [{ dz: 0, side: -1 }, { dz: 0, side: 1 }] },
  { id: 'WALL', wave: 4, mph: 40, cars: [{ dz: 0, side: -1 }, { dz: 0, side: 1 }, { dz: 0, side: 0 }] },
];

/** Cars closer than this in Z share a row: side by side, not one behind the other. */
export const ROW_DZ = 400;
/** Side-by-side cars keep this much air between their sides (lane units). */
const ROW_AIR = 0.02;
/** The widest traffic car's half-width (the 18-wheeler). */
const WIDEST = 0.16;

/** Formations a wave may draw (wave 1 gets only the gentle ones). */
export function formationsFor(wave = 1) {
  const w = Math.max(1, wave | 0);
  return FORMATIONS.filter((f) => f.wave <= w);
}

/** Draw one formation for this wave with the race's traffic RNG. */
export function pickFormation(rand, wave = 1) {
  const pool = formationsFor(wave);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** The formation's length from its head to its last car. */
export function formationSpan(f) {
  let s = 0;
  for (let i = 0; i < f.cars.length; i++) if (f.cars[i].dz > s) s = f.cars[i].dz;
  return s;
}

/**
 * A seeded stream of formations. `line` is the race's racing line (centreAt), `clear(z, offset,
 * halfW, halfL)` says a traffic car there keeps the line clear, `avoid(z0, z1)` marks set pieces.
 */
export function createFormationStream({ rand, line, clear, avoid = null, shoulder = 0.84 }) {
  let cur = null;
  const stream = {
    /** Formations started so far, newest last (ids; the e2e and ?debug read it). */
    log: [],
    get current() { return cur; },

    /** Move the pending formation's head with its traffic (they cruise at mph + mphBonus). */
    advance(dt, speedToWorld, mphBonus = 0) { if (cur) cur.z += (cur.f.mph + mphBonus) * speedToWorld * dt; },

    /** Start a formation at or after headZ. */
    start(headZ, wave) {
      const f = pickFormation(rand, wave);
      const mirror = rand() < 0.5 ? -1 : 1;
      const span = formationSpan(f);
      let z = headZ;
      for (let k = 0; k < 20 && avoid && avoid(z - 600, z + span + 600); k++) z += 2000;
      cur = { f, mirror, z, next: 0, offsets: [] };
      stream.log.push(f.id);
      if (stream.log.length > 32) stream.log.shift();
      return cur;
    },

    /** Lane for car `ci` of the current formation at z, or null if none fits. */
    laneFor(ci, z, halfW, halfL) {
      const car = cur.f.cars[ci];
      if (car.follow != null) {
        const o = cur.offsets[car.follow];
        if (o != null && clear(z, o, halfW, halfL)) return o;
        return null;
      }
      const c = line.centreAt(z);
      const side = car.side * cur.mirror;
      let n = 0;
      let pick = null;
      for (let k = 0; k < FORMATION_LANES.length; k++) {
        const o = FORMATION_LANES[k];
        if (side < 0 && o >= c) continue;
        if (side > 0 && o <= c) continue;
        if (!clear(z, o, halfW, halfL)) continue;
        let ok = true;
        for (let j = 0; j < ci; j++) {
          const mate = cur.offsets[j];
          if (mate == null || Math.abs(cur.f.cars[j].dz - car.dz) >= ROW_DZ) continue;
          if (Math.abs(mate - o) < halfW + WIDEST + ROW_AIR) { ok = false; break; }
        }
        if (!ok) continue;
        // Reservoir pick among the lanes that fit, drawn from the race's seeded RNG.
        n++;
        if (pick === null || rand() * n < 1) pick = o;
      }
      // No lane on that side of the line: the shoulder keeps the shape (traffic may use it).
      if (pick === null && side !== 0) {
        const o = side * shoulder;
        if ((o - c) * side > 0 && clear(z, o, halfW, halfL)) pick = o;
      }
      return pick;
    },

    /**
     * Where the next freed traffic car goes: { z, offset, mph, id }. `aheadZ` is the farthest
     * traffic ahead (or the spawn horizon), `minZ` the nearest a car may appear without popping in.
     */
    spawn({ aheadZ, minZ, wave = 1, halfW, halfL, gapScale = 1 }) {
      for (let tries = 0; tries < 3; tries++) {
        if (!cur || cur.next >= cur.f.cars.length || cur.z + cur.f.cars[cur.next].dz < minZ) {
          stream.start(aheadZ + (4800 + rand() * 2200) * gapScale, wave);
        }
        while (cur.next < cur.f.cars.length) {
          const ci = cur.next++;
          const z = cur.z + cur.f.cars[ci].dz;
          const o = stream.laneFor(ci, z, halfW, halfL);
          cur.offsets[ci] = o;
          if (o !== null) return { z, offset: o, mph: cur.f.mph, id: cur.f.id };
        }
      }
      // Nothing fits (a narrow stretch): park on the shoulder away from the line, as before.
      const z = cur.z;
      return { z, offset: line.centreAt(z) >= 0 ? -shoulder : shoulder, mph: cur.f.mph, id: cur.f.id };
    },
  };
  return stream;
}
