---
id: 0217
title: The warp landing gets a short music sting, so the jump into a new era is heard as well as seen
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-28
pr:
---

## Why
The warp opens every music layer (`layersFor` in `src/music.js`) but the arrival in a new era is
just the next bar of the old groove. Tension then release is pillar 2, and the release has no
sound of its own. Arcade racers punctuate level changes with a one-bar fanfare; a single sting
keeps it cheap and procedural.

## What
A one-bar sting scheduled on the audio clock in `createScheduler`, played when the era id changes
after a warp: a rising arp resolving on the new era's tonic (from `ERA_SCORES`), ducked under the
existing compressor so it never clips. Muted means silent. Reduced motion does not affect it
(it is sound). Fires at most once per warp.

## Acceptance criteria
- [x] Unit: the sting notes come from the arriving era's scale and tonic for every era in `ERA_SCORES`
- [x] Unit: exactly one sting per era change, none on a warp that does not change era or on race start
- [x] Muted or sound-off: no oscillator is started
- [x] No per-frame allocation added; perf probe unchanged

## Test plan
`tests/unit/music.test.js` with `fake-audio.js` (count started sources before and after an era change).

## Out of scope
Cutscenes, voice calls, changing the existing score layers.
