// Desktop title pitch lock-up (ticket 0275), in its own small spec so the flake guard repeats only it.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

// Ticket 0275: on desktop shapes the first-visit pitch reads as one lock-up, not three lines at
// three heights: the left group's bottom line and the right group share one baseline (within
// 2 px), every line keeps ≥ 12 px from the hero car (carBox, sampled while the attract driver
// weaves), and each line stays inside the screen and at least 10 px tall type (0268).
for (const vp of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }, { width: 1366, height: 657 }]) {
  test(`desktop pitch lines share a baseline and clear the car at ${vp.width}x${vp.height}`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT && window.__OT.home());
    await expect(page.locator('.home-pitch li')).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    // The beats slide in one after another; wait until the last one has settled.
    await page.waitForFunction(() => [...document.querySelectorAll('.home-pitch li')].every((e) => e.getAnimations().every((a) => a.playState === 'finished')));
    const car = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < 6; i++) {
      await nextFrames(page, 3);
      const b = await page.evaluate(() => {
        const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect(), k = r.width / c.width, q = r.height / c.height;
        const b = window.__OT.GameState.carBox;
        return { x0: r.left + b.x0 * k, y0: r.top + b.y0 * q, x1: r.left + b.x1 * k, y1: r.top + b.y1 * q };
      });
      car.x0 = Math.min(car.x0, b.x0); car.y0 = Math.min(car.y0, b.y0); car.x1 = Math.max(car.x1, b.x1); car.y1 = Math.max(car.y1, b.y1);
    }
    expect(car.x1 - car.x0).toBeGreaterThan(vp.width * 0.2);
    const lines = await page.evaluate(() => [...document.querySelectorAll('.home-pitch li')].map((e) => {
      // The text's own box (a Range), not the grid cell, and the font's baseline under it.
      const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();
      const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      e.append(probe); const base = probe.getBoundingClientRect().top; probe.remove();
      return { t: e.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, base, size: parseFloat(getComputedStyle(e).fontSize) };
    }));
    const mid = (car.x0 + car.x1) / 2;
    const left = lines.filter((l) => l.x1 <= mid), right = lines.filter((l) => l.x0 >= mid);
    expect(left.length + right.length, 'every line sits wholly on one side of the car').toBe(3);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    const leftBase = Math.max(...left.map((l) => l.base)), rightBase = Math.max(...right.map((l) => l.base));
    expect(Math.abs(leftBase - rightBase), `left baseline ${leftBase | 0} vs right ${rightBase | 0}`).toBeLessThanOrEqual(2);
    // Lines within a group stack tightly (no empty row between them).
    for (const g of [left, right]) {
      const ys = g.map((l) => l.y0).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1], 'line pitch inside a group').toBeLessThan(g[0].size * 1.6);
    }
    for (const l of lines) {
      const gap = Math.max(car.x0 - l.x1, l.x0 - car.x1, car.y0 - l.y1, l.y0 - car.y1);
      expect(gap, `${l.t} [${l.x0 | 0},${l.y0 | 0} → ${l.x1 | 0},${l.y1 | 0}] vs car [${car.x0 | 0},${car.y0 | 0} → ${car.x1 | 0},${car.y1 | 0}]`).toBeGreaterThanOrEqual(12);
      expect(l.x0).toBeGreaterThanOrEqual(0);
      expect(l.x1).toBeLessThanOrEqual(vp.width);
      expect(l.size).toBeGreaterThanOrEqual(10);
    }
    await info.attach(`title-pitch-${vp.width}x${vp.height}`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(problems).toEqual([]);
  });
}
