// 2026 · CLOCK HOLLOW — the town square at night, rain-slick and neon. Nods (docs/EASTER_EGGS.md):
// the courthouse clock stopped at 10:04 and struck by lightning as you warp, the "save our clock
// tower" flyer, a paranormal fire company with its own ghost-in-a-jar emblem, the B-movie
// double bill at the BIJOU, and a giant marshmallow parade balloon looming on the final lap.
import { rng, plate, strip, building, sign, haze, ridge, stars, clockTower, palm, lamp, parkedCar, reflect, boltSprite, sprite, blink, rainField, drawRain, unitOf } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const C = {
  sky: ERA_PALETTES[2026].sky,
  ground: ERA_PALETTES[2026].ground,
  far: '#1a0b33', farLit: 'rgba(255,190,120,0.55)',
  mid: '#120722', midLit: 'rgba(255,214,140,0.85)',
  near: '#07040f',
};

function build(o) {
  const r = rng(2026);
  const sky = plate(o, C.sky, C.ground, (ctx, w, hz, top) => {
    stars(ctx, w, top + (hz - top) * 0.6, 90, 7, '#fff', top);
    // synthwave sun sinking behind the square, banded
    const sx = w * 0.5, sy = hz - (hz - top) * 0.16, sr = Math.min(w, hz - top) * 0.24;
    const halo = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.6);
    halo.addColorStop(0, 'rgba(255,160,60,0.45)'); halo.addColorStop(0.5, 'rgba(255,60,120,0.16)'); halo.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, hz);
    const g = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, '#ff7b00'); g.addColorStop(1, '#ff006e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d114d';
    for (let i = 0; i < 6; i++) ctx.fillRect(sx - sr, sy + sr * (0.1 + i * 0.15), sr * 2, sr * (0.03 + i * 0.012));
  }, (ctx, w, hz, h) => {
    // wet street sheen catching the sunset
    const g = ctx.createLinearGradient(0, hz, 0, hz + (h - hz) * 0.35);
    g.addColorStop(0, 'rgba(255,90,80,0.35)'); g.addColorStop(1, 'rgba(255,90,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, hz, w, h - hz);
  });

  const far = strip(o, (ctx, W, hz, u) => {
    ridge(ctx, W, hz, 22 * u, 0.5, '#1d0c36', 11);
    for (let x = 0; x < W;) { const w = (5 + r() * 9) * u, h = (6 + r() * 16) * u; building(ctx, r, x, hz, w, h, C.far, C.farLit, 0.25, r() < 0.2 ? 'antenna' : null); x += w + r() * 2 * u; }
    haze(ctx, W, hz - 30 * u, hz, 'rgba(124,29,84,0.9)', 0.55);
  });

  const spots = {};
  const mid = strip(o, (ctx, W, hz, u) => {
    const cx = W * 0.5;
    // shops either side of the courthouse
    const shop = (x, w, h, body, label, col, extra, size = 3.2) => {
      building(ctx, r, x, hz, w, h, body, C.midLit, 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + w * 0.08, hz - h * 0.28, w * 0.84, h * 0.24); // shopfront
      if (label) sign(ctx, label, x + w / 2, hz - h * 0.36, Math.max(5, size * u), col, { glow: 6 * u, maxW: w });
      if (extra) extra(x, w, h);
    };
    shop(cx - 78 * u, 18 * u, 18 * u, '#1b0b2e', "DOT'S DINER", '#ff6ec7');
    shop(cx - 58 * u, 20 * u, 24 * u, '#160a28', 'BIJOU', '#ffd166', (x, w, h) => {
      ctx.fillStyle = '#2a0d1f'; ctx.fillRect(x - u, hz - h * 0.62, w + 2 * u, 7 * u); // marquee
      sign(ctx, 'ALIENS FROM PLUTO II', x + w / 2, hz - h * 0.62 + 2.3 * u, 2.1 * u, '#fff7d6', { maxW: w });
      sign(ctx, '+ ATTACK OF THE 50 FT MALL', x + w / 2, hz - h * 0.62 + 5 * u, 1.6 * u, '#ffd166', { maxW: w });
      spots.marquee = { x: x - u, y: hz - h * 0.62, w: w + 2 * u };
    });
    shop(cx - 36 * u, 14 * u, 15 * u, '#1d0d30', null, null, (x, w, h) => {
      ctx.fillStyle = '#e8e0ff'; ctx.fillRect(x + w * 0.1, hz - h * 0.95, w * 0.8, h * 0.42); // flyer kiosk
      sign(ctx, 'SAVE OUR', x + w / 2, hz - h * 0.85, 1.7 * u, '#2d114d', { maxW: w * 0.8 });
      sign(ctx, 'CLOCK TOWER!', x + w / 2, hz - h * 0.72, 1.7 * u, '#b0123b', { maxW: w * 0.8 });
    });
    const tower = clockTower(ctx, cx, hz, 13 * u, 46 * u, '#1a0c2a', '#cbd5e1', '#fef08a');
    spots.tower = tower;
    // paranormal fire company (original emblem: a ghost in a jar)
    shop(cx + 26 * u, 24 * u, 20 * u, '#2a0a12', 'HOOK & LADDER 8', '#ff5d5d', (x, w, h) => {
      ctx.fillStyle = '#3a0f19'; ctx.fillRect(x + w * 0.15, hz - h * 0.3, w * 0.7, h * 0.3);
      const ex = x + w / 2, ey = hz - h * 0.62, er = 3.4 * u;
      ctx.fillStyle = '#f4f4f5'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9ca3af'; ctx.fillRect(ex - er * 0.55, ey - er * 0.75, er * 1.1, er * 1.5); // jar
      ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.arc(ex, ey - er * 0.05, er * 0.38, Math.PI, 0); ctx.lineTo(ex + er * 0.38, ey + er * 0.45); ctx.lineTo(ex - er * 0.38, ey + er * 0.45); ctx.fill();
      sign(ctx, 'PARANORMAL DIV.', x + w / 2, hz - h * 0.18, 1.6 * u, '#fecaca', { maxW: w * 0.7 });
    });
    shop(cx + 52 * u, 18 * u, 26 * u, '#140a26', 'ARCADE', '#22d3ee');
    shop(cx + 72 * u, 16 * u, 14 * u, '#1c0a24', 'VHS · LASERDISC', '#c084fc', null, 2.2);
    // the rest of the roofline wraps round the tile
    for (let x = cx + 92 * u; x < W + cx - 82 * u; x += 16 * u) building(ctx, r, x % W, hz, 14 * u, (10 + r() * 14) * u, '#130824', C.midLit, 0.3);
  });

  const near = strip(o, (ctx, W, hz, u) => {
    for (let x = 0; x < W; x += 34 * u) {
      lamp(ctx, x + 4 * u, hz, 16 * u, C.near, '#ffe7a3', 'rgba(255,200,120,0.35)');
      palm(ctx, x + 18 * u + r() * 6 * u, hz, (18 + r() * 8) * u, C.near);
      if (r() < 0.6) parkedCar(ctx, x + 22 * u, hz, 11 * u, '#0d0717', 'rgba(140,200,255,0.35)');
    }
  });
  // wet asphalt: the square mirrored in the street
  reflect(mid.getContext('2d'), mid, Math.round(o.hz0 * o.k), Math.round(o.rh * 0.2 * o.k), 0.32);

  const towerH = (spots.tower.top) / o.k;
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.tower.x,
    layers: [{ c: far, f: 0.1 }, { c: mid, f: 0.28 }, { c: near, f: 0.62 }],
    spots,
    bolt: boltSprite(Math.max(20, towerH), 88),
    balloon: sprite(60 * unitOf(o.hz0 * o.k), 70 * unitOf(o.hz0 * o.k), paintBalloon),
    rain: rainField(110, 5),
    flags: {},
  };
}

