---
id: 0195
title: HUD size setting (normal / large) for low-vision players
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-10-20
pr:
---

## Why
Racers such as Forza and F1 25 ship HUD text-size and element-hiding options as standard accessibility aids (https://caniplaythat.com/2023/04/27/forza-motorsport-sets-its-sights-on-blind-accessibility/, https://www.ea.com/able/resources/f1-25). Our phone HUD is deliberately compact (the speed readout and gap pill are small at 390x844), which is exactly what low-vision and younger players struggle with. A size toggle lets the compact layout stay the default.

## What
Settings → HUD SIZE: NORMAL | LARGE, saved in `SaveStore.data.settings` (default NORMAL, so old saves are unchanged). LARGE scales the speed, place and gap text ~1.3x via a CSS variable on `body`; layout slots (`src/layout.js`) re-measure so nothing overlaps. Touches `src/settings.js`, `src/settings-ui.js`, `src/styles.css`.

## Acceptance criteria
- [ ] Default is NORMAL; an old save loads without error and shows NORMAL
- [ ] LARGE grows the speed readout by >= 25% and keeps every HUD rect inside the viewport with zero overlaps at 390x844, 844x390 and 1280x720
- [ ] Choice persists across reload; keyboard path to the control exists
- [ ] Main JS budget held (the setting UI lives in the lazy settings chunk)

## Test plan
Unit test for settings normalise (default, bad value); e2e that sets LARGE and checks `hudRects()` for overlap and bounds at three viewports.

## Out of scope
Per-element hiding, colour-blind filters.
