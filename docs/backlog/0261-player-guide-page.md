---
id: 0261
title: A readable player guide at /outatime/guide/, linked from the title
status: shipped
priority: P1
size: M
lens: content
created: 2026-11-10
pr: 250
---

## Why
The game is a canvas a search engine (or a parent) can't read. One plain page with how to play,
the controls, scoring, tips, settings and a factual note for parents explains the game in words,
helps first-time players, and gives mutaafaziz.com real text content (operator request).

## What
- `guide/index.html` + `guide/guide.css`: a third Vite entry, static HTML with no script at all
  (no ads, no analytics), the game's own bundled fonts (Orbitron, Inter) and colours.
- `vite.config.js`: the `guide` input and `no-transform` headers for `/outatime/guide/` (keeps the
  zone's analytics beacon off it, §3.3).
- EVENTS: a `📖 PLAYER GUIDE` link above HOW TO PLAY (`#lnkGuide`), and one at the end of Settings
  (`#lnkGuideSettings`). The title itself is full (0226/0230 hero-car layout tests), so no chip there.
- `scripts/sw-template.js`: a navigation to another page under the base (guide, pad) is cached
  under its own path, no longer over the cached game page, so offline play keeps the game.

## Acceptance criteria
- [x] `/outatime/guide/` returns the full text in the HTML, with h1, canonical and no `<script>`
- [x] The EVENTS link is ≥ 44 px, in view at 390x844 and 1280x720, and opens the guide
- [x] The guide's PLAY button goes back to the game

## Test plan
`tests/e2e/guide.spec.js` (static HTML, no scripts/ads, EVENTS link → guide → PLAY, Settings link) and the
`/outatime/guide/` line in `tests/e2e/headers.spec.js`.

## Out of scope
Translations; a guide per era.
