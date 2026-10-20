// Traffic formations (ticket 0027): readable patterns that escalate by wave, drawn from the
// race's traffic RNG, and never closing the racing line.
import { describe, it, expect } from 'vitest';
import { FORMATIONS, FORMATION_LANES, ROW_DZ, formationsFor, createFormationStream } from '../../src/formations.js';
import { createLine, createHazardPlanner } from '../../src/cleanline.js';
import { mulberry32 } from '../../src/daily.js';

const CAR = { halfW: 0.13, halfL: 105 };
const TRUCK = { halfW: 0.16, halfL: 160 };
const S2W = (11000 * 0.46) / 88;

/** Drive a planner's formation stream like LiveTraffic: a 4-car pool recycled as it is passed. */
function drive(seed, wave, { steps = 2500, playerMph = 100 } = {}) {
  const line = createLine(seed);
  const planner = createHazardPlanner({ line, rand: mulberry32(seed) });
  const stream = createFormationStream({ rand: planner.rand, line, clear: planner.trafficClear, avoid: planner.avoid });
  const pool = [TRUCK, CAR, CAR, CAR].map((b, i) => ({ ...b, z: 4800 + i * 5200, offset: planner.trafficLane(i, 4800 + i * 5200, wave, b.halfW, b.halfL), mph: 40 }));
  const spawns = [];
  const dt = 1 / 30;
  let pz = 0;
  for (let n = 0; n < steps; n++) {
    pz += playerMph * S2W * dt;
    stream.advance(dt, S2W);
    for (const t of pool) {
      t.z += t.mph * S2W * dt;
      if (t.z - pz < -800) {
        const maxT = Math.max(pz + 12000, ...pool.map((u) => u.z));
        const s = stream.spawn({ aheadZ: maxT, minZ: pz + 12000, wave, halfW: t.halfW, halfL: t.halfL });
        t.z = s.z; t.offset = s.offset; t.mph = s.mph;
        spawns.push({ ...s, halfW: t.halfW, halfL: t.halfL });
      }
    }
  }
  return { spawns, line, planner, stream, pool };
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
      for (const id of stream.log) expect(['SOLO', 'STAGGER']).toContain(id);
    }
  });

  it('placed cars keep the racing line open and never sit on top of a row mate', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const wave = 1 + (seed % 5);
      const { spawns, line, planner } = drive(seed * 97, wave);
      expect(spawns.length).toBeGreaterThan(10);
      for (const s of spawns) expect(planner.trafficClear(s.z, s.offset, s.halfW, s.halfL), `seed ${seed} z=${s.z}`).toBe(true);
      for (let i = 0; i < spawns.length; i++) {
        for (let j = i + 1; j < spawns.length; j++) {
          const a = spawns[i], b = spawns[j];
          if (Math.abs(a.z - b.z) < a.halfL + b.halfL) expect(Math.abs(a.offset - b.offset), `seed ${seed}`).toBeGreaterThanOrEqual(a.halfW + b.halfW);
        }
      }
      expect(line.centreAt(0)).toBe(0);
    }
  });

  it('the same seed yields the same sequence (daily challenge), another seed differs', () => {
    const a = drive(2026, 4), b = drive(2026, 4), c = drive(2027, 4);
    expect(a.spawns).toEqual(b.spawns);
    expect(a.stream.log).toEqual(b.stream.log);
    expect(c.spawns).not.toEqual(a.spawns);
  });

  it('a gate puts two cars side by side, one each side of the line', () => {
    const line = { centreAt: () => 0 };
    const clear = (z, o) => Math.abs(o) > 0.3;
    const stream = createFormationStream({ rand: () => 0.99, line, clear });
    // rand 0.99 draws the last formation of the wave: GATE at wave 3.
    const a = stream.spawn({ aheadZ: 10000, minZ: 0, wave: 3, ...CAR });
    const b = stream.spawn({ aheadZ: 10000, minZ: 0, wave: 3, ...CAR });
    expect(a.id).toBe('GATE');
    expect(b.z).toBe(a.z);
    expect(Math.sign(a.offset)).toBe(-Math.sign(b.offset));
  });

  it('a convoy follows its leader lane, and the head moves with the traffic', () => {
    const line = { centreAt: () => 0 };
    const stream = createFormationStream({ rand: () => 0.5, line, clear: (z, o) => Math.abs(o) > 0.3 });
    const a = stream.spawn({ aheadZ: 0, minZ: 0, wave: 2, ...CAR }); // 0.5 of 4 → CONVOY
    expect(a.id).toBe('CONVOY');
    stream.advance(1, S2W);
    const b = stream.spawn({ aheadZ: 0, minZ: 0, wave: 2, ...CAR });
    expect(b.offset).toBe(a.offset);
    expect(b.z).toBeCloseTo(a.z + 700 + 40 * S2W, 6);
  });

  it('a formation that would pop in under the horizon is dropped for a fresh one', () => {
    const line = { centreAt: () => 0 };
    const stream = createFormationStream({ rand: () => 0.5, line, clear: (z, o) => Math.abs(o) > 0.3 });
    const a = stream.spawn({ aheadZ: 0, minZ: 0, wave: 2, ...CAR });
    const b = stream.spawn({ aheadZ: 50000, minZ: 40000, wave: 2, ...CAR });
    expect(b.z).toBeGreaterThan(50000);
    expect(stream.log.length).toBe(2);
    expect(a.z).toBeLessThan(40000);
  });
});
