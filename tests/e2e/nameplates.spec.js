// Ticket 0238: in the first seconds of a six-car race the rivals bunch at the vanishing point.
// Their nameplates must never stack on each other (at most 3 on screen, the rivals directly ahead
// and behind always among them), and stay inside the view. Pickup clearance and the kept plates
// are proven by tests/unit/tags.test.js over the same layout function.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames, racing } from './helpers.js';

for (const [width, height] of [[1280, 720], [390, 844]]) {
  test(`bunched rival nameplates never overlap at ${width}x${height}`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width, height });
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.keyboard.down('ArrowUp');
    let seen = 0;
    for (let i = 0; i < 20; i++) {
      await nextFrames(page, 3);
      const d = await page.evaluate(() => { const b = window.__OT.backdrop(); return b && { rw: b.rw, plates: b.plates }; });
      if (!d) continue;
      const r = [];
      for (let o = 0; o < d.plates.length; o += 6) r.push({ x: d.plates[o] - d.plates[o + 2] / 2, y: d.plates[o + 1] - d.plates[o + 3] / 2, w: d.plates[o + 2], h: d.plates[o + 3] });
      expect(r.length).toBeLessThanOrEqual(3);
      if (r.length) seen++;
      for (let a = 0; a < r.length; a++) {
        expect(r[a].x).toBeGreaterThanOrEqual(0);
        expect(r[a].y).toBeGreaterThanOrEqual(0);
        for (let b = a + 1; b < r.length; b++) {
          const hit = r[a].x < r[b].x + r[b].w && r[b].x < r[a].x + r[a].w && r[a].y < r[b].y + r[b].h && r[b].y < r[a].y + r[a].h;
          expect(hit, `plate ${a} vs ${b}: ${JSON.stringify([r[a], r[b]])}`).toBe(false);
        }
      }
      if (i === 4) await info.attach(`plates-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    await page.keyboard.up('ArrowUp');
    expect(seen, 'the bunched grid shows some nameplates').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
}
