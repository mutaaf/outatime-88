// Target size (ticket 0210). Every visible control on the title, Settings, the garage, the race
// HUD, the pause sheet and the results card must be big enough to hit: 24x24 CSS px with a mouse
// (WCAG 2.2 SC 2.5.8, or the SC's spacing exception), 44x44 on a touch screen (invariant 5).
// The in-race touch pads have their own suite (touch-layouts.spec.js).
//
// A control's size is its real hit box, not its drawn box: a ::after that reaches past the edge
// counts (the Settings switches, the steering pill), a label around it does not. The audit
// scrolls each control into view and walks outward from its centre with elementFromPoint, so a
// control another layer covers (the HUD under the results card) is not a target on that screen.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Touch controls allowed under 44 px, with the reason. Keep it short; fix before adding here. */
const TOUCH_EXCEPTIONS = {};

/** Controls each screen must show, so the audit can never pass on a screen it failed to reach
 *  or on controls it could not hit (a coach card or a lazy chunk may add more). */
const MUST = {
  title: ['btnOpenSettings', 'btnOpenGarageFromTitle'],
  settings: ['setTiltSens', 'setMaster', 'setVoice', 'btnSettingsDone'],
  garage: ['btnCloseGarage', 'btnGaragePrimary'],
  'race HUD': ['btnSteerMode'],
  pause: ['btnResumeFromGarage'],
  results: ['btnPlayAgain', 'btnOpenGarageFromEnd', 'btnSelectLevelFromEnd'],
};

const homeReady = (page) => page.waitForFunction(() => document.querySelector('#homeHooks')?.childElementCount > 0);

/** Every visible, hittable control: { id, w, h, x, y } (its hit box in viewport px). */
const targets = (page) => page.evaluate(() => {
  const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="link"]';
  const hits = (el, x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest('[inert], [aria-hidden="true"]') || el.disabled) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    let r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    r = el.getBoundingClientRect();
    // Probe pixel centres (x.5), so a box edge on a whole pixel is never counted twice.
    const cx = Math.floor(r.left + r.width / 2) + 0.5, cy = Math.floor(r.top + r.height / 2) + 0.5;
    if (!hits(el, cx, cy)) continue; // covered by another layer: not a target here
    const reach = 40; // how far past the drawn box a hit area may extend
    let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
    while (x0 > r.left - reach && hits(el, x0 - 1, cy)) x0--;
    while (x1 < r.right + reach && hits(el, x1 + 1, cy)) x1++;
    while (y0 > r.top - reach && hits(el, cx, y0 - 1)) y0--;
    while (y1 < r.bottom + reach && hits(el, cx, y1 + 1)) y1++;
    const label = el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || el.className;
    out.push({ el: el.id, id: `${el.tagName.toLowerCase()} ${label}`, x: x0 - 0.5, y: y0 - 0.5, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
});

/** WCAG 2.5.8: under 24 px passes if a 24 px circle on its centre crosses no other target (nor
 *  another undersized target's circle). Returns the controls that fail. */
function pointerFails(list) {
  const small = (t) => t.w < 24 || t.h < 24;
  const centre = (t) => [t.x + t.w / 2, t.y + t.h / 2];
  const distToBox = ([px, py], t) => Math.hypot(Math.max(t.x - px, 0, px - (t.x + t.w)), Math.max(t.y - py, 0, py - (t.y + t.h)));
  return list.filter(small).filter((a) => {
    const c = centre(a);
    return list.some((b) => b !== a && (distToBox(c, b) < 12 || (small(b) && Math.hypot(c[0] - centre(b)[0], c[1] - centre(b)[1]) < 24)));
  }).map((t) => `${t.id}: ${t.w}x${t.h}`);
}

const touchFails = (list) => list.filter((t) => (t.w < 44 || t.h < 44) && !TOUCH_EXCEPTIONS[t.id]).map((t) => `${t.id}: ${t.w}x${t.h}`);

/** Walk title → Settings → garage → race HUD → pause → results, auditing each screen. */
async function walk(page, check) {
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await check('title');
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await check('settings');
  await page.locator('#btnSettingsDone').click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await page.locator('#btnOpenGarageFromTitle').click();
  await page.waitForSelector('.garage-thumb.is-view');
  await check('garage');
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeHidden();
  await page.evaluate(() => window.__OT.startRace({ mode: 'INFINITE' }));
  await racing(page);
  await check('race HUD');
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeVisible();
  await check('pause');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  await page.evaluate(() => window.__OT.finishRun());
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await check('results');
}

test('mouse at 1280x720: every control is 24x24 or spaced like one', async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watchPage(page);
  await walk(page, async (screen) => {
    const list = await targets(page);
    expect(list.map((t) => t.el), `${screen}: controls audited`).toEqual(expect.arrayContaining(MUST[screen]));
    expect(pointerFails(list), `${screen}: undersized controls`).toEqual([]);
  });
  expect(problems).toEqual([]);
});

// 360x640: the narrowest common Android size, where the steering pill drops its name.
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) {
  test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('every control is at least 44x44', async ({ page }) => {
      test.setTimeout(90_000);
      const problems = watchPage(page);
      await walk(page, async (screen) => {
        const list = await targets(page);
        expect(list.map((t) => t.el), `${screen}: controls audited`).toEqual(expect.arrayContaining(MUST[screen]));
        expect(touchFails(list), `${screen}: controls under 44 px`).toEqual([]);
      });
      expect(problems).toEqual([]);
    });
  });
}

test('the audit catches a new small control, and a ::after hit area counts', async ({ page }) => {
  watchPage(page);
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  await page.evaluate(() => {
    const add = (id, css) => { const b = document.createElement('button'); b.id = id; b.textContent = '·'; b.style.cssText = `position:fixed;z-index:999;padding:0;border:0;${css}`; document.body.appendChild(b); };
    add('tinyA', 'left:300px;top:300px;width:20px;height:20px');
    add('tinyB', 'left:322px;top:300px;width:20px;height:20px'); // centres 22px apart, circles overlap: both fail
    add('tinyLone', 'left:600px;top:300px;width:20px;height:20px'); // nothing within 12px: passes 2.5.8
    const s = document.createElement('style');
    s.textContent = '#padded { position: fixed; z-index: 999; left: 600px; top: 400px; width: 30px; height: 30px; padding: 0; border: 0 } #padded::after { content: ""; position: absolute; inset: -7px; }';
    document.head.appendChild(s);
    add('padded', '');
  });
  const list = await targets(page);
  const fails = pointerFails(list).join('\n');
  expect(fails).toContain('tinyA');
  expect(fails).toContain('tinyB');
  expect(fails).not.toContain('tinyLone');
  const padded = list.find((t) => t.id === 'button padded');
  expect(padded.w).toBeGreaterThanOrEqual(43);
  expect(padded.h).toBeGreaterThanOrEqual(43);
  expect(touchFails(list).join('\n')).not.toContain('padded');
});
