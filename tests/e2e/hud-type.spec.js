// In-race HUD small print (ticket 0267): mid-race, with the coach tip showing (the state a new player
// sees), every text a racer glances at is at least 10 px — the YOU marker and the tip's GOT IT button
// at least 11 px — on a 390x844 phone (touch) and a 1280x720 screen (keys). Labels keep 4.5:1 on their
// plates, and no HUD block runs into another or a touch button.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, touchReady, nextFrames } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
// The tip stays up: thumb guide already seen, so nothing waits on it.
const SAVE = JSON.stringify({ initials: 'CLD', onboarded: true, controls: { coachSeen: true } });

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

// What the HUD shows mid-race: the race HUD, the coach tip, the touch buttons.
const SCOPES = ['#raceHud', '#interactiveCoachBanner', '#touchControlsLayer'];
// Elements whose text must be at least 11 px (the rest: 10 px).
const BIGGER = ['.hud-dot-you', '#btnDismissCoach'];

function measure([scopes, bigger]) {
  const rgb = (s) => s.match(/[\d.]+/g).slice(0, 4).map(Number);
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  // The first opaque-enough plate under el, composited over the near-black road.
  const plate = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if ((c[3] ?? 1) > 0) layers.push(c);
    }
    let out = [5, 5, 13];
    for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
    return out;
  };
  const texts = [];
  for (const sel of scopes) {
    const root = document.querySelector(sel);
    if (!root) continue;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      // Letters or digits only: emoji icons and arrows are pictures, not print.
      if (!/[A-Za-z0-9]/.test(t.textContent)) continue;
      const el = t.parentElement;
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      const min = bigger.some((b) => el.closest(b)) ? 11 : 10;
      texts.push({ where: `${sel} ${el.id ? '#' + el.id : el.className || el.tagName} "${t.textContent.trim()}"`,
        size: parseFloat(cs.fontSize), min, color: rgb(cs.color), bg: plate(el) });
    }
  }
  const box = (el) => (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(el.getBoundingClientRect());
  const blocks = [...document.querySelectorAll('[data-hud-rect]')].filter(shown).map((el) => ({ id: el.id, ...box(el) }));
  const coach = document.getElementById('coachCard');
  if (coach && shown(coach)) blocks.push({ id: 'coachCard', ...box(coach) });
  const pads = [...document.querySelectorAll('#touchControlsLayer .tc-btn')].filter(shown).map((el) => ({ id: el.id || el.className, ...box(el) }));
  // The YOU tag at the start or the flag stays inside the strip (0167's inset is half its width).
  const track = document.getElementById('hudTrack'), dots = document.getElementById('hudDots'), you = document.querySelector('.hud-dot-you');
  const strip = { inset: dots.getBoundingClientRect().left - track.getBoundingClientRect().left, youHalf: you ? you.getBoundingClientRect().width / 2 : 0 };
  return { texts, blocks, pads, strip };
}

for (const { name, vp, touch } of [
  { name: '390x844 touch', vp: { width: 390, height: 844 }, touch: true },
  { name: '1280x720 keys', vp: { width: 1280, height: 720 }, touch: false },
]) {
  test(`in-race HUD text is 10px or more at ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, SAVE]);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT?.startRace);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    if (touch) await touchReady(page);
    await racing(page);
    // The first-race tip is the state a new player reads the HUD in.
    await page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await nextFrames(page, 3);
    const m = await page.evaluate(measure, [SCOPES, BIGGER]);

    const seen = m.texts.map((t) => t.where).join('\n');
    // The labels the ticket names are among what was measured.
    for (const label of ['"MPH"', '"FLUX"', '"YOU"', '"GOT IT', '"NOS"']) expect(seen, `${label} measured`).toContain(label);
    if (touch) expect(seen).toMatch(/#touchControlsLayer/);
    else expect(seen).toContain('"KEYS"');

    // Every offender at once, so one run names them all.
    const small = m.texts.filter((t) => t.size < t.min).map((t) => `${t.where}: ${t.size}px < ${t.min}px`);
    const faint = m.texts.filter((t) => contrast(t.color, t.bg) < 4.5).map((t) => `${t.where}: ${contrast(t.color, t.bg).toFixed(2)}:1`);
    expect(small, 'text under the floor').toEqual([]);
    expect(faint, 'text under 4.5:1').toEqual([]);
    expect(m.strip.youHalf).toBeGreaterThan(0);
    expect(m.strip.inset, 'strip inset holds half the YOU tag').toBeGreaterThanOrEqual(m.strip.youHalf - 0.5);
    for (let i = 0; i < m.blocks.length; i++) {
      for (let j = i + 1; j < m.blocks.length; j++) {
        expect(overlap(m.blocks[i], m.blocks[j]), `${m.blocks[i].id} overlaps ${m.blocks[j].id}`).toBe(false);
      }
      for (const p of m.pads) expect(overlap(m.blocks[i], p), `${m.blocks[i].id} overlaps pad ${p.id}`).toBe(false);
    }
    await page.screenshot({ path: test.info().outputPath(`hud-type-${vp.width}x${vp.height}.png`) });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