// A giant marshmallow-ish parade balloon: puffs, a little round cap, a bow tie. Original drawing.
function paintBalloon(ctx, w, h) {
  ctx.fillStyle = '#fbfaf5';
  const puff = (x, y, r) => { ctx.beginPath(); ctx.arc(x * w, y * h, r * w, 0, Math.PI * 2); ctx.fill(); };
  puff(0.5, 0.2, 0.17); puff(0.5, 0.48, 0.24); puff(0.3, 0.45, 0.1); puff(0.7, 0.45, 0.1); puff(0.42, 0.78, 0.11); puff(0.58, 0.78, 0.11);
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0.38 * w, 0.03 * h, 0.24 * w, 0.06 * h);
  ctx.fillStyle = '#60a5fa'; ctx.fillRect(0.4 * w, 0.0, 0.2 * w, 0.05 * h);
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(0.42 * w, 0.32 * h); ctx.lineTo(0.5 * w, 0.35 * h); ctx.lineTo(0.42 * w, 0.38 * h); ctx.moveTo(0.58 * w, 0.32 * h); ctx.lineTo(0.5 * w, 0.35 * h); ctx.lineTo(0.58 * w, 0.38 * h); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(0.44 * w, 0.18 * h, 0.03 * w, 0.03 * h); ctx.fillRect(0.53 * w, 0.18 * h, 0.03 * w, 0.03 * h);
}

