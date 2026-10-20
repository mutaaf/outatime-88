// Traffic formations (ticket 0027): readable patterns that escalate by wave, placed whole,
// drawn from the race's traffic RNG, and never closing the racing line.
import { describe, it, expect } from 'vitest';
import { FORMATIONS, FORMATION_LANES, ROW_DZ, formationsFor, formationSpan, createFormationStream } from '../../src/formations.js';
import { createLine, createHazardPlanner } from '../../src/cleanline.js';
import { mulberry32 } from '../../src/daily.js';

const CAR = { halfW: 0.13, halfL: 105 };
const TRUCK = { halfW: 0.16, halfL: 160 };
const S2W = (11000 * 0.46) / 88;

/**
 * Drive a formation stream like LiveTraffic: six cars (four on the road, two parked), a car
 * parks once it's passed, and the next formation goes down whole once enough are parked.
 * `onStep(live)` sees the cars on the road after every step.
 */
function drive(seed, wave, { steps = 2500, playerMph = 100, avoid = null, onStep = null } = {}) {
  const line = createLine(seed);
  const planner = createHazardPlanner({ line, rand: mulberry32(seed), avoid });
  const stream = createFormationStream({ rand: planner.rand, line, clear: planner.trafficClear, avoid: planner.avoid });
  const pool = [TRUCK, CAR, CAR, CAR, TRUCK, CAR].map((b, i) => ({
    ...b, idle: i >= 4, z: i >= 4 ? -1e6 : 4800 + i * 5200, mph: 40,
    offset: planner.trafficLane(i, 4800 + i * 5200, wave, b.halfW, b.halfL),
  }));
  const placed = [];
  const dt = 1 / 30;
  let pz = 0;
  for (let n = 0; n < steps; n++) {
    pz += playerMph * S2W * dt;
    const parked = pool.filter((t) => t.idle);
    if (parked.length && parked.length >= stream.next(wave)) {
      const maxT = Math.max(pz + 12000, ...pool.filter((t) => !t.idle).map((t) => t.z));
      const spots = stream.place(parked, maxT);
      for (const s of spots) Object.assign(s.body, { idle: false, z: s.z, offset: s.offset, mph: s.mph });
      placed.push(spots.map((s) => ({ id: s.id, z: s.z, offset: s.offset, halfW: s.body.halfW, halfL: s.body.halfL, minZ: pz + 12000 })));
    }
    for (const t of pool) {
      if (t.idle) continue;
      t.z += t.mph * S2W * dt;
      if (t.z - pz < -800) { t.idle = true; t.z = -1e6; }
    }
    if (onStep) onStep(pool.filter((t) => !t.idle), pz);
  }
  return { placed, line, planner, stream, pool };
}

