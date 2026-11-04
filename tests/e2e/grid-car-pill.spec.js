// Grid car pill (ticket 0246): on a phone the start grid's "your car" pill is one short line,
// CAR NAME · CLASS, with no SPD/ACC/GRIP/ARMOR spec (garage information the player can't use
// while the lights count down). Desktop keeps the spec line. The pill never overlaps the level
// banner or the lights card.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Starts level 1 and, in one in-page step while the pill is on screen (on a phone it shows only
 *  during the grid's short 'stats' beat), measures it against the banner and the lights card.
 *  `name` optionally swaps in a long car name / class first, to check the ellipsis. */
async function measure(page, name) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  const handle = await page.waitForFunction((name) => {
    const el = document.querySelector('#rcGrid .rc-mycar');
    if (!el || !el.getClientRects().length) return null;
    const box = (n) => {
      if (!n || !n.getClientRects().length) return null;
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      if (a < 0.05 || getComputedStyle(n).visibility !== 'visible') return null;
      const r = n.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const pill = box(el);
    if (!pill) return null; // still fading in (0.25 s beat fade)
    if (name) { el.querySelector('.rc-mycar-name').textContent = name.car; el.querySelector('b').textContent = name.cls; }
    const cs = getComputedStyle(el), nameEl = el.querySelector('.rc-mycar-name');
    return {
      text: el.innerText,
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
      fits: el.scrollWidth <= el.clientWidth + 1,
      nameCut: nameEl.scrollWidth > nameEl.clientWidth,
      clsRight: el.querySelector('b').getBoundingClientRect().right,
      innerRight: el.getBoundingClientRect().right - parseFloat(cs.paddingRight),
      pill,
      banner: box(document.getElementById('announcerMain')),
      lights: box(document.getElementById('rcLights')),
      vw: innerWidth,
    };
  }, name, { timeout: 8000, polling: 'raf' });
  return handle.jsonValue();
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

test.describe('small phone 360x740', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('a long car name ellipses; the class is never cut', async ({ page }) => {
    const problems = watchPage(page);
    const m = await measure(page, { car: "'88 Very Long Imaginary Turbo Gull-Wing Coupe Deluxe", cls: 'GLASS CANNON' });
    expect(m.text).not.toMatch(SPEC);
    expect(m.height).toBeLessThan(1.6 * m.lineHeight + 8);
    expect(m.nameCut).toBe(true);
    expect(m.clsRight).toBeLessThanOrEqual(m.innerRight + 1);
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
