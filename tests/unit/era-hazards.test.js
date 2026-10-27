// Era signature hazards (ticket 0113): each era resolves one original knockable prop, the spill
// is deterministic per seed and never consumes the race RNG, it always leaves the racing line
// open, and it lands far enough ahead to be seen for ≥ 1 s at 120 mph on the fastest pace.
import { describe, it, expect } from 'vitest';
import { ERAS, PACE_MODES } from '../../src/data.js';
import { MATERIALS } from '../../src/materials.js';
import { createLine, createHazardPlanner } from '../../src/cleanline.js';
import { mulberry32 } from '../../src/daily.js';
import { ERA_HAZARDS, eraHazard, eraHazardKind, eraSpill, eraBody, SPILL } from '../../src/era-hazards.js';

/** Plan a race's prop patterns the way LiveTraffic.spawnProps does; returns every placement. */
function runProps(seed, era, { level = 0, wave = 1, ahead = 9000, length = 400000, force = false } = {}) {
  const rand = mulberry32(seed);
  const line = createLine(seed);
  const planner = createHazardPlanner({ line, rand, level });
  const hz = eraHazard(era);
  const out = [];
  let nextPropZ = 9000;
  for (let pz = 0; pz <= length; pz += 100) {
    if (pz + ahead < nextPropZ) continue;
    const plan = planner.planProps(nextPropZ, wave);
    const spill = eraSpill(line, plan, hz, null, force);
    for (const it of spill || plan.items) out.push({ ...it, spawnedAt: pz, era: !!spill });
    nextPropZ = plan.nextZ;
  }
  return { out, line, rand };
}

