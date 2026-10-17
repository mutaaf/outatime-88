// Era backdrops (ticket 0100): quality tiers and the shared era palette table.
import { describe, it, expect, afterEach } from 'vitest';
import { getQuality, setQualitySource, tier, TIERS } from '../../src/scenes/quality.js';
import { ERA_PALETTES } from '../../src/era-palettes.js';
import { ERAS } from '../../src/data.js';

afterEach(() => setQualitySource(null));

describe('backdrop quality tiers', () => {
  it("defaults to 'high' until a capability source is plugged in", () => {
    expect(getQuality()).toBe('high');
    expect(tier()).toBe(TIERS.high);
  });
  it('reads the plugged-in source, and ignores unknown tiers', () => {
    setQualitySource(() => 'low');
    expect(tier()).toEqual({ layers: 2, detail: 0.35, weather: false, scale: 0.6 });
    setQualitySource(() => 'potato');
    expect(getQuality()).toBe('high');
  });
  it('costs only go down from ultra to low', () => {
    const order = ['ultra', 'high', 'medium', 'low'];
    for (let i = 1; i < order.length; i++) {
      const a = TIERS[order[i - 1]], b = TIERS[order[i]];
      expect(b.layers).toBeLessThanOrEqual(a.layers);
      expect(b.detail).toBeLessThanOrEqual(a.detail);
      expect(b.scale).toBeLessThanOrEqual(a.scale);
      expect(Number(b.weather)).toBeLessThanOrEqual(Number(a.weather));
    }
  });
});

describe('era palettes (shared by the 2D scenes and the 3D view)', () => {
  it('cover every era with sky, horizon, fog, sun and ground', () => {
    expect(Object.keys(ERA_PALETTES).sort()).toEqual(ERAS.map((e) => e.id).sort());
    for (const [id, p] of Object.entries(ERA_PALETTES)) {
      expect(p.sky.length, id).toBeGreaterThanOrEqual(3);
      expect(p.ground.length, id).toBeGreaterThanOrEqual(2);
      for (const k of ['horizon', 'fog', 'sun']) expect(p[k], `${id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('1955 is the bright daytime era (the era e2e relies on it)', () => {
    const lum = (hex) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(ERA_PALETTES[1955].sky[0])).toBeGreaterThan(lum(ERA_PALETTES[2026].sky[0]) + 150);
  });
});
