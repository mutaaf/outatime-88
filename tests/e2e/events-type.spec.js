// EVENTS sheet small print (ticket 0270): every visible text node in the EVENTS sheet (driver/car
// strip, track cards, ruleset, controls, how-to-play) is at least 10 px, and car names wrap
// whole instead of being cut with an ellipsis.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`EVENTS sheet text is readable at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    // A fresh save owns the two starters (car, driver, HP, mass cards) and sees the rest locked.
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ onboarded: true })), KEY);
    await page.goto(APP);
    await page.locator('#btnOpenEvents').click();
    await expect(page.locator('#startModal')).toBeVisible();
    await expect(page.locator('#characterRosterGrid button').first()).toBeVisible();
    await expect(page.locator('#levelSelectGrid button').first()).toBeVisible();
    // Open HOW TO PLAY so its small print is measured too.
    await page.locator('#howToPlay summary').click();
    await expect(page.locator('#howToPlay')).toHaveAttribute('open', '');
    // Measure in the real face: the narrower fallback font would hide wraps and overflow.
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("700 10px 'Orbitron'"))).toBeTruthy();

    const m = await page.evaluate(() => {
      const sheet = document.getElementById('startModal');
      const small = [];
      const walk = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 10) small.push(`${size}px "${n.textContent.trim().slice(0, 40)}"`);
      }
      // Each car card: its name line (first child) must not be cut and must sit inside the card.
      const names = [...document.querySelectorAll('#characterRosterGrid > button')].map((card) => {
        const n = card.firstElementChild;
        const cs = getComputedStyle(n);
        const r = card.getBoundingClientRect(), c = getComputedStyle(card);
        const inner = {
          left: r.left + parseFloat(c.borderLeftWidth) + parseFloat(c.paddingLeft),
          right: r.right - parseFloat(c.borderRightWidth) - parseFloat(c.paddingRight),
        };
        const s = document.createElement('span');
        s.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};white-space:nowrap;position:absolute`;
        document.body.appendChild(s);
        let word = 0;
        for (const x of n.textContent.trim().split(/\s+/)) { s.textContent = x; word = Math.max(word, s.getBoundingClientRect().width); }
        s.remove();
        const box = n.getBoundingClientRect();
        return {
          text: n.textContent.trim(), ellipsis: cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible',
          nowrap: cs.whiteSpace === 'nowrap', sw: n.scrollWidth, cw: n.clientWidth, word,
          contentW: inner.right - inner.left, left: box.left, right: box.right, inner,
          locked: card.dataset.locked === '1', opacity: +getComputedStyle(card).opacity * +cs.opacity,
          tap: Math.min(r.width, r.height),
        };
      });
      // No text in a car or track card spills past the card's edges (long one-word boss names did).
      const spills = [];
      for (const card of document.querySelectorAll('#characterRosterGrid > button, #levelSelectGrid > button')) {
        const r = card.getBoundingClientRect();
        const tw = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        for (let n; (n = tw.nextNode());) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(n);
          for (const b of range.getClientRects()) {
            if (b.left < r.left - 0.5 || b.right > r.right + 0.5) spills.push(`"${n.textContent.trim().slice(0, 30)}" ${Math.round(b.left)}-${Math.round(b.right)} outside ${Math.round(r.left)}-${Math.round(r.right)}`);
          }
        }
        // Text boxes in the same card must not sit on top of each other (the boss name and reward did).
        const boxes = [...card.querySelectorAll('span, div')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => [e, e.getBoundingClientRect()]);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const [ea, a] = boxes[i], [eb, b] = boxes[j];
          if (ea.contains(eb) || eb.contains(ea)) continue;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 0.5 && oy > 0.5) spills.push(`"${ea.textContent.trim().slice(0, 20)}" overlaps "${eb.textContent.trim().slice(0, 20)}"`);
        }
      }
      return { small, names, spills, sheetScroll: sheet.scrollWidth > sheet.clientWidth, pageScroll: document.documentElement.scrollWidth > innerWidth };
    });

    expect(m.small, 'text below 10 px').toEqual([]);
    expect(m.names.length).toBeGreaterThan(3);
    expect(m.names.some((n) => n.locked), 'a fresh save has locked cars').toBeTruthy();
    expect(m.names.some((n) => !n.locked), 'owned cars show too').toBeTruthy();
    for (const n of m.names) {
      expect(n.ellipsis || n.nowrap, `${n.text}: name wraps instead of being cut`).toBeFalsy();
      expect(n.sw, `${n.text}: name not clipped`).toBeLessThanOrEqual(n.cw + 0.5);
      expect(n.word, `${n.text}: no word is wider than the card`).toBeLessThanOrEqual(n.contentW + 0.5);
      expect(n.left, `${n.text} inside its card (left)`).toBeGreaterThanOrEqual(n.inner.left - 0.5);
      expect(n.right, `${n.text} inside its card (right)`).toBeLessThanOrEqual(n.inner.right + 0.5);
      expect(n.opacity, `${n.text}: caption not dimmed`).toBe(1);
      expect(n.tap, `${n.text} tap target`).toBeGreaterThanOrEqual(44);
    }
    expect(m.spills, 'card text stays inside its card').toEqual([]);
    expect(m.sheetScroll, 'EVENTS sheet has no sideways scroll').toBeFalsy();
    expect(m.pageScroll, 'page has no sideways scroll').toBeFalsy();

    // START RACE stays one scroll away.
    const start = page.locator('#btnStartEvent');
    await start.scrollIntoViewIfNeeded();
    await expect(start).toBeInViewport();
    expect(problems).toEqual([]);
  });
}

test('the garage sheet and title keep their 10 px floor next to the EVENTS change', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ onboarded: true })), KEY);
  await page.goto(APP);
  await page.evaluate(() => document.fonts.ready);
  const tiny = (sel) => page.evaluate((s) => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector(s), NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      if (!n.textContent.trim() || !n.parentElement.getClientRects().length) continue;
      const size = parseFloat(getComputedStyle(n.parentElement).fontSize);
      if (size < 10) out.push(`${size}px "${n.textContent.trim().slice(0, 40)}"`);
    }
    return out;
  }, sel);
  expect(await tiny('#titleScreen')).toEqual([]);
  await page.locator('#btnOpenGarageFromTitle').click();
  await expect(page.locator('#garageModal')).toBeVisible();
  expect(await tiny('#garageModal')).toEqual([]);
});
