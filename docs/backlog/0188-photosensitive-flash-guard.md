---
id: 0188
title: A flash guard — an e2e proves no effect strobes more than 3 times a second
status: proposed
priority: P2
size: S
lens: accessibility
created: 2026-10-19
pr:
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
- [ ] Stress race at full motion: no overlay with opacity ≥ 0.1 rises more than 3 times in any 1 s window
- [ ] The same run under `reducedMotion: 'reduce'` shows none ≥ 0.1
- [ ] Any effect that failed is spaced in code and named in the PR body
- [ ] No new per-frame DOM writes in the game (the probe lives in the test)

## Test plan
`tests/e2e/flash-guard.spec.js`, waiting on the game (`racing`, `simWait`, `nextFrames`),
not the clock.

## Out of scope
Luminance maths per WCAG's relative-luminance formula; the 3D post-processing bloom.
