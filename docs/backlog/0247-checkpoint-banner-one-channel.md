---
id: 0247
title: Checkpoint banner and its reward line read as one announcement, not two stacked boxes
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-04
pr: 229
---

## Why
At 390x844 mid-race (about 14 s in, 102 mph) "CHECKPOINT! 4TH PLACE" and a second, separately
boxed "+1200 STREET REP!" pill appear stacked right below the HUD strip, in the part of the
road the player reads for traffic. Two bordered boxes with different widths are two channels
(pillar 3, one announcement at a time). Reference:
[Game Accessibility Guidelines on readable text](https://gameaccessibilityguidelines.com/ensure-that-all-text-is-readable-and-clear/).

## What
In the checkpoint announce path (`src/race-step.js` near the `STREET REP` string, ~line 1281,
and the announce styles in `src/styles.css`) render the reward as the banner's own second line
(smaller, same box) instead of a separate pill. Keep wording and timings.

## Acceptance criteria
- [x] One bordered element holds both lines at 390x844 and 1280x720
- [x] Total height used below the HUD strip is no larger than today's two boxes
- [x] A later announcement still pre-empts it (existing announce e2e stays green)
- [x] Reduced motion behaviour unchanged

## Test plan
Extend the announce e2e (or a new small spec) to trigger a checkpoint and assert a single
announce box contains both strings.

## Out of scope
Changing reward amounts or checkpoint spacing.
