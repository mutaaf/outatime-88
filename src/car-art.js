// Garage showroom turntable (ticket 0072): a low-poly car drawn on a 2D canvas, rotating
// on a neon platform. Plain canvas, no WebGL, so it costs nothing in 2D mode; the 3D chunk's
// preview (src/render3d/preview.js) is used instead only when 3D is already loaded.
//
// Each car is a few tapered boxes (hull, cabin, extras) in metres; faces are rotated,
// projected, back-face culled, depth-sorted and shaded against one key light.

const SHAPES = {
  GULLWING: { L: 4.2, W: 1.86, hull: [0.32, 0.72], nose: 0.42, cab: [-0.55, 0.85, 0.72, 1.12, 0.3], extras: ['vents'] },
  MUSCLE: { L: 4.6, W: 1.95, hull: [0.32, 0.82], nose: 0.2, cab: [-0.75, 0.55, 0.82, 1.28, 0.24], extras: ['scoop'] },
  TUNER_WING: { L: 4.3, W: 1.8, hull: [0.3, 0.74], nose: 0.32, cab: [-0.5, 0.75, 0.74, 1.18, 0.3], extras: ['wing'] },
  SCANNER: { L: 4.5, W: 1.86, hull: [0.3, 0.7], nose: 0.5, cab: [-0.6, 0.6, 0.7, 1.1, 0.32], extras: ['scanner'] },
  ROCKET: { L: 4.4, W: 1.75, hull: [0.28, 0.66], nose: 0.62, cab: [-0.9, 0.35, 0.66, 1.04, 0.3], extras: ['fin'] },
  HEAVY_VAN: { L: 4.9, W: 2.0, hull: [0.36, 1.0], nose: 0.08, cab: [-2.05, 1.35, 1.0, 1.95, 0.06], extras: [] },
  LIGHTCYCLE: { L: 3.2, W: 0.62, hull: [0.38, 0.86], nose: 0.5, cab: [-0.6, 0.35, 0.86, 1.08, 0.12], extras: ['ribbon'], cycle: true },
};

const LIGHT = norm([0.45, 0.85, 0.35]);

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** A tapered box as 6 faces; the top is inset by `taper` metres on x and z. */
function box(faces, x, y0, y1, z0, z1, taper, color, tag) {
  const tx = Math.min(x * 0.9, taper);
  const tz = Math.min((z1 - z0) * 0.45, taper);
  const b = [[-x, y0, z0], [x, y0, z0], [x, y0, z1], [-x, y0, z1]];
  const t = [[-x + tx, y1, z0 + tz], [x - tx, y1, z0 + tz], [x - tx, y1, z1 - tz], [-x + tx, y1, z1 - tz]];
  faces.push(
    { p: [t[0], t[3], t[2], t[1]], color, tag: tag === 'cab' ? 'roof' : tag },
    { p: [b[3], b[2], t[2], t[3]], color, tag: tag === 'cab' ? 'glass' : tag },      // front (+z)
    { p: [b[1], b[0], t[0], t[1]], color, tag: tag === 'cab' ? 'glass' : tag === 'hull' ? 'rear' : tag }, // rear (-z)
    { p: [b[0], b[3], t[3], t[0]], color, tag: tag === 'cab' ? 'glass' : tag },      // left
    { p: [b[2], b[1], t[1], t[2]], color, tag: tag === 'cab' ? 'glass' : tag },      // right
  );
}

