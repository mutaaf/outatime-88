// Era roadside (ticket 0101): the props beside the road and the solid "tree" hazard on it,
// painted ONCE per era as shaded sprites (body gradient, rim light from the era's horizon
// colour), plus a fog-tinted silhouette of each for depth and one soft contact-shadow sprite.
// Per frame it is only drawImage calls: no gradients, no allocation. Also lays out rival name
// tags so they never pile up.
//
// Sprites are drawn bottom-centre anchored. Sizes come from the caller's item/obstacle box; art
// height is capped so one prop never fills more than ~30 % of the screen.
import { ERA_PALETTES } from '../era-palettes.js';
import { vgrad, palm, cactus, pine } from './kit.js';

const REF = 192; // reference sprite height in px (scaled by the quality tier)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(h));
  return c;
}

/** A metal/stone shaft with a gradient body and a rim light down its sunward edge. */
function shaft(ctx, x, y0, y1, w, dark, mid, rim) {
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, dark); g.addColorStop(0.55, mid); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.fillRect(x - w / 2, y1, w, y0 - y1);
  ctx.fillStyle = rim; ctx.globalAlpha = 0.7; ctx.fillRect(x + w / 2 - Math.max(1, w * 0.18), y1, Math.max(1, w * 0.18), y0 - y1); ctx.globalAlpha = 1;
}

function glowDot(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function blob(ctx, x, y, rx, ry, dark, light, rim) {
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, rx * 0.1, x, y, rx * 1.1);
  g.addColorStop(0, light); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  if (rim) { ctx.strokeStyle = rim; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, rx * 0.06); ctx.beginPath(); ctx.ellipse(x, y, rx * 0.97, ry * 0.97, 0, -1.2, 0.5); ctx.stroke(); ctx.globalAlpha = 1; }
}

function planter(ctx, W, H, top, stone, stoneDark, rim) {
  ctx.fillStyle = vgrad(ctx, H - top, H, [stone, stoneDark]);
  ctx.fillRect(W * 0.08, H - top, W * 0.84, top);
  ctx.fillStyle = rim; ctx.globalAlpha = 0.6; ctx.fillRect(W * 0.08, H - top, W * 0.84, Math.max(1, top * 0.08)); ctx.globalAlpha = 1;
}

