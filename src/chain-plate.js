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

/**
 * Same-text impacts fold into one plate (ticket 0241). `sw` is a fresh hit entry about to be pushed
 * on `list`; if a live plate with the same text landed under `within` s ago, `sw` takes over its text
 * slot (keeping the slot it holds, with the merge pop), the text gains a count (×2, ×3…) and the old
 * entry keeps only its ring. Rings, sparks, damage and score are untouched. Returns true if folded.
 */
export function foldRepeat(list, sw, within) {
  const base = sw.base || (sw.base = sw.label);
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e.label || e.gone || e.base !== base || !(e.life > 0) || e.maxLife - e.life >= within) continue;
    sw.reps = (e.reps || 1) + 1;
    sw.label = `${base} ×${sw.reps}`;
    sw.slot = e.slot; sw.merged = true;
    e.label = null;
    return true;
  }
  return false;
}
