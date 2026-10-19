// Fair play (ticket 0180): mashing jump used to hover forever, farm trick points and heal to
// full. Now jumps wait for the ground, tricks are capped per air, and the posted run carries
// the counters the server checks.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('mashing jump keeps landing, gains nothing extra, and posts honest counters', async ({ page }) => {
  const problems = watchPage(page);
  let posted = null;
  await page.route('**/outatime/api/scores', (route) => {
    if (route.request().method() === 'POST') posted = JSON.parse(route.request().postData());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rank: { all: 1, daily: 1 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, initials: 'TST' })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__OT.GameState.speed > 45, null, { timeout: 15000 });

  // Mash H (jump on the ground, backflip in the air) and Space every 25 ms for 6 s, as a
  // cheater's autoclicker would, and watch how long the car stays up.
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const G = window.__OT.GameState;
    const key = (code, repeat = false) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    let n = 0;
    const mash = setInterval(() => { key('KeyH'); key('KeyH', true); if (n++ % 2) key('Space'); }, 25);
    let up = 0, longest = 0, landings = 0, last = performance.now(), wasUp = false;
    const t0 = performance.now();
    (function tick(now) {
      const air = G.playerY > 4;
      if (air) { up += now - last; longest = Math.max(longest, up); } else { if (wasUp) landings++; up = 0; }
      wasUp = air;
      last = now;
      if (now - t0 < 6000) { requestAnimationFrame(tick); return; }
      clearInterval(mash);
      const f = window.__OT.fair();
      resolve({ longest, landings, score: G.score, era: G.eraIndex, combo: G.combo, f: f && { t: f.t, air: f.air, selfAir: f.selfAir, jumps: f.jumps, airs: f.airs, tricks: f.tricks, groundAt: f.groundAt, landAt: f.landAt }, y: G.playerY, vy: G.playerVY });
    })(performance.now());
  }));
  await page.keyboard.up('ArrowUp');
  expect(seen.landings).toBeGreaterThanOrEqual(3);
  expect(seen.longest).toBeLessThan(2000); // used to be the whole 6 s

  await page.evaluate(() => { window.__OT.GameState.score += 500000; window.__OT.finishRun(); });
  await expect.poll(() => posted, { timeout: 8000 }).not.toBeNull();
  const fp = posted.fp;
  expect(fp).toBeTruthy();
  expect(fp.simMs).toBeGreaterThan(5000);
  expect(fp.jumps).toBeLessThanOrEqual(2 + fp.simMs / 700);
  expect(fp.tricks).toBeLessThanOrEqual(3 * fp.airs);
  expect(fp.airMs).toBeLessThan(fp.simMs);
  expect(problems).toEqual([]);
});
