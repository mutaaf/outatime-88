// Campaign ladder (pillar 5, ticket 0011): medal targets per level, local bests, unlocks.
// Pure functions over the save object so the rules are unit-testable; main.js persists.

export const MEDALS = ['bronze', 'silver', 'gold'];
export const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };

// Recalibrated 2026-10-17 after races got an end (ticket 0016: decaying time bonuses + a
// 100–140 s cap). Ten Playwright runs per style, levels 1–5, 1280x720, five browsers at a
// time: runs now finish in 77–90 s; holding only the gas scored 0.38–1.04M (median ~0.57M),
// the LUMEN autopilot 0.15–1.14M (median ~0.57M). Bronze ≈ a decent run; silver ≈ beating
// the bots' typical run; gold ≈ clearly beating their best. Later levels ask a little more.
export const LEVEL_MEDALS = {
  LVL1_CLOCK_HOLLOW: { bronze: 300000, silver: 900000, gold: 1800000 },
  LVL2_RED_ROCK: { bronze: 330000, silver: 1000000, gold: 2000000 },
  LVL3_TOKYO_2015: { bronze: 360000, silver: 1100000, gold: 2200000 },
  LVL4_MULHOLLAND_2088: { bronze: 400000, silver: 1200000, gold: 2400000 },
  LVL5_INFINITE_HW: { bronze: 450000, silver: 1350000, gold: 2700000 },
  LVL6_LOW_ORBIT: { bronze: 480000, silver: 1450000, gold: 2900000 }, // a step past level 5 (ticket 0155)
};

export function medalFor(levelId, score) {
  const m = LEVEL_MEDALS[levelId];
  if (!m) return null;
  if (score >= m.gold) return 'gold';
  if (score >= m.silver) return 'silver';
  if (score >= m.bronze) return 'bronze';
  return null;
}

/** The next medal above this score, e.g. { medal: 'silver', score: 90000 }, or null at gold. */
export function nextTarget(levelId, score) {
  const m = LEVEL_MEDALS[levelId];
  if (!m) return null;
  for (const medal of MEDALS) if (score < m[medal]) return { medal, score: m[medal] };
  return null;
}

const rank = (medal) => (medal ? MEDALS.indexOf(medal) : -1);

/**
 * Fold one finished run into the save. Mutates save.progress and save.unlockedLevel.
 * Returns { medal, newBest, improvedMedal, unlocked } where unlocked is the index of a
 * level that just opened (or null).
 */
export function applyRunResult(save, { levelIndex, levelId, score }, levelCount = Object.keys(LEVEL_MEDALS).length) {
  if (!save.progress) save.progress = {};
  const prev = save.progress[levelId] || { best: 0, medal: null };
  const medal = medalFor(levelId, score);
  const newBest = score > prev.best;
  const improvedMedal = rank(medal) > rank(prev.medal);
  save.progress[levelId] = {
    best: Math.max(prev.best, score),
    medal: improvedMedal ? medal : prev.medal,
  };
  let unlocked = null;
  if (medal) {
    const want = Math.min(levelCount, levelIndex + 2); // unlockedLevel counts open levels
    if (want > (save.unlockedLevel || 1)) {
      save.unlockedLevel = want;
      unlocked = want - 1;
    }
  }
  return { medal, newBest, improvedMedal, unlocked };
}
