---
id: 0258
title: The ad loader's 404 on preview and local builds is expected, so e2e names it and fails on any other
status: shipped
priority: P2
size: S
lens: tech-health
created: 2026-11-10
pr: 246
---

## Why
Scout run 2026-11-10: loading `vite preview` logs two "Failed to load resource: 404"
console errors for `/ads/v1/ads.js` (the Marquee loader is served by a separate Worker,
see AGENTS.md invariant 3.3 exception). Invariant 1 wants zero console errors; today
those two are silently tolerated, so a real broken asset 404 could hide beside them.

## What
Make the e2e smoke's console/response check explicit: allow only a 404 for the exact
ads loader path on localhost, and fail on any other 4xx/5xx or console error. Touch only
tests (`tests/e2e/`); do not change index.html or the loader.

## Acceptance criteria
- [x] The smoke test fails if any response other than `/ads/v1/ads.js` is >= 400.
- [x] The smoke test fails on any console error not caused by that one 404.
- [x] A deliberately missing asset (checked locally by hand, not committed) turns it red.

## Test plan
Update the smoke spec's allow-list; the assertion is the test.

## Out of scope
Changing how ads load, adding a stub ads.js to preview.
