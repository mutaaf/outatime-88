---
id: 0151
title: Endless runner loop — Time Storm pursuer, run goals with a permanent multiplier, one coins-only continue
status: in-progress
priority: P1
size: M
lens: player-feel
created: 2026-10-18
---

## Why
The user: "for infinite highway mode we should look at Temple Run and Ryan's World runner kind
of games". Those games run on one loop: something chasing you, short runs early, a best to beat,
goals that make every run count, one second chance, instant retry. 0150 made Endless the
default; this adds that loop on top.

## What shipped
- **Time Storm** (src/runner.js, pure): an original, kid-friendly pursuer, a crackling storm
  front behind you. Its gap (distance units) shrinks when you're slower than it (50 mph + 38 at
  full difficulty), grind a wall (150/s) or crash (−240), and grows back to 900 when you drive
  clean. Inside 330 a purple glow builds at the bottom of the screen with a ⛈️ distance chip;
  caught = run over (alongside HP 0). Endless solo runs only.
- **One continue per run, coins only** (no money, no ads): HP 0 or caught offers CONTINUE for
  150 + 60/tier FLUX cash with a 6 s countdown (Enter = yes, Esc = no). It restores 60% HP,
  3 s shield and pushes the storm back. Second time, the run ends.
- **Run goals** (src/runner-goals.js, lazy with src/runner-ui.js): three at a time — coins,
  drift seconds, loops cleared, metres without a wall, tier, near misses, NOS seconds — each
  "in one run". Finish all three and your Endless level rises: ×0.1 distance points forever
  (max ×2, well inside the server's rate check) and a new, slightly harder set. Shown on the
  title (one line), the pause panel and the results.
- **A best to beat**: a cyan YOUR BEST gate on the road at your best distance (2D and 3D) and a
  NEW BEST call-out when you pass it.
- **Instant retry**: RETRY after an Endless run skips the lineup and lights (driving in < 2 s).

## Acceptance criteria
- The storm closes on crashes / walls / slow driving, falls back on clean driving, warns, and catching you ends (or offers to continue) the run.
- Exactly one continue per run, only if you can pay in earned cash; it never costs real money.
- Goals complete from run stats, persist, and all three raise a permanent multiplier.
- The YOUR BEST gate appears at your best distance; RETRY drives again in under 2 s.

## Test plan
- Unit: `tests/unit/runner.test.js` (storm dynamics, goal dealing/rotation/level-up/repair, multiplier cap, continue cost and once-only).
- E2E: `tests/e2e/endless-runner.spec.js` (storm → continue → caught again → results; no cash = no continue; goals → level and multiplier, pause list; YOUR BEST gate; RETRY < 2 s).
