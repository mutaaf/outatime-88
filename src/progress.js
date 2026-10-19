// Campaign ladder (pillar 5, ticket 0011): medal targets per level, local bests, unlocks.
// Pure functions over the save object so the rules are unit-testable; main.js persists.

export const MEDALS = ['bronze', 'silver', 'gold'];
export const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };

// Recalibrated 2026-10-19 (docs/BALANCE.md) after the combo fix (#102) and the handling work
// lifted every run's score: the balance harness's four bots (tests/balance, ten races each per
// level) now all win in ~50–60 s and score within a few percent of each other (level 1 median
// 1.45M, best 1.52M), so the old bronze and silver were free. Bronze ≈ 60% of the bots' typical
// run; silver ≈ matching it (about half the bots' runs); gold ≈ a quarter past their best.
export const LEVEL_MEDALS = {
  LVL1_CLOCK_HOLLOW: { bronze: 850000, silver: 1450000, gold: 1900000 },
  LVL2_RED_ROCK: { bronze: 1000000, silver: 1700000, gold: 2200000 },
  LVL3_TOKYO_2015: { bronze: 1050000, silver: 1720000, gold: 2250000 },
  LVL4_MULHOLLAND_2088: { bronze: 1100000, silver: 1720000, gold: 2300000 },
  LVL5_INFINITE_HW: { bronze: 1150000, silver: 1760000, gold: 2350000 },
  LVL6_LOW_ORBIT: { bronze: 1200000, silver: 2030000, gold: 2650000 }, // a step past level 5 (ticket 0155)
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
