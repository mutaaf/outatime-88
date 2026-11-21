// The results card as a dialog (ticket 0294), its own lazy chunk (fetched by src/results-ui.js) with
// no imports, so neither results-ui nor home grow past their budgets. As the card opens it focuses
// PLAY AGAIN (the initials box keeps focus when it asked first), Tab and Shift+Tab loop on the card,
// and HOME hands focus to the title's PLAY. data-auto marks the PLAY AGAIN the card focused until the
// player moves focus: src/home.js then ignores Space (boost) on it. Not a focus-scope menu, so the
// pad keeps its results rules (A / START again, B home).

const MENUS = ['startModal', 'settingsModal', 'garageModal', 'carRevealOverlay', 'leaderboardModal', 'shareSheet'];
const $ = (id) => document.getElementById(id);
const shown = (el) => !!el && !el.classList.contains('hidden');

/** `S`: GameState (status). */
export function initResultsFocus(S) {
  const modal = $('gameOverModal');
  if (!modal) return;
  const tabbables = () => [...modal.querySelectorAll('button, input, [href]')].filter((b) => !b.disabled && b.getClientRects().length);
  document.addEventListener('focusin', (e) => { const b = $('btnPlayAgain'); if (b && e.target !== b) delete b.dataset.auto; });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !shown(modal) || S.status !== 'GAMEOVER') return;
    const a = document.activeElement;
    // Focus on something over the card (an ad, a menu with its own focus scope): leave Tab to it.
    if ((a && a !== document.body && !modal.contains(a)) || MENUS.some((id) => shown($(id)))) return;
    const list = tabbables(), n = list.length, i = list.indexOf(a);
    e.preventDefault();
    if (n) list[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();
  }, true);
  let up = false;
  const sync = () => {
    const now = shown(modal);
    if (now === up) return;
    up = now;
    const a = document.activeElement, again = $('btnPlayAgain');
    if (now) {
      if (again && !modal.contains(a)) { again.focus({ preventScroll: true }); again.dataset.auto = ''; }
      return;
    }
    if (again) delete again.dataset.auto;
    if (a && a !== document.body && !modal.contains(a)) return; // something else took focus
    const play = $('btnStartRace');
    if (play && S.status === 'TITLE' && play.getClientRects().length) play.focus({ preventScroll: true });
    else if (a && modal.contains(a)) a.blur();
  };
  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['class'] });
  sync();
}
