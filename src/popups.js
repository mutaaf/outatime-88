// Floating pickup / score labels (ticket 0114), pure layout. Labels hang from an anchor above
// the car's roofline (never on the car), each in the slot it landed in (0220, below),
// at most LABEL.max at once, clamped to the canvas and shrunk to fit a narrow one. With no room
// above (the car high in the air) they stack beside the car instead. The margins allow for the
// FOV push-in crop at full speed + NOS, so a label is whole on screen too. Drawn by src/pickup-art.js.
// A dodge chain is one plate that grows (src/chain-plate.js, 0205): it always gets a slot, and it pops
// when it grows (not with reduced motion).
// One hit-text lane (0220): a label keeps the slot it landed in (slot 0 nearest the car), so a new one
// stacks one plate above a live one instead of shoving it. When the lane is full an impact (`hit`)
// outranks a pickup plate, then the newest wins; a label that loses its place is gone for good.
// Touch pads (0254): `avoid` holds the on-screen pads as buffer boxes (padBoxes below); a plate that
// would touch one slides sideways within the gap between pads or lifts above them, so a crash line
// never runs under PAUSE or ROAR. The test covers the whole float, so a plate never jumps mid-life.

export const LABEL = {
  font: 11,     // px on the road buffer
  padX: 6,
  padY: 4,
  gap: 4,       // between a label and the car, and between labels
  margin: 6,    // from the canvas edge
  fovMax: 1.115, // main.js crops the road buffer by up to this at 88+ with NOS (speedFeel + nosFeel)
  rise: 12,     // px a label floats up over its life
  max: 2,       // the chain plate + one other (0205)
  pop: 0.22,    // extra scale on a chain plate that just grew
  popT: 0.18,   // s the pop takes to settle
  stride: 7,    // per slot in the output: x0, y0, w, h, alpha, source index, scale
};

/** Output slots for layoutLabels (allocate once). */
export const labelSlots = () => new Float32Array(LABEL.max * LABEL.stride);

const pick = new Int32Array(LABEL.max); // source index per slot, -1 = free
// Who keeps a place in the lane: the chain plate, then impacts, then the newest.
const rank = (e, i) => (e.chain ? 4e6 : 0) + (e.hit ? 2e6 : 0) + i;

/**
 * Touch pads from screen space (CSS px, x0 y0 x1 y1 per pad) into the road buffer (rw×rh, drawn
 * over a vw×vh screen): each box covers where the pad lands at every FOV crop from none to
 * LABEL.fovMax, so the answer doesn't move with speed. Writes `out`, returns the count.
 */
export function padBoxes(pads, n, vw, vh, rw, rh, out) {
  const F = LABEL.fovMax, kx = rw / vw, ky = rh / vh;
  const cx = rw * (1 - 1 / F) * 0.5, cy = rh * (1 - 1 / F) * 0.46;
  const m = Math.min(n, out.length >> 2);
  for (let i = 0; i < m * 4; i += 4) {
    out[i] = Math.min(pads[i] * kx, cx + pads[i] * kx / F);
    out[i + 1] = Math.min(pads[i + 1] * ky, cy + pads[i + 1] * ky / F);
    out[i + 2] = Math.max(pads[i + 2] * kx, cx + pads[i + 2] * kx / F);
    out[i + 3] = Math.max(pads[i + 3] * ky, cy + pads[i + 3] * ky / F);
  }
  return m;
}

// Where fitBand put a plate (x) and the free gap it found there (lo..hi); module scalars, so the
// layout allocates nothing.
let fitX = 0, fitLo = 0, fitHi = 0;
/**
 * Lowest top edge ≤ `y` at which a w×h band, centred near `cx`, touches none of the `n` boxes
 * in `avoid` (keeping `gap`), between the margins `m`; sets fitX. Slides sideways first, lifts
 * over the lowest box in the way otherwise. NaN when nothing fits.
 */
