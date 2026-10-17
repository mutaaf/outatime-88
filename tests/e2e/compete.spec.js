// Competition (ticket 0091) end to end against the real Worker handlers: the rank card after
// a run, the weekly board with your row, and the rival / "passed you" line on the title.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';
import { createBackend } from './backend.js';

// Runs shorter than 4 s are rejected by the server's plausibility check, so each run waits.
async function race(page, score) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4300);
  await page.evaluate((s) => { window.__OT.GameState.score = s; window.__OT.finishRun(); }, score);
}

test('after each run: your rank, how far you climbed, and exactly who to beat next', async ({ page }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const problems = watchPage(page);
  await backend.attach(page);
  backend.seed('ACE', 900000);
  backend.seed('BIF', 600000);
  backend.seed('DOC', 400000);
  await page.addInitScript(() => { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD', bestScore: 1, onboarded: true })); });
  await page.goto(`${APP}?debug`);
  await expect(page.locator('#racerPillName')).toHaveText('CLD', { timeout: 15000 });

  await race(page, 300000);
  const card = page.locator('#endRankCard .rank-card');
  await expect(card.locator('.rank-num')).toHaveText('#4');
  await expect(card.locator('.rank-move')).toHaveText('NEW');
  await expect(card.locator('.rank-target')).toContainText('100,000 BEHIND DOC FOR #3 THIS WEEK');

  await page.locator('#btnPlayAgain').click();
  await page.waitForTimeout(4300);
  await page.evaluate(() => { window.__OT.GameState.score = 500000; window.__OT.finishRun(); });
  await expect(card.locator('.rank-num')).toHaveText('#3');
  await expect(card.locator('.rank-move')).toHaveText('▲ 1');
  await expect(card.locator('.rank-pb')).toBeVisible();
  await expect(card.locator('.rank-target')).toContainText('100,000 BEHIND BIF FOR #2');

  await page.locator('#btnOpenLeaderboardFromEnd').click();
  await expect(page.locator('.board-tab[data-board="week"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#boardList .board-row')).toHaveCount(4);
  await expect(page.locator('#boardList .board-row.me')).toContainText('CLD');
  await expect(page.locator('#boardList .board-row.p1')).toContainText('ACE');
  await expect(page.locator('#boardSeason')).toContainText('SEASON ENDS IN');

  // Title, later: the rival line names who to chase; a newcomer who passes you is news.
  await page.goto(APP);
  await expect(page.locator('#titleRival')).toContainText('RIVAL BIF IS 100,000 AHEAD THIS WEEK');
  backend.seed('ZED', 700000, { at: Date.now() + 1000 });
  await page.waitForTimeout(1100);
  await page.reload();
  await expect(page.locator('#titleRival')).toContainText('ZED PASSED YOU');
  await expect(page.locator('#titleRival')).toContainText("#4");
  expect(problems).toEqual([]);
});

test('track and friends boards; your own row shows even outside the top ten', async ({ page }) => {
  const backend = createBackend();
  watchPage(page);
  await backend.attach(page);
  for (let i = 0; i < 12; i++) backend.seed(`A${String.fromCharCode(65 + i)}Z`, 900000 - i * 10000);
  backend.seed('CLD', 1000);
  backend.seed('TRK', 50000, { level: 2 });
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD', selectedLevel: 2, unlockedLevel: 5 })));
  await page.goto(APP);
  await page.locator('#btnOpenLeaderboard').click();
  await page.locator('.board-tab[data-board="all"]:not([data-track])').click();
  await expect(page.locator('#boardList .board-row')).toHaveCount(11);
  await expect(page.locator('#boardList .board-gap')).toHaveCount(1);
  await expect(page.locator('#boardList .board-row.me')).toContainText('CLD');
  await expect(page.locator('#boardList .board-row.me .rk')).toHaveText('#14'); // 12 + TRK (all tracks count all-time) above you
  await page.locator('.board-tab[data-track]').click();
  await expect(page.locator('#boardList .board-row')).toHaveCount(1);
  await expect(page.locator('#boardList .board-row')).toContainText('TRK');
  await expect(page.locator('#boardStatus')).toContainText('TRACK:');
  await page.locator('.board-tab[data-board="friends"]').click();
  await expect(page.locator('#boardStatus')).toContainText('NO FRIENDS HERE YET');
});

// The leaderboard modal on every phone/tablet shape: tabs, rows and buttons never overlap.
for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [1366, 1024]]) {
  test(`board fits without overlaps at ${width}x${height}`, async ({ page }) => {
    const backend = createBackend();
    const problems = watchPage(page);
    await backend.attach(page);
    for (let i = 0; i < 10; i++) backend.seed(`A${String.fromCharCode(65 + i)}Z`, 900000 - i * 10000);
    await page.setViewportSize({ width, height });
    await page.goto(APP);
    await page.locator('#btnOpenLeaderboard').click();
    await expect(page.locator('#boardList .board-row')).toHaveCount(10);
    await page.waitForTimeout(700); // let the row reveal finish
    const items = await page.evaluate(() => [...document.querySelectorAll('#leaderboardModal button, #leaderboardModal .board-row')]
      .filter((el) => el.getClientRects().length)
      .map((el) => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 14), x: r.x, y: r.y, w: r.width, h: r.height, btn: el.tagName === 'BUTTON' }; }));
    for (const a of items) {
      expect(a.x, a.t).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w, a.t).toBeLessThanOrEqual(width + 0.5);
      if (a.btn) expect(a.h, `${a.t} target`).toBeGreaterThanOrEqual(44);
      for (const b of items) {
        if (a === b) continue;
        expect(a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1, `${a.t} overlaps ${b.t}`).toBe(false);
      }
    }
    expect(problems).toEqual([]);
  });
}

