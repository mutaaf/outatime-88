// Endless hazards (ticket 0186): ignoring each one ends the run with the right cause on the death
// card; reacting the way the call-out asks survives it. Uses the ?debug hooks to lay a hazard
// right ahead of the car (window.__OT.hazard).
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ALL_SEEN = { BRIDGE: 1, WRONGWAY: 1, BEAM: 1, COLLAPSE: 1, TRAIN: 1, EDGE: 1, LIGHTNING: 1 };
const G = (page, fn, arg) => page.evaluate(fn, arg);

async function endless(page, { seen = ALL_SEEN, coins = 0 } = {}) {
  const save = { onboarded: true, fluxCoins: coins, endless: { bestDistance: 0, bestTier: 0, runs: 3, hz: { seen, deaths: {} } } };
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, save);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.hz);
  // Up to cruising speed, safe from everything that isn't a hazard.
  await G(page, () => { const g = window.__OT.GameState; g.speed = 82; g.invulnTimer = 60; g.playerX = 0; });
}

/** Lay `kind` ahead and wait for the run to end. */
async function ignore(page, kind, ahead = 1.6, lane = -1, keep = true) {
  // Hands off the wheel, held in the middle lane (curves would otherwise drift the car).
  if (keep) await G(page, () => { const g = window.__OT.GameState, l = window.__OT.lateral(); (function hold() { if (g.status !== 'PLAYING') return; l.x = 0; g.playerX = 0; requestAnimationFrame(hold); })(); });
  await G(page, ([k, a, l]) => window.__OT.hazard(k, a, l), [kind, ahead, lane]);
  await page.waitForFunction(() => window.__OT.GameState.status === 'GAMEOVER', null, { timeout: 12000 });
  return G(page, () => ({ cause: window.__OT.GameState.deathCause, card: (document.getElementById('hzCause') || {}).textContent || '', badge: document.getElementById('endModalBadge').textContent }));
}

const cases = [
  ['BRIDGE', /BROKEN BRIDGE/, 1.6, -1],
  ['WRONGWAY', /WRONG-WAY/, 1.8, 1],
  ['BEAM', /OVERPASS/, 1.6, 0],
  ['COLLAPSE', /CRUMBLED/, 1.6, 0],
  ['TRAIN', /TRAIN/, 2.0, -1],
  ['LIGHTNING', /LIGHTNING/, 1.2, 1],
];
for (const [kind, text, ahead, lane] of cases) {
  test(`ignoring a ${kind} ends the run, and the death card says why`, async ({ page }) => {
    const problems = watchPage(page);
    await endless(page);
    const end = await ignore(page, kind, ahead, lane);
    expect(end.cause).toBe(kind);
    expect(end.card).toMatch(text);
    expect(end.card).toMatch(/TIP:/);
    expect(end.badge).toMatch(text);
    expect(problems).toEqual([]);
  });
}

test('grinding the side where the guardrail is gone drops you off the edge', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page);
  await G(page, () => { window.__OT.input.right = true; });
  await page.waitForFunction(() => window.__OT.GameState.playerX > 0.7);
  const end = await ignore(page, 'EDGE', 0.2, 2, false);
  expect(end.cause).toBe('EDGE');
  expect(end.card).toMatch(/EDGE/);
  expect(problems).toEqual([]);
});

test('resource fails: out of plutonium, a blown engine, stalling, the Patrol and a missed checkpoint', async ({ page }) => {
  test.setTimeout(120000);
  const problems = watchPage(page);
  const run = async (setup) => {
    await endless(page);
    await G(page, setup);
    await page.waitForFunction(() => window.__OT.GameState.status === 'GAMEOVER', null, { timeout: 20000 });
    const cause = await G(page, () => window.__OT.GameState.deathCause);
    await page.evaluate(() => sessionStorage.removeItem('seeded'));
    return cause;
  };
  // Out of fuel, steering clear of every core: five seconds dry ends it.
  expect(await run(() => { const h = window.__OT.GameState.hz; h.fuelOn = true; setInterval(() => { h.fuel = 0; }, 16); })).toBe('FUEL');
  expect(await run(() => { window.__OT.GameState.hz.heat = 99; window.__OT.input.nosHeld = true; window.__OT.GameState.nosFill = 1; })).toBe('HEAT');
  expect(await run(() => { const g = window.__OT.GameState; g.autoGas = false; g.speed = 0; g.raceTime = Math.max(g.raceTime, 10); })).toBe('STALL');
  expect(await run(() => {
    const g = window.__OT.GameState;
    g.distance = 6000;
    return new Promise((r) => setTimeout(() => {
      g.invulnTimer = 0; window.__OT.damage(10, 'BARREL HIT');
      setTimeout(() => { g.invulnTimer = 0; window.__OT.damage(10, 'BARREL HIT'); r(); }, 400);
    }, 200));
  })).toBe('PATROL');
  expect(await run(() => {
    const g = window.__OT.GameState;
    g.distance = 6000;
    return new Promise((r) => setTimeout(() => { g.hz.cp.left = 0.05; r(); }, 300));
  })).toBe('TIMEOUT');
  expect(problems).toEqual([]);
});