function behind(ctx, F, B) {
  if (!B.flags[EGGS.BALLOON]) return;
  const m = F.mem;
  if (m.balloonT < 0) m.balloonT = F.t;
  const rise = Math.min(1, (F.t - m.balloonT) / 6);
  const bw = B.balloon.width / B.k, bh = B.balloon.height / B.k;
  ctx.drawImage(B.balloon, F.x(0, B.layers[0].c.width * 0.72), F.hz - bh * (0.25 + rise * 0.75) - (F.reduced ? 0 : Math.sin(F.t * 0.8) * 2), bw, bh);
}

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const s = B.spots, k = B.k;
  // marquee bulbs chase (still lit with calm motion, just not chasing)
  const mq = s.marquee;
  if (mq) {
    const n = 14, y = F.y(mq.y) - 1;
    ctx.fillStyle = '#fff1a8';
    for (let i = 0; i < n; i++) {
      if (!F.reduced && blink(F.t * 6 + i, 3, 0.34) === 0) continue;
      ctx.fillRect(F.x(1, mq.x + (mq.w * i) / (n - 1)) - 1, y, 2, 2);
    }
  }
  // searchlights over the premiere
  if (!F.reduced && F.detail >= 0.5) {
    const bx = F.x(1, mq ? mq.x : 0);
    ctx.fillStyle = 'rgba(200,220,255,0.07)';
    for (let i = 0; i < 2; i++) {
      const a = Math.sin(F.t * 0.5 + i * 2.2) * 0.5 + (i ? 0.25 : -0.25);
      ctx.beginPath(); ctx.moveTo(bx, F.hz - 4); ctx.lineTo(bx + Math.sin(a - 0.04) * F.hz, 0); ctx.lineTo(bx + Math.sin(a + 0.04) * F.hz, 0); ctx.closePath(); ctx.fill();
    }
  }
  // 10:04 — lightning finds the clock tower as the warp fires
  if (B.flags[EGGS.LIGHTNING]) {
    const tx = F.x(1, s.tower.x), ty = F.y(s.tower.top);
    const bw = B.bolt.width, bh = B.bolt.height;
    ctx.drawImage(B.bolt, tx - bw / 2, ty - bh, bw, bh);
    if (F.lit) { ctx.fillStyle = 'rgba(220,225,255,0.22)'; ctx.fillRect(0, 0, F.rw, F.hz); }
  }
  void k;
}

function front(ctx, F, B) {
  drawRain(ctx, B.rain, F.rw, F.rh, F.reduced ? F.t * 0.3 : F.t, '#c7d2fe', 1, 0.28, F.detail);
}

const ADS = [
    ['SAVE OUR CLOCK', 'TOWER FUND · GIVE TODAY', '#1e1b4b', '#fef08a'],
    ["DOT'S DINER", 'MILKSHAKES · OPEN LATE', '#831843', '#fbcfe8'],
    ['HOOK & LADDER 8', 'SPOOKED? WE COME FAST', '#7f1d1d', '#fecaca'],
    ['BIJOU TONIGHT', 'ALIENS FROM PLUTO II', '#422006', '#fde68a'],
    ['88 MPH', 'NOT ONE MILE LESS', '#0c0a09', '#f97316'],
  ];

export default { ads: ADS, id: '2026', build, behind, anim, front, memory: () => ({ ...newEggMemory(), balloonT: -1 }) };
