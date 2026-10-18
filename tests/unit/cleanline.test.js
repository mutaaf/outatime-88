// Sprint 4: there is always at least one way through a race without losing a point.
// The harness drives src/cleanline.js the way main.js's LiveTraffic does (obstacle recycling,
// prop patterns, traffic spawns and lane keeping), then checks two things: the racing line
// itself never touches anything that costs points, and a lane × distance search finds a
// clean path a slow-steering car can actually drive.
import { describe, it, expect } from 'vitest';
import { createLine, createHazardPlanner, densityAt, LINE, TRAFFIC_LATERAL } from '../../src/cleanline.js';
import { materialFor } from '../../src/materials.js';
import { mulberry32 } from '../../src/daily.js';
import { raceLengthFor } from '../../src/raceflow.js';

const PLAYER_HALF_W = 0.14, PLAYER_HALF_L = 105, WALL = 0.72;
const TRAFFIC = [ // matches LiveTraffic.init
  { halfW: 0.16, halfL: 160, mph: 38 }, { halfW: 0.13, halfL: 105, mph: 42 },
  { halfW: 0.13, halfL: 105, mph: 46 }, { halfW: 0.13, halfL: 105, mph: 50 },
];

/** Simulate one race at a constant player speed; returns the hazard snapshot per Z step. */
function runRace(seed, level, { mph = 90, pace = 0.46, step = 200, trafficOnly = false } = {}) {
  const rand = mulberry32(seed);
  const line = createLine(seed);
  const planner = createHazardPlanner({ line, rand, level });
  const s2w = (11000 * pace) / 88;
  const vp = mph * s2w;
  const raceZ = raceLengthFor(level) * s2w;
  const wave = 1;
  // Initial obstacles and traffic, as LiveTraffic.init places them.
  const obstacles = [];
  const statics = []; // every obstacle and prop ever placed
  let placed = 0;
  let fromZ = 3200;
  for (let i = 0; i < 4; i++) {
    const o = planner.placeObstacle(i, fromZ, wave);
    obstacles.push(o);
    statics.push(o);
    fromZ = o.z + planner.obstacleSpacing(o.z, wave);
  }
  const traffic = TRAFFIC.map((t, i) => {
    const z = 4800 + i * 5200;
    return { ...t, z, offset: planner.trafficLane(i, z, wave, t.halfW, t.halfL) };
  });
  const props = [];
  let nextPropZ = 9000;
  const frames = [];
  const dt = step / vp;
  for (let pz = 0; pz <= raceZ; pz += step) {
    for (let i = 0; i < traffic.length; i++) {
      const tr = traffic[i];
      tr.z += tr.mph * s2w * dt;
      const target = planner.trafficTarget(tr.z, tr.offset, tr.halfW, tr.halfL);
      tr.offset += Math.max(-TRAFFIC_LATERAL * dt, Math.min(TRAFFIC_LATERAL * dt, target - tr.offset));
      if (tr.z - pz < -800) {
        const maxT = Math.max(pz + 12000, ...traffic.map((t) => t.z));
        tr.z = maxT + 4800 + rand() * 2200;
        tr.offset = planner.trafficLane(i, tr.z, wave, tr.halfW, tr.halfL);
      }
    }
    for (let i = 0; i < obstacles.length; i++) {
      if (obstacles[i].z - pz < -600) {
        let ahead = pz + 4200;
        for (const o of obstacles) if (o.z > ahead) ahead = o.z;
        const next = planner.placeObstacle(i, ahead + planner.obstacleSpacing(ahead, wave), wave);
        obstacles[i] = next;
        statics.push(next);
        if (next.z <= raceZ) placed++;
      }
    }
    if (pz + 9000 >= nextPropZ) {
      const p = planner.planProps(nextPropZ, wave);
      for (const it of p.items) { props.push(it); statics.push(it); }
      nextPropZ = p.nextZ;
    }
    if (trafficOnly) { const near = []; for (const t of traffic) if (Math.abs(t.z - pz) < t.halfL + PLAYER_HALF_L) near.push({ offset: t.offset, halfW: t.halfW, kind: 'TRAFFIC' }); frames.push({ pz, line: line.centreAt(pz), near, dt }); continue; }
    const near = [];
    const touch = (z, offset, halfW, halfL, kind) => {
      if (Math.abs(z - pz) < halfL + PLAYER_HALF_L) near.push({ offset, halfW, kind });
    };
    for (const o of obstacles) { const m = materialFor(o.type); touch(o.z, o.offset, m.halfW, m.halfL, o.type); }
    for (const p of props) { const m = materialFor(p.type); touch(p.z, p.offset, m.halfW, m.halfL, p.type); }
    for (const t of traffic) touch(t.z, t.offset, t.halfW, t.halfL, 'TRAFFIC');
    frames.push({ pz, line: line.centreAt(pz), near, dt });
  }
  return { frames, line, statics, props: props.filter((p) => p.z <= raceZ), placed: placed + 4, raceZ };
}

const blockedAt = (near, x) => near.some((h) => Math.abs(x - h.offset) < h.halfW + PLAYER_HALF_W);

