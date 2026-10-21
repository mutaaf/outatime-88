// Title framing (ticket 0192): on the home screen the camera rolls down the road, so nothing
// on it may drive up beside the hero car. The race's own bodies are laid out exactly like
// LiveTraffic.init (grid, traffic, obstacles) and the title is played for 20 s at 60 fps.
import { describe, it, expect } from 'vitest';
import { TITLE_GAP, frameTitle } from '../../src/title-frame.js';
import { createLine, createHazardPlanner } from '../../src/cleanline.js';
import { gridSlot } from '../../src/raceflow.js';
import { materialFor } from '../../src/materials.js';
import { mulberry32 } from '../../src/daily.js';
import { ROAD_CFG } from '../../src/data.js';

const ROAD_SPEED = 1350; // main.js: the title's trackPos per second
const VIEWPORTS = [[1280, 720], [390, 844]];

/** The road bodies a title load starts with (LiveTraffic.init with this seed's line and RNG). */
function titleRoad(seed) {
  const line = createLine(seed);
  const planner = createHazardPlanner({ line, rand: mulberry32(seed), level: seed % 6 });
  const playerZ0 = ROAD_CFG.playerZOffset;
  const racers = [0, 1, 2, 3, 4].map((i) => {
    const s = gridSlot(i);
    return { kind: 'RIVAL', worldZ: playerZ0 + s.dz, prevZ: playerZ0 + s.dz, offset: s.offset, halfW: 0.14, takenDown: false };
  });
  const traffic = [0, 1, 2, 3, 4, 5].map((i) => {
    const truck = i % 4 === 0, halfW = truck ? 0.16 : 0.13, z = 4800 + i * 5200;
    const t = { kind: 'TRAFFIC', truck, worldZ: z, prevZ: z, halfW, takenDown: false, offset: planner.trafficLane(i, z, 1, halfW, truck ? 160 : 105) };
    if (i >= 4) { t.takenDown = true; t.worldZ = t.prevZ = -1e6; }
    return t;
  });
  const obstacles = [];
  let fromZ = 3200;
  for (let i = 0; i < 4; i++) {
    const spot = planner.placeObstacle(i, fromZ, 1);
    const m = materialFor(spot.type);
    obstacles.push({ kind: 'OBSTACLE', worldZ: spot.z, prevZ: spot.z, offset: spot.offset, halfW: m.halfW, takenDown: false });
    fromZ = spot.z + planner.obstacleSpacing(spot.z, 1);
  }
  return { racers, traffic, obstacles, props: { live: [] } };
}

/** Screen box of a body as the 2D renderer sizes it (flat road; generous heights). */
function box(b, cameraZ, w, h) {
  const D = b.worldZ - cameraZ;
  if (D < 1) return null; // behind the camera
  const scale = ROAD_CFG.cameraDepth / D;
  const roadW = scale * ROAD_CFG.roadWidth * w / 2;
  const roadY = h / 2 + scale * ROAD_CFG.cameraHeight * h / 2;
  const x = w / 2 + b.offset * roadW;
  const bw = b.kind === 'OBSTACLE' ? Math.max(12, roadW * b.halfW * 2) : roadW * 0.32;
  const bh = b.kind === 'OBSTACLE' ? bw * 0.58 : bw * (b.truck ? 1.6 : 0.9);
  return { x0: x - bw / 2, x1: x + bw / 2, y0: roadY - bh, y1: roadY };
}

/** Largest share of the screen to the right of the hero car that any one body covers. */
function worstCover(road, playerZ, w, h) {
  const cameraZ = playerZ - ROAD_CFG.playerZOffset;
  const heroRoadW = (ROAD_CFG.cameraDepth / ROAD_CFG.playerZOffset) * ROAD_CFG.roadWidth * w / 2;
  const left = w / 2 + heroRoadW * 0.16; // the hero car's right flank
  const area = (w - left) * h;
  let worst = 0;
  for (const list of [road.racers, road.traffic, road.obstacles]) {
    for (const b of list) {
      if (b.takenDown) continue;
      const r = box(b, cameraZ, w, h);
      if (!r) continue;
      const cw = Math.max(0, Math.min(w, r.x1) - Math.max(left, r.x0));
      const ch = Math.max(0, Math.min(h, r.y1) - Math.max(0, r.y0));
      worst = Math.max(worst, (cw * ch) / area);
    }
  }
  return worst;
}

/** Play the title for `seconds` and return the worst cover seen on any frame. */
function playTitle(seed, w, h, { rule = true, seconds = 20 } = {}) {
  const road = titleRoad(seed);
  let trackPos = 0, worst = 0;
  const dt = 1 / 60;
  for (let f = 0; f < seconds * 60; f++) {
    trackPos += ROAD_SPEED * dt;
    const playerZ = trackPos + ROAD_CFG.playerZOffset;
    if (rule) frameTitle(road, playerZ, ROAD_SPEED * dt);
    worst = Math.max(worst, worstCover(road, playerZ, w, h));
  }
  return { worst, road };
}

describe('title framing (0192)', () => {
  it('without the rule the camera drives up beside the grid, traffic and props (the bug)', () => {
    expect(playTitle(1, 1280, 720, { rule: false }).worst).toBeGreaterThan(0.15);
  });

  for (const [w, h] of VIEWPORTS) {
    it(`20 seeded title loads at ${w}x${h}: nothing covers more than 15% right of the hero car`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { worst } = playTitle(seed, w, h);
        expect(worst, `seed ${seed}`).toBeLessThanOrEqual(0.15);
      }
    });
  }

  it('parks the race field and keeps every road body at least TITLE_GAP ahead, spacing kept', () => {
    const road = titleRoad(3);
    const before = road.traffic.filter((t) => !t.takenDown).map((t) => t.worldZ);
    const playerZ = ROAD_CFG.playerZOffset;
    frameTitle(road, playerZ, 0);
    expect(road.racers.every((r) => r.takenDown)).toBe(true);
    const live = [...road.traffic, ...road.obstacles].filter((b) => !b.takenDown);
    const near = Math.min(...live.map((b) => b.worldZ - playerZ));
    expect(near).toBeCloseTo(TITLE_GAP, 6);
    const after = road.traffic.filter((t) => !t.takenDown).map((t) => t.worldZ);
    for (let i = 1; i < after.length; i++) expect(after[i] - after[i - 1]).toBeCloseTo(before[i] - before[i - 1], 6);
    for (const b of live) expect(b.prevZ).toBe(b.worldZ);
    // Parked traffic stays parked.
    expect(road.traffic.filter((t) => t.takenDown).every((t) => t.worldZ === -1e6)).toBe(true);
  });

  it('the scene cruises with the road: gaps never shrink while the title rolls', () => {
    const road = titleRoad(5);
    let playerZ = ROAD_CFG.playerZOffset;
    frameTitle(road, playerZ, 0);
    const gaps = () => road.traffic.filter((t) => !t.takenDown).map((t) => t.worldZ - playerZ);
    const g0 = gaps();
    for (let f = 0; f < 600; f++) { playerZ += 22.5; frameTitle(road, playerZ, 22.5); }
    gaps().forEach((g, i) => expect(g).toBeCloseTo(g0[i], 6));
  });

  it('a body behind the hero (back from a race) lifts the whole scene ahead again', () => {
    const road = titleRoad(7);
    const playerZ = 50000; // trackPos far down the road, bodies laid out near the start
    frameTitle(road, playerZ, 0);
    for (const b of [...road.traffic, ...road.obstacles]) if (!b.takenDown) expect(b.worldZ - playerZ).toBeGreaterThanOrEqual(TITLE_GAP - 1e-6);
  });
});
