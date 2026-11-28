// The browser tab title says PAUSED while the game is paused (ticket 0309): a player scanning
// their tabs can tell a paused race from a running one, and a screen reader hears the state on
// return (WCAG 2.4.2). Any pause counts (Escape, pad START, blur, hidden tab, a menu over the race);
// anything else, the title screen and the results included, shows the page's own title.
// Its own tiny chunk, fetched by the lazy race-late chunk; never part of main.

export const PAUSED_TITLE = '⏸ PAUSED · OUTATIME 88';

/** The tab title for this state. Pure. */
export function tabTitle(paused, base) {
  return paused ? PAUSED_TITLE : base;
}

/**
 * `frame(G)` once per frame from race-late: writes `doc.title` only when the paused state changes.
 * A hidden tab gets no frames, so the hide itself syncs too. The listener is on the window,
 * where the bubbling event lands after every `document` listener (settings-ui's pause among them,
 * which onload may add after this chunk when the ads script holds the load event back).
 */
export function createTabTitle(doc) {
  const base = doc ? doc.title : '';
  let paused = false, game = null;
  const sync = (status) => {
    const p = status === 'PAUSED';
    if (!doc || p === paused) return;
    paused = p;
    doc.title = tabTitle(p, base);
  };
  const win = doc && doc.defaultView;
  if (win && win.addEventListener) win.addEventListener('visibilitychange', () => { if (game) sync(game.status); });
  return { sync, frame(G) { sync((game = G).status); } };
}
