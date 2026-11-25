// Two more daily twists (0305): OPEN ROAD and COLD START join the draw only from TWISTS_V2_FROM,
// so every daily before the cut-over keeps its road and its twist (the 0155 rule).
import { describe, it, expect } from 'vitest';
import { dailySpec, mulberry32, seedFor, MODIFIERS, TWISTS_V2_FROM } from '../../src/daily.js';

const dayAt = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY = 864e5;

// level index + modifier index for 2025-10-28 .. 2026-12-01, taken from the four-twist code.
const BEFORE = '33304322034111123042431211211203102143213123102031322021214210020023120021404111414313312013421203001330303310004102400211323202423213323243011123312221024223403201012010104121003130202241333243404201224342032003112221412343013341021132004100421320324332230200003303114300204132000203312323402131403111023140010233401120402310301212333130322223223203232212200310313023330243410340112220330333111110320302031103402201023341321242023111421221230111001121000303222042231023234330414220201202333202023000220111402032211300433012101322420320023221112313122042321111422003033303133221212201130031410113032102301030312240034300000200111203203023313030314312022333320320012222434112233120214340333021122031431223434340402003103323222130400012022343014220000032222141213012233110202003004042403030421201332133';

describe('daily twists v2 (0305)', () => {
  it('cuts over a few days after it ships, on a fixed UTC date', () => {
    expect(TWISTS_V2_FROM).toBe('2026-12-02');
  });

  it('keeps all 400 dailies before the cut-over exactly as they were', () => {
    const end = Date.parse('2026-12-01T00:00:00Z');
    let got = '';
    for (let i = 399; i >= 0; i--) {
      const s = dailySpec(dayAt(end - i * DAY));
      got += `${s.levelIndex}${MODIFIERS.indexOf(s.modifier)}`;
    }
    expect(got).toBe(BEFORE);
    // and none of them can roll a new twist
    expect(/[45]/.test(got.replace(/(.)(.)/g, '$2'))).toBe(false);
  });

  it('draws OPEN ROAD and COLD START within 60 days of the cut-over', () => {
    const start = Date.parse(`${TWISTS_V2_FROM}T00:00:00Z`);
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(dailySpec(dayAt(start + i * DAY)).modifier.id);
    expect(seen.has('OPEN_ROAD')).toBe(true);
    expect(seen.has('COLD_START')).toBe(true);
    expect(seen.size).toBe(6);
  });

  it('gives every twist an id, a name and a description', () => {
    expect(MODIFIERS.map((m) => m.id)).toEqual(['HEAT_WAVE', 'GLASS_CHASSIS', 'FLUX_STORM', 'RUSH_HOUR', 'OPEN_ROAD', 'COLD_START']);
    for (const m of MODIFIERS) {
      expect(m.name).toMatch(/^[A-Z ]+$/);
      expect(m.desc.length).toBeGreaterThan(8);
    }
  });

  it('keeps the level draw first and the twist second after the cut-over', () => {
    // The level pick is the first roll; adding twists must not move which road a day races.
    for (let i = 0; i < 60; i++) {
      const d = dayAt(Date.parse('2026-12-02T00:00:00Z') + i * DAY);
      const r = mulberry32(seedFor(d));
      expect(dailySpec(d).levelIndex).toBe(Math.floor(r() * 5));
      expect(dailySpec(d).modifier).toBe(MODIFIERS[Math.floor(r() * 6)]);
    }
  });
});
