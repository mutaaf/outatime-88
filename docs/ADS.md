# Sponsor boards (ad slots)

OUTATIME 88's roadside billboards, overhead gantries, loop banners, the start arch and the
booster-gate signs are **ad slots**: objects of their own that can carry a sponsor's creative,
drawn crisp in both renderers. They are built for a game that kids play, so the rules below
are not optional.

## Kid-safety policy (COPPA-minded)

- **First party only in a race.** The boards use no ad networks, exchanges, SDKs, pixels, tags or
  scripts. Every creative is a file bundled into the game under `/outatime/ads/` (or a house
  design painted in code). No board request ever leaves our origin (AGENTS.md §3). Menu ads
  are the one exception: see § Marquee menu ads below.
- **Contextual, never behavioural.** Which campaign a board shows depends only on the road:
  the track seed, the level, the board's slot and the era. Nothing about the player, the
  device or their history is used. Everyone on the same road sees the same boards (live
  rooms too).
- **No clicks in a race.** Boards are scenery; tapping them does nothing.
- **Kid-safe creatives only.** A campaign without `"kidSafe": true` is dropped by the client.
  The operator reviews every creative before it is merged: no age-restricted products, no
  data collection calls to action ("scan to sign up"), no URLs that lead to a sign-up or
  purchase flow, no scary or violent imagery, no impersonation.
- **Aggregate counts only.** The only number reported is impressions per campaign per day,
  sent as `{ v: 1, day, counts: { campaignId: n } }`, with no racer id, cookie, IP or device
  data. Reporting is **off** until `report: true` in the manifest, and is skipped for any
  browser that sends Global Privacy Control or Do Not Track.

## Slot inventory

| Kind | Where | Aspect | Size on the road | Per race (~2 min) |
|---|---|---|---|---|
| `START_ARCH` | Over the road just past the grid | 4:1 | 1.9 road half-widths, overhead | 1 |
| `GANTRY` | Over every checkpoint | 4:1 | 1.7 half-widths, overhead | ~3–5 |
| `ROADSIDE` | Every 30 segments, alternating sides, 1.58 half-widths out | 16:9 | 0.8 half-widths | ~15–20 |
| `LOOP_BANNER` | Left of the booster gate before every loop | 4:1 | 1.0 half-widths, low | ~1–3 |
| `GATE_SIGN` | Left of every other booster gate (the speed sign is on the right) | 1:1 | 0.42 half-widths | ~2–4 |

Slots are placed by the endless generator (`src/track.js` `addBoard`), pooled with the road
ring (they never accumulate), always outside the rails or overhead, so they never block the
racing line. In 2D a board beside the road (not the overhead ones, whose centred text is never cut) is never
drawn wider than 28% of the view, and one crossing the edge of the view fades with the share of its face off screen, gone at
35% (ticket 0221, `src/board-fade.js`), so a creative is never shown cut in half. The clock-tower boards (`ERA`) carry the era's own pop-culture nods and are not
for sale.

## Creative specs

| Aspect | Supply at | Minimum | Safe area |
|---|---|---|---|
| 16:9 | 1600 × 900 | 1024 × 576 | 6% inset on every side |
| 4:1 | 2048 × 512 | 1024 × 256 | 6% inset; keep the logo in the left square |
| 1:1 | 1024 × 1024 | 512 × 512 | 6% inset |

- PNG, WebP or JPEG, sRGB, ≤ 200 kB each (no SVG: it can carry scripts). Opaque, no text
  smaller than 1/12 of the height: boards are read at speed and at a distance.
- Night eras light the board with warm lamps along the top; design for a bright, high
  contrast face. Faces are drawn unlit in 3D, so colours read exactly as supplied.
- How it stays crisp: a creative is redrawn per size bucket (64/128/256/512/1024 px wide)
  and the board draws the bucket that covers its on-screen size in device pixels (the 2D
  road is backed at the graphics tier's pixel ratio; in 3D the face is mipmapped with full
  anisotropy).

## Viewability

An impression is counted when **at least 50% of the board is on screen**, the board covers
**at least 0.25% of the screen** (big enough to read), **for one continuous second**, during a
race (not on the title screen). A 2D board drawn see-through because a car, obstacle or pickup
is behind it (ticket 0203) is not being viewed: that time doesn't count. Nor is a 2D board more than ~17% off the edge of the view, which is drawn faded (ticket 0221). Each board counts at most once per race. Counts are batched:
sent when a race ends (a new road starts), every 40 impressions, and when the tab is hidden.

