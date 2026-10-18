// 2D art for the orange-track set pieces (sprint 4). Lazy chunk: main.js imports it after the
// first frame and simply skips the art until it arrives (the simulation never waits for it).
//
//   drawAhead(ctx, segs, era)  the real loop rising off the road ahead (drawLoopAhead) and the speed signs at their
//                              booster gates, drawn into the road layer
//   drawCutaway(ctx, w, h, s)  the side-on loop cam while you're in a loop: the orange loop,
//                              your car going round it, and a fall if you came in too slow
//
// No allocation per frame beyond canvas paths; no external assets; calm mode drops the motion
// trails (the cutaway itself never rolls the screen).
import { ERA_PALETTES } from './era-palettes.js';
import { ROAD_CFG } from './data.js';
import { LOOP_CAM, NEAR, loopPoint, loopCamera, horizonRow } from './loopcam.js';

const ORANGE = '#ff6a13', ORANGE_DARK = '#b83a00', ORANGE_LIT = '#ffb15c';

/** Era-themed loop dressing: the clock-tower loop, a neon loop, a timber trestle loop… */
function themeFor(year) {
  if (year === 1955 || year === 2026) return { band: ORANGE, edge: '#ffe08a', clock: true };
  if (year === 2088 || year === 2015) return { band: '#ff2fa8', edge: '#38e8ff', neon: true };
  if (year === 1885) return { band: '#a0522d', edge: '#f2b84b', timber: true };
  return { band: ORANGE, edge: ORANGE_LIT };
}

export function eraYearOf(eraCfg) {
  const y = parseInt(String((eraCfg && eraCfg.name) || ''), 10);
  return Number.isFinite(y) ? y : 2026;
}

/** A clock face stopped at 10:04 (the nod in docs/EASTER_EGGS.md). */
function clockFace(ctx, x, y, r) {
  ctx.fillStyle = '#fdf6e3';
  ctx.strokeStyle = '#3b2a12';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.1);
  const hand = (a, len) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); ctx.stroke(); };
  hand((10 + 4 / 60) / 12 * Math.PI * 2, r * 0.5);
  hand(4 / 60 * Math.PI * 2, r * 0.8);
}

/**
 * Loops ahead and the speed signs at their gates. `segs` are this frame's visible segments
 * (projected, near → far); each set piece is drawn once, at its first segment.
 */
