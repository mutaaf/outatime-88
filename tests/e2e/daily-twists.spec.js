// Two more daily twists (0305): OPEN ROAD (less traffic) and COLD START (empty flux, one more heat).
// The page's clock is moved to a day after TWISTS_V2_FROM that draws each twist, then the real
// daily race starts through the race flow and its start values are read back.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Move Date.now to a UTC day (timers and rAF keep the real clock). */
const onDay = (page, iso) => page.addInitScript((target) => {
  const real = Date.now.bind(Date);
  const off = target - real();
  Date.now = () => real() + off;
}, Date.parse(`${iso}T12:00:00Z`));

/** True when the element's text overflows its box (clipped or cut off). */
const clipped = (page, sel) => page.locator(sel).evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);

const CASES = [
  // dailySpec('2026-12-05') = OPEN_ROAD; dailySpec('2026-12-09') = COLD_START (src/daily.js)
  { day: '2026-12-05', id: 'OPEN_ROAD', name: 'OPEN ROAD', size: { width: 1280, height: 720 } },
  { day: '2026-12-09', id: 'COLD_START', name: 'COLD START', size: { width: 390, height: 844 } },
];

for (const c of CASES) {
  test(`${c.name} at ${c.size.width}x${c.size.height}: card, race start values and results`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(c.size);
    await onDay(page, c.day);
    await page.goto(`${APP}?debug`);

    // The leaderboard's daily card names the twist in full.
    await page.locator('#btnOpenLeaderboard').click();
    await expect(page.locator('#dailyTitle')).toContainText(c.name);
    await expect(page.locator('#dailyDesc')).toContainText('Same road for everyone today.');
    expect(await clipped(page, '#dailyTitle')).toBe(false);
    expect(await clipped(page, '#dailyDesc')).toBe(false);
    await page.locator('#btnCloseLeaderboard').click();

    // The real race start applies the twist on top of the level's own start values.
    await page.evaluate(() => window.__OT.startRace({ daily: true }));
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.daily && window.__OT.GameState.daily.modifier.id)).toBe(c.id);
    const st = await page.evaluate(() => {
      const G = window.__OT.GameState;
      return { gap: G.trafficGapScale, flux: G.fluxCharge, heat: G.heatLevel, level: G.levelIndex };
    });
    if (c.id === 'OPEN_ROAD') {
      expect(st.gap).toBe(1.6);
      expect(st.flux).toBeGreaterThanOrEqual(20); // flux is untouched: the meter's usual start (FLUX.start)
    } else {
      expect(st.gap).toBe(1);
      expect(st.flux).toBeLessThan(1); // empty at the start (a frame or two of driving may add a hair)
    }

    // The results card names the daily and its twist without clipping.
    await page.evaluate(() => { window.__OT.GameState.score = 1000; window.__OT.finishRun(); });
    await expect(page.locator('#endMedalText')).toHaveText(`📅 DAILY CHALLENGE · ${c.name}`);
    expect(await clipped(page, '#endMedalText')).toBe(false);
    await page.screenshot({ path: `test-results/daily-${c.id.toLowerCase()}-${c.size.width}.png` });

    // The heat it started on: the same level outside the daily starts one lower on COLD START.
    await page.evaluate((lvl) => {
      window.__OT.startRace({ mode: 'ARCADE' }); // leaves the daily: the campaign level comes back
      window.__OT.GameState.levelIndex = lvl;
      window.__OT.startRace();
    }, st.level);
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.daily)).toBeNull();
    const plain = await page.evaluate(() => [window.__OT.GameState.heatLevel, window.__OT.GameState.levelIndex, window.__OT.GameState.trafficGapScale]);
    expect(plain[1]).toBe(st.level);
    expect(plain[2]).toBe(1);
    expect(st.heat).toBe(plain[0] + (c.id === 'COLD_START' ? 1 : 0));
    expect(problems).toEqual([]);
  });
}
