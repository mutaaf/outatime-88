// Lane guide (ticket 0219): an optional soft sine on the SFX bus, panned toward the nearest lane
// with nothing coming in the next GUIDE.horizon seconds, its pitch rising as your own lane closes.
// Silent while your lane is clear, and silent when no open lane can be reached without crossing
// another one that is closing (it never points into another hit). It gives the information; the
// player decides. Settings → Sound → "Lane guide" (saved as settings.laneGuide, off unless true)
// turns it on; Mute silences it like everything else. Race-step chunk only, never in main.
//
// Per step it allocates nothing: the gain and panner are built once per audio context, and the
// oscillator is started when guidance begins and stopped after GUIDE.rest seconds of quiet. Its
// gain is held only GUIDE.hold ahead of the audio clock, so if the race stops stepping it (pause,
// results, a hidden tab) the tone fades out by itself instead of droning on.
import { contactIn } from './proximity-cue.js';

export const GUIDE = Object.freeze({
  horizon: 1.2,               // seconds ahead a lane must be clear
  // Where the car can go: the Endless hazard lanes (src/hazards.js LANES: -0.48, 0, 0.48) and the
  // traffic lanes (src/formations.js FORMATION_LANES: ±0.48, ±0.2), kept here so the chunks stay apart.
  lanes: [-0.48, -0.2, 0, 0.2, 0.48],
  centre: 0.06,               // an open lane within this of your middle plays centred
  pan: 0.8,                   // how far left/right a side lane sits
  level: 0.05,                // softer than the 0191 tick: it sustains
  lo: 330, hi: 880,           // Hz: lane closing in GUIDE.horizon → about to hit
  glide: 0.03,                // s, time constant for pan/pitch/level moves (no clicks)
  hold: 0.25, release: 0.15,  // s the tone holds past the last refresh, then fades over
  refresh: 0.05,              // s (audio clock) between hold refreshes
  rest: 1,                    // s of quiet before the oscillator stops
});

const NONE = [];
const H = GUIDE.horizon;

/**
 * 0 when the car with its middle at `x` stays clear for GUIDE.horizon, 1 when only threats to
 * where you are now (p.x) would hit it there, 2 when something else would: a lane of its own
 * that is closing. Steering through spots of kind 1 is moving out of your own threat's way.
 */
function blockAt(p, x, traffic, obstacles, racers) {
  let k = 0;
  for (let j = 0; j < 3; j++) {
    const list = j === 0 ? traffic : j === 1 ? obstacles : racers;
    for (let i = 0; i < list.length; i++) {
      if (!(contactIn(p, list[i], x) <= H)) continue;
      if (!(contactIn(p, list[i]) <= H)) return 2;
      k = 1;
    }
  }
  return k;
}

/** Soonest contact (s) where you are, and the side (offset - p.x) of what makes it. */
function threatHere(p, traffic, obstacles, racers, out) {
  let best = Infinity, d = 0;
  for (let j = 0; j < 3; j++) {
    const list = j === 0 ? traffic : j === 1 ? obstacles : racers;
    for (let i = 0; i < list.length; i++) {
      const t = contactIn(p, list[i]);
      if (t < best) { best = t; d = list[i].offset - p.x; }
    }
  }
  out.t = best; out.d = d;
  return best;
}

/** Distance to the nearest reachable open lane on side `s` (+1 right, -1 left), or Infinity. */
function reach(p, s, traffic, obstacles, racers) {
  const L = GUIDE.lanes, n = L.length;
  for (let k = 0; k < n; k++) {
    const x = L[s > 0 ? k : n - 1 - k];
    const dx = (x - p.x) * s;
    if (dx <= GUIDE.centre) continue;
    const b = blockAt(p, x, traffic, obstacles, racers);
    if (b === 0) return dx;
    if (b === 2) return Infinity; // you'd have to cross a lane that is closing
  }
  return Infinity;
}

const here = { t: 0, d: 0 };

