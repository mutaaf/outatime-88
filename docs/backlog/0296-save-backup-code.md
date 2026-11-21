---
id: 0296
title: Back up and restore your save with a copy-paste code (no server)
status: shipped
priority: P2
size: M
lens: tech-health
created: 2026-11-21
pr:
---

## Why
All progress lives in one localStorage key. Safari clears script-writable storage after seven days
of Safari use without interaction on the site, and phones get wiped or swapped
(https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/). 0213 warns players about
unsaved progress; nothing lets them move or rescue it. With no accounts allowed, a local code is the only
honest answer: the player keeps their cars, coins and best times when changing phones or after a clear.

## What
Settings gets BACKUP: "COPY SAVE CODE" (writes a compact versioned, checksummed text string of
`SaveStore.data` to the clipboard, or shows it selectable if clipboard is denied) and "RESTORE FROM
CODE" (paste box, validates version and checksum, shows what it will replace, asks to confirm,
then merges through the existing `load()` normalisation so old shapes keep working). Lazy chunk
`src/save-backup.js`, loaded only when Settings opens the section. No network, no new storage key.

## Acceptance criteria
- [ ] Round trip: export then restore into an empty save reproduces garage, career, best times and settings
- [ ] A truncated, edited or wrong-version code is rejected with a plain message and the save is untouched
- [ ] Restoring needs an explicit confirm and never touches identity keys or other racers' saves
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; the field is labelled for screen readers
- [ ] Main startup size does not grow; the new chunk stays under its budget

## Test plan
Unit `save-backup.test.js` (round trip, checksum failure, old-shape save). E2E `save-backup.spec.js`: earn coins, copy code, clear storage, restore, assert coins.

## Out of scope
Cloud sync, QR transfer, identity or leaderboard data.
