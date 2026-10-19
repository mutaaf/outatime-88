// Home flow (ticket 0185): every end state comes back to the home screen in one clear tap (or
// by itself), Back never traps you or re-launches a race, and the home screen says why to play.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
const RETURNING = { onboarded: true, bestScore: 42000, fluxCoins: 600, endless: { bestDistance: 3880, bestTier: 2, runs: 6 } };
const G = (page, fn, arg) => page.evaluate(fn, arg);
const status = (page) => G(page, () => window.__OT.GameState.status);

async function boot(page, save = RETURNING, query = '') {
  if (save) await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('booted')) { localStorage.setItem(k, s); sessionStorage.setItem('booted', '1'); } }, [SAVE_KEY, JSON.stringify(save)]);
  await page.goto(`${APP}?debug${query}`);
  await page.waitForFunction(() => window.__OT && window.__OT.home());
}

/** Start a solo Endless run and end it straight to the results. */
async function finishARun(page) {
  await G(page, () => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
  await expect.poll(() => status(page)).toBe('PLAYING');
  await G(page, () => window.__OT.finishRun());
  await expect(page.locator('#gameOverModal')).toBeVisible();
}

async function expectHome(page) {
  await expect(page.locator('#titleScreen')).toBeVisible();
  await expect(page.locator('#gameOverModal')).toBeHidden();
  expect(await status(page)).toBe('TITLE');
  await expect(page.locator('#homeHooks .home-hook').first()).toBeVisible();
}

test('results: PLAY AGAIN is the big button and HOME is right beside it', async ({ page }) => {
  const problems = watchPage(page);
  await boot(page);
  await finishARun(page);
  await expect(page.locator('#btnPlayAgain')).toHaveText(/PLAY AGAIN/);
  await expect(page.locator('#btnHomeFromEnd')).toBeInViewport({ ratio: 1 });
  await page.locator('#btnHomeFromEnd').click();
  await expectHome(page);
  // Nothing from the race lingers: no race step running, no level-up art over the title.
  const d0 = await G(page, () => window.__OT.GameState.distance);
  await page.waitForTimeout(400);
  expect(await G(page, () => window.__OT.GameState.distance)).toBe(d0);
  await expect(page.locator('#levelUpBanner')).toBeHidden();
  expect(problems).toEqual([]);
});

test('results go home by themselves when nobody touches them (not while typing initials)', async ({ page }) => {
  await boot(page, RETURNING, '&homeIdle=1200');
  await finishARun(page);
  await expect(page.locator('#btnHomeFromEnd')).toHaveClass(/is-idle/);
  await expectHome(page);
  // Half-typed initials hold it (an empty, auto-focused box doesn't).
  await finishARun(page);
  await G(page, () => { document.getElementById('initialsForm').classList.remove('hidden'); });
  await page.locator('#initialsInput').fill('AB');
  await page.locator('#initialsInput').focus();
  await page.waitForTimeout(2000);
  await expect(page.locator('#gameOverModal')).toBeVisible();
});

test('Escape on the results goes home; Enter plays again', async ({ page }) => {
  await boot(page);
  await finishARun(page);
  await page.keyboard.press('Escape');
  await expectHome(page);
  await expect(page.locator('#garageModal')).toBeHidden(); // Escape no longer opens the garage here
  await finishARun(page);
  await page.locator('#endModalTitle').click(); // focus off the buttons
  await page.keyboard.press('Enter');
  await expect.poll(() => status(page)).toBe('PLAYING');
});

test('browser Back: from the results it is home; mid-race it pauses; it never re-launches a race', async ({ page }) => {
  await boot(page);
  await finishARun(page);
  await page.goBack();
  await expectHome(page);
  expect(page.url()).toContain('/outatime/');
  await page.waitForTimeout(300);
  expect(await status(page)).toBe('TITLE');
  // Mid-race, Back is the pause menu and the game is still here.
  await G(page, () => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
  await expect.poll(() => status(page)).toBe('PLAYING');
  await page.goBack();
  await expect.poll(() => status(page)).toBe('PAUSED');
  expect(page.url()).toContain('/outatime/');
  await expect(page.locator('#garageModal [data-home]')).toBeVisible();
});

test('a deep-linked race comes home to a plain title, and Back does not start it again', async ({ page }) => {
  await boot(page, RETURNING, '&play=daily');
  expect(page.url()).not.toContain('play=daily');
  await page.locator('#btnStartRace').click();
  await expect.poll(() => G(page, () => !!window.__OT.GameState.daily)).toBe(true);
  await G(page, () => window.__OT.finishRun());
  await page.locator('#btnHomeFromEnd').click();
  await expectHome(page);
  expect(await G(page, () => window.__OT.GameState.daily)).toBeNull();
  await page.goBack().catch(() => {});
  await page.waitForTimeout(400);
  expect(await G(page, () => window.__OT && window.__OT.GameState.status)).not.toBe('PLAYING');
});

test('pause menu: QUIT TO HOME ends the run and lands on the title', async ({ page }) => {
  await boot(page);
  await G(page, () => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
  await expect.poll(() => status(page)).toBe('PLAYING');
  await page.keyboard.press('Escape'); // pause (the garage)
  await expect(page.locator('#garageModal')).toBeVisible();
  await page.locator('#garageModal [data-home]').click();
  await expectHome(page);
  // On the title the quit buttons are gone (there's nothing to quit).
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal [data-home]')).toBeHidden();
});

test('a gamepad drives the menus: A plays, B goes home from the results', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, index: 0, id: 'test pad', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
  });
  await boot(page);
  const press = async (i) => {
    await G(page, (b) => { window.__pad.buttons[b].pressed = true; }, i);
    await page.waitForTimeout(120);
    await G(page, (b) => { window.__pad.buttons[b].pressed = false; }, i);
    await page.waitForTimeout(120);
  };
  await press(0);
  await expect.poll(() => status(page)).toBe('PLAYING');
  await G(page, () => window.__OT.finishRun());
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await press(1);
  await expectHome(page);
});

