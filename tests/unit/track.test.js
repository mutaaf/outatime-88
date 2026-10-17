import { describe, it, expect, beforeEach } from 'vitest';
import { track, generateNextTrackBiome, buildInitialTrack, resetTrack } from '../../src/track.js';
import { GameState } from '../../src/state.js';
import { ROAD_CFG, WORLD_LEVELS } from '../../src/data.js';

// Items that sit on the road surface and can occupy a lane. Roadside props (|offset| > 1)
// and overhead rings don't block anything.
const LANES = [-1, 0, 1];
const laneOf = (offset) => Math.round(offset / 0.52);
const blocksLane = (item) => Math.abs(item.offset) < 1 && item.type !== 'OVERHEAD_GATE' && item.collected === undefined;

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

  it('every row leaves at least one lane open', () => {
    for (let lvl = 0; lvl < WORLD_LEVELS.length; lvl++) {
      for (const seg of generate(20, lvl)) {
        const blocked = new Set(seg.items.filter(blocksLane).map(it => laneOf(it.offset)));
        expect(LANES.some(l => !blocked.has(l)), `segment ${seg.index}`).toBe(true);
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
