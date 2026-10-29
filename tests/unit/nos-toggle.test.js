// Ticket 0222: Settings → NOS can be a tap-to-toggle instead of a hold.
import { describe, it, expect } from 'vitest';
import { nosToggle, nosSettle } from '../../src/nos-toggle.js';
import { createNos, nosFor, stepNos } from '../../src/nos.js';
import { SETTINGS_DEFAULTS, normalizeSettings } from '../../src/settings.js';
import { nosNote } from '../../src/controls-ref.js';

const DT = 1 / 120;

describe('nosToggle (0222)', () => {
  it('one press turns NOS on, the next turns it off; holding or releasing does nothing', () => {
    const t = {};
    expect(nosToggle(t, true, false)).toBe(true);
    expect(nosToggle(t, false, false)).toBe(true); // key up, or held: stays on
    expect(nosToggle(t, false, false)).toBe(true);
    expect(nosToggle(t, true, false)).toBe(false);
    expect(nosToggle(t, false, false)).toBe(false);
  });

  it('a cut (crash, warp, pause, race over) turns it off, and wins over a press in the same step', () => {
    for (const why of ['crash', 'warp', 'pause', 'race end']) {
      const t = {};
      nosToggle(t, true, false);
      expect(nosToggle(t, false, true), why).toBe(false);
      expect(nosToggle(t, false, false), why).toBe(false); // stays off until the next press
    }
    const t = {};
    expect(nosToggle(t, true, true)).toBe(false);
  });

  it('turns off when the tank runs dry, so it never stays on unseen', () => {
    const n = createNos(nosFor(5));
    const t = {};
    let steps = 0;
    let held = nosToggle(t, true, false);
    while (held && steps < 2000) {
      nosSettle(t, stepNos(n, held, DT));
      held = nosToggle(t, false, false);
      steps++;
    }
    expect(n.tank).toBe(0);
    expect(t.nosOn).toBe(false);
    expect(steps).toBeGreaterThan(100); // it burned the tank first (half of 2.5 s)
    // A press that can't light it (tank under the minimum) doesn't latch either.
    const on = nosToggle(t, true, false);
    nosSettle(t, stepNos(n, on, DT));
    expect(t.nosOn).toBe(false);
  });
});

describe('Settings → NOS (0222)', () => {
  it('defaults to HOLD; an old save without the field loads as HOLD; junk is repaired', () => {
    expect(SETTINGS_DEFAULTS.nos).toBe('hold');
    // A real pre-0222 settings blob, as saved by the 0216 build.
    const old = { tilt: false, tiltInvert: false, musicVolume: 0.8, sfxVolume: 1, musicStyle: 'auto', voice: true, proximity: true, coach: true, hud: 'normal', motion: 'auto', cameraFx: 'full', difficulty: 'normal', rivals: 'pack', graphics: 'auto', steer: '', assist: '', keys: null };
    expect(normalizeSettings(old).nos).toBe('hold');
    expect(normalizeSettings({ ...old, nos: 'toggle' }).nos).toBe('toggle');
    expect(normalizeSettings({ nos: 'mash' }).nos).toBe('hold');
    expect(normalizeSettings({ nos: true }).nos).toBe('hold');
  });

  it('the pause controls card says when NOS is a tap toggle', () => {
    expect(nosNote({ nos: 'toggle' })).toMatch(/NOS TAP ON\/OFF/);
    expect(nosNote({ nos: 'hold' })).toBe('');
    expect(nosNote({})).toBe('');
    expect(nosNote(null)).toBe('');
  });
});
