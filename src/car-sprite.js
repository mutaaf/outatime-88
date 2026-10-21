// Race sprites for every car on the road: roster cars, rivals, friends, ghosts and highway
// traffic, painted by src/car-paint.js (smooth shaded bodywork, glass, glowing lights, real
// tyres) from the chase cam, once, into small offscreen canvases that are then blitted every
// frame. A van races as a van, a light-cycle as a light-cycle, a semi as a semi.
//
// Lazy chunk: main.js imports it after the first frame and draws a plain placeholder until
// it lands. Cache keys are (car look, size bucket, yaw step, wheels/hover, brake lights); the
// cache is a small LRU so a long session never grows it past CACHE_MAX canvases.
//
// Each sprite also remembers where its exhaust tips are, so drawThrust() puts flames, NOS and
// plumes exactly on that car's pipes (or its jet nozzle, or an electric car's cold-gas puffs).
import { buildCarModel, drawModel } from './car-art.js';
import { shapeOf, topOf } from './car-shapes.js';
import { projectLast } from './car-paint.js';
import { nearFade, nearAlpha, nearScale } from './near-fade.js';

export const YAW_STEPS = 15;       // body yaw from -YAW_MAX to +YAW_MAX, in equal steps
export const YAW_MAX = 0.7;        // radians (GameState.carYaw is clamped to this)
export const CACHE_MAX = 160;
// Sprite widths round up to one of these (px): fine steps when small, coarser when big, so a
// car closing in from the horizon only needs a handful of renders.
const BUCKETS = [24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 240, 288, 352, 416, 480];
// At most this many new sprites are painted per frame (main.js calls beginFrame()); past it,
// the nearest sprite already in the cache stands in for a frame or two (no hitches).
const BUILDS_PER_FRAME = 1;
// Sprite layout for a typical car: 3.4 m wide at the rear bumper, which stands 0.38 m above
// the sprite's bottom edge. Long or tall bodies (a semi) get a wider, taller frame.
export const SPRITE_ASPECT = 0.8;  // height / width for a typical car
export const GROUND_Y = 0.86;      // fraction of a typical sprite's height where the tyres touch
const BASE_ACROSS = 3.4;
const BELOW = 0.38;                // metres of sprite under the ground line (shadow, perspective)
const CAR_METRES = 1.9;            // a typical car's width: drawCarAt sizes sprites by it
const CHASE_DIST = 20;             // metres from the chase camera to the car's centre
const MAX_TIPS = 4;

const cache = new Map();
const models = new Map();
const frames = new Map();
export const spriteStats = { built: 0, hits: 0 };
const tips = { n: 0, x: new Float32Array(MAX_TIPS), y: new Float32Array(MAX_TIPS), r: new Float32Array(MAX_TIPS) };
const pt = { x: 0, y: 0 };

const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

/** Width bucket for a requested on-screen sprite width. */
export function bucketFor(w) {
  for (let i = 0; i < BUCKETS.length; i++) if (w <= BUCKETS[i]) return BUCKETS[i];
  return BUCKETS[BUCKETS.length - 1];
}

let builds = 0, budget = Infinity;
/** Starts a frame's build budget (until first called, every sprite is painted on demand). */
export function beginFrame() { builds = 0; budget = BUILDS_PER_FRAME; }
// Stand-ins: the last sprite used per look and yaw step, and per look (cached sprites only).
const byStep = new Map(), byLook = new Map();

/** Quantised yaw step (0..YAW_STEPS-1) for a body yaw in radians. */
export function yawStep(yaw) {
  const y = Math.max(-YAW_MAX, Math.min(YAW_MAX, yaw || 0));
  return Math.round(((y + YAW_MAX) / (2 * YAW_MAX)) * (YAW_STEPS - 1));
}

/** Frame of a body's sprite: metres across and tall. */
export function frameOf(shape) {
  let f = frames.get(shape);
  if (!f) {
    const S = shapeOf(shape);
    const across = Math.max(BASE_ACROSS, S.W * 1.05 + S.L * 0.3);
    f = { across, tall: Math.max(across * SPRITE_ASPECT, topOf(S) + 0.62 + BELOW), roof: topOf(S) + 0.62 };
    frames.set(shape, f);
  }
  return f;
}

