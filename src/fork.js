// Fork cue (ticket 0019): a fork is two compact arrows, a word each (index.html
// #forkLeftCard/#forkRightCard), never a banner, so the announcer stays the one big text on
// screen. Pure: the sim decides, main.js toggles the DOM only when the state changes.

/** Which branch the player is lined up for (the same rule the fork's outcome uses). */
export function forkLean(playerX) {
  return playerX < 0 ? 'LEFT' : 'RIGHT';
}

/** The cue state for this step: 'OFF', 'LEFT' or 'RIGHT'. */
export function forkCueState(onFork, playerX) {
  return onFork ? forkLean(playerX) : 'OFF';
}
