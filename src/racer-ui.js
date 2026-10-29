// Who's playing (ticket 0090): boots the zero-login identity, keeps this device's save in
// step with the racer, captures friends from links, and opens the RACER panel — whose code
// (and the QR encoder) loads only when it's first opened, so the title stays light.

import { initIdentity, profile, onIdentity, setProfile, addFriends, PUB_RE } from './identity.js';
import { mergeServerBests } from './progress.js';

let deps = null; // { SaveStore, freshSaveData, levels, reload, onChange }
let panel = null;
const loadPanel = () => (panel ||= import('./racer-panel.js'));

export async function openRacer(opts) {
  (await loadPanel()).openPanel(deps, opts);
}

export async function closeRacer() {
  if (panel) (await panel).closeRacer();
}

/**
 * Boot: restore/issue the racer, sync initials and bests with this device's save, wire the
 * openers, and handle a ?link=CODE deep link. Never blocks the game; resolves when done.
 */
export async function initRacer(options) {
  deps = { reload: () => location.reload(), ...options };
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-racer], #btnRacer');
    if (opener) { e.preventDefault(); e.stopPropagation(); openRacer(); }
  }, true);
  const params = new URLSearchParams(location.search);
  const code = params.get('link');
  if (code) {
    params.delete('link');
    const q = params.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  }
  onIdentity(() => { if (panel) panel.then((m) => m.renderPanel()); deps.onChange?.(profile()); });
  const s = await initIdentity();
  const save = deps.SaveStore.data;
  if (s?.profile) {
    if (s.profile.initials && !save.initials) save.initials = s.profile.initials;
    if (mergeServerBests(save, s.bests, deps.levels) || s.profile.initials) deps.SaveStore.save();
    // Initials chosen before identity existed (or offline) reach the profile now.
    const push = {};
    if (save.initials && !s.profile.initials) push.initials = save.initials;
    if (save.livery && s.profile.car !== save.livery) push.car = save.livery;
    if (Object.keys(push).length) setProfile(push);
  }
  // Any link that carries `from=<public id>` (a challenge, a room invite) makes that racer a
  // friend, so they show up on your FRIENDS board (ticket 0091). The param stays for its owner.
  const from = params.get('from');
  if (s && from && PUB_RE.test(from)) addFriends([from]);
  deps.onChange?.(profile());
  if (code) openRacer({ code });
  return s;
}
