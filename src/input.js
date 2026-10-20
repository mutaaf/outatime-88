// Keyboard/touch input state and gamepad polling.

export const InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  boostPressed: false,
  lastInput: '',       // 'keys' | 'pad' | 'phone' | 'touch': the input in hand, for prompts (0111)
  nosHeld: false,      // NOS (ticket 0122): Shift / N while racing, gamepad LB, touch NOS
  touchNos: false,
  hoverPressed: false,
  zonePressed: false,
  agroPressed: false,
  roarPressed: false,
  twoWheelPressed: false,
  slamPressed: false,
  wheelDragActive: false,
  wheelSteerVal: 0,
  mouseSteerVal: 0,    // mouse steering mode (ticket 0130, src/steermode-ui.js), -1..1
  tiltEnabled: false,
  tiltRawAngle: 0,
  tiltZeroOffset: 0,
  tiltSteerVal: 0,
  // Touch controls (ticket 0061, src/touch/): written once per frame by the controller's
  // sample(). Analog steer in about -1.25..1.25; gas/brake holds; camera look for the 3D view
  // (yaw/pitch -1..1, springing back to 0; zoom 0.6..1.6 scales the chase distance); lookBack
  // while LOOK BACK is held (2D draws a rear-view mirror).
  touchSteerVal: 0,
  touchUp: false,
  touchDown: false,
  lookBack: false,
  lookYaw: 0,
  lookPitch: 0,
  lookZoom: 1
};

// Gamepad (ticket 0183). Polled once per 120 Hz sim step, so a stick or trigger change is
// in the very next step, not the next frame.
//   - Stick: a deadzone rescaled to start from zero (no jump out of it, and a worn stick's
//     drift never steers), then a gentle response curve: small corrections at 100 mph are
//     fine, and full lock is still there before the rim.
//   - Triggers are analog: RT is the throttle, LT the brake, both 0..1 (A/B are full press).
//     Feathering RT keeps the wheels from spinning on a launch.
// The result is one reused object (no garbage at 120 Hz); read it before the next poll.
export const PAD = Object.freeze({ dead: 0.12, outer: 0.96, curve: 1.35, trigDead: 0.06 });

const shapeAxis = (x) => {
  const m = Math.abs(x);
  if (m <= PAD.dead) return 0;
  return Math.sign(x) * Math.min(1, (m - PAD.dead) / (PAD.outer - PAD.dead)) ** PAD.curve;
};
const trigger = (b) => {
  if (!b) return 0;
  const v = typeof b.value === 'number' && b.value > 0 ? b.value : (b.pressed ? 1 : 0);
  return v <= PAD.trigDead ? 0 : Math.min(1, (v - PAD.trigDead) / (1 - PAD.trigDead));
};
const pressed = (p, i) => Boolean(p.buttons[i] && p.buttons[i].pressed);

const padOut = { steer: 0, gas: false, brake: false, gasAmt: 0, brakeAmt: 0, boost: false, hover: false, nos: false, back: false, l3: false };

// TV mode (ticket 0175, src/tv/tv.js): a paired phone drives through the gamepad path. Its
// pedals are on/off, so their analog amounts stay at a full press (ticket 0183).
export const PhonePad = { on: false, steer: 0, gas: false, brake: false, gasAmt: 1, brakeAmt: 1, boost: false, hover: false, nos: false, back: false, l3: false };

export function pollGamepad() {
  if (PhonePad.on) { InputState.lastInput = 'phone'; return PhonePad; }
  if (!navigator.getGamepads) return NO_PAD;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        const axisX = shapeAxis(p.axes[0] || 0);
        const steer = axisX !== 0 ? axisX : (pressed(p, 14) ? -1 : (pressed(p, 15) ? 1 : 0));
        const gasAmt = Math.max(pressed(p, 0) ? 1 : 0, trigger(p.buttons[7]));
        const brakeAmt = Math.max(pressed(p, 1) ? 1 : 0, trigger(p.buttons[6]));
        padOut.steer = steer;
        padOut.gasAmt = gasAmt;
        padOut.brakeAmt = brakeAmt;
        padOut.gas = gasAmt > 0;
        padOut.brake = brakeAmt > 0;
        padOut.boost = pressed(p, 2) || pressed(p, 5);
        padOut.hover = pressed(p, 3);
        padOut.nos = pressed(p, 4);
        padOut.back = pressed(p, 8); // BACK / SELECT / VIEW: steering mode
        padOut.l3 = pressed(p, 10);  // left-stick click: co-pilot
        if (steer || gasAmt || brakeAmt || padOut.boost || padOut.nos) InputState.lastInput = 'pad';
        return padOut;
      }
    }
  } catch (e) {}
  return NO_PAD;
}

const NO_PAD = Object.freeze({ steer: 0, gas: false, brake: false, gasAmt: 0, brakeAmt: 0, boost: false, hover: false, nos: false, back: false, l3: false });
