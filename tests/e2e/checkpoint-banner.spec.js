// Checkpoint banner (ticket 0247): "CHECKPOINT! 4TH PLACE" and its reward ("+12s TIME EXTENDED!",
// "+1200 STREET REP!") are one announcement: one bordered box with the reward as its own smaller
// second line, not a second pill stacked under the banner (pillar 3, one channel). The box is no
// taller than the two boxes it replaces, and a line with no reward is the same one-line pill.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

// Today's two boxes, banner + reward pill (top of one to bottom of the other), measured on main
// before 0247 (with the banner's 1.06 pop): 47.8 px at 390x844, 57 px at 1280x720.
const TWO_BOXES = { 390: 47.8, 1280: 57 };

/** Marks a segment just ahead of the car as an unclaimed checkpoint gate, so the race step's own
 *  checkpoint path fires, then measures the announcer once the banner has faded fully in. */
async function checkpoint(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page, { minTime: 0.5 });
  // Let the start-of-race callouts clear (a checkpoint has their priority and would queue).
  await page.waitForFunction(() => document.getElementById('announcerMain').style.opacity !== '1', null, { timeout: 15000 });
  await page.evaluate(() => {
    const g = window.__OT.GameState, track = window.__OT.track();
    const seg = track.seg(Math.floor((g.trackPos + 1250) / 200) + 6);
    seg.trackType = 'CHECKPOINT';
    seg.cpClaimed = false;
  });
  const handle = await page.waitForFunction(() => {
    const main = document.getElementById('announcerMain');
    if (!/CHECKPOINT/.test(main.textContent) || Number(getComputedStyle(main).opacity) < 0.98) return null;
    const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height }; };
    const container = document.getElementById('announcerContainer');
    // Every element on screen in the announcer that draws a border or a background box.
    const boxes = [...container.querySelectorAll('*')].filter((n) => {
      const cs = getComputedStyle(n);
      let a = 1;
      for (let p = n; p && p !== container; p = p.parentElement) a *= Number(getComputedStyle(p).opacity);
      if (a < 0.05 || !n.getClientRects().length) return false;
      return parseFloat(cs.borderTopWidth) > 0 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    }).map((n) => n.id || n.tagName);
    const sub = document.getElementById('announcerSub');
    const subBox = sub.getClientRects().length ? box(sub) : null;
    const textEl = document.getElementById('announcerText');
    return {
      text: main.textContent, sub: sub.textContent, boxes,
      inside: main.contains(sub), main: box(main), subBox,
      mainFont: parseFloat(getComputedStyle(textEl || main).fontSize), subFont: parseFloat(getComputedStyle(sub).fontSize),
      subBelow: textEl ? box(textEl).b <= (subBox ? subBox.t + 1 : -1) : false,
    };
  }, null, { timeout: 20000, polling: 'raf' });
  return handle.jsonValue();
}

for (const vp of [{ width: 390, height: 844, touch: true }, { width: 1280, height: 720, touch: false }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });

    test('the checkpoint and its reward are one bordered box, reward as a smaller second line', async ({ page }) => {
      const problems = watchPage(page);
      const m = await checkpoint(page);
      expect(m.text).toMatch(/CHECKPOINT! \d+(ST|ND|RD|TH) PLACE/);
      expect(m.sub).toMatch(/TIME EXTENDED|NO MORE TIME/);
      expect(m.inside).toBe(true);
      expect(m.boxes).toEqual(['announcerMain']);
      expect(m.subBox).not.toBeNull();
      expect(m.subBox.l).toBeGreaterThanOrEqual(m.main.l);
      expect(m.subBox.r).toBeLessThanOrEqual(m.main.r);
      expect(m.subBox.b).toBeLessThanOrEqual(m.main.b);
      expect(m.subBelow).toBe(true);
      expect(m.subFont).toBeLessThan(m.mainFont);
      expect(m.main.h).toBeLessThanOrEqual(TWO_BOXES[vp.width]);
      await page.screenshot({ path: `test-results/checkpoint-banner-${vp.width}x${vp.height}.png` });
      expect(problems).toEqual([]);
    });

    test('a line with no reward is the one-line pill, with no empty second line', async ({ page }) => {
      const problems = watchPage(page);
      await page.goto(`${APP}?debug`);
      await page.evaluate(() => window.__OT.ready());
      await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
      await racing(page, { minTime: 0.5 });
      await page.evaluate(() => window.__OT.announce('FINAL LAP', '', 1500, 9));
      const m = await (await page.waitForFunction(() => {
        const main = document.getElementById('announcerMain');
        if (main.textContent !== 'FINAL LAP' || Number(getComputedStyle(main).opacity) < 0.98) return null;
        const cs = getComputedStyle(main);
        return { h: main.getBoundingClientRect().height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
          subShown: document.getElementById('announcerSub').getClientRects().length > 0 };
      }, null, { timeout: 10000, polling: 'raf' })).jsonValue();
      expect(m.subShown).toBe(false);
      expect(m.h).toBeLessThan(1.6 * m.line + 12);
      expect(problems).toEqual([]);
    });
  });
}
