// WARP READY cue (ticket 0112), pure: the ready state must not live in colour alone, so the race
// step plays a short rising tick the moment the meter reaches warp range. createReadyCue(min)
// returns a per-step check that is true once on the rising edge and stays quiet while the meter
// stays up; it re-arms only after the meter falls clearly below (a spent boost, a new race), so a
// meter wobbling around the line never chatters. Lives in the race-step chunk, never in main.
export const READY_REARM = 5;

export function createReadyCue(min, rearm = READY_REARM) {
  let armed = true;
  return (value) => {
    if (armed) {
      if (value < min) return false;
      armed = false;
      return true;
    }
    if (value < min - rearm) armed = true;
    return false;
  };
}
