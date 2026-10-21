// Ticket 0007: in-race prompts name the controls of the input in hand.
import { describe, it, expect } from 'vitest';
import { PLAY_HINTS, playHint } from '../../src/play-hints.js';

describe('playHint', () => {
  it('keeps the original keyboard words for keys, touch and no input yet', () => {
    const keys = { coachFlux: 'Hold 88 mph — or hit SPACE / ⚡ — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR SPACE!', ramp: 'PRESS SPACE OR HOVER FOR MID-AIR TRICK!' };
    for (const kind of ['keys', 'touch', '', undefined, 'nonsense']) expect(playHint(kind)).toEqual(keys);
  });

  it('names the pad buttons with a pad in hand, never a key', () => {
    const h = playHint('pad');
    expect(h.flux).toMatch(/\bX\b/);
    expect(h.coachFlux).toMatch(/\bX\b.*\bRB\b/);
    expect(h.ramp).toMatch(/\bX\b.*\bY\b/);
    expect(Object.values(h).join(' ')).not.toMatch(/SPACE|ENTER|TAP|KEY/);
  });

  it('names BOOST for a paired TV phone', () => {
    expect(Object.values(playHint('phone')).every((t) => /BOOST/.test(t) && !/SPACE/.test(t))).toBe(true);
  });

  it('every kind has every prompt, short enough for the HUD line', () => {
    for (const h of Object.values(PLAY_HINTS)) {
      expect(Object.keys(h).sort()).toEqual(['coachFlux', 'flux', 'ramp']);
      expect(h.flux.length).toBeLessThanOrEqual(40);
    }
  });
});
