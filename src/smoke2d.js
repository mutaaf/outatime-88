// 2D tyre smoke (ticket 0133), a lazy chunk: main.js fetches it right after startup and simply
// draws no smoke until it arrives. Puffs live in road-lateral units (x), pixels up (y,
// negative) and pixels toward the chase camera (z): the sim step spawns them at the rear tyres
// from tyreSmokeLevel() (src/smoke.js), the 2D frame draws them over the car's tail. One fixed
// pool and one cached soft sprite per underglow tint; nothing is allocated per frame.
import { tyreSmokeLevel, smokeRate, createSmokePool } from './smoke.js';

export function createTyreSmoke2D(capacity = 96) {
  const pool = createSmokePool(capacity);
  let emit = 0;
  let sprite = null, spriteTint = '';

  function puff(tint) {
    if (sprite && spriteTint === tint) return sprite;
    spriteTint = tint;
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const g = sprite.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, '#eceef2');
    grad.addColorStop(0.55, 'rgba(214,216,224,0.55)');
    grad.addColorStop(1, 'rgba(200,204,214,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.12;
    g.fillStyle = tint; // a hint of the underglow in the smoke
    g.fillRect(0, 0, 64, 64);
    return sprite;
  }

  return {
    pool,
    /**
     * One sim step. `s` is GameState (writes s.smokeLevel and counts s.smokePuffs).
     * `spawn` false (the 3D view keeps its own world-space puffs) still ages existing puffs.
     */
    step(dt, s, particles = 1, spawn = true) {
      pool.update(dt, 1.4, -40);
      const lv = tyreSmokeLevel(s);
      s.smokeLevel = lv;
      if (!spawn) { emit = 0; return; }
      emit += dt * smokeRate(lv, particles, s.reducedMotion);
      const linger = 1.4 - Math.min(1, s.speed / 90);
      while (emit >= 1) {
        emit -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        pool.spawn(s.playerX + side * 0.11, 0, 0, side * (0.05 + Math.random() * 0.18), -(14 + Math.random() * 34) * lv,
          16 + s.speed * (0.35 + Math.random() * 0.35), 0.13 + Math.random() * 0.07, 0.34 + lv * 0.34, 0.55 + Math.random() * 0.45 * linger, 0.42 + lv * 0.3);
        s.smokePuffs++;
      }
    },
    /** Draw over the car: `roadX`/`roadW` are the road centre and half-width at the car (px). */
    draw(ctx, rw, rh, roadX, roadW, tint) {
      if (!pool.alive()) return;
      const img = puff(tint || '#00f0ff');
      const carW = Math.max(58, rw * 0.22);
      const ground = rh * 0.87 - carW * 0.04; // the rear tyres' contact line (src/main.js drawPlayerCar)
      ctx.save();
      for (let i = 0; i < pool.items.length; i++) {
        const p = pool.items[i];
        if (p.life <= 0) continue;
        const r = p.size * carW * (1 + p.z / 140);
        ctx.globalAlpha = p.a * (p.life / p.maxLife) * Math.min(1, (p.maxLife - p.life) * 12);
        ctx.drawImage(img, roadX + p.x * roadW - r, ground + p.z * 0.4 + p.y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
    clear() { pool.clear(); emit = 0; },
  };
}
