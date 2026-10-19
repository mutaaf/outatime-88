// Touch controls (ticket 0061): real multi-touch through CDP (Input.dispatchTouchEvent), so the
// browser produces the same pointer events a phone does: several fingers at once, sliding
// between buttons, the D-pad, long-press, cancel. Uses the ?debug hook to read InputState.
import { test, expect } from '@playwright/test';
import { APP, watchPage, touchReady } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function race(page, controls = {}) {
  await page.addInitScript(([key, c]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: Object.assign({ coachSeen: true }, c) }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [SAVE_KEY, controls]);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await touchReady(page);
  await page.waitForTimeout(300);
  return page.context().newCDPSession(page);
}

const centre = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
};
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 8, radiusY: 8, force: 1 })),
});
const input = (page) => page.evaluate(() => {
  const i = window.__OT.input;
  return { steer: i.touchSteerVal, up: i.touchUp, down: i.touchDown, back: i.lookBack };
});
// Count WARP presses (the sim consumes boostPressed on the next frame, and an airborne press
// is a barrel roll rather than a flux spend, so count the press itself).
const countBoosts = (page) => page.evaluate(() => {
  const i = window.__OT.input; let v = i.boostPressed; window.__boosts = 0;
  Object.defineProperty(i, 'boostPressed', { configurable: true, get: () => v, set: (n) => { if (n) window.__boosts++; v = n; } });
});
const boosts = (page) => page.evaluate(() => window.__boosts);
const pressed = (page) => page.evaluate(() => [...document.querySelectorAll('.tc-btn.tc-pressed')].map((e) => e.dataset.ctl || e.id));

test('three fingers at once: steer right + drift + warp', async ({ page }) => {
  const problems = watchPage(page);
  const cdp = await race(page);
  await countBoosts(page);
  const drift = await centre(page, '#tcDrift');
  const warp = await centre(page, '#tcBoost');
  const thumb = { x: 90, y: 700, id: 1 };
  const before = await page.locator('#tcBoost').boundingBox();
  await touch(cdp, 'touchStart', [thumb, { ...drift, id: 2 }, { ...warp, id: 3 }]);
  expect(await boosts(page)).toBe(1);
  await touch(cdp, 'touchMove', [{ ...thumb, x: 160 }, { ...drift, id: 2 }, { ...warp, id: 3 }]);
  await expect.poll(async () => (await input(page)).steer, { timeout: 3000 }).toBeGreaterThan(0.6);
  const st = await input(page);
  expect(st.down).toBe(true);
  expect(await pressed(page)).toEqual(expect.arrayContaining(['drift', 'boost']));
  // A pressed button shrinks in place; it must never jump away from the thumb.
  await page.waitForTimeout(150);
  const during = await page.locator('#tcBoost').boundingBox();
  expect(Math.abs(during.x + during.width / 2 - (before.x + before.width / 2))).toBeLessThan(2);
  expect(Math.abs(during.y + during.height / 2 - (before.y + before.height / 2))).toBeLessThan(2);
  expect(during.width).toBeLessThan(before.width);
  const x0 = await page.evaluate(() => window.__OT.GameState.playerX);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__OT.GameState.playerX)).toBeGreaterThan(x0);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(async () => Math.abs((await input(page)).steer), { timeout: 3000 }).toBeLessThan(0.01);
  expect(await input(page)).toMatchObject({ down: false, up: false });
  expect(await pressed(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('the dynamic stick spawns under the thumb anywhere in the left half and clears the steer prompt', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x: 120, y: 520 }]);
  const base = await page.locator('#tcStick .tc-stick-base').boundingBox();
  expect(Math.abs(base.x + base.width / 2 - 120)).toBeLessThan(4);
  expect(Math.abs(base.y + base.height / 2 - 520)).toBeLessThan(4);
  await touch(cdp, 'touchMove', [{ x: 60, y: 520 }]);
  await expect.poll(async () => (await input(page)).steer, { timeout: 3000 }).toBeLessThan(-0.5);
  await touch(cdp, 'touchEnd', []);
  await expect(page.locator('#steerHint')).toBeHidden();
});

