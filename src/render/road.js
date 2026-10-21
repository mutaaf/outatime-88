// Sky, era backdrop and the road deck of the 2D race (ticket 0015: carved out of main.js).
import { GameState } from '../state.js';
import { ROAD_CFG, CAMERA_MODES } from '../data.js';
import { drawBackdrop } from '../backdrop.js';
import { track, featureAt } from '../track.js';
import { projectPoint } from '../projection.js';
import { cameraDepth } from '../contact.js';
import { RACE_LAPS } from '../raceflow.js';
import { RS, live, setPieceArt } from '../main.js';
import { drawPolygon } from './canvas.js';

const TOY_DECK = {
  slab: '#4a1202', sheen: 'rgba(255, 215, 150, 0.14)', groove: 'rgba(40, 10, 0, 0.36)', center: 'rgba(255, 195, 40, 0.72)',
  wall: '#8a1c02', rimA: '#ffaa00', rimB: '#ff8800', lip: '#b22c04',
};

// The backdrop's per-frame facts, reused every frame (no allocation in the render loop).
const backdropFrame = { curve: 0, trackPos: 0, playerX: 0, t: 0, raceTime: 0, speed: 0, lap: 1, laps: 0, warp: -1, reduced: false };

let lookPx = 0, lookClock = 0; // 2D look-into-the-corner (ticket 0181)
const visibleSegs = [];

/** What the rest of the frame reads about the road just drawn (one reused object). */
export const road = { segs: visibleSegs, baseIndex: 0, baseSeg: null, playerSeg: null };

/** Draws the era's world and the road deck back to front; false when there is no road under
 *  the camera yet (then nothing else is drawn this frame). */
