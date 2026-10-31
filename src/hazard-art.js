// Endless hazards on screen (ticket 0186), 2D: the broken bridge, crumbling lanes, the low
// overpass, the train crossing, wrong-way drivers, missing guardrails, storm lightning, their
// roadside warning signs, checkpoint gates — and the HUD for fuel, NOS heat, the checkpoint
// clock and the Patrol. Lazy; reads GameState.hz (src/hazard-run.js) and never writes the sim.
// Kid-friendly by design: holes are a cartoon night-blue void, crashes a "POOF", never gore.
import { RACE_DEPS } from './main.js';
import { HZ, LANES, LANE_HALF, FUEL, HEAT } from './hazards.js';

const { GameState: G, ROAD_CFG } = RACE_DEPS;
const SEG = ROAD_CFG.segLength;
const VOID = '#0b0630', VOID_EDGE = '#1e1b4b', RED = 'rgba(255,42,61,0.5)', GREEN = 'rgba(34,197,94,0.42)';

function quad(ctx, a, b, c, d, e, f, g, h, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.lineTo(g, h);
  ctx.closePath();
  ctx.fill();
}

/** A strip of road between lane offsets o0..o1 on this segment. */
function strip(ctx, seg, o0, o1, fill) {
  const a = seg.p1.screen, b = seg.p2.screen;
  quad(ctx, a.x + o0 * a.w, a.y, a.x + o1 * a.w, a.y, b.x + o1 * b.w, b.y, b.x + o0 * b.w, b.y, fill);
}
const laneStrip = (ctx, seg, l, fill) => strip(ctx, seg, LANES[l] - LANE_HALF, LANES[l] + LANE_HALF, fill);

function chevron(ctx, x, y, s, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.5, s * 0.22);
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.5); ctx.lineTo(x, y - s * 0.5); ctx.lineTo(x + s, y + s * 0.5);
  ctx.stroke();
}

