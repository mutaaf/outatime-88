// Race-step parts first needed well after the lights (0233), one small chunk the race step
// fetches as soon as it runs, so it is in long before a race reaches RACING: the opt-in lane guide
// (0219) and the first warp's arrival stretch (0218). Imported only by race-step.js, dynamically.
export { createLaneGuide } from './lane-guide.js';
export { buildArrival, queueArrival } from './arrival.js';
