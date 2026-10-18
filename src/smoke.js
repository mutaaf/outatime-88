// Tyre smoke and squeal (ticket 0133). Pure: no DOM, no allocation after a pool is created.
//
// One number says how hard the rear tyres are working past their grip, from the drivetrain's
// wheelspin (src/drivetrain.js `spin`), the handling model's lateral slip and power drifts
// (src/handling.js), hard braking at speed and grinding along a wall. The 2D view, the 3D view
// and the audio all read it, so what you see smoke is what you hear squeal.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How much smoke the rear tyres make right now, 0..1. `s` is GameState-shaped:
 * { wheelSpin, tyreSlip, isDrifting, braking, speed, playerY, wallGrind, status }.
 */
export function tyreSmokeLevel(s) {
  if (!s || s.status !== 'PLAYING' || (s.playerY || 0) > 4) return 0;
  const spin = clamp01((s.wheelSpin || 0) * 1.6);
  const slip = s.tyreSlip || 0;
  const slide = s.isDrifting ? 0.5 + clamp01(slip) * 0.5 : clamp01((slip - 0.25) * 1.4);
  const lock = s.braking && s.speed > 55 ? Math.min(0.45, (s.speed - 55) / 80) : 0;
  const grind = s.wallGrind && s.speed > 20 ? 0.55 : 0;
  return Math.max(spin, slide, lock, grind);
}

/** How loud the squeal is, 0..1: spin and slides squeal, a wall grind scrubs instead. */
export function screechLevel(s) {
  if (!s || s.status !== 'PLAYING' || (s.playerY || 0) > 4 || s.speed < 6) return 0;
  const spin = clamp01((s.wheelSpin || 0) * 1.4);
  const slip = s.tyreSlip || 0;
  const slide = s.isDrifting ? 0.45 + clamp01(slip) * 0.55 : clamp01((slip - 0.3) * 1.5);
  const lock = s.braking && s.speed > 60 ? Math.min(0.35, (s.speed - 60) / 90) : 0;
  return Math.max(spin, slide, lock);
}

/**
 * A squeal gate with hysteresis, so a level hovering at the threshold doesn't chatter:
 * on above `on`, off below `off`; returns the gain target (0 when gated off).
 */
export function createScreechGate(on = 0.16, off = 0.08) {
  const g = { open: false };
  g.step = (level) => {
    if (g.open ? level < off : level > on) g.open = !g.open;
    return g.open ? level : 0;
  };
  return g;
}

/**
 * Fixed-capacity smoke pool. Puffs carry position, velocity, size and growth in whatever
 * space the caller uses (2D: road-canvas pixels around the car; 3D: world units).
 */
export function createSmokePool(capacity) {
  const items = [];
  for (let i = 0; i < capacity; i++) items.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, life: 0, maxLife: 1, a: 1 });
  let cursor = 0;
  return {
    items,
    capacity,
    /** Reuse the next dead slot (or the oldest in rotation when all are alive). */
    spawn(x, y, z, vx, vy, vz, size, grow, life, a = 1) {
      let p = null;
      for (let n = 0; n < capacity; n++) {
        const q = items[(cursor + n) % capacity];
        if (q.life <= 0) { p = q; cursor = (cursor + n + 1) % capacity; break; }
      }
      if (!p) { p = items[cursor]; cursor = (cursor + 1) % capacity; }
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
      p.size = size; p.grow = grow; p.life = life; p.maxLife = life; p.a = a;
      return p;
    },
    /** Advance: drag slows puffs, they grow as they spread, `rise` lifts them (per second). */
    update(dt, drag = 1.6, rise = 0) {
      const k = Math.exp(-drag * dt);
      for (let i = 0; i < capacity; i++) {
        const p = items[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vx *= k; p.vy = p.vy * k + rise * dt; p.vz *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.size += p.grow * dt;
      }
    },
    alive() {
      let n = 0;
      for (let i = 0; i < capacity; i++) if (items[i].life > 0) n++;
      return n;
    },
    clear() { for (let i = 0; i < capacity; i++) items[i].life = 0; },
  };
}

/** Puffs per second at a smoke level, scaled by the graphics tier's particle budget. */
export function smokeRate(level, particles = 1, reduced = false) {
  if (level <= 0.04) return 0;
  return level * 64 * Math.max(0.25, particles) * (reduced ? 0.35 : 1);
}
