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
      tr.nearMissed = false;
      const t0 = g.raceTime; // a sim-time budget: a starved runner steps slowly
      let snap = null, after = 0, prevCoins = 0, flew = 0, surged = false;
      (function tick() {
        const plate = g.hitShockwaves.find((e) => e.label && /NEAR MISS/.test(e.label) && e.life > 0);
        // Read what the art drew two frames after the plate went up.
        // The frame the plate appears: did a coin fly in or the car surge with it? Compared with the
        // frame before, so only a road pickup in that very frame could confuse it.
        if (plate && after === 0) { flew = g.pickupAnimations.length - prevCoins; surged = g.carSurgeTimer > 0.5; }
        prevCoins = g.pickupAnimations.length;
        if (plate && ++after >= 3 && !snap) {
          const s = OT.pickupArt();
          const rects = [];
          const at = g.hitShockwaves.indexOf(plate);
          // Only the near-miss plate's own slot (slot field 5 is its index in hitShockwaves).
          for (let i = 0; i < s.labels; i++) { const o = i * 7; if (s.slots[o + 5] === at) rects.push([s.slots[o], s.slots[o + 1], s.slots[o] + s.slots[o + 2], s.slots[o + 1] + s.slots[o + 3]]); }
          // An older plate expiring this frame can shift the indexes the art used: try the next frame.
          if (rects.length) snap = { label: plate.label, rects, box: { ...s.box }, rw: s.rw, rh: s.rh, flew, surged, muted: OT.audio().muted };
        }
        if (snap) { OT.pause(); resolve(snap); return; }
        if (g.raceTime - t0 > 10 || g.status !== 'PLAYING') { OT.pause(); resolve(null); return; }
        if (!tr.nearMissed) {
          // Beside the car, just outside contact (the near-miss band is 0.18 past it), at speed.
          g.speed = Math.max(g.speed, 70);
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
    // Not a pickup: no coin flies in and the car doesn't surge.
    expect(seen.flew).toBe(0);
    expect(seen.surged).toBe(false);
    // Drawn: its own slot is inside the canvas and never over the car (src/popups.js).
    expect(seen.rects.length).toBe(1);
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
