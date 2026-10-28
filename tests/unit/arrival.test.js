import { describe, it, expect, beforeEach } from 'vitest';
import { track, generateNextTrackBiome, resetTrack, addRoadSection, addItem, hasSetPieceBetween, featureAt, setTrackSeed } from '../../src/track.js';
import { GameState } from '../../src/state.js';
import { ROAD_CFG } from '../../src/data.js';
import { ARRIVALS, arrivalLength, queueArrival, buildArrival } from '../../src/arrival.js';

// Ticket 0218: the first warp of a run lands on a short authored stretch.
const L = ROAD_CFG.segLength;
const T = { track, addRoadSection, addItem, segLength: L };
const solo = { warps: 1, shared: false, seed: 0 };

/** What the race step does when it needs more road: the queued stretch, else the next biome. */
function more() {
  if (!(track.run.arrival && buildArrival(T))) generateNextTrackBiome();
}

function fresh() {
  GameState.levelIndex = 0;
  setTrackSeed(0);
  resetTrack();
  for (let i = 0; i < 3; i++) generateNextTrackBiome();
}

/** Every segment's shape, items included, for comparing two roads. */
const shape = (s) => ({ curve: s.curve, bank: s.bank, dy: s.p2.world.y - s.p1.world.y, type: s.trackType, f: s.feature && s.feature.kind, items: s.items.map((it) => `${it.type}@${it.offset.toFixed(3)}`).join() });

