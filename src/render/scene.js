// The 2D race frame (ticket 0015: carved out of main.js): sets up the pixel buffer, draws the
// road (road.js), what stands on it (sprites.js), the player car (player.js) and the car FX
// (fx.js), then blits the buffer onto the display canvas with the speed feel on top.
import { GameState } from '../state.js';
import { ROAD_CFG, POP_CULTURE_ROSTER } from '../data.js';
import { SaveStore } from '../save.js';
import { SoundEngine } from '../audio.js';
import { track, featureAt } from '../track.js';
import { progressIn, viewRoll } from '../setpieces.js';
import { speedFeel } from '../fx.js';
import { drawWeather } from '../backdrop.js';
import { RS, LiveTraffic, live, carArt, pickupArt, setPieceArt, smoke2d, touch, gfxQ, burstSparks, carPaint } from '../main.js';
import { mainCtx, pixelCanvas, pixelCtx, viewW, viewH, viewK, beginMainFrame, getActiveEraRenderConfig } from './canvas.js';
import { road, drawRoad, loopNear } from './road.js';
import { drawRoadside, drawOverRoad } from './sprites.js';
import { drawPlayerCar } from './player.js';
import { nosFeel, drawCarFx, drawSpeedLines, drawWarpTunnel, drawSparks } from './fx.js';

const rideMovers = [null, null, null]; // reused: the cars the loop ride view draws
let smokeRoadX = 0, smokeRoadW = 1;

