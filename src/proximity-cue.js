// Proximity cue (ticket 0191): threats shouldn't be readable by eye alone, so a short, quiet
// tick plays on the SFX bus, panned to the side of the soonest car or obstacle that will hit you
// within PROX.horizon seconds if nothing changes, at most ~4 a second. Settings → Sound →
// "Proximity cue" turns it off; Mute silences it like every other sound. Lives in the race-step
// chunk, never in main. Per step it allocates nothing: the click buffer, gain and panner are built
// once, and a tick only adds the one-shot buffer source Web Audio requires.

export const PROX = Object.freeze({
  horizon: 0.8, // seconds to contact
  gap: 0.26,    // seconds between ticks: never more than 4 in any 1 s window
  centre: 0.06, // a threat within this of your middle plays centred
  pan: 0.8,     // how far left/right a side threat sits
  level: 0.11,
});

const NONE = [];

/** Seconds until `b` reaches the player `p` at today's closing speed, or Infinity if it won't:
 *  parked, wrecked, already hit (the cue warns before a hit, it doesn't follow one), in another
 *  lane, or one you're jumping over or sliding under right now. */
function contactIn(p, b) {
  if (b.idle || b.takenDown || b.hitCount > 0 || b.touchT > p.now - 0.5) return Infinity;
  if (Math.abs(b.offset - p.x) >= p.halfW + b.halfW) return Infinity;
  const y = b.y || 0;
  if (p.bot >= y + b.height - 4 || p.top <= y || (b.clearanceY > 0 && p.top <= y + b.clearanceY + 4)) return Infinity;
  const gap = b.worldZ - b.halfL - (p.z + p.halfL);
  const closing = p.vz - (b.vz || 0);
  if (gap < 0 || closing <= 0) return Infinity;
  return gap / closing;
}

/**
 * Pan (-1 left, 0 centre, +1 right) of the soonest threat in `traffic`, `obstacles` and
 * `racers` that will hit the player within PROX.horizon, or null when none will. `p` is
 * { x, z, vz, halfW, halfL, bot, top, now } in road offset / world Z / height units and race
 * seconds; each body has worldZ, offset, halfW, halfL, vz, y, height (and clearanceY, touchT).
 */
export function chooseCue(p, traffic, obstacles, racers = NONE) {
  let best = PROX.horizon;
  let d = NaN;
  for (let k = 0; k < 3; k++) {
    const list = k === 0 ? traffic : k === 1 ? obstacles : racers;
    for (let i = 0; i < list.length; i++) {
      const t = contactIn(p, list[i]);
      if (t <= best) { best = t; d = list[i].offset - p.x; }
    }
  }
  if (d !== d) return null;
  return d < -PROX.centre ? -1 : d > PROX.centre ? 1 : 0;
}

/** A gate stepped every sim step: true when a wanted tick may play now. */
export function createLimiter(gap = PROX.gap) {
  let since = gap;
  return (dt, want) => {
    since += dt;
    if (!want || since < gap) return false;
    since = 0;
    return true;
  };
}

/**
 * The cue: `step(dt, player, traffic, obstacles, racers)` plays a tick when one is due and returns its
 * pan, or null. `on()` says whether the setting allows it; `se` is the SoundEngine. A `silent`
 * cue (the ?debug test mode) still chooses and rate-limits, so tests can see it, but never sounds.
 */
export function createProximityCue(se, on, silent = false) {
  const gate = createLimiter();
  let ctx = null, buf = null, gain = null, panner = null;
  function build() {
    ctx = se.ctx;
    // A 30 ms woodblock-ish click: a decaying 1.6 kHz sine with a softer octave under it.
    const n = Math.max(1, Math.round(ctx.sampleRate * 0.03));
    buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.exp(-t * 160) * (Math.sin(t * 2 * Math.PI * 1600) * 0.7 + Math.sin(t * 2 * Math.PI * 800) * 0.3);
    }
    gain = ctx.createGain();
    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { gain.connect(panner); panner.connect(se.sfxBus); } else gain.connect(se.sfxBus);
  }
  return {
    step(dt, p, traffic, obstacles, racers) {
      const pan = on() ? chooseCue(p, traffic, obstacles, racers) : null;
      if (!gate(dt, pan !== null)) return null;
      // A suspended or interrupted context would queue ticks and fire them all at once on resume.
      if (silent || se.muted || se.volume <= 0 || !se.ctx || !se.sfxBus || se.ctx.state !== 'running') return pan;
      try {
        if (ctx !== se.ctx) build();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(PROX.level * se.volume, now);
        if (panner) panner.pan.setValueAtTime(pan * PROX.pan, now);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        src.start(now);
      } catch (e) { /* audio is best-effort */ }
      return pan;
    },
  };
}