test('a quick tap on the stick zone (shorter than a frame) still counts as steering', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.touchscreen.tap(100, 700);
  await expect(page.locator('#steerHint')).toBeHidden();
});

test('sliding a thumb from JUMP onto WARP releases JUMP and fires WARP (Fortnite slide)', async ({ page }) => {
  const cdp = await race(page);
  await countBoosts(page);
  const jump = await centre(page, '#tcJump');
  const warp = await centre(page, '#tcBoost');
  await touch(cdp, 'touchStart', [jump]);
  expect(await pressed(page)).toEqual(['jump']);
  const mid = { x: (jump.x + warp.x) / 2, y: (jump.y + warp.y) / 2 };
  await touch(cdp, 'touchMove', [mid]);
  await touch(cdp, 'touchMove', [warp]);
  expect(await pressed(page)).toEqual(['boost']);
  expect(await boosts(page)).toBe(1);
  await touch(cdp, 'touchEnd', []);
  expect(await pressed(page)).toEqual([]);
});

test('D-pad: two fingers (left + up) steer left with the gas on; sliding between arrows works', async ({ page }) => {
  const cdp = await race(page, { movement: 'dpad', autoAccel: false });
  await expect(page.locator('#tcDpad')).toBeVisible();
  await expect(page.locator('#tcStick')).toBeHidden();
  await expect(page.locator('#tcAccel')).toBeVisible();
  const pad = await page.locator('#tcDpad').boundingBox();
  const c = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 };
  const r = pad.width * 0.38;
  await touch(cdp, 'touchStart', [{ x: c.x - r, y: c.y, id: 1 }, { x: c.x, y: c.y - r, id: 2 }]);
  await expect.poll(async () => (await input(page)).steer, { timeout: 3000 }).toBeLessThan(-0.5);
  let st = await input(page);
  expect(st.up).toBe(true);
  await expect(page.locator('#tcDpad')).toHaveAttribute('data-dirs', /w/);
  // Slide finger 1 from left to right without lifting.
  await touch(cdp, 'touchMove', [{ x: c.x + r, y: c.y, id: 1 }, { x: c.x, y: c.y - r, id: 2 }]);
  await expect.poll(async () => (await input(page)).steer, { timeout: 3000 }).toBeGreaterThan(0.5);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  expect((await input(page)).up).toBe(false);
});

test('long-press SPECIAL opens the picker; sliding to AGRO and releasing equips and fires it', async ({ page }) => {
  const cdp = await race(page);
  const sp = await centre(page, '#tcSpecial');
  await touch(cdp, 'touchStart', [sp]);
  await page.waitForTimeout(520);
  await expect(page.locator('#tcPicker')).toHaveClass(/tc-open/);
  const agro = await centre(page, '#tcPicker [data-special="AGRO"]');
  await touch(cdp, 'touchMove', [agro]);
  await touch(cdp, 'touchEnd', []);
  await expect(page.locator('#tcPicker')).not.toHaveClass(/tc-open/);
  await expect(page.locator('#tcSpecial .tc-lbl')).toHaveText('AGRO');
  expect(await page.evaluate(() => window.__OT.GameState.agroTimer)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__OT.controls().special)).toBe('AGRO');
});

test('a cancelled touch (system gesture, notification) releases every held control', async ({ page }) => {
  const cdp = await race(page);
  const drift = await centre(page, '#tcDrift');
  await touch(cdp, 'touchStart', [{ x: 90, y: 700, id: 1 }, { ...drift, id: 2 }]);
  await touch(cdp, 'touchMove', [{ x: 150, y: 700, id: 1 }, { ...drift, id: 2 }]);
  await page.waitForTimeout(150);
  expect((await input(page)).down).toBe(true);
  await touch(cdp, 'touchCancel', []);
  await expect.poll(async () => Math.abs((await input(page)).steer), { timeout: 3000 }).toBeLessThan(0.01);
  expect((await input(page)).down).toBe(false);
  expect(await pressed(page)).toEqual([]);
});

