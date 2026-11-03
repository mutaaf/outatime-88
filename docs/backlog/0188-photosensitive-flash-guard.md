---
id: 0188
title: A flash guard — an e2e proves no effect strobes more than 3 times a second
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-10-19
pr: 161
---

## Why
Invariant 8 covers calm motion, but nothing guards the default (full-motion) mode against a
future effect that strobes: warp flash, hit-stop, damage tint, ability tints, lightning and
the Patrol lights can stack in one second of a busy race. WCAG 2.3.1 (Level A) allows at
most three flashes in any one second unless they are below the general/red flash thresholds
or small: https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold
Players are kids; a photosensitive child must never be the test.

## What
A test-only probe (`?debug` hook or a helper in `tests/e2e/helpers.js`) that samples the
opacity of the full-screen overlays (`#warpFlash`, `#abilityTintOverlay`, damage tint, the
lightning flash) every animation frame and counts big rises per rolling second. Run it
through a scripted stress race (warp + crash + ability + storm lightning). No game code
changes unless the probe finds a violation; if so cap/space that effect (min gap 334 ms).

## Acceptance criteria
- [x] Stress race at full motion: no overlay with opacity ≥ 0.1 rises more than 3 times in any 1 s window
- [x] The same run under `reducedMotion: 'reduce'` shows none ≥ 0.1
- [x] Any effect that failed is spaced in code and named in the PR body
- [x] No new per-frame DOM writes in the game (the probe lives in the test)

## Test plan
`tests/e2e/flash-guard.spec.js`, waiting on the game (`racing`, `simWait`, `nextFrames`),
not the clock.

## Out of scope
Luminance maths per WCAG's relative-luminance formula; the 3D post-processing bloom.

## Shipped notes
The probe (`tests/e2e/helpers.js` installFlashProbe / flashRises) samples `#warpFlash` and
`#abilityTintOverlay` (computed opacity × background alpha) and every translucent light wash
drawn across a 2D canvas from its corner, once per frame. Under calm motion it found two layers
at or over 0.1: the Endless storm-bolt wash (0.28, `src/hazard-art.js`, now ×0.2 → ≤ 0.07) and
the ZONE/AGRO tint (exactly 0.1, `src/race-step.js`, now at half strength). At full motion no
effect broke the 3-a-second line, so none needed spacing.
