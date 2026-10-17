---
id: 0029
title: Share your run — one tap shares score, rank and the daily twist
status: proposed
priority: P2
size: S
lens: content
created: 2026-10-17
pr:
---

## Why
The leaderboard (0025) gives every run a rank; sharing it is how friends find the game and
come back for the daily challenge. Must stay within invariant 3.3 (no third-party hosts).

## What
A SHARE button on results using the Web Share API (fallback: copy to clipboard) with text
like "OUTATIME 88 · 1,234,567 · #12 today · Daily: FLUX STORM · mutaafaziz.com/outatime/".
No images, no SDKs, no tracking parameters.

## Acceptance criteria
- [ ] e2e: share text contains score, rank and the URL; clipboard fallback works
- [ ] No new network requests (smoke test external-request guard)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
e2e with `navigator.share` stubbed and clipboard permissions granted.

## Out of scope
Generated share images.
