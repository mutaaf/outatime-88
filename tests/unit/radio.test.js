import { describe, it, expect } from 'vitest';
import { RADIO, RADIO_T, radioLine, createRadio, radioEvents, radioReady } from '../../src/radio.js';
import { ROSTER } from '../../src/data.js';
import { priorityFor } from '../../src/announcer.js';

const racer = (crew, progress) => ({ crew, driver: 'X', progress, takenDown: false, finishTime: null });

describe('rival radio lines (0277)', () => {
  it('every crew a rival can race for has at least 3 short, original lines', () => {
    for (const rc of ROSTER) {
      const t = RADIO[rc.franchise];
      expect(t, rc.franchise).toBeTruthy();
      const all = [...t.by, ...t.lost, ...t.down];
      expect(all.length, rc.franchise).toBeGreaterThanOrEqual(3);
      for (const k of ['by', 'lost', 'down']) expect(t[k].length, `${rc.franchise} ${k}`).toBeGreaterThan(0);
      for (const l of all) {
        expect(l.length, l).toBeLessThanOrEqual(23); // one row on a 390 px phone
        expect(l).toBe(l.toUpperCase());
        expect(priorityFor(l), l).toBe(1); // never reads as a warp / takedown banner
      }
    }
    expect(Object.keys(RADIO).length).toBe(new Set(ROSTER.map((r) => r.franchise)).size);
  });

  it('picks the same line for the same seed and count, and spreads over seeds', () => {
    const crew = 'Southside Family';
    expect(radioLine(crew, 'by', 1234, 0)).toBe(radioLine(crew, 'by', 1234, 0));
    const seen = new Set();
    for (let seed = 0; seed < 40; seed++) seen.add(radioLine(crew, 'by', seed, 0));
    expect(seen.size).toBe(RADIO[crew].by.length);
    expect(radioLine('No Such Crew', 'by', 1, 0)).toBeNull();
  });
});

describe('rival radio timing (0277)', () => {
  const start = (racers) => { const s = createRadio(); radioEvents(s, racers, 100, 0); return s; };

  it('a rival passing you speaks once, after the callout delay', () => {
    const r = racer('Chrono Crew', 90);
    const s = start([r]);
    r.progress = 110; radioEvents(s, s.racers, 100, 10);
    expect(s.kind).toBe('by');
    expect(radioReady(s, 10.5, false)).toBeNull(); // the position callout speaks first
    expect(radioReady(s, 10 + RADIO_T.delay, false)).toBe(r);
    expect(radioReady(s, 11, false)).toBeNull(); // once
  });

  it('you passing a rival, and a takedown, are their own events; a respawn is not a pass', () => {
    const r = racer('Chrono Crew', 110);
    const s = start([r]);
    r.progress = 90; radioEvents(s, s.racers, 100, 10);
    expect(s.kind).toBe('lost');
    r.takenDown = true; radioEvents(s, s.racers, 100, 10.1);
    expect(s.kind).toBe('down');
    s.pending = null;
    r.takenDown = false; r.progress = 120; radioEvents(s, s.racers, 100, 16);
    expect(s.pending).toBeNull();
  });

  it('a side-by-side duel inside a car length is not a pass; a warp notes nothing', () => {
    const r = racer('Chrono Crew', 98);
    const s = start([r]);
    for (const p of [101, 99, 103, 97, 104]) { r.progress = p; radioEvents(s, s.racers, 100, 10); }
    expect(s.pending).toBeNull();
    r.progress = 100 + RADIO_T.margin + 1; radioEvents(s, s.racers, 100, 10, true);
    expect(s.pending).toBeNull(); // passed in a warp: quiet…
    r.progress = 99; radioEvents(s, s.racers, 100, 12);
    expect(s.pending).toBeNull(); // …and the side was still tracked, so wobbling back is no pass
    r.progress = 100 - RADIO_T.margin - 1; radioEvents(s, s.racers, 100, 13);
    expect(s.kind).toBe('lost');
  });

  it('nothing counts in the start sequence or after a rival finishes', () => {
    const r = racer('Chrono Crew', 90);
    const s = start([r]);
    r.progress = 110; radioEvents(s, s.racers, 100, RADIO_T.start - 0.1);
    expect(s.pending).toBeNull();
    r.progress = 90; r.finishTime = 50; radioEvents(s, s.racers, 100, 20);
    expect(s.pending).toBeNull();
  });

  it('waits while the channel is busy, drops a stale line, and keeps 6 s between lines', () => {
    const r = racer('Chrono Crew', 90), q = racer('Voss Dynamics', 90);
    const s = start([r, q]);
    r.progress = 110; radioEvents(s, s.racers, 100, 10);
    expect(radioReady(s, 11, true)).toBeNull();
    expect(radioReady(s, 12, false)).toBe(r);
    q.progress = 110; radioEvents(s, s.racers, 100, 14);
    expect(radioReady(s, 15, false)).toBeNull(); // inside the gap: waits
    expect(radioReady(s, 12 + RADIO_T.gap, false)).toBe(q);
    r.progress = 90; radioEvents(s, s.racers, 100, 30);
    expect(radioReady(s, 30 + RADIO_T.stale + 0.1, true)).toBeNull();
    expect(s.pending).toBeNull(); // dropped, never shown late
  });

  it('a new race (new racers array) resets without speaking', () => {
    const s = start([racer('Chrono Crew', 90)]);
    s.last = 5; s.n = 3;
    radioEvents(s, [racer('Chrono Crew', 120)], 100, 0);
    expect(s.pending).toBeNull();
    expect(s.n).toBe(0);
  });
});