// Painters: (ctx, W, H, p) with p = era palette + rim colour. Each returns nothing; aspect is
// declared in the table below (W = H * aspect).
const P = {
  // --- street lamps / poles ---
  lampCream: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.12, W * 0.12, '#8a8172', '#f2ead8', p.rim); c.fillStyle = '#e9e2cf'; c.fillRect(W * 0.3, H * 0.06, W * 0.4, H * 0.08); glowDot(c, W / 2, H * 0.1, W * 0.45, 'rgba(255,244,200,0.55)'); c.fillStyle = '#fffbea'; c.beginPath(); c.arc(W / 2, H * 0.1, W * 0.16, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6b6457'; c.fillRect(W * 0.32, H * 0.94, W * 0.36, H * 0.06); },
  cobraLamp: (c, W, H, p) => { shaft(c, W * 0.3, H, H * 0.1, W * 0.1, '#1f2430', '#5b6474', p.rim); c.fillStyle = '#3b4252'; c.fillRect(W * 0.3, H * 0.08, W * 0.5, H * 0.035); c.fillStyle = '#4b5563'; c.fillRect(W * 0.62, H * 0.07, W * 0.3, H * 0.05); glowDot(c, W * 0.77, H * 0.13, W * 0.4, 'rgba(255,214,150,0.55)'); },
  telegraph: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.04, W * 0.11, '#3a1d0c', '#7a4a26', p.rim); c.fillStyle = '#4a2610'; c.fillRect(W * 0.1, H * 0.1, W * 0.8, H * 0.03); c.fillRect(W * 0.18, H * 0.2, W * 0.64, H * 0.025); c.fillStyle = '#9fd3c7'; for (const x of [0.14, 0.34, 0.66, 0.86]) c.fillRect(W * x - 1, H * 0.085, 3, H * 0.018); },
  holoLamp: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.08, W * 0.1, '#0b1d2e', '#5b7f99', p.rim); c.fillStyle = 'rgba(103,232,249,0.85)'; c.fillRect(W * 0.2, H * 0.05, W * 0.6, H * 0.025); glowDot(c, W / 2, H * 0.07, W * 0.5, 'rgba(103,232,249,0.45)'); c.fillStyle = '#67e8f9'; c.fillRect(W * 0.46, H * 0.2, W * 0.08, H * 0.6); },
  neonPylon: (c, W, H, p) => { c.fillStyle = vgrad(c, 0, H, ['#1a0b2e', '#07020f']); c.beginPath(); c.moveTo(W * 0.3, H); c.lineTo(W * 0.4, 0); c.lineTo(W * 0.6, 0); c.lineTo(W * 0.7, H); c.fill(); c.fillStyle = '#f0abfc'; c.fillRect(W * 0.47, H * 0.06, W * 0.06, H * 0.86); glowDot(c, W / 2, H * 0.5, W * 0.5, 'rgba(240,171,252,0.25)'); c.fillStyle = p.rim; c.globalAlpha = 0.6; c.fillRect(W * 0.62, H * 0.1, W * 0.04, H * 0.9); c.globalAlpha = 1; },
  wetLamp: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.1, W * 0.1, '#140a22', '#4c3a66', p.rim); c.fillStyle = '#2a1d3d'; c.beginPath(); c.moveTo(W * 0.25, H * 0.12); c.lineTo(W * 0.5, H * 0.02); c.lineTo(W * 0.75, H * 0.12); c.fill(); glowDot(c, W / 2, H * 0.13, W * 0.5, 'rgba(255,190,120,0.6)'); c.fillStyle = 'rgba(255,170,90,0.35)'; c.beginPath(); c.ellipse(W / 2, H * 0.97, W * 0.45, H * 0.025, 0, 0, Math.PI * 2); c.fill(); },
  // --- trees, hedges, plants ---
  hedge: (c, W, H, p) => { blob(c, W / 2, H * 0.55, W * 0.46, H * 0.4, '#1f4d36', '#5fa77b', p.rim); c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 9; i++) c.fillRect(W * (0.15 + (i % 3) * 0.25), H * (0.3 + ((i / 3) | 0) * 0.15), 3, 2); },
  maple: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.45, W * 0.1, '#2b1a10', '#5a3a24', p.rim); blob(c, W * 0.38, H * 0.36, W * 0.3, H * 0.22, '#2a1408', '#9a3412', null); blob(c, W * 0.62, H * 0.34, W * 0.3, H * 0.22, '#3a1a08', '#c2410c', null); blob(c, W / 2, H * 0.2, W * 0.34, H * 0.2, '#3a1a08', '#ea7a24', p.rim); },
  palmShaded: (c, W, H, p) => { palm(c, W * 0.4, H, H * 0.95, '#0a0614'); c.globalAlpha = 0.5; c.strokeStyle = p.rim; c.lineWidth = Math.max(1, H * 0.012); c.beginPath(); c.moveTo(W * 0.42, H); c.quadraticCurveTo(W * 0.4 + H * 0.12, H * 0.5, W * 0.4 + H * 0.06, H * 0.05); c.stroke(); c.globalAlpha = 1; },
  saguaro: (c, W, H, p) => { cactus(c, W / 2, H, H * 0.95, '#1f3d2a'); c.globalAlpha = 0.55; c.fillStyle = p.rim; c.fillRect(W / 2 + H * 0.04, H * 0.06, Math.max(1, H * 0.02), H * 0.9); c.globalAlpha = 1; },
  fence: (c, W, H, p) => { c.fillStyle = '#4a2a14'; for (const x of [0.12, 0.5, 0.88]) c.fillRect(W * x - W * 0.04, H * 0.2, W * 0.08, H * 0.8); c.fillStyle = '#6b3d1d'; c.fillRect(0, H * 0.32, W, H * 0.07); c.fillRect(0, H * 0.6, W, H * 0.07); c.fillStyle = p.rim; c.globalAlpha = 0.5; c.fillRect(0, H * 0.32, W, Math.max(1, H * 0.015)); c.globalAlpha = 1; },
  mailbox: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.45, W * 0.1, '#2a2a2a', '#6b7280', p.rim); c.fillStyle = vgrad(c, H * 0.25, H * 0.48, ['#4b6fa8', '#1e3a6e']); c.beginPath(); c.moveTo(W * 0.2, H * 0.48); c.lineTo(W * 0.2, H * 0.32); c.arc(W / 2, H * 0.32, W * 0.3, Math.PI, 0); c.lineTo(W * 0.8, H * 0.48); c.fill(); c.fillStyle = '#dc2626'; c.fillRect(W * 0.78, H * 0.22, W * 0.06, H * 0.12); },
  bollard: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.1, W * 0.5, '#0b1d2e', '#8fb3c9', p.rim); c.fillStyle = '#67e8f9'; c.fillRect(W * 0.25, H * 0.22, W * 0.5, H * 0.05); c.fillRect(W * 0.25, H * 0.42, W * 0.5, H * 0.05); glowDot(c, W / 2, H * 0.12, W * 0.9, 'rgba(103,232,249,0.4)'); },
  hydrant: (c, W, H, p) => { c.fillStyle = vgrad(c, H * 0.3, H, ['#b91c1c', '#450a0a']); c.fillRect(W * 0.3, H * 0.3, W * 0.4, H * 0.7); c.beginPath(); c.arc(W / 2, H * 0.3, W * 0.2, Math.PI, 0); c.fill(); c.fillRect(W * 0.18, H * 0.45, W * 0.64, H * 0.1); c.fillStyle = p.rim; c.globalAlpha = 0.6; c.fillRect(W * 0.64, H * 0.3, W * 0.05, H * 0.7); c.globalAlpha = 1; },
  // --- the solid on-road hazard, one per era (trees are static in physics, ticket 0074) ---
  topiary: (c, W, H, p) => { planter(c, W, H, H * 0.22, '#d6cdb8', '#8c806a', p.rim); blob(c, W / 2, H * 0.48, W * 0.36, H * 0.3, '#14532d', '#4ade80', p.rim); c.fillStyle = 'rgba(20,83,45,0.35)'; for (let i = 0; i < 14; i++) c.fillRect(W * (0.22 + (i % 5) * 0.12), H * (0.28 + ((i / 5) | 0) * 0.14), 3, 3); },
  mapleBox: (c, W, H, p) => { planter(c, W, H, H * 0.16, '#9a4a32', '#5a2416', p.rim); shaft(c, W / 2, H * 0.86, H * 0.45, W * 0.12, '#2b1a10', '#5a3a24', p.rim); blob(c, W / 2, H * 0.3, W * 0.42, H * 0.26, '#3a1a08', '#d9622b', p.rim); },
  bigSaguaro: (c, W, H, p) => { c.fillStyle = vgrad(c, H * 0.8, H, ['#8a5a36', '#4a2a14']); c.beginPath(); c.ellipse(W / 2, H * 0.93, W * 0.42, H * 0.08, 0, 0, Math.PI * 2); c.fill(); cactus(c, W / 2, H * 0.9, H * 0.86, '#2b5a3a'); c.globalAlpha = 0.6; c.fillStyle = p.rim; c.fillRect(W / 2 + H * 0.045, H * 0.06, Math.max(1, H * 0.02), H * 0.82); c.globalAlpha = 1; },
  holoPillar: (c, W, H, p) => { shaft(c, W / 2, H, H * 0.05, W * 0.46, '#0b1d2e', '#a5c6da', p.rim); for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(103,232,249,0.9)'; c.fillRect(W * 0.27, H * (0.15 + i * 0.2), W * 0.46, H * 0.03); } glowDot(c, W / 2, H * 0.05, W * 0.6, 'rgba(103,232,249,0.5)'); },
  monolith: (c, W, H, p) => { c.fillStyle = vgrad(c, 0, H, ['#24103f', '#05010c']); c.fillRect(W * 0.24, H * 0.04, W * 0.52, H * 0.96); c.fillStyle = '#f0abfc'; c.fillRect(W * 0.3, H * 0.08, W * 0.04, H * 0.88); c.fillStyle = '#22d3ee'; c.fillRect(W * 0.66, H * 0.08, W * 0.04, H * 0.88); glowDot(c, W / 2, H * 0.5, W * 0.6, 'rgba(240,171,252,0.2)'); },
  wetPlanter: (c, W, H, p) => { planter(c, W, H, H * 0.2, '#3b3150', '#140a22', p.rim); palm(c, W * 0.46, H * 0.82, H * 0.78, '#0d0717'); c.fillStyle = 'rgba(255,120,120,0.18)'; c.fillRect(W * 0.08, H * 0.98, W * 0.84, H * 0.02); },
};

