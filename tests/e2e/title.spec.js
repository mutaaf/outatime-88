// Title identity (pillar 1) and one-tap start (ticket 0022): PLAY is on screen everywhere,
// one tap anywhere races, and a new player is taught to steer in the race itself.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test(`START is fully visible on load at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(APP);
    const box = await page.locator('#btnStartRace').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await expect(page.locator('#titleWordmark')).toBeInViewport();
    expect(problems).toEqual([]);
  });
}

test('how-to-play starts collapsed and opens on tap', async ({ page }) => {
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  const details = page.locator('#howToPlay');
  expect(await details.evaluate((d) => d.open)).toBe(false);
  await details.locator('summary').click();
  expect(await details.evaluate((d) => d.open)).toBe(true);
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`one tap anywhere on the title starts a race at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    // Few things to read: PLAY, RACE FRIENDS (live races, 0060), five small icons (settings
    // added in 0050), the 2D/3D chip (0040, operator request), the racer/stats chip (0090), and
    // the TILT chip on touch only.
    const buttons = await page.locator('#titleScreen button:visible').count();
    expect(buttons).toBeLessThanOrEqual(9);
    // Tap the empty middle of the screen (the car on the road), not a button.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect(page.locator('#titleScreen')).toBeHidden();
    expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });
}

test('Enter starts a race from the title; the icons open their panels instead', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(page.locator('#startModal')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('TITLE');
  await page.locator('#btnCloseEvents').click();
  await expect(page.locator('#startModal')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING'); // once the race step is in (0170)
});

test('a new player gets a steer prompt that leaves once they steer', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('#steerHint')).toBeHidden();
});

test('a returning player is not prompted', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 5000 })));
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await expect(page.locator('#steerHint')).toBeHidden();
});

// Ticket 0192: the title's road cruises along with the hero car. The race field is parked and
// traffic/obstacles stay at least TITLE_GAP (3000) ahead, so nothing drives up beside the star,
// with or without reduced motion. Screenshots go into the report (not pixel-diffed).
for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  for (const reduce of [false, true]) {
    test(`the title keeps the road clear of the hero car at ${vp.width}x${vp.height}${reduce ? ' (reduced motion)' : ''}`, async ({ page }, info) => {
      const problems = watchPage(page);
      await page.setViewportSize(vp);
      if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${APP}?debug`);
      await page.waitForFunction(() => window.__OT && window.__OT.home());
      const clearance = () => page.evaluate(() => {
        const T = window.__OT.traffic();
        const pz = window.__OT.GameState.trackPos + 1250; // ROAD_CFG.playerZOffset
        let near = Infinity;
        for (const b of [...T.traffic, ...T.obstacles, ...T.props.live]) if (!b.takenDown) near = Math.min(near, b.worldZ - pz);
        return { near, parked: T.racers.every((r) => r.takenDown), pos: window.__OT.GameState.trackPos };
      });
      // Roll past where the semi used to sit beside the hero car (trackPos ~3550) and beyond.
      const seen = [];
      for (const pos of [1500, 3600, 8000]) {
        await page.waitForFunction((p) => window.__OT.GameState.trackPos > p, pos, { timeout: 30000 });
        seen.push(await clearance());
      }
      for (const c of seen) {
        expect(c.parked).toBe(true);
        expect(c.near).toBeGreaterThanOrEqual(2990);
      }
      await info.attach(`title-${vp.width}x${vp.height}${reduce ? '-reduced' : ''}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(problems).toEqual([]);
    });
  }
}
