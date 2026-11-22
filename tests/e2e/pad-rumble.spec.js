// Ticket 0300: Settings → GAMEPAD BUTTONS → GAMEPAD RUMBLE (OFF / LOW / FULL). src/forcefeel.js scales
// both motors by the choice (OFF never touches the motor), a TEST button buzzes 300 ms at the chosen
// level, and the choice persists; an old save and a junk value load as FULL.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

/** A connected pad whose motor records every call, and a save with `settings` (seeded once, so a reload keeps what the page saved). */
const fakePad = (page, { settings = {}, motor = true } = {}) => page.addInitScript(([key, s, m]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true }, settings: s }));
    sessionStorage.setItem('seeded', '1');
  }
  window.__fx = [];
  const vibrationActuator = {
    playEffect: (type, p) => { window.__fx.push({ call: 'playEffect', type, ...p }); return Promise.resolve('complete'); },
    pulse: (v, ms) => { window.__fx.push({ call: 'pulse', v, ms }); return Promise.resolve(true); },
    reset: () => { window.__fx.push({ call: 'reset' }); return Promise.resolve('complete'); },
  };
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: m ? vibrationActuator : undefined };
  navigator.getGamepads = () => [pad];
}, [SAVE_KEY, settings, motor]);

const fx = (page) => page.evaluate(() => window.__fx);
const savedRumble = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings.rumble, SAVE_KEY);
const seg = (page, v) => page.locator(`[data-setting="rumble"] button[data-value="${v}"]`);

/** Start a race with the force feel loaded, take a crash, and return what the motor was sent over the next frames. */
async function crashRumble(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected'))); // loads src/forcefeel.js
  // Wait for the force-feel chunk itself, so OFF's "no calls" can't pass just because it never loaded.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/forcefeel-[\w-]+\.js$/.test(e.name)));
  await nextFrames(page, 2);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.evaluate(() => { const g = window.__OT.GameState; g.invulnTimer = 0; window.__OT.damage(10, 'BARREL HIT'); g.hp = Math.max(g.hp, 60); });
  await nextFrames(page, 12);
  return fx(page);
}
const peakStrong = (list) => Math.max(0, ...list.filter((e) => e.call === 'playEffect').map((e) => e.strongMagnitude));

test.describe('rumble in a race', () => {
  test.use({ reducedMotion: 'no-preference' }); // calm mode zeroes impacts on its own

  test('FULL (an old save with no choice) sends the crash at full strength', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    expect(peakStrong(await crashRumble(page))).toBe(1);
    expect(problems).toEqual([]);
  });

  test('LOW halves the motors', async ({ page }) => {
    await fakePad(page, { settings: { rumble: 'low' } });
    const list = await crashRumble(page);
    expect(peakStrong(list)).toBe(0.5);
    for (const e of list) if (e.call === 'playEffect') { expect(e.strongMagnitude).toBeLessThanOrEqual(0.5); expect(e.weakMagnitude).toBeLessThanOrEqual(0.5); }
  });

  test('OFF never calls playEffect or pulse on the motor', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, { settings: { rumble: 'off' } });
    const list = await crashRumble(page);
    expect(list.filter((e) => e.call !== 'reset')).toEqual([]);
    expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });

  test('a junk value plays as FULL', async ({ page }) => {
    await fakePad(page, { settings: { rumble: 'eleven' } });
    expect(peakStrong(await crashRumble(page))).toBe(1);
  });
});

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`${vp.width}x${vp.height}: pick LOW, TEST buzzes once at 0.5 for 300 ms, OFF stays still, it persists`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').click();
    await expect(seg(page, 'full')).toHaveAttribute('aria-pressed', 'true');
    await seg(page, 'low').scrollIntoViewIfNeeded();
    await seg(page, 'low').click();
    await expect(seg(page, 'low')).toHaveAttribute('aria-pressed', 'true');
    await expect(seg(page, 'full')).toHaveAttribute('aria-pressed', 'false');
    expect(await savedRumble(page)).toBe('low');

    await page.evaluate(() => { window.__fx.length = 0; });
    await page.locator('#setRumbleTest').click();
    await expect(page.locator('#setRumbleRead')).toHaveText('Buzzing at LOW.');
    expect(await fx(page)).toEqual([{ call: 'playEffect', type: 'dual-rumble', startDelay: 0, duration: 300, weakMagnitude: 0.5, strongMagnitude: 0.5 }]);
    await page.screenshot({ path: `test-results/pad-rumble-${vp.width}.png` });

    await seg(page, 'off').click();
    await expect(page.locator('#setRumbleRead'), 'a new choice clears the old TEST line').toHaveText('');
    await page.locator('#setRumbleTest').click();
    await expect(page.locator('#setRumbleRead')).toHaveText(/OFF/);
    expect((await fx(page)).length, 'OFF: TEST does not touch the motor').toBe(1);

    await seg(page, 'low').click();
    await page.locator('#btnSettingsDone').click();
    await page.reload();
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').click();
    await expect(seg(page, 'low')).toHaveAttribute('aria-pressed', 'true');
    expect(problems).toEqual([]);
  });
}

test('no pad: TEST says so in words; a junk save shows FULL', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true }, settings: { rumble: 42 } }));
    navigator.getGamepads = () => [null, null];
  }, SAVE_KEY);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.locator('#btnOpenSettings').click();
  await expect(seg(page, 'full')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#setRumbleTest').click();
  await expect(page.locator('#setRumbleRead')).toHaveText(/No gamepad connected/);
});
