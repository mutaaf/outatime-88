// Runner power-ups (ticket 0175): magnet, shield, 2X coins — timers, upgrades, placement.
import { describe, it, expect } from 'vitest';
import {
  POWER, POWER_KINDS, UPGRADE, powerSecs, upgradeCost, ensurePower, buyUpgrade, createPower,
  resetPower, activatePower, stepPower, powerOn, useShield, cashMult,
} from '../../src/powerups.js';
import { PICKUPS, PICKUP, kindAt, powerupAt, POWER_SPAWN } from '../../src/pickups.js';
import { GOALS } from '../../src/runner-goals.js';

describe('power-up timers', () => {
  it('lasts its base length, longer with each upgrade level, capped at max', () => {
    expect(powerSecs('MAGNET', 0)).toBe(8);
    expect(powerSecs('SHIELD', 0)).toBe(20);
    expect(powerSecs('DOUBLER', 0)).toBe(10);
    for (const k of POWER_KINDS) {
      for (let lv = 1; lv <= UPGRADE.max; lv++) expect(powerSecs(k, lv)).toBeGreaterThan(powerSecs(k, lv - 1));
      expect(powerSecs(k, UPGRADE.max + 3)).toBe(powerSecs(k, UPGRADE.max));
    }
  });

  it('counts down, reports the one that ran out, and turns off when none are left', () => {
    const st = createPower();
    activatePower(st, 'MAGNET', 0);
    activatePower(st, 'DOUBLER', 0);
    expect(st.on).toBe(true);
    expect(powerOn(st, 'MAGNET')).toBe(true);
    expect(cashMult(st)).toBe(2);
    let ended = '';
    for (let i = 0; i < 8 * 120 && !ended; i++) ended = stepPower(st, 1 / 120);
    expect(ended).toBe('MAGNET');
    expect(powerOn(st, 'MAGNET')).toBe(false);
    expect(st.on).toBe(true); // 2X still running
    for (let i = 0; i < 3 * 120; i++) stepPower(st, 1 / 120);
    expect(st.on).toBe(false);
    expect(cashMult(st)).toBe(1);
  });

  it('picking one up again refills it to the full upgraded length', () => {
    const st = createPower();
    activatePower(st, 'MAGNET', 2);
    stepPower(st, 5);
    activatePower(st, 'MAGNET', 2);
    expect(st.t.MAGNET).toBe(powerSecs('MAGNET', 2));
    expect(st.dur.MAGNET).toBe(powerSecs('MAGNET', 2));
  });

  it('a shield eats exactly one crash', () => {
    const st = createPower();
    expect(useShield(st)).toBe(false);
    activatePower(st, 'SHIELD', 0);
    expect(useShield(st)).toBe(true);
    expect(useShield(st)).toBe(false);
    expect(st.popped).toBe(1);
    expect(st.on).toBe(false);
    resetPower(st);
    expect(st.popped).toBe(0);
  });
});

describe('upgrades (FLUX cash only)', () => {
  it('repairs a missing or broken save', () => {
    const save = { fluxCoins: 0 };
    expect(ensurePower(save)).toEqual({ MAGNET: 0, SHIELD: 0, DOUBLER: 0 });
    save.endless.power = { MAGNET: 99, SHIELD: -4, DOUBLER: 'x' };
    expect(ensurePower(save)).toEqual({ MAGNET: UPGRADE.max, SHIELD: 0, DOUBLER: 0 });
  });

  it('buys a level when you can afford it, spends the cash, and stops at max', () => {
    const save = { fluxCoins: 100 };
    expect(buyUpgrade(save, 'MAGNET').ok).toBe(false);
    expect(save.fluxCoins).toBe(100);
    save.fluxCoins = 100000;
    let spent = 0;
    for (let i = 0; i < UPGRADE.max; i++) {
      const r = buyUpgrade(save, 'SHIELD');
      expect(r.ok).toBe(true);
      spent += r.cost;
    }
    expect(save.endless.power.SHIELD).toBe(UPGRADE.max);
    expect(save.fluxCoins).toBe(100000 - spent);
    expect(upgradeCost(UPGRADE.max)).toBe(0);
    expect(buyUpgrade(save, 'SHIELD').ok).toBe(false);
    expect(buyUpgrade(save, 'NOT_A_POWER').ok).toBe(false);
  });

  it('every level costs more than the last', () => {
    for (let i = 1; i < UPGRADE.max; i++) expect(upgradeCost(i)).toBeGreaterThan(upgradeCost(i - 1));
  });
});

describe('power-ups on the road', () => {
  const scan = (level, seed, n = 6000) => {
    const out = [];
    for (let i = 0; i < n; i++) { const k = powerupAt(i, level, seed); if (k) out.push([i, k]); }
    return out;
  };

  it('are pickups that pay no points (scores and server checks are unchanged)', () => {
    for (const k of POWER_KINDS) {
      expect(PICKUPS[k]).toBeTruthy();
      expect(PICKUPS[k].pts).toBe(0);
      expect(PICKUPS[k].powerup).toBe(true);
      expect(POWER[k].color).toBe(PICKUPS[k].color);
    }
  });

  it('never appear outside Endless (level 0) or before the opening', () => {
    expect(scan(0, 0)).toEqual([]);
    for (const [i] of scan(3, 1)) expect(i).toBeGreaterThanOrEqual(POWER_SPAWN.from);
  });

  it('are deterministic for a seed and include all three kinds', () => {
    expect(scan(2, 42)).toEqual(scan(2, 42));
    const kinds = new Set(scan(1, 0).map(([, k]) => k));
    expect([...kinds].sort()).toEqual([...POWER_KINDS].sort());
  });

  it('never sit within the pickup gap of a coin, core, wrench or NOS', () => {
    for (const lv of [1, 4, 9]) {
      for (const [i] of scan(lv, 7)) {
        for (let d = -PICKUP.gap; d <= PICKUP.gap; d++) expect(kindAt(i + d)).toBeNull();
      }
    }
  });

  it('come round a little more often each tier', () => {
    const n1 = scan(1, 3, 20000).length, n5 = scan(5, 3, 20000).length;
    expect(n1).toBeGreaterThan(20000 / POWER_SPAWN.every / 4);
    expect(n5).toBeGreaterThan(n1);
  });
});

describe('power-up goals', () => {
  it('exist for magnet, shield and 2X and read run stats', () => {
    const types = GOALS.map((g) => g.type);
    for (const t of ['MAGNET', 'SHIELD', 'DOUBLER', 'POWER']) expect(types).toContain(t);
    for (const g of GOALS) expect(typeof g.label(g.base)).toBe('string');
  });
});
