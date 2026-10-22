// Colour-vision maths for tests/e2e/colour-vision.spec.js (ticket 0198), pure.
// Simulations are Machado, Oliveira & Fernandes (2009) at full severity, applied in linear RGB,
// plus greyscale. A sprite is described per simulation by its mean relative luminance and an
// edge silhouette: the Sobel edges of its simulated luminance on a GRID×GRID square fitted to
// its bounding box (aspect kept), binned by direction, so size doesn't matter but shape and
// inner markings do.

export const SIMS = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  greyscale: null,
};

/** Thresholds a pickup/hazard pair must meet in every simulation (either one is enough). */
export const LUM_MIN = 1.5;   // mean-luminance contrast ratio, WCAG formula
export const EDGE_MIN = 0.5;  // edge-silhouette difference, 0 = same edges, 1 = none shared (the
                              // same sprite at another distance measures <= 0.33)

const GRID = 32;
const EDGE_T = 0.2;          // Sobel magnitude (gamma-encoded luminance) that counts as an edge

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Relative luminance of an sRGB pixel as seen under simulation `m` (null = no change). */
export function simLum(r, g, b, m) {
  let R = lin(r), G = lin(g), B = lin(b);
  if (m) {
    const r2 = clamp(m[0] * R + m[1] * G + m[2] * B);
    const g2 = clamp(m[3] * R + m[4] * G + m[5] * B);
    const b2 = clamp(m[6] * R + m[7] * G + m[8] * B);
    R = r2; G = g2; B = b2;
  }
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Keep only the sprite: the biggest blob of the mask (pixels within 3 px count as touching,
 *  so a stripe or beacon stays with its body), cropped to its box. Drops stray live pixels. */
export function isolate(shot) {
  const { w, h, px, mask } = shot;
  const label = new Int32Array(w * h).fill(-1);
  let best = -1, bestN = 0, id = 0;
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    let n = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    if (n > bestN) { bestN = n; best = id; }
    id++;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (label[i] === best) {
    const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 0, h: 0, px: [], mask: [] };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = { w: cw, h: ch, px: new Array(cw * ch * 3), mask: new Array(cw * ch) };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y0 + y) * w + x0 + x, j = y * cw + x;
    out.mask[j] = label[i] === best ? 1 : 0;
    for (let k = 0; k < 3; k++) out.px[j * 3 + k] = px[i * 3 + k];
  }
  return out;
}

/** Per-simulation stats of a cut-out sprite `{ w, h, px: rgb[], mask: 0|1[] }`. */
export function spriteStats(shot) {
  const { w, h, px, mask } = isolate(shot);
  const out = { n: mask.reduce((a, b) => a + b, 0), w, h };
  const side = Math.max(w, h), ox = (side - w) / 2, oy = (side - h) / 2;
  for (const [name, m] of Object.entries(SIMS)) {
    let sum = 0;
    const Y = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) {
      Y[i] = simLum(px[i * 3], px[i * 3 + 1], px[i * 3 + 2], m);
      if (mask[i]) sum += Y[i];
    }
    // Resample the gamma-encoded luminance onto the grid: each cell averages the pixels it
    // covers (at least the one under its centre, so a sprite smaller than the grid is
    // upscaled, not scattered). Cells outside the box are the mean road colour.
    const grid = new Float64Array(GRID * GRID);
    let road = 0, roadN = 0;
    for (let i = 0; i < w * h; i++) if (!mask[i]) { road += Math.sqrt(Y[i]); roadN++; }
    road = roadN ? road / roadN : 0;
    const k = side / GRID;
    const span = (g, o, n) => {
      const a = g * k - o, b = (g + 1) * k - o;
      if (b <= 0 || a >= n) return null;
      const lo = Math.max(0, Math.floor(a));
      return [lo, Math.min(n, Math.max(lo + 1, Math.ceil(b)))];
    };
    for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
      const sx = span(gx, ox, w), sy = span(gy, oy, h);
      if (!sx || !sy) { grid[gy * GRID + gx] = road; continue; }
      let acc = 0, n = 0;
      for (let y = sy[0]; y < sy[1]; y++) for (let x = sx[0]; x < sx[1]; x++) { acc += Math.sqrt(Y[y * w + x]); n++; }
      grid[gy * GRID + gx] = acc / n;
    }
    const at = (x, y) => grid[Math.max(0, Math.min(GRID - 1, y)) * GRID + Math.max(0, Math.min(GRID - 1, x))];
    const edges = new Uint8Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      // 0 = no edge, else 1..4: the edge's direction in 45° bins (a circle and a box share
      // cells, not directions).
      if (Math.hypot(gx, gy) / 4 > EDGE_T) {
        const a = (Math.atan2(gy, gx) + Math.PI) % Math.PI; // 0..π: a direction, not a sign
        edges[y * GRID + x] = 1 + (Math.round(a / (Math.PI / 4)) % 4);
      }
    }
    out[name] = { lum: out.n ? sum / out.n : 0, edges };
  }
  return out;
}

/** Edge cells of direction `bin`, widened by one cell. */
function dilate(e, bin) {
  const d = new Uint8Array(e.length);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (e[y * GRID + x] !== bin) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Yy = y + dy;
      if (X >= 0 && Yy >= 0 && X < GRID && Yy < GRID) d[Yy * GRID + X] = 1;
    }
  }
  return d;
}

/** Luminance contrast and edge-silhouette difference between two sprites' stats for one sim:
 *  1 − IoU of the two oriented edge maps, each direction widened by one cell so a one-cell
 *  shift isn't a change. */
export function compare(a, b) {
  const hi = Math.max(a.lum, b.lum), lo = Math.min(a.lum, b.lum);
  let both = 0, either = 0;
  for (let bin = 1; bin <= 4; bin++) {
    const da = dilate(a.edges, bin), db = dilate(b.edges, bin);
    for (let i = 0; i < da.length; i++) { if (da[i] && db[i]) both++; if (da[i] || db[i]) either++; }
  }
  return { ratio: (hi + 0.05) / (lo + 0.05), edge: either ? 1 - both / either : 0 };
}
