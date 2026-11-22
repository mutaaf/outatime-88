// Ticket 0299: Settings → GAMEPAD BUTTONS → STICK DEADZONE (SMALL / NORMAL / LARGE). The choice is
// the radius main's stick shaping uses (src/input.js shapeAxis), a preview shows the left stick over
// a ring at that radius, and the choice persists; an old save and a junk value load as NORMAL.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

/** A connected pad with its left stick at `x`, and a save with `settings` (seeded once, so a reload keeps what the page saved). */
const fakePad = (page, { settings = {}, x = 0.2 } = {}) => page.addInitScript(([key, s, ax]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true }, settings: s }));
    sessionStorage.setItem('seeded', '1');
  }
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [ax, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
}, [SAVE_KEY, settings, x]);

const savedDead = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings.padDead, SAVE_KEY);
const steer = (page) => page.evaluate(() => window.__OT.padSteer());
const seg = (page, v) => page.locator(`[data-setting="padDead"] button[data-value="${v}"]`);
const ringPx = (page) => page.locator('#setPadDeadView .pdz-ring').evaluate((e) => e.getBoundingClientRect().width);
const dotX = (page) => page.locator('#setPadDeadView .pdz-dot').evaluate((e) => {
  const d = e.getBoundingClientRect(), v = e.parentElement.getBoundingClientRect();
  return (d.left + d.width / 2) - (v.left + v.width / 2);
});

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('LARGE swallows a 0.2 drift, NORMAL steers it; preview ring and dot follow; persists', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await page.goto(`${APP}?debug`);
      await page.evaluate(() => window.__OT.ready());
      expect(await steer(page), 'NORMAL (default) steers a 0.2 stick').toBeGreaterThan(0);

      await page.locator('#btnOpenSettings').click();
      await expect(seg(page, 'normal')).toHaveAttribute('aria-pressed', 'true');
      await seg(page, 'normal').scrollIntoViewIfNeeded();
      const normalRing = await ringPx(page);
      await expect(page.locator('#setPadDeadRead')).toHaveText('Stick at 20%: steering.');
      await expect(page.locator('#setPadDeadView')).toHaveAttribute('data-in', 'false');
      await expect.poll(() => dotX(page)).toBeGreaterThan(5); // 0.2 of a 48 px radius, to the right

      await seg(page, 'large').click();
      await expect(seg(page, 'large')).toHaveAttribute('aria-pressed', 'true');
      await expect(seg(page, 'normal')).toHaveAttribute('aria-pressed', 'false');
      expect(await savedDead(page)).toBe('large');
      expect(await steer(page), 'LARGE: a 0.2 stick steers nothing').toBe(0);
      await expect(page.locator('#setPadDeadRead')).toHaveText('Stick at 20%: inside the deadzone, no steering.');
      await expect(page.locator('#setPadDeadView')).toHaveAttribute('data-in', 'true');
      expect(await ringPx(page)).toBeGreaterThan(normalRing + 5);
      const box = await page.locator('#setPadDeadView').evaluate((e) => e.clientWidth);
      expect(Math.abs(await ringPx(page) - 0.22 * box), 'the ring is drawn at the real radius').toBeLessThan(1.5);
      expect(Math.abs(normalRing - 0.12 * box)).toBeLessThan(1.5);
      await expect(seg(page, 'large')).toBeFocused();
      await page.screenshot({ path: `test-results/pad-deadzone-${vp.width}.png` });

      // The dot follows the stick live: push it left.
      await page.evaluate(() => { window.__pad.axes[0] = -0.9; });
      await expect.poll(() => dotX(page)).toBeLessThan(-30);
      await nextFrames(page, 10);
      await expect(seg(page, 'large'), 'trying the stick on the preview does not move the menu focus').toBeFocused();
      await expect(page.locator('#setPadDeadRead')).toHaveText('Stick at 90%: steering.');
      expect(await steer(page)).toBeLessThan(-0.85); // (0.68 / 0.74) ** 1.35
      await page.evaluate(() => { window.__pad.axes[0] = -1; });
      expect(await steer(page), 'full lock at the rim').toBe(-1);
      await page.evaluate(() => { window.__pad.axes[0] = 0.2; });

      await seg(page, 'small').click();
      await page.evaluate(() => { window.__pad.axes[0] = 0.08; });
      const small = await steer(page);
      expect(small, 'SMALL: 0.08 steers a little').toBeGreaterThan(0);
      expect(small).toBeLessThan(0.05);
      expect(await ringPx(page)).toBeLessThan(normalRing);
      await page.evaluate(() => { window.__pad.axes[0] = 0.2; });

      // A reload keeps it: the panel's chunk applies it at boot, before Settings is opened.
      await seg(page, 'large').click();
      await page.locator('#btnSettingsDone').click();
      await page.reload();
      await page.evaluate(() => window.__OT.ready());
      await expect.poll(() => steer(page), { message: 'LARGE applied at boot' }).toBe(0);
      await page.locator('#btnOpenSettings').click();
      await expect(seg(page, 'large')).toHaveAttribute('aria-pressed', 'true');
      await seg(page, 'normal').click();
      expect(await steer(page)).toBeGreaterThan(0);
      expect(await savedDead(page), 'NORMAL is stored as unset').toBeUndefined();
      expect(problems).toEqual([]);
    });
  });
}

test('a junk deadzone in the save loads as NORMAL', async ({ page }) => {
  const problems = watchPage(page);
  await fakePad(page, { settings: { padDead: 'enormous' } });
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.locator('#btnOpenSettings').click();
  await expect(seg(page, 'normal')).toHaveAttribute('aria-pressed', 'true');
  expect(await steer(page)).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('no pad: the preview says to connect one', async ({ page }) => {
  await page.addInitScript(() => { navigator.getGamepads = () => []; });
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#setPadDeadRead')).toHaveText('Connect a gamepad to see its left stick here.');
  await expect(page.locator('#setPadDeadView')).toHaveAttribute('data-pad', 'false');
});
