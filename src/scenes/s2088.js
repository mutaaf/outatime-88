// 2088 · CYBER CLOCK HOLLOW — megacity night over a lightcycle arena. Nods (docs/EASTER_EGGS.md):
// refinery flare stacks over the arcology, flying police cruisers, the NOODLE BAR, an ENHANCE
// sign, TERMINUS ROBOTICS's chrome-skull billboard, light-trail racers cutting the grid at the
// horizon, and an origami unicorn drifting past on the final lap.
import { rng, plate, strip, building, sign, haze, groundGrid, reflect, sprite, rainField, drawRain, blink, unitOf } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const C = {
  sky: ERA_PALETTES[2088].sky,
  ground: ERA_PALETTES[2088].ground,
};
const STACKS = 4, COPS = 3, TRAILS = 3;

function build(o) {
  const r = rng(2088);
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    // smog bands lit pink from below
    for (let i = 0; i < 7; i++) { const y = top + (hz - top) * (0.2 + i * 0.1); ctx.fillStyle = `rgba(214,51,132,${0.04 + i * 0.015})`; ctx.fillRect(0, y, w, (hz - top) * 0.05); }
  }, (ctx, w, hz, h) => groundGrid(ctx, w, hz, h, '#22d3ee', 0.35));

  const spots = { stacks: [] };
  const far = strip(o, (ctx, W, hz, u) => {
    // the arcology: two stepped pyramids
    for (const px of [W * 0.22, W * 0.72]) {
      ctx.fillStyle = '#140827';
      ctx.beginPath(); ctx.moveTo(px - 30 * u, hz); ctx.lineTo(px - 8 * u, hz - 44 * u); ctx.lineTo(px + 8 * u, hz - 44 * u); ctx.lineTo(px + 30 * u, hz); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,120,0.55)';
      for (let y = hz - 40 * u; y < hz; y += 2.2 * u) { const half = 8 * u + (y - (hz - 44 * u)) * (22 / 44); for (let x = px - half + u; x < px + half - u; x += 2 * u) if (r() < 0.28) ctx.fillRect(x, y, 0.8 * u, 0.8 * u); }
    }
    for (let x = 0; x < W;) { const w = (3 + r() * 6) * u, h = (18 + r() * 40) * u; building(ctx, r, x, hz, w, h, '#10061f', 'rgba(255,120,200,0.45)', 0.22, r() < 0.4 ? 'antenna' : null); x += w + r() * 4 * u; }
    for (let i = 0; i < STACKS; i++) { const sx = (0.08 + i * 0.25) * W; ctx.fillStyle = '#0b0416'; ctx.fillRect(sx, hz - 26 * u, 2 * u, 26 * u); spots.stacks.push({ x: sx + u, y: hz - 26 * u }); }
    haze(ctx, W, hz - 36 * u, hz, 'rgba(214,51,132,0.85)', 0.5);
  });

  const mid = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W;) { const w = (10 + r() * 12) * u, h = (14 + r() * 26) * u; building(ctx, r, x, hz, w, h, '#0d0420', 'rgba(110,231,255,0.55)', 0.35); x += w + 2 * u; }
    sign(ctx, 'NOODLE BAR', W * 0.18, hz - 9 * u, 2.6 * u, '#fb7185', { glow: 7 * u, bg: 'rgba(20,0,20,0.6)' });
    sign(ctx, '麺', W * 0.18 + 12 * u, hz - 14 * u, 4 * u, '#fda4af', { glow: 6 * u });
    sign(ctx, 'ENHANCE', W * 0.42, hz - 22 * u, 2.4 * u, '#a5f3fc', { glow: 7 * u, bg: 'rgba(0,10,30,0.6)' });
    // TERMINUS ROBOTICS billboard with an original chrome robot skull
    const bx = W * 0.62, by = hz - 36 * u;
    ctx.fillStyle = '#05010c'; ctx.fillRect(bx - 16 * u, by, 32 * u, 16 * u);
    ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = Math.max(1, 0.4 * u); ctx.strokeRect(bx - 16 * u, by, 32 * u, 16 * u);
    const sx = bx - 9 * u, sy = by + 8 * u, sr = 5 * u;
    const g = ctx.createLinearGradient(sx, sy - sr, sx, sy + sr); g.addColorStop(0, '#f1f5f9'); g.addColorStop(0.5, '#94a3b8'); g.addColorStop(1, '#334155');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - sr * 0.15, sr, Math.PI, 0); ctx.lineTo(sx + sr * 0.8, sy + sr * 0.6); ctx.lineTo(sx - sr * 0.8, sy + sr * 0.6); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.fillRect(sx - sr * 0.6, sy - sr * 0.1, sr * 0.45, sr * 0.3); ctx.fillRect(sx + sr * 0.15, sy - sr * 0.1, sr * 0.45, sr * 0.3);
    for (let i = 0; i < 5; i++) ctx.fillRect(sx - sr * 0.55 + i * sr * 0.25, sy + sr * 0.4, sr * 0.12, sr * 0.2);
    spots.eyes = { x: sx, y: sy, r: sr };
    sign(ctx, 'TERMINUS', bx + 5 * u, by + 5.5 * u, 2.4 * u, '#fecdd3');
    sign(ctx, 'ROBOTICS', bx + 5 * u, by + 9 * u, 2.4 * u, '#fecdd3');
    sign(ctx, 'WE NEVER SLEEP', bx + 5 * u, by + 13 * u, 1.3 * u, '#f43f5e');
    haze(ctx, W, hz - 10 * u, hz, 'rgba(76,15,92,0.8)', 0.3);
  });
  reflect(mid.getContext('2d'), mid, Math.round(o.hz0 * o.k), Math.round(o.rh * 0.22 * o.k), 0.4);

  const u = unitOf(Math.round(o.hz0 * o.k));
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.eyes.x,
    layers: [{ c: far, f: 0.08 }, { c: mid, f: 0.3 }],
    spots, u,
    cop: sprite(8 * u, 2.6 * u, (ctx, w, h) => { ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.lineTo(w * 0.2, h * 0.25); ctx.lineTo(w * 0.8, h * 0.25); ctx.lineTo(w, h * 0.7); ctx.lineTo(w * 0.9, h); ctx.lineTo(w * 0.1, h); ctx.fill(); ctx.fillStyle = '#fef9c3'; ctx.fillRect(w * 0.92, h * 0.55, w * 0.08, h * 0.15); }),
    unicorn: sprite(7 * u, 6 * u, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.6;
      const P = [[0.15, 0.95], [0.25, 0.55], [0.6, 0.5], [0.72, 0.2], [0.95, 0.0], [0.8, 0.3], [0.9, 0.45], [0.75, 0.55], [0.8, 0.95], [0.6, 0.65], [0.35, 0.68]];
      ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h))); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.25 * w, 0.55 * h); ctx.lineTo(0.6 * w, 0.65 * h); ctx.lineTo(0.72 * w, 0.2 * h); ctx.stroke(); // folds
    }),
    rain: rainField(140, 88),
    flags: {},
  };
}

