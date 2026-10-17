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

const listeners = [];
let gov = createGovernor();
let preset = presetFor('medium');

export const Gfx = {
  caps: null, pref: 'auto', tier: 'medium', source: 'probe', provisional: false,
  q: effectivePreset(preset, 0),

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
        else { Gfx.provisional = false; writeGfxCache(Gfx.tier, Gfx.caps || {}); }
        return true;
      }
      if (gov.shouldDemote && Gfx.tier !== 'low') {
        applyTier(lowerTier(Gfx.tier), 'cache', false);
        writeGfxCache(Gfx.tier, Gfx.caps || {});
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
  onChange(fn) { listeners.push(fn); },
};

function applyTier(tier, source, provisional) {
  Gfx.tier = tier;
  Gfx.source = source;
  Gfx.provisional = provisional;
  preset = presetFor(tier);
  gov = createGovernor();
  publish();
}

function publish() {
  Gfx.q = effectivePreset(preset, gov.step);
  for (let i = 0; i < listeners.length; i++) listeners[i](Gfx.q);
}
