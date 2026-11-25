// Run missions (ticket 0026): every run gets three distinct street contracts you can see —
// one line on the title, completions through the announcer, the three on the results card.
// Pure: the run's RNG picks them (a daily run's is seeded, so everyone gets the same three).
// Race-only (0306): the race chunks and the results card import it, never main. Today's tally
// (the title's line, the save record) is src/mission-day.js, which main keeps.

export const MISSIONS_PER_RUN = 3;

export const MISSIONS = [
  { type: 'TAKEDOWN', target: 2, reward: 150, label: '2 TAKEDOWNS' },
  { type: 'DRIFT_PTS', target: 1500, reward: 180, label: '1,500 DRIFT POINTS' },
  { type: 'WARP_88', target: 1, reward: 200, label: 'HIT 88 MPH' },
  { type: 'NEAR_MISS', target: 3, reward: 160, label: '3 NEAR MISSES' },
  { type: 'SLIPSTREAM', target: 100, reward: 175, label: 'FILL SLIPSTREAM' },
];

/** Three distinct missions, each with its own progress. `rand` returns floats in [0, 1). */
export function pickMissions(rand) {
  const pool = MISSIONS.slice();
  const run = [];
  while (run.length < MISSIONS_PER_RUN) {
    const t = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    run.push({ type: t.type, target: t.target, reward: t.reward, label: t.label, progress: 0, done: false });
  }
  return run;
}

/** Adds progress to the run's mission of this type; returns it the moment it completes. */
export function advanceMission(run, type, amount) {
  if (!run) return null;
  for (let i = 0; i < run.length; i++) { // runs every sim step (slipstream): no iterator
    const m = run[i];
    if (m.type !== type || m.done) continue;
    m.progress = Math.min(m.target, m.progress + amount);
    if (m.progress < m.target) return null;
    m.done = true;
    return m;
  }
  return null;
}

export const missionsDone = (run) => (run ? run.filter((m) => m.done).length : 0);

/** Results line: "✓ 2 TAKEDOWNS +150 ⚡" once done, "2 TAKEDOWNS 1/2" before. */
export function missionLine(m) {
  return m.done ? `✓ ${m.label} +${m.reward} ⚡` : `${m.label} ${Math.floor(m.progress)}/${m.target}`;
}