// Per era: which sprite each roadside type becomes, its aspect (W/H) and its height relative to
// the item box. `HAZARD` is the solid on-road tree hazard.
const SET = {
  1955: { STREET_LAMP: ['lampCream', 0.32, 2.6], PALM_TREE: ['palmShaded', 0.75, 2.2], ARCH_HW: ['hedge', 1.6, 0.9], HAZARD: ['topiary', 0.95] },
  1985: { STREET_LAMP: ['cobraLamp', 0.55, 2.7], PALM_TREE: ['maple', 0.85, 2.3], ARCH_HW: ['mailbox', 0.45, 1.1], HAZARD: ['mapleBox', 0.9] },
  1885: { STREET_LAMP: ['telegraph', 0.5, 2.9], PALM_TREE: ['saguaro', 0.7, 1.8], ARCH_HW: ['fence', 2.2, 0.8], HAZARD: ['bigSaguaro', 0.85] },
  2015: { STREET_LAMP: ['holoLamp', 0.4, 2.6], PALM_TREE: ['neonPylon', 0.35, 2.4], ARCH_HW: ['bollard', 0.4, 1.0], HAZARD: ['holoPillar', 0.55] },
  2088: { STREET_LAMP: ['neonPylon', 0.35, 2.8], PALM_TREE: ['monolith', 0.4, 2.3], ARCH_HW: ['bollard', 0.4, 1.0], HAZARD: ['monolith', 0.5] },
  2026: { STREET_LAMP: ['wetLamp', 0.45, 2.6], PALM_TREE: ['palmShaded', 0.75, 2.3], ARCH_HW: ['hydrant', 0.6, 0.8], HAZARD: ['wetPlanter', 0.85] },
};

