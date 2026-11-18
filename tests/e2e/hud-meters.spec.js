// HUD meters told apart by more than colour (ticket 0280): the speed card's three bars (speed,
// FLUX, NOS) each carry a text caption at their end (SPD / FLUX / NOS), readable with the colours
// taken away, at least 10 px, 4.5:1 on the card, clear of each other and inside the card at every
// size; and each bar is a `role="meter"` whose aria-valuenow follows the race.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, touchReady, nextFrames } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const METERS = [
  { bar: '#hudSpeedBar', cap: 'SPD', label: /speed/i },
  { bar: '#hudFlux', cap: 'FLUX', label: /flux/i },
  { bar: '#hudNos', cap: 'NOS', label: /nos/i },
];

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// A 10px Orbitron caption's font box is ~12 px tall; its capitals sit inside the middle ~8.
const ink = (r) => ({ ...r, top: r.top + 1.5, bottom: r.bottom - 1.5 });
const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

function measure(meters) {
  const rgb = (s) => s.match(/[\d.]+/g).slice(0, 4).map(Number);
  const box = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  // The card's plate composited over the near-black road (as hud-type.spec).
  const plate = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0) layers.push(c); }
    let out = [5, 5, 13];
    for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
    return out;
  };
  const card = document.getElementById('hudSpeedCard');
  // Every other text in the card: the mph, MPH, the FLUX/WARP READY foot and the score, by the
  // element's laid-out box (the big italic mph's font box reaches well below its digits).
  const others = [];
  const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!t.textContent.trim() || t.parentElement.closest('.hud-meter')) continue;
    for (const r of t.parentElement.getClientRects()) others.push({ text: t.textContent.trim(), ...box(r) });
  }
  return {
    card: box(card.getBoundingClientRect()),
    others,
    meters: meters.map(({ bar }) => {
      const meter = document.querySelector(bar).parentElement;
      const cap = meter.querySelector('.cap');
      const cs = cap && getComputedStyle(cap);
      const range = document.createRange();
      if (cap) range.selectNodeContents(cap);
      return {
        role: meter.getAttribute('role'), label: meter.getAttribute('aria-label') || '',
        min: meter.getAttribute('aria-valuemin'), max: meter.getAttribute('aria-valuemax'),
        cap: cap ? cap.textContent.trim() : '',
        visible: !!cap && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.9,
        size: cap ? parseFloat(cs.fontSize) : 0,
        color: cap ? rgb(cs.color) : [0, 0, 0], bg: plate(meter),
        text: cap ? box(range.getBoundingClientRect()) : null,
        bar: box(meter.getBoundingClientRect()),
      };
    }),
  };
}

