// Street-tuner sound rules (ticket 0193), pure and unit-tested: how the drivetrain, tyres,
// speed and road map onto the tuner layer in src/sfx/street.js. Nothing here touches Web Audio.
//
// Every voice is synthesized (no samples, no film audio): the genre is the inspiration, never a
// recording or a melody from one (docs/EASTER_EGGS.md, "Street sound").

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(Number(v) || 0, 0, 1);

/**
 * Engine character per roster body, with a name override for the rotary. turbo: spool + blow-off
 * valve; crackle: overrun pops per second at full lift; pop: how deep the pops are (Hz);
 * whistle: turbo whistle pitch at full boost.
 */
export const CHARACTERS = Object.freeze({
  v8:       { turbo: false, crackle: 9,  pop: 70,  whistle: 0,    burble: 7,  limiter: 13 },
  tuner:    { turbo: true,  crackle: 6,  pop: 120, whistle: 3200, burble: 10, limiter: 17 },
  i6:       { turbo: true,  crackle: 5,  pop: 105, whistle: 2600, burble: 9,  limiter: 15 },
  rotary:   { turbo: true,  crackle: 12, pop: 150, whistle: 3600, burble: 14, limiter: 21 },
  rocket:   { turbo: false, crackle: 0,  pop: 0,   whistle: 0,    burble: 0,  limiter: 0 },
  electric: { turbo: false, crackle: 0,  pop: 0,   whistle: 0,    burble: 0,  limiter: 0 },
});

const BY_SHAPE = {
  MUSCLE: 'v8', HEAVY_VAN: 'v8', TUNER_WING: 'tuner', GULLWING: 'i6', SCANNER: 'i6',
  LIGHTCYCLE: 'rotary', ROCKET: 'rocket', ROADSTER: 'electric',
};

/** Character name for a car: its body shape, except anything sold as a rotary buzzes like one. */
export function characterFor(shape, carName = '') {
  if (/rotary/i.test(String(carName)) && shape !== 'ROADSTER') return 'rotary';
  return BY_SHAPE[shape] || 'i6';
}

/** Turbo boost 0..1: builds with revs under load, bleeds off when you lift. */
export function boostTarget(rpm, throttle) {
  if (!throttle) return 0;
  return clamp01(((Number(rpm) || 18) - 35) / 55);
}

/** One step of spool: lag up (~0.35 s), dump fast (~0.08 s). */
export function stepBoost(boost, target, dt) {
  const k = target > boost ? 3 : 12;
  return boost + (target - boost) * clamp01(k * Math.max(0, dt));
}

/** The spool whistle for a boost level and character: { hz, gain }. */
export function spoolVoice(boost, ch) {
  const c = CHARACTERS[ch] || CHARACTERS.i6;
  if (!c.turbo) return { hz: 0, gain: 0 };
  const b = clamp01(boost);
  return { hz: c.whistle * (0.35 + b * 0.65), gain: b * b * 0.07 };
}

/** Blow-off valve: lifting (or a shift) with enough boost built up vents it. */
export function blowOff(prevThrottle, throttle, boost, shifted = false) {
  return (shifted || (prevThrottle && !throttle)) && boost > 0.35;
}

/** Upshift chirp: a gear up while you're on it, above a crawl. */
export function shiftChirp(prevGear, gear, throttle, mph) {
  return gear > prevGear && Boolean(throttle) && mph > 12;
}

/** Bouncing off the rev limiter. */
export function onLimiter(rpm, throttle) {
  return Boolean(throttle) && (Number(rpm) || 0) >= 98.5;
}

/** Overrun pops per second: off the gas at speed, fading as the revs fall. */
export function crackleRate(throttle, rpm, mph, ch, sinceLift) {
  const c = CHARACTERS[ch] || CHARACTERS.i6;
  if (throttle || !c.crackle || mph < 30) return 0;
  const fade = clamp01(1 - (Number(sinceLift) || 0) / 1.4);
  return c.crackle * clamp01(((Number(rpm) || 18) - 25) / 60) * fade;
}

/** The tuner squeal layer over the existing screech, from handling's tyre slip (0..~1.5). */
export function squealLayer(slip) {
  const s = clamp01((Math.abs(Number(slip) || 0) - 0.18) / 0.9);
  if (s <= 0) return { gain: 0, hz: 0 };
  return { gain: 0.015 + s * 0.05, hz: 1650 + s * 900 };
}

/** The drift-hold tone: a held, rising note while a drift is charging (tier 0..3). */
export function driftTone(drifting, tier) {
  if (!drifting) return { gain: 0, hz: 0 };
  const t = clamp(Number(tier) || 0, 0, 3);
  return { gain: 0.018 + t * 0.008, hz: 330 * Math.pow(2, (t * 4) / 12) };
}

/** Wind rush rises with the square of speed (mph): { gain, hz } for a band-passed hiss. */
export function windFor(mph) {
  const s = clamp01((Number(mph) || 0) / 150);
  return { gain: s * s * 0.1, hz: 380 + s * 1500 };
}

/** Doppler pitch ratio for an approaching (+) or receding (−) closing speed in mph. */
export function dopplerRatio(closingMph) {
  const c = 761; // speed of sound, mph
  const v = clamp(Number(closingMph) || 0, -300, 300);
  return c / (c - v);
}

/**
 * Did a car just go past? `prevDz`/`dz` = its Z minus yours before and after this frame, `lat`
 * the lane gap. Passing it (+ → −) or being passed (− → +), close enough to hear.
 */
export function passedBy(prevDz, dz, lat) {
  if (!Number.isFinite(prevDz) || !Number.isFinite(dz)) return 0;
  if (Math.abs(lat) > 1.1) return 0;
  if (prevDz > 0 && dz <= 0) return 1;   // you passed it
  if (prevDz < 0 && dz >= 0) return -1;  // it passed you
  return 0;
}

/** Pass-by loudness from the closing speed (mph) and lane gap: 0 = don't bother. */
export function passByGain(relMph, lat) {
  const r = clamp01((Math.abs(Number(relMph) || 0) - 10) / 70);
  return r * (1 - clamp01(Math.abs(lat) / 1.2)) * 0.7;
}

/** Metal crunch for a hit's Δv (world Z/s; ~1600 = the 50 mph stun line). */
export function crunchFor(dv) {
  const k = clamp01((Number(dv) || 0) / 1600);
  if (k < 0.05) return null;
  return { gain: 0.15 + k * 0.6, rate: 1.15 - k * 0.45, dur: 0.18 + k * 0.42, glass: k > 0.6, duck: k > 0.35 ? 0.3 + k * 0.4 : 0 };
}

/** Reverb send 0..1 for the road under you: tunnels and loop rings ring out, open road doesn't. */
export function reverbFor(trackType, overhead = false) {
  if (trackType === 'BOOSTER') return 0.75;
  if (trackType === 'LOOP') return 0.45;
  return overhead ? 0.5 : 0;
}

/** Music low-pass (Hz) for the moment: NOS is a tunnel, slow-mo and big air go under water. */
export function musicCutoff({ nos = false, slowmo = false, air = false } = {}) {
  if (slowmo) return 420;
  if (nos) return 900;
  if (air) return 1600;
  return 20000;
}

/** Airborne long enough (s) to count as a big jump. */
export const BIG_AIR_S = 0.45;
