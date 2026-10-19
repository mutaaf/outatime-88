// Endless balance harness (docs/BALANCE.md). Not part of `npm run e2e`: run it with
//   npm run balance                       (all four bots, defaults below)
//   BAL_SKILLS=casual BAL_PLAYERS=4 npm run balance
// Each bot "player" gets a fresh save and plays BAL_RUNS Endless runs in a row, keeping its
// coins, buying power-up upgrades and paying for continues the way that kind of player would.
// The sim runs flat out (no rendering) through ?debug's __OT.sim; every run is seeded, so the
// same settings give the same numbers. Results land in tests/balance/out/<label>.json; turn
// them into the report with `node tests/balance/report.mjs <label>...`.
import { test } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UPGRADE, POWER_KINDS as KINDS } from '../../src/powerups.js';
import { continueCost } from '../../src/runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const BOT = readFileSync(join(here, 'bot.js'), 'utf8');
const env = (k, d) => process.env[k] ?? d;
const SKILLS = env('BAL_SKILLS', 'novice,casual,good,expert').split(',');
const PLAYERS = Number(env('BAL_PLAYERS', 6));
const RUNS = Number(env('BAL_RUNS', 4));
const MAX_SECS = Number(env('BAL_MAXSECS', 900));
const LABEL = env('BAL_LABEL', 'latest');
const SEED = Number(env('BAL_SEED', 88));

const UPGRADE_COST = UPGRADE.cost;
const buys = { novice: false, casual: true, good: true, expert: true };

const results = [];
const CAMPAIGN_ONLY = () => process.env.BAL_MODE === 'campaign';

test.describe.configure({ mode: 'parallel' });

for (const skill of CAMPAIGN_ONLY() ? [] : SKILLS) {
  for (let p = 0; p < PLAYERS; p++) {
    test(`${skill} player ${p}`, async ({ page }) => {
      test.setTimeout(30 * 60_000);
      await page.route('**/outatime/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().endsWith('/run') ? '{"token":"t"}' : '{"ok":true,"entries":[]}' }));
      await page.goto('/outatime/?debug&gfx=low');
      await page.waitForFunction(() => window.__OT && window.__OT.sim);
      await page.waitForLoadState('networkidle');
      await page.addScriptTag({ content: BOT });
      const player = { skill, player: p, runs: [], purchases: [] };
      for (let r = 0; r < RUNS; r++) {
        const seed = (SEED * 1000003 + SKILLS.indexOf(skill) * 7919 + p * 101 + r) | 0;
        await page.evaluate(({ skill, seed }) => {
          const OT = window.__OT, B = window.__balanceBot;
          Math.random = B.mulberry32(seed); // the whole run (traffic, hazards, pickups) from one seed
          const G0 = OT.GameState;
          G0.deathCause = '';
          OT.startRace({ mode: 'INFINITE' });
          const G = OT.GameState;
          const bot = B.createBot(skill, seed);
          const m = window.__run = {
            seed, steps: 0, coins0: OT.save().fluxCoins, power: { MAGNET: 0, SHIELD: 0, DOUBLER: 0 },
            dmg: {}, lastDmg: '', tierAt: {}, continues: 0, hits: { traffic: 0, obstacle: 0, cone: 0 },
            lastHp: G.hp, lastLog: { traffic: 0, obstacle: 0, cone: 0 },
          };
          m.tick = () => {
            bot();
            m.steps++;
            const pw = G.power && G.power.t;
            if (pw) for (const k in m.power) if (pw[k] > 0) m.power[k]++;
            if (!m.tierAt[G.tier]) m.tierAt[G.tier] = G.raceTime;
            const log = G.penaltyLog || {};
            let kind = '';
            for (const k of ['traffic', 'obstacle', 'cone']) {
              const n = (log[k] || []).length;
              if (n > m.lastLog[k]) { m.hits[k] += n - m.lastLog[k]; kind = k; m.lastLog[k] = n; }
            }
            // A second crash hard on the heels of the first (a shunted car drifting back into
            // you, a pinball off the wall) is the cheap kind of loss: count them.
            if (kind && kind !== 'cone') { if (G.raceTime - (m.lastHitT ?? -9) < 2.5) m.rehits = (m.rehits || 0) + 1; m.lastHitT = G.raceTime; }
            if (G.hp < m.lastHp - 1e-6) {
              const why = kind || (G.wallGrind ? 'wall' : 'other');
              m.dmg[why] = (m.dmg[why] || 0) + (m.lastHp - G.hp);
              if (why !== 'wall') m.lastDmg = why; // grinding never wrecks you (HP floors at 1)
            }
            m.lastHp = G.hp;
          };
        }, { skill, seed });
        // Every lazy chunk the race uses (race step, rival AI, Endless hazards) is in before the
        // first step, so a run plays the same however fast the page loaded.
        await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.hz, null, { timeout: 15_000 });

        let status = 'PLAYING';
        for (;;) {
          const s = await page.evaluate(() => {
            const OT = window.__OT, G = OT.GameState;
            OT.sim(1200, window.__run.tick);
            return { status: G.status, t: G.raceTime };
          });
          status = s.status;
          if (status === 'PLAYING') {
            if (s.t >= MAX_SECS) break;
            continue;
          }
          if (status === 'CONTINUE') {
            const yes = page.locator('#btnContinueYes');
            await yes.waitFor({ state: 'visible', timeout: 5000 });
            const take = await page.evaluate((skill) => {
              const B = window.__balanceBot;
              return Math.random() < B.SKILLS[skill].cont; // seeded: same choice every time
            }, skill);
            // Clicked from the page: the offer animates in, and the sim is held, so it never settles.
            await page.evaluate((take) => {
              if (take) window.__run.continues++;
              document.getElementById(take ? 'btnContinueYes' : 'btnContinueNo').click();
            }, take);
            await page.waitForFunction(() => window.__OT.GameState.status !== 'CONTINUE', null, { timeout: 10_000 });
            continue;
          }
          break; // GAMEOVER
        }
        const run = await page.evaluate((capped) => {
          const OT = window.__OT, G = OT.GameState, m = window.__run;
          const badge = ((document.getElementById('endModalBadge') || {}).textContent || '').trim();
          const cause = G.deathCause || '';
          if (capped) { OT.finishRun(); }
          const secs = G.raceTime;
          return {
            seed: m.seed, secs, capped, distance: Math.round(G.distance), tier: G.tier, score: G.score,
            coins: G.runCoins, wallet: OT.save().fluxCoins, coins0: m.coins0, continues: m.continues,
            power: Object.fromEntries(Object.entries(m.power).map(([k, v]) => [k, v / Math.max(1, m.steps)])),
            cause: capped ? '' : cause, dmg: m.dmg, lastDmg: m.lastDmg, hits: m.hits, badge: capped ? 'CAPPED' : badge, tierAt: m.tierAt,
            wallMs: (G.penaltyLog || {}).wallMs || 0,
            pickups: OT.runner().stats.coins, doubled: OT.runner().stats.doubledCash,
            missions: (G.missions || []).filter((x) => x.done).reduce((a, x) => a + x.reward, 0),
            position: G.racePosition, warps: G.timeWarps, takedowns: G.takedowns, rehits: m.rehits || 0,
          };
        }, status === 'PLAYING');
        player.runs.push(run);
        // Between runs: spend like that kind of player (cheapest power-up level first, keeping
        // enough for a tier-3 continue), exactly what runner-ui's shop does (powerups.js buyUpgrade).
        if (buys[skill]) {
          const bought = await page.evaluate(({ KINDS, UPGRADE_COST, reserve }) => {
            const save = window.__OT.save();
            const e = save.endless || (save.endless = { bestDistance: 0, bestTier: 0, runs: 0 });
            const pw = e.power || (e.power = { MAGNET: 0, SHIELD: 0, DOUBLER: 0 });
            const out = [];
            for (;;) {
              const k = KINDS.slice().sort((a, b) => (pw[a] | 0) - (pw[b] | 0))[0];
              const lv = pw[k] | 0;
              if (lv >= UPGRADE_COST.length) break;
              const cost = UPGRADE_COST[lv];
              if (save.fluxCoins - cost < reserve) break;
              save.fluxCoins -= cost; pw[k] = lv + 1; out.push(`${k}${lv + 1}`);
            }
            return out;
          }, { KINDS, UPGRADE_COST, reserve: continueCost(3) });
          player.purchases.push(bought);
        }
      }
      results.push(player);
      mkdirSync(join(here, 'out'), { recursive: true });
      writeFileSync(join(here, 'out', `${LABEL}.${skill}.${p}.json`), JSON.stringify(player, null, 1));
    });
  }
}

