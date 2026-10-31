// Ticket 0232: its own small spec so the flake guard repeats only these tests, not title.spec's ~57.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

// Ticket 0232: a first-time player's chip reads "BEST —" (nothing yet), never a lonely "BEST 0";
// once a run has scored, the title shows the number, and a returning save looks as before.
test.describe('title chip best (0232)', () => {
  const best = (page) => page.locator('#titleBestScore');
  test('a fresh save shows a dash, then the number after a scoring run', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await expect(best(page)).toHaveText('—');
    await expect(best(page)).toHaveAttribute('aria-label', 'No best score yet');
    await page.waitForFunction(() => window.__OT && window.__OT.home());
    await page.evaluate(() => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    await page.evaluate(() => { window.__OT.GameState.score = 1234; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    await page.locator('#btnHomeFromEnd').click();
    await expect(page.locator('#titleScreen')).toBeVisible();
    await expect(best(page)).toHaveText('1,234');
    await expect(best(page)).not.toHaveAttribute('aria-label', /./);
    expect(problems).toEqual([]);
  });
  test('a save with a best score shows it as before', async ({ page }) => {
    const problems = watchPage(page);
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, bestScore: 1234 })));
    await page.goto(APP);
    await expect(best(page)).toHaveText('1,234');
    await expect(best(page)).not.toHaveAttribute('aria-label', /./);
    expect(problems).toEqual([]);
  });
});
