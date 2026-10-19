// Endless hazards (ticket 0186): every rule that can end a run, and that each one is fair —
// telegraphed in time, avoidable by the move it asks for, deterministic from the seed.
import { describe, it, expect } from 'vitest';
import {
  HZ, PLACED, RULES, LANES, FUEL, HEAT, STALL, PATROL, CHECK, lanesAt, nearestLane, kindsFor, planHazard, gapZ,
  timeTo, armTrain, trainPos, hits, endZ, burnFuel, stepHeat, stepStall, stepPatrol, patrolSecs, checkSecs,
  ensureHz, recordDeath, causeOf,
} from '../../src/hazards.js';

const at = (o) => ({ z: 0, x: 0, y: 0, duck: false, now: 0, ...o });
const H = (kind, o = {}) => ({ kind, len: HZ[kind].len, lanes: 7, safe: -1, side: 0, z0: 1000, carZ: 0, tOn: null, tOff: null, spent: false, ...o });

describe('lanes', () => {
  it('three lanes; straddling a line touches both', () => {
    expect(lanesAt(-0.48)).toBe(1);
    expect(lanesAt(0)).toBe(2);
    expect(lanesAt(0.6)).toBe(4);
    expect(lanesAt(0.25)).toBe(2 | 4);
    expect([nearestLane(-0.5), nearestLane(0.1), nearestLane(0.7)]).toEqual([0, 1, 2]);
  });
});

describe('unlocks and placement', () => {
  it('nothing at tier 1, then one or two new kinds a tier: all six by tier 5 (docs/BALANCE.md)', () => {
    expect(kindsFor(1)).toEqual([]);
    expect(kindsFor(2)).toEqual(['BEAM']);
    expect(kindsFor(3).sort()).toEqual(['BEAM', 'BRIDGE', 'WRONGWAY']);
    expect(kindsFor(4)).toHaveLength(5);
    expect(kindsFor(5).sort()).toEqual([...PLACED].sort());
  });
  it('a newly unlocked kind comes first, then the seed picks, never twice in a row', () => {
    expect(planHazard(7, 0, 3, ['BRIDGE', 'WRONGWAY'], 'WRONGWAY').kind).toBe('BEAM');
    let last = 'BRIDGE';
    for (let i = 0; i < 200; i++) {
      const p = planHazard(7, i, 4, [...PLACED], last);
      expect(p.kind).not.toBe(last);
      last = p.kind;
    }
  });
  it('is deterministic for a seed and index', () => {
    const a = planHazard(1234, 5, 4, [...PLACED], ''), b = planHazard(1234, 5, 4, [...PLACED], '');
    expect(a).toEqual(b);
    expect(gapZ(9, 3, 0.4, 3520)).toBe(gapZ(9, 3, 0.4, 3520));
  });
  it('a low overpass or a crumbling road always leaves exactly one way through', () => {
    for (let i = 0; i < 60; i++) {
      for (const met of [['BRIDGE', 'WRONGWAY'], ['BRIDGE', 'WRONGWAY', 'BEAM']]) {
        const p = planHazard(i * 31, i, 3, met, '');
        if (p.kind !== 'BEAM' && p.kind !== 'COLLAPSE') continue;
        expect(p.safe).toBeGreaterThanOrEqual(0);
        expect(p.lanes).toBe(7 & ~(1 << p.safe));
      }
    }
  });
  it('hazards get closer together as difficulty rises (but always seconds apart)', () => {
    const easy = gapZ(5, 1, 0, 3520), hard = gapZ(5, 1, 1, 3520);
    expect(hard).toBeLessThan(easy);
    expect(hard / 3520).toBeGreaterThanOrEqual(RULES.gapSecsHard);
  });
});

describe('telegraphs', () => {
  it('the warning comes ~1.6 s ahead (2.6 s the first time), long before the hazard', () => {
    expect(RULES.warn).toBeGreaterThanOrEqual(1.5);
    expect(RULES.warnFirst).toBeGreaterThan(RULES.warn);
    // At 88 mph on the smooth pace (3,520 Z/s) a hazard laid down at `ahead` is ~7 s out.
    expect(timeTo(RULES.ahead, 0, 3520)).toBeGreaterThan(RULES.warnFirst + 2);
    expect(timeTo(1000, 0, 0)).toBe(Infinity);
    expect(timeTo(1000, 1200, 3520)).toBe(0);
  });
  it('the roadside sign stands before the hazard', () => expect(RULES.signLead).toBeGreaterThan(0));
});