/** Lane × distance search: can a car steering at LINE.minLateral get through untouched? */
function cleanPathExists(frames) {
  const N = 73; const xs = Array.from({ length: N }, (_, k) => -WALL + (2 * WALL * k) / (N - 1));
  let reach = xs.map((x) => Math.abs(x) < 0.05);
  for (const f of frames) {
    const r = (LINE.minLateral * f.dt) / ((2 * WALL) / (N - 1));
    const next = new Array(N).fill(false);
    for (let k = 0; k < N; k++) {
      if (!reach[k]) continue;
      const lo = Math.max(0, Math.floor(k - r)), hi = Math.min(N - 1, Math.ceil(k + r));
      for (let j = lo; j <= hi; j++) next[j] = true;
    }
    for (let k = 0; k < N; k++) if (next[k] && blockedAt(f.near, xs[k])) next[k] = false;
    if (!next.some(Boolean)) return { ok: false, at: f.pz };
    reach = next;
  }
  return { ok: true };
}

describe('the clean line (sprint 4)', () => {
  it('starts on the centre, stays inside the walls and never outruns the slowest steering', () => {
    for (let seed = 1; seed < 60; seed++) {
      const line = createLine(seed);
      expect(line.centreAt(0)).toBe(0);
      let prev = line.centreAt(0);
      for (let z = 100; z < 600000; z += 400) {
        const c = line.centreAt(z);
        expect(Math.abs(c)).toBeLessThanOrEqual(LINE.maxCentre + 1e-9);
        // lateral speed needed to follow it at top speed
        expect((Math.abs(c - prev) / 400) * LINE.topWorldSpeed).toBeLessThan(LINE.minLateral);
        prev = c;
      }
    }
  }, 60000);

  it('is deterministic per seed', () => {
    const a = createLine(42), b = createLine(42), c = createLine(43);
    for (const z of [5000, 77777, 300000]) expect(a.centreAt(z)).toBe(b.centreAt(z));
    expect(a.centreAt(77777)).not.toBe(c.centreAt(77777));
  });

  it('500 seeds × every level: nothing that costs points ever touches the line', () => {
    for (let level = 0; level < 5; level++) {
      for (let seed = 1; seed <= 500; seed++) {
        const { frames, statics, line } = runRace(seed * 7919 + level, level, { mph: seed % 2 ? 60 : 110, trafficOnly: true });
        // Obstacles, cones and barrels: the line keeps clear of them over their whole length.
        for (const h of statics) {
          const m = materialFor(h.type);
          for (let z = h.z - m.halfL - PLAYER_HALF_L; z <= h.z + m.halfL + PLAYER_HALF_L; z += 25) {
            if (Math.abs(h.offset - line.centreAt(z)) < m.halfW + PLAYER_HALF_W) throw new Error(`seed ${seed} level ${level}: ${h.type} on the line at z=${z}`);
          }
        }
        // Traffic moves: check it against the line every step of the race.
        for (const f of frames) {
          if (blockedAt(f.near, f.line)) throw new Error(`seed ${seed} level ${level}: traffic on the line at z=${f.pz}`);
        }
      }
    }
  }, 120000);

  it('a slow-steering car always finds a clean path (lane × distance search, slow and fast drivers)', () => {
    for (let level = 0; level < 5; level++) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const mph of [55, 95, 135]) {
          const res = cleanPathExists(runRace(seed * 31 + level, level, { mph }).frames);
          expect(res, `seed ${seed} level ${level} ${mph} mph`).toEqual({ ok: true });
        }
      }
    }
  }, 120000);

  it('the search does fail when the road really is blocked (guards the guard)', () => {
    const wall = [{ offset: -0.5, halfW: 0.25 }, { offset: 0, halfW: 0.25 }, { offset: 0.5, halfW: 0.25 }];
    expect(cleanPathExists([{ pz: 0, near: wall, dt: 0.1 }])).toEqual({ ok: false, at: 0 });
  });

  it('density has rhythm: breathers after dense sections, gently rising with level', () => {
    const at = (s, lvl) => densityAt(s * LINE.section + 10, lvl);
    expect(densityAt(100, 0)).toBe(0);
    expect(at(1, 0)).toBeGreaterThan(at(0, 0) + 0.1);
    expect(at(2, 0)).toBe(0);
    expect(at(6, 0)).toBe(0);
    expect(at(1, 4)).toBeGreaterThan(at(1, 0));
  });

  it('hazards per 100k of track are well down from the old generator (density metric)', () => {
    // Old generator: an obstacle every ~3,800 Z and a prop pattern (≈4.7 items) every ~9,500 Z.
    const OLD_PER_100K = 100000 / 3800 + (100000 / 9500) * 4.67;
    let items = 0, z = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = runRace(seed, 2, { mph: 95, step: 400 });
      items += r.placed + r.props.length;
      z += r.raceZ;
    }
    const perNew = (items / z) * 100000;
    console.log(`hazard density per 100k Z: old ≈ ${OLD_PER_100K.toFixed(1)}, new ${perNew.toFixed(1)}`);
    expect(perNew).toBeLessThan(OLD_PER_100K * 0.75);
  });
});

describe('the line fits the real handling model (src/handling.js)', () => {
  it('at top speed every car can steer sideways faster than the line ever moves', async () => {
    const { createSteer, stepSteer, createLateral, stepLateral, handlingFor } = await import('../../src/handling.js');
    for (const [grip, massKg] of [[1, 2200], [5, 1300], [10, 900]]) {
      const h = handlingFor({ gripMult: 0.85 + grip * 0.03, slipMult: 1, massKg }, 1);
      const st = createSteer(), lt = createLateral(0);
      for (let i = 0; i < 240; i++) { stepSteer(st, 1, 0, 1 / 120, 140); stepLateral(lt, st.value, 1 / 120, { speedMph: 140, h, throttle: true }); }
      expect(lt.vx, `grip ${grip}, ${massKg} kg`).toBeGreaterThanOrEqual(LINE.minLateral);
    }
  });
});
