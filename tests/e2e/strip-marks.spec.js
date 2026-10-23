// Ticket 0167: the track strip says who is who without colour. Every rival marker carries a
// unique letter in white on near-black (readable in grayscale), the cars directly ahead and
// behind wear the gap pills' ▲ / ▼, and the markers stay inside the strip at phone and desktop size.
import { test, expect } from '@playwright/test';
import { APP, watchPage, HUD_PANELS, racing, simWait, nextFrames } from './helpers.js';

const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every strip marker: its label, its text/background contrast, its box, and its ▲/▼ tag. */
const readStrip = (page) => page.evaluate(() => {
  const lum = (css) => {
    const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return [...document.querySelectorAll('#hudDots .hud-dot')].map((n) => {
    const cs = getComputedStyle(n);
    const [hi, lo] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
    const r = n.getBoundingClientRect();
    return {
      you: n.classList.contains('hud-dot-you'),
      label: n.textContent,
      near: n.dataset.near || '',
      arrow: getComputedStyle(n, '::before').content.replace(/["']/g, ''),
      contrast: (hi + 0.05) / (lo + 0.05),
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });
});

// Desktop sizes, phones down to 320 px, a landscape phone and a portrait tablet (LESSONS 0190/0202).
const SIZES = [[1280, 720], [1920, 1080], [390, 844], [375, 667], [320, 568], [844, 390], [768, 1024]];
for (const [width, height] of SIZES) {
  const vp = { width, height };
  test(`strip markers read without colour and stay in the strip at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page, { minTime: 0.5 });
    await simWait(page, 1.5); // the field strings out off the line
    await nextFrames(page, 4);
    await page.waitForFunction(() => document.querySelector('#hudDots [data-near]:not([data-near=""])'));

    const marks = await readStrip(page);
    const rivals = marks.filter((m) => !m.you);
    expect(marks.filter((m) => m.you).map((m) => m.label)).toEqual(['YOU']);
    expect(rivals).toHaveLength(5);
    for (const m of rivals) {
      expect(m.label).toMatch(/^[A-Z][A-Z0-9]?$/);
      // the ▲ / ▼ the gap pills use, on exactly the cars they talk about
      expect(m.arrow).toBe(m.near === 'ahead' ? '▲' : m.near === 'behind' ? '▼' : 'none');
      expect(m.contrast).toBeGreaterThanOrEqual(4.5);
    }
    // Unique without colour: the letters alone tell the five rivals apart.
    expect(new Set(rivals.map((m) => m.label)).size).toBe(5);
    // The cars either side are tagged, and only those.
    // (one of each at most: none ahead when you lead, none behind in last)
    const tagged = rivals.filter((m) => m.near).map((m) => m.near).sort().join();
    expect(['ahead', 'behind', 'ahead,behind']).toContain(tagged);

    // Inside the strip, and clear of every other HUD block.
    const track = await page.locator('#hudTrack').boundingBox();
    for (const m of marks) {
      expect(m.box.y).toBeGreaterThanOrEqual(track.y - 1);
      expect(m.box.y + m.box.height).toBeLessThanOrEqual(track.y + track.height + 1);
      expect(m.box.x).toBeGreaterThanOrEqual(track.x - 1);
      expect(m.box.x + m.box.width).toBeLessThanOrEqual(track.x + track.width + 1);
    }
    // A car on a lap line sits on its tick: the ticks follow the dot layer's inset.
    const ticks = await page.evaluate(() => {
      const d = document.getElementById('hudDots').getBoundingClientRect();
      return [...document.querySelectorAll('#hudTrack .lap-tick')].map((t, i) => {
        const r = t.getBoundingClientRect();
        return r.x + r.width / 2 - (d.x + (d.width * (i + 1)) / 3);
      });
    });
    expect(ticks).toHaveLength(2);
    for (const off of ticks) expect(Math.abs(off)).toBeLessThanOrEqual(1.5);
    for (const sel of HUD_PANELS.filter((s) => s !== '#hudTrack')) {
      const other = await page.locator(sel).boundingBox();
      if (!other) continue;
      for (const m of marks) expect(intersects(m.box, other), `${m.label} vs ${sel}`).toBeFalsy();
    }
    expect(problems).toEqual([]);
  });
}
