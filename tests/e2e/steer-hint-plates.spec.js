// Ticket 0243: the first-run steer prompt (#steerHint) never shares pixels with the score
// plates. While any plate is up (src/pickup-art.js drawLabels) the prompt steps aside (the
// body.labels-up class), and it comes back once the plates have settled. A recorder samples
// every frame of a forced dodge chain: one frame with a plate drawn and the prompt shown fails.
import { test, expect, devices } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const VIEWS = [
  ['390x844', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }],
  ['844x390', { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } }],
  ['1280x720', { viewport: { width: 1280, height: 720 } }],
];

for (const [name, opts] of VIEWS) {
  test(`steer prompt steps aside for the score plates at ${name}`, async ({ browser }, info) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const problems = watchPage(page);
    // A new player (the prompt shows), with the touch thumb guide already seen (it hides the prompt).
    await page.addInitScript((k) => {
      localStorage.setItem(k, JSON.stringify({ controls: { coachSeen: true } }));
      window.__hintShown = () => {
        const el = document.getElementById('steerHint');
        if (!el || el.classList.contains('hidden')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && getComputedStyle(el).visibility === 'visible';
      };
    }, SAVE);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT);
    if (opts.hasTouch) await page.locator('#btnStartRace').tap(); else await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT.pickupArt() && window.__hintShown(), null, { timeout: 30000 });
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const isShown = window.__hintShown;
      const OT = window.__OT;
      const t0 = performance.now();
      let fired = 0, last = 0, both = 0, plates = 0, back = false, hintRect = null;
      const el = document.getElementById('steerHint');
      (function tick() {
        const s = OT.pickupArt(), now = performance.now();
        // A chain event about every 150 ms: one plate that keeps growing (0205), up ~1.3 s.
        if (fired < 4 && now - last > 150) { OT.streak('⚡ CLOSE SHAVE!'); fired++; last = now; }
        const on = isShown();
        if (s.labels > 0) {
          plates++;
          if (on) { both++; hintRect = el.getBoundingClientRect().toJSON(); }
        } else if (fired === 4 && plates > 0 && on) back = true;
        // Done once the prompt is back after the plates (or the prompt's own run is over).
        if (back || el.classList.contains('hidden') && plates > 0 && s.labels === 0 || now - t0 > 8000) resolve({ both, plates, back, hintRect });
        else requestAnimationFrame(tick);
      })();
    }));
    expect(seen.plates).toBeGreaterThan(0);
    expect(seen.both, `prompt shown with a plate drawn: ${JSON.stringify(seen.hintRect)}`).toBe(0);
    await info.attach(`steer-hint-${name}`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

// The prompt comes back once the plates have settled (it only ever shows once per run).
test('steer prompt returns after the plates settle', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.pickupArt() && !document.getElementById('steerHint').classList.contains('hidden'), null, { timeout: 30000 });
  await page.evaluate(() => window.__OT.streak('⚡ CLOSE SHAVE!'));
  await page.waitForFunction(() => document.body.classList.contains('labels-up'));
  await expect(page.locator('#steerHint')).toBeHidden();
  await page.waitForFunction(() => !document.body.classList.contains('labels-up'), null, { timeout: 5000 });
  // Back once the plates settle, unless the run ended the prompt itself (a bump that slid the car
  // counts as a steer, src/race-flow.js updateOnboarding): then it stays hidden for good.
  await expect.poll(() => page.evaluate(() => {
    const el = document.getElementById('steerHint');
    return el.classList.contains('hidden') || (getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().width > 0);
  })).toBe(true);
  expect(problems).toEqual([]);
});
