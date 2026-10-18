// Car unlocks (ticket 0071): locked cars can't be driven, milestones unlock them, the
// car you pick is remembered and its specs (HP here) are what you race with.
import { test, expect } from '@playwright/test';
import { APP, watchPage, skipToGreen } from './helpers.js';

const car = (page, id) => page.locator(`#characterRosterGrid button[data-car-id="${id}"]`);
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2') || '{}'));

test('locked cars stay locked until earned; an unlocked car is remembered and raced', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(car(page, 'FLUX_COUPE_88')).toHaveAttribute('data-locked', '0');
  await expect(car(page, 'PASS_RUNNER_86')).toHaveAttribute('data-locked', '0');
  await expect(car(page, 'BLUE_KESTREL')).toHaveAttribute('data-locked', '1');
  await expect(car(page, 'BLUE_KESTREL')).toContainText('SILVER ON CLOCK HOLLOW');

  // Tapping a locked car never selects it.
  await car(page, 'BLUE_KESTREL').click();
  expect(await page.evaluate(() => window.__OT.GameState.selectedCharIdx)).toBe(0);
  await page.evaluate(() => document.getElementById('garageModal').classList.add('hidden'));

  // A gold run on level 1 earns the silver-on-level-1 car.
  await page.locator('#btnStartEvent').click();
  await page.evaluate(() => { window.__OT.GameState.score = 9999999; window.__OT.finishRun(); });
  await expect(page.locator('#endUnlockText')).toContainText('NEW CAR UNLOCKED');
  await expect(page.locator('#endUnlockText')).toContainText('KESTREL');
  expect((await save(page)).career.races).toBe(1);

  await page.reload();
  await page.locator('#btnOpenEvents').click();
  await expect(car(page, 'BLUE_KESTREL')).toHaveAttribute('data-locked', '0');
  await car(page, 'BLUE_KESTREL').click();
  expect((await save(page)).garage.selected).toBe('BLUE_KESTREL');

  await page.reload();
  await page.locator('#btnOpenEvents').click();
  await page.locator('#btnStartEvent').click();
  const hp = await page.evaluate(() => [window.__OT.GameState.maxHp, window.__OT.GameState.carParamsFor]);
  expect(hp).toEqual([108, 'BLUE_KESTREL']);
  expect(problems).toEqual([]);
});

// Car identity: the car you pick is the car you see — its own shape in the race (not one
// generic sprite in different paint), on the lineup card, and on the podium.
test('the chosen car races as itself: its shape on the road, the lineup and the podium', async ({ page }, info) => {
  const problems = watchPage(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      garage: { owned: ['FLUX_COUPE_88', 'PASS_RUNNER_86', 'BULLDOG_VAN'], selected: 'BULLDOG_VAN', paint: {}, revealed: ['BULLDOG_VAN'] },
    }));
  });
  await page.goto(`${APP}?debug&intro`);
  await page.locator('#btnOpenEvents').click();
  await page.locator('#btnStartEvent').click();
  // The lineup card for each racer shows that racer's car (a rendered portrait, not an emoji).
  await expect(page.locator('#rcCard .rc-car-art')).toBeVisible({ timeout: 8000 });
  await skipToGreen(page);
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.playerShape2D), { timeout: 8000 }).toBe('HEAVY_VAN');
  expect(await page.evaluate(() => window.__OT.GameState.carParamsFor)).toBe('BULLDOG_VAN');
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('van-race.png') });
  // The podium lists every racer with their car.
  await page.evaluate(() => { window.__OT.GameState.score = 1000; window.__OT.finishRun(); });
  await expect(page.locator('#endPodium .pod-car').first()).toBeVisible({ timeout: 8000 });
  expect(await page.locator('#endPodium .pod-car').count()).toBeGreaterThanOrEqual(5);
  expect(problems).toEqual([]);
});

// Workstream J: every car on the road is painted (no blocks), the new electric roadster is in
// the garage and races, and boost leaves each car from its own pipes (cold-gas for the roadster).
test('the Volt Roadster is in the garage, races as itself, and its boost leaves its own nozzles', async ({ page }, info) => {
  const problems = watchPage(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      garage: { owned: ['FLUX_COUPE_88', 'PASS_RUNNER_86', 'VOLT_ROADSTER'], selected: 'VOLT_ROADSTER', paint: {}, revealed: ['VOLT_ROADSTER'] },
    }));
  });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(car(page, 'VOLT_ROADSTER')).toHaveAttribute('data-locked', '0');
  await page.screenshot({ path: info.outputPath('roadster-garage.png') });
  await page.locator('#btnStartEvent').click();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.playerShape2D), { timeout: 8000 }).toBe('ROADSTER');
  await page.waitForFunction(() => window.__OT.GameState.racePhase !== 'START', null, { timeout: 15000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.nosBurning), { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__OT.GameState.thrustTips)).toBe(2); // two cold-gas nozzles
  await page.screenshot({ path: info.outputPath('roadster-nos.png') });
  await page.keyboard.up('Shift');
  await page.keyboard.up('ArrowUp');
  expect(problems).toEqual([]);
});
