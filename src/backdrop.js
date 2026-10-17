// The 2D world behind the road (ticket 0100). The real work — per-era scene chunks, cached
// parallax layers, live set pieces — lives in the lazy src/scenes/stage.js; the main bundle only
// carries this shim and a flat two-tone sky in the era's colours for the first few frames.
let stage = null;
let req = null;

function boot() {
  if (!req) req = import('./scenes/stage.js').then((m) => { stage = m; }).catch(() => { req = null; });
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
