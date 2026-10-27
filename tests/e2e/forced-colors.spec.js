// Windows High Contrast and "more contrast" (ticket 0214). Forced colours drop our fills, glows
// and gradients, so every control on the title, Settings, the garage and the pause sheet must keep
// an edge (a border) and readable text, a selected choice must differ by more than its fill (a ✓,
// an underline, the switch knob), and keyboard focus must still show. prefers-contrast: more gets
// thicker edges, no text glow and the same ✓. With neither, none of it applies.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const homeReady = (page) => page.waitForFunction(() => document.querySelector('#homeHooks')?.childElementCount > 0);

/** Every visible control inside `root`: its border width, and the worst contrast of any text in it
 *  (the control's own text or a descendant's) against what is really behind that text. Under forced
 *  colours Chromium paints a Canvas backplate behind text unless `forced-color-adjust: none`, so
 *  that is the background then; otherwise the element's own and its ancestors' fills, composited. */
const audit = (page, root) => page.evaluate((root) => {
  const rgba = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; };
  const probe = document.createElement('div');
  probe.style.background = 'Canvas';
  document.body.appendChild(probe);
  const canvas = rgba(getComputedStyle(probe).backgroundColor);
  probe.remove();
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const behind = (el) => {
    if (getComputedStyle(el).forcedColorAdjust !== 'none') return canvas; // the backplate
    const layers = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.99) break;
    }
    return layers.reduceRight((acc, c) => over(c, acc), canvas);
  };
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hasText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z0-9]/.test(n.textContent));
  const out = [];
  for (const el of document.querySelector(root).querySelectorAll('button, select, summary, [role="button"], [role="tab"], [role="switch"]')) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width < 4 || r.height < 4 || s.visibility === 'hidden' || !el.checkVisibility()) continue;
    let worst = Infinity;
    for (const t of [el, ...el.querySelectorAll('*')]) {
      if (!hasText(t) || !t.checkVisibility()) continue;
      const bg = behind(t);
      worst = Math.min(worst, ratio(over(rgba(getComputedStyle(t).color), bg), bg));
    }
    out.push({
      id: el.id || `${el.className}`.slice(0, 30) || el.textContent.trim().slice(0, 20),
      border: parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth),
      contrast: worst,
    });
  }
  return out;
}, root);

function expectEdges(list, where) {
  expect(list.length, `${where}: controls found`).toBeGreaterThan(2);
  for (const c of list) {
    expect(c.border, `${where}: ${c.id} has an edge`).toBeGreaterThan(0);
    expect(c.contrast, `${where}: ${c.id} text contrast`).toBeGreaterThanOrEqual(3);
  }
}

const marker = (page, sel) => page.locator(sel).evaluate((el) => getComputedStyle(el, '::before').content);

