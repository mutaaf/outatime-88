// Flash budget (ticket 0234), pure, race-step chunk only: WCAG 2.3.1 allows at most three flashes
// in any one second, and the Xbox guideline counts a flash over ~20% of the screen. Every large
// flash (the warp flash and the era sky wash with it, the storm-bolt wash) asks allowFlash() once
// as it fires; a refused one shows its calm-motion fallback instead (under the 0.1 flash line).
// Layers that light within 100 ms of each other are one flash, the way a player sees them.
// `now` is the race clock in ms (raceTime × 1000): it stops with the sim, so a lagging device only
// spreads flashes out; every race start resets it (race-step resetNos). Calm motion never asks:
// its flashes are already under the line. The warp's chromatic split and 3D bloom follow warpLit too.

export const FLASH = { area: 0.2, max: 3, window: 1000, merge: 100 };

/** Totals since the last reset, for tests (?debug: GameState.flashLog). */
export const flashLog = { allowed: 0, refused: 0 };

const lit = [-1e9, -1e9, -1e9]; // when the last FLASH.max allowed flashes began
let head = 0, lastAt = -1e9, lastOk = true;

/** May a flash covering `area` (0..1 of the screen) fire at `now` ms? Small flashes always may. */
export function allowFlash(now, area) {
  if (!(area >= FLASH.area)) return true;
  if (now < lastAt) resetFlashBudget(true); // a clock that went back is a new race
  if (now >= lastAt && now - lastAt < FLASH.merge) return lastOk;
  let n = 0;
  for (let i = 0; i < FLASH.max; i++) { const d = now - lit[i]; if (d >= 0 && d < FLASH.window) n++; }
  lastAt = now;
  lastOk = n < FLASH.max;
  if (lastOk) { lit[head] = now; head = (head + 1) % FLASH.max; flashLog.allowed++; } else flashLog.refused++;
  return lastOk;
}

/** A new race (its clock starts at 0): forget the last race's flashes. `keepLog` keeps the totals. */
export function resetFlashBudget(keepLog) {
  lit.fill(-1e9); head = 0; lastAt = -1e9; lastOk = true;
  if (!keepLog) flashLog.allowed = flashLog.refused = 0;
}
