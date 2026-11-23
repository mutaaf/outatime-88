// Frame-rate cap (ticket 0302), pure and import-free: Settings → Graphics → FRAME RATE AUTO | 30,
// saved as settings.fps ('30'; unset or junk = AUTO). The lazy graphics chunk (src/perf/gfx-boot.js)
// builds the gate; main's loop only asks `gfx.skip(timestamp)` and, on a skipped display frame, does
// nothing at all. The sim runs on a fixed 120 Hz clock (src/fixedstep.js), so the next drawn frame
// steps the time the skipped one would have: same steps per wall-second, same race.

export const FPS_CAP_MS = 1000 / 30;
/** Early slack: a frame this close to its due time is drawn (rAF timestamps sit on vsync). */
export const FPS_SLACK_MS = 4;

/** 'auto' | '30' as the panel shows it; anything but '30' is AUTO. */
export const fpsName = (v) => (String(v) === '30' ? '30' : 'auto');

/** The cap in ms for a saved value: 0 = no cap (AUTO). */
export const fpsCapMs = (v) => (fpsName(v) === '30' ? FPS_CAP_MS : 0);

/**
 * A gate for display frames: gate(now) is true when this frame should be skipped. It keeps a due
 * time that moves on by exactly one cap per drawn frame, so a 60, 90, 120 or 144 Hz screen averages
 * ~30 drawn frames a second (not every other frame), and it re-anchors after a stall or a hidden tab.
 * capMs 0 never skips. No allocation per call.
 */
export function createFrameGate(capMs) {
  let due = 0;
  if (!(capMs > 0)) return () => false;
  return (now) => {
    if (now < due - FPS_SLACK_MS) return true;
    due = due + capMs > now ? due + capMs : now + capMs;
    return false;
  };
}
