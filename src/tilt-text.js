// What the settings panel says about tilt (ticket 0050). Pure; only the lazy panel chunk
// (src/settings-panel.js) imports it, so the sentences stay out of main (0195).

/** What the settings panel should say about tilt right now. */
export function tiltStatusText(status) {
  switch (status) {
    case 'on': return 'Tilt is ON. Hold the device how you like and tap RECENTER.';
    case 'waiting': return 'Waiting for the tilt sensor…';
    case 'denied': return 'Tilt was blocked. Allow Motion & Orientation for this site in your browser settings, then try again.';
    case 'unsupported': return 'This device has no tilt sensor. Use the touch pads or a gamepad.';
    case 'nosignal': return 'No tilt sensor found on this device. Use the touch pads or a gamepad.';
    default: return 'Tilt is OFF. Turn it on to steer by tilting.';
  }
}
