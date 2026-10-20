// Floating pickup / score labels (ticket 0114), pure layout. Labels hang from an anchor above
// the car's roofline (never on the car), newest nearest the car and older ones stacked above it,
// at most LABEL.max at once, clamped to the canvas and shrunk to fit a narrow one. With no room
// above (the car high in the air) they stack beside the car instead. Drawn by src/pickup-art.js.

export const LABEL = {
  font: 11,     // px on the road buffer
  padX: 6,
  padY: 4,
  gap: 4,       // between a label and the car, and between labels
  margin: 6,    // from the canvas edge
  rise: 12,     // px a label floats up over its life
  max: 3,
  stride: 7,    // per slot in the output: x0, y0, w, h, alpha, source index, scale
};

/** Output slots for layoutLabels (allocate once). */
export const labelSlots = () => new Float32Array(LABEL.max * LABEL.stride);

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
 * LABEL.font; it is called once per entry (cached on it). Writes `out` slots, returns the count.
 */
export function layoutLabels(list, box, rw, rh, measure, out) {
  const { padX, padY, gap, margin: m, rise, max, stride } = LABEL;
  const h0 = LABEL.font + padY * 2;
  const cx = (box.x0 + box.x1) * 0.5;
  const rightRoom = rw - m - (box.x1 + gap), leftRoom = box.x0 - gap - m;
  let n = 0, top = box.y0, side = false, sideY = 0;
  for (let i = list.length - 1; i >= 0 && n < max; i--) {
    const e = list[i];
    if (!e.label) continue;
    if (e.lwFor !== e.label) { e.lw = measure(e.label); e.lwFor = e.label; }
    const t = Math.min(1, Math.max(0, 1 - e.life / e.maxLife));
    let s = Math.min(1, (rw - m * 2) / (e.lw + padX * 2));
    let w = (e.lw + padX * 2) * s, h = h0 * s;
    let x, y;
    if (!side) {
      y = Math.min(box.y0 - gap - t * rise, top - gap) - h;
      if (y >= m) { x = Math.min(rw - m - w, Math.max(m, cx - w * 0.5)); top = y; }
      else { side = true; sideY = Math.max(m, Math.min(box.y0, rh - m - h)) - gap; }
    }
    if (side) {
      const room = Math.max(rightRoom, leftRoom);
      if (room < 24) break;
      if (w > room) { const k = room / w; s *= k; w = room; h *= k; }
      y = sideY + gap;
      if (y + h > rh - m) break;
      x = rightRoom >= leftRoom ? box.x1 + gap : box.x0 - gap - w;
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