function fitBand(y, w, h, cx, m, rw, gap, avoid, n) {
  for (let guard = 0; guard <= n; guard++) {
    let lo = m, hi = rw - m, lift = -Infinity;
    const y1 = y + h;
    for (let i = 0; i < n * 4; i += 4) {
      if (avoid[i + 3] + gap <= y || avoid[i + 1] - gap >= y1 || avoid[i + 2] + gap <= m || avoid[i] - gap >= rw - m) continue;
      if (avoid[i + 1] > lift) lift = avoid[i + 1];
      if (avoid[i + 2] <= cx) lo = Math.max(lo, avoid[i + 2] + gap);
      else if (avoid[i] >= cx) hi = Math.min(hi, avoid[i] - gap);
      else { lo = cx; hi = cx; }
    }
    if (hi - lo >= w) { fitX = Math.min(hi - w, Math.max(lo, cx - w * 0.5)); fitLo = lo; fitHi = hi; return y; }
    y = lift - gap - h;
  }
  return NaN;
}

/** Whether the box x, y, w, h comes within `gap` of any of the `n` boxes in `avoid`. */
function touches(x, y, w, h, gap, avoid, n) {
  for (let i = 0; i < n * 4; i += 4) {
    if (avoid[i] - gap < x + w && x < avoid[i + 2] + gap && avoid[i + 1] - gap < y + h && y < avoid[i + 3] + gap) return true;
  }
  return false;
}

/** The car's screen box when the renderer hasn't published one (3D view): drawPlayerCar's maths. */
export function fallbackBox(rw, rh, out) {
  const carW = Math.max(58, Math.floor(rw * 0.22));
  const carH = Math.max(32, Math.floor(carW * 0.54));
  const oy = Math.floor(rh * 0.87) - carH * 0.5;
  out.x0 = rw * 0.5 - carW * 0.55; out.x1 = rw * 0.5 + carW * 0.55;
  out.y0 = oy - carH - LABEL.gap; out.y1 = oy + carH * 0.6;
  return out;
}

/**
 * Lays out the labelled entries of `list` ({ label, life, maxLife }, oldest first) around the
 * car `box` ({ x0, y0, x1, y1 }) on a rw×rh canvas. `measure(text)` gives the text width at
 * LABEL.font; it is called once per entry (cached on it). `still` (reduced motion) stops the
 * float. `avoid` / `nAvoid`: touch pad boxes on the buffer (padBoxes) no plate may touch. Writes
 * `out` slots, returns the count.
 */
