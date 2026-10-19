import { test, expect } from '@playwright/test';
import { APP, frameStats } from './helpers.js';

// Light perf probe: median rAF interval during a race (after a warm-up; helpers.js frameStats). Thresholds are deliberately
// generous (headless CI uses software rendering); the Keeper tracks the trend in docs/PERF.md.
test('perf probe: median frame interval during a race', { tag: '@perf' }, async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  const st = await frameStats(page, { frames: 120, warmup: 30 });
  const ms = st.interval.p50;
  await page.keyboard.up('ArrowUp');
  info.annotations.push({ type: 'median-frame-ms', description: ms.toFixed(2) });
  console.log(`[perf] median frame interval: ${ms.toFixed(2)} ms (${(1000 / ms).toFixed(1)} fps), js p50 ${st.js.p50.toFixed(2)} ms`);
  expect(ms).toBeLessThan(100);
  expect(st.js.p50).toBeLessThan(30);
});
