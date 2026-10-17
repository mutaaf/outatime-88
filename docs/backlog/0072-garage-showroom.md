---
id: 0072
title: The garage becomes a showroom with a turntable, specs and an unlock reveal
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-17
pr: 32
---

## Why
The garage was a list of upgrade buttons and two rows of colour names, and the car picker
was a cramped grid. With cars to earn (0071) there has to be a place to admire them, see
what each one is good at, know exactly how to unlock the next one, and celebrate the moment
you get it.

## What
`src/garage-ui.js` + `src/car-art.js` + `src/garage.css` (lazy chunk, loaded the first time
the garage opens or a car unlocks):
- Turntable stage: each car's own low-poly body shape on a neon platform with a scrolling
  synthwave floor, slowly spinning; drag to turn it, swipe or ‹ › / ← → to change car, a
  thumbnail strip with locks. Locked cars show as a dark silhouette with a lock.
- Spec bars (top speed, acceleration, handling, flux, durability) with upgrade gains in
  yellow and ▲/▼ against the car you drive now.
- How to unlock + a progress bar; one primary button: DRIVE THIS CAR / ✓ YOUR RIDE /
  BUY FOR ⚡ N / 🔒 LOCKED.
- Paint per car (factory + 5 liveries, drawn in 2D and 3D) and underglow swatches.
- Performance shop with tier pips (upgrades apply to every car).
- Full-screen NEW CAR UNLOCKED reveal (rays, pop-in, turntable, specs, DRIVE IT NOW) after a
  results screen that earned a car, after a purchase, or the next time the garage opens.

## Acceptance criteria
- [x] Buy → reveal → drive → paint, all persisted across reload; reveals play once
- [x] Locked cars explain themselves and can't be driven or painted
- [x] No overlaps or sideways scroll at 8 phone/tablet/desktop sizes, both orientations
- [x] Main bundle unchanged at boot (garage is a 6 kB + 2 kB CSS lazy chunk)
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/e2e/garage.spec.js`: purchase/reveal/paint persistence, locked car, upgrade raises
the bars, race unlock plays the reveal over results, and a fit test (no overlaps, no
sideways scroll, 44 px targets, swipe changes car) at 8 viewports.

## Out of scope
A 3D (three.js) turntable: the 3D chunk's preview draws one generic body for every car, so
the per-shape 2D turntable is used in both modes for now.
