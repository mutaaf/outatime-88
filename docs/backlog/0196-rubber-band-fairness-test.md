---
id: 0196
title: Prove the rival rubber band never decides a clean race
status: ready
priority: P2
size: S
lens: tech-health
created: 2026-10-20
pr:
---

## Why
Players and designers dislike catch-up that makes earlier driving feel irrelevant; a Black Rock Studio designer argued players want to feel they play by the same rules as the opponents (https://www.mcvuk.com/development-news/black-rock-studio-blasts-arubber-bandinga/). `src/rival-ai.js` already caps the band (`band: { push: 14, ease: 18 }` mph), but nothing measures what it does to outcomes.

## What
Extend the balance harness (`npm run balance`, docs/BALANCE.md) with a mode that races a seeded bot with and without the band and reports the gap at the flag. If a clean lap earns less than a given margin, retune the constants. No Worker changes. Touches `scripts/` balance harness and `tests/unit/`.

## Acceptance criteria
- [ ] A unit test asserts that with a perfect (no-hit) bot, the player's lead after 3 laps is at least 1.5 s on every level with the band on
- [ ] The harness prints band-on vs band-off finishing gaps per level; numbers recorded in docs/BALANCE.md
- [ ] If a level fails the bound, the band constants are tuned and the test passes

## Test plan
New unit test in `tests/unit/` driving the real sim with a seeded bot; `npm run balance` output pasted in the PR.

## Out of scope
Removing the rubber band; live-race CPU cars (Worker-owned).
