// Camera effects comfort setting (ticket 0216): Settings → Camera effects scales camera shake and
// the FOV push-in (full / gentle 40% / off); speed lines stay. Reads the real 2D blit: the main
// canvas draws the pixel buffer once per frame with a centre crop (FOV) at a shake offset.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

// The hit-shake (screenShake) is a translate on the pixel buffer right after renderScene's
// setTransform + save, so the probe watches that exact sequence too.
const probe = (page) => page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const { drawImage, setTransform, save, translate, fillRect } = P;
  window.__blit = null;
  window.__hit = 0;
  let step = 0;
  P.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw) {
    step = 0;
    if (arguments.length === 9 && this.canvas.id === 'gameCanvas' && img && img.width && !window.__blit) {
      window.__blit = { fov: img.width / sw, shake: Math.hypot(dx, dy) * 1280 / dw }; // first draw of the frame
    }
    return drawImage.apply(this, arguments);
  };
  P.fillRect = function () { step = 0; return fillRect.apply(this, arguments); };
  P.setTransform = function () { step = this.canvas.id ? 0 : 1; return setTransform.apply(this, arguments); };
  P.save = function () { step = step === 1 ? 2 : 0; return save.apply(this, arguments); };
  P.translate = function (x, y) {
    if (step === 2 && Math.abs(x) < 4 && Math.abs(y) < 4) window.__hit = Math.max(window.__hit, Math.hypot(x, y));
    step = 0;
    return translate.apply(this, arguments);
  };
});

/** Max FOV, speed shake and hit-shake over ~48 frames at 130 mph with NOS held (Shift) and a
 *  crash-sized screenShake kept up, plus whether speed lines drew. */
async function sample(page) {
  await page.keyboard.down('Shift');
  const out = await page.evaluate(async () => {
    const g = window.__OT.GameState;
    let fov = 0, shake = 0, nos = false, lines = 0;
    window.__hit = 0;
    for (let i = 0; i < 48; i++) {
      g.speed = 130; g.screenShake = 0.6;
      window.__blit = null;
      await new Promise((r) => requestAnimationFrame(r));
      nos = nos || g.nosBurning;
      lines = Math.max(lines, g.fxLinesDrawn); // speed lines this frame
      if (window.__blit) { fov = Math.max(fov, window.__blit.fov); shake = Math.max(shake, window.__blit.shake); }
    }
    return { fov, shake, hit: window.__hit, nos, lines: lines > 0 };
  });
  await page.keyboard.up('Shift');
  return out;
}

async function race(page, mode) {
  await page.goto(`${APP}?debug&view=2d`);
  await page.locator('#btnOpenSettings').click();
  await page.locator(`[data-setting="cameraFx"] [data-value="${mode}"]`).click();
  await expect(page.locator(`[data-setting="cameraFx"] [data-value="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).toBeHidden();
  await page.locator('#btnStartRace').click();
  await racing(page);
}

test('camera effects: full, gentle (≈40%) and off scale shake and push-in, never speed lines', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await probe(page);
  const out = {};
  for (const mode of ['full', 'gentle', 'off']) {
    await race(page, mode);
    out[mode] = await sample(page);
    expect(await page.evaluate(() => window.__OT.save().settings.cameraFx)).toBe(mode);
  }
  expect(out.full.nos).toBe(true);
  expect(out.full.fov).toBeGreaterThan(1.1); // 1 + 0.07 at full speed + 0.045 NOS
  expect(out.full.shake).toBeGreaterThan(1.5); // 2.2 px peak at 1280 wide
  expect(out.full.hit).toBeGreaterThan(0.3); // crash shake: up to 0.75 px each way
  expect(out.gentle.hit).toBeLessThan(out.full.hit * 0.6);
  expect(out.off.hit).toBe(0);
  expect(out.gentle.fov - 1).toBeCloseTo((out.full.fov - 1) * 0.4, 2);
  expect(out.gentle.shake).toBeLessThan(out.full.shake * 0.45);
  expect(out.gentle.shake).toBeGreaterThan(out.full.shake * 0.25);
  expect(out.off.fov).toBe(1);
  expect(out.off.shake).toBe(0);
  for (const mode of ['full', 'gentle', 'off']) expect(out[mode].lines).toBe(true);
  expect(problems).toEqual([]);
});

test('calm motion forces camera effects off even when set to full', async ({ page }) => {
  await probe(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await race(page, 'full');
  const s = await sample(page);
  expect(s.fov).toBe(1);
  expect(s.shake).toBe(0);
  expect(s.hit).toBe(0);
});

test('a saved OFF applies from boot, before the settings panel is ever opened', async ({ page }) => {
  await probe(page);
  await page.goto(`${APP}?debug&view=2d`);
  await page.evaluate(() => {
    const k = 'outatime_cruisn_88_save_v2';
    const save = JSON.parse(localStorage.getItem(k) || '{}');
    save.settings = { ...(save.settings || {}), cameraFx: 'off' };
    localStorage.setItem(k, JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.cameraFx === 0);
  await page.locator('#btnStartRace').click();
  await racing(page);
  const s = await sample(page);
  expect(s.fov).toBe(1);
  expect(s.shake).toBe(0);
  expect(s.hit).toBe(0);
  expect(s.lines).toBe(true);
});
