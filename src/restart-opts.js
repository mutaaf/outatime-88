// RESTART RACE on the pause sheet (0292): which start call re-runs the race you are in, or null
// when a restart makes no sense. Pure, no imports (unit-tested in tests/unit/restart-opts.test.js).
// Solo campaign races and the daily restart; Endless runs, live races and the TV (where the paired
// phone is the pad and has its own menu) do not. The daily re-derives today's seed, so the same
// road comes back; a campaign race keeps GameState.levelIndex and the car you drive.

/** @param G GameState  @param tv true on the TV screen (?tv / ?screen=tv)
 *  @returns {null | { daily: true } | {}} the startNewRace opts, or null when no restart is offered */
export function restartOpts(G, tv = false) {
  if (tv || !G || G.status !== 'PAUSED' || G.mode === 'LIVE') return null;
  if (G.racePhase === 'FINISHED') return null; // the line is crossed: the finish (and its lap bests) is being written, not abandoned
  if (G.daily) return { daily: true };
  if (G.mode === 'INFINITE') return null; // Endless: a run, not an event (PLAY AGAIN after it is quick already)
  return {}; // the campaign event: same level, same car, through the lineup and lights
}
