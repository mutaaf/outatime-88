// Pinned against the wall (0176): a slow semi on your inside, you on the wall behind it. The
// truck yields, you squeeze past, and you don't bleed HP to death for being boxed in.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait } from './helpers.js';

for (const [name, semiX] of [['clipping your lane', 0.47], ['squarely ahead of you', 0.6]]) {
  test(`a slow semi ${name} against the wall: it yields, you get past, HP holds`, async ({ page }) => {
    const problems = watchPage(page);
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, initials: 'TST' })));
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page);
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__OT.GameState.playerX > 0.7 && window.__OT.GameState.speed > 30);
    const hp0 = await page.evaluate((x) => {
      const T = window.__OT.traffic(), G = window.__OT.GameState;
      const semi = T.traffic.find((t) => t.style === 'SEMI_TRUCK');
      const z = (G.visualPlayerZ || G.trackPos + 1250) + 330;
      semi.worldZ = z; semi.prevZ = z; semi.offset = x; semi.prevOffset = x; semi.yaw = 0; semi.vYaw = 0; semi.vx = 0;
      semi.vz = G.speed * T.speedToWorld() * 0.6; semi.stun = 0; semi.takenDown = false; semi.avoidZ = 0;
      // Keep the rest of the road out of it.
      for (const t of T.traffic) if (t !== semi) t.worldZ += 30000;
      for (const r of T.racers) r.worldZ -= 30000;
      window.__semi = semi;
      return G.hp;
    }, semiX);
    // Within 5 s of play you're past it (or it's moved clear of your lane).
    await page.waitForFunction(() => {
      const G = window.__OT.GameState, s = window.__semi;
      return (G.visualPlayerZ || G.trackPos + 1250) > s.worldZ + 300 || Math.abs(G.playerX - s.offset) > 0.32;
    }, null, { timeout: 30000 });
    expect(await simWait(page, 0.2)).toBe(true);
    const hp = await page.evaluate(() => window.__OT.GameState.hp);
    expect(hp0 - hp).toBeLessThanOrEqual(22); // the first crunch (~15) and no more: no drain while boxed in
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    expect(problems).toEqual([]);
  });
}
