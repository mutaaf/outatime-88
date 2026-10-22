// Screen-reader place call (ticket 0030): the HUD's position card changes too often to be a live
// region, so a visually hidden line says "Now 3rd of 6" when your place changes, at most once
// every 2 s, and only the latest place once the window has passed. Pure; race-flow wires it.

const GAP_MS = 2000;
const SUFFIX = ['th', 'st', 'nd', 'rd'];

export function placeText(n, total) {
  const v = n % 100;
  return `Now ${n}${(v >= 11 && v <= 13) ? 'th' : (SUFFIX[n % 10] || 'th')} of ${total}`;
}

export function createPlaceCall({ now, write }) {
  let said = 0; // the place last spoken, or the silent baseline (0 = none yet)
  let nextAt = 0;
  return {
    /** speak = the race is on; before that the place only sets the baseline. */
    update(place, total, speak) {
      if (!speak || !said) { said = place; return; } // the grid, or the first place seen, is never news
      if (place === said) return;
      const t = now();
      if (t < nextAt) return;
      said = place;
      nextAt = t + GAP_MS;
      write(placeText(place, total));
    },
    reset() { said = 0; nextAt = 0; },
  };
}
