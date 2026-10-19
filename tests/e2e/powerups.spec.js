// Runner power-ups (ticket 0175): magnet, shield and 2X coins in Endless, their HUD rings, and
// the coins-only upgrade shop. Uses the ?debug hooks to grab a power-up and to place the car.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const G = (page, fn, arg) => page.evaluate(fn, arg);
async function endless(page, save) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, save || { onboarded: true });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING');
}

test('Endless roads carry magnets, shields and 2X power-ups as you drive on', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await endless(page);
  // Fast-forward down the road and note every power-up the generator lays down.
  const seen = await G(page, () => new Promise((resolve) => {
    const g = window.__OT.GameState, t = window.__OT.track(), seen = {};
    const t0 = performance.now();
    (function tick() {
      g.invulnTimer = 1; g.hp = g.maxHp; g.playerX = 0;
      g.trackPos += 3000;
      for (let i = t.start; i < t.end; i++) { const s = t.seg(i); if (s) for (const it of s.items) if (/^(MAGNET|SHIELD|DOUBLER)$/.test(it.type)) seen[`${it.type}@${i}`] = it.type; }
      const kinds = new Set(Object.values(seen));
      if (kinds.size === 3 || performance.now() - t0 > 30000) resolve([...kinds].sort());
      else requestAnimationFrame(tick);
    })();
  }));
  expect(seen).toEqual(['DOUBLER', 'MAGNET', 'SHIELD']);
  expect(problems).toEqual([]);
});

test('a shield takes one crash: no HP lost, then it is gone; the ring shows while it is up', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page);
  await G(page, () => window.__OT.pickup('SHIELD'));
  const up = await G(page, () => ({ on: window.__OT.GameState.power.on, t: window.__OT.GameState.power.t.SHIELD }));
  expect(up.on).toBe(true);
  expect(up.t).toBeGreaterThan(15);
  await expect(page.locator('#announcerMain')).toContainText('SHIELD');
  const hit = await G(page, () => {
    const g = window.__OT.GameState;
    g.invulnTimer = 0;
    const hp = g.hp, score = g.score;
    window.__OT.damage(30, 'BARRIER IMPACT');
    return { lost: hp - g.hp, scoreLost: score - g.score, shield: g.power.t.SHIELD, saves: window.__OT.runner().stats.shieldSaves };
  });
  expect(hit.lost).toBe(0);
  expect(hit.scoreLost).toBe(0);
  expect(hit.shield).toBe(0);
  expect(hit.saves).toBe(1);
  await expect(page.locator('#announcerMain')).toContainText('SHIELD SAVED');
  // The next crash costs HP as usual.
  const next = await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; const hp = g.hp; window.__OT.damage(30, 'BARRIER IMPACT'); return hp - g.hp; });
  expect(next).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('2X doubles coin cash while it runs', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page);
  const plain = await G(page, () => { const g = window.__OT.GameState; const c = g.runCoins; window.__OT.pickup('HW_COIN'); return g.runCoins - c; });
  await G(page, () => window.__OT.pickup('DOUBLER'));
  const doubled = await G(page, () => { const g = window.__OT.GameState; const c = g.runCoins; window.__OT.pickup('HW_COIN'); return g.runCoins - c; });
  expect(plain).toBeGreaterThan(0);
  expect(doubled).toBe(plain * 2);
  expect(await G(page, () => window.__OT.runner().stats.doubledCash)).toBe(doubled);
  expect(problems).toEqual([]);
});

test('a magnet pulls in a coin trail you drive well wide of', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await endless(page);
  const trail = await G(page, () => {
    const OT = window.__OT, tr = OT.track(), g = OT.GameState;
    const from = Math.floor((g.trackPos + 1250) / 200) + 30;
    for (let i = from; i < tr.end - 12; i++) {
      const coins = [];
      for (let d = 0; d <= 9; d += 3) {
        const s = tr.seg(i + d);
        const it = s && s.items.find((x) => x.type === 'HW_COIN' && !x.collected);
        if (it) coins.push({ i: i + d, offset: it.offset });
      }
      if (coins.length === 4) return coins;
    }
    return null;
  });
  expect(trail).not.toBeNull();
  await G(page, () => window.__OT.pickup('MAGNET'));
  const got = await G(page, (trail) => new Promise((resolve) => {
    const OT = window.__OT, g = OT.GameState, tr = OT.track();
    g.trackPos = trail[0].i * 200 - 1250 - 1400;
    g.speed = 60;
    const t0 = performance.now();
    (function tick() {
      g.power.t.MAGNET = Math.max(g.power.t.MAGNET, 4);
      g.invulnTimer = 1; g.hp = g.maxHp;
      const cur = Math.floor((g.trackPos + 1250) / 200);
      const next = trail.find((c) => c.i >= cur) || trail[trail.length - 1];
      // Stay ~0.75 lanes away from where the coin was placed (well outside the normal reach).
      const away = next.offset > 0 ? next.offset - 0.75 : next.offset + 0.75;
      g.playerX = Math.max(-0.7, Math.min(0.7, away)); g.playerVX = 0;
      const done = trail.every((c) => tr.seg(c.i).items.some((x) => x.type === 'HW_COIN' && x.collected));
      if (done || performance.now() - t0 > 20000) resolve({ done, magnet: OT.runner().stats.magnetCoins });
      else requestAnimationFrame(tick);
    })();
  }), trail);
  expect(got.done).toBe(true);
  expect(got.magnet).toBeGreaterThanOrEqual(4);
  expect(problems).toEqual([]);
});

test('the results card sells upgrades for FLUX cash only, and a level makes it last longer', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page, { onboarded: true, fluxCoins: 1000 });
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = 1; window.__OT.damage(50); });
  const offer = page.locator('#continueOffer');
  if (await offer.isVisible()) await page.locator('#btnContinueNo').click();
  await expect(page.locator('#gameOverModal')).toBeVisible();
  const shop = page.locator('#endShop');
  await expect(shop).toBeVisible();
  await expect(shop.locator('.shop-item')).toHaveCount(3);
  const before = await G(page, () => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).fluxCoins);
  await shop.locator('.shop-item[data-kind="MAGNET"]').click();
  await expect.poll(() => G(page, () => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).endless.power.MAGNET)).toBe(1);
  const after = await G(page, () => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).fluxCoins);
  expect(before - after).toBe(250);
  await expect(shop).toContainText('YOU HAVE');
  // Next run: the magnet lasts its level-1 length.
  await page.locator('#btnPlayAgain').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING');
  await G(page, () => window.__OT.pickup('MAGNET'));
  expect(await G(page, () => window.__OT.GameState.power.dur.MAGNET)).toBeCloseTo(9.5);
  expect(problems).toEqual([]);
});