function label(ctx, text, x, y, px, col, align = 'center') {
  if (px < 7) return;
  ctx.font = `900 ${Math.round(px)}px Orbitron, sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = Math.max(2, px * 0.22);
  ctx.strokeStyle = '#0b0b1a';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = col;
  ctx.fillText(text, x, y);
}

/** Roadside diamond sign (lit and blinking once the hazard is telegraphed). */
function sign(ctx, seg, h, t) {
  const p = seg.p1.screen;
  const side = h.kind === 'EDGE' ? h.side : 1;
  const s = Math.max(4, p.w * 0.16);
  const x = p.x + side * p.w * 1.28, y = p.y - p.w * 0.42;
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - s * 0.06, y, s * 0.12, p.y - y);
  const lit = h.warned && (G.reducedMotion || Math.floor(t * 6) % 2 === 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = lit ? '#fde047' : '#eab308';
  ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(1, s * 0.1);
  ctx.strokeRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
  ctx.restore();
  if (s > 8) {
    ctx.font = `${Math.round(s * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(HZ[h.kind].icon, x, y + s * 0.32);
  }
  label(ctx, HZ[h.kind].sign, x, y - s * 1.15, s * 0.42, lit ? '#fde047' : '#fef9c3');
}

const APPROACH = 7 * SEG;
function approach(ctx, sg, h) {
  if (h.kind === 'BRIDGE') { if (sg.index % 2 === 0) strip(ctx, sg, -0.86, 0.86, RED); return; }
  if (h.kind === 'EDGE') { strip(ctx, sg, h.side > 0 ? 0.5 : -0.86, h.side > 0 ? 0.86 : -0.5, RED); return; }
  if (h.kind !== 'BEAM' && h.kind !== 'COLLAPSE') return;
  for (let l = 0; l < 3; l++) laneStrip(ctx, sg, l, l === h.safe ? GREEN : RED);
  const a = sg.p1.screen;
  if (h.safe >= 0 && sg.index % 3 === 0 && a.w > 20) chevron(ctx, a.x + LANES[h.safe] * a.w, a.y - a.w * 0.04, a.w * 0.07, '#4ade80');
}

/** One road segment's share of every hazard (called back-to-front from the 2D renderer). */
export function seg(ctx, sg) {
  const S = G.hz;
  if (!S || (!S.list.length && !S.cp.on)) return;
  const z0 = sg.index * SEG, z1 = z0 + SEG, t = G.raceTime || 0;
  const a = sg.p1.screen;
  for (let k = 0; k < S.list.length; k++) {
    const h = S.list[k];
    if (h.signZ >= z0 && h.signZ < z1) sign(ctx, sg, h, t);
    const on = h.z0 < z1 && h.z0 + h.len > z0;
    const first = h.z0 >= z0 && h.z0 < z1;
    // The approach: once it's called out, the last few segments before it show which lanes to avoid.
    if (h.warned && !h.spent && z1 > h.z0 - APPROACH && z0 < h.z0) approach(ctx, sg, h);
    switch (h.kind) {
      case 'BRIDGE':
        if (on) {
          if (!h.spent) strip(ctx, sg, -1.15, 1.15, VOID);
          else strip(ctx, sg, -0.9, 0.9, 'rgba(148,163,184,0.55)'); // a shield/continue bridge plank
          if (first) { // the broken lip: hazard tape and jagged teeth
            const tooth = a.w * 0.12;
            for (let i = -4; i < 4; i++) quad(ctx, a.x + i * tooth * 2, a.y, a.x + (i + 1) * tooth * 2, a.y, a.x + (i + 0.5) * tooth * 2, a.y - tooth * 0.6, a.x + (i + 0.5) * tooth * 2, a.y - tooth * 0.6, i % 2 ? '#facc15' : '#111827');
          }
        }
        break;
      case 'COLLAPSE':
        if (on) for (let l = 0; l < 3; l++) {
          if (l === h.safe) { laneStrip(ctx, sg, l, GREEN); if ((sg.index & 1) === 0) chevron(ctx, a.x + LANES[l] * a.w, a.y - a.w * 0.04, a.w * 0.07, '#4ade80'); continue; }
          if (h.ph > 0) laneStrip(ctx, sg, l, h.ph >= 1 ? VOID : `rgba(11,6,48,${(0.25 + 0.75 * h.ph).toFixed(2)})`);
          else if (h.warned) laneStrip(ctx, sg, l, RED);
          if (h.ph < 1 && a.w > 30 && (sg.index & 1)) { // cracks
            const cx = a.x + LANES[l] * a.w, cw = a.w * 0.16;
            ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(1, a.w * 0.012);
            ctx.beginPath(); ctx.moveTo(cx - cw, a.y); ctx.lineTo(cx - cw * 0.3, a.y - a.w * 0.03); ctx.lineTo(cx + cw * 0.2, a.y); ctx.lineTo(cx + cw, a.y - a.w * 0.04); ctx.stroke();
          }
        }
        break;
      case 'BEAM':
        if (on && h.warned) for (let l = 0; l < 3; l++) laneStrip(ctx, sg, l, h.lanes & (1 << l) ? RED : GREEN);
        if (first) drawBeam(ctx, sg, h);
        break;
      case 'TRAIN':
        if (first) drawCrossing(ctx, sg, h, t);
        break;
      case 'WRONGWAY':
        if (h.carZ >= z0 && h.carZ < z1) drawWrongWay(ctx, sg, h, t);
        else if (h.locked && h.warned && !h.spent && h.carZ > z1 && h.carZ - z1 < 6 * SEG) for (let l = 0; l < 3; l++) if (h.lanes & (1 << l)) laneStrip(ctx, sg, l, RED);
        break;
      case 'EDGE':
        if (on) drawEdge(ctx, sg, h);
        break;
      case 'LIGHTNING':
        if (on && !h.spent) drawBoltZone(ctx, sg, h, t, first);
        break;
      default:
    }
  }
  if (S.cp.on && S.cp.gateZ >= z0 && S.cp.gateZ < z1) {
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = Math.max(3, a.w * 0.06);
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.w * 1.08, Math.PI, 0);
    ctx.stroke();
    label(ctx, 'CHECKPOINT', a.x, a.y - a.w * 0.86, a.w * 0.18, '#bbf7d0');
  }
}