test('home screen: a returning racer gets live, personal hooks; tapping one acts on it', async ({ page }) => {
  const problems = watchPage(page);
  await boot(page);
  const hooks = page.locator('#homeHooks .home-hook');
  await expect(hooks).toHaveCount(4);
  // 600 coins buys the 500-coin van: that's the first reason.
  await expect(hooks.first()).toHaveAttribute('data-hook', 'car');
  await expect(hooks.first()).toContainText('BUY IT NOW');
  await expect(page.locator('[data-hook="daily"]')).toContainText(/LEFT|NEW ROAD/);
  await expect(page.locator('[data-hook="best"]')).toContainText('3,880 m');
  // The old text lines make way for the cards (their elements still exist).
  await expect(page.locator('#titleMissions')).toBeHidden();
  await page.locator('[data-hook="daily"]').click();
  await expect.poll(() => G(page, () => !!window.__OT.GameState.daily && window.__OT.GameState.status)).toBe('PLAYING');
  expect(problems).toEqual([]);
});

test('home screen: a first visit gets the three-beat pitch over a live demo drive', async ({ page }) => {
  await boot(page, null);
  await expect(page.locator('.home-pitch li')).toHaveCount(3);
  await expect(page.locator('.home-pitch')).toContainText('LEVEL UP FOREVER.');
  await expect(page.locator('#homeHooks .home-hook')).toHaveCount(0);
  // The attract road has a driver: the car moves across the lanes on its own.
  const xs = [];
  for (let i = 0; i < 6; i++) { xs.push(await G(page, () => window.__OT.GameState.playerX)); await page.waitForTimeout(300); }
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.05);
  // ...and a race starts from the centre, untouched by the demo.
  await page.locator('#btnStartRace').click();
  await expect.poll(() => status(page)).toBe('PLAYING');
  expect(Math.abs(await G(page, () => window.__OT.GameState.playerX))).toBeLessThan(0.05);
});

// Every phone, tablet and desktop shape: the cards (or the pitch) sit fully on screen and never
// cover PLAY, the other title buttons or the corner icons.
const SHAPES = [[390, 844], [360, 640], [430, 932], [844, 390], [740, 360], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [1366, 1024], [1280, 800], [1280, 720]];
const TITLE_UI = '#titleWordmark, #btnRacer, #btnStartRace, #btnOpenLive, #btnTitleTilt, #btnViewMode, #offlinePill, .title-icon';
test.describe('fit', () => {
  test.use({ hasTouch: true }); // phones and tablets: the TILT chip is on the title too
  for (const [width, height] of SHAPES) {
    for (const first of [false, true]) {
      test(`home ${first ? 'pitch' : 'hooks'} fit at ${width}x${height} with no overlaps`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await boot(page, first ? null : RETURNING);
        const sel = first ? '.home-pitch li' : '#homeHooks .home-hook';
        await expect(page.locator(sel).first()).toBeVisible();
        await page.waitForTimeout(first ? 2200 : 700); // entrance animations settle
        const { mine, ui } = await page.evaluate(([s, t]) => {
          const box = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, x: r.x, y: r.y, w: r.width, h: r.height }; };
          const vis = (e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
          return { mine: [...document.querySelectorAll(s)].filter(vis).map(box), ui: [...document.querySelectorAll(t)].filter(vis).map(box) };
        }, [sel, TITLE_UI]);
        expect(mine.length).toBeGreaterThan(0);
        const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        for (const m of mine) {
          expect(m.x, `${m.id} left`).toBeGreaterThanOrEqual(0);
          expect(m.y, `${m.id} top`).toBeGreaterThanOrEqual(0);
          expect(m.x + m.w, `${m.id} right`).toBeLessThanOrEqual(width + 0.5);
          expect(m.y + m.h, `${m.id} bottom`).toBeLessThanOrEqual(height + 0.5);
          for (const u of ui) expect(hit(m, u), `${m.id} covers ${u.id}`).toBe(false);
        }
      });
    }
  }
});
