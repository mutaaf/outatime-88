// Endless track: the road is a fixed ring of pooled segments that rebuilds itself forever
// without growing, the 3D path forgets the road behind it the same way, and the layout bag
// keeps bringing back every curve and every set piece, deterministically per seed.
import { describe, it, expect, beforeEach } from 'vitest';
import { track, RING, resetTrack, buildInitialTrack, generateNextTrackBiome, setTrackSeed, fillBag, CURVES, SET_PIECES, segmentAt, featureAt } from '../../src/track.js';
import { createTrackPath, PATH_RING } from '../../src/render3d/path.js';
import { GameState } from '../../src/state.js';
import { ROAD_CFG } from '../../src/data.js';

const L = ROAD_CFG.segLength;
const AHEAD = ROAD_CFG.drawDistance + 85; // main.js builds when the road ahead is shorter than this

/** Drive `seconds` at `zPerSec`, building the road exactly as main.js does; calls `each(seg)`. */
function drive(seconds, zPerSec, each) {
  let pos = 0;
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) {
    pos += zPerSec * step;
    const cur = Math.floor((pos + ROAD_CFG.playerZOffset) / L);
    while (track.end - cur < AHEAD) generateNextTrackBiome();
    if (each) each(cur, pos);
  }
  return pos;
}

describe('endless track ring', () => {
  beforeEach(() => { GameState.levelIndex = 0; setTrackSeed(0); });

  it('drives 40 minutes at top speed with a constant ring, pool and item pool', () => {
    buildInitialTrack();
    const allocatedAtStart = track.allocated;
    let maxAhead = 0, minBehind = Infinity, maxPool = 0;
    drive(40 * 60, 11500, (cur) => {
      maxAhead = Math.max(maxAhead, track.end - cur);
      if (track.start > 0) minBehind = Math.min(minBehind, cur - track.start);
    });
    expect(track.end).toBeGreaterThan(RING * 50);       // the road really went a long way…
    expect(track.end - track.start).toBe(RING);          // …in a window that never grew
    expect(track.allocated).toBeLessThanOrEqual(RING);   // every segment object was reused
    expect(track.allocated).toBeGreaterThanOrEqual(allocatedAtStart);
    expect(track.ring.length).toBe(RING);
    for (const s of track.ring) maxPool = Math.max(maxPool, s.itemPool.length);
    expect(maxPool).toBeLessThan(8);                      // pooled items per slot stay tiny
    expect(maxAhead).toBeLessThan(RING / 2);             // generation never laps the player…
    expect(minBehind).toBeGreaterThan(RING / 3);         // …and the camera/lookbehind keep a wide margin
  });

  it('reads the right segment across the wrap and nothing outside the window', () => {
    buildInitialTrack();
    while (track.end < RING * 3 + 17) generateNextTrackBiome();
    for (let i = track.start; i < track.end; i++) {
      const s = track.seg(i);
      expect(s.index).toBe(i);
      expect(s.p1.world.z).toBe(i * L);
      if (i > track.start) expect(s.p1.world.y).toBe(track.seg(i - 1).p2.world.y);
    }
    expect(track.seg(track.start - 1)).toBeNull();
    expect(track.seg(track.end)).toBeNull();
    expect(segmentAt(track.start * L - 1)).toBeNull();
    expect(segmentAt((track.end - 1) * L + 5).index).toBe(track.end - 1);
    // A recycled slot carries nothing over from the segment it used to be.
    for (const s of track.liveSegments()) {
      if (s.feature) expect(s.feature.z0).toBeLessThanOrEqual(s.p1.world.z);
      if (s.feature) expect(s.feature.z0 + s.feature.length).toBeGreaterThan(s.p1.world.z);
      expect(s.flameLeft).toBe(false);
      for (const it of s.items) {
        if (it.collected !== undefined) expect(it.collected).toBe(false);
      }
    }
  });

  it('a reset reuses the pool and starts a fresh road at Z 0', () => {
    buildInitialTrack();
    while (track.end < RING * 2) generateNextTrackBiome();
    const seg = track.seg(track.end - 1);
    seg.items.forEach((it) => { if (it.collected !== undefined) it.collected = true; });
    const n = track.allocated;
    const run = track.run;
    buildInitialTrack();
    expect(track.run).not.toBe(run);
    expect(track.start).toBe(0);
    expect(track.seg(0).p1.world.y).toBe(0);
    expect(track.allocated).toBe(n);
    for (const s of track.liveSegments()) for (const it of s.items) if (it.collected !== undefined) expect(it.collected).toBe(false);
  });

  it('the 3D path follows the endless road in a fixed ring, continuous and through every loop', () => {
    buildInitialTrack();
    const path = createTrackPath({ zScale: 0.03, xScale: 0.005, yScale: 0.025 });
    const o = {}, prev = {};
    let checked = 0;
    drive(15 * 60, 11500, (cur) => {
      path.sync(track);
      if (cur % 7 !== 0) return;
      path.at(cur * L, 0, o);
      path.at((cur - 1) * L, 0, prev);
      expect(Math.hypot(o.x - prev.x, o.y - prev.y, o.z - prev.z)).toBeLessThan(L * 0.03 * 1.6);
      expect(Math.hypot(o.ux, o.uy, o.uz)).toBeCloseTo(1, 6);
      const f = featureAt(cur * L);
      if (f && f.kind === 'LOOP' && Math.abs((cur * L - f.z0) / f.length - 0.5) < 0.03) {
        expect(o.uy).toBeLessThan(-0.9); // upside down at the top of the loop, far down the road
        checked++;
      }
    });
    expect(path.x.length).toBe(PATH_RING);
    expect(path.count).toBe(track.end);
    expect(checked).toBeGreaterThan(0);
  });

  it('a path can start on a road whose start was already recycled', () => {
    buildInitialTrack();
    while (track.start < 3000) generateNextTrackBiome();
    const path = createTrackPath();
    path.sync(track);
    const a = path.at((track.start + 10) * L, 0.3, {});
    expect(Number.isFinite(a.x) && Number.isFinite(a.z)).toBe(true);
    expect(path.at(0, 0, {}).z).toBeCloseTo(0, 6); // clamps to the oldest boundary it holds
  });
});

