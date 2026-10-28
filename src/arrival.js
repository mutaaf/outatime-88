// Arrival stretches (ticket 0218): the first warp of a run lands somewhere authored. When it
// fires, the next road the race builds is a short hand-made stretch for the era it landed in, and
// then the generator carries on exactly where it was (the shuffle bag, forks and checkpoints are
// untouched, they only start later). Solo races only: a live room or a daily must be the same road
// for everyone, and players warp at different moments.
// Pure, and only the lazy race step imports it (the table stays out of the startup bundle). It is
// handed the track's builders, so it never imports src/track.js itself.

/**
 * One stretch per era id (1985 is the first; other eras are their own tickets). `rows` are the
 * authored sections, built in order with track.js addRoadSection:
 * [enter, hold, leave, curve, rise, bank] (segments, segments, segments, curve, world Y, bank).
 * `straight` marks the rows lined with signs.
 */
export const ARRIVALS = {
  // 1985 · Cedar Ridge at night: settle after the tunnel, a long gentle sweeper to the right,
  // then a short straight past the mall signs with every lane open.
  1985: {
    rows: [
      [4, 6, 4, 0, 0, 0],
      [10, 24, 10, 0.55, 140, 0.12],
      [6, 8, 6, 0.22, -60, 0.05],
      [4, 6, 4, 0, -80, 0],
      [0, 18, 0, 0, 0, 0],
      [4, 6, 4, -0.12, 0, -0.03],
      [4, 6, 4, 0, 0, 0],
    ],
    straight: 3, // rows from here on are the straight
  },
};

/** Segments in era `id`'s stretch (0 if it has none). */
export function arrivalLength(id) {
  const a = ARRIVALS[id];
  let n = 0;
  if (a) for (const r of a.rows) n += r[0] + r[1] + r[2];
  return n;
}

/**
 * Called on every warp. Queues the stretch on `run` (track.run: replaced whenever the road is
 * reset, so a new race starts with nothing queued) when this is the run's first warp, the race
 * is not shared (live room, daily, or any seeded road) and the era has a stretch. Returns
 * whether it queued.
 */
export function queueArrival(run, eraId, { warps, shared, seed }) {
  if (warps !== 1 || shared || seed || run.arrivalDone || !ARRIVALS[eraId]) return false;
  run.arrivalDone = true;
  run.arrival = String(eraId);
  return true;
}

/**
 * Build the queued stretch at the end of the road (instead of the next generated biome) and
 * return it as { era, z0, z1 } (also kept on run.arrivalAt), or null if nothing is queued.
 * `t` = { track, addRoadSection, addItem, segLength }. Every segment shares one ARRIVAL feature,
 * so nothing that keeps set pieces clean places an obstacle, prop or hazard on it
 * (hasSetPieceBetween) and traffic steps off it like it does off a loop; no pickups either.
 * Roadside only: lamps along the whole stretch, the era's own boards (never sold, docs/ADS.md)
 * alternating sides along the straight, all outside the rails.
 */
export function buildArrival(t) {
  const { track, addRoadSection, addItem, segLength } = t;
  const run = track.run;
  const era = run.arrival;
  const a = era ? ARRIVALS[era] : null;
  run.arrival = '';
  if (!a) return null;
  const i0 = track.end;
  let straightAt = i0;
  for (let r = 0; r < a.rows.length; r++) {
    if (r === a.straight) straightAt = track.end;
    const [enter, hold, leave, curve, rise, bank] = a.rows[r];
    addRoadSection(enter, hold, leave, curve, rise, bank);
  }
  const z0 = i0 * segLength, z1 = track.end * segLength;
  const feature = { id: z0 + 1, kind: 'ARRIVAL', z0, length: z1 - z0 };
  for (let i = i0; i < track.end; i++) {
    const seg = track.seg(i);
    seg.feature = feature;
    const k = i - i0;
    if (k % 4 === 0) { addItem(seg, -1.42, 'STREET_LAMP'); addItem(seg, 1.42, 'STREET_LAMP'); }
    if (i >= straightAt && k % 6 === 3) addItem(seg, (((i - straightAt) / 6) | 0) % 2 ? -1.42 : 1.42, 'CLOCK_TOWER_BILLBOARD');
  }
  run.arrivalAt = { era, z0, z1 };
  return run.arrivalAt;
}
