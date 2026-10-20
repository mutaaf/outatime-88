// Crisp pickup art (lazy chunk). Each kind (src/pickups.js) is a clean vector icon (ART below),
// rendered once per size bucket into an offscreen canvas and then blitted at (or just under)
// its native size, so a coin is never a blurry upscaled bitmap. Silhouettes are shape-coded
// (coin = disc + star, flux core = hexagon + bolt, repair = rounded square + cross, NOS =
// capsule canister) so they read without relying on colour. Also here: a pooled collect burst
// and the power-up hint arrow, and the floating pickup / score labels (src/popups.js). Nothing
// allocates per frame once the cache is warm.

import { LABEL, labelSlots, layoutLabels, fallbackBox } from './popups.js';

// Shape-coded art per kind: coin = disc + star, flux core = hexagon + bolt, repair = rounded
// square + cross, NOS = capsule canister.
export const ART = {
  HW_COIN: { shape: 'disc', body: '#facc15', rim: '#b45309', core: '#ff5500', glow: 'rgba(255,196,0,0.55)' },
  PLUTONIUM: { shape: 'hex', body: '#22d3ee', rim: '#0e7490', core: '#fef08a', glow: 'rgba(0,240,255,0.55)' },
  REPAIR_WRENCH: { shape: 'cross', body: '#10b981', rim: '#065f46', core: '#ffffff', glow: 'rgba(52,211,153,0.5)' },
  NOS_CAN: { shape: 'capsule', body: '#3b82f6', rim: '#1e3a8a', core: '#e0f2fe', glow: 'rgba(96,165,250,0.55)' },
  // Runner power-ups (0177): magnet = horseshoe with silver tips, shield = crest, 2X = star badge.
  MAGNET: { shape: 'magnet', body: '#f43f5e', rim: '#881337', core: '#e2e8f0', glow: 'rgba(244,63,94,0.55)' },
  SHIELD: { shape: 'shield', body: '#38bdf8', rim: '#0c4a6e', core: '#f0f9ff', glow: 'rgba(56,189,248,0.6)' },
  DOUBLER: { shape: 'badge', body: '#facc15', rim: '#92400e', core: '#7c2d12', glow: 'rgba(250,204,21,0.6)' },
};

