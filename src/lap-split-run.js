// Lap split glue (0286), its own lazy chunk fetched by src/race-late.js; lapFrame() runs once a
// frame from there. It watches GameState.lapSplits grow (race-flow pushes a lap as you cross the
// line, and the last one at the finish), so race-flow and race-step need no new code. A lap
// crossed mid-race is compared with your best for that lap on this level and announced on the one
// channel (src/announcer.js) at priority 3: it takes over the "LAP 2/3" call pushed the frame before
// (that call is still fading in, so it never reads) and a WAVE banner, which would otherwise hold it
// past the queue's stale limit, and waits behind FINAL LAP! (also 3). The last lap lands at the finish:
// it is saved, not called (the flag owns the screen). Solo campaign races only (lapCounts).
// The colour is a second cue only: the glyph and sign say gain or loss (invariant 8).
import { RACE_DEPS, triggerAnnouncement } from './main.js';
import { bestLapsFor, foldBest, lapCall, lapCounts } from './lap-split.js';

let laps = null, seen = 0, shown = null, shownUntil = 0;

/** Marks the announcer box (lap-gain / lap-loss / lap-even) while our line is the one on it, and only
 * then: a MutationObserver runs before the next paint, so another line never wears our colour. */
function tint() {
  const box = document.getElementById('announcerMain');
  const text = document.getElementById('announcerText');
  if (!box || !text) return;
  if (shown && performance.now() >= shownUntil) shown = null; // its time is up, or it went stale in the queue
  const want = shown && text.textContent === shown.main ? shown.kind : '';
  for (const k of ['gain', 'loss', 'even']) box.classList.toggle(`lap-${k}`, k === want);
}
const textEl = document.getElementById('announcerText');
if (textEl && typeof MutationObserver === 'function') new MutationObserver(tint).observe(textEl, { childList: true, characterData: true, subtree: true });

export function lapFrame() {
  const { GameState: G, SaveStore: S } = RACE_DEPS;
  const L = G.lapSplits;
  if (L !== laps) { laps = L; seen = L ? L.length : 0; return; } // a new race starts a fresh array
  if (!L || L.length <= seen) return;
  const n = seen = L.length;
  if (!lapCounts(G, document.body.classList.contains('tv-screen'))) return;
  const key = String(G.levelIndex | 0);
  const best = bestLapsFor(S.data, key);
  if (G.racePhase === 'RACING') {
    const c = lapCall(n, L[n - 1], best[n - 1]);
    if (c) { shown = c; shownUntil = performance.now() + 4500; triggerAnnouncement(c.main, c.sub, 1600, 3); tint(); }
  } else if (G.racePhase === 'FINISHED') {
    const all = S.data.bestLaps && typeof S.data.bestLaps === 'object' ? S.data.bestLaps : {};
    S.data.bestLaps = { ...all, [key]: foldBest(best, L) };
    S.save();
  }
}
