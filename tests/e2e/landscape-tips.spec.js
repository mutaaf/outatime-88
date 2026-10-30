// Landscape phones (ticket 0225): in the first seconds of a first race the coach card docks in the
// header as a slim chip, clear of the road ahead and the car, and only one of {coach card, steer
// tip, HOLD = NOS, WARP} shows at a time, each still shown at least once. Desktop and portrait
// phones keep their layouts.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ready = (page) => page.evaluate(() => window.__OT.ready());

/** Samples every 250 ms from the race start until 10 s into the race and the thumb guide is gone. */
function sampleTips(page) {
  return page.evaluate(() => new Promise((done) => {
    const shown = (el) => {
      if (!el || !el.getClientRects().length) return false;
      if (getComputedStyle(el).visibility !== 'visible') return false;
      let a = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
      return a > 0.05;
    };
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
    const labels = {
      coach: '#coachCard', steerHint: '#steerHint',
      steer: '#tcGuide i.tc-guide-tip-steer', nos: '#tcGuide i.tc-guide-tip-nos', warp: '#tcGuide i.tc-guide-tip-warp',
    };
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const cardsNow = () => ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard'].map((id) => rect(document.getElementById(id)));
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const out = [];
    (async () => {
      for (;;) {
        const gs = window.__OT.GameState;
        const on = Object.keys(labels).filter((k) => shown(document.querySelector(labels[k])));
        const b = gs.carBox;
        const x = {
          on, t: gs.raceTime || 0, racing: gs.racePhase === 'RACING',
          coach: on.includes('coach') ? rect(document.getElementById('coachCard')) : null,
          cards: on.includes('coach') ? cardsNow() : [],
          header: document.querySelector('header').getBoundingClientRect().bottom,
          car: gs.racePhase === 'RACING' && b.x1 > b.x0 ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : null,
        };
        // A card that just grew is measured here before the chip's ResizeObserver re-docks it,
        // which happens before that frame paints: judge what is painted, two frames on.
        if (x.coach && x.cards.some((c) => hit(x.coach, c))) {
          await frame(); await frame();
          x.coach = rect(document.getElementById('coachCard'));
          x.cards = cardsNow();
        }
        out.push(x);
        const guide = document.getElementById('tcGuide');
        if ((gs.racePhase === 'RACING' && gs.raceTime > 10 && !guide) || gs.status !== 'PLAYING' || out.length > 360) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      done(out);
    })();
  }));
}

const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

async function firstRace(page, { reduce = false } = {}) {
  const problems = watchPage(page);
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#tcGuide')).toBeAttached({ timeout: 5000 });
  return problems;
}

// 667x375: the narrowest landscape phone, where the chip's text takes two lines.
for (const viewport of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }]) {
  test.describe(`landscape phone ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    for (const reduce of [false, true]) {
      test(`one label at a time, the coach clear of the road and car${reduce ? ' (reduced motion)' : ''}`, async ({ page }) => {
        test.setTimeout(120_000);
        const problems = await firstRace(page, { reduce });
        const s = await sampleTips(page);
        const W = viewport.width, H = viewport.height;
        // The lane band: the road's centre ±25% of the view, from under the HUD (as tall as it is
        // in that sample: the phone HUD can grow a row mid-race) to the bottom.
        const lane = (x) => ({ x0: W * 0.25, x1: W * 0.75, y0: x.header, y1: H });
        expect(s.filter((x) => x.coach && hit(x.coach, lane(x))).map((x) => [x.coach, x.header])).toEqual([]);
        expect(s.filter((x) => x.coach && x.car && hit(x.coach, x.car)).map((x) => [x.coach, x.car])).toEqual([]);
        expect(s.filter((x) => x.coach && x.cards.some((c) => hit(x.coach, c))).map((x) => [x.coach, x.cards])).toEqual([]); // nor on the HUD
        expect(s.filter((x) => x.on.length > 1).map((x) => x.on)).toEqual([]);
        const seen = new Set(s.flatMap((x) => x.on.map((k) => (k === 'steerHint' ? 'steer' : k))));
        expect([...seen].sort()).toEqual(['coach', 'nos', 'steer', 'warp']);
        expect(s.some((x) => x.racing && x.coach)).toBe(true); // the chip is shown while racing, not just hidden
        if (reduce) {
          const t = await page.evaluate(() => [
            getComputedStyle(document.getElementById('interactiveCoachBanner')).transitionDuration,
            getComputedStyle(document.getElementById('coachCard')).transitionDuration,
          ]);
          expect(t).toEqual(['0s', '0s']);
        }
        expect(problems).toEqual([]);
      });
    }

    test('the docked chip keeps GOT IT a 44 px target and still dismisses the tip', async ({ page }) => {
      const problems = await firstRace(page);
      await page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });
      const box = await page.evaluate(() => {
        const b = document.getElementById('btnDismissCoach');
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        let y0 = r.top + r.height / 2, y1 = y0;
        const on = (y) => { const e = document.elementFromPoint(cx, y); return !!e && (e === b || b.contains(e)); };
        while (on(y0 - 1)) y0--;
        while (on(y1 + 1)) y1++;
        return { w: r.width, h: y1 - y0 + 1 };
      });
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.w).toBeGreaterThanOrEqual(44);
      await page.locator('#btnDismissCoach').click({ force: true });
      await expect.poll(() => page.evaluate(() => window.__OT.GameState.coachDismissed)).toBe(true);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('portrait phone 390x844 (unchanged)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the guide still shows its bubbles together and the coach stays centred under the HUD', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await firstRace(page);
    const s = await sampleTips(page);
    // The portrait layout has no NOS pad, so the guide has two bubbles there.
    expect(s.some((x) => ['steer', 'warp'].every((k) => x.on.includes(k)))).toBe(true);
    const c = s.find((x) => x.coach);
    expect(c).toBeTruthy();
    expect(c.coach.y0).toBeGreaterThanOrEqual(c.header);
    expect(Math.abs((c.coach.x0 + c.coach.x1) / 2 - 195)).toBeLessThan(4);
    expect(problems).toEqual([]);
  });
});

test('1280x720 keyboard: the coach card still docks top-left under the place card', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });
  const r = await page.evaluate(() => {
    const c = document.getElementById('coachCard').getBoundingClientRect();
    return { x0: c.left, y0: c.top, header: document.querySelector('header').getBoundingClientRect().bottom };
  });
  expect(r.x0).toBeLessThan(40);
  expect(r.y0).toBeGreaterThan(r.header);
  expect(problems).toEqual([]);
});

/** The docked chip and the HUD cards beside it, read two frames after the HUD last changed. */
const chipVsCards = (page) => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
  const card = document.getElementById('coachCard');
  return {
    coach: rect(card),
    cards: ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings'].map((id) => document.getElementById(id)).filter(shown).map(rect),
    header: document.querySelector('header').getBoundingClientRect().bottom,
    // Text cut off inside the chip: wider or taller than the room it has.
    clipped: card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1,
  };
});

const coachUp = (page) => page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });

for (const [viewport, hud] of [[{ width: 568, height: 320 }, 'normal'], [{ width: 844, height: 390 }, 'large'], [{ width: 667, height: 375 }, 'large']]) {
  test.describe(`landscape ${viewport.width}x${viewport.height}, HUD ${hud}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the chip fits in the HUD row and follows the cards as they grow', async ({ page }) => {
      const problems = watchPage(page);
      await page.addInitScript((h) => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ settings: { hud: h } })), hud);
      await page.goto(`${APP}?debug`);
      await ready(page);
      await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
      await coachUp(page);
      await page.evaluate(() => window.__OT.pause());
      const check = async (when) => {
        const r = await chipVsCards(page);
        for (const c of r.cards) expect(hit(r.coach, c), `${when}: chip ${JSON.stringify(r.coach)} on a card ${JSON.stringify(c)}`).toBe(false);
        expect(r.coach.y1, `${when}: chip inside the HUD row`).toBeLessThanOrEqual(r.header + 0.5);
        expect(r.clipped, `${when}: chip text fits`).toBe(false);
      };
      await check('start');
      // The speed card widens as the score gains digits: the times card moves left without resizing.
      await page.evaluate(() => { document.getElementById('hudSpeedCard').style.minWidth = `${document.getElementById('hudSpeedCard').getBoundingClientRect().width + 40}px`; });
      await check('speed card +40 px');
      expect(problems).toEqual([]);
    });
  });
}

test.describe('landscape phone 844x390: leaving mid-guide', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the thumb guide goes with the race, even while the coach holds it', async ({ page }) => {
    const problems = await firstRace(page);
    await coachUp(page); // the guide is held while the coach shows
    await expect(page.locator('#tcGuide')).toBeAttached();
    await page.evaluate(() => window.__OT.finishRun());
    await expect(page.locator('#btnPlayAgain')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#tcGuide')).toHaveCount(0, { timeout: 2000 });
    expect(problems).toEqual([]);
  });
});
