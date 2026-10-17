// Turns the simulation's track (straight-in-Z segments with a per-segment `curve`) into a
// real 3D centreline. The 2D renderer fakes bends by shifting each segment sideways by an
// accumulating dx; here the same curve turns the road's heading instead, so a bend the
// 2D view draws to the right also turns right in 3D. Track Z and lateral offsets are the
// simulation's own coordinates, so anything the sim places (cars, items, obstacles) lands
// on the same spot of road in both views. Pure: no three.js, no DOM.
import { ROAD_CFG } from '../data.js';

/** Heading change (radians) per unit of segment `curve`, at unit scales. */
export const TURN_PER_CURVE = 1 / ROAD_CFG.segLength;

/**
 * The 2D road squashes depth (a car is ~230 units long but ~600 wide), so the 3D view
 * stretches track Z by `zScale` and narrows the road by `xScale` to get believable
 * proportions. The turn rate is scaled so a bend still moves the road sideways by the same
 * number of road widths as the 2D view draws. `yScale` exaggerates hills.
 */
export function createTrackPath({ zScale = 1, xScale = 1, yScale = 1 } = {}) {
  const turn = TURN_PER_CURVE * xScale / zScale;
  return {
    zScale, xScale, yScale,
    source: null, // the segments array this path was built from
    count: 0,     // segments integrated so far
    // Start point (x, z) and heading of every segment, plus the end of the last one.
    x: [0], z: [0], h: [0],

    /** Extend (or rebuild, after a new race replaced the array) to cover `segments`. */
    sync(segments) {
      if (segments !== this.source || segments.length < this.count) {
        this.source = segments;
        this.count = 0;
        this.x.length = 1; this.z.length = 1; this.h.length = 1;
        this.x[0] = 0; this.z[0] = 0; this.h[0] = 0;
      }
      const L = ROAD_CFG.segLength * zScale;
      for (let i = this.count; i < segments.length; i++) {
        const h = this.h[i];
        this.x[i + 1] = this.x[i] + Math.sin(h) * L;
        this.z[i + 1] = this.z[i] + Math.cos(h) * L;
        this.h[i + 1] = h + segments[i].curve * turn;
      }
      this.count = segments.length;
    },

    /**
     * World pose of the road at (simulation) track Z `trackZ`, `offset` road half-widths
     * to the right of the centreline, in scaled 3D units. Writes { x, y, z, heading } into `out` (no allocation).
     */
    at(trackZ, offset, out) {
      const L = ROAD_CFG.segLength;
      const n = this.count;
      if (n === 0) { out.x = 0; out.y = 0; out.z = trackZ; out.heading = 0; return out; }
      let i = Math.floor(trackZ / L);
      let t = trackZ / L - i;
      if (i < 0) { i = 0; t = 0; }
      if (i >= n) { i = n - 1; t = 1; }
      const seg = this.source[i];
      const h = this.h[i] + (this.h[i + 1] - this.h[i]) * t;
      const cx = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
      const cz = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
      const lateral = offset * ROAD_CFG.roadWidth * xScale;
      out.x = cx + Math.cos(h) * lateral;
      out.z = cz - Math.sin(h) * lateral;
      out.y = (seg.p1.world.y + (seg.p2.world.y - seg.p1.world.y) * t) * yScale;
      out.heading = h;
      return out;
    },
  };
}
