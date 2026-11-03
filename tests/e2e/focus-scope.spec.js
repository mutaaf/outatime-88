// Menus keep keyboard focus inside and hand it back when they close (ticket 0207): Settings,
// Garage and Ranks opened from the title with the keyboard take focus, Tab and Shift+Tab never
// leave them, and closing (✕/DONE or Escape) puts focus back on the button that opened them.
// A pause mid-race must not leave focus on a menu button the race keys could press.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const MENUS = [
  { name: 'Settings', opener: '#btnOpenSettings', modal: '#settingsModal', close: '#btnSettingsDone' },
  { name: 'Garage', opener: '#btnOpenGarageFromTitle', modal: '#garageModal', close: '#btnCloseGarage' },
  { name: 'Ranks', opener: '#btnOpenLeaderboard', modal: '#leaderboardModal', close: '#btnCloseLeaderboard' },
];

/** Where focus is: inside the modal, which element, and whether it is the opener. */
const where = (page, modal, opener) => page.evaluate(([m, o]) => {
  const a = document.activeElement;
  return { inside: !!a && document.querySelector(m).contains(a), opener: a === document.querySelector(o), id: a ? (a.id || a.tagName) : null };
}, [modal, opener]);

/** Put focus on `sel` the way a keyboard player gets there: with Tab (Shift+Tab, Tab). */
async function tabTo(page, sel) {
  await page.focus(sel);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate((s) => document.activeElement === document.querySelector(s), sel)).toBe(true);
}

/** The home flow (src/home.js, lazy) wires the scopes; wait for it like a player would. */
const homeReady = (page) => page.waitForFunction(() => document.querySelector('#homeHooks')?.childElementCount > 0);

async function tabAround(page, menu) {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const w = await where(page, menu.modal, menu.opener);
    expect(w.inside, `${menu.name}: Tab ${i + 1} left the menu for ${w.id}`).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    const w = await where(page, menu.modal, menu.opener);
    expect(w.inside, `${menu.name}: Shift+Tab ${i + 1} left the menu for ${w.id}`).toBe(true);
  }
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`title menus keep and return keyboard focus at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await homeReady(page);
    for (const menu of MENUS) {
      for (const how of ['button', 'Escape']) {
        await tabTo(page, menu.opener);
        await page.keyboard.press('Enter');
        await expect(page.locator(menu.modal), `${menu.name} opens from Enter on its button`).toBeVisible();
        await expect.poll(async () => (await where(page, menu.modal, menu.opener)).inside, { message: `${menu.name}: focus moves in` }).toBe(true);
        expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('TITLE');
        await tabAround(page, menu);
        if (how === 'button') { await page.focus(menu.close); await page.keyboard.press('Enter'); }
        else await page.keyboard.press('Escape');
        await expect(page.locator(menu.modal), `${menu.name} closes by ${how}`).toBeHidden();
        await expect.poll(async () => (await where(page, menu.modal, menu.opener)).opener, { message: `${menu.name} (${how}): focus back on the opener` }).toBe(true);
        expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('TITLE');
      }
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

test('pausing a race with Escape traps focus in the sheet and gives the race its keys back', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
  await expect.poll(async () => (await where(page, '#garageModal', 'body')).inside).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect((await where(page, '#garageModal', 'body')).inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeHidden();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  // Nothing on screen keeps focus, so Space/Enter drive the car instead of pressing a button.
  const active = await page.evaluate(() => document.activeElement === document.body || !document.activeElement);
  expect(active).toBe(true);
  expect(problems).toEqual([]);
});

test('inside Settings the keyboard still binds keys: Enter and Space reach the key row', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await tabTo(page, '#btnOpenSettings');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settingsModal')).toBeVisible();
  const up = page.locator('[data-key-action="up"]');
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(up).toHaveText(/PRESS A KEY/);
  await page.keyboard.press('Enter'); // a game key: refused with a note, still capturing
  await expect(page.locator('#setKeysNote')).toContainText('game key');
  await expect(up).toHaveText(/PRESS A KEY/);
  await page.keyboard.press('Space'); // boost's key: refused too, the button is not pressed
  await expect(page.locator('#setKeysNote')).toContainText(/SPACE|Space/);
  await expect(up).toHaveText(/PRESS A KEY/);
  await page.keyboard.press('KeyO');
  await expect(up).toHaveText('O');
  expect(problems).toEqual([]);
});

test('Garage → Events moves focus into Events', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await tabTo(page, '#btnOpenGarageFromTitle');
  await page.keyboard.press('Enter');
  await expect(page.locator('#garageModal')).toBeVisible();
  await page.focus('#btnChangeEventFromGarage');
  await page.keyboard.press('Enter');
  await expect(page.locator('#startModal')).toBeVisible();
  await expect.poll(async () => (await where(page, '#startModal', 'body')).inside).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect((await where(page, '#startModal', 'body')).inside).toBe(true);
  }
  expect(problems).toEqual([]);
});

test('a mouse player who closes a menu still races with Enter', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await page.locator('#btnOpenLeaderboard').click();
  await expect(page.locator('#leaderboardModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#leaderboardModal')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
});
