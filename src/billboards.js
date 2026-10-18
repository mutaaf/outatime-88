// Billboards (docs/ADS.md): roadside boards, overhead gantries, loop banners, the start arch
// and booster-gate signs are objects of their own (track.js addBoard). Their art, the
// creative rotation and the viewability counter live in a lazy chunk (src/billboard-art.js),
// which the 3D view imports directly; until it arrives a 2D board just isn't drawn.
let art = null;
let loading = null;

export function loadBoardArt() {
  if (!loading) loading = import('./billboard-art.js').then((m) => { art = m; return m; }).catch(() => { loading = null; });
  return loading;
}

/** Draw a board item (BILLBOARD or the clock tower's board) at screen x on the road row. */
export function drawBoard(ctx, item, n, x, roadY, roadW, rw, rh, eraId) {
  if (art) art.draw2D(ctx, item, n, x, roadY, roadW, rw, rh, eraId);
  else loadBoardArt();
}

/** ?debug: impressions, cache size, manifest state. */
export const boardsDebug = () => (art ? art.debug() : null);
