// Friends 10x: quick-chat packing, crew memory, gap labels and the series score.
import { describe, it, expect } from 'vitest';
import { EMOTES, EMOTE_GAP_MS, EMOTE_HOLD_MS, packEmote, unpackEmote, createEmoteSender, createEmoteReader } from '../../src/live/emotes.js';
import { loadCrew, saveCrew, crewLabel, CREW_FRESH_MS, CREW_KEEP_MS } from '../../src/live/crew.js';
import { gapText, seriesScore } from '../../src/live/controller.js';
import { cleanFrame } from '../../src/worker/live-rules.js';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('emotes ride the state frame flags', () => {
  it('packs into bits 2–6 and leaves warp/drift (bits 0–1) alone', () => {
    for (let flags = 0; flags < 4; flags++) {
      for (let id = 1; id < EMOTES.length; id++) {
        for (let seq = 0; seq < 4; seq++) {
          const f = packEmote(flags, id, seq);
          expect(f & 3).toBe(flags);
          expect(f).toBeLessThan(256);
          expect(unpackEmote(f).id).toBe(id);
        }
      }
      expect(unpackEmote(packEmote(flags, 0, 0))).toEqual({ id: 0, key: 0 });
    }
  });

  it('survives the server frame filter unchanged', () => {
    const f = packEmote(3, 7, 3);
    expect(cleanFrame([100, 0, 0, 80, f], 5000)[4]).toBe(f);
  });

  it('only kid-safe presets exist: emoji + a short label, no free text', () => {
    expect(EMOTES[0]).toBeNull();
    expect(EMOTES.length).toBe(8); // 3 bits
    for (const e of EMOTES.slice(1)) {
      expect(e.e.length).toBeLessThanOrEqual(4);
      expect(e.label).toMatch(/^[A-Z !]{2,10}$/);
    }
  });

  it('sender holds an emote for a moment and rate-limits spam', () => {
    const s = createEmoteSender();
    expect(s.send(2, 1000)).toBe(true);
    expect(unpackEmote(s.flags(1, 1000)).id).toBe(2);
    expect(s.flags(1, 1000) & 3).toBe(1);
    expect(unpackEmote(s.flags(0, 1000 + EMOTE_HOLD_MS + 1)).id).toBe(0);
    expect(s.send(3, 1000 + EMOTE_GAP_MS - 1)).toBe(false);
    expect(s.send(3, 1000 + EMOTE_GAP_MS)).toBe(true);
    expect(s.send(99, 99999)).toBe(false);
  });

  it('reader fires once per emote, and again for a repeat of the same emote', () => {
    const s = createEmoteSender();
    const r = createEmoteReader();
    s.send(4, 0);
    const a = s.flags(0, 0);
    expect(r.read(1, a)).toBe(4);
    expect(r.read(1, a)).toBe(0);          // the same emote in the next 11 frames
    expect(r.read(1, s.flags(0, 100))).toBe(0);
    s.send(4, EMOTE_GAP_MS + 10);          // same emote again: new counter
    expect(r.read(1, s.flags(0, EMOTE_GAP_MS + 10))).toBe(4);
    expect(r.read(2, a)).toBe(4);          // per sender
  });
});

describe('crew memory (RACE AGAIN)', () => {
  const room = (players, extra = {}) => ({ code: 'GMPP', public: false, race: 2, players, ...extra });

  it('remembers the room and the other racers’ initials only', () => {
    const st = memStore();
    saveCrew(room([{ id: 'a', name: 'SKY', pub: 'p1' }, { id: 'b', name: 'RAD', pub: 'p2' }]), 'a', 1000, st);
    const c = loadCrew(2000, st);
    expect(c).toMatchObject({ code: 'GMPP', names: ['RAD'], fresh: true, races: 2 });
    expect(st.getItem('outatime_live_crew_v1')).not.toMatch(/p1|p2/);
  });

  it('keeps the crew when they leave before you', () => {
    const st = memStore();
    saveCrew(room([{ id: 'a', name: 'SKY' }, { id: 'b', name: 'RAD' }]), 'a', 1000, st);
    saveCrew(room([{ id: 'a', name: 'SKY' }]), 'a', 2000, st);
    expect(loadCrew(3000, st).names).toEqual(['RAD']);
  });

  it('never remembers quick races, goes stale, then expires', () => {
    const st = memStore();
    saveCrew(room([{ id: 'a', name: 'SKY' }, { id: 'b', name: 'RAD' }], { public: true }), 'a', 0, st);
    expect(loadCrew(1, st)).toBeNull();
    saveCrew(room([{ id: 'a', name: 'SKY' }, { id: 'b', name: 'RAD' }]), 'a', 0, st);
    expect(loadCrew(CREW_FRESH_MS + 1, st).fresh).toBe(false);
    expect(loadCrew(CREW_KEEP_MS + 1, st)).toBeNull();
  });

  it('survives junk in storage', () => {
    const st = memStore();
    st.setItem('outatime_live_crew_v1', '{nope');
    expect(loadCrew(0, st)).toBeNull();
  });

  it('labels the crew like a person would', () => {
    expect(crewLabel([])).toBe('just you');
    expect(crewLabel(['RAD'])).toBe('RAD');
    expect(crewLabel(['RAD', 'ZAP', 'SKY'])).toBe('RAD, ZAP & SKY');
  });
});

describe('boards', () => {
  it('gap labels are seconds at the chaser’s pace', () => {
    expect(gapText(85, 85)).toBe('+1.0s');
    expect(gapText(-42.5, 85)).toBe('-0.5s');
    expect(gapText(1200, 80)).toBe('+15s');
    expect(gapText(30, 0)).toBe('+1.0s'); // stopped: assume a crawl, not a divide by zero
  });

  it('series score lists winners, best first, and marks you', () => {
    const players = [{ id: 'a', name: 'SKY', wins: 1 }, { id: 'b', name: 'RAD', wins: 3 }, { id: 'c', name: 'ZAP', wins: 0 }];
    expect(seriesScore(players, 'a')).toEqual([{ name: 'RAD', wins: 3, you: false }, { name: 'SKY', wins: 1, you: true }]);
  });
});
