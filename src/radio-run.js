// Rival radio glue (0277), its own lazy chunk (fetched by src/race-late.js once a race runs):
// once per frame, notes passes and takedowns (src/radio.js) and speaks a line through the one
// announcement channel at the lowest priority, only when it is free, never in the start sequence,
// a warp, a crash or a resume beat, never in live rooms, and not at all with Coach tips off (0201).
// The announcer box is a polite live region (0030), so screen readers hear the line too.
import { RACE_DEPS, LiveTraffic, announcer, triggerAnnouncement } from './main.js';
import { createRadio, radioEvents, radioReady, radioLine } from './radio.js';

export const radio = createRadio();

export function radioFrame() {
  const { GameState: G, SaveStore, track } = RACE_DEPS;
  const racers = LiveTraffic.racers;
  if (!racers || G.mode === 'LIVE' || G.status !== 'PLAYING' || G.racePhase !== 'RACING') return;
  radioEvents(radio, racers, G.distance, G.raceTime, G.warpActiveTimer > 0);
  const busy = announcer.isVisible() || G.warpActiveTimer > 0 || G.sinceWarp < 2 || G.invulnTimer > 0 || G.resumeBeat > 0;
  const r = radioReady(radio, G.raceTime, busy);
  if (!r || SaveStore.data.settings.coach === false) return;
  const line = radioLine(r.crew, radio.kind, track.seed, radio.n);
  if (line) triggerAnnouncement(`📻 ${line}`, `${r.driver} · ${r.crew}`, 1700, 1);
}
