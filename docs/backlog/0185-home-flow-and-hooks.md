---
id: 0185
title: Every run comes home; the home screen says why to play
status: in-progress
priority: P1
size: M
lens: player-feel
created: 2026-10-19
pr:
---

## Why
The operator asked: "we need to go back to the main screen after games and races, we also need
to ensure that main screen is showing why someone wants to play". The results card had RETRY,
GARAGE, LEVELS and RANKS but no way home. Escape opened the garage, and Back on a desktop left
the site. The title showed three small lines of text and gave no personal reason to come back
(your best, today's daily, the next car, a rival). Endless-runner games (Subway Surfers, Temple
Run) put a run-again button and today's hooks one tap away.

## What
- **Results:** PLAY AGAIN is the primary action, with 🏠 HOME and 🏆 RANKS beside it.
  - HOME drains a thin bar and goes home by itself after 20 s untouched. Reading the board,
    sharing, or half-typed initials hold it.
  - Escape or Backspace go home, Enter plays again, and on a gamepad A plays and B goes home.
- **Pause:** the garage and the settings panel get 🏠 QUIT TO HOME (solo races only).
- **Live races:** the results get a 🏠 HOME button.
- **Browser history:** a race is one history entry. Back from the results goes home, Back
  mid-race pauses, and deep links never re-launch a race.
- **Home screen hooks:** up to 4 ranked, true, personal cards (`src/home-hooks.js`):
  - your Endless best and the next tier;
  - today's daily with a real UTC countdown and your streak;
  - the next car (or BUY IT NOW);
  - Endless goals;
  - your weekly rival;
  - what's new (a few views, then retired);
  - PLAY ON A TV on big screens.
  Each card is one tap to its action.
- **First visit:** a three-beat pitch instead of the cards. The attract road gets an AI driver
  that weaves across the lanes.
- **Lazy chunk:** `src/home.js` + `src/home.css`. `main.js` only gains `showTitle()` (one way
  home, shared with live rooms) and the loader.

## Acceptance criteria
- [x] Every end state (solo, daily, deep-linked, Endless, live, TV, pause) reaches the home screen in one tap or by itself.
- [x] Back never leaves the game mid-race and never re-launches a race.
- [x] Returning players see personal hooks; a first visit sees the pitch.
- [x] Hooks and the pitch fit, with no overlaps, on 12 phone/tablet/desktop shapes.
- [x] Startup JS stays under the 58 kB budget (+0.34 kB); the title is ready no later than before (4× CPU, slow network).

## Test plan
- `tests/unit/home-hooks.test.js`:
  - first-visit rule;
  - daily countdown and streak states;
  - best/next tier;
  - next car (buyable wins, real progress);
  - goals read-only;
  - ranking, news retirement and big-screen-only TV.
- `tests/e2e/home.spec.js`:
  - HOME, idle home and Escape/Enter;
  - Back from the results and mid-race;
  - a deep-linked daily coming home;
  - pause QUIT;
  - a gamepad (A/B);
  - hooks and tapping one;
  - the first-visit pitch with the demo driver;
  - a no-overlap fit sweep.
- `tests/e2e/budget.spec.js`: the home flow is a lazy chunk under 6 kB.

## Out of scope
- An AI attract driver that dodges traffic (it weaves on a smooth path).
- Friends-online presence (there is no presence API).
- A power-ups news card, which belongs with 0177.