export function drawRoad(ctx, rw, rh, eraCfg, roll) {
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  // 1. The era's world: sky, parallax layers and live set pieces (src/backdrop.js, ticket 0100).
  const horizonY = Math.floor(rh * 0.46 - GameState.loopPitchOffset * (rh / 420));
  const bgSeg = track.seg(Math.floor(GameState.trackPos / ROAD_CFG.segLength));
  backdropFrame.curve = bgSeg ? bgSeg.curve : 0;
  backdropFrame.trackPos = GameState.trackPos;
  backdropFrame.playerX = GameState.playerX;
  backdropFrame.t = RS.fxClock;
  backdropFrame.raceTime = GameState.raceTime || 0;
  backdropFrame.speed = GameState.status === 'PLAYING' ? GameState.speed : 0;
  backdropFrame.lap = GameState.lapSplits.length + 1;
  backdropFrame.laps = RACE_LAPS;
  backdropFrame.warp = GameState.warpFxTimer > 0 ? 0.9 - GameState.warpFxTimer : -1;
  backdropFrame.reduced = GameState.reducedMotion;
  drawBackdrop(ctx, rw, rh, horizonY, eraCfg, backdropFrame);

  // 2. Project & Draw Seamless 3D Orange Toy-Track Segments (Zero Distracting Blue Bars!)
  const baseIndex = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  const basePercent = (GameState.trackPos % ROAD_CFG.segLength) / ROAD_CFG.segLength;
  const baseSeg = track.seg(baseIndex) || track.seg(track.start);
  if (!baseSeg) return false;


  const playerElevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  let playerCurveX = 0;
  let playerCurveDX = -(baseSeg.curve * basePercent);
  for (let cStep = 0; cStep < 6; cStep++) {
    const cSeg = track.seg(baseIndex + cStep);
    if (!cSeg) break;
    playerCurveX += playerCurveDX;
    playerCurveDX += cSeg.curve;
  }
  const cameraX = (GameState.playerX * ROAD_CFG.roadWidth) + playerCurveX;
  const cameraY = playerElevation + camCfg.height + GameState.playerY * 3.5;
  const cameraZ = GameState.trackPos;
  const dynamicDepth = cameraDepth(camCfg, GameState.speed);

  // Look into the corner (ticket 0181): the chase cam turns toward where the road goes (the
  // curvature ahead) and where the car points (its yaw), like a driver's eyes. A shift of the
  // view's centre line, so road, cars and props all move together; off for loops, corkscrews
  // and under reduced motion.
  const racing = GameState.status === 'PLAYING' || GameState.status === 'PAUSED';
  const lookOn = racing && !GameState.reducedMotion && roll === 0 && !(setPieceArt && loopNear(GameState.trackPos + ROAD_CFG.playerZOffset));
  const lookWant = lookOn ? -Math.max(-0.045, Math.min(0.045, (GameState.upcomingCurveSum || 0) * 0.0025 + (GameState.carYaw || 0) * 0.06)) * rw : 0;
  const lookDt = Math.min(0.1, Math.max(0, RS.fxClock - lookClock)); // sim time: holds while paused
  lookClock = RS.fxClock;
  if (!racing) lookPx = 0;
  else lookPx += (lookWant - lookPx) * (1 - Math.exp(-lookDt * 2.6));
  const viewCx = rw / 2 + Math.round(lookPx);
  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = rh;
  const DK = eraCfg.deck || TOY_DECK; // the track's colours (orange toy track; glass ribbon in orbit)
  const visibleSegments = visibleSegs; // reused every frame (ticket 0182)
  visibleSegments.length = 0;
  const playerTireScreenY = Math.floor(rh * 0.87);
  let foundPlayerSeg = null;

  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = track.seg(baseIndex + n);
    if (!seg) break;

    seg.p1.world.x = x;
    seg.p2.world.x = x + dx;

    projectPoint(seg.p1, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh, viewCx);
    projectPoint(seg.p2, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh, viewCx);

    x += dx;
    dx += seg.curve;

    if (seg.p1.camera.z <= dynamicDepth || seg.p2.screen.y >= maxY || seg.p2.screen.y >= seg.p1.screen.y) {
      continue;
    }

    visibleSegments.push(seg);
    if (seg.trackType === 'GAP') continue; // a jump's gap: no road, just air

    const x1 = seg.p1.screen.x;
    const y1 = seg.p1.screen.y;
    const w1 = seg.p1.screen.w;
    const x2 = seg.p2.screen.x;
    const y2 = seg.p2.screen.y;
    const w2 = seg.p2.screen.w;

    // Capture the exact segment at the player's tire contact line (y = 87% of screen height) for 1:1 visual collision!
    // The tyre contact row; the simulation's own copy (visualPlayerZ) comes from contact.js.
    if (!foundPlayerSeg && y1 >= playerTireScreenY && y2 <= playerTireScreenY) {
      foundPlayerSeg = seg;
    }

    const isAlt = (Math.floor(seg.index / 10) % 2) === 0;

    // 1. 3D Extruded Track Underside Shadow Slab
    const slabH1 = Math.max(2, w1 * 0.055);
    const slabH2 = Math.max(1.5, w2 * 0.055);
    const railW1 = w1 * 1.12;
    const railW2 = w2 * 1.12;
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 + railW1, y1 + slabH1, x2 + railW2, y2 + slabH2, x2 - railW2, y2 + slabH2, DK.slab);

    // 2. Seamless Anodized Tangerine-Orange Toy-Track Deck (Zero Blue Bars!)
    let surfaceColor = isAlt ? (DK.surfA || eraCfg.trackA) : (DK.surfB || eraCfg.trackB);
    if (seg.trackType === 'BOOSTER') {
      surfaceColor = DK.boostA ? (isAlt ? DK.boostA : DK.boostB) : (isAlt ? '#ea580c' : '#d9460f');
    } else if (seg.trackType === 'JUMP_RAMP') {
      surfaceColor = isAlt ? '#f59e0b' : '#d97706';
    }
    drawPolygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, surfaceColor);
    if (live.finishZ && seg.index === Math.floor(live.finishZ / ROAD_CFG.segLength)) drawFinishLine(ctx, x1, y1, w1, x2, y2, w2);

    // 3. Soft Satin Specular Sheen Along Left & Right Lanes
    const sheenCol = DK.sheen;
    drawPolygon(ctx, x1 - w1 * 0.58, y1, x1 - w1 * 0.28, y1, x2 - w2 * 0.28, y2, x2 - w2 * 0.58, y2, sheenCol);
    drawPolygon(ctx, x1 + w1 * 0.28, y1, x1 + w1 * 0.58, y1, x2 + w2 * 0.58, y2, x2 + w2 * 0.28, y2, sheenCol);

    // 4. Subtle Carbon-Recessed Lane Grooves & Warm Gold Center Line
    const lineW1 = Math.max(1.2, w1 * 0.016);
    const lineW2 = Math.max(0.8, w2 * 0.016);
    const grooveCol = DK.groove;
    drawPolygon(ctx, x1 - w1 * 0.46 - lineW1, y1, x1 - w1 * 0.46 + lineW1, y1, x2 - w2 * 0.46 + lineW2, y2, x2 - w2 * 0.46 - lineW2, y2, grooveCol);
    drawPolygon(ctx, x1 + w1 * 0.46 - lineW1, y1, x1 + w1 * 0.46 + lineW1, y1, x2 + w2 * 0.46 + lineW2, y2, x2 + w2 * 0.46 - lineW2, y2, grooveCol);

    const centerCol = seg.trackType === 'BOOSTER' ? '#fde047' : DK.center;
    drawPolygon(ctx, x1 - lineW1, y1, x1 + lineW1, y1, x2 + lineW2, y2, x2 - lineW2, y2, centerCol);

    // 5. 3D Extruded Side Guide Walls (Inner Shaded Wall + Warm Gold Top Bevel + Outer Lip)
    const wallH1 = Math.max(2, w1 * 0.068);
    const wallH2 = Math.max(1, w2 * 0.068);
    drawPolygon(ctx, x1 - w1, y1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - w2, y2, DK.wall);
    drawPolygon(ctx, x1 + w1, y1, x1 + w1, y1 - wallH1, x2 + w2, y2 - wallH2, x2 + w2, y2, DK.wall);
    const topRimCol = isAlt ? DK.rimA : DK.rimB;
    drawPolygon(ctx, x1 - railW1, y1 - wallH1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - railW2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 + w1, y1 - wallH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + w2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 - railW1, y1 - wallH1, x2 - railW2, y2 - wallH2, x2 - railW2, y2 + slabH2, DK.lip);
    drawPolygon(ctx, x1 + railW1, y1 + slabH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + railW2, y2 + slabH2, DK.lip);

    // Steady Twin Tire Trails at 88 MPH (No per-segment blinking)
    if (seg.flameLeft) {
      const fx1 = x1 + (seg.flameOffset || 0) * w1;
      const fx2 = x2 + (seg.flameOffset || 0) * w2;
      const tireSpan1 = w1 * 0.22;
      const tireSpan2 = w2 * 0.22;
      const fw1 = Math.max(2, w1 * 0.045);
      const fw2 = Math.max(1, w2 * 0.045);
      const flameCol = 'rgba(0, 224, 255, 0.7)';
      drawPolygon(ctx, fx1 - tireSpan1 - fw1, y1, fx1 - tireSpan1 + fw1, y1, fx2 - tireSpan2 + fw2, y2, fx2 - tireSpan2 - fw2, y2, flameCol);
      drawPolygon(ctx, fx1 + tireSpan1 - fw1, y1, fx1 + tireSpan1 + fw1, y1, fx2 + tireSpan2 + fw2, y2, fx2 + tireSpan2 - fw2, y2, flameCol);
    }

    maxY = y2;
  }

  if (setPieceArt) setPieceArt.drawAhead(ctx, visibleSegments, eraCfg, rw, rh);
  road.baseIndex = baseIndex; road.baseSeg = baseSeg; road.playerSeg = foundPlayerSeg;
  return true;
}

