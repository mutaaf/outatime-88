// Home flow (ticket 0185), a lazy chunk fetched right after boot:
//   · the home screen sells the game: ranked hooks (src/home-hooks.js), or a 3-beat pitch on a
//     first visit, over the attract road, where an AI driver now weaves through the traffic;
//   · every end state comes home: results get PLAY AGAIN + HOME, go home by themselves after
//     20 s untouched, and Escape / browser Back / gamepad B go home too; pause has QUIT TO HOME;
//   · browser history: a race is one history entry, so Back never leaves the game mid-race and
//     never re-launches one.
// main.js owns the state change itself (showTitle); this module only decides when and draws.
import './home.css';
import { HOME_IDLE_MS, PITCH, homeHooks, isFirstVisit, noteNewsSeen } from './home-hooks.js';
import { POP_CULTURE_ROSTER, ROAD_CFG } from './data.js';
import { frameTitle } from './title-frame.js';
import { InputState } from './input.js';

/**
 * h: { state (GameState), save (SaveStore), goHome(), play(), daily(), garage(carId), ranks(),
 *      tv(), pause(), leaveLive(), bigScreen, touchActive(), road (LiveTraffic) }
 */
export function createHome(h) {
  const $ = (id) => document.getElementById(id);
  const shown = (id) => { const el = $(id); return !!el && !el.classList.contains('hidden'); };
  const S = h.state;
  const reduced = () => !!S.reducedMotion;
  const names = Object.fromEntries(POP_CULTURE_ROSTER.map((c) => [c.id, c.car.replace(/^'\d+\s+/, '')]));

  // ---------- home screen: hooks or the pitch ----------
  const rail = $('homeHooks');
  const title = $('titleScreen');
  let newsCounted = false;
  const onTv = /[?&](screen=tv|tv)(&|=|$)/.test(location.search); // already on the TV: no "play on a TV" card

  function renderTitle() {
    if (!rail) return;
    const save = h.save.data;
    const first = isFirstVisit(save);
    title.classList.add('has-hooks');
    title.classList.toggle('is-first', first);
    rail.classList.toggle('is-pitch', first);
    rail.textContent = '';
    if (first) {
      const pitch = document.createElement('ol');
      pitch.className = 'home-pitch';
      pitch.setAttribute('aria-label', 'OUTATIME 88 in three beats');
      PITCH.forEach((t, i) => {
        const li = document.createElement('li');
        li.textContent = t;
        li.style.setProperty('--i', i);
        pitch.append(li);
      });
      rail.append(pitch);
      return;
    }
    const rival = ($('titleRival') && $('titleRival').textContent.trim()) || '';
    const hooks = homeHooks(save, { now: Date.now(), names, rival, bigScreen: h.bigScreen && !onTv });
    hooks.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `home-hook hook-${k.id}${k.isNew ? ' is-new' : ''}`;
      b.dataset.hook = k.id;
      b.style.setProperty('--i', i);
      const icon = document.createElement('span');
      icon.className = 'hook-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = k.icon;
      const text = document.createElement('span');
      text.className = 'hook-text';
      const t = document.createElement('b');
      t.textContent = k.title;
      const l = document.createElement('small');
      l.textContent = k.line;
      text.append(t, l);
      b.append(icon, text);
      if (k.progress != null) {
        const bar = document.createElement('i');
        bar.className = 'hook-bar';
        bar.style.setProperty('--p', Math.max(0.03, Math.min(1, k.progress)).toFixed(3));
        b.append(bar);
      }
      b.setAttribute('aria-label', `${k.title}. ${k.line}`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (k.isNew) { noteNewsSeen(save, k.id, true); h.save.save(); }
        act(k);
      });
      rail.append(b);
      if (k.isNew && !newsCounted) { noteNewsSeen(save, k.id); h.save.save(); newsCounted = true; }
    });
  }

  function act(k) {
    if (k.act === 'daily') h.daily();
    else if (k.act === 'garage') h.garage(k.car);
    else if (k.act === 'ranks') h.ranks();
    else if (k.act === 'tv') h.tv();
    else h.play();
  }

  // The rival line arrives later (identity, then the boards): redraw when it lands.
  const rivalEl = $('titleRival');
  if (rivalEl) new MutationObserver(() => { if (!title.classList.contains('hidden')) renderTitle(); }).observe(rivalEl, { childList: true, characterData: true, subtree: true });

  // ---------- the attract road: an AI driver ----------
  // Only on the home screen; every race start resets playerX/carYaw, so the sim never sees it.
  // The road's bodies cruise along, clear of the hero car (src/title-frame.js, ticket 0192).
  let t = 0, x = 0, vx = 0, lastPos = -1;
  function attract(dt) {
    if (S.status !== 'TITLE') { t = 0; lastPos = -1; return; }
    t += dt;
    if (h.road) {
      // Back from a race (attract doesn't run mid-race) the step is the whole race: count it as 0.
      const step = S.trackPos - lastPos;
      const dz = lastPos < 0 || step < 0 || step > 4000 ? 0 : step;
      lastPos = S.trackPos;
      frameTitle(h.road, S.trackPos + ROAD_CFG.playerZOffset, dz);
    }
    // A lazy weave across the lanes, two sine waves so it never looks like a metronome.
    const target = reduced() ? 0 : 0.42 * Math.sin(t * 0.55) + 0.16 * Math.sin(t * 1.37 + 1.1);
    const ax = (target - x) * 6 - vx * 3.2;
    vx += ax * dt;
    x += vx * dt;
    S.playerX = x;
    S.carYaw = Math.max(-0.25, Math.min(0.25, vx * 0.7));
  }

  // ---------- results: PLAY AGAIN / HOME, idle home, keys, pad ----------
  const modal = $('gameOverModal');
  const homeBtn = $('btnHomeFromEnd');
  let idleTimer = 0, idleAt = 0;
  const q = new URLSearchParams(location.search);
  const idleMs = (q.has('debug') && Number(q.get('homeIdle'))) || HOME_IDLE_MS; // e2e: ?debug&homeIdle=ms

  // Reading the board, sharing, or half-way through typing initials (an empty, auto-focused
  // initials box doesn't count) holds the results on screen.
  const typing = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && a.value !== ''; };
  const blocking = () => ['shareSheet', 'leaderboardModal', 'garageModal', 'settingsModal', 'startModal'].some(shown) || typing();

  function armIdle() {
    clearTimeout(idleTimer);
    if (!shown('gameOverModal')) { if (homeBtn) homeBtn.style.removeProperty('--idle'); return; }
    idleAt = Date.now();
    if (homeBtn) { homeBtn.classList.remove('is-idle'); void homeBtn.offsetWidth; homeBtn.style.setProperty('--idle', `${idleMs}ms`); homeBtn.classList.add('is-idle'); }
    idleTimer = setTimeout(idleHome, idleMs);
  }
  function idleHome() {
    if (!shown('gameOverModal') || S.status !== 'GAMEOVER') return;
    if (blocking()) { armIdle(); return; } // reading the board or typing initials: wait
    goHome();
  }
  function goHome() {
    clearTimeout(idleTimer);
    h.goHome();
    // The race's history entry is spent: step back over it so Back from home leaves cleanly.
    if (history.state && history.state.otRace) { skipPop = true; history.back(); }
  }
  if (homeBtn) homeBtn.addEventListener('click', goHome);
  if (modal) {
    new MutationObserver(() => { armIdle(); padPrev = null; }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) modal.addEventListener(ev, () => { if (Date.now() - idleAt > 400) armIdle(); }, { passive: true });
  }
  // The share sheet and boards open over the results: their activity counts as not idle.
  for (const id of ['shareSheet', 'leaderboardModal']) {
    const el = $(id);
    if (el) el.addEventListener('pointerdown', () => armIdle(), { passive: true });
  }

  // Pause menus: QUIT TO HOME (solo races only; a live race has its own LEAVE).
  document.addEventListener('click', (e) => {
    const q = e.target.closest && e.target.closest('[data-home]');
    if (!q) return;
    e.preventDefault();
    for (const id of ['garageModal', 'settingsModal']) { const el = $(id); if (el) el.classList.add('hidden'); }
    goHome();
  });
  const syncQuit = () => {
    const can = (S.status === 'PAUSED' || S.status === 'PLAYING') && S.mode !== 'LIVE';
    document.querySelectorAll('[data-home]').forEach((b) => b.classList.toggle('hidden', !can));
  };
  for (const id of ['garageModal', 'settingsModal']) {
    const el = $(id);
    if (el) new MutationObserver(syncQuit).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  syncQuit();

  // Escape on the results = home (it would open the garage); Enter = play again.
  window.addEventListener('keydown', (e) => {
    if (!shown('gameOverModal') || S.status !== 'GAMEOVER' || blocking()) return;
    // In the (auto-focused) initials box only Escape means home; Backspace and Enter edit/post.
    const inInput = !!(e.target && e.target.tagName === 'INPUT');
    if (e.code === 'Escape' || (e.code === 'Backspace' && !inInput)) { e.preventDefault(); e.stopImmediatePropagation(); goHome(); }
    else if (inInput) return;
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !(e.target && e.target.closest && e.target.closest('button, a, input'))) {
      e.preventDefault(); e.stopImmediatePropagation(); clickIf('btnPlayAgain');
    }
  }, true);

  const clickIf = (id) => { const b = $(id); if (b && b.offsetParent) b.click(); };

  // Gamepad on menus: A / START = play (again), B = home. Only fresh presses count, so the gas
  // held across the finish line never skips the results.
  let padPrev = null;
  function pollPad() {
    requestAnimationFrame(pollPad);
    const onResults = shown('gameOverModal') && S.status === 'GAMEOVER';
    const onTitle = S.status === 'TITLE' && !title.classList.contains('hidden');
    if ((!onResults && !onTitle) || blocking() || !navigator.getGamepads) { padPrev = null; return; }
    const pads = navigator.getGamepads();
    let a = false, b = false;
    for (const p of pads) {
      if (!p) continue;
      a = a || !!(p.buttons[0] && p.buttons[0].pressed) || !!(p.buttons[9] && p.buttons[9].pressed);
      b = b || !!(p.buttons[1] && p.buttons[1].pressed);
    }
    if (a || b) InputState.lastInput = 'pad'; // the grid's prompts name the pad's buttons (0111)
    if (padPrev) {
      if (a && !padPrev.a) { if (onResults) clickIf('btnPlayAgain'); else h.play(); }
      else if (b && !padPrev.b && onResults) goHome();
    }
    padPrev = { a, b };
  }
  requestAnimationFrame(pollPad);

  // ---------- browser history ----------
  // A race start adds one entry (the touch kit adds the same one); Back pops it: from the
  // results that's home, mid-race it's the pause menu (and the entry is put back).
  let skipPop = false;
  let titleUp = !title.classList.contains('hidden');
  new MutationObserver(() => {
    const up = !title.classList.contains('hidden');
    if (up === titleUp) return; // our own class edits (has-hooks) land here too
    titleUp = up;
    if (up) { newsCounted = false; renderTitle(); return; }
    if (S.status !== 'TITLE' && !(history.state && history.state.otRace)) {
      try { history.pushState({ otRace: 1 }, ''); } catch { /* sandboxed */ }
    }
  }).observe(title, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop = false; return; }
    if (S.status === 'GAMEOVER') { clearTimeout(idleTimer); h.goHome(); }
    else if (S.status === 'LIVE_DONE') h.leaveLive();
    else if ((S.status === 'PLAYING' || S.status === 'PAUSED') && !h.touchActive()) {
      // The touch kit handles this itself on touch screens (src/touch/bridge.js).
      if (S.status === 'PLAYING') h.pause();
      try { history.pushState({ otRace: 1 }, ''); } catch { /* sandboxed */ }
    }
  });

  renderTitle();
  return { renderTitle, attract, debug: () => ({ idleAt, hooks: [...(rail ? rail.querySelectorAll('[data-hook]') : [])].map((b) => b.dataset.hook) }) };
}
