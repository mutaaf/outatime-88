// 1955 · ATOMIC DINER STRIP — a sunny Saturday on the courthouse square. Nods
// (docs/EASTER_EGGS.md): the brand-new clock tower with a cable strung down to a lamppost
// (sparks race along it at 88 mph; lightning finds the tower as you warp), the drive-in double
// bill GIANT ANTS ATE OHIO, a Googie diner, the NEW '55 MODELS lot, and a B-movie flying saucer
// crossing the sky on the final lap.
import { rng, plate, strip, building, sign, haze, ridge, clouds, clockTower, palm, lamp, parkedCar, boltSprite, sprite, unitOf } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const C = {
  sky: ERA_PALETTES[1955].sky,
  ground: ERA_PALETTES[1955].ground,
};
const SPARKS = 6;

function build(o) {
  const r = rng(1955);
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    clouds(ctx, w, top + (hz - top) * 0.1, top + (hz - top) * 0.55, 'rgba(255,255,255,0.85)', 7, 55, (hz - top) * 0.09);
    const sx = w * 0.78, sy = top + (hz - top) * 0.25, sr = (hz - top) * 0.08;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4);
    g.addColorStop(0, 'rgba(255,250,220,0.9)'); g.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  });

  const far = strip(o, (ctx, W, hz, u) => {
    ridge(ctx, W, hz, 20 * u, 0.4, '#7fb3a5', 51);
    haze(ctx, W, hz - 22 * u, hz, 'rgba(255,213,158,0.9)', 0.45);
    ridge(ctx, W, hz, 12 * u, 0.35, '#5f9e8f', 52);
  });

  const spots = {};
  const mid = strip(o, (ctx, W, hz, u) => {
    const cx = W * 0.4;
    spots.tower = clockTower(ctx, cx, hz, 13 * u, 44 * u, '#c9b79c', '#f8f4ea', '#fffdf5', '#3f3a32');
    // shops round the square in candy colours
    const shop = (x, w, h, body, label, col) => {
      ctx.fillStyle = body; ctx.fillRect(x, hz - h, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + w * 0.1, hz - h * 0.45, w * 0.8, h * 0.3);
      ctx.fillStyle = '#ef4444'; for (let i = 0; i < 6; i++) ctx.fillRect(x + (w / 6) * i, hz - h * 0.55, w / 12, h * 0.08); // awning stripes
      sign(ctx, label, x + w / 2, hz - h * 0.8, 2 * u, col);
    };
    shop(cx - 52 * u, 16 * u, 13 * u, '#f9c5d1', 'SODA FOUNTAIN', '#9d174d');
    shop(cx - 34 * u, 14 * u, 15 * u, '#bde0fe', 'BIJOU', '#1d4ed8');
    shop(cx + 22 * u, 20 * u, 12 * u, '#fde68a', "NEW '55 MODELS", '#92400e');
    // Googie diner with a boomerang sign
    const dx = cx + 48 * u;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(dx, hz - 9 * u, 22 * u, 9 * u);
    ctx.fillStyle = '#14b8a6'; ctx.beginPath(); ctx.moveTo(dx - 2 * u, hz - 9 * u); ctx.lineTo(dx + 24 * u, hz - 13 * u); ctx.lineTo(dx + 24 * u, hz - 11 * u); ctx.lineTo(dx - 2 * u, hz - 8 * u); ctx.fill();
    ctx.fillStyle = '#0f766e'; ctx.fillRect(dx + 26 * u, hz - 24 * u, u, 24 * u);
    ctx.fillStyle = '#f43f5e'; ctx.beginPath(); ctx.moveTo(dx + 20 * u, hz - 22 * u); ctx.quadraticCurveTo(dx + 27 * u, hz - 30 * u, dx + 34 * u, hz - 22 * u); ctx.quadraticCurveTo(dx + 27 * u, hz - 26 * u, dx + 20 * u, hz - 22 * u); ctx.fill();
    sign(ctx, 'ATOMIC DINER', dx + 27 * u, hz - 19.5 * u, 2 * u, '#be123c', { bg: '#fff7ed' });
    spots.arrow = { x: dx + 27 * u, y: hz - 16 * u, u };
    // drive-in screen on its legs, double feature
    const sx = cx - 80 * u, sw = 26 * u, sh = 14 * u;
    ctx.fillStyle = '#6b7280'; ctx.fillRect(sx + 2 * u, hz - 6 * u, u, 6 * u); ctx.fillRect(sx + sw - 3 * u, hz - 6 * u, u, 6 * u);
    ctx.fillStyle = '#4b5563'; ctx.fillRect(sx, hz - 6 * u - sh, sw, sh);
    ctx.fillStyle = '#f5f5f4'; ctx.fillRect(sx + u, hz - 5 * u - sh, sw - 2 * u, sh - 2 * u);
    // the feature: a giant ant over a tiny town (silhouette)
    ctx.fillStyle = '#1c1917';
    const ax = sx + sw * 0.55, ay = hz - 6 * u - sh * 0.45;
    [0, 1, 2].forEach((i) => { ctx.beginPath(); ctx.ellipse(ax - i * 3.4 * u, ay, (1.6 + i * 0.5) * u, 1.3 * u, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.lineWidth = Math.max(1, 0.3 * u); ctx.strokeStyle = '#1c1917';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(ax - 3.4 * u, ay); ctx.lineTo(ax - (1 + i * 2.4) * u, ay + 3.5 * u); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(ax + u, ay - u); ctx.lineTo(ax + 2.6 * u, ay - 3.4 * u); ctx.stroke();
    for (let i = 0; i < 5; i++) ctx.fillRect(sx + 2 * u + i * 2 * u, ay + 2 * u - (i % 2) * u, 1.5 * u, 2 * u + (i % 2) * u);
    sign(ctx, 'GIANT ANTS ATE OHIO', sx + sw / 2, hz - 3 * u, 1.6 * u, '#7c2d12', { bg: '#fef3c7' });
    // the cable: from the tower's top down to a lamppost across the street
    const lx = cx + 17 * u;
    lamp(ctx, lx, hz, 14 * u, '#3f3a32', '#fef9c3', null);
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(1, 0.25 * u);
    ctx.beginPath(); ctx.moveTo(cx, spots.tower.top + 2 * u); ctx.quadraticCurveTo(cx + 9 * u, hz - 20 * u, lx, hz - 14 * u); ctx.stroke();
    spots.cable = { x0: cx, y0: spots.tower.top + 2 * u, cx: cx + 9 * u, cy: hz - 20 * u, x1: lx, y1: hz - 14 * u };
    for (let x = cx + 104 * u; x < W + cx - 86 * u; x += 14 * u) building(ctx, r, x % W, hz, 12 * u, (8 + r() * 8) * u, r() < 0.5 ? '#e7d8c0' : '#d7e3df', null);
  });

  const near = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W; x += 30 * u) {
      palm(ctx, x + 4 * u, hz, (16 + r() * 6) * u, '#2f5a4f');
      lamp(ctx, x + 14 * u, hz, 13 * u, '#334155', '#fef9c3', null);
      if (r() < 0.7) parkedCar(ctx, x + 17 * u, hz, 11 * u, ['#f472b6', '#38bdf8', '#facc15', '#f8fafc'][(r() * 4) | 0], 'rgba(30,41,59,0.6)', true);
    }
  });

  const u = unitOf(Math.round(o.hz0 * o.k));
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.tower.x - 22 * unitOf(Math.round(o.hz0 * o.k)),
    layers: [{ c: far, f: 0.08 }, { c: mid, f: 0.28 }, { c: near, f: 0.6 }],
    spots, u,
    bolt: boltSprite(Math.max(20, spots.tower.top / o.k), 1955),
    saucer: sprite(12 * u, 5 * u, (ctx, w, h) => {
      ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.62, w / 2, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfdbfe'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.42, w * 0.18, h * 0.3, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fde047'; for (let i = 0; i < 5; i++) ctx.fillRect(w * (0.18 + i * 0.15), h * 0.62, w * 0.04, h * 0.08);
    }),
    birds: new Float32Array(5),
    flags: {},
  };
}

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const k = B.k, u = B.u / k, s = B.spots;
  // gulls drifting over the square
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = ((F.t * (8 + i * 3) + i * 140) % (F.rw + 40)) - 20, y = F.hz - (30 + i * 6) * u, f = F.reduced ? 0.5 : 0.5 + Math.sin(F.t * 7 + i) * 0.5;
    ctx.beginPath(); ctx.moveTo(x - 1.6 * u, y - f * u); ctx.lineTo(x, y); ctx.lineTo(x + 1.6 * u, y - f * u); ctx.stroke();
  }
  // the diner's neon arrow chases (steady with calm motion)
  const a = s.arrow, ax = F.x(1, a.x), ay = F.y(a.y), au = a.u / k;
  for (let i = 0; i < 4; i++) {
    if (!F.reduced && ((F.t * 5) | 0) % 4 !== i) continue;
    ctx.fillStyle = '#f43f5e'; ctx.fillRect(ax - 3 * au + i * 1.6 * au, ay, au, au);
  }
  // 88 mph: sparks race down the cable
  if (B.flags[EGGS.WIRE_SPARKS]) {
    const c = s.cable;
    ctx.fillStyle = '#fef08a';
    for (let i = 0; i < SPARKS; i++) {
      const p = ((F.t * 1.4 + i / SPARKS) % 1), q = 1 - p;
      const lx = q * q * c.x0 + 2 * q * p * c.cx + p * p * c.x1, ly = q * q * c.y0 + 2 * q * p * c.cy + p * p * c.y1;
      ctx.fillRect(F.x(1, lx) - 1, F.y(ly) - 1, 3, 3);
    }
  }
  if (B.flags[EGGS.LIGHTNING]) {
    const tx = F.x(1, s.tower.x), ty = F.y(s.tower.top), bw = B.bolt.width, bh = B.bolt.height;
    ctx.drawImage(B.bolt, tx - bw / 2, ty - bh, bw, bh);
    if (!F.reduced) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, F.rw, F.hz); }
  }
  // final lap: a flying saucer wobbles across
  if (B.flags[EGGS.SAUCER]) {
    const p = (F.t - F.mem.saucerAt) / 9, sw = B.saucer.width / k, sh = B.saucer.height / k;
    ctx.drawImage(B.saucer, -sw + p * (F.rw + sw * 2), F.hz - 40 * u + Math.sin(p * 20) * (F.reduced ? 0 : 3 * u), sw, sh);
  }
}

export default { id: '1955', build, anim, memory: newEggMemory };
