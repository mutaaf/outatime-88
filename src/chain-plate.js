// One growing plate for a dodge chain (ticket 0205), pure. While the chain's plate is still up
// (GameState.hitShockwaves), the next chain event folds into it instead of stacking another one:
// its points add up, it shows the latest multiplier, its life restarts with a pop, and it moves to
// the newest end of the list. It keeps the label slot it landed in while it grows (src/popups.js,
// 0220): nearest the car when it lands first, never shoved by a pickup. Imported only by the lazy race step.

/**
 * The live chain plate in `list`, updated for `pts` more at multiplier `combo`, or null. `streak`
 * is GameState.dodgeStreak: it only grows inside one chain (a hit or a new race resets it).
 */
export function foldChain(list, pts, combo, streak) {
  let i = 0;
  while (i < list.length && !(list[i].chain && list[i].life > 0)) i++;
  if (i === list.length) return null;
  const sw = list[i];
  for (; i < list.length - 1; i++) list[i] = list[i + 1];
  list[i] = sw;
  // A crash (or a new race) in between reset the streak: that is a new chain, so the tally restarts.
  sw.total = (streak > sw.streak ? sw.total : 0) + pts;
  sw.combo = combo; sw.streak = streak;
  sw.life = sw.maxLife;
  sw.merged = true;
  return sw;
}

/** Marks a freshly spawned plate as the chain's, worth `pts` at `combo` and dodge `streak`. */
export function startChain(sw, pts, combo, streak) {
  sw.chain = true; sw.total = pts; sw.combo = combo; sw.streak = streak; sw.merged = false;
  return sw;
}

/** The chain plate's text: the latest move, the running total and multiplier, the near-miss count. */
export const chainLabel = (reason, total, combo, chain) =>
  `${reason} +${total} (x${combo})${chain > 1 ? ` · NEAR-MISS x${chain}` : ''}`;
