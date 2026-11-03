// Desktop first race (ticket 0229): on the full HUD with keys/mouse the road is the race's alone.
// The driver badge bar (title/garage information) fades out once the race steps and comes back on
// pause and results; the coach card docks in the HUD row under the track strip, between the place
// card and the time pills, clear of the road, the start arch and the announcer's lane below the HUD.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const ready = (page) => page.evaluate(() => window.__OT.ready());

/** Shown = laid out, visibility visible and (with its ancestors) not faded out. */
const badgeShown = (page) => page.evaluate(() => {
  const el = document.getElementById('driverBadgeBar');
  if (!el || !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') return false;
  let a = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
  return a > 0.5;
});

async function race(page) {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  return problems;
}

test('1280x720: the driver badge bar is off the road while racing, back on pause and results', async ({ page }) => {
  const problems = await race(page);
  await expect.poll(() => badgeShown(page)).toBe(false);
  // Still out of the way a few seconds in (it is not a one-off fade that comes back).
  await page.waitForFunction(() => window.__OT.GameState.raceTime > 2);
  expect(await badgeShown(page)).toBe(false);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__OT.GameState.status === 'PAUSED');
  await expect.poll(() => badgeShown(page)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  await expect.poll(() => badgeShown(page)).toBe(false);

  await page.evaluate(() => window.__OT.finishRun());
  await page.waitForFunction(() => window.__OT.GameState.status !== 'PLAYING');
  await expect.poll(() => badgeShown(page)).toBe(true);
  expect(problems).toEqual([]);
});

test('1280x720: N switches car on the title, not mid-race (NOS there)', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await ready(page);
  const before = await page.evaluate(() => window.__OT.GameState.selectedCharIdx);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.keyboard.down('KeyN');
  await page.waitForFunction(() => window.__OT.InputState.nosHeld === true);
  await page.keyboard.up('KeyN');
  expect(await page.evaluate(() => window.__OT.GameState.selectedCharIdx)).toBe(before);
  expect(problems).toEqual([]);
});

test('1280x720: the first-race tip docks in the HUD row, off the road and the start arch', async ({ page }) => {
  const problems = await race(page);
  await page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });
  const r = await page.evaluate(async () => {
    await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    const card = document.getElementById('coachCard');
    const desc = document.getElementById('coachDesc');
    const b = window.__OT.GameState.carBox;
    return {
      coach: rect(card),
      clipped: desc.scrollHeight > desc.clientHeight + 1 || desc.scrollWidth > desc.clientWidth + 1,
      header: document.querySelector('header').getBoundingClientRect().bottom,
      message: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot-message')),
      cards: ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings'].map((id) => rect(document.getElementById(id))),
      car: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
      vw: innerWidth,
    };
  });
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  // In the HUD band: nothing below the header, so it stays off the arch legs, the billboards, the
  // road ahead and the announcer's lane (which starts at --slot-message).
  expect(r.coach.y1).toBeLessThanOrEqual(r.header + 1);
  expect(r.coach.y1).toBeLessThan(r.message);
  expect(r.coach.y1).toBeLessThan(r.car.y0);
  for (const c of r.cards) expect(hit(r.coach, c), JSON.stringify({ coach: r.coach, card: c })).toBe(false);
  expect(r.coach.x0).toBeGreaterThanOrEqual(0);
  expect(r.coach.x1).toBeLessThanOrEqual(r.vw);
  expect(r.clipped).toBe(false);
  // GOT IT still dismisses it.
  await page.locator('#btnDismissCoach').click();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.coachDismissed)).toBe(true);
  expect(problems).toEqual([]);
});
