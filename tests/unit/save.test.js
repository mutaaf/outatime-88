import { describe, it, expect, beforeEach, vi } from 'vitest';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

describe('SaveStore', () => {
  let storage;
  beforeEach(() => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('keeps the save key stable (save compatibility invariant)', async () => {
    const { SaveStore } = await import('../../src/save.js');
    expect(SaveStore.key).toBe('outatime_cruisn_88_save_v2');
  });

  it('round-trips data through localStorage', async () => {
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.data.bestScore = 4242;
    SaveStore.data.upgrades.engine = 3;
    SaveStore.save();
    vi.resetModules();
    const { SaveStore: fresh } = await import('../../src/save.js');
    fresh.load();
    expect(fresh.data.bestScore).toBe(4242);
    expect(fresh.data.upgrades.engine).toBe(3);
  });

  it('merges new defaults over an old save that lacks fields', async () => {
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 7, upgrades: { tires: 2 } }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.bestScore).toBe(7);
    expect(SaveStore.data.fluxCoins).toBe(250);
    expect(SaveStore.data.upgrades).toEqual({ engine: 1, tires: 2, flux: 1, hover: 1 });
  });

  it('survives corrupt JSON and a throwing storage', async () => {
    storage.setItem('outatime_cruisn_88_save_v2', '{not json');
    const { SaveStore } = await import('../../src/save.js');
    expect(() => SaveStore.load()).not.toThrow();
    expect(SaveStore.data.bestScore).toBe(0);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    expect(() => SaveStore.load()).not.toThrow();
    expect(() => SaveStore.save()).not.toThrow();
  });
});