export function layoutLabels(list, box, rw, rh, measure, out, still, avoid, nAvoid = 0) {
  const { padX, padY, gap, margin, max, stride } = LABEL;
  const rise = still ? 0 : LABEL.rise;
  // The part of the buffer that reaches the screen at the deepest FOV crop.
  const crop = 1 - 1 / LABEL.fovMax;
  const m = margin + rw * crop * 0.5, top0 = margin + rh * crop * 0.46, bottom = rh - margin - rh * crop * 0.54;
  const h0 = LABEL.font + padY * 2;
  const cx = (box.x0 + box.x1) * 0.5;
  const rightRoom = rw - m - (box.x1 + gap), leftRoom = box.x0 - gap - m;
  // The best `max` labels keep the lane; every other labelled entry has lost its place for good.
  let chosen = 0;
  for (let k = 0; k < max; k++) pick[k] = -1;
  for (let k = 0; k < max; k++) {
    let best = -1, bestRank = -1;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.label || e.gone || e.lane > 0) continue;
      const r = rank(e, i);
      if (r > bestRank) { best = i; bestRank = r; }
    }
    if (best < 0) break;
    list[best].lane = ++chosen; // picked this call (cleared again below)
  }
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.label || e.gone) continue;
    if (!(e.lane > 0)) { e.gone = true; continue; }
    // Picked: keep the slot it already holds, else take the free one nearest the car below.
    const k = e.slot >= 0 && e.slot < max && pick[e.slot] < 0 ? e.slot : -1;
    if (k >= 0) pick[k] = i; else e.slot = -1;
  }
  // New ones fill the free slots nearest the car first: the chain plate, then impacts, then the oldest.
  for (;;) {
    let next = -1, nextRank = -1;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.label || e.gone || e.slot >= 0) continue;
      const r = rank(e, list.length - i);
      if (r > nextRank) { next = i; nextRank = r; }
    }
    if (next < 0) break;
    let k = 0;
    while (pick[k] >= 0) k++;
    pick[k] = next; list[next].slot = k;
  }
  for (let i = 0; i < list.length; i++) if (list[i].lane > 0) list[i].lane = 0;
  let n = 0, top = box.y0, side = false, sideY = 0;
  for (let k = 0; k < max; k++) {
    const i = pick[k];
    if (i < 0) continue;
    const e = list[i];
    if (e.lwFor !== e.label) { e.lw = measure(e.label); e.lwFor = e.label; }
    const t = Math.min(1, Math.max(0, 1 - e.life / e.maxLife));
    const fit = (rw - m * 2) / (e.lw + padX * 2), age = e.maxLife - e.life;
    let s = Math.min(1, fit);
    if (e.merged && !still && age < LABEL.popT) s = Math.min(fit, s * (1 + LABEL.pop * (1 - age / LABEL.popT)));
    let w = (e.lw + padX * 2) * s, h = h0 * s;
    let x, y;
    if (!side) {
      // Its slot's height, or just above the plate under it if that one has floated up into it.
      y = Math.min(box.y0 - gap - t * rise - k * (h0 + gap), top - gap) - h;
      // A car high up: rather close the gap under it than send it to the side stack.
      if (y < top0 && k > n) y = Math.min(box.y0 - gap - t * rise - n * (h0 + gap), top - gap) - h;
      if (y >= top0 && nAvoid > 0) {
        // Placed at its settled size (never a chain plate's pop), over its whole float (from here up
        // to where the rise ends), and latched: the lift and the gap between pads stay on the entry,
        // the plate follows the car only inside that gap, and it is placed again only if it would
        // now touch a pad. So steering or a pop never makes it hop.
        const k1 = Math.min(1, fit), sw = (e.lw + padX * 2) * k1, sh = h0 * k1;
        const ys = y + h - sh - (1 - t) * rise; // the settled plate's band top
        let ok = e.padLo !== undefined && e.padHi - e.padLo >= sw;
        if (ok) {
          fitX = Math.min(e.padHi - sw, Math.max(e.padLo, cx - sw * 0.5));
          ok = !touches(fitX, ys - e.padDy, sw, sh + rise, gap, avoid, nAvoid);
        }
        if (!ok) {
          const yt = fitBand(ys, sw, sh + rise, cx, m, rw, gap, avoid, nAvoid);
          ok = yt === yt;
          if (ok) { e.padDy = ys - yt; e.padLo = fitLo; e.padHi = fitHi; } else e.padLo = undefined;
        }
        if (ok) {
          y -= e.padDy;
          const room = e.padHi - e.padLo; // a popping plate grows in place, never past its gap
          if (w > room) { const q = room / w; s *= q; w = room; y += h * (1 - q); h *= q; }
          fitX = Math.min(e.padHi - w, Math.max(e.padLo, fitX + (sw - w) * 0.5));
        } else y = -Infinity;
      } else fitX = Math.min(rw - m - w, Math.max(m, cx - w * 0.5));
      if (y >= top0) { x = fitX; top = y; }
      else { side = true; sideY = Math.max(top0, Math.min(box.y0, bottom - h)) - gap; }
    }
    if (side) {
      const room = Math.max(rightRoom, leftRoom);
      if (room < 24) break;
      if (w > room) { const q = room / w; s *= q; w = room; h *= q; }
      y = sideY + gap;
      if (y + h > bottom) break;
      x = rightRoom >= leftRoom ? box.x1 + gap : box.x0 - gap - w;
      if (nAvoid > 0 && touches(x, y - rise, w, h + rise, gap, avoid, nAvoid)) break;
      sideY = y + h;
    }
    const o = n * stride;
    out[o] = x; out[o + 1] = y; out[o + 2] = w; out[o + 3] = h;
    out[o + 4] = Math.min(1, Math.max(0, e.life / (e.maxLife * 0.3)));
    out[o + 5] = i; out[o + 6] = s;
    n++;
  }
  return n;
}
