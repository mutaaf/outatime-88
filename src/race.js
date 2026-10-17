// Race shape (ticket 0016): arcade runs must end. Every time bonus (warp, checkpoint,
// shortcut) is worth 25% less than the one before, so bonuses form a convergent series, and
// a hard cap per level guarantees the finish. The last stretch is announced once.
// Pure and dt-driven so the rules are unit-testable; main.js owns HUD and announcements.

export const RACE = {
  startClock: 60,      // seconds on the clock at the green light (60 since 0051: the finish line ends a
                       // race; the clock is the backstop for someone who stops racing)
  clockCap: 60,        // the clock never shows more than this
  decay: 0.75,         // each bonus is worth this fraction of the previous one
  finalStretch: 20,    // seconds before the hard cap when "FINAL STRETCH" fires
};

/** Hard cap on an arcade run: ~100 s on level 1, a little longer on later levels. */
export const runCapFor = (levelIndex) => 100 + 10 * Math.max(0, levelIndex | 0);

export function createRaceClock({ levelIndex = 0 } = {}) {
  const cap = runCapFor(levelIndex);
  let timeLeft = RACE.startClock;
  let elapsed = 0;
  let bonuses = 0;
  let finalAnnounced = false;
  const room = () => Math.max(0, cap - elapsed);

  return {
    get timeLeft() { return timeLeft; },
    get elapsed() { return elapsed; },
    get cap() { return cap; },
    /** Grants a decayed bonus; returns the seconds actually added (for the announcement). */
    extend(baseSeconds) {
      const grant = baseSeconds * RACE.decay ** bonuses;
      bonuses++;
      const before = timeLeft;
      timeLeft = Math.min(RACE.clockCap, timeLeft + grant, room());
      return Math.max(0, Math.round((timeLeft - before) * 10) / 10);
    },
    /** Advances the clock. Returns 'final' once when the last stretch starts, 'over' at zero. */
    tick(dt) {
      elapsed += dt;
      timeLeft = Math.min(timeLeft - dt, room());
      if (timeLeft <= 0) { timeLeft = 0; return 'over'; }
      if (!finalAnnounced && Math.min(timeLeft, room()) <= RACE.finalStretch && elapsed > 5) {
        finalAnnounced = true;
        return 'final';
      }
      return null;
    },
  };
}
