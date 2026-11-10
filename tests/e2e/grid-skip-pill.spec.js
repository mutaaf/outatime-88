// Grid skip pill (ticket 0257): during the lineup the "PRESS ENTER TO SKIP" / "TAP TO SKIP" pill
// sits in the sky above the intro card, never on the cars. The road and every car on the flat
// start grid draw below the horizon (46% of the view, src/render/road.js; the FOV crop scales
// about that line), so the pill's whole box must stay above it, clear of the player car
// (GameState.carBox, CSS px), the intro card, the HUD cards and, on touch, the pads.
// The card itself does not move, and the pill still skips on its input.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Samples every frame while the lineup card is up: ≥ 3 frames and `ms` of wall time, at most
 *  2.5 × `ms` (short: the ~5 s lineup must still be running for the skip that follows). */
function sampleLineup(page, ms = 800) {
  return page.evaluate((ms) => new Promise((done) => {
    const box = (n) => {
      if (!n || !n.getClientRects().length || getComputedStyle(n).visibility !== 'visible') return null;
      let a = 1;
      for (let p = n; p && p.nodeType === 1; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      if (a < 0.05) return null;
      const r = n.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      try {
        const card = document.getElementById('rcCard');
        const age = performance.now() - t0;
        if ((age > ms && out.length >= 3) || age > 2.5 * ms) { done(out); return; }
        if (box(card)) {
          const gs = window.__OT.GameState;
          const c = gs.carBox;
          // The card's pop slides it in sideways (translateX); its layout box is what the pill clears.
          const cr = { l: card.offsetLeft, t: card.offsetTop, r: card.offsetLeft + card.offsetWidth, b: card.offsetTop + card.offsetHeight };
          out.push({
            pill: box(document.getElementById('rcSkip')),
            text: document.getElementById('rcSkip').textContent,
            card: cr,
            car: c.x1 > c.x0 ? { l: c.x0, t: c.y0, r: c.x1, b: c.y1 } : null,
            others: ['announcerMain', 'coachCard', 'hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard']
              .map((id) => ({ id, b: box(document.getElementById(id)) })).filter((o) => o.b),
            // The touch pads as the game publishes them (0254): x0, y0, x1, y1 per pad, CSS px.
            pads: Array.from({ length: (gs.touchPads && gs.touchPads.n) || 0 }, (_, i) => {
              const r = gs.touchPads.r;
              return { id: `pad${i}`, b: { l: r[i * 4], t: r[i * 4 + 1], r: r[i * 4 + 2], b: r[i * 4 + 3] } };
            }),
            horizon: innerHeight * 0.46 - (gs.loopPitchOffset || 0) * (innerHeight / 420),
            vw: innerWidth,
          });
        }
        requestAnimationFrame(tick);
      } catch (e) { done([{ error: String(e) }]); }
    };
    requestAnimationFrame(tick);
  }), ms);
}

const overlaps = (a, b) => Boolean(a && b) && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

async function lineup(page) {
  await page.goto(`${APP}?debug&intro`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#rcCard')).toBeVisible();
  await expect(page.locator('#rcSkip')).toBeVisible();
  const frames = await sampleLineup(page);
  expect(frames[0]?.error).toBeUndefined();
  expect(frames.length).toBeGreaterThanOrEqual(1);
  for (const f of frames) {
    const at = JSON.stringify(f);
    expect(f.pill, at).not.toBeNull();
    expect(f.pill.b, at).toBeLessThanOrEqual(f.horizon); // above every car on the road
    expect(f.pill.b, at).toBeLessThanOrEqual(f.card.t); // above the card, not on it
    expect(f.pill.l, at).toBeGreaterThanOrEqual(0);
    expect(f.pill.r, at).toBeLessThanOrEqual(f.vw);
    expect(overlaps(f.pill, f.car), at).toBe(false);
    for (const o of f.others) expect(overlaps(f.pill, o.b), `${o.id} ${at}`).toBe(false);
    for (const o of f.pads) expect(overlaps(f.pill, o.b), `${o.id} ${at}`).toBe(false);
  }
  return frames;
}

/** Arms a flag the natural lineup sets and a skip never does: your own card ("YOU!") is always
 *  the last one, so a skip from an earlier card goes to the lights without ever showing it.
 *  Fails if that card is already up, since then the skip would prove nothing. */
const armSkipProof = async (page) => {
  const before = await page.evaluate(() => {
    const card = document.getElementById('rcCard');
    const you = () => !card.classList.contains('hidden') && card.querySelector('.rc-name')?.textContent === 'YOU!';
    window.__youSeen = you();
    new MutationObserver(() => { if (you()) window.__youSeen = true; })
      .observe(card, { attributes: true, childList: true, subtree: true });
    return window.__youSeen;
  });
  expect(before).toBe(false);
};

/** The input skipped the lineup: lights up, card gone, and your own card never showed. */
async function expectSkipped(page) {
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#rcCard')).toBeHidden();
  expect(await page.evaluate(() => window.__youSeen)).toBe(false);
}

test.describe('desktop 1280x720, keyboard', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the skip pill sits above the card, off the cars, and Enter still skips', async ({ page }) => {
    const problems = watchPage(page);
    const frames = await lineup(page);
    expect(frames[0].text).toBe('PRESS ENTER TO SKIP ▶▶');
    // The card stays where it always was: 29 px above the middle (half the pill and its gap).
    const c = frames[0].card;
    expect(Math.abs((c.t + c.b) / 2 - (360 - 29))).toBeLessThanOrEqual(2);
    await expect(page.locator('#rcSkip')).toBeVisible();
    await armSkipProof(page);
    await page.keyboard.press('Enter');
    await expectSkipped(page);
    expect(problems).toEqual([]);
  });

  test('a mouse click on the pill still skips', async ({ page }) => {
    const problems = watchPage(page);
    await lineup(page);
    await armSkipProof(page);
    await page.locator('#rcSkip').click();
    await expectSkipped(page);
    expect(problems).toEqual([]);
  });
});

test.describe('phone 390x844, touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the skip pill sits above the card, off the cars and pads, and a tap skips', async ({ page }) => {
    const problems = watchPage(page);
    const frames = await lineup(page);
    expect(frames[0].text).toBe('TAP TO SKIP ▶▶');
    expect(frames.some((f) => f.pads.length >= 4)).toBe(true); // the pad check measured real pads
    const c = frames[0].card;
    expect(Math.abs((c.t + c.b) / 2 - (422 - 29))).toBeLessThanOrEqual(2);
    await armSkipProof(page);
    await page.locator('#rcSkip').tap();
    await expectSkipped(page);
    expect(problems).toEqual([]);
  });
});
