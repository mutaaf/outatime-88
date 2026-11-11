// Results card small print (ticket 0263): every stat caption is at least 10 px and keeps 4.5:1 on
// its card, no caption or number is cut or runs into another, and the buttons stay real targets.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

// WCAG relative luminance / contrast of two opaque rgb() colours.
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`results stat captions are readable at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true })), KEY);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT?.startRace);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    // A long score: the widest number the card shows.
    await page.evaluate(() => { const G = window.__OT.GameState; G.score = 12345678; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("700 10px 'Orbitron'"))).toBeTruthy();

    const m = await page.evaluate(() => {
      const rgb = (s) => s.match(/[\d.]+/g).slice(0, 4).map(Number);
      // Composite the background chain under el over the page's near-black (the modal's backdrop).
      const bgUnder = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
          const c = rgb(getComputedStyle(e).backgroundColor);
          if ((c[3] ?? 1) > 0) layers.push(c);
        }
        let out = [5, 5, 13];
        for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
        return out;
      };
      const box = (el) => (({ left, right, top, bottom, width, height }) => ({ left, right, top, bottom, width, height }))(el.getBoundingClientRect());
      const cells = [...document.querySelectorAll('.end-stats .led-box')].map((cell) => {
        const small = cell.querySelector('small'), b = cell.querySelector('b');
        const cs = getComputedStyle(small), ct = getComputedStyle(cell);
        const r = cell.getBoundingClientRect();
        const inner = { left: r.left + parseFloat(ct.paddingLeft) + parseFloat(ct.borderLeftWidth) - 0.5,
          right: r.right - parseFloat(ct.paddingRight) - parseFloat(ct.borderRightWidth) + 0.5 };
        // Widest caption word laid out alone in the same font: it must fit the cell without breaking.
        const s = document.createElement('span');
        s.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};white-space:nowrap;position:absolute`;
        document.body.appendChild(s);
        let word = 0; for (const w of small.textContent.split(/\s+/)) { s.textContent = w; word = Math.max(word, s.getBoundingClientRect().width); }
        s.remove();
        return {
          text: small.textContent, size: parseFloat(cs.fontSize), color: rgb(cs.color), opacity: +cs.opacity,
          bg: bgUnder(small), small: box(small), b: box(b), inner, cell: box(cell), word,
          bClipped: b.scrollWidth > b.clientWidth + 1,
        };
      });
      const btn = box(document.querySelector('#btnPlayAgain'));
      // How much taller the bigger captions make the card: the stats grid against the same grid with
      // the old 8 px captions (the larger of the two sizes it had), measured in this layout.
      const grid = document.querySelector('.end-stats');
      const now = grid.getBoundingClientRect().height;
      const old = document.createElement('style');
      old.textContent = '.end-stats small { font-size: 8px !important; line-height: normal !important; }';
      document.head.appendChild(old);
      const before = grid.getBoundingClientRect().height;
      old.remove();
      return { cells, btn, grow: now - before };
    });

    expect(m.cells.length).toBe(4);
    for (const c of m.cells) {
      expect(c.size, `${c.text} font-size`).toBeGreaterThanOrEqual(10);
      expect(c.opacity).toBe(1);
      expect(contrast(c.color, c.bg), `${c.text} contrast`).toBeGreaterThanOrEqual(4.5);
      // Caption and number sit inside their cell's content box, caption above the number.
      expect(c.small.left, `${c.text} left`).toBeGreaterThanOrEqual(c.inner.left);
      expect(c.small.right, `${c.text} right`).toBeLessThanOrEqual(c.inner.right);
      expect(c.word, `${c.text}: a word wider than its cell`).toBeLessThanOrEqual(c.inner.right - c.inner.left);
      expect(c.small.bottom, `${c.text} runs into its number`).toBeLessThanOrEqual(c.b.top + 0.5);
      expect(c.b.bottom).toBeLessThanOrEqual(c.cell.bottom + 0.5);
      expect(c.bClipped, `${c.text} number is cut`).toBe(false);
    }
    // No two cells overlap.
    for (let i = 0; i < m.cells.length; i++) for (let j = i + 1; j < m.cells.length; j++) {
      const a = m.cells[i].cell, b = m.cells[j].cell;
      expect(a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5,
        `${m.cells[i].text} overlaps ${m.cells[j].text}`).toBe(false);
    }
    // The card scrolls no further than before: two caption rows grow ~2-3 px each, never a wrap.
    expect(m.grow, 'stats grid growth (px)').toBeLessThanOrEqual(8);
    // The replay button stays a real target, reachable on the card.
    expect(Math.min(m.btn.width, m.btn.height)).toBeGreaterThanOrEqual(44);
    await page.locator('#btnPlayAgain').scrollIntoViewIfNeeded();
    await expect(page.locator('#btnPlayAgain')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`results-type-${vp.width}x${vp.height}.png`) });
    expect(problems).toEqual([]);
  });
}
