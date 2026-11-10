// Portrait start lights (ticket 0260): on a phone held upright the start-lights card is one slim
// row (lamps, the count) over a one-line rocket-start prompt, ≤ 120 px tall, so the road, the
// horizon and the rival cars stay in view; it overlaps no HUD card, no touch pad and not the skip
// pill, the prompt stays whole and readable (≥ 4.5:1 even over a white sky), and at GO the card
// fades out within 0.5 s of the race clock instead of holding for the ceremony's 0.8 s.
// Desktop and landscape keep their cards (lights-card-landscape.spec.js).
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Samples every frame from the first red light until the card is gone (or 1.5 s of race clock). */
function sampleLights(page) {
  return page.evaluate(() => new Promise((done) => {
    const rect = (n) => {
      if (!n || !n.getClientRects().length || getComputedStyle(n).visibility !== 'visible') return null;
      const r = n.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const alpha = (n) => {
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      return a;
    };
    const shown = (n) => (alpha(n) < 0.05 ? null : rect(n));
    const out = [];
    let seen = false;
    const t0 = performance.now();
    const tick = () => {
      try {
        const el = document.getElementById('rcLights');
        const gs = window.__OT.GameState;
        const card = rect(el);
        if (card) {
          seen = true;
          const hint = document.getElementById('rcHint');
          const hs = getComputedStyle(hint);
          out.push({
            state: el.dataset.state,
            racing: gs.racePhase !== 'START',
            raceTime: gs.raceTime,
            card,
            opacity: alpha(el),
            hint: rect(hint),
            hintText: hint.textContent,
            hintFull: hint.scrollWidth <= hint.clientWidth + 1 && hint.scrollHeight <= hint.clientHeight + 1,
            hintLines: Math.round(hint.getBoundingClientRect().height / parseFloat(hs.lineHeight || hs.fontSize)),
            hintColor: hs.color,
            cardBg: getComputedStyle(el).backgroundColor,
            count: rect(document.getElementById('rcCount')),
            bulbs: [...el.querySelectorAll('.rc-bulbs i')].map(rect),
            skip: shown(document.getElementById('rcSkip')),
            others: ['announcerMain', 'coachCard', 'hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings']
              .map((id) => ({ id, b: shown(document.getElementById(id)) })).filter((o) => o.b),
            pads: Array.from({ length: (gs.touchPads && gs.touchPads.n) || 0 }, (_, i) => {
              const r = gs.touchPads.r;
              return { id: `pad${i}`, b: { l: r[i * 4], t: r[i * 4 + 1], r: r[i * 4 + 2], b: r[i * 4 + 3] } };
            }),
            vw: innerWidth,
            vh: innerHeight,
          });
          if (gs.racePhase !== 'START' && gs.raceTime > 1.5) { done(out); return; }
        } else if (seen || performance.now() - t0 > 20_000) { done(out); return; }
        requestAnimationFrame(tick);
      } catch (e) { done([{ error: String(e) }]); }
    };
    requestAnimationFrame(tick);
  }));
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, b) => Boolean(a && b) && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
const lum = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** Text over the card's translucent plate, with the worst sky behind it (pure white). */
function contrastOverWhite(text, plate) {
  const t = rgba(text);
  const p = rgba(plate);
  const bg = { r: p.r * p.a + 255 * (1 - p.a), g: p.g * p.a + 255 * (1 - p.a), b: p.b * p.a + 255 * (1 - p.a) };
  const [a, b] = [lum(t), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** `input`: 'touch' taps the skip pill (the phone's own wording, TAP ⚡ …); 'keys' clicks it
 *  (a mouse: the keyboard wording, the longest prompt a phone can show). */
async function toLights(page, input) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  if (input === 'touch') await page.locator('#rcSkip').tap();
  else await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '3', { timeout: 10_000 });
  return sampleLights(page);
}

for (const [w, h, input] of [[390, 844, 'touch'], [390, 844, 'keys'], [430, 932, 'touch'], [360, 780, 'touch']]) {
  test.describe(`portrait phone ${w}x${h}, ${input} prompt`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('the lights are a slim card clear of the HUD and pads, gone by 0.5 s after GO', async ({ page }) => {
      const problems = watchPage(page);
      const frames = await toLights(page, input);
      expect(frames[0]?.hintText).toMatch(input === 'touch' ? /^TAP / : /^PRESS SPACE /);
      expect(frames[0]?.error).toBeUndefined();
      const lights = frames.filter((f) => !f.racing);
      expect(lights.some((f) => f.state === '3')).toBe(true);
      expect(lights.some((f) => f.state === '1')).toBe(true);
      expect(frames.some((f) => f.pads.length > 0)).toBe(true);
      for (const f of lights) {
        const at = `${f.state} ${JSON.stringify(f.card)}`;
        expect(f.card.b - f.card.t, at).toBeLessThanOrEqual(120);
        expect(f.card.l, at).toBeGreaterThanOrEqual(0);
        expect(f.card.r, at).toBeLessThanOrEqual(f.vw);
        expect(f.opacity, at).toBeGreaterThan(0.95);
        expect(f.bulbs).toHaveLength(3);
        for (const b of f.bulbs) expect(inside(b, f.card), at).toBe(true);
        // lamps and count on one row
        expect(f.count.t, at).toBeLessThan(f.bulbs[0].b);
        expect(inside(f.count, f.card), at).toBe(true);
        // the prompt: whole, one line, readable
        expect(inside(f.hint, f.card), at).toBe(true);
        expect(f.hintText).toMatch(/ROCKET START$/);
        expect(f.hintFull, `${at} prompt clipped`).toBe(true);
        expect(f.hintLines, at).toBe(1);
        expect(contrastOverWhite(f.hintColor, f.cardBg)).toBeGreaterThanOrEqual(4.5);
        expect(overlaps(f.card, f.skip), `${at} over the skip pill`).toBe(false);
        for (const o of f.others) expect(overlaps(f.card, o.b), `${at} over #${o.id}`).toBe(false);
        for (const o of f.pads) expect(overlaps(f.card, o.b), `${at} over ${o.id}`).toBe(false);
      }
      // GO: the card is shown, then gone (opacity 0) by 0.5 s of race clock.
      expect(frames.some((f) => f.state === 'go')).toBe(true);
      for (const f of frames.filter((x) => x.racing && x.raceTime >= 0.5)) {
        expect(f.opacity, `GO + ${f.raceTime.toFixed(2)} s`).toBeLessThan(0.02);
      }
      expect(problems).toEqual([]);
    });
  });
}
