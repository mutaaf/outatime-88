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
    const { SETTINGS_DEFAULTS } = await import('../../src/settings.js');
    SaveStore.load();
    // new defaults: progress (0011), onboarded (0022), initials (0025), settings (0050), renderMode (0040), liveName (0060), controls (0061), missions (0026)
    const { garage, career, ...rest } = SaveStore.data;
    expect(rest).toEqual({ ...oldSave, livery: 'ARC_MK88', progress: {}, onboarded: false, initials: '', settings: { ...SETTINGS_DEFAULTS }, renderMode: 'auto', liveName: '', controls: {}, missions: null });
    // Garage + career (0071): an old save drives a starter car with zeroed counters.
    expect(garage.owned).toEqual(['FLUX_COUPE_88', 'PASS_RUNNER_86']);
    expect(garage.selected).toBe('FLUX_COUPE_88');
    expect(career).toMatchObject({ races: 0, wins: 0, takedowns: 0 });
    expect(LIVERY_OPTIONS.map((l) => l.id)).toContain(SaveStore.data.livery);
  });

  it('an old save keeps the cars its recorded medals already earned (0071)', async () => {
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      bestScore: 2_600_000,
      progress: { LVL1_CLOCK_HOLLOW: { best: 950_000, medal: 'silver' }, LVL4_MULHOLLAND_2088: { best: 2_500_000, medal: 'gold' } },
    }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.garage.owned).toEqual(expect.arrayContaining(['FLUX_COUPE_88', 'PASS_RUNNER_86', 'BLUE_KESTREL', 'ARC_ROADSTER_88']));
    expect(SaveStore.data.garage.owned).not.toContain('GRID_CYCLE');
  });

  it('a fresh racer save has a drivable garage before any reload (0071 + 0090)', async () => {
    const { freshSaveData } = await import('../../src/save.js');
    const d = freshSaveData();
    expect(d.garage.owned).toEqual(['FLUX_COUPE_88', 'PASS_RUNNER_86']);
    expect(d.garage.paint).toEqual({});
    expect(d.career.races).toBe(0);
  });

  it('keeps saved touch controls (the touch kit fills in new fields when it loads)', async () => {
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { preset: 'claw', sensitivity: 1.3, layouts: { 'phone-portrait': { items: { boost: { fx: 0.5, fy: 0.9, s: 1, o: 1, h: 0 } } } } } }));
    const { SaveStore } = await import('../../src/save.js');
    const { normalizeControls } = await import('../../src/touch/settings.js');
    SaveStore.load();
    expect(normalizeControls(SaveStore.data.controls)).toMatchObject({ preset: 'claw', sensitivity: 1.3, autoAccel: true, haptics: true });
    expect(SaveStore.data.controls.layouts['phone-portrait'].items.boost.fx).toBe(0.5);
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

  it('migrates an old-shape save (no progress, all levels open) without losing anything', async () => {
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      bestScore: 123456, fluxCoins: 900, unlockedLevel: 5, selectedLevel: 3, underglow: '#ff5500',
      livery: 'STAINLESS', upgrades: { engine: 2, tires: 1, flux: 3, hover: 1 }, muted: true, volume: 0.4,
    }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.unlockedLevel).toBe(5);
    expect(SaveStore.data.progress).toEqual({});
    expect(SaveStore.data.bestScore).toBe(123456);
    expect(SaveStore.data.upgrades.flux).toBe(3);
  });

  it('a brand-new player starts with only the first level open', async () => {
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.unlockedLevel).toBe(1);
    expect(SaveStore.data.progress).toEqual({});
  });
});
