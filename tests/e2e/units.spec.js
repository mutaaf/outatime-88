// Speed units (ticket 0293): Settings → Units MPH | KM/H. In KM/H the HUD number and caption, the
// speed meter's spoken value, the warp headline and the results top speed read km/h; the sim, the
// 88 mph warp and the posted run stay mph. With nothing saved, the device language picks.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const seed = (page, settings) => page.addInitScript(([k, s]) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true, settings: s }));
}, [KEY, settings]);

/** Throttle until the car is moving, then pause: the HUD and the meter hold still to be read. */
async function pausedAtSpeed(page) {
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__OT.GameState.speed > 40, null, { timeout: 20000 });
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.__OT.pause());
  await nextFrames(page, 4);
  return page.evaluate(() => {
    const meter = document.querySelector('#hudSpeedCard .speed-meter');
    return {
      shown: Number(document.getElementById('hudSpeed').textContent),
      cap: document.querySelector('#hudSpeedCard .spd-line small').textContent,
      now: Number(meter.getAttribute('aria-valuenow')),
      max: meter.getAttribute('aria-valuemax'),
      text: meter.getAttribute('aria-valuetext'),
      mph: window.__OT.GameState.speed,
    };
  });
}

test('KM/H from the title gear: HUD, meter, warp and results read km/h; it survives a reload', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, {});
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="units"] [data-value="mph"]')).toHaveAttribute('aria-pressed', 'true'); // en-US
  await page.locator('[data-setting="units"] [data-value="kmh"]').click();
  await expect(page.locator('[data-setting="units"] [data-value="kmh"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnSettingsDone').click();
  expect((await saved(page)).settings.units).toBe('kmh');

  await page.reload();
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="units"] [data-value="kmh"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-setting="units"] [data-value="mph"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#btnSettingsDone').click();

  let posted = null;
  await page.route('**/outatime/api/scores', (route) => {
    if (route.request().method() === 'POST') posted = route.request().postData();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rank: { all: 1, daily: 1 } }) });
  });
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  const h = await pausedAtSpeed(page);
  expect(h.cap).toBe('KM/H');
  // The number is km/h; the bar's value stays mph out of 160 (0284), and the meter speaks km/h.
  expect(h.max).toBe('160');
  expect(Math.abs(h.now - h.mph)).toBeLessThanOrEqual(1);
  expect(Math.abs(h.shown - h.mph * 1.609344)).toBeLessThanOrEqual(2);
  expect(h.text).toBe(`${Math.round(h.mph * 1.609344)} km/h`);

  // The warp still fires at the mph threshold; its headline says 142 KM/H.
  await page.evaluate(() => { window.__OT.GameState.status = 'PLAYING'; });
  const before = await page.evaluate(() => window.__OT.GameState.timeWarps);
  const headline = await page.waitForFunction((b) => {
    const g = window.__OT.GameState;
    const t = document.getElementById('announcerText').textContent;
    if (g.timeWarps > b && /TIME WARP/.test(t)) return t;
    if (g.timeWarps <= b) { g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0; }
    return false;
  }, before, { timeout: 8000 }).then((x) => x.jsonValue());
  expect(headline).toContain('142 KM/H TIME WARP');
  expect(headline).not.toContain('MPH');

  // Results: the top speed in km/h; the posted run keeps mph and never mentions km/h.
  await page.evaluate(() => { const G = window.__OT.GameState; G.peakSpeed = 188; G.score = 734210; window.__OT.finishRun(); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#endPeakSpeedText')).toHaveText(/^303\u2009KM\/H\u2009•\u2009\d+\u2009TD$/);
  await expect.poll(() => posted, { timeout: 8000 }).not.toBeNull();
  expect(posted).not.toMatch(/km|kmh/i);
  const body = JSON.parse(posted);
  if (body.fp && body.fp.topMph != null) expect(body.fp.topMph).toBeLessThan(200); // mph, not ×1.609
  expect(problems).toEqual([]);
});

test('MPH is unchanged, and the pause sheet settings flip the HUD mid-race', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { units: 'mph' });
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  const h = await pausedAtSpeed(page);
  expect(h.cap).toBe('MPH');
  expect(h.shown).toBe(h.now);
  expect(h.text).toBeNull(); // in mph, aria-valuenow (mph) is what the meter speaks
  await page.evaluate(() => { window.__OT.GameState.status = 'PLAYING'; });
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await page.locator('[data-setting="units"] [data-value="kmh"]').click();
  await expect(page.locator('#hudSpeedCard .spd-line small')).toHaveText('KM/H');
  expect((await saved(page)).settings.units).toBe('kmh');
  await page.locator('[data-setting="units"] [data-value="mph"]').click();
  await expect(page.locator('#hudSpeedCard .spd-line small')).toHaveText('MPH');
  expect(problems).toEqual([]);
});

test('with nothing saved, a km/h language gets km/h', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'de-DE' });
  const page = await ctx.newPage();
  const problems = watchPage(page);
  await seed(page, {});
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="units"] [data-value="kmh"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnSettingsDone').click();
  expect((await saved(page)).settings.units).toBeUndefined(); // nothing written until the player picks
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await expect(page.locator('#hudSpeedCard .spd-line small')).toHaveText('KM/H');
  expect(problems).toEqual([]);
  await ctx.close();
});

for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 1280, height: 720 }]) {
  test(`km/h fits: HUD caption and the widest results top speed at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await seed(page, { units: 'kmh' });
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page);
    await expect(page.locator('#hudSpeedCard .spd-line small')).toHaveText('KM/H');
    await page.evaluate(() => { document.getElementById('hudSpeed').textContent = '303'; });
    const hud = await page.evaluate(() => {
      const card = document.getElementById('hudSpeedCard').getBoundingClientRect();
      const line = document.querySelector('#hudSpeedCard .spd-line');
      const cap = line.querySelector('small');
      const r = cap.getBoundingClientRect();
      return { inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5, size: parseFloat(getComputedStyle(cap).fontSize), cut: line.scrollWidth > line.clientWidth + 1 };
    });
    expect(hud.inside).toBe(true);
    expect(hud.cut).toBe(false);
    expect(hud.size).toBeGreaterThanOrEqual(10);
    await page.evaluate(() => { const G = window.__OT.GameState; G.peakSpeed = 188; G.takedowns = 12; G.score = 734210; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    await expect(page.locator('#endPeakSpeedText')).toHaveText('303\u2009KM/H\u2009•\u200912\u2009TD');
    await page.evaluate(() => document.fonts.ready);
    // The text's own width, not the integer scrollWidth (a 1 px overflow still shows an ellipsis).
    const fit = await page.evaluate(() => {
      const b = document.getElementById('endPeakSpeedText');
      const r = document.createRange();
      r.selectNodeContents(b);
      return { text: r.getBoundingClientRect().width, box: b.clientWidth };
    });
    expect(fit.text).toBeLessThanOrEqual(fit.box);
    expect(problems).toEqual([]);
  });
}
