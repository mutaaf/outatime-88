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

/** The card's text runs (they wrap, so measure the text itself) all sit inside the card and the card inside the viewport. */
const cardFits = (page) => page.evaluate(() => {
  const card = document.getElementById('dailyCard').getBoundingClientRect();
  const out = [];
  if (card.left < 0 || card.right > innerWidth + 0.5) out.push('card');
  for (const id of ['dailyTitle', 'dailyDesc']) {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(id));
    for (const r of range.getClientRects()) if (r.left < card.left - 0.5 || r.right > card.right + 0.5) out.push(id);
  }
  return out;
});

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
    expect(await cardFits(page)).toEqual([]);
    await page.locator('#btnCloseLeaderboard').click();

    // The real race start applies the twist on top of the level's own start values.
    // Read in the same task as the start, before a frame of driving can add flux.
    const st = await page.evaluate(() => {
      window.__OT.startRace({ daily: true });
      const G = window.__OT.GameState;
      return { id: G.daily && G.daily.modifier.id, gap: G.trafficGapScale, flux: G.fluxCharge, heat: G.heatLevel, level: G.levelIndex };
    });
    expect(st.id).toBe(c.id);
    if (c.id === 'OPEN_ROAD') {
      expect(st.gap).toBe(1.6);
      expect(st.flux).toBe(20); // untouched: the meter's usual start (FLUX.start)
    } else {
      expect(st.gap).toBe(1);
      expect(st.flux).toBe(0);
    }

    // The results card names the daily and its twist without clipping.
    await page.evaluate(() => { window.__OT.GameState.score = 1000; window.__OT.finishRun(); });
    await expect(page.locator('#endMedalText')).toHaveText(`📅 DAILY CHALLENGE · ${c.name}`);
    expect(await clipped(page, '#endMedalText')).toBe(false);
    await page.screenshot({ path: `test-results/daily-${c.id.toLowerCase()}-${c.size.width}.png` });

    // The heat it started on: the same level outside the daily starts one lower on COLD START.
    const plain = await page.evaluate((lvl) => {
      window.__OT.startRace({ mode: 'ARCADE' }); // leaves the daily: the campaign level comes back
      window.__OT.GameState.levelIndex = lvl;
      window.__OT.startRace();
      const G = window.__OT.GameState;
      return [G.heatLevel, G.levelIndex, G.trafficGapScale, G.daily];
    }, st.level);
    expect(plain[3]).toBeNull();
    expect(plain[1]).toBe(st.level);
    expect(plain[2]).toBe(1);
    expect(st.heat).toBe(plain[0] + (c.id === 'COLD_START' ? 1 : 0));
    expect(problems).toEqual([]);
  });
}
