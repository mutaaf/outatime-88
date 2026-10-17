// Shared painting kit for the 2D era backdrops (ticket 0100). Everything here runs while a
// scene is BUILT (once per era × canvas size), never per frame, except the small `blink`,
// `rainField` and `wrapX` helpers that the per-frame animation layer uses allocation-free.

/** Deterministic PRNG so a scene paints the same roofline every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  const n = stops.length - 1;
  stops.forEach((c, i) => g.addColorStop(Array.isArray(c) ? c[0] : i / n, Array.isArray(c) ? c[1] : c));
  return g;
}

/** Paint `fn(x)` at x and its wrapped twin so a tiling layer has no seam. */
export function wrapped(W, x, w, fn) {
  fn(x);
  if (x + w > W) fn(x - W);
  if (x < 0) fn(x + W);
}

/** Screen x of a layer-space x, given the layer's scroll offset (allocation-free). */
export function wrapX(x, off, W, rw) {
  let s = (x - off) % W;
  if (s < -W * 0.25) s += W;
  if (s > rw + W * 0.25) s -= W;
  return s;
}

/** A building with a lit-window grid. */
export function building(ctx, r, x, base, w, h, body, lit, density = 0.4, roof = null) {
  ctx.fillStyle = body;
  ctx.fillRect(x, base - h, w, h);
  if (roof === 'antenna') ctx.fillRect(x + w * 0.45, base - h - h * 0.25, Math.max(1, w * 0.06), h * 0.25);
  if (roof === 'step') ctx.fillRect(x + w * 0.15, base - h - h * 0.12, w * 0.7, h * 0.12);
  if (!lit) return;
  const cw = Math.max(2, Math.round(w / 7));
  const ch = Math.max(2, Math.round(cw * 1.3));
  ctx.fillStyle = lit;
  for (let wy = base - h + ch; wy < base - ch; wy += ch * 1.8) {
    for (let wx = x + cw * 0.6; wx < x + w - cw; wx += cw * 1.7) {
      if (r() < density) ctx.fillRect(wx, wy, cw, ch);
    }
  }
}

