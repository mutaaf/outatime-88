// Boards never hide what you race (ticket 0203), pure. The 2D road draws far to near, so a
// board on a nearer segment is painted over every car, obstacle and pickup further up the road.
// Those note their screen rect as they are drawn (src/billboards.js noteSeen); a board whose
// face would cover one of them draws see-through instead, and eases back once the road behind
// it is clear (so a car sliding along its edge doesn't make it flicker).

export const BOARD_FADE = {
  alpha: 0.35, // a board in front of something you race (same as near traffic, 0200)
  back: 0.3,   // seconds to ease back to solid once nothing is behind it
};

/** Index of the first noted rect overlapping [l, r] × [t, b], or -1. `seen` = { n, r }. */
export function covers(seen, l, t, r, b) {
  const a = seen.r;
  for (let i = 0, k = 0; i < seen.n; i++, k += 4) {
    if (a[k] < r && a[k + 2] > l && a[k + 1] < b && a[k + 3] > t) return i;
  }
  return -1;
}

/** Opacity for a board `since` seconds after something was last behind it (Infinity = never). */
export function boardAlpha(since) {
  if (!(since > 0)) return BOARD_FADE.alpha;
  if (since >= BOARD_FADE.back) return 1;
  return BOARD_FADE.alpha + (1 - BOARD_FADE.alpha) * (since / BOARD_FADE.back);
}

// A board never shows half its text at the screen edge (ticket 0221): a cropped brand name reads
// as a bug, and a bright slab at the edge pulls the eye off the lane. A board crossing the edge of
// the view fades with the share of its face that is off screen, gone by `fade`; a board beside
// the road is never wider than `maxW` of the view (overhead boards span the road and keep theirs).
export const EDGE = {
  fade: 0.35, // share of the face outside the view at which it is fully faded (15% off → ≤ 0.6)
  maxW: 0.28, // widest a board beside the road draws, as a share of the view width
};

/**
 * Opacity for a face spanning [l, r] on a road buffer `vw` wide whose middle 1/`crop` reaches
 * the screen (the FOV push-in, src/render/scene.js): 1 wholly on screen, 0 at EDGE.fade outside.
 */
export function edgeFade(l, r, vw, crop = 1) {
  const w = r - l;
  if (!(w > 0)) return 0;
  const cut = (vw - vw / crop) / 2;
  const out = Math.max(0, cut - l) + Math.max(0, r - (vw - cut));
  if (out <= 0) return 1;
  return Math.max(0, 1 - Math.min(1, out / w) / EDGE.fade);
}
