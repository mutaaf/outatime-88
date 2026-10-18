// Orange-track set pieces (sprint 4): loops, corkscrews, gap jumps, wall-ride half-pipes and
// booster gates. A set piece is one shared `feature` object over a run of segments (see
// featureAt in src/track.js). This module owns their geometry numbers and the small amount of
// simulation they need; the renderers (src/setpieces-2d.js, src/render3d/path.js) draw them
// from the same objects. Nothing here costs points: a set piece only ever costs time.

export const SETPIECE = {
  LOOP: { radius: 1500, minMph: 55 },      // length = 2πR of track Z
  CORKSCREW: { length: 7200 },             // one full roll while the road turns
  JUMP: { gap: 1000 },                      // the hole after the ramp (sim Z)
  WALLRIDE: { length: 9600, bank: 0.9 },   // a banked half-pipe bend
  BOOSTER: { length: 2400, kickMph: 14 },  // a booster gate: speed kick up to loop speed
};

export const loopLength = (radius = SETPIECE.LOOP.radius) => Math.round(2 * Math.PI * radius);

/** Progress (0..1) through feature `f` at track Z `z`. */
export function progressIn(f, z) {
  if (!f) return 0;
  return Math.max(0, Math.min(1, (z - f.z0) / f.length));
}

/**
 * Per-frame set-piece simulation for the player. `s` is GameState-shaped; `f` the feature
 * under the car (or null); `z` the car's track Z. Returns an event string the caller can
 * announce ('BOOST' | 'LOOP_FAIL' | 'GAP_FALL' | null). Deterministic: no randomness.
 *
 * The handling physics (car model, NOS) may layer on top of this; these are the track's
 * guarantees: a booster gate always gets you to loop speed, and missing a jump or stalling in a
 * loop costs time, never points.
 */
export function stepSetPieces(s, f, z) {
  if (!f) { s.setPieceId = 0; return null; }
  const t = progressIn(f, z);
  const first = s.setPieceId !== f.id;
  s.setPieceId = f.id;
  if (f.kind === 'BOOSTER') {
    if (first) {
      s.speed = Math.max(s.speed, Math.min((f.minMph || 0) + 12, s.speed + SETPIECE.BOOSTER.kickMph));
      return 'BOOST';
    }
    return null;
  }
  if (f.kind === 'LOOP') {
    if (first) s.loopEntryMph = s.speed;
    // Too slow over the top: you drop off the track and rejoin at the exit. Time, not points.
    if (t > 0.45 && !s.loopFailed && (s.loopEntryMph || 0) < f.minMph) {
      s.loopFailed = true;
      return 'LOOP_FAIL';
    }
    if (first) s.loopFailed = false;
    return null;
  }
  if (f.kind === 'GAP') {
    if ((s.playerY || 0) <= 1 && t > 0.05) return 'GAP_FALL';
  }
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
