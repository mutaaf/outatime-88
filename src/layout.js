// Screen layout (ticket 0021): which HUD the screen gets, and where the floating message
// lane sits so it never lands on the HUD or the touch controls.
//
// The decision is pure (unit-tested); applyLayout() only writes a data attribute and CSS
// variables, so CSS owns every pixel and nothing reflows per frame.

/** Compact HUD for phones in either orientation and small tablets; full HUD for desktops. */
export const COMPACT_MAX_WIDTH = 900;
export const COMPACT_MAX_HEIGHT = 520;

export function hudMode(width, height) {
  return width <= COMPACT_MAX_WIDTH || height <= COMPACT_MAX_HEIGHT ? 'compact' : 'full';
}

/**
 * Vertical slots for the floating overlays, given the HUD's bottom edge and the controls'
 * top edge (both in CSS px). Messages stack below the HUD; the fork banner sits under them
 * but never below the controls.
 */
export function overlaySlots(hudBottom, controlsTop) {
  const gap = 6;
  const message = Math.round(hudBottom + gap);
  const telemetry = message + 64; // room for a two-line coach card
  const fork = Math.min(telemetry + 40, Math.max(telemetry, controlsTop - 48));
  return { message, telemetry, fork };
}

export function applyLayout(doc = document, win = window) {
  const root = doc.documentElement;
  root.dataset.hud = hudMode(win.innerWidth, win.innerHeight);
  const header = doc.querySelector('header');
  const controls = doc.getElementById('touchControlsLayer');
  const hudBottom = header ? header.getBoundingClientRect().bottom : 64;
  let controlsTop = win.innerHeight;
  if (controls) {
    for (const el of controls.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) controlsTop = Math.min(controlsTop, r.top);
    }
  }
  const s = overlaySlots(hudBottom, controlsTop);
  root.style.setProperty('--slot-message', `${s.message}px`);
  root.style.setProperty('--slot-telemetry', `${s.telemetry}px`);
  root.style.setProperty('--slot-fork', `${s.fork}px`);
}

/** Keeps the layout current on resize/rotation and when the HUD's own size changes. */
export function watchLayout(doc = document, win = window) {
  let queued = false;
  const run = () => { queued = false; applyLayout(doc, win); };
  const schedule = () => { if (!queued) { queued = true; win.requestAnimationFrame(run); } };
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  if (typeof win.ResizeObserver === 'function') {
    const ro = new win.ResizeObserver(schedule);
    const header = doc.querySelector('header');
    if (header) ro.observe(header);
  }
  // hudMode must be right before the first paint so the compact CSS applies immediately.
  doc.documentElement.dataset.hud = hudMode(win.innerWidth, win.innerHeight);
  schedule();
}
