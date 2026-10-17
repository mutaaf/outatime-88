---
id: 0110
title: Deep links — the site launcher opens friends, quick race, daily, boards, a level or the garage
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-17
pr: 0
---

## Why
mutaafaziz.com's app launcher could only offer `?view=3d`; every other action ("Race friends",
"Daily challenge", "Leaderboard") had no URL to point at.

## What
- `src/deeplink.js` (lazy chunk, loaded only when a deep-link param is present): `?play=friends|quick|daily`,
  `?board=<tab>`, `?level=N`, `?garage`. Stripped from the URL after use; never bypasses unlocks
  or starts a race without a tap.
- Documented in AGENTS.md § URL parameters.

## Acceptance criteria
- [x] Each param opens its screen; invalid values are ignored; one-shot params leave the URL
- [x] A locked `?level` stays locked; no param starts a race or a live join without a tap
- [x] Main bundle stays under 60 kB (the parser is a lazy chunk)

## Test plan
- Unit: `tests/unit/deeplink.test.js` (parse, junk, strip, boot regex)
- e2e: `tests/e2e/deeplink.spec.js` (one test per param, URL cleaned, composes with `?view`)
