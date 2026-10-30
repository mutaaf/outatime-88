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
        // Its hit box (target-size.spec's definition): the chip draws a slim ✓, a ::after takes the taps.
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); };
        let y0 = cy, y1 = cy, x0 = cx, x1 = cx;
        while (on(cx, y0 - 1)) y0--;
        while (on(cx, y1 + 1)) y1++;
        while (on(x0 - 1, cy)) x0--;
        while (on(x1 + 1, cy)) x1++;
        return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
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

/** Every line the coach can show on a phone (src/race-flow.js), the widest direction for each. */
const COACH_LINES = [
  'Graze the gold ring for a slingshot — or go RIGHT ▶', 'Hop it (W / ▲ / swipe up) — or go RIGHT ▶',
  'Hold drift to duck (S / ▼ / swipe down) — or go RIGHT ▶', 'Smash straight through it for flux + HP',
  'Grab the wrench (center) for +25 HP', 'Go RIGHT ▶, jump it, or boost-smash it',
  'Hold 88 mph — or hit BOOST — to jump eras', 'Draft the green wake behind rivals for a slingshot',
];

/** Where the coach is, two frames after the HUD last changed: docked in the HUD row (with each coach
 *  line tried for fit) or in its old centred spot. */
const coachSpot = (page) => page.evaluate(async (lines) => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
  const card = document.getElementById('coachCard');
  const d = document.getElementById('coachDesc'), b = document.getElementById('btnDismissCoach');
  // Cut off by the two-line clamp, or spilling out of the chip (not the card's own scroll size:
  // GOT IT's hit area reaches below the card on purpose).
  const inside = (el) => { const c = card.getBoundingClientRect(), r = el.getBoundingClientRect(); return r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5; };
  const was = d.textContent;
  const clipped = [];
  for (const t of lines) {
    d.textContent = t;
    if (d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1 || !inside(d) || !inside(b)) clipped.push(t);
  }
  d.textContent = was;
  return {
    docked: document.getElementById('interactiveCoachBanner').classList.contains('tc-coach-docked'),
    coach: rect(card),
    cards: ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings'].map((id) => document.getElementById(id)).filter(shown).map(rect),
    header: document.querySelector('header').getBoundingClientRect().bottom,
    clipped,
  };
}, COACH_LINES);

const coachUp = (page) => page.waitForFunction(() => document.getElementById('interactiveCoachBanner').style.opacity === '1', null, { timeout: 30_000 });

async function coachInRace(page, hud) {
  await page.addInitScript((h) => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ settings: { hud: h } })), hud);
  await page.goto(`${APP}?debug`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await coachUp(page);
  await page.evaluate(() => window.__OT.pause());
}

/** Docked: in the HUD row, on no card, every line readable. Not docked: the old centred card. */
function expectSpot(r, when, width) {
  if (r.docked) {
    for (const c of r.cards) expect(hit(r.coach, c), `${when}: chip ${JSON.stringify(r.coach)} on a card ${JSON.stringify(c)}`).toBe(false);
    expect(r.coach.y1, `${when}: chip inside the HUD row`).toBeLessThanOrEqual(r.header + 0.5);
    expect(r.clipped, `${when}: coach lines cut off in the chip`).toEqual([]);
  } else {
    expect(r.coach.y0, `${when}: card under the HUD`).toBeGreaterThanOrEqual(r.header);
    expect(Math.abs((r.coach.x0 + r.coach.x1) / 2 - width / 2), `${when}: card centred`).toBeLessThan(4);
  }
}

// Docked where the HUD row has room for every coach line in two lines (from 222 px, and it stays
// docked down to 204 px as the HUD's numbers grow); under that
// (568x320, 640x360, HUD LARGE on small phones) the card keeps its old centred spot.
for (const [viewport, hud, docked] of [
  [{ width: 667, height: 375 }, 'normal', true], [{ width: 844, height: 390 }, 'large', true], [{ width: 740, height: 360 }, 'large', true],
  [{ width: 568, height: 320 }, 'normal', false], [{ width: 640, height: 360 }, 'normal', false], [{ width: 667, height: 375 }, 'large', false],
]) {
  test.describe(`landscape ${viewport.width}x${viewport.height}, HUD ${hud}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test(`the coach ${docked ? 'docks and every line fits' : 'keeps its centred card'}, and follows the cards as they grow`, async ({ page }) => {
      const problems = watchPage(page);
      await coachInRace(page, hud);
      const r = await coachSpot(page);
      expect(r.docked).toBe(docked);
      expectSpot(r, 'start', viewport.width);
      // The speed card widens as the score gains digits: the times card moves left without resizing.
      for (const grow of [20, 40, 80]) {
        await page.evaluate((g) => { const c = document.getElementById('hudSpeedCard'); c.style.minWidth = ''; c.style.minWidth = `${c.getBoundingClientRect().width + g}px`; }, grow);
        expectSpot(await coachSpot(page), `speed card +${grow} px`, viewport.width);
      }
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
