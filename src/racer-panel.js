// The RACER panel (ticket 0090): who's playing on this device, moving to another device,
// a recovery code, and forgetting the device. No login anywhere. Loaded on first open
// (src/racer-ui.js) so the title's bundle stays small; built from JS so it can sit beside
// any title/settings layout.

import {
  profile, publicId, racers, createLinkCode, createRecoveryCode,
  redeemCode, switchRacer, newRacer, forgetDevice, bests,
} from './identity.js';
import { swapSave, dropSave } from './racer-saves.js';
import { mergeServerBests } from './progress.js';

let deps = null; // { SaveStore, freshSaveData, levels, reload } from initRacer
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

export function renderPanel() {
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

export function openPanel(withDeps, { code } = {}) {
  deps = withDeps;
  if (!modal) build();
  renderPanel();
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

