// Fair play (ticket 0180): mashing buttons gains nothing, honest play never notices, and the
// server catches runs whose counters break the same rules.
import { describe, it, expect } from 'vitest';
import {
  FAIR, FP_KEYS, airRefills, createFair, fairMalformed, fairPayload, fairProblem, fairStep,
  pressJump, takeHang, takeJuke, takeJump, takeTrick,
} from '../../src/fairplay.js';

const STEP = 1000 / 120;
const G = 1550;

/** A tiny vertical sim: jump = 490 up, gravity 1550, like the race step. */
function sim({ secs, press, mph = 100, auto = false }) {
  const f = createFair();
  let y = 0, vy = 0, jumps = 0;
  for (let i = 0; i < secs * 120; i++) {
    fairStep(f, STEP, y, mph, auto);
    if (press(i, f)) pressJump(f);
    if (takeJump(f, y)) { vy = 490; jumps++; }
    if (y > 0 || vy !== 0) {
      y += vy / 120; vy -= G / 120;
      if (y <= 0) { y = 0; vy = 0; }
    }
  }
  return { f, jumps };
}

describe('jumps', () => {
  it('mashing every step gives no more hops than pressing once per landing', () => {
    const mash = sim({ secs: 20, press: () => true });
    const honest = sim({ secs: 20, press: (i, f) => !f.air && f.t - f.landAt >= FAIR.jump.cooldownMs });
    expect(mash.jumps).toBeLessThanOrEqual(honest.jumps + 1);
    expect(mash.jumps).toBeLessThan(20 * 1.4); // ~1.2 hops a second at most
    expect(fairProblem(fairPayload(mash.f), { durationMs: 20000, distance: 2000 })).toBeNull();
  });
  it('a press just before landing fires after the cooldown (buffer); one far too early does not', () => {
    const f = createFair();
    f.groundAt = -1e9; // long since off the ground
    fairStep(f, STEP, 20, 50); // in the air
    pressJump(f);
    expect(takeJump(f, 20)).toBe(false);
    for (let t = 0; t < 60; t += STEP) fairStep(f, STEP, 20, 50);
    pressJump(f); // just before landing
    fairStep(f, STEP, 0, 50); // lands
    expect(takeJump(f, 0)).toBe(false); // landing cooldown first
    for (let t = 0; t <= FAIR.jump.cooldownMs; t += STEP) fairStep(f, STEP, 0, 50);
    expect(takeJump(f, 0)).toBe(true); // …then the early press fires by itself
    const g = createFair();
    g.groundAt = -1e9;
    fairStep(g, STEP, 20, 50);
    pressJump(g); // far too early
    for (let t = 0; t < 400; t += STEP) fairStep(g, STEP, 20, 50);
    fairStep(g, STEP, 0, 50);
    for (let t = 0; t < 400; t += STEP) { fairStep(g, STEP, 0, 50); expect(takeJump(g, 0)).toBe(false); }
  });
  it('coyote time: a jump just after rolling off a crest still works, a double jump does not', () => {
    const f = createFair();
    fairStep(f, STEP, 0, 80);
    fairStep(f, STEP, 6, 80); // off the crest, not a self jump
    pressJump(f);
    expect(takeJump(f, 6)).toBe(true);
    fairStep(f, STEP, 30, 80);
    pressJump(f);
    expect(takeJump(f, 30)).toBe(false);
  });
  it('self hops do not fill NOS; ramp air does', () => {
    const f = createFair();
    fairStep(f, STEP, 0, 80); pressJump(f); takeJump(f, 0); fairStep(f, STEP, 20, 80);
    expect(airRefills(f)).toBe(false);
    const g = createFair();
    fairStep(g, STEP, 0, 80); fairStep(g, STEP, 20, 80);
    expect(airRefills(g)).toBe(true);
  });
});

describe('tricks and jukes', () => {
  it('tricks are spaced and capped per air; the hang happens once', () => {
    const f = createFair();
    fairStep(f, STEP, 50, 90);
    let n = 0;
    for (let i = 0; i < 600; i++) { fairStep(f, STEP, 50, 90); if (takeTrick(f, 50)) n++; }
    expect(n).toBe(FAIR.trick.perAir);
    expect(takeHang(f)).toBe(true);
    expect(takeHang(f)).toBe(false);
    fairStep(f, STEP, 0, 90); // land: a fresh air gets fresh slots
    fairStep(f, STEP, 50, 90);
    expect(takeTrick(f, 50)).toBe(true);
    expect(takeHang(f)).toBe(true);
    expect(takeTrick(createFair(), 5)).toBe(false); // not on the ground
  });
  it('jukes can not chain into permanent invulnerability', () => {
    const f = createFair();
    let n = 0;
    for (let i = 0; i < 1200; i++) { fairStep(f, STEP, 0, 90); if (takeJuke(f)) n++; }
    expect(n).toBeLessThanOrEqual(Math.ceil(10000 / FAIR.juke.cooldownMs) + 1);
    expect(FAIR.juke.invulnS * 1000).toBeLessThan(FAIR.juke.cooldownMs / 2);
  });
});

describe('server checks', () => {
  const honest = () => {
    const { f } = sim({ secs: 60, press: (i) => i % 90 === 0, mph: 120 });
    return fairPayload(f);
  };
  const run = { durationMs: 61000, distance: 120 * 60 };
  it('an honest run passes and every counter is an integer', () => {
    const fp = honest();
    expect(Object.keys(fp).sort()).toEqual([...FP_KEYS].sort());
    expect(fairMalformed(fp)).toBeNull();
    expect(fairProblem(fp, run)).toBeNull();
  });
  it('rejects forged shapes', () => {
    for (const bad of [null, [], 'x', { ...honest(), jumps: -1 }, { ...honest(), tricks: 1.5 }, { simMs: 1 }]) {
      expect(fairMalformed(bad)).not.toBeNull();
    }
  });
  it('flags each kind of cheat', () => {
    const fp = honest();
    const cases = [
      [{ simMs: 999999 }, 'sim clock ahead of the run'],
      [{ airMs: fp.simMs + 5000 }, 'more air than race'],
      [{ topMph: 400 }, 'too fast'],
      [{ topMph: 60 }, 'distance beyond top speed'],
      [{ jumps: 500, airs: 500 }, 'jump spam'],
      [{ airs: 5000 }, 'too many launches'],
      [{ tricks: fp.airs * 3 + 1 }, 'trick spam'],
      [{ jukes: 200 }, 'juke spam'],
      [{ autoMs: 30000 }, 'assist'],
    ];
    for (const [patch, why] of cases) expect(fairProblem({ ...fp, ...patch }, run)).toBe(why);
  });
  it('autopilot time is counted', () => {
    const { f } = sim({ secs: 10, press: () => false, auto: true });
    expect(fairPayload(f).autoMs).toBe(10000);
    expect(fairProblem(fairPayload(f), { durationMs: 10000, distance: 900 })).toBe('assist');
  });
});
