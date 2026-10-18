// Orange-track set pieces (sprint 4): loops, corkscrews, gap jumps, wall-ride half-pipes and
// booster gates. A set piece is one shared `feature` object over a run of segments (see
// featureAt in src/track.js). This module owns their geometry numbers and the small amount of
// simulation they need; the renderers (src/setpieces-2d.js, src/render3d/path.js) draw them
// from the same objects. Nothing here costs points: a set piece only ever costs time.

export const SETPIECE = {
  // A loop: length 2πR of track Z. `minMph` is the speed needed over the top; the handling
  // physics (src/handling.js loopStep) applies gravity round the loop and peels you off below it.
  LOOP: { radius: 1500, minMph: 40 },
  CORKSCREW: { length: 7200 },             // one full roll while the road turns
  JUMP: { gap: 1000, launchMph: 60 },      // the hole after the ramp; the ramp launches above 52
  WALLRIDE: { length: 9600, bank: 0.9 },   // a banked half-pipe bend
  BOOSTER: { length: 2400 },               // a booster gate: tops you up to its `boostTo` speed
};

export const loopLength = (radius = SETPIECE.LOOP.radius) => Math.round(2 * Math.PI * radius);

/**
 * Entry speed that still clears the top of a loop at the slowest pace (40 sim Z per mph·s on
 * SMOOTH), under the handling physics' gravity round the loop (30 mph/s · sin 2πt, top window
 * t 0.38–0.62; src/handling.js loopStep). Found by stepping it, plus a small margin. Memoized.
 */
const entryMemo = new Map();
export function loopEntryMph(minTop = SETPIECE.LOOP.minMph, length = loopLength(), k = 40, gravity = 30) {
  const key = `${minTop}|${length}|${k}|${gravity}`;
  if (entryMemo.has(key)) return entryMemo.get(key);
  const dt = 1 / 120;
  let entry = minTop;
  for (; entry < 200; entry++) {
    let v = entry, z = 0, ok = true;
    while (z < length) {
      const t = z / length;
      if (v < 1 || (t >= 0.38 && t <= 0.62 && v < minTop)) { ok = false; break; }
      v -= gravity * Math.sin(2 * Math.PI * t) * dt;
      z += v * k * dt;
    }
    if (ok) break;
  }
  entryMemo.set(key, entry + 3);
  return entry + 3;
}

/** Progress (0..1) through feature `f` at track Z `z`. */
export function progressIn(f, z) {
  if (!f) return 0;
  return Math.max(0, Math.min(1, (z - f.z0) / f.length));
}

/**
 * Per-frame set-piece simulation for the player. `s` is GameState-shaped; `f` the feature
 * under the car (or null); `z` the car's track Z. Returns an event string the caller can
 * announce ('BOOST' | 'GAP_FALL' | null). Deterministic: no randomness.
 *
 * Loops themselves are the handling physics' job (gravity, peeling off when too slow); the
 * track's guarantees are here: a booster gate always tops you up to what the next piece
 * needs, and missing a gap costs time, never points.
 */
export function stepSetPieces(s, f, z) {
  if (!f) { s.setPieceId = 0; return null; }
  const first = s.setPieceId !== f.id;
  s.setPieceId = f.id;
  if (f.kind === 'BOOSTER' && first) {
    s.speed = Math.max(s.speed, f.boostTo || 0);
    return 'BOOST';
  }
  if (f.kind === 'GAP' && (s.playerY || 0) <= 1 && progressIn(f, z) > 0.05) return 'GAP_FALL';
  return null;
}

/** A new feature object for the track builder (its id is its start, so tracks stay deterministic). */
export function makeFeature(kind, z0, length, extra) {
  return Object.assign({ id: Math.round(z0) + 1, kind, z0, length }, extra);
}

/**
 * How far the 2D view rolls in a set piece (radians): a full barrel roll through a corkscrew,
 * a lean up the wall of a half-pipe. Calm mode keeps it to a gentle tilt.
 */
export function viewRoll(f, z, reduced) {
  if (!f) return 0;
  const t = progressIn(f, z);
  const d = f.dir || 1;
  if (f.kind === 'CORKSCREW') return reduced ? 0.12 * Math.sin(Math.PI * t) * d : 2 * Math.PI * t * d;
  if (f.kind === 'WALLRIDE') return (reduced ? 0.12 : 0.5) * Math.sin(Math.PI * t) * d;
  return 0;
}
