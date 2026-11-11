// Ticket 0265: the first-run steer prompt (#steerHint) never covers a touch button. At 390x844
// it used to sit on the round PAUSE shortcut at the left edge, hiding half of it. With the
// prompt up, its rect must miss every visible pad button (shortcuts, the action cluster, the
// stick / D-pad / tilt), be fully on screen, and still hide once the player steers.
import { test, expect, devices } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const VIEWS = [
  ['390x844', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }],
  ['360x640', { ...devices['Galaxy S9+'], viewport: { width: 360, height: 640 } }],
  ['844x390', { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } }],
];

const hits = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const [name, opts] of VIEWS) {
  test(`steer prompt clear of every touch button at ${name}`, async ({ browser }, info) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const problems = watchPage(page);
    // A new player (the prompt shows), with the touch thumb guide already seen (it hides the prompt).
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ controls: { coachSeen: true } })), SAVE);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT);
    await page.locator('#btnStartRace').tap();
    const hint = page.locator('#steerHint');
    await expect(hint).toBeVisible({ timeout: 30000 });
    // Measured on a frame where the prompt is really shown (a score plate or coach tip can hide it).
    const r = await (await page.waitForFunction(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      const shown = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; };
      const el = document.getElementById('steerHint');
      const on = !el.classList.contains('hidden') && getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().width > 0;
      if (!on) return null;
      const pads = {};
      for (const b of document.querySelectorAll('#touchControlsLayer > .tc-btn:not(.tc-hidden), #tcStick:not(.tc-hidden), #tcDpad:not(.tc-hidden), #tcTilt:not(.tc-hidden)')) {
        if (shown(b)) pads[b.id || b.className] = box(b);
      }
      return { on, hint: box(el), clipped: el.scrollWidth > el.clientWidth + 1, vw: innerWidth, vh: innerHeight, pads };
    }, null, { timeout: 30000 })).jsonValue();
    expect(r.on, `${name}: prompt shown while measured`).toBe(true);
    expect(Object.keys(r.pads).length, `${name}: touch buttons on screen`).toBeGreaterThan(3);
    expect(r.hint.x, `${name}: hint left`).toBeGreaterThanOrEqual(0);
    expect(r.hint.y, `${name}: hint top`).toBeGreaterThanOrEqual(0);
    expect(r.hint.x + r.hint.width, `${name}: hint right`).toBeLessThanOrEqual(r.vw);
    expect(r.hint.y + r.hint.height, `${name}: hint bottom`).toBeLessThanOrEqual(r.vh);
    expect(r.clipped, `${name}: hint text clipped`).toBe(false);
    for (const [id, p] of Object.entries(r.pads)) expect(hits(r.hint, p), `${name}: hint ${JSON.stringify(r.hint)} covers ${id} ${JSON.stringify(p)}`).toBe(false);
    await info.attach(`steer-hint-pads-${name}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    // Still hides once the player steers (existing behaviour) — at once, well inside the prompt's
    // own 9 s run (src/onboarding.js STEER_HINT_MAX_MS), so this proves the steer did it.
    await page.keyboard.down('ArrowLeft');
    await expect(hint).toBeHidden({ timeout: 2000 });
    await page.keyboard.up('ArrowLeft');
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
