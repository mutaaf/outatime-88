// Rival radio (0277), pure: each crew's own trash talk, one short line on a pass or a takedown.
// `by` = they pass you, `lost` = you pass them, `down` = you took them down. All lines are
// invented for this game (invariant 3.7). The glue (src/radio-run.js) feeds racers in and shows a
// line through the one announcement channel; this file only decides which line and when.

export const RADIO = {
  'Chrono Crew': { by: ['CATCH US LAST WEEK!', "WE'RE AHEAD OF OUR TIME"], lost: ["WE'LL GO BACK FOR THAT"], down: ["THE CLOCK'S ALL BENT!"] },
  'Southside Family': { by: ['FAMILY GOES FIRST!', 'MOVE OVER, ROOKIE'], lost: ['ENJOY IT WHILE IT LASTS'], down: ['HEY! MY BUMPER!'] },
  'Harbor Tuners': { by: ['TUNED BETTER, KID', 'CATCH ME AT THE DOCKS'], lost: ['LUCKY GEAR CHANGE'], down: ["THAT'S A FRESH WRAP!"] },
  'The Gridline': { by: ['STAY IN YOUR LANE', 'WE OWN THE GRID'], lost: ['RECALCULATING…'], down: ['SIGNAL LOST!'] },
  'Night Sentinel Foundation': { by: ['THE NIGHT SEES ALL', 'PATROL IS OVER, CITIZEN'], lost: ['NOTED. FOR LATER.'], down: ['SENTINEL DOWN!'] },
  'Takamura Racing': { by: ['CLEAN LINE. MINE.', 'TOO SOFT ON THE APEX'], lost: ['NICE BRAKING. ONCE.'], down: ['OUT OF LINE!'] },
  'Mountain Pass Night Crew': { by: ['DRIFT LIKE YOU MEAN IT', 'SEE YOU ON THE PASS'], lost: ['THAT WAS MY HAIRPIN'], down: ['INTO THE GUARDRAIL?!'] },
  'Outback Wastes': { by: ['DUST IN YOUR GRILLE!', "THE ROAD'S MINE, MATE"], lost: ['FINE, TAKE THE DIRT'], down: ['MY POOR ENGINE!'] },
  'The Fix-It Four': { by: ["HORN'S BROKEN, MOVE IT", "TANK DOESN'T BRAKE"], lost: ["WE'LL WELD THAT LATER"], down: ['PASS THE WRENCH!'] },
  'Turbine Speedway Club': { by: ['FLOOR IT, DARLING', "SPARKS FLY, YOU DON'T"], lost: ['ROTOR NEEDS A TWEAK'], down: ['TURBINE STALLED!'] },
  'Voss Dynamics': { by: ['LUMEN CALLED THAT PASS', 'EFFICIENCY: OURS'], lost: ['LUMEN, EXPLAIN THAT'], down: ['SYSTEMS OFFLINE!'] },
  'Ion Coast Motors': { by: ['SILENT AND GONE!', 'FULL CHARGE, BYE!'], lost: ['RUNNING LOW…'], down: ['FUSE BLOWN!'] },
};

/** Timing (seconds of race clock): `gap` between lines, `delay` after the event (the position
 *  callout settles at 0.6 s and speaks first), `stale` = dropped if the channel stays busy, and no
 *  event counts in the first `start` seconds after GO (the grid roll-out and the GO hold). */
export const RADIO_T = { gap: 6, delay: 0.9, stale: 5, start: 4 };

/** The line for this crew and event: the `n`th line of the race, picked by a hash of the race seed
 *  (deterministic, and the race RNG is never touched). Null for a crew with no lines. */
export function radioLine(crew, kind, seed, n) {
  const lines = RADIO[crew] && RADIO[crew][kind];
  if (!lines) return null;
  let h = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(n + 1, 0xc2b2ae35)) | 0;
  h ^= h >>> 15;
  return lines[(h >>> 0) % lines.length];
}

/** Per-race memory: which side of you each rival was on, who was down, the one pending line. */
export function createRadio() {
  return { racers: null, ahead: [], down: [], pending: null, at: 0, last: -1e9, n: 0 };
}

const note = (s, r, kind, t) => { s.pending = r; s.kind = kind; s.at = t; };

/**
 * One frame of events. `racers` are the rival bodies (progress, takenDown, finishTime, crew);
 * `dist` is your distance on the same scale; `t` the race clock. A new racers array (a new race)
 * resets the memory without speaking. Allocation-free after the first frame of a race.
 */
export function radioEvents(s, racers, dist, t) {
  if (s.racers !== racers) {
    s.racers = racers; s.pending = null; s.last = -1e9; s.n = 0;
    s.ahead.length = s.down.length = 0;
    for (let i = 0; i < racers.length; i++) { s.ahead.push(racers[i].progress > dist); s.down.push(!!racers[i].takenDown); }
    return;
  }
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    const ahead = r.progress > dist, down = !!r.takenDown;
    const live = t >= RADIO_T.start && r.finishTime == null;
    if (down && !s.down[i]) { if (live) note(s, r, 'down', t); }
    else if (!down && !s.down[i] && ahead !== s.ahead[i] && live) note(s, r, ahead ? 'by' : 'lost', t);
    s.ahead[i] = ahead; s.down[i] = down;
  }
}

/**
 * The pending event if it may speak now: `busy` = the channel is taken or the moment is wrong
 * (warp, crash). Waits `delay`, holds back while busy or within `gap` of the last line, and drops
 * the event once it is `stale`. A newer event replaces a pending one. Returns the rival, or null.
 */
export function radioReady(s, t, busy) {
  const r = s.pending;
  if (!r) return null;
  if (t - s.at > RADIO_T.stale) { s.pending = null; return null; }
  if (busy || t - s.at < RADIO_T.delay || t - s.last < RADIO_T.gap) return null;
  s.pending = null; s.last = t; s.n++;
  return r;
}
