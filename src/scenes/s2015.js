// 2015 · SKYWAY CLOCK HOLLOW — the future as 1989 imagined it: hover lanes, holograms, rain.
// Nods (docs/EASTER_EGGS.md): a holo-shark lunging out of the FINS 19 billboard, CAFÉ RETRO-80,
// the HOVR-BORD CO. shop, self-tying AUTO-LACE KICKS, and a weather service so exact the
// forecast board counts down to the second the rain stops.
import { rng, plate, strip, building, sign, haze, clockTower, lamp, reflect, sprite, rainField, drawRain, blink, unitOf } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, rainForecast, EGGS } from './eggs.js';

const C = {
  sky: ERA_PALETTES[2015].sky,
  ground: ERA_PALETTES[2015].ground,
};
const LANES = 3, PER_LANE = 4;

function build(o) {
  const r = rng(2015);
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    // low rain clouds with city glow on their bellies
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = top + (hz - top) * (0.05 + r() * 0.45), s = (hz - top) * (0.06 + r() * 0.08);
      ctx.fillStyle = `rgba(${20 + (i % 3) * 8},${50 + (i % 4) * 8},${80 + (i % 5) * 6},0.55)`;
      ctx.beginPath(); ctx.ellipse(x, y, s * 3, s, 0, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(w * 0.5, hz, 0, w * 0.5, hz, (hz - top) * 0.9);
    g.addColorStop(0, 'rgba(34,184,207,0.45)'); g.addColorStop(1, 'rgba(34,184,207,0)');
    ctx.fillStyle = g; ctx.fillRect(0, top, w, hz - top);
  });

  const far = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W;) {
      const w = (4 + r() * 8) * u, h = (14 + r() * 30) * u;
      building(ctx, r, x, hz, w, h, '#0b2440', 'rgba(130,230,255,0.5)', 0.3, r() < 0.3 ? 'antenna' : 'step');
      x += w + r() * 3 * u;
    }
    // skyway ribbons
    ctx.strokeStyle = 'rgba(94,234,212,0.55)'; ctx.lineWidth = Math.max(1, 0.5 * u);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, hz - (20 + i * 9) * u); for (let x = 0; x <= W; x += 20 * u) ctx.lineTo(x, hz - (20 + i * 9) * u - Math.sin(x / W * Math.PI * 4 + i) * 3 * u); ctx.stroke(); }
    haze(ctx, W, hz - 40 * u, hz, 'rgba(14,79,122,0.9)', 0.6);
  });

  const spots = {};
  const mid = strip(o, (ctx, W, hz, u) => {
    const cx = W * 0.45;
    const tower = clockTower(ctx, cx, hz, 12 * u, 40 * u, '#0c2236', '#7dd3fc', '#e0f2fe');
    spots.tower = tower;
    const unit = (x, w, h, label, col) => {
      building(ctx, r, x, hz, w, h, '#0a1d30', 'rgba(160,240,255,0.6)', 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + u, hz - 6 * u, w - 2 * u, 6 * u);
      if (label) sign(ctx, label, x + w / 2, hz - 8 * u, 2.2 * u, col, { glow: 6 * u });
    };
    unit(cx - 52 * u, 20 * u, 16 * u, 'CAFÉ RETRO-80', '#f472b6');
    unit(cx - 30 * u, 14 * u, 14 * u, 'HOVR-BORD CO.', '#a3e635');
    // a hover board hanging over the shop door
    ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.ellipse(cx - 23 * u, hz - 15.5 * u, 4 * u, 0.9 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a3e635'; ctx.fillRect(cx - 25 * u, hz - 16 * u, 4 * u, 0.5 * u);
    // the FINS 19 billboard frame (the shark itself is a live hologram)
    const bx = cx + 22 * u, by = hz - 34 * u;
    ctx.fillStyle = '#071423'; ctx.fillRect(bx + 8 * u, by + 14 * u, 1.2 * u, 20 * u);
    ctx.fillStyle = '#0b2a45'; ctx.fillRect(bx, by, 26 * u, 14 * u);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = Math.max(1, 0.4 * u); ctx.strokeRect(bx, by, 26 * u, 14 * u);
    sign(ctx, 'FINS 19', bx + 13 * u, by + 3 * u, 2.6 * u, '#fef08a', { glow: 4 * u });
    sign(ctx, 'NOW IN HOLO-3D', bx + 13 * u, by + 12 * u, 1.1 * u, '#bae6fd');
    spots.board = { x: bx + 13 * u, y: by + 8 * u, u };
    unit(cx + 52 * u, 18 * u, 18 * u, 'AUTO-LACE KICKS', '#fde047');
    // weather board: the countdown is drawn live
    const fx = cx + 74 * u;
    ctx.fillStyle = '#061a2c'; ctx.fillRect(fx, hz - 22 * u, 16 * u, 9 * u);
    ctx.fillStyle = '#071423'; ctx.fillRect(fx + 7.4 * u, hz - 13 * u, 1.2 * u, 13 * u);
    sign(ctx, 'WEATHER SVC.', fx + 8 * u, hz - 20.5 * u, 1.3 * u, '#67e8f9');
    spots.forecast = { x: fx + 8 * u, y: hz - 16.5 * u, u };
    for (let x = cx + 96 * u; x < W + cx - 60 * u; x += 15 * u) building(ctx, r, x % W, hz, 13 * u, (12 + r() * 16) * u, '#0a1d30', 'rgba(160,240,255,0.5)', 0.3);
  });
  reflect(mid.getContext('2d'), mid, Math.round(o.hz0 * o.k), Math.round(o.rh * 0.22 * o.k), 0.45);

  const near = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W; x += 26 * u) {
      lamp(ctx, x + 6 * u, hz, 15 * u, '#04101c', '#a5f3fc', 'rgba(125,211,252,0.3)');
      ctx.fillStyle = '#04101c'; ctx.fillRect(x + 12 * u, hz - 2 * u, 12 * u, 2 * u); // planters
      ctx.fillStyle = 'rgba(56,189,248,0.5)'; ctx.fillRect(x + 12 * u, hz - 2 * u, 12 * u, 0.3 * u);
    }
  });

  const u = unitOf(Math.round(o.hz0 * o.k));
  const digits = [];
  for (let n = 0; n <= 30; n++) digits.push(sprite(14 * u, 3 * u, (ctx, w, h) => sign(ctx, n ? `RAIN ENDS IN ${n}s` : 'RAIN STOPPED ✓', w / 2, h / 2, h * 0.7, n ? '#fde68a' : '#86efac')));
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.tower.x,
    layers: [{ c: far, f: 0.1 }, { c: mid, f: 0.3 }, { c: near, f: 0.62 }],
    spots, digits, u,
    shark: sprite(22 * u, 12 * u, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(56,189,248,0.75)';
      ctx.beginPath(); ctx.moveTo(0, h * 0.55); ctx.quadraticCurveTo(w * 0.35, h * 0.05, w * 0.85, h * 0.45); ctx.lineTo(w, h * 0.2); ctx.lineTo(w * 0.95, h * 0.6); ctx.lineTo(w, h * 0.9); ctx.lineTo(w * 0.82, h * 0.62); ctx.quadraticCurveTo(w * 0.4, h * 0.95, 0, h * 0.55); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.45, h * 0.22); ctx.lineTo(w * 0.52, 0); ctx.lineTo(w * 0.6, h * 0.25); ctx.fill(); // dorsal
      ctx.fillStyle = '#e0f2fe'; for (let i = 0; i < 5; i++) ctx.fillRect(w * (0.04 + i * 0.035), h * 0.55, w * 0.02, h * 0.06); // teeth
    }),
    hover: sprite(6 * u, 2 * u, (ctx, w, h) => { ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, h * 0.3, w, h * 0.45); ctx.fillStyle = '#0f172a'; ctx.fillRect(w * 0.3, 0, w * 0.4, h * 0.35); ctx.fillStyle = '#fef08a'; ctx.fillRect(w * 0.9, h * 0.35, w * 0.1, h * 0.2); ctx.fillStyle = '#f43f5e'; ctx.fillRect(0, h * 0.35, w * 0.08, h * 0.2); }),
    rain: rainField(160, 15),
    flags: {},
  };
}

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const k = B.k, u = B.u / k, s = B.spots;
  // hover traffic on three sky lanes, alternating directions
  const hw = B.hover.width / k, hh = B.hover.height / k;
  for (let l = 0; l < LANES; l++) {
    const y = F.hz - (16 + l * 9) * u, dir = l % 2 ? -1 : 1, v = 0.05 + l * 0.02;
    for (let i = 0, n = Math.ceil(PER_LANE * F.detail); i < n; i++) {
      let p = (F.t * v * (F.reduced ? 0.5 : 1) + i / PER_LANE + l * 0.13) % 1;
      if (dir < 0) p = 1 - p;
      ctx.drawImage(B.hover, p * (F.rw + hw * 2) - hw, y + Math.sin(F.t * 2 + i) * 0.4 * u, hw, hh);
    }
  }
  // FINS 19: the hologram lunges out of its billboard every 25 s
  const bx = F.x(1, s.board.x), by = F.y(s.board.y);
  if (B.flags[EGGS.SHARK]) {
    const p = (F.raceTime % 25) / 1.6, sw = B.shark.width / k, sh = B.shark.height / k;
    const grow = 0.6 + Math.sin(Math.min(1, p) * Math.PI) * (F.reduced ? 0.2 : 0.9);
    ctx.globalAlpha = F.reduced ? 0.7 : 0.55 + blink(F.t, 0.12, 0.5) * 0.3;
    ctx.drawImage(B.shark, bx - sw * grow / 2, by - sh * grow / 2 + p * 8 * u, sw * grow, sh * grow);
    ctx.globalAlpha = 1;
  }
  // the forecast board, live to the second
  const n = Math.min(30, rainForecast(F.raceTime)), d = B.digits[n];
  const dw = d.width / k, dh = d.height / k, fx = F.x(1, s.forecast.x), fy = F.y(s.forecast.y);
  ctx.drawImage(d, fx - dw / 2, fy - dh / 2, dw, dh);
  // a clock-tower beacon blinking for the air lanes
  if (F.reduced || blink(F.t, 1.4, 0.3)) { ctx.fillStyle = '#f43f5e'; ctx.fillRect(F.x(1, s.tower.x) - 1, F.y(s.tower.top) - 2, 2, 2); }
}

function front(ctx, F, B) {
  if (B.flags[EGGS.RAIN_STOPS]) return;
  drawRain(ctx, B.rain, F.rw, F.rh, F.reduced ? F.t * 0.3 : F.t, '#bae6fd', 1.4, 0.35, F.detail);
}

const ADS = [
    ['HOVR-BORD CO.', 'NO WHEELS · NO WATER', '#164e63', '#a3e635'],
    ['AUTO-LACE KICKS', 'TIE-FREE SINCE 2015', '#1e1b4b', '#fde047'],
    ['CAFÉ RETRO-80', 'VIDEO WAITERS · 8-BIT FRIES', '#500724', '#f9a8d4'],
    ['FINS 19', 'NOW IN HOLO-3D', '#082f49', '#7dd3fc'],
    ['WEATHER SVC.', 'FORECASTS TO THE SECOND', '#042f2e', '#5eead4'],
  ];

export default { ads: ADS, id: '2015', build, anim, front, memory: newEggMemory };
