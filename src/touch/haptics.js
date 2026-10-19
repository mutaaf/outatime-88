// Haptic feedback for the touch controls. Android/Chrome has the Vibration API; iOS Safari
// has none, but since iOS 18 toggling an `<input type="checkbox" switch>` through its
// `<label>` plays the system "tick" haptic, so iOS gets that instead. Either way: one short,
// distinct pulse per event, throttled so a wall scrape or a wobbling thumb never buzzes
// constantly, and nothing at all when the player turns haptics off.

/** Vibration patterns (ms on/off) at full strength. iOS plays one tick per "on" segment. */
export const HAPTIC_PATTERNS = Object.freeze({
  engage: [9],              // thumb lands on the stick
  tick: [6],                // D-pad direction change, special picker hover
  press: [10],              // an action button
  boost: [16, 30, 24],      // WARP / boost fired
  special: [22],            // special picker opened, special fired
  hit: [38, 24, 38],        // crash / penalty
  lap: [14, 50, 14, 50, 30], // new lap, final lap
  pickup: [7],              // a coin, core, wrench or NOS canister collected
  wall: [26, 18, 12],       // hitting a barrier (src/forcefeel.js, ticket 0183)
  land: [30],               // a hard landing
  slip: [5],                // the tyres letting go
});

/** Shortest gap between two pulses of the same kind (ms). */
export const HAPTIC_GAP = Object.freeze({ engage: 60, tick: 45, press: 40, boost: 140, special: 140, hit: 220, lap: 600, pickup: 55, wall: 320, land: 260, slip: 420 });

/** Game events (not under the player's thumb): skipped in calm mode, and at low strength. */
const AMBIENT = new Set(['hit', 'lap', 'wall', 'land']);

/** Which haptic engine this browser has: 'vibrate', 'ios' or 'none'. */
export function hapticEngine(win = globalThis.window, doc = globalThis.document) {
  const nav = win && win.navigator;
  if (nav && typeof nav.vibrate === 'function') return 'vibrate';
  if (!doc || typeof doc.createElement !== 'function') return 'none';
  const ua = (nav && nav.userAgent) || '';
  // iPadOS Safari reports itself as a Mac; touch points tell them apart.
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  if (!ios) return 'none';
  const probe = doc.createElement('input');
  probe.type = 'checkbox';
  probe.setAttribute('switch', '');
  return 'switch' in probe ? 'ios' : 'none';
}

/** Scale a pattern's "on" segments by strength (0.3–1); gaps stay. Min 3 ms so it's felt. */
export function scalePattern(pattern, strength) {
  const s = Math.max(0.3, Math.min(1, Number(strength) || 1));
  return pattern.map((ms, i) => (i % 2 ? ms : Math.max(3, Math.round(ms * s))));
}

/**
 * @param {object} o
 * @param {() => {haptics: boolean, hapticStrength: number}} o.settings controls settings getter
 * @param {() => boolean} [o.calm] reduced motion / calm mode is on
 * @param {() => number} [o.now]
 * @param {string} [o.engine] override (tests)
 */
export function createHaptics({ win = globalThis.window, doc = globalThis.document, settings, calm = () => false, now, engine } = {}) {
  const kind = engine || hapticEngine(win, doc);
  const clock = now || (() => (win && win.performance ? win.performance.now() : Date.now()));
  const last = {};
  let label = null;

  function iosTick() {
    if (!label) {
      label = doc.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      doc.body.appendChild(label);
    }
    label.click();
  }

  /** Plays the pulse for `type`; returns true if one was played (for tests). */
  function pulse(type) {
    if (kind === 'none') return false;
    const s = settings ? settings() : null;
    if (!s || !s.haptics) return false;
    const pattern = HAPTIC_PATTERNS[type];
    if (!pattern) return false;
    const strength = s.hapticStrength == null ? 1 : s.hapticStrength;
    if (AMBIENT.has(type) && (calm() || strength < 0.45)) return false;
    const t = clock();
    if (last[type] != null && t - last[type] < (HAPTIC_GAP[type] || 50)) return false;
    last[type] = t;
    try {
      if (kind === 'vibrate') win.navigator.vibrate(scalePattern(pattern, strength));
      else {
        // One tick per "on" segment; iOS can't vary strength, so weak settings play just one.
        const n = strength < 0.7 ? 1 : Math.ceil(pattern.length / 2);
        iosTick();
        for (let i = 1; i < n; i++) win.setTimeout(iosTick, i * 70);
      }
    } catch (e) {
      return false; // blocked (no user gesture yet) or unsupported
    }
    return true;
  }

  return { pulse, engine: kind };
}
