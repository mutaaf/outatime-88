// Keyboard/touch input state and gamepad polling.

export const InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  boostPressed: false,
  hoverPressed: false,
  zonePressed: false,
  agroPressed: false,
  roarPressed: false,
  twoWheelPressed: false,
  slamPressed: false,
  wheelDragActive: false,
  wheelSteerVal: 0,
  tiltEnabled: false,
  tiltRawAngle: 0,
  tiltZeroOffset: 0,
  tiltSteerVal: 0
};

export function pollGamepad() {
  if (!navigator.getGamepads) return { steer: 0, gas: false, brake: false, boost: false, hover: false };
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
          hover: (p.buttons[3] && p.buttons[3].pressed)
        };
      }
    }
  } catch (e) {}
  return { steer: 0, gas: false, brake: false, boost: false, hover: false };
}
