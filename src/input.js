// Keyboard/touch input state and gamepad polling.

export const InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  boostPressed: false,
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

export function pollGamepad() {
  if (!navigator.getGamepads) return NO_PAD;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        const axisX = Math.abs(p.axes[0] || 0) > 0.14 ? p.axes[0] : 0;
        const dLeft = p.buttons[14] && p.buttons[14].pressed;
        const dRight = p.buttons[15] && p.buttons[15].pressed;
        const steer = axisX !== 0 ? axisX : (dLeft ? -1 : (dRight ? 1 : 0));
        return {
          steer,
          gas: (p.buttons[0] && p.buttons[0].pressed) || (p.buttons[7] && p.buttons[7].pressed),
          brake: (p.buttons[1] && p.buttons[1].pressed) || (p.buttons[6] && p.buttons[6].pressed),
          boost: (p.buttons[2] && p.buttons[2].pressed) || (p.buttons[5] && p.buttons[5].pressed),
          hover: (p.buttons[3] && p.buttons[3].pressed),
          nos: Boolean(p.buttons[4] && p.buttons[4].pressed),
          back: Boolean(p.buttons[8] && p.buttons[8].pressed), // BACK / SELECT / VIEW: steering mode
          l3: Boolean(p.buttons[10] && p.buttons[10].pressed)  // left-stick click: co-pilot
        };
      }
    }
  } catch (e) {}
  return NO_PAD;
}

const NO_PAD = Object.freeze({ steer: 0, gas: false, brake: false, boost: false, hover: false, nos: false, back: false, l3: false });
