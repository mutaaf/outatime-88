---
id: 0212
title: Sound comes back after a phone call, Siri or a tab switch (AudioContext "interrupted")
status: shipped
priority: P1
size: S
lens: tech-health
created: 2026-10-26
pr: 166
---

## Why
`src/audio.js` only calls `ctx.resume()` when the state is `'suspended'` and only from the
mute toggle and volume paths. Safari on iOS moves a context to `'interrupted'` after a call,
Siri, an alarm or locking the phone, and a context can also be suspended by the browser when
the tab was hidden. Nothing re-wakes it, so a kid returns to the race and plays in silence
until they happen to toggle mute. Sound is pillar 4 and phones are first-class (pillar 6).
Reference: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state and
https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/statechange_event .

## What
In `src/audio.js` add one `statechange` listener on the context plus a `visibilitychange`
(visible) and first-`pointerdown` hook that call `resume()` when the player has not muted and
state is `'suspended'` or `'interrupted'`. Muting by the player must stay respected. Keep it
tiny: main JS is ~57.6/59 kB gz.

## Acceptance criteria
- [x] With the player un-muted, forcing the context to `suspended` or `interrupted` and then firing `visibilitychange` (visible) or a pointerdown brings `ctx.state` back to `running`
- [x] With the player muted, neither event resumes the context
- [x] No console errors when the context is closed or never created (title before first gesture)
- [x] Main JS budget holds

## Test plan
Unit test around a fake context object (state, `resume`, `statechange`) for both branches;
e2e in `?debug` that suspends the real context, dispatches `visibilitychange`, and asserts it
returns to `running`.

## Out of scope
Pausing the race when audio is interrupted (0032 covers hidden tabs); new sounds.
