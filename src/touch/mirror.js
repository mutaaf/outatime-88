// Rear-view mirror for the 2D road (ticket 0061): while LOOK BACK is held, a small mirror shows
// who is behind you, nearer = bigger and lower, with rival names. Allocation-free per frame.

/**
 * @param ctx 2D context of the mirror canvas
 * @param player { z, x } world z and lane offset (-1..1) of the player
 * @param groups arrays of bodies with { worldZ, offset, bodyColor, name?, kind? }
 */
let sky = null;
let skyCtx = null;

export function drawRearMirror(ctx, w, h, player, groups, range = 9000) {
  if (skyCtx !== ctx) {
    skyCtx = ctx;
    sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(0.45, '#7c2d92');
    sky.addColorStop(0.46, '#0b0b1a');
    sky.addColorStop(1, '#05050d');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Road receding behind us (mirrored: horizon on top).
  const hy = h * 0.45;
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.moveTo(w * 0.47, hy); ctx.lineTo(w * 0.53, hy); ctx.lineTo(w * 0.98, h); ctx.lineTo(w * 0.02, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.47, hy); ctx.lineTo(w * 0.02, h);
  ctx.moveTo(w * 0.53, hy); ctx.lineTo(w * 0.98, h);
  ctx.stroke();
  let shown = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const list = groups[gi];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const behind = player.z - c.worldZ;
      if (behind <= 0 || behind > range || c.takenDown) continue;
      const t = 1 - behind / range; // 1 = right behind you
      const y = hy + (h - hy) * (0.15 + 0.8 * t);
      const spread = (0.06 + 0.42 * t) * w;
      // Mirror image: a car on your left appears on the mirror's left.
      const x = w / 2 + (c.offset - player.x) * spread;
      const cw = 10 + 34 * t;
      const ch = cw * 0.5;
      ctx.fillStyle = c.bodyColor || '#e2e8f0';
      ctx.fillRect(x - cw / 2, y - ch, cw, ch);
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(x - cw / 2, y - ch, cw * 0.18, ch * 0.3);
      ctx.fillRect(x + cw / 2 - cw * 0.18, y - ch, cw * 0.18, ch * 0.3);
      if (c.name && t > 0.25) {
        ctx.fillStyle = '#fde047';
        ctx.font = '900 9px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.mirrorLabel || (c.mirrorLabel = c.name.split(' ')[0]), x, y - ch - 3);
      }
      shown++;
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '900 9px Orbitron, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(shown ? 'BEHIND YOU' : 'ALL CLEAR', 8, 12);
  return shown;
}
