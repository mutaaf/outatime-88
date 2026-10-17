import { describe, it, expect, beforeEach } from 'vitest';
import { track, generateNextTrackBiome, buildInitialTrack, resetTrack, addRoadSection, segmentAt, curvatureAt, bankAt, pitchAt, featureAt } from '../../src/track.js';
import { GameState } from '../../src/state.js';
import { ROAD_CFG, WORLD_LEVELS } from '../../src/data.js';

// Anything on the road surface that the player must avoid occupies a lane: segment cars
// (traffic, roadblocks) and non-pickup items. Roadside props (|offset| >= 1), overhead
// rings and collectible pickups don't block. Today generation places no obstacles, so this
// guards future content tickets; the sanity test below proves the check can fail.
const LANES = [-1, 0, 1];
const laneOf = (offset) => Math.max(-1, Math.min(1, Math.round(offset / 0.52)));
const PASSABLE = new Set(['OVERHEAD_GATE', 'PLUTONIUM', 'HW_COIN', 'REPAIR_WRENCH']);
function openLanes(seg) {
  const blocked = new Set();
  for (const it of seg.items) if (Math.abs(it.offset) < 1 && !PASSABLE.has(it.type)) blocked.add(laneOf(it.offset));
  for (const car of seg.cars) if (Math.abs(car.offset) < 1) blocked.add(laneOf(car.offset));
  return LANES.filter(l => !blocked.has(l));
}

function generate(biomes, levelIndex = 0) {
  GameState.levelIndex = levelIndex;
  resetTrack();
  for (let i = 0; i < biomes; i++) generateNextTrackBiome();
  return track.segments;
}

describe('track generation (ticket 0004)', () => {
  beforeEach(() => { GameState.levelIndex = 0; });

  it('segment z increases monotonically and the road is continuous over 20 biomes', () => {
    for (let lvl = 0; lvl < WORLD_LEVELS.length; lvl++) {
      const segs = generate(20, lvl);
      expect(segs.length).toBeGreaterThan(500);
      expect(track.generatedCount).toBe(20);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        expect(s.index).toBe(i);
        expect(s.p2.world.z).toBeGreaterThan(s.p1.world.z);
        expect(s.p2.world.z - s.p1.world.z).toBe(ROAD_CFG.segLength);
        if (i > 0) {
          expect(s.p1.world.z).toBe(segs[i - 1].p2.world.z);
          expect(s.p1.world.y).toBe(segs[i - 1].p2.world.y);
        }
        expect(Number.isFinite(s.p2.world.y)).toBe(true);
        expect(Number.isFinite(s.curve)).toBe(true);
      }
    }
  });

  it('the open-lane check detects a fully blocked row', () => {
    const wall = { items: [{ offset: -0.52, type: 'HOLO_BARRIER' }, { offset: 0.52, type: 'HOLO_BARRIER' }], cars: [{ offset: 0 }] };
    expect(openLanes(wall)).toEqual([]);
    expect(openLanes({ items: [{ offset: 0, type: 'HW_COIN' }, { offset: 0, type: 'OVERHEAD_GATE' }, { offset: 1.42, type: 'STREET_LAMP' }], cars: [] })).toEqual(LANES);
  });

  it('every row leaves at least one lane open', () => {
    for (let lvl = 0; lvl < WORLD_LEVELS.length; lvl++) {
      for (const seg of generate(20, lvl)) {
        expect(openLanes(seg).length, `segment ${seg.index}`).toBeGreaterThan(0);
      }
    }
  });

  it('pickups sit inside a lane', () => {
    for (const seg of generate(20)) {
      for (const it of seg.items) {
        if (it.collected === undefined) continue;
        expect(LANES).toContain(laneOf(it.offset));
        expect(Math.abs(it.offset)).toBeLessThan(1);
      }
    }
  });

  it('is deterministic for a level', () => {
    const a = JSON.stringify(generate(20, 2));
    const b = JSON.stringify(generate(20, 2));
    expect(a).toBe(b);
  });

  it('a chosen fork branch produces its layout', () => {
    generate(1);
    const before = track.segments.length;
    generateNextTrackBiome('LEFT');
    expect(track.segments.slice(before).some(s => s.trackType === 'LOOP')).toBe(true);
  });

  it('buildInitialTrack starts fresh with six biomes and a fork in them', () => {
    generate(20);
    const old = track.segments;
    buildInitialTrack();
    expect(track.segments).not.toBe(old);
    expect(track.generatedCount).toBe(6);
    expect(track.segments[0].p1.world.z).toBe(0);
    expect(track.segments.some(s => s.trackType === 'SPLIT_FORK' && s.forkInfo)).toBe(true);
  });
});

describe('road contract (sprint 4)', () => {
  it('reads curvature, bank, pitch and features per Z, neutral off the road', () => {
    resetTrack();
    addRoadSection(0, 10, 0, 0.8, 400, 0.2, 'STANDARD');
    const L = ROAD_CFG.segLength;
    expect(segmentAt(L * 3.5).index).toBe(3);
    expect(curvatureAt(L * 3.5)).toBeCloseTo(0.8 / L);
    expect(bankAt(L * 3.5)).toBeCloseTo(0.2);
    expect(pitchAt(L * 3.5)).toBeCloseTo(Math.atan2(40, L));
    expect(featureAt(L * 3.5)).toBeNull();
    for (const z of [-1, L * 10 + 1]) {
      expect(curvatureAt(z)).toBe(0); expect(bankAt(z)).toBe(0); expect(pitchAt(z)).toBe(0); expect(featureAt(z)).toBeNull();
    }
  });
});
