import { describe, it, expect } from 'vitest';
import { LEVEL_MEDALS, medalFor, nextTarget, applyRunResult, MEDALS } from '../../src/progress.js';
import { WORLD_LEVELS } from '../../src/data.js';

const fresh = () => ({ unlockedLevel: 1, progress: {} });

describe('campaign ladder (ticket 0011)', () => {
  it('every level has strictly rising bronze < silver < gold targets', () => {
    for (const lvl of WORLD_LEVELS) {
      const m = LEVEL_MEDALS[lvl.id];
      expect(m, lvl.id).toBeTruthy();
      expect(m.bronze).toBeGreaterThan(0);
      expect(m.silver).toBeGreaterThan(m.bronze);
      expect(m.gold).toBeGreaterThan(m.silver);
    }
  });

  it('medalFor respects the boundaries', () => {
    const id = WORLD_LEVELS[0].id;
    const m = LEVEL_MEDALS[id];
    expect(medalFor(id, m.bronze - 1)).toBe(null);
    expect(medalFor(id, m.bronze)).toBe('bronze');
    expect(medalFor(id, m.silver)).toBe('silver');
    expect(medalFor(id, m.gold + 99999)).toBe('gold');
    expect(MEDALS.indexOf('gold')).toBeGreaterThan(MEDALS.indexOf('bronze'));
  });

  it('nextTarget names the next medal up, or null at gold', () => {
    const id = WORLD_LEVELS[0].id;
    const m = LEVEL_MEDALS[id];
    expect(nextTarget(id, 0)).toEqual({ medal: 'bronze', score: m.bronze });
    expect(nextTarget(id, m.silver)).toEqual({ medal: 'gold', score: m.gold });
    expect(nextTarget(id, m.gold)).toBe(null);
  });

  it('best only goes up, medal only goes up', () => {
    const save = fresh();
    const lvl = WORLD_LEVELS[0];
    const m = LEVEL_MEDALS[lvl.id];
    applyRunResult(save, { levelIndex: 0, levelId: lvl.id, score: m.silver });
    const r = applyRunResult(save, { levelIndex: 0, levelId: lvl.id, score: m.bronze });
    expect(save.progress[lvl.id]).toEqual({ best: m.silver, medal: 'silver' });
    expect(r.newBest).toBe(false);
  });

  it('a bronze unlocks the next level (and never re-locks)', () => {
    const save = fresh();
    const lvl = WORLD_LEVELS[0];
    let r = applyRunResult(save, { levelIndex: 0, levelId: lvl.id, score: 1 });
    expect(save.unlockedLevel).toBe(1);
    expect(r.unlocked).toBe(null);
    r = applyRunResult(save, { levelIndex: 0, levelId: lvl.id, score: LEVEL_MEDALS[lvl.id].bronze });
    expect(save.unlockedLevel).toBe(2);
    expect(r.unlocked).toBe(1);
    save.unlockedLevel = 5; // an old save with everything open
    applyRunResult(save, { levelIndex: 0, levelId: lvl.id, score: 1 });
    expect(save.unlockedLevel).toBe(5);
  });

  it('never unlocks past the last level', () => {
    const save = { unlockedLevel: WORLD_LEVELS.length, progress: {} };
    const last = WORLD_LEVELS[WORLD_LEVELS.length - 1];
    applyRunResult(save, { levelIndex: last.index, levelId: last.id, score: LEVEL_MEDALS[last.id].gold });
    expect(save.unlockedLevel).toBe(WORLD_LEVELS.length);
  });
});
