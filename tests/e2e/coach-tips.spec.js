// Coach tips setting (ticket 0201): Settings → Race → Coach tips (default on) turns off the
// in-race tip card, the first-run "steer" prompt and the touch thumb guide's bubbles, for good.
// The announcement channel is untouched. A recorder samples every frame for each of the three,
// so a single frame of any of them counts.
import { test, expect, devices } from '@playwright/test';
import { APP, watchPage, racing, simWait, touchReady } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE);

/** A brand-new player (no score, never onboarded), with `settings` saved if given. */
const newPlayer = (page, settings) => page.addInitScript(([k, s]) => {
  if (s) localStorage.setItem(k, JSON.stringify({ settings: s }));
  window.__shown = { tip: 0, steer: 0, guide: 0 };
  (function look() {
    const tip = document.getElementById('interactiveCoachBanner');
    const steer = document.getElementById('steerHint');
    if (tip && tip.style.opacity === '1') window.__shown.tip++;
    if (steer && !steer.classList.contains('hidden')) window.__shown.steer++;
    if (document.getElementById('tcGuide')) window.__shown.guide++;
    requestAnimationFrame(look);
  })();
}, [SAVE, settings]);

const shown = (page) => page.evaluate(() => window.__shown);

/** Wait out the first-run windows: the steer prompt's runs 0.7–9 s of wall clock from the green
 *  light (src/onboarding.js), the opening tip's to 300 m (held throttle covers that). */
async function waitOutTheLessons(page, { metres = 0 } = {}) {
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(([t, m]) => performance.now() - t > 9500 && window.__OT.GameState.distance > m, [t0, metres], { timeout: 60_000 });
  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING'); // watched a live race throughout
}

test.describe('keyboard', () => {
  test.use({ hasTouch: false });

  test('the switch is on by default, works from the keyboard and survives a reload', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnOpenSettings').click();
    const sw = page.locator('#setCoach');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sw).toHaveAttribute('role', 'switch');
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect((await saved(page)).settings.coach).toBe(false);
    await page.reload();
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#setCoach')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#setCoach').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#setCoach')).toHaveAttribute('aria-checked', 'true');
    expect((await saved(page)).settings.coach).toBe(true);
    expect(problems).toEqual([]);
  });

  for (const on of [true, false]) {
    test(`coach tips ${on ? 'ON: the tip card and steer prompt teach a new player' : 'OFF: no tip card and no steer prompt in a whole race start'}`, async ({ page }) => {
      test.slow(); // ~10 s of watching, on a runner where the sim may crawl
      const problems = watchPage(page);
      await newPlayer(page, on ? null : { coach: false });
      await page.goto(`${APP}?debug`);
      await page.keyboard.press('Enter');
      await racing(page);
      if (on) {
        // The control case: the same recorder sees both, so OFF's zeroes are the setting.
        await page.waitForFunction(() => window.__shown.steer > 0 && window.__shown.tip > 0, null, { timeout: 30_000 });
      } else {
        await waitOutTheLessons(page, { metres: 320 });
        expect(await shown(page)).toEqual({ tip: 0, steer: 0, guide: 0 });
      }
      expect(problems).toEqual([]);
    });
  }

  test('turning it off mid-race clears a tip already on screen', async ({ page }) => {
    const problems = watchPage(page);
    await newPlayer(page, null);
    await page.goto(`${APP}?debug`);
    await page.keyboard.press('Enter');
    await racing(page);
    await page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });
    await page.locator('#btnHudSettings').click(); // pauses the race under the panel
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.locator('#setCoach').click();
    await page.locator('#btnSettingsDone').click();
    await expect(page.locator('#settingsModal')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    // The card hides by itself now and then (announcer, gaps), so watch a stretch of race, not one frame.
    await page.evaluate(() => { window.__shown = { tip: 0, steer: 0, guide: 0 }; });
    expect(await simWait(page, 3)).toBe(true);
    expect(await shown(page)).toMatchObject({ tip: 0, steer: 0 });
    expect(problems).toEqual([]);
  });
});

const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];

test.describe('phone', () => {
  test.use({ ...iPhone, viewport: { width: 390, height: 844 } });

  test('the switch is a 44px target', async ({ page }) => {
    await page.goto(APP);
    await page.locator('#btnOpenSettings').tap();
    const sw = page.locator('#setCoach');
    await sw.scrollIntoViewIfNeeded();
    const box = await sw.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    // The switch draws 36 px tall; its hit area reaches 44+ px (a tap just above or below it lands on it).
    const hits = await page.evaluate(({ x, y, h }) => [y - 4, y + h + 4].map((py) => {
      const el = document.elementFromPoint(x, py);
      return el && el.closest('#setCoach') ? 1 : 0;
    }), { x: box.x + box.width / 2, y: box.y, h: box.height });
    expect(hits).toEqual([1, 1]);
  });

  for (const on of [true, false]) {
    test(`coach tips ${on ? 'ON: the first touch race plays the thumb guide' : 'OFF: no thumb guide bubbles, no steer prompt'}`, async ({ page }) => {
      test.slow();
      const problems = watchPage(page);
      await newPlayer(page, on ? null : { coach: false });
      await page.goto(`${APP}?debug`);
      await page.locator('#btnStartRace').tap();
      await touchReady(page);
      await racing(page);
      if (on) {
        await page.waitForFunction(() => window.__shown.guide > 0, null, { timeout: 15_000 });
      } else {
        await waitOutTheLessons(page);
        expect(await shown(page)).toEqual({ tip: 0, steer: 0, guide: 0 });
        // The guide is only skipped, never marked seen: turning tips back on still plays it once.
        expect((await saved(page)).controls?.coachSeen).toBeFalsy();
      }
      expect(problems).toEqual([]);
    });
  }
});