/** Builds the faces and wheels for a car shape (metres, nose toward +z). */
export function buildCarModel(shape, body, cabin) {
  const s = SHAPES[shape] || SHAPES.GULLWING;
  const faces = [];
  const hx = s.W / 2;
  const hz = s.L / 2;
  box(faces, hx, s.hull[0], s.hull[1], -hz, hz, s.nose * 0.6, body, 'hull');
  box(faces, hx * (s.cycle ? 0.9 : 0.86), s.cab[2], s.cab[3], s.cab[0], s.cab[1], s.cab[4], cabin, 'cab');
  for (const e of s.extras) {
    if (e === 'wing') {
      box(faces, hx * 0.95, s.hull[1] + 0.32, s.hull[1] + 0.4, -hz + 0.05, -hz + 0.45, 0.02, body, 'trim');
      box(faces, 0.06, s.hull[1], s.hull[1] + 0.32, -hz + 0.18, -hz + 0.3, 0, '#1e293b', 'trim');
    } else if (e === 'scoop') {
      box(faces, hx * 0.3, s.hull[1], s.hull[1] + 0.16, 0.7, 1.45, 0.06, '#111827', 'trim');
    } else if (e === 'fin') {
      box(faces, 0.05, s.hull[1], s.hull[1] + 0.5, -hz + 0.1, -hz + 0.7, 0.18, body, 'trim');
    }
  }
  const r = s.cycle ? 0.4 : 0.36;
  const wheels = s.cycle
    ? [[0, r, hz - 0.45], [0, r, -hz + 0.45]]
    : [[-hx, r, hz - 0.85], [hx, r, hz - 0.85], [-hx, r, -hz + 0.85], [hx, r, -hz + 0.85]];
  return { s, faces, wheels, r, extras: s.extras };
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

  const pitch = 0.32;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const camDist = 9;
  const view = (p) => {
    // yaw around y, then pitch the camera down
    const x = p[0] * cyaw + p[2] * syaw;
    const z0 = -p[0] * syaw + p[2] * cyaw;
    const y = p[1] * cp - z0 * sp;
    const z = p[1] * sp + z0 * cp;
    const d = camDist / (camDist - z);
    return [cx + x * scale * d, cy - y * scale * d, z];
  };

  // Underglow pool.
  ctx.save();
  ctx.globalAlpha = locked ? 0.15 : 0.55;
  const pool = ctx.createRadialGradient(cx, cy, 2, cx, cy, scale * 2.4);
  pool.addColorStop(0, glow);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * 2.4, scale * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Faces: rotate, cull, sort, shade.
  const drawn = [];
  for (const f of model.faces) {
    const a = f.p[0], b = f.p[1], c = f.p[2];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    // rotate the normal with the car
    const nx = n[0] * cyaw + n[2] * syaw;
    const nz = -n[0] * syaw + n[2] * cyaw;
    n = [nx, n[1], nz];
    const toCam = [0, sp, cp];
    const facing = n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2];
    if (facing <= 0.001) continue;
    const pts = f.p.map(view);
    const depth = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
    const lit = 0.38 + 0.75 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    drawn.push({ pts, depth, lit, f });
  }
  // wheels as dark discs, sorted with the faces
  for (const wpos of model.wheels) {
    const p = view(wpos);
    drawn.push({ wheel: true, pts: [p], depth: p[2] - 0.2 });
  }
  drawn.sort((x, y) => x.depth - y.depth);

  ctx.save();
  ctx.lineJoin = 'round';
  for (const d of drawn) {
    if (d.wheel) {
      const [x, y] = d.pts[0];
      ctx.fillStyle = '#05060a';
      ctx.strokeStyle = locked ? '#1f2937' : glow;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, model.r * scale * 0.55, model.r * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    const { pts, lit, f } = d;
    let fill;
    if (locked) fill = shade('#1e1b3a', lit);
    else if (f.tag === 'glass') fill = `rgba(${Math.round(40 * lit)}, ${Math.round(120 * lit)}, ${Math.round(170 * lit)}, 0.92)`;
    else fill = shade(f.color, lit);
    ctx.fillStyle = fill;
    ctx.strokeStyle = locked ? 'rgba(148, 163, 184, 0.25)' : 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!locked && f.tag === 'rear') {
      // tail-light bar across the rear face
      const mid = (i, j, k) => [pts[i][0] + (pts[j][0] - pts[i][0]) * k, pts[i][1] + (pts[j][1] - pts[i][1]) * k];
      const l = mid(0, 3, 0.55), r = mid(1, 2, 0.55);
      ctx.save();
      ctx.strokeStyle = '#ff2a2a';
      ctx.shadowColor = '#ff2a2a';
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(2, scale * 0.07);
      ctx.beginPath();
      ctx.moveTo(l[0], l[1]);
      ctx.lineTo(r[0], r[1]);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

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