describe('traffic formations (0027)', () => {
  it('every formation leaves an open lane in every row', () => {
    for (const f of FORMATIONS) {
      for (const a of f.cars) {
        const row = f.cars.filter((b) => Math.abs(b.dz - a.dz) < ROW_DZ);
        expect(row.length, f.id).toBeLessThan(FORMATION_LANES.length);
      }
      // follow points back to an earlier car, cars are in head-first order
      f.cars.forEach((c, i) => {
        if (c.follow != null) expect(c.follow).toBeLessThan(i);
        if (i > 0) expect(c.dz).toBeGreaterThanOrEqual(f.cars[i - 1].dz);
      });
    }
  });

  it('wave 1 only gets the gentle ones; harder patterns unlock with the wave', () => {
    expect(formationsFor(1).map((f) => f.id).sort()).toEqual(['SOLO', 'STAGGER']);
    expect(formationsFor(2).length).toBeGreaterThan(formationsFor(1).length);
    expect(formationsFor(9).length).toBe(FORMATIONS.length);
    for (let seed = 1; seed <= 20; seed++) {
      const { stream } = drive(seed, 1, { steps: 1500 });
      expect(stream.log.length).toBeGreaterThan(3);
      for (const e of stream.log) expect(['SOLO', 'STAGGER']).toContain(e.id);
    }
  });

  it('formations go down whole, beyond the spawn horizon, and every pattern shows up by wave 4', () => {
    const seen = new Set();
    let want = 0, got = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { placed } = drive(seed * 13, 4);
      for (const group of placed) {
        seen.add(group[0].id);
        for (const c of group) expect(c.z).toBeGreaterThan(c.minZ);
      }
      const { stream } = drive(seed * 13, 4);
      for (const e of stream.log) { want += e.want; got += e.placed; }
    }
    expect([...seen].sort()).toEqual(FORMATIONS.map((f) => f.id).sort());
    // Only a follow car whose lead's lane closes up can be left out: nearly every car is placed.
    expect(got / want).toBeGreaterThan(0.97);
  });

  it('a gate and a wall are side by side: one row, cars on both sides of the line', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { placed, line } = drive(seed * 31, 4);
      for (const group of placed) {
        if (group[0].id !== 'GATE' && group[0].id !== 'WALL') continue;
        expect(group.length).toBeGreaterThanOrEqual(2);
        const c = line.centreAt(group[0].z);
        expect(group.every((g) => g.z === group[0].z)).toBe(true);
        expect(group.some((g) => g.offset < c) && group.some((g) => g.offset > c)).toBe(true);
      }
    }
  });

  it('cars on the road keep the racing line open and never sit on top of each other', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const wave = 1 + (seed % 5);
      const { placed, planner } = drive(seed * 97, wave, {
        onStep(live) {
          for (let i = 0; i < live.length; i++) {
            for (let j = i + 1; j < live.length; j++) {
              const a = live[i], b = live[j];
              if (Math.abs(a.z - b.z) < a.halfL + b.halfL) expect(Math.abs(a.offset - b.offset), `seed ${seed}`).toBeGreaterThanOrEqual(a.halfW + b.halfW);
            }
          }
        },
      });
      for (const group of placed) for (const s of group) expect(planner.trafficClear(s.z, s.offset, s.halfW, s.halfL), `seed ${seed} z=${s.z}`).toBe(true);
    }
  });

  it('no formation lands in a set piece', () => {
    const pieces = [[30000, 34000], [52000, 60000], [90000, 91000]];
    const avoid = (z0, z1) => pieces.some(([a, b]) => z1 > a && z0 < b);
    for (let seed = 1; seed <= 30; seed++) {
      const { placed } = drive(seed, 4, { avoid, steps: 1500 });
      for (const group of placed) {
        const head = group[0].z;
        const f = FORMATIONS.find((x) => x.id === group[0].id);
        expect(avoid(head - 600, head + formationSpan(f) + 600), `seed ${seed} ${f.id} at ${head}`).toBe(false);
      }
    }
  });

  it('the same seed yields the same sequence (daily challenge), another seed differs', () => {
    const a = drive(2026, 4), b = drive(2026, 4), c = drive(2027, 4);
    expect(a.placed).toEqual(b.placed);
    expect(a.stream.log).toEqual(b.stream.log);
    expect(c.placed).not.toEqual(a.placed);
  });

  it('a convoy follows its leader lane, the whole pattern at one speed', () => {
    const line = { centreAt: () => 0 };
    const stream = createFormationStream({ rand: () => 0.5, line, clear: (z, o) => Math.abs(o) > 0.3 });
    expect(stream.next(2)).toBe(3); // 0.5 of four wave-2 patterns → CONVOY
    const spots = stream.place([CAR, CAR, CAR].map((c) => ({ ...c })), 0);
    expect(spots.map((s) => s.id)).toEqual(['CONVOY', 'CONVOY', 'CONVOY']);
    expect(new Set(spots.map((s) => s.offset)).size).toBe(1);
    expect(new Set(spots.map((s) => s.mph)).size).toBe(1);
    expect(spots[1].z - spots[0].z).toBe(700);
  });
});
