// Landscape start lights (ticket 0248): on a phone held sideways (under 480 px tall) the start
// lights card is one slim row docked above the road's horizon, so the car, the lane band and the
// traffic just ahead stay visible while the lights count down and at GO. Lamps, the count and the
// launch prompt all still show, unclipped, and the card never stacks with another text: on the
// shortest screens (under ~375 px) it sits just under the level banner instead, and a launch call
// at GO takes the lane from it. Desktop and portrait phones keep their card.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Samples every frame from the first red light until the card goes: the card's box (with its
 *  parts) and every other text on screen it could stack with (the announcer pill, the coach card,
 *  the HUD cards), plus the car (GameState.carBox, CSS px: the 2D canvas fills the view at 0,0). */
function sampleLights(page) {
  return page.evaluate(() => new Promise((done) => {
    const box = (n) => {
      if (!n || !n.getClientRects().length || getComputedStyle(n).visibility !== 'visible') return null;
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      if (a < 0.05) return null;
      const r = n.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const out = [];
    let seen = false;
    const t0 = performance.now();
    const tick = () => {
      try {
        const el = document.getElementById('rcLights');
        const card = box(el);
        if (card) {
          seen = true;
          const gs = window.__OT.GameState;
          const c = gs.carBox;
          const hint = document.getElementById('rcHint');
          out.push({
            state: el.dataset.state,
            card,
            bulbs: [...el.querySelectorAll('.rc-bulbs i')].map(box),
            count: box(document.getElementById('rcCount')),
            countText: document.getElementById('rcCount').textContent,
            hint: box(hint),
            hintText: hint.textContent,
            others: ['announcerMain', 'coachCard', 'hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard']
              .map((id) => ({ id, b: box(document.getElementById(id)) })).filter((o) => o.b),
            car: c.x1 > c.x0 ? { l: c.x0, t: c.y0, r: c.x1, b: c.y1 } : null,
            horizon: innerHeight * 0.46 - (gs.loopPitchOffset || 0) * (innerHeight / 420),
            vw: innerWidth,
            vh: innerHeight,
          });
        } else if (seen || performance.now() - t0 > 20_000) { done(out); return; }
        requestAnimationFrame(tick);
      } catch (e) { done([{ error: String(e) }]); }
    };
    requestAnimationFrame(tick);
  }));
}

async function toLights(page, { press = false } = {}) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '3', { timeout: 10_000 });
  const frames = sampleLights(page);
  if (press) { // jump the lights: race-flow calls it at GO with a two-line pill
    await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '2', { timeout: 10_000 });
    await page.keyboard.press('Space');
  }
  return frames;
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, b) => Boolean(a && b) && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

/** Every frame: the card is whole, on screen, and never under or over another text. */
function expectSlim(frames, { go = true } = {}) {
  expect(frames[0]?.error).toBeUndefined();
  expect(frames.some((f) => f.state === '3')).toBe(true);
  expect(frames.some((f) => f.state === 'go')).toBe(go);
  for (const f of frames) {
    expect(f.card.b - f.card.t).toBeLessThanOrEqual(0.35 * f.vh);
    expect(f.card.l).toBeGreaterThanOrEqual(0);
    expect(f.card.r).toBeLessThanOrEqual(f.vw);
    expect(f.bulbs).toHaveLength(3);
    for (const b of f.bulbs) expect(inside(b, f.card)).toBe(true);
    expect(inside(f.count, f.card)).toBe(true);
    expect(inside(f.hint, f.card)).toBe(true);
    expect(f.hintText).toMatch(/ROCKET START$/);
    for (const o of f.others) expect(overlaps(f.card, o.b), `${f.state}: card over #${o.id}`).toBe(false);
  }
  if (go) expect(frames.find((f) => f.state === 'go').countText).toBe('GO!');
  // The card holds still from 3 to GO (no jump as the count changes width).
  const [a, z] = [frames[0].card, frames[frames.length - 1].card];
  expect(Math.abs(z.l - a.l)).toBeLessThanOrEqual(1);
  expect(Math.abs(z.t - a.t)).toBeLessThanOrEqual(1);
}

/** The ticket's sizes: the card also clears the car and the lane band (road centre ±25% of the
 *  width, from the horizon down). */
function expectClearOfRoad(frames) {
  for (const f of frames) {
    expect(overlaps(f.card, { l: f.vw * 0.25, r: f.vw * 0.75, t: f.horizon, b: f.vh })).toBe(false);
    if (f.car) expect(overlaps(f.card, f.car)).toBe(false);
  }
  expect(frames.some((f) => f.car)).toBe(true);
}

for (const [w, h, road] of [[844, 390, true], [667, 375, true], [740, 360, false], [568, 320, false]]) {
  test.describe(`landscape phone ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test(`the lights are a slim row${road ? ' above the horizon, clear of the car and lane' : ' under the banner'}, through GO`, async ({ page }) => {
      const problems = watchPage(page);
      const frames = await toLights(page);
      expectSlim(frames);
      if (road) expectClearOfRoad(frames);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('landscape phone 844x390, a jumped start', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the launch call at GO takes the lane and the card steps aside', async ({ page }) => {
    const problems = watchPage(page);
    const frames = await toLights(page, { press: true });
    expectSlim(frames, { go: false }); // the card went at GO: the call's two-line pill has the lane
    expect(await page.evaluate(() => window.__OT.GameState.launchResult)).toBe('early');
    await expect(page.locator('#announcerMain')).toHaveClass(/has-sub/);
    await expect(page.locator('#rcLights')).toBeHidden();
    expect(problems).toEqual([]);
  });
});

// The card on desktop and portrait phones, as measured on main before 0248 (±1 px). On a portrait
// phone the grid's beats move the card up and down (0215), so only its width is pinned there.
const UNCHANGED = [
  { w: 1280, h: 720, card: { l: 393, t: 283, r: 887, b: 507 } },
  { w: 390, h: 844, phone: true, card: { l: 16, r: 374 } },
];

for (const u of UNCHANGED) {
  test.describe(`${u.w}x${u.h}`, () => {
    test.use({ viewport: { width: u.w, height: u.h }, ...(u.phone ? { hasTouch: true, isMobile: true } : {}) });

    test('keeps the big stacked card', async ({ page }) => {
      const problems = watchPage(page);
      const frames = await toLights(page);
      const m = frames.find((f) => f.state === '3');
      if (u.card) {
        for (const k of Object.keys(u.card)) expect(Math.abs(m.card[k] - u.card[k])).toBeLessThanOrEqual(1);
      }
      // Stacked: lamps above the count above the prompt, full-size count.
      expect(m.bulbs[0].b).toBeLessThanOrEqual(m.count.t + 1);
      expect(m.count.b).toBeLessThanOrEqual(m.hint.t + 1);
      expect(m.count.b - m.count.t).toBeGreaterThan(50);
      expect(problems).toEqual([]);
    });
  });
}