## Adding a campaign

1. Put the images in `public/ads/<campaign-id>/`, e.g. `public/ads/acme-q4/board-16x9.webp`.
2. Add the campaign to `public/ads/manifest.json`:

```json
{
  "id": "acme-q4",
  "name": "Acme Q4",
  "kidSafe": true,
  "weight": 4,
  "start": "2026-11-01",
  "end": "2026-12-31",
  "kinds": ["ROADSIDE", "GANTRY"],
  "eras": ["1985", "2088"],
  "levels": [0, 1, 2],
  "creative": { "image": {
    "16:9": "ads/acme-q4/board-16x9.webp",
    "4:1": "ads/acme-q4/banner-4x1.webp"
  } }
}
```

   - `id`: lowercase letters, digits and dashes, ≤ 40 chars. It is the reporting key.
   - `weight`: share of eligible slots (house campaigns weigh 1–3).
   - `start`/`end` (UTC dates), `kinds`, `eras`, `levels`: optional filters.
   - A board only shows an image campaign if the campaign supplies that board's aspect.
   - House designs use `"creative": { "house": "<name>" }` (`friends`, `daily`, `board`,
     `openaero`, `sign88`, `site`, `advertise`).
3. Open a PR. The operator checks the creative against the policy above before merging.

House campaigns always stay in the pool, so a slot is never empty, offline included (the
manifest is optional; without it the built-in house pool runs).

## Reporting endpoint

`POST /outatime/api/ads/impressions` with the batch above. The Worker validates the shape
(known-format ids, small integer counts, today's or yesterday's UTC day), rate-limits, and
adds the counts into a D1 table `ad_impressions(day, campaign, n)`. It stores nothing else.
The endpoint lives in `src/worker/` (operator-only); turn `report` on in the manifest only
after it is deployed. `GET /outatime/api/ads/impressions?day=YYYY-MM-DD` returns that day's
totals for invoicing.

## Marquee menu ads (owner decision, 2026-10-30)

The owner decided to "split by audience" for the kids' games: Google ads may appear **only
outside gameplay**; during a race only the first-party boards above appear. They are served by
Marquee (`mutaafaziz.com/ads`, its own repo and Worker) through the same-origin loader in
index.html: `<script async src="../ads/v1/ads.js" data-app="outatime" data-slots="…">`.

| Slot | Kind | Context | Where it fires |
|---|---|---|---|
| `title` | banner | menu | `#titleAd` on the title screen; collapsed (`:empty`) until the loader fills it |
| `postrace` | interstitial | menu | Back to the title from a solo race's results, from the session's **second** race on; Marquee caps it per slot (`frequency_sec`, 120 s default, set in the Marquee console) |
| `bonus` | rewarded | menu | Results card: "Watch a short ad for 2× coins" doubles that run's FLUX cash; the button shows only when the run earned cash and the slot has fill (`marquee.ready()` → `slots.bonus.source !== 'none'`) |

Rules:
- **Google, child-directed, menus only.** Marquee tags every Google request
  `data-tag-for-child-directed-treatment=1` for this kids app, never fills a `gameplay` slot with
  Google, and runs only `kid_safe` direct sponsors here. We declare no gameplay slot at all.
- **Rewarded is opt-in only.** It runs only after the player taps the button.
- **No ad ever shows mid-race.** `src/ads.js` asks only while the game is on the title or the
  results (status TITLE / GAMEOVER), never in a live room (mode LIVE) or TV mode (`?tv`). While a
  break is up, `beforeAd` holds the frame loop and silences the mix (not the saved mute), and
  `startNewRace` refuses to start; `afterAd` restores both.
- **Never blocking.** Every call is fire-and-forget; with no loader (offline, blocked, local
  dev, where `/ads/v1/ads.js` 404s) `window.marquee` is missing and every cue is a no-op.
- Tests: `tests/e2e/marquee.spec.js` stubs the loader and checks each call's moment;
  `stubAds()` in tests/e2e/helpers.js answers the same-origin `/ads/v1/ads.js` for every page so
  the no-external-request guard stays as strict as before.
