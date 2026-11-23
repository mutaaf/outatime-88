---
id: 0303
title: Settings: MONO AUDIO for one-ear listening
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-23
pr:
---

## Why
Several cues are panned left/right: Doppler pass-bys and the street layer (src/sfx/tuner.js,
pan up to ±0.3), the proximity cue (src/proximity-cue.js) and the lane guide
(src/lane-guide.js). A player who is deaf in one ear, or wears one earbud, loses everything
panned hard to the missing side. Xbox Accessibility Guidelines list a mono audio option for this:
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/ . A grep of
`index.html` and `src/settings.js` for "mono" finds nothing.

## What
Settings → Sound gets OUTPUT: STEREO (default) | MONO, saved as `settings.mono` (unset/junk =
STEREO). MONO downmixes at the end of the graph in `src/audio.js`: the master gain's
`channelCount = 1`, `channelCountMode = 'explicit'`, `channelInterpretation = 'speakers'` (Web
Audio sums L+R, nothing is dropped). Panned cues keep their pitch and rate changes, so the
proximity and lane-guide cues must still differ by tone, not only by side: check and, if one
relies on pan alone, add the tone offset in that module.

## Acceptance criteria
- [ ] Default and old saves are unchanged (stereo)
- [ ] MONO: the master output reports one channel and a hard-panned test tone is as loud as a
      centred one (no half-volume ear)
- [ ] Switching takes effect immediately, mid-race, without a click or a restart of the audio
      context, and is remembered
- [ ] Proximity and lane-guide cues stay distinguishable in MONO (tone differs left vs right)
- [ ] Row reachable by keyboard and pad; works at 390x844 and 1280x720

## Test plan
Unit: normalise (unset/junk → STEREO); the pan-to-tone mapping for the two cues. E2E: toggle in
the panel, read the master node's `channelCount` through the audio debug hook, reload, check it
persisted.

## Out of scope
Per-bus mixing, captions or visual replacements for sounds, a hearing-aid EQ.
