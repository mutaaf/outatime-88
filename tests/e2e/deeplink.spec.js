// Deep links (ticket 0110): the site launcher opens a screen, not just the title.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const clean = async (page) => expect.poll(() => page.evaluate(() => location.search)).not.toMatch(/play=|board=|level=|garage/);

test('?play=daily: the title tap races today\'s daily, and the URL is cleaned', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?play=daily&debug`);
  await expect(page.locator('#playHint')).toContainText('DAILY');
  await clean(page);
  expect(await page.evaluate(() => location.search)).toBe('?debug');
  await page.locator('#titleScreen').click({ position: { x: 5, y: 300 } });
  await expect.poll(() => page.evaluate(() => Boolean(window.__OT.GameState.daily))).toBe(true);
  expect(problems).toEqual([]);
});

test('?play=friends opens RACE FRIENDS; ?play=quick focuses QUICK RACE (one tap, never auto-joins)', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?play=friends`);
  await expect(page.locator('.live-menu')).toBeVisible();
  await clean(page);
  await page.goto(`${APP}?play=quick`);
  await expect(page.locator('#liveQuick')).toBeFocused();
  expect(problems).toEqual([]);
});

test('?board= opens the leaderboard on that tab, and composes with ?view', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?board=friends&view=2d`);
  await expect(page.locator('#leaderboardModal')).toBeVisible();
  await expect(page.locator('.board-tab[data-board="friends"]')).toHaveAttribute('aria-selected', 'true');
  await clean(page);
  expect(await page.evaluate(() => location.search)).toBe('?view=2d');
  expect(problems).toEqual([]);
});

test('?garage opens the garage', async ({ page }) => {
  await page.goto(`${APP}?garage`);
  await expect(page.locator('#garageModal')).toBeVisible();
  await clean(page);
});

test('?level=N picks an unlocked level; a locked one stays locked with a note', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?level=1&debug`);
  await expect(page.locator('#playHint')).toContainText('TAP TO RACE');
  expect(await page.evaluate(() => window.__OT.GameState.levelIndex)).toBe(0);
  await page.goto(`${APP}?level=4&debug`);
  await expect(page.locator('#playHint')).toContainText('LOCKED');
  expect(await page.evaluate(() => window.__OT.GameState.levelIndex)).toBe(0);
  await page.goto(`${APP}?level=99&debug`); // invalid: ignored, plain title
  await expect(page.locator('#titleScreen')).toBeVisible();
  expect(problems).toEqual([]);
});
