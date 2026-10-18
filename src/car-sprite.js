// Race sprites for the roster cars: the same low-poly models the garage turntable shows
// (src/car-art.js), rendered once from the chase cam into small offscreen canvases and then
// blitted every frame. A van races as a van, a light-cycle as a light-cycle, in your livery.
//
// Lazy chunk: main.js imports it after the first frame and draws a plain placeholder until
// it lands. Cache keys are (car look, size bucket, yaw step, wheels/hover); the cache is a
// small LRU so a long session never grows it past CACHE_MAX canvases.
import { buildCarModel, drawModel, shapeOf } from './car-art.js';

export const YAW_STEPS = 15;       // body yaw from -YAW_MAX to +YAW_MAX, in equal steps
export const YAW_MAX = 0.7;        // radians (GameState.carYaw is clamped to this)
export const CACHE_MAX = 96;
const BUCKET = 24;                 // sprite widths round up to a multiple of this (px)
const MIN_W = 24, MAX_W = 480;
// Sprite layout: METRES_ACROSS wide at the rear bumper, which stands on GROUND_Y.
export const SPRITE_ASPECT = 0.8;  // height / width
export const GROUND_Y = 0.86;      // fraction of sprite height where the tyres touch the road
const METRES_ACROSS = 3.4;         // sprite width in metres at the rear bumper (room for a yawed nose)
const CAR_METRES = 1.9;            // a typical car's width: drawCarAt sizes sprites by it
const CHASE_DIST = 20;             // metres from the chase camera to the car's centre

const cache = new Map();
const models = new Map();
export const spriteStats = { built: 0, hits: 0 };

const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

/** Width bucket for a requested on-screen sprite width. */
export function bucketFor(w) {
  const c = Math.max(MIN_W, Math.min(MAX_W, w));
  return Math.ceil(c / BUCKET) * BUCKET;
}

/** Quantised yaw step (0..YAW_STEPS-1) for a body yaw in radians. */
export function yawStep(yaw) {
  const y = Math.max(-YAW_MAX, Math.min(YAW_MAX, yaw || 0));
  return Math.round(((y + YAW_MAX) / (2 * YAW_MAX)) * (YAW_STEPS - 1));
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
 * The cached chase-cam sprite for a car look { shape, body, cabin, glow }.
 * @param {number} w wanted on-screen width (px)
 * @param {object} [o] { yaw (radians, + = nose right), hover (no wheels), view: 'rear' | 'three-quarter' }
 * @returns a canvas (w = bucket, h = bucket * SPRITE_ASPECT)
 */
export function carSprite(look, w, o = {}) {
  const bw = bucketFor(w);
  const step = o.view === 'three-quarter' ? -1 : yawStep(o.yaw);
  const key = `${look.shape}|${look.body}|${look.cabin}|${look.glow || ''}|${bw}|${step}|${o.hover ? 1 : 0}`;
  let c = cache.get(key);
  if (c) {
    cache.delete(key); cache.set(key, c); // LRU touch
    spriteStats.hits++;
    return c;
  }
  const bh = Math.round(bw * SPRITE_ASPECT);
  c = makeCanvas(bw, bh);
  const ctx = c.getContext('2d');
  const model = modelFor(look);
  const px = bw / METRES_ACROSS; // px per metre
  if (step < 0) {
    // Three-quarter showroom view for cards, the car centred a little above the ground line.
    drawModel(ctx, model, { cx: bw / 2, cy: bh * (GROUND_Y - 0.1), scale: px * 0.72, yaw: -0.75, pitch: 0.32, camDist: 14, glow: look.glow, wheels: 'disc' });
  } else {
    // Chase cam: the body turns about its centre, and the rear bumper's road contact (the
    // nearest, lowest point) sits on GROUND_Y at the same size for every car, long or short.
    const yaw = Math.PI + (step / (YAW_STEPS - 1) * 2 - 1) * YAW_MAX;
    const pitch = 0.24, camDist = CHASE_DIST;
    const hz = model.s.L / 2, cyaw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const yr = hz * cyaw * sp, zr = -hz * cyaw * cp;          // rear centre in camera space
    const d = camDist / (camDist - zr);
    const scale = px / d;
    drawModel(ctx, model, {
      cx: bw / 2, cy: bh * GROUND_Y + yr * scale * d, scale, yaw, pitch, camDist, glow: look.glow,
      wheels: o.hover ? 'none' : 'tyre',
    });
  }
  cache.set(key, c);
  spriteStats.built++;
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return c;
}

/**
 * Draws a car standing on the road at (x, groundY), sized so a typical 1.9 m wide car spans
 * `carW` px (a van comes out wider, a light-cycle narrower). Returns the sprite height drawn.
 */
export function drawCarAt(ctx, look, x, groundY, carW, o) {
  const dw = carW * (METRES_ACROSS / CAR_METRES), dh = dw * SPRITE_ASPECT;
  const spr = carSprite(look, dw, o);
  ctx.drawImage(spr, x - dw / 2, groundY - dh * GROUND_Y, dw, dh);
  return dh;
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
  cache.clear(); models.clear(); portraits.clear();
  spriteStats.built = 0; spriteStats.hits = 0;
}

export const cacheSize = () => cache.size;
