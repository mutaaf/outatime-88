// Which renderer draws the race: the 2D canvas road or the lazy-loaded three.js view.
// Pure decisions only (the DOM probes are injectable), so the rules are unit-tested.

export const RENDER_PREFS = ['auto', '2d', '3d'];

/** What 'auto' means on capable devices. */
export const AUTO_MODE = '2d';

/** True when this browser can create a WebGL context at all. */
export function hasWebGL(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  try {
    const c = doc.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Devices where the 3D view would cost the race its frame rate. */
export function isLowEnd(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  return (typeof mem === 'number' && mem <= 2) || (typeof cores === 'number' && cores <= 2);
}

/**
 * @param {object} o
 * @param {string} [o.saved]  the player's saved preference: 'auto' | '2d' | '3d'
 * @param {string|null} [o.query] `?view=` from the URL ('2d' | '3d'), wins for this visit
 * @param {boolean} o.webgl  WebGL available
 * @param {boolean} o.lowEnd low-end device
 * @returns {'2d'|'3d'}
 */
export function resolveRenderMode({ saved = 'auto', query = null, webgl, lowEnd }) {
  if (!webgl) return '2d';
  if (query === '2d' || query === '3d') return query;
  if (saved === '2d' || saved === '3d') return saved;
  // 'auto' is 2D until the 3D view has real-device perf data. If auto ever flips to 3D,
  // low-end devices must still resolve to 2D (the test pins this).
  return lowEnd ? '2d' : AUTO_MODE;
}

/** The preference to save when the player flips the toggle from `current`. */
export function toggledPref(current) {
  return current === '3d' ? '2d' : '3d';
}
