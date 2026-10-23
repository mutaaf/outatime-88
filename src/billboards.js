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

// What the road has drawn so far this frame, far to near (ticket 0203): the rects of cars,
// obstacles and pickups, which a nearer board must not hide (src/board-fade.js). Specks under
// 8 px are too far off to read anyway; past the cap the rest of the frame simply isn't noted.
export const seen = { n: 0, r: new Float32Array(384) };
export function noteSeen(l, t, r, b) {
  const k = seen.n * 4;
  if (r - l < 8 || k >= 384) return;
  seen.r[k] = l; seen.r[k + 1] = t; seen.r[k + 2] = r; seen.r[k + 3] = b;
  seen.n++;
}

/** Draw a board item (BILLBOARD or the clock tower's board) at screen x on the road row. */
export function drawBoard(ctx, item, n, x, roadY, roadW, rw, rh, eraId) {
  if (art) art.draw2D(ctx, item, n, x, roadY, roadW, rw, rh, eraId, seen);
  else loadBoardArt();
}

/** ?debug: impressions, cache size, manifest state. */
export const boardsDebug = () => (art ? art.debug() : null);
