// Grid car pill (ticket 0246): on a phone the start grid's "your car" pill is one short line,
// CAR NAME · CLASS, with no SPD/ACC/GRIP/ARMOR spec (garage information the player can't use
// while the lights count down). Desktop keeps the spec line. The pill never overlaps the level
// banner or the lights card.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Waits for the pill to show, then measures it against the banner and the lights card. */
async function measure(page) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  const pill = page.locator('#rcGrid .rc-mycar');
  await expect(pill).toBeVisible({ timeout: 8000 });
  return page.evaluate(() => {
    const box = (el) => {
      if (!el || !el.getClientRects().length) return null;
      let a = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
      if (a < 0.05 || getComputedStyle(el).visibility !== 'visible') return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const el = document.querySelector('#rcGrid .rc-mycar');
    const cs = getComputedStyle(el);
    return {
      text: el.innerText,
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
      fits: el.scrollWidth <= el.clientWidth + 1,
      pill: box(el),
      banner: box(document.getElementById('announcerMain')),
      lights: box(document.getElementById('rcLights')),
      vw: innerWidth,
    };
  });
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const SPEC = /SPD|ACC|GRIP|ARMOR/;

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the car pill is one line, name and class only, clear of the banner and lights', async ({ page }) => {
    const problems = watchPage(page);
    const m = await measure(page);
    expect(m.text).not.toMatch(SPEC);
    expect(m.text).toContain('·');
    expect(m.height).toBeLessThan(1.6 * m.lineHeight + 8); // one line + the pill's padding and border
    expect(m.fits).toBe(true);
    expect(m.pill.l).toBeGreaterThanOrEqual(0);
    expect(m.pill.r).toBeLessThanOrEqual(m.vw);
    expect(overlaps(m.pill, m.banner)).toBe(false);
    expect(overlaps(m.pill, m.lights)).toBe(false);
    expect(problems).toEqual([]);
  });
});

test.describe('landscape phone 844x390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the grid stays out of the way: no pill over the banner or the lights', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug&intro`);
    await page.evaluate(() => window.__OT.ready());
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await page.locator('#rcSkip').click();
    await expect(page.locator('#rcLights')).toBeVisible({ timeout: 8000 });
    const hidden = await page.evaluate(() => !document.querySelector('#rcGrid .rc-mycar')?.getClientRects().length);
    expect(hidden).toBe(true); // short screens hide the grid (max-height 560)
    expect(problems).toEqual([]);
  });
});

test('1280x720: the pill keeps the spec line, clear of the banner and lights', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const problems = watchPage(page);
  const m = await measure(page);
  expect(m.text).toMatch(/SPD \d · ACC \d · GRIP \d · ARMOR \d/);
  expect(overlaps(m.pill, m.banner)).toBe(false);
  expect(overlaps(m.pill, m.lights)).toBe(false);
  expect(problems).toEqual([]);
});
