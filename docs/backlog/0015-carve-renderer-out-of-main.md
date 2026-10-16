---
id: 0015
title: Carve renderScene and drawPlayerCar out of main.js into src/render/
status: ready
priority: P2
size: L
lens: tech-health
created: 2026-10-16
pr:
---

## Why
Pillar 7. `renderScene` is ~800 lines inside a ~3.9k-line `main.js`; every visual ticket
(juice, eras, ghost) edits it and collides. Splitting it unblocks parallel visual work.

## What
Move sky/backdrop, road, sprites/props, player car, and FX drawing into `src/render/*.js`
with explicit imports. No behavior change; ESLint no-undef proves nothing dangles.

## Acceptance criteria
- [ ] `src/main.js` shrinks by ≥ 900 lines; no file in `src/render/` exceeds 500 lines
- [ ] Before/after screenshots at 1280x720 of a fixed seed frame are pixel-similar (≥ 99% matching sampled pixels)
- [ ] `npm run check` green; no frame-time regression

## Test plan
e2e screenshot comparison with a deterministic debug seed; existing suites unchanged.

## Out of scope
Any visual change.
