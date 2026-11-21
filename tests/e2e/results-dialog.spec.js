// The results card is a labelled dialog (ticket 0294): it has a dialog role, a name and
// aria-modal, focus lands on PLAY AGAIN as it opens (without scrolling the card), Tab and
// Shift+Tab stay on the card, the status line speaks place and time once, and HOME hands
// focus to the title's PLAY. No visible change: the summary line is screen-reader only.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

async function finish(page, vp, save = { onboarded: true, initials: 'CLD' }) {
  const problems = watchPage(page);
  await page.setViewportSize(vp);
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, JSON.stringify(s)); } }, [KEY, save]);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(300); // the field is placed, so the finish order has rows
  // A known place and time; a score that unlocks nothing (a car reveal would take focus).
  await page.evaluate(() => {
    const g = window.__OT.GameState;
    g.score = 734210;
    g.finishTime = 102.3;
    window.__OT.finishRun();
  });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#endPodium li').first()).toBeVisible();
  return problems;
}

test('the results card is a named modal dialog with focus on PLAY AGAIN', async ({ page }) => {
  const problems = await finish(page, { width: 1280, height: 720 });
  const dialog = page.getByRole('dialog', { name: /./ }).filter({ has: page.locator('#btnPlayAgain') });
  await expect(dialog).toHaveCount(1);
  await expect(page.locator('#gameOverModal')).toHaveAttribute('aria-modal', 'true');
  const name = await page.evaluate(() => document.getElementById(document.getElementById('gameOverModal').getAttribute('aria-labelledby')).textContent.trim());
  expect(name.length).toBeGreaterThan(3);
  await expect(page.locator('#btnPlayAgain')).toBeFocused();
  // Focusing did not scroll the card.
  expect(await page.evaluate(() => document.getElementById('gameOverModal').scrollTop)).toBe(0);

  // The status line names place and time, once.
  const place = await page.evaluate(() => window.__OT.GameState.lastResult.place);
  const total = await page.evaluate(() => window.__OT.GameState.lastResult.total);
  const sfx = place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
  await expect(page.locator('#endSummary')).toHaveText(`FINISHED ${place}${sfx} OF ${total} · TIME 1:42.3`);
  await expect(page.locator('#endSummary')).toHaveAttribute('role', 'status');
  // The rank card refreshing (its own region) never rewrites the summary.
  const writes = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    new MutationObserver(() => { n++; }).observe(document.getElementById('endSummary'), { childList: true, characterData: true, subtree: true });
    setTimeout(() => res(n), 1500);
  }));
  expect(writes).toBe(0);
  expect(problems).toEqual([]);
});

test('Tab and Shift+Tab stay on the results card; HOME hands focus to the title PLAY', async ({ page }) => {
  const problems = await finish(page, { width: 1280, height: 720 });
  await expect(page.locator('#btnPlayAgain')).toBeFocused();
  const inside = () => page.evaluate(() => document.getElementById('gameOverModal').contains(document.activeElement));
  const count = await page.evaluate(() => [...document.getElementById('gameOverModal').querySelectorAll('button, [href], input')]
    .filter((b) => !b.disabled && b.getClientRects().length).length);
  const seen = new Set();
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(), `Tab ${i + 1}`).toBe(true);
    seen.add(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim()));
  }
  expect(seen.size).toBeGreaterThan(2); // it really moved, and wrapped
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
  }
  // Escape still goes home (0185), and focus lands on the title's PLAY.
  await page.keyboard.press('Escape');
  await expect(page.locator('#titleScreen')).toBeVisible();
  await expect(page.locator('#gameOverModal')).toBeHidden();
  await expect(page.locator('#btnStartRace')).toBeFocused();
  expect(problems).toEqual([]);
});

test('no initials yet: the initials box keeps focus, inside the dialog', async ({ page }) => {
  const problems = await finish(page, { width: 1280, height: 720 }, { onboarded: true });
  await expect(page.locator('#initialsInput')).toBeFocused();
  expect(problems).toEqual([]);
});

test('a held boost / Enter key repeating onto PLAY AGAIN does not start another race', async ({ page }) => {
  const problems = await finish(page, { width: 1280, height: 720 });
  await expect(page.locator('#btnPlayAgain')).toBeFocused();
  // A keyboard player (Tab moves focus), so a fresh Space / Enter would press the button.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#btnPlayAgain')).toBeFocused();
  // Trusted auto-repeat keydowns, as a key held down across the finish line sends.
  const cdp = await page.context().newCDPSession(page);
  for (const k of [{ key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }]) {
    for (let i = 0; i < 3; i++) await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', autoRepeat: true, ...k });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
  }
  await page.waitForTimeout(300);
  await expect(page.locator('#gameOverModal')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('GAMEOVER');
  expect(problems).toEqual([]);
});

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1280, height: 720 }]) {
  test(`the summary line takes no room at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = await finish(page, vp);
    const box = await page.locator('#endSummary').boundingBox();
    expect(box.width * box.height).toBeLessThanOrEqual(1);
    await expect(page.locator('#btnPlayAgain')).toBeFocused();
    expect(problems).toEqual([]);
  });
}