let cache = null;
let shadow = null;

function shadowSprite() {
  const c = canvas(64, 16);
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 0.25, 0, 0); // squash a soft disc into a flat ellipse
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return c;
}

/** Build (once per era × tier) the sprites and their fog silhouettes. */
export function roadsideFor(eraId, scale = 1) {
  if (cache && cache.id === eraId && cache.scale === scale) return cache;
  const pal = ERA_PALETTES[eraId] || ERA_PALETTES[2026];
  const p = { ...pal, rim: pal.horizon };
  const H = Math.round(REF * scale);
  const sprites = {};
  for (const [type, [name, aspect, rel]] of Object.entries(SET[eraId] || SET[2026])) {
    const img = canvas(H * aspect, H);
    P[name](img.getContext('2d'), img.width, img.height, p);
    const fog = canvas(img.width, img.height);
    const f = fog.getContext('2d');
    f.drawImage(img, 0, 0); f.globalCompositeOperation = 'source-in'; f.fillStyle = pal.fog; f.fillRect(0, 0, fog.width, fog.height);
    sprites[type] = { img, fog, aspect, rel: rel || 1 };
  }
  if (!shadow) shadow = shadowSprite();
  cache = { id: eraId, scale, sprites };
  return cache;
}

/** Largest share of the screen any roadside sprite took (debug/tests). */
export const stats = { maxH: 0, maxW: 0, tags: 0 };

const MAX_H = 0.3; // never taller than 30 % of the screen
const MAX_W = 0.3;

/** Soft contact shadow under a prop or car. */
export function contactShadow(ctx, x, y, w) {
  if (!shadow) shadow = shadowSprite();
  ctx.drawImage(shadow, x - w * 0.6, y - w * 0.09, w * 1.2, w * 0.2);
}

/**
 * Draw roadside `type` at (x, roadY) for an item box (w, h). `depth` 0 (near) … 1 (far) adds the
 * era's fog tint. Returns false if this era has no art for the type (caller keeps its own).
 */
