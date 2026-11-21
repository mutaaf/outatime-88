// Save backup code (ticket 0296): a round trip reproduces the save, any damaged or foreign code is
// refused before it touches storage, and a restore writes only the save key.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeSave, decodeSave, describeSave, restoreSave, REASON_TEXT, CODE_VERSION } from '../../src/save-backup.js';

const KEY = 'outatime_cruisn_88_save_v2';
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

/** A save as a real player's would look after a few sessions. */
async function playedSave() {
  const { SaveStore } = await import('../../src/save.js');
  SaveStore.load();
  const d = SaveStore.data;
  d.fluxCoins = 12345;
  d.bestScore = 987654;
  d.initials = 'ÅÉZ'; // non-ASCII survives (base64 of UTF-8, not of UTF-16)
  d.garage.owned.push('BULLDOG_VAN');
  d.garage.paint = { FLUX_COUPE_88: '#ff00aa' };
  d.career.races = 42; d.career.wins = 7;
  d.progress = { 0: { medal: 'gold', bestTime: 61.25 }, 3: { medal: 'bronze', bestTime: 99.5 } };
  d.bestLaps = { 0: [20.1, 19.8, 20.4] };
  d.settings.hud = 'large'; d.settings.difficulty = 'hard'; d.settings.units = 'kmh';
  d.endless = { bestDistance: 4321, bestTier: 3, runs: 9 };
  const { grantEarnedCars } = await import('../../src/cars.js');
  grantEarnedCars(d); // what the medals above earn, as load() would grant on the next boot
  return JSON.parse(JSON.stringify(d));
}

describe('save backup code', () => {
  let storage;
  beforeEach(() => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('round trip: export then restore into an empty save reproduces garage, career, bests and settings', async () => {
    const data = await playedSave();
    const code = encodeSave(data);
    expect(code).toMatch(new RegExp(`^OT88\\.${CODE_VERSION}\\.[A-Za-z0-9_-]+\\.[0-9a-f]{8}$`));

    // A brand-new device: nothing saved.
    vi.resetModules();
    storage._m.clear();
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.fluxCoins).toBe(250);
    const r = decodeSave(code);
    expect(r.ok).toBe(true);
    const reload = vi.fn();
    expect(restoreSave(SaveStore, r.data, reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    // What the next page load sees.
    vi.resetModules();
    const { SaveStore: next } = await import('../../src/save.js');
    next.load();
    for (const k of ['fluxCoins', 'bestScore', 'initials', 'garage', 'career', 'progress', 'bestLaps', 'settings', 'endless']) {
      expect(next.data[k], k).toEqual(data[k]);
    }
    // The in-memory save was rebuilt from the code too, so a stray save() before the reload is harmless.
    expect(SaveStore.data.fluxCoins).toBe(12345);
    SaveStore.save();
    expect(JSON.parse(storage.getItem(KEY)).fluxCoins).toBe(12345);
  });

  it('ignores the spaces and line breaks a notes app adds', async () => {
    const code = encodeSave(await playedSave());
    const wrapped = `  ${code.match(/.{1,40}/g).join('\n')} \n`;
    expect(decodeSave(wrapped).ok).toBe(true);
  });

  it('refuses truncated, edited, wrong-version and foreign codes with a plain reason', async () => {
    const code = encodeSave(await playedSave());
    const [tag, ver, payload, sum] = code.split('.');
    const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    const cases = {
      '': 'empty',
      '   ': 'empty',
      [code.slice(0, code.length - 20)]: 'format', // checksum cut off
      [`${tag}.${ver}.${payload.slice(0, -12)}.${sum}`]: 'checksum', // payload cut short
      [`${tag}.${ver}.${flip(payload, 30)}.${sum}`]: 'checksum', // one character edited
      [`${tag}.2.${payload}.${sum}`]: 'version',
      [`${tag}.0.${payload}.${sum}`]: 'version',
      'hello world': 'format',
      '{"fluxCoins":999999}': 'format',
      [`XX88.${ver}.${payload}.${sum}`]: 'format',
    };
    for (const [input, reason] of Object.entries(cases)) {
      const r = decodeSave(input);
      expect(r, JSON.stringify(input.slice(0, 30))).toEqual({ ok: false, reason });
      expect(REASON_TEXT[reason]).toBeTruthy();
    }
  });

  it('refuses a correctly signed code that does not hold a save', () => {
    for (const notSave of [[1, 2, 3], 42, 'text', null, { cars: 3 }, { fluxCoins: -5 }, { fluxCoins: 'lots' }]) {
      expect(decodeSave(encodeSave(notSave))).toEqual({ ok: false, reason: 'data' });
    }
  });

  it('a refused code never touches the save', async () => {
    storage.setItem(KEY, JSON.stringify({ fluxCoins: 77 }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    const r = decodeSave('OT88.1.e30.00000000');
    expect(r.ok).toBe(false);
    expect(JSON.parse(storage.getItem(KEY)).fluxCoins).toBe(77);
  });

  it('restores an old-shape save through load()\'s normal repair', async () => {
    // A pre-0001/0071 save: no garage or career, the legacy livery id, no settings object.
    const old = { bestScore: 31337, fluxCoins: 990, unlockedLevel: 5, selectedLevel: 3, livery: 'STARK_MK88', upgrades: { engine: 4 } };
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    const r = decodeSave(encodeSave(old));
    expect(r.ok).toBe(true);
    restoreSave(SaveStore, r.data, () => {});
    vi.resetModules();
    const { SaveStore: next } = await import('../../src/save.js');
    next.load();
    expect(next.data.fluxCoins).toBe(990);
    expect(next.data.livery).toBe('ARC_MK88');
    expect(next.data.upgrades).toEqual({ engine: 4, tires: 1, flux: 1, hover: 1 });
    expect(next.data.garage.owned).toContain('FLUX_COUPE_88');
    expect(next.data.career.races).toBe(0);
    expect(next.data.settings.hud).toBe('normal');
  });

  it('writes only the save key: identity and parked racer saves stay as they were', async () => {
    storage.setItem('outatime88_identity_v1', '{"racers":["abc"]}');
    storage.setItem('outatime88_racer_saves_v1', '{"xyz":{"fluxCoins":5}}');
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    restoreSave(SaveStore, decodeSave(encodeSave({ fluxCoins: 3 })).data, () => {});
    expect(storage.getItem('outatime88_identity_v1')).toBe('{"racers":["abc"]}');
    expect(storage.getItem('outatime88_racer_saves_v1')).toBe('{"xyz":{"fluxCoins":5}}');
    expect([...storage._m.keys()].sort()).toEqual(['outatime88_identity_v1', 'outatime88_racer_saves_v1', KEY].sort());
  });

  it('reports a refused write and leaves the page alone', async () => {
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    const before = SaveStore.data;
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    const reload = vi.fn();
    expect(restoreSave(SaveStore, { fluxCoins: 1 }, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(SaveStore.data).toBe(before);
  });

  it('describes a save for the confirm line', () => {
    expect(describeSave({ fluxCoins: 1250, garage: { owned: ['A', 'B', 'C', 'D'] }, career: { races: 12 } })).toBe('1,250 coins · 4 cars · 12 races');
    expect(describeSave({ fluxCoins: 1, garage: { owned: ['A'] }, career: { races: 1 } })).toBe('1 coin · 1 car · 1 race');
    expect(describeSave({ fluxCoins: 0 })).toBe('0 coins · 0 cars · 0 races');
  });
});
