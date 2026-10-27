// "Fair field" (ticket 0211), pure: Settings → RIVALS picks how hard the rivals' rubber band
// pulls. CLOSE PACK (default) is today's catch-up; FAIR FIELD scales it to FAIR_FIELD, so a
// rival far behind barely pushes and one far ahead barely waits. Live rooms and the daily
// always race the close pack: a seeded race is the same race for everyone on it. Imported only
// by the lazy race-flow chunk, which sets GameState.catchUp at each race start; the rival AI
// (src/rival-ai.js fillWorld → stepRival) and the fallback driver (src/raceflow.js) read it.
export const FAIR_FIELD = 0.4;

/** Catch-up scale for a race: `rivals` is the setting, `race` { mode, daily } the race. */
export const catchUpScale = (rivals, race) =>
  rivals === 'fair' && !(race && (race.mode === 'LIVE' || race.daily)) ? FAIR_FIELD : 1;
