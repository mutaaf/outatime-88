// Readability (ticket 0002): one message lane, and a phone HUD that leaves the road visible.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait } from './helpers.js';

const intersects = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function visibleBox(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    let n = el;
    while (n) { if (parseFloat(getComputedStyle(n).opacity) < 0.05) return null; n = n.parentElement; }
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`announcement and coach never overlap at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForTimeout(400); // coach shows its opening tip
    await page.evaluate(() => window.__OT.announce('⚡ 88 MPH TIME WARP! ➔ 1985 ⚡', 'ERA SHIFT', 1500));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(120);
      const ann = await visibleBox(page, '#announcerMain');
      const coach = await visibleBox(page, '#coachCard');
      expect(ann).not.toBeNull();
      expect(intersects(ann, coach)).toBeFalsy();
    }
    expect(problems).toEqual([]);
  });
}

test('phone HUD takes at most 18% of the screen height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.waitForTimeout(500);
  const box = await page.locator('header').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844 * 0.18);
  // On phones the settings gear (sound, tilt, pause) is the HUD's last button (ticket 0050).
  const gear = await page.locator('#btnHudSettings').boundingBox();
  expect(gear.x + gear.width).toBeLessThanOrEqual(390); // nothing hangs off the right edge
});

// Ticket 0019: a fork is a compact two-arrow cue (a word or two each), the coach steps aside
// while it is up even with a hazard to teach ahead, and neither the cue nor the announcement
// covers the player car.
const pinOnFork = (page, playerX) => page.evaluate((x) => {
  const { GameState, track } = window.__OT;
  const seg = track().liveSegments().find((s) => s.trackType === 'SPLIT_FORK');
  GameState.trackPos = seg.p1.world.z + (seg.p2.world.z - seg.p1.world.z) * 4 - 1250; // tyres on the fork
  GameState.playerX = x;
  GameState.playerVX = 0;
}, playerX);

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a fork shows one compact cue and no coach at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForTimeout(400); // the coach shows its opening tip
    // A fresh low laser just ahead: without the fork rule the coach would teach it.
    await page.evaluate(() => {
      const { GameState } = window.__OT;
      GameState.lessonsCleared.jump = 0;
      const t = window.__OT.traffic();
      const seg = window.__OT.track().liveSegments().find((s) => s.trackType === 'SPLIT_FORK');
      t.obstacles.push(t.createObstacleBody(t.obstacles.length, 'LOW_LASER_BAR', seg.p1.world.z + 2400, 0.5));
    });
    for (let i = 0; i < 10; i++) {
      const x = i < 5 ? -0.3 : 0.3;
      await pinOnFork(page, x);
      await page.waitForTimeout(120);
      if (i === 7) await page.evaluate(() => window.__OT.announce('FLUX CRATE!', '+10 FLUX', 1500));
      expect(await page.evaluate(() => window.__OT.GameState.forkPending)).toBe(true);
      const left = await visibleBox(page, '#forkLeftCard');
      const right = await visibleBox(page, '#forkRightCard');
      expect(left).not.toBeNull();
      expect(right).not.toBeNull();
      if (i >= 3) expect(await visibleBox(page, '#coachCard')).toBeNull(); // after its fade-out
      // The branch you're lined up for leans forward, and it follows you across.
      const lean = await page.evaluate(() => ['forkLeftCard', 'forkRightCard'].map((id) => document.getElementById(id).classList.contains('fork-lean')));
      expect(lean).toEqual(x < 0 ? [true, false] : [false, true]);
      const ann = await visibleBox(page, '#announcerMain');
      for (const card of [left, right]) {
        // Compact, not banner-sized: under a third of the screen wide, one line tall.
        expect(card.width).toBeLessThanOrEqual(vp.width * 0.33);
        expect(card.height).toBeLessThanOrEqual(40);
        expect(intersects(card, ann)).toBeFalsy();
        expect(card.y + card.height).toBeLessThanOrEqual(vp.height * 0.6); // the car sits at ~86%
      }
      const fit = await page.evaluate(() => ['forkLeftCard', 'forkRightCard'].map((id) => {
        const el = document.getElementById(id);
        return { overflow: el.scrollWidth - el.clientWidth, words: el.textContent.split(/\s+/).filter((w) => /[A-Z]/.test(w)).length };
      }));
      for (const f of fit) { expect(f.overflow).toBeLessThanOrEqual(0); expect(f.words).toBeLessThanOrEqual(2); }
    }
    expect(problems).toEqual([]);
  });
}

test('a race that ends on a fork does not carry the cue into the next start', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForTimeout(300);
  await pinOnFork(page, -0.3);
  await page.waitForTimeout(150);
  expect(await visibleBox(page, '#forkLeftCard')).not.toBeNull();
  await page.evaluate(() => { window.__OT.finishRun(); window.__OT.startRace({ intro: true }); });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.getElementById('forkChoiceBanner').classList.contains('hidden'))).toBe(true);
  expect(problems).toEqual([]);
});

// Ticket 0190: the gap to the car ahead and the race clock are the numbers a racer reads most;
// on a phone they used to be cut to "▲ RI…" and "0:06." between the position and speed cards.
const TIMES_TEXT = ['#hudGapAhead', '#hudGapBehind', '#hudTime', '#hudClockWrap', '#hudTimes .hud-clockbox', '#hudTimes'];
const readTimes = (page) => page.evaluate((sels) => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  return {
    parts: sels.map((s) => document.querySelector(s)).filter(shown)
      .map((el) => ({ id: el.id || el.className, text: el.textContent.trim(), clip: el.scrollWidth - el.clientWidth, box: box(el) })),
    cards: ['#hudPosCard', '#hudSpeedCard', '#hudTrack'].map((s) => box(document.querySelector(s))),
    ahead: document.getElementById('hudGapAhead').textContent,
  };
}, TIMES_TEXT);

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`gap pills and race clock are whole, never cut off, at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' })); // a timed race: the clock shows too
    await racing(page, { minTime: 0.5 });
    await page.waitForFunction(() => document.getElementById('hudGapAhead').textContent !== '');
    for (let i = 0; i < 4; i++) {
      await simWait(page, 0.4);
      const t = await readTimes(page);
      expect(t.parts.map((p) => p.id)).toContain('hudClockWrap');
      for (const p of t.parts) {
        expect(p.clip, `${p.id} "${p.text}" is cut off`).toBeLessThanOrEqual(0);
        for (const c of t.cards) expect(intersects(p.box, c), `${p.id} overlaps a HUD card`).toBeFalsy();
      }
      // Wide screens keep who you are chasing; phones may drop the initials, never the seconds.
      expect(t.ahead).toMatch(/[+]\d|LEAD/);
      if (vp.width >= 1280) expect(t.ahead).toMatch(/^(▲ \S*[A-Z]{2,} \+\d|★ LEADING)/);
    }
    expect(problems).toEqual([]);
  });
}