/** Neon / painted sign text. Glow uses shadowBlur, which is fine at build time. */
export function sign(ctx, text, x, y, size, color, { glow = 0, font = 'bold', align = 'center', bg = null, pad = 0.35 } = {}) {
  ctx.save();
  ctx.font = `${font} ${Math.max(6, Math.round(size))}px "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (bg) {
    const m = ctx.measureText(text).width;
    const bx = align === 'center' ? x - m / 2 : x;
    ctx.fillStyle = bg;
    ctx.fillRect(bx - size * pad, y - size * 0.7, m + size * pad * 2, size * 1.4);
  }
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Atmospheric perspective: fade a band toward the horizon colour. */
export function haze(ctx, W, y0, y1, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = vgrad(ctx, y0, y1, ['rgba(0,0,0,0)', color]);
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.restore();
}

/** Mountain / mesa ridge silhouette across the whole tile width (seamless). */
export function ridge(ctx, W, base, amp, rough, color, seed, mesa = false) {
  const r = rng(seed);
  const pts = [];
  const step = Math.max(6, W / 60);
  const n = Math.ceil(W / step);
  let h = amp * 0.5;
  for (let i = 0; i <= n; i++) {
    h += (r() - 0.5) * amp * rough;
    h = Math.max(amp * 0.15, Math.min(amp, h));
    pts.push(mesa && r() < 0.3 ? h : h);
  }
  pts[n] = pts[0]; // seamless
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let i = 0; i <= n; i++) {
    const x = i * step;
    if (mesa && i > 0 && i % 7 === 0) ctx.lineTo(x - step * 0.6, base - pts[i] * 1.25);
    ctx.lineTo(x, base - pts[i]);
  }
  ctx.lineTo(W, base);
  ctx.closePath();
  ctx.fill();
}

/** Clouds: soft overlapping ellipses. */
export function clouds(ctx, W, y0, y1, color, count, seed, size) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx = r() * W, cy = y0 + r() * (y1 - y0), s = size * (0.6 + r() * 0.8);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (k - 2) * s * 0.55, cy - Math.sin(k) * s * 0.18, s * (0.5 + r() * 0.3), s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function stars(ctx, W, H, count, seed, color = '#fff', y0 = 0) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.3 + r() * 0.7;
    const s = r() < 0.1 ? 2 : 1;
    ctx.fillRect(r() * W, y0 + r() * (H - y0), s, s);
  }
  ctx.globalAlpha = 1;
}

/** A mirrored, darkened copy of a layer drawn under the horizon: wet-asphalt reflection. */
export function reflect(ctx, src, hz, depth, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, hz * 2);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  // fade it out with depth
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vgrad(ctx, hz, hz + depth, ['rgba(0,0,0,0.25)', 'rgba(0,0,0,1)']);
  ctx.fillRect(0, hz, src.width, depth + 2);
  ctx.restore();
}

/** Classic courthouse clock tower; the face reads 10:04 (where the lightning struck). */
export function clockTower(ctx, cx, base, w, h, body, trim, face, hands = '#1b1b1b') {
  ctx.fillStyle = body;
  ctx.fillRect(cx - w * 1.6, base - h * 0.42, w * 3.2, h * 0.42); // courthouse
  ctx.fillRect(cx - w * 0.5, base - h, w, h); // tower
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.62, base - h);
  ctx.lineTo(cx, base - h * 1.32);
  ctx.lineTo(cx + w * 0.62, base - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  for (let i = -3; i <= 3; i++) ctx.fillRect(cx + i * w * 0.45 - 1, base - h * 0.4, 2, h * 0.4); // columns
  ctx.fillRect(cx - w * 1.7, base - h * 0.44, w * 3.4, Math.max(1, h * 0.025));
  const fy = base - h * 0.76, fr = w * 0.34;
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(cx, fy, fr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hands; ctx.lineWidth = Math.max(1, fr * 0.14); ctx.lineCap = 'round';
  const hand = (turns, len) => { const a = turns * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx + Math.cos(a) * len, fy + Math.sin(a) * len); ctx.stroke(); };
  hand((10 + 4 / 60) / 12, fr * 0.5); // hour hand at 10:04
  hand(4 / 60, fr * 0.82);            // minute hand
  return { x: cx, top: base - h * 1.32, faceY: fy, faceR: fr };
}

export function palm(ctx, x, base, h, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + h * 0.12, base - h * 0.5, x + h * 0.06, base - h); ctx.stroke();
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.55;
    ctx.beginPath();
    ctx.moveTo(x + h * 0.06, base - h);
    ctx.quadraticCurveTo(x + h * 0.06 + Math.cos(a) * h * 0.3, base - h + Math.sin(a) * h * 0.25 - h * 0.05, x + h * 0.06 + Math.cos(a) * h * 0.45, base - h + Math.sin(a) * h * 0.1 + h * 0.12);
    ctx.stroke();
  }
}

export function pine(ctx, x, base, h, color) {
  ctx.fillStyle = color;
  for (let k = 0; k < 3; k++) {
    const y = base - h * (0.25 + k * 0.25), w = h * (0.32 - k * 0.07);
    ctx.beginPath(); ctx.moveTo(x - w, y + h * 0.12); ctx.lineTo(x, y - h * 0.3); ctx.lineTo(x + w, y + h * 0.12); ctx.closePath(); ctx.fill();
  }
  ctx.fillRect(x - h * 0.03, base - h * 0.2, h * 0.06, h * 0.2);
}

export function cactus(ctx, x, base, h, color) {
  ctx.fillStyle = color;
  const w = h * 0.16;
  ctx.fillRect(x - w / 2, base - h, w, h);
  ctx.fillRect(x - w * 2, base - h * 0.62, w, h * 0.3); ctx.fillRect(x - w * 2, base - h * 0.4, w * 1.6, w * 0.8);
  ctx.fillRect(x + w, base - h * 0.78, w, h * 0.32); ctx.fillRect(x + w * 0.4, base - h * 0.5, w * 1.6, w * 0.8);
}

/** Pre-render a lightning bolt sprite (drawn per frame with drawImage only). */
export function boltSprite(h, seed) {
  const w = Math.max(8, h * 0.35);
  const c = layer(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.strokeStyle = '#f5f3ff'; ctx.shadowColor = '#a5b4fc'; ctx.shadowBlur = 8; ctx.lineWidth = 2; ctx.lineJoin = 'bevel';
  ctx.beginPath();
  let x = w / 2;
  ctx.moveTo(x, 0);
  for (let y = 0; y < h; y += h / 9) { x = Math.max(2, Math.min(w - 2, x + (r() - 0.5) * w * 0.7)); ctx.lineTo(x, y); }
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  return c;
}

/** A tiny sprite canvas painted once. */
export function sprite(w, h, paint) {
  const c = layer(w, h);
  paint(c.getContext('2d'), c.width, c.height);
  return c;
}

/** Rain: fixed pool of streaks, advanced in place (no per-frame allocation). */
export function rainField(n, seed) {
  const r = rng(seed);
  const d = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { d[i * 3] = r(); d[i * 3 + 1] = r(); d[i * 3 + 2] = 0.6 + r() * 0.8; }
  return d;
}
export function drawRain(ctx, field, rw, rh, t, color, slant, alpha, detail = 1) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = Math.floor((field.length / 3) * detail);
  for (let i = 0; i < n; i++) {
    const sp = field[i * 3 + 2];
    const x = ((field[i * 3] + t * 0.05 * slant) % 1) * rw;
    const y = ((field[i * 3 + 1] + t * 1.6 * sp) % 1) * rh;
    const len = rh * 0.035 * sp;
    ctx.moveTo(x, y);
    ctx.lineTo(x - slant * len * 0.3, y + len);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 0/1 blink with a duty cycle; deterministic from time and a phase. */
export function blink(t, period, duty, phase = 0) {
  return ((t + phase) % period) / period < duty ? 1 : 0;
}

/**
 * The sky + ground plate: a canvas rw×(rh+2·pad) (at scale k) with the horizon at pad+hz0.
 * `sky(ctx, w, hz, top)` paints extras between `top` (the screen's top edge at rest) and the horizon, `ground(ctx, w, hz, h)` below it.
 */
export function plate(o, skyStops, groundStops, sky, ground) {
  const w = Math.ceil(o.rw * o.k), h = Math.ceil((o.rh + o.pad * 2) * o.k), hz = Math.round((o.pad + o.hz0) * o.k);
  const c = layer(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = vgrad(ctx, 0, hz, skyStops);
  ctx.fillRect(0, 0, w, hz);
  ctx.fillStyle = vgrad(ctx, hz, h, groundStops);
  ctx.fillRect(0, hz, w, h - hz);
  const top = Math.round(o.pad * o.k); // the first plate row that is on screen at rest
  if (sky) sky(ctx, w, hz, top);
  if (ground) ground(ctx, w, hz, h);
  return c;
}

/** The scenes' drawing unit: 1/76 of the horizon height (so 76 u is sky-to-horizon). */
export const unitOf = (hzL) => hzL / 76;

/** A parallax layer canvas sharing the horizon `hzL`; it extends a little below for reflections. */
export function strip(o, paint) {
  const hzL = Math.round(o.hz0 * o.k);
  const c = layer(o.W, hzL + Math.round(o.rh * 0.22 * o.k));
  paint(c.getContext('2d'), o.W, hzL, unitOf(hzL));
  return c;
}

/** Perspective grid on the ground plate (2088's lightcycle arena). */
export function groundGrid(ctx, w, hz, h, color, alpha) {
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
  const vx = w / 2;
  for (let i = -24; i <= 24; i++) { ctx.beginPath(); ctx.moveTo(vx + i * w * 0.004, hz); ctx.lineTo(vx + i * w * 0.12, h); ctx.stroke(); }
  for (let j = 1; j < 18; j++) { const y = hz + (h - hz) * Math.pow(j / 18, 2.2); ctx.globalAlpha = alpha * (0.3 + j / 18); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
}

/** Street lamp with an optional warm glow cone. */
export function lamp(ctx, x, base, h, pole, light, glow) {
  ctx.fillStyle = pole;
  ctx.fillRect(x - Math.max(1, h * 0.02), base - h, Math.max(2, h * 0.04), h);
  ctx.fillRect(x - h * 0.02, base - h, h * 0.16, Math.max(1, h * 0.025));
  if (glow) {
    const g = ctx.createRadialGradient(x + h * 0.12, base - h + 2, 0, x + h * 0.12, base - h + 2, h * 0.45);
    g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - h * 0.4, base - h - h * 0.4, h, h * 0.9);
  }
  ctx.fillStyle = light;
  ctx.fillRect(x + h * 0.08, base - h + Math.max(1, h * 0.025), h * 0.08, Math.max(1, h * 0.03));
}

/** Simple boxy car silhouette (parked roadside traffic). */
export function parkedCar(ctx, x, base, w, body, glass, fins = false) {
  const h = w * 0.32;
  ctx.fillStyle = body;
  ctx.fillRect(x, base - h * 0.55, w, h * 0.4);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.22, base - h * 0.55); ctx.lineTo(x + w * 0.32, base - h); ctx.lineTo(x + w * 0.68, base - h); ctx.lineTo(x + w * 0.8, base - h * 0.55); ctx.closePath(); ctx.fill();
  if (fins) { ctx.beginPath(); ctx.moveTo(x + w * 0.9, base - h * 0.55); ctx.lineTo(x + w, base - h * 0.85); ctx.lineTo(x + w, base - h * 0.55); ctx.fill(); }
  ctx.fillStyle = glass;
  ctx.fillRect(x + w * 0.34, base - h * 0.92, w * 0.32, h * 0.3);
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.arc(x + w * 0.22, base - h * 0.14, h * 0.15, 0, Math.PI * 2); ctx.arc(x + w * 0.78, base - h * 0.14, h * 0.15, 0, Math.PI * 2); ctx.fill();
}
