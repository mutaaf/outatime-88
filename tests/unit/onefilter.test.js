import { describe, it, expect } from 'vitest';
import { createOneEuro } from '../../src/onefilter.js';

// A deterministic 60 Hz "phone": noise plus a 9 Hz hand tremor around a held angle.
function sensor(seed = 3) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return (t) => (rnd() - 0.5) * 1.6 + 0.3 * Math.sin(2 * Math.PI * 9 * t / 1000);
}
const rms = (a) => Math.sqrt(a.reduce((x, v) => x + v * v, 0) / a.length);

describe('One Euro filter (ticket 0183)', () => {
  it('passes the first sample straight through and holds on a stalled clock', () => {
    const f = createOneEuro();
    expect(f.filter(5, 100)).toBe(5);
    expect(f.filter(9, 100)).toBe(5);
  });

  it('cuts jitter while the phone is held still', () => {
    const f = createOneEuro({ minCutoff: 0.8, beta: 0.5 });
    const noise = sensor();
    const raw = [], out = [];
    for (let i = 0; i < 180; i++) {
      const t = i * 1000 / 60, v = 6 + noise(t);
      const y = f.filter(v, t);
      if (i > 30) { raw.push(v - 6); out.push(y - 6); }
    }
    expect(rms(out)).toBeLessThan(rms(raw) / 2);
  });

  it('follows a quick swerve with no more than a sample of lag', () => {
    const f = createOneEuro({ minCutoff: 0.8, beta: 0.5 });
    let t = 0;
    for (let i = 0; i < 60; i++) f.filter(0, (t = i * 1000 / 60));
    // 0 → 18° in 120 ms, then held.
    let reached = null;
    for (let i = 1; i <= 30; i++) {
      const tt = t + i * 1000 / 60;
      const y = f.filter(Math.min(18, 18 * (i * 1000 / 60) / 120), tt);
      if (reached == null && y >= 18 * 0.9) reached = tt - t;
    }
    expect(reached).not.toBeNull();
    expect(reached).toBeLessThanOrEqual(120 + 2 * 1000 / 60);
  });

  it('takes a jump bigger than `snap` as is (a swerve, or a sparse event stream)', () => {
    const f = createOneEuro({ minCutoff: 0.8, beta: 0.5, snap: 6 });
    f.filter(14, 0); f.filter(14, 40);
    expect(f.filter(-14, 80)).toBe(-14);
    expect(f.filter(-13.5, 96)).toBeGreaterThan(-14); // small moves are filtered again
  });

  it('reset starts over', () => {
    const f = createOneEuro();
    f.filter(10, 0); f.filter(10, 16);
    f.reset();
    expect(f.value).toBe(0);
    expect(f.filter(-4, 32)).toBe(-4);
  });
});
