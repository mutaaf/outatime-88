// Ticket 0204: the pause shows one screen of controls for the input in hand.
import { describe, it, expect } from 'vitest';
import { controlsKind, controlRows } from '../../src/controls-ref.js';

const rows = (kind, opts) => Object.fromEntries(controlRows(kind, opts).rows.map((r) => [r.label, r.value]));
const LABELS = ['STEER', 'GAS', 'BRAKE', 'WARP', 'NOS', 'JUMP'];

describe('controlsKind', () => {
  it('follows the input in hand, and guesses from the pointer before any input', () => {
    expect(controlsKind('pad', false)).toBe('pad');
    expect(controlsKind('phone', true)).toBe('touch'); // the TV's own pause has no sheet
    expect(controlsKind('touch', false)).toBe('touch');
    expect(controlsKind('keys', true)).toBe('keys');
    expect(controlsKind('', true)).toBe('touch');
    expect(controlsKind('', false)).toBe('keys');
    expect(controlsKind(undefined, false)).toBe('keys');
  });

  it('a connected pad wins over the key or click that opened the pause (no pad button pauses)', () => {
    expect(controlsKind('keys', false, true)).toBe('pad');
    expect(controlsKind('touch', true, true)).toBe('pad');
    expect(controlsKind('keys', false, false)).toBe('keys');
  });
});

describe('controlRows', () => {
  it('lists the same six actions, in order, for every input', () => {
    for (const kind of ['keys', 'pad', 'touch']) {
      const r = controlRows(kind, {});
      expect(r.rows.map((x) => x.label)).toEqual(LABELS);
      expect(r.rows.every((x) => x.value && x.value.length <= 24)).toBe(true);
      expect(r.title).toBeTruthy();
    }
  });

  it('names the default keys and the arrows that always drive', () => {
    expect(rows('keys', { keys: null })).toEqual({
      STEER: 'A D · ← →', GAS: 'W · ↑', BRAKE: 'S · ↓', WARP: 'SPACE', NOS: 'L-SHIFT · R-SHIFT · N', JUMP: 'H · E',
    });
  });

  it('names rebound keys (0013)', () => {
    const r = rows('keys', { keys: { left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK', boost: 'KeyO', nos: 'Slash' } });
    // J, I and K are reserved game keys, so that save is invalid and falls back to the defaults as a whole
    expect(r.STEER).toBe('A D · ← →');
    const ok = rows('keys', { keys: { left: 'KeyU', right: 'KeyO', up: 'Digit8', down: 'Digit9', boost: 'Semicolon', nos: 'Slash' } });
    expect(ok).toMatchObject({ STEER: 'U O · ← →', GAS: '8 · ↑', BRAKE: '9 · ↓', WARP: ';', NOS: '/ · R-SHIFT · N' });
  });

  it('names pad buttons, never a key', () => {
    const r = rows('pad', {});
    expect(r).toMatchObject({ GAS: 'A · RT', BRAKE: 'B · LT', WARP: 'X · RB', NOS: 'LB', JUMP: 'Y' });
    expect(Object.values(r).join(' ')).not.toMatch(/SPACE|SHIFT|←/);
  });

  it('names the touch pads, and the steering the player picked', () => {
    expect(rows('touch', {})).toEqual({ STEER: 'STICK', GAS: 'AUTO', BRAKE: 'DRIFT', WARP: 'WARP', NOS: 'NOS', JUMP: 'JUMP' });
    expect(rows('touch', { movement: 'dpad', autoAccel: false })).toMatchObject({ STEER: 'D-PAD', GAS: 'GAS' });
    expect(rows('touch', { movement: 'floating' })).toMatchObject({ STEER: 'STICK' });
    expect(rows('touch', { movement: 'tilt' })).toMatchObject({ STEER: 'TILT' });
  });
});
