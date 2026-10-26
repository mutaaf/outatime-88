// Play-on-mute (ticket 0206, docs/ACCESSIBILITY.md): a sound that tells you something has a
// visual twin. A near-miss on civilian traffic used to play only the coin chime (the combo pill
// ticks up, but nothing says why); it now raises a score plate beside the car. Muted, through
// the ?debug hooks: one traffic car is held just outside the player's side at speed.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

for (const [w, h] of [[390, 844], [1280, 720]]) {
  test(`muted at ${w}x${h}: a traffic near-miss shows a plate`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT);
    await page.locator('#btnStartRace').click();
    await racing(page, { timeout: 30000 });
    await page.waitForFunction(() => window.__OT.pickupArt());
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const OT = window.__OT, g = OT.GameState, lt = OT.traffic();
      OT.audio().setMuted(true);
      const tr = lt.traffic[0];
      const t0 = performance.now();
      let snap = null, after = 0;
      (function tick() {
        const plate = g.hitShockwaves.find((e) => e.label && /NEAR MISS/.test(e.label) && e.life > 0);
        // Read what the art drew two frames after the plate went up.
        if (plate && ++after >= 3 && !snap) {
          const s = OT.pickupArt();
          const rects = [];
          for (let i = 0; i < s.labels; i++) { const o = i * 7; rects.push([s.slots[o], s.slots[o + 1], s.slots[o] + s.slots[o + 2], s.slots[o + 1] + s.slots[o + 3]]); }
          snap = { label: plate.label, labels: s.labels, rects, box: { ...s.box }, rw: s.rw, rh: s.rh, combo: g.combo, muted: OT.audio().muted };
        }
        if (snap) { OT.pause(); resolve(snap); return; }
        if (performance.now() - t0 > 15000) { OT.pause(); resolve(null); return; }
        if (!tr.nearMissed) {
          // Beside the car, just outside contact (the near-miss band is 0.18 past it), at speed.
          g.speed = Math.max(g.speed, 70);
          g.invulnTimer = 0;
          tr.idle = false; tr.takenDown = false; tr.active = true; tr.hitCount = 0;
          tr.vz = 0; tr.worldZ = tr.prevZ = g.visualPlayerZ || tr.worldZ;
          tr.offset = tr.prevOffset = g.playerX + (g.playerX > 0 ? -1 : 1) * (0.14 + tr.halfW + 0.06);
        }
        requestAnimationFrame(tick);
      })();
    }));
    expect(seen).not.toBeNull();
    expect(seen.muted).toBe(true);
    expect(seen.label).toMatch(/^🚗 NEAR MISS! \+\d+ \(x\d+\)$/);
    // Drawn: inside the canvas, never over the car (src/popups.js lays it out with the others).
    expect(seen.labels).toBeGreaterThanOrEqual(1);
    expect(seen.labels).toBeLessThanOrEqual(2);
    const { box, rw, rh, rects } = seen;
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    for (const r of rects) {
      expect(hit(r, [box.x0, box.y0, box.x1, box.y1])).toBe(false);
      expect(r[0] >= 0 && r[1] >= 0 && r[2] <= rw && r[3] <= rh).toBe(true);
    }
    await info.attach(`near-miss-${w}x${h}`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
