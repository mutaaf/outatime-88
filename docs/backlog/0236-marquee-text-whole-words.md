---
id: 0236
title: Era cinema/shop marquees show whole words or fade out, never a mid-word clip
status: ready
priority: P2
size: S
lens: content
created: 2026-10-31
pr:
---

## Why
On a 390x844 phone the first seconds show a roadside marquee reading "ALIENS FROM PLUTO II
/ ATTACK OF THE 50 FT M" cut off mid-word at the screen edge. 0221 fixed this for sponsor
boards only; the in-world era props still clip. Looks like a bug on the phone's hero shot.

## What
Apply the same whole-or-faded rule 0221 introduced to in-world prop text (cinema and shop
signs in `src/scenes/` / `src/billboard-art.js`): measure, drop trailing words that don't
fit, or fade the sign out while any word would clip.

## Acceptance criteria
- [ ] A unit test over every era sign string at the narrowest sign width: output never ends mid-word
- [ ] No new per-frame allocation (precompute at scene build)
- [ ] Existing sign art tests still pass

## Test plan
tests/unit sign-text test iterating the sign strings from the scene data.

## Out of scope
Rewriting sign copy (see 0189 for the IP audit).
