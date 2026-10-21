import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIONS, DEFAULT_KEYS, RESERVED, applyKeys, bindKey, blocksDefault, isBindable, isDefault, keyName, normalizeKeys, remapFor } from '../../src/keybinds.js';
import { playHint, PLAY_HINTS } from '../../src/play-hints.js';
import { normalizeSettings, SETTINGS_DEFAULTS } from '../../src/settings.js';

// What main.js's keydown/keyup do with a code once translated (ticket 0013).
const translate = (map, code) => (map?.[code] ?? code);

describe('keyboard bindings (ticket 0013)', () => {
  it('defaults match the keys the game always had', () => {
    expect(DEFAULT_KEYS).toEqual({ left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', boost: 'Space', nos: 'ShiftLeft' });
    const fixed = Object.fromEntries(ACTIONS.map((a) => [a.id, a.fixed]));
    expect(fixed).toEqual({ left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], boost: [], nos: ['ShiftRight'] });
    expect(remapFor(null)).toBeNull(); // nothing rebound: main.js reads e.code untouched
    expect(remapFor(DEFAULT_KEYS)).toBeNull();
    expect(SETTINGS_DEFAULTS.keys).toBeNull();
    expect(normalizeSettings({}).keys).toBeNull();
  });

  it('binds a free key and keeps the rest', () => {
    const r = bindKey(null, 'left', 'KeyL');
    expect(r.ok).toBe(true);
    expect(r.keys).toEqual({ ...DEFAULT_KEYS, left: 'KeyL' });
    expect(bindKey(r.keys, 'left', 'KeyL').ok).toBe(true); // same key again is a no-op
  });

  it('rejects a key another action already holds, never swaps', () => {
    const r = bindKey(null, 'left', 'KeyD');
    expect(r).toEqual({ ok: false, reason: 'taken', by: 'STEER RIGHT' });
    expect(bindKey(null, 'boost', 'ShiftLeft')).toMatchObject({ ok: false, reason: 'taken', by: 'NOS' });
    // The fixed keys belong to their action for good.
    expect(bindKey(null, 'boost', 'ArrowUp')).toMatchObject({ ok: false, reason: 'taken', by: 'ACCELERATE' });
    expect(bindKey(null, 'left', 'ShiftRight')).toMatchObject({ ok: false, reason: 'taken', by: 'NOS' });
    // A key freed by a move is free again.
    const moved = bindKey(null, 'right', 'KeyL').keys;
    expect(bindKey(moved, 'left', 'KeyD')).toMatchObject({ ok: true, keys: { left: 'KeyD', right: 'KeyL' } });
  });

  it('rejects game hotkeys and keys that would fire browser shortcuts', () => {
    for (const code of ['KeyM', 'KeyP', 'Escape', 'Enter', 'KeyN', 'KeyK', 'Tab', 'KeyY', 'Digit1', 'Digit7']) expect(bindKey(null, 'left', code)).toMatchObject({ ok: false, reason: 'reserved' });
    for (const code of ['ControlLeft', 'AltLeft', 'MetaLeft', 'F5', 'CapsLock', '', undefined]) expect(bindKey(null, 'left', code)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bindKey(null, 'jump', 'KeyL')).toMatchObject({ ok: false });
    for (const code of ['KeyL', 'KeyO', 'KeyU', 'Digit8', 'Digit0', 'Numpad8', 'Semicolon', 'Slash', 'ShiftLeft', 'Space']) expect(isBindable(code)).toBe(true);
  });

  it('every key main.js answers to that is not a driving default is reserved', () => {
    const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    const start = src.indexOf('function bindAllControls()');
    const handler = src.slice(start, src.indexOf("window.addEventListener('keyup'", start));
    const codes = new Set([...handler.matchAll(/'((?:Key|Arrow|Shift|Numpad|Digit)\w*|Space|Enter|Escape)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    const driving = new Set(ACTIONS.flatMap((a) => [a.def, ...a.fixed]));
    for (const code of codes) expect(driving.has(code) || RESERVED.includes(code), code).toBe(true);
    // The live race's quick chat: Y toggles the tray, 1–7 send emotes.
    const live = readFileSync(new URL('../../src/live/controller.js', import.meta.url), 'utf8');
    expect(live).toContain("e.code === 'KeyY'");
    expect(live).toMatch(/Digit\(\[1-7\]\)/);
    for (const code of ['KeyY', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']) expect(RESERVED).toContain(code);
    // main.js translates every driving key through InputState.keyMap, keydown and keyup.
    expect(src.match(/const c = InputState\.keyMap\?\.\[e\.code\] \?\? e\.code;/g)).toHaveLength(2);
  });

  it('a damaged or hand-edited save falls back to the defaults as a whole', () => {
    expect(normalizeKeys({ left: 'KeyD' })).toEqual(DEFAULT_KEYS); // two actions on D
    expect(normalizeKeys({ left: 'KeyM' })).toEqual(DEFAULT_KEYS); // a hotkey
    expect(normalizeKeys({ left: 42 })).toEqual(DEFAULT_KEYS);
    expect(normalizeKeys('KeyL')).toEqual(DEFAULT_KEYS);
    expect(normalizeKeys({ left: 'KeyL', extra: 'KeyA' })).toEqual({ ...DEFAULT_KEYS, left: 'KeyL' });
    expect(normalizeKeys({ left: 'KeyD', right: 'KeyA' })).toEqual({ ...DEFAULT_KEYS, left: 'KeyD', right: 'KeyA' }); // a swap saved whole is fine
  });

  it('the remap drives the rebound key, frees the old one and leaves the rest alone', () => {
    const keys = { ...DEFAULT_KEYS, left: 'KeyL', boost: 'KeyO', nos: 'Digit0' };
    const map = remapFor(keys);
    expect(translate(map, 'KeyL')).toBe('KeyA'); // main.js steers left on KeyA's code
    expect(translate(map, 'KeyA')).toBe(''); // A does nothing now
    expect(translate(map, 'ArrowLeft')).toBe('ArrowLeft');
    expect(translate(map, 'KeyO')).toBe('Space');
    expect(translate(map, 'Space')).toBe('');
    expect(translate(map, 'Digit0')).toBe('ShiftLeft');
    expect(translate(map, 'ShiftLeft')).toBe('');
    expect(translate(map, 'ShiftRight')).toBe('ShiftRight');
    expect(translate(map, 'KeyD')).toBe('KeyD');
    expect(translate(map, 'KeyM')).toBe('KeyM');
    // A freed default taken by another action drives that action.
    const swap = remapFor({ ...DEFAULT_KEYS, left: 'KeyD', right: 'KeyA' });
    expect(translate(swap, 'KeyD')).toBe('KeyA');
    expect(translate(swap, 'KeyA')).toBe('KeyD');
    expect(isDefault(keys)).toBe(false);
  });

  it('names keys the way a keyboard prints them', () => {
    expect(['KeyJ', 'Digit4', 'Numpad4', 'Space', 'ShiftLeft', 'ArrowLeft', 'Semicolon', 'NumpadAdd'].map(keyName))
      .toEqual(['J', '4', 'NUM 4', 'SPACE', 'L-SHIFT', '←', ';', 'NUM +']);
  });

  it('applyKeys sets the translation and the BOOST key the prompts name', () => {
    const input = {};
    applyKeys(input, { ...DEFAULT_KEYS, boost: 'KeyO' });
    expect(input.keyMap).toEqual({ Space: '', KeyO: 'Space' });
    expect(input.boostKey).toBe('O');
    applyKeys(input, null);
    expect(input.keyMap).toBeNull();
    expect(input.boostKey).toBe('');
  });

  it('keyboard prompts name a rebound BOOST key, pads keep their buttons', () => {
    expect(playHint('keys', '')).toBe(PLAY_HINTS.keys);
    const h = playHint('keys', 'O');
    expect(h.flux).toBe('⚡ FLUX READY! HIT 88 MPH OR O!');
    expect(h.ramp).toBe('PRESS O OR HOVER FOR MID-AIR TRICK!');
    expect(h.coachFlux).not.toContain('SPACE');
    expect(playHint('keys', 'O')).toBe(h); // cached: the HUD asks every frame
    expect(playHint('pad', 'O')).toBe(PLAY_HINTS.pad);
  });

  it('a rebound key loses its browser default (quick find, scrolling), never while typing', () => {
    const map = remapFor({ ...DEFAULT_KEYS, left: 'Slash', boost: 'KeyO' });
    expect(blocksDefault(map, 'Slash', { tagName: 'BODY' })).toBe(true);
    expect(blocksDefault(map, 'KeyA', { tagName: 'BODY' })).toBe(true); // freed: does nothing at all
    expect(blocksDefault(map, 'Space', { tagName: 'BUTTON' })).toBe(true); // Space keeps main.js's guard
    expect(blocksDefault(map, 'KeyD', { tagName: 'BODY' })).toBe(false);
    expect(blocksDefault(map, 'Slash', { tagName: 'INPUT' })).toBe(false);
    expect(blocksDefault(map, 'Slash', { tagName: 'DIV', isContentEditable: true })).toBe(false);
    expect(blocksDefault(null, 'Slash', { tagName: 'BODY' })).toBe(false);
  });
});
