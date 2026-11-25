// Ghost racing after 0306: src/ghost.js is its own chunk handed to the race step (useGhost), and the
// race step's armGhost arms the ghost at the start. RESTART RACE (0292) must race the same ghost
// again (RS.lastGhost), so this drives that path end to end. compete.spec.js covers RACE YOUR BEST.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';
import { createBackend } from './backend.js';

test('RESTART RACE re-races the ghost you chose from the results', async ({ page }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const problems = watchPage(page);
  await backend.attach(page);
  await page.addInitScript(() => { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD', bestScore: 1, onboarded: true })); });
  await page.goto(`${APP}?debug`);
  await expect(page.locator('#racerPillName')).toHaveText('CLD', { timeout: 15000 });
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(6000); // the server keeps a ghost only for a run of 5 s or more
  await page.evaluate(() => { const G = window.__OT.GameState; G.finishTime = G.raceTime; G.score = 300000; window.__OT.finishRun(); });
  await page.locator('#endRankCard .rank-ghost').click();
  await expect(page.locator('#hudGhost')).toContainText('👻 CLD', { timeout: 5000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#btnRestartRace')).toBeVisible({ timeout: 15000 });
  await page.locator('#btnRestartRace').click();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  await expect(page.locator('#hudGhost')).toContainText('👻 CLD', { timeout: 5000 });
  expect(problems).toEqual([]);
});
