---
id: 0053
title: Share your result — a personalised card, one-tap share, and challenge links that race your time
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 38
---

## Why
Operator request (2026-10-17): a share button on results with an amazing, personalised image
and a CTA so engaging friends want to play. Ticket 0029 proposed sharing; this ships it on
top of the 0052 results.

## What
- `src/share.js` (lazy chunk): the card drawn on a canvas on the device — synthwave sky, sun
  and grid, a kicker that changes with the result (back of the grid to the win, comeback kid,
  podium, so close, dead last full send, totalled it), a giant ordinal, your initials in your
  car's colour, car, track, time and best lap, a brag naming who you beat, and RACE ME with a
  QR code (the shared `src/qr.js` encoder). 1080x1350 to post, 1200x630 wide. Daily badge.
  Native share with the PNG when `navigator.canShare({ files })`, else link + text; copy link
  and save PNG fallbacks. `drawPromoCard` + `scripts/make-og.mjs` make the static
  `public/og.jpg` link preview (og/twitter tags in index.html).
- `src/sharelink.js` (pure): `?track=N&beat=SS.S&by=ABC` (or `track=daily-YYYY-MM-DD`)
  build/parse/validate, banner and verdict text, brag copy. Never uses `room=`.
- `src/share-ui.js` (lazy chunk): results Share button with a live preview, the share sheet
  (POST / WIDE, SHARE, COPY LINK, SAVE IMAGE), the title challenge banner with one-tap RACE,
  and the "you beat ZED's 1:02.3" verdict. If `GameState.liveInvite` is set (a live room), the
  card and link invite to the room rematch instead.
- Lap splits recorded per race (best lap on the card).

## Acceptance criteria
- [x] Share button with live preview beside Retry / Ranks / Next
- [x] Native share with image; fallbacks copy link and download PNG (tested)
- [x] Challenge link opens a banner and races the same track; verdict on results
- [x] Static og image bundled; no external hosts; main bundle stays under 60 kB gz

## Test plan
`tests/unit/sharelink.test.js`; `tests/e2e/share.spec.js` (fallback sheet: card size, copy,
wide, download; native share gets a PNG + link; challenge link → banner → race → verdict; junk
link ignored).

## Out of scope
Per-run server-rendered link previews (would need image rendering on the Worker).
