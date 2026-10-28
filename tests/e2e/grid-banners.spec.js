// The phone start grid shows one banner at a time (ticket 0215): the lineup chips, then your
// car's stats line, and the first-race thumb guide's DRAG TO STEER bubble only when neither is up.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ready = (page) => page.evaluate(() => window.__OT.ready());

/** Samples every 250 ms, in the page, from now until 1.5 s into the race (or the run stops); returns the samples. */
function sampleGrid(page) {
  return page.evaluate(() => new Promise((done) => {
    const shown = (el) => {
      if (!el || !el.getClientRects().length) return false;
      if (getComputedStyle(el).visibility !== 'visible') return false;
      let a = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
      return a > 0.05;
    };
    const out = [];
    const take = () => {
      const g = document.getElementById('rcGrid');
      out.push({
        chips: shown(g && g.querySelector('.rc-chip')),
        stats: shown(g && g.querySelector('.rc-mycar')),
        tip: shown(document.querySelector('#tcGuide .tc-guide-tip-steer')),
        racing: window.__OT.GameState.racePhase === 'RACING',
        anim: [...document.querySelectorAll('#rcGrid > *')].filter(shown).map((el) => getComputedStyle(el).animationName),
      });
      const gs = window.__OT.GameState;
      if ((gs.racePhase === 'RACING' && gs.raceTime > 1.5) || gs.status !== 'PLAYING' || out.length > 240) { clearInterval(id); done(out); }
    };
    const id = setInterval(take, 250);
    take();
  }));
}

const together = (s) => [s.chips && s.stats, s.chips && s.tip, s.stats && s.tip].some(Boolean);

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('first race: lineup chips, then stats, never together or under the steer tip', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug&intro`);
    await ready(page);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#tcGuide')).toBeAttached({ timeout: 5000 });
    const s = await sampleGrid(page);
    expect(s.filter(together)).toEqual([]);
    const firstChips = s.findIndex((x) => x.chips);
    const firstStats = s.findIndex((x) => x.stats);
    expect(firstChips).toBeGreaterThanOrEqual(0);
    expect(firstStats).toBeGreaterThan(firstChips); // both shown, lineup first
    // The guide was held, not spent: it is back once the grid is done, and the grid never outlasts GO.
    const lastGrid = s.map((x) => x.chips || x.stats).lastIndexOf(true);
    expect(s.slice(lastGrid + 1).some((x) => x.tip)).toBe(true);
    expect(s.filter((x) => x.racing && (x.chips || x.stats))).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('reduced motion: same order with no fade; a repeat race in the same car skips the stats', async ({ page }) => {
    const problems = watchPage(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${APP}?debug&intro`);
    await ready(page);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#tcGuide')).toBeAttached({ timeout: 5000 });
    await page.locator('#rcSkip').click();
    const s = await sampleGrid(page);
    expect(s.filter(together)).toEqual([]);
    expect(s.filter((x) => x.racing && (x.chips || x.stats))).toEqual([]); // skipped: still done by GO
    expect(s.findIndex((x) => x.stats)).toBeGreaterThan(s.findIndex((x) => x.chips));
    expect(s.findIndex((x) => x.chips)).toBeGreaterThanOrEqual(0);
    expect(s.flatMap((x) => x.anim).filter((a) => a !== 'none')).toEqual([]);

    // Retry: no lineup, straight to the grid, chips only this time.
    await page.evaluate(() => window.__OT.finishRun());
    await page.locator('#btnPlayAgain').click();
    await expect(page.locator('#rcLights')).toBeVisible({ timeout: 3000 });
    const again = await sampleGrid(page);
    expect(again.some((x) => x.chips)).toBe(true);
    expect(again.some((x) => x.stats)).toBe(false);
    expect(problems).toEqual([]);
  });
});

test.describe('phone turned upright mid-grid', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('a grid that started in landscape still shows one banner at a time once upright', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug&intro`);
    await ready(page);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await page.locator('#rcSkip').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const s = await sampleGrid(page);
    expect(s.filter(together)).toEqual([]);
    expect(s.some((x) => x.chips || x.stats)).toBe(true);
    expect(problems).toEqual([]);
  });
});

test('1280x720: the grid keeps chips and stats together, as before', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcGrid .rc-chip').first()).toBeVisible();
  await expect(page.locator('#rcGrid .rc-mycar')).toBeVisible();
  expect(await page.evaluate(() => document.body.classList.contains('rc-grid-up'))).toBe(false);
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '1', { timeout: 5000 });
  await expect(page.locator('#rcGrid .rc-mycar')).toBeVisible(); // still up on the last light
  expect(problems).toEqual([]);
});
