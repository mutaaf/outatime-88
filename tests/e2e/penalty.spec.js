// Penalty scoring (ticket 0073): grinding the wall costs points, a red popup says so, the
// results break the score down, and the submitted run carries the log the server checks.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('grinding the wall costs points, shows a popup, and the results explain it', async ({ page }) => {
  const problems = watchPage(page);
  let posted = null;
  await page.route('**/outatime/api/scores', (route) => {
    if (route.request().method() === 'POST') posted = JSON.parse(route.request().postData());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rank: { all: 1, daily: 1 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, initials: 'TST' })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__OT.GameState.speed > 45, null, { timeout: 15000 });
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('#hudPenalty')).toContainText('WALL SCRAPE', { timeout: 8000 });
  await expect(page.locator('#hudPenalty')).toContainText('−');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  const log = await page.evaluate(() => window.__OT.GameState.penaltyLog);
  expect(log.wallMs).toBeGreaterThan(300);

  // Bank some points so the run is worth posting, then finish.
  await page.evaluate(() => { window.__OT.GameState.score += 500000; window.__OT.finishRun(); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#endPenaltyText')).toContainText('WALL');
  await expect(page.locator('#endPenaltyText')).toContainText('−');
  await expect.poll(() => posted, { timeout: 8000 }).not.toBeNull();
  expect(posted.pen.wallMs).toBeGreaterThanOrEqual(log.wallMs);
  expect(posted.pen.obstacle).toEqual(expect.any(Array));
  expect(Number.isInteger(posted.earned)).toBe(true);
  expect(posted.earned).toBeGreaterThan(posted.score);
  expect(problems).toEqual([]);
});

test('a clean run says so', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__OT.GameState.score = 123456; window.__OT.finishRun(); });
  await expect(page.locator('#endPenaltyText')).toContainText('CLEAN RUN');
  await expect(page.locator('#endScoreText')).toHaveText('123,456');
  expect(problems).toEqual([]);
});
