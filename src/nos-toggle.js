// NOS tap-to-toggle (ticket 0222): Settings → NOS = TAP ON/OFF turns a press of Shift / N / pad LB /
// the touch NOS button into a switch, for players who find holding a button hard. Pure; the race
// step (its only importer) feeds it each 120 Hz step. The state is `InputState.nosOn`, so the touch
// kit can show it and main can clear it whenever the race isn't stepping (pause, results, title).

/**
 * One step. `tap`: NOS went down this step (key, touch button or pad LB). `cut`: something that
 * ends a burn (a crash, a warp, the race not racing); it wins over a tap in the same step.
 * @returns {boolean} NOS held, as the hold mode would read it
 */
export function nosToggle(t, tap, cut) {
  if (cut) t.nosOn = false;
  else if (tap) t.nosOn = !t.nosOn;
  return Boolean(t.nosOn);
}

/** After the tank steps: on but not burning (tank dry, too little to light, too slow) is off. */
export function nosSettle(t, burning) {
  if (!burning) t.nosOn = false;
}
