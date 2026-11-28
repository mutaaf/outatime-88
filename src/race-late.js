// Race-step parts first needed well after the lights (0233), one small chunk the race step
// fetches as soon as it runs, so it is in long before a race reaches RACING: the opt-in lane guide
// (0219), the first warp's arrival stretch (0218), the pad's START pause (0271) and the hook for the
// rival radio (0277, its own chunk src/radio-run.js) and the lap split call (0286, src/lap-split-run.js).
// Imported only by race-step.js, dynamically.
export { createLaneGuide } from './lane-guide.js';
export { buildArrival, queueArrival } from './arrival.js';
import { padFrame } from './pad-pause.js';

let radio = null, retryAt = 0;
const loadRadio = () => import('./radio-run.js').then((m) => { radio = m; }, () => { radio = 0; retryAt = performance.now() + 10000; });
loadRadio(); // fetched with this chunk, long before a race passes its first 4 s
let lap = null;
import('./lap-split-run.js').then((m) => { lap = m; }, () => {}); // long before the first lap is done
import('./restart-race.js').then((m) => m.initRestart(), () => {}); // the pause sheet's RESTART RACE (0292)
let units = null;
import('./units.js').then((m) => { units = m; }, () => {}); // MPH | KM/H (0293): GameState.kmh, the HUD caption
let title = null;
import('./tab-title.js').then((m) => { title = m.createTabTitle(document); }, () => {}); // ⏸ PAUSED in the tab (0309)
/** Once per frame from main's loop (race-step padPause): the pad START pause (0271), the radio, lap splits, units, the tab title. */
export function frame(G, I) {
  padFrame(G, I);
  if (title) title.frame(G);
  if (units) units.unitsFrame();
  if (lap) lap.lapFrame();
  if (radio) radio.radioFrame();
  else if (radio === 0 && performance.now() > retryAt) { radio = null; loadRadio(); } // a failed fetch tries again, every 10 s
}
