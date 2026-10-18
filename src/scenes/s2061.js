// 2061 · LOW ORBIT SKYWAY (ticket 0155) — a glass highway in low orbit over the night side of
// Earth. Nods (docs/EASTER_EGGS.md): a cherry-red roadster with a spacesuited mannequin at the
// wheel drifting over the planet, a launch tower at the start line, a rocket climbing off the
// limb on the final lap, and a NEXT EXIT: MARS sign. All original drawings and invented copy.
import { rng, plate, strip, sign, sprite, blink, unitOf, layer } from './kit.js';
import { ERA_PALETTES } from '../era-palettes.js';
import { eggs, newEggMemory, EGGS } from './eggs.js';

const PAL = ERA_PALETTES[2061];
const BEACONS = 6, SATS = 3, MOTES = 70;

/** The planet below: ocean, cloud swirls, the lights of night-side cities and a thin blue limb. */
function earth(ctx, w, hz, h) {
  const bulge = hz * 0.07;
  const R = w * 1.7;
  const cx = w * 0.5, cy = hz - bulge + R;
  // Space continues below the horizon line wherever the planet's curve falls away.
  ctx.fillStyle = '#01020a';
  ctx.fillRect(0, hz - bulge - 2, w, h - hz + bulge + 2);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createLinearGradient(0, hz - bulge, 0, h);
  g.addColorStop(0, '#2a74c9'); g.addColorStop(0.05, '#0d3f86'); g.addColorStop(0.4, '#06244f'); g.addColorStop(1, '#020a1c');
  ctx.fillStyle = g; ctx.fillRect(0, hz - bulge, w, h - hz + bulge);
  const r = rng(2061);
  // Continents: soft dark masses, flattened toward the limb for perspective.
  for (let i = 0; i < 9; i++) {
    const x = r() * w, y = hz + (h - hz) * (0.08 + r() * 0.8);
    const sq = 0.18 + ((y - hz) / (h - hz)) * 0.5;
    ctx.fillStyle = 'rgba(14,38,30,0.75)';
    ctx.beginPath(); ctx.ellipse(x, y, w * (0.05 + r() * 0.12), w * (0.03 + r() * 0.05) * sq, r() * 0.6 - 0.3, 0, Math.PI * 2); ctx.fill();
    // City lights strung along the coasts.
    ctx.fillStyle = 'rgba(255,205,120,0.85)';
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2, d = 0.6 + r() * 0.5;
      ctx.fillRect(x + Math.cos(a) * w * 0.07 * d, y + Math.sin(a) * w * 0.03 * sq * d, 1, 1);
    }
  }
  // Cloud bands catching the last of the sunlight.
  for (let i = 0; i < 26; i++) {
    const y = hz + (h - hz) * Math.pow(r(), 1.6) * 0.9;
    const sq = 0.12 + ((y - hz) / (h - hz)) * 0.4;
    ctx.fillStyle = `rgba(200,225,255,${0.05 + r() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(r() * w, y, w * (0.04 + r() * 0.1), w * 0.02 * sq + 1, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Atmosphere: a bright thin limb and a soft glow above it.
  ctx.save();
  ctx.lineWidth = Math.max(1.5, hz * 0.012);
  ctx.strokeStyle = 'rgba(140,215,255,0.95)';
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  for (let i = 1; i <= 6; i++) {
    ctx.lineWidth = hz * 0.012 * (1 + i * 1.6);
    ctx.strokeStyle = `rgba(95,184,255,${0.16 / i})`;
    ctx.beginPath(); ctx.arc(cx, cy, R + hz * 0.012 * i * 1.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.restore();
}

/** Stars, a faint galaxy band and the sun's glare (painted once into the sky plate). */
function space(ctx, w, hz, top) {
  const r = rng(61);
  // A faint band of the galaxy, diagonally.
  ctx.save();
  ctx.translate(w * 0.5, top + (hz - top) * 0.45); ctx.rotate(-0.35);
  const band = ctx.createLinearGradient(0, -hz * 0.2, 0, hz * 0.2);
  band.addColorStop(0, 'rgba(120,110,200,0)'); band.addColorStop(0.5, 'rgba(150,140,230,0.13)'); band.addColorStop(1, 'rgba(120,110,200,0)');
  ctx.fillStyle = band; ctx.fillRect(-w, -hz * 0.2, w * 2, hz * 0.4);
  ctx.restore();
  for (let i = 0; i < 520; i++) {
    const y = top - hz * 0.4 + r() * (hz * 1.4);
    if (y > hz) continue;
    ctx.globalAlpha = 0.25 + r() * 0.75;
    ctx.fillStyle = r() < 0.12 ? '#cfe3ff' : r() < 0.1 ? '#ffe2b8' : '#ffffff';
    const s = r() < 0.07 ? 2 : 1;
    ctx.fillRect(r() * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  // The sun, low over the limb, with a soft glare.
  const sx = w * 0.82, sy = top + (hz - top) * 0.55, sr = hz * 0.06;
  const glare = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 9);
  glare.addColorStop(0, 'rgba(255,250,235,0.9)'); glare.addColorStop(0.12, 'rgba(255,236,200,0.35)'); glare.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = glare; ctx.fillRect(sx - sr * 9, sy - sr * 9, sr * 18, sr * 18);
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
}

function build(o) {
  const r = rng(2061);
  const sky = plate(o, PAL.sky, PAL.ground, space, earth);
  const spots = { beacons: [], sats: [] };

  // Far: an orbital station ring and solar-sail satellites, very slow parallax.
  const far = strip(o, (ctx, W, hz, u) => {
    const sx = W * 0.3, sy = hz - 52 * u;
    ctx.strokeStyle = '#4b5a78'; ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.ellipse(sx, sy, 16 * u, 5 * u, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5c6a88'; ctx.fillRect(sx - 1 * u, sy - 6 * u, 2 * u, 12 * u);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(sx - 30 * u, sy - 2 * u, 12 * u, 4 * u); ctx.fillRect(sx + 18 * u, sy - 2 * u, 12 * u, 4 * u);
    ctx.strokeStyle = 'rgba(147,197,253,0.6)'; ctx.lineWidth = 0.4 * u;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx - 30 * u + i * 3 * u, sy - 2 * u); ctx.lineTo(sx - 30 * u + i * 3 * u, sy + 2 * u); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx + 18 * u + i * 3 * u, sy - 2 * u); ctx.lineTo(sx + 18 * u + i * 3 * u, sy + 2 * u); ctx.stroke(); }
    spots.station = { x: sx, y: sy };
    // A cratered moon, far off.
    const mx = W * 0.72, my = hz - 58 * u, mr = 7 * u;
    const mg = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.2, mx, my, mr);
    mg.addColorStop(0, '#e5e7eb'); mg.addColorStop(1, '#6b7280');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(75,85,99,0.55)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(mx + (r() - 0.5) * mr * 1.2, my + (r() - 0.5) * mr * 1.2, mr * (0.08 + r() * 0.14), 0, Math.PI * 2); ctx.fill(); }
  });

  // Mid: the launch tower by the start line, orbital gantry pylons with beacons, a road sign.
  const mid = strip(o, (ctx, W, hz, u) => {
    const tx = W * 0.5, base = hz + 4 * u, th = 60 * u;
    // Launch tower: a lattice gantry with service arms, and the rocket waiting beside it.
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = Math.max(1, 0.6 * u);
    ctx.strokeRect(tx - 4 * u, base - th, 8 * u, th);
    ctx.beginPath();
    for (let y = base; y > base - th; y -= 4 * u) { ctx.moveTo(tx - 4 * u, y); ctx.lineTo(tx + 4 * u, y - 4 * u); ctx.moveTo(tx + 4 * u, y); ctx.lineTo(tx - 4 * u, y - 4 * u); }
    ctx.stroke();
    ctx.fillStyle = '#475569';
    for (const y of [0.3, 0.55, 0.8]) ctx.fillRect(tx + 4 * u, base - th * y, 6 * u, 1.2 * u);
    const rx = tx + 13 * u;
    const rg = ctx.createLinearGradient(rx - 3 * u, 0, rx + 3 * u, 0);
    rg.addColorStop(0, '#94a3b8'); rg.addColorStop(0.5, '#f8fafc'); rg.addColorStop(1, '#94a3b8');
    ctx.fillStyle = rg; ctx.fillRect(rx - 3 * u, base - th * 0.86, 6 * u, th * 0.86);
    ctx.beginPath(); ctx.moveTo(rx - 3 * u, base - th * 0.86); ctx.lineTo(rx, base - th * 0.98); ctx.lineTo(rx + 3 * u, base - th * 0.86); ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(rx - 3 * u, base - th * 0.5, 6 * u, 1.4 * u);
    spots.tower = { x: tx, y: base - th };
    spots.beacons.push({ x: tx, y: base - th - 1.5 * u });
    // Gantry pylons along the skyway with blinking tips.
    for (let i = 0; i < BEACONS - 1; i++) {
      const px = W * (0.08 + i * 0.2) + (r() - 0.5) * 10 * u;
      if (Math.abs(px - tx) < 24 * u) continue;
      const ph = (14 + r() * 16) * u;
      ctx.fillStyle = '#1e293b'; ctx.fillRect(px - 0.8 * u, hz - ph, 1.6 * u, ph + 4 * u);
      ctx.fillStyle = 'rgba(94,242,255,0.5)'; ctx.fillRect(px - 3 * u, hz - ph * 0.6, 6 * u, 0.6 * u);
      spots.beacons.push({ x: px, y: hz - ph - 1 * u });
    }
    sign(ctx, 'NEXT EXIT: MARS', W * 0.78, hz - 18 * u, 2.6 * u, '#a7f3d0', { glow: 6 * u, bg: 'rgba(2,20,30,0.75)' });
    sign(ctx, '140 MILLION MI · KEEP LEFT', W * 0.78, hz - 13 * u, 1.4 * u, '#5eead4');
    sign(ctx, 'LOW-G ZONE', W * 0.18, hz - 24 * u, 2.2 * u, '#fde68a', { glow: 5 * u, bg: 'rgba(30,20,0,0.7)' });
  });

  const u = unitOf(Math.round(o.hz0 * o.k));
  // Satellites crossing slowly, each a tiny sprite with a glinting panel.
  const sat = sprite(10 * u, 3 * u, (ctx, w, h) => {
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, h * 0.3, w * 0.38, h * 0.4); ctx.fillRect(w * 0.62, h * 0.3, w * 0.38, h * 0.4);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(w * 0.4, h * 0.1, w * 0.2, h * 0.8);
  });
  // The roadster homage: an open-top cherry-red sports car, a white-suited mannequin at the wheel.
  const roadster = sprite(26 * u, 10 * u, (ctx, w, h) => {
    const body = ctx.createLinearGradient(0, h * 0.4, 0, h);
    body.addColorStop(0, '#ff4d5e'); body.addColorStop(0.5, '#d1112b'); body.addColorStop(1, '#6b0715');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(w * 0.02, h * 0.78); ctx.quadraticCurveTo(w * 0.04, h * 0.52, w * 0.22, h * 0.5);
    ctx.lineTo(w * 0.42, h * 0.5); ctx.lineTo(w * 0.5, h * 0.58); ctx.lineTo(w * 0.7, h * 0.58);
    ctx.quadraticCurveTo(w * 0.95, h * 0.55, w * 0.98, h * 0.74); ctx.lineTo(w * 0.96, h * 0.86); ctx.lineTo(w * 0.04, h * 0.88);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(w * 0.12, h * 0.6, w * 0.7, h * 0.03);
    ctx.fillStyle = '#111827';
    for (const x of [0.2, 0.8]) { ctx.beginPath(); ctx.arc(w * x, h * 0.88, h * 0.12, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(200,230,255,0.7)'; ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.5); ctx.lineTo(w * 0.47, h * 0.36); ctx.stroke(); // windscreen
    // The mannequin: white suit, helmet with a dark visor, one arm on the door.
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(w * 0.53, h * 0.34, w * 0.07, h * 0.24);
    ctx.beginPath(); ctx.arc(w * 0.565, h * 0.27, h * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(w * 0.575, h * 0.27, h * 0.06, -0.9, 1.2); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(w * 0.6, h * 0.46, w * 0.09, h * 0.05);
  });
  const rocket = sprite(4 * u, 14 * u, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.62);
    ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.12); ctx.lineTo(w * 0.5, 0); ctx.lineTo(w * 0.7, h * 0.12); ctx.fill();
    const f = ctx.createLinearGradient(0, h * 0.74, 0, h);
    f.addColorStop(0, '#fff7cc'); f.addColorStop(0.4, '#fb923c'); f.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = f; ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.74); ctx.lineTo(w * 0.5, h); ctx.lineTo(w * 0.7, h * 0.74); ctx.fill();
  });
  // Drifting dust motes in front of the road (the "weather" of orbit), fixed pool.
  const rm = rng(7);
  const motes = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) { motes[i * 3] = rm(); motes[i * 3 + 1] = rm(); motes[i * 3 + 2] = 0.4 + rm() * 0.9; }
  // A one-off soft glint for the station's lights, so anim never builds gradients.
  const glint = layer(16, 16);
  { const g = glint.getContext('2d'), gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); }
  for (let i = 0; i < SATS; i++) spots.sats.push({ y: 0.25 + i * 0.17, v: 0.012 + i * 0.006, p: i * 0.37 });
  return {
    sky, pad: o.pad, hzL: Math.round(o.hz0 * o.k), focus: spots.tower.x,
    layers: [{ c: far, f: 0.04 }, { c: mid, f: 0.22 }],
    spots, u, sat, roadster, rocket, motes, glint,
    flags: {},
  };
}

const BEACON_COL = ['#5ef2ff', '#ff4d6d', '#b06cff'];

function anim(ctx, F, B) {
  eggs(F, F.mem, B.flags);
  const k = B.k, u = B.u / k, s = B.spots;
  // Blinking gantry beacons and the tower light.
  for (let i = 0; i < s.beacons.length; i++) {
    const b = s.beacons[i];
    if (!F.reduced && !blink(F.t, 1.6, 0.5, i * 0.31)) continue;
    const x = F.x(1, b.x), y = F.y(b.y), r = 2.4 * u;
    ctx.globalAlpha = 0.85; ctx.drawImage(B.glint, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
    ctx.fillStyle = BEACON_COL[i % 3]; ctx.fillRect(x - 0.5 * u, y - 0.5 * u, u, u);
  }
  // Station running lights.
  if (s.station) {
    const x = F.x(0, s.station.x), y = F.y(s.station.y);
    if (F.reduced || blink(F.t, 2.2, 0.35)) { const r = 2 * u; ctx.drawImage(B.glint, x - r, y - r, r * 2, r * 2); }
  }
  // Satellites drifting across the sky.
  const sw = B.sat.width / k, sh = B.sat.height / k;
  for (let i = 0, n = Math.ceil(s.sats.length * F.detail); i < n; i++) {
    const st = s.sats[i];
    const p = (F.t * st.v + st.p) % 1;
    const x = p * (F.rw + sw * 2) - sw, y = F.hz * st.y;
    ctx.drawImage(B.sat, x, y, sw, sh);
    if (!F.reduced && blink(F.t, 3, 0.08, i)) { const r = 2.5 * u; ctx.drawImage(B.glint, x + sw * 0.5 - r, y + sh * 0.5 - r, r * 2, r * 2); }
  }
  // The roadster homage, drifting slowly right to left above the limb, tumbling a touch.
  if (B.flags[EGGS.ROADSTER]) {
    const p = ((F.raceTime - 8) % 40) / 12;
    const rw = B.roadster.width / k, rh = B.roadster.height / k;
    const x = F.rw * (1.1 - p * 1.3), y = F.hz * 0.58 + Math.sin(p * 4) * 4 * u;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(F.reduced ? 0 : Math.sin(p * 3) * 0.12 - 0.05);
    ctx.drawImage(B.roadster, -rw / 2, -rh / 2, rw, rh);
    ctx.restore();
  }
  // Final lap: a rocket climbs off the limb on a glowing trail.
  if (B.flags[EGGS.LAUNCH]) {
    const p = Math.min(1, (F.t - F.mem.launchAt) / 10);
    const rw = B.rocket.width / k, rh = B.rocket.height / k;
    const x = F.rw * 0.3 + p * F.rw * 0.08, y = F.hz - p * F.hz * 0.85;
    ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = Math.max(1, 1.2 * u);
    ctx.beginPath(); ctx.moveTo(F.rw * 0.3, F.hz); ctx.quadraticCurveTo(F.rw * 0.3, F.hz - (F.hz - y) * 0.5, x, y + rh * 0.8); ctx.stroke();
    ctx.drawImage(B.rocket, x - rw / 2, y, rw, rh);
  }
}

/** Dust motes streaming past, faster with speed (allocation-free). */
function front(ctx, F, B) {
  const m = B.motes, n = Math.floor((m.length / 3) * F.detail);
  const v = 0.15 + Math.min(1.6, F.speed / 60);
  ctx.fillStyle = 'rgba(200,230,255,0.55)';
  for (let i = 0; i < n; i++) {
    const sp = m[i * 3 + 2];
    const z = (m[i * 3 + 1] + (F.reduced ? F.t * 0.05 : F.t * v * sp * 0.4)) % 1;
    // Motes fly outward from the vanishing point as they approach.
    const d = z * z;
    const x = F.rw * 0.5 + (m[i * 3] - 0.5) * F.rw * (0.2 + d * 2.4);
    const y = F.hz + (m[i * 3] < 0.5 ? -1 : 1) * F.hz * d * 0.6 * sp;
    const s = 0.6 + d * 2.2;
    ctx.fillRect(x, y, s, s);
  }
}

const ADS = [
  ['NEXT EXIT: MARS', '140 MILLION MI · KEEP LEFT', '#02141e', '#5eead4'],
  ['CHERRY RED ROADSTER', 'TOP DOWN · ANY ORBIT', '#2a0309', '#ff6b7a'],
  ['ORBITAL DINER', 'ZERO-G MILKSHAKES · DOCK 4', '#0b1033', '#c4b5fd'],
  ['MIND THE GRAVITY', 'LOW-G JUMPS AHEAD', '#1a1400', '#fde68a'],
];

export default { ads: ADS, id: '2061', build, anim, front, memory: newEggMemory };
