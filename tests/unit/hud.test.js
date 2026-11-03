import { describe, it, expect } from 'vitest';
import { createHud as hudFor, scoreText } from '../../src/hud.js';
import { stripMarks } from '../../src/strip-marks.js';

const createHud = (doc) => hudFor(doc, stripMarks);
import { breakdown, createPenaltyLog, logHit, penaltyPoints } from '../../src/scoring.js';

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
  it('labels the score as points, so it never reads as flux', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ score: 12345 }));
    const el = doc.getElementById('hudScore');
    expect(el.textContent).toBe(`${(12345).toLocaleString()} PTS`);
    expect(el.classList.contains('is-pen')).toBe(false);
  });

  // Ticket 0199: penalties can push the running total below zero, but the final score is
  // max(0, earned − penalty), so the pill shows 0 with a PENALTY tag and never a minus sign.
  it('shows 0 PTS with the penalty tag when penalties outweigh what was earned', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ score: -23516 }));
    const el = doc.getElementById('hudScore');
    expect(el.textContent).toBe('0 PTS');
    expect(el.textContent).not.toMatch(/[-−]/);
    expect(el.classList.contains('is-pen')).toBe(true);
    hud.update(view({ score: 500 }));
    expect(el.textContent).toBe(`${(500).toLocaleString()} PTS`);
    expect(el.classList.contains('is-pen')).toBe(false);
  });
});

describe('scoreText (ticket 0199)', () => {
  it('clamps at zero and rounds the way the final score does', () => {
    expect(scoreText(-23516)).toBe('0 PTS');
    expect(scoreText(-0.4)).toBe('0 PTS');
    expect(scoreText(0)).toBe('0 PTS');
    expect(scoreText(1234567.6)).toBe(`${(1234568).toLocaleString()} PTS`);
    expect(scoreText(NaN)).toBe('0 PTS');
  });

  it('equals the results card final score for the same run', () => {
    const log = createPenaltyLog();
    logHit(log, 'traffic', 120);
    logHit(log, 'obstacle', 90);
    for (const live of [-30000.7, -0.6, 0, 812.5, 99999.4]) {
      const final = breakdown(Math.round(live) + penaltyPoints(log), log).final;
      expect(scoreText(live)).toBe(`${final.toLocaleString()} PTS`);
    }
  });

  it('a fraction of a point below zero is not a penalty', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ score: -0.4 }));
    const el = doc.getElementById('hudScore');
    expect(el.textContent).toBe('0 PTS');
    expect(el.classList.contains('is-pen')).toBe(false);
  });
});

// Ticket 0190: on a phone in portrait the times column is ~60–90 px wide, so the gap pills
// drop the rival's initials (the track strip's dots say who) and keep the seconds whole.
describe('compact gap pills on phones (ticket 0190)', () => {
  it('shows only the arrow and the seconds when compact, initials when wide', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ compact: true }));
    expect(doc.getElementById('hudGapAhead').textContent).toBe('▲ +1.1s');
    expect(doc.getElementById('hudGapBehind').textContent).toBe('▼ −1.0s');
    hud.update(view({ compact: false }));
    expect(doc.getElementById('hudGapAhead').textContent).toBe('▲ RIN +1.1s');
    expect(doc.getElementById('hudGapBehind').textContent).toBe('▼ VEX −1.0s');
  });

  it('stays short in the worst case: a nemesis a minute away, or leading', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view({ compact: true, mph: 30, position: 2, field: [
      { id: 'c', short: 'RIN', progress: 1200 + 30 * 65.3, nemesis: true },
      { id: 'YOU', short: 'YOU', progress: 1200, isPlayer: true },
    ] }));
    const ahead = doc.getElementById('hudGapAhead').textContent;
    expect(ahead).toBe('▲ 😈+1:05.3');
    expect([...ahead].length).toBeLessThanOrEqual(10);
    hud.update(view({ compact: true, position: 1, field: [{ id: 'YOU', short: 'YOU', progress: 5000, isPlayer: true }, { id: 'a', short: 'KAI', progress: 4000 }] }));
    expect(doc.getElementById('hudGapAhead').textContent).toBe('★ LEAD');
  });
});

// Ticket 0167: the track strip must say who is who without colour. Each rival's marker carries
// the shortest start of its name no other rival shares (two letters at most), and the cars
// directly ahead and behind are tagged so the ▲/▼ gap pills point at a marker.
describe('track strip markers (ticket 0167)', () => {
  it('stripMarks: one letter when it is unique, two when the first is shared, never a repeat', () => {
    expect(stripMarks(['KAI', 'DEZ', 'RIN', 'VEX', 'CAL'])).toEqual(['K', 'D', 'R', 'V', 'C']);
    expect(stripMarks(['KAI', 'KIRA', 'DEZ'])).toEqual(['KA', 'KI', 'D']);
    // Two letters still shared (or the same name twice in a live room): initial + slot number.
    const dup = stripMarks(['MAX', 'MAX', 'MAE', 'ZED']);
    expect(dup).toEqual(['M1', 'M2', 'M3', 'Z']);
    expect(stripMarks(['THE', 'KAI', 'THE'])).toEqual(['T1', 'K', 'T2']); // two roster drivers called "The …"
    expect(new Set(dup).size).toBe(4);
    for (const m of dup) expect(m.length).toBeLessThanOrEqual(2);
    expect(stripMarks([])).toEqual([]);
    const odd = stripMarks(['', undefined, 'A']);
    expect(new Set(odd).size).toBe(3);
  });

  it('every rival marker shows a unique label, YOU stays YOU, and ahead/behind are tagged', () => {
    const doc = fakeDoc();
    const hud = createHud(doc);
    hud.update(view());
    const dots = doc.getElementById('hudDots').children;
    const labels = dots.map((d) => d.textContent);
    expect(labels).toEqual(['K', 'D', 'R', 'YOU', 'V', 'C']);
    expect(dots[2].dataset.near).toBe('ahead'); // RIN, directly ahead of you in 4th
    expect(dots[4].dataset.near).toBe('behind'); // VEX
    expect(dots[0].dataset.near || '').toBe('');
    // You pass RIN: the tags move with the standings, and only the changed markers are written.
    const before = doc.writes.n;
    hud.update(view());
    expect(doc.writes.n).toBe(before);
    hud.update(view({ position: 3, field: [view().field[0], view().field[1], view().field[3], view().field[2], view().field[4], view().field[5]] }));
    expect(dots[1].dataset.near).toBe('ahead'); // DEZ
    expect(dots[2].dataset.near).toBe('behind'); // RIN
    expect(dots[4].dataset.near).toBe('');
  });
});
