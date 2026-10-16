// Game-feel helpers (pillar 2, ticket 0009). Pure, allocation-free per frame, and
// reduced-motion aware: every effect collapses to nothing when the player asks for less motion.

const feel = { lines: 0, fov: 1, shake: 0, aberration: 0 };

/** Speed sensation at a given mph. Returns a shared object — read it, don't keep it. */
export function speedFeel(speedMph, reducedMotion) {
  if (reducedMotion || speedMph < 40) {
    feel.lines = 0; feel.fov = 1; feel.shake = 0; feel.aberration = 0;
    return feel;
  }
  const t = Math.min(1, (speedMph - 40) / 48); // 40 → 88 mph
  const eased = t * t;
  feel.lines = eased;
  feel.fov = 1 + 0.07 * eased;
  feel.shake = 2.2 * eased;
  feel.aberration = t >= 1 ? 1 : 0;
  return feel;
}

/** Fixed-capacity particle pool: spawn() reuses dead slots, never allocates after creation. */
export function createParticlePool(capacity) {
  const items = [];
  for (let i = 0; i < capacity; i++) items.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, hue: 0, size: 2 });
  let cursor = 0;
  return {
    items,
    spawn(x, y, vx, vy, life, hue, size = 2) {
      // Prefer a dead slot; if all are alive, overwrite the oldest-in-rotation.
      let p = null;
      for (let n = 0; n < capacity; n++) {
        const q = items[(cursor + n) % capacity];
        if (q.life <= 0) { p = q; cursor = (cursor + n + 1) % capacity; break; }
      }
      if (!p) { p = items[cursor]; cursor = (cursor + 1) % capacity; }
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.hue = hue; p.size = size;
      return p;
    },
    update(dt, gravity = 600) {
      for (let i = 0; i < capacity; i++) {
        const p = items[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
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

/** A few frames of near-freeze on big moments. scale(dt) → time multiplier for this frame. */
export function createHitStop() {
  let remaining = 0;
  return {
    trigger(seconds, reducedMotion = false) {
      if (!reducedMotion) remaining = Math.max(remaining, seconds);
    },
    scale(dt) {
      if (remaining <= 0) return 1;
      remaining -= dt;
      return 0.08;
    },
    active() { return remaining > 0; },
  };
}

/** Consecutive near-misses within `window` seconds build a multiplier. */
export function nearMissChain(window = 2.5, basePoints = 250) {
  let count = 0;
  let last = -Infinity;
  return {
    hit(now) {
      count = now - last <= window ? count + 1 : 1;
      last = now;
      return count;
    },
    points() { return basePoints * count; },
    count() { return count; },
    reset() { count = 0; last = -Infinity; },
  };
}

/** Calls cb(reduce) now and whenever the OS "reduce motion" setting changes (ticket 0003). */
export function watchReducedMotion(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) { cb(false); return; }
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  cb(mq.matches);
  if (mq.addEventListener) mq.addEventListener('change', (e) => cb(e.matches));
}
