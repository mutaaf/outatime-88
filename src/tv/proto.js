// TV mode wire format and steering math (ticket 0175), shared by the TV screen (src/tv/tv.js)
// and the phone pad (src/tv/pad.js). Frames are tiny JSON arrays so the same bytes work over
// a WebRTC DataChannel and over the PadRoom relay. Every frame carries full state (no deltas),
// so a lost unreliable frame is simply replaced by the next one; one-shot taps travel as
// counters and fire when the counter moves.
//
//   pad → TV  [0, seq, steer(-1000..1000), bits, boostN, startN, padMs, echoTvMs, fitN]
//   TV → pad  [1, mph, hp, coins, status, rumbleN, rumbleKind, tvMs, echoPadMs, hpMax]

export const INPUT = 0;
export const HUD = 1;
export const BITS = Object.freeze({ gas: 1, brake: 2, nos: 4, hover: 8 });
export const STATUS = Object.freeze(['TITLE', 'GRID', 'PLAYING', 'PAUSED', 'GAMEOVER', 'CONTINUE', 'WAIT']);
export const RUMBLE = Object.freeze(['', 'hit', 'pickup', 'boost', 'lap', 'press']);

/** Rates: P2P sends every frame; the relay (billed per message) sends on change, capped. */
export const RATE = Object.freeze({ p2pHz: 60, relayHz: 30, keepAliveMs: 250, hudHz: 12, staleMs: 600, lostMs: 2500 });

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const u8 = (v) => ((Math.round(Number(v) || 0) % 256) + 256) % 256;

export function encodeInput(p) {
  const bits = (p.gas ? BITS.gas : 0) | (p.brake ? BITS.brake : 0) | (p.nos ? BITS.nos : 0) | (p.hover ? BITS.hover : 0);
  return [INPUT, p.seq >>> 0, clampInt(p.steer * 1000, -1000, 1000), bits, u8(p.boostN), u8(p.startN), Math.round(p.ms) || 0, Math.round(p.echo) || 0, u8(p.fitN)];
}

/** → { seq, steer, gas, brake, nos, hover, boostN, startN, ms, echo } or null. */
export function decodeInput(a) {
  if (!Array.isArray(a) || a[0] !== INPUT || a.length < 6) return null;
  const bits = a[3] | 0;
  return {
    seq: Number(a[1]) >>> 0,
    steer: clampInt(a[2], -1000, 1000) / 1000,
    gas: !!(bits & BITS.gas), brake: !!(bits & BITS.brake), nos: !!(bits & BITS.nos), hover: !!(bits & BITS.hover),
    boostN: u8(a[4]), startN: u8(a[5]), ms: Number(a[6]) || 0, echo: Number(a[7]) || 0, fitN: u8(a[8]),
  };
}

export function encodeHud(h) {
  return [HUD, clampInt(h.mph, 0, 999), clampInt(h.hp, 0, 9999), clampInt(h.coins, 0, 1e7), Math.max(0, STATUS.indexOf(h.status)),
    u8(h.rumbleN), Math.max(0, RUMBLE.indexOf(h.rumble || '')), Math.round(h.ms) || 0, Math.round(h.echo) || 0, clampInt(h.hpMax || 100, 1, 9999)];
}

export function decodeHud(a) {
  if (!Array.isArray(a) || a[0] !== HUD || a.length < 9) return null;
  return {
    mph: a[1] | 0, hp: a[2] | 0, coins: a[3] | 0, status: STATUS[a[4]] || 'WAIT',
    rumbleN: u8(a[5]), rumble: RUMBLE[a[6]] || '', ms: Number(a[7]) || 0, echo: Number(a[8]) || 0, hpMax: a[9] | 0 || 100,
  };
}

/** True when a wrapping 8-bit tap counter moved (any amount but "backwards by a little"). */
export function tapped(prev, next) {
  if (prev == null) return false;
  const d = (u8(next) - u8(prev) + 256) % 256;
  return d > 0 && d < 128;
}

