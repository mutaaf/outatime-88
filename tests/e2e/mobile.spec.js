import { test, expect, devices } from '@playwright/test';
import { APP, watchPage, canvasLitFraction, hudNumber, skipToGreen, frameStats } from './helpers.js';

test.use({ ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } });

test('phone: touch start, no page scroll, race advances', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(APP);
  await page.locator('#btnStartRace').tap();
  await skipToGreen(page, { tap: true });
  await page.waitForTimeout(2000);
  expect(await hudNumber(page, 'distMetersDisplay')).toBeGreaterThan(0);
  await expect(page.locator('#tcBoost')).toBeVisible();
  const box = await page.locator('#tcDrift').boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
  const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  expect(scroll.w).toBeLessThanOrEqual(scroll.vw);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

test('phone: a quick tap on the steering side clears the first-run steer prompt', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(APP);
  await page.locator('#btnStartRace').tap();
  await skipToGreen(page, { tap: true });
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.touchscreen.tap(90, 720);
  await expect(page.locator('#steerHint')).toBeHidden();
  expect(problems).toEqual([]);
});

// --- Mobile pass: crisp, installable, controls off the car, holds up on a slow phone ---------

test('phone: the 2D road renders at device pixels where the tier allows (crisp), 1× on LOW', async ({ browser }) => {
  for (const [gfx, want] of [['high', 1.5], ['low', 1]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
    await page.goto(`${APP}?debug&gfx=${gfx}`);
    await page.evaluate(() => window.__OT.startRace());
    await expect.poll(() => page.evaluate(() => window.__OT.gfx() && window.__OT.gfx().q.tier), { timeout: 8000 }).toBe(gfx);
    await page.waitForTimeout(400);
    const c = await page.evaluate(() => { const el = document.getElementById('gameCanvas'); const r = el.getBoundingClientRect(); return { w: el.width, cw: r.width }; });
    expect(c.w).toBe(Math.round(c.cw * want));
    expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
    await ctx.close();
  }
});

test('phone: installable — manifest with icons, home-screen icon, fullscreen display', async ({ page, request }) => {
  await page.goto(APP);
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const res = await request.get(new URL(href, page.url()).href);
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.display).toBe('fullscreen');
  expect(m.start_url).toBe('/outatime/');
  const sizes = m.icons.map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(new URL(i.src, res.url()).href)).status()).toBe(200);
  const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  expect((await request.get(new URL(apple, page.url()).href)).status()).toBe(200);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('viewport-fit=cover');
});

test('phone portrait: no button sits on your car, and the first race is never paused for a guide', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#tcBoost')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  const hits = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const half = vw * 0.13, bottom = vh * 0.87;
    const car = { x0: vw / 2 - half, x1: vw / 2 + half, y0: bottom - vw * 0.13 - 8, y1: bottom + 14 };
    return [...document.querySelectorAll('#touchControlsLayer [id^=tc]')].filter((el) => {
      if (el.id === 'tcStick' || el.id === 'tcPicker') return false;
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return false;
      return r.right > car.x0 && r.left < car.x1 && r.bottom > car.y0 && r.top < car.y1;
    }).map((el) => el.id);
  });
  expect(hits).toEqual([]);
});

test('slow phone (4× CPU throttle): the race keeps moving and the governor holds the frame rate', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(`${APP}?debug`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(2500);
  const ms = (await frameStats(page, { frames: 90, warmup: 20 })).interval.p50; // median: one runner stall doesn't fail it

  console.log(`[perf] 4× throttled phone: median ${ms.toFixed(1)} ms/frame (${(1000 / ms).toFixed(0)} fps)`);
  expect(ms).toBeLessThan(80);
  expect(await hudNumber(page, 'distMetersDisplay')).toBeGreaterThan(0);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