/** A loop under the car, or one it is just entering or leaving (the ride view's blend). */
export function loopNear(z) {
  const k = setPieceArt.LOOP_CAM.fade;
  // Here, just ahead or just behind (three calls, no array: this runs every frame).
  let f = featureAt(z);
  if (f && f.kind === 'LOOP') return f;
  f = featureAt(z + k);
  if (f && f.kind === 'LOOP') return f;
  f = featureAt(z - k);
  return f && f.kind === 'LOOP' ? f : null;
}

/** Live races: a checkered flag band across the road at the finish segment. */
function drawFinishLine(ctx, x1, y1, w1, x2, y2, w2) {
  const cols = 10;
  for (let row = 0; row < 2; row++) {
    const ya = y1 + (y2 - y1) * (row / 2), yb = y1 + (y2 - y1) * ((row + 1) / 2);
    const wa = w1 + (w2 - w1) * (row / 2), wb = w1 + (w2 - w1) * ((row + 1) / 2);
    const xa = x1 + (x2 - x1) * (row / 2), xb = x1 + (x2 - x1) * ((row + 1) / 2);
    for (let c = 0; c < cols; c++) {
      const u0 = -1 + (2 * c) / cols, u1 = -1 + (2 * (c + 1)) / cols;
      drawPolygon(ctx, xa + u0 * wa, ya, xa + u1 * wa, ya, xb + u1 * wb, yb, xb + u0 * wb, yb, (c + row) % 2 ? '#0b1020' : '#f8fafc');
    }
  }
}
