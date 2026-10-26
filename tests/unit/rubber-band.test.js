// The rival rubber band never decides a clean race (ticket 0196). The default field (the five
// roster cars after the starter, at RIVAL_PACES on NORMAL, their personalities, the nemesis)
// drives the real rival AI over each level's road and racing line, with the race's own
// difficulty ramp, against a clean player: one who never hits anything and holds a steady pace
// across the range the balance harness measured for clean expert runs (docs/BALANCE.md §
// Rubber band). Not modelled: the standing start, traffic and obstacles, car contact, forks.
// The win margin mostly guards rival pace; the band guards are the relative ones: with the band
// on the player keeps at least half of its band-off lead, and never less than 1.5 s.
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
// Clean (no-hit) expert finishes in the harness (BAL_MODE=band, 10 races a level) average
// 112.9-124.6 mph over the race; the slowest is a little over CLEAN_MPH. The band costs the most at
// the fast end (rivals fall far enough behind to push), the margin is tightest at the slow end.
const CLEAN_MPH = 112;
const PACES = [CLEAN_MPH, 124];
const MARGIN = 1.5; // s: the least a clean win may be by
const SEEDS = [1, 2, 3, 4, 5, 6];
const L = ROAD_CFG.segLength;

const memo = new Map();
/** race(), remembered: the second test re-reads the first test's band-on races. */
function gapOf(lv, seed, band, mph) {
  const k = `${lv}:${seed}:${band}:${mph}`;
  if (!memo.has(k)) memo.set(k, race(lv, seed, band, mph));
  return memo.get(k);
}

/** Race level `lv` once; returns the first rival's finish minus yours (s, + = you won). */
function race(lv, seed, band, mph = CLEAN_MPH) {
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
      dist = Math.min(length, mph * t);
      const pz = z0 + dist * s2w;
      while (track.end - Math.floor(pz / L) < ROAD_CFG.drawDistance + 85) generateNextTrackBiome();
      me.worldZ = pz; me.mph = mph; me.offset = line.centreAt(pz);
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
    const you = length / mph;
    let first = Infinity;
    for (const r of racers) first = Math.min(first, r.finishTime != null ? r.finishTime : projectedFinish(you, r.progress, length, r.mph));
    return first - you;
  } finally {
    Object.assign(AI.band, saved);
  }
}

describe('rubber band fairness (0196)', () => {
  beforeEach(() => { GameState.levelIndex = 0; });

  it(`a clean ${RACE_LAPS}-lap race on NORMAL is won by at least ${MARGIN} s on every level with the band on`, () => {
    for (const mph of PACES) {
      for (let lv = 0; lv < WORLD_LEVELS.length; lv++) {
        for (const seed of SEEDS) {
          expect(gapOf(lv, seed, true, mph), `${mph} mph level ${lv + 1} seed ${seed}`).toBeGreaterThanOrEqual(MARGIN);
        }
      }
    }
  }, 30_000);

  it('the band keeps at least half of a clean lead, and never adds to a leader\'s', () => {
    for (const mph of PACES) {
      for (let lv = 0; lv < WORLD_LEVELS.length; lv++) {
        for (const seed of SEEDS) {
          const on = gapOf(lv, seed, true, mph), off = gapOf(lv, seed, false, mph);
          const at = `${mph} mph level ${lv + 1} seed ${seed}`;
          expect(on, at).toBeGreaterThanOrEqual(off * 0.5);
          expect(on, at).toBeLessThanOrEqual(off + 0.05); // rivals behind push; none ahead to ease off
        }
      }
    }
  }, 30_000);

  it('switching the band off for a race leaves AI.band as it was', () => {
    const before = { ...AI.band };
    race(0, 1, false);
    expect(AI.band).toEqual(before);
    expect(AI.band.push).toBeGreaterThan(0);
  });
});
