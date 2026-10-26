// The rival rubber band never decides a clean race (ticket 0196). The real field (five roster
// cars at RIVAL_PACES, their personalities, the nemesis) drives the real rival AI over each
// level's real road and racing line, with the race's own difficulty ramp, against a clean
// player: one who never hits anything and holds the pace the balance harness measured for a
// clean expert run (docs/BALANCE.md § Rubber band). With the band on, that player still wins
// every level by a clear margin, and the band never takes more than a couple of seconds off it.
import { describe, it, expect, beforeEach } from 'vitest';
import { AI, aiTier, createAiWorld, setupField, stepRival } from '../../src/rival-ai.js';
import { RIVAL_PACES, RACE_LAPS, FIELD_SIZE, gridSlot, raceLengthFor, crossingTime, projectedFinish } from '../../src/raceflow.js';
import { track, setTrackSeed, setTrackLine, buildInitialTrack, generateNextTrackBiome, curvatureAt, bankAt, featureAt } from '../../src/track.js';
import { createLine } from '../../src/cleanline.js';
import { POP_CULTURE_ROSTER, ROAD_CFG, PACE_MODES, WORLD_LEVELS } from '../../src/data.js';
import { CAR_SPECS, carParams } from '../../src/cars.js';
import { difficultyOf } from '../../src/endless.js';
import { GameState } from '../../src/state.js';

const DT = 1 / 120;
// The slowest clean (no-hit) expert finish with the band on, as an average speed over the race:
// 112.9 mph on level 5 in the harness (BAL_MODE=band, 10 races a level). A little under it, so
// the player here is never quicker than a clean run really is.
const CLEAN_MPH = 112;
const MARGIN = 1.5; // s: the least a clean win may be by
const SEEDS = [1, 2, 3, 4, 5, 6];
const L = ROAD_CFG.segLength;

/** Race level `lv` once; returns the first rival's finish minus yours (s, + = you won). */
function race(lv, seed, band) {
  GameState.levelIndex = lv;
  setTrackSeed(0); // solo races keep each level's layout; the seed moves the line and the drivers
  const line = createLine(seed);
  setTrackLine(line);
  buildInitialTrack();
  const s2w = (11000 * PACE_MODES[0].mult) / 88;
  const length = raceLengthFor(lv);
  const road = { curvatureAt: (z) => curvatureAt(z) * L, bankAt, featureAt };
  const w = createAiWorld();
  w.speedToWorld = s2w;
  w.curvatureAt = road.curvatureAt; w.bankAt = road.bankAt; w.featureAt = road.featureAt;
  w.lineAt = (z) => line.centreAt(z);
  const z0 = ROAD_CFG.playerZOffset;
  const racers = POP_CULTURE_ROSTER.slice(1, FIELD_SIZE).map((rc, i) => {
    const slot = gridSlot(i);
    return {
      id: rc.id, rc, short: rc.driver, worldZ: z0 + slot.dz, offset: slot.offset, vx: 0, mph: 0,
      halfW: 0.14, halfL: 115, pace: RIVAL_PACES[i], progress: slot.dz / s2w, finishTime: null, takenDown: false,
    };
  });
  setupField(w, racers, { seed, pace: 1, cls: (r) => CAR_SPECS[r.id].cls, carP: (r) => carParams(r.rc) });
  const me = w.player;
  const diff = { mode: 'ARCADE', distance: 0, levelIndex: lv, levels: WORLD_LEVELS.length, raceLength: length };
  const out = {};
  const saved = { ...AI.band };
  if (!band) { AI.band.push = 0; AI.band.ease = 0; }
  try {
    let t = 0, dist = 0;
    while (dist < length) {
      t += DT;
      dist = Math.min(length, CLEAN_MPH * t);
      const pz = z0 + dist * s2w;
      while (track.end - Math.floor(pz / L) < ROAD_CFG.drawDistance + 85) generateNextTrackBiome();
      me.worldZ = pz; me.mph = CLEAN_MPH; me.offset = line.centreAt(pz);
      w.time = t;
      diff.distance = dist;
      w.tier = aiTier({ difficulty: difficultyOf(diff, out).difficulty });
      w.cars.length = 0;
      for (const r of racers) w.cars.push(r);
      w.cars.push(me);
      for (const r of racers) {
        stepRival(r, r.ai, w, r.progress - dist, DT);
        // The world step: integrate, damp the lateral, stop at the walls.
        r.offset += r.vx * DT; r.vx *= 1 - 5.2 * DT;
        if (Math.abs(r.offset) > 0.72) { r.offset = Math.sign(r.offset) * 0.72; r.vx = 0; }
        r.worldZ += r.mph * s2w * DT;
        const before = r.progress;
        r.progress = dist + (r.worldZ - pz) / s2w;
        if (r.finishTime == null && r.progress >= length) r.finishTime = crossingTime(t, DT, before, r.progress, length);
      }
    }
    const you = length / CLEAN_MPH;
    let first = Infinity;
    for (const r of racers) first = Math.min(first, r.finishTime != null ? r.finishTime : projectedFinish(you, r.progress, length, r.mph));
    return first - you;
  } finally {
    Object.assign(AI.band, saved);
  }
}

describe('rubber band fairness (0196)', () => {
  beforeEach(() => { GameState.levelIndex = 0; });

  it(`a clean ${RACE_LAPS}-lap race is won by at least ${MARGIN} s on every level with the band on`, () => {
    for (let lv = 0; lv < WORLD_LEVELS.length; lv++) {
      for (const seed of SEEDS) {
        const gap = race(lv, seed, true);
        expect(gap, `level ${lv + 1} seed ${seed}`).toBeGreaterThanOrEqual(MARGIN);
      }
    }
  });

  it('the band only ever takes a bounded slice of a clean lead, and never adds to it', () => {
    for (let lv = 0; lv < WORLD_LEVELS.length; lv++) {
      for (const seed of SEEDS) {
        const on = race(lv, seed, true), off = race(lv, seed, false);
        expect(on, `level ${lv + 1} seed ${seed}`).toBeLessThanOrEqual(off + 0.05);
        expect(off - on, `level ${lv + 1} seed ${seed}`).toBeLessThan(3);
      }
    }
  });

  it('switching the band off for a race leaves AI.band as it was', () => {
    const before = { ...AI.band };
    race(0, 1, false);
    expect(AI.band).toEqual(before);
    expect(AI.band.push).toBeGreaterThan(0);
  });
});
