// Lap split versus your best (ticket 0286): crossing the line mid-race announces that lap against
// your saved best for it on this level ("LAP 1 ▼ -0.42", green for a gain; "▲ +0.31" amber for a
// loss), on the one announcement channel; the finish saves the bests (`bestLaps`, survives reload).
// A recorder logs every line the announcer shows, with the box's lap-* class, from the title on.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';

const record = (page, save) => page.addInitScript(([k, s]) => {
  if (s && !sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } // once: a reload keeps what the game saved
  const out = window.__calls = [];
  let was = '';
  (function look() {
    const box = document.getElementById('announcerMain');
    const text = box && box.style.opacity === '1' ? document.getElementById('announcerText').textContent : '';
    if (text !== was) {
      was = text;
      if (text) {
        const r = box.getBoundingClientRect();
        out.push({ text, sub: document.getElementById('announcerSub').textContent, cls: [...box.classList].filter((c) => c.startsWith('lap-')).join(' '),
          color: getComputedStyle(box).color, left: r.left, right: r.right }); // colour on the line's first frame
      }
    }
    requestAnimationFrame(look);
  })();
}, [SAVE, save]);

async function startArcade(page, opts = { mode: 'ARCADE' }) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate((o) => window.__OT.startRace(o), opts);
  await racing(page, { minTime: 1 });
  // The jump below would also cross a traffic wave, whose banner (and the LAP 2/3 call) would hold the
  // split in the queue past its stale time: in a real race waves come one at a time. Pin the wave.
  await page.evaluate(() => { window.__OT.GameState.waveTier = 99; });
}

/** Jump just past the end of lap 1 and wait until the race step has logged the split. */
async function crossLap1(page) {
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength / 3 + 5; });
  await page.waitForFunction(() => window.__OT.GameState.lapSplits.length >= 1);
}

const lapCalls = (page) => page.evaluate(() => window.__calls.filter((c) => /^LAP \d+ [▼▲=]/.test(c.text)));

test('a lap faster than your best: "LAP 1 ▼ -x.xx" in green, whole on screen at 1280x720', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await record(page, { onboarded: true, bestLaps: { 0: [900, 900, 900] } });
  await startArcade(page);
  await crossLap1(page);
  await expect.poll(() => lapCalls(page), { timeout: 8000 }).toHaveLength(1);
  const [c] = await lapCalls(page);
  expect(c.text).toMatch(/^LAP 1 ▼ -\d+\.\d\d$/);
  expect(c.sub).toBe('FASTER THAN YOUR BEST 15:00.00');
  expect(c.cls).toBe('lap-gain');
  // The box eases its colours (transition-all 300 ms), so read the settled colour while the line is up.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('announcerMain')).color)).toBe('rgb(74, 222, 128)');
  await expect(page.locator('#announcerText')).toHaveText(c.text);
  expect(problems).toEqual([]);
});

test('a slower lap: "▲ +x.xx" in amber, whole at 320 px wide; the next line loses the tint', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await record(page, { onboarded: true, bestLaps: { 0: [0.2, 0.2, 0.2] } });
  await startArcade(page);
  await crossLap1(page);
  await expect.poll(() => lapCalls(page), { timeout: 8000 }).toHaveLength(1);
  const [c] = await lapCalls(page);
  expect(c.text).toMatch(/^LAP 1 ▲ \+\d+\.\d\d$/);
  expect(c.cls).toBe('lap-loss');
  expect(c.left).toBeGreaterThanOrEqual(0);
  expect(c.right).toBeLessThanOrEqual(320);
  // Any later line wears the default colours, never the lap's.
  await page.waitForFunction(() => document.getElementById('announcerMain').style.opacity !== '1', null, { timeout: 8000 });
  await page.evaluate(() => window.__OT.announce('TEST LINE', '', 1500, 3));
  // …from its first frame: the box doesn't ease colours, so no green fades off the next line.
  await expect.poll(() => page.evaluate(() => window.__calls.at(-1))).toMatchObject({ text: 'TEST LINE', cls: '', color: 'rgb(252, 211, 77)' });
});

test('no saved best: no delta; the finish saves every lap and it survives a reload', async ({ page }) => {
  const problems = watchPage(page);
  await record(page, { onboarded: true });
  await startArcade(page);
  await crossLap1(page);
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 20; g.speed = 120; });
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'FINISHED');
  await page.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').bestLaps || {})[0], SAVE);
  expect(await lapCalls(page)).toEqual([]);
  const splits = await page.evaluate(() => window.__OT.GameState.lapSplits);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).bestLaps[0], SAVE);
  expect(saved).toHaveLength(3);
  saved.forEach((t, i) => expect(t).toBeCloseTo(splits[i], 6));
  await page.reload();
  await page.waitForFunction(() => window.__OT && window.__OT.GameState);
  await page.evaluate(() => window.__OT.ready()); // booted: the save was loaded (and re-saved) by then
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).bestLaps[0], SAVE)).toEqual(saved);
  // The next race reads it back: lap 1 is now called against the saved lap 1.
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page, { minTime: 1 });
  await page.evaluate(() => { window.__OT.GameState.waveTier = 99; });
  await crossLap1(page);
  await expect.poll(() => lapCalls(page), { timeout: 8000 }).toHaveLength(1);
  const [c] = await lapCalls(page);
  expect(c.text).toMatch(/^LAP 1 [▼▲=] [-+]?\d+\.\d\d$/);
  expect(c.sub).toMatch(new RegExp(` YOUR BEST ${saved[0].toFixed(2)}$`));
  expect(problems).toEqual([]);
});

test('a daily race never calls a split', async ({ page }) => {
  // A best on every level, so whichever one today's daily borrows has one to compare with.
  await record(page, { onboarded: true, bestLaps: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, [900, 900, 900]])) });
  await startArcade(page, { daily: true });
  await crossLap1(page);
  // Give the line time to land (it would within a frame or a 1.5 s queue wait), then check none did.
  const t0 = await page.evaluate(() => window.__OT.GameState.raceTime);
  await page.waitForFunction((t) => window.__OT.GameState.raceTime > t + 3 || window.__OT.GameState.status !== 'PLAYING', t0, { timeout: 20000 });
  expect(await lapCalls(page)).toEqual([]);
});

test('a banner already up at the crossing (a WAVE) does not make the split go stale', async ({ page }) => {
  await record(page, { onboarded: true, bestLaps: { 0: [900, 900, 900] } });
  await startArcade(page);
  // What a real lap end can meet on some tracks (level 6's wave lands 33 units before its lap line).
  await page.evaluate(() => window.__OT.announce('🌊 WAVE 9 REACHED!', 'SPEED & OBSTACLE INTENSITY UP!', 1400));
  await crossLap1(page);
  await expect.poll(() => lapCalls(page), { timeout: 8000 }).toHaveLength(1);
});
