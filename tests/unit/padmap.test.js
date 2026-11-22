// Ticket 0298: the gamepad's five driving buttons can be rebound in Settings.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PAD_ACTIONS, DEFAULT_PAD, normalisePadMap, bindPad, isDefaultPad, padButtons, actionsFor, padNames, padRemapText, applyPad,
} from '../../src/padmap.js';
import { pollGamepad, InputState } from '../../src/input.js';
import { padText, padTable, setRemap } from '../../src/pad-glyphs.js';
import { START_HINTS } from '../../src/racecall.js';
import { PLAY_HINTS } from '../../src/play-hints.js';
import { controlRows } from '../../src/controls-ref.js';
import { normalizeSettings } from '../../src/settings.js';

const down = (...idx) => Array.from({ length: 16 }, (_, i) => idx.includes(i));
const NONE = { gas: false, brake: false, boost: false, jump: false, nos: false };

describe('normalisePadMap', () => {
  it('an old save (no padMap) and null are today\'s buttons', () => {
    expect(normalizeSettings({ keys: null }).padMap).toBe(null);
    expect(normalisePadMap(undefined)).toEqual({ gas: 0, brake: 1, boost: 2, jump: 3, nos: 4 });
    expect(normalisePadMap(null)).toEqual(DEFAULT_PAD);
    expect(padButtons(null)).toBe(null);
  });
  it('a corrupt map (wrong types, out of range, fixed buttons, duplicates) loads as the defaults, whole', () => {
    for (const bad of ['x', 7, [], { boost: '5' }, { boost: 2.5 }, { boost: -1 }, { boost: 99 }, { boost: 9 }, { boost: 7 },
      { boost: 14 }, { boost: 0 }, { gas: 3, jump: 0, nos: 3 }, { boost: null }]) {
      expect(normalisePadMap(bad)).toEqual(DEFAULT_PAD);
    }
  });
  it('keeps a valid partial or full map and ignores unknown keys', () => {
    expect(normalisePadMap({ boost: 5 })).toEqual({ ...DEFAULT_PAD, boost: 5 });
    expect(normalisePadMap({ boost: 11, extra: 4 })).toEqual({ ...DEFAULT_PAD, boost: 11 });
  });
});

describe('bindPad', () => {
  it('binds a free button, refuses a taken one (no swap) and a fixed one', () => {
    const r = bindPad(null, 'boost', 5);
    expect(r).toEqual({ ok: true, map: { ...DEFAULT_PAD, boost: 5 } });
    expect(bindPad(null, 'boost', 1)).toEqual({ ok: false, reason: 'taken', by: 'BRAKE' });
    expect(bindPad(null, 'boost', 9)).toEqual({ ok: false, reason: 'fixed', by: 'PAUSE' });
    expect(bindPad(null, 'boost', 6)).toEqual({ ok: false, reason: 'fixed', by: 'BRAKE' });
    expect(bindPad(null, 'boost', 14).reason).toBe('fixed');
    expect(bindPad(null, 'boost', 16).reason).toBe('invalid');
    expect(bindPad(null, 'nope', 5).reason).toBe('unknown');
    expect(bindPad(null, 'boost', 2)).toEqual({ ok: true, map: DEFAULT_PAD });
  });
  it('every action can move to RS and back; a freed button can be taken', () => {
    for (const a of PAD_ACTIONS) {
      const r = bindPad(null, a.id, 11);
      expect(r.ok).toBe(true);
      expect(isDefaultPad(bindPad(r.map, a.id, a.def).map)).toBe(true);
    }
    const m = bindPad(null, 'boost', 11).map; // X is free now
    expect(bindPad(m, 'jump', 2)).toEqual({ ok: true, map: { ...DEFAULT_PAD, boost: 11, jump: 2 } });
  });
});

describe('actionsFor / padButtons', () => {
  it('default: A gas, B brake, X or RB warp, Y jump, LB NOS', () => {
    expect(actionsFor(down(0), null)).toEqual({ ...NONE, gas: true });
    expect(actionsFor(down(1), null)).toEqual({ ...NONE, brake: true });
    expect(actionsFor(down(2), null)).toEqual({ ...NONE, boost: true });
    expect(actionsFor(down(5), null)).toEqual({ ...NONE, boost: true });
    expect(actionsFor(down(3), null)).toEqual({ ...NONE, jump: true });
    expect(actionsFor(down(4), null)).toEqual({ ...NONE, nos: true });
    expect(actionsFor(down(11), null)).toEqual(NONE);
  });
  it('WARP on RB: RB warps, X does nothing', () => {
    const m = { boost: 5 };
    expect(actionsFor(down(5), m)).toEqual({ ...NONE, boost: true });
    expect(actionsFor(down(2), m)).toEqual(NONE);
    expect(padButtons(m)).toEqual([0, 1, 5, -1, 3, 4]);
  });
  it('WARP on RS: X and RB both stop warping; RB taken by JUMP stops its warp too', () => {
    expect(actionsFor(down(2), { boost: 11 })).toEqual(NONE);
    expect(actionsFor(down(5), { boost: 11 })).toEqual(NONE);
    expect(actionsFor(down(11), { boost: 11 })).toEqual({ ...NONE, boost: true });
    expect(actionsFor(down(5), { jump: 5 })).toEqual({ ...NONE, jump: true });
    expect(actionsFor(down(2), { jump: 5 })).toEqual({ ...NONE, boost: true });
  });
});

