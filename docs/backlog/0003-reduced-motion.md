---
id: 0003
title: Honor prefers-reduced-motion for flashes, shakes and CRT effects
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-10-16
pr: 5
---

## Why
The game uses full-screen flashes (`#warpFlash`, `#abilityTintOverlay`), scanlines and fast
camera motion, and nothing checks `prefers-reduced-motion` (zero matches in the codebase).
That is an AGENTS.md invariant (accessibility floor) and a real comfort issue for
motion-sensitive players. See https://developer.mozilla.org/docs/Web/CSS/@media/prefers-reduced-motion
and WCAG 2.3.3 (Animation from Interactions).

## What
Read `matchMedia('(prefers-reduced-motion: reduce)')` once at boot (and on change) into a flag
in `GameState`. When set: cap warp/ability flash opacity to ≤0.25 with no strobing, disable
camera shake/roll exaggeration, and soften the CRT overlay. Gameplay is unchanged.

## Acceptance criteria
- [ ] e2e test with `page.emulateMedia({ reducedMotion: 'reduce' })`: after a time warp, `#warpFlash` computed opacity never exceeds 0.25 (sample over 1s)
- [ ] Without reduced motion, behaviour is identical to today
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/e2e/a11y.spec.js` emulates reduced motion, forces a warp (hold ArrowUp + Space), and
samples `getComputedStyle(#warpFlash).opacity` every animation frame.

## Out of scope
A full in-game settings menu (separate ticket if wanted).
