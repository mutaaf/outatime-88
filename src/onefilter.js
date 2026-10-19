// One Euro filter (Casiez, Roussel & Vogel, CHI 2012) for the tilt sensor (ticket 0183).
//
// A plain low-pass trades jitter for lag: smooth enough to hide a shaky hand at rest and it
// drags behind every quick swerve. The One Euro filter adapts its cutoff to how fast the
// signal moves: almost no smoothing while you swing the phone (no lag), heavy smoothing while
// you hold it still (no jitter on the straights).
//
//   const f = createOneEuro({ minCutoff: 1, beta: 0.04 });
//   const smooth = f.filter(rawDeg, eventTimeMs);

const TAU = 2 * Math.PI;
const alpha = (cutoff, dt) => 1 / (1 + 1 / (TAU * cutoff * dt));

/**
 * @param {object} [o]
 * @param {number} [o.minCutoff=1] Hz at rest: lower = steadier when held still
 * @param {number} [o.beta=0.04] how fast the cutoff opens with speed (per unit/s): higher = less lag
 * @param {number} [o.dCutoff=1] Hz for the speed estimate itself
 * @param {number} [o.snap=Infinity] a jump bigger than this between samples is taken as is
 *   (no sensor jitters that far: it's a deliberate swerve, or a slow, sparse event stream)
 */
export function createOneEuro({ minCutoff = 1, beta = 0.04, dCutoff = 1, snap = Infinity } = {}) {
  let x = null, dx = 0, last = 0;
  return {
    filter(value, tMs) {
      if (x === null || !(tMs > last)) {
        // First sample, or a clock that didn't advance (duplicate event): take it as is.
        if (x === null) { x = value; last = tMs; }
        return x;
      }
      const dt = Math.min(0.25, (tMs - last) / 1000);
      last = tMs;
      if (Math.abs(value - x) > snap) { dx = (value - x) / dt; x = value; return x; }
      const d = (value - x) / dt;
      dx += alpha(dCutoff, dt) * (d - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (value - x);
      return x;
    },
    reset() { x = null; dx = 0; last = 0; },
    get value() { return x === null ? 0 : x; },
  };
}
