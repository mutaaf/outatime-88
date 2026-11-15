// Desktop title PLAY row vs road boards (ticket 0274). A lazy chunk of its own, loaded by
// src/billboard-art.js on the first title frame: the board-art chunk rides along with the 3D view,
// whose budget has no room for this. It imports nothing, so loading it fetches one small file.

// Ticket 0274: on the desktop title the attract road drives boards under the PLAY row, so the
// 88 MPH sign sat half-hidden behind RACE FRIENDS and VIEW. A board face reaching under one of
// those controls draws nearly gone, so the row reads clean and no sign shows half its text
// behind a pill. Each control's box is grown by `ramp` of the view height and the fade eases in
// across that margin, so a board sliding toward a control dims before it touches it (no pop) and
// is at `alpha` by the time it reaches the control itself. Only where the title lays the row out
// for a desktop (`media`, the query in src/styles.css); phones and tablets keep their title.
export const TITLE = {
  alpha: 0.12,  // under a title control: well below the 0.2 a sign can be read at
  ramp: 0.03,   // share of the view height around each control over which it eases to that
  media: '(min-width: 900px) and (min-height: 600px) and (min-aspect-ratio: 5/4)', // = styles.css desktop title row
};

/** Fill `box` ({ n, r }) with DOM rects as view shares, each grown by TITLE.ramp of the view height. */
export function titleBox(box, rects, view) {
  box.n = 0;
  if (!(view.width > 0) || !(view.height > 0)) return box;
  const p = TITLE.ramp * view.height;
  for (let i = 0; i < rects.length && box.n * 4 < box.r.length; i++) {
    const q = rects[i];
    if (!q || !(q.right > q.left) || !(q.bottom > q.top)) continue; // hidden controls measure 0
    const k = box.n * 4;
    box.r[k] = (q.left - p - view.left) / view.width; box.r[k + 1] = (q.top - p - view.top) / view.height;
    box.r[k + 2] = (q.right + p - view.left) / view.width; box.r[k + 3] = (q.bottom + p - view.top) / view.height;
    box.n++;
  }
  return box;
}

/**
 * Opacity for a board face [l, r] × [t, b] on a road buffer `vw` × `vh` against the title box
 * (view shares, mapped as stripFade maps them): 1 clear of every grown control, TITLE.alpha once
 * it reaches a control itself. How far it reaches in counts against the ramp, or against the face's
 * own size when the face is smaller than the ramp (a far board), so any face touching a control is
 * at TITLE.alpha.
 */
export function titleFade(box, l, t, r, b, vw, vh, crop = 1) {
  if (!box || !box.n) return 1;
  const sw = vw / crop, sh = vh / crop, cx = (vw - sw) * 0.5, cy = (vh - sh) * 0.46, a = box.r, ramp = TITLE.ramp * sh;
  const rx = Math.min(ramp, r - l), ry = Math.min(ramp, b - t);
  if (!(rx > 0) || !(ry > 0)) return 1;
  let f = 1;
  for (let i = 0, k = 0; i < box.n; i++, k += 4) {
    const ox = Math.min(cx + a[k + 2] * sw, r) - Math.max(cx + a[k] * sw, l);
    const d = Math.min(cy + a[k + 3] * sh, b) - Math.max(cy + a[k + 1] * sh, t);
    if (ox > 0 && d > 0) f = Math.min(f, 1 - (1 - TITLE.alpha) * Math.min(1, d / ry) * Math.min(1, ox / rx));
  }
  return f;
}

/** The PLAY row (#btnStartRace, #btnOpenLive, #btnViewMode) as view shares (0274),
 *  grown by TITLE.ramp. Called only on the title (status TITLE; the caller checks), and only where the row is laid out as one desktop row
 *  (TITLE.media, the same query as styles.css): phones, landscape phones and portrait tablets keep
 *  their title. Re-measured at most every 500 ms, and at once when the window or the title stack
 *  (a challenge banner above PLAY) changes size. Legs and lamp heads aren't tested: no text on them.
 *  Anywhere else, no box. 3D view: not covered (its boards draw in src/render3d, as with 0242/0244). */
let titleAt = -1e9, titleOn = false, titleWatch = null;
const titleRects = { n: 0, r: new Float32Array(12) };
const TITLE_IDS = ['btnStartRace', 'btnOpenLive', 'btnViewMode'];
const remeasureTitle = () => { titleAt = -1e9; };
export function titleRow(now) {
  if (typeof document === 'undefined' || !document.body.classList.contains('on-title')) { titleAt = -1e9; return null; }
  if (now - titleAt > 500 || now < titleAt) {
    titleAt = now;
    titleOn = typeof matchMedia === 'function' && matchMedia(TITLE.media).matches;
    titleRects.n = 0;
    const play = document.getElementById('btnStartRace'), view = document.getElementById('canvasContainer');
    if (titleOn && view) {
      if (!titleWatch && typeof ResizeObserver !== 'undefined' && play && play.parentElement) {
        titleWatch = new ResizeObserver(remeasureTitle);
        titleWatch.observe(play.parentElement);
        addEventListener('resize', remeasureTitle);
      }
      titleBox(titleRects, TITLE_IDS.map((id) => { const el = document.getElementById(id); return el && el.getBoundingClientRect(); }), view.getBoundingClientRect());
    }
  }
  return titleOn ? titleRects : null;
}

// Boards drawn under the row: how many, the most opaque one, and the last one's face (road buffer
// px, with that buffer's size) and opacity, for ?debug (window.__OT.titleBoards). An e2e sets `log`
// to an array to get every board face drawn on the desktop title: [l, t, r, b, alpha, vw, vh].
export const stats = { hits: 0, maxAlpha: 0, last: [0, 0, 0, 0], vw: 0, vh: 0, alpha: 1, log: null };
if (typeof window !== 'undefined' && window.__OT) window.__OT.titleBoards = stats;

/**
 * A board face [l, r] × [t, b] on a `vw` × `vh` road buffer, drawn on the title: its final opacity,
 * min(k, the title-row fade) × ef, where k is the board's other fades (0203, 0244) and ef its edge
 * fade (0221). Notes it in `stats`. The caller (src/billboard-art.js draw2D) only asks on the title.
 */
export function fade(l, t, r, b, vw, vh, crop, now, k, ef) {
  const row = titleRow(now), tf = titleFade(row, l, t, r, b, vw, vh, crop), alpha = Math.min(k, tf) * ef;
  if (!row) return alpha;
  if (tf <= TITLE.alpha + 1e-6) {
    stats.hits++; if (alpha > stats.maxAlpha) stats.maxAlpha = alpha;
    stats.last[0] = l; stats.last[1] = t; stats.last[2] = r; stats.last[3] = b;
    stats.vw = vw; stats.vh = vh; stats.alpha = alpha;
  }
  if (stats.log && stats.log.length < 4000) stats.log.push([l, t, r, b, alpha, vw, vh]);
  return alpha;
}
