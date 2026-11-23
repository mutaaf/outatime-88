// The one graphics-quality controller both renderers read (ticket 0041). It owns the probed
// capabilities, the resolved tier, the governor, and tells listeners when quality changes.
//
//   import { Gfx } from './perf/gfx.js';
//   Gfx.q          → the current effective preset (read every frame; never mutate)
//   Gfx.onChange(fn) → fn(q) after any tier/step change
//
// The 3D view receives Gfx.q through view.setQuality(); the 2D renderer reads Gfx.q.res,
// .particles, .layers and .glow directly (see AGENTS.md § Graphics tiers).
import { probe, resolveTier, presetFor, lowerTier, readGfxCache, writeGfxCache, GFX_PREFS } from './capabilities.js';
import { createGovernor, effectivePreset } from './governor.js';
import { createFrameGate, fpsCapMs } from '../frame-cap.js';

const listeners = [];
let gov = createGovernor();
let preset = presetFor('medium');
let capMs = 0; // FRAME RATE 30 (0302); kept across tier changes, which make a new governor

export const Gfx = {
  caps: null, pref: 'auto', tier: 'medium', source: 'probe', provisional: false,
  q: effectivePreset(preset, 0),
  /** main's loop asks skip(timestamp) once per display frame: true = draw nothing this frame (0302). */
  skip: createFrameGate(0),

  /** Settings → FRAME RATE: '30' caps drawing at ~30 fps; anything else is AUTO (draw every frame). */
  setFps(v) {
    capMs = fpsCapMs(v);
    Gfx.skip = createFrameGate(capMs);
    gov.capMs = capMs;
    gov.reset();
  },

  /** Probe once and resolve the tier for this visit. */
  init(pref = 'auto', win = globalThis) {
    Gfx.caps = probe(win);
    Gfx.setPref(pref, { cached: readGfxCache() });
    return Gfx;
  },

  setPref(pref, { cached = readGfxCache() } = {}) {
    Gfx.pref = GFX_PREFS.includes(pref) ? pref : 'auto';
    const r = resolveTier({ pref: Gfx.pref, cached, caps: Gfx.caps || {} });
    applyTier(r.tier, r.source, r.provisional);
  },

  /** One frame interval while racing. Steps quality and, on 'auto', learns the device's tier. */
  sample(ms) {
    const changed = gov.sample(ms);
    if (Gfx.pref === 'auto') {
      // Warm-up: the first few seconds of a provisional tier decide whether it sticks.
      if (Gfx.provisional && gov.elapsedMs > 4000) {
        if (gov.step >= 2) { applyTier(lowerTier(Gfx.tier), 'probe', true); }
        else { Gfx.provisional = false; if (!capMs) writeGfxCache(Gfx.tier, Gfx.caps || {}); } // a tier held at 30 fps is not this device's tier (0302)
        return true;
      }
      if (gov.shouldDemote && Gfx.tier !== 'low') {
        applyTier(lowerTier(Gfx.tier), 'cache', false);
        if (!capMs) writeGfxCache(Gfx.tier, Gfx.caps || {});
        return true;
      }
    }
    if (changed) publish();
    return changed;
  },

  /** Forget the current measuring window (pause, resume, resize). */
  hold() { gov.reset(); },

  get step() { return gov.step; },
  get fps() { return gov.fps; },
  get p95() { return gov.p95; },
  get budgetMs() { return gov.budgetMs; },
  get capMs() { return capMs; },
  onChange(fn) { listeners.push(fn); },
};

function applyTier(tier, source, provisional) {
  Gfx.tier = tier;
  Gfx.source = source;
  Gfx.provisional = provisional;
  preset = presetFor(tier);
  gov = createGovernor();
  gov.capMs = capMs;
  publish();
}

function publish() {
  Gfx.q = effectivePreset(preset, gov.step);
  for (let i = 0; i < listeners.length; i++) listeners[i](Gfx.q);
}
