// Garage strip small print (ticket 0262): every car name and spec delta is at least 10 px, a locked
// car's name is not dimmed with its thumb (only the art is) and keeps 4.5:1, and no name is cut.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

// WCAG relative luminance / contrast of two opaque rgb() colours.
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`garage strip names and deltas are readable at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ onboarded: true, upgrades: { engine: 5, tires: 5, flux: 5, hover: 5 } })), KEY);
    await page.goto(APP);
    await page.locator('#btnOpenGarageFromTitle').click();
    await expect(page.locator('#garageModal')).toBeVisible();
    // View a locked car so the specs compare it with yours and show deltas; maxed upgrades give
    // two-digit numbers, the widest value + delta the column holds.
    await page.locator('#garageThumbs .garage-thumb.is-locked').first().click();
    await expect(page.locator('#garageSpecs .spec-delta').first()).toBeVisible();
    // Measure in the real face: the narrower fallback font would hide wraps and overflow.
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("700 10px 'Orbitron'"))).toBeTruthy();

    const m = await page.evaluate(() => {
      const rgb = (s) => s.match(/[\d.]+/g).slice(0, 4).map(Number);
      // Effective opacity of an element: the product of its own and every ancestor's.
      const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
      // Composite the background chain under el (top-most first) over the shell's base colour (approximate: the
      // shell's gradient is ignored; locked names must be undimmed, so ancestor opacity never scales the background).
      const bgUnder = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
          const c = rgb(getComputedStyle(e).backgroundColor);
          if ((c[3] ?? 1) > 0) layers.push(c);
          if (e.classList.contains('garage-shell')) break;
        }
        let out = [11, 8, 32];
        for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
        return out;
      };
      const names = [...document.querySelectorAll('#garageThumbs .thumb-name')].map((n) => {
        const cs = getComputedStyle(n);
        const thumb = n.closest('.garage-thumb');
        return {
          locked: thumb.classList.contains('is-locked'), text: n.textContent,
          size: parseFloat(cs.fontSize), color: rgb(cs.color), alpha: opacity(n), bg: bgUnder(n),
          lines: Math.round(n.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
          box: (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(n.getBoundingClientRect()),
          inner: (() => { const r = thumb.getBoundingClientRect(), t = getComputedStyle(thumb);
            return { left: r.left + parseFloat(t.borderLeftWidth), right: r.right - parseFloat(t.borderRightWidth), bottom: r.bottom - parseFloat(t.borderBottomWidth) }; })(),
          // Widest single word, laid out alone in the same font: it must fit the line without breaking.
          word: (() => { const s = document.createElement('span'); s.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};white-space:nowrap;position:absolute`;
            document.body.appendChild(s); let w = 0; for (const x of n.textContent.split(/[\s-]/)) { s.textContent = x; w = Math.max(w, s.getBoundingClientRect().width); } s.remove(); return w; })(),
          cw: n.clientWidth, dashed: getComputedStyle(thumb).borderTopStyle === 'dashed', view: thumb.classList.contains('is-view'),
          padlock: !!thumb.querySelector('.thumb-lock'),
          tw: thumb.getBoundingClientRect().width, th: thumb.getBoundingClientRect().height,
        };
      });
      const deltas = [...document.querySelectorAll('#garageSpecs .spec-delta')].map((d) => parseFloat(getComputedStyle(d).fontSize));
      const nums = [...document.querySelectorAll('#garageSpecs .spec-num')].map((n) => ({ sw: n.scrollWidth, cw: n.clientWidth, right: n.getBoundingClientRect().right, rowRight: n.closest('.spec-row').getBoundingClientRect().right }));
      const strip = document.getElementById('garageThumbs');
      const tops = new Set([...strip.children].map((c) => Math.round(c.getBoundingClientRect().top)));
      return { names, deltas, nums, rows: tops.size, stripScroll: strip.scrollWidth > strip.clientWidth };
    });

    expect(m.names.length).toBeGreaterThan(3);
    expect(m.names.some((n) => n.locked), 'a fresh save has locked cars').toBeTruthy();
    for (const n of m.names) {
      expect(n.size, `${n.text} font-size`).toBeGreaterThanOrEqual(10);
      expect(n.lines, `${n.text} lines`).toBeLessThanOrEqual(3);
      expect(n.word, `${n.text}: no word is split mid-word`).toBeLessThanOrEqual(n.cw + 0.5);
      expect(n.box.left, `${n.text} inside its thumb (left)`).toBeGreaterThanOrEqual(n.inner.left - 0.5);
      expect(n.box.right, `${n.text} inside its thumb (right)`).toBeLessThanOrEqual(n.inner.right + 0.5);
      expect(n.box.bottom, `${n.text} inside its thumb (bottom)`).toBeLessThanOrEqual(n.inner.bottom + 0.5);
      expect(Math.min(n.tw, n.th), `${n.text} tap target`).toBeGreaterThanOrEqual(44);
      // Blend the text colour over its background at the opacity it really draws with.
      const a = n.alpha * (n.color[3] ?? 1);
      const shown = n.color.slice(0, 3).map((v, i) => v * a + n.bg[i] * (1 - a));
      expect(contrast(shown, n.bg), `${n.text} contrast`).toBeGreaterThanOrEqual(4.5);
      if (n.locked) {
        expect(n.alpha, `${n.text} not dimmed`).toBe(1);
        expect(n.padlock, `${n.text}: a locked thumb shows its padlock`).toBeTruthy();
        // The car being viewed wears the pink selection frame instead.
        if (!n.view) expect(n.dashed, `${n.text}: a locked thumb has a dashed frame`).toBeTruthy();
      }
    }
    expect(m.deltas.length).toBeGreaterThan(0);
    for (const d of m.deltas) expect(d, 'spec delta font-size').toBeGreaterThanOrEqual(10);
    for (const n of m.nums) expect(n.sw, 'spec number and delta fit their column').toBeLessThanOrEqual(n.cw);
    expect(m.rows, 'strip is one row').toBe(1);
    expect(m.stripScroll, 'strip scrolls sideways').toBeTruthy();
    expect(problems).toEqual([]);
  });
}
