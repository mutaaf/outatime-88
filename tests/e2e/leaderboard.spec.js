// Global leaderboard + daily challenge UI (tickets 0023, 0025), against a mocked API.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ENTRIES = [
  { rank: 1, initials: 'ACE', score: 2400000 },
  { rank: 2, initials: 'CLD', score: 1500000 },
  { rank: 3, initials: 'ZED', score: 900000 },
];

async function mockApi(page, { posts = [], boardStatus = 200 } = {}) {
  await page.route('**/outatime/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/run')) return route.fulfill({ json: { token: 'tok-1' } });
    if (req.method() === 'POST') {
      posts.push(req.postDataJSON());
      return route.fulfill({ json: { ok: true, rank: { all: 7, daily: 2 } } });
    }
    if (boardStatus !== 200) return route.fulfill({ status: boardStatus, json: { error: 'offline' } });
    return route.fulfill({ json: { board: url.searchParams.get('board'), mode: url.searchParams.get('mode'), day: '2026-10-17', entries: ENTRIES } });
  });
  return posts;
}

test('the title trophy opens the board, tabs switch, and your initials are highlighted', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 5000, initials: 'CLD' })));
  await mockApi(page);
  await page.goto(APP);
  await page.locator('#btnOpenLeaderboard').click();
  await expect(page.locator('#boardList .board-row')).toHaveCount(3);
  await expect(page.locator('#boardList .board-row.me')).toContainText('CLD');
  await expect(page.locator('#dailyTitle')).not.toBeEmpty();
  const req = page.waitForRequest((r) => r.url().includes('board=daily') && r.url().includes('mode=DAILY'));
  await page.locator('.board-tab[data-mode="DAILY"]').click();
  await req;
  await expect(page.locator('.board-tab[data-mode="DAILY"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#btnCloseLeaderboard').click();
  await expect(page.locator('#leaderboardModal')).toBeHidden();
  expect(problems).toEqual([]);
});

test('an offline board says so instead of failing', async ({ page }) => {
  await mockApi(page, { boardStatus: 503 });
  await page.goto(APP);
  await page.locator('#btnOpenLeaderboard').click();
  await expect(page.locator('#boardStatus')).toContainText('OFFLINE');
});

test('first run asks for initials once, posts the run, then later runs post themselves', async ({ page }) => {
  const problems = watchPage(page);
  const posts = await mockApi(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' })); // a track race (PLAY is Endless, 0150)
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__OT.GameState.score = 123456; window.__OT.finishRun(); });
  await expect(page.locator('#initialsForm')).toBeVisible();
  await page.locator('#initialsInput').fill('cld');
  await page.locator('#btnSubmitScore').click();
  await expect(page.locator('#endRankText')).toContainText('#7 ALL-TIME · #2 TODAY');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ token: 'tok-1', initials: 'CLD', score: 123456, mode: 'ARCADE', level: 0 });
  expect(posts[0].durationMs).toBeGreaterThan(0);

  await page.locator('#btnPlayAgain').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__OT.GameState.score = 2000; window.__OT.finishRun(); });
  await expect(page.locator('#endRankText')).toContainText('ALL-TIME');
  await expect(page.locator('#initialsForm')).toBeHidden();
  expect(posts).toHaveLength(2);
  expect(problems).toEqual([]);
});

test('the daily challenge plays today\'s level and posts to the DAILY board', async ({ page }) => {
  const posts = await mockApi(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 1, initials: 'CLD', selectedLevel: 0 })));
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenLeaderboard').click();
  await page.locator('#btnPlayDaily').click();
  const st = await page.evaluate(() => ({ status: window.__OT.GameState.status, daily: window.__OT.GameState.daily, level: window.__OT.GameState.levelIndex }));
  expect(st.status).toBe('PLAYING');
  expect(st.daily).not.toBeNull();
  expect(st.level).toBe(st.daily.levelIndex);
  await page.evaluate(() => { window.__OT.GameState.score = 4321; window.__OT.finishRun(); });
  await expect(page.locator('#endMedalText')).toContainText('DAILY');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].mode).toBe('DAILY');
  expect(posts[0].level).toBe(st.daily.levelIndex);
});
