---
id: 0304
title: The last 10 mph before a warp rise in pitch, so reaching 88 is a climb you hear
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-11-24
pr:
---

## Why
Pillar 2 says the warp is "tension → release". Today the tension is the READY cue (a tick and a
HUD label once flux is ≥ 92, src/warp-cue.js) and the release is the warp. Between them, the
last stretch of speed (78 → 88 mph with a full tank) has no sound of its own: the engine pitch
(src/audio.js `rpmFor`) just keeps climbing as it did at 60 mph. Racing-game audio writing
describes tuning the engine so it always seems to be accelerating, and using sound as the
channel that tells the player what the car is about to do:
https://www.unrealengine.com/developer-interviews/how-formula-fusion-nailed-the-feeling-of-fast
(and the speed-feel notes at https://critpoints.net/2016/11/24/feeling-of-speed/). A rising
"charging" tone tied to mph gives the player a number-free way to know how close 88 is, with
eyes on the road. A grep of `src/sfx/tuner.js` and `src/audio.js` for a warp-approach sound
finds only the grid riser in street-score.js (pre-race), nothing in the race.

## What
While `GameState.warpReady` is true and `speed` is in [78, 88) mph, SoundEngine plays one
quiet sine-plus-sub tone whose pitch maps linearly 78 → 88 onto about 1.0× → 2.0× of a base
note (a pure function `warpApproach(mph, ready)` → `{ gain, rate }`, in `src/sfx/street-params.js`
beside the other pure rules). Gain eases in and out over 150 ms, tops at about -24 dBFS on the
SFX bus (under the music duck), and cuts to silence at the warp or when speed falls below 78 or
`warpReady` clears. It drives no visual change: the HUD already has READY. `tuner.frame()`
(already called once a frame) owns the oscillator; create it lazily on first use, reuse it
(zero per-frame allocation), and stop it when not racing/paused/muted like the other layers.

## Acceptance criteria
- [ ] `warpApproach(77, true).gain === 0`; at 78 it starts; rate is strictly increasing to 88;
      `warpApproach(85, false).gain === 0` (no READY, no sound)
- [ ] Silent when muted, paused, in the results, and on the first frame after a warp
- [ ] No node is created per frame (one oscillator for the whole session)
- [ ] The master compressor never clips it over the music (peak under the SFX bus ceiling used
      by the other tuner layers)
- [ ] Reduced-motion does not silence it (it is sound, not motion); MONO output unaffected
- [ ] No growth of main's startup JS (the code lives in the lazy tuner chunk; main stays ≤ 57 kB)

## Test plan
Unit (`tests/unit/street-params.test.js`): the mapping at 77, 78, 83, 88 and with `ready`
false. E2E: with a debug hook, force speed 84 and flux 100 and assert the tuner reports the
approach tone active with a rate between 1 and 2; set speed 70 and assert it is off.

## Out of scope
New visual effects at 80+ mph, changing warp rules, changing the READY cue, a music change.
