// 3D surfaces (ticket 0041): every era has a palette the 3D view can light with.
import { describe, it, expect } from 'vitest';
import { ERAS } from '../../src/data.js';
import { paletteFor } from '../../src/render3d/surfaces.js';

describe('paletteFor', () => {
  it('every era resolves to a full palette (sky, fog, sun, ground)', () => {
    for (const era of ERAS) {
      const p = paletteFor(era);
      for (const k of ['top', 'mid', 'horizon', 'fog', 'sun', 'ground']) expect(p[k]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('rain eras are wet, the 1955 square is daylight, unknown eras fall back', () => {
    expect(paletteFor({ id: '2026' }).wet).toBe(true);
    expect(paletteFor({ id: '1955' }).bright).toBe(true);
    expect(paletteFor({ id: 'nope' }).top).toBe(paletteFor({ id: '2026' }).top);
  });
});
