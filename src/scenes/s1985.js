// 1985 · CEDAR RIDGE — suburb and mall under a big moon. Nods (docs/EASTER_EGGS.md): the TRIPLE
// PINES MALL that loses a pine (and a word) once history changes after lap 1, a kid's bike crossing
// the moon on the final lap, ARCADE 88 with a maze-chaser cabinet glow, BLOCKBUSTED video, the
// VIPER KAN karate dojo, and one house whose string lights flicker in sequence.
import { rng, plate, strip, building, sign, haze, ridge, stars, pine, lamp, parkedCar, sprite, blink, unitOf } from './kit.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const C = {
  sky: ['#05031a', '#0b071e', '#1c0f3a', [0.9, '#2b1342'], '#4a1d4f'],
  ground: ['#121a29', '#0c121e', '#070a12'],
};

function build(o) {
  const r = rng(1985);
  const hzP = Math.round((o.pad + o.hz0) * o.k);
  const moon = { x: 0.7, y: 0.3, r: 0 };
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    stars(ctx, w, top + (hz - top) * 0.7, 130, 3, '#fff', top);
    const mx = w * moon.x, my = top + (hz - top) * moon.y, mr = Math.min(w, hz - top) * 0.13;
    moon.r = mr; moon.py = my;
    const g = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3);
    g.addColorStop(0, 'rgba(230,230,255,0.35)'); g.addColorStop(1, 'rgba(230,230,255,0)');
    ctx.fillStyle = g; ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.fillStyle = '#f1f0ff'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,160,200,0.35)';
    [[-0.3, -0.2, 0.18], [0.25, 0.15, 0.22], [0.1, -0.4, 0.1], [-0.2, 0.35, 0.12]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); ctx.fill(); });
  });
  // Moon centre in plate px → screen: relative to the plate's horizon.
  const moonSpot = { x: o.rw * moon.x, dy: (hzP - moon.py) / o.k, r: moon.r / o.k };

  const far = strip(o, (ctx, W, hz, u) => {
    ridge(ctx, W, hz, 16 * u, 0.45, '#140b2a', 21);
    for (let x = 0; x < W; x += (2 + r() * 3) * u) pine(ctx, x, hz - r() * 2 * u, (6 + r() * 7) * u, '#0e0820');
    haze(ctx, W, hz - 20 * u, hz, 'rgba(74,29,79,0.9)', 0.5);
  });

  const spots = {};
  const mid = strip(o, (ctx, W, hz, u) => {
    const mx = W * 0.32;
    // mall: long low block, glowing entrance, parking-lot lights
    ctx.fillStyle = '#1a1430'; ctx.fillRect(mx - 34 * u, hz - 13 * u, 68 * u, 13 * u);
    ctx.fillStyle = '#2a1f48'; ctx.fillRect(mx - 8 * u, hz - 18 * u, 16 * u, 18 * u);
    ctx.fillStyle = 'rgba(255,230,170,0.7)'; ctx.fillRect(mx - 5 * u, hz - 8 * u, 10 * u, 8 * u);
    for (let i = -3; i <= 3; i++) lamp(ctx, mx + i * 11 * u, hz, 9 * u, '#0c0a18', '#fff5d1', 'rgba(255,240,200,0.25)');
    // pylon sign: the word and the third pine are drawn live (they change after lap 1)
    ctx.fillStyle = '#0f0b1f'; ctx.fillRect(mx + 40 * u, hz - 30 * u, 1.6 * u, 30 * u);
    ctx.fillStyle = '#231a3d'; ctx.fillRect(mx + 30 * u, hz - 36 * u, 22 * u, 9 * u);
    sign(ctx, 'PINES MALL', mx + 41 * u, hz - 29.5 * u, 2.6 * u, '#7dd3fc', { glow: 5 * u });
    spots.pylon = { x: mx + 41 * u, y: hz - 33.6 * u, u };
    spots.pines = { x: mx + 41 * u, base: hz - 36 * u, u };
    // strip mall: arcade, video store, dojo
    const sx = W * 0.62;
    const unit = (x, w, label, col) => { ctx.fillStyle = '#1b1530'; ctx.fillRect(x, hz - 12 * u, w, 12 * u); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + u, hz - 7 * u, w - 2 * u, 7 * u); sign(ctx, label, x + w / 2, hz - 9.5 * u, 2.2 * u, col, { glow: 5 * u }); };
    unit(sx, 18 * u, 'ARCADE 88', '#f472b6');
    unit(sx + 19 * u, 20 * u, 'BLOCKBUSTED', '#fde047');
    unit(sx + 40 * u, 18 * u, 'VIPER KAN DOJO', '#f87171');
    spots.cab = { x: sx + 4 * u, y: hz - 6 * u, u };
    // houses round the rest of the tile; one has the flickering string lights
    for (let x = sx + 64 * u, i = 0; x < W + mx - 40 * u; x += 17 * u, i++) {
      const hx = x % W, hw = 13 * u, hh = 7 * u;
      ctx.fillStyle = '#18122a'; ctx.fillRect(hx, hz - hh, hw, hh);
      ctx.beginPath(); ctx.moveTo(hx - u, hz - hh); ctx.lineTo(hx + hw / 2, hz - hh - 5 * u); ctx.lineTo(hx + hw + u, hz - hh); ctx.fill();
      ctx.fillStyle = r() < 0.6 ? 'rgba(255,200,120,0.75)' : 'rgba(120,170,255,0.5)'; // TV glow
      ctx.fillRect(hx + 2 * u, hz - hh + 2 * u, 3 * u, 2.4 * u);
      if (i === 2) spots.lights = { x: hx - u, y: hz - hh - 0.5 * u, w: hw + 2 * u };
    }
    haze(ctx, W, hz - 8 * u, hz, 'rgba(40,20,70,0.8)', 0.35);
  });

  const near = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W; x += 28 * u) {
      ctx.fillStyle = '#08060f';
      for (let p = 0; p < 9; p++) ctx.fillRect(x + p * 1.6 * u, hz - 3 * u, 0.5 * u, 3 * u); // picket fence
      ctx.fillRect(x, hz - 2.4 * u, 14 * u, 0.4 * u);
      ctx.fillRect(x + 16 * u, hz - 4 * u, 0.6 * u, 4 * u); ctx.fillRect(x + 15.4 * u, hz - 5 * u, 1.8 * u, 1.2 * u); // mailbox
      if (r() < 0.5) parkedCar(ctx, x + 19 * u, hz, 9 * u, '#0b0815', 'rgba(150,180,255,0.3)');
      if (r() < 0.4) { ctx.fillRect(x + 24 * u, hz - 12 * u, 0.5 * u, 12 * u); ctx.fillRect(x + 23 * u, hz - 12 * u, 3 * u, 2 * u); } // hoop
    }
  });

  const word = (txt) => sprite(22 * unitOf(o.hz0 * o.k), 4 * unitOf(o.hz0 * o.k), (ctx, w, h) => sign(ctx, txt, w / 2, h / 2, h * 0.8, '#7dd3fc', { glow: 2 }));
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.pylon.x - 10 * (spots.pylon.u),
    layers: [{ c: far, f: 0.1 }, { c: mid, f: 0.3 }, { c: near, f: 0.6 }],
    spots, moon: moonSpot,
    triple: word('TRIPLE'), double: word('DOUBLE'),
    pine: sprite(6 * unitOf(o.hz0 * o.k), 8 * unitOf(o.hz0 * o.k), (ctx, w, h) => pine(ctx, w / 2, h, h, '#1f6f4a')),
    bike: sprite(26, 18, (ctx) => {
      ctx.strokeStyle = '#0b0718'; ctx.fillStyle = '#0b0718'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(6, 13, 4, 0, Math.PI * 2); ctx.arc(20, 13, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 13); ctx.lineTo(11, 8); ctx.lineTo(18, 8); ctx.lineTo(20, 13); ctx.stroke();
      ctx.fillRect(9, 2, 3, 6); ctx.beginPath(); ctx.arc(10.5, 1.8, 1.8, 0, Math.PI * 2); ctx.fill(); // rider
      ctx.fillRect(18, 4, 4, 3); // the basket
    }),
    flags: {},
  };
}

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const s = B.spots, k = B.k;
  // the mall sign: TRIPLE PINES until history changes after lap 1
  const w = (B.flags[EGGS.PINES] ? B.double : B.triple);
  const ww = w.width / k, wh = w.height / k;
  ctx.drawImage(w, F.x(1, s.pylon.x) - ww / 2, F.y(s.pylon.y) - wh / 2, ww, wh);
  const n = B.flags[EGGS.PINES] ? 2 : 3, pw = B.pine.width / k, ph = B.pine.height / k;
  for (let i = 0; i < n; i++) ctx.drawImage(B.pine, F.x(1, s.pines.x) + (i - 1) * pw * 1.1 - pw / 2, F.y(s.pines.base) - ph, pw, ph);
  // maze-chaser cabinet glow
  const cx = F.x(1, s.cab.x), cy = F.y(s.cab.y), cu = s.cab.u / k;
  ctx.fillStyle = F.reduced ? '#22d3ee' : (blink(F.t, 0.8, 0.5) ? '#22d3ee' : '#a78bfa');
  ctx.fillRect(cx, cy, 2.5 * cu, 3 * cu);
  ctx.fillStyle = '#fde047'; ctx.fillRect(cx + (F.reduced ? 1 : ((F.t * 2) % 2)) * cu * 0.6, cy + 1.2 * cu, 0.6 * cu, 0.6 * cu);
  // the one house whose string lights flicker in sequence
  const L = s.lights;
  if (L) {
    const nb = 12;
    for (let i = 0; i < nb; i++) {
      const on = F.reduced ? 1 : blink(F.t * 3 + i * 0.37, 2.2, 0.55);
      if (!on) continue;
      ctx.fillStyle = i % 3 === 0 ? '#f87171' : i % 3 === 1 ? '#fde047' : '#60a5fa';
      ctx.fillRect(F.x(1, L.x + (L.w * i) / (nb - 1)) - 1, F.y(L.y) + (i % 2), 2, 2);
    }
  }
  // final lap: a kid's bike crosses the moon
  if (B.flags[EGGS.BIKE_MOON]) {
    const p = Math.min(1, (F.t - F.mem.bikeMoonAt) / 6);
    const mx = B.moon.x, my = F.hz - B.moon.dy, mr = B.moon.r;
    const bx = mx - mr * 1.6 + p * mr * 3.2, by = my + mr * 0.25 - Math.sin(p * Math.PI) * mr * 0.6;
    const bw = mr * 0.9, bh = bw * 0.7;
    ctx.drawImage(B.bike, bx - bw / 2, by - bh / 2, bw, bh);
  }
}

const ADS = [
    ['BLOCKBUSTED', 'BE KIND · REWIND', '#1e3a8a', '#fde047'],
    ['ARCADE 88', 'NEW HIGH SCORE? PROVE IT', '#4a044e', '#f9a8d4'],
    ['VIPER KAN DOJO', 'KARATE FOR KIDS · SAT', '#450a0a', '#fca5a5'],
    ['TRIPLE PINES MALL', 'FOOD COURT · CINEMA 6', '#0c4a6e', '#bae6fd'],
    ['WALK-TAPE 2000', 'YOUR MIXTAPE, ANYWHERE', '#18181b', '#a3e635'],
  ];

export default { ads: ADS, id: '1985', build, anim, memory: newEggMemory };
