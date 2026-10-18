// Readability (ticket 0002): one message lane, and a phone HUD that leaves the road visible.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const intersects = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function visibleBox(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    let n = el;
    while (n) { if (parseFloat(getComputedStyle(n).opacity) < 0.05) return null; n = n.parentElement; }
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`announcement and coach never overlap at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForTimeout(400); // coach shows its opening tip
    await page.evaluate(() => window.__OT.announce('⚡ 88 MPH TIME WARP! ➔ 1985 ⚡', 'ERA SHIFT', 1500));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(120);
      const ann = await visibleBox(page, '#announcerMain');
      const coach = await visibleBox(page, '#coachCard');
      expect(ann).not.toBeNull();
      expect(intersects(ann, coach)).toBeFalsy();
    }
    expect(problems).toEqual([]);
  });
}

test('phone HUD takes at most 18% of the screen height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.waitForTimeout(500);
  const box = await page.locator('header').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844 * 0.18);
  // On phones the settings gear (sound, tilt, pause) is the HUD's last button (ticket 0050).
  const gear = await page.locator('#btnHudSettings').boundingBox();
  expect(gear.x + gear.width).toBeLessThanOrEqual(390); // nothing hangs off the right edge
});

// Ticket 0019: a fork is a compact two-arrow cue (a word or two each), the coach steps aside
// while it is up even with a hazard to teach ahead, and neither the cue nor the announcement
// covers the player car.
const pinOnFork = (page, playerX) => page.evaluate((x) => {
  const { GameState, track } = window.__OT;
  const seg = track().segments.find((s) => s.trackType === 'SPLIT_FORK');
  GameState.trackPos = seg.p1.world.z + (seg.p2.world.z - seg.p1.world.z) * 4 - 1250; // tyres on the fork
  GameState.playerX = x;
  GameState.playerVX = 0;
}, playerX);

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a fork shows one compact cue and no coach at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForTimeout(400); // the coach shows its opening tip
    // A fresh low laser just ahead: without the fork rule the coach would teach it.
    await page.evaluate(() => {
      const { GameState } = window.__OT;
      GameState.lessonsCleared.jump = 0;
      const t = window.__OT.traffic();
      const seg = window.__OT.track().segments.find((s) => s.trackType === 'SPLIT_FORK');
      t.obstacles.push(t.createObstacleBody(t.obstacles.length, 'LOW_LASER_BAR', seg.p1.world.z + 2400, 0.5));
    });
    for (let i = 0; i < 10; i++) {
      const x = i < 5 ? -0.3 : 0.3;
      await pinOnFork(page, x);
      await page.waitForTimeout(120);
      if (i === 7) await page.evaluate(() => window.__OT.announce('FLUX CRATE!', '+10 FLUX', 1500));
      expect(await page.evaluate(() => window.__OT.GameState.forkPending)).toBe(true);
      const left = await visibleBox(page, '#forkLeftCard');
      const right = await visibleBox(page, '#forkRightCard');
      expect(left).not.toBeNull();
      expect(right).not.toBeNull();
      if (i >= 3) expect(await visibleBox(page, '#coachCard')).toBeNull(); // after its fade-out
      // The branch you're lined up for leans forward, and it follows you across.
      const lean = await page.evaluate(() => ['forkLeftCard', 'forkRightCard'].map((id) => document.getElementById(id).classList.contains('fork-lean')));
      expect(lean).toEqual(x < 0 ? [true, false] : [false, true]);
      const ann = await visibleBox(page, '#announcerMain');
      for (const card of [left, right]) {
        // Compact, not banner-sized: under a third of the screen wide, one line tall.
        expect(card.width).toBeLessThanOrEqual(vp.width * 0.33);
        expect(card.height).toBeLessThanOrEqual(40);
        expect(intersects(card, ann)).toBeFalsy();
        expect(card.y + card.height).toBeLessThanOrEqual(vp.height * 0.6); // the car sits at ~86%
      }
      const fit = await page.evaluate(() => ['forkLeftCard', 'forkRightCard'].map((id) => {
        const el = document.getElementById(id);
        return { overflow: el.scrollWidth - el.clientWidth, words: el.textContent.split(/\s+/).filter((w) => /[A-Z]/.test(w)).length };
      }));
      for (const f of fit) { expect(f.overflow).toBeLessThanOrEqual(0); expect(f.words).toBeLessThanOrEqual(2); }
    }
    expect(problems).toEqual([]);
  });
}

test('a race that ends on a fork does not carry the cue into the next start', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForTimeout(300);
  await pinOnFork(page, -0.3);
  await page.waitForTimeout(150);
  expect(await visibleBox(page, '#forkLeftCard')).not.toBeNull();
  await page.evaluate(() => { window.__OT.finishRun(); window.__OT.startRace({ intro: true }); });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.getElementById('forkChoiceBanner').classList.contains('hidden'))).toBe(true);
  expect(problems).toEqual([]);
});
