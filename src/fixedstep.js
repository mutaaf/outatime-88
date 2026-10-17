// Fixed-timestep clock (ticket 0070). The simulation always advances in equal steps, so a
// race plays the same at 30, 60 or 144 fps; the renderer blends the last two steps by
// `alpha` so motion stays smooth when the display rate and the step rate don't divide.
//
//   const clock = createFixedStep({ hz: 120 });
//   const n = clock.advance(frameSeconds);   // run updateGame(clock.step) n times
//   draw(clock.alpha);                       // 0..1 between the previous and current step

export const SIM_HZ = 120;

/**
 * @param {object} [opts]
 * @param {number} [opts.hz=120] simulation steps per second
 * @param {number} [opts.maxFrame=0.1] longest frame (s) the sim catches up on; slower
 *   frames run in slow motion instead of spiralling (10 fps and up stays real-time)
 */
export function createFixedStep({ hz = SIM_HZ, maxFrame = 0.1 } = {}) {
  const step = 1 / hz;
  // A hair of tolerance so 1/60 s frames give exactly 2 steps despite float rounding.
  const eps = step * 1e-6;
  let acc = 0;
  return {
    step,
    /** Adds one frame's wall time; returns how many steps to run now. */
    advance(frameSeconds) {
      const dt = Number.isFinite(frameSeconds) ? Math.min(maxFrame, Math.max(0, frameSeconds)) : 0;
      acc += dt;
      let n = 0;
      while (acc + eps >= step) {
        acc -= step;
        n++;
      }
      if (acc < 0) acc = 0;
      return n;
    },
    /** How far (0..1) the display is between the previous step and the current one. */
    get alpha() {
      return Math.min(1, acc / step);
    },
    reset() {
      acc = 0;
    },
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
