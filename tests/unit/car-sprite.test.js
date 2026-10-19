import { describe, it, expect, beforeEach, vi } from 'vitest';
import { carSprite, clearSpriteCache, spriteStats, cacheSize, CACHE_MAX, yawStep, bucketFor, YAW_STEPS } from '../../src/car-sprite.js';
import { POP_CULTURE_ROSTER } from '../../src/data.js';

// A canvas stand-in: every 2D call is a no-op that records how many paths were filled.
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.fills = 0; }
  getContext() {
    const c = this;
    return new Proxy({}, {
      get(_, k) {
        if (k === 'fill') return () => { c.fills++; };
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set() { return true; },
    });
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  clearSpriteCache();
});

const look = (c) => ({ shape: c.shape, body: c.body, cabin: c.cabin, glow: c.glow });

describe('car sprites', () => {
  it('draws each roster car from its own model, once per size, yaw and wheel state', () => {
    const van = look(POP_CULTURE_ROSTER.find((c) => c.shape === 'HEAVY_VAN'));
    const a = carSprite(van, 100, { yaw: 0 });
    expect(a.fills).toBeGreaterThan(5);
    expect(carSprite(van, 100, { yaw: 0 })).toBe(a);        // cache hit
    expect(carSprite(van, 98, { yaw: 0.01 })).toBe(a);      // same bucket and yaw step
    expect(carSprite(van, 100, { yaw: 0.4 })).not.toBe(a);  // a different yaw is a different view
    expect(carSprite(van, 100, { yaw: 0, hover: true })).not.toBe(a);
    expect(spriteStats.built).toBe(3);
    expect(spriteStats.hits).toBe(2);
  });

  it('different cars never share a sprite', () => {
    const seen = new Set();
    for (const c of POP_CULTURE_ROSTER) seen.add(carSprite(look(c), 120));
    expect(seen.size).toBe(POP_CULTURE_ROSTER.length);
  });

  it('the cache is bounded however long you race', () => {
    for (let i = 0; i < 2000; i++) {
      const c = POP_CULTURE_ROSTER[i % POP_CULTURE_ROSTER.length];
      carSprite(look(c), 24 + (i * 7) % 400, { yaw: ((i % 29) - 14) / 20 });
    }
    expect(cacheSize()).toBeLessThanOrEqual(CACHE_MAX);
  });

  it('quantises yaw and width', () => {
    expect(yawStep(0)).toBe((YAW_STEPS - 1) / 2);
    expect(yawStep(-5)).toBe(0);
    expect(yawStep(5)).toBe(YAW_STEPS - 1);
    expect(bucketFor(1)).toBe(24);
    expect(bucketFor(25)).toBe(32);
    expect(bucketFor(1e6)).toBe(480);
  });
});

describe('frame budget', () => {
  it('a car growing on screen reuses its largest sprite until it outgrows it, and paints at most one new sprite a frame', async () => {
    const { beginFrame } = await import('../../src/car-sprite.js');
    const van = { shape: 'HEAVY_VAN', body: '#fff', cabin: '#000' };
    beginFrame();
    const big = carSprite(van, 200, { yaw: 0 });
    beginFrame();
    expect(carSprite(van, 100, { yaw: 0 })).toBe(big);   // drawn down from the bigger one
    expect(carSprite(van, 250, { yaw: 0 })).toBe(big);
    expect(spriteStats.built).toBe(1);
    beginFrame();
    const bigger = carSprite(van, 480, { yaw: 0 });       // outgrew it: one fresh paint
    expect(bigger).not.toBe(big);
    expect(carSprite(van, 480, { yaw: 0.5 })).toBe(bigger); // over budget this frame: stand-in
    expect(spriteStats.built).toBe(2);
    beginFrame();
    expect(carSprite(van, 480, { yaw: 0.5 })).not.toBe(bigger); // next frame it gets its own view
  });
});

describe('car painter + thrust anchors (workstream J)', () => {
  it('every body, roster and traffic, paints with real detail and remembers its exhaust tips', async () => {
    const { shapeOf } = await import('../../src/car-shapes.js');
    for (const shape of ['GULLWING', 'MUSCLE', 'TUNER_WING', 'SCANNER', 'ROCKET', 'HEAVY_VAN', 'LIGHTCYCLE', 'ROADSTER', 'SEDAN', 'TAXI', 'SUV', 'SEMI_TRUCK']) {
      const spr = carSprite({ shape, body: '#c8102e', cabin: '#111827', glow: '#38e8ff' }, 200, { yaw: 0.2 });
      expect(spr.fills, shape).toBeGreaterThan(40);               // smooth lofted bodywork, not a few boxes
      expect(spr.tipN, shape).toBe(shapeOf(shape).exhaust.length); // one anchor per tip
      expect(spr.gy).toBeGreaterThan(0);
      expect(spr.gy).toBeLessThan(spr.height);
    }
  });

  it('drawCarAt hands back anchors in screen space, and drawThrust uses them', async () => {
    const { drawCarAt, createThrust, drawThrust } = await import('../../src/car-sprite.js');
    const ctx = new FakeCanvas(10, 10).getContext();
    const out = createThrust();
    drawCarAt(ctx, { shape: 'MUSCLE', body: '#111827', cabin: '#475569' }, 500, 400, 100, { yaw: 0 }, out);
    expect(out.n).toBe(4);
    for (let i = 0; i < out.n; i++) {
      expect(out.x[i]).toBeGreaterThan(400); expect(out.x[i]).toBeLessThan(600);
      expect(out.y[i]).toBeGreaterThan(300); expect(out.y[i]).toBeLessThan(420);
    }
    // Symmetric twin pairs about the car's centre when it points straight ahead.
    expect(out.x[0] + out.x[3]).toBeCloseTo(1000, 0);
    drawCarAt(ctx, { shape: 'ROADSTER', body: '#c8102e', cabin: '#111827' }, 500, 400, 100, { yaw: 0 }, out);
    expect(out.kind).toBe('cold'); // electric: cold-gas puffs, never fire
    expect(() => drawThrust(ctx, out, { nos: 1, plume: 1, t: 1 })).not.toThrow();
  });

  it('positive yaw points the nose right (the side you steer to): the tail swings left', () => {
    const mean = (spr) => Array.from(spr.tipX).reduce((a, b) => a + b, 0) / spr.tipN;
    const look2 = { shape: 'MUSCLE', body: '#111827', cabin: '#475569' };
    const straight = carSprite(look2, 200, { yaw: 0 }), right = carSprite(look2, 200, { yaw: 0.6 }), left = carSprite(look2, 200, { yaw: -0.6 });
    expect(mean(straight)).toBeCloseTo(straight.width / 2, 0);
    expect(mean(right)).toBeLessThan(right.width / 2 - 10);
    expect(mean(left)).toBeGreaterThan(left.width / 2 + 10);
  });
});
