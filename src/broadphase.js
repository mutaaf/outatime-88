// Broadphase for the rigid-body world (ticket 0074). Bodies live along one long road, so a
// 1-D spatial hash on track Z finds every pair that could touch without testing all pairs:
// sort bodies into fixed-size Z cells, then only pair a body with the bodies in its own cell
// and the next one. No allocations after warm-up (arrays are reused).

export function createZHash(cellSize = 400) {
  const keys = [];      // cell index per slot
  const order = [];     // body indices sorted by cell
  let n = 0;
  let pairsTested = 0;

  return {
    cellSize,
    /** Index the bodies (an array of { worldZ, halfL }). */
    build(bodies) {
      n = bodies.length;
      for (let i = 0; i < n; i++) {
        keys[i] = Math.floor(bodies[i].worldZ / cellSize);
        order[i] = i;
      }
      order.length = n;
      // insertion sort: bodies barely move between steps, so this is ~O(n) after the first
      for (let i = 1; i < n; i++) {
        const v = order[i];
        const k = keys[v];
        let j = i - 1;
        while (j >= 0 && keys[order[j]] > k) { order[j + 1] = order[j]; j--; }
        order[j + 1] = v;
      }
    },
    /**
     * Calls fn(a, b) for every pair in the same or adjacent Z cell. Bodies longer than a
     * cell still meet their neighbours because the solver checks real extents; cellSize
     * must be ≥ the longest body (2·halfL) for no pair to be missed.
     */
    forEachPair(bodies, fn) {
      pairsTested = 0;
      for (let a = 0; a < n; a++) {
        const ia = order[a];
        const ka = keys[ia];
        for (let b = a + 1; b < n; b++) {
          const ib = order[b];
          if (keys[ib] > ka + 1) break;
          pairsTested++;
          fn(bodies[ia], bodies[ib]);
        }
      }
      return pairsTested;
    },
    get pairsTested() { return pairsTested; },
  };
}