// 0190 worst case: a nemesis ahead, a rival behind, a long race and the clock all at once.
// The race is paused so the HUD holds the forced text while we measure it.
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 600, height: 960 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`worst-case gap pills and clock still fit at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page, { minTime: 0.5 });
    await page.evaluate(() => {
      window.__OT.pause();
      const compact = matchMedia('(max-width: 599px) and (orientation: portrait)').matches;
      document.getElementById('hudGapAhead').textContent = compact ? '▲ 😈+9.9s' : '▲ 😈RIN +9.9s';
      document.getElementById('hudGapBehind').textContent = compact ? '▼ −9.9s' : '▼ VEX −9.9s';
      document.getElementById('hudTime').textContent = '9:59.9';
      document.getElementById('hudClock').textContent = '60';
    });
    await page.waitForTimeout(200); // the HUD would overwrite the text within a tick if it were still running
    const t = await readTimes(page);
    expect(t.ahead).toContain('9.9');
    for (const p of t.parts) {
      expect(p.clip, `${p.id} "${p.text}" is cut off`).toBeLessThanOrEqual(0);
      for (const c of t.cards) expect(intersects(p.box, c), `${p.id} overlaps a HUD card`).toBeFalsy();
    }
    expect(problems).toEqual([]);
  });
}

// Ticket 0202: 0190 regressed mid-race. On a phone the speed card's foot widened when FLUX turned
// into "⚡ WARP READY" (and as the score grew), and the race-time column beside it shrank to ~10 px:
// the ahead pill read "▲ +0…" and the clock was cut too. Sample a real race with the warp
// held ready and a long score, every 250 ms for 15 s; then the worst case, paused.
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 820, height: 1180 }]) {
  test(`gap pill stays whole with WARP READY and a long score, every sample, at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page, { minTime: 0.5 });
    await page.waitForFunction(() => document.getElementById('hudGapAhead').textContent !== '');
    // 97: the HUD shows WARP READY (>= 95) but the car never warps (that needs 100 at 88 mph).
    const hold = () => page.evaluate(() => { const g = window.__OT.GameState; g.flux = 97; g.score = Math.max(g.score, 1234567); });
    await hold();
    await page.waitForFunction(() => document.getElementById('hudFluxLabel').textContent.includes('WARP READY'));
    const end = Date.now() + 15_000;
    let samples = 0;
    while (Date.now() < end) {
      await hold();
      const t = await readTimes(page);
      for (const p of t.parts) {
        expect(p.clip, `${p.id} "${p.text}" is cut off (sample ${samples})`).toBeLessThanOrEqual(0);
        for (const c of t.cards) expect(intersects(p.box, c), `${p.id} overlaps a HUD card`).toBeFalsy();
      }
      samples++;
      await page.waitForTimeout(250);
    }
    expect(samples).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });
}

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 820, height: 1180 }, { width: 1280, height: 720 }]) {
  test(`worst case — nemesis, WARP READY, 7-digit score — still fits at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page, { minTime: 0.5 });
    await page.evaluate(() => {
      window.__OT.pause();
      const compact = matchMedia('(max-width: 599px) and (orientation: portrait)').matches;
      document.getElementById('hudGapAhead').textContent = compact ? '▲ 😈+0.1s' : '▲ 😈RIN +0.1s';
      document.getElementById('hudGapBehind').textContent = compact ? '▼ −9.9s' : '▼ VEX −9.9s';
      document.getElementById('hudTime').textContent = '9:59.9';
      document.getElementById('hudClock').textContent = '60';
      document.getElementById('hudFluxLabel').textContent = '⚡ WARP READY';
      document.getElementById('hudScore').textContent = (1234567).toLocaleString() + ' PTS';
    });
    await page.waitForTimeout(200);
    const t = await readTimes(page);
    expect(t.ahead).toContain('😈');
    for (const p of t.parts) {
      expect(p.clip, `${p.id} "${p.text}" is cut off`).toBeLessThanOrEqual(0);
      for (const c of t.cards) expect(intersects(p.box, c), `${p.id} overlaps a HUD card`).toBeFalsy();
    }
    // The speed card keeps its own text whole too, and the HUD row never runs off the screen.
    const card = await page.evaluate(() => {
      const foot = document.querySelector('#hudSpeedCard .spd-foot');
      const r = document.querySelector('.hud-gearcol').getBoundingClientRect();
      return { footClip: foot.scrollWidth - foot.clientWidth, gearRight: r.right, vw: innerWidth };
    });
    expect(card.footClip).toBeLessThanOrEqual(0);
    expect(card.gearRight).toBeLessThanOrEqual(card.vw);
    expect(problems).toEqual([]);
  });
}

// Ticket 0199: penalties charged live can push the running total below zero, but the run pays
// max(0, earned − penalty). The pill holds at 0 with a dim PENALTY tag, never a minus sign,
// stays whole inside the speed card beside the longest flux label, and is no wider than the
// pill of an ordinary ~1M-point race (the tag sits under the number), so the card never grows
// sideways because of it and the race-time column beside it keeps its room.
for (const vp of [{ width: 390, height: 844, touch: true }, { width: 360, height: 740, touch: true }, { width: 844, height: 390, touch: true }, { width: 1280, height: 720 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ hasTouch: Boolean(vp.touch), viewport: { width: vp.width, height: vp.height } });
    test(`a penalty-heavy run shows 0 PTS and a PENALTY tag, never a minus, at ${vp.width}x${vp.height}`, async ({ page }) => {
      const problems = watchPage(page);
      await page.goto(`${APP}?debug`);
      await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
      await racing(page, { minTime: 0.5 });
      await page.evaluate(() => { window.__OT.GameState.score = -23516; });
      await page.waitForFunction(() => document.getElementById('hudScore').classList.contains('is-pen'));
      // What the HUD itself wrote, read before anything below touches the pill.
      const shown = await page.evaluate(() => {
        window.__OT.pause();
        const el = document.getElementById('hudScore');
        const after = getComputedStyle(el, '::after');
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = (c) => { const v = rgb(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        const card = lum('rgb(8, 10, 24)'); // the lighter end of the card's dark gradient
        return {
          text: el.textContent, tag: after.content, tagOpacity: Number(after.opacity),
          tagPx: parseFloat(after.fontSize), tagContrast: (lum(after.color) + 0.05) / (card + 0.05),
        };
      });
      expect(shown.text).toBe('0 PTS');
      expect(shown.text).not.toMatch(/[-−]/);
      expect(shown.tag).toContain('PENALTY');
      expect(shown.tagOpacity).toBe(1);
      expect(shown.tagPx).toBeGreaterThanOrEqual(9);
      expect(shown.tagContrast, 'PENALTY tag contrast on the HUD card').toBeGreaterThanOrEqual(4.5);
      const pill = await page.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; };
        const el = document.getElementById('hudScore');
        const card = document.getElementById('hudSpeedCard');
        const times = document.getElementById('hudTimes');
        const timesClip = times.scrollWidth - times.clientWidth; // with the FLUX label the race starts with
        // The same column beside an ordinary mid-race score.
        el.classList.remove('is-pen');
        el.textContent = (99999).toLocaleString() + ' PTS';
        const plainClip = times.scrollWidth - times.clientWidth;
        document.getElementById('hudFluxLabel').textContent = '⚡ WARP READY'; // the longest label it sits beside
        // The same card with an ordinary big score in the pill instead.
        el.classList.remove('is-pen');
        el.textContent = (1234567).toLocaleString() + ' PTS';
        const plainCard = card.getBoundingClientRect().width;
        el.classList.add('is-pen');
        el.textContent = '0 PTS';
        return {
          box: box(el), label: box(document.getElementById('hudFluxLabel')),
          card: box(card), plainCard, timesClip, plainClip, foot: el.parentElement.scrollWidth - el.parentElement.clientWidth,
        };
      });
      expect(pill.foot, 'score row overflows the speed card').toBeLessThanOrEqual(0);
      expect(pill.box.right).toBeLessThanOrEqual(pill.card.right + 0.5);
      expect(intersects(pill.box, pill.label), 'PENALTY tag runs into the flux label').toBeFalsy();
      expect(pill.card.width, 'the PENALTY tag widened the speed card').toBeLessThanOrEqual(pill.plainCard + 0.5);
      expect(pill.timesClip, 'the PENALTY tag squeezed the race-time column').toBeLessThanOrEqual(Math.max(0, pill.plainClip));
      // Every other HUD block (the same set src/hud.js hudRects() returns).
      const others = await page.evaluate(() => [...document.querySelectorAll('[data-hud-rect]')]
        .filter((n) => n.id !== 'hudSpeedCard').map((n) => { const r = n.getBoundingClientRect(); return { id: n.id, x: r.x, y: r.y, width: r.width, height: r.height }; })
        .filter((r) => r.width && r.height));
      expect(others.length).toBeGreaterThan(0);
      for (const r of others) expect(intersects(pill.box, r), `score pill overlaps ${r.id}`).toBeFalsy();
      await page.screenshot({ path: test.info().outputPath(`penalty-pill-${vp.width}.png`) });
      // The finish pays exactly what the pill showed.
      await page.evaluate(() => window.__OT.finishRun());
      await expect(page.locator('#endScoreText')).toHaveText('0');
      expect(problems).toEqual([]);
    });
  });
}
