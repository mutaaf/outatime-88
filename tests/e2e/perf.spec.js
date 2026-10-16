import { test, expect } from '@playwright/test';
import { APP } from './helpers.js';

// Light perf probe: average rAF interval during a race. Thresholds are deliberately
// generous (headless CI uses software rendering); the Keeper tracks the trend in docs/PERF.md.
test('perf probe: average frame interval during a race', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  const ms = await page.evaluate(() => new Promise((resolve) => {
    const times = [];
    function tick(t) {
      times.push(t);
      if (times.length < 121) requestAnimationFrame(tick);
      else resolve((times[times.length - 1] - times[0]) / (times.length - 1));
    }
    requestAnimationFrame(tick);
  }));
  await page.keyboard.up('ArrowUp');
  info.annotations.push({ type: 'avg-frame-ms', description: ms.toFixed(2) });
  console.log(`[perf] avg frame interval: ${ms.toFixed(2)} ms (${(1000 / ms).toFixed(1)} fps)`);
  expect(ms).toBeLessThan(100);
});
