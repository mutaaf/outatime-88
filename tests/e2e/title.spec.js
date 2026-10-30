// Title identity (pillar 1) and one-tap start (ticket 0022): PLAY is on screen everywhere,
// one tap anywhere races, and a new player is taught to steer in the race itself.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test(`START is fully visible on load at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(APP);
    const box = await page.locator('#btnStartRace').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await expect(page.locator('#titleWordmark')).toBeInViewport();
    expect(problems).toEqual([]);
  });
}

test('how-to-play starts collapsed and opens on tap', async ({ page }) => {
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  const details = page.locator('#howToPlay');
  expect(await details.evaluate((d) => d.open)).toBe(false);
  await details.locator('summary').click();
  expect(await details.evaluate((d) => d.open)).toBe(true);
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`one tap anywhere on the title starts a race at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    // Few things to read: PLAY, RACE FRIENDS (live races, 0060), five small icons (settings
    // added in 0050), the 2D/3D chip (0040, operator request), the racer/stats chip (0090), and
    // the TILT chip on touch only.
    const buttons = await page.locator('#titleScreen button:visible').count();
    expect(buttons).toBeLessThanOrEqual(9);
    // Tap the empty middle of the screen (the car on the road), not a button.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect(page.locator('#titleScreen')).toBeHidden();
    expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });
}

test('Enter starts a race from the title; the icons open their panels instead', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(page.locator('#startModal')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('TITLE');
  await page.locator('#btnCloseEvents').click();
  await expect(page.locator('#startModal')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING'); // once the race step is in (0170)
});

test('a new player gets a steer prompt that leaves once they steer', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('#steerHint')).toBeHidden();
});

test('a returning player is not prompted', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 5000 })));
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await expect(page.locator('#steerHint')).toBeHidden();
});

// Ticket 0192: the title's road cruises along with the hero car. The race field is parked and
// traffic/obstacles stay at least TITLE_GAP (3000) ahead, so nothing drives up beside the star,
// with or without reduced motion. Screenshots go into the report (not pixel-diffed).
for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  for (const reduce of [false, true]) {
    test(`the title keeps the road clear of the hero car at ${vp.width}x${vp.height}${reduce ? ' (reduced motion)' : ''}`, async ({ page }, info) => {
      const problems = watchPage(page);
      await page.setViewportSize(vp);
      if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${APP}?debug`);
      await page.waitForFunction(() => window.__OT && window.__OT.home());
      const clearance = () => page.evaluate(() => {
        const T = window.__OT.traffic();
        const pz = window.__OT.GameState.trackPos + 1250; // ROAD_CFG.playerZOffset
        let near = Infinity;
        for (const b of [...T.traffic, ...T.obstacles, ...T.props.live]) if (!b.takenDown) near = Math.min(near, b.worldZ - pz);
        return { near, parked: T.racers.every((r) => r.takenDown), pos: window.__OT.GameState.trackPos };
      });
      // Roll past where the semi used to sit beside the hero car (trackPos ~3550) and beyond.
      const seen = [];
      for (const pos of [1500, 3600, 8000]) {
        await page.waitForFunction((p) => window.__OT.GameState.trackPos > p, pos, { timeout: 30000 });
        seen.push(await clearance());
      }
      for (const c of seen) {
        expect(c.parked).toBe(true);
        expect(c.near).toBeGreaterThanOrEqual(2990);
      }
      await info.attach(`title-${vp.width}x${vp.height}${reduce ? '-reduced' : ''}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(problems).toEqual([]);
    });
  }
}

// Ticket 0208: on desktop shapes the title's text (hook cards or the first-visit pitch, the
// offline pill, every button and label) stays off the hero car. The car's rect is
// GameState.carBox (drawPlayerCar, canvas pixels), sampled over a few frames as the attract
// driver weaves; the offline pill is forced on (service workers are blocked in e2e).
const RETURNING_SAVE = { onboarded: true, bestScore: 42000, fluxCoins: 600, endless: { bestDistance: 3880, bestTier: 2, runs: 6 } };
// 1366x657 is a 1366x768 laptop's browser window; the challenge case adds a friend's banner above PLAY.
const HERO_CASES = [];
for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 1366, height: 657 }]) {
  for (const first of [false, true]) HERO_CASES.push({ vp, first, challenge: false });
}
HERO_CASES.push({ vp: { width: 1280, height: 720 }, first: false, challenge: true });
for (const { vp, first, challenge } of HERO_CASES) {
  {
    test(`title text stays off the hero car at ${vp.width}x${vp.height} (${first ? 'first visit' : 'returning'}${challenge ? ', challenge banner' : ''})`, async ({ page }, info) => {
      const problems = watchPage(page);
      await page.setViewportSize(vp);
      if (!first) await page.addInitScript((s) => localStorage.setItem('outatime_cruisn_88_save_v2', s), JSON.stringify(RETURNING_SAVE));
      await page.goto(`${APP}?debug`);
      await page.waitForFunction(() => window.__OT && window.__OT.home());
      await expect(page.locator(first ? '.home-pitch li' : '#homeHooks .home-hook').first()).toBeVisible();
      await page.evaluate(() => { const p = document.getElementById('offlinePill'); p.textContent = '✈️ READY FOR OFFLINE'; p.classList.remove('hidden'); });
      if (challenge) await page.evaluate(() => { document.getElementById('challengeText').textContent = 'BEAT ACE · 1:23.4'; document.getElementById('challengeTrack').textContent = 'NEON STRIP'; document.getElementById('challengeBanner').classList.remove('hidden'); });
      await page.waitForTimeout(2400); // the cards' and the pitch's entrance animations settle
      const car = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < 6; i++) {
        await nextFrames(page, 3);
        const b = await page.evaluate(() => {
          const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect(), k = r.width / c.width, q = r.height / c.height;
          const b = window.__OT.GameState.carBox;
          return { x0: r.left + b.x0 * k, y0: r.top + b.y0 * q, x1: r.left + b.x1 * k, y1: r.top + b.y1 * q };
        });
        car.x0 = Math.min(car.x0, b.x0); car.y0 = Math.min(car.y0, b.y0); car.x1 = Math.max(car.x1, b.x1); car.y1 = Math.max(car.y1, b.y1);
      }
      // The car sits in the lower middle of the screen (a sanity check on the hook itself).
      expect(car.x1 - car.x0).toBeGreaterThan(vp.width * 0.2);
      expect(car.y0).toBeGreaterThan(vp.height * 0.4);
      const boxes = await page.evaluate(() => {
        const vis = (e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
        const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const els = [...document.querySelectorAll('#titleScreen *')].filter((e) => vis(e) && (own(e) || e.matches('button, .home-hook, .home-pitch li')));
        return els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || String(e.className).slice(0, 40) || e.textContent.trim().slice(0, 20), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
      });
      expect(boxes.some((b) => b.id === 'offlinePill')).toBe(true);
      for (const b of boxes) {
        const hit = b.x0 < car.x1 && car.x0 < b.x1 && b.y0 < car.y1 && car.y0 < b.y1;
        expect(hit, `${b.id} [${b.x0 | 0},${b.y0 | 0} → ${b.x1 | 0},${b.y1 | 0}] covers the car [${car.x0 | 0},${car.y0 | 0} → ${car.x1 | 0},${car.y1 | 0}]`).toBe(false);
      }
      // PLAY stays the biggest target, and nothing scrolls.
      const play = await page.locator('#btnStartRace').boundingBox();
      for (const b of boxes.filter((b) => b.id !== 'btnStartRace' && !/wordmark/.test(b.id))) expect((b.x1 - b.x0) * (b.y1 - b.y0), b.id).toBeLessThan(play.width * play.height);
      expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach(`title-hero-${vp.width}x${vp.height}${first ? '-first' : ''}${challenge ? '-challenge' : ''}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(problems).toEqual([]);
    });
  }
}

