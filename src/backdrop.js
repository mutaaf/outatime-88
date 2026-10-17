// The 2D world behind the road (ticket 0100). The real work — per-era scene chunks, cached
// parallax layers, live set pieces — lives in the lazy src/scenes/stage.js; the main bundle only
// carries this shim and a flat two-tone sky in the era's colours for the first few frames.
let stage = null;
let req = null;
let qualityFn = null;

/** Where the scenes read their tier from (the graphics governor, src/perf/). */
export function setBackdropQuality(fn) {
  qualityFn = fn;
  if (stage) stage.setQualitySource(fn);
}

function boot() {
  if (!req) req = import('./scenes/stage.js').then((m) => { stage = m; if (qualityFn) m.setQualitySource(qualityFn); }).catch(() => { req = null; });
  return req;
}

export function preloadBackdrops(first) {
  const p = boot();
  if (p) p.then(() => stage && stage.preload(first));
}

export function drawBackdrop(ctx, rw, rh, hz, era, s) {
  if (stage && stage.draw(ctx, rw, rh, hz, era, s)) return true;
  boot();
  ctx.fillStyle = era.skyTop || '#060919';
  ctx.fillRect(0, 0, rw, hz * 0.6);
  ctx.fillStyle = era.skyBot || '#1e2952';
  ctx.fillRect(0, hz * 0.6, rw, hz * 0.4);
  ctx.fillStyle = era.groundA || '#0c1322';
  ctx.fillRect(0, hz, rw, rh - hz);
  return false;
}

/** An era billboard face for roadside sign `n`; false until the scene is loaded. */
export function drawRoadsideAd(ctx, x, y, w, h, n) { return !!stage && stage.ad(ctx, x, y, w, h, n); }
export function drawWeather(ctx, rw, rh) { if (stage) stage.weather(ctx, rw, rh); }
export function resetBackdrop() { if (stage) stage.reset(); }
export function backdropDebug() { return stage ? stage.debug() : null; }

// Era roadside art, contact shadows and rival name tags (ticket 0101). Each returns false until
// the lazy stage is loaded, so the caller can draw its plain fallback.
export function drawRoadsideProp(ctx, type, x, roadY, w, h, roadW, rw, rh) { return !!stage && stage.prop(ctx, type, x, roadY, w, h, roadW, rw, rh); }
export function drawHazardArt(ctx, ow, baseY, roadW, rw, rh) { return !!stage && stage.hazard(ctx, ow, baseY, roadW, rw, rh); }
export function drawSoftShadow(ctx, x, y, w) { return !!stage && stage.shadow(ctx, x, y, w); }

const TAGS = Array.from({ length: 24 }, () => ({ x: 0, y: 0, w: 0, text: '', kind: 0, color: '' }));
let nTags = 0;
/** kind: 0 live CPU, 1 live friend, 2 rival (coloured by its underglow). */
export function queueTag(x, y, w, text, kind, color) {
  if (nTags >= TAGS.length) return;
  const t = TAGS[nTags++];
  t.x = x; t.y = y; t.w = w; t.text = text; t.kind = kind; t.color = color || '';
}
export function flushTags(ctx, rw, rh) {
  if (stage) stage.tags(ctx, TAGS, nTags, rw, rh);
  nTags = 0;
}