test.describe('forced colours (Windows High Contrast)', () => {
  test.use({ forcedColors: 'active' });

  test('title, Settings, garage and pause keep edges, readable text and visible selection', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await homeReady(page);
    expectEdges(await audit(page, '#titleScreen'), 'title');

    // The 2D/3D chip: the lit half is underlined, not only filled.
    const halves = await page.locator('#btnViewMode b').evaluateAll((bs) => bs.map((b) => getComputedStyle(b).textDecorationLine));
    expect(halves.filter((d) => d.includes('underline')).length, 'exactly one half of VIEW is marked').toBe(1);

    // Focus ring: Tab onto a title control and the outline is there.
    await page.focus('#btnOpenSettings');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, w: parseFloat(s.outlineWidth) }; });
    expect(ring.style).not.toBe('none');
    expect(ring.w).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Enter');
    await expect(page.locator('#settingsModal')).toBeVisible();
    expectEdges(await audit(page, '#settingsModal'), 'settings');
    // Focus inside a menu shows too.
    await page.keyboard.press('Tab');
    const inner = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, w: parseFloat(s.outlineWidth), inside: !!document.activeElement.closest('#settingsModal') }; });
    expect(inner).toEqual({ style: 'solid', w: 3, inside: true });
    // A segmented choice: the pressed one carries a ✓ and a different fill.
    const [on, off] = (await page.locator('#setView2d').getAttribute('aria-pressed')) === 'true' ? ['#setView2d', '#setView3d'] : ['#setView3d', '#setView2d'];
    expect(await marker(page, on)).toContain('✓');
    expect(await marker(page, off)).toBe('none');
    const fills = await page.evaluate(([a, b]) => [a, b].map((s) => getComputedStyle(document.querySelector(s)).backgroundColor), [on, off]);
    expect(fills[0]).not.toBe(fills[1]);
    // A switch: the knob is drawn (not the track's colour) and moves when it is turned on.
    const knob = () => page.locator('#setVoice').evaluate((sw) => {
      const i = sw.querySelector('i');
      return { knob: getComputedStyle(i).backgroundColor, track: getComputedStyle(sw).backgroundColor, x: i.getBoundingClientRect().x, checked: sw.getAttribute('aria-checked') };
    });
    const k1 = await knob();
    expect(k1.knob).not.toBe(k1.track);
    await page.locator('#setVoice').click();
    await expect.poll(async () => Math.abs((await knob()).x - k1.x), { message: 'the knob slides across' }).toBeGreaterThan(10);
    const k2 = await knob();
    expect(k2.checked).not.toBe(k1.checked);
    expect(k2.knob).not.toBe(k2.track);
    await page.locator('#setVoice').click();
    await page.locator('#btnSettingsDone').click();
    await expect(page.locator('#settingsModal')).toBeHidden();

    await page.locator('#btnOpenGarageFromTitle').click();
    await expect(page.locator('#garageModal')).toBeVisible();
    await page.waitForSelector('.garage-thumb.is-view');
    expectEdges(await audit(page, '#garageModal'), 'garage');
    expect(await marker(page, '.garage-thumb.is-view')).toContain('✓');
    // Paint colours are content: the swatches keep their own colour.
    const swatches = await page.locator('.garage-thumb .thumb-swatch').evaluateAll((els) => new Set(els.map((e) => getComputedStyle(e).backgroundColor + getComputedStyle(e).backgroundImage)).size);
    expect(swatches, 'car colours survive forced colours').toBeGreaterThan(1);
    // Stat bars are data: drawn in a system colour, not dropped with the gradient.
    const bars = await page.locator('.spec-base').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(bars.length).toBeGreaterThan(0);
    for (const c of bars) expect(c, 'a stat bar is filled').not.toMatch(/rgba\(\d+, \d+, \d+, 0\)/);
    const paintRing = await page.locator('.paint-swatch.is-on').first().evaluate((e) => getComputedStyle(e).outlineWidth);
    expect(paintRing, 'the chosen paint has the Highlight ring').toBe('3px');
    await page.keyboard.press('Escape');
    await expect(page.locator('#garageModal')).toBeHidden();

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
    await page.keyboard.press('Escape');
    await expect(page.locator('#garageModal')).toBeVisible();
    expectEdges(await audit(page, '#garageModal'), 'pause');
    expect(problems).toEqual([]);
  });
});

test.describe('prefers-contrast: more', () => {
  test.use({ contrast: 'more' });

  test('thicker edges, no text glow, and the selected choice carries a ✓', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await homeReady(page);
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    const seg = await page.locator('#setView2d').evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(seg).toBeGreaterThanOrEqual(2);
    const on = (await page.locator('#setView2d').getAttribute('aria-pressed')) === 'true' ? '#setView2d' : '#setView3d';
    expect(await marker(page, on)).toContain('✓');
    const glows = await page.evaluate(() => [...document.querySelectorAll('body *')].map((e) => getComputedStyle(e).textShadow).filter((t) => t !== 'none' && t !== 'rgb(0, 0, 0) 0px 1px 0px'));
    expect(glows, 'no text glow, only the hard dark edge').toEqual([]);
    expect(problems).toEqual([]);
  });
});

test('with neither setting, none of it applies', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await homeReady(page);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches || matchMedia('(prefers-contrast: more)').matches)).toBe(false);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  const on = (await page.locator('#setView2d').getAttribute('aria-pressed')) === 'true' ? '#setView2d' : '#setView3d';
  expect(await marker(page, on)).toBe('none');
  expect(await page.locator(on).evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
  // Every high-contrast rule lives inside a media block, so the default look cannot change.
  const loose = await page.evaluate(() => {
    const bad = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) if (r instanceof CSSStyleRule && /ButtonText|Highlight|CanvasText|forced-color-adjust|✓/.test(r.cssText)) bad.push(r.cssText.slice(0, 80));
    }
    return bad;
  });
  expect(loose).toEqual([]);
  expect(problems).toEqual([]);
});
