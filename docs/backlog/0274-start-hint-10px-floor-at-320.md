---
id: 0274
title: The start-lights hint holds 10px at 320 px wide (it shrinks to 8.6px today)
status: ready        # proposed | ready | in-progress | shipped | dropped
priority: P1         # P0 (broken/urgent) | P1 (next) | P2 (later)
size: S              # S (<1h) | M (one sitting) | L (split it if it touches >3 systems)
lens: accessibility  # player-feel | content | authenticity | performance | accessibility | tech-health
created: 2026-11-14
pr:
---

## Why
Scout run 2026-11-14: at 320x568 (iPhone SE) the grid card's keyboard/pad line
"PRESS SPACE RIGHT ON GREEN FOR A ROCKET START" measured 8.64px, below the 10px small-print
floor that tickets 0262, 0263, 0267 and 0268 set for every other screen. `src/styles.css`
(portrait phone block, `.rc-lights .rc-hint`) sets `font-size: min(10px, 2.7vw)`, and 2.7vw is
8.64px at 320. The cause is the "stay on one line" rule shrinking the type. The long keyboard
and pad strings (`src/racecall.js` `START_HINTS.keys` / `.pad`) are the ones that hit it; the
touch string is short enough to stay at 10px. A kid on a small phone with a paired keyboard or
pad reads the rocket-start tip at the start of every race.

## What
In `src/styles.css`, replace `min(10px, 2.7vw)` with a flat `10px` and let the line wrap
(`text-wrap: balance` is already set), then confirm the card still clears the HUD and the
steer hint at 320x568. If the extra line pushes the card into the HUD, shorten the copy for
the 'keys' and 'pad' variants in `src/racecall.js` instead (for example "SPACE ON GREEN =
ROCKET START"), never the font. CSS and copy only; no logic.

## Acceptance criteria
- [ ] At 320x568, 360x640 and 390x844 with `InputState.lastInput` set to keys, pad, phone and
      touch in turn, the computed font-size of `.rc-hint` is >= 10px during the 3-2-1 and GO.
- [ ] The grid card's bottom stays above the left pad cluster and its top below the HUD plates
      at every one of those sizes (existing `touch-layouts.spec.js` and `hud.spec.js` pass).
- [ ] Every text range in the card is inside the card box (lesson 2026-11-13: use
      `Range.getClientRects`, not `scrollWidth`).
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse unchanged.

## Test plan
Extend the start-card layout test in `tests/e2e/` (the one that already measures `.rc-lights`)
with a loop over the three phone sizes and four hint kinds asserting `fontSize >= 10` and no
overlap with HUD/pads. Run hud.spec, hud-size.spec, landscape-tips.spec and touch-layouts.spec
before pushing (lesson 2026-11-12: a type change moves tight layouts).

## Out of scope
The landscape phone card (already 10px), copy rewrites for the touch variant, the garage hints.