function modelFor(look) {
  const key = `${look.shape}|${look.body}|${look.cabin}`;
  let m = models.get(key);
  if (!m) {
    m = buildCarModel(look.shape, look.body || '#94a3b8', look.cabin || '#e2e8f0');
    models.set(key, m);
  }
  return m;
}

/**
 * The cached sprite for a car look { shape, body, cabin, glow }.
 * @param {number} w wanted width (device px)
 * @param {object} [o] { yaw (radians, + = nose right), hover (no wheels), brake (lit brake
 *   lights), view: 'rear' | 'three-quarter' }
 * @returns a canvas with `gy` (ground line, px) and its exhaust tips (`tipN`, `tipX/Y/R`)
 */
export function carSprite(look, w, o = {}) {
  const bw = bucketFor(w);
  const step = o.view === 'three-quarter' ? -1 : yawStep(o.yaw);
  const key = `${look.shape}|${look.body}|${look.cabin}|${look.glow || ''}|${bw}|${step}|${o.hover ? 1 : 0}${o.brake ? 'b' : ''}`;
  const lk = `${look.shape}|${look.body}|${look.cabin}|${look.glow || ''}|${o.hover ? 1 : 0}${o.brake ? 'b' : ''}`;
  let c = cache.get(key);
  if (c) {
    cache.delete(key); cache.set(key, c); // LRU touch
    spriteStats.hits++;
    return c;
  }
  if (step >= 0) {
    // The largest sprite already painted for this car and view is drawn down to size (crisp)
    // or up by a little; only a car that has grown well past it gets a fresh paint, and then
    // only within the frame's budget.
    const same = byStep.get(`${lk}|${step}`);
    if (same && (same.width >= bw * 0.7 || builds >= budget)) { spriteStats.standIns = (spriteStats.standIns || 0) + 1; return same; }
    if (builds >= budget) {
      const alt = byLook.get(lk);
      if (alt) { spriteStats.standIns = (spriteStats.standIns || 0) + 1; return alt; }
    }
  }
  builds++;
  const fr = frameOf(look.shape);
  const bh = Math.round(bw * fr.tall / fr.across);
  const gy = bh - (BELOW * bw) / fr.across;
  c = makeCanvas(bw, bh);
  const ctx = c.getContext('2d');
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  const model = modelFor(look);
  const px = bw / fr.across; // px per metre
  if (step < 0) {
    // Three-quarter showroom view for cards, the car centred a little above the ground line.
    drawModel(ctx, model, { cx: bw / 2, cy: gy - bh * 0.1, scale: px * 0.72, yaw: -0.75, pitch: 0.32, camDist: 14, glow: look.glow, wheels: 'disc' });
    c.tipN = 0;
  } else {
    // Chase cam: the body turns about its centre, and the rear bumper's road contact (the
    // nearest, lowest point) sits on the ground line at the same size for every car.
    // (Model yaw π faces the camera with its tail; π − ψ puts the nose ψ to the right.)
    const yaw = Math.PI - (step / (YAW_STEPS - 1) * 2 - 1) * YAW_MAX;
    const pitch = 0.24, camDist = CHASE_DIST;
    const hz = model.s.L / 2, cyaw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const yr = hz * cyaw * sp, zr = -hz * cyaw * cp;          // rear centre in camera space
    const d = camDist / (camDist - zr);
    const scale = px / d;
    drawModel(ctx, model, {
      cx: bw / 2, cy: gy + yr * scale * d, scale, yaw, pitch, camDist, glow: look.glow,
      wheels: o.hover ? 'none' : 'tyre', brake: o.brake, anchors: tips,
    });
    c.tipN = tips.n;
    c.tipX = Float32Array.from(tips.x.subarray(0, tips.n));
    c.tipY = Float32Array.from(tips.y.subarray(0, tips.n));
    c.tipR = Float32Array.from(tips.r.subarray(0, tips.n));
    // Hover pads: where the wheels would touch, for the hover thrusters.
    const S = model.s, hx = S.W / 2 - 0.2, az = S.L / 2 - 0.85;
    const pads = S.cycle ? [[0, az], [0, -az]] : [[-hx, -az], [hx, -az], [-hx, az], [hx, az]];
    c.padN = pads.length;
    c.padX = new Float32Array(pads.length); c.padY = new Float32Array(pads.length);
    pads.forEach(([x, z], i) => { projectLast(x, 0.16, z, pt); c.padX[i] = pt.x; c.padY[i] = pt.y; });
    // How wide the body really is in this view (its box's corners, projected): a semi seen
    // side-on fills far more of its frame than a car seen from behind (ticket 0200).
    let lo = bw, hi = 0;
    for (let i = 0; i < 8; i++) {
      projectLast(i & 1 ? S.W / 2 : -S.W / 2, i & 2 ? topOf(S) : 0, i & 4 ? S.L / 2 : -S.L / 2, pt);
      if (pt.x < lo) lo = pt.x;
      if (pt.x > hi) hi = pt.x;
    }
    c.body = Math.max(0, Math.min(bw, hi) - Math.max(0, lo)) / bw;
  }
  c.gy = gy;
  c.thrust = shapeOf(look.shape).thrust;
  cache.set(key, c);
  spriteStats.built++;
  if (step >= 0) {
    const sk = `${lk}|${step}`, prev = byStep.get(sk);
    if (!prev || prev.width < c.width) byStep.set(sk, c);
    const pl = byLook.get(lk);
    if (!pl || pl.width <= c.width) byLook.set(lk, c);
  }
  if (cache.size > CACHE_MAX) {
    const oldKey = cache.keys().next().value, old = cache.get(oldKey);
    cache.delete(oldKey);
    for (const m of [byStep, byLook]) for (const [k, v] of m) if (v === old) m.delete(k);
  }
  return c;
}

