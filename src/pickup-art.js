// Crisp pickup art (lazy chunk). Each kind (src/pickups.js) is a clean vector icon (ART below),
// rendered once per size bucket into an offscreen canvas and then blitted at (or just under)
// its native size, so a coin is never a blurry upscaled bitmap. Silhouettes are shape-coded
// (coin = disc + star, flux core = hexagon + bolt, repair = rounded square + cross, NOS =
// capsule canister) so they read without relying on colour. Also here: a pooled collect burst
// and the power-up hint arrow. Nothing allocates per frame once the cache is warm.

// Shape-coded art per kind: coin = disc + star, flux core = hexagon + bolt, repair = rounded
// square + cross, NOS = capsule canister.
export const ART = {
  HW_COIN: { shape: 'disc', body: '#facc15', rim: '#b45309', core: '#ff5500', glow: 'rgba(255,196,0,0.55)' },
  PLUTONIUM: { shape: 'hex', body: '#22d3ee', rim: '#0e7490', core: '#fef08a', glow: 'rgba(0,240,255,0.55)' },
  REPAIR_WRENCH: { shape: 'cross', body: '#10b981', rim: '#065f46', core: '#ffffff', glow: 'rgba(52,211,153,0.5)' },
  NOS_CAN: { shape: 'capsule', body: '#3b82f6', rim: '#1e3a8a', core: '#e0f2fe', glow: 'rgba(96,165,250,0.55)' },
};

const STEP = 1.12;          // size buckets grow 12% at a time
const PAD = 1.7;            // icon canvas = size × PAD (room for the glow)
const CACHE_MAX = 160;
const cache = new Map();    // `${kind}:${bucket}` → canvas
export const stats = { icons: 0, built: 0, bursts: 0 };

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** The size bucket for an on-screen size (px): the smallest bucket at least that big. */
export function bucketOf(px) {
  return Math.max(0, Math.ceil(Math.log(Math.max(4, px) / 4) / Math.log(STEP)));
}
export const bucketSize = (b) => Math.round(4 * Math.pow(STEP, b));

function poly(c, cx, cy, r, n, rot) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function star(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
}

