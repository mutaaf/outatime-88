import { describe, it, expect } from 'vitest';
import { swapSave, mergeServerBests } from '../../src/racer-saves.js';

describe('per-racer saves', () => {
  it('normalises the swapped-in save through the store before anything draws with it', () => {
    let loads = 0;
    const store = { data: { initials: 'CLD' }, save() {}, load() { loads++; this.data.garage ??= { paint: {} }; } };
    swapSave(store, 'aaaaaaaaaaaa', 'bbbbbbbbbbbb', () => ({ initials: '', garage: null }));
    expect(loads).toBe(1);
    expect(store.data.garage).toEqual({ paint: {} });
  });
  it('folds server bests into medals and unlocks, never lowering anything', () => {
    const levels = [{ id: 'LVL1_CLOCK_HOLLOW' }, { id: 'LVL2_RED_ROCK' }];
    const save = { bestScore: 5000, progress: { LVL1_CLOCK_HOLLOW: { best: 5000, medal: null } }, unlockedLevel: 1 };
    expect(mergeServerBests(save, [{ mode: 'ARCADE', level: 0, best: 400000 }, { mode: 'DAILY', level: 1, best: 9e6 }], levels)).toBe(true);
    expect(save.bestScore).toBe(400000);
    expect(save.progress.LVL1_CLOCK_HOLLOW).toEqual({ best: 400000, medal: 'bronze' });
    expect(save.unlockedLevel).toBe(2);
    expect(mergeServerBests(save, [{ mode: 'ARCADE', level: 0, best: 100 }], levels)).toBe(false);
  });
});
