// The QR encoder (ticket 0090) must produce codes a real decoder reads back exactly.
import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { qrMatrix } from '../../src/qr.js';

function decode(text) {
  const m = qrMatrix(text);
  const scale = 4, quiet = 4;
  const n = (m.length + quiet * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  m.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * n + (x + quiet) * scale + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }));
  return { size: m.length, text: jsQR(px, n, n)?.data };
}

describe('qr encoder', () => {
  it('round-trips game links of every length we use', () => {
    const cases = [
      'https://mutaafaziz.com/outatime/?link=AB3DEF',
      'https://mutaafaziz.com/outatime/?room=QXZT',
      `https://mutaafaziz.com/outatime/?track=2&beat=1234567&by=CLD&from=abcdefghijkl&day=2026-10-17`,
      'x',
      'https://mutaafaziz.com/outatime/?' + 'q'.repeat(150),
    ];
    for (const text of cases) expect(decode(text).text).toBe(text);
  });
  it('picks the smallest version that fits', () => {
    expect(decode('HI').size).toBe(21);
    expect(decode('https://mutaafaziz.com/outatime/?link=AB3DEF').size).toBe(33); // version 4
  });
  it('refuses text that does not fit version 10', () => {
    expect(() => qrMatrix('x'.repeat(400))).toThrow(/too long/);
  });
});