export function drawAhead(ctx, segs, eraCfg) {
  const year = eraYearOf(eraCfg);
  const th = themeFor(year);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    const f = seg.feature;
    if (!f || seg.p1.world.z !== f.z0) continue;
    const x = seg.p1.screen.x, y = seg.p1.screen.y, w = seg.p1.screen.w;
    if (w < 2) continue;
    if (f.kind === 'LOOP') {
      // The real loop (src/loopcam.js), seen from here: the one you are about to drive round.
      const sCar = ROAD_CFG.playerZOffset - seg.p1.camera.z;
      if (sCar < 0) drawLoopAhead(ctx, ctx.canvas.width, ctx.canvas.height, f, sCar, x, y, w, eraCfg);
    } else if (f.kind === 'BOOSTER' && f.boostTo) {
      // A roadside speed sign: the gate tops you up to this for what's next.
      const sx = x + w * 1.32, sh = Math.max(6, w * 0.5);
      ctx.fillStyle = '#1d1d1d';
      ctx.fillRect(sx - 1, y - sh * 1.6, Math.max(1, w * 0.03), sh * 1.6);
      ctx.fillStyle = '#fdf6e3';
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = Math.max(1, sh * 0.12);
      ctx.beginPath(); ctx.arc(sx, y - sh * 1.6, sh * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (sh > 9) {
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(sh * 0.42)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${f.boostTo}`, sx, y - sh * 1.6);
      }
    }
  }
}

/**
 * The side-on loop cam. `s`: { t (0..1 through the loop), mph, color, eraCfg, failed, reduced }.
 * Fades in and out at the ends so the cut never pops.
 */
export function drawCutaway(ctx, W, H, s) {
  const t = s.t;
  const fade = Math.min(1, t / 0.07, (1 - t) / 0.07);
  if (fade <= 0) return;
  const year = eraYearOf(s.eraCfg);
  const pal = ERA_PALETTES[year] || ERA_PALETTES[2026];
  const th = themeFor(year);
  ctx.save();
  ctx.globalAlpha = fade;
  // Sky and ground from the era's palette.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05040d');
  sky.addColorStop(0.75, pal.fog || '#2b1342');
  sky.addColorStop(1, pal.horizon || ORANGE);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const groundY = H * 0.8;
  ctx.fillStyle = (pal.ground && pal.ground[0]) || '#120a1e';
  ctx.fillRect(0, groundY, W, H - groundY);
  // The loop: entry from the left, round, exit to the right (slightly further back).
  const R = Math.min(W * 0.3, H * 0.33);
  const cx = W * 0.5, cy = groundY - R - R * 0.09;
  const band = R * 0.13;
  ctx.lineCap = 'round';
  ctx.strokeStyle = th.timber ? '#5b3415' : ORANGE_DARK;
  ctx.lineWidth = band * 0.7;
  ctx.beginPath(); ctx.moveTo(cx + R * 0.1, cy + R); ctx.lineTo(W + 20, cy + R - band * 0.4); ctx.stroke(); // exit (behind)
  ctx.strokeStyle = th.band;
  ctx.lineWidth = band;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-20, cy + R); ctx.lineTo(cx, cy + R); ctx.stroke(); // entry
  ctx.strokeStyle = th.edge;
  ctx.lineWidth = Math.max(1, band * 0.12);
  ctx.beginPath(); ctx.arc(cx, cy, R - band * 0.5, 0, Math.PI * 2); ctx.stroke();
  // Struts.
  ctx.strokeStyle = '#2a1206';
  ctx.lineWidth = Math.max(2, band * 0.25);
  ctx.beginPath(); ctx.moveTo(cx - R * 0.8, cy + R * 0.6); ctx.lineTo(cx - R * 0.6, groundY); ctx.moveTo(cx + R * 0.8, cy + R * 0.6); ctx.lineTo(cx + R * 0.6, groundY); ctx.stroke();
  if (th.clock) clockFace(ctx, cx, cy, R * 0.22);
  // The car: round the loop (counter-clockwise, climbing the right side first).
  let th0 = t * Math.PI * 2;
  let px = cx + Math.sin(th0) * (R - band * 0.55), py = cy + Math.cos(th0) * (R - band * 0.55);
  let ang = -th0;
  if (s.failed && t > 0.45) {
    // Off the top: tumble down through the middle of the loop.
    const k = (t - 0.45) / 0.55;
    px = cx + Math.sin(0.45 * Math.PI * 2) * R * (1 - k);
    py = cy - R * 0.9 + (groundY - (cy - R * 0.9)) * Math.min(1, k * k * 1.6);
    ang = -0.45 * Math.PI * 2 - k * 7;
    th0 = 0.45 * Math.PI * 2;
  }
  if (!s.reduced && !(s.failed && t > 0.45)) {
    // A speed trail along the track behind the car.
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.55)';
    ctx.lineWidth = band * 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, R - band * 0.55, Math.PI / 2 - th0 + 0.05, Math.PI / 2 - th0 + 0.75);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  const L = R * 0.36, Hc = R * 0.1;
  ctx.fillStyle = '#0a0a12';
  ctx.beginPath(); ctx.arc(-L * 0.3, -Hc * 0.05, Hc * 0.42, 0, Math.PI * 2); ctx.arc(L * 0.3, -Hc * 0.05, Hc * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = s.color || '#c9ced6';
  ctx.beginPath();
  ctx.moveTo(-L * 0.5, -Hc * 0.2);
  ctx.lineTo(-L * 0.46, -Hc * 0.9);
  ctx.lineTo(-L * 0.1, -Hc * 1.05);
  ctx.lineTo(L * 0.18, -Hc * 1.6);
  ctx.lineTo(L * 0.42, -Hc * 1.0);
  ctx.lineTo(L * 0.5, -Hc * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(56, 232, 255, 0.85)';
  ctx.fillRect(-L * 0.02, -Hc * 1.35, L * 0.24, Hc * 0.32);
  ctx.restore();
  // Title card.
  ctx.globalAlpha = fade;
  ctx.textAlign = 'center';
  // Under the loop, on the ground: the HUD owns the top of the screen.
  const big = Math.round(Math.min(W, H) * 0.07);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = s.failed && t > 0.45 ? '#ff4d6d' : '#fde047';
  ctx.font = `900 ${big}px sans-serif`;
  ctx.fillText(s.failed && t > 0.45 ? 'TOO SLOW!' : `LOOP!  ${Math.round(s.mph)} MPH`, W / 2, groundY + (H - groundY) * 0.42);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------
// The real loop: drive round it (src/loopcam.js has the geometry and the camera).
//
//   drawLoopRide(ctx, W, H, s)  the whole view while you're in (or just entering/leaving) a
//                               loop: sky and ground turning round you, the loop road curling
//                               up and over, the exit lane. Draw it before the car sprite.
//   drawLoopAhead(...)          the same loop seen from the approach (used by drawAhead)
//
// Everything is pooled: one offscreen canvas, one polygon pool, no per-frame objects.

const SEG = 200;            // sim Z per stripe (ROAD_CFG.segLength)
const RUN_IN = 3000;        // sim Z of run-in road drawn behind the loop's start
const RUN_OUT = 4500;       // and of exit lane after it
const WALL_M = 1.3;         // toy-track side wall height (m)
const MAX_POLYS = 900;

const polys = [];
for (let i = 0; i < MAX_POLYS; i++) polys.push({ n: 0, x: new Float32Array(10), y: new Float32Array(10), depth: 0, fill: '', stroke: '', width: 0 });
const order = new Int16Array(MAX_POLYS);
let polyCount = 0;
const cam = {}, pt = {}, pq = {};
// Clip scratch (camera space): input corners and Sutherland–Hodgman output.
const inX = new Float32Array(10), inY = new Float32Array(10), inZ = new Float32Array(10);
const outX = new Float32Array(10), outY = new Float32Array(10), outZ = new Float32Array(10);
let rideCanvas = null, rideCtx = null;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}
const shadeMemo = new Map();
const shadeOf = (hex, k) => { const key = hex + k; let v = shadeMemo.get(key); if (!v) { v = shade(hex, k); shadeMemo.set(key, v); } return v; };

/** Corner `i` of the polygon being built: loop-space point at (s, lat) lifted `up` metres. */
function corner(f, i, s, lat, up) {
  loopPoint(f, s, lat, pt);
  const x = pt.x, y = pt.y + pt.uy * up, z = pt.z + pt.uz * up;
  const dx = x - cam.ex, dy = y - cam.ey, dz = z - cam.ez;
  inX[i] = dx; inY[i] = dy * cam.uy + dz * cam.uz; inZ[i] = dy * cam.fy + dz * cam.fz;
}

/** Clip corners 0..n-1 to the near plane and project into the next pooled polygon. */
function emit(n, W, H, fill, stroke, width, closed) {
  if (polyCount >= MAX_POLYS) return;
  let m = 0;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const ai = inZ[i] > NEAR, aj = inZ[j] > NEAR;
    if (ai) { outX[m] = inX[i]; outY[m] = inY[i]; outZ[m] = inZ[i]; m++; }
    if (ai !== aj && m < 9) {
      const t = (NEAR - inZ[i]) / (inZ[j] - inZ[i]);
      outX[m] = inX[i] + (inX[j] - inX[i]) * t; outY[m] = inY[i] + (inY[j] - inY[i]) * t; outZ[m] = NEAR; m++;
    }
  }
  if (!closed && inZ[n - 1] > NEAR && m < 10) { outX[m] = inX[n - 1]; outY[m] = inY[n - 1]; outZ[m] = inZ[n - 1]; m++; }
  if (m < 2) return;
  const p = polys[polyCount++];
  const fx = LOOP_CAM.depth * W / 2, fy = LOOP_CAM.depth * H / 2;
  let d = 0;
  for (let i = 0; i < m; i++) {
    p.x[i] = W / 2 + fx * outX[i] / outZ[i];
    p.y[i] = H / 2 - fy * outY[i] / outZ[i];
    d += outZ[i];
  }
  p.n = m; p.depth = d / m; p.fill = fill; p.stroke = stroke; p.width = width;
}

/** True if the road's top surface at (s) faces the camera. */
function facing(f, s) {
  loopPoint(f, s, 0, pq);
  return (cam.ex - pq.x) * 0 + (cam.ey - pq.y) * pq.uy + (cam.ez - pq.z) * pq.uz > 0;
}

/** Fill the polygon pool with the loop road from sim Z `from` to `to` (relative to f.z0). */
function buildRoad(f, from, to, W, H, th) {
  const base = Math.floor(f.z0 / SEG);
  const band = th.band, dark = shadeOf(th.band, 0.82), under = shadeOf(th.band, 0.32);
  const wall = shadeOf(th.band, 0.62), wallLit = shadeOf(th.band, 1.15);
  const pxPerM = Math.max(1, W / 220); // stroke widths that scale with the screen
  for (let s0 = from; s0 < to; s0 += SEG) {
    const s1 = Math.min(to, s0 + SEG);
    const i = base + Math.round(s0 / SEG);
    const top = facing(f, (s0 + s1) / 2);
    const alt = (i & 1) === 0;
    // Road surface (both sides of the band: you see its underside overhead).
    corner(f, 0, s0, -0.9, 0); corner(f, 1, s0, 0.9, 0); corner(f, 2, s1, 0.9, 0); corner(f, 3, s1, -0.9, 0);
    emit(4, W, H, top ? (alt ? band : dark) : under, '', 0, true);
    if (top && alt) {
      corner(f, 0, s0, -0.035, 0.02); corner(f, 1, s0, 0.035, 0.02); corner(f, 2, s1, 0.035, 0.02); corner(f, 3, s1, -0.035, 0.02);
      emit(4, W, H, th.edge, '', 0, true);
    }
    // Rumble edges and the toy-track side walls.
    for (let side = -1; side <= 1; side += 2) {
      corner(f, 0, s0, side * 0.9, 0); corner(f, 1, s0, side, 0); corner(f, 2, s1, side, 0); corner(f, 3, s1, side * 0.9, 0);
      emit(4, W, H, top ? (alt ? '#fdf6e3' : '#e11d48') : under, '', 0, true);
      corner(f, 0, s0, side, 0); corner(f, 1, s0, side, WALL_M); corner(f, 2, s1, side, WALL_M); corner(f, 3, s1, side, 0);
      emit(4, W, H, top ? wallLit : wall, '', 0, true);
      corner(f, 0, s0, side, WALL_M); corner(f, 1, s1, side, WALL_M);
      emit(2, W, H, '', th.edge, pxPerM * 0.6, false);
    }
  }
  // Hoops over the road: at the mouth, each quarter and the exit (an arch toward the loop's
  // centre inside it, so you drive through them).
  for (let qi = 0; qi <= 4; qi++) {
    const s = qi * 0.25 * f.length;
    if (s < from || s > to) continue;
    for (let k = 0; k <= 8; k++) {
      const ang = Math.PI * (k / 8);
      corner(f, k, s, -Math.cos(ang) * 1.05, Math.sin(ang) * LOOP_CAM.halfW * 0.75);
    }
    emit(9, W, H, '', th.edge, pxPerM * 1.6, false);
  }
}

function drawPolys(ctx, mapK, mapX, mapY, bx, by) {
  for (let i = 0; i < polyCount; i++) order[i] = i;
  // Painter's order: farthest first.
  const sub = order.subarray(0, polyCount);
  sub.sort((a, b) => polys[b].depth - polys[a].depth);
  ctx.lineJoin = 'round';
  for (let k = 0; k < polyCount; k++) {
    const p = polys[sub[k]];
    ctx.beginPath();
    for (let i = 0; i < p.n; i++) {
      const x = mapX + (p.x[i] - bx) * mapK, y = mapY + (p.y[i] - by) * mapK;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (p.fill) { ctx.closePath(); ctx.fillStyle = p.fill; ctx.fill(); }
    if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.width * mapK; ctx.stroke(); }
  }
}

/** Sky and ground for the ride camera: the horizon turns with you, overhead at the top. */
function drawWorld(ctx, W, H, pal, t, reduced) {
  const hz = horizonRow(cam, H);
  const span = H * 1.4;
  // Fill everything with ground, then the sky on its side of the horizon.
  const g0 = (pal.ground && pal.ground[0]) || '#120a1e', g2 = (pal.ground && pal.ground[2]) || '#05040d';
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
  if (Number.isFinite(hz.row)) {
    const gg = ctx.createLinearGradient(0, hz.row, 0, hz.row - hz.skyUp * -span);
    gg.addColorStop(0, pal.fog || g0); gg.addColorStop(0.08, g0); gg.addColorStop(1, g2);
    const sg = ctx.createLinearGradient(0, hz.row, 0, hz.row - hz.skyUp * span);
    sg.addColorStop(0, pal.horizon || ORANGE);
    sg.addColorStop(0.18, pal.fog || '#2b1342');
    sg.addColorStop(1, (pal.sky && pal.sky[0]) || '#05040d');
    if (hz.skyUp > 0) {
      ctx.fillStyle = gg; ctx.fillRect(0, Math.max(0, hz.row), W, H);
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, Math.min(H, Math.max(0, hz.row)));
    } else {
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, Math.min(H, Math.max(0, hz.row)));
      ctx.fillStyle = sg; ctx.fillRect(0, Math.max(0, hz.row), W, H);
    }
  } else if (hz.row === Infinity) {
    const sg = ctx.createLinearGradient(0, H, 0, 0);
    sg.addColorStop(0, pal.fog || '#2b1342'); sg.addColorStop(1, (pal.sky && pal.sky[0]) || '#05040d');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  }
  // A light-trail grid on the ground: the fixed world you turn over.
  const grid = pal.horizon || ORANGE;
  ctx.strokeStyle = grid;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, W / 640);
  ctx.beginPath();
  for (let k = -10; k <= 12; k++) gridLine(ctx, W, H, k * 12, -260, k * 12, 420);
  for (let k = -12; k <= 34; k++) gridLine(ctx, W, H, -120, k * 12, 145, k * 12);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!reduced && Number.isFinite(hz.row) && hz.row > -H && hz.row < 2 * H) {
    // The horizon glow line.
    ctx.strokeStyle = pal.horizon || ORANGE;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(1, H / 240);
    ctx.beginPath(); ctx.moveTo(0, hz.row); ctx.lineTo(W, hz.row); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function gridLine(ctx, W, H, x0, z0, x1, z1) {
  const y = -0.4;
  const dy0 = y - cam.ey;
  let ax = x0 - cam.ex, ay = dy0 * cam.uy + (z0 - cam.ez) * cam.uz, az = dy0 * cam.fy + (z0 - cam.ez) * cam.fz;
  let bx = x1 - cam.ex, by = dy0 * cam.uy + (z1 - cam.ez) * cam.uz, bz = dy0 * cam.fy + (z1 - cam.ez) * cam.fz;
  if (az <= NEAR && bz <= NEAR) return;
  if (az <= NEAR || bz <= NEAR) {
    const t = (NEAR - az) / (bz - az);
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
    if (az <= NEAR) { ax = cx; ay = cy; az = NEAR; } else { bx = cx; by = cy; bz = NEAR; }
  }
  const fx = LOOP_CAM.depth * W / 2, fy = LOOP_CAM.depth * H / 2;
  ctx.moveTo(W / 2 + fx * ax / az, H / 2 - fy * ay / az);
  ctx.lineTo(W / 2 + fx * bx / bz, H / 2 - fy * by / bz);
}

/**
 * The ride view. `s`: { f (the LOOP feature), z (the car's track Z), lat (playerX),
 * peelT (progress where it fell off, or null), blend (0..1), eraCfg, t, reduced }.
 * Returns the camera's fall progress (0 unless you peeled off).
 */
export function drawLoopRide(ctx, W, H, s) {
  if (s.blend <= 0) return 0;
  if (!rideCanvas) { rideCanvas = document.createElement('canvas'); rideCtx = rideCanvas.getContext('2d'); }
  if (rideCanvas.width !== W || rideCanvas.height !== H) { rideCanvas.width = W; rideCanvas.height = H; }
  const f = s.f;
  const year = eraYearOf(s.eraCfg);
  const pal = ERA_PALETTES[year] || ERA_PALETTES[2026];
  const th = themeFor(year);
  const sRel = s.z - f.z0;
  loopCamera(f, sRel, s.lat, s.peelT, cam);
  const c = rideCtx;
  drawWorld(c, W, H, pal, s.t, s.reduced);
  polyCount = 0;
  buildRoad(f, -RUN_IN, f.length + RUN_OUT, W, H, th);
  drawPolys(c, 1, 0, 0, 0, 0);
  ctx.save();
  ctx.globalAlpha = s.blend;
  if (cam.fall > 0 && !s.reduced) {
    // Off the top: the world tumbles while you drop (overscaled so no corner shows).
    ctx.translate(W / 2, H * 0.62);
    ctx.rotate(Math.sin(Math.PI * cam.fall) * 0.55);
    ctx.scale(1.35, 1.35);
    ctx.translate(-W / 2, -H * 0.62);
  }
  ctx.drawImage(rideCanvas, 0, 0);
  ctx.restore();
  return cam.fall;
}

/**
 * The loop from the approach, drawn into the 2D road: the same geometry and camera as the ride
 * (so it is the loop you then drive), pinned to where the 2D road puts the loop's mouth.
 * `x, y, w` are the 2D screen point and half-width of the loop's first segment; `sCar` the
 * car's track Z relative to the loop (negative, still approaching).
 */
export function drawLoopAhead(ctx, W, H, f, sCar, x, y, w, eraCfg) {
  const th = themeFor(eraYearOf(eraCfg));
  loopCamera(f, sCar, 0, null, cam);
  // Where this camera sees the mouth of the loop, and how wide.
  loopPoint(f, 0, 0, pt);
  const dy = pt.y - cam.ey, dz = pt.z - cam.ez;
  const cz = dy * cam.fy + dz * cam.fz, cy = dy * cam.uy + dz * cam.uz;
  if (cz <= NEAR) return;
  const fx = LOOP_CAM.depth * W / 2;
  const bx = W / 2 + fx * (pt.x - cam.ex) / cz, by = H / 2 - (LOOP_CAM.depth * H / 2) * cy / cz;
  const bw = fx * LOOP_CAM.halfW / cz;
  polyCount = 0;
  buildRoad(f, 0, f.length + SEG * 4, W, H, th);
  drawPolys(ctx, w / bw, x, y, bx, by);
}

export { LOOP_CAM, rideBlend } from './loopcam.js';
