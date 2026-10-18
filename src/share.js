// Share your result (ticket 0053): a personalised synthwave card drawn on a canvas on the
// device (1080x1350 to post, 1200x630 for link previews), shared as an image through the
// system share sheet where the browser can, with copy-link and save-image fallbacks.
// Lazy chunk: fetched when the results screen opens, never during a race.
import { qrToCanvas } from './qr.js'; // the shared on-device encoder (ticket 0090)
import { formatRaceTime, ordinal } from './raceflow.js';
import { shareCopy } from './sharelink.js';
import { carSprite } from './car-sprite.js';

export const FORMATS = Object.freeze({
  post: { w: 1080, h: 1350 },
  wide: { w: 1200, h: 630 },
});

const PLACE_COLORS = { 1: ['#fff7ad', '#fde047', '#f59e0b'], 2: ['#ffffff', '#e2e8f0', '#94a3b8'], 3: ['#ffe4c7', '#fdba74', '#c2410c'] };
const OTHER = ['#e0fbff', '#67e8f9', '#0891b2'];

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('italic 900 100px Orbitron'), document.fonts.load('900 40px Orbitron'),
      document.fonts.load('800 40px Orbitron'), document.fonts.load('700 40px Inter'), document.fonts.load('800 40px Inter'),
    ]);
  } catch (e) { /* draw with fallbacks */ }
}

