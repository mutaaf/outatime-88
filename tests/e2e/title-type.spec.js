// Title, garage and pill small print (ticket 0268): every visible text on the title (home hooks, the
// icon captions, the READY FOR OFFLINE pill) and in the garage is at least 10 px at 360x640, 390x844,
// 844x390 and 1280x720; no caption runs outside its box or into a neighbour; the title buttons stay
// 44 px and the title does not scroll.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
// A returning player (home hooks, not the first-visit pitch) with maxed upgrades: the garage shows
// two-digit specs and deltas, the widest its rows get.
const SAVE = JSON.stringify({ onboarded: true, bestScore: 42000, fluxCoins: 600, endless: { bestDistance: 3880, bestTier: 2, runs: 6 },
  upgrades: { engine: 5, tires: 5, flux: 5, hover: 5 } });

// Every shown text node (letters or digits) under root: its element, size and box.
function texts(rootSel) {
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const out = [];
  const root = document.querySelector(rootSel);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!/[A-Za-z0-9]/.test(t.textContent)) continue;
    const el = t.parentElement;
    if (!shown(el)) continue;
    const cls = (e) => (typeof e.className === 'string' ? e.className.split(' ')[0] : '');
    const name = el.id ? '#' + el.id : cls(el) || `${cls(el.parentElement)} ${el.tagName.toLowerCase()}`;
    out.push({ where: `${name} "${t.textContent.trim().slice(0, 30)}"`, size: parseFloat(getComputedStyle(el).fontSize) });
  }
  // The pseudo-element NEW tag on a hook card's title is print too.
  for (const el of root.querySelectorAll('.home-hook.is-new .hook-text b')) {
    const cs = getComputedStyle(el, '::after');
    if (shown(el) && cs.content.includes('NEW')) out.push({ where: 'hook-text b::after "NEW"', size: parseFloat(cs.fontSize) });
  }
  return out;
}