test('holding LOOK BACK shows the rear-view mirror; letting go hides it', async ({ page }) => {
  const problems = watchPage(page);
  const cdp = await race(page);
  const rear = await centre(page, '#tcRear');
  await touch(cdp, 'touchStart', [rear]);
  await page.waitForTimeout(150);
  await expect(page.locator('#tcMirror')).toBeVisible();
  expect((await input(page)).back).toBe(true);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(100);
  await expect(page.locator('#tcMirror')).toBeHidden();
  expect(problems).toEqual([]);
});

test('touching never scrolls or zooms the page', async ({ page }) => {
  const cdp = await race(page);
  await touch(cdp, 'touchStart', [{ x: 200, y: 600 }]);
  await touch(cdp, 'touchMove', [{ x: 200, y: 200 }]);
  await touch(cdp, 'touchEnd', []);
  const s = await page.evaluate(() => ({ y: scrollY, x: scrollX, scale: visualViewport ? visualViewport.scale : 1 }));
  expect(s).toEqual({ y: 0, x: 0, scale: 1 });
});

test('first race on a touch screen: the thumb guide plays without pausing, goes once you steer, never again', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#tcGuide')).toBeVisible();
  // It never stops the race and never takes a tap: the race runs underneath.
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  expect(await page.locator('#tcGuide').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.locator('#tcCoach')).toHaveCount(0);
  await page.waitForTimeout(1600);
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x: 90, y: 700 }]);
  for (let x = 100; x <= 170; x += 10) await touch(cdp, 'touchMove', [{ x, y: 700 }]);
  await expect(page.locator('#tcGuide')).toHaveCount(0, { timeout: 3000 });
  await touch(cdp, 'touchEnd', []);
  expect(await page.evaluate(() => window.__OT.controls().coachSeen)).toBe(true);
  await page.reload();
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(500);
  await expect(page.locator('#tcGuide')).toHaveCount(0);
});

test('the full thumb guide can still be replayed from the controls panel', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ controls: { coachSeen: true } })), SAVE_KEY);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').tap();
  await page.locator('#btnOpenControls').tap();
  await page.locator('[data-act="coach"]').tap();
  await expect(page.locator('#tcCoach')).toBeVisible();
  await page.locator('#btnCoachGo').tap();
  await expect(page.locator('#tcCoach')).toHaveCount(0);
});

test('controls settings: pick a preset and steering mode in one tap each; they persist', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })); sessionStorage.setItem('s', '1'); } });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').tap();
  await page.locator('#btnOpenControls').tap();
  await expect(page.locator('#tcPanel')).toBeVisible();
  await page.locator('#tcPresetGrid [data-preset="fortnite"]').tap();
  await page.locator('#tcMoveSeg [data-move="fixed"]').tap();
  await page.locator('#tcPanel [data-act="done"]').tap();
  await expect(page.locator('#settingsModal')).toBeVisible(); // back where you came from
  await page.reload();
  expect(await page.evaluate(() => { const c = window.__OT.controls(); return [c.preset, c.movement]; })).toEqual(['fortnite', 'fixed']);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#tcStick')).toHaveAttribute('data-mode', 'fixed');
  expect(problems).toEqual([]);
});

test('HUD layout editor: drag a button, resize it, save; it stays there after a reload', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })); sessionStorage.setItem('s', '1'); } });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').tap();
  await page.locator('#btnEditControls').tap(); // one tap from the gear
  await expect(page.locator('#tcEditBar')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const from = await centre(page, '#tcHorn');
  const to = { x: 200, y: 560 };
  await touch(cdp, 'touchStart', [from]);
  await touch(cdp, 'touchMove', [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }]);
  await touch(cdp, 'touchMove', [to]);
  await touch(cdp, 'touchEnd', []);
  await page.locator('#tcEditSize').fill('1.3');
  // A tap is a click only if the finger lifts before the long-press threshold; on a starved CI
  // runner the emulated touchEnd can land late and Chromium reads a long press (no click).
  // Saving still has to work: retry the tap, never the assertion's meaning.
  await expect(async () => {
    await page.locator('#tcEditBar [data-act="done"]').tap({ timeout: 2000 });
    await expect(page.locator('#tcEditBar')).toHaveCount(0, { timeout: 1500 });
  }).toPass({ timeout: 10000 });
  await page.reload();
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(300);
  const at = await centre(page, '#tcHorn');
  expect(Math.abs(at.x - 200)).toBeLessThanOrEqual(8);
  expect(Math.abs(at.y - 560)).toBeLessThanOrEqual(8);
  const box = await page.locator('#tcHorn').boundingBox();
  expect(box.width).toBeGreaterThan(55);
  expect(await page.evaluate(() => Object.keys(window.__OT.controls().layouts))).toEqual(['phone-portrait']);
});