describe('endless layout bag', () => {
  const ALL = [...CURVES, ...SET_PIECES];

  it('every bag holds every curve and every set piece once, never two set pieces in a row', () => {
    const bag = [];
    for (let lvl = 0; lvl < 5; lvl++) {
      for (const seed of [0, 1, 7, 123456, -99]) {
        let last = null;
        for (let n = 0; n < 30; n++) {
          fillBag(bag, lvl, seed, n);
          const names = bag.filter((_, i) => i % 2 === 0);
          expect([...names].sort()).toEqual([...ALL].sort());
          for (let i = 1; i < bag.length; i += 2) expect([-1, 1]).toContain(bag[i]);
          const seq = last ? [last, ...names] : names;
          for (let i = 1; i < seq.length; i++) {
            expect(SET_PIECES.includes(seq[i]) && SET_PIECES.includes(seq[i - 1]), `${seq[i - 1]} then ${seq[i]}`).toBe(false);
          }
          last = names[names.length - 1];
        }
      }
    }
  });

  it('the endless road brings back every piece at least every two bags, forever', () => {
    GameState.levelIndex = 2;
    setTrackSeed(0);
    buildInitialTrack();
    const lastSeen = {};
    let pieces = 0;
    for (let b = 0; b < 600; b++) {
      track.lastPiece = '';
      generateNextTrackBiome();
      if (!track.lastPiece) continue;
      pieces++;
      lastSeen[track.lastPiece] = pieces;
      if (pieces > 20) for (const k of ALL) expect(pieces - (lastSeen[k] || 0), k).toBeLessThan(20);
    }
    expect(Object.keys(lastSeen).sort()).toEqual([...ALL].sort());
  });

  it('same seed, same road; another seed, another road; set pieces always behind a booster gate', () => {
    const road = (seed, lvl = 1) => {
      GameState.levelIndex = lvl;
      setTrackSeed(seed);
      buildInitialTrack();
      for (let i = 0; i < 20; i++) generateNextTrackBiome();
      return JSON.stringify(track.liveSegments());
    };
    expect(road(4242)).toBe(road(4242));
    expect(road(0)).toBe(road(0));
    expect(road(4242)).not.toBe(road(0));
    for (const seed of [0, 4242, 9]) {
      road(seed, 0);
      let prevKind = null;
      for (const s of track.liveSegments()) {
        const f = s.feature;
        if (f && f.z0 === s.p1.world.z && (f.kind === 'LOOP' || f.kind === 'CORKSCREW' || f.kind === 'WALLRIDE')) expect(prevKind).toBe('BOOSTER');
        prevKind = f ? f.kind : null;
      }
    }
  });

  it('bag 0 leads each level with its signature set piece so short races meet one early', () => {
    const bag = [];
    for (let lvl = 0; lvl < 5; lvl++) {
      fillBag(bag, lvl, 0, 0);
      const firstSet = bag.filter((_, i) => i % 2 === 0).find((p) => SET_PIECES.includes(p));
      expect(firstSet).toBe(SET_PIECES[lvl % SET_PIECES.length]);
    }
  });
});

describe('reset helper', () => {
  it('resetTrack empties the window but keeps the pooled objects', () => {
    buildInitialTrack();
    const n = track.allocated;
    resetTrack();
    expect(track.end).toBe(0);
    expect(track.seg(0)).toBeNull();
    expect(track.allocated).toBe(n);
  });
});
