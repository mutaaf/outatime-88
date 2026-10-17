---
id: 0032
title: Pause the race when the tab is hidden or the window loses visibility
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-17
pr:
---

## Why
Playtest check 2026-10-17: only the touch kit reacts to `visibilitychange`
(`src/touch/touch-ui.js` releases inputs); nothing pauses solo play. A kid who switches tab
or locks a phone mid-race comes back to a crash, a lost run or a drained clock. Every
mainstream browser game pauses on hide. (Browsers throttle rAF in hidden tabs, so the
sim also stalls unpredictably.) Reference: https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event

## What
In `src/main.js` (where PAUSED is set, ~line 4617), add one `visibilitychange`/`pagehide`
handler: if `GameState.status === 'PLAYING'` and mode is not `LIVE` (live races cannot pause),
set `PAUSED` and show the existing pause/settings overlay. Resume stays an explicit tap/key.
Also suspend the audio context on hide and resume on return if it was running.

## Acceptance criteria
- [ ] Solo race: dispatching a hidden `visibilitychange` sets status `PAUSED` and the clock stops
- [ ] Live race: the same event does not pause (existing live behavior unchanged)
- [ ] Returning does not auto-resume; the pause overlay is shown and a tap/key resumes
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
e2e in `tests/e2e/race.spec.js`: override `document.hidden`/`visibilityState`, dispatch the
event, assert paused and race time unchanged after 1 s; unit-test the decision helper if
extracted.

## Out of scope
Pausing live races; changing the pause UI.
