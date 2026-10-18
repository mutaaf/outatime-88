// Offline play (ticket 0158): the game works on a plane in every major browser after one
// online visit. This module (main bundle, kept tiny) registers the service worker
// (scripts/sw-template.js), tracks how much of the game is saved for offline, keeps the
// storage from being evicted where the browser allows, recovers from a stale lazy chunk after
// an update, and tells the UI. The install / Add-to-Home-Screen hint is a lazy chunk.

const listeners = new Set();
export const offline = {
  supported: false,   // a service worker can run here (not Firefox private windows, not http)
  ready: false,       // every file of this version is in the cache
  done: 0, total: 0, version: '',
  persisted: false,   // the browser promised not to evict our storage
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
};

const emit = () => listeners.forEach((fn) => { try { fn(offline); } catch { /* listener bug */ } });
export function onOffline(fn) { listeners.add(fn); fn(offline); return () => listeners.delete(fn); }

/** True when the network is certainly gone (navigator.onLine can only be trusted when false). */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Pill text for the title / settings. */
export function offlineLabel(s = offline) {
  if (!s.supported) return '';
  if (s.ready) return s.online ? '✈️ READY FOR OFFLINE' : '✈️ PLAYING OFFLINE';
  if (!s.total) return '';
  return `⬇️ SAVING FOR OFFLINE ${Math.min(99, Math.floor((s.done / s.total) * 100))}%`;
}

function apply(msg) {
  if (!msg || msg.type !== 'ot-sw') return;
  offline.version = msg.version || offline.version;
  offline.total = msg.total || offline.total;
  offline.done = Math.max(0, msg.done | 0);
  offline.ready = Boolean(msg.ready);
  if (offline.ready) maybePersist(false);
  emit();
}

const isFirefox = () => typeof navigator !== 'undefined' && /firefox\//i.test(navigator.userAgent || '');

/**
 * Ask the browser to keep our storage. Chrome, Edge and Safari decide silently; Firefox shows a
 * permission prompt, so there it only runs from a tap (`fromTap`).
 */
export async function maybePersist(fromTap) {
  const st = typeof navigator !== 'undefined' && navigator.storage;
  if (!st || !st.persist) return false;
  try {
    if (await st.persisted()) { offline.persisted = true; return true; }
    if (isFirefox() && !fromTap) return false;
    offline.persisted = await st.persist();
    emit();
  } catch { /* not allowed here */ }
  return offline.persisted;
}

async function askStatus(reg) {
  const sw = (reg && reg.active) || navigator.serviceWorker.controller;
  if (sw) sw.postMessage({ type: 'ot-sw-status' });
}

/**
 * Register the service worker (production builds only; `?nosw` opts out for tests).
 * @param {string} base the app's base URL
 */
export function registerOffline(base) {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => { offline.online = true; emit(); });
  window.addEventListener('offline', () => { offline.online = false; emit(); });
  // After an update, a tab still running the old page can ask for a chunk the new deploy
  // removed. Reload once onto the new version instead of breaking (Vite fires this event).
  window.addEventListener('vite:preloadError', (e) => {
    try {
      if (sessionStorage.getItem('ot-reloaded') === '1') return;
      sessionStorage.setItem('ot-reloaded', '1');
    } catch { /* storage blocked: reload anyway, once per page */ }
    e.preventDefault();
    location.reload();
  });
  // A page that has run for a while is healthy: allow the next recovery reload. (Clearing it
  // at once would loop forever if a chunk is truly missing, e.g. offline before it was cached.)
  setTimeout(() => { try { sessionStorage.removeItem('ot-reloaded'); } catch { /* blocked */ } }, 10000);

  let sw = null;
  try { sw = navigator.serviceWorker; } catch { sw = null; } // Firefox private windows throw
  if (!sw || new URLSearchParams(location.search).has('nosw')) { emit(); return; }
  offline.supported = true;
  sw.addEventListener('message', (e) => apply(e.data));
  if (sw.startMessages) sw.startMessages();
  // Offline, register() can't fetch sw.js to check for an update and rejects, but the worker
  // installed on the last visit still runs the page: ask it, don't give up.
  const ask = () => sw.ready.then(askStatus).catch(() => {});
  sw.register(`${base}sw.js`, { scope: base }).then((reg) => {
    if (!reg) { offline.supported = false; emit(); return; } // blocked (automation, policies)
    askStatus(reg); ask();
  }).catch(() => {
    sw.getRegistration(base).then((reg) => {
      if (reg) ask();
      else { offline.supported = false; emit(); }
    }).catch(() => {});
  });
  emit();
}

// For tests (?debug): the live status.
export function offlineDebug() { return { ...offline }; }
