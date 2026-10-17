// Graphics tiers (ticket 0041): auto picks a tier from the device, forced tiers render
// cleanly in 3D under their draw-call ceiling, and Settings → GRAPHICS switches live.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const gfxReady = (page) => page.waitForFunction(() => window.__OT && window.__OT.gfx && window.__OT.gfx(), null, { timeout: 15_000 });
const info = (page) => page.evaluate(() => {
  const g = window.__OT.gfx();
  return { tier: g.tier, pref: g.pref, source: g.source, renderer: g.caps.renderer, q: g.q };
});

async function race3d(page, query) {
  await page.goto(`${APP}?debug&view=3d${query}`);
  await gfxReady(page);
  await page.waitForFunction(() => { const v = window.__OT.view(); return v.stats && v.stats.frames > 3; }, null, { timeout: 20_000 });
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowUp');
  return page.evaluate(() => window.__OT.view().stats);
}

test('auto picks a tier from the device; a software GPU gets LOW', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug');
  await gfxReady(page);
  const g = await info(page);
  expect(['low', 'medium', 'high', 'ultra']).toContain(g.tier);
  expect(g.pref).toBe('auto');
  if (/swiftshader|llvmpipe/i.test(g.renderer)) expect(g.tier).toBe('low');
  await expect(page.locator('#gfxDebug')).toContainText(g.tier.toUpperCase());
  expect(problems).toEqual([]);
});

for (const tier of ['low', 'ultra']) {
  test(`3D at ${tier.toUpperCase()} renders without errors and under its draw-call ceiling`, async ({ page }) => {
    const problems = watchPage(page);
    const stats = await race3d(page, `&gfx=${tier}`);
    const g = await info(page);
    expect(g.tier).toBe(tier);
    expect(stats.frames).toBeGreaterThan(20);
    expect(stats.triangles).toBeGreaterThan(2000);
    expect(stats.drawCalls).toBeLessThanOrEqual(g.q.maxDraws);
    expect(problems).toEqual([]);
  });
}

test('Settings → GRAPHICS switches the tier live and remembers it', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug');
  await gfxReady(page);
  await page.locator('#btnOpenSettings').first().click();
  const seg = page.locator('[data-setting="graphics"]');
  await seg.locator('button[data-value="medium"]').click();
  await expect(seg.locator('button[data-value="medium"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await info(page)).tier).toBe('medium');
  await expect(page.locator('#setGfxNote')).toContainText('MEDIUM');
  await page.reload();
  await gfxReady(page);
  expect(await info(page)).toMatchObject({ tier: 'medium', pref: 'medium', source: 'player' });
  expect(problems).toEqual([]);
});

test('2D: the governor trades road resolution, never the simulation', async ({ page }) => {
  await page.goto(APP + '?debug&gfx=low');
  await gfxReady(page);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    return { q: window.__OT.gfx().q.res, w: c.width, cssW: c.clientWidth };
  });
  expect(r.q).toBeLessThan(1);
  expect(r.w).toBe(Math.max(320, r.cssW)); // the visible canvas stays full size; only the road buffer shrinks
});

test('the 2D era backdrops follow the graphics tier', async ({ page }) => {
  await page.goto(APP + '?debug&gfx=low');
  await gfxReady(page);
  await page.waitForFunction(() => { const b = window.__OT.backdrop(); return b && b.q === 'low'; }, null, { timeout: 15_000 });
  await page.goto(APP + '?debug&gfx=ultra');
  await gfxReady(page);
  await page.waitForFunction(() => { const b = window.__OT.backdrop(); return b && b.q === 'ultra'; }, null, { timeout: 15_000 });
});
