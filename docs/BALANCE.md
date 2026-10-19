# Endless balance (ticket 0187)

How hard Endless is, how fast it pays, and how that was measured. Every number here comes
from the balance harness, so a later change can be re-measured the same way instead of
guessed at.

## The harness

`npm run balance` (Playwright, separate from the e2e suite: `playwright.balance.config.js`,
`tests/balance/`). It builds the game and plays it in headless Chromium. Under `?debug` on
localhost, `__OT.sim(n, cb)` holds the frame loop and steps the real 120 Hz race step flat out
with no rendering, so a 15-minute run takes about a second. Nothing here ships: the bots and
the harness live under `tests/`, and `__OT` exists only on local and preview hosts.

- **Bots** (`tests/balance/bot.js`) see only what a player sees: bodies, pickups and Endless
  hazards on the road ahead, within their sight distance, plus the hazard call-outs. They drive
  through `InputState` like a gamepad. Four skills:

  | bot | sight (s at 100 mph) | rethink | hands lag | reads bends | times jumps / ducks / brakes | understands a hazard | look-aways |
  |---|---|---|---|---|---|---|---|
  | novice | ~0.6 | 0.35 s | 0.30 s | 45% | 40% | 60% | 12%/s, 1 s |
  | casual | ~0.9 | 0.20 s | 0.18 s | 70% | 70% | 85% | 6%/s, 0.8 s |
  | good | ~1.4 | 0.10 s | 0.10 s | 88% | 90% | 95% | 2.5%/s, 0.55 s |
  | expert | ~2.0 | 0.04 s | 0.05 s | 100% | 98% | 99% | 0.5%/s, 0.35 s |

  They learn the way players do: each earlier meeting with a hazard kind (the tutorial) and
  each death to it takes a quarter off the chance of getting it wrong again.
- **Players:** each bot "player" gets a fresh save and plays `BAL_RUNS` Endless runs in a row,
  keeping its coins. It pays for the continue (casual and up always; novices half the time)
  and between runs buys power-up levels, cheapest first, keeping enough for a tier-3 continue.
- **Seeds:** every run seeds `Math.random`, so the same settings give the same distribution.
  Runs aren't bit-exact, because some coach and announcer timing reads the wall clock, but the
  medians repeat within a few percent.
- **Campaign:** `BAL_MODE=campaign` races every level ten times per bot. The medal targets in
  `src/progress.js` are set from these scores.
- **Report:** `node tests/balance/report.mjs <label> [<label>]` turns `tests/balance/out/*.json`
  into the tables below.

Knobs: `BAL_SKILLS`, `BAL_PLAYERS` (6), `BAL_RUNS` (4), `BAL_MAXSECS` (900, the cap on one
run), `BAL_SEED`, `BAL_LABEL`, `BAL_MODE`, `BAL_RACES`, `BAL_WORKERS`. The numbers below are
from `BAL_PLAYERS=10 BAL_RUNS=6` (60 runs per bot) and `BAL_MODE=campaign BAL_RACES=10`.

## Targets

| bot | target | result (before → after) |
|---|---|---|
| novice | survives ≥ 60 s on a first run; the first minute is gentle | 1st-run p10 1:22 → 1:17; no run-ending hazard before ~45 s |
| casual | ~3–4 min median, reaches tier 3–4 | 2:32 at tier 5 → 3:33 at tier 4 |
| expert | keeps climbing, but tier 8+ is genuinely hard | 5:27, tier 9 → 8:14, tier 8 (max 12; 2% still going at 15 min) |
| everyone | deaths spread out, no cause over ~40% | worst share: novice low overpass 38%, expert Patrol 37% |
| economy | one meaningful purchase per 2–3 casual runs | ≈0.5 → 2.8 runs per purchase across the whole power-up ladder (old ladder at old prices → new ladder at new prices) |

## What changed

Every change is a constant, apart from the Endless cash rate (one helper) and the per-kind
warning time (one read in `src/hazard-run.js`):

- **Longer tiers** (`src/endless.js`): `firstTier` 2,600 → 4,800 and `growth` 450 → 1,000.
  Before, a casual player went through a tier every ~30 s, so tier 5 came at 2½ minutes. Now a
  tier lasts about 50 s at the start and gets longer each time; tier 4 starts at about 2:45 and
  tier 8 at about 7 minutes. Difficulty still ramps by tier (`ramp` 7), so it ramps more slowly
  per minute.