describe('arrival stretch (0218)', () => {
  beforeEach(fresh);

  it('the 1985 stretch is 6 to 8 authored sections long', () => {
    const a = ARRIVALS[1985];
    expect(a.rows.length).toBeGreaterThanOrEqual(6);
    expect(a.rows.length).toBeLessThanOrEqual(8);
    expect(a.straight).toBeGreaterThan(0);
    expect(a.straight).toBeLessThan(a.rows.length);
    // Long enough to read at warp speed: ~5 s at 88 mph on the default pace (3,520 units/s).
    expect(arrivalLength(1985) * L).toBeGreaterThan(5 * 3520);
    // The sweeper is gentle and every row's curve stays well inside the generator's range.
    for (const r of a.rows) expect(Math.abs(r[3])).toBeLessThan(0.8);
  });

  it('queues only on the first warp of a solo run, once, and only for an era that has one', () => {
    expect(queueArrival(track.run, '1985', { ...solo, warps: 2 })).toBe(false);
    expect(queueArrival(track.run, '1985', { ...solo, shared: true })).toBe(false); // live room or daily
    expect(queueArrival(track.run, '1985', { ...solo, seed: 1234 })).toBe(false); // any seeded road
    expect(queueArrival(track.run, '2026', solo)).toBe(false); // no stretch for that era yet
    expect(track.run.arrival).toBeFalsy();
    expect(queueArrival(track.run, '1985', solo)).toBe(true);
    expect(track.run.arrival).toBe('1985');
    expect(queueArrival(track.run, '1985', solo)).toBe(false);
  });

  it('a first warp into an era without a stretch uses up the run: a later warp gets none', () => {
    expect(queueArrival(track.run, '2026', solo)).toBe(false);
    expect(queueArrival(track.run, '1985', { ...solo, warps: 2 })).toBe(false);
  });

  it('a new road starts with nothing queued', () => {
    queueArrival(track.run, '1985', solo);
    resetTrack();
    expect(track.run.arrival).toBeFalsy();
    expect(queueArrival(track.run, '1985', solo)).toBe(true);
  });

  it('is built once, in place of the next biome, continuous with the road before and after', () => {
    queueArrival(track.run, '1985', solo);
    const i0 = track.end, gen = track.generatedCount;
    more();
    const at = track.run.arrivalAt;
    expect(at).toEqual({ era: '1985', z0: i0 * L, z1: (i0 + arrivalLength(1985)) * L });
    expect(track.end - i0).toBe(arrivalLength(1985));
    expect(track.generatedCount).toBe(gen); // the generator's cadence is untouched
    for (let k = 0; k < 4; k++) more();
    expect(track.run.arrivalAt).toBe(at);
    const segs = track.liveSegments();
    expect(segs.filter((s) => s.feature && s.feature.kind === 'ARRIVAL').length).toBe(arrivalLength(1985));
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].index).toBe(segs[i - 1].index + 1);
      expect(segs[i].p1.world.z).toBe(segs[i - 1].p2.world.z);
      expect(segs[i].p1.world.y).toBe(segs[i - 1].p2.world.y);
    }
    // No kinks in or at the ends of the stretch: its sections ease in and out.
    for (let i = i0; i <= i0 + arrivalLength(1985); i++) {
      expect(Math.abs(track.seg(i).curve - track.seg(i - 1).curve), `segment ${i}`).toBeLessThan(0.15);
      expect(Math.abs(track.seg(i).bank - track.seg(i - 1).bank), `segment ${i}`).toBeLessThan(0.04);
    }
    // It enters and leaves straight.
    const first = track.seg(i0), last = track.seg(i0 + arrivalLength(1985) - 1);
    expect(first.curve).toBe(0);
    expect(Math.abs(last.curve)).toBeLessThan(0.05);
  });

  it('then the generator resumes exactly where it was: the road after is the road it would have built', () => {
    for (let k = 0; k < 6; k++) more();
    const plain = track.liveSegments().slice(-200).map(shape);

    fresh();
    queueArrival(track.run, '1985', solo);
    for (let k = 0; k < 7; k++) more();
    const after = track.liveSegments().slice(-200).map(shape);
    // The same pieces in the same order; only their absolute index moved (pickups key on it).
    expect(after.map(({ items, ...s }) => s)).toEqual(plain.map(({ items, ...s }) => s));
  });

  it('every lane stays open: nothing on the road, set-piece rules keep obstacles, props and hazards off it', () => {
    queueArrival(track.run, '1985', solo);
    more();
    const { z0, z1 } = track.run.arrivalAt;
    for (let z = z0; z < z1; z += L) {
      const seg = track.seg(Math.floor(z / L));
      expect(featureAt(z).kind).toBe('ARRIVAL');
      expect(seg.cars.length).toBe(0);
      for (const it of seg.items) expect(Math.abs(it.offset), it.type).toBeGreaterThanOrEqual(1.4);
      expect(hasSetPieceBetween(z, z + 1)).toBe(true);
    }
    // Lined along the straight with the era's roadside kit, both sides; lamps the whole way but
    // never more than the 3D lamp pool (48) holds; no clock towers (ticket 0189 is the operator's).
    const items = track.liveSegments().filter((s) => s.feature && s.feature.kind === 'ARRIVAL').flatMap((s) => s.items);
    const kit = items.filter((it) => it.type === 'ARCH_HW' || it.type === 'PALM_TREE');
    expect(kit.length).toBeGreaterThanOrEqual(10);
    expect(new Set(kit.map((s) => Math.sign(s.offset))).size).toBe(2);
    const lamps = items.filter((it) => it.type === 'STREET_LAMP').length;
    expect(lamps).toBeGreaterThanOrEqual(20);
    expect(lamps).toBeLessThanOrEqual(40);
    expect(items.some((it) => it.type === 'CLOCK_TOWER_BILLBOARD')).toBe(false);
    // No sponsor boards (docs/ADS.md slots stay where they are documented).
    expect(items.some((it) => it.type === 'BILLBOARD')).toBe(false);
  });

  it('with nothing queued the road is exactly the generator\'s', () => {
    expect(buildArrival(T)).toBeNull();
    for (let k = 0; k < 4; k++) more();
    expect(track.liveSegments().some((s) => s.feature && s.feature.kind === 'ARRIVAL')).toBe(false);
  });
});
