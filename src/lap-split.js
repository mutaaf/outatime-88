// Lap split versus your best (0286), pure and import-free: the rules src/lap-split-run.js applies.
// The save keeps one best time per lap number for each level (`SaveStore.data.bestLaps`,
// { [levelIndex]: [lap1, lap2, lap3] }), so a standing-start first lap is never measured against a
// flying one. Old saves have no `bestLaps` at all; bestLapsFor reads that (and any junk) as no best.

const ok = (t) => typeof t === 'number' && t > 0 && t < Infinity;

/** The saved best for each lap of a level: an array with null where there is none yet. */
export function bestLapsFor(data, key) {
  const all = data && data.bestLaps;
  const row = all && typeof all === 'object' ? all[key] : null;
  return Array.isArray(row) ? row.map((t) => (ok(t) ? t : null)) : [];
}

/** A finished race's laps folded into the saved bests (the faster of each). */
export function foldBest(best, laps) {
  const out = [];
  for (let i = 0; i < Math.max(best.length, laps.length); i++) {
    const a = ok(best[i]) ? best[i] : null, b = ok(laps[i]) ? laps[i] : null;
    out.push(a == null ? b : b == null ? a : Math.min(a, b));
  }
  return out;
}

/** Signed hundredths: "-0.42", "+0.31", "0.00". */
export function splitText(d) {
  const h = Math.round(d * 100);
  return h === 0 ? '0.00' : `${h < 0 ? '-' : '+'}${(Math.abs(h) / 100).toFixed(2)}`;
}

/** Lap time as s.hh, or m:ss.hh past a minute. */
const lapTime = (t) => {
  const h = Math.round(t * 100), m = Math.floor(h / 6000), s = (h - m * 6000) / 100;
  return m ? `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}` : s.toFixed(2);
};

/**
 * The announcement for lap `n` (1-based, just completed) in `lap` seconds against its saved best,
 * or null with no best yet. The glyph and sign carry the meaning; `kind` only picks the colour.
 */
export function lapCall(n, lap, best) {
  if (!ok(best) || !ok(lap)) return null;
  const d = splitText(lap - best);
  const kind = d === '0.00' ? 'even' : d[0] === '-' ? 'gain' : 'loss';
  return { main: `LAP ${n} ${kind === 'gain' ? '▼' : kind === 'loss' ? '▲' : '='} ${d}`, sub: `YOUR BEST ${lapTime(best)}`, kind };
}

/** Only solo campaign races count: not live rooms, endless runs, dailies or TV mode. */
export const lapCounts = (G, tv) => G.mode === 'ARCADE' && !G.daily && !tv;
