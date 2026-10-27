// 2D art for the era signature hazards (ticket 0113, rules in src/era-hazards.js). Drawn by
// src/render/sprites.js through the backdrop shim, already translated to the prop's centre and
// rotated with it; the road is at y ≈ oh·0.45. Art stays inside the sprite's seen box
// (±0.55·ow, up to 1.7·oh above the anchor) so billboard fading (0203) treats it as traffic. Flat fills only, nothing allocated per call.

const B = 0.45; // ground line, in oh

function sign(ctx, ow, oh) {
  // A sidewalk A-frame menu board, blown off the kerb: dark frame, cyan neon chalk lines.
  const h = oh * 1.6;
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.moveTo(-ow * 0.42, oh * B); ctx.lineTo(-ow * 0.24, oh * B - h); ctx.lineTo(ow * 0.24, oh * B - h); ctx.lineTo(ow * 0.42, oh * B);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(-ow * 0.24, oh * B - h * 0.82, ow * 0.48, h * 0.6);
  ctx.fillStyle = '#38bdf8';
  for (let k = 0; k < 3; k++) ctx.fillRect(-ow * 0.17, oh * B - h * (0.74 - k * 0.18), ow * (0.34 - k * 0.08), Math.max(1.5, h * 0.06));
}

function cart(ctx, ow, oh) {
  // A runaway shopping cart: wire basket, red handle, four small wheels.
  const h = oh * 1.3;
  ctx.fillStyle = '#111827';
  ctx.fillRect(-ow * 0.38, oh * B - oh * 0.14, ow * 0.14, oh * 0.14);
  ctx.fillRect(ow * 0.24, oh * B - oh * 0.14, ow * 0.14, oh * 0.14);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, ow * 0.04);
  ctx.strokeRect(-ow * 0.42, oh * B - h, ow * 0.84, h * 0.72);
  ctx.beginPath();
  for (let k = 1; k < 4; k++) { const x = -ow * 0.42 + ow * 0.21 * k; ctx.moveTo(x, oh * B - h); ctx.lineTo(x, oh * B - h * 0.28); }
  ctx.moveTo(-ow * 0.42, oh * B - h * 0.64); ctx.lineTo(ow * 0.42, oh * B - h * 0.64);
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-ow * 0.5, oh * B - h * 1.08, ow, Math.max(2, h * 0.1));
}

function tumbleweed(ctx, ow, oh) {
  // A dry ball of brush: two tan rings and crossing twigs (it spins when you hit it).
  const r = Math.min(ow * 0.46, oh * 0.95);
  const cy = oh * B - r;
  ctx.strokeStyle = '#c08a4a';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.moveTo(r * 0.62, cy); ctx.arc(0, cy, r * 0.62, 0, Math.PI * 2);
  ctx.moveTo(-r, cy - r * 0.3); ctx.lineTo(r, cy + r * 0.35);
  ctx.moveTo(-r * 0.4, cy - r); ctx.lineTo(r * 0.35, cy + r);
  ctx.moveTo(-r * 0.85, cy + r * 0.5); ctx.lineTo(r * 0.8, cy - r * 0.55);
  ctx.stroke();
}

function drone(ctx, ow, oh) {
  // A downed delivery drone: grey body, two bent rotor arms, one red fault light.
  const y = oh * B - oh * 0.36;
  ctx.fillStyle = '#334155';
  ctx.fillRect(-ow * 0.5, y - oh * 0.08, ow, oh * 0.12);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(-ow * 0.2, y - oh * 0.2, ow * 0.4, oh * 0.4);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(-ow * 0.52, y - oh * 0.22, ow * 0.22, Math.max(1.5, oh * 0.06));
  ctx.fillRect(ow * 0.3, y - oh * 0.04, ow * 0.22, Math.max(1.5, oh * 0.06));
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(-ow * 0.05, y - oh * 0.1, ow * 0.1, oh * 0.1);
}

function pylon(ctx, ow, oh) {
  // A light-barrier pylon knocked loose: dark post, magenta light bar, glowing cap.
  const h = oh * 1.5;
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(-ow * 0.2, oh * B - h, ow * 0.4, h);
  ctx.fillStyle = '#f0abfc';
  ctx.fillRect(-ow * 0.08, oh * B - h * 0.9, ow * 0.16, h * 0.7);
  ctx.fillStyle = '#d946ef';
  ctx.fillRect(-ow * 0.34, oh * B - h - oh * 0.12, ow * 0.68, oh * 0.18);
  ctx.fillRect(-ow * 0.38, oh * B - oh * 0.1, ow * 0.76, oh * 0.1);
}

function crate(ctx, ow, oh) {
  // Two stacked milk crates fallen from a delivery truck: mint plastic, open grid sides.
  const h = oh * 0.75;
  for (let k = 0; k < 2; k++) {
    const y = oh * B - h * (k + 1);
    const x = k ? -ow * 0.3 : -ow * 0.42;
    ctx.fillStyle = k ? '#5eead4' : '#2dd4bf';
    ctx.fillRect(x, y, ow * 0.72, h * 0.92);
    ctx.fillStyle = '#134e4a';
    ctx.fillRect(x + ow * 0.1, y + h * 0.22, ow * 0.18, h * 0.24);
    ctx.fillRect(x + ow * 0.44, y + h * 0.22, ow * 0.18, h * 0.24);
  }
}

function shard(ctx, ow, oh) {
  // A chunk of comet ice on the glass road: a pale crystal with a bright face.
  const h = oh * 1.6;
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.moveTo(-ow * 0.4, oh * B); ctx.lineTo(-ow * 0.22, oh * B - h * 0.7); ctx.lineTo(ow * 0.04, oh * B - h);
  ctx.lineTo(ow * 0.38, oh * B - h * 0.45); ctx.lineTo(ow * 0.42, oh * B);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.moveTo(-ow * 0.1, oh * B); ctx.lineTo(ow * 0.04, oh * B - h); ctx.lineTo(ow * 0.16, oh * B);
  ctx.closePath(); ctx.fill();
}

const ART = { SIDEWALK_SIGN: sign, SHOPPING_CART: cart, TUMBLEWEED: tumbleweed, DRONE_WRECK: drone, LIGHT_PYLON: pylon, MILK_CRATE: crate, ICE_SHARD: shard };

/** Draw an era prop of `type`; false if `type` has no era art. */
export function drawEraProp(ctx, type, ow, oh) {
  const f = ART[type];
  if (!f) return false;
  f(ctx, ow, oh);
  return true;
}
