// Daily challenge (ticket 0023): one road, one twist, the same for everyone on a UTC day, with
// its own leaderboard. The date picks the level and a modifier; a seeded RNG drives traffic
// so every player meets the same rivals in the same places.

export const MODIFIERS = [
  { id: 'HEAT_WAVE', name: 'HEAT WAVE', desc: 'Police heat starts high' },
  { id: 'GLASS_CHASSIS', name: 'GLASS CHASSIS', desc: 'Half HP — every hit counts' },
  { id: 'FLUX_STORM', name: 'FLUX STORM', desc: 'Flux starts at 60% — warp early' },
  { id: 'RUSH_HOUR', name: 'RUSH HOUR', desc: 'Half again as much traffic' },
];

/** Small, fast, well-distributed 32-bit PRNG; returns floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the date string: a stable seed per UTC day. */
export function seedFor(day) {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Levels the daily draws from. Pinned to the first five (not WORLD_LEVELS.length) so adding a
 * level never changes which track today's daily is mid-day (ticket 0155).
 */
export const DAILY_LEVELS = 5;

/** Everything about today's challenge, derived only from the date. */
export function dailySpec(day, levelCount = DAILY_LEVELS) {
  const seed = seedFor(day);
  const r = mulberry32(seed);
  const levelIndex = Math.floor(r() * levelCount);
  const modifier = MODIFIERS[Math.floor(r() * MODIFIERS.length)];
  return { day, seed, levelIndex, modifier };
}