// Device pixels per drawing unit on the canvas the race draws into (the 2D renderer's backing
// scale), so a sprite is cached at the size it really lands on screen and stays crisp.
let pxScale = 1;
export function setSpriteScale(k) { pxScale = k > 0 ? k : 1; }

/** Reusable thrust anchors for drawCarAt → drawThrust (one per caller, no allocation). */
export function createThrust() {
  return { n: 0, x: new Float32Array(MAX_TIPS), y: new Float32Array(MAX_TIPS), r: new Float32Array(MAX_TIPS), kind: 'exhaust', pn: 0, px: new Float32Array(4), py: new Float32Array(4), w: 0, top: 0, alpha: 1 };
}

/**
 * Draws a car standing on the road at (x, groundY), sized so a typical 1.9 m wide car spans
 * `carW` px (a van comes out wider, a light-cycle narrower). Fills `out` (createThrust())
 * with this car's exhaust tips and hover pads in the same coordinates, and `top`, the highest the
 * body (roof, wing, fin) can reach on screen. Returns the height drawn.
 */
export function drawCarAt(ctx, look, x, groundY, carW, o, out) {
  return place(ctx, look, x, groundY, carW, o, out, false);
}

/** The look a rival, friend, ghost or traffic car is painted with, made once (kept on mv.look). */
export function lookOf(mv) {
  return mv.look || (mv.look = mv.style === 'SEMI_TRUCK'
    ? { shape: 'SEMI_TRUCK', body: '#cbd5e1', cabin: '#94a3b8', glow: '' }
    : { shape: mv.shape || mv.style || 'SEDAN', body: mv.bodyColor || '#334155', cabin: mv.accentColor || '#64748b', glow: mv.underglow || '' });
}

/**
 * drawCarAt for everyone else on the road (rivals, friends, ghosts, traffic): a car passing
 * beside the camera is eased down to a quarter of the view's width and faded to 35%
 * (src/near-fade.js, ticket 0200). Render-only; the simulation never sees it.
 */
