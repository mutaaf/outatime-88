// Garage showroom (ticket 0072): browse, compare, buy, reveal, paint, upgrade; fits every
// screen shape without overlaps or sideways scrolling.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const save = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const seed = (page, data) => page.addInitScript(([k, d]) => {
  if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); }
}, [KEY, data]);

async function openGarage(page) {
  await page.locator('#btnOpenGarageFromTitle').click();
  await expect(page.locator('#garageModal')).toBeVisible();
  await expect(page.locator('#garageCarName')).not.toBeEmpty();
}

test('browse to a coin car, buy it, see the reveal, drive it, paint it — all remembered', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { fluxCoins: 700, onboarded: true });
  await page.goto(`${APP}?debug`);
  await openGarage(page);
  await expect(page.locator('#garageModal')).toHaveAttribute('data-view-car', 'FLUX_COUPE_88');
  await expect(page.locator('#btnGaragePrimary')).toHaveText(/YOUR RIDE/);
  await expect(page.locator('#garageSpecs .spec-row')).toHaveCount(5);

  // The van costs 500: buy it from its thumbnail.
  await page.locator('#garageThumbs [data-car-id="BULLDOG_VAN"]').click();
  await expect(page.locator('#garageUnlockText')).toContainText('BUY FOR');
  await expect(page.locator('#btnGaragePrimary')).toHaveText(/BUY FOR ⚡ 500/);
  await page.locator('#btnGaragePrimary').click();

  // Reveal, then drive.
  await expect(page.locator('#carRevealOverlay')).toBeVisible();
  await expect(page.locator('#carRevealName')).toContainText('Bulldog');
  await page.locator('#btnRevealDrive').click();
  await expect(page.locator('#carRevealOverlay')).toBeHidden();
  await expect(page.locator('#garageCoinsText')).toContainText('200');
  await expect(page.locator('#btnGaragePrimary')).toHaveText(/YOUR RIDE/);

  // Paint it gold.
  await page.locator('#liverySelectRow [data-paint="GOLD_88"]').click();
  const s = await save(page);
  expect(s.fluxCoins).toBe(200);
  expect(s.garage.owned).toContain('BULLDOG_VAN');
  expect(s.garage.selected).toBe('BULLDOG_VAN');
  expect(s.garage.paint.BULLDOG_VAN).toBe('GOLD_88');
  expect(s.garage.revealed).toContain('BULLDOG_VAN');

  // Reload: the van is still yours, still gold, and the reveal doesn't replay.
  await page.reload();
  await openGarage(page);
  await expect(page.locator('#garageModal')).toHaveAttribute('data-view-car', 'BULLDOG_VAN');
  await expect(page.locator('#liverySelectRow [data-paint="GOLD_88"]')).toHaveClass(/is-on/);
  await page.waitForTimeout(300);
  await expect(page.locator('#carRevealOverlay')).toBeHidden();
  expect(problems).toEqual([]);
});

test('a locked milestone car shows how to unlock it and cannot be driven; arrows and keys browse', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await openGarage(page);
  await page.locator('#btnGarageNext').click();
  const id = await page.locator('#garageModal').getAttribute('data-view-car');
  expect(id).not.toBe('FLUX_COUPE_88');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#garageModal')).toHaveAttribute('data-view-car', 'FLUX_COUPE_88');
  await page.locator('#garageThumbs [data-car-id="GO_ROCKET_5"]').click();
  await expect(page.locator('#garageUnlockText')).toContainText('FINISH 1ST 3 TIMES');
  await expect(page.locator('#btnGaragePrimary')).toBeDisabled();
  // Paint is for cars you own.
  await expect(page.locator('#liverySelectRow button').first()).toBeDisabled();
  expect(problems).toEqual([]);
});

test('an upgrade bought in the garage raises the spec bars and spends coins', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { fluxCoins: 300, onboarded: true });
  await page.goto(APP);
  await openGarage(page);
  const before = await page.locator('#garageSpecs [data-stat="speed"] .spec-num').innerText();
  await page.locator('#upgradesList [data-upgrade="engine"]').click();
  await expect(page.locator('#garageSpecs [data-stat="speed"] .spec-num')).not.toHaveText(before);
  expect((await save(page)).upgrades.engine).toBe(2);
  expect((await save(page)).fluxCoins).toBe(250);
  expect(problems).toEqual([]);
});

