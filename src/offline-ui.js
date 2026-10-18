// Offline hint (ticket 0158, lazy): once the whole game is saved, offer the one step that makes
// offline play stick on each platform, once, dismissible.
//   iOS / iPadOS Safari (not installed)  Safari may clear a site's storage after 7 days without
//                                         a visit; a Home Screen app keeps it → "Add to Home Screen"
//   Chrome / Edge / Samsung (Android, desktop)  the browser's own install prompt (beforeinstallprompt)
//   Firefox                               a tap on the pill asks to keep the storage
// The pill itself always explains what works offline.
import { offline, maybePersist } from './offline.js';

const SEEN_KEY = 'outatime88_offline_hint_v1';
let deferred = null;

/** Which hint this browser gets: 'ios' | 'install' | 'firefox' | null. */
export function hintKind(nav = navigator, standalone = isStandalone()) {
  if (standalone) return null;
  const ua = nav.userAgent || '';
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  if (iOS) return 'ios';
  if (deferred) return 'install';
  if (/firefox\//i.test(ua)) return 'firefox';
  return null;
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  } catch { return false; }
}

const TEXT = {
  ios: ['✈️ PLAY ON A PLANE', 'Tap Share, then “Add to Home Screen”. The game then works offline any time.'],
  install: ['✈️ INSTALL FOR OFFLINE', 'Install OUTATIME 88 and race anywhere, no internet needed.'],
  firefox: ['✈️ KEEP IT OFFLINE', 'Let Firefox keep the game saved so it works with no internet.'],
};

function seen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* blocked */ } }

function showCard(kind) {
  if (document.getElementById('offlineHint')) return;
  const [title, text] = TEXT[kind];
  const card = document.createElement('div');
  card.id = 'offlineHint';
  card.className = 'offline-hint';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  const h = document.createElement('b'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = text;
  const row = document.createElement('div'); row.className = 'offline-hint-row';
  const close = () => { markSeen(); card.remove(); };
  if (kind !== 'ios') {
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'offline-hint-go';
    go.textContent = kind === 'install' ? 'INSTALL' : 'KEEP IT';
    go.addEventListener('click', async () => {
      if (kind === 'install' && deferred) { deferred.prompt(); try { await deferred.userChoice; } catch { /* dismissed */ } deferred = null; }
      else await maybePersist(true);
      close();
    });
    row.append(go);
  }
  const later = document.createElement('button');
  later.type = 'button'; later.className = 'offline-hint-later';
  later.textContent = kind === 'ios' ? 'GOT IT' : 'NOT NOW';
  later.addEventListener('click', close);
  row.append(later);
  card.append(h, p, row);
  (document.getElementById('titleScreen') || document.body).append(card);
}

export function initOfflineHint({ pill } = {}) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (!seen() && offline.ready) showCard('install');
  });
  window.addEventListener('appinstalled', () => { deferred = null; markSeen(); });
  // The pill explains what works offline, and (Firefox) asks to keep the storage.
  if (pill) pill.addEventListener('click', () => {
    maybePersist(true);
    const kind = hintKind();
    if (kind) showCard(kind);
    else pill.title = 'Solo races, the daily challenge, the garage and 2D/3D all work with no internet. Racing friends live needs internet.';
  });
  pill && (pill.title = 'Solo races, the daily challenge, the garage and 2D/3D all work with no internet.');
  // Never pops up on its own under automation (tests ask for it with ?offlinehint).
  if (seen() || (navigator.webdriver && !/[?&]offlinehint/.test(location.search))) return;
  const kind = hintKind();
  if (kind) showCard(kind);
}