const STEP = 1.12;          // size buckets grow 12% at a time
const PAD = 1.7;            // icon canvas = size × PAD (room for the glow)
const CACHE_MAX = 160;
const cache = new Map();    // `${kind}:${bucket}` → canvas
export const stats = { icons: 0, built: 0, bursts: 0, labels: 0, rw: 0, rh: 0, box: { x0: 0, y0: 0, x1: 0, y1: 0 }, slots: null };

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
  } else if (a.shape === 'magnet') {
    // A horseshoe magnet: thick red arc, two silver pole tips.
    const R = S * 0.3, w = S * 0.17, top = m - S * 0.06;
    c.lineCap = 'butt';
    c.beginPath(); c.arc(m, top, R, Math.PI, 0, true);
    c.strokeStyle = 'rgba(8,6,20,0.8)'; c.lineWidth = w + line * 1.6; c.stroke();
    c.strokeStyle = body; c.lineWidth = w; c.stroke();
    c.fillStyle = a.rim;
    for (const sx of [-1, 1]) {
      const x = m + sx * R - w / 2;
      c.fillStyle = 'rgba(8,6,20,0.8)'; c.fillRect(x - line * 0.8, m - S * 0.36 - line * 0.8, w + line * 1.6, S * 0.32 + line * 1.6);
      c.fillStyle = body; c.fillRect(x, m - S * 0.36, w, S * 0.16);
      c.fillStyle = a.core; c.fillRect(x, m - S * 0.2, w, S * 0.14);
    }
    c.lineCap = 'round';
    // Little field lines between the poles.
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = Math.max(1, S * 0.035);
    for (const k of [0.1, 0.2]) { c.beginPath(); c.moveTo(m - S * k, m - S * 0.38); c.lineTo(m - S * k * 0.6, m - S * 0.3); c.moveTo(m + S * k, m - S * 0.38); c.lineTo(m + S * k * 0.6, m - S * 0.3); c.stroke(); }
  } else if (a.shape === 'shield') {
    // A heater-shield crest with a white chevron.
    const crest = (k) => {
      c.beginPath();
      c.moveTo(m, m - S * 0.44 * k);
      c.quadraticCurveTo(m + S * 0.26 * k, m - S * 0.34 * k, m + S * 0.4 * k, m - S * 0.36 * k);
      c.quadraticCurveTo(m + S * 0.42 * k, m + S * 0.14 * k, m, m + S * 0.46 * k);
      c.quadraticCurveTo(m - S * 0.42 * k, m + S * 0.14 * k, m - S * 0.4 * k, m - S * 0.36 * k);
      c.quadraticCurveTo(m - S * 0.26 * k, m - S * 0.34 * k, m, m - S * 0.44 * k);
      c.closePath();
    };
    crest(1); c.fillStyle = a.rim; c.fill(); c.stroke();
    crest(0.8); c.fillStyle = body; c.fill();
    c.strokeStyle = a.core; c.lineWidth = Math.max(1.5, S * 0.08);
    c.beginPath(); c.moveTo(m - S * 0.17, m - S * 0.02); c.lineTo(m, m + S * 0.16); c.lineTo(m + S * 0.17, m - S * 0.02); c.stroke();
  } else if (a.shape === 'badge') {
    // A gold star badge stamped "2×".
    poly(c, m, m, S * 0.46, 12, 0);
    c.fillStyle = a.rim; c.fill(); c.stroke();
    star(c, m, m, S * 0.44);
    c.fillStyle = body; c.fill();
    c.beginPath(); c.arc(m, m, S * 0.24, 0, Math.PI * 2);
    c.fillStyle = '#fff7cc'; c.fill();
    c.strokeStyle = a.rim; c.lineWidth = line; c.stroke();
    c.fillStyle = a.core;
    c.font = `900 ${Math.max(6, Math.round(S * 0.25))}px Orbitron, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('2×', m, m + S * 0.015);
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

// ── Power-up HUD (0177): a countdown ring per active power-up and the shield bubble ─────────
const RING_ORDER = ['MAGNET', 'SHIELD', 'DOUBLER'];

/**
 * Draw the active power-ups' timer rings (left edge, stacked) and, while the shield is up, a
 * bubble around the car at (carX, carY). `st` is src/powerups.js state; nothing allocates.
 */
export function drawPowerHud(ctx, rw, rh, st, carX, carY, t, still) {
  if (!st || !st.on) return;
  const r = Math.max(13, Math.min(rw, rh) * 0.042);
  const x = Math.round(r + Math.max(10, rw * 0.02));
  let y = Math.round(rh * 0.34);
  for (let i = 0; i < RING_ORDER.length; i++) {
    const k = RING_ORDER[i];
    const left = st.t[k];
    if (!(left > 0)) continue;
    const frac = Math.max(0, Math.min(1, left / (st.dur[k] || 1)));
    const ending = left < 2 && !still && Math.sin(t * 18) > 0; // blinks for the last two seconds
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(8,10,28,0.78)';
    ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, r * 0.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ART[k].body;
    ctx.globalAlpha = ending ? 0.45 : 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.95, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    drawPickup(ctx, k, x, y, r * 1.25, 0, 0, true);
    y += Math.round(r * 2.6);
  }
  if (st.t.SHIELD > 0) {
    const R = Math.max(30, rw * 0.085);
    const pulse = still ? 0 : Math.sin(t * 5) * 0.06;
    const g = ctx.createRadialGradient(carX, carY, R * 0.55, carX, carY, R * (1.05 + pulse));
    g.addColorStop(0, 'rgba(56,189,248,0)');
    g.addColorStop(0.8, 'rgba(56,189,248,0.16)');
    g.addColorStop(1, 'rgba(186,230,253,0.55)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(carX, carY, R * (1.05 + pulse), R * 0.72 * (1.05 + pulse), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = st.t.SHIELD < 2 && !still && Math.sin(t * 18) > 0 ? 'rgba(186,230,253,0.25)' : 'rgba(186,230,253,0.8)';
    ctx.lineWidth = Math.max(1.5, R * 0.035);
    ctx.stroke();
  }
}

const slots = labelSlots();
stats.slots = slots;
const LABEL_FONT = `bold ${LABEL.font}px Orbitron, sans-serif`;
let measureCtx = null;
const measure = (text) => measureCtx.measureText(text).width;

/**
 * The floating labels of `list` (GameState.hitShockwaves) on a dark plate, clear of the car:
 * `box` is the car's screen box from drawPlayerCar, or null to use the fallback (3D view).
 * `still`: reduced motion (labels don't float).
 */
export function drawLabels(ctx, rw, rh, list, box, still) {
  if (!list.length) { stats.labels = 0; return; }
  const b = box && box.y1 > box.y0 ? box : fallbackBox(rw, rh, stats.box);
  if (b !== stats.box) { stats.box.x0 = b.x0; stats.box.y0 = b.y0; stats.box.x1 = b.x1; stats.box.y1 = b.y1; }
  stats.rw = rw; stats.rh = rh;
  ctx.save();
  ctx.font = LABEL_FONT;
  measureCtx = ctx;
  const n = layoutLabels(list, b, rw, rh, measure, slots, still);
  stats.labels = n;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const o = i * LABEL.stride;
    const x = slots[o], y = slots[o + 1], w = slots[o + 2], h = slots[o + 3], s = slots[o + 6];
    const e = list[slots[o + 5]];
    ctx.globalAlpha = slots[o + 4];
    ctx.fillStyle = 'rgba(6,8,20,0.86)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = e.color || '#ffd000';
    ctx.fillRect(x, y + h - Math.max(1, 2 * s), w, Math.max(1, 2 * s));
    ctx.fillStyle = '#ffffff';
    if (s < 1) {
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.scale(s, s);
      ctx.fillText(e.label, 0, 0);
      ctx.scale(1 / s, 1 / s);
      ctx.translate(-(x + w * 0.5), -(y + h * 0.5));
    } else ctx.fillText(e.label, x + w * 0.5, y + h * 0.5);
  }
  ctx.restore();
}
