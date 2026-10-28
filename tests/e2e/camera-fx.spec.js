// Camera effects comfort setting (ticket 0216): Settings → Camera effects scales camera shake and
// the FOV push-in (full / gentle 40% / off); speed lines stay. Reads the real 2D blit: the main
// canvas draws the pixel buffer once per frame with a centre crop (FOV) at a shake offset.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const probe = (page) => page.addInitScript(() => {
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  window.__blit = null;
  CanvasRenderingContext2D.prototype.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw) {
    if (arguments.length === 9 && this.canvas.id === 'gameCanvas' && img && img.width && !window.__blit) {
      window.__blit = { fov: img.width / sw, shake: Math.hypot(dx, dy) * 1280 / dw }; // first draw of the frame
    }
    return draw.apply(this, arguments);
  };
});

/** Max FOV and shake over ~48 frames at 130 mph, plus whether speed lines drew. */
const sample = (page) => page.evaluate(async () => {
  const g = window.__OT.GameState;
  let fov = 0, shake = 0;
  const lines0 = g.fxLinesDrawn;
  for (let i = 0; i < 48; i++) {
    g.speed = 130;
    window.__blit = null;
    await new Promise((r) => requestAnimationFrame(r));
    if (window.__blit) { fov = Math.max(fov, window.__blit.fov); shake = Math.max(shake, window.__blit.shake); }
  }
  return { fov, shake, lines: g.fxLinesDrawn > lines0 };
});

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
  expect(out.full.fov).toBeGreaterThan(1.065); // 1 + 0.07 at full speed
  expect(out.full.shake).toBeGreaterThan(1.5); // 2.2 px peak at 1280 wide
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
  expect(s.lines).toBe(true);
});
