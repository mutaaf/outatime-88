// In-race prompts worded for the input in hand (ticket 0007). Pure; the race flow chunk reads it.
/**
 * Prompts that name a control: the coach's FLUX FULL line, the HUD's flux hint and the ramp
 * call (src/race-step.js reads it through RF.hintNow). A pad names its buttons (X / RB boost,
 * Y hover), a paired TV phone its BOOST button; keyboard, touch and "no input yet" keep the
 * original words.
 */
export const PLAY_HINTS = Object.freeze({
  keys: Object.freeze({ coachFlux: 'Hold 88 mph — or hit SPACE / ⚡ — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR SPACE!', ramp: 'PRESS SPACE OR HOVER FOR MID-AIR TRICK!' }),
  pad: Object.freeze({ coachFlux: 'Hold 88 mph — or press X / RB — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR X!', ramp: 'PRESS X OR Y FOR A MID-AIR TRICK!' }),
  phone: Object.freeze({ coachFlux: 'Hold 88 mph — or hit BOOST — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR BOOST!', ramp: 'HIT BOOST OR HOVER FOR A MID-AIR TRICK!' }),
});
export const playHint = (kind) => PLAY_HINTS[kind] || PLAY_HINTS.keys;
