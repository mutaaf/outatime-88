// Phone/tablet niceties for a race (mobile pass): keep the screen awake while you're racing,
// and on Android phones go fullscreen when the race starts so the browser bars give the road
// back. Lives in the touch chunk, so desktops never load it. Every API is optional: a browser
// without it (or one that says no) simply keeps today's behaviour.

/**
 * Should starting a race ask for fullscreen? Pure, so unit tests cover every case.
 * Phones only (tablets have room to spare), only from a normal browser tab (an installed app
 * is already fullscreen), never under automation (it would resize the test viewport), and
 * only when the browser can do it for a page element (iPhone Safari can't).
 */
export function wantsFullscreen({ enabled, vw, vh, canRequest, displayMode, webdriver, inFullscreen }) {
  if (!enabled || !canRequest || webdriver || inFullscreen) return false;
  if (displayMode && displayMode !== 'browser') return false;
  return Math.min(vw, vh) < 600;
}

/**
 * Screen wake lock while racing: requested when a race is running, released when it isn't,
 * and re-requested when you come back to the tab (the browser drops it when hidden).
 */
export function createWakeKeeper(nav = typeof navigator !== 'undefined' ? navigator : null, doc = typeof document !== 'undefined' ? document : null) {
  let lock = null, want = false, pending = false;
  const supported = !!(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');
  function acquire() {
    if (!supported || lock || pending || (doc && doc.hidden)) return;
    pending = true;
    nav.wakeLock.request('screen').then((l) => {
      pending = false;
      if (!want) { l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    }, () => { pending = false; });
  }
  function release() {
    if (lock) { const l = lock; lock = null; l.release().catch(() => {}); }
  }
  if (doc) doc.addEventListener('visibilitychange', () => { if (!doc.hidden && want) acquire(); });
  return {
    supported,
    /** Call every frame (cheap): `racing` = a race is running right now. */
    set(racing) {
      if (racing === want) return;
      want = racing;
      if (want) acquire(); else release();
    },
    held: () => !!lock,
  };
}

/** Fullscreen on race start (Android phones), called from inside the tap that starts it. */
export function maybeFullscreen(enabled, win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  const doc = win.document;
  const el = doc.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  let displayMode = 'browser';
  try {
    if (win.matchMedia('(display-mode: fullscreen)').matches) displayMode = 'fullscreen';
    else if (win.matchMedia('(display-mode: standalone)').matches) displayMode = 'standalone';
  } catch (e) { /* old browser */ }
  const go = wantsFullscreen({
    enabled, vw: win.innerWidth, vh: win.innerHeight, canRequest: typeof req === 'function',
    displayMode, webdriver: !!(win.navigator && win.navigator.webdriver),
    inFullscreen: !!(doc.fullscreenElement || doc.webkitFullscreenElement),
  });
  if (!go) return false;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => {});
  } catch (e) { return false; }
  return true;
}
