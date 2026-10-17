import { describe, it, expect } from 'vitest';
import { encodeGhost, decodeGhost, ghostAt, GHOST } from '../../src/ghost-codec.js';

describe('ghost codec', () => {
  const samples = Array.from({ length: 700 }, (_, i) => ({ d: i * 17.3 + Math.sin(i) * 2 + 20, x: Math.sin(i / 9) * 0.7 }));
  it('round-trips within quantisation and stays small', () => {
    const text = encodeGhost(samples);
    expect(text.length).toBeLessThan(3000);
    const g = decodeGhost(text);
    expect(g.d.length).toBe(700);
    for (let i = 0; i < 700; i += 37) {
      expect(Math.abs(g.d[i] - samples[i].d)).toBeLessThan(0.1);
      expect(Math.abs(g.x[i] - samples[i].x)).toBeLessThan(0.01);
    }
  });
  it('rejects junk and oversize input', () => {
    expect(decodeGhost('abc!')).toBeNull();
    expect(decodeGhost('x'.repeat(GHOST.maxChars + 1))).toBeNull();
    expect(decodeGhost(encodeGhost([]).slice(0, 1))).toBeNull();
  });
  it('interpolates position over time and holds at the end', () => {
    const g = decodeGhost(encodeGhost([{ d: 10, x: 0 }, { d: 20, x: 0.72 }]));
    expect(ghostAt(g, 0).d).toBe(0);
    expect(ghostAt(g, 0.1).d).toBeCloseTo(5, 1);
    expect(ghostAt(g, 0.3).d).toBeCloseTo(15, 1);
    expect(ghostAt(g, 0.3).x).toBeCloseTo(0.36, 2);
    expect(ghostAt(g, 5)).toMatchObject({ d: 20, done: true });
  });
});