function drawBeam(ctx, sg, h) {
  const a = sg.p1.screen;
  const top = a.y - a.w * 0.44, bot = a.y - a.w * 0.24;
  for (let l = 0; l < 3; l++) {
    if (!(h.lanes & (1 << l))) {
      chevron(ctx, a.x + LANES[l] * a.w, a.y - a.w * 0.08, a.w * 0.08, '#4ade80');
      continue;
    }
    const x0 = a.x + (LANES[l] - LANE_HALF) * a.w, x1 = a.x + (LANES[l] + LANE_HALF) * a.w;
    ctx.fillStyle = '#475569';
    ctx.fillRect(x0, top, x1 - x0, bot - top);
    const n = 6, w = (x1 - x0) / n;
    for (let i = 0; i < n; i += 2) { ctx.fillStyle = '#facc15'; ctx.fillRect(x0 + i * w, bot - (bot - top) * 0.4, w, (bot - top) * 0.4); }
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x0, top - a.w * 0.02, x1 - x0, a.w * 0.02);
  }
  ctx.fillStyle = '#334155';
  ctx.fillRect(a.x - a.w * 1.02, top - a.w * 0.02, a.w * 0.06, a.y - top);
  ctx.fillRect(a.x + a.w * 0.96, top - a.w * 0.02, a.w * 0.06, a.y - top);
  label(ctx, 'LOW', a.x + LANES[h.lanes & 1 ? 0 : 1] * a.w, top - a.w * 0.04, a.w * 0.1, '#fde047');
}

