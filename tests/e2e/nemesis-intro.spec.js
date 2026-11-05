// The nemesis intro waits for the fork cards and an impact plate (ticket 0249). It used to fire
// at 7 s whatever was up, so "😈 NEMESIS: …" landed on top of the SKY-LOOP / TUNNEL cards (and a
// "SOLID TRAFFIC IMPACT!" plate) while the player had to pick a lane. Now it holds back until
// both are gone and fires on the first clear frame. The car is parked on the fork with the race
// running (raceTime keeps counting), every frame is sampled, then the car is moved past the fork.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Start sampling every frame: race time, fork cards visible, nemesis intro visible. */
const startSampling = (page) => page.evaluate(() => {
  const g = window.__OT.GameState;
  const out = window.__nemSamples = [];
  const nemesisUp = () => document.getElementById('announcerMain').style.opacity === '1'
    && document.getElementById('announcerText').textContent.includes('NEMESIS');
  (function f() {
    if (window.__nemStop) return;
    out.push({
      t: g.raceTime,
      fork: !document.getElementById('forkChoiceBanner').classList.contains('hidden'),
      plate: g.hitShockwaves.some((s) => s.hit && s.label && s.life > 0),
      nem: nemesisUp(),
      called: window.__OT.traffic().aiWorld.nemesisCalled,
    });
    requestAnimationFrame(f);
  })();
});
const samples = (page) => page.evaluate(() => { window.__nemStop = true; return window.__nemSamples; });

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`the nemesis intro waits for the fork cards at ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.slow(); // ~10 s of race time on a starved runner
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce', hasTouch: vp.width < 600 });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.waitForFunction(() => window.__OT.traffic().aiWorld && window.__OT.traffic().racers.some((r) => r.nemesis));
    // Park the car on the fork, left of centre, so the cards are up through the 7 s mark.
    await page.evaluate(() => {
      const g = window.__OT.GameState, T = window.__OT.track();
      const seg = T.liveSegments().find((s) => s.trackType === 'SPLIT_FORK');
      const z = seg.p1.world.z + (seg.p2.world.z - seg.p1.world.z) * 4 - 1250;
      window.__nemHold = setInterval(() => {
        g.invulnTimer = 30; g.hp = g.maxHp; g.speed = 0; g.autoGas = false;
        g.trackPos = z; g.playerX = -0.3; g.playerVX = 0;
      }, 5);
    });
    await startSampling(page);
    await page.waitForFunction(() => window.__OT.GameState.raceTime > 10, null, { timeout: 60000 });
    expect(await page.evaluate(() => window.__OT.traffic().aiWorld.nemesisCalled)).toBe(false);
    // Off the fork: the cards go and the intro follows within a second of play.
    const offAt = await page.evaluate(() => {
      clearInterval(window.__nemHold);
      const g = window.__OT.GameState, T = window.__OT.track();
      const forks = T.liveSegments().filter((s) => s.trackType === 'SPLIT_FORK');
      g.trackPos = forks[forks.length - 1].p2.world.z + 3000; g.playerX = 0;
      g.speed = 70; g.autoGas = true; // drive on, so a stall call doesn't take the channel
      return g.raceTime;
    });
    await page.waitForFunction(() => document.getElementById('forkChoiceBanner').classList.contains('hidden'));
    await page.waitForFunction(() => window.__OT.traffic().aiWorld.nemesisCalled, null, { timeout: 20000 });
    await page.waitForFunction(() => window.__nemSamples.some((x) => x.nem), null, { timeout: 20000 });
    const s = await samples(page);
    const calledAt = s.find((x) => x.called), shownAt = s.find((x) => x.nem);
    expect(s.filter((x) => x.fork && x.t >= 7).length).toBeGreaterThan(10); // the cards were up past 7 s
    expect(s.filter((x) => x.fork && x.nem)).toEqual([]); // never both on screen
    expect(calledAt.t - offAt, 'announced within a second of the cards going').toBeLessThan(1);
    expect(shownAt.fork).toBe(false);
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

test('the nemesis intro waits for an impact plate', async ({ page }) => {
  test.slow(); // ~10 s of race time on a starved runner
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.waitForFunction(() => window.__OT.traffic().aiWorld && window.__OT.traffic().racers.some((r) => r.nemesis));
  // One impact plate that stays up until 10 s into the race. The car is parked where it started,
  // short of the first fork, so neither the cards nor a real crash plate decide the timing.
  await page.evaluate(() => {
    const g = window.__OT.GameState, z = g.trackPos;
    const life = 10 - g.raceTime;
    g.hitShockwaves.push({ x: 0, y: -20, radius: 15, maxRadius: 145, color: '#ef4444', label: '💥 SOLID TRAFFIC IMPACT!', hit: true, life, maxLife: life });
    window.__nemHold = setInterval(() => {
      g.invulnTimer = 30; g.hp = g.maxHp; g.speed = 0; g.autoGas = false; g.trackPos = z; g.playerVX = 0;
    }, 5);
  });
  await startSampling(page);
  await page.waitForFunction(() => window.__OT.traffic().aiWorld.nemesisCalled, null, { timeout: 60000 });
  // Drive on, so a stall call doesn't hold the channel while we wait for the banner.
  await page.evaluate(() => { clearInterval(window.__nemHold); const g = window.__OT.GameState; g.speed = 70; g.autoGas = true; });
  await page.waitForFunction(() => window.__nemSamples.some((x) => x.nem), null, { timeout: 20000 });
  const s = await samples(page);
  const calledAt = s.find((x) => x.called), shownAt = s.find((x) => x.nem);
  expect(s.filter((x) => x.plate && x.t >= 7).length).toBeGreaterThan(10); // the plate was up past 7 s
  expect(s.filter((x) => x.fork && x.t < calledAt.t)).toEqual([]); // the plate, not a fork, held it
  expect(calledAt.t, 'not while the plate is up').toBeGreaterThanOrEqual(9.9);
  expect(calledAt.t, 'announced within a second of the plate going').toBeLessThan(11);
  expect(shownAt.plate).toBe(false);
  expect(problems).toEqual([]);
});
