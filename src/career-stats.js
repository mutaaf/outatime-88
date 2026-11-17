// Career stats sheet (ticket 0278), pure. The counters live in the one save key's `career`
// (invariant 6): races, wins and warps are already counted by recordRace (src/cars.js); this
// adds the best near-miss chain and the total distance (`distance`, in GameState.distance units), folded in at race end by race-flow.
// Reads never trust the save: a missing, old or corrupt field shows as zero and never throws.
// Imported only by race-flow (recordStats) and the settings-panel chunk (statRows), not main.

// GameState.distance grows by speed (the speedometer's MPH) × seconds each step, so an hour at
// 1 MPH is 3600 units: miles = distance / 3600, matching what the speedometer said.
const MI = 3600;

/** A save field as a whole count ≥ 0; anything else (missing, NaN, negative, an object) is 0. */
const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const career = (save) => (save && save.career && typeof save.career === 'object' ? save.career : {});

/** The five counters the sheet shows, always numbers. */
export function careerStats(save) {
  const c = career(save);
  return { races: count(c.races), wins: count(c.wins), warps: count(c.warps), bestChain: count(c.bestChain), distance: count(c.distance) };
}

/** Folds one finished race in: `chain` (the best near-miss chain it saw), `distance` (GameState.distance). */
export function recordStats(save, { chain, distance } = {}) {
  if (!save) return;
  if (!save.career || typeof save.career !== 'object') save.career = {};
  const c = save.career;
  c.bestChain = Math.max(count(c.bestChain), count(chain));
  c.distance = count(c.distance) + count(Math.round(Number(distance) || 0));
}

/** A count that fits a small cell: full digits below 100,000, then K, then M. */
export function shortNum(v) {
  const n = count(v);
  if (n < 1e5) return n.toLocaleString('en-US');
  if (n < 1e7) return `${Math.floor(n / 1e3)}K`;
  return `${Math.floor(n / 1e6).toLocaleString('en-US')}M`;
}

/** Total distance in miles: one decimal under 100, then whole (short) miles. */
export function milesText(d) {
  const mi = count(d) / MI;
  return `${mi < 100 ? (Math.floor(mi * 10) / 10).toFixed(1) : shortNum(mi)} MI`;
}

/** [label, value] rows for the sheet, in reading order. */
export function statRows(save) {
  const s = careerStats(save);
  return [['RACES', shortNum(s.races)], ['WINS', shortNum(s.wins)], ['WARPS', shortNum(s.warps)], ['BEST CHAIN', shortNum(s.bestChain)], ['DISTANCE', milesText(s.distance)]];
}
