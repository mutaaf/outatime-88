// Street sound (ticket 0193): the synthesized tuner layer and the music director run in a real
// race, react to the start, NOS and a drift, and the MUSIC STYLE setting switches the score.
// Everything is checked on audio state, never on wall-clock timing.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const audio = (page, fn) => page.evaluate(fn);

test('the tuner layer and the music director follow the start, NOS and a drift, with no errors', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click(); // a real gesture: the AudioContext may start
  await page.waitForFunction(() => { const a = window.__OT.audio(); return a.tuner && a.scheduler; }, null, { timeout: 20_000 });
  // On the grid the director plays the build (or the race is already under way).
  await page.waitForFunction(() => { const a = window.__OT.audio(); return a.scheduler.cue === 'build' || window.__OT.GameState.racePhase !== 'START'; }, null, { timeout: 20_000 });
  await racing(page);
  await audio(page, () => window.__OT.audio().setMusicStyle('street'));
  // A street track takes over on the next bar line.
  await expect.poll(() => audio(page, () => window.__OT.audio().scheduler.cue), { timeout: 15_000 }).toMatch(/^(phonk|trap|edm)$/);
  expect(await audio(page, () => window.__OT.audio().tuner.st.active)).toBe(true);
  expect(await audio(page, () => window.__OT.audio().tuner.st.wind)).toBeGreaterThan(0);

  // NOS: the burn is seen by the layer and the music closes down into the tunnel.
  await page.keyboard.down('ArrowUp');
  await audio(page, () => { const g = window.__OT.GameState; g.invulnTimer = 30; g.speed = 95; });
  await page.keyboard.down('Shift');
  await expect.poll(() => audio(page, () => window.__OT.audio().tuner.st.prevNos), { timeout: 8000 }).toBe(true);
  expect(await audio(page, () => window.__OT.audio().tuner.st.nosOpens)).toBeGreaterThan(0);
  await expect.poll(() => audio(page, () => window.__OT.audio().musicLP.frequency.value), { timeout: 5000 }).toBeLessThan(10_000);
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

  // SYNTHWAVE hands the score back to the synthwave scheduler.
  await audio(page, () => window.__OT.audio().setMusicStyle('synthwave'));
  await expect.poll(() => audio(page, () => window.__OT.audio().scheduler.cue), { timeout: 15_000 }).toBe('synthwave');
  expect(await audio(page, () => window.__OT.audio().tuner.live)).toBeLessThanOrEqual(14);
  expect(problems).toEqual([]);
});

test('Settings → MUSIC STYLE switches the score and is remembered', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').first().click();
  const seg = page.locator('[data-setting="musicStyle"]');
  await expect(seg.locator('button[data-value="auto"]')).toHaveAttribute('aria-pressed', 'true');
  await seg.locator('button[data-value="street"]').click();
  await expect(seg.locator('button[data-value="street"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await audio(page, () => window.__OT.audio().musicStyle)).toBe('street');
  await page.reload();
  await page.waitForFunction(() => window.__OT && window.__OT.audio);
  expect(await audio(page, () => [window.__OT.audio().musicStyle, window.__OT.save().settings.musicStyle])).toEqual(['street', 'street']);
  expect(problems).toEqual([]);
});
