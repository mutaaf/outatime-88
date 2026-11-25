// Today's missions tally (ticket 0026), split from src/missions.js (0306): the title's line and
// the save record are all main needs, so they stay here while the missions themselves ride the
// race chunks. Pure and import-free: a race chunk importing src/missions.js must not pull a
// module main also imports, or the bundler splits it into an extra startup chunk.

const PER_RUN = 3; // = MISSIONS_PER_RUN in src/missions.js (a unit test holds them equal)

/** Today's tally in the save (`SaveStore.data.missions`): completed today, and the best run. */
export function missionsToday(save, day) {
  const s = save.missions;
  return s && typeof s === 'object' && s.day === day ? { done: s.done | 0, best: s.best | 0 } : { done: 0, best: 0 };
}

export function recordMissions(save, day, count) {
  const t = missionsToday(save, day);
  save.missions = { day, done: t.done + count, best: Math.max(t.best, count) };
}

export function titleMissionLine(save, day) {
  return `🎯 ${PER_RUN} MISSIONS · ${missionsToday(save, day).best}/${PER_RUN} DONE TODAY`;
}
