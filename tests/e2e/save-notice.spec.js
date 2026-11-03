// A browser that cannot save (ticket 0213): private windows, blocked site data or a full quota
// lose medals and times on reload, so the first results card says so once, and play goes on.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

/** localStorage that reads but refuses every write, seeded with initials so the run posts. */
function blockStorage(page) {
  return page.addInitScript((key) => {
    // Records whether #saveNotice joined the tree empty (so a screen reader hears the text land).
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.id === 'saveNotice') window.__noticeEmptyAtInsert = n.textContent.replace('✕', '') === '';
    }).observe(document, { childList: true, subtree: true });
    localStorage.setItem(key, JSON.stringify({ initials: 'CLD', bestScore: 1, onboarded: true }));
    Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  }, KEY);
}

async function finish(page, score) {
  await page.evaluate((s) => { window.__OT.GameState.score = s; window.__OT.finishRun(); }, score);
  await expect(page.locator('#gameOverModal')).toBeVisible();
}

const rect = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; });

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`storage blocked: the first results say so once, announced, clear of the card (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const problems = watchPage(page);
    await blockStorage(page);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT?.startRace);

    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/outatime/api/scores'));
    await finish(page, 300000);
    const notice = page.locator('#saveNotice');
    await expect(notice).toHaveText(/Progress can't be saved in this browser/);
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(page.locator('#saveNotice')).toHaveCount(1);
    expect(await page.evaluate(() => window.__noticeEmptyAtInsert)).toBe(true);
    await expect(page.locator('#saveNotice [aria-hidden="true"]')).toHaveText(/💾/);
    await posted; // leaderboard posting is unchanged

    // Seen without scrolling on desktop and a portrait phone (a landscape phone's card scrolls),
    // and never on top of its neighbours.
    if (viewport.height < 500) await notice.scrollIntoViewIfNeeded();
    await expect(notice).toBeInViewport({ ratio: 1 });
    const n = await rect(page, '#saveNotice');
    for (const sel of ['#endMedalText', '.end-stats', '#endModalTitle', '#endPodiumBox', '#btnPlayAgain']) {
      const o = await rect(page, sel);
      const overlap = n.x < o.r && o.x < n.r && n.y < o.b && o.y < n.b;
      expect(overlap, `${sel} overlaps the notice`).toBe(false);
    }
    const close = page.locator('#saveNotice .save-notice-x');
    const box = await close.boundingBox();
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`save-notice-${viewport.width}.png`) });

    // Dismissible; and once per session: the next results card stays quiet.
    await close.click();
    await expect(page.locator('#saveNotice')).toHaveCount(0);
    await page.locator('#btnPlayAgain').click();
    await expect(page.locator('#gameOverModal')).toBeHidden();
    await finish(page, 400000);
    await expect(page.locator('#endScoreText')).toHaveText('400,000');
    await expect(page.locator('#saveNotice')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
}

test('the notice does not come back on a later results card even if never dismissed', async ({ page }) => {
  const problems = watchPage(page);
  await blockStorage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await finish(page, 1000);
  await expect(page.locator('#saveNotice')).toHaveText(/medals and times reset/);
  await page.locator('#btnPlayAgain').click();
  await expect(page.locator('#gameOverModal')).toBeHidden();
  await finish(page, 2000);
  await expect(page.locator('#saveNotice')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('storage working: no notice and no new DOM', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await finish(page, 1000);
  await expect(page.locator('#endScoreText')).toHaveText('1,000');
  await expect(page.locator('#saveNotice, .save-notice')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('leaving the results at once keeps the notice for the next results card', async ({ page }) => {
  const problems = watchPage(page);
  await blockStorage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  // PLAY AGAIN the moment the card (and its empty notice) appears: its text never landed on screen.
  await page.evaluate(() => {
    const mo = new MutationObserver(() => {
      if (!document.getElementById('saveNotice')) return;
      mo.disconnect();
      document.getElementById('btnPlayAgain').click();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.__OT.GameState.score = 1000;
    window.__OT.finishRun();
  });
  await expect(page.locator('#gameOverModal')).toBeHidden();
  await page.waitForTimeout(400); // past the notice's 100 ms text delay
  await expect(page.locator('#saveNotice')).toHaveCount(0);
  await finish(page, 2000);
  await expect(page.locator('#saveNotice')).toHaveText(/medals and times reset/);
  expect(problems).toEqual([]);
});
