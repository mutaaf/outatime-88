---
id: 0304
title: Losing window focus pauses a solo race and releases every held key
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-25
pr:
---

## Why
On desktop, Alt-Tab, a chat notification click or a click into another window leaves the race
running: the tab is not `hidden`, so the 0032 pause in `src/settings-ui.js` (`visibilitychange`
/ `pagehide`) never fires. Worse, `keyup` goes to the other window, so a key held at that
moment (W, ←, Shift for NOS) stays set in `InputState` and the car keeps accelerating or
steering until the player taps the key again. A grep for `'blur'` in `src/` finds only the
mouse-steer reset (`src/steermode-ui.js:114`) and a live-room input. This is the same
"never lose the player a race behind their back" promise 0032 made for phones, and the
standard expectation of desktop games. Reference: MDN `Window: blur event`,
https://developer.mozilla.org/en-US/docs/Web/API/Window/blur_event .

## What
On `window` `blur`: clear `InputState.left/right/up/down/nosHeld/mouseSteerVal` (and the other
held-key flags `keydown` sets in `src/main.js`), in every mode including LIVE and TV. In a solo
race (`GameState.status === 'PLAYING'`, mode not LIVE, not already paused) also open the pause
sheet exactly as `onHide` does today, by reusing that function. Put the code in the lazy
`settings-ui` chunk (it already owns `onHide`), not in `src/main.js`: main sits at ~55.7 of
57 kB gzipped. If a clear function must live in `src/input.js`, keep it to a few bytes and run
`budget.spec.js`.

## Acceptance criteria
- [ ] Solo race: dispatching `blur` on `window` while PLAYING pauses it (the sheet shows RESUME)
- [ ] After `keydown ArrowUp` then `blur`, `InputState.up` is false and the car is no longer accelerating once resumed
- [ ] A live room keeps running on blur (no pause) but its held keys are released
- [ ] Focus returning to the window does not auto-resume; the player taps RESUME (the 3-2-1 beat, 0231, still plays)
- [ ] No new console errors; `budget.spec.js` green (main ≤ 57 kB)

## Test plan
e2e in `tests/e2e/` (new `blur-pause.spec.js` or a case in the existing pause spec): start a
race with `racing(page)`, hold ArrowUp, `window.dispatchEvent(new Event('blur'))`, assert the
pause UI is visible and `InputState.up === false`; a second case in a live-room stub asserts no
pause. Unit-test the pure key-clear helper if one is added.

## Out of scope
Auto-resume on focus, a "click to continue" overlay, changing the 0032 hidden-tab behaviour.
