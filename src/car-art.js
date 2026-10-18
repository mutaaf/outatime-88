// Garage showroom turntable (ticket 0072): a low-poly car drawn on a 2D canvas, rotating
// on a neon platform. Plain canvas, no WebGL, so it costs nothing in 2D mode; the 3D chunk's
// preview (src/render3d/preview.js) is used instead only when 3D is already loaded.
//
// Cars are painted by src/car-paint.js from the shared bodies in src/car-shapes.js (smooth
// lofted paint, glass, lights and real tyres), the same painter the race sprites use.

import { shapeOf } from './car-shapes.js';
import { paintCar } from './car-paint.js';

export { shapeOf };

/** A car to draw: its body (src/car-shapes.js) and colours. */
export function buildCarModel(shape, body, cabin) {
  const s = shapeOf(shape);
  return { s, body, cabin, shape };
}

/**
 * Draws one turntable frame.
 * @param ctx 2D context, sized in CSS px (caller handles devicePixelRatio)
 * @param car { shape, body, cabin, glow }
 * @param yaw rotation in radians; `locked` draws a dark silhouette
 */
export function drawTurntable(ctx, w, h, car, yaw, { locked = false, t = 0 } = {}) {
  const model = car.model || (car.model = buildCarModel(car.shape, car.body, car.cabin));
  const glow = car.glow || '#00f0ff';
  ctx.clearRect(0, 0, w, h);

  // Stage: horizon glow, perspective grid floor, platform ring.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0620');
  sky.addColorStop(0.55, '#24104a');
  sky.addColorStop(0.62, '#ff2a6d');
  sky.addColorStop(0.64, '#160a2e');
  sky.addColorStop(1, '#05030f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.63;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 42, 157, 0.35)';
  ctx.lineWidth = 1;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * w * 0.02, horizon);
    ctx.lineTo(w / 2 + i * w * 0.22, h);
    ctx.stroke();
  }
  const scroll = (t * 0.35) % 1;
  for (let i = 0; i < 9; i++) {
    const k = (i + scroll) / 9;
    const y = horizon + (h - horizon) * k * k;
    ctx.globalAlpha = 0.15 + 0.5 * k;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  const scale = Math.min(w / 6.4, h / 3.6);
  const cx = w / 2;
  const cy = h * 0.74;
  // Platform: a glowing disc the car sits on.
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 24, 0.85)';
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * 2.9, scale * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawModel(ctx, model, { cx, cy, scale, yaw, pitch: 0.32, locked, glow, pool: true });

  if (locked) {
    ctx.save();
    ctx.font = `${Math.round(Math.min(w, h) * 0.16)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.fillText('🔒', cx, cy - scale * 1.1);
    ctx.restore();
  }
}

/**
 * Draws a car model into `ctx` (shared by the garage turntable and the race sprites in
 * src/car-sprite.js, so both draw the same car).
 * @param o { cx, cy (ground point under the car's centre, px), scale (px per metre), yaw,
 *   pitch (camera tilt down), camDist?, locked?, glow?, pool? (underglow pool),
 *   wheels?: 'disc' | 'tyre' | 'none', brake?, anchors? (exhaust tips out, see car-paint.js) }
 */
export function drawModel(ctx, model, o) {
  paintCar(ctx, model.s, { body: model.body, cabin: model.cabin, glow: o.glow }, o);
}

/**
 * Runs a turntable in a canvas. Returns { set(car, locked), dispose() }.
 * Spins slowly; drag/swipe on the canvas turns it by hand. Respects reduced motion.
 */
export function createTurntable(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let car = null;
  let locked = false;
  let yaw = -0.8;
  let raf = 0;
  let last = 0;
  let dragX = null;
  let idleFor = 0;
  const onDown = (e) => { dragX = e.clientX; idleFor = 0; };
  const onMove = (e) => {
    if (dragX === null) return;
    yaw += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
  };
  const onUp = () => { dragX = null; };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function frame(ts) {
    // 30 fps is plenty for a slow spin and halves the painting cost.
    if (last && ts - last < 30) { raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    idleFor += dt;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 180;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    if (dragX === null && !reducedMotion && idleFor > 0.6) yaw += dt * 0.7;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (car) drawTurntable(ctx, w, h, car, yaw, { locked, t: reducedMotion ? 0 : ts / 1000 });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    set(next, isLocked) {
      car = { ...next, model: null };
      locked = Boolean(isLocked);
    },
    /** Spins the car once to show it off (a new pick or an unlock). */
    flourish() { yaw -= Math.PI * 0.5; idleFor = 1; },
    get yaw() { return yaw; },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
  };
}
