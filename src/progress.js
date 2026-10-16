// Campaign ladder (pillar 5, ticket 0011): medal targets per level, local bests, unlocks.
// Pure functions over the save object so the rules are unit-testable; main.js persists.

export const MEDALS = ['bronze', 'silver', 'gold'];
export const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };

// Calibrated 2026-10-16 from full Playwright runs after the earned-warp pacing (ticket 0014):
// holding only the gas scored 0.8–1.6M by 150 s and the LUMEN autopilot 1.7–2.1M (races ran
// past 150 s — see ticket 0016). Bronze ≈ 30 s of decent driving; silver ≈ a sustained run;
// gold ≈ clearly beating the autopilot. Later levels ask a little more.
export const LEVEL_MEDALS = {
  LVL1_CLOCK_HOLLOW: { bronze: 250000, silver: 1000000, gold: 2500000 },
  LVL2_RED_ROCK: { bronze: 300000, silver: 1200000, gold: 3000000 },
  LVL3_TOKYO_2015: { bronze: 350000, silver: 1400000, gold: 3500000 },
  LVL4_MULHOLLAND_2088: { bronze: 400000, silver: 1600000, gold: 4000000 },
  LVL5_INFINITE_HW: { bronze: 500000, silver: 2000000, gold: 5000000 },
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