export function drawNear(ctx, look, x, groundY, carW, o, out) {
  return place(ctx, look, x, groundY, carW, o, out, true);
}

function place(ctx, look, x, groundY, carW, o, out, near) {
  const fr = frameOf(look.shape);
  let dw = carW * (fr.across / CAR_METRES);
  const spr = carSprite(look, dw * pxScale, o);
  let a = 1;
  if (near) {
    // The road buffer is the view's width × pxScale, so this is the view width in drawing units.
    const vw = ctx.canvas.width / pxScale;
    const t = vw > 0 ? nearFade(carW / vw) : 0;
    if (t > 0) {
      dw *= nearScale(dw * (spr.body || 1) / vw, t);
      a = nearAlpha(t);
    }
  }
  const k = dw / spr.width;
  const dh = spr.height * k;
  const left = x - dw / 2, top = groundY - spr.gy * k;
  if (a < 1) {
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * a;
    ctx.drawImage(spr, left, top, dw, dh);
    ctx.globalAlpha = a0;
  } else ctx.drawImage(spr, left, top, dw, dh);
  if (out) {
    out.n = spr.tipN || 0;
    for (let i = 0; i < out.n; i++) { out.x[i] = left + spr.tipX[i] * k; out.y[i] = top + spr.tipY[i] * k; out.r[i] = spr.tipR[i] * k; }
    out.kind = spr.thrust || 'exhaust';
    out.pn = spr.padN || 0;
    for (let i = 0; i < out.pn; i++) { out.px[i] = left + spr.padX[i] * k; out.py[i] = top + spr.padY[i] * k; }
    out.w = dw;
    out.alpha = a; // drawThrust fades the flames with the car (ticket 0200)
    out.top = groundY - fr.roof * (dw / fr.across);
  }
  return dh;
}

const NOS_STOPS = ['rgba(255,255,255,0.95)', 'rgba(96,165,250,0.9)', 'rgba(168,85,247,0.55)'];
const COLD_STOPS = ['rgba(255,255,255,0.95)', 'rgba(224,242,254,0.75)', 'rgba(186,230,253,0.25)'];
const JET_STOPS = ['rgba(255,255,255,0.95)', 'rgba(255,179,92,0.9)', 'rgba(255,77,0,0.5)'];

// Gradients are built once in a unit space and placed by the transform at fill time (ticket
// 0005): a path is fixed when it is traced and fill() maps only the fill style, so the pixels
// match a gradient built at (x, y) with that size, and a frame of flames allocates nothing.
const flameGrads = new Map(); // stops → linear (0,0)→(0,1)
const bloomGrads = new Map(); // colour → radial, radius 0→1
let hoverGrad = null;

