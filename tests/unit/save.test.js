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

  it('loads a real old-shape save and migrates the renamed livery id', async () => {
    // Shape written by the pre-0001 build: every field present, legacy livery id.
    const oldSave = {
      bestScore: 31337, fluxCoins: 990, unlockedLevel: 5, selectedLevel: 3,
      underglow: '#d946ef', livery: 'STARK_MK88',
      upgrades: { engine: 3, tires: 2, flux: 4, hover: 1 },
      tiltSensitivity: 1.4, muted: true, volume: 0.5,
    };
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(oldSave));
    const { SaveStore } = await import('../../src/save.js');
    const { LIVERY_OPTIONS } = await import('../../src/data.js');
    SaveStore.load();
    expect(SaveStore.data).toEqual({ ...oldSave, livery: 'ARC_MK88' });
    expect(LIVERY_OPTIONS.map((l) => l.id)).toContain(SaveStore.data.livery);
  });

  it('keeps every unrenamed livery id as saved', async () => {
    const { LIVERY_OPTIONS } = await import('../../src/data.js');
    for (const { id } of LIVERY_OPTIONS) {
      storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ livery: id, selectedLevel: 2 }));
      vi.resetModules();
      const { SaveStore } = await import('../../src/save.js');
      SaveStore.load();
      expect(SaveStore.data.livery).toBe(id);
      expect(SaveStore.data.selectedLevel).toBe(2);
    }
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