// Ticket 0226: on a phone on its side (≤ 430 px tall) the title's controls sit above and beside
// the hero car instead of stacking over it: at most 30% of carBox is under a title control or
// text, every control stays on screen, ≥ 44x44 px and clear of the others, and nothing scrolls.
for (const vp of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
  test.describe(`landscape phone title at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });
    for (const [first, challenge] of [[false, false], [true, false], [false, true]]) {
      test(`the hero car stays in view (${first ? 'first visit' : 'returning'}${challenge ? ', challenge banner' : ''})`, async ({ page }, info) => {
        const problems = watchPage(page);
        if (!first) await page.addInitScript((s) => localStorage.setItem('outatime_cruisn_88_save_v2', s), JSON.stringify(RETURNING_SAVE));
        await page.goto(`${APP}?debug`);
        await page.waitForFunction(() => window.__OT && window.__OT.home());
        await expect(page.locator(first ? '.home-pitch li' : '#homeHooks .home-hook').first()).toBeVisible();
        await expect(page.locator('#btnTitleTilt')).toBeVisible(); // touch screens get the TILT chip
        await page.evaluate(() => { const p = document.getElementById('offlinePill'); p.textContent = '✈️ READY FOR OFFLINE'; p.classList.remove('hidden'); });
        if (challenge) await page.evaluate(() => { document.getElementById('challengeText').textContent = 'BEAT ACE · 1:23.4'; document.getElementById('challengeTrack').textContent = 'NEON STRIP'; document.getElementById('challengeBanner').classList.remove('hidden'); });
        await page.waitForTimeout(2400); // entrance animations settle
        const car = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (let i = 0; i < 6; i++) {
          await nextFrames(page, 3);
          const b = await page.evaluate(() => {
            const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect(), k = r.width / c.width, q = r.height / c.height;
            const b = window.__OT.GameState.carBox;
            return { x0: r.left + b.x0 * k, y0: r.top + b.y0 * q, x1: r.left + b.x1 * k, y1: r.top + b.y1 * q };
          });
          car.x0 = Math.min(car.x0, b.x0); car.y0 = Math.min(car.y0, b.y0); car.x1 = Math.max(car.x1, b.x1); car.y1 = Math.max(car.y1, b.y1);
        }
        expect(car.x1 - car.x0).toBeGreaterThan(vp.width * 0.2);
        expect(car.y0).toBeGreaterThan(vp.height * 0.4);
        const { boxes, controls } = await page.evaluate(() => {
          const vis = (e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
          const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const box = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || String(e.className).slice(0, 40) || e.textContent.trim().slice(0, 20), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
          const els = [...document.querySelectorAll('#titleScreen *')].filter((e) => vis(e) && (own(e) || e.matches('button, .home-hook, .home-pitch li')));
          return { boxes: els.map(box), controls: [...document.querySelectorAll('#titleScreen button, #titleScreen .home-hook, #titleScreen .home-pitch li, #challengeBanner')].filter(vis).map(box) };
        });
        // Share of the car under any title control or text (sampled on a 2 px grid, union of boxes).
        let n = 0, hit = 0;
        for (let x = car.x0; x < car.x1; x += 2) for (let y = car.y0; y < car.y1; y += 2) {
          n++;
          if (boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) hit++;
        }
        const covered = boxes.filter((b) => b.x0 < car.x1 && car.x0 < b.x1 && b.y0 < car.y1 && car.y0 < b.y1).map((b) => b.id);
        expect(hit / n, `car [${car.x0 | 0},${car.y0 | 0} → ${car.x1 | 0},${car.y1 | 0}] covered by ${covered.join(', ')}`).toBeLessThanOrEqual(0.3);
        for (const c of controls) {
          expect(c.x0, c.id).toBeGreaterThanOrEqual(0);
          expect(c.y0, c.id).toBeGreaterThanOrEqual(0);
          expect(c.x1, c.id).toBeLessThanOrEqual(vp.width);
          expect(c.y1, c.id).toBeLessThanOrEqual(vp.height);
          if (c.id.startsWith('btn')) {
            expect(c.x1 - c.x0, c.id).toBeGreaterThanOrEqual(44);
            expect(c.y1 - c.y0, c.id).toBeGreaterThanOrEqual(44);
          }
        }
        for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i], b = controls[j];
          if ([a.id, b.id].sort().join() === 'btnAcceptChallenge,challengeBanner') continue; // the banner holds its RACE button
          const overlap = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
        expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
        await info.attach(`title-landscape-${vp.width}x${vp.height}${first ? '-first' : ''}${challenge ? '-challenge' : ''}`, { body: await page.screenshot(), contentType: 'image/png' });
        expect(problems).toEqual([]);
      });
    }
  });
}
