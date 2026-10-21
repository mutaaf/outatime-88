// Ticket 0007: in-race prompts name the controls of the input in hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

// The race chunks import main.js, so they are checked as source: every control prompt there must
// come from the table, never a hard-coded key (the coach's FLUX FULL line, the flux hint, the ramp call).
describe('race prompts use the table', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  it('race-flow and race-step name no key outright', () => {
    for (const f of ['race-flow.js', 'race-step.js']) {
      for (const h of Object.values(PLAY_HINTS.keys)) expect(src(f)).not.toContain(h);
      expect(src(f)).not.toMatch(/OR SPACE|hit SPACE|PRESS SPACE/);
    }
    expect(src('race-flow.js')).toMatch(/descEl\.textContent = hintNow\(\)\.coachFlux/);
    expect(src('race-flow.js')).toMatch(/fluxHint\.textContent = hintNow\(\)\.flux/);
    expect(src('race-step.js')).toMatch(/RF\.hintNow\(\)\.ramp/);
  });
});
