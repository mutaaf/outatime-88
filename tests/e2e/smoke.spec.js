import { test, expect } from '@playwright/test';
import { APP, watchPage, stubApi, canvasLitFraction, hudNumber, skipToGreen } from './helpers.js';

test('boots at the base path with no errors and no external requests', async ({ page }) => {
  const problems = watchPage(page);
  const res = await page.goto(APP);
  expect(res.status()).toBe(200);
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

// Ticket 0258: every other spec answers the Marquee loader with a stub (stubAds), so the boot
// they see never 404s. Here the loader is NOT stubbed: on vite preview (and any local build)
// `../ads/v1/ads.js` lives in another Worker and 404s, which logs one console error. That exact
// 404 on our own origin is the only failure allowed; any other response >= 400, failed request,
// asset answered with the HTML fallback, or console error fails the boot, so a broken asset
// can't hide beside the expected noise.
const ADS_LOADER = '/ads/v1/ads.js';
const isAdsLoader = (url) => {
  try {
    const u = new URL(url);
    return ['localhost', '127.0.0.1'].includes(u.hostname) && u.pathname === ADS_LOADER;
  } catch { return false; }
};

test('boots with the real ads loader: only its own 404 is tolerated', async ({ page }) => {
  stubApi(page); // vite preview has no Worker; the API is not what this test is about
  const problems = [];
  const adsMisses = [];
  page.on('response', (r) => {
    if (r.status() >= 400) {
      if (r.status() === 404 && isAdsLoader(r.url())) adsMisses.push(r.url());
      else problems.push(`HTTP ${r.status()}: ${r.url()}`);
      return;
    }
    // vite preview answers a missing file under /outatime/ with index.html and a 200 (SPA
    // fallback), so there a broken asset shows up as HTML where a script/style/image/font was
    // asked for. Only the page's own document may come back as HTML (a missing iframe page
    // would get the fallback too, typed 'document').
    const req = r.request();
    const type = req.resourceType();
    const ownPage = type === 'document' && req.frame() === page.mainFrame();
    if (!ownPage && /text\/html/.test(r.headers()['content-type'] || '')) {
      problems.push(`missing asset (HTML fallback for a ${type}): ${r.url()}`);
    }
  });
  page.on('requestfailed', (r) => {
    if (!isAdsLoader(r.url())) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chrome's "Failed to load resource: ... 404" carries the resource as its location.
    if (/Failed to load resource/.test(m.text()) && isAdsLoader(m.location().url)) return;
    problems.push(`console.error: ${m.text()} @ ${m.location().url}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) {
      problems.push(`external request: ${r.url()}`);
    }
  });
  const res = await page.goto(APP);
  expect(res.status()).toBe(200);
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // The allowance is earned: the loader really was requested and really missed (if Marquee ever
  // serves it locally, drop the allowance rather than keep a hole open).
  expect(adsMisses.length).toBeGreaterThan(0);
  // The game shrugs the missing loader off: no marquee, title still drawn.
  expect(await page.evaluate(() => typeof window.marquee)).toBe('undefined');
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

// Full Chrome asks for /favicon.ico when no icon is linked (a console 404); the headless shell
// here never does, so this guards the link itself.
test('links a bundled favicon under the base path', async ({ page, request }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveCount(1);
  const href = await icon.getAttribute('href');
  expect(href).toBeTruthy();
  // Never root-absolute outside the base (invariant 2), and never a third-party host.
  expect(href.startsWith('/') && !href.startsWith(APP)).toBe(false);
  const url = new URL(href, page.url());
  expect(url.host).toBe(new URL(page.url()).host);
  const res = await request.get(url.href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
  expect(problems).toEqual([]);
});

test('a race starts and advances under keyboard input', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await skipToGreen(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3000);
  const dist1 = await hudNumber(page, 'distMetersDisplay');
  const speed = await hudNumber(page, 'speedDisplay');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  const dist2 = await hudNumber(page, 'distMetersDisplay');
  await page.keyboard.up('ArrowUp');
  expect(speed).toBeGreaterThan(0);
  expect(dist2).toBeGreaterThan(dist1);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

test('level selection persists across reload under the same save key', async ({ page }) => {
  // A returning player with every level open (new players start with level 1 only, ticket 0011).
  await page.addInitScript(() => {
    if (!localStorage.getItem('outatime_cruisn_88_save_v2')) {
      localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ unlockedLevel: 6 }));
    }
  });
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  const cards = page.locator('#levelSelectGrid > button');
  await expect(cards).toHaveCount(6); // five levels + the orbit skyway (ticket 0155)
  await cards.nth(2).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(saved.selectedLevel).toBe(2);
  await page.reload();
  await page.locator('#btnOpenEvents').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(after.selectedLevel).toBe(2);
  await expect(page.locator('#levelSelectGrid > button').nth(2)).toHaveClass(/border-orange-400/);
});