describe('each hazard ends the run only if you do nothing', () => {
  it('broken bridge: on the road over the gap falls; airborne clears it', () => {
    const h = H('BRIDGE');
    expect(hits(h, at({ z: 1100 }))).toBe(true);
    expect(hits(h, at({ z: 1100, y: 40 }))).toBe(false);
    expect(hits(h, at({ z: 900 }))).toBe(false);
    expect(hits(h, at({ z: 1700 }))).toBe(false);
    expect(hits({ ...h, spent: true }, at({ z: 1100 }))).toBe(false);
  });
  it('a jump at 88 mph covers the gap with room to spare', () => {
    // Hop: vy 490 against 1550 gravity ≈ 0.63 s of air; 88 mph smooth = 3,520 Z/s.
    const air = (2 * 490) / 1550;
    expect(air * 3520).toBeGreaterThan(HZ.BRIDGE.len * 2);
    expect(air * 40 * 30).toBeGreaterThan(HZ.BRIDGE.len); // even at 30 mph
  });
  it('crumbling road: the green lane is safe, the others drop you', () => {
    const h = H('COLLAPSE', { safe: 2, lanes: 3 });
    expect(hits(h, at({ z: 1500, x: -0.48 }))).toBe(true);
    expect(hits(h, at({ z: 1500, x: 0 }))).toBe(true);
    expect(hits(h, at({ z: 1500, x: 0.48 }))).toBe(false);
    expect(hits(h, at({ z: 1500, x: 0.26 }))).toBe(false); // half in the green lane is enough
    expect(hits(h, at({ z: 1500, x: -0.48, y: 30 }))).toBe(false);
  });
  it('low overpass: duck under it, or take the open lane', () => {
    const h = H('BEAM', { safe: 0, lanes: 6 });
    expect(hits(h, at({ z: 1100, x: 0.4 }))).toBe(true);
    expect(hits(h, at({ z: 1100, x: 0.4, duck: true }))).toBe(false);
    expect(hits(h, at({ z: 1100, x: -0.5 }))).toBe(false);
    expect(hits(h, at({ z: 1100, x: 0.4, y: 50 }))).toBe(true); // jumping into it is no escape
  });
  it('train: the window opens just before you would arrive and closes just after; braking waits it out', () => {
    const h = H('TRAIN', { z0: 10000 });
    armTrain(h, 5, RULES.trainArm);
    expect(h.tOn).toBeCloseTo(5 + RULES.trainArm - RULES.trainLead);
    expect(h.tOff).toBeCloseTo(5 + RULES.trainArm + RULES.trainTail);
    const rails = h.z0 + h.len / 2;
    expect(hits(h, at({ z: rails, now: 5 + RULES.trainArm }))).toBe(true); // kept your speed
    expect(hits(h, at({ z: rails, now: h.tOff + 0.1 }))).toBe(false);  // braked and waited
    expect(hits(h, at({ z: rails - 400, now: 5 + RULES.trainArm }))).toBe(false); // stopped short
    expect(trainPos(h, h.tOn)).toBeGreaterThan(-1);
    expect(trainPos(h, h.tOff + 2)).toBeNull();
    expect(hits(H('TRAIN'), at({ z: 1130 }))).toBe(false); // never armed, never a train
  });
  it('a train never arrives sooner than ~half a second after it is armed', () => {
    const h = H('TRAIN');
    armTrain(h, 0, 0.2);
    expect(h.tOn).toBeGreaterThanOrEqual(0.45);
  });
  it('wrong-way driver: same lane head-on ends it; another lane or a jump clears it', () => {
    const h = H('WRONGWAY', { lanes: 2, carZ: 5000 });
    expect(hits(h, at({ z: 5100, x: 0 }))).toBe(true);
    expect(hits(h, at({ z: 5100, x: 0.48 }))).toBe(false);
    expect(hits(h, at({ z: 5100, x: 0, y: 60 }))).toBe(false);
    expect(hits(h, at({ z: 4000, x: 0 }))).toBe(false);
    expect(endZ(h)).toBe(5000);
  });
  it('missing guardrail: grinding that side drops you, the other side is just a wall', () => {
    const h = H('EDGE', { side: 1 });
    expect(hits(h, at({ z: 1500, x: 0.72 }))).toBe(true);
    expect(hits(h, at({ z: 1500, x: -0.72 }))).toBe(false);
    expect(hits(h, at({ z: 1500, x: 0.5 }))).toBe(false);
  });
  it('storm lightning: the glowing lane zaps you, any other lane is fine', () => {
    const h = H('LIGHTNING', { lanes: 1 });
    expect(hits(h, at({ z: 1100, x: -0.48 }))).toBe(true);
    expect(hits(h, at({ z: 1100, x: 0.48 }))).toBe(false);
  });
});

