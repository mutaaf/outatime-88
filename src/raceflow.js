// A real race (ticket 0051): a named field of six, three laps to a finish line, live
// standings with gaps, and a finish order with times for every racer. Pure functions over
// plain numbers so the rules are unit-testable; main.js moves the cars, src/hud.js draws.
//
// Units: "progress" is the same unit as GameState.distance (mph × seconds), so a car doing
// 100 mph gains 100 progress per second and a gap in progress / mph is a gap in seconds.

export const RACE_LAPS = 3;
export const FIELD_SIZE = 6; // you + five rivals

/**
 * Race length per level. Measured 2026-10-17 (Playwright, level 1): holding only the gas
 * and hitting things averages ~57 mph and covers ~5,100 in 90 s, so it still reaches the
 * line inside the 100 s cap; a clean ~90 mph run finishes in about a minute.
 */
export const raceLengthFor = (levelIndex) => 5200 + 300 * Math.max(0, levelIndex | 0);

/**
 * Each rival's race pace in mph, fastest first. A clean run (~95 mph average with boosts)
 * wins on NORMAL; ~75 mph is mid-pack; holding the gas into everything (~57) is last.
 * EASY (×0.86) puts a ~80 mph kid on the podium. Difficulty: src/settings.js DIFFICULTY.
 */
export const RIVAL_PACES = [92, 86, 80, 74, 68];

/**
 * Rival speed this frame. Rivals run their own pace, with a soft rubber band so the race
 * stays a race: one that falls far behind you pushes, one far ahead eases off.
 * @param pace  the rival's race pace (mph, difficulty applied)
 * @param lead  rival progress minus yours (positive = rival ahead)
 */
export function rivalTargetMph(pace, lead) {
  if (lead < -220) return pace + 26;
  if (lead < -60) return pace + 10;
  if (lead > 700) return pace - 18;
  if (lead > 350) return pace - 8;
  return pace;
}

/** Grid slots front to back: two columns, rows 650 world units apart, you start at the back. */
export function gridSlot(slot) {
  const row = Math.floor(slot / 2);
  return { dz: 2600 - row * 650, offset: slot % 2 === 0 ? -0.36 : 0.36 };
}

/** { lap: 1..laps, frac: 0..1 through the whole race }. */
export function lapOf(progress, length, laps = RACE_LAPS) {
  const frac = Math.max(0, Math.min(1, progress / length));
  return { lap: Math.min(laps, Math.floor(frac * laps) + 1), frac };
}

/**
 * Standings: finished racers by finish time, then everyone else by progress.
 * @param entries [{ id, progress, finishTime|null }]
 * @returns new array, leader first
 */
export const standings = (entries) => sortStandings(entries.slice());

const byStanding = (a, b) => {
  const fa = a.finishTime != null, fb = b.finishTime != null;
  if (fa && fb) return a.finishTime - b.finishTime;
  if (fa !== fb) return fa ? -1 : 1;
  return b.progress - a.progress;
};
/** Same order as standings(), sorted in place (the per-frame path allocates nothing). */
export function sortStandings(arr) {
  // Insertion sort: six cars, nearly sorted frame to frame, no comparator closure per call.
  for (let i = 1; i < arr.length; i++) {
    const x = arr[i];
    let j = i - 1;
    while (j >= 0 && byStanding(arr[j], x) > 0) { arr[j + 1] = arr[j]; j--; }
    arr[j + 1] = x;
  }
  return arr;
}

const SUFFIX = ['TH', 'ST', 'ND', 'RD'];
/** 1 → '1ST', 2 → '2ND', 11 → '11TH', 22 → '22ND'. */
export function ordinal(n) {
  const v = n % 100;
  return `${n}${(v >= 11 && v <= 13) ? 'TH' : (SUFFIX[n % 10] || 'TH')}`;
}

/** Seconds a progress gap is worth at a speed (never divides by a standing start). */
export const gapSeconds = (gap, mph) => Math.abs(gap) / Math.max(30, mph);

/** '0.8s', '12.4s', '1:03.2' */
export function formatGap(seconds) {
  if (seconds >= 60) return formatRaceTime(seconds);
  return `${seconds.toFixed(1)}s`;
}

/** Race clock as m:ss.t */
export function formatRaceTime(seconds) {
  const tenths = Math.round(Math.max(0, seconds) * 10); // round once, so 9.96 → 0:10.0
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** When a car still on track would cross the line at its pace. */
export const projectedFinish = (elapsed, progress, length, mph) =>
  elapsed + Math.max(0, length - progress) / Math.max(30, mph);

/** The exact moment a car crossed the line inside a frame (linear within the frame). */
export function crossingTime(elapsedEnd, dt, before, after, length) {
  if (after <= before) return elapsedEnd;
  const k = Math.max(0, Math.min(1, (length - before) / (after - before)));
  return elapsedEnd - dt + k * dt;
}

/** Points for where you finish (added to the run score at the line). */
export const FINISH_BONUS = [250000, 150000, 100000, 60000, 40000, 20000];
export const finishBonus = (position) => FINISH_BONUS[position - 1] || 0;

/** Who is directly ahead of and behind `id` in a standings array, with the gap in seconds. */
export function neighbours(order, id, mphOf) {
  const i = order.findIndex((e) => e.id === id);
  if (i < 0) return { ahead: null, behind: null };
  const me = order[i];
  const near = (e) => (e ? { id: e.id, seconds: gapSeconds(e.progress - me.progress, mphOf(me)) } : null);
  return { ahead: near(order[i - 1]), behind: near(order[i + 1]) };
}
