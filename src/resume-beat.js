// Resume beat (ticket 0231), pure: a solo race back from PAUSED holds still for three short beats
// (3 → 2 → 1, 0.3 s each) so the player's hands are back on the controls before traffic moves.
// The race step calls tick() once per frame with the wall-clock frame time; the sim does not step
// while it is active. One reused result object, no per-frame allocation. Race-step chunk only.
export const RESUME_BEATS = 3;
export const RESUME_BEAT_S = 0.3;
const MAX_FRAME_S = 0.1; // one long frame (a hitch, a backgrounded tab) never skips the beat

export function createResumeBeat(beats = RESUME_BEATS, beatS = RESUME_BEAT_S) {
  const out = { active: false, n: 0 };
  let t = -1; // seconds into the beat; < 0 = no beat
  return {
    /** A race just left PAUSED: (re)start from the first number. */
    start() { t = 0; },
    /** Drop the beat (the race stopped, quit, paused again). */
    stop() { t = -1; },
    /** Advance by one frame's seconds; returns { active, n } (n = the number to show, 0 = none). */
    tick(frameS) {
      if (t >= 0 && Number.isFinite(frameS) && frameS > 0) t += Math.min(frameS, MAX_FRAME_S);
      if (t >= beats * beatS) t = -1;
      out.active = t >= 0;
      out.n = out.active ? beats - Math.floor(t / beatS) : 0;
      return out;
    },
  };
}