describe('pollGamepad reads the rebound table', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete InputState.padMap; });
  const poll = (pressed) => {
    const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0], buttons }] });
    return { ...pollGamepad() };
  };
  it('no padMap: today\'s buttons', () => {
    expect(poll([2]).boost).toBe(true);
    expect(poll([5]).boost).toBe(true);
    expect(poll([0]).gas).toBe(true);
    expect(poll([3]).hover).toBe(true);
    expect(poll([4]).nos).toBe(true);
  });
  it('WARP rebound to RS, JUMP to X, NOS to A, GAS to LB: each button does its new job only', () => {
    applyPad(InputState, { boost: 11, jump: 2, nos: 0, gas: 4 });
    expect(poll([11]).boost).toBe(true);
    expect(poll([2])).toMatchObject({ boost: false, hover: true });
    expect(poll([5]).boost).toBe(false);
    expect(poll([0])).toMatchObject({ nos: true, gas: false });
    expect(poll([4])).toMatchObject({ gas: true, gasAmt: 1, nos: false });
    expect(poll([7])).toMatchObject({ gas: true }); // RT stays the throttle
    applyPad(InputState, null);
    expect(InputState.padMap).toBe(null);
    expect(poll([2]).boost).toBe(true);
  });
});

describe('prompts and the controls card name the rebound buttons', () => {
  afterEach(() => setRemap(null));
  it('padNames / controls card', () => {
    expect(padNames(null)).toEqual({ gas: 'A · RT', brake: 'B · LT', boost: 'X · RB', jump: 'Y', nos: 'LB' });
    const card = (pad) => Object.fromEntries(controlRows('pad', { pad }).rows.map((r) => [r.label, r.value]));
    expect(card(null)).toEqual({ STEER: 'L-STICK · D-PAD', GAS: 'A · RT', BRAKE: 'B · LT', WARP: 'X · RB', NOS: 'LB', JUMP: 'Y' });
    expect(card({ boost: 11 })).toMatchObject({ WARP: 'RS' });
    expect(card({ boost: 5 })).toMatchObject({ WARP: 'RB' });
    expect(card({ jump: 5, gas: 11 })).toMatchObject({ WARP: 'X', JUMP: 'RB', GAS: 'RS · RT' });
  });
  it('padRemapText rewrites WARP, JUMP, BRAKE and NOS in one pass, never A', () => {
    const m = { boost: 3, jump: 2 }; // a swap must not chain
    expect(padRemapText(START_HINTS.pad.launch, m)).toBe('PRESS Y RIGHT ON GREEN FOR A ROCKET START');
    expect(padRemapText(PLAY_HINTS.pad.ramp, m)).toBe('PRESS Y OR X FOR A MID-AIR TRICK!');
    expect(padRemapText(PLAY_HINTS.pad.jump, m)).toBe('💥 BLOCKED! JUMP (X) OR STEER AROUND!');
    expect(padRemapText(PLAY_HINTS.pad.coachFlux, { boost: 5 })).toBe('Hold 88 mph — or press RB — to jump eras');
    expect(padRemapText(PLAY_HINTS.pad.slide, { brake: 11 })).toBe('💥 BLOCKED! HOLD RS / LT TO SLIDE UNDER!');
    expect(padRemapText('START · PAUSE · A or START to resume', { gas: 11 })).toBe('START · PAUSE · A or START to resume');
    expect(padRemapText(START_HINTS.pad.launch, null)).toBe(START_HINTS.pad.launch);
  });
  it('pad-glyphs applies the remap before the family names (PlayStation R3, Switch swap)', () => {
    setRemap((t) => padRemapText(t, { boost: 11 }));
    expect(padText(START_HINTS.pad.launch, 'xbox')).toBe('PRESS RS RIGHT ON GREEN FOR A ROCKET START');
    expect(padText(START_HINTS.pad.launch, 'ps')).toBe('PRESS R3 RIGHT ON GREEN FOR A ROCKET START');
    expect(padTable(START_HINTS.pad, 'xbox').skip).toBe('PRESS RS TO SKIP ▶▶');
    setRemap((t) => padRemapText(t, { jump: 2, boost: 3 }));
    expect(padTable(START_HINTS.pad, 'switch').skip).toBe('PRESS X TO SKIP ▶▶'); // Y (button 3) prints X on Switch
    expect(padText('X', 'ps', true)).toBe('□'); // raw: text that already names the rebound button
    // A bare A from the remap gets the family's name too (Switch prints B on button 0, PlayStation ✕).
    setRemap((t) => padRemapText(t, { gas: 11, jump: 0 }));
    expect(padText(PLAY_HINTS.pad.hop, 'switch')).toBe('Hop it (B)');
    expect(padText(PLAY_HINTS.pad.jump, 'ps')).toBe('💥 BLOCKED! JUMP (✕) OR STEER AROUND!');
    expect(padText(PLAY_HINTS.pad.ramp, 'switch')).toBe('PRESS Y OR B FOR A MID-AIR TRICK!');
    expect(padText('A', 'switch', true)).toBe('B');
    setRemap((t) => padRemapText(t, { gas: 11, boost: 0 }));
    expect(padText(START_HINTS.pad.launch, 'ps')).toBe('PRESS ✕ RIGHT ON GREEN FOR A ROCKET START');
    expect(padText(PLAY_HINTS.pad.flux, 'switch')).toBe('⚡ FLUX READY! HIT 88 MPH OR B!');
    setRemap((t) => padRemapText(t, { gas: 11, brake: 0 }));
    expect(padText(PLAY_HINTS.pad.slide, 'ps')).toBe('💥 BLOCKED! HOLD ✕ / L2 TO SLIDE UNDER!');
    setRemap(null);
    expect(padTable(START_HINTS.pad, 'xbox')).toBe(START_HINTS.pad);
  });
});
