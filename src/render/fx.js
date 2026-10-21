// Screen-space feel of the 2D race and the 3D overlay (ticket 0015: carved out of main.js): NOS
// push-in, the car FX layer (pickups flying in, shockwaves, debris), speed lines, the warp
// tunnel and sparks.
import { GameState } from '../state.js';
import { PICKUPS } from '../pickups.js';
import { RS, carArt, pickupArt, hzArt, sparks } from '../main.js';
import { mainCtx, viewW, viewH, beginMainFrame, roadCanvasHeight, getActiveEraRenderConfig } from './canvas.js';

/** NOS adds a push-in and speed lines on top of the speed feel (calm mode: none). */
export function nosFeel(feel) {
  if (GameState.nosBurning && GameState.status === 'PLAYING' && !GameState.reducedMotion) {
    feel.fov += 0.045;
    feel.lines = Math.max(feel.lines, 0.85);
  }
  return feel;
}

/** Twin blue-violet nitrous flames from the exhausts while NOS burns. */
function drawNosFlames(ctx, rw, rh) {
  if (!GameState.nosBurning || GameState.status !== 'PLAYING') return;
  const calm = GameState.reducedMotion;
  const y = rh * 0.885;
  const len = rh * (calm ? 0.05 : 0.07 + 0.025 * Math.sin(RS.fxClock * 47));
  if (!nosFlameGrad) {
    // Built once from (0,0) to (0,1) and stretched over each flame at fill time (ticket 0005).
    nosFlameGrad = ctx.createLinearGradient(0, 0, 0, 1);
    nosFlameGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    nosFlameGrad.addColorStop(0.25, 'rgba(96,165,250,0.9)');
    nosFlameGrad.addColorStop(0.7, 'rgba(168,85,247,0.6)');
    nosFlameGrad.addColorStop(1, 'rgba(168,85,247,0)');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = nosFlameGrad;
  for (let side = -1; side <= 1; side += 2) {
    const x = rw * 0.5 + side * rw * 0.045;
    ctx.beginPath();
    ctx.ellipse(x, y + len * 0.5, rw * 0.012, len * 0.5, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, len);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
let nosFlameGrad = null;

/** Pickups flying into the car, hit shockwaves and debris (screen space; both renderers). */
export function drawCarFx(ctx, rw, rh, over3d) {
  if (!over3d && !carArt) drawNosFlames(ctx, rw, rh);
  // 5.2 Render Animated Power-Ups Magnetically Arcing into the player car's Fusion Core!
  const carCenterX = rw * 0.5;
  const carCenterY = rh * 0.81;
  for (let i = 0; i < GameState.pickupAnimations.length; i++) {
    const pa = GameState.pickupAnimations[i];
    const t = Math.min(1, pa.progress);
    const curX = (carCenterX + pa.startX) * (1 - t) + carCenterX * t;
    const arcLift = Math.sin(t * Math.PI) * 65;
    const curY = (carCenterY + pa.startY) * (1 - t) + carCenterY * t - arcLift;
    const r = Math.max(4, (1 - t * 0.4) * 14);

    if (pickupArt && PICKUPS[pa.type]) { pickupArt.drawPickup(ctx, pa.type, curX, curY, r * 2.4, 0, 0, true); continue; }
    ctx.save();
    ctx.translate(curX, curY);
    ctx.rotate(pa.spin);
    ctx.fillStyle = pa.type === 'PLUTONIUM' ? '#00f0ff' : '#facc15';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.5, -r * 0.5, r, r);
    ctx.restore();
  }
  if (pickupArt) {
    pickupArt.drawBursts(ctx, GameState.playerScreenX || carCenterX, carCenterY, rw);
    if (GameState.status === 'PLAYING' && !GameState.loopRide) pickupArt.drawHint(ctx, rw, rh, GameState.pickupHint, GameState.pickupHintSide, GameState.pickupHintSegs, RS.fxClock);
    if (GameState.power && GameState.power.on) pickupArt.drawPowerHud(ctx, rw, rh, GameState.power, GameState.playerScreenX || carCenterX, carCenterY, RS.fxClock, GameState.reducedMotion);
  }
  if (hzArt && GameState.hz && GameState.hz.on) hzArt.hud(ctx, rw, rh, over3d, RS.fxClock);

  // 5.3 Render Expanding 3D Shockwave Rings & Floating Holo-Popups on Acquire / Hit!
  for (let i = 0; i < GameState.hitShockwaves.length; i++) {
    const sw = GameState.hitShockwaves[i];
    const alpha = Math.max(0, sw.life / sw.maxLife);
    const sx = carCenterX + sw.x;
    const sy = carCenterY + sw.y;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sw.radius, sw.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (pickupArt) pickupArt.drawLabels(ctx, rw, rh, GameState.hitShockwaves, over3d || GameState.loopRide || GameState.cameraMode === 2 ? null : GameState.carBox, GameState.reducedMotion);

  // 5.4 Render 3D Spinning Debris Shards Bouncing off the Orange Toy-Track!
  for (let i = 0; i < GameState.debrisShards.length; i++) {
    const d = GameState.debrisShards[i];
    ctx.save();
    ctx.translate(carCenterX + d.x, carCenterY + d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.size * 0.5, -d.size * 0.35, d.size, d.size * 0.7);
    ctx.restore();
  }

}

/** Streaks rushing out of the vanishing point, only in the outer band so the road stays clear. */
// Speed-line colours by alpha in 1/50 steps, built once (no string per line per frame; 0182).
const LINE_RGB = ['255,190,110', '200,245,255', '110,255,170'];
const lineColors = [[], [], []];
function lineColor(k, a) {
  const q = Math.max(0, Math.min(50, Math.round(a * 50)));
  return lineColors[k][q] || (lineColors[k][q] = `rgba(${LINE_RGB[k]},${q / 50})`);
}

export function drawSpeedLines(c, intensity) {
  GameState.fxLinesDrawn = 0;
  // Slipstream wake (0197): the lazy cue tints the edges, then lifts and greens these lines.
  const w = RS.wake && RS.wake(c, viewW, viewH);
  const wl = w && w.on ? w.lines : 0;
  if (wl > intensity) intensity = wl;
  if (intensity <= 0) return;
  const W = viewW, H = viewH;
  const cx = W * 0.5, cy = H * 0.44;
  const count = Math.round(10 + 34 * intensity);
  const maxR = Math.hypot(W, H) * 0.62;
  c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    // Deterministic per-line angle; phase scrolls with time so lines fly outward.
    const seed = Math.sin(i * 91.17) * 43758.5453;
    const ang = (seed - Math.floor(seed)) * Math.PI * 2;
    const phase = (RS.fxClock * (1.6 + intensity * 2.4) + i * 0.137) % 1;
    const r0 = maxR * (0.42 + phase * 0.6);
    const r1 = r0 + maxR * (0.08 + 0.22 * intensity);
    const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0 * 0.75;
    const x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1 * 0.75;
    const fade = 1 - phase * 0.7;
    c.strokeStyle = i % 3 === 0 ? lineColor(0, 0.5 * intensity * fade) : lineColor(wl ? 2 : 1, 0.6 * intensity * fade);
    c.lineWidth = (1.5 + 3 * intensity) * (W / 1280);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  GameState.fxLinesDrawn = count;
}

/** Concentric cyan/magenta rings collapsing into the horizon right after a warp. */
export function drawWarpTunnel(c, k) {
  const W = viewW, H = viewH;
  const cx = W * 0.5, cy = H * 0.44;
  c.lineWidth = 3 * (W / 1280);
  for (let i = 0; i < 6; i++) {
    const r = ((1 - k) * 1.4 + i * 0.22) % 1.4 * Math.max(W, H) * 0.5;
    c.strokeStyle = i % 2 ? 'rgba(255,0,140,' + (0.35 * k) + ')' : 'rgba(0,240,255,' + (0.35 * k) + ')';
    c.beginPath();
    c.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

export function drawSparks(c, rw, rh) {
  const sx = viewW / rw, sy = viewH / rh;
  const ox = rw * 0.5 * sx, oy = rh * 0.86 * sy;
  for (let i = 0; i < sparks.items.length; i++) {
    const p = sparks.items[i];
    if (p.life <= 0) continue;
    const a = p.life / p.maxLife;
    c.fillStyle = 'hsla(' + p.hue + ',100%,' + (55 + 30 * a) + '%,' + a + ')';
    const s = p.size * sx;
    c.fillRect(ox + p.x * sx - s / 2, oy + p.y * sy - s / 2, s, s);
  }
}

/** Screen-space FX over the 3D view (the 2D canvas, cleared to transparent each frame). */
export function renderOverlayFx(feel) {
  const scale = getActiveEraRenderConfig().pixelScale || 1.0;
  const rw = Math.max(240, Math.floor(viewW / scale));
  const rh = roadCanvasHeight();
  beginMainFrame();
  mainCtx.clearRect(0, 0, viewW, viewH);
  mainCtx.save();
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) drawWarpTunnel(mainCtx, GameState.warpFxTimer / 0.9);
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  mainCtx.scale(viewW / rw, viewH / rh);
  drawCarFx(mainCtx, rw, rh, true);
  mainCtx.restore();
}
