// Era backdrop easter eggs (ticket 0100): every trigger, pinned.
import { describe, it, expect } from 'vitest';
import { eggs, newEggMemory, rainForecast, EGGS } from '../../src/scenes/eggs.js';
import { SCENE_IDS } from '../../src/scenes/stage.js';

const frame = (o) => ({ era: '2026', t: 10, raceTime: 10, speed: 50, lap: 1, laps: 3, warp: -1, reduced: false, ...o });
const run = (o, mem = newEggMemory()) => eggs(frame(o), mem);

describe('easter eggs', () => {
  it('lightning strikes the clock tower as you warp, then fades; not without a warp', () => {
    const mem = newEggMemory();
    expect(run({ t: 5 }, mem)[EGGS.LIGHTNING]).toBe(false);
    expect(run({ t: 6, warp: 0.05 }, mem)[EGGS.LIGHTNING]).toBe(true);
    expect(run({ t: 6.3, warp: 0.35 }, mem)[EGGS.LIGHTNING]).toBe(true);
    expect(run({ t: 7, warp: -1 }, mem)[EGGS.LIGHTNING]).toBe(false);
  });

  it('lightning only belongs to the clock-tower eras', () => {
    for (const era of ['1985', '1885', '2015', '2088']) expect(run({ era, warp: 0.05 })[EGGS.LIGHTNING]).toBe(false);
    expect(run({ era: '1955', warp: 0.05 })[EGGS.LIGHTNING]).toBe(true);
  });

  it('88 mph: the 1955 cable sparks and the 1885 smoke turns to fireworks', () => {
    expect(run({ era: '1955', speed: 87.9 })[EGGS.WIRE_SPARKS]).toBe(false);
    expect(run({ era: '1955', speed: 88 })[EGGS.WIRE_SPARKS]).toBe(true);
    expect(run({ era: '1885', speed: 70 })[EGGS.PRESTO]).toBe(false);
    expect(run({ era: '1885', speed: 92 })[EGGS.PRESTO]).toBe(true);
  });

  it('final-lap set pieces play once, for a fixed time', () => {
    const cases = [['1955', EGGS.SAUCER, 9], ['1885', EGGS.BOOTH, 5], ['2088', EGGS.UNICORN, 8], ['1985', EGGS.BIKE_MOON, 6]];
    for (const [era, egg, dur] of cases) {
      const mem = newEggMemory();
      expect(run({ era, lap: 2, t: 1 }, mem)[egg], `${egg} before the final lap`).toBe(false);
      expect(run({ era, lap: 3, t: 20 }, mem)[egg], `${egg} on the final lap`).toBe(true);
      expect(run({ era, lap: 3, t: 20 + dur - 0.1 }, mem)[egg]).toBe(true);
      expect(run({ era, lap: 3, t: 20 + dur + 0.1 }, mem)[egg], `${egg} plays once`).toBe(false);
    }
  });

  it('the kid on the bike only flies when you are actually moving', () => {
    expect(run({ era: '1985', lap: 3, speed: 10 })[EGGS.BIKE_MOON]).toBe(false);
  });

  it('1985: the mall loses an elm once history changes after lap 1', () => {
    expect(run({ era: '1985', lap: 1 })[EGGS.ELMS]).toBe(false);
    expect(run({ era: '1985', lap: 2 })[EGGS.ELMS]).toBe(true);
  });

  it('2015: the shark lunges every 25 s and the rain stops exactly on the half-minute', () => {
    expect(run({ era: '2015', raceTime: 25.5 })[EGGS.SHARK]).toBe(true);
    expect(run({ era: '2015', raceTime: 27 })[EGGS.SHARK]).toBe(false);
    expect(run({ era: '2015', raceTime: 29.9 })[EGGS.RAIN_STOPS]).toBe(false);
    expect(run({ era: '2015', raceTime: 30 })[EGGS.RAIN_STOPS]).toBe(true);
    expect(run({ era: '2015', raceTime: 40.1 })[EGGS.RAIN_STOPS]).toBe(false);
    expect(rainForecast(25)).toBe(5);
    expect(rainForecast(31)).toBe(0);
    expect(rainForecast(41)).toBe(19);
  });

  it('2026: the parade balloon looms on the final lap only', () => {
    expect(run({ lap: 2 })[EGGS.BALLOON]).toBe(false);
    expect(run({ lap: 3 })[EGGS.BALLOON]).toBe(true);
  });

  it('reuses the output object (no per-frame allocation)', () => {
    const mem = newEggMemory(), out = {};
    expect(eggs(frame({}), mem, out)).toBe(out);
  });

  it('there is a scene for every egg era', () => {
    for (const id of ['2026', '1985', '1885', '2015', '2088', '1955', '2061']) expect(SCENE_IDS).toContain(id);
  });
});
