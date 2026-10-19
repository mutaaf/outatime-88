// Force feel (ticket 0183): what the tyres and the chassis are doing, in your hands.
//
// A lazy chunk, loaded when a gamepad connects or the touch kit loads. Once per frame it reads
// the sim's published state (never writes it) and turns it into:
//   - Gamepad dual rumble, like force feedback through a wheel: the light motor carries the
//     tyres (a fizz that grows as they slide past grip, wheelspin on a launch, a drift's
//     scrub) plus a faint road texture at speed; the heavy motor carries the chassis (a wall
//     hit, grinding a barrier, a hard landing, a crash).
//   - Phone pulses for the same moments (src/touch/haptics.js): a wall hit, a hard landing and
//     the tyres letting go, each throttled so a long slide never buzzes constantly.
// Off with the Haptics setting; calm mode keeps only the tyres and halves everything.

/** Rumble mix, all 0..1. */
export const FEEL = Object.freeze({
  slipWeak: 0.75,     // light motor per unit of tyre slip past grip (capped at 1)
  spinWeak: 0.5,      // … per unit of wheelspin
  driftWeak: 0.22,    // … extra while a power drift scrubs
  roadWeak: 0.06,     // … road texture at 120 mph (∝ speed)
  grindStrong: 0.32,  // heavy motor while grinding a wall
  wallStrong: 0.85,   // … impulse on a wall hit
  landStrong: 0.7,    // … impulse on a hard landing (scaled by how far you fell)
  hitStrong: 1,       // … impulse when you lose HP to a crash
  decay: 7,           // 1/s; impulses fade like a struck chassis
  refreshMs: 90,      // re-send the effect at least this often while it's on …
  effectMs: 140,      // … each one lasting this long (overlap: no gaps between sends)
  slipPulse: 0.45,    // phone tick when slip crosses this upward
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Pure: the rumble a state asks for. `imp` is the decaying impulse level (heavy motor).
 * @returns {{weak:number, strong:number}}
 */
export function rumbleFor(s, imp, out = { weak: 0, strong: 0 }) {
  if (s.status !== 'PLAYING') { out.weak = 0; out.strong = 0; return out; }
  const air = (s.playerY || 0) > 4;
  const v = Math.max(0, s.speed || 0) / 120;
  let weak = air ? 0 : (s.tyreSlip || 0) * FEEL.slipWeak + (s.wheelSpin || 0) * FEEL.spinWeak + (s.isDrifting ? FEEL.driftWeak : 0) + FEEL.roadWeak * Math.min(1, v);
  out.weak = clamp01(weak);
  out.strong = clamp01(imp + (s.wallGrind && v > 0.2 ? FEEL.grindStrong * Math.min(1, v) : 0));
  return out;
}

/**
 * @param {object} o
 * @param {object} o.state GameState
 * @param {() => {haptics:boolean, hapticStrength:number}} o.settings controls settings
 * @param {() => boolean} [o.calm]
 * @param {() => ({pulse:(k:string)=>boolean}|null)} [o.haptics] the phone's haptics, if any
 * @param {() => number} [o.now]
 */
export function createForceFeel({ state, settings, calm = () => false, haptics = () => null, now = () => performance.now() }) {
  let imp = 0, sent = 0, lastSent = { weak: 0, strong: 0 }, wasGrind = false, wasAir = false, peakFall = 0, lastHp = null, wasSlip = false;
  const want = { weak: 0, strong: 0 };

  function actuator() {
    if (!navigator.getGamepads) return null;
    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]; // the same pad src/input.js steers with: the first connected one
        if (p && p.connected) return p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]) || null;
      }
    } catch (e) { /* blocked */ }
    return null;
  }

  function send(act, weak, strong, t) {
    sent = t; lastSent.weak = weak; lastSent.strong = strong;
    try {
      if (typeof act.playEffect === 'function') {
        if (weak === 0 && strong === 0 && typeof act.reset === 'function') act.reset();
        else act.playEffect('dual-rumble', { startDelay: 0, duration: FEEL.effectMs, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
      } else if (typeof act.pulse === 'function') act.pulse(Math.max(weak, strong), FEEL.effectMs);
    } catch (e) { /* not allowed yet (no gesture) or unsupported */ }
  }

  return {
    /** Once per frame with the frame's wall time in seconds. */
    frame(dt) {
      const s = state;
      const cfg = settings() || {};
      const on = cfg.haptics !== false && s.status === 'PLAYING';
      const quiet = calm();
      const k = (cfg.hapticStrength == null ? 1 : cfg.hapticStrength) * (quiet ? 0.5 : 1);
      const phone = on ? haptics() : null;

      // Chassis events → the heavy motor's impulse (and a phone pulse).
      const grind = Boolean(s.wallGrind) && (s.speed || 0) > 25;
      if (grind && !wasGrind) { imp = Math.max(imp, FEEL.wallStrong * Math.min(1, (s.speed || 0) / 90)); if (phone && !quiet) phone.pulse('wall'); }
      wasGrind = grind;
      const air = (s.playerY || 0) > 4;
      if (air) peakFall = Math.max(peakFall, s.playerY || 0);
      if (!air && wasAir) {
        const hard = Math.min(1, peakFall / 260);
        if (hard > 0.15) { imp = Math.max(imp, FEEL.landStrong * hard); if (phone && !quiet) phone.pulse('land'); }
        peakFall = 0;
      }
      wasAir = air;
      if (lastHp != null && s.hp < lastHp - 0.5) imp = Math.max(imp, FEEL.hitStrong);
      lastHp = s.hp;
      if (quiet) imp = 0;
      // Tyres letting go: one tick as the slide starts (the rumble carries the rest).
      const slip = (s.tyreSlip || 0) > FEEL.slipPulse && !air;
      if (slip && !wasSlip && phone) phone.pulse('slip');
      wasSlip = slip;

      rumbleFor(s, imp, want);
      imp *= Math.exp(-FEEL.decay * Math.max(0, dt));
      if (imp < 0.01) imp = 0;

      const act = actuator();
      if (!act) return;
      const weak = on ? Math.round(want.weak * k * 50) / 50 : 0;
      const strong = on ? Math.round(want.strong * k * 50) / 50 : 0;
      const t = now();
      const changed = Math.abs(weak - lastSent.weak) > 0.03 || Math.abs(strong - lastSent.strong) > 0.03;
      const live = weak > 0 || strong > 0;
      const wasLive = lastSent.weak > 0 || lastSent.strong > 0;
      if ((live && (changed || t - sent >= FEEL.refreshMs)) || (!live && wasLive)) send(act, weak, strong, t);
    },
    /** Silence (pause, results, page hidden). */
    stop() {
      imp = 0;
      const act = actuator();
      if (act && (lastSent.weak > 0 || lastSent.strong > 0)) send(act, 0, 0, now());
    },
  };
}
