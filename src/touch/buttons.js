// Action-button hit testing and the slide-between-buttons rule (ticket 0061). Pure.

/**
 * Nearest button whose circle (plus `slop` px of forgiveness) contains the point, or null.
 * `buttons` is an array of { id, cx, cy, r, enabled }. Nearest-centre wins where slop regions
 * overlap, so a thumb landing between two buttons gets the one it is closer to.
 */
export function hitButton(buttons, x, y, slop = 0) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b.enabled) continue;
    const d = Math.hypot(x - b.cx, y - b.cy);
    if (d <= b.r + slop && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/**
 * What a finger that is already down does when it moves onto `next` (Fortnite-style slide):
 * release the button it was on (if any) and press the new one, but only between buttons that
 * allow sliding. Moving off every button keeps the last one held (a thumb rolling off the
 * edge of DRIFT shouldn't cut the drift). Returns { release, press } ids (or null).
 */
export function slideTransition(currentId, next, slidable) {
  if (!next || next.id === currentId) return NO_CHANGE;
  if (!slidable(next.id) || (currentId && !slidable(currentId))) return NO_CHANGE;
  return { release: currentId, press: next.id };
}
const NO_CHANGE = Object.freeze({ release: null, press: null });
