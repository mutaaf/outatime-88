// 1885 · CANYON RAVINE — a frontier railroad at sundown. Nods (docs/EASTER_EGGS.md): the town
// clock waiting to be dedicated, the GULCH OF NO NAME, a steam locomotive on the trestle whose
// smoke turns to fireworks when you hit 88 mph, circling buzzards, a tumbleweed, and a phone
// booth that blinks in from the future on the final lap.
import { rng, plate, strip, building, sign, haze, ridge, cactus, sprite, rainField, unitOf } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const C = {
  sky: ERA_PALETTES[1885].sky,
  ground: ERA_PALETTES[1885].ground,
};
const PUFFS = 10;

function build(o) {
  const r = rng(1885);
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    const sx = w * 0.38, sy = hz - (hz - top) * 0.1, sr = Math.min(w, hz - top) * 0.26;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
    g.addColorStop(0, 'rgba(255,214,120,0.9)'); g.addColorStop(0.3, 'rgba(255,150,60,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, top, w, hz - top);
    ctx.fillStyle = '#ffe7a8'; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.45, 0, Math.PI * 2); ctx.fill();
    // long streaky sunset clouds
    ctx.fillStyle = 'rgba(120,40,30,0.45)';
    for (let i = 0; i < 9; i++) { const y = top + (hz - top) * (0.15 + r() * 0.55), x = r() * w; ctx.fillRect(x, y, w * (0.15 + r() * 0.25), Math.max(1, (hz - top) * 0.012)); }
  }, (ctx, w, hz, h) => {
    ctx.fillStyle = 'rgba(255,190,110,0.12)';
    for (let i = 0; i < 40; i++) ctx.fillRect(r() * w, hz + r() * (h - hz), 2 + r() * 6, 1);
  });

  const far = strip(o, (ctx, W, hz, u) => {
    ridge(ctx, W, hz, 30 * u, 0.6, '#8a3d1c', 31, true);
    haze(ctx, W, hz - 34 * u, hz, 'rgba(242,184,75,0.85)', 0.55);
    ridge(ctx, W, hz, 18 * u, 0.5, '#6a2a12', 32, true);
    haze(ctx, W, hz - 20 * u, hz, 'rgba(216,117,44,0.8)', 0.35);
  });

  const spots = {};
  const mid = strip(o, (ctx, W, hz, u) => {
    // the ravine and the trestle across it
    const tx = W * 0.2, tw = 70 * u, deck = hz - 14 * u;
    ctx.strokeStyle = '#3b1a0a'; ctx.lineWidth = Math.max(1, 0.5 * u);
    ctx.fillStyle = '#3b1a0a'; ctx.fillRect(tx, deck, tw, 1.2 * u);
    for (let x = tx; x <= tx + tw; x += 5 * u) {
      ctx.beginPath(); ctx.moveTo(x, deck); ctx.lineTo(x - 2.5 * u, hz); ctx.moveTo(x, deck); ctx.lineTo(x + 2.5 * u, hz); ctx.stroke();
    }
    spots.rail = { x0: tx, x1: tx + tw, y: deck };
    // the line runs on along a cut embankment either side of the ravine
    ctx.fillStyle = '#5a2810';
    ctx.beginPath(); ctx.moveTo(-1, hz); ctx.lineTo(-1, deck + 1.2 * u); ctx.lineTo(tx + 2 * u, deck + 1.2 * u); ctx.lineTo(tx + 9 * u, hz); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx + tw - 9 * u, hz); ctx.lineTo(tx + tw - 2 * u, deck + 1.2 * u); ctx.lineTo(W + 1, deck + 1.2 * u); ctx.lineTo(W + 1, hz); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b1a0a'; ctx.fillRect(0, deck, W, 0.9 * u);
    // frontier town
    const town = W * 0.58;
    const front = (x, w, h, col, label) => {
      ctx.fillStyle = col; ctx.fillRect(x, hz - h, w, h);
      ctx.fillRect(x - 0.4 * u, hz - h - 2 * u, w + 0.8 * u, 2 * u); // false front
      ctx.fillStyle = 'rgba(255,200,120,0.6)'; ctx.fillRect(x + w * 0.2, hz - h * 0.55, w * 0.18, h * 0.22); ctx.fillRect(x + w * 0.62, hz - h * 0.55, w * 0.18, h * 0.22);
      ctx.fillStyle = '#2a1206'; ctx.fillRect(x - u, hz - h * 0.3, w + 2 * u, 0.6 * u); // porch roof
      if (label) sign(ctx, label, x + w / 2, hz - h - 0.8 * u, 1.9 * u, '#f8e3b5', { font: 'bold' });
    };
    front(town, 14 * u, 10 * u, '#4b2210', 'PALACE SALOON');
    front(town + 15 * u, 11 * u, 9 * u, '#542812', 'LIVERY');
    front(town + 27 * u, 12 * u, 11 * u, '#4a1f0e', 'ASSAY OFFICE');
    // the town clock, still a scaffold, waiting for its big day
    const cx = town + 46 * u;
    ctx.strokeStyle = '#2a1206'; ctx.lineWidth = Math.max(1, 0.4 * u);
    ctx.strokeRect(cx - 4 * u, hz - 24 * u, 8 * u, 24 * u);
    for (let y = hz - 24 * u; y < hz; y += 4 * u) { ctx.beginPath(); ctx.moveTo(cx - 4 * u, y); ctx.lineTo(cx + 4 * u, y + 4 * u); ctx.stroke(); }
    ctx.fillStyle = '#efe6cf'; ctx.beginPath(); ctx.arc(cx, hz - 20 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7c2d12'; ctx.fillRect(cx - 9 * u, hz - 13 * u, 18 * u, 3 * u);
    sign(ctx, 'CLOCK DEDICATION SAT.', cx, hz - 11.5 * u, 1.5 * u, '#fde68a');
    // windmill and a water tower
    const wx = town - 10 * u;
    ctx.fillStyle = '#2a1206'; ctx.fillRect(wx, hz - 16 * u, 0.6 * u, 16 * u);
    for (let a = 0; a < 8; a++) { ctx.save(); ctx.translate(wx + 0.3 * u, hz - 16 * u); ctx.rotate(a * Math.PI / 4); ctx.fillRect(0, -0.3 * u, 3.4 * u, 0.6 * u); ctx.restore(); }
    building(ctx, r, town + 62 * u, hz, 6 * u, 6 * u, '#3b1a0a', null);
    ctx.fillStyle = '#3b1a0a'; ctx.fillRect(town + 62.5 * u, hz - 13 * u, 5 * u, 7 * u);
    // the sign for the ravine nobody has named yet
    ctx.fillStyle = '#5b2a10'; ctx.fillRect(tx - 14 * u, hz - 6 * u, 0.5 * u, 6 * u); ctx.fillRect(tx - 18 * u, hz - 7 * u, 9 * u, 2.6 * u);
    sign(ctx, 'GULCH OF NO NAME', tx - 13.5 * u, hz - 5.7 * u, 1.2 * u, '#fde68a');
    spots.booth = { x: town + 40 * u, y: hz, u };
  });

  const near = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W; x += 22 * u) {
      cactus(ctx, x + r() * 10 * u, hz, (6 + r() * 7) * u, '#2a1206');
      ctx.fillStyle = '#2a1206';
      ctx.fillRect(x + 14 * u, hz - 13 * u, 0.6 * u, 13 * u); ctx.fillRect(x + 12.6 * u, hz - 12 * u, 3.4 * u, 0.4 * u); // telegraph pole
    }
    ctx.strokeStyle = 'rgba(42,18,6,0.8)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); for (let x = 0; x <= W; x += 22 * u) { ctx.moveTo(x + 14 * u, hz - 12 * u); ctx.quadraticCurveTo(x + 25 * u, hz - 10 * u, x + 36 * u, hz - 12 * u); } ctx.stroke();
  });

  const u = unitOf(Math.round(o.hz0 * o.k));
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.rail.x1,
    layers: [{ c: far, f: 0.08 }, { c: mid, f: 0.26 }, { c: near, f: 0.6 }],
    spots,
    loco: sprite(16 * u, 7 * u, (ctx, w, h) => {
      ctx.fillStyle = '#1c0d05';
      ctx.fillRect(w * 0.15, h * 0.35, w * 0.55, h * 0.45); // boiler
      ctx.fillRect(w * 0.62, h * 0.12, w * 0.28, h * 0.68); // cab
      ctx.fillRect(w * 0.2, h * 0.05, w * 0.08, h * 0.32); // stack
      ctx.beginPath(); ctx.moveTo(0, h * 0.95); ctx.lineTo(w * 0.15, h * 0.55); ctx.lineTo(w * 0.15, h * 0.95); ctx.fill(); // cowcatcher
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(w * 0.1, h * 0.38, w * 0.06, h * 0.12); // lamp
      ctx.fillStyle = '#100703';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w * (0.28 + i * 0.18), h * 0.85, h * 0.14, 0, Math.PI * 2); ctx.fill(); }
    }),
    car: sprite(12 * u, 6 * u, (ctx, w, h) => { ctx.fillStyle = '#2b1408'; ctx.fillRect(0, h * 0.2, w * 0.95, h * 0.62); ctx.fillStyle = 'rgba(255,200,120,0.55)'; for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.08 + i * 0.22), h * 0.32, w * 0.12, h * 0.18); }),
    booth: sprite(4 * u, 9 * u, (ctx, w, h) => {
      ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0, h * 0.1, w, h * 0.9); ctx.fillRect(w * 0.1, 0, w * 0.8, h * 0.12);
      ctx.fillStyle = '#93c5fd'; for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.18, h * (0.25 + i * 0.22), w * 0.64, h * 0.16);
      ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.05);
    }),
    weed: sprite(3 * u, 3 * u, (ctx, w, h) => { ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w * (0.15 + i * 0.04), i, i + 2.4); ctx.stroke(); } }),
    dust: rainField(40, 18),
    puffs: new Float32Array(PUFFS),
    u, flags: {},
  };
}