/** Lay `kind` ahead, react with `act` every frame, and report how it went. */
async function react(page, kind, ahead, lane, act) {
  await G(page, ([k, a, l]) => window.__OT.hazard(k, a, l), [kind, ahead, lane]);
  return G(page, (actSrc) => new Promise((resolve) => {
    const g = window.__OT.GameState, inp = window.__OT.input, act = new Function('g', 'inp', 'h', actSrc);
    const t0 = performance.now();
    (function tick() {
      const h = g.hz.list.find((x) => x.i === -1);
      if (h) act(g, inp, h);
      if (g.status !== 'PLAYING' || (!h && !g.hz.dying) || performance.now() - t0 > 14000) {
        inp.down = false; inp.left = false; inp.right = false;
        resolve({ status: g.status, cause: g.deathCause || null, survived: window.__OT.runner().stats.hazards });
      } else requestAnimationFrame(tick);
    })();
  }), act);
}

test('reacting the way the call-out asks survives each hazard', async ({ page }) => {
  test.setTimeout(120000);
  const problems = watchPage(page);
  await endless(page);
  const moves = [
    ['BRIDGE', 1.8, -1, "if (g.hz.cue === 'JUMP!') inp.hoverPressed = true;"],
    ['BEAM', 1.6, 0, 'inp.down = h.warned;'],
    ['COLLAPSE', 1.6, 0, 'inp.left = g.playerX > -0.4;'],
    ['WRONGWAY', 2.2, 1, 'inp.left = h.locked && g.playerX > -0.4;'],
    ['TRAIN', 2.2, -1, 'inp.down = h.warned;'],
  ];
  let survived = 0;
  for (const [kind, ahead, lane, act] of moves) {
    // Square in the middle lane, straight, at cruising speed.
    await G(page, () => { const g = window.__OT.GameState, l = window.__OT.lateral(), i = window.__OT.input; i.left = i.right = i.down = false; g.speed = 82; Object.assign(l, { x: 0, vx: 0, yaw: 0, yawVel: 0, beta: 0, slip: 0 }); g.playerX = 0; g.playerVX = 0; });
    await page.waitForTimeout(300);
    const r = await react(page, kind, ahead, lane, act);
    expect(r.status, `${kind}: ${r.cause}`).toBe('PLAYING');
    expect(r.survived).toBeGreaterThan(survived);
    survived = r.survived;
  }
  expect(problems).toEqual([]);
});

test('the first time you meet a hazard it teaches instead of ending the run; a shield saves you once', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page, { seen: {} });
  await G(page, () => window.__OT.hazard('BRIDGE', 1.6));
  await page.waitForFunction(() => window.__OT.GameState.hz.list.every((h) => h.spent || h.kind !== 'BRIDGE'), null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const after = await G(page, () => ({ status: window.__OT.GameState.status, seen: JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).endless.hz.seen }));
  expect(after.status).toBe('PLAYING');
  expect(after.seen.BRIDGE).toBe(1);
  // Met before now: with a shield up it pops the shield instead of the run.
  await G(page, () => window.__OT.pickup('SHIELD'));
  await G(page, () => window.__OT.hazard('BRIDGE', 1.6));
  await page.waitForFunction(() => window.__OT.GameState.power.t.SHIELD === 0, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  expect(await G(page, () => window.__OT.GameState.status)).toBe('PLAYING');
  expect(problems).toEqual([]);
});

test('past the gentle first stretch the road lays down unlocked hazards by itself, signs first', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page);
  await G(page, () => { window.__OT.GameState.distance = 9000; });
  await page.waitForFunction(() => window.__OT.GameState.hz.list.length > 0, null, { timeout: 8000 });
  const laid = await G(page, () => { const g = window.__OT.GameState, pz = g.trackPos + 1250; return { tier: g.tier, list: g.hz.list.map((h) => ({ kind: h.kind, ahead: h.z0 - pz, sign: h.z0 - h.signZ })) }; });
  expect(laid.tier).toBeGreaterThanOrEqual(2);
  for (const h of laid.list) {
    expect(['BRIDGE', 'WRONGWAY', 'BEAM', 'COLLAPSE', 'TRAIN', 'EDGE']).toContain(h.kind);
    expect(h.ahead).toBeGreaterThan(10000); // laid down far out, seconds before you reach it
    expect(h.sign).toBeGreaterThan(0);
  }
  expect(problems).toEqual([]);
});

test('in 3D every hazard shows as simple shapes and the HUD still draws', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, fluxCoins: 0, endless: { hz: { seen: { BRIDGE: 1, WRONGWAY: 1, BEAM: 1, COLLAPSE: 1, TRAIN: 1, EDGE: 1, LIGHTNING: 1 }, deaths: {} } } })); } });
  await page.goto(`${APP}?debug&view=3d`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.view().mode === '3d' && window.__OT.view().stats && window.__OT.GameState.racePhase === 'RACING', null, { timeout: 30000 });
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 60; g.hz.heat = 50; for (const k of ['BRIDGE', 'BEAM', 'COLLAPSE', 'EDGE']) window.__OT.hazard(k, 6 + Math.random() * 2, 0); });
  const f0 = await G(page, () => window.__OT.view().stats.frames);
  await page.waitForFunction((k) => window.__OT.view().stats.frames > k + 20, f0, { timeout: 10000 });
  expect(await G(page, () => window.__OT.GameState.hz.list.length)).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});
