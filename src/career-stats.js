// Career stats sheet (ticket 0278), pure. The counters live in the one save key's `career`
// (invariant 6): races, wins and warps are already counted by recordRace (src/cars.js); this
// adds the best near-miss chain and the total distance, folded in at race end by race-flow.
// Reads never trust the save: a missing, old or corrupt field shows as zero and never throws.
// Imported only by race-flow (recordStats) and the settings-panel chunk (statRows), not main.

const MI = 1609.344; // GameState.distance is metres

/** A save field as a whole count ≥ 0; anything else (missing, NaN, negative, an object) is 0. */
const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const career = (save) => (save && save.career && typeof save.career === 'object' ? save.career : {});

/** The five counters the sheet shows, always numbers. */
export function careerStats(save) {
  const c = career(save);
  return { races: count(c.races), wins: count(c.wins), warps: count(c.warps), bestChain: count(c.bestChain), distanceM: count(c.distanceM) };
}

/** Folds one finished race in: `chain` (the best near-miss chain it saw), `distance` (metres). */
export function recordStats(save, { chain, distance } = {}) {
  if (!save) return;
  if (!save.career || typeof save.career !== 'object') save.career = {};
  const c = save.career;
  c.bestChain = Math.max(count(c.bestChain), count(chain));
  c.distanceM = count(c.distanceM) + count(Math.round(Number(distance) || 0));
}

/** Total distance in miles: one decimal under 100, whole miles with separators above. */
export function milesText(m) {
  const mi = count(m) / MI;
  return `${mi < 100 ? mi.toFixed(1) : Math.round(mi).toLocaleString('en-US')} MI`;
}

/** [label, value] rows for the sheet, in reading order. */
export function statRows(save) {
  const s = careerStats(save);
  const n = (v) => v.toLocaleString('en-US');
  return [['RACES', n(s.races)], ['WINS', n(s.wins)], ['WARPS', n(s.warps)], ['BEST CHAIN', n(s.bestChain)], ['DISTANCE', milesText(s.distanceM)]];
}
