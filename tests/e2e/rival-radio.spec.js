// Rival radio (ticket 0277): a pass or a takedown gets one short line from that crew, through the
// one announcement channel (a polite live region), never in the start sequence (unit-tested), at most one per
// 6 s, and none with Coach tips off. A recorder samples the announcer every frame from the title
// on; a rival is moved past you (or behind you) to force a pass. The pack keeps racing, so a
// natural pass in the same moment may speak instead (the newest event wins): the line is checked
// against the crew it names.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';
import { RADIO } from '../../src/radio.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const nextFramesSafe = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Every frame: the race clock and the announcer's text while it shows (an edge list, not every frame). */
const record = (page, settings) => page.addInitScript(([k, s]) => {
  if (s) localStorage.setItem(k, JSON.stringify({ settings: s }));
  const out = window.__radio = [];
  let was = '';
  (function look() {
    const box = document.getElementById('announcerMain');
    const text = box && box.style.opacity === '1' ? document.getElementById('announcerText').textContent : '';
    const g = window.__OT && window.__OT.GameState;
    if (text !== was) { was = text; if (text) out.push({ text, t: g ? g.raceTime : 0, phase: g ? g.racePhase : '' }); }
    requestAnimationFrame(look);
  })();
}, [SAVE, settings]);

/** A campaign race (the field of six, no Endless run-ending hazards), past the lights. */
async function startArcade(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
}

/** Flip the side of one rival that is still racing: ahead of you goes behind, behind goes ahead. */
const forcePass = (page) => page.evaluate(() => {
  const g = window.__OT.GameState, T = window.__OT.traffic();
  const r = T.racers.find((x) => !x.takenDown && x.finishTime == null);
  const s2w = T.speedToWorld();
  const playerZ = r.worldZ - (r.progress - g.distance) * s2w;
  const ahead = r.progress > g.distance;
  r.worldZ = r.prevZ = playerZ + (ahead ? -6000 : 6000);
  return { t: g.raceTime, field: T.racers.map((x) => ({ driver: x.driver, crew: x.crew })) };
});

/** Past the start sequence and the nemesis intro, the channel free, no crash or warp on: the radio
 *  may speak. */
const clearMoment = async (page) => {
  await page.waitForFunction(() => {
    const g = window.__OT.GameState, w = window.__OT.traffic().aiWorld;
    return g.raceTime > 5 && (!w || w.nemesisCalled) && document.getElementById('announcerMain').style.opacity !== '1'
      && !(g.invulnTimer > 0) && !(g.warpActiveTimer > 0) && g.sinceWarp > 2;
  }, null, { timeout: 30_000 }).catch(async (e) => { console.log('DIAG', await diag(page)); throw e; });
};

const diag = (page) => page.evaluate(() => { const g = window.__OT.GameState; return JSON.stringify({ st: g.status, ph: g.racePhase, t: g.raceTime, inv: g.invulnTimer, w: g.warpActiveTimer, sw: g.sinceWarp, op: document.getElementById('announcerMain').style.opacity, txt: document.getElementById('announcerText').textContent, nem: window.__OT.traffic().aiWorld?.nemesisCalled, hidden: document.hidden, log: window.__radio.map((x) => x.text + '@' + x.t.toFixed(1)) }); });

/** How many lines the radio has let through this race (src/radio-run.js `radio.n`; the same module
 *  instance the game runs, imported by its chunk URL). Counted with Coach tips off too. */
const spoken = (page) => page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/radio-run-[\w-]+\.js$/.test(n));
  return url ? (await import(url)).radio.n : -1;
});

/** Force passes until the radio lets a line through (a busy channel can let one go stale, by design). */
async function passUntilRadio(page) {
  for (let i = 0; i < 6; i++) {
    await clearMoment(page);
    const pass = await forcePass(page);
    const ok = await page.waitForFunction(() => window.__radio.some((x) => x.text.startsWith('📻')), null, { timeout: 7_000 }).then(() => true, () => false);
    if (ok || await spoken(page) > 0) return pass;
  }
  throw new Error(`no radio line: ${JSON.stringify(await page.evaluate(() => window.__radio))}`);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a forced pass gets one radio line from that crew at ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.slow();
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await record(page);
    await startArcade(page);
    const pass = await passUntilRadio(page);
    const line = await page.evaluate(() => ({
      main: document.getElementById('announcerText').textContent,
      sub: document.getElementById('announcerSub').textContent,
      live: document.getElementById('announcerContainer').getAttribute('aria-live'),
      box: document.getElementById('announcerMain').getBoundingClientRect().toJSON(),
      t: window.__OT.GameState.raceTime,
    }));
    expect(line.main.startsWith('📻 ')).toBe(true);
    const [driver, crew] = line.sub.split(' · ');
    expect(pass.field).toContainEqual({ driver, crew });
    const t = RADIO[crew];
    expect([...t.by, ...t.lost, ...t.down]).toContain(line.main.slice(3));
    expect(line.live).toBe('polite'); // screen readers hear it (0030)
    expect(line.box.left).toBeGreaterThanOrEqual(0); // one pill, on screen
    expect(line.box.right).toBeLessThanOrEqual(vp.width);
    // Once: the next 3 s of race show no second radio line.
    await page.waitForFunction((t) => { const g = window.__OT.GameState; return g.raceTime > t + 3 || g.racePhase !== 'RACING'; }, line.t, { timeout: 30_000 })
      .catch(async (e) => { console.log('DIAG', await diag(page)); throw e; });
    const radio = await page.evaluate(() => window.__radio.filter((x) => x.text.startsWith('📻')));
    expect(radio.length).toBe(1);
    expect(await spoken(page)).toBe(1);
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

test('with Coach tips off the rivals keep quiet', async ({ page }) => {
  test.slow();
  const problems = watchPage(page);
  await record(page, { coach: false });
  await startArcade(page);
  await passUntilRadio(page);
  expect(await spoken(page)).toBeGreaterThan(0); // the radio had its moment to speak…
  await nextFramesSafe(page);
  expect(await page.evaluate(() => window.__radio.filter((x) => x.text.startsWith('📻')))).toEqual([]); // …and kept quiet
  expect(problems).toEqual([]);
});
