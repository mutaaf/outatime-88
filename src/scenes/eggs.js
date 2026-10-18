// Easter-egg triggers for the era backdrops (ticket 0100). Pure: the scene calls `eggs(f, mem)`
// every frame with the frame facts and a small per-race memory object, and gets back which
// set pieces should be showing. Kept pure so unit tests can pin every trigger.
//
// f: { era, t, raceTime, speed, lap, laps, warp (s since the last warp, or -1), reduced, seed }

export const EGGS = {
  LIGHTNING: 'lightning',   // the courthouse clock is struck as you warp (2026, 1955)
  WIRE_SPARKS: 'wireSparks', // 1955: sparks run down the tower cable at 88 mph
  SAUCER: 'saucer',         // 1955: a B-movie saucer crosses on the final lap
  BIKE_MOON: 'bikeMoon',    // 1985: a kid's bike crosses the full moon, once, final lap
  PINES: 'pines',           // 1985: the mall loses a pine after lap 1 (history changed)
  PRESTO: 'presto',         // 1885: the locomotive's smoke turns to fireworks at 88 mph
  BOOTH: 'booth',           // 1885: a time-travelling phone booth blinks in, final lap
  SHARK: 'shark',           // 2015: the holo-shark billboard lunges every 25 s
  RAIN_STOPS: 'rainStops',  // 2015: the forecast is exact — rain stops on the second
  UNICORN: 'unicorn',       // 2088: an origami unicorn drifts by, final lap
  BALLOON: 'balloon',       // 2026: a giant marshmallow parade balloon looms on the final lap
  ROADSTER: 'roadster',     // 2061: a cherry-red roadster with a suited mannequin drifts over Earth
  LAUNCH: 'launch',         // 2061: a rocket climbs off the Earth's limb on the final lap
};

export function newEggMemory() {
  return { lastLightning: -99, bikeMoonAt: -1, saucerAt: -1, unicornAt: -1, boothAt: -1, launchAt: -1 };
}

const finalLap = (f) => f.laps > 0 && f.lap >= f.laps;

/** One-shot window: starts the first frame `cond` holds, lasts `dur` seconds. */
function once(mem, key, cond, t, dur) {
  if (mem[key] < 0 && cond) mem[key] = t;
  return mem[key] >= 0 && t - mem[key] < dur;
}

export function eggs(f, mem, out) {
  const o = out || {};
  for (const k in EGGS) o[EGGS[k]] = false;
  const t = f.t;
  if (f.era === '2026' || f.era === '1955') {
    // The bolt arrives with the warp; with calm motion it still strikes, just without the flash.
    if (f.warp >= 0 && f.warp < 0.6 && t - mem.lastLightning > 2) mem.lastLightning = t;
    o[EGGS.LIGHTNING] = t - mem.lastLightning < 0.45;
  }
  if (f.era === '1955') {
    o[EGGS.WIRE_SPARKS] = f.speed >= 88;
    o[EGGS.SAUCER] = once(mem, 'saucerAt', finalLap(f), t, 9);
  }
  if (f.era === '1985') {
    o[EGGS.PINES] = f.lap >= 2;
    o[EGGS.BIKE_MOON] = once(mem, 'bikeMoonAt', finalLap(f) && f.speed >= 40, t, 6);
  }
  if (f.era === '1885') {
    o[EGGS.PRESTO] = f.speed >= 88;
    o[EGGS.BOOTH] = once(mem, 'boothAt', finalLap(f), t, 5);
  }
  if (f.era === '2015') {
    o[EGGS.SHARK] = (f.raceTime % 25) < 1.6 && f.raceTime > 5;
    // Rain stops for 10 s at every whole half-minute of race time.
    o[EGGS.RAIN_STOPS] = f.raceTime >= 30 && (f.raceTime % 30) < 10;
  }
  if (f.era === '2088') o[EGGS.UNICORN] = once(mem, 'unicornAt', finalLap(f), t, 8);
  if (f.era === '2026') o[EGGS.BALLOON] = finalLap(f);
  if (f.era === '2061') {
    // The roadster drifts past for 12 s out of every 40 s of race time, from 8 s in.
    o[EGGS.ROADSTER] = f.raceTime >= 8 && ((f.raceTime - 8) % 40) < 12;
    o[EGGS.LAUNCH] = once(mem, 'launchAt', finalLap(f), t, 10);
  }
  return o;
}

/** Seconds until 2015's rain stops (for the forecast billboard), or 0 while it is stopped. */
export function rainForecast(raceTime) {
  if (raceTime >= 30 && raceTime % 30 < 10) return 0;
  return Math.ceil(30 - (raceTime % 30));
}