const FIREWORKS = ['#f472b6', '#facc15', '#4ade80', '#60a5fa'];

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const k = B.k, s = B.spots, u = B.u / k;
  // buzzards circling over the ravine
  ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = F.t * 0.4 + i * 2.1;
    const bx = F.x(1, s.rail.x0 + 30 * B.u) + Math.cos(a) * 14 * u, by = F.y(s.rail.y) - 22 * u + Math.sin(a) * 4 * u;
    const flap = F.reduced ? 0.6 : 0.6 + Math.sin(F.t * 6 + i) * 0.4;
    ctx.beginPath(); ctx.moveTo(bx - 2 * u, by - flap * u); ctx.lineTo(bx, by); ctx.lineTo(bx + 2 * u, by - flap * u); ctx.stroke();
  }
  // the train crosses the trestle on a loop
  const span = s.rail.x1 - s.rail.x0, p = (F.t * 0.06) % 1.6;
  const lx = s.rail.x0 - 30 * B.u + p * (span + 60 * B.u);
  const ty = F.y(s.rail.y);
  const lw = B.loco.width / k, lh = B.loco.height / k, cw = B.car.width / k, ch = B.car.height / k;
  const x0 = F.x(1, lx);
  ctx.drawImage(B.car, x0 - cw * 2.1, ty - ch, cw, ch);
  ctx.drawImage(B.car, x0 - cw * 1.05, ty - ch, cw, ch);
  ctx.drawImage(B.loco, x0, ty - lh, lw, lh);
  // smoke: a ring of puffs rising from the stack; at 88 mph they burn in colours
  const presto = B.flags[EGGS.PRESTO];
  for (let i = 0, n = Math.ceil(PUFFS * F.detail); i < n; i++) {
    const age = ((F.t * 0.9 + i / PUFFS) % 1);
    const px = x0 + lw * 0.24 - age * 18 * u, py = ty - lh - age * 14 * u, pr = (1 + age * 3) * u;
    ctx.globalAlpha = (1 - age) * (presto ? 0.95 : 0.5);
    ctx.fillStyle = presto ? FIREWORKS[i % 4] : '#d6c4b0';
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // a tumbleweed bowls along the near layer
  const ww = B.weed.width / k;
  const wx = ((F.t * 40) % (F.rw + 80)) - 40, wy = F.hz - ww - Math.abs(Math.sin(F.t * 5)) * (F.reduced ? 0 : 4);
  ctx.drawImage(B.weed, wx, wy, ww, ww);
  // final lap: a phone booth from somewhere-when blinks in by the saloon
  if (B.flags[EGGS.BOOTH]) {
    const age = F.t - F.mem.boothAt, on = F.reduced ? 1 : (age > 0.8 || ((age * 10) | 0) % 2 === 0);
    if (on) { const bw = B.booth.width / k, bh = B.booth.height / k; ctx.drawImage(B.booth, F.x(1, s.booth.x), F.y(s.booth.y) - bh, bw, bh); }
  }
}

function front(ctx, F, B) {
  // blowing dust, low and slow
  const d = B.dust, n = Math.floor((d.length / 3) * F.detail);
  ctx.fillStyle = 'rgba(240,190,120,0.35)';
  for (let i = 0; i < n; i++) {
    const x = ((d[i * 3] + F.t * 0.12 * d[i * 3 + 2]) % 1) * F.rw;
    const y = F.hz + d[i * 3 + 1] * (F.rh - F.hz) * 0.8;
    ctx.fillRect(x, y, 2 + d[i * 3 + 2] * 2, 1);
  }
}

const ADS = [
    ['PALACE SALOON', 'SARSAPARILLA 5¢', '#451a03', '#fde68a'],
    ['CLOCK DEDICATION', 'SATURDAY · TOWN SQUARE', '#7c2d12', '#ffedd5'],
    ['STEAM TO THE COAST', 'FASTEST LINE WEST', '#1c1917', '#fbbf24'],
    ['BLACKSMITH', 'HORSESHOES & REPAIRS', '#292524', '#e7e5e4'],
  ];

export default { ads: ADS, id: '1885', build, anim, front, memory: newEggMemory };
