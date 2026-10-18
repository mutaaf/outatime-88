// Turns the simulation's track (straight-in-Z segments with a per-segment `curve`) into a
// real 3D centreline with a full road frame. The 2D renderer fakes bends by shifting each
// segment sideways by an accumulating dx; here the same curve turns the road's heading instead,
// so a bend the 2D view draws to the right also turns right in 3D. Track Z and lateral offsets
// are the simulation's own coordinates, so anything the sim places (cars, items, obstacles)
// lands on the same spot of road in both views.
//
// Sprint 4: every segment start also carries an orthonormal frame (forward, up, right), so the
// road can bank, ride a half-pipe wall, roll through a corkscrew and go all the way round a
// vertical loop (set pieces from src/setpieces.js via `segment.feature`). Pure: no three.js,
// no DOM. Endless-track: the frames live in fixed rings, so the path forgets the road far
// behind exactly as the track's segment ring does.
import { ROAD_CFG } from '../data.js';

/**
 * Boundaries the path holds (a power of two, twice the track's segment ring): the frames are
 * fixed typed-array rings indexed by `k & PATH_MASK`, so an endless road never grows them.
 */
export const PATH_RING = 2048;
const PATH_MASK = PATH_RING - 1;

/** Heading change (radians) per unit of segment `curve`, at unit scales. */
export const TURN_PER_CURVE = 1 / ROAD_CFG.segLength;

/** Road roll (radians) per unit of segment bank. */
export const BANK_ROLL = 0.6;
/** Extra half-pipe roll at the middle of a wall-ride (radians). */
export const WALL_ROLL = 0.75;

/**
 * The 2D road squashes depth (a car is ~230 units long but ~600 wide), so the 3D view
 * stretches track Z by `zScale` and narrows the road by `xScale` to get believable
 * proportions. The turn rate is scaled so a bend still moves the road sideways by the same
 * number of road widths as the 2D view draws. `yScale` exaggerates hills.
 */
