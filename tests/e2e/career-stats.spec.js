// Career stats (ticket 0278): Settings from the title shows five read-only counters from the
// one save key (races, wins, warps, best chain, distance); they survive a reload, a corrupt
// save shows zeros, the type stays at the 10 px floor and the section fits 320 px.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

/** Seed the save once per test (a reload keeps what the game wrote), then wait for the title. */
async function seeded(page, raw) {
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (v != null) localStorage.setItem(k, v);
  }, [KEY, raw]);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
}

async function openStats(page) {
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#statsList dd')).toHaveCount(5);
  return page.locator('#setStats');
}

const values = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#statsList > div')]
  .map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])));

test('a finished race counts: RACES 1 after the race, still 1 after a reload', async ({ page }) => {
  const problems = watchPage(page);
  await seeded(page, JSON.stringify({ onboarded: true }));
  await openStats(page);
  let v = await values(page);
  expect(v).toEqual({ RACES: '0', WINS: '0', WARPS: '0', 'BEST CHAIN': '0', DISTANCE: '0.0 MI' });
  await page.locator('#btnSettingsDone').click();
  await expect(page.locator('#settingsModal')).toBeHidden();

  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page, { minTime: 0.5 });
  await page.evaluate(() => { const g = window.__OT.GameState; g.bestStreak = 7; g.distance = g.raceLength - 20; g.speed = 120; });
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'FINISHED');
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 15000 });
  await page.locator('#btnHomeFromEnd').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'TITLE');

  await openStats(page);
  v = await values(page);
  expect(v.RACES).toBe('1');
  expect(Number(v['BEST CHAIN'])).toBeGreaterThanOrEqual(7); // a near-miss in the roll-out can add to it
  expect(v.DISTANCE).not.toBe('0.0 MI');

  await page.reload();
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
  await openStats(page);
  const after = await values(page);
  expect(after).toEqual(v);
  expect(problems).toEqual([]);
});

test('a corrupt save shows zeros and the page still boots clean', async ({ page }) => {
  const problems = watchPage(page);
  await seeded(page, '{"career": {"races": "lots", "wins": -3, "bestChain": null}, broken');
  await openStats(page);
  expect(await values(page)).toEqual({ RACES: '0', WINS: '0', WARPS: '0', 'BEST CHAIN': '0', DISTANCE: '0.0 MI' });
  expect(problems).toEqual([]);
});

test('corrupt fields in a valid save show zero, real ones show', async ({ page }) => {
  await seeded(page, JSON.stringify({ onboarded: true, career: { races: 'lots', wins: 4, warps: -2, bestChain: { x: 1 } } }));
  await openStats(page);
  expect(await values(page)).toEqual({ RACES: '0', WINS: '4', WARPS: '0', 'BEST CHAIN': '0', DISTANCE: '0.0 MI' });
});

test('mid-race pause leads with the run: no career stats there', async ({ page }) => {
  await seeded(page, JSON.stringify({ onboarded: true }));
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.evaluate(() => window.__OT.pause());
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#setStats')).toBeHidden();
});

test('keyboard: Tab reaches the stats, Escape closes, focus goes back to the gear', async ({ page }) => {
  await seeded(page, JSON.stringify({ onboarded: true, career: { races: 3 } }));
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#statsList dd')).toHaveCount(5);
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'setStats');
  }
  expect(reached).toBe(true);
  await expect(page.locator('#setStats')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btnOpenSettings');
});

for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test(`fits ${vp.width}x${vp.height} with big numbers, type never under 10px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await seeded(page, JSON.stringify({ onboarded: true, career: { races: 123456, wins: 98765, warps: 4321098, bestChain: 9999, distance: 987654321 } }));
    const sec = await openStats(page);
    await sec.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const bad = await page.evaluate(() => {
      const out = [];
      const box = document.getElementById('setStats').getBoundingClientRect();
      for (const el of document.querySelectorAll('#setStats h3, #statsList dt, #statsList dd')) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 10) out.push(`${el.textContent} ${fs}px`);
        // Every line of text (not just the element's box) stays inside its cell and the section.
        const cell = el.closest('#statsList > div') || document.getElementById('setStats');
        const c = cell.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getClientRects();
        if (el.tagName === 'DD' && lines.length !== 1) out.push(`${el.textContent} wraps`); // a number never splits
        for (const r of lines) {
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.left < box.left || r.right > box.right) out.push(`${el.textContent} overflows`);
        }
      }
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      return out;
    });
    expect(bad).toEqual([]);
  });
}

test('gamepad: the D-pad lands on the stats, B closes and focus goes back to the gear', async ({ page }) => {
  await page.addInitScript(() => {
    const btn = () => ({ pressed: false, value: 0 });
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
    navigator.getGamepads = () => [pad];
    // A tap held for three game frames, never long enough to reach the 350 ms menu repeat.
    const left = {};
    window.__tap = (i) => { pad.buttons[i] = { pressed: true, value: 1 }; left[i] = 3; };
    const loop = () => {
      for (const k in left) if (--left[k] <= 0) { pad.buttons[k] = btn(); delete left[k]; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await seeded(page, JSON.stringify({ onboarded: true, controls: { coachSeen: true }, career: { races: 2 } }));
  await openStats(page);
  // Wait for Settings to settle on DONE (it focuses it once the panel chunk lands), then start
  // one step before the stats so a single D-pad press has to land on them.
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btnSettingsDone');
  await page.evaluate(() => document.querySelector('#settingsModal [data-open-racer]').focus());
  await page.evaluate(() => window.__tap(13)); // D-pad down
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('setStats');
  await expect(page.locator('#setStats')).toBeInViewport();
  await page.evaluate(() => window.__tap(1)); // B
  await expect(page.locator('#settingsModal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btnOpenSettings');
});
