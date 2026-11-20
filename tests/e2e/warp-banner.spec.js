// Warp banner (ticket 0288): the 88 mph payoff line names the district once, cleanly. The headline
// already carries the year ("➔ 1985"), so the sub-line drops it, and no era carries a stray "3D".
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Force one warp (re-armed on every poll: a bump can drain the meter before the check runs). */
async function warp(page) {
  const before = await page.evaluate(() => window.__OT.GameState.timeWarps);
  await page.waitForFunction((b) => {
    const g = window.__OT.GameState;
    if (g.timeWarps > b) return true;
    g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
    return false;
  }, before, { timeout: 5000 });
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`the warp sub-line names the district without the year, on one line at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await warp(page);

    // Read both lines in one go while the warp call owns the channel (it preempts at priority 3).
    const banner = await page.waitForFunction(() => {
      const main = document.getElementById('announcerText');
      const box = document.getElementById('announcerMain');
      const sub = document.getElementById('announcerSub');
      if (!main || !sub || !/TIME WARP/.test(main.textContent) || !box.classList.contains('has-sub')) return null;
      const r = sub.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(sub).lineHeight) || parseFloat(getComputedStyle(sub).fontSize) * 1.25;
      return { main: main.textContent, sub: sub.textContent, h: r.height, lh, right: r.right, left: r.left, vw: innerWidth };
    }, null, { timeout: 5000 }).then((h) => h.jsonValue());

    expect(banner.main).toContain('1985');
    expect(banner.sub).toContain('ERA SHIFT: CEDAR RIDGE!');
    expect(banner.sub).not.toMatch(/\b(18|19|20)\d\d\b/); // no era year (the headline has it)
    expect(banner.sub).not.toContain('•');
    expect(banner.sub).not.toMatch(/\b3D\b/);
    // The two lines share no year string.
    for (const y of banner.main.match(/\b\d{4}\b/g) || []) expect(banner.sub).not.toContain(y);
    // One line, on screen.
    expect(banner.h).toBeLessThan(banner.lh * 1.6);
    expect(banner.left).toBeGreaterThanOrEqual(0);
    expect(banner.right).toBeLessThanOrEqual(banner.vw);

    // The era badge still shows year and district.
    await expect(page.locator('#eraBadge')).toHaveText('1985 • CEDAR RIDGE');
    expect(problems).toEqual([]);
  });
}
