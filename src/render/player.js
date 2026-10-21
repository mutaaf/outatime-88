// The player's car in the 2D race (ticket 0015: carved out of main.js): headlight beams,
// underglow, the car sprite (or its placeholder) with its own flames, and the screen box
// floating labels stay clear of.
import { GameState } from '../state.js';
import { POP_CULTURE_ROSTER } from '../data.js';
import { SaveStore } from '../save.js';
import { RS, carArt, carPaint } from '../main.js';

const playerLook = { shape: '', body: '', cabin: '', glow: '' };
let playerThrust = null;
export const thrustState = { nos: 0, plume: 0, color: '', t: 0, calm: false, hover: false };
let beamGrad = null, beamGradH = -1;
export function drawPlayerCar(ctx, rw, rh, eraCfg) {
  const carW = Math.max(58, Math.floor(rw * 0.22));
  const carH = Math.max(32, Math.floor(carW * 0.54));
  const cx = GameState.playerScreenX || Math.floor(rw * 0.5);
  const jumpOffset = Math.floor((GameState.playerY / 220) * (rh * 0.26));
  const bounce = (GameState.playerY <= 2 && GameState.speed > 5)
    ? Math.sin(GameState.trackPos * 0.045) * 1.8
    : 0;
  const suspPx = Math.max(-14, Math.min(14, -(GameState.suspOffset || 0) + (GameState.chassisPitch || 0) * 0.8));
  const cy = Math.floor(rh * 0.87 - jumpOffset + bounce + (GameState.carJoltY || 0) + suspPx);

  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const liveryObj = carPaint(activeChar);

  ctx.save();
  ctx.translate(cx, cy - carH * 0.5);
  // Duck-Slide Low Profile Compression when sliding under High Light Gates!
  if (GameState.isDuckSliding) {
    ctx.translate(0, carH * 0.16);
    ctx.scale(1.08, 0.68);
  }
  // Flash alpha during invulnerability frames
  if (GameState.invulnTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
    ctx.globalAlpha = 0.65;
  }
  // Power-Up Acquisition Surge Scale Pulse!
  if (GameState.carSurgeTimer > 0) {
    const sPulse = 1 + Math.sin(GameState.carSurgeTimer * Math.PI * 3.5) * 0.08;
    ctx.scale(sPulse, sPulse);
  }

  // Camera banking + 2-wheel tilt + stunt barrel roll, plus a little body roll away from the turn.
  const yaw = Math.max(-0.7, Math.min(0.7, GameState.carYaw || 0));
  const rollRad = (GameState.cameraBank + GameState.stuntSpinAngle) * (Math.PI / 180) + yaw * 0.12 + (GameState.chassisRoll || 0);
  ctx.rotate(rollRad);
  // Body yaw seen from the chase cam: the rear face foreshortens and its far corner rides up
  // the screen, so the car visibly points where it's going (and the tail swings out in a drift).
  // (The cached sprites bake the yaw into the model itself; only the placeholder is skewed.)
  if (!carArt) ctx.transform(Math.cos(yaw * 1.4), -Math.sin(yaw * 1.4) * 0.32, 0, 1, 0, 0);
  if (GameState.trickPitchAngle > 0) {
    const pitchScaleY = Math.cos(GameState.trickPitchAngle * Math.PI / 180);
    ctx.scale(1, Math.abs(pitchScaleY) < 0.22 ? 0.22 : pitchScaleY);
  }

  // Keep tires planted on exact lane center during drift

  // Dual Xenon Headlight Beams Projected Forward onto the Night Asphalt
  if (GameState.playerY < 60) {
    if (beamGradH !== carH) { // carH only changes on resize (ticket 0005: no per-frame gradients)
      beamGradH = carH;
      beamGrad = ctx.createLinearGradient(0, -carH * 0.2, 0, -carH * 2.8);
      beamGrad.addColorStop(0, 'rgba(224, 242, 254, 0.24)');
      beamGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
    }
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(-carW * 0.38, -carH * 0.2);
    ctx.lineTo(-carW * 0.95, -carH * 2.8);
    ctx.lineTo(-carW * 0.12, -carH * 2.8);
    ctx.lineTo(-carW * 0.18, -carH * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(carW * 0.18, -carH * 0.2);
    ctx.lineTo(carW * 0.12, -carH * 2.8);
    ctx.lineTo(carW * 0.95, -carH * 2.8);
    ctx.lineTo(carW * 0.38, -carH * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // DUB Neon Underglow + Ground Shadow
  if (GameState.playerY < 160) {
    ctx.fillStyle = SaveStore.data.underglow || '#00f0ff';
    ctx.globalAlpha = 0.42;
    if (carArt) {
      // A pool of light on the road under the car, as wide as this car is.
      const gw = carW * 0.5 * carArt.widthOf(activeChar.shape);
      ctx.beginPath();
      ctx.ellipse(0, carH * 0.54 + jumpOffset * 0.65, gw * 1.15, Math.max(4, carH * 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-carW * 0.56, carH * 0.40 + jumpOffset * 0.65, carW * 1.12, Math.max(5, carH * 0.20));
    ctx.globalAlpha = 1.0;
  }

  // AGRO Kinetic Shield Aura
  if (GameState.agroTimer > 0) {
    ctx.strokeStyle = '#ff5500';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, carW * 0.66, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tires OR 2015 Hover Conversion Glowing Thrusters
  const isHovering = (GameState.hoverActiveTimer > 0 || GameState.playerY > 25 || eraCfg.id === '2088');
  if (isHovering && !carArt) {
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(-carW * 0.58, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillRect(carW * 0.33, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-carW * 0.52, carH * 0.32, carW * 0.14, carH * 0.08);
    ctx.fillRect(carW * 0.38, carH * 0.32, carW * 0.14, carH * 0.08);
  } else if (!carArt) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(-carW * 0.52, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillRect(carW * 0.30, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillStyle = SaveStore.data.underglow || '#ff5500';
    ctx.fillRect(-carW * 0.50, carH * 0.22, carW * 0.04, carH * 0.22);
    ctx.fillRect(carW * 0.46, carH * 0.22, carW * 0.04, carH * 0.22);
  }

  if (carArt) {
    // Your car, as itself: the garage model of the car you picked, in your paint (src/car-sprite.js).
    playerLook.shape = activeChar.shape; playerLook.body = liveryObj.body; playerLook.cabin = liveryObj.cabin; playerLook.glow = activeChar.glow;
    if (!playerThrust) playerThrust = carArt.createThrust();
    carArt.drawCarAt(ctx, playerLook, 0, carH * 0.54, carW * 0.84, { yaw, hover: isHovering, brake: Boolean(GameState.braking) && GameState.status === 'PLAYING' }, playerThrust);
    GameState.playerShape2D = activeChar.shape;
    // Flames, NOS, plumes and hover thrusters from this car's own pipes (src/car-sprite.js).
    const plume = GameState.warpActiveTimer > 0 || GameState.driftTier > 0 ? 1 : GameState.speed >= 76 ? Math.min(1, (GameState.speed - 70) / 30) : 0;
    thrustState.nos = GameState.nosBurning && GameState.status === 'PLAYING' ? 1 : 0;
    thrustState.plume = plume;
    thrustState.color = GameState.driftTier === 3 ? '#d946ef' : GameState.driftTier > 0 ? '#ff6600' : (GameState.speed >= 88 ? '#00f0ff' : '#ff6600');
    thrustState.t = RS.fxClock; thrustState.calm = GameState.reducedMotion; thrustState.hover = isHovering;
    carArt.drawThrust(ctx, playerThrust, thrustState);
    GameState.thrustTips = playerThrust.n;
  } else {
    // Placeholder until the sprite chunk lands (the first frames of a cold boot).
    ctx.fillStyle = liveryObj.body;
    ctx.fillRect(-carW * 0.48, -carH * 0.16, carW * 0.96, carH * 0.52);
    ctx.fillStyle = liveryObj.cabin;
    ctx.fillRect(-carW * 0.32, -carH * 0.52, carW * 0.64, carH * 0.38);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-carW * 0.44, -carH * 0.02, carW * 0.26, carH * 0.15);
    ctx.fillRect(carW * 0.18, -carH * 0.02, carW * 0.26, carH * 0.15);
    GameState.playerShape2D = '';
  }

  // Twin Plasma & Nitrous Exhaust Plumes (placeholder car only; sprites use their own pipes)
  if (!carArt && (GameState.speed >= 76 || GameState.warpActiveTimer > 0 || GameState.driftTier > 0)) {
    const flameLen = (GameState.speed >= 88 ? 0.36 : 0.22) * carH;
    ctx.fillStyle = GameState.driftTier === 3 ? '#d946ef' : (GameState.speed >= 88 ? '#00f0ff' : '#ff6600');
    ctx.fillRect(-carW * 0.39, carH * 0.18, carW * 0.11, flameLen);
    ctx.fillRect(carW * 0.28, carH * 0.18, carW * 0.11, flameLen);
  }

  // Smooth Flux Aura when ready for 88 MPH Warp
  if (GameState.lightningBolts.length > 0) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-carW * 0.46, -carH * 0.15);
    ctx.lineTo(0, -carH * 0.58);
    ctx.lineTo(carW * 0.46, -carH * 0.15);
    ctx.stroke();
  }

  // Drift & Takedown Sparks
  for (let i = 0; i < GameState.particles.length; i++) {
    const p = GameState.particles[i];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * (carW / 90), carH * 0.35 + p.y * 0.2, 3, 3);
  }

  ctx.restore();
  // The car's screen box (surge pulse and roll included), for floating labels to stay clear of (0114).
  // The sprite's frame width covers yaw; the AGRO ring reaches above the roof.
  const half = Math.max(carW * 0.55, carArt ? playerThrust.w * 0.55 : 0), lift = Math.abs(Math.sin(rollRad)) * half, b = GameState.carBox;
  b.x0 = cx - half - lift; b.x1 = cx + half + lift;
  b.y0 = cy - carH * 0.5 + Math.min((carArt ? playerThrust.top : -carH * 0.52) * 1.1, GameState.agroTimer > 0 ? -carW * 0.7 : 0) - lift; b.y1 = cy + carH * 0.1 + lift;
}