/** Is `a` newer than `b` for 32-bit wrapping sequence numbers? */
export const newer = (a, b) => b == null || ((a - b) >>> 0) - 1 < 0x7fffffff;

// ── Steering the phone like a wheel ─────────────────────────────────────────
// Held in landscape like a steering wheel, the wheel axis is `beta` (its sign flips between
// the two landscape rotations); held upright in portrait it is `gamma`.
export const WHEEL = Object.freeze({ range: 30, dead: 1.5, expo: 0.35, smooth: 0.55 });

export function wheelAngle(beta, gamma, screenDeg) {
  const b = Number(beta) || 0, g = Number(gamma) || 0;
  switch (((screenDeg % 360) + 360) % 360) {
    case 90: return b;
    case 270: return -b;
    case 180: return -g;
    default: return g;
  }
}

/**
 * Degrees of tilt (relative to the calibrated zero) → steer -1..1: a small dead zone so a
 * resting phone drives straight, then an expo curve (fine control near centre, full lock at
 * ±range). `sens` 0.5–2 scales the range.
 */
export function wheelSteer(deg, zero, { range = WHEEL.range, dead = WHEEL.dead, expo = WHEEL.expo, sens = 1, invert = false } = {}) {
  const rel = ((deg - zero + 540) % 360) - 180; // shortest way round, so ±180 never jumps
  const a = Math.abs(rel);
  if (a <= dead) return 0;
  const r = range / Math.max(0.5, Math.min(2, sens));
  const x = Math.min(1, (a - dead) / Math.max(1, r - dead));
  const v = (1 - expo) * x + expo * x * x * x;
  return Math.sign(rel) * (invert ? -1 : 1) * v;
}

/** One-pole low-pass for sensor jitter; `k` 0..1 = how much of the new sample to take. */
export const smooth = (prev, next, k = WHEEL.smooth) => prev + (next - prev) * k;

/**
 * The TV's view of one pad: newest input wins, taps fire once, and input that stops arriving
 * is held briefly (a hiccup) and then released to neutral — never a stuck throttle.
 */
export function createPadState() {
  const s = { seq: null, steer: 0, gas: false, brake: false, nos: false, hover: false, boostN: null, startN: null, fitN: null, at: -1e9, padMs: 0, rtt: 0, hz: 0, n: 0, hzAt: 0 };
  return {
    s,
    /** Apply a decoded frame at time `now`; returns the { boost, start, fit } taps it carried. */
    take(f, now, tvMs = now) {
      const taps = { boost: false, start: false, fit: false };
      if (!f || !newer(f.seq, s.seq)) return taps;
      taps.boost = tapped(s.boostN, f.boostN);
      taps.start = tapped(s.startN, f.startN);
      taps.fit = tapped(s.fitN, f.fitN);
      s.fitN = f.fitN;
      s.seq = f.seq; s.steer = f.steer; s.gas = f.gas; s.brake = f.brake; s.nos = f.nos; s.hover = f.hover;
      s.boostN = f.boostN; s.startN = f.startN; s.at = now; s.padMs = f.ms;
      if (f.echo) s.rtt = Math.max(0, tvMs - f.echo);
      s.n++;
      if (now - s.hzAt >= 1000) { s.hz = Math.round((s.n * 1000) / Math.max(1, now - s.hzAt)); s.n = 0; s.hzAt = now; }
      return taps;
    },
    /** Input to drive with at `now`: held through short gaps, neutral once stale. */
    live(now) {
      const age = now - s.at;
      if (age > RATE.staleMs) return { steer: 0, gas: false, brake: false, nos: false, hover: false, stale: true, lost: age > RATE.lostMs };
      return { steer: s.steer, gas: s.gas, brake: s.brake, nos: s.nos, hover: s.hover, stale: false, lost: false };
    },
  };
}
