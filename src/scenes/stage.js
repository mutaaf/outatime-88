// The backdrop stage (ticket 0100): loads each era's scene chunk, builds its parallax layers
// ONCE per era × canvas size into offscreen canvases, then every frame only blits those layers
// (two drawImage calls each, for the wrap) and lets the scene draw a handful of animated
// details. Nothing is allocated per frame. src/backdrop.js (main bundle) is a thin shim.

const LOADERS = {
  2026: () => import('./s2026.js'),
  1985: () => import('./s1985.js'),
  1885: () => import('./s1885.js'),
  2015: () => import('./s2015.js'),
  2088: () => import('./s2088.js'),
  1955: () => import('./s1955.js'),
};
export const SCENE_IDS = Object.keys(LOADERS);

const scenes = {};
const pending = {};
let built = null;
let lastPos = null;
let scrollRaw = 0;

// Per-frame facts handed to the scene. One object, mutated in place.
const F = {
  era: '', t: 0, raceTime: 0, speed: 0, lap: 1, laps: 0, warp: -1, reduced: false,
  rw: 0, rh: 0, hz: 0, k: 1, offs: [0, 0, 0, 0], W: 0, mem: null,
  /** Screen x of layer `i`'s layer-space x. */
  x(i, lx) {
    const W = this.W;
    let s = (lx / this.k - this.offs[i]) % W;
    if (s < -W * 0.2) s += W;
    if (s > this.rw + W * 0.2) s -= W;
    return s;
  },
  /** Screen y of a layer-space y (layers share the horizon). */
  y(ly) { return this.hz - (built.hzL - ly) / this.k; },
};

function load(id) {
  if (scenes[id] || pending[id] || !LOADERS[id]) return;
  pending[id] = LOADERS[id]()
    .then((m) => { scenes[id] = m.default; })
    .catch(() => { pending[id] = null; }); // offline + never cached: retry next frame, keep the fallback
}

/** Warm every era (they're small); warps can land on any of them mid-race. */
export function preload(first) {
  load(first);
  const rest = () => SCENE_IDS.forEach(load);
  if (typeof requestIdleCallback === 'function') requestIdleCallback(rest, { timeout: 3000 });
  else setTimeout(rest, 400);
}

function build(scene, id, rw, rh) {
  const hz0 = Math.round(rh * 0.46);
  // Layers are painted at most ~1100 px wide per screen width: big tablets get a softer (and
  // far lighter) backdrop, which reads as atmosphere anyway.
  const k = Math.min(1, 1100 / Math.max(rw, rh * 0.9));
  // The tile is at least 1.5 screens wide (parallax room) and wide enough for a scene's set
  // pieces at this horizon height, so tall portrait screens scroll through the town instead
  // of squashing it.
  const out = scene.build({ rw, rh, hz0, k, W: Math.ceil(Math.max(rw * 1.5, hz0 * 2.9) * k), pad: Math.round(rh * 0.3) });
  out.id = id; out.rw = rw; out.rh = rh; out.k = k; out.hz0 = hz0;
  out.mem = scene.memory ? scene.memory() : {};
  out.ads = (scene.ads || []).map(adSprite);
  return out;
}

/**
 * Draw the sky, parallax layers and animated set pieces.
 * s: { curve, trackPos, playerX, t, raceTime, speed, lap, laps, warp, reduced }
 */
// Roadside billboard faces: two lines of copy on the era's colours, painted once.
function adSprite([top, bottom, bg, fg]) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 56;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 160, 56);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.fillText(top, 80, 20, 150);
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillText(bottom, 80, 42, 150);
  return c;
}

/** Paint billboard `n`'s face for the current era into the given rect; false if none yet. */
export function ad(ctx, x, y, w, h, n) {
  if (!built || !built.ads.length || built.id !== F.era) return false;
  ctx.drawImage(built.ads[n % built.ads.length], x, y, w, h);
  return true;
}

let costMs = 0; // smoothed cost of one backdrop frame, for the perf test (?debug)

export function draw(ctx, rw, rh, hz, era, s) {
  const t0 = performance.now();
  const id = era.id;
  const scene = scenes[id];
  if (!scene) { load(id); return false; }
  if (!built || built.id !== id || built.rw !== rw || built.rh !== rh) built = build(scene, id, rw, rh);

  // Scroll with the road's curvature (classic pseudo-3D parallax) plus a little steer drift.
  if (lastPos !== null) {
    const d = s.trackPos - lastPos;
    if (d > 0 && d < 5000) scrollRaw += s.curve * d * 0.0016;
  }
  lastPos = s.trackPos;

  const W = built.layers.length ? built.layers[0].c.width / built.k : rw;
  F.era = id; F.t = s.t; F.raceTime = s.raceTime; F.speed = s.speed; F.lap = s.lap; F.laps = s.laps;
  F.warp = s.warp; F.reduced = s.reduced; F.rw = rw; F.rh = rh; F.hz = hz; F.k = built.k; F.W = W; F.mem = built.mem;

  // Sky + ground plate (static; slides with the horizon when the road pitches).
  const sky = built.sky;
  ctx.drawImage(sky, 0, 0, sky.width, sky.height, 0, hz - (built.pad + built.hz0), rw, sky.height / built.k);

  if (scene.behind) scene.behind(ctx, F, built);

  const hzL = built.hzL;
  for (let i = 0; i < built.layers.length; i++) {
    const L = built.layers[i];
    // `focus` (layer px on the mid layer) starts the scene centred on its landmark.
    const base = built.focus != null ? (built.focus / built.k - rw / 2) * (L.f / built.layers[1].f) : 0;
    let off = (base + scrollRaw * L.f * rw + s.playerX * rw * L.f * 0.18) % W;
    if (off < 0) off += W;
    F.offs[i] = off;
    const h = L.c.height / built.k;
    const y = hz - hzL / built.k;
    ctx.drawImage(L.c, -off, y, W, h);
    if (W - off < rw) ctx.drawImage(L.c, W - off, y, W, h);
  }
  if (scene.anim) scene.anim(ctx, F, built);
  costMs += (performance.now() - t0 - costMs) * 0.05;
  return true;
}

/** Weather in front of the road (rain, dust, fog), after the cars are drawn. */
export function weather(ctx, rw, rh) {
  if (!built) return;
  const scene = scenes[built.id];
  if (scene && scene.front && F.era === built.id) scene.front(ctx, F, built);
}

/** The current scene's egg flags (for tests via ?debug). */
export function debug() {
  return built ? { id: built.id, eggs: built.flags || null, k: built.k, ms: costMs, loaded: Object.keys(scenes) } : null;
}

/** A new race: easter eggs can fire again and the parallax restarts. */
export function reset() {
  lastPos = null;
  scrollRaw = 0;
  if (built && scenes[built.id] && scenes[built.id].memory) built.mem = scenes[built.id].memory();
}
