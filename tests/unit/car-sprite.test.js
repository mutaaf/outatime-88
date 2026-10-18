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
    expect(bucketFor(25)).toBe(48);
    expect(bucketFor(1e6)).toBe(480);
  });
});
