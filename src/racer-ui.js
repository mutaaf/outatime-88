// The RACER panel (ticket 0090): who's playing on this device, moving to another device,
// a recovery code, and forgetting the device. No login anywhere. Built from JS so it can
// sit beside any title/settings layout; opened by #btnRacer, any [data-open-racer] element,
// or a ?link=CODE deep link (a QR scanned from another device).

import {
  initIdentity, profile, publicId, racers, onIdentity, createLinkCode, createRecoveryCode,
  redeemCode, switchRacer, newRacer, forgetDevice, bests, setProfile, addFriends, PUB_RE,
} from './identity.js';
import { swapSave, dropSave, mergeServerBests } from './racer-saves.js';

let deps = null; // { SaveStore, freshSaveData, levels, reload }
let modal = null;
let linkTimer = 0;

const $ = (sel) => modal.querySelector(sel);

const SKELETON = `
  <div class="racer-card" role="document">
    <button type="button" class="racer-close" data-racer-close aria-label="Close">✕</button>
    <div class="racer-head">
      <div class="racer-badge" data-racer-initials>???</div>
      <div>
        <div class="racer-kicker">YOU'RE RACING AS</div>
        <div class="racer-sub" data-racer-sub>No login needed — this device remembers you.</div>
      </div>
    </div>

    <section class="racer-sec">
      <h3>WHO'S PLAYING?</h3>
      <div class="racer-list" data-racer-list></div>
    </section>

    <section class="racer-sec">
      <h3>PLAY ON ANOTHER DEVICE</h3>
      <button type="button" class="racer-btn" data-racer-link>📲 LINK A DEVICE</button>
      <div class="racer-linkbox hidden" data-racer-linkbox>
        <canvas class="racer-qr" data-racer-qr aria-label="QR code to link a device"></canvas>
        <div>
          <div class="racer-code" data-racer-code></div>
          <div class="racer-note">Scan with the other device's camera, or type the code there. <span data-racer-countdown></span></div>
        </div>
      </div>
      <form class="racer-join" data-racer-join autocomplete="off">
        <label for="racerCodeInput">HAVE A CODE?</label>
        <input id="racerCodeInput" data-racer-input maxlength="14" autocapitalize="characters" spellcheck="false" placeholder="AB3 DEF">
        <button type="submit" class="racer-btn racer-btn-hot">JOIN</button>
      </form>
      <div class="racer-msg" data-racer-msg role="status" aria-live="polite"></div>
    </section>

    <section class="racer-sec">
      <h3>SAVE MY RACER</h3>
      <button type="button" class="racer-btn" data-racer-save>📝 SHOW MY RECOVERY CODE</button>
      <div class="racer-recovery hidden" data-racer-recovery>
        <div class="racer-code racer-code-long" data-racer-rcode></div>
        <div class="racer-note">Grown-ups: write this down. It brings this racer back on any device. Showing a new one retires the old one.</div>
      </div>
    </section>

    <button type="button" class="racer-forget" data-racer-forget>FORGET THIS DEVICE</button>
  </div>`;

function build() {
  modal = document.createElement('div');
  modal.id = 'racerModal';
  modal.className = 'racer-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Racer');
  modal.innerHTML = SKELETON;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-racer-close]')) closeRacer(); });
  modal.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') closeRacer(); });
  $('[data-racer-link]').addEventListener('click', showLinkCode);
  $('[data-racer-save]').addEventListener('click', showRecovery);
  $('[data-racer-join]').addEventListener('submit', (e) => { e.preventDefault(); join($('[data-racer-input]').value); });
  const forget = $('[data-racer-forget]');
  forget.addEventListener('click', async () => {
    if (forget.dataset.armed !== '1') { forget.dataset.armed = '1'; forget.textContent = 'TAP AGAIN TO FORGET THIS DEVICE'; return; }
    const gone = publicId();
    const next = racers().find((r) => r.pub !== gone);
    if (next) swapSave(deps.SaveStore, null, next.pub, deps.freshSaveData);
    else { deps.SaveStore.data = deps.freshSaveData(); deps.SaveStore.save(); deps.SaveStore.load(); }
    dropSave(gone);
    await forgetDevice();
    deps.reload();
  });
}

function setMsg(text, tone = '') {
  const el = $('[data-racer-msg]');
  el.textContent = text;
  el.dataset.tone = tone;
}

