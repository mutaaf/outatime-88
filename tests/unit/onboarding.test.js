import { describe, it, expect } from 'vitest';
import { createOnboarding, isNewPlayer, STEER_HINT_DELAY_MS, STEER_HINT_MAX_MS } from '../../src/onboarding.js';

describe('isNewPlayer', () => {
  it('is true only for a fresh save', () => {
    expect(isNewPlayer({ bestScore: 0 })).toBe(true);
    expect(isNewPlayer({ bestScore: 0, onboarded: true })).toBe(false);
    expect(isNewPlayer({ bestScore: 1200 })).toBe(false); // old saves predate the flag
  });
});

describe('steer hint', () => {
  it('appears after the green light, until the player steers', () => {
    const o = createOnboarding({ newPlayer: true });
    o.start(1000);
    expect(o.hint(1000)).toBeNull();
    expect(o.hint(1000 + STEER_HINT_DELAY_MS)).toBe('steer');
    o.steer();
    expect(o.hint(1000 + STEER_HINT_DELAY_MS + 10)).toBeNull();
    expect(o.done()).toBe(true);
  });
  it('gives up after a while instead of nagging all run', () => {
    const o = createOnboarding({ newPlayer: true });
    o.start(0);
    expect(o.hint(STEER_HINT_MAX_MS + 1)).toBeNull();
  });
  it('never shows for returning players', () => {
    const o = createOnboarding({ newPlayer: false });
    o.start(0);
    expect(o.hint(2000)).toBeNull();
  });
});
