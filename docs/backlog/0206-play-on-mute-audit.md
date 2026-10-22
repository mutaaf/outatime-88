---
id: 0206
title: Play-on-mute audit — every sound that carries information has a visual twin
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-10-22
pr:
---

## Why
The Game Accessibility Guidelines list "don't rely on sound alone to convey essential
information" as a basic hearing item, and suggest testing by playing a game on mute to see
what is lost (https://gameaccessibilityguidelines.com/basic/,
https://igda-gasig.org/get-ready/sig-guidelines/). The game's audio has grown a lot
(tuner layer, slipstream charge, proximity ideas) and each of those cues was added by a
different ticket; nobody has checked the whole set against a muted player.

## What
Write a short audit table in `docs/ACCESSIBILITY.md` (create if absent) listing every
`SoundEngine` cue that signals game state (boost ready, warp ready, slipstream charge,
near-miss, hazard hit, fuel low, pickup, rocket-start window, lap/checkpoint, rival
overtake). For each, name its visual counterpart. Fix gaps that are small (a HUD pulse,
icon flash, or `announcer.js` line) in `src/hud.js`/`announcer.js`; list the larger gaps as
follow-up tickets in the table rather than fixing them here. Do not duplicate 0112 (WARP
READY shape) or 0191 (proximity tick).

## Acceptance criteria
- [ ] The audit table covers every state-signalling cue in `src/audio.js` with a named visual twin or a linked ticket.
- [ ] Any gap fixed in this PR shows its visual at 390x844 and 1280x720 without overlapping other HUD (zero-overlap sweep passes).
- [ ] Respects reduced motion and the flash guard rules (no new flashing above 3 Hz).
- [ ] No frame-time regression.

## Test plan
E2E with audio muted: trigger each fixed cue through the debug hooks and assert its visual
element appears. Unit test that lists cue names in `audio.js` and fails if one is missing
from the audit table's machine-readable list.

## Out of scope
Captions for the music, a full subtitle system, vibration changes.
