// Photo finish (ticket 0276): a finish under 1 s from another car shows one margin line on the
// results card, worded won / lost with two decimals, clear of the rest of the card.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Race, cross the line, then put a rival `offset` s from your finish time (+ behind, − ahead). */
async function finishWithRival(page, offset) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page, { minTime: 0.5 });
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 20; g.speed = 120; });
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'FINISHED');
  await page.evaluate((o) => {
    // Rivals move with you when the test jumps you to the line, so some would cross close
    // behind for real: pin every other one well clear, then place the one under test.
    const { GameState, traffic } = window.__OT;
    traffic().racers.forEach((r, i) => { r.finishTime = GameState.finishTime + 5 + i; });
    traffic().racers[0].finishTime = GameState.finishTime + o;
  }, offset);
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 15000 });
}

/** The margin line's box overlaps no other visible text block on the card. */
async function overlaps(page) {
  return page.evaluate(() => {
    const m = document.getElementById('endMargin').getBoundingClientRect();
    const hit = (r) => r.width > 0 && r.height > 0 && m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom;
    return ['endModalBadge', 'endModalTitle', 'endHeadline', 'endPodiumBox', 'endMedalText']
      .filter((id) => { const el = document.getElementById(id); return el && hit(el.getBoundingClientRect()); });
  });
}

test('lost by a whisker: one LOST BY line, clear of the card at 1280x720', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await finishWithRival(page, -0.21);
  const line = page.locator('#endMargin');
  await expect(line).toBeVisible();
  await expect(line).toHaveText('PHOTO FINISH · LOST BY 0.21s');
  await expect(page.locator('#gameOverModal').getByText(/PHOTO FINISH/)).toHaveCount(1);
  expect(await overlaps(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('won by a whisker on a phone: one WON BY line, clear of the card at 390x844', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await finishWithRival(page, 0.34);
  const line = page.locator('#endMargin');
  await expect(line).toBeVisible();
  await expect(line).toHaveText('PHOTO FINISH · WON BY 0.34s');
  expect(await overlaps(page)).toEqual([]);
  const box = await line.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(problems).toEqual([]);
});

test('a gap of a second or more shows no photo-finish line', async ({ page }) => {
  await finishWithRival(page, 1.5);
  await expect(page.locator('#endModalTitle')).toBeVisible();
  await expect(page.locator('#endMargin')).toBeHidden();
});
