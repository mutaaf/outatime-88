// Share your result (ticket 0053): a personalised card with a live preview, native share with
// the image where allowed, copy-link and save-image fallbacks, and challenge links.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

async function finishFirst(page) {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'ACE', onboarded: true, bestScore: 1 })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 10; g.speed = 140; });
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#sharePreview')).toHaveAttribute('src', /^blob:/, { timeout: 8000 });
}

test('no share sheet API: the sheet opens with the card, COPY LINK and SAVE IMAGE work', async ({ page, context }) => {
  const problems = watchPage(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  await finishFirst(page);
  await expect(page.locator('#btnShare')).toBeInViewport();
  await page.locator('#btnShare').click();
  await expect(page.locator('#shareSheet')).toBeVisible();
  await expect(page.locator('#btnShareNative')).toBeHidden();
  const dims = await page.locator('#shareSheetImg').evaluate((i) => new Promise((r) => (i.complete ? r([i.naturalWidth, i.naturalHeight]) : (i.onload = () => r([i.naturalWidth, i.naturalHeight])))));
  expect(dims).toEqual([1080, 1350]);
  await page.locator('#btnShareCopy').click();
  await expect(page.locator('#shareStatus')).toContainText('COPIED');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/\/outatime\/\?track=1&beat=\d+\.\d&by=ACE/);
  await page.locator('[data-format="wide"]').click();
  await expect(page.locator('#shareSheetImg')).toHaveAttribute('data-format', 'wide');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btnShareSave').click()]);
  expect(dl.suggestedFilename()).toMatch(/^outatime-\d(st|nd|rd|th)-.+\.png$/);
  const path = await dl.path();
  expect((await import('node:fs')).statSync(path).size).toBeGreaterThan(20000);
  expect(problems).toEqual([]);
});

test('with the share sheet API: one tap shares the PNG with a brag and the challenge link', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = (d) => Boolean(d && d.files);
    navigator.share = async (d) => { window.__shared = { text: d.text, title: d.title, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }; };
  });
  await finishFirst(page);
  await page.locator('#btnShare').click();
  await expect.poll(() => page.evaluate(() => window.__shared)).not.toBe(null);
  const s = await page.evaluate(() => window.__shared);
  expect(s.files[0]).toMatchObject({ type: 'image/png' });
  expect(s.files[0].size).toBeGreaterThan(20000);
  expect(s.text).toMatch(/beat me\?.*track=1&beat=/);
  await expect(page.locator('#shareSheet')).toBeHidden();
  expect(problems).toEqual([]);
});

test('a challenge link shows who to beat on the title and races their track in one tap', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&track=2&beat=62.3&by=zed`);
  await expect(page.locator('#challengeBanner')).toBeVisible();
  await expect(page.locator('#challengeText')).toHaveText('ZED CHALLENGES YOU: BEAT 1:02.3');
  await page.locator('#btnAcceptChallenge').click();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  expect(await page.evaluate(() => window.__OT.GameState.levelIndex)).toBe(1);
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 10; g.speed = 140; });
  await expect(page.locator('#endHeadline')).toContainText(/YOU BEAT ZED'S 1:02.3/, { timeout: 8000 });
  expect(problems).toEqual([]);
});

test('a broken challenge link is ignored', async ({ page }) => {
  await page.goto(`${APP}?track=99&beat=nope`);
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await expect(page.locator('#challengeBanner')).toBeHidden();
});
