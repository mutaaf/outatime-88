---
id: 0115
title: Make room in the main bundle — move non-first-frame code out of main.js
status: shipped
priority: P1
size: M
lens: tech-health
created: 2026-10-18
pr: 70
---

## Why
Pillar 7. The entry chunk is ~63.9 of 64 kB gzipped (`dist/outatime/assets/index-*.js`
gzips to ≈65.4 kB bytes), and `docs/LESSONS.md` already records that the last two tickets
had to squeeze or swap code to fit. Every upcoming gameplay ticket (0026 missions, 0027
formations, 0114 popups) adds code to main.js, so the next one will fail `budget.spec.js`.
Buy headroom first.

## What
Pick cohesive code that is not needed for the first frame or the first race step and move it
into a lazy chunk behind a dynamic `import()` (candidates: JarvisAI assist modes, contract
UI/announcer strings, results/level-select UI builders, `UPGRADE_DEFS` shop logic). Do not
change behaviour. Follow the carving rule in AGENTS.md § System map; `npm run lint` must pass.

## Acceptance criteria
- [ ] Entry chunk gzip drops by ≥3 kB versus `origin/main` (report before/after in the PR)
- [ ] `budget.spec.js` limit unchanged (still 64 kB); no new static import of three or src/live/
- [ ] Boot smoke and race e2e pass with no console errors
- [ ] The moved feature still works (e2e opens it once)

## Test plan
Existing e2e plus one case that triggers the lazily loaded feature; compare
`npm run build` chunk sizes before/after.

## Out of scope
The full renderer carve (0015) and any behaviour change.