function render() {
  if (!modal) return;
  const p = profile();
  $('[data-racer-initials]').textContent = p?.initials || deps.SaveStore.data.initials || '???';
  $('[data-racer-sub]').textContent = p
    ? 'No login needed — this device remembers you.'
    : 'Offline right now — your racer is saved on this device.';
  const list = $('[data-racer-list]');
  list.textContent = '';
  for (const r of racers()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `racer-chip${r.active ? ' on' : ''}`;
    b.textContent = r.initials || 'NEW';
    b.setAttribute('aria-pressed', String(r.active));
    b.setAttribute('aria-label', `Play as ${r.initials || 'new racer'}`);
    if (!r.active) b.addEventListener('click', () => become(r.pub));
    list.appendChild(b);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'racer-chip racer-chip-add';
  add.textContent = '＋ NEW RACER';
  add.addEventListener('click', async () => {
    const from = publicId();
    const s = await newRacer();
    if (!s) { setMsg('Offline — try again in a moment.', 'bad'); return; }
    swapSave(deps.SaveStore, from, s.pub, deps.freshSaveData);
    deps.reload();
  });
  list.appendChild(add);
}

async function become(pub) {
  const from = publicId();
  const s = await switchRacer(pub);
  if (!s) { setMsg('Offline — try again in a moment.', 'bad'); return; }
  swapSave(deps.SaveStore, from, pub, deps.freshSaveData);
  deps.reload();
}

async function showLinkCode() {
  setMsg('');
  const r = await createLinkCode();
  if (!r.code) { setMsg(r.error === 'offline' ? 'Offline — try again in a moment.' : r.error, 'bad'); return; }
  const box = $('[data-racer-linkbox]');
  box.classList.remove('hidden');
  $('[data-racer-code]').textContent = `${r.code.slice(0, 3)} ${r.code.slice(3)}`;
  const url = new URL(deps.baseUrl || `${location.origin}${import.meta.env.BASE_URL}`);
  url.searchParams.set('link', r.code);
  // The QR encoder loads on demand (it's only needed here and in live rooms).
  import('./qr.js').then(({ qrToCanvas }) => qrToCanvas(url.toString(), $('[data-racer-qr]'), { size: 168 }));
  clearInterval(linkTimer);
  const tick = () => {
    const left = Math.max(0, r.expiresAt - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    $('[data-racer-countdown]').textContent = left ? `Expires in ${m}:${String(s).padStart(2, '0')}.` : 'Expired — make a new one.';
    if (!left) { clearInterval(linkTimer); box.classList.add('hidden'); }
  };
  tick();
  linkTimer = setInterval(tick, 1000);
}

async function showRecovery() {
  const r = await createRecoveryCode();
  if (!r.code) { setMsg(r.error === 'offline' ? 'Offline — try again in a moment.' : r.error, 'bad'); return; }
  $('[data-racer-recovery]').classList.remove('hidden');
  $('[data-racer-rcode]').textContent = r.code;
}

async function join(raw) {
  setMsg('Joining…');
  const from = publicId();
  const r = await redeemCode(raw);
  if (!r.ok) { setMsg(r.error, 'bad'); return; }
  // This device's progress comes along (merged on the server too), plus the racer's bests.
  if (from !== r.session.pub) dropSave(from);
  if (r.session.profile?.initials) deps.SaveStore.data.initials = r.session.profile.initials;
  mergeServerBests(deps.SaveStore.data, bests(), deps.levels);
  deps.SaveStore.save();
  setMsg(`You're ${r.session.profile?.initials || 'in'}! Loading your racer…`, 'good');
  deps.reload();
}

export function openRacer({ code } = {}) {
  if (!modal) build();
  render();
  modal.classList.remove('hidden');
  $('[data-racer-forget]').dataset.armed = '0';
  $('[data-racer-forget]').textContent = 'FORGET THIS DEVICE';
  if (code) {
    $('[data-racer-input]').value = code;
    setMsg('Tap JOIN to play as that racer on this device.', 'good');
    $('[data-racer-input]').focus();
  }
}

export function closeRacer() {
  if (!modal) return;
  modal.classList.add('hidden');
  clearInterval(linkTimer);
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
  onIdentity(() => { render(); deps.onChange?.(profile()); });
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
