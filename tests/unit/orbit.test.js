// The low-orbit skyway (ticket 0150): its level, era, track book, low-G jumps and egg triggers.
import { describe, it, expect } from 'vitest';
import { WORLD_LEVELS, ERAS } from '../../src/data.js';
import { ERA_PALETTES } from '../../src/era-palettes.js';
import { LEVEL_MEDALS } from '../../src/progress.js';
import { fillBag, CURVES, SET_PIECES } from '../../src/track.js';
import { parseDeepLink } from '../../src/deeplink.js';
import { dailySpec, DAILY_LEVELS } from '../../src/daily.js';
import { eggs, newEggMemory, EGGS } from '../../src/scenes/eggs.js';

const orbit = WORLD_LEVELS.find((l) => l.id === 'LVL6_LOW_ORBIT');
const era = orbit && ERAS[orbit.startEra];

describe('low orbit skyway', () => {
  it('is level 6, appended so saved level indexes stay put, and starts in the 2061 orbit era', () => {
    expect(orbit).toBeTruthy();
    expect(orbit.index).toBe(5);
    expect(WORLD_LEVELS.indexOf(orbit)).toBe(5);
    expect(era.id).toBe('2061');
    expect(ERAS.indexOf(era)).toBe(ERAS.length - 1);
    expect(ERA_PALETTES[2061].space).toBe(true);
    expect(LEVEL_MEDALS.LVL6_LOW_ORBIT.gold).toBeGreaterThan(LEVEL_MEDALS.LVL5_INFINITE_HW.gold);
  });

  it('draws the deck as a see-through ribbon with neon edges in 2D', () => {
    for (const k of ['surfA', 'surfB', 'slab', 'sheen', 'groove', 'center', 'wall', 'rimA', 'rimB', 'lip']) expect(era.deck[k]).toBeTruthy();
    expect(era.deck.surfA).toMatch(/^rgba\(/);
    // 3D reads trackA/B as plain colours.
    expect(era.trackA).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('jumps float about twice as long in low G', () => {
    const g = 1550, launch = 490;
    const air = (scale) => (2 * launch) / (g * scale);
    expect(era.gravity).toBeGreaterThan(0.3);
    expect(era.gravity).toBeLessThan(0.6);
    expect(air(era.gravity) / air(1)).toBeGreaterThan(1.8);
    for (const e of ERAS) if (e !== era) expect(e.gravity == null || e.gravity === 1).toBe(true);
  });

  it('every bag holds every curve kind and set piece, and opens with a corkscrew', () => {
    const out = [];
    for (let n = 0; n < 6; n++) {
      fillBag(out, orbit.index, 1234, n);
      const kinds = out.filter((_, i) => i % 2 === 0);
      for (const k of [...CURVES, ...SET_PIECES]) expect(kinds).toContain(k);
      if (n === 0) expect(kinds.find((k) => SET_PIECES.includes(k))).toBe('corkscrew');
    }
  });

  it('opens from launcher links as ?level=orbit or ?level=6', () => {
    expect(parseDeepLink('?level=orbit', WORLD_LEVELS.length).level).toBe(5);
    expect(parseDeepLink('?level=ORBIT', WORLD_LEVELS.length).level).toBe(5);
    expect(parseDeepLink('?level=6', WORLD_LEVELS.length).level).toBe(5);
    expect(parseDeepLink('?level=orbit', 5).level).toBeNull();
    expect(parseDeepLink('?level=moon', WORLD_LEVELS.length).level).toBeNull();
  });

  it("doesn't move today's daily: the daily still draws from the first five levels", () => {
    expect(DAILY_LEVELS).toBe(5);
    for (let d = 1; d <= 28; d++) expect(dailySpec(`2026-11-${String(d).padStart(2, '0')}`).levelIndex).toBeLessThan(5);
  });

  it('the roadster drifts past on a schedule and a rocket launches once on the final lap', () => {
    const mem = newEggMemory();
    const f = (o) => eggs({ era: '2061', t: 10, raceTime: 10, speed: 60, lap: 1, laps: 3, warp: -1, reduced: false, ...o }, mem);
    expect(f({ raceTime: 4 })[EGGS.ROADSTER]).toBe(false);
    expect(f({ raceTime: 9 })[EGGS.ROADSTER]).toBe(true);
    expect(f({ raceTime: 25 })[EGGS.ROADSTER]).toBe(false);
    expect(f({ raceTime: 50 })[EGGS.ROADSTER]).toBe(true);
    expect(f({ t: 20, lap: 2 })[EGGS.LAUNCH]).toBe(false);
    expect(f({ t: 30, lap: 3 })[EGGS.LAUNCH]).toBe(true);
    expect(f({ t: 45, lap: 3 })[EGGS.LAUNCH]).toBe(false);
    expect(eggs({ era: '2088', t: 9, raceTime: 9, speed: 60, lap: 3, laps: 3, warp: -1 }, newEggMemory())[EGGS.ROADSTER]).toBe(false);
  });
});