describe('resources', () => {
  it('fuel lasts ~10 core spacings without a core, a core tops it up, harder drains faster', () => {
    const coreGap = 72 * 200;
    expect(burnFuel(FUEL.max, coreGap * 9, 0)).toBeGreaterThan(0);
    expect(burnFuel(FUEL.max, coreGap * 11, 0)).toBe(0);
    expect(burnFuel(50, coreGap, 1)).toBeLessThan(burnFuel(50, coreGap, 0));
    // Grabbing one core in two keeps you level at difficulty 0.
    expect(FUEL.core).toBeGreaterThan(2 * FUEL.perSeg * coreGap);
  });
  it('one tank of NOS is fine; two back-to-back blow the engine', () => {
    let h = 0;
    for (let i = 0; i < 300; i++) h = stepHeat(h, true, 1 / 120); // a 2.5 s burn
    expect(h).toBeLessThan(HEAT.max);
    for (let i = 0; i < 120; i++) h = stepHeat(h, false, 1 / 120); // 1 s off
    for (let i = 0; i < 300; i++) h = stepHeat(h, true, 1 / 120);
    expect(h).toBe(HEAT.max);
    for (let i = 0; i < 1200; i++) h = stepHeat(h, false, 1 / 120);
    expect(h).toBe(0);
  });
  it('stalling counts only while crawling and not excused', () => {
    expect(stepStall(1, STALL.mph - 1, 0.5, false)).toBe(1.5);
    expect(stepStall(1, STALL.mph + 1, 0.5, false)).toBe(0);
    expect(stepStall(3, 0, 0.5, true)).toBe(0);
  });
});

describe('the Patrol', () => {
  it('a slip sets it on you; a second slip in the window is caught; drive clean and it gives up', () => {
    const p = { t: 0, dur: 1 };
    expect(stepPatrol(p, false, 0.1, 0)).toBe('');
    expect(stepPatrol(p, true, 0.1, 0)).toBe('on');
    expect(p.t).toBe(PATROL.secs);
    expect(stepPatrol(p, true, 0.1, 0)).toBe('caught');
    const q = { t: 0, dur: 1 };
    stepPatrol(q, true, 0.1, 0);
    let r = '';
    for (let i = 0; i < 1000 && r !== 'lost'; i++) r = stepPatrol(q, false, 0.01, 0);
    expect(r).toBe('lost');
    expect(stepPatrol(q, true, 0.1, 0)).toBe('on'); // a fresh slip only starts it again
  });
  it('gives up sooner as the run gets harder', () => expect(patrolSecs(1)).toBeLessThan(patrolSecs(0)));
});

describe('checkpoints', () => {
  it('a clean 88 mph run makes every gate with time to spare; spare time carries (capped)', () => {
    for (const d of [0, 0.5, 1]) expect(CHECK.dist / 88).toBeLessThan(checkSecs(d) - 5);
    expect(checkSecs(0.5, 100)).toBeCloseTo(checkSecs(0.5) + CHECK.carry);
    expect(checkSecs(1)).toBeLessThan(checkSecs(0));
  });
});

describe('save bookkeeping', () => {
  it('kinds met and deaths by cause live under save.endless.hz and survive bad data', () => {
    const save = { endless: { hz: 'junk' } };
    expect(ensureHz(save)).toEqual({ seen: {}, deaths: {} });
    expect(recordDeath(save, 'TRAIN')).toBe(1);
    expect(recordDeath(save, 'TRAIN')).toBe(2);
    expect(save.endless.hz.deaths).toEqual({ TRAIN: 2 });
    expect(causeOf('PATROL').cause).toMatch(/PATROL/);
    expect(causeOf('BRIDGE').cause).toMatch(/BRIDGE/);
    expect(causeOf('nope').cause).toBe('WRECKED');
  });
  it('every hazard has a sign, a call-out, a how-to, a cause and a tip', () => {
    for (const d of Object.values(HZ)) for (const k of ['icon', 'sign', 'act', 'how', 'cause', 'tip']) expect(d[k]).toBeTruthy();
    expect(LANES).toHaveLength(3);
  });
});