- **Hazards unlock one or two kinds per tier** (`src/hazards.js` `from`):
  - tier 2: low overpass (two ways out: duck or take the green lane);
  - tier 3: broken bridge and wrong-way driver;
  - tier 4: crumbling road and train crossing;
  - tier 5: missing guardrail.

  Before, three kinds arrived in the first 90 s and all six by tier 4.
- **Fewer hazards early:** `gapSecs` 9 → 12 s of road between hazards at difficulty 0. Deep
  runs keep the 4.6 s gap.
- **Fairer telegraphs:**
  - Lane-switch hazards warn earlier: the wrong-way driver at 2.1 s (it picks your lane then,
    so the call-out now matches the lock) and the crumbling road at 2.2 s. At tier-8 speeds a
    two-lane move needed more than the old 1.6 s.
  - The bridge gap is shorter (600 → 480), so the "jump now" window is wider.
  - The train clears sooner after you would have arrived (0.75 → 0.6 s).
- **HP and fuel matter at depth:**
  - A level-up heals 8% instead of 15% of max HP.
  - Fuel drains up to 2× at full difficulty (was 1.6×), so cores matter on long runs. Fuel
    deaths now show up for good and expert bots (2%).
- **More power-ups early:** `POWER_SPAWN.chance` 0.55 → 0.7 (`src/pickups.js`), because the
  longer tiers spread the per-tier increase out. Shield uptime for casual players went from 13%
  to 17%.
- **Endless pays 35% of campaign cash:** `ENDLESS.cash`, through `endlessCash()`. It applies to
  coins, plutonium, warps, takedowns, the podium bonus and the run's missions (rounded to 5).
  The remainder carries in whole thousandths, so small coins still add up exactly. Before, a
  casual Endless player earned about 900 coins a minute and could buy a car every run. Points
  are unchanged (the server never sees cash).
- **Power-up levels cost more** (`src/powerups.js` `UPGRADE.cost`): 250/500/900/1,400/2,000 →
  600/1,000/1,600/2,400/3,400. The whole ladder (3 power-ups × 5 levels) goes from ⚡15,150 to
  ⚡27,000.