const TRAIL_COL = ['#22d3ee', '#fb923c', '#f0abfc'];

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const k = B.k, u = B.u / k, s = B.spots;
  // flare stacks
  for (let i = 0; i < s.stacks.length; i++) {
    const st = s.stacks[i], x = F.x(0, st.x), y = F.y(st.y);
    const h = (3 + (F.reduced ? 1 : Math.sin(F.t * 9 + i * 1.7) + 1)) * u;
    ctx.fillStyle = 'rgba(251,146,60,0.85)'; ctx.beginPath(); ctx.moveTo(x - u, y); ctx.lineTo(x, y - h); ctx.lineTo(x + u, y); ctx.fill();
    ctx.fillStyle = 'rgba(254,240,138,0.9)'; ctx.fillRect(x - 0.3 * u, y - h * 0.4, 0.6 * u, h * 0.4);
  }
  // searchlights sweeping the smog
  if (!F.reduced && F.detail >= 0.5) {
    ctx.fillStyle = 'rgba(165,243,252,0.06)';
    for (let i = 0; i < 3; i++) {
      const bx = F.rw * (0.2 + i * 0.3), a = Math.sin(F.t * 0.35 + i * 1.9) * 0.6;
      ctx.beginPath(); ctx.moveTo(bx, F.hz); ctx.lineTo(bx + Math.sin(a - 0.05) * F.hz * 1.3, 0); ctx.lineTo(bx + Math.sin(a + 0.05) * F.hz * 1.3, 0); ctx.fill();
    }
  }
  // flying police cruisers with light bars
  const cw = B.cop.width / k, ch = B.cop.height / k;
  for (let i = 0, n = Math.ceil(COPS * F.detail); i < n; i++) {
    const p = (F.t * (0.04 + i * 0.013) + i * 0.37) % 1;
    const x = p * (F.rw + cw * 2) - cw, y = F.hz - (22 + i * 11) * u + Math.sin(F.t + i) * 2 * u;
    ctx.drawImage(B.cop, x, y, cw, ch);
    const on = F.reduced ? 1 : blink(F.t, 0.4, 0.5, i * 0.13);
    ctx.fillStyle = on ? '#ef4444' : '#3b82f6'; ctx.fillRect(x + cw * 0.3, y, cw * 0.15, ch * 0.2);
    ctx.fillStyle = on ? '#3b82f6' : '#ef4444'; ctx.fillRect(x + cw * 0.55, y, cw * 0.15, ch * 0.2);
  }
  // the billboard skull's eyes glow red
  const ex = F.x(1, s.eyes.x), ey = F.y(s.eyes.y), er = s.eyes.r / k;
  ctx.fillStyle = F.reduced || blink(F.t, 2.4, 0.8) ? '#ef4444' : '#7f1d1d';
  ctx.fillRect(ex - er * 0.48, ey - er * 0.02, er * 0.22, er * 0.14); ctx.fillRect(ex + er * 0.27, ey - er * 0.02, er * 0.22, er * 0.14);
  // light-trail racers cutting across the arena at the horizon
  ctx.lineWidth = 2;
  for (let i = 0; i < TRAILS; i++) {
    const dir = i % 2 ? -1 : 1, p = (F.t * (0.12 + i * 0.03) + i * 0.3) % 1.4;
    const head = dir > 0 ? p * F.rw : F.rw - p * F.rw, y = F.hz + (2 + i * 3) * u;
    ctx.strokeStyle = TRAIL_COL[i];
    ctx.beginPath(); ctx.moveTo(head, y); ctx.lineTo(head - dir * F.rw * 0.25, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(head - 1, y - 1, 3, 2);
  }
  // final lap: an origami unicorn on the wind
  if (B.flags[EGGS.UNICORN]) {
    const p = (F.t - F.mem.unicornAt) / 8, uw = B.unicorn.width / k;
    ctx.drawImage(B.unicorn, F.rw * (1.05 - p * 1.2), F.hz - 12 * u + Math.sin(p * 9) * 3 * u, uw, uw * 0.86);
  }
}

function front(ctx, F, B) {
  drawRain(ctx, B.rain, F.rw, F.rh, F.reduced ? F.t * 0.3 : F.t, '#f0abfc', 0.8, 0.25, F.detail);
}

const ADS = [
    ['TERMINUS ROBOTICS', 'WE NEVER SLEEP', '#0f0f13', '#fb7185'],
    ['NOODLE BAR', 'OPEN ALL NIGHT · 麺', '#3b0764', '#f0abfc'],
    ['ENHANCE', 'PHOTO LAB · ZOOM 9000%', '#082f49', '#67e8f9'],
    ['GRID ARENA', 'LIGHT-TRAIL FINALS TONIGHT', '#1e1b4b', '#22d3ee'],
  ];

export default { ads: ADS, id: '2088', build, anim, front, memory: newEggMemory };
