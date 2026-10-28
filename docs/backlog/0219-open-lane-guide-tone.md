---
id: 0219
title: An optional guide tone pans toward the nearest open lane, so a player who cannot see the road can steer
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-10-28
pr:
---

## Why
0191 warns of an incoming hit but never says where to go. Forza Motorsport ships steering audio
cues built with blind and low-vision testers: engine and tyre sound pan toward the line to take
(https://www.engadget.com/forza-motorsport-will-feature-audio-cues-to-help-players-with-visual-impairments-drive-180043633.html),
and the Racing Auditory Display research found blind players matched sighted ones with a
turn indicator plus a speed sound (https://gamesbeat.com/racing-auditory-display-helps-blind-people-play-racing-games-as-well-as-the-sighted/).
It also helps on a glary phone screen.

## What
A Settings toggle "Lane guide" (default off) in the audio module: a soft sine on the SFX bus, stereo-panned toward the nearest lane with no obstacle in the next ~1.2 s, pitch rising as
the gap closes, silent when the current lane is already clear. Gives information and leaves the
decision to the player. Reuse the 0191 obstacle query; no new per-frame allocation.

## Acceptance criteria
- [ ] Unit: the chooser returns pan -1/0/+1 for the nearest open lane and null when the current lane is clear
- [ ] Unit: with every lane blocked it returns null (no misleading tone)
- [ ] Off by default; muted or toggled off starts no source
- [ ] Setting persists in the save and is listed in the controls reference
- [ ] No frame-time regression (perf probe)

## Test plan
`tests/unit/audio.test.js` with `fake-audio.js`; extend the 0191 obstacle fixtures.

## Out of scope
Narrated race commentary, haptic equivalents, changing the proximity tick.
