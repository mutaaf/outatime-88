---
id: 0020
title: Ship a favicon so full Chrome stops logging a 404 on every load
status: proposed
priority: P2
size: S
lens: tech-health
created: 2026-10-17
pr:
---

## Why
Invariant 1 requires zero console errors on current browsers. `docs/LESSONS.md` records that
full Chrome requests `/favicon.ico`, which we do not ship, producing a 404 error in the
console even on main; only the headless shell hides it. Real players see a console error
and a blank tab icon, and a local e2e run needed a workaround.

## What
Add an original inline SVG favicon (e.g. a neon "88" glyph) linked from `index.html` via a
data URI or an imported asset using `import.meta.env.BASE_URL` (never root-absolute, invariant 2).

## Acceptance criteria
- [ ] Loading the page in full Chromium produces zero console errors and no failed requests
- [ ] The favicon is bundled (no new hosts) and respects the `/outatime/` base path
- [ ] The e2e smoke test would fail if the favicon link were removed

## Test plan
Add an assertion to `tests/e2e/smoke.spec.js` that `link[rel~=icon]` exists with a non-root-absolute href and loads with a 200.

## Out of scope
Web app manifest, PWA install, touch icons.