test('opening a link with from=<racer> adds them to your FRIENDS board', async ({ page }) => {
  const backend = createBackend();
  const problems = watchPage(page);
  await backend.attach(page);
  backend.seed('ZED', 500000, { dev: 'zedzedzedzed' });
  backend.seed('ACE', 900000, { dev: 'aceaceaceace' });
  await page.goto(`${APP}?from=zedzedzedzed`);
  await expect.poll(() => backend.db.raw.prepare("SELECT friends FROM profiles").all().map((r) => r.friends).join()).toContain('zedzedzedzed');
  await page.locator('#btnOpenLeaderboard').click();
  await page.locator('.board-tab[data-board="friends"]').click();
  await expect(page.locator('#boardList .board-row')).toHaveCount(1);
  await expect(page.locator('#boardList .board-row')).toContainText('ZED');
  expect(problems).toEqual([]);
});

test('a finished race leaves a ghost, and you can race it from the results', async ({ page }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const problems = watchPage(page);
  await backend.attach(page);
  await page.addInitScript(() => { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD', bestScore: 1, onboarded: true })); });
  await page.goto(`${APP}?debug`);
  await expect(page.locator('#racerPillName')).toHaveText('CLD', { timeout: 15000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const G = window.__OT.GameState; G.finishTime = G.raceTime; G.score = 300000; window.__OT.finishRun(); });
  await expect(page.locator('#endRankCard .rank-ghost')).toHaveText('👻 RACE YOUR BEST');
  expect(backend.db.raw.prepare('SELECT initials FROM ghosts').all().map((r) => r.initials)).toEqual(['CLD']);

  await page.locator('#endRankCard .rank-ghost').click();
  await expect(page.locator('#gameOverModal')).toBeHidden();
  await expect(page.locator('#hudGhost')).toContainText('👻 CLD', { timeout: 5000 });
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const G = window.__OT.GameState; G.finishTime = 0.5; window.__OT.finishRun(); });
  await expect(page.locator('#announcerMain')).toContainText('GHOST');
  expect(problems).toEqual([]);
});
