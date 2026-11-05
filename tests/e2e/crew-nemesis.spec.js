// A crew rival's nemesis intro agrees with its two drivers (ticket 0250): "ROOK & THE PROFESSOR
// ARE GUNNING FOR YOU", not "IS". The longest crew name is made the nemesis, the car drives on
// past the forks (so the cards don't hold the intro back), and the banner is measured in the one
// waitForFunction that sees it: the right verb, the sub line on one row, the box on screen.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const CREW = 'Rook & The Professor'; // the longest " & " driver in the roster (src/data.js)

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a crew nemesis ARE gunning for you, on one row at ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.slow(); // ~7 s of race time on a starved runner
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce', hasTouch: vp.width < 600 });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.waitForFunction(() => window.__OT.traffic().aiWorld && window.__OT.traffic().racers.some((r) => r.nemesis));
    await page.evaluate((crew) => {
      const n = window.__OT.traffic().racers.find((r) => r.nemesis);
      n.driver = crew;
      const g = window.__OT.GameState, T = window.__OT.track();
      const forks = T.liveSegments().filter((s) => s.trackType === 'SPLIT_FORK');
      if (forks.length) g.trackPos = forks[forks.length - 1].p2.world.z + 3000;
      g.invulnTimer = 30; g.playerX = 0; g.speed = 70; g.autoGas = true; // drive on: no stall call
    }, CREW);
    const seen = await (await page.waitForFunction(() => {
      const main = document.getElementById('announcerMain'), sub = document.getElementById('announcerSub');
      if (main.style.opacity !== '1' || !document.getElementById('announcerText').textContent.includes('NEMESIS')) return null;
      if (parseFloat(getComputedStyle(main).opacity) < 0.99) return null; // past the fade-in
      const s = sub.getBoundingClientRect(), m = main.getBoundingClientRect();
      return { text: sub.textContent, h: s.height, lh: parseFloat(getComputedStyle(sub).lineHeight), left: m.left, right: m.right };
    }, null, { timeout: 40000, polling: 'raf' })).jsonValue();
    expect(seen.text).toBe('ROOK & THE PROFESSOR ARE GUNNING FOR YOU');
    expect(seen.h).toBeLessThan(seen.lh * 1.5); // one row
    expect(seen.left).toBeGreaterThanOrEqual(0);
    expect(seen.right).toBeLessThanOrEqual(vp.width);
    await page.screenshot({ path: test.info().outputPath('crew-nemesis.png') });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
