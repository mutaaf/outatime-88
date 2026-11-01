// Rival name tags (0101, 0238). The renderer queues a tag per car it draws (and a box per pickup
// in the lane ahead); this lays them out once per frame and draws them:
// - the rivals directly ahead of and behind you in the standings (`keep`) always get a plate;
//   the rest go nearest first, at most MAX plates in all, and only cars close enough to read;
// - a plate that would cover a placed plate or a pickup box moves one row up, then sideways, and
//   is dropped if no spot is clear: never a column of names over the vanishing point;
// - plates ease in and out over FADE seconds (a dropped plate fades where it was; three times as fast
//   if a new plate sits on that spot), and are sticky: a shown plate tries last frame's spot first and
//   counts as STICK × nearer when the nearest MAX are picked, so plates don't jump or flicker.
// Everything is preallocated: no per-frame allocation. Pure layout: layoutTags(). Its own lazy
// chunk (tags-*.js), fetched by the stage chunk as it loads; drawTags returns how many it laid out.

export const MAX = 3, FADE = 0.15, STICK = 1.2;
const FONT = ['bold 9px Orbitron, sans-serif', 'bold 11px Orbitron, sans-serif'];
const CAND = [0, 0, 0, -1, -1, 0, 1, 0, -1, -1, 1, -1, 0, -2]; // (dx, dy) in plate widths / rows
/** Placed plates: x, y (centre), w, h, alpha, pool index, candidate spot. */
export const S = 7;
export const placed = new Float32Array(S * 8);
const order = new Int16Array(64), keys = new Float32Array(64);
const fades = Array.from({ length: 12 }, () => ({ text: '', a: 0, on: 0, x: 0, y: 0, w: 0, h: 0, al: 0, kind: 0, color: '', c: 0 }));
/** The fade slot showing `text` last frame, or null. */
function shown(text) {
  for (let f = 0; f < fades.length; f++) if (fades[f].on && fades[f].text === text) return fades[f];
  return null;
}
function hits(x, y, w, h, arr, m, step) {
  for (let j = 0; j < m; j++) {
    const o = j * step;
    if (Math.abs(arr[o] - x) < (arr[o + 2] + w) / 2 && Math.abs(arr[o + 1] - y) < (arr[o + 3] + h) / 2) return true;
  }
  return false;
}

/**
 * Lay out `n` tags from `pool` ({x, y, w (road width: nearness), text, keep}) around `nb` boxes
 * in `blocks` (x, y, w, h centres: pickups the plates must not cover) on an rw × rh view.
 * Writes the plates into `placed` and returns how many there are. ctx is only measured.
 */
export function layoutTags(ctx, pool, n, blocks, nb, rw, rh, fs) {
  n = Math.min(n, order.length);
  for (let i = 0; i < n; i++) { // insertion sort of indices: kept first, then nearest (shown ones sticky)
    const t = pool[i];
    keys[i] = (t.keep ? 1e6 : 0) + t.w * (shown(t.text) ? STICK : 1);
    let j = i;
    while (j > 0 && keys[order[j - 1]] < keys[i]) { order[j] = order[j - 1]; j--; }
    order[j] = i;
  }
  const minW = rw * 0.045, fullW = rw * 0.11, th = fs + 4;
  let k = 0;
  for (let i = 0; i < n && k < MAX; i++) {
    const t = pool[order[i]];
    if (!t.keep && t.w < minW) break; // sorted: everything after is further away
    const tw = ctx.measureText(t.text).width + 8;
    const was = shown(t.text), prev = was ? was.c : 0;
    let fx = 0, fy = 0, c = 0, ok = false;
    for (let pass = t.keep ? 2 : 1; pass-- > 0 && !ok;) { // a kept plate may cover a pickup as a last resort
      for (let cc = -2; cc < CAND.length && !ok; cc += 2) { // last frame's spot first
        c = cc < 0 ? prev : cc;
        if (cc >= 0 && cc === prev) continue;
        fx = t.x + CAND[c] * (tw + 2); fy = t.y + CAND[c + 1] * (th + 2);
        ok = fx - tw / 2 >= 0 && fx + tw / 2 <= rw && fy >= th && fy + th / 2 <= rh && !hits(fx, fy, tw, th, placed, k, S) && (pass === 0 && t.keep || !hits(fx, fy, tw, th, blocks, nb, 4));
      }
    }
    if (!ok) continue;
    const a = Math.min(1, Math.max(0, (t.w - minW) / (fullW - minW)));
    const o = k * S; placed[o] = fx; placed[o + 1] = fy; placed[o + 2] = tw; placed[o + 3] = th;
    placed[o + 4] = t.keep ? Math.max(0.75, a) : a; placed[o + 5] = order[i]; placed[o + 6] = c; k++;
  }
  return k;
}

let last = 0;
export function drawTags(ctx, pool, n, blocks, nb, rw, rh, now = performance.now()) {
  const dt = Math.min(0.1, last ? Math.max(0, now - last) / 1000 : 0.1);
  last = now;
  const big = Math.min(rw, rh) >= 500, fs = big ? 11 : 9;
  ctx.font = FONT[+big];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const k = n ? layoutTags(ctx, pool, n, blocks, nb, rw, rh, fs) : 0;
  for (let f = 0; f < fades.length; f++) fades[f].on = 0;
  for (let i = 0; i < k; i++) {
    const o = i * S, t = pool[placed[o + 5]];
    let s = null;
    for (let f = 0; f < fades.length && !s; f++) if (fades[f].text === t.text) s = fades[f];
    for (let f = 0; f < fades.length && !s; f++) if (!fades[f].on && fades[f].a <= 0) { s = fades[f]; s.text = t.text; }
    if (!s) continue;
    s.on = 1; s.x = placed[o]; s.y = placed[o + 1]; s.w = placed[o + 2]; s.h = placed[o + 3]; s.al = placed[o + 4];
    s.kind = t.kind; s.color = t.color; s.c = placed[o + 6];
  }
  for (let f = 0; f < fades.length; f++) {
    const s = fades[f];
    const crowded = !s.on && (hits(s.x, s.y, s.w, s.h, placed, k, S) || hits(s.x, s.y, s.w, s.h, blocks, nb, 4));
    s.a = Math.max(0, Math.min(1, s.a + (s.on ? dt : crowded ? -3 * dt : -dt) / FADE));
    if (s.a <= 0) continue;
    ctx.globalAlpha = s.a * s.al;
    ctx.fillStyle = s.kind === 1 ? 'rgba(255,0,127,0.88)' : 'rgba(2,6,23,0.72)';
    ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    ctx.fillStyle = s.kind === 2 && s.color ? s.color : '#ffffff';
    ctx.fillText(s.text, s.x, s.y + 0.5);
    if (s.kind === 2 && s.color) ctx.fillRect(s.x - s.w / 2, s.y + s.h / 2 - 2, s.w, 2);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  return k; // plates laid out this frame (rows of `placed`), not counting ones fading out
}
