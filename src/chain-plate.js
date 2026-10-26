// One growing plate for a dodge chain (ticket 0205), pure. While the chain's plate is still up
// (GameState.hitShockwaves), the next chain event folds into it instead of stacking another one:
// its points add up, it shows the latest multiplier, its life restarts with a pop, and it moves to
// the newest end of the list so it hangs nearest the car. Imported only by the lazy race step.

/** The live chain plate in `list`, updated for `pts` more at multiplier `combo`, or null. */
export function foldChain(list, pts, combo) {
  let i = 0;
  while (i < list.length && !(list[i].chain && list[i].life > 0)) i++;
  if (i === list.length) return null;
  const sw = list[i];
  for (; i < list.length - 1; i++) list[i] = list[i + 1];
  list[i] = sw;
  // A crash in between dropped the multiplier: that is a new chain, so the tally starts again.
  sw.total = (combo < sw.combo ? 0 : sw.total) + pts;
  sw.combo = combo;
  sw.life = sw.maxLife;
  sw.merged = true;
  return sw;
}

/** Marks a freshly spawned plate as the chain's, worth `pts` at `combo`. */
export function startChain(sw, pts, combo) {
  sw.chain = true; sw.total = pts; sw.combo = combo; sw.merged = false;
  return sw;
}

/** The chain plate's text: the latest move, the running total and multiplier, the near-miss count. */
export const chainLabel = (reason, total, combo, chain) =>
  `${reason} +${total} (x${combo})${chain > 1 ? ` · NEAR-MISS x${chain}` : ''}`;