// Campaign medals (src/progress.js LEVEL_MEDALS): BAL_MODE=campaign races each level with
// every bot and records the final score, the numbers the medal targets are set from.
const CAMPAIGN = env('BAL_MODE', '') === 'campaign';
const LEVELS = Number(env('BAL_LEVELS', 6));
const RACES = Number(env('BAL_RACES', 6));
for (const skill of CAMPAIGN ? SKILLS : []) {
  for (let lv = 0; lv < LEVELS; lv++) {
    test(`campaign ${skill} level ${lv + 1}`, async ({ page }) => {
      test.setTimeout(20 * 60_000);
      await page.route('**/outatime/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().endsWith('/run') ? '{"token":"t"}' : '{"ok":true,"entries":[]}' }));
      await page.goto('/outatime/?debug&gfx=low');
      await page.waitForFunction(() => window.__OT && window.__OT.sim);
      await page.addScriptTag({ content: BOT });
      const races = [];
      for (let r = 0; r < RACES; r++) {
        const seed = (SEED * 7777 + SKILLS.indexOf(skill) * 131 + lv * 17 + r) | 0;
        await page.evaluate(({ skill, seed, lv }) => {
          const OT = window.__OT, B = window.__balanceBot, G = OT.GameState;
          Math.random = B.mulberry32(seed);
          G.levelIndex = lv;
          OT.startRace({ mode: 'ARCADE' });
          window.__bot = B.createBot(skill, seed);
        }, { skill, seed, lv });
        await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
        for (let i = 0; i < 400; i++) {
          const st = await page.evaluate(() => { window.__OT.sim(1200, window.__bot); return window.__OT.GameState.status; });
          if (st !== 'PLAYING') break;
        }
        races.push(await page.evaluate(() => {
          const G = window.__OT.GameState;
          return { score: G.score, secs: G.raceTime, position: G.racePosition, finished: G.finishTime != null, coins: G.runCoins };
        }));
      }
      mkdirSync(join(here, 'out'), { recursive: true });
      writeFileSync(join(here, 'out', `${LABEL}.campaign.${skill}.${lv}.json`), JSON.stringify({ skill, level: lv, races }, null, 1));
    });
  }
}
