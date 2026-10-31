---
id: 0231
title: Resuming a paused solo race gives a short 3-2-1 beat instead of dropping you back at full speed
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-31
pr: 203
---

## Why
Pause (Esc / the ⚙️ pause button / opening the garage, and the auto-pause when the tab is hidden, 0032) flips `GameState.status` PAUSED → PLAYING on the very next frame (`toggleGarageModal`, the pause resume in `src/main.js`). The player's thumb or fingers are not on the controls yet, traffic is at 100+ mph, and the first frame back is a crash. Racers in the genre classics and every modern mobile racer give a short "get ready" beat on resume. A fair, generous run (AGENTS.md vision) never punishes the player for pausing. The reduced-motion rule below is from AGENTS.md invariant 3.8.

## What
After a solo (non-LIVE, non-TV) race resumes from PAUSED, hold the sim for 3 beats (~0.9 s total, one tick per 0.3 s) while the road keeps drawing, and show one big centred number 3 → 2 → 1 on the announcement channel (never a second text on top). Input is still sampled so steering is ready, but `updateGame` does not step until the beat ends. A pure helper `src/resume-beat.js` (`createResumeBeat()` with `start()`, `tick(frameSeconds)` → `{ active, n }`) holds the rule so it is unit-tested; `main.js` only calls it from the one place a race leaves PAUSED. Short soft tick per number via the existing SoundEngine hooks (silent when muted). With prefers-reduced-motion or CALM motion on, show the number without the scale pop. Live races cannot pause, so they are untouched.

## Acceptance criteria
- [x] Pause then resume: the sim does not advance (race distance and clock unchanged) for 0.9 s of wall time, then advances normally.
- [x] The 3 → 2 → 1 shows in the announcement slot only; no other announcement is visible at the same time.
- [x] Pausing again during the beat is allowed and resets the beat on the next resume.
- [x] Quitting to the title or opening Settings during the beat never leaves the sim frozen.
- [x] No beat on a live room, in TV mode, or on the first start (the grid lights already do that).
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse; main startup JS stays ≤ 58 kB gz (helper lives in the race-flow/race-step chunk or the pause UI chunk, not main).

## Test plan
Unit: `tests/unit/resume-beat.test.js` — ticks 3, 2, 1 then inactive; a second `start()` restarts; non-finite or negative frame seconds are ignored. E2E (in an existing race spec, keep within the flake-guard budget): `racing(page)`, press Escape, record distance, press Escape again, assert distance unchanged right after resume, then `simWait` and assert it grew.

## Out of scope
Changing what pause shows. A resume beat for the garage's own pause (reuses the same path, so it is free, but do not add garage UI). Live and TV.
