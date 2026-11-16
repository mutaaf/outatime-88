// Race-step parts first needed well after the lights (0233), one small chunk the race step
// fetches as soon as it runs, so it is in long before a race reaches RACING: the opt-in lane guide
// (0219), the first warp's arrival stretch (0218), the pad's START pause (0271) and the hook for the
// rival radio (0277, its own chunk src/radio-run.js). Imported only by race-step.js, dynamically.
export { createLaneGuide } from './lane-guide.js';
export { buildArrival, queueArrival } from './arrival.js';
import { padFrame } from './pad-pause.js';

let radio = null;
const loadRadio = () => import('./radio-run.js').then((m) => { radio = m; }, () => { radio = 0; });
loadRadio(); // fetched with this chunk, long before a race passes its first 4 s
/** Once per frame from main's loop (race-step padPause): the pad START pause (0271) and the radio. */
export function frame(G, I) {
  padFrame(G, I);
  if (radio) radio.radioFrame();
  else if (radio === 0) { radio = null; loadRadio(); } // a failed fetch tries again
}
