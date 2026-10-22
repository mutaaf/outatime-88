---
id: 0198
title: Pickups and hazards stay distinguishable under colour-vision simulation
status: in-progress
priority: P2
size: M
lens: accessibility
created: 2026-10-21
pr:
---

## Why
Invariant 8 covers contrast and motion but not colour-vision deficiency. Pickups (green cores, cyan flux), the green draft wake, hazards and the rival strip lean on hue. Accessibility guidance says no cue should depend on colour alone and recommends checking with a simulator and adding shape, icon or border where it does (https://gameaccessibilityguidelines.com/?p=3273 , https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103 , https://caniplaythat.com/?p=8897). Tickets 0112 and 0167 fix single HUD elements; nothing audits the road scene.

## What
Add a Playwright audit that captures a fixed-seed frame with a pickup, a hazard and a rival in view, applies protanopia/deuteranopia/tritanopia matrices (and greyscale) in the test, and asserts pickup and hazard sprites differ in luminance contrast or silhouette. Fix any pair that fails by adding a shape/outline channel in `src/pickup-art.js` or `src/hazard-art.js`. Touches `tests/e2e/` and the art modules only.

## Acceptance criteria
- [x] New e2e `colour-vision.spec.js` computes mean-luminance and edge-silhouette difference for each pickup vs hazard pair under 4 simulations
- [x] Every pair passes a documented threshold (>= 1.5:1 luminance ratio or a distinct outline), recorded in the PR body
- [x] Any failing pair is fixed by shape/outline, not by recolouring the era palettes
- [x] No frame-time regression; sprite caches unchanged in size beyond +5%

## Outcome
Measured on main, every pickup/hazard pair already cleared the thresholds by silhouette (oriented edge difference >= 0.78; the same sprite at another distance measures <= 0.33), but pickups shared no look: two pickups differed by up to 0.93, more than any pickup differed from a hazard, so "grab it" was carried by hue and glow. Every pickup now floats in a white ring on a dark keyline (src/pickup-art.js, same icon canvas size): pickups now differ from each other by <= 0.55 and from any hazard by >= 0.74 under all four simulations. The audit (tests/e2e/colour-vision.spec.js + cvd.js) asserts both. Endless road hazards (src/hazard-art.js: lanes, bridge gaps, signs) are road strips, not sprites, and are not in this audit.

## Test plan
The new e2e; `npm run check:fast`; before/after screenshots in the PR.

## Out of scope
A user-selectable colour filter setting; HUD strip markers (0167) and the warp-ready state (0112).
