// Start-lights hint floor (ticket 0281): on the smallest portrait phones the rocket-start prompt
// under the lights holds the 10px small-print floor (0262/0263/0267/0268) for every input kind,
// from the first red light through GO, wrapping onto more lines instead of shrinking; every line
// stays inside the card, and the card stays clear of the HUD plates, the touch pads (also at the
// largest button size) and the viewport edges. The one-line layout at 390 px and up is
// lights-card-portrait.spec.js. The lineup is marked seen, so each race goes straight to the lights.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Samples every frame from the first red light until the card fades after GO (or 20 s with no card). */
function sampleLights(page) {
  return page.evaluate(() => new Promise((done) => {
    const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const rect = (n) => {
      if (!n || !n.getClientRects().length || getComputedStyle(n).visibility !== 'visible') return null;
      return box(n.getBoundingClientRect());
    };
    const alpha = (n) => {
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      return a;
    };
    const shown = (n) => (n && alpha(n) < 0.05 ? null : rect(n));
    const out = [];
    let seen = false;
    const t0 = performance.now();
    const tick = () => {
      try {
        const el = document.getElementById('rcLights');
        const gs = window.__OT.GameState;
        const card = shown(el);
        if (card && !(gs.racePhase !== 'START' && gs.raceTime > 0.6)) {
          seen = true;
          const hint = document.getElementById('rcHint');
          const range = document.createRange();
          range.selectNodeContents(hint);
          out.push({
            state: el.dataset.state,
            card,
            hintText: hint.textContent,
            fontSize: parseFloat(getComputedStyle(hint).fontSize),
            lines: [...range.getClientRects()].filter((r) => r.width > 0).map(box),
            others: ['announcerMain', 'coachCard', 'hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings', 'rcSkip']
              .map((id) => ({ id, b: shown(document.getElementById(id)) })).filter((o) => o.b),
            pads: Array.from({ length: (gs.touchPads && gs.touchPads.n) || 0 }, (_, i) => {
              const r = gs.touchPads.r;
              return { id: `pad${i}`, b: { l: r[i * 4], t: r[i * 4 + 1], r: r[i * 4 + 2], b: r[i * 4 + 3] } };
            }),
            vw: innerWidth,
            vh: innerHeight,
          });
        } else if (seen || performance.now() - t0 > 20_000) { done(out); return; }
        requestAnimationFrame(tick);
      } catch (e) { done([{ error: String(e) }]); }
    };
    requestAnimationFrame(tick);
  }));
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, b) => Boolean(a && b) && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

// 'phone' (the TV's paired phone pad) only holds while a pad is paired (src/input.js clears it
// otherwise); its prompt is shorter than the keys and pad ones, which bound it here.
const SEEN = (controls) => {
  // The first ARCADE track's lineup already played on this device (src/race-flow.js lineupsSeen).
  const d = { lineupsSeen: ['ARCADE:0:'] };
  if (controls) d.controls = controls;
  localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(d));
};

async function checkLights(page, kind, controls) {
  const problems = watchPage(page);
  await page.addInitScript(SEEN, controls);
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  // No skip input: a tap or click would name its own device.
  await page.evaluate((k) => {
    window.__OT.InputState.lastInput = k;
    window.__OT.startRace({ mode: 'ARCADE' });
  }, kind);
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '3', { timeout: 15_000 });
  const frames = await sampleLights(page);
  expect(frames[0]?.error).toBeUndefined();
  expect(frames.length).toBeGreaterThan(0);
  expect(frames[0].hintText).toMatch(PROMPT[kind]);
  expect(frames.some((f) => f.state === '1')).toBe(true);
  expect(frames.some((f) => f.state === 'go'), 'GO never sampled').toBe(true);
  expect(frames.some((f) => f.pads.length > 0)).toBe(true);
  for (const f of frames) {
    const at = `${kind} ${f.state} ${JSON.stringify(f.card)}`;
    expect(f.fontSize, at).toBeGreaterThanOrEqual(10);
    expect(f.card.l, at).toBeGreaterThanOrEqual(0);
    expect(f.card.r, at).toBeLessThanOrEqual(f.vw);
    expect(f.card.b - f.card.t, at).toBeLessThanOrEqual(120);
    expect(f.lines.length, at).toBeGreaterThan(0);
    for (const l of f.lines) expect(inside(l, f.card), `${at} line ${JSON.stringify(l)} outside the card`).toBe(true);
    for (const o of f.others) expect(overlaps(f.card, o.b), `${at} over #${o.id}`).toBe(false);
    for (const o of f.pads) expect(overlaps(f.card, o.b), `${at} over ${o.id} ${JSON.stringify(o.b)}`).toBe(false);
  }
  expect(problems).toEqual([]);
}

const PROMPT = { keys: /^PRESS SPACE /, pad: /^PRESS X OR RB /, touch: /^TAP / };

for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
  test.describe(`portrait phone ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    for (const kind of Object.keys(PROMPT)) {
      test(`${kind} prompt holds 10px through GO, every line inside the card, clear of HUD and pads`, ({ page }) => checkLights(page, kind));
    }
  });
}

// The largest touch buttons (Controls → size 1.3) widen the pad columns the narrow card sits between.
for (const [w, h] of [[320, 568], [359, 640]]) {
  test.describe(`portrait phone ${w}x${h}, buttons at size 1.3`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('pad prompt clears the bigger pads', ({ page }) => checkLights(page, 'pad', { size: 1.3 }));
  });
}
