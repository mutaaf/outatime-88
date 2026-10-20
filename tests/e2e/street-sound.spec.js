// Street sound (ticket 0193): the synthesized tuner layer runs in a real race and reacts to the
// start, NOS and a drift. Everything is checked on audio state, never on wall-clock timing.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const audio = (page, fn) => page.evaluate(fn);

test('the tuner layer follows the start, NOS and a drift, with no errors', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click(); // a real gesture: the AudioContext may start
  await page.waitForFunction(() => window.__OT.audio().tuner, null, { timeout: 20_000 });
  await racing(page);
  expect(await audio(page, () => window.__OT.audio().tuner.st.active)).toBe(true);
  expect(await audio(page, () => window.__OT.audio().tuner.st.wind)).toBeGreaterThan(0);

  // NOS: the layer sees the burn open (click, hiss, roar) and close (purge).
  await page.keyboard.down('ArrowUp');
  await audio(page, () => { const g = window.__OT.GameState; g.invulnTimer = 30; g.speed = 95; });
  await page.keyboard.down('Shift');
  await expect.poll(() => audio(page, () => window.__OT.audio().tuner.st.prevNos), { timeout: 8000 }).toBe(true);
  expect(await audio(page, () => window.__OT.audio().tuner.st.nosOpens)).toBeGreaterThan(0);
  await page.keyboard.up('Shift');
  await expect.poll(() => audio(page, () => window.__OT.audio().tuner.st.prevNos), { timeout: 8000 }).toBe(false);

  // A power drift: the squeal layer and the drift tone come up.
  await audio(page, () => {
    const g = window.__OT.GameState;
    window.__hold = setInterval(() => { g.speed = 80; g.playerY = 0; g.playerX = 0; g.playerVX = 0; }, 10);
  });
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(() => audio(page, () => { const s = window.__OT.audio().tuner.st; return s.squeal + s.drift; }), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await audio(page, () => clearInterval(window.__hold));

  expect(await audio(page, () => window.__OT.audio().tuner.live)).toBeLessThanOrEqual(14);
  expect(problems).toEqual([]);
});