export function createTrackPath({ zScale = 1, xScale = 1, yScale = 1 } = {}) {
  const turn = TURN_PER_CURVE * xScale / zScale;
  const halfW = ROAD_CFG.roadWidth * xScale;
  const ring = () => new Float64Array(PATH_RING);
  const p = {
    zScale, xScale, yScale,
    source: null, // what this path was built from: a segments array, or the track's `run` token
    count: 0,     // segments integrated so far (absolute: boundaries first..count exist)
    first: 0,     // the boundary the path started from
    mask: PATH_MASK, // boundary k lives at [k & mask] in every array below (a fixed ring)
    // Flat-road integration: start (x, z) and heading of every segment boundary.
    x: ring(), z: ring(), h: ring(),
    // The full frame at every segment start: centre (cx, cy, cz), forward f, up u, right r.
    cx: ring(), cy: ring(), cz: ring(),
    fx: ring(), fy: ring(), fz: ring(), ux: ring(), uy: ring(), uz: ring(), rx: ring(), ry: ring(), rz: ring(),
    // The offset the set pieces add on top of the flat road (a loop's exit sits beside its entry).
    shiftX: 0, shiftZ: 0,
    loop: null, // { f, x0, y0, z0, h0 } while integrating through a loop

    /** Oldest boundary still held (the ring forgets the road far behind). */
    get base() { return Math.max(this.first, this.count - PATH_RING + 2); },

    /**
     * Extend (or rebuild, after a new race restarted the road) to cover `src`: either a plain
     * array of segments or the track container (src/track.js: `seg(i)`, `end`, `run`).
     * Incremental and allocation-free: only new segments are integrated.
     */
    sync(src) {
      const isArr = Array.isArray(src);
      const key = isArr ? src : src.run;
      const end = isArr ? src.length : src.end;
      const M = PATH_MASK;
      // A fresh road, or one that moved on so far that its oldest held segment is past where
      // this path stopped (a long pause, a debug jump): start again from the oldest held one.
      if (key !== this.source || end < this.count || (!isArr && this.count < src.start)) {
        // Start at the oldest segment the source still holds (0, unless a long-running road
        // has already recycled its start): positions are relative, so any origin works.
        const first = isArr ? 0 : src.start;
        const a = first & M;
        this.source = key;
        this.first = first;
        this.count = first;
        this.x[a] = 0; this.z[a] = 0; this.h[a] = 0;
        this.shiftX = 0; this.shiftZ = 0; this.loop = null;
        const s0 = segOf(src, isArr, first);
        if (end > first && s0) frameAt(this, first, s0, 0, first ? s0.p1.world.y * yScale : 0, 0, 0, first * ROAD_CFG.segLength, false);
      } else if (this.count > 0 && end > this.count) {
        // The old end boundary was only a peek; now its segment exists, settle it for real.
        const k = this.count;
        const sk = segOf(src, isArr, k);
        frameAt(this, k, sk, this.x[k & M], sk.p1.world.y * yScale, this.z[k & M], this.h[k & M], k * ROAD_CFG.segLength, false);
      }
      const L = ROAD_CFG.segLength * zScale;
      for (let i = this.count; i < end; i++) {
        const a = i & M, b = (i + 1) & M;
        const h = this.h[a];
        const s = segOf(src, isArr, i);
        this.x[b] = this.x[a] + Math.sin(h) * L;
        this.z[b] = this.z[a] + Math.cos(h) * L;
        this.h[b] = h + s.curve * turn;
        const next = i + 1 < end ? segOf(src, isArr, i + 1) : null;
        // The far end of the road has no segment yet: peek with the last one (no state change).
        frameAt(this, i + 1, next || s, this.x[b], s.p2.world.y * yScale, this.z[b], this.h[b], (i + 1) * ROAD_CFG.segLength, !next);
      }
      this.count = end;
    },

    /**
     * World pose of the road at (simulation) track Z `trackZ`, `offset` road half-widths to
     * the right of the centreline, in scaled 3D units. Writes { x, y, z, heading } plus the
     * road frame (fx..fz forward, ux..uz up, rx..rz right) into `out` (no allocation).
     * Past either end of what the ring holds it clamps to the nearest boundary.
     */
    at(trackZ, offset, out) {
      const Ls = ROAD_CFG.segLength;
      const n = this.count;
      if (n <= this.first) {
        out.x = offset * halfW; out.y = 0; out.z = trackZ * zScale; out.heading = 0;
        out.fx = 0; out.fy = 0; out.fz = 1; out.ux = 0; out.uy = 1; out.uz = 0; out.rx = 1; out.ry = 0; out.rz = 0;
        return out;
      }
      let i = Math.floor(trackZ / Ls);
      let t = trackZ / Ls - i;
      const lo = this.base;
      if (i < lo) { i = lo; t = 0; }
      if (i >= n) { i = n - 1; t = 1; }
      const ia = i & PATH_MASK, ja = (i + 1) & PATH_MASK;
      const lerp = (arr) => arr[ia] + (arr[ja] - arr[ia]) * t;
      out.heading = lerp(this.h);
      let ux = lerp(this.ux), uy = lerp(this.uy), uz = lerp(this.uz);
      let rx = lerp(this.rx), ry = lerp(this.ry), rz = lerp(this.rz);
      let fx = lerp(this.fx), fy = lerp(this.fy), fz = lerp(this.fz);
      const nu = Math.hypot(ux, uy, uz) || 1, nr = Math.hypot(rx, ry, rz) || 1, nf = Math.hypot(fx, fy, fz) || 1;
      ux /= nu; uy /= nu; uz /= nu; rx /= nr; ry /= nr; rz /= nr; fx /= nf; fy /= nf; fz /= nf;
      const lat = offset * halfW;
      out.x = lerp(this.cx) + rx * lat;
      out.y = lerp(this.cy) + ry * lat;
      out.z = lerp(this.cz) + rz * lat;
      out.fx = fx; out.fy = fy; out.fz = fz; out.ux = ux; out.uy = uy; out.uz = uz; out.rx = rx; out.ry = ry; out.rz = rz;
      return out;
    },
  };
  return p;

  /**
   * Fill the frame at segment boundary k (the start of `seg`): flat road position (x, y, z,
   * heading h) shaped by the segment's bank and any set piece it belongs to.
   */
  function frameAt(P, k, seg, x, y, z, h, zSim, peek) {
    const sh = Math.sin(h), ch = Math.cos(h);
    // Flat frame: forward along the heading, up is up, right is the road's right.
    let fx = sh, fy = 0, fz = ch;
    let ux = 0, uy = 1, uz = 0;
    let rx = ch, ry = 0, rz = -sh;
    let shiftX = P.shiftX, shiftZ = P.shiftZ, loop = P.loop;
    let cx = x + shiftX, cy = y, cz = z + shiftZ;
    const f = seg && seg.feature ? seg.feature : null;
    let roll = (seg && seg.bank ? seg.bank : 0) * BANK_ROLL;
    // Leaving a loop: its exit sits beside its entry and level with it, not 2πR further on.
    if (loop && f !== loop.f) {
      const s0 = Math.sin(loop.h0), c0 = Math.cos(loop.h0);
      const shift = loopShift(halfW), adv = loop.f.length * zScale;
      shiftX += c0 * shift - s0 * adv;
      shiftZ += -s0 * shift - c0 * adv;
      cx = x + shiftX; cz = z + shiftZ;
      loop = null;
    }
    if (f && f.kind === 'LOOP') {
      if (!loop) loop = { f, x: cx, y: cy, z: cz, h0: h };
      const L0 = loop;
      const th = 2 * Math.PI * Math.max(0, Math.min(1, (zSim - f.z0) / f.length));
      const R = (f.length / (2 * Math.PI)) * zScale;
      const s0 = Math.sin(L0.h0), c0 = Math.cos(L0.h0);
      const shift = loopShift(halfW) * (th / (2 * Math.PI));
      // Around a vertical circle in the plane of the entry heading, drifting sideways.
      const fwd = R * Math.sin(th), upw = R * (1 - Math.cos(th));
      cx = L0.x + s0 * fwd + c0 * shift;
      cz = L0.z + c0 * fwd - s0 * shift;
      cy = L0.y + upw;
      fx = s0 * Math.cos(th); fy = Math.sin(th); fz = c0 * Math.cos(th);
      ux = -s0 * Math.sin(th); uy = Math.cos(th); uz = -c0 * Math.sin(th);
      rx = c0; ry = 0; rz = -s0;
      roll = 0;
    } else if (f && f.kind === 'CORKSCREW') {
      const t = Math.max(0, Math.min(1, (zSim - f.z0) / f.length));
      const phi = 2 * Math.PI * t * (f.dir || 1);
      roll += phi;
      // The centre rides a helix round the roll axis, so the car stays on the tube's inside.
      const Rc = halfW * 0.9;
      const ru = Rc * (1 - Math.cos(phi)), rr = -Rc * Math.sin(phi);
      cx += rx * rr; cz += rz * rr; cy += ru;
    } else if (f && f.kind === 'WALLRIDE') {
      const t = Math.max(0, Math.min(1, (zSim - f.z0) / f.length));
      roll += (f.dir || 1) * WALL_ROLL * Math.sin(Math.PI * t);
    }
    if (roll !== 0) {
      // Roll up/right about forward: + rolls the road's right side down (leans into a right-hander).
      const c = Math.cos(roll), s = Math.sin(roll);
      const nux = ux * c + rx * s, nuy = uy * c + ry * s, nuz = uz * c + rz * s;
      const nrx = rx * c - ux * s, nry = ry * c - uy * s, nrz = rz * c - uz * s;
      ux = nux; uy = nuy; uz = nuz; rx = nrx; ry = nry; rz = nrz;
    }
    if (!peek) { P.shiftX = shiftX; P.shiftZ = shiftZ; P.loop = loop; }
    k &= PATH_MASK;
    P.cx[k] = cx; P.cy[k] = cy; P.cz[k] = cz;
    P.fx[k] = fx; P.fy[k] = fy; P.fz[k] = fz;
    P.ux[k] = ux; P.uy[k] = uy; P.uz[k] = uz;
    P.rx[k] = rx; P.ry[k] = ry; P.rz[k] = rz;
  }
}

/** Segment `i` of a plain array or of the track container (no closure per sync). */
function segOf(src, isArr, i) {
  return isArr ? src[i] : src.seg(i);
}

/** How far sideways a loop's exit sits from its entry (3D units): just over a road width. */
export function loopShift(halfW) {
  return halfW * 2.3;
}
