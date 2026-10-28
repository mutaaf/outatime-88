---
id: 0219
title: An optional guide tone pans toward the nearest open lane, so a player who cannot see the road can steer
status: shipped
priority: P2
size: M
lens: accessibility
created: 2026-10-28
pr: 186
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
- [x] Unit: the chooser returns pan -1/0/+1 for the nearest open lane and null when the current lane is clear
- [x] Unit: with every lane blocked it returns null (no misleading tone)
- [x] Off by default; muted or toggled off starts no source
- [x] Setting persists in the save and is listed in the controls reference
- [x] No frame-time regression (perf probe)

## Notes (build)
- Pan is relative to the car (like the 0191 tick): -1/+1 = the open lane is to your left/right,
  0 = you are straddling just off an open lane's middle. Two open lanes equally near: the one away
  from the threat. Pitch 330 → 880 Hz as your own spot closes from 1.2 s to contact.
- "Listed in the controls reference": the pause/garage controls card shows a LANE GUIDE ON line
  while it is on.
- No default in `src/settings.js`: main is at 58.99/59 kB gz, so `settings.laneGuide` is off unless
  `true` (the save keeps unknown keys). Code lives in `src/lane-guide.js`, race-step chunk only.
- Perf: the per-step work is 4 obstacle sweeps (your spot + 3 lanes) over the same small lists the
  0191 tick reads, only when the setting is on; no allocations.

## Test plan
`tests/unit/audio.test.js` with `fake-audio.js`; extend the 0191 obstacle fixtures.

## Out of scope
Narrated race commentary, haptic equivalents, changing the proximity tick.
