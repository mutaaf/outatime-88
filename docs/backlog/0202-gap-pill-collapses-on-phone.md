---
id: 0202
title: The phone gap pill still collapses to an ellipsis (0190 regressed) and clips the nemesis mark
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-22
pr: 147
---

## Why
Scout play-through at 390x844 (held throttle, headless Chromium): sampling `#hudGapAhead`
every 2.5 s mid-race gave `"▲ +0.1s"` with `scrollWidth 45 / clientWidth 6`, and
`"▲ 😈+1.6s"` with `57 / 6`, so the pill renders as "▲ +0…" (screenshot showed exactly that).
With the nemesis mark on, even a normal width clips (57 vs 54). 0190 was marked shipped
with "no ellipsis" criteria, but the pill still collapses at some moments. The gap to the
car ahead is the number a racer reads most (pillar 3, Readability).

## What
Find why the pill's width collapses to ~6 px intermittently (flex shrink between the
timer and the speed card, or a width transition on text change) and give `.gap`/`.gap-ahead`
a `flex: none` / `min-width: max-content` so it never shrinks below its text; allow room for
the nemesis emoji. Touches `src/styles.css`, possibly `src/hud.js`, `index.html`.

## Acceptance criteria
- [x] Sampled every 250 ms for 15 s of a 390x844 race, `#hudGapAhead` always has `scrollWidth <= clientWidth`, including with the nemesis mark and values under 1 s
- [x] Also holds at 360x740 and 820x1180 portrait
- [x] No overlap with the position card, speed card or timer (zero-overlap spec green)
- [x] 1280x720 layout unchanged

## Test plan
Extend the phone HUD e2e from 0190: poll the pill during a real race (and force a nemesis
string), assert no clipping at any sample.

## Out of scope
Redesigning the HUD layout.
