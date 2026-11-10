// In-race prompts worded for the input in hand (ticket 0007). Pure; the race flow chunk reads it.
/**
 * Prompts that name a control: the coach's FLUX FULL line, the HUD's flux hint and the ramp
 * call (src/race-step.js reads it through RF.hintNow), and the obstacle crash lines (0253:
 * `slide` under a high gate, `jump` a low bar). A pad names its buttons (X / RB boost,
 * Y hover, B / LT brake), a paired TV phone its BOOST / BRAKE / JUMP buttons, a touchscreen
 * its DRIFT and JUMP pads; keyboard and "no input yet" keep the original words (touch too,
 * for the boost prompts). `hop` / `duck` (0259) are the coach card's LOW LASER and HIGH GATE
 * advice, before its "— or go ◀ LEFT" (src/coach-dock.js obstacleTip).
 */
const KEYS = { coachFlux: 'Hold 88 mph — or hit SPACE / ⚡ — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR SPACE!', ramp: 'PRESS SPACE OR HOVER FOR MID-AIR TRICK!', slide: '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!', jump: '💥 BLOCKED! JUMP (H/E) OR STEER AROUND!', hop: 'Hop it (H / E)', duck: 'Hold drift to duck (S / ▼)' };
export const PLAY_HINTS = Object.freeze({
  keys: Object.freeze(KEYS),
  touch: Object.freeze({ ...KEYS, slide: '💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!', jump: '💥 BLOCKED! HIT JUMP OR STEER AROUND!', hop: 'Tap JUMP to hop it', duck: 'Hold DRIFT to duck' }),
  pad: Object.freeze({ coachFlux: 'Hold 88 mph — or press X / RB — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR X!', ramp: 'PRESS X OR Y FOR A MID-AIR TRICK!', slide: '💥 BLOCKED! HOLD B / LT TO SLIDE UNDER!', jump: '💥 BLOCKED! JUMP (Y) OR STEER AROUND!', hop: 'Hop it (Y)', duck: 'Hold B / LT to duck' }),
  phone: Object.freeze({ coachFlux: 'Hold 88 mph — or hit BOOST — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR BOOST!', ramp: 'HIT BOOST OR HOVER FOR A MID-AIR TRICK!', slide: '💥 BLOCKED! HOLD BRAKE TO SLIDE UNDER!', jump: '💥 BLOCKED! HIT JUMP OR STEER AROUND!', hop: 'Hit JUMP to hop it', duck: 'Hold BRAKE to duck' }),
});
let rebound = null;
/**
 * `boostKey` / `downKey`: the rebound BOOST and BRAKE keys' names (0013, InputState.boostKey /
 * .downKey; '' = default); the keyboard words then name them instead of SPACE and S. Built once
 * per binding, never per call.
 */
export function playHint(kind, boostKey = '', downKey = '') {
  const h = PLAY_HINTS[kind] || PLAY_HINTS.keys;
  if (!(boostKey || downKey) || h !== PLAY_HINTS.keys) return h;
  if (!rebound || rebound.b !== boostKey || rebound.d !== downKey) {
    rebound = { b: boostKey, d: downKey };
    for (const k of Object.keys(h)) {
      let t = h[k];
      if (boostKey) t = t.replace('SPACE', boostKey);
      if (downKey) t = t.replace('(S)', `(${downKey})`).replace('(S /', `(${downKey} /`);
      rebound[k] = t;
    }
  }
  return rebound;
}
