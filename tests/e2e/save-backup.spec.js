// Save backup code (ticket 0296): Settings → BACKUP copies the save as a code; after the storage is
// wiped, pasting it back (and confirming) brings the coins, cars and settings back. A damaged code
// is refused with a plain message and leaves the save alone. Fits and works at 390x844 touch and
// 1280x720 mouse/keyboard; the boxes are labelled for screen readers.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const PLAYED = {
  onboarded: true, fluxCoins: 4321, bestScore: 55555, initials: 'ZED',
  garage: { owned: ['FLUX_COUPE_88', 'PASS_RUNNER_86', 'BULLDOG_VAN'], selected: 'BULLDOG_VAN', paint: {} },
  career: { races: 12, wins: 3, takedowns: 0, warps: 4, rivalsBeaten: 0, dailyStreak: 0, lastDailyDay: '' },
  settings: { hud: 'large', difficulty: 'hard' },
};

/** Seed once per test (sessionStorage flag), so a reload sees what the game wrote, not the seed. */
async function seeded(page, save) {
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(k, v);
  }, [KEY, JSON.stringify(save)]);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
}

async function openBackup(page) {
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  const sec = page.locator('#setBackup');
  await sec.scrollIntoViewIfNeeded();
  return sec;
}

const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

for (const vp of [
  { name: 'phone 390x844 touch', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: 'desktop 1280x720', viewport: { width: 1280, height: 720 } },
]) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.viewport, hasTouch: !!vp.hasTouch, isMobile: !!vp.isMobile });

    test('copy the code, wipe storage, paste it back: coins, cars and settings return', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      const problems = watchPage(page);
      await seeded(page, PLAYED);
      const sec = await openBackup(page);

      // Labelled boxes (screen readers) and touch-sized buttons.
      await expect(page.getByLabel('Paste a save code')).toBeVisible();
      for (const id of ['#btnSaveCopy', '#btnSaveRestore']) {
        const b = await page.locator(id).boundingBox();
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      const box = await sec.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.viewport.width);

      await page.locator('#btnSaveCopy').click();
      const out = page.getByLabel('Your save code');
      await expect(out).toBeVisible();
      const code = await out.inputValue();
      expect(code).toMatch(/^OT88\.1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
      await expect(page.locator('#saveBackupMsg')).not.toHaveText('');
      await page.screenshot({ path: test.info().outputPath('backup-copied.png') });

      // A new phone / a cleared browser: only defaults left.
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
      expect(await saved(page)).toBeNull();
      await openBackup(page);

      // A damaged code (checksum cut off) is refused; nothing asks to confirm, nothing is written.
      await page.locator('#saveCodeIn').fill(code.slice(0, -4));
      await page.locator('#btnSaveRestore').click();
      await expect(page.locator('#saveBackupMsg')).toHaveText(/isn't a save code|incomplete|changed/);
      await expect(page.locator('#saveRestoreConfirm')).toBeHidden();
      expect(await saved(page)).toBeNull();

      // The real code asks first; KEEP MINE backs out.
      await page.locator('#saveCodeIn').fill(`${code.slice(0, 30)}\n${code.slice(30)}`); // a notes app's line break
      await page.locator('#btnSaveRestore').click();
      await expect(page.locator('#saveRestoreConfirm')).toBeVisible();
      await expect(page.locator('#saveRestoreAsk')).toContainText(/with the code's \(4,321 coins · \d+ cars · 12 races\)/);
      await page.screenshot({ path: test.info().outputPath('backup-confirm.png') });
      await page.locator('#btnSaveRestoreNo').click();
      await expect(page.locator('#saveRestoreConfirm')).toBeHidden();
      expect(await saved(page)).toBeNull();

      // Confirm: the page reloads on the restored save.
      await page.locator('#btnSaveRestore').click();
      await Promise.all([page.waitForEvent('load'), page.locator('#btnSaveRestoreYes').click()]);
      await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
      const after = await saved(page);
      expect(after.fluxCoins).toBe(4321);
      expect(after.bestScore).toBe(55555);
      expect(after.garage.owned).toEqual(expect.arrayContaining(PLAYED.garage.owned));
      expect(after.garage.selected).toBe('BULLDOG_VAN');
      expect(after.career.races).toBe(12);
      expect(after.settings.hud).toBe('large');
      expect(after.settings.difficulty).toBe('hard');
      // The restored settings are live, not just stored.
      expect(await page.evaluate(() => document.querySelector('[data-hud-size="large"]') !== null)).toBe(true);
      expect(problems).toEqual([]);
    });
  });
}

test('keyboard only: Tab reaches the paste box and the buttons, Enter restores', async ({ page }) => {
  const problems = watchPage(page);
  await seeded(page, PLAYED);
  await openBackup(page);
  await page.locator('#btnSaveCopy').focus();
  await page.keyboard.press('Enter');
  const code = await page.locator('#saveCodeOut').inputValue();
  expect(code.startsWith('OT88.1.')).toBe(true);
  await page.evaluate((k) => { const d = JSON.parse(localStorage.getItem(k)); d.fluxCoins = 1; localStorage.setItem(k, JSON.stringify(d)); }, KEY);

  await page.locator('#saveCodeIn').focus();
  await page.keyboard.insertText(code);
  await page.keyboard.press('Tab');
  await expect(page.locator('#btnSaveRestore')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#btnSaveRestoreNo')).toBeFocused(); // the safe choice has focus
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#btnSaveRestoreYes')).toBeFocused();
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
  expect((await saved(page)).fluxCoins).toBe(4321);
  expect(problems).toEqual([]);
});