/** Paint kind `kind` at size S (px) centred in canvas `c` of side W. */
export function paintIcon(c, kind, S, W) {
  const a = ART[kind];
  const m = W / 2;
  const line = Math.max(1, S * 0.06);
  // Soft glow first, so the icon pops off any road colour.
  const g = c.createRadialGradient(m, m, S * 0.2, m, m, S * 0.82);
  g.addColorStop(0, a.glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, W);
  const body = c.createLinearGradient(m - S * 0.4, m - S * 0.4, m + S * 0.4, m + S * 0.4);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.18, a.body);
  body.addColorStop(1, a.rim);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(8,6,20,0.8)';
  c.lineWidth = line * 1.6;
  if (a.shape === 'disc') {
    c.beginPath(); c.arc(m, m, S * 0.42, 0, Math.PI * 2);
    c.fillStyle = a.rim; c.fill(); c.stroke();
    c.beginPath(); c.arc(m, m, S * 0.35, 0, Math.PI * 2);
    c.fillStyle = body; c.fill();
    c.strokeStyle = a.rim; c.lineWidth = line; c.stroke();
    star(c, m, m + S * 0.01, S * 0.2);
    c.fillStyle = a.core; c.fill();
  } else if (a.shape === 'hex') {
    poly(c, m, m, S * 0.45, 6, Math.PI / 6);
    c.fillStyle = a.rim; c.fill(); c.stroke();
    poly(c, m, m, S * 0.37, 6, Math.PI / 6);
    c.fillStyle = body; c.fill();
    // A lightning bolt.
    c.beginPath();
    c.moveTo(m + S * 0.06, m - S * 0.26); c.lineTo(m - S * 0.13, m + S * 0.04); c.lineTo(m - S * 0.01, m + S * 0.04);
    c.lineTo(m - S * 0.07, m + S * 0.27); c.lineTo(m + S * 0.14, m - S * 0.05); c.lineTo(m + S * 0.02, m - S * 0.05);
    c.closePath();
    c.fillStyle = a.core; c.fill();
    c.strokeStyle = a.rim; c.lineWidth = line * 0.7; c.stroke();
  } else if (a.shape === 'cross') {
    roundRect(c, m - S * 0.4, m - S * 0.4, S * 0.8, S * 0.8, S * 0.18);
    c.fillStyle = a.rim; c.fill(); c.stroke();
    roundRect(c, m - S * 0.33, m - S * 0.33, S * 0.66, S * 0.66, S * 0.13);
    c.fillStyle = body; c.fill();
    const t = S * 0.09, l = S * 0.22;
    c.fillStyle = a.core;
    roundRect(c, m - l, m - t, l * 2, t * 2, t * 0.6); c.fill();
    roundRect(c, m - t, m - l, t * 2, l * 2, t * 0.6); c.fill();
  } else {
    // NOS canister: a capsule with a nozzle and a white band carrying an "N".
    const w = S * 0.46, h = S * 0.78;
    c.fillStyle = '#1f2937';
    roundRect(c, m - S * 0.09, m - h / 2 - S * 0.1, S * 0.18, S * 0.14, S * 0.04); c.fill();
    roundRect(c, m - w / 2, m - h / 2, w, h, w / 2);
    c.fillStyle = body; c.fill(); c.stroke();
    c.fillStyle = a.core;
    c.fillRect(m - w / 2 + line * 0.5, m - S * 0.11, w - line, S * 0.22);
    c.strokeStyle = a.rim; c.lineWidth = Math.max(1, S * 0.05);
    c.beginPath();
    c.moveTo(m - S * 0.08, m + S * 0.07); c.lineTo(m - S * 0.08, m - S * 0.07);
    c.lineTo(m + S * 0.08, m + S * 0.07); c.lineTo(m + S * 0.08, m - S * 0.07);
    c.stroke();
  }
  // A glossy highlight on the upper left.
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = Math.max(1, S * 0.05);
  c.beginPath(); c.arc(m, m, S * 0.28, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
}

// Device pixels per drawing unit on the canvas the race draws into (the 2D renderer's backing
// scale, 0145), so icons are cached at the size they really land on screen and stay crisp.
let pxScale = 1;
export function setPixelScale(k) { pxScale = k > 0 ? k : 1; }

/** The cached icon canvas for `kind` drawn at least `px` big (its side is bucketSize × PAD). */
export function iconFor(kind, px) {
  if (!ART[kind]) return null;
  const b = bucketOf(px);
  const key = kind + ':' + b;
  let cv = cache.get(key);
  if (!cv) {
    if (cache.size >= CACHE_MAX) cache.clear();
    const S = bucketSize(b);
    const W = Math.ceil(S * PAD);
    cv = makeCanvas(W, W);
    const c = cv.getContext('2d');
    if (c) paintIcon(c, kind, S, W);
    cv.iconSize = S;
    cache.set(key, cv);
    stats.built++;
  }
  stats.icons = cache.size;
  return cv;
}

/**
 * Draw a pickup centred at (x, y), `size` px across. Coins spin (edge-on squash), the others
 * rock gently; calm mode holds them still. Positions snap to whole pixels to stay sharp.
 */
export function drawPickup(ctx, kind, x, y, size, t, phase, still) {
  const cv = iconFor(kind, size * pxScale);
  if (!cv) return;
  const k = size / cv.iconSize;
  const W = cv.width * k;
  let sx = 1, rot = 0;
  if (!still) {
    if (ART[kind].shape === 'disc') sx = Math.max(0.18, Math.abs(Math.cos(t * 3.2 + phase)));
    else rot = Math.sin(t * 2.4 + phase) * 0.22;
  }
  const px = Math.round(x), py = Math.round(y);
  if (rot === 0 && sx === 1) { ctx.drawImage(cv, Math.round(px - W / 2), Math.round(py - W / 2), Math.round(W), Math.round(W)); return; }
  ctx.save();
  ctx.translate(px, py);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(cv, -W * sx / 2, -W / 2, W * sx, W);
  ctx.restore();
}

