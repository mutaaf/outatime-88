// Ticket 0235: a pickup's glow + white ring stop growing at a cap (64 px at a 720-px short side)
// and fade out as it closes in, so a near pickup never hides the traffic behind it. The icon
// keeps its size. Drives the car down a coin trail and reads what the lazy pickup art drew.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`pickup halo at ${w}x${h}: never past the cap, icon still full size`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT);
    await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START' && window.__OT.pickupArt(), null, { timeout: 30000 });
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const OT = window.__OT, g = OT.GameState, tr = OT.track();
      // The next coin ahead, far enough to watch it come all the way in.
      const from = Math.floor((g.trackPos + 1250) / 200) + 30;
      let coin = null;
      for (let i = from; i < tr.end - 12 && !coin; i++) {
        const it = tr.seg(i).items.find((x) => x.type === 'HW_COIN' && !x.collected);
        if (it) coin = { i, it };
      }
      if (!coin) { resolve(null); return; }
      const s = OT.pickupArt();
      s.iconMax = 0; s.haloMax = 0;
      g.trackPos = coin.i * 200 - 1250 - 2400;
      g.speed = 25;
      const t0 = performance.now();
      let shot = false;
      (function tick() {
        g.playerX = coin.it.offset + 0.35; g.playerVX = 0; // beside it, so we watch it pass
        if (!shot && s.iconMax > s.haloCap * 1.2) { shot = true; OT.pause(); resolve({ ...s, slots: null, mid: true }); return; }
        if (performance.now() - t0 > 20000) { resolve({ ...s, slots: null, mid: false }); return; }
        requestAnimationFrame(tick);
      })();
    }));
    expect(seen).not.toBeNull();
    await info.attach(`halo-${w}x${h}`, { body: await page.screenshot(), contentType: 'image/png' });
    // A pickup grew well past the cap (its icon is not shrunk)…
    expect(seen.mid).toBe(true);
    expect(seen.haloCap).toBeCloseTo(64 * Math.min(seen.rw || w, seen.rh || h) / 720, 0);
    expect(seen.iconMax).toBeGreaterThan(seen.haloCap * 1.2);
    // …while its halo never went past the cap.
    expect(seen.haloMax).toBeGreaterThan(0);
    expect(seen.haloMax).toBeLessThanOrEqual(seen.haloCap + 0.01);
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
