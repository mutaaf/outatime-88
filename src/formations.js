// Traffic formations (ticket 0027). Civilian traffic arrives in readable patterns instead of
// one car at a random lane: a staggered pair, a slalom, a convoy, a gate you thread, a wall
// with one gap. Harder patterns unlock with the wave. Pure: no DOM, no game state.
//
// A formation is a list of cars, each `dz` sim units ahead of the formation's head and on a
// `side` of the racing line (-1 left, +1 right, 0 either), or `follow`ing an earlier car's lane.
// LiveTraffic parks each car it passes; once enough cars are parked for the next formation,
// the stream places the whole formation at once, a gap beyond the farthest traffic. Every car
// must be clear of the racing line (src/cleanline.js), so the line is always the open lane.

export const FORMATION_LANES = [-0.48, -0.2, 0.2, 0.48];
/**
 * Every formation cruises at this speed: the fastest of the starting traffic (src/main.js), so
 * no car behind a formation is ever faster than it and patterns never run into each other.
 */
export const FORMATION_MPH = 50;

export const FORMATIONS = [
  { id: 'SOLO', wave: 1, cars: [{ dz: 0, side: 0 }] },
  { id: 'STAGGER', wave: 1, cars: [{ dz: 0, side: -1 }, { dz: 1600, side: 1 }] },
  { id: 'CONVOY', wave: 2, cars: [{ dz: 0, side: 0 }, { dz: 700, follow: 0 }, { dz: 1400, follow: 0 }] },
  { id: 'SLALOM', wave: 2, cars: [{ dz: 0, side: -1 }, { dz: 1500, side: 1 }, { dz: 3000, side: -1 }] },
  { id: 'GATE', wave: 3, cars: [{ dz: 0, side: -1 }, { dz: 0, side: 1 }] },
  { id: 'WALL', wave: 4, cars: [{ dz: 0, side: -1 }, { dz: 0, side: 1 }, { dz: 0, side: 0 }] },
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
  let pending = null; // the next formation, drawn ahead so the caller knows how many cars it needs
  let cur = null;     // the formation being placed
  /** Lane o works for car ci: on its side of the line, clear of it, and not touching a row mate. */
  const fits = (ci, o, side, c, z, halfW, halfL) => {
    if ((side < 0 && o >= c) || (side > 0 && o <= c) || !clear(z, o, halfW, halfL)) return false;
    for (let j = 0; j < ci; j++) {
      const mate = cur.offsets[j];
      if (mate == null || Math.abs(cur.f.cars[j].dz - cur.f.cars[ci].dz) >= ROW_DZ) continue;
      if (Math.abs(mate - o) < halfW + WIDEST + ROW_AIR) return false;
    }
    return true;
  };
  const stream = {
    /** Formations placed so far, newest last: { id, want, placed, cars: [[z, offset, halfW, halfL]] } (e2e, ?debug). */
    log: [],

    /** Cars the next formation needs (draws it for this wave if none is waiting). */
    next(wave = 1) {
      if (!pending) pending = { f: pickFormation(rand, wave), mirror: rand() < 0.5 ? -1 : 1 };
      return pending.f.cars.length;
    },

    /** Lane for car `ci` of the formation at z, or null if none fits. */
    laneFor(ci, z, halfW, halfL) {
      const car = cur.f.cars[ci];
      const c = line.centreAt(z);
      let side = car.side * cur.mirror;
      if (car.follow != null) {
        const o = cur.offsets[car.follow];
        if (o != null && clear(z, o, halfW, halfL)) return o;
        if (o == null) return null;
        side = o >= c ? 1 : -1; // the lead's lane closed up: stay on its side of the line
      }
      let n = 0;
      let pick = null;
      for (let k = 0; k < FORMATION_LANES.length; k++) {
        const o = FORMATION_LANES[k];
        if (!fits(ci, o, side, c, z, halfW, halfL)) continue;
        // Reservoir pick among the lanes that fit, drawn from the race's seeded RNG.
        n++;
        if (pick === null || rand() * n < 1) pick = o;
      }
      // No lane there: the shoulder keeps the shape (traffic may use it; the line never gets there).
      if (pick === null) {
        const away = c >= 0 ? -1 : 1;
        for (let k = 0; k < 2 && pick === null; k++) {
          const sd = side || (k === 0 ? away : -away);
          if (fits(ci, sd * shoulder, sd, c, z, halfW, halfL)) pick = sd * shoulder;
        }
      }
      return pick;
    },

    /**
     * Place the waiting formation on `cars` (parked bodies with halfW/halfL, at least next()
     * of them): its head goes a gap beyond `aheadZ` (the farthest traffic) and past any set
     * piece. Returns [{ body, z, offset, mph, id }]; a car with no room is left out.
     */
    place(cars, aheadZ, gapScale = 1) {
      if (!pending) return [];
      const { f, mirror } = pending;
      pending = null;
      const span = formationSpan(f);
      const mph = FORMATION_MPH;
      let head = aheadZ + (4800 + rand() * 2200) * gapScale;
      for (let k = 0; k < 20 && avoid && avoid(head - 600, head + span + 600); k++) head += 2000;
      cur = { f, mirror, offsets: [] };
      const out = [];
      for (let ci = 0; ci < f.cars.length && out.length < cars.length; ci++) {
        const body = cars[out.length];
        const z = head + f.cars[ci].dz;
        const o = stream.laneFor(ci, z, body.halfW, body.halfL);
        cur.offsets[ci] = o;
        if (o !== null) out.push({ body, z, offset: o, mph, id: f.id });
      }
      stream.log.push({ id: f.id, want: f.cars.length, placed: out.length, cars: out.map((p) => [p.z, p.offset, p.body.halfW, p.body.halfL]) });
      if (stream.log.length > 32) stream.log.shift();
      return out;
    },
  };
  return stream;
}