test('the editor refuses to drop a control on top of another one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').tap();
  await page.locator('#btnEditControls').tap(); // one tap from the gear
  const cdp = await page.context().newCDPSession(page);
  const from = await centre(page, '#tcHorn');
  const onto = await centre(page, '#tcBoost');
  await touch(cdp, 'touchStart', [from]);
  await touch(cdp, 'touchMove', [onto]);
  await touch(cdp, 'touchEnd', []);
  const back = await centre(page, '#tcHorn');
  expect(Math.abs(back.x - from.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(back.y - from.y)).toBeLessThanOrEqual(2);
});

test('2D: holding a drag on the right side looks back (mirror); a quick flick up still jumps', async ({ page }) => {
  const cdp = await race(page);
  await touch(cdp, 'touchStart', [{ x: 260, y: 440 }]);
  await touch(cdp, 'touchMove', [{ x: 262, y: 480 }]);
  await page.waitForTimeout(350);
  await touch(cdp, 'touchMove', [{ x: 264, y: 500 }]);
  await expect(page.locator('#tcMirror')).toBeVisible({ timeout: 10000 });
  await touch(cdp, 'touchEnd', []);
  await expect(page.locator('#tcMirror')).toBeHidden({ timeout: 10000 });
  await page.evaluate(() => { window.__OT.GameState.playerY = 0; });
  // A flick is a swipe that lifts within 260 ms. Send the three events back to back (CDP runs
  // them in order) instead of a round trip each, which a loaded runner can stretch past that.
  await Promise.all([
    touch(cdp, 'touchStart', [{ x: 260, y: 520 }]),
    touch(cdp, 'touchMove', [{ x: 260, y: 440 }]),
    touch(cdp, 'touchEnd', []),
  ]);
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.playerY), { timeout: 2000 }).toBeGreaterThan(3);
});

test('3D: dragging the right side orbits the camera and pinch changes the chase distance; both spring back', async ({ page }) => {
  test.slow(); // SwiftShader 3D under parallel workers
  const cdp = await race(page);
  await page.evaluate(() => window.__OT.setView('3d'));
  // view().mode flips to 3d at once; the 3D view (what the touch kit asks is3D() of) exists only
  // once its chunk has loaded, and a drag before that is read as a 2D look-back.
  await expect.poll(() => page.evaluate(() => Boolean(window.__OT.view().mode === '3d' && window.__OT.view().stats)), { timeout: 40000 }).toBe(true);
  await touch(cdp, 'touchStart', [{ x: 250, y: 420 }]);
  await touch(cdp, 'touchMove', [{ x: 340, y: 400 }]);
  await expect.poll(() => page.evaluate(() => window.__OT.input.lookYaw), { timeout: 10000 }).toBeGreaterThan(0.3);
  await touch(cdp, 'touchStart', [{ x: 340, y: 400, id: 0 }, { x: 230, y: 470, id: 1 }]);
  await touch(cdp, 'touchMove', [{ x: 340, y: 400, id: 0 }, { x: 300, y: 430, id: 1 }]);
  expect(await page.evaluate(() => window.__OT.input.lookZoom)).not.toBe(1);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(() => page.evaluate(() => window.__OT.input.lookYaw), { timeout: 10000 }).toBe(0);
});
