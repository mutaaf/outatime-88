// Slipstream charge cue (ticket 0197): sitting in a wake greens and lifts the speed lines, tints
// the edges, plays a rising tone, and from READY pulses; leaving the wake stops it all. Calm mode
// keeps a static tint and no lines; muted plays nothing. A traffic car is held in the wake.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

async function startRace(page) {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click(); // a real gesture: the AudioContext may start
  await page.waitForFunction(() => !!window.__OT.audio().tuner, null, { timeout: 20_000 });
  await racing(page);
}

/** Park a traffic car 900 units ahead in your lane and hold the charge (or let it be). */
const holdWake = (page, charge) => page.evaluate((charge) => {
  const g = window.__OT.GameState;
  const car = window.__OT.traffic().traffic[0];
  window.__wake = setInterval(() => {
    g.invulnTimer = 30; g.speed = 62; g.hp = g.maxHp;
    car.takenDown = false; car.worldZ = g.trackPos + 1250 + 900; car.offset = g.playerX; car.mph = 62;
    if (charge != null) g.draftCharge = charge;
  }, 10);
}, charge);
/** Leave the wake: the car goes far ahead and you drop under the 50 mph a wake needs. */
const leaveWake = async (page) => {
  await page.evaluate(() => {
    clearInterval(window.__wake);
    const g = window.__OT.GameState;
    window.__OT.traffic().traffic[0].worldZ = g.trackPos + 60000;
    window.__slow = setInterval(() => { g.speed = 30; }, 10);
  });
};
const release = (page) => page.evaluate(() => clearInterval(window.__slow));
const cue = (page) => page.evaluate(() => ({ ...window.__OT.GameState.wakeCue, lines: window.__OT.GameState.fxLinesDrawn }));

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`in a wake the cue builds and ends with it (${size.width}x${size.height})`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize(size);
    await startRace(page);
    await page.evaluate(() => { const g = window.__OT.GameState; window.__hold = setInterval(() => { g.speed = 62; }, 10); });
    await nextFrames(page, 3);
    const plain = (await cue(page)).lines;
    await page.evaluate(() => clearInterval(window.__hold));

    await holdWake(page, 90);
    await page.waitForFunction(() => { const c = window.__OT.GameState.wakeCue; return c && c.on && c.ready; }, null, { timeout: 10_000 });
    await nextFrames(page, 2);
    const c = await cue(page);
    expect(c.tint).toBeGreaterThan(0.8);
    expect(c.lines).toBeGreaterThan(plain); // the wake lifts the lines past what 62 mph alone draws
    await page.screenshot({ path: info.outputPath(`wake-90-${size.width}x${size.height}.png`) });
    // The tone follows: on, and ticking at READY.
    await expect.poll(() => page.evaluate(() => window.__OT.audio().tuner.st.draftOn), { timeout: 5000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__OT.audio().tuner.st.draftTicks), { timeout: 5000 }).toBeGreaterThan(0);

    await leaveWake(page);
    await page.waitForFunction(() => !window.__OT.GameState.wakeCue.on, null, { timeout: 5000 });
    await expect.poll(() => page.evaluate(() => window.__OT.audio().tuner.st.draftOn), { timeout: 5000 }).toBe(false);
    await release(page);
    expect(problems).toEqual([]);
  });
}

test('calm mode: a steady tint, no speed lines, no pulse', async ({ page }) => {
  const problems = watchPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startRace(page);
  await holdWake(page, 92);
  await page.waitForFunction(() => { const c = window.__OT.GameState.wakeCue; return c && c.on && c.ready; }, null, { timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    await nextFrames(page, 2);
    const c = await cue(page);
    expect(c.pulse).toBe(0);
    expect(c.lines).toBe(0);
    expect(c.tint).toBeGreaterThan(0.8);
  }
  await leaveWake(page);
  await release(page);
  expect(problems).toEqual([]);
});

test('muted: no slipstream tone is started', async ({ page }) => {
  const problems = watchPage(page);
  await startRace(page);
  await page.evaluate(() => window.__OT.audio().setMuted(true));
  await holdWake(page, 85);
  await page.waitForFunction(() => { const c = window.__OT.GameState.wakeCue; return c && c.on; }, null, { timeout: 10_000 });
  await nextFrames(page, 10);
  const t = await page.evaluate(() => { const s = window.__OT.audio().tuner.st; return { starts: s.draftStarts, ticks: s.draftTicks }; });
  expect(t).toEqual({ starts: 0, ticks: 0 });
  // Unmuted, the same wake sounds: the layer was live all along.
  await page.evaluate(() => window.__OT.audio().setMuted(false));
  await expect.poll(() => page.evaluate(() => window.__OT.audio().tuner.st.draftStarts), { timeout: 5000 }).toBeGreaterThan(0);
  await leaveWake(page);
  await release(page);
  expect(problems).toEqual([]);
});