/**
 * Pan (-1 left, 0 centre, +1 right, relative to you) toward the nearest open lane you can reach
 * without crossing a closing one, or null when your own spot is clear for GUIDE.horizon or no
 * such lane exists. Bodies and `p` are the 0191 proximity cue's (src/proximity-cue.js chooseCue).
 * Two open lanes equally near: the one away from the threat. `out.t`, when given, gets the
 * seconds until your own spot closes.
 */
export function chooseLane(p, traffic, obstacles, racers = NONE, out = null) {
  if (!(threatHere(p, traffic, obstacles, racers, here) <= H)) return null;
  // A lane middle within GUIDE.centre of you that is open: you're straddling, it's right there.
  let best = Infinity, pan = null;
  const L = GUIDE.lanes;
  for (let k = 0; k < L.length; k++) {
    const dx = Math.abs(L[k] - p.x);
    if (dx <= GUIDE.centre && dx < best && blockAt(p, L[k], traffic, obstacles, racers) === 0) { best = dx; pan = 0; }
  }
  const right = reach(p, 1, traffic, obstacles, racers);
  const left = reach(p, -1, traffic, obstacles, racers);
  const side = Math.abs(right - left) < 1e-6 ? (here.d > 0 ? -1 : 1) : right < left ? 1 : -1;
  if (Math.min(right, left) < best) pan = side;
  if (pan === null) return null;
  if (out) out.t = here.t;
  return pan;
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
  let holdUntil = -1, refreshed = -1, quiet = 0, lastPan = NaN, lastHz = 0;
  function build() {
    if (osc) { try { osc.stop(); } catch (e) {} osc = null; } // left on an old context
    ctx = se.ctx;
    holdUntil = refreshed = -1;
    gain = ctx.createGain();
    gain.gain.value = 0;
    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { gain.connect(panner); panner.connect(se.sfxBus); } else gain.connect(se.sfxBus);
  }
  // Drop what is scheduled from `now` on, keeping the level the param has reached (no jump).
  function cancel(g, now) {
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else { const v = g.value; g.cancelScheduledValues(now); g.setValueAtTime(v, now); }
  }
  function fade(now) {
    if (holdUntil < 0) return;
    holdUntil = -1;
    try {
      cancel(gain.gain, now);
      gain.gain.setTargetAtTime(0, now, GUIDE.glide);
    } catch (e) { /* audio is best-effort */ }
  }
  return {
    step(dt, p, traffic, obstacles, racers) {
      const pan = on() ? chooseLane(p, traffic, obstacles, racers, why) : null;
      const live = !silent && !se.muted && se.volume > 0 && se.ctx && se.sfxBus && se.ctx.state === 'running';
      if (pan === null || !live) {
        if (osc) {
          fade(ctx.currentTime);
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
        if (!osc) {
          osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.connect(gain);
          osc.start(now);
          lastPan = NaN; lastHz = 0;
        }
        const hz = GUIDE.lo + (GUIDE.hi - GUIDE.lo) * Math.max(0, Math.min(1, 1 - why.t / H));
        if (Math.abs(hz - lastHz) > 4) { osc.frequency.setTargetAtTime(hz, now, lastHz ? GUIDE.glide : 0.001); lastHz = hz; }
        if (panner && pan !== lastPan) { panner.pan.setTargetAtTime(pan * GUIDE.pan, now, lastPan === lastPan ? GUIDE.glide : 0.001); lastPan = pan; }
        if (now >= holdUntil || now - refreshed >= GUIDE.refresh || now < refreshed) {
          // Hold the level a short way ahead of the clock, then fade: steps keep pushing it out.
          // Coming back after the hold ran out (a pause, a long frame) glides in rather than jumps.
          const g = gain.gain, level = GUIDE.level * se.volume;
          const fresh = now >= holdUntil;
          cancel(g, now);
          if (fresh) g.setTargetAtTime(level, now, GUIDE.glide); else g.setValueAtTime(level, now);
          holdUntil = now + GUIDE.hold;
          g.setValueAtTime(level, holdUntil);
          g.linearRampToValueAtTime(0, holdUntil + GUIDE.release);
          refreshed = now;
        }
      } catch (e) { /* audio is best-effort */ }
      return pan;
    },
  };
}
