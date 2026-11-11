// Touch button names (ticket 0266): mid-race on a phone, every button in the touch layer has a
// spoken name in words (sentence case, not an emoji or a shouted abbreviation), and the live
// state names (WARP ready, NOS on) follow the same rule.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = JSON.stringify({ bestScore: 1, controls: { coachSeen: true } });

test('every touch button has a spoken name in words', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const problems = watchPage(page);
  await page.addInitScript((s) => localStorage.setItem('outatime_cruisn_88_save_v2', s), SAVE);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => document.querySelectorAll('#touchControlsLayer [role="button"]').length >= 10);
  const names = await page.evaluate(() => [...document.querySelectorAll('#touchControlsLayer [role="button"], #touchControlsLayer button')]
    .map((b) => ({ id: b.id, name: b.getAttribute('aria-label') || '' })));
  expect(names.length).toBeGreaterThanOrEqual(10);
  for (const { id, name } of names) {
    expect(name, id).toMatch(/^[A-Z][a-z]/);
    expect(name, id).not.toBe(name.toUpperCase());
  }
  const byId = Object.fromEntries(names.map((n) => [n.id, n.name]));
  expect(byId.tcPause).toBe('Pause');
  expect(new Set(names.map((n) => n.name)).size).toBe(names.length);
  expect(problems).toEqual([]);
  await ctx.close();
});