- **Medal targets re-measured** (`src/progress.js`), after the combo fix (#102) and the handling
  work:
  - Every bot now wins a campaign race in 50–60 s and scores within a few percent of the others
    (level 1 median 1.45M), so the old bronze (300k) and silver (900k) were free.
  - New targets: bronze ≈ 60% of the bots' typical run, silver ≈ the typical run (about half
    the bots' runs get it), gold ≈ a quarter past their best.

Not changed:
- **The rigid-body world from #109:** its tyre grip (`RIGID.GRIP` 2,600), the ~50 mph stun
  threshold (`stunFrom` 2,200) and traffic's ease-back after a shunt (`driveAccel` 900). The
  harness swept each one (grip 2,000 and 3,200; stun 1,600 and 2,800; ease-back 450 and 1,800;
  casual and good bots, 60 runs each). Every variant stayed within the run-to-run noise: median
  survival 3:35–4:20 for casual and 6:08–6:45 for good, 0.7–0.8 hits/min, and 3–9% of crashes
  coming within 2.5 s of the last one. Only the slowest ease-back (450) was a little worse,
  with the Patrol taking 33–35% of runs, because shunted cars stay in your way. #109's guesses
  stand.
- **Score multipliers:** points per second are the same before and after, about 22k–32k, well
  under the server's 150k/s ceiling.
- **Rival and traffic aggression:** a casual player takes about one hit a minute. In Endless,
  crashes now end runs through the Patrol (two slips and you're caught), not through HP.
- **NOS heat and checkpoints:** neither caught a bot that eases off and keeps moving, which is
  what they're for.

## Results

*before* = main after #108 (Endless hazards), before #109; *after* = this change on top of #109 (rigid world).

#### before

| bot | runs | 1st run p10 / median | survival p10 / p50 / p90 | still going at cap | tier median (max) | pts/s | coins/min | coins/run | continues/run | purchases/run | hits/min | repeat hits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 60 | 1:22 / 1:44 | 1:14 / 1:45 / 2:36 | 0% | 4 (6) | 22,067 | 769 | 1,448 | 0.55 | 0.00 | 1.3 | 0% |
| casual | 60 | 2:02 / 3:44 | 1:32 / 2:32 / 4:31 | 0% | 5 (11) | 24,759 | 896 | 2,605 | 1.00 | 2.23 | 1.0 | 0% |
| good | 60 | 2:53 / 4:01 | 2:28 / 4:41 / 8:16 | 0% | 8 (16) | 30,182 | 1,117 | 5,728 | 1.00 | 2.50 | 0.6 | 0% |
| expert | 60 | 3:31 / 5:19 | 3:31 / 5:27 / 13:31 | 3% | 9 (17) | 31,868 | 1,208 | 8,183 | 1.00 | 2.50 | 0.5 | 0% |

| bot | how runs ended | power-up uptime (magnet / shield / 2×) |
|---|---|---|
| novice | bridge 28% · patrol 18% · train 17% · collapse 12% · wrongway 12% · beam 10% · lightning 2% · storm 2% | 11% / 16% / 13% |
| casual | patrol 33% · train 18% · collapse 18% · bridge 12% · wrongway 10% · beam 8% | 16% / 19% / 26% |
| good | patrol 23% · train 23% · wrongway 18% · bridge 17% · beam 10% · collapse 7% · storm 2% | 23% / 29% / 31% |
| expert | patrol 23% · train 20% · collapse 17% · wrongway 13% · bridge 12% · beam 8% · still going (cap) 3% · storm 2% · lightning 2% | 26% / 33% / 33% |

| bot | net coins/run (median, after continues) | runs to buy every power-up level (⚡ 27,000) | runs per purchase over that ladder |
|---|---|---|---|
| novice | 1,238 | 21.8 | 1.5 |
| casual | 1,872 | 14.4 | 1.0 |
| good | 4,529 | 6.0 | 0.4 |
| expert | 5,604 | 4.8 | 0.3 |

#### after

| bot | runs | 1st run p10 / median | survival p10 / p50 / p90 | still going at cap | tier median (max) | pts/s | coins/min | coins/run | continues/run | purchases/run | hits/min | repeat hits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 60 | 1:17 / 1:55 | 1:16 / 2:02 / 3:03 | 0% | 3 (5) | 22,772 | 258 | 546 | 0.38 | 0.00 | 1.2 | 3% |
| casual | 60 | 1:36 / 3:17 | 2:03 / 3:33 / 5:15 | 0% | 4 (8) | 25,580 | 268 | 973 | 1.00 | 0.80 | 0.8 | 4% |
| good | 60 | 2:55 / 4:43 | 2:55 / 6:09 / 11:37 | 0% | 7 (10) | 30,518 | 317 | 2,034 | 1.00 | 1.40 | 0.6 | 5% |
| expert | 60 | 2:02 / 4:39 | 4:29 / 8:14 / 13:58 | 2% | 8 (12) | 32,028 | 346 | 2,911 | 1.00 | 1.77 | 0.5 | 4% |

| bot | how runs ended | power-up uptime (magnet / shield / 2×) |
|---|---|---|
| novice | beam 38% · patrol 27% · bridge 23% · wrongway 5% · storm 3% · collapse 2% · train 2% | 12% / 10% / 11% |
| casual | patrol 25% · bridge 20% · collapse 20% · wrongway 17% · train 12% · beam 5% · storm 2% | 10% / 17% / 16% |
| good | patrol 22% · collapse 22% · train 22% · bridge 15% · wrongway 8% · beam 5% · storm 3% · fuel 2% · edge 2% | 16% / 28% / 20% |
| expert | patrol 37% · train 15% · wrongway 15% · beam 13% · collapse 10% · bridge 5% · fuel 3% · still going (cap) 2% | 20% / 31% / 22% |

| bot | net coins/run (median, after continues) | runs to buy every power-up level (⚡ 27,000) | runs per purchase over that ladder |
|---|---|---|---|
| novice | 439 | 61.5 | 4.1 |
| casual | 638 | 42.3 | 2.8 |
| good | 1,442 | 18.7 | 1.2 |
| expert | 2,400 | 11.3 | 0.8 |

#### before: campaign races (10 per bot per level)

| level | median score | best | novice / casual / good / expert (median) | medals (bronze/silver/gold/none, current targets) |
|---|---|---|---|---|
| 1 LVL1_CLOCK_HOLLOW | 1.46M | 1.55M | 1.50M / 1.46M / 1.45M / 1.43M | 18/21/0/1 (targets 0.85/1.45/1.90M) |
| 2 LVL2_RED_ROCK | 1.71M | 1.82M | 1.66M / 1.73M / 1.72M / 1.71M | 16/22/0/2 (targets 1.00/1.70/2.20M) |
| 3 LVL3_TOKYO_2015 | 1.73M | 1.79M | 1.74M / 1.71M / 1.74M / 1.75M | 17/20/0/3 (targets 1.05/1.72/2.25M) |
| 4 LVL4_MULHOLLAND_2088 | 1.72M | 1.86M | 1.68M / 1.72M / 1.73M / 1.74M | 17/19/0/4 (targets 1.10/1.72/2.30M) |
| 5 LVL5_INFINITE_HW | 1.76M | 1.86M | 1.65M / 1.80M / 1.76M / 1.76M | 18/19/0/3 (targets 1.15/1.76/2.35M) |
| 6 LVL6_LOW_ORBIT | 2.03M | 2.12M | 1.95M / 2.03M / 2.05M / 2.06M | 17/22/0/1 (targets 1.20/2.03/2.65M) |

#### after: campaign races (10 per bot per level)

| level | median score | best | novice / casual / good / expert (median) | medals (bronze/silver/gold/none, current targets) |
|---|---|---|---|---|
| 1 LVL1_CLOCK_HOLLOW | 1.45M | 1.53M | 1.50M / 1.45M / 1.47M / 1.45M | 17/22/0/1 (targets 0.85/1.45/1.90M) |
| 2 LVL2_RED_ROCK | 1.71M | 1.82M | 1.74M / 1.71M / 1.71M / 1.71M | 13/25/0/2 (targets 1.00/1.70/2.20M) |
| 3 LVL3_TOKYO_2015 | 1.74M | 1.79M | 1.74M / 1.72M / 1.74M / 1.74M | 13/25/0/2 (targets 1.05/1.72/2.25M) |
| 4 LVL4_MULHOLLAND_2088 | 1.71M | 1.85M | 1.68M / 1.71M / 1.74M / 1.71M | 23/13/0/4 (targets 1.10/1.72/2.30M) |
| 5 LVL5_INFINITE_HW | 1.78M | 1.89M | 1.66M / 1.80M / 1.80M / 1.79M | 13/26/0/1 (targets 1.15/1.76/2.35M) |
| 6 LVL6_LOW_ORBIT | 2.04M | 2.12M | 1.94M / 2.07M / 2.07M / 2.05M | 15/22/0/3 (targets 1.20/2.03/2.65M) |

#### before → after

| bot | median survival | 1st run median | tier median | pts/s | coins/min | net coins/run |
|---|---|---|---|---|---|---|
| novice | 1:45 → 2:02 | 1:44 → 1:55 | 4 → 3 | 22,067 → 22,772 | 769 → 258 | 1,238 → 439 |
| casual | 2:32 → 3:33 | 3:44 → 3:17 | 5 → 4 | 24,759 → 25,580 | 896 → 268 | 1,872 → 638 |
| good | 4:41 → 6:09 | 4:01 → 4:43 | 8 → 7 | 30,182 → 30,518 | 1,117 → 317 | 4,529 → 1,442 |
| expert | 5:27 → 8:14 | 5:19 → 4:39 | 9 → 8 | 31,868 → 32,028 | 1,208 → 346 | 5,604 → 2,400 |

The "runs to buy every power-up level" rows in the *before* table use today's ladder
(⚡27,000). Against the old ⚡15,150 ladder a casual player needed about 8 runs for all of it.

## Caveats

- **Bots aren't kids.** The skill table is a model, and the numbers mean "for a player who
  behaves like this". When real-device playtests disagree, change `SKILLS` in
  `tests/balance/bot.js` to match the players and re-measure before moving the game's constants.
- **Bots don't use campaign tricks** (takedowns, drift chains, stunts), so a human who does can
  pass the gold targets that the bots never reach.
- **Novices meet one new hazard at a time,** so the first kind they meet tends to dominate their
  deaths. The low overpass is a third of them, because it's the only kind at tier 2.
- **Endless now pays about a third of what a campaign race pays per minute.** Campaign levels
  pay their designed bonuses (`bonusReward`, shown on the level cards), so a player could farm
  campaign races for coins. If that shows up in playtests, the next step is one shared cash
  rate.
- **Hazards can stack:** a safe lane sometimes has a barrel or traffic in it. That costs 15 HP,
  not the run.
