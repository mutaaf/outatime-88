// FULLSCREEN button (ticket 0307): Settings → View, for desktop and tablets. A race with
// nothing but road around it. Android phones keep their own race-start fullscreen
// (src/touch/device.js); this is the player's explicit choice, from the click that presses it.
// Imported only by the lazy settings-panel chunk, never by main.

/** The button's label for the current state. Pure. */
export function fullscreenLabel(active) {
  return active ? '⛶ EXIT FULLSCREEN' : '⛶ ENTER FULLSCREEN';
}

/** The Fullscreen API this document offers (standard, else the webkit prefix), or null (iPhone). */
export function fullscreenApi(doc) {
  if (!doc || !doc.documentElement) return null;
  const el = doc.documentElement;
  if (doc.fullscreenEnabled && el.requestFullscreen && doc.exitFullscreen) {
    return {
      change: 'fullscreenchange',
      active: () => !!doc.fullscreenElement,
      enter: () => el.requestFullscreen({ navigationUI: 'hide' }),
      exit: () => doc.exitFullscreen(),
    };
  }
  if (doc.webkitFullscreenEnabled && el.webkitRequestFullscreen && doc.webkitExitFullscreen) {
    return {
      change: 'webkitfullscreenchange',
      active: () => !!doc.webkitFullscreenElement,
      enter: () => el.webkitRequestFullscreen(),
      exit: () => doc.webkitExitFullscreen(),
    };
  }
  return null;
}

/** What the note says when the browser refuses (a gamepad press is not a user gesture). */
export const REFUSED_TEXT = 'Fullscreen needs a click, a tap or the Enter key. A gamepad press can\'t start it.';

/** Shows and wires the toggle button. Returns false (button stays hidden) without the API. */
export function wireFullscreen(btn, doc = typeof document !== 'undefined' ? document : null, note = null) {
  const api = btn ? fullscreenApi(doc) : null;
  if (!api) return false;
  const say = (t) => { if (note) note.textContent = t; };
  // The label says what a press does, so no aria-pressed on top (it would read "EXIT…, pressed").
  const sync = () => { btn.textContent = fullscreenLabel(api.active()); say(''); };
  // A refused request (a gamepad press, a kiosk or iframe policy) keeps the label and says why.
  const refused = () => say(REFUSED_TEXT);
  btn.addEventListener('click', () => {
    say('');
    try {
      const p = api.active() ? api.exit() : api.enter();
      if (p && typeof p.catch === 'function') p.catch(refused);
    } catch { refused(); } // old browsers throw instead
  });
  doc.addEventListener(api.change, sync); // the button, Esc or F11's exit: the label follows
  sync();
  btn.classList.remove('hidden');
  return true;
}
