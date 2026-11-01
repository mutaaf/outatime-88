// Ticket 0239: its own small spec so the flake guard repeats only these tests (LESSONS 2026-10-31).
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

// The PLAY pill's subtitle is one line on every phone width (it wrapped to "ENDLESS HIGHWAY · TAP /
// ANYWHERE" at 390x844), the pill stays a big target and still starts a race; desktop is unchanged.
const hint = (page) => page.evaluate(() => {
  const e = document.getElementById('playHint');
  const b = document.getElementById('btnStartRace').getBoundingClientRect();
  return { text: e.textContent, h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight), btnH: b.height };
});

test.describe('PLAY subtitle (0239)', () => {
  for (const [width, height] of [[320, 568], [360, 740], [390, 844], [430, 932], [844, 390]]) {
    test(`one line at ${width}x${height}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const problems = watchPage(page);
      await page.goto(APP);
      await expect(page.locator('#playHint')).toHaveText('ENDLESS HIGHWAY · TAP TO GO');
      await page.evaluate(() => document.fonts.ready);
      const m = await hint(page);
      expect(m.h, JSON.stringify(m)).toBeLessThan(1.6 * m.lh);
      expect(m.btnH).toBeGreaterThanOrEqual(44);
      if (width === 390) {
        await page.locator('#btnStartRace').tap();
        await expect(page.locator('#titleScreen')).toBeHidden();
      }
      expect(problems).toEqual([]);
      await ctx.close();
    });
  }

  test('desktop keeps its copy on one line', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(APP);
    await expect(page.locator('#playHint')).toHaveText('ENDLESS HIGHWAY · PRESS ENTER');
    await page.evaluate(() => document.fonts.ready);
    const m = await hint(page);
    expect(m.h).toBeLessThan(1.6 * m.lh);
    expect(problems).toEqual([]);
  });
});
