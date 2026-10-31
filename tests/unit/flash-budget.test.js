// Ticket 0234: no more than three large-area flashes in any one second (WCAG 2.3.1).
import { describe, it, expect, beforeEach } from 'vitest';
import { FLASH, allowFlash, flashLog, resetFlashBudget } from '../../src/flash-budget.js';

beforeEach(() => resetFlashBudget());

describe('allowFlash', () => {
  it('refuses a 4th large flash inside 1000 ms and allows one again after it', () => {
    expect(allowFlash(0, 1)).toBe(true);
    expect(allowFlash(250, 1)).toBe(true);
    expect(allowFlash(500, 0.5)).toBe(true);
    expect(allowFlash(750, 1)).toBe(false);
    expect(allowFlash(900, 1)).toBe(false);
    // the first flash is now a second old: one slot is free again
    expect(allowFlash(1000, 1)).toBe(true);
    // ...and only one: 250 and 500 are still inside the window
    expect(allowFlash(1150, 1)).toBe(false);
    expect(allowFlash(1250, 1)).toBe(true);
    expect(flashLog).toMatchObject({ allowed: 5, refused: 3 });
  });

  it('never refuses a small-area flash, and small ones use no budget', () => {
    for (let t = 0; t < 1000; t += 50) expect(allowFlash(t, FLASH.area - 0.01)).toBe(true);
    expect(allowFlash(1000, 0)).toBe(true);
    expect(flashLog.allowed + flashLog.refused).toBe(0);
    expect(allowFlash(0, 1)).toBe(true);
    for (let t = 0; t < 1000; t += 10) expect(allowFlash(t, 0.1)).toBe(true);
  });

  it('treats layers that light within 100 ms of each other as one flash', () => {
    expect(allowFlash(0, 1)).toBe(true);
    expect(allowFlash(40, 0.6)).toBe(true); // the warp's sky wash rides on the warp flash
    expect(allowFlash(300, 1)).toBe(true);
    expect(allowFlash(600, 1)).toBe(true);
    expect(flashLog.allowed).toBe(3);
    expect(allowFlash(800, 1)).toBe(false);
    expect(allowFlash(850, 1)).toBe(false); // part of the refused flash, refused too
    expect(flashLog.refused).toBe(1);
  });

  it('a merged flash does not extend itself forever', () => {
    expect(allowFlash(0, 1)).toBe(true);
    expect(allowFlash(90, 1)).toBe(true);
    // 180 ms after the flash began is a new flash, even though 90 asked in between
    expect(allowFlash(180, 1)).toBe(true);
    expect(flashLog.allowed).toBe(2);
  });

  it('a clock that starts over (a new race) does not count the old race against it', () => {
    allowFlash(5000, 1); allowFlash(5300, 1); allowFlash(5600, 1);
    expect(allowFlash(0, 1)).toBe(true);
    expect(allowFlash(300, 1)).toBe(true);
    expect(allowFlash(600, 1)).toBe(true);
    expect(allowFlash(700, 1)).toBe(false);
  });

  it('a stream of flashes never puts more than 3 in any 1000 ms window', () => {
    const lit = [];
    for (let t = 0; t < 10000; t += 37) {
      const before = flashLog.allowed;
      allowFlash(t, 1);
      if (flashLog.allowed > before) lit.push(t); // a new flash began (not one riding on the last)
    }
    for (let i = 3; i < lit.length; i++) expect(lit[i] - lit[i - 3]).toBeGreaterThanOrEqual(FLASH.window);
    expect(lit.length).toBeGreaterThanOrEqual(28);
  });
});
