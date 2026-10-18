import { describe, it, expect, beforeAll } from 'vitest';
import { contactZ, cameraDepth } from '../../src/contact.js';
import { projectPoint } from '../../src/projection.js';
import { ROAD_CFG, CAMERA_MODES } from '../../src/data.js';
import { track, buildInitialTrack, generateNextTrackBiome } from '../../src/track.js';
import { mulberry32 } from '../../src/daily.js';

// The algorithm exactly as the 2D renderer ran it before the sim/render split: project
// every visible segment, find the row under the tyres. Kept here as the reference.
function legacyRendererContact(segments, s, camCfg, rw, rh) {
  const baseIndex = Math.floor(s.trackPos / ROAD_CFG.segLength);
  const basePercent = (s.trackPos % ROAD_CFG.segLength) / ROAD_CFG.segLength;
  const baseSeg = segments[baseIndex] || segments[0];
  const playerElevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  let playerCurveX = 0;
  let playerCurveDX = -(baseSeg.curve * basePercent);
  for (let c = 0; c < 6; c++) {
    const cSeg = segments[baseIndex + c];
    if (!cSeg) break;
    playerCurveX += playerCurveDX;
    playerCurveDX += cSeg.curve;
  }
  const cameraX = (s.playerX * ROAD_CFG.roadWidth) + playerCurveX;
  const cameraY = playerElevation + camCfg.height + s.playerY * 3.5;
  const dynamicDepth = Math.max(0.62, camCfg.depth - Math.max(0, (s.speed - 70) * 0.0022));
  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = rh;
  const tyre = Math.floor(rh * 0.87);
  let found = null;
  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = segments[baseIndex + n];
    if (!seg) break;
    const p1 = { world: { ...seg.p1.world, x }, camera: {}, screen: {} };
    const p2 = { world: { ...seg.p2.world, x: x + dx }, camera: {}, screen: {} };
    projectPoint(p1, cameraX, cameraY, s.trackPos, dynamicDepth, rw, rh);
    projectPoint(p2, cameraX, cameraY, s.trackPos, dynamicDepth, rw, rh);
    x += dx;
    dx += seg.curve;
    if (p1.camera.z <= dynamicDepth || p2.screen.y >= maxY || p2.screen.y >= p1.screen.y) continue;
    if (found === null && p1.screen.y >= tyre && p2.screen.y <= tyre) {
      found = seg.p1.world.z + ((p1.screen.y - tyre) / Math.max(1, p1.screen.y - p2.screen.y)) * ROAD_CFG.segLength;
    }
    maxY = p2.screen.y;
  }
  return found;
}

// The live window of the ring as a plain array indexed by absolute segment index.
function absSegments() {
  const out = [];
  for (let i = track.start; i < track.end; i++) out[i] = track.seg(i);
  return out;
}

describe('contactZ (simulation-owned tyre contact)', () => {
  beforeAll(() => {
    buildInitialTrack();
    for (let i = 0; i < 6; i++) generateNextTrackBiome();
  });

  it('matches the legacy renderer result exactly across random states, cameras and sizes', () => {
    const rand = mulberry32(88);
    const segs = absSegments();
    let compared = 0;
    for (let i = 0; i < 4000; i++) {
      const state = {
        trackPos: (track.start + rand() * (track.end - track.start - ROAD_CFG.drawDistance - 2)) * ROAD_CFG.segLength,
        playerX: rand() * 1.6 - 0.8,
        playerY: rand() < 0.3 ? rand() * 220 : 0,
        speed: rand() * 160,
      };
      const camCfg = CAMERA_MODES[i % CAMERA_MODES.length];
      const rh = 160 + Math.floor(rand() * 1200);
      const rw = 240 + Math.floor(rand() * 1800);
      const expected = legacyRendererContact(segs, state, camCfg, rw, rh);
      expect(contactZ(track, state, camCfg, rh)).toBe(expected);
      if (expected !== null) compared++;
    }
    expect(compared).toBeGreaterThan(3000);
  });

  it('does not mutate the track or the state it reads', () => {
    const before = JSON.stringify(track.liveSegments().slice(0, 200));
    const state = Object.freeze({ trackPos: 5000, playerX: 0.2, playerY: 0, speed: 90 });
    contactZ(track, state, CAMERA_MODES[1], 720);
    expect(JSON.stringify(track.liveSegments().slice(0, 200))).toBe(before);
  });

  it('puts the tyres ahead of the camera and widens the view with speed', () => {
    const z = contactZ(track, { trackPos: 4000, playerX: 0, playerY: 0, speed: 60 }, CAMERA_MODES[1], 720);
    expect(z).toBeGreaterThan(4000);
    expect(z).toBeLessThan(4000 + ROAD_CFG.playerZOffset * 2);
    expect(cameraDepth(CAMERA_MODES[1], 200)).toBeLessThan(cameraDepth(CAMERA_MODES[1], 50));
  });
});