export function drawProp(ctx, R, type, x, roadY, w, h, rh, rw, depth, tintOn) {
  const s = R.sprites[type];
  if (!s) return false;
  let ph = Math.min(h * s.rel, rh * MAX_H);
  let pw = ph * s.aspect;
  if (pw > rw * MAX_W) { pw = rw * MAX_W; ph = pw / s.aspect; }
  stats.maxH = Math.max(stats.maxH, ph / rh); stats.maxW = Math.max(stats.maxW, pw / rw);
  contactShadow(ctx, x, roadY, Math.max(pw * 0.8, 6));
  ctx.drawImage(s.img, x - pw / 2, roadY - ph, pw, ph);
  if (tintOn && depth > 0.05) {
    ctx.globalAlpha = Math.min(0.55, depth * 0.6);
    ctx.drawImage(s.fog, x - pw / 2, roadY - ph, pw, ph);
    ctx.globalAlpha = 1;
  }
  return true;
}

/** The on-road solid hazard: base width `ow` matches the collision box; height is art. */
export function drawHazard(ctx, R, ow, baseY, rh, rw, depth, tintOn) {
  const s = R.sprites.HAZARD;
  if (!s) return false;
  let pw = Math.min(ow * 1.15, rw * MAX_W);
  let ph = pw / s.aspect;
  if (ph > rh * MAX_H) { ph = rh * MAX_H; pw = ph * s.aspect; }
  stats.maxH = Math.max(stats.maxH, ph / rh); stats.maxW = Math.max(stats.maxW, pw / rw);
  contactShadow(ctx, 0, baseY, ow);
  ctx.drawImage(s.img, -pw / 2, baseY - ph, pw, ph);
  if (tintOn && depth > 0.05) {
    ctx.globalAlpha = Math.min(0.5, depth * 0.55);
    ctx.drawImage(s.fog, -pw / 2, baseY - ph, pw, ph);
    ctx.globalAlpha = 1;
  }
  return true;
}

// ---------- rival name tags ----------
// The renderer queues tags while drawing cars; this lays them out once per frame: nearest
// first, only cars close to you, fading out with distance, nudged up when two would collide,
// and capped (3 on phones, 5 on bigger screens).
const placed = new Float32Array(4 * 8);
const order = new Int16Array(64);

export function drawTags(ctx, pool, n, rw, rh) {
  if (!n) return;
  n = Math.min(n, order.length);
  // insertion sort of indices, nearest (widest road) first; pool objects are the caller's
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j > 0 && pool[order[j - 1]].w < pool[i].w) { order[j] = order[j - 1]; j--; }
    order[j] = i;
  }
  const phone = Math.min(rw, rh) < 500;
  const max = phone ? 3 : 5;
  const minW = rw * 0.045, fullW = rw * 0.11;
  const fs = phone ? 9 : 11;
  ctx.font = `bold ${fs}px Orbitron, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let k = 0;
  for (let i = 0; i < n && k < max; i++) {
    const t = pool[order[i]];
    if (t.w < minW) break; // sorted: everything after is further away
    const a = Math.min(1, (t.w - minW) / (fullW - minW));
    const tw = ctx.measureText(t.text).width + 8, th = fs + 4;
    let y = t.y, ok = false;
    for (let step = 0; step < 4 && !ok; step++) {
      ok = true;
      for (let j = 0; j < k; j++) {
        const o = j * 4;
        if (Math.abs(placed[o] - t.x) < (placed[o + 2] + tw) / 2 && Math.abs(placed[o + 1] - y) < (placed[o + 3] + th) / 2) { ok = false; break; }
      }
      if (!ok) y -= th + 2;
    }
    if (!ok || y < th) continue;
    const o = k * 4; placed[o] = t.x; placed[o + 1] = y; placed[o + 2] = tw; placed[o + 3] = th; k++;
    ctx.globalAlpha = a;
    ctx.fillStyle = t.kind === 1 ? 'rgba(255,0,127,0.88)' : 'rgba(2,6,23,0.72)';
    ctx.fillRect(t.x - tw / 2, y - th / 2, tw, th);
    ctx.fillStyle = t.kind === 2 && t.color ? t.color : '#ffffff';
    ctx.fillText(t.text, t.x, y + 0.5);
    if (t.kind === 2 && t.color) { ctx.fillRect(t.x - tw / 2, y + th / 2 - 2, tw, 2); }
  }
  stats.tags = k;
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}