describe('era signature hazards (0113)', () => {
  it('every era resolves its own knockable hazard with a small cone-scale penalty', () => {
    const kinds = new Set();
    for (const era of ERAS) {
      const hz = eraHazard(era);
      expect(hz, era.id).toBeTruthy();
      // the shared footprint covers every kind, so the line check is the same in every era
      expect(hz.halfW).toBeLessThanOrEqual(SPILL.halfW);
      expect(hz.halfL).toBeLessThanOrEqual(SPILL.halfL);
      expect(hz.label.length).toBeLessThanOrEqual(12);
      // lighter than a barrel and never a solid block: you swat it, it doesn't stop you
      expect(hz.massKg).toBeLessThan(MATERIALS.OIL_BARREL.massKg);
      expect(hz.halfW).toBeLessThanOrEqual(MATERIALS.OIL_BARREL.halfW);
      expect(MATERIALS[hz.kind]).toBeUndefined(); // its own kind, not a renamed cone or barrel
      expect(eraHazardKind(hz.kind)).toBe(hz);
      kinds.add(hz.kind);
    }
    expect(kinds.size).toBe(ERAS.length);
    expect(Object.keys(ERA_HAZARDS).sort()).toEqual(ERAS.map((e) => e.id).sort());
    expect(eraHazardKind('TRAFFIC_CONE')).toBeNull();
  });

  it('builds a knockable body from the config', () => {
    const hz = ERA_HAZARDS[1885];
    const o = eraBody({ massKg: 320, knockable: false, clearanceY: 24 }, hz);
    expect(o).toMatchObject({ massKg: 2, knockable: true, clearanceY: 0, halfW: hz.halfW, halfL: hz.halfL, height: hz.height });
  });

  it('spills show up in every era, at about their rate, and are deterministic per seed', () => {
    for (const era of ERAS) {
      const a = runProps(7, era).out, b = runProps(7, era).out;
      expect(a).toEqual(b);
      const kinds = a.filter((p) => p.era);
      expect(kinds.length, era.id).toBeGreaterThan(0);
      expect(kinds.every((p) => p.type === eraHazard(era).kind)).toBe(true);
    }
    // different seeds give different spill placements
    const s1 = runProps(1, ERAS[2]).out.filter((p) => p.era).map((p) => p.z);
    const s2 = runProps(2, ERAS[2]).out.filter((p) => p.era).map((p) => p.z);
    expect(s1).not.toEqual(s2);
    // the share of patterns that spill sits near the era's rate
    let spills = 0, patterns = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { out } = runProps(seed, ERAS[0]);
      const zs = new Set(); const sp = new Set();
      for (const p of out) { const key = p.spawnedAt; zs.add(key); if (p.era) sp.add(key); }
      patterns += zs.size; spills += sp.size;
    }
    expect(SPILL.rate).toBeLessThan(0.5); // most patterns stay cones and barrels
    expect(spills / patterns).toBeGreaterThan(SPILL.rate - 0.12);
    expect(spills / patterns).toBeLessThan(SPILL.rate + 0.12);
  });

  it('places the same spills in every era: a warp at a different moment never moves a prop', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const where = (era) => runProps(seed, era, { level: seed % 6 }).out.map((p) => `${p.era ? 'S' : p.type}@${p.z}:${p.offset}`);
      const first = where(ERAS[0]);
      for (const era of ERAS.slice(1)) expect(where(era), `seed ${seed} ${era.id}`).toEqual(first);
    }
  });

  it('never draws from the race RNG: traffic and every other pattern stay as they were', () => {
    const a = runProps(11, ERAS[1]);
    const b = runProps(11, null); // no era hazard at all
    expect(a.rand()).toBe(b.rand());
    const plain = (r) => r.out.filter((p) => !p.era).map((p) => `${p.type}@${p.z}`);
    for (const p of plain(a)) expect(plain(b)).toContain(p);
  });

  it('always leaves the racing line open and keeps to one side of it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const era of ERAS) {
        const { out, line } = runProps(seed, era, { level: seed % 6, wave: 1 + (seed % 4), length: 150000, force: true });
        const hz = eraHazard(era);
        const spill = out.filter((p) => p.era);
        expect(spill.length).toBeGreaterThan(0);
        for (const p of spill) {
          expect(line.isClear(p.z, p.offset, hz.halfW, hz.halfL)).toBe(true);
          expect(Math.abs(p.offset)).toBeLessThanOrEqual(0.7);
          // the spill sits on the far side of the line: the line's side of the road is open
          expect((p.offset - line.centreAt(p.z)) * p.offset).toBeGreaterThan(0);
        }
        const sides = new Map();
        for (const p of spill) sides.set(p.spawnedAt, (sides.get(p.spawnedAt) || new Set()).add(Math.sign(p.offset)));
        for (const s of sides.values()) expect(s.size).toBe(1);
      }
    }
  });

  it('lands ≥ 1 s ahead at 120 mph on the fastest pace when it spawns', () => {
    const turbo = Math.max(...PACE_MODES.map((p) => p.mult));
    const perSecond = 120 * (11000 * turbo) / 88;
    for (let seed = 1; seed <= 20; seed++) {
      // the spawner checks every step; at 120 mph a 120 Hz step moves ~81 units, here 100
      const { out } = runProps(seed, ERAS[seed % ERAS.length], { force: true, length: 200000 });
      for (const p of out.filter((q) => q.era)) {
        const playerZ = p.spawnedAt; // spawnProps(playerZ) gets the player's track Z
        expect((p.z - playerZ) / perSecond, `seed ${seed} z ${p.z}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('stays out of set pieces', () => {
    const line = createLine(3);
    const plan = { items: [{ type: 'TRAFFIC_CONE', z: 20000, offset: 0.5 }], nextZ: 30000 };
    expect(eraSpill(line, plan, ERA_HAZARDS[2088], () => false, true)).not.toBeNull();
    expect(eraSpill(line, plan, ERA_HAZARDS[2088], () => true, true)).toBeNull();
    expect(eraSpill(line, { items: [], nextZ: 30000 }, ERA_HAZARDS[2088], null, true)).toBeNull();
  });
});