for (const { name, vp, touch, large } of [
  { name: '1280x720 keys', vp: { width: 1280, height: 720 }, touch: false },
  { name: '390x844 touch', vp: { width: 390, height: 844 }, touch: true },
  { name: '844x390 touch', vp: { width: 844, height: 390 }, touch: true },
  { name: '320x568 touch', vp: { width: 320, height: 568 }, touch: true },
  { name: '390x844 touch LARGE', vp: { width: 390, height: 844 }, touch: true, large: true },
  { name: '1280x720 keys LARGE', vp: { width: 1280, height: 720 }, touch: false, large: true },
]) {
  test(`speed, FLUX and NOS meters carry captions and meter roles at ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    const save = { initials: 'CLD', onboarded: true, controls: { coachSeen: true }, settings: { hud: large ? 'large' : 'normal' } };
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(save)]);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT?.startRace);
    expect(await page.evaluate(() => document.documentElement.dataset.hudSize)).toBe(large ? 'large' : 'normal');
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    if (touch) await touchReady(page);
    await racing(page);
    await page.evaluate(() => document.fonts.ready);

    // Colours removed: what names each bar is its caption's text, not its hue.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    // Worst case for the card's width and the foot: WARP READY and a 7-digit score.
    await page.evaluate(() => {
      window.__OT.pause();
      document.getElementById('hudFluxLabel').textContent = '⚡ WARP READY';
      document.getElementById('hudScore').textContent = `${(1234567).toLocaleString()} PTS`;
    });
    await nextFrames(page, 3);
    const m = await page.evaluate(measure, METERS);

    m.meters.forEach((got, i) => {
      const want = METERS[i];
      expect(got.cap, `${want.bar} caption`).toBe(want.cap);
      expect(got.visible, `${want.cap} caption shown`).toBe(true);
      expect(got.size, `${want.cap} caption size`).toBeGreaterThanOrEqual(10);
      expect(contrast(got.color, got.bg), `${want.cap} caption contrast`).toBeGreaterThanOrEqual(4.5);
      expect(got.role, `${want.cap} role`).toBe('meter');
      expect(got.label, `${want.cap} aria-label`).toMatch(want.label);
      // 0284: the speed meter's range is mph (0-160); FLUX and NOS stay a percentage.
      expect([got.min, got.max]).toEqual(['0', want.cap === 'SPD' ? '160' : '100']);
      // Caption beside its own bar (vertically centred on it), inside the card and on screen.
      expect(got.text.left, `${want.cap} after its bar`).toBeGreaterThanOrEqual(got.bar.right - 0.5);
      expect(Math.abs((got.text.top + got.text.bottom) / 2 - (got.bar.top + got.bar.bottom) / 2), `${want.cap} centred on its bar`).toBeLessThan(2);
      expect(got.text.right, `${want.cap} inside the card`).toBeLessThanOrEqual(m.card.right + 0.5);
      expect(got.text.left).toBeGreaterThanOrEqual(m.card.left - 0.5);
      expect(got.text.top).toBeGreaterThanOrEqual(m.card.top - 0.5);
      expect(got.text.bottom).toBeLessThanOrEqual(m.card.bottom + 0.5);
      expect(got.text.right, `${want.cap} on screen`).toBeLessThanOrEqual(vp.width);
      expect(got.bar.right - got.bar.left, `${want.cap} bar still readable`).toBeGreaterThanOrEqual(30);
      for (const o of m.others) expect(overlap(ink(got.text), o), `${want.cap} over "${o.text}"`).toBe(false);
    });
    // The captions' glyphs never run into each other (line boxes may touch; ink must not).
    for (let i = 0; i < m.meters.length; i++) {
      for (let j = i + 1; j < m.meters.length; j++) {
        const a = m.meters[i].text, b = m.meters[j].text;
        expect(overlap(ink(a), ink(b)), `${m.meters[i].cap} runs into ${m.meters[j].cap}`).toBe(false);
      }
    }
    await page.screenshot({ path: test.info().outputPath(`hud-meters-${vp.width}x${vp.height}${large ? '-large' : ''}.png`) });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

test('meter values follow the race: speed rises with throttle, values are written to aria-valuenow', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true })), KEY);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  const now = () => page.evaluate(() => ['hudSpeedBar', 'hudFlux', 'hudNos'].map((id) => document.getElementById(id).parentElement.getAttribute('aria-valuenow')));
  const start = await now();
  for (const v of start) expect(v, 'aria-valuenow written').toMatch(/^\d+(\.\d)?$/);
  await page.keyboard.down('ArrowUp');
  // The bar's width and its aria value are the same number.
  await page.waitForFunction((s) => Number(document.getElementById('hudSpeedBar').parentElement.getAttribute('aria-valuenow')) > Number(s) + 5, start[0], { timeout: 20000 });
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.__OT.pause());
  await nextFrames(page, 2);
  const same = await page.evaluate(() => ['hudSpeedBar', 'hudFlux', 'hudNos'].map((id) => {
    const bar = document.getElementById(id);
    return [parseFloat(bar.style.width), Number(bar.parentElement.getAttribute('aria-valuenow'))];
  }));
  // 0284: the speed meter's value is the mph on the readout; its bar is that mph of 160.
  const [[speedW, speedV], ...pct] = same;
  const mph = await page.evaluate(() => Number(document.getElementById('hudSpeed').textContent));
  expect(speedV).toBe(Math.min(160, mph));
  expect(speedW).toBeCloseTo((speedV / 160) * 100, 1);
  for (const [w, v] of pct) expect(v).toBeCloseTo(w, 1);
  expect(problems).toEqual([]);
});
