// Ticket 0240: pausing opens the Garage sheet, and its action row (CHANGE LEVEL, SETTINGS,
// QUIT TO HOME, BACK TO THE TRACK) stays pinned to the bottom of the screen instead of sitting
// ~1.7 screens down below the whole shop.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ROW = ['#btnChangeEventFromGarage', '#btnSettingsFromGarage', '#garageModal .quit-home', '#btnResumeFromGarage'];

async function pause(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
  await expect(page.locator('#btnResumeFromGarage')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#garageModal .quit-home')).toBeVisible();
}

/** Every pause action is whole on screen, with the sheet scrolled wherever it is. */
async function expectRowOnScreen(page) {
  const vp = page.viewportSize();
  for (const sel of ROW) {
    const b = await page.locator(sel).boundingBox();
    expect(b, sel).not.toBeNull();
    expect(b.y, `${sel} top`).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
    expect(b.x, `${sel} left`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${sel} right`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.height, `${sel} target`).toBeGreaterThanOrEqual(44);
  }
}

/** The row's own height (its padding and backdrop included). */
const rowBox = (page) => page.locator('#garageActions').boundingBox();

/** Scrolled to the bottom, the last upgrade card ends above the pinned row. */
async function expectShopClear(page) {
  await page.evaluate(() => { const m = document.getElementById('garageModal'); m.scrollTop = m.scrollHeight; });
  await page.waitForFunction(() => { const m = document.getElementById('garageModal'); return Math.abs(m.scrollTop + m.clientHeight - m.scrollHeight) < 2; });
  const cards = page.locator('#upgradesList > *');
  const last = await cards.nth((await cards.count()) - 1).boundingBox();
  const row = await rowBox(page);
  expect(last.y + last.height).toBeLessThanOrEqual(row.y + 0.5);
  await expectRowOnScreen(page);
}

const sizes = [
  { name: 'phone portrait 390x844', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'desktop 1280x720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: 'phone landscape 844x390', viewport: { width: 844, height: 390 }, touch: true, maxShare: 0.25 },
  { name: 'phone landscape 740x360', viewport: { width: 740, height: 360 }, touch: true, maxShare: 0.25 },
];

for (const s of sizes) {
  test.describe(s.name, () => {
    test.use(s.touch ? { viewport: s.viewport, hasTouch: true, isMobile: true } : { viewport: s.viewport });

    test('the pause actions are on screen without scrolling, and BACK TO THE TRACK resumes', async ({ page }) => {
      const problems = watchPage(page);
      await pause(page);
      // The sheet stays at the top while the Garage settles (centring the car strip must not scroll the sheet):
      // the highest scrollTop over 40 frames after it opens.
      expect(await page.evaluate(() => new Promise((done) => {
        const m = document.getElementById('garageModal');
        let n = 0, max = m.scrollTop;
        const tick = () => { max = Math.max(max, m.scrollTop); if (++n < 40) requestAnimationFrame(tick); else done(max); };
        requestAnimationFrame(tick);
      }))).toBe(0);
      await expectRowOnScreen(page);
      // Pinned flush to the bottom edge: no strip of shop showing through under it.
      const r0 = await rowBox(page);
      expect(Math.abs(r0.y + r0.height - s.viewport.height)).toBeLessThan(1.5);
      // The first-race thumb guide never draws its rings over the actions.
      expect(await page.evaluate(() => { const g = document.getElementById('tcGuide'); return !g || getComputedStyle(g).visibility === 'hidden' || g.offsetParent === null; })).toBe(true);
      if (s.maxShare) expect((await rowBox(page)).height).toBeLessThanOrEqual(s.viewport.height * s.maxShare);
      await expectShopClear(page);
      await page.evaluate(() => { document.getElementById('garageModal').scrollTop = 0; });
      if (s.touch) await page.locator('#btnResumeFromGarage').tap();
      else await page.locator('#btnResumeFromGarage').click();
      await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
      expect(problems).toEqual([]);
    });
  });
}

test.describe('narrow phone 320x640', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

  test('the four actions keep one line, and Escape still resumes', async ({ page }) => {
    const problems = watchPage(page);
    await pause(page);
    await expectRowOnScreen(page);
    const tops = [];
    for (const sel of ROW) tops.push((await page.locator(sel).boundingBox()).y);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });
});

test.describe('keyboard at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('Tab reaches BACK TO THE TRACK and Enter resumes', async ({ page }) => {
    const problems = watchPage(page);
    await pause(page);
    let reached = false;
    const hidden = [];
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      // A focused control in the sheet is scrolled clear of the pinned row, never under it.
      const f = await page.evaluate(() => {
        const a = document.activeElement, row = document.getElementById('garageActions');
        if (!a || row.contains(a) || !document.getElementById('garageModal').contains(a)) return { id: a?.id, under: 0 };
        const r = a.getBoundingClientRect(), t = row.getBoundingClientRect().top;
        return { id: a.id || a.className, under: Math.max(0, Math.min(r.bottom, innerHeight) - t) };
      });
      if (f.under > 1) hidden.push(f);
      reached = f.id === 'btnResumeFromGarage';
    }
    expect(reached).toBe(true);
    expect(hidden).toEqual([]);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });
});

test.describe('title garage at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the Garage opened from the title pins its actions too (no QUIT there)', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(APP);
    await page.locator('#btnOpenGarageFromTitle').tap();
    await expect(page.locator('#garageCarName')).not.toBeEmpty();
    await expect(page.locator('#garageModal .quit-home')).toBeHidden();
    const b = await page.locator('#btnResumeFromGarage').boundingBox();
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(844.5);
    expect(problems).toEqual([]);
  });
});