function drawCrossing(ctx, sg, h, t) {
  const a = sg.p1.screen, b = sg.p2.screen;
  // rails and ties across the road
  ctx.fillStyle = '#3f3f46';
  for (let i = -5; i <= 5; i++) ctx.fillRect(a.x + i * a.w * 0.2 - a.w * 0.03, b.y, a.w * 0.06, a.y - b.y);
  quad(ctx, a.x - a.w * 1.3, a.y - (a.y - b.y) * 0.25, a.x + a.w * 1.3, a.y - (a.y - b.y) * 0.25, b.x + b.w * 1.3, b.y + (a.y - b.y) * 0.18, b.x - b.w * 1.3, b.y + (a.y - b.y) * 0.18, '#9ca3af');
  const armed = h.tOn != null && t < h.tOff + 0.3;
  const blink = armed && (G.reducedMotion || Math.floor(t * 4) % 2 === 0);
  for (const s of [-1, 1]) { // crossing posts with twin lights
    const x = a.x + s * a.w * 1.12, top = a.y - a.w * 0.5;
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x - a.w * 0.015, top, a.w * 0.03, a.y - top);
    ctx.fillStyle = blink ? '#ff2a3d' : '#7f1d1d';
    ctx.beginPath(); ctx.arc(x - a.w * 0.05, top, Math.max(2, a.w * 0.035), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = !blink && armed ? '#ff2a3d' : '#7f1d1d';
    ctx.beginPath(); ctx.arc(x + a.w * 0.05, top, Math.max(2, a.w * 0.035), 0, Math.PI * 2); ctx.fill();
  }
  if (h.pos == null) return;
  // the TIME RAIL: three chunky cartoon cars sliding across
  const carW = a.w * 0.95, carH = a.w * 0.42, y = a.y - carH;
  for (let c = 0; c < 3; c++) {
    const x = a.x + h.pos * a.w * 2.8 - c * carW * 1.06;
    ctx.fillStyle = c === 0 ? '#7c3aed' : '#0e7490';
    ctx.fillRect(x - carW / 2, y, carW, carH);
    ctx.fillStyle = '#e0f2fe';
    for (let w = 0; w < 4; w++) ctx.fillRect(x - carW / 2 + carW * (0.08 + w * 0.23), y + carH * 0.18, carW * 0.15, carH * 0.3);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - carW / 2, y + carH * 0.66, carW, carH * 0.08);
    ctx.fillStyle = '#111827';
    for (const wx of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(x + wx * carW, a.y - carH * 0.04, carH * 0.13, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawWrongWay(ctx, sg, h, t) {
  if (h.spent) return;
  const a = sg.p1.screen;
  const l = h.lanes & 1 ? 0 : h.lanes & 2 ? 1 : 2;
  const x = a.x + LANES[l] * a.w, w = a.w * 0.36, ht = a.w * 0.24, y = a.y - ht;
  ctx.fillStyle = 'rgba(254,249,195,0.25)';
  ctx.beginPath(); ctx.ellipse(x, a.y, w * 0.9, w * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  round(ctx, x - w / 2, y + ht * 0.25, w, ht * 0.75, ht * 0.18, '#be123c');
  round(ctx, x - w * 0.38, y, w * 0.76, ht * 0.36, ht * 0.14, '#9f1239');
  round(ctx, x - w * 0.31, y + ht * 0.05, w * 0.62, ht * 0.24, ht * 0.08, '#93c5fd');
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x - w * 0.2, y + ht * 0.62, w * 0.4, ht * 0.14); // grille
  ctx.fillRect(x - w * 0.5, y + ht * 0.9, w, ht * 0.1); // bumper
  ctx.fillStyle = '#fffbeb';
  ctx.shadowColor = '#fef08a'; ctx.shadowBlur = G.reducedMotion ? 0 : Math.min(18, w * 0.3);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * w * 0.32, y + ht * 0.55, Math.max(1.5, w * 0.09), 0, Math.PI * 2); ctx.fill(); }
  ctx.shadowBlur = 0;
  if (h.warned && (G.reducedMotion || Math.floor(t * 5) % 2 === 0)) label(ctx, 'WRONG WAY!', x, y - ht * 0.3, Math.max(8, w * 0.22), '#fda4af');
}

function round(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}

function drawEdge(ctx, sg, h) {
  const a = sg.p1.screen, b = sg.p2.screen, s = h.side;
  // The guardrail and the deck beside it are gone: a void from the road's edge up past the wall.
  const ha = a.w * 0.09, hb = b.w * 0.09;
  quad(ctx, a.x + s * a.w * 0.95, a.y + 2, a.x + s * a.w * 1.4, a.y + 2, b.x + s * b.w * 1.4, b.y, b.x + s * b.w * 0.95, b.y, VOID);
  quad(ctx, a.x + s * a.w * 0.97, a.y, a.x + s * a.w * 1.4, a.y, b.x + s * b.w * 1.4, b.y - hb, b.x + s * b.w * 0.97, b.y - hb, VOID);
  quad(ctx, a.x + s * a.w * 0.97, a.y - ha, a.x + s * a.w * 1.4, a.y - ha, a.x + s * a.w * 1.4, a.y, a.x + s * a.w * 0.97, a.y, VOID);
  quad(ctx, a.x + s * a.w * 0.92, a.y, a.x + s * a.w * 0.97, a.y, b.x + s * b.w * 0.97, b.y, b.x + s * b.w * 0.92, b.y, VOID_EDGE);
  if (h.warned) strip(ctx, sg, s > 0 ? 0.56 : -0.86, s > 0 ? 0.86 : -0.56, RED);
  if (sg.index % 3 === 0) { // broken rail stubs with red/white posts
    const x = a.x + s * a.w * 0.93, ht = a.w * 0.12;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(x - a.w * 0.012, a.y - ht, a.w * 0.024, ht);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(x - a.w * 0.012, a.y - ht, a.w * 0.024, ht * 0.4);
  }
}

function drawBoltZone(ctx, sg, h, t, first) {
  const a = sg.p1.screen;
  for (let l = 0; l < 3; l++) {
    if (!(h.lanes & (1 << l))) continue;
    laneStrip(ctx, sg, l, `rgba(125,211,252,${(0.22 + 0.18 * Math.sin(t * 20 + sg.index)).toFixed(2)})`);
    if (!first) continue;
    const x = a.x + LANES[l] * a.w;
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = Math.max(1.5, a.w * 0.02);
    ctx.beginPath(); ctx.ellipse(x, a.y, a.w * 0.24, a.w * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
    if (G.hz.bolt > 0 || h.t < 0.6) { // the bolt: a zig-zag from the sky
      ctx.strokeStyle = '#f0f9ff';
      ctx.lineWidth = Math.max(2, a.w * 0.03);
      ctx.beginPath();
      let px = x, py = 0;
      ctx.moveTo(px, py);
      for (let i = 1; i <= 6; i++) { px = x + (i % 2 ? 1 : -1) * a.w * 0.08; py = (a.y * i) / 6; ctx.lineTo(i === 6 ? x : px, py); }
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------------------
// HUD: fuel, NOS heat, the checkpoint clock, the Patrol on your tail, and the act-now cue.

/** A vertical gauge on the right edge, filling from the bottom, with its icon underneath. */
function gauge(ctx, x, top, w, h, frac, col, icon) {
  ctx.fillStyle = 'rgba(2,6,23,0.62)';
  ctx.fillRect(x - 2, top - 2, w + 4, h + 4);
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = col;
  ctx.fillRect(x, top + h * (1 - f), w, h * f);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, top - 0.5, w + 1, h + 1);
  ctx.font = `${Math.round(w * 1.3)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(icon, x + w / 2, top + h + w * 1.6);
}

export function hud(ctx, rw, rh, over3d, t) {
  const S = G.hz;
  if (!S || G.status !== 'PLAYING' && G.status !== 'CONTINUE') return;
  // The right edge, mid-height: clear of the top HUD, the touch buttons and the car, and inside
  // the speed push-in's crop (the 2D frame is zoomed up to ~15% at speed).
  const edge = Math.round(rw * 0.075) + 8;
  const w = Math.max(8, Math.round(Math.min(rw, rh) * 0.016)), h = Math.round(rh * 0.18), top = Math.round(rh * 0.36);
  let x = rw - w - edge;
  const blink = G.reducedMotion || Math.floor(t * 4) % 2 === 0;
  if (S.fuelOn) {
    const f = S.fuel / FUEL.max;
    gauge(ctx, x, top, w, h, f, S.fuel <= FUEL.low ? (blink ? '#ef4444' : '#fca5a5') : f < 0.5 ? '#f59e0b' : '#22d3ee', '⛽');
    if (S.dry) label(ctx, `GRAB A CORE ${Math.max(0, FUEL.drySecs - S.dryT).toFixed(1)}s`, rw / 2, rh * 0.62, Math.max(12, rh * 0.032), '#fca5a5');
    x -= w * 2.6;
  }
  if (S.heat > 2) {
    gauge(ctx, x, top, w, h, S.heat / HEAT.max, S.heat >= HEAT.hot ? (blink ? '#ef4444' : '#fca5a5') : '#fb923c', '🔥');
    x -= w * 2.6;
  }
  const px = Math.max(10, rh * 0.026), rx = rw - edge;
  if (S.cp.on) {
    const left = Math.max(0, S.cp.left);
    label(ctx, `⏱ ${left < 10 ? left.toFixed(1) : Math.ceil(left)}s`, rx, top - px * 0.8, px, left < 6 ? '#fca5a5' : '#bbf7d0', 'right');
  }
  if (S.patrol.t > 0) {
    const frac = S.patrol.t / S.patrol.dur;
    label(ctx, `🚨${rw < 700 ? '' : ' PATROL'} ${Math.ceil(S.patrol.t)}s`, rx, top + h + w * 3.6, px, blink ? '#e9d5ff' : '#67e8f9', 'right');
    drawPatrol(ctx, rw, rh, frac, t);
  }
  if (S.cue && !S.dying) label(ctx, S.cue, (G.playerScreenX || rw / 2), rh * 0.64, Math.max(16, rh * 0.055), '#fde047');
  if (S.dying) { // a cartoon poof over the car
    const k = Math.min(1, S.dying.t / 0.6), cx = G.playerScreenX || rw / 2, cy = rh * 0.8;
    ctx.fillStyle = `rgba(226,232,240,${(0.85 - 0.5 * k).toFixed(2)})`;
    for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rw * 0.06 * (0.6 + k), cy + Math.sin(ang) * rh * 0.04 * (0.6 + k), Math.min(rw, rh) * 0.05 * (0.7 + k * 0.6), 0, Math.PI * 2); ctx.fill(); }
    label(ctx, 'POOF!', cx, cy - rh * 0.1, Math.max(18, rh * 0.06), '#fde047');
  }
  // The strike's wash: calm motion (or a spent flash budget, 0234) keeps it under the 0.1 flash line (0188).
  if (!over3d && S.bolt > 0) { ctx.fillStyle = `rgba(224,242,254,${(S.bolt * (S.boltLit ? 0.8 : 0.2)).toFixed(2)})`; ctx.fillRect(0, 0, rw, rh); }
}

/** The Time Patrol's hover car rising behind you at the bottom of the screen, lights flashing. */
function drawPatrol(ctx, rw, rh, frac, t) {
  const cx = rw * 0.5, w = Math.min(rw * 0.2, 120), h = w * 0.34, y = rh - h * (0.2 + 0.5 * frac);
  ctx.fillStyle = 'rgba(56,189,248,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, rh - 2, w * 0.7, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - w / 2, y, w, h);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(cx - w * 0.3, y - h * 0.32, w * 0.6, h * 0.36);
  const blink = G.reducedMotion || Math.floor(t * 6) % 2 === 0;
  ctx.fillStyle = blink ? '#a855f7' : '#22d3ee';
  ctx.fillRect(cx - w * 0.28, y - h * 0.52, w * 0.24, h * 0.2);
  ctx.fillStyle = blink ? '#22d3ee' : '#a855f7';
  ctx.fillRect(cx + w * 0.04, y - h * 0.52, w * 0.24, h * 0.2);
}
