import { describe, it, expect } from 'vitest';
import { createHud } from '../../src/hud.js';

/** A tiny DOM stand-in that counts writes, so we can prove the HUD only writes on change. */
function fakeDoc() {
  const writes = { n: 0 };
  const node = (id) => {
    let text = '';
    const cls = new Set();
    const style = new Proxy({ setProperty() {} }, { set(t, k, v) { writes.n++; t[k] = v; return true; } });
    return {
      id, dataset: new Proxy({}, { set(t, k, v) { writes.n++; t[k] = v; return true; } }), style, children: [], title: '', className: '',
      get textContent() { return text; },
      set textContent(v) { writes.n++; text = v; if (v === '') this.children.length = 0; },
      classList: { toggle(c, on) { writes.n++; if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) },
      appendChild(c) { this.children.push(c); },
    };
  };
  const nodes = new Map();
  return {
    writes,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node(id)); return nodes.get(id); },
    createElement() { return node(''); },
  };
}

const view = (over = {}) => ({
  position: 4, total: 6, progress: 1200, length: 6500, raceTime: 12.34, timeLeft: 35.2, clockUrgent: false,
  infinite: false, mph: 100, flux: 40, hpFrac: 0.8, score: 12345,
  field: [
    { id: 'a', short: 'KAI', progress: 1500, color: '#f00' },
    { id: 'b', short: 'DEZ', progress: 1400, color: '#0f0' },
    { id: 'c', short: 'RIN', progress: 1310, color: '#00f' },
    { id: 'YOU', short: 'YOU', progress: 1200, isPlayer: true },
    { id: 'd', short: 'VEX', progress: 1100, color: '#ff0' },
    { id: 'e', short: 'CAL', progress: 900, color: '#0ff' },
  ],
  ...over,
});

describe('race HUD (ticket 0051)', () => {
  it('shows position, lap, time, clock, gaps, speed and one dot per racer', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view());
    const t = (id) => doc.getElementById(id).textContent;
    expect(t('hudPos')).toBe('4TH');
    expect(t('hudPosOf')).toBe('/6');
    expect(t('hudLap')).toBe('LAP 1/3');
    expect(t('hudTime')).toBe('0:12.3');
    expect(t('hudClock')).toBe('36');
    expect(t('hudGapAhead')).toBe('▲ RIN +1.1s');
    expect(t('hudGapBehind')).toBe('▼ VEX −1.0s');
    expect(t('hudSpeed')).toBe('100');
    expect(doc.getElementById('hudDots').children).toHaveLength(6);
    expect(doc.getElementById('hudSpeedCard').classList.contains('is-88')).toBe(true);
  });

  it('says FINAL LAP on the last lap, LEADING in first, and lap-free distance in endless', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ progress: 5000, position: 1, field: [{ id: 'YOU', short: 'YOU', progress: 5000, isPlayer: true }, { id: 'a', short: 'KAI', progress: 4000 }] }));
    expect(doc.getElementById('hudLap').textContent).toBe('FINAL LAP');
    expect(doc.getElementById('hudGapAhead').textContent).toBe('★ LEADING');
    expect(doc.getElementById('hudPosCard').dataset.place).toBe('p1');
    hud.update(view({ infinite: true, progress: 2500 }));
    expect(doc.getElementById('hudLap').textContent).toMatch(/2,?500 m/);
    expect(doc.getElementById('hudClockWrap').classList.contains('hidden')).toBe(true);
  });

  it('writes nothing to the DOM when nothing changed (no per-frame churn)', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view());
    const after = doc.writes.n;
    hud.update(view());
    hud.update(view());
    expect(doc.writes.n).toBe(after);
    hud.update(view({ mph: 101 }));
    expect(doc.writes.n).toBeGreaterThan(after);
  });
});

describe('score readout', () => {
  it('labels the score as points and marks a negative one, so it never reads as flux', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ score: -4877 }));
    const el = doc.getElementById('hudScore');
    expect(el.textContent).toBe(`${(-4877).toLocaleString()} PTS`);
    expect(el.classList.contains('is-neg')).toBe(true);
    hud.update(view({ score: 12345 }));
    expect(el.textContent).toBe(`${(12345).toLocaleString()} PTS`);
    expect(el.classList.contains('is-neg')).toBe(false);
  });
});
