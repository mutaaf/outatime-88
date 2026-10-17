// Service worker (ticket 0075): a repeat load comes from the cache, the game boots offline,
// and /outatime/api/* is never cached.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { APP, watchPage } from './helpers.js';

test('sw.js is built with a versioned precache of the boot files, scoped to the base path', () => {
  const sw = readFileSync('dist/outatime/sw.js', 'utf8');
  expect(sw).toMatch(/const VERSION = '[0-9a-f]{12}'/);
  expect(sw).toContain("const BASE = '/outatime/'");
  expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
  expect(sw).not.toMatch(/assets\/view-[\w-]+\.js/); // the 3D chunk is cached on use only
  expect(sw).toContain('api/');
  expect(readFileSync('dist/_headers', 'utf8')).toContain('/outatime/sw.js\n  Cache-Control: no-cache');
});

test('repeat load is served by the service worker, works offline, never caches the API', async ({ page, context }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // the main bundle on the controlled load came from the SW
  const fromSw = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((e) => /assets\/index-.*\.js/.test(e.name)).map((e) => e.workerStart > 0));
  expect(fromSw).toContain(true);
  // The API is network only.
  await page.evaluate(() => fetch('/outatime/api/scores?board=all').catch(() => null));
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached.some((p) => p.startsWith('/outatime/api/'))).toBe(false);
  expect(cached).toContain('/outatime/');
  // Offline: the title still boots and a solo race starts.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#titleScreen')).toBeVisible();
  await page.locator('#btnStartRace').click();
  await expect(page.locator('#titleScreen')).toBeHidden();
  await context.setOffline(false);
  expect(problems.filter((p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|api/.test(p))).toEqual([]);
});
