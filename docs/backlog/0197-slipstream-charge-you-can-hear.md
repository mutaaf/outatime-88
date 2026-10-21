---
id: 0197
title: Slipstream charge you can see and hear building to the slingshot
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-21
pr: 138
---

## Why
Drafting is a core skill (the coach even teaches "draft the green wake"), but the only feedback while it builds is a small bar and a text label in the HUD; the payoff (`SLIPSTREAM TURBO SLINGSHOT`) arrives with no build-up. Racers that make drafting legible use staged feedback: a small cue on contact and a bigger one at full charge, and a short delay so the player reads it as a skill. See the SRB2Kart drafting add-on's design notes (https://mb.srb2.org/addons/kart-slipstream-drafting.2361) and Hotshot Racing players asking for a tighter, more legible draft zone (https://steamcommunity.com/app/609920/discussions/0/2952628643853821162/). At 100+ mph the eyes are on the road, not the corner bar.

## What
While `GameState.draftingCar` is set, tie a rising tone (audio clock, pitch from `draftCharge`) and speed-line intensity/tint to `draftCharge` (0-100) so the slingshot is anticipated; at >= 80% add a distinct "about to fire" pulse. Silent and still when not drafting. Touches `src/race-step.js` (read-only of `draftCharge`), `src/fx.js`/`src/smoke2d.js` speed lines, `src/audio.js` or `src/sfx/`. Reduced motion: keep the audio, drop the pulse (static tint only). No new per-frame allocations.

## Acceptance criteria
- [x] Unit test: the cue chooser maps `draftCharge` 0..100 to a monotonic tone pitch and a line intensity; returns "off" when not drafting
- [x] The tone starts only while drafting and stops within 200 ms of leaving the wake; muted = no oscillator started
- [x] Under `reducedMotion: 'reduce'` no pulse animation runs, static tint only
- [x] Zero-overlap HUD e2e still green at 390x844 and 1280x720; perf probe no worse than `docs/PERF.md`
- [x] Main JS budget held (cue lives in a lazy sfx/fx module)

## Test plan
Unit test for the mapping; e2e forces `draftingCar` and `draftCharge` and asserts the cue state; screenshot at charge 90.

## Out of scope
Retuning the draft strength or charge rate; leaderboard changes.
