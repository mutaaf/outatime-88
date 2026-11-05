// Landscape start lights (ticket 0248): on a phone held sideways (under 480 px tall) the start
// lights card is one slim row docked above the road's horizon, so the car, the lane band and the
// traffic just ahead stay visible while the lights count down and at GO. Lamps, the count and the
// launch prompt all still show, unclipped. Desktop and portrait phones keep their card.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Starts level 1 from the lineup and, in one in-page step once the lights show `state`, returns
 *  the card's box with its parts, the level banner, the HUD cards and the car (GameState.carBox). */
async function measure(page, state) {
  return page.waitForFunction((state) => {
    const el = document.getElementById('rcLights');
    if (!el || !el.getClientRects().length || el.dataset.state !== state) return null;
    const box = (n) => {
      if (!n || !n.getClientRects().length || getComputedStyle(n).visibility !== 'visible') return null;
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      if (a < 0.05) return null;
      const r = n.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const gs = window.__OT.GameState;
    const c = gs.carBox;
    if (!(c.x1 > c.x0)) return null; // the car is drawn every frame; wait for the first
    const hint = document.getElementById('rcHint');
    return {
      card: box(el),
      bulbs: [...el.querySelectorAll('.rc-bulbs i')].map(box),
      count: box(document.getElementById('rcCount')),
      countText: document.getElementById('rcCount').textContent,
      hint: box(hint),
      hintText: hint.textContent,
      hintFits: hint.scrollWidth <= hint.clientWidth + 1 && hint.getBoundingClientRect().height < 2 * parseFloat(getComputedStyle(hint).fontSize) + 2,
      banner: box(document.getElementById('announcerMain')),
      hud: ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard'].map((id) => box(document.getElementById(id))).filter(Boolean),
      car: { l: c.x0, t: c.y0, r: c.x1, b: c.y1 },
      horizon: innerHeight * 0.46 - (gs.loopPitchOffset || 0) * (innerHeight / 420),
      vw: innerWidth,
      vh: innerHeight,
    };
  }, state, { timeout: 15_000, polling: 'raf' }).then((h) => h.jsonValue());
}

async function toLights(page) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const inside = (a, b) => Boolean(a && b) && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

function expectCompact(m) {
  const lane = { l: m.vw * 0.25, r: m.vw * 0.75, t: m.horizon, b: m.vh };
  expect(m.card).not.toBeNull();
  expect(overlaps(m.card, lane)).toBe(false);
  expect(overlaps(m.card, m.car)).toBe(false);
  expect(m.card.b - m.card.t).toBeLessThanOrEqual(0.35 * m.vh);
  expect(m.card.l).toBeGreaterThanOrEqual(0);
  expect(m.card.r).toBeLessThanOrEqual(m.vw);
  // Everything still shows, inside the card: three lamps, the count, the whole prompt on one line.
  expect(m.bulbs).toHaveLength(3);
  for (const b of m.bulbs) { expect(b).not.toBeNull(); expect(inside(b, m.card)).toBe(true); }
  expect(inside(m.count, m.card)).toBe(true);
  expect(inside(m.hint, m.card)).toBe(true);
  expect(m.hintText).toMatch(/ROCKET START$/);
  expect(m.hintFits).toBe(true);
  // One channel: never over the level banner or the HUD cards.
  expect(overlaps(m.card, m.banner)).toBe(false);
  for (const h of m.hud) expect(overlaps(m.card, h)).toBe(false);
}

for (const [w, h] of [[844, 390], [667, 375]]) {
  test.describe(`landscape phone ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('the lights are a slim row above the horizon, clear of the car and lane, through GO', async ({ page }) => {
      const problems = watchPage(page);
      await toLights(page);
      const red = await measure(page, '3');
      expectCompact(red);
      expect(red.countText).toBe('3');
      const go = await measure(page, 'go');
      expectCompact(go);
      expect(go.countText).toBe('GO!');
      // The card holds still from 3 to GO (no jump as the count changes width).
      expect(Math.abs(go.card.l - red.card.l)).toBeLessThanOrEqual(1);
      expect(Math.abs(go.card.t - red.card.t)).toBeLessThanOrEqual(1);
      expect(problems).toEqual([]);
    });
  });
}

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
      await toLights(page);
      const m = await measure(page, '3');
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
