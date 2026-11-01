// Ticket 0237: a sign baked into an era backdrop is never cut by the screen edge. As the layers
// pan, a sign near or across an edge is covered by a clean patch of the layer under it (fully once
// it touches the edge); a sign well inside the view is drawn as painted.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames, racing } from './helpers.js';

const VIEWS = [[390, 844], [1280, 720], [844, 390]];

for (const [width, height] of VIEWS) {
  test(`2026 backdrop signs show whole or not at all at ${width}x${height}`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width, height });
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.waitForFunction(() => window.__OT.backdrop()?.id === '2026' && window.__OT.backdrop().signs.length > 0 && window.__OT.backdrop().signs.some((r) => r.v === 1), null, { timeout: 8000 });
    await nextFrames(page, 3);
    await info.attach(`2026-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' });
    let edge = 0, whole = 0;
    // steer both ways so the layers pan, and check every sign on screen each sample
    for (const key of ['ArrowLeft', 'ArrowRight', null]) {
      if (key) await page.keyboard.down(key);
      for (let i = 0; i < 6; i++) {
        await nextFrames(page, 4);
        const d = await page.evaluate(() => { const b = window.__OT.backdrop(); return { rw: b.rw, signs: b.signs.map((r) => ({ text: r.text, sx: r.sx, w: r.w / b.k, v: r.v })) }; });
        for (const s of d.signs) {
          const onScreen = s.sx < d.rw && s.sx + s.w > 0;
          if (!onScreen) continue;
          const cut = s.sx < 0 || s.sx + s.w > d.rw;
          if (cut) { edge++; expect(s.v, `"${s.text}" at x ${s.sx.toFixed(1)}..${(s.sx + s.w).toFixed(1)} of ${d.rw}`).toBe(0); }
          if (s.v === 1) whole++;
        }
      }
      if (key) await page.keyboard.up(key);
    }
    expect(whole, 'some signs show whole').toBeGreaterThan(0);
    if (width === 390) expect(edge, 'on a portrait phone signs start across the screen edges (BIJOU left, HOOK & LADDER right)').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
}
