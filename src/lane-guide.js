// Lane guide (ticket 0219): an optional soft sine on the SFX bus, panned toward the nearest lane
// with nothing coming in the next GUIDE.horizon seconds, its pitch rising as your own lane closes.
// Silent while your lane is clear, and silent when every lane is blocked (it never points into
// another hit). It gives the information; the player decides. Settings → Sound → "Lane guide"
// (saved as settings.laneGuide, off unless true) turns it on; Mute silences it like everything
// else. Race-step chunk only, never in main.
//
// Per step it allocates nothing: the gain and panner are built once per audio context, and the
// oscillator is started when guidance begins and stopped after GUIDE.rest seconds of quiet. Its
// gain is held only GUIDE.hold ahead of the audio clock, so if the race stops stepping it (pause,
// results, a hidden tab) the tone fades out by itself instead of droning on.
import { contactIn } from './proximity-cue.js';

export const GUIDE = Object.freeze({
  horizon: 1.2,               // seconds ahead a lane must be clear
  lanes: [-0.48, 0, 0.48],    // lane centres (the same three as src/hazards.js LANES, kept here so the chunks stay apart)
  centre: 0.06,               // an open lane within this of your middle plays centred
  pan: 0.8,                   // how far left/right a side lane sits
  level: 0.05,                // softer than the 0191 tick: it sustains
  lo: 330, hi: 880,           // Hz: lane closing in GUIDE.horizon → about to hit
  glide: 0.03,                // s, time constant for pan/pitch/level moves (no clicks)
  hold: 0.12, release: 0.15,  // s the tone holds past the last step, then fades over
  refresh: 0.05,              // s between hold refreshes
  rest: 1,                    // s of quiet before the oscillator stops
});

const NONE = [];

/** Soonest contact (s) for the player's car if its middle were at road offset `x`. */
function soonestAt(p, x, traffic, obstacles, racers) {
  let best = Infinity;
  for (let k = 0; k < 3; k++) {
    const list = k === 0 ? traffic : k === 1 ? obstacles : racers;
    for (let i = 0; i < list.length; i++) {
      const t = contactIn(p, list[i], x);
      if (t < best) best = t;
    }
  }
  return best;
}

/** Offset of the soonest threat to the car where it is (only called when there is one). */
function threatSide(p, traffic, obstacles, racers) {
  let best = Infinity, d = 0;
  for (let k = 0; k < 3; k++) {
    const list = k === 0 ? traffic : k === 1 ? obstacles : racers;
    for (let i = 0; i < list.length; i++) {
      const t = contactIn(p, list[i]);
      if (t < best) { best = t; d = list[i].offset - p.x; }
    }
  }
  return d;
}

/**
 * Pan (-1 left, 0 centre, +1 right, relative to you) toward the nearest lane that stays clear for
 * GUIDE.horizon, or null when your own spot is clear or no lane is. Bodies and `p` are the 0191
 * proximity cue's (src/proximity-cue.js chooseCue). Two open lanes equally near: the one away
 * from the threat. `out.t`, when given, gets the seconds until your own spot closes.
 */
export function chooseLane(p, traffic, obstacles, racers = NONE, out = null) {
  const here = soonestAt(p, p.x, traffic, obstacles, racers);
  if (!(here <= GUIDE.horizon)) return null;
  let bestD = Infinity, d = NaN, away = 0;
  for (let i = 0; i < GUIDE.lanes.length; i++) {
    const dx = GUIDE.lanes[i] - p.x;
    const far = Math.abs(dx);
    if (far > bestD + 1e-6) continue;
    if (!(soonestAt(p, GUIDE.lanes[i], traffic, obstacles, racers) > GUIDE.horizon)) continue;
    if (far >= bestD - 1e-6) {
      // A tie: keep the lane on the side away from the threat.
      if (!away) away = threatSide(p, traffic, obstacles, racers) > 0 ? -1 : 1;
      if (Math.sign(dx) !== away) continue;
    }
    bestD = far; d = dx;
  }
  if (d !== d) return null;
  if (out) out.t = here;
  return d < -GUIDE.centre ? -1 : d > GUIDE.centre ? 1 : 0;
}

/**
 * The guide: `step(dt, player, traffic, obstacles, racers)` keeps the tone where it should be and
 * returns its pan, or null when it is quiet. `on()` says whether the setting (and the race state)
 * allows it; `se` is the SoundEngine. A `silent` guide (the ?debug test mode) still chooses but
 * never sounds.
 */
export function createLaneGuide(se, on, silent = false) {
  const why = { t: 0 };
  let ctx = null, gain = null, panner = null, osc = null;
  let sounding = false, quiet = 0, since = 0, lastPan = NaN, lastHz = 0;
  function build() {
    if (osc) { try { osc.stop(); } catch (e) {} osc = null; } // left on an old context
    ctx = se.ctx;
    gain = ctx.createGain();
    gain.gain.value = 0;
    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { gain.connect(panner); panner.connect(se.sfxBus); } else gain.connect(se.sfxBus);
  }
  function fade() {
    if (!sounding) return;
    sounding = false;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, GUIDE.glide);
    } catch (e) { /* audio is best-effort */ }
  }
  return {
    step(dt, p, traffic, obstacles, racers) {
      const pan = on() ? chooseLane(p, traffic, obstacles, racers, why) : null;
      const live = !silent && !se.muted && se.volume > 0 && se.ctx && se.sfxBus && se.ctx.state === 'running';
      if (pan === null || !live) {
        if (osc) {
          fade();
          quiet += dt;
          if (quiet >= GUIDE.rest || ctx !== se.ctx) {
            try { osc.stop(ctx.currentTime + 0.05); } catch (e) {}
            osc = null;
          }
        }
        return pan;
      }
      try {
        if (ctx !== se.ctx) build();
        const now = ctx.currentTime;
        quiet = 0;
        since += dt;
        if (!osc) {
          osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.connect(gain);
          osc.start(now);
          lastPan = NaN; lastHz = 0;
        }
        const hz = GUIDE.lo + (GUIDE.hi - GUIDE.lo) * Math.max(0, Math.min(1, 1 - why.t / GUIDE.horizon));
        if (Math.abs(hz - lastHz) > 4) { osc.frequency.setTargetAtTime(hz, now, lastHz ? GUIDE.glide : 0.001); lastHz = hz; }
        if (panner && pan !== lastPan) { panner.pan.setTargetAtTime(pan * GUIDE.pan, now, lastPan === lastPan ? GUIDE.glide : 0.001); lastPan = pan; }
        if (!sounding || since >= GUIDE.refresh) {
          // Hold the level a short way ahead of the clock, then fade: steps keep pushing it out.
          const g = gain.gain, level = GUIDE.level * se.volume;
          g.cancelScheduledValues(now);
          if (sounding) g.setValueAtTime(level, now); else g.setTargetAtTime(level, now, GUIDE.glide);
          g.setValueAtTime(level, now + GUIDE.hold);
          g.linearRampToValueAtTime(0, now + GUIDE.hold + GUIDE.release);
          sounding = true;
          since = 0;
        }
      } catch (e) { /* audio is best-effort */ }
      return pan;
    },
  };
}
