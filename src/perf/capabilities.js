// Device capability → graphics quality tier (ticket 0041). Small and pure where it can be:
// probe() reads the browser once, tierFor() maps the facts to a tier, and presetFor() says
// what each renderer may spend at that tier. Only the renderers read presets; the simulation
// is identical on every tier (live races, ghosts and server score checks depend on that).

export const TIERS = ['low', 'medium', 'high', 'ultra'];
export const GFX_PREFS = ['auto', ...TIERS];
export const GFX_CACHE_KEY = 'ot_gfx_v1';

// What each tier may spend. 2D: `res` caps the road canvas resolution, `particles` scales
// effect caps, `layers` is how many parallax layers the backdrop draws, `glow` allows the
// additive glow passes. 3D: DPR cap, shadow-map size (0 = off), post (bloom/AA/vignette),
// environment lighting, draw distance in road segments, how many other cars are drawn
// (rivals first) and a draw-call ceiling the e2e suite enforces.
export const PRESETS = Object.freeze({
  low: Object.freeze({ tier: 'low', res: 0.75, particles: 0.4, layers: 2, glow: false, dpr: 1, shadows: 0, softShadows: false, post: false, env: false, ahead: 120, props: 0.5, cars: 8, maxDraws: 125, reflections: false }),
  medium: Object.freeze({ tier: 'medium', res: 1, particles: 0.7, layers: 3, glow: true, dpr: 1.25, shadows: 1024, softShadows: false, post: false, env: true, ahead: 160, props: 0.8, cars: 12, maxDraws: 150, reflections: false }),
  high: Object.freeze({ tier: 'high', res: 1, particles: 1, layers: 4, glow: true, dpr: 1.5, shadows: 2048, softShadows: true, post: true, env: true, ahead: 190, props: 1, cars: 14, maxDraws: 190, reflections: false }),
  ultra: Object.freeze({ tier: 'ultra', res: 1, particles: 1.3, layers: 5, glow: true, dpr: 2, shadows: 2048, softShadows: true, post: true, env: true, ahead: 240, props: 1, cars: 16, maxDraws: 230, reflections: true }),
});

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
const STRONG_GPU = /apple m\d|apple gpu|rtx|geforce|radeon (rx|pro)|arc\(tm\)|arc a\d|adreno \(tm\) (7[3-9]\d|8\d\d)|mali-g7\d\d|immortalis/i;
const WEAK_GPU = /intel\(r\) (hd|uhd) graphics [2-6]\d\d|mali-[gt][0-6]\d\b|adreno \(tm\) [1-5]\d\d|powervr/i;

/** Reads the browser's capabilities once. Every probe is optional and guarded. */
export function probe(win = globalThis) {
  const nav = win.navigator || {};
  const caps = {
    webgpu: Boolean(nav.gpu), webgl2: false, webgl: false, renderer: '', maxTexture: 0,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 0,
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0,
    dpr: win.devicePixelRatio || 1,
    screen: Math.max((win.screen && win.screen.width) || 0, (win.screen && win.screen.height) || 0),
    touch: (nav.maxTouchPoints || 0) > 0,
    saveData: Boolean(nav.connection && nav.connection.saveData),
    reducedMotion: false,
  };
  try { caps.reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no matchMedia */ }
  try {
    const c = win.document.createElement('canvas');
    let gl = c.getContext('webgl2');
    caps.webgl2 = Boolean(gl);
    if (!gl) gl = c.getContext('webgl');
    caps.webgl = Boolean(gl);
    if (gl) {
      caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      caps.renderer = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext(); // give the probe context back right away
    }
  } catch { /* sandboxed or blocked */ }
  return caps;
}

/** A short fingerprint of the facts the tier depends on, so a new GPU/browser re-probes. */
export const capsSignature = (c) => [c.renderer, c.cores, c.memory, c.webgl2 ? 2 : c.webgl ? 1 : 0, c.touch ? 't' : 'd'].join('|');

/** Maps capabilities to a tier. Unknowns (Safari hides memory and cores) count as average. */
export function tierFor(c) {
  if (!c.webgl || SOFTWARE_GPU.test(c.renderer)) return 'low';
  if ((c.memory && c.memory <= 2) || (c.cores && c.cores <= 2)) return 'low';
  let t;
  if (c.touch) {
    // Phones and tablets: medium by default; tablets with a big-texture Apple/flagship GPU
    // earn high, known-weak mobile GPUs start low (the governor can still climb back).
    const strong = c.maxTexture >= 16384 && (STRONG_GPU.test(c.renderer) || c.cores >= 8);
    if (WEAK_GPU.test(c.renderer)) t = 'low';
    else t = strong && c.screen >= 1024 ? 'high' : 'medium';
  } else if (WEAK_GPU.test(c.renderer) || (c.memory && c.memory <= 4)) {
    t = 'medium';
  } else {
    t = STRONG_GPU.test(c.renderer) && (c.cores === 0 || c.cores >= 8) && c.webgl2 ? 'ultra' : 'high';
  }
  if (!c.webgl2 && TIERS.indexOf(t) > 1) t = 'medium';
  if (c.saveData && TIERS.indexOf(t) > 1) t = 'medium';
  return t;
}

export const lowerTier = (t) => TIERS[Math.max(0, TIERS.indexOf(t) - 1)];
export const presetFor = (t) => PRESETS[t] || PRESETS.medium;

/**
 * The tier to use this visit. A player's explicit choice always wins; on 'auto' a cached
 * tier for the same device signature is reused (it may have been lowered by a slow race),
 * otherwise the probe's tier is used and marked provisional until a race confirms it.
 * @returns {{ tier: string, source: 'player'|'cache'|'probe', provisional: boolean }}
 */
export function resolveTier({ pref = 'auto', cached = null, caps }) {
  if (TIERS.includes(pref)) return { tier: pref, source: 'player', provisional: false };
  const sig = capsSignature(caps);
  if (cached && cached.sig === sig && TIERS.includes(cached.tier)) return { tier: cached.tier, source: 'cache', provisional: false };
  return { tier: tierFor(caps), source: 'probe', provisional: true };
}

export function readGfxCache(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(GFX_CACHE_KEY) || 'null'); } catch { return null; }
}

export function writeGfxCache(tier, caps, storage = globalThis.localStorage) {
  try { storage.setItem(GFX_CACHE_KEY, JSON.stringify({ tier, sig: capsSignature(caps), at: Date.now() })); } catch { /* private mode */ }
}
