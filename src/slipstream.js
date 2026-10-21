// Slipstream charge cue (ticket 0197): while you sit in a wake, a rising tone and greening speed
// lines build with `draftCharge`, and from READY (80%) a soft pulse says the slingshot is about to
// fire. Pure rules plus the edge tint; a lazy module shared by the race flow (picture) and the
// tuner layer (sound), so main only carries the hook (RS.wake) that calls it once per frame.
//
// Calm mode keeps the sound and a static tint: no lines, no pulse. Nothing allocates per frame.

/** Charge (0-100) at which the cue says "about to fire". */
export const DRAFT_READY = 80;
/** Visual pulse rate while READY (Hz). Under the 3-flashes-a-second line (ticket 0188). */
export const PULSE_HZ = 2;
/** Tone pitch at zero and full charge (Hz): one and a half octaves up. */
export const TONE_LO = 196;
export const TONE_HI = TONE_LO * Math.pow(2, 1.5);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The cue's shape, all zero: what "off" looks like. */
export function offCue(out = {}) {
  out.on = false; out.k = 0; out.hz = 0; out.gain = 0; out.lines = 0; out.tint = 0; out.pulse = 0; out.ready = false;
  return out;
}

/**
 * Map the wake to the cue. drafting: you are in a wake and fast enough for it to charge.
 * charge: GameState.draftCharge (0-100). reduced: calm mode. clock: seconds (any steady clock).
 * Fills and returns `out` (reused): hz/gain for the tone, lines (speed-line intensity, 0-1),
 * tint (edge tint strength, 0-1), pulse (0-1 extra tint while READY), ready.
 */
export function draftCue(drafting, charge, reduced, clock, out = {}) {
  if (!drafting) return offCue(out);
  const k = clamp01((Number(charge) || 0) / 100);
  out.on = true;
  out.k = k;
  out.hz = TONE_LO * Math.pow(2, 1.5 * k);
  out.gain = 0.025 + 0.045 * k;
  out.ready = k * 100 >= DRAFT_READY;
  out.lines = reduced ? 0 : 0.3 + 0.5 * k;
  out.tint = 0.25 + 0.75 * k;
  out.pulse = out.ready && !reduced ? 0.5 + 0.5 * Math.sin((Number(clock) || 0) * Math.PI * 2 * PULSE_HZ) : 0;
  return out;
}

/** Are you charging a wake right now? The same test the race step charges on. */
export const inWake = (G) => G.status === 'PLAYING' && !!G.draftingCar && G.speed > 50;

// --- the picture: a green glow up the screen edges, cached per canvas size --------------------
let glow = null, glowW = 0, glowH = 0, glowCtx = null;
function edgeGlow(c, W, H) {
  if (glow && glowW === W && glowH === H && glowCtx === c) return glow;
  const g = c.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.32, W * 0.5, H * 0.46, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, 'rgba(60,255,150,0)');
  g.addColorStop(1, 'rgba(60,255,150,1)');
  glow = g; glowW = W; glowH = H; glowCtx = c;
  return g;
}

/** Seconds the tint takes to come up or go away: a wake edge that flickers never flashes. */
export const TINT_FADE = 0.15;
const tint = { env: 0, a: 0, last: -1 };

/** Edge-tint alpha for this frame's cue: a steady level in calm mode, a 2 Hz swell at READY. */
export function tintAlpha(cue, reduced) {
  if (!cue.on) return 0;
  return reduced ? 0.22 : 0.08 + 0.2 * cue.tint + 0.1 * cue.pulse;
}

/**
 * Once per frame from main's speed lines (RS.wake): work out the cue into G.wakeCue, draw the
 * edge tint (eased in and out over TINT_FADE), and return the cue for the lines.
 */
export function wakeFrame(c, W, H, G, clock) {
  const cue = draftCue(inWake(G), G.draftCharge, G.reducedMotion, clock, G.wakeCue || (G.wakeCue = {}));
  const dt = tint.last < 0 ? 0 : Math.max(0, Math.min(0.1, clock - tint.last));
  tint.last = clock;
  const step = dt / TINT_FADE;
  tint.env = cue.on ? Math.min(1, tint.env + step) : Math.max(0, tint.env - step);
  if (cue.on) tint.a = tintAlpha(cue, G.reducedMotion);
  if (tint.env <= 0) return cue;
  c.save();
  c.globalAlpha = tint.a * tint.env;
  c.fillStyle = edgeGlow(c, W, H);
  c.fillRect(0, 0, W, H);
  c.restore();
  return cue;
}