// Captions this ticket raised: each sits inside its parent's content box (or its own box when it
// clips with an ellipsis/line clamp, every word still fits a line), and no two overlap.
function captions(sels) {
  const R = (el) => el.getBoundingClientRect();
  const out = [];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = R(el);
      if (!r.width || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      let hidden = false;
      for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') hidden = true;
      if (hidden) continue;
      const p = el.parentElement, pr = R(p), ps = getComputedStyle(p);
      const inner = { left: pr.left + parseFloat(ps.borderLeftWidth) + parseFloat(ps.paddingLeft) - 0.5,
        right: pr.right - parseFloat(ps.borderRightWidth) - parseFloat(ps.paddingRight) + 0.5 };
      const cs = getComputedStyle(el);
      const s = document.createElement('span');
      s.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};white-space:nowrap;position:absolute`;
      document.body.appendChild(s);
      let word = 0;
      for (const w of el.textContent.split(/\s+/)) { s.textContent = w; word = Math.max(word, s.getBoundingClientRect().width); }
      // A one-line, no-wrap caption must fit whole.
      if (cs.whiteSpace === 'nowrap') { s.textContent = el.textContent.trim(); word = s.getBoundingClientRect().width; }
      s.remove();
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      out.push({ sel, text: el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, inner,
        word, room: r.width - pad + 0.5, vw: innerWidth });
    }
  }
  return out;
}

const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

function checkCaptions(list, label) {
  for (const c of list) {
    expect(c.left, `${label}: ${c.sel} "${c.text}" inside its parent (left)`).toBeGreaterThanOrEqual(c.inner.left);
    expect(c.right, `${label}: ${c.sel} "${c.text}" inside its parent (right)`).toBeLessThanOrEqual(c.inner.right);
    expect(c.word, `${label}: ${c.sel} "${c.text}" fits its box`).toBeLessThanOrEqual(c.room);
    expect(c.left, `${label}: ${c.sel} "${c.text}" on screen`).toBeGreaterThanOrEqual(-0.5);
    expect(c.right, `${label}: ${c.sel} "${c.text}" on screen`).toBeLessThanOrEqual(c.vw + 0.5);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    expect(overlap(list[i], list[j]), `${label}: "${list[i].text}" overlaps "${list[j].text}"`).toBe(false);
  }
}

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`title and garage text is 10px or more at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    // No entrance animations: measure the settled layout, not a card mid-slide.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, SAVE]);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT && window.__OT.home());
    await expect(page.locator('#homeHooks .home-hook').first()).toBeVisible();
    // The offline pill shows once the service worker has cached the game (blocked in tests): show it
    // with its real copy, and a NEW badge on the first hook, so their print is measured too.
    await page.evaluate(() => {
      const p = document.getElementById('offlinePill');
      p.textContent = '✓ READY FOR OFFLINE';
      p.classList.remove('hidden');
      document.querySelector('#homeHooks .home-hook').classList.add('is-new');
    });
    // Let the hook cards finish their entrance and the fonts load before measuring.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);

    const title = await page.evaluate(texts, '#titleScreen');
    const seen = title.map((t) => t.where).join('\n');
    // Phones on their side show the icons without captions (styles.css, max-height 430px).
    const labels = ['READY FOR OFFLINE', 'hook-text small', '"NEW"', ...(vp.height > 430 ? ['"SETTINGS"', '"GARAGE"'] : [])];
    for (const label of labels) expect(seen, `${label} measured`).toContain(label);
    expect(title.filter((t) => t.size < 10).map((t) => `${t.where}: ${t.size}px`), 'title text under 10px').toEqual([]);
    checkCaptions(await page.evaluate(captions, ['.title-icon > small', '#offlinePill', '.hook-text small', '.hook-text b']), 'title');

    const chrome = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#titleScreen button')].filter((b) => {
        const r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).visibility !== 'hidden' && b.closest('.hidden') === null
          && b.id !== 'offlinePill'; // a 24 px status pill since 0158, not a menu button
      }).map((b) => ({ id: b.id || b.className, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }));
      // The title is position: fixed, so it is the box that would scroll, not the document.
      const ts = document.getElementById('titleScreen');
      // Hook titles clamp at two lines: none may lose words (or the NEW tag) to the clamp.
      const cut = [...document.querySelectorAll('#homeHooks .hook-text b')].filter((b) => b.getClientRects().length && b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent);
      return { btns, scrollH: ts.scrollHeight, h: ts.clientHeight, scrollW: ts.scrollWidth, w: ts.clientWidth, cut,
        doc: document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth };
    });
    for (const b of chrome.btns) {
      expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(44 - 0.5);
      expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(44 - 0.5);
    }
    expect(chrome.scrollH, 'title gains no page scroll').toBeLessThanOrEqual(chrome.h);
    expect(chrome.doc, 'page does not scroll').toBe(true);
    expect(chrome.cut, 'hook titles cut by the two-line clamp').toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`title-type-${vp.width}x${vp.height}.png`) });

    // The garage, viewing a locked car so the spec rows carry deltas.
    await page.locator('#btnOpenGarageFromTitle').click();
    await expect(page.locator('#garageModal')).toBeVisible();
    await page.locator('#garageThumbs .garage-thumb.is-locked').first().click();
    await expect(page.locator('#garageSpecs .spec-delta').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    // A short screen scrolls the sheet to the strip: measure there and with the header in view too.
    const garage = await page.evaluate(texts, '#garageModal');
    await page.evaluate(() => { document.getElementById('garageModal').scrollTop = 0; });
    garage.push(...await page.evaluate(texts, '#garageModal'));
    const gseen = garage.map((t) => t.where).join('\n');
    for (const label of ['"FLUX BANK"', 'spec-label', ...(vp.height > 430 ? ['garageClassChip'] : [])]) expect(gseen, `${label} measured`).toContain(label);
    expect(garage.filter((t) => t.size < 10).map((t) => `${t.where}: ${t.size}px`), 'garage text under 10px').toEqual([]);
    checkCaptions(await page.evaluate(captions, ['#garageClassChip', '.garage-actions > button']), 'garage chip/actions');
    // Spec labels: each inside its row, none into the bar or number beside it.
    const specs = await page.evaluate(() => [...document.querySelectorAll('#garageSpecs .spec-row')].map((row) => {
      const l = row.querySelector('.spec-label').getBoundingClientRect(), r = row.getBoundingClientRect();
      const next = row.querySelector('.spec-label').nextElementSibling?.getBoundingClientRect();
      return { text: row.querySelector('.spec-label').textContent, l: { left: l.left, right: l.right, top: l.top, bottom: l.bottom }, row: { left: r.left, right: r.right },
        next: next && { left: next.left, right: next.right, top: next.top, bottom: next.bottom } };
    }));
    expect(specs.length).toBeGreaterThan(2);
    for (const s of specs) {
      expect(s.l.left, `${s.text} inside its row`).toBeGreaterThanOrEqual(s.row.left - 0.5);
      expect(s.l.right, `${s.text} inside its row`).toBeLessThanOrEqual(s.row.right + 0.5);
      if (s.next) expect(overlap(s.l, s.next), `${s.text} runs into its bar`).toBe(false);
    }
    await page.screenshot({ path: test.info().outputPath(`garage-type-${vp.width}x${vp.height}.png`) });
    expect(problems).toEqual([]);
  });
}
