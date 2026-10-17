import { test, expect } from '@playwright/test';
import { APP, watchPage, hudNumber } from './helpers.js';

const frames = (page) => page.evaluate(() => (window.__OT.view().stats || { frames: 0 }).frames);
const waitFrames = (page, n) => page.waitForFunction((k) => {
  const v = window.__OT && window.__OT.view();
  return v && v.stats && v.stats.frames > k;
}, n, { timeout: 20_000 });

test('2D stays the default and never downloads the 3D chunk', async ({ page }) => {
  const problems = watchPage(page);
  const chunks = [];
  page.on('request', (r) => { if (/\/assets\/view-[^/]+\.js$/.test(r.url())) chunks.push(r.url()); });
  await page.goto(APP + '?debug');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__OT.view().mode)).toBe('2d');
  expect(await page.locator('#gameCanvas3d').count()).toBe(0);
  expect(chunks).toEqual([]);
  expect(problems).toEqual([]);
});

test('3D: the title toggle switches views, persists, and switches back', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug');
  await expect(page.locator('#btnViewMode')).toBeVisible();
  await page.locator('#btnViewMode').click();
  await waitFrames(page, 3);
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#titleScreen')).toBeVisible(); // toggling never starts a race
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).renderMode)).toBe('3d');

  await page.reload();
  await waitFrames(page, 3);
  expect(await page.evaluate(() => window.__OT.view().mode)).toBe('3d');

  await page.locator('#btnViewMode').click();
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('#gameCanvas3d').count()).toBe(0);
  expect(await page.evaluate(() => window.__OT.view().mode)).toBe('2d');
  expect(problems).toEqual([]);
});

test('3D: a race starts, the same simulation runs, and frames keep coming', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug&view=3d');
  await waitFrames(page, 3);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  const d1 = await hudNumber(page, 'distMetersDisplay');
  const f1 = await frames(page);
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  expect(await hudNumber(page, 'distMetersDisplay')).toBeGreaterThan(d1);
  expect(await frames(page)).toBeGreaterThan(f1 + 10);
  const v = await page.evaluate(() => window.__OT.view());
  expect(v.mode).toBe('3d');
  expect(v.stats.chunks).toBeGreaterThan(2);       // road is built ahead
  expect(v.stats.triangles).toBeGreaterThan(2000); // and drawn
  expect(problems).toEqual([]);
});

test('3D: survives tablet rotation mid-race', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(APP + '?debug&view=3d');
  await waitFrames(page, 3);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  const size = () => page.evaluate(() => {
    const c = document.getElementById('gameCanvas3d');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
  });
  const portrait = await size();
  expect(portrait.ch).toBeGreaterThan(portrait.cw);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(600);
  const f = await frames(page);
  await page.waitForTimeout(600);
  const landscape = await size();
  expect(landscape.cw).toBeGreaterThan(landscape.ch);
  expect(landscape.w / landscape.h).toBeCloseTo(landscape.cw / landscape.ch, 1); // drawing buffer followed
  expect(await frames(page)).toBeGreaterThan(f);
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  expect(problems).toEqual([]);
});

test('3D: losing the WebGL context drops back to 2D without breaking the race', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug&view=3d');
  await waitFrames(page, 3);
  await page.evaluate(() => {
    const gl = document.getElementById('gameCanvas3d').getContext('webgl2');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await page.waitForFunction(() => window.__OT.view().mode === '2d', null, { timeout: 5000 });
  expect(await page.locator('#gameCanvas3d').count()).toBe(0);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  // The context loss is not a saved preference.
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2') || '{}').renderMode))).not.toBe('2d');
  expect(problems).toEqual([]);
});

test('3D: Settings has a VIEW switch that matches the title chip', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP + '?debug');
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#setView2d')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#setView3d').click();
  await waitFrames(page, 3);
  await expect(page.locator('#setView3d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#setView2d').click();
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__OT.view().mode)).toBe('2d');
  expect(problems).toEqual([]);
});
