---
id: 0285
title: Free at least 1 kB gz of main startup JS again (identity and track code the title does not need)
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-11-19
pr:
---

## Why
Main startup JS is 57.948 kB of the 58 kB budget after 0284 (about 50 B spare), and
`docs/LESSONS.md` (2026-11-17, 2026-11-18) records that ±4 B of hash noise alone can fail
`budget.spec.js`, and that 0280/0283 each had to scrape bytes. Any ticket needing a hook in
`src/hud.js` or `src/main.js` is blocked or forced into contortions. Pillar 7: keep carving
main; new features ship as lazy chunks, so main must have room for their hooks.
Statically imported by `src/main.js` and large raw: `src/identity.js` (8.6 kB; link and
recovery codes, friends and the racer switch are tap-time features, the title needs only
`publicId`/`profile`), `src/track.js` (19 kB), `src/data.js` (16.6 kB).

## What
Measure first (`npm run build`, then gzip each startup chunk; list the top contributors in the
PR body). Move the cold, tap-time parts of the biggest candidates into a lazy chunk fetched
on first use or after boot, keeping behaviour identical. Likely first cut: the link-code,
recovery-code and friends functions of `src/identity.js` (the RACER panel chunk already
loads on demand). Obey the lesson of 2026-11-17: a module statically imported by two lazy
chunks becomes a shared chunk named in main's preload map, so give it one importer or
`import()` it from both.

## Acceptance criteria
- [ ] Main startup JS (entry + static imports) is at most 56.9 kB gz as measured by `tests/e2e/budget.spec.js`
- [ ] No behaviour change: identity, racer panel and friends e2e specs unchanged and green
- [ ] AGENTS.md budget line and system-map rows updated with the new number and chunk
- [ ] No new runtime hosts; no frame-time regression; title still boots with zero console errors

## Test plan
`budget.spec.js` (existing) asserts the number; `identity.spec.js` and the racer panel tests
prove nothing moved out of reach. Add a unit test only if a pure module gains a new entry point.

## Out of scope
Raising the budget. Behaviour changes. Anything in `src/worker/`.