test('earning a car in a race plays the reveal over the results', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.evaluate(() => { window.__OT.GameState.score = 9999999; window.__OT.finishRun(); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#carRevealOverlay')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#carRevealName')).toContainText('Kestrel');
  await page.locator('#btnRevealLater').click();
  await expect(page.locator('#carRevealOverlay')).toBeHidden();
  await expect(page.locator('#gameOverModal')).toBeVisible();
  expect(problems).toEqual([]);
});

const VIEWPORTS = [
  { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 820, height: 1180 },
  { width: 1180, height: 820 }, { width: 1280, height: 720 },
];
const PARTS = ['#garageStage', '#garageThumbs', '#garageCarName', '#garageSpecs', '#btnGaragePrimary', '#liverySelectRow', '#underglowSelectRow', '#upgradesList', '#btnResumeFromGarage', '#btnCloseGarage', '#garageCoinsText'];
const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

for (const vp of VIEWPORTS) {
  test(`garage fits at ${vp.width}x${vp.height}: no overlaps, no sideways scroll, 44px targets`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(APP);
    await openGarage(page);
    await page.waitForTimeout(250);
    const boxes = await page.evaluate((sels) => {
      const modal = document.getElementById('garageModal');
      // The pause actions are sticky (0240): measure them where they sit in the flow, i.e. with the
      // sheet scrolled to the end; everything else is the same at any scroll position.
      modal.scrollTop = modal.scrollHeight;
      const top = modal.scrollTop;
      const out = {};
      for (const s of sels) {
        const r = document.querySelector(s).getBoundingClientRect();
        out[s] = { x: r.x, y: r.y + top, width: r.width, height: r.height };
      }
      out.scrollW = modal.scrollWidth;
      out.clientW = modal.clientWidth;
      return out;
    }, PARTS);
    expect(boxes.scrollW, 'no sideways scroll').toBeLessThanOrEqual(boxes.clientW + 1);
    for (const s of PARTS) {
      const b = boxes[s];
      expect(b.width, `${s} visible`).toBeGreaterThan(0);
      expect(b.x, `${s} left`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${s} right`).toBeLessThanOrEqual(vp.width + 1);
    }
    for (let i = 0; i < PARTS.length; i++) for (let j = i + 1; j < PARTS.length; j++) {
      expect(overlap(boxes[PARTS[i]], boxes[PARTS[j]]), `${PARTS[i]} overlaps ${PARTS[j]}`).toBeFalsy();
    }
    for (const s of ['#btnGaragePrev', '#btnGarageNext', '#btnGaragePrimary', '#btnCloseGarage', '#btnResumeFromGarage']) {
      const r = await page.locator(s).boundingBox();
      expect(Math.min(r.width, r.height), `${s} touch target`).toBeGreaterThanOrEqual(44);
    }
    // Swipe left on the stage: next car.
    const st = await page.locator('#garageStage').boundingBox();
    await page.locator('#garageStage').scrollIntoViewIfNeeded();
    const st2 = await page.locator('#garageStage').boundingBox();
    // A swipe is a drag that lifts within 320 ms: send it as one burst of input events (CDP
    // runs them in order), not five round trips that a loaded runner can stretch past that.
    const y = st2.y + st2.height / 2, x0 = st2.x + st2.width * 0.8, x1 = st2.x + st2.width * 0.2;
    const cdp = await page.context().newCDPSession(page);
    const mouse = (type, x, buttons) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
    await mouse('mouseMoved', x0, 0);
    await Promise.all([
      mouse('mousePressed', x0, 1),
      ...[0.33, 0.66, 1].map((k) => mouse('mouseMoved', x0 + (x1 - x0) * k, 1)),
      mouse('mouseReleased', x1, 0),
    ]);
    await expect(page.locator('#garageModal')).not.toHaveAttribute('data-view-car', 'FLUX_COUPE_88');
    expect(st.width).toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });
}