function fillPlaced(ctx, g, x, y, sx, sy) {
  if (!(sx > 0 && sy > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function flame(ctx, x, y, wd, len, stops) {
  let g = flameGrads.get(stops);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.25, stops[1]);
    g.addColorStop(0.7, stops[2]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    flameGrads.set(stops, g);
  }
  ctx.beginPath();
  ctx.moveTo(x - wd, y);
  ctx.quadraticCurveTo(x - wd * 0.7, y + len * 0.55, x, y + len);
  ctx.quadraticCurveTo(x + wd * 0.7, y + len * 0.55, x + wd, y);
  ctx.arc(x, y, wd, 0, Math.PI, true);
  ctx.closePath();
  fillPlaced(ctx, g, x, y, 1, len);
}

function bloomGrad(ctx, color) {
  let g = bloomGrads.get(color);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    bloomGrads.set(color, g);
  }
  return g;
}

const plumeStops = new Map();
function stopsFor(color) {
  let s = plumeStops.get(color);
  if (!s) {
    const m = /^#([0-9a-f]{6})$/i.exec(color || '');
    const n = m ? parseInt(m[1], 16) : 0x00f0ff;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    s = ['rgba(255,255,255,0.92)', `rgba(${r},${g},${b},0.9)`, `rgba(${r},${g},${b},0.45)`];
    plumeStops.set(color, s);
  }
  return s;
}

/**
 * Flames, NOS, plumes and hover thrusters from a car's own anchors (drawCarAt's `out`).
 * `s`: { nos (0..1), plume (0..1: speed / warp / drift slingshot), color (plume colour),
 *   t (seconds), calm (no flicker), hover }.
 */
export function drawThrust(ctx, a, s) {
  if (!a) return;
  const t = s.t || 0;
  ctx.save();
  const fade = a.alpha < 1 ? a.alpha : 1; // a car fading past the camera fades its flames too (0200)
  if (fade < 1) ctx.globalAlpha *= fade;
  ctx.globalCompositeOperation = 'lighter';
  if (s.hover) {
    for (let i = 0; i < a.pn; i++) {
      const r = Math.max(2, a.w * 0.07);
      if (!hoverGrad) {
        hoverGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        hoverGrad.addColorStop(0, 'rgba(255,255,255,0.9)'); hoverGrad.addColorStop(0.3, 'rgba(0,240,255,0.75)'); hoverGrad.addColorStop(1, 'rgba(0,240,255,0)');
      }
      ctx.beginPath(); ctx.ellipse(a.px[i], a.py[i], r * 2.2, r * 0.9, 0, 0, Math.PI * 2);
      fillPlaced(ctx, hoverGrad, a.px[i], a.py[i], r * 2.2, r * 2.2);
    }
  }
  const nos = Math.max(0, Math.min(1, s.nos || 0)), plume = Math.max(0, Math.min(1, s.plume || 0));
  const power = Math.max(nos, plume);
  if (power > 0 && a.kind !== 'none') {
    for (let i = 0; i < a.n; i++) {
      const x = a.x[i], y = a.y[i], r = Math.max(1, a.r[i]);
      const fl = s.calm ? 1 : 0.82 + 0.18 * Math.sin(t * 47 + i * 1.9);
      if (a.kind === 'cold') {
        // Electric: no fire. Short, crisp cold-gas puffs on NOS; a faint glow otherwise.
        if (nos > 0) flame(ctx, x, y, r * 1.5, r * (5 + 7 * nos) * fl, COLD_STOPS);
        else { ctx.fillStyle = 'rgba(125,249,255,0.25)'; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      const stops = nos > 0 ? NOS_STOPS : a.kind === 'jet' ? JET_STOPS : stopsFor(s.color);
      const big = a.kind === 'jet' ? 1.35 : 1;
      // A soft bloom round the tip, then the flame itself.
      ctx.globalAlpha = 0.6 * power * fade;
      ctx.beginPath(); ctx.arc(x, y, r * 3 * big, 0, Math.PI * 2);
      fillPlaced(ctx, bloomGrad(ctx, stops[1]), x, y, r * 3 * big, r * 3 * big);
      ctx.globalAlpha = fade;
      flame(ctx, x, y, r * 1.05 * big, r * (3.5 + 9 * power) * fl * big, stops);
    }
  }
  ctx.restore();
}

/** A data URL portrait (three-quarter view) for DOM cards: lineup, podium, share. */
const portraits = new Map();
export function carPortrait(look, w = 120) {
  const key = `${look.shape}|${look.body}|${look.cabin}|${w}`;
  if (portraits.has(key)) return portraits.get(key);
  const src = carSprite(look, w, { view: 'three-quarter' });
  let url = '';
  try {
    if (typeof src.toDataURL === 'function') url = src.toDataURL();
    else {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      url = c.toDataURL();
    }
  } catch (e) { url = ''; }
  portraits.set(key, url);
  return url;
}

/** A shape's width relative to a typical 1.9 m car (a van ~1.05, a light-cycle ~0.33). */
export const widthOf = (shape) => shapeOf(shape).W / CAR_METRES;

/** Test helper: empties the caches. */
export function clearSpriteCache() {
  cache.clear(); models.clear(); portraits.clear(); byStep.clear(); byLook.clear();
  spriteStats.built = 0; spriteStats.hits = 0; spriteStats.standIns = 0;
  builds = 0; budget = Infinity;
}

export const cacheSize = () => cache.size;