// ── Collect bursts: a pooled ring + spark spray in the pickup's colour ─────────────────────
const BURST_N = 48;
const parts = [];
for (let i = 0; i < BURST_N; i++) parts.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, color: '' });
const rings = [];
for (let i = 0; i < 6; i++) rings.push({ life: 0, x: 0, color: '' });
let cursor = 0, ringCursor = 0, lastT = 0;

/** A pickup was collected `rel` lane units from the car. */
export function burst(kind, rel) {
  if (!ART[kind]) return;
  const color = ART[kind].body;
  const r = rings[ringCursor]; ringCursor = (ringCursor + 1) % rings.length;
  r.life = 0.45; r.x = rel; r.color = color;
  for (let n = 0; n < 10; n++) {
    const p = parts[cursor]; cursor = (cursor + 1) % BURST_N;
    const a = (n / 10) * Math.PI * 2 + rel;
    p.life = 0.5; p.x = rel; p.y = 0; p.vx = Math.cos(a); p.vy = Math.sin(a) * 0.7 - 0.4; p.color = color;
  }
  stats.bursts++;
}

/** Draw and age the bursts around the car at (cx, cy) on a canvas `rw` wide. */
export function drawBursts(ctx, cx, cy, rw) {
  const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  const dt = lastT ? Math.min(0.05, Math.max(0, now - lastT)) : 0;
  lastT = now;
  const u = rw * 0.08;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (r.life <= 0) continue;
    r.life -= dt;
    const k = 1 - Math.max(0, r.life) / 0.45;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(1, u * 0.12 * (1 - k));
    ctx.beginPath();
    ctx.ellipse(cx + r.x * u, cy - u * 0.8, u * (0.3 + k * 1.1), u * (0.2 + k * 0.6), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < BURST_N; i++) {
    const p = parts[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    const k = 1 - Math.max(0, p.life) / 0.5;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = p.color;
    const s = Math.max(1, u * 0.09 * (1 - k * 0.5));
    ctx.fillRect(Math.round(cx + p.x * u + p.vx * u * 1.4 * k - s / 2), Math.round(cy - u * 0.8 + p.vy * u * 1.4 * k - s / 2), s, s);
  }
  ctx.globalAlpha = 1;
}

/**
 * The power-up hint: the next core / wrench / NOS icon with a chevron toward it, fading in as
 * it gets closer. `side` is -1 (left of you), 0 (dead ahead) or 1 (right).
 */
export function drawHint(ctx, rw, rh, kind, side, segs, t) {
  if (!kind || !ART[kind] || segs < 4) return;
  const near = 1 - Math.min(1, segs / 26);
  const s = Math.max(12, Math.min(rw, rh) * 0.05);
  const x = rw * 0.5 + side * rw * 0.16, y = rh * 0.6;
  ctx.globalAlpha = 0.35 + 0.5 * near;
  drawPickup(ctx, kind, x, y, s, t, 0, true);
  ctx.strokeStyle = ART[kind].body;
  ctx.lineWidth = Math.max(1.5, s * 0.12);
  ctx.beginPath();
  const bob = Math.sin(t * 6) * s * 0.08;
  if (side === 0) {
    ctx.moveTo(x - s * 0.3, y - s * 0.75 + bob); ctx.lineTo(x, y - s * 1.0 + bob); ctx.lineTo(x + s * 0.3, y - s * 0.75 + bob);
  } else {
    const ax = x + side * (s * 0.85 + bob);
    ctx.moveTo(ax - side * s * 0.22, y - s * 0.3); ctx.lineTo(ax, y); ctx.lineTo(ax - side * s * 0.22, y + s * 0.3);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
