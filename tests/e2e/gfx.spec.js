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
    // Post-processing (bloom, vignette, FXAA) is HIGH/ULTRA only, and a lazy chunk.
    if (tier === 'ultra') await page.waitForFunction(() => window.__OT.view().stats.post === true, null, { timeout: 15_000 });
    else expect(stats.post).toBe(false);
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

// Every era in 3D across phone and tablet shapes (screenshots attached to the report). LOW
// keeps CI's software GPU fast; one MEDIUM case checks the era's environment light is baked.
const ERA_SHOTS = [
  { w: 390, h: 844, eras: [0, 1], tier: 'medium' }, { w: 844, h: 390, eras: [2, 3], tier: 'low' },
  { w: 820, h: 1180, eras: [4, 5], tier: 'low' }, { w: 1180, h: 820, eras: [0, 5], tier: 'low' },
];
for (const v of ERA_SHOTS) {
  test(`3D eras ${v.eras.join('+')} at ${v.w}x${v.h} (${v.tier})`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const problems = watchPage(page);
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto(`${APP}?debug&view=3d&gfx=${v.tier}`);
    await gfxReady(page);
    await page.waitForFunction(() => { const s = window.__OT.view().stats; return s && s.frames > 3; }, null, { timeout: 20_000 });
    await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
    for (const era of v.eras) {
      await page.evaluate((e) => { window.__OT.GameState.eraIndex = e; }, era);
      const f = await page.evaluate(() => window.__OT.view().stats.frames);
      await page.waitForFunction((k) => window.__OT.view().stats.frames > k + 3, f, { timeout: 30_000 });
      expect(await page.evaluate(() => window.__OT.view().stats.env)).toBe(v.tier !== 'low');
      await info.attach(`era${era}-${v.w}x${v.h}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(problems).toEqual([]);
  });
}

test('in 3D mode the garage shows the real 3D car models, and browsing works', async ({ page }, info) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=3d&gfx=medium`);
  await page.waitForFunction(() => { const s = window.__OT.view().stats; return s && s.frames > 3; }, null, { timeout: 20_000 });
  await page.locator('#btnOpenGarageFromTitle').click();
  await expect(page.locator('#garageModal')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('garageCanvas');
    return c && !!c.getContext('webgl2');
  }, null, { timeout: 15_000 });
  await page.locator('#btnGarageNext').click();
  await page.locator('#btnGarageNext').click();
  await expect(page.locator('#garageModal')).toHaveAttribute('data-view-car', /.+/);
  // The road behind the garage stops rendering while it's open (only the turntable draws).
  const f0 = await page.evaluate(() => window.__OT.view().stats.frames);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__OT.view().stats.frames)).toBe(f0);
  await info.attach('garage-3d', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

test('3D cars: wheels roll and the archetype matches the driven car', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=3d&gfx=high`);
  await page.waitForFunction(() => { const s = window.__OT.view().stats; return s && s.frames > 3; }, null, { timeout: 20_000 });
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => window.__OT.view().stats.wheelSpin);
  await page.waitForTimeout(800);
  const b = await page.evaluate(() => window.__OT.view().stats);
  await page.keyboard.up('ArrowUp');
  expect(Math.abs(b.wheelSpin - a)).toBeGreaterThan(1); // radians rolled
  expect(b.playerShape).toBe('GULLWING');
  expect(problems).toEqual([]);
});
