---
id: 0249
title: The nemesis intro banner waits until the fork cards and an impact plate are gone
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-05
pr: 233
---

## Why
Scout play-through (headless Chromium, ~8 s into a run at 1280x720 and 390x844): the
"😈 NEMESIS: VEX / VEX & ION ARDEN IS GUNNING FOR YOU" banner (about 7 s in, `raceCalls` in
`src/rival-ai.js`) was up at the same moment as the SKY-LOOP / TUNNEL fork cards
(`#forkChoiceBanner`), and on desktop also a "SOLID TRAFFIC IMPACT!" plate: three text
channels in a 250 px band while the player must choose a lane. Pillar 3: one announcement
channel at a time; the fork choice is the most time-critical text on screen. `raceCalls`
only defers to a position callout (`c`), not to the fork cards or hit plates.

## What
`raceCalls` (or its caller in `src/race-flow.js`) does not fire the nemesis intro while the
fork cards are visible or a hit/impact plate is up. It keeps waiting (the `nemesisCalled`
flag stays false) and fires on the first frame all are clear, up to a cap of 25 s into the
race, after which it is skipped for that race. Touches `src/rival-ai.js`, `src/race-flow.js`.

## Acceptance criteria
- [ ] With the fork cards visible, the nemesis intro is not announced; once they hide it is, within 1 s
- [ ] Same with an impact plate showing
- [ ] With neither present it still fires at ~7 s as today (unit test on `raceCalls`)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Unit: extend the `raceCalls` tests with a `blocked` input (fork cards up / plate up) and
assert null, then the banner when unblocked, and the 25 s skip. E2E: sample
`#announcerMain` and `#forkChoiceBanner` every frame over a run on a fork track; never both visible.

## Out of scope
Redesigning the fork cards or the banner wording.