function backdrop(ctx, w, h, horizon) {
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#06021a');
  sky.addColorStop(0.55, '#2a0845');
  sky.addColorStop(1, '#c2185b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 70; i++) {
    const x = (i * 9973) % w, y = (i * 7919) % Math.max(1, horizon * 0.6);
    ctx.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
  }
  // Scan-banded sun
  const r = Math.min(w, h) * 0.26;
  const cx = w * 0.5, cy = horizon - r * 0.15;
  const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, '#ffe66d');
  sun.addColorStop(0.5, '#ff8a3d');
  sun.addColorStop(1, '#ff2bd6');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.shadowColor = '#ff2bd6';
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#2a0845';
  for (let i = 0; i < 7; i++) {
    const y = cy + r * (0.05 + i * 0.14);
    ctx.fillRect(cx - r, y, r * 2, 4 + i * 2.2);
  }
  ctx.restore();
  // Floor + perspective grid
  const floor = ctx.createLinearGradient(0, horizon, 0, h);
  floor.addColorStop(0, '#1a0033');
  floor.addColorStop(1, '#05010f');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.strokeStyle = 'rgba(255, 43, 214, 0.75)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff2bd6';
  ctx.shadowBlur = 10;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 18, horizon);
    ctx.lineTo(cx + i * w * 0.16, h);
    ctx.stroke();
  }
  for (let k = 1; k < 12; k++) {
    const y = horizon + (h - horizon) * (k / 12) ** 2.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Horizon glow line
  ctx.fillStyle = '#ff7ae9';
  ctx.fillRect(0, horizon - 2, w, 4);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text that shrinks until it fits `maxW`. */
function fitFont(ctx, text, weight, family, size, maxW, italic = '') {
  let s = size;
  do { ctx.font = `${italic}${weight} ${s}px ${family}`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 12);
}

function wordmark(ctx, x, y, size) {
  ctx.font = `900 ${size}px Orbitron, sans-serif`;
  const g = ctx.createLinearGradient(0, y - size, 0, y);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#94a3b8');
  g.addColorStop(0.55, '#f8fafc');
  g.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
  ctx.shadowBlur = 14;
  ctx.fillText('OUTATIME', x, y);
  const wOut = ctx.measureText('OUTATIME ').width;
  ctx.font = `italic 900 ${size * 1.2}px Orbitron, sans-serif`;
  const g2 = ctx.createLinearGradient(0, y - size, 0, y);
  g2.addColorStop(0, '#ffd000');
  g2.addColorStop(1, '#ff007f');
  ctx.fillStyle = g2;
  ctx.shadowColor = 'rgba(255, 102, 0, 0.8)';
  ctx.fillText('88', x + wOut, y);
  ctx.shadowBlur = 0;
}

function pill(ctx, text, x, y, { bg, fg, size = 30, pad = 18, align = 'left' }) {
  ctx.font = `900 ${size}px Orbitron, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + pad * 2, h = size * 1.7;
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(text, left + pad, y + h * 0.68);
  return { w, h, left };
}

function ordinalArt(ctx, text, x, y, size, place, align) {
  const [hi, mid, lo] = PLACE_COLORS[place] || OTHER;
  ctx.font = `italic 900 ${size}px Orbitron, sans-serif`;
  ctx.textAlign = align;
  const g = ctx.createLinearGradient(0, y - size * 0.85, 0, y);
  g.addColorStop(0, hi);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, lo);
  ctx.fillStyle = '#ff007f';
  ctx.fillText(text, x + size * 0.03, y + size * 0.05); // magenta drop
  ctx.shadowColor = mid;
  ctx.shadowBlur = 40;
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

function qrTile(ctx, url, x, y, size) {
  roundRect(ctx, x - 14, y - 14, size + 28, size + 28, 22);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 240, 255, 0.7)';
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.shadowBlur = 0;
  const q = qrToCanvas(url, document.createElement('canvas'), { size, dark: '#05050d' });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(q, x - 6, y - 6, size + 12, size + 12); // its quiet zone overlaps the tile's padding
  ctx.imageSmoothingEnabled = true;
}

/** Your car (the garage model in your paint), parked on the card's horizon with a glow pool. */
function carArt(ctx, look, x, groundY, w, color) {
  if (!look || !look.shape) return;
  const pool = ctx.createRadialGradient(x, groundY, 4, x, groundY, w * 0.6);
  pool.addColorStop(0, color);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(x, groundY, w * 0.6, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const spr = carSprite(look, w, { view: 'three-quarter' });
  const h = w * spr.height / spr.width;
  ctx.drawImage(spr, x - w / 2, groundY - h * (spr.gy / spr.height), w, h);
}

/**
 * Draws the card. `d`: { place, total, startPos, beatBy, outcome, beat: [names], time,
 * bestLap, levelName, daily, initials, car, look, color, url, displayUrl, isRoom }
 */
export async function drawShareCard(canvas, d, format = 'post') {
  await fontsReady();
  const { w, h } = FORMATS[format] || FORMATS.post;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const copy = shareCopy(d);
  const ord = d.endless ? `TIER ${d.endless.tier}` : d.outcome === 'wrecked' ? 'WRECKED' : `${ordinal(d.place)}!`;
  const color = d.color || '#00f0ff';
  const who = d.initials || 'YOU';
  const timeText = formatRaceTime(d.time);
  const meta = [d.levelName, timeText, d.bestLap ? `BEST LAP ${formatRaceTime(d.bestLap)}` : null].filter(Boolean).join('  ·  ');

  if (format === 'wide') {
    backdrop(ctx, w, h, h * 0.62);
    wordmark(ctx, 48, 78, 40);
    if (d.daily) pill(ctx, '📅 DAILY CHALLENGE', w - 48, 34, { bg: '#ff2bd6', fg: '#fff', size: 22, align: 'right' });
    ctx.fillStyle = '#67e8f9';
    ctx.font = '900 30px Orbitron, sans-serif';
    ctx.fillText(copy.kicker, 52, 150);
    fitFont(ctx, ord, 900, 'Orbitron, sans-serif', 210, 560, 'italic ');
    ordinalArt(ctx, ord, 44, 360, parseInt(ctx.font.match(/(\d+)px/)[1], 10), d.place, 'left');
    carArt(ctx, d.look, w - 48 - 190, 336, 380, color);
    const p = pill(ctx, who, 52, 400, { bg: color, fg: '#05050d', size: 34 });
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 26px Inter, sans-serif';
    ctx.fillText(d.car || '', 52 + p.w + 16, 440);
    ctx.fillStyle = '#fde68a';
    ctx.font = '800 26px Orbitron, sans-serif';
    ctx.fillText(meta, 52, 510);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px Inter, sans-serif';
    wrap(ctx, copy.brag, 760).slice(0, 2).forEach((l, i) => ctx.fillText(l, 52, 562 + i * 38));
    qrTile(ctx, d.url, w - 48 - 220, h - 48 - 220 - 40, 220);
    ctx.fillStyle = '#ff8a3d';
    ctx.font = '900 22px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.isRoom ? 'SCAN TO JOIN MY ROOM' : 'SCAN TO RACE ME', w - 48 - 110, h - 34);
    ctx.textAlign = 'left';
    return canvas;
  }

  backdrop(ctx, w, h, h * 0.56);
  wordmark(ctx, 64, 110, 54);
  if (d.daily) pill(ctx, '📅 DAILY', w - 64, 56, { bg: '#ff2bd6', fg: '#fff', size: 28, align: 'right' });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#67e8f9';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 18;
  fitFont(ctx, copy.kicker, 900, 'Orbitron, sans-serif', 54, w - 128);
  ctx.fillText(copy.kicker, w / 2, 250);
  ctx.shadowBlur = 0;
  fitFont(ctx, ord, 900, 'Orbitron, sans-serif', 300, w - 100, 'italic ');
  ordinalArt(ctx, ord, w / 2, 560, parseInt(ctx.font.match(/(\d+)px/)[1], 10), d.place, 'center');

  // Driver plate
  const plateY = 640;
  roundRect(ctx, 64, plateY, w - 128, 150, 30);
  ctx.fillStyle = 'rgba(5, 5, 20, 0.82)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;
  carArt(ctx, d.look, w - 210, plateY + 14, 340, color);
  pill(ctx, who, 100, plateY + 34, { bg: color, fg: '#05050d', size: 48, pad: 26 });
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const room = d.look ? 250 : 0; // the parked car on the plate's right
  fitFont(ctx, d.car || '', 800, 'Inter, sans-serif', 38, w - 128 - 330 - room);
  ctx.fillText(d.car || '', 330, plateY + 70);
  ctx.fillStyle = '#fde68a';
  fitFont(ctx, meta, 800, 'Orbitron, sans-serif', 30, w - 128 - 330 - room);
  ctx.fillText(meta, 330, plateY + 116);

  // The brag
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 50px Inter, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 10;
  wrap(ctx, copy.brag, w - 140).slice(0, 3).forEach((l, i) => ctx.fillText(l, 70, 880 + i * 62));
  ctx.shadowBlur = 0;

  // CTA + QR
  const q = 250;
  qrTile(ctx, d.url, w - 64 - q, h - 64 - q, q);
  ctx.fillStyle = '#ff8a3d';
  ctx.font = '900 46px Orbitron, sans-serif';
  ctx.fillText(d.isRoom ? 'JOIN MY ROOM ▶' : 'RACE ME ▶', 70, h - 210);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 32px Inter, sans-serif';
  ctx.fillText(d.isRoom ? 'Scan or tap the link — we race live' : 'Scan or tap the link: same track, my time to beat', 70, h - 150, w - 64 - q - 110);
  ctx.fillStyle = '#67e8f9';
  ctx.font = '800 34px Orbitron, sans-serif';
  ctx.fillText(d.displayUrl || 'mutaafaziz.com/outatime', 70, h - 90);
  return canvas;
}

export const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));

/** 'shared' | 'cancelled' | 'unsupported' — the system share sheet, with the image if allowed. */
export async function shareNative({ blob, filename, title, text, url }) {
  if (typeof navigator.share !== 'function') return 'unsupported';
  const file = blob && typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
  const withFile = file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  try {
    await navigator.share(withFile ? { files: [file], title, text: `${text} ${url}` } : { title, text, url });
    return 'shared';
  } catch (e) {
    return e && e.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** Copies the link; 'copied' or 'failed'. */
export async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch (e) { /* older browsers */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copied' : 'failed';
  } catch (e) { return 'failed'; }
}

/** Saves the card as a PNG file. */
export function downloadPng(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** The static link-preview image (public/og.jpg, made by scripts/make-og.mjs). */
export async function drawPromoCard(canvas, url = 'https://mutaafaziz.com/outatime/') {
  await fontsReady();
  const { w, h } = FORMATS.wide;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  backdrop(ctx, w, h, h * 0.6);
  wordmark(ctx, 60, 150, 92);
  ctx.fillStyle = '#67e8f9';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 16;
  ctx.font = '900 34px Orbitron, sans-serif';
  ctx.fillText('SIX RACERS. THREE LAPS. HIT 88.', 64, 230);
  ctx.shadowBlur = 0;
  ordinalArt(ctx, '1ST?', 56, 440, 190, 1, 'left');
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px Inter, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 10;
  ctx.fillText('A neon time-travel arcade racer.', 64, 520);
  ctx.fillText('Free in your browser. Can you beat my time?', 64, 566);
  ctx.shadowBlur = 0;
  qrTile(ctx, url, w - 60 - 230, h - 60 - 230 - 30, 230);
  ctx.fillStyle = '#ff8a3d';
  ctx.font = '900 24px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO RACE', w - 60 - 115, h - 36);
  ctx.textAlign = 'left';
  return canvas;
}