export function renderScene() {
  const eraCfg = getActiveEraRenderConfig();
  // The road is drawn in logical px (rw × rh, the same height the simulation's tyre contact
  // uses) onto a backing store of rw·pk × rh·pk: the governor trades resolution (res) for frame
  // time, and the backing scale adds device pixels where the tier can afford them.
  const scale = eraCfg.pixelScale || 1.0;
  const rw = Math.max(240, Math.floor(viewW / scale));
  const rh = Math.max(160, Math.floor(viewH / scale));
  beginMainFrame();
  const pk = Math.max(0.5, gfxQ.res * viewK);
  const bw = Math.round(rw * pk), bh = Math.round(rh * pk);
  if (pixelCanvas.width !== bw || pixelCanvas.height !== bh) {
    pixelCanvas.width = bw;
    pixelCanvas.height = bh;
  }
  if (carArt) { carArt.setSpriteScale(pk); carArt.beginFrame(); }
  if (pickupArt && pickupArt.setPixelScale) pickupArt.setPixelScale(pk);
  GameState.pixelScale = pk; // for lazy 2D art (billboards…): cache at pixelScale × drawn size

  const ctx = pixelCtx;
  ctx.setTransform(bw / rw, 0, 0, bh / rh, 0, 0);
  ctx.save();

  // Screen Shake on Takedown / Roar / Boost
  if (GameState.screenShake > 0 && !GameState.reducedMotion) {
    const mag = GameState.screenShake * 2.5 * GameState.cameraFx;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // Set-piece roll (sprint 4): the world barrel-rolls through a corkscrew and leans up a
  // half-pipe wall; the car stays put on screen. Undone before the car is drawn.
  const rollF = featureAt(GameState.trackPos + ROAD_CFG.playerZOffset);
  const roll = GameState.status === 'PLAYING' || GameState.status === 'PAUSED' ? viewRoll(rollF, GameState.trackPos + ROAD_CFG.playerZOffset, GameState.reducedMotion) : 0;
  let rolled = false;
  if (roll !== 0) {
    ctx.fillStyle = eraCfg.skyTop || '#05040d';
    ctx.fillRect(0, 0, rw, rh);
    ctx.save();
    ctx.translate(rw / 2, rh * 0.62);
    ctx.rotate(roll);
    ctx.scale(1.5, 1.5);
    ctx.translate(-rw / 2, -rh * 0.62);
    rolled = true;
  }

  if (!drawRoad(ctx, rw, rh, eraCfg, roll)) {
    if (rolled) ctx.restore();
    ctx.restore();
    return;
  }
  drawRoadside(ctx, rw, rh, eraCfg);
  drawOverRoad(ctx, rw, rh);

  const { baseIndex, baseSeg, segs: visibleSegments, playerSeg: foundPlayerSeg } = road;
  // 5. Lock Hero Car Screen X & Y to the Exact Track Segment Underneath the Tires (Zero Off-Track Drift!)
  const playerSeg = foundPlayerSeg || track.seg(baseIndex + 6) || visibleSegments[0] || baseSeg;
  if (playerSeg && playerSeg.p1 && playerSeg.p1.screen && playerSeg.p1.screen.w > 0) {
    const segRoadX = playerSeg.p1.screen.x;
    const segRoadW = playerSeg.p1.screen.w;
    GameState.playerScreenX = Math.round(segRoadX + GameState.playerX * segRoadW);
    smokeRoadX = segRoadX; smokeRoadW = segRoadW;
  } else {
    GameState.playerScreenX = Math.floor(rw * 0.5);
  }

  if (rolled) { ctx.restore(); rolled = false; }
  // The real loop: drive round it with the camera riding the loop (src/loopcam.js). Calm mode
  // keeps the side-on loop cam instead (it never turns the screen over).
  const rideF = setPieceArt && !GameState.reducedMotion ? loopNear(GameState.trackPos + ROAD_CFG.playerZOffset) : null;
  let rideOwnsCar = false;
  if (rideF) {
    const z = GameState.trackPos + ROAD_CFG.playerZOffset;
    const blend = setPieceArt.rideBlend(rideF, z - rideF.z0);
    const paint = carPaint(POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0]);
    rideMovers[0] = LiveTraffic.racers; rideMovers[1] = LiveTraffic.traffic; rideMovers[2] = live.ghosts;
    const ride = setPieceArt.drawLoopRide(ctx, rw, rh, {
      f: rideF, z, lat: GameState.playerX, peelT: GameState.peeledLoop === rideF ? GameState.peelT : null,
      ups: GameState.peelUps || 1600, blend, eraCfg, t: RS.fxClock, reduced: GameState.reducedMotion,
      road: track, movers: rideMovers, color: paint.body, cabin: paint.cabin, px: pk,
    });
    if (ride.ownCar && GameState.cameraMode !== 2) {
      // Fell off the top: the same car, flying the ballistic arc the ride view worked out.
      rideOwnsCar = true;
      const ax = rw * 0.5, ay = rh * 0.87;
      ctx.save();
      ctx.translate(ax + ride.dx, ay + ride.dy);
      ctx.rotate(ride.roll);
      ctx.scale(ride.k, ride.k * ride.flip);
      ctx.translate(-ax, -ay);
      GameState.playerScreenX = Math.floor(ax);
      drawPlayerCar(ctx, rw, rh, eraCfg);
      ctx.restore();
    }
    if (ride.landed) {
      // Touchdown after falling off the top: a bounce, sparks and a thump.
      burstSparks(26, 28, 1.2);
      GameState.screenShake = Math.max(GameState.screenShake || 0, 0.35);
      SoundEngine.playLand();
      if (touch) touch.controls.haptics.pulse('hit');
    }
    GameState.playerScreenX = Math.floor(rw * 0.5);
    GameState.loopRide = blend;
    GameState.loopFall = ride.fall;
  } else { GameState.loopRide = 0; GameState.loopFall = 0; }
  if (GameState.cameraMode !== 2 && !rideOwnsCar) {
    drawPlayerCar(ctx, rw, rh, eraCfg);
    if (smoke2d) smoke2d.draw(ctx, rw, rh, smokeRoadX, smokeRoadW, SaveStore.data.underglow);
  }

  drawCarFx(ctx, rw, rh);
  drawWeather(ctx, rw, rh);

  // 5.5 Draw LUMEN Curved Helmet Visor Telemetry Brackets on Screen Edges
  if (GameState.jarvisArEnabled) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
    ctx.lineWidth = 1.5;
    // Left Visor Arc
    ctx.beginPath();
    ctx.arc(rw * 0.14, rh * 0.52, rh * 0.34, Math.PI * 0.72, Math.PI * 1.28);
    ctx.stroke();
    // Right Visor Arc
    ctx.beginPath();
    ctx.arc(rw * 0.86, rh * 0.52, rh * 0.34, -Math.PI * 0.28, Math.PI * 0.28);
    ctx.stroke();

    // Clean, word-free visor arcs
  }

  ctx.restore();

  // 6. Blit onto Main Display Canvas
  mainCtx.save();
  mainCtx.imageSmoothingEnabled = (eraCfg.pixelScale === 1.0);
  const playing = GameState.status === 'PLAYING';
  const feel = nosFeel(speedFeel(playing ? GameState.speed : 0, GameState.reducedMotion));
  // The blit below covers the whole screen; only a shake leaves an edge to clear. Skipping a
  // full-screen clear every frame saves a whole pass over the pixels (ticket 0182).
  if (feel.shake) mainCtx.clearRect(0, 0, viewW, viewH);
  // FOV push-in toward the vanishing point as you approach 88 (crop the source a touch).
  const cropW = pixelCanvas.width / feel.fov;
  const cropH = pixelCanvas.height / feel.fov;
  const cropX = (pixelCanvas.width - cropW) * 0.5;
  const cropY = (pixelCanvas.height - cropH) * 0.46;
  const shakeX = feel.shake * Math.sin(RS.fxClock * 61.0) * (viewW / 1280);
  const shakeY = feel.shake * Math.sin(RS.fxClock * 47.0 + 1.3) * (viewW / 1280);
  mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX, shakeY, viewW, viewH);
  // Time-warp chromatic split: two offset additive ghosts for ~0.9 s after a warp.
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) {
    const k = GameState.warpFxTimer / 0.9;
    const off = 10 * k * (viewW / 1280);
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.globalAlpha = 0.22 * k;
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX - off, shakeY, viewW, viewH);
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX + off, shakeY, viewW, viewH);
    mainCtx.globalAlpha = 1;
    mainCtx.globalCompositeOperation = 'source-over';
    drawWarpTunnel(mainCtx, k);
  }
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  // Calm mode's side-on loop cam (sprint 4) while you're going round a loop.
  if (setPieceArt && GameState.reducedMotion && rollF && rollF.kind === 'LOOP') {
    const pc = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
    setPieceArt.drawCutaway(mainCtx, viewW, viewH, {
      t: progressIn(rollF, GameState.trackPos + ROAD_CFG.playerZOffset), mph: GameState.speed,
      color: pc.body, eraCfg, failed: GameState.peeledLoop === rollF, reduced: GameState.reducedMotion,
    });
  }
  mainCtx.restore();
}
