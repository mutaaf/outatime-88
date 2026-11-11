---
id: 0262
title: Garage car-strip names and spec deltas are at least 10px and keep 4.5:1 when locked
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-11
pr: 252
---

## Why
At 390x844 the garage strip names each car in 8px Orbitron (`.garage-thumb .thumb-name`,
src/garage.css:22) and locked thumbs are dimmed to opacity 0.6 (`.is-locked`, line 24), so the
slate-300 name on the dark card drops well under the 4.5:1 floor in AGENTS.md invariant 3.8.
The play-through screenshot shows "Brawler 440 Blower" and "Kestral GT-4R" as a smudge: the
thing a kid shops by is the hardest text to read. `.spec-delta` (line 35) is also 8px.
WCAG 1.4.3 contrast minimum: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## What
In src/garage.css raise `.thumb-name` and `.spec-delta` to 10px minimum, and make the locked
state dim the thumb art/frame only (padlock icon and name stay full opacity, colour #e2e8f0
or lighter). Let the name wrap to two lines inside the existing thumb width (no wider strip).

## Acceptance criteria
- [x] Computed font-size of every `.thumb-name` and `.spec-delta` is >= 10px at 390x844 and 1280x720
- [x] A locked thumb's name has contrast >= 4.5:1 against its rendered background
- [x] No thumb name is clipped or overflows its chip (scrollWidth <= clientWidth)
- [x] Strip is still one horizontally-scrolling row; 44px tap targets unchanged
- [x] No console errors; startup JS budget unchanged (CSS only)

## Test plan
Extend the garage e2e (tests/e2e, find with `grep -l garage`) to open `?garage` at 390x844,
read computed font-size, opacity chain and colours of the locked thumb names, assert the above.

## Out of scope
Rating bars, the 3D preview, new car art.
