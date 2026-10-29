import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SETTINGS_DEFAULTS, normalizeSettings, difficultyOf, reducedMotionFor,
} from '../../src/settings.js';
import { screenAngle, tiltAngle, tiltSteer, TILT } from '../../src/tilt.js';
import { tiltStatusText } from '../../src/tilt-text.js';

describe('settings (ticket 0050)', () => {
  it('fills defaults and repairs out-of-range values', () => {
    expect(normalizeSettings()).toEqual({ ...SETTINGS_DEFAULTS });
    const s = normalizeSettings({ musicVolume: 7, sfxVolume: -1, motion: 'reduce', difficulty: 'nightmare', tilt: 1 });
    expect(s.musicVolume).toBe(1);
    expect(s.sfxVolume).toBe(0);
    expect(s.motion).toBe('reduce');
    expect(s.difficulty).toBe('normal');
    expect(s.tilt).toBe(true);
    expect(s.voice).toBe(true); // missing → on
    expect(normalizeSettings({ voice: false }).voice).toBe(false);
    expect(s.proximity).toBe(true); // proximity cue (0191): an old save without it gets it on
    expect(normalizeSettings({ proximity: false }).proximity).toBe(false);
  });

  it('coach tips (0201): on by default, and an old save without the field gets them on', () => {
    expect(SETTINGS_DEFAULTS.coach).toBe(true);
    // A real pre-0201 settings blob, as saved by the 0191 build.
    const old = { tilt: false, tiltInvert: false, musicVolume: 0.8, sfxVolume: 1, musicStyle: 'auto', voice: true, proximity: true, motion: 'auto', difficulty: 'normal', graphics: 'auto', steer: '', assist: '', keys: null };
    expect(normalizeSettings(old).coach).toBe(true);
    expect(normalizeSettings({ ...old, coach: false }).coach).toBe(false);
    expect(normalizeSettings({ coach: 'yes' }).coach).toBe(true); // junk → on
  });

  it('HUD size (0195): NORMAL by default, an old save gets NORMAL, junk falls back to NORMAL', () => {
    expect(SETTINGS_DEFAULTS.hud).toBe('normal');
    // A real pre-0195 settings blob, as saved by the 0201 build.
    const old = { tilt: false, tiltInvert: false, musicVolume: 0.8, sfxVolume: 1, musicStyle: 'auto', voice: true, proximity: true, coach: true, motion: 'auto', difficulty: 'normal', graphics: 'auto', steer: '', assist: '', keys: null };
    expect(normalizeSettings(old).hud).toBe('normal');
    expect(normalizeSettings({ ...old, hud: 'large' }).hud).toBe('large');
    for (const junk of ['LARGE', 'huge', 1.3, true, null]) expect(normalizeSettings({ hud: junk }).hud).toBe('normal');
  });

  it('difficulty scales rival pace and damage, and normal changes nothing', () => {
    expect(difficultyOf({ difficulty: 'normal' })).toMatchObject({ rivalPace: 1, damage: 1 });
    expect(difficultyOf({ difficulty: 'easy' }).rivalPace).toBeLessThan(1);
    expect(difficultyOf({ difficulty: 'hard' }).damage).toBeGreaterThan(1);
    expect(difficultyOf(undefined)).toBe(difficultyOf({ difficulty: 'normal' }));
  });

  it('reduced motion: auto follows the OS, reduce and full override it', () => {
    expect(reducedMotionFor('auto', true)).toBe(true);
    expect(reducedMotionFor('auto', false)).toBe(false);
    expect(reducedMotionFor('reduce', false)).toBe(true);
    expect(reducedMotionFor('full', true)).toBe(false);
  });
});

describe('tilt steering', () => {
  it('reads gamma in portrait and beta in landscape, flipping sign for each rotation', () => {
    expect(tiltAngle(10, 20, 0)).toBe(20);
    expect(tiltAngle(10, 20, 180)).toBe(-20);
    expect(tiltAngle(10, 20, 90)).toBe(10);
    expect(tiltAngle(10, 20, 270)).toBe(-10);
    // The same physical wheel-turn steers the same way in both landscape rotations.
    expect(Math.sign(tiltAngle(15, 0, 90))).toBe(-Math.sign(tiltAngle(15, 0, 270)));
  });

  it('screenAngle normalises screen.orientation and the legacy window.orientation', () => {
    expect(screenAngle({ screen: { orientation: { angle: 90 } } })).toBe(90);
    expect(screenAngle({ screen: {}, orientation: -90 })).toBe(270);
    expect(screenAngle({})).toBe(0);
    // A reported angle that contradicts the viewport's shape loses to the shape.
    expect(screenAngle({ screen: { orientation: { angle: 90 } }, innerWidth: 820, innerHeight: 1180 })).toBe(0);
    expect(screenAngle({ screen: { orientation: { angle: 0 } }, innerWidth: 1180, innerHeight: 820 })).toBe(90);
    expect(screenAngle({ screen: { orientation: { angle: 270 } }, innerWidth: 1180, innerHeight: 820 })).toBe(270);
  });

  it('has a deadzone, a full-lock range, sensitivity and invert', () => {
    expect(tiltSteer(1.5, 0)).toBe(0);
    expect(tiltSteer(-1.5, 0)).toBe(0);
    expect(tiltSteer(TILT.range, 0)).toBeCloseTo(1);
    expect(tiltSteer(-TILT.range, 0)).toBeCloseTo(-1);
    expect(tiltSteer(60, 0)).toBe(1); // clamped
    const half = tiltSteer(13, 0);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(tiltSteer(13, 0, { sensitivity: 2 })).toBeCloseTo(Math.min(1, half * 2));
    expect(tiltSteer(13, 0, { invert: true })).toBeCloseTo(-half);
  });

  it('steers relative to the recentred zero, the short way round', () => {
    expect(tiltSteer(40, 30)).toBeCloseTo(tiltSteer(10, 0));
    expect(tiltSteer(-175, 175)).toBeCloseTo(tiltSteer(10, 0));
  });

  it('explains every tilt state in plain words', () => {
    for (const st of ['on', 'off', 'waiting', 'denied', 'unsupported', 'nosignal']) expect(tiltStatusText(st)).toMatch(/\w{4}/);
    expect(tiltStatusText('denied')).toMatch(/settings/i);
  });
});

describe('settings in the save (invariant 6)', () => {
  beforeEach(() => {
    vi.resetModules();
    const m = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m });
  });

  it('an old save with no settings loads with defaults and keeps its fields', async () => {
    localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 99, tiltSensitivity: 1.6, volume: 0.4 }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.bestScore).toBe(99);
    expect(SaveStore.data.tiltSensitivity).toBe(1.6);
    expect(SaveStore.data.settings).toEqual({ ...SETTINGS_DEFAULTS });
  });

  it('a partial settings object keeps what was chosen and gains new keys', async () => {
    localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ settings: { motion: 'reduce', difficulty: 'easy' } }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.settings.motion).toBe('reduce');
    expect(SaveStore.data.settings.difficulty).toBe('easy');
    expect(SaveStore.data.settings.musicVolume).toBe(SETTINGS_DEFAULTS.musicVolume);
  });
});
