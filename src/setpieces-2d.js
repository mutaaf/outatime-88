// 2D art for the orange-track set pieces (sprint 4). Lazy chunk: main.js imports it after the
// first frame and simply skips the art until it arrives (the simulation never waits for it).
//
//   drawAhead(ctx, segs, era)  loops rising off the road ahead and the speed signs at their
//                              booster gates, drawn into the road layer
//   drawCutaway(ctx, w, h, s)  the side-on loop cam while you're in a loop: the orange loop,
//                              your car going round it, and a fall if you came in too slow
//
// No allocation per frame beyond canvas paths; no external assets; calm mode drops the motion
// trails (the cutaway itself never rolls the screen).
import { ERA_PALETTES } from './era-palettes.js';

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
      const R = w * 1.55;
      const cx = x + w * 0.35, cy = y - R;
      const band = Math.max(2, w * 0.36);
      // Struts first, then the back of the loop darker, then the lit band and its edges.
      ctx.strokeStyle = th.timber ? '#5b3415' : '#3a1606';
      ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.95, cy + R * 0.3); ctx.lineTo(cx - R * 0.7, y);
      ctx.moveTo(cx + R * 0.95, cy + R * 0.3); ctx.lineTo(cx + R * 0.7, y);
      ctx.stroke();
      ctx.lineWidth = band;
      ctx.strokeStyle = th.timber ? '#6b3a17' : ORANGE_DARK;
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.5, Math.PI * 2.5); ctx.stroke();
      ctx.lineWidth = band * 0.78;
      ctx.strokeStyle = th.band;
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.62, Math.PI * 2.38); ctx.stroke();
      ctx.lineWidth = Math.max(1, band * 0.08);
      ctx.strokeStyle = th.edge;
      ctx.beginPath(); ctx.arc(cx, cy, R + band * 0.38, Math.PI * 0.62, Math.PI * 2.38); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R - band * 0.38, Math.PI * 0.62, Math.PI * 2.38); ctx.stroke();
      if (th.clock) clockFace(ctx, cx, cy - R - band * 0.9, Math.max(3, band * 0.75));
    } else if (f.kind === 'BOOSTER' && f.minMph) {
      // A roadside speed sign: the loop/jump ahead needs this much.
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
        ctx.fillText(`${f.minMph}+`, sx, y - sh * 1.6);
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
