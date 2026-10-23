// Focus scope for the full-screen menus (ticket 0207): a menu that opens takes keyboard focus,
// Tab and Shift+Tab loop inside it, and when it closes focus goes back to the control that
// opened it. Lazy: src/home.js wires it at boot, so main pays nothing. It watches each menu's
// `hidden` class, so every way a menu opens or closes (buttons, Escape, the back gesture, a
// race starting) is covered without touching those code paths.

const CONTROLS = 'button, [href], input, select, textarea, [tabindex]';

/** Can a player see (and so Tab to) `el`? display:none, a hidden parent or visibility:hidden all say no. */
export function visible(el) {
  if (!el || !el.isConnected) return false;
  if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0;
}

/** The controls Tab can reach inside `root`, in document order: enabled, shown, not tabindex=-1. */
export function tabbables(root) {
  const out = [];
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (el.disabled || el.getAttribute('tabindex') === '-1' || !visible(el)) continue;
    out.push(el);
  }
  return out;
}

/** Where Tab (`back` = Shift+Tab) from `current` lands in `list`, wrapping at both ends. From
 *  outside the list Tab enters at the first control and Shift+Tab at the last. */
export function nextTab(list, current, back) {
  const n = list.length;
  if (!n) return null;
  const i = list.indexOf(current);
  if (i < 0) return back ? list[n - 1] : list[0];
  return list[(i + (back ? n - 1 : 1)) % n];
}

const open = []; // open scopes, most recent last: Tab belongs to the top one
let keysBound = false;
// The last two focused elements: a menu that focuses its own control as it opens (Settings
// focuses DONE) has already moved focus by the time its class change is seen.
let focusNow = null, focusBefore = null;
const onFocus = (e) => { if (e.target !== focusNow) { focusBefore = focusNow; focusNow = e.target; } };
// Focus dropped to nothing (Safari doesn't focus a clicked button): forget it, so a menu
// opened next never names an older control as its opener.
const onBlur = (e) => { if (!e.relatedTarget) { focusBefore = null; focusNow = null; } };
const outside = (el, a) => (a && a !== document.body && a.isConnected && !el.contains(a) ? a : null);

function onKey(e) {
  const top = open[open.length - 1];
  if (!top) return;
  // A panel that isn't scoped here (the racer panel over Settings) has focus: leave Tab to it.
  const a = document.activeElement;
  const d = a && !top.el.contains(a) && a.closest && a.closest('[role="dialog"]');
  if (d && d.id !== 'titleScreen' && visible(d)) return;
  if (e.key === 'Tab') {
    const to = nextTab(tabbables(top.el), document.activeElement, e.shiftKey);
    e.preventDefault();
    if (to) to.focus();
  } else if (e.key === 'Escape' && top.onEscape) {
    e.preventDefault();
    e.stopImmediatePropagation();
    top.onEscape();
  }
}

/** Is a menu open, and is `el` inside the top one? */
export const menuOpen = () => open.length > 0;
export const inTopMenu = (el) => open.length > 0 && open[open.length - 1].el.contains(el);

/**
 * Scope keyboard focus to `el` while it is shown (no `hidden` class).
 * - `canRestore()`: false while racing, so closing a pause menu never parks focus on a button
 *   the race keys would press.
 * - `onEscape()`: closes a menu that has no Escape of its own.
 */
export function scopeFocus(el, { canRestore = () => true, onEscape = null } = {}) {
  if (!el) return null;
  const scope = { el, onEscape, opener: null };
  if (!keysBound) { window.addEventListener('keydown', onKey, true); document.addEventListener('focusin', onFocus, true); document.addEventListener('focusout', onBlur, true); keysBound = true; }
  let shown = false;
  const sync = () => {
    const now = !el.classList.contains('hidden');
    if (now === shown) return;
    shown = now;
    const active = document.activeElement;
    if (now) {
      scope.opener = outside(el, active) || (el.contains(active) && active === focusNow ? outside(el, focusBefore) : null);
      open.push(scope);
      if (!el.contains(active)) {
        const first = tabbables(el)[0];
        if (first) first.focus({ preventScroll: true });
      }
      return;
    }
    const i = open.indexOf(scope);
    if (i >= 0) open.splice(i, 1);
    const opener = scope.opener;
    scope.opener = null;
    // Something else already took focus (another menu opened on close): leave it there.
    if (outside(el, active)) return;
    if (opener && visible(opener) && canRestore()) opener.focus({ preventScroll: true });
    else if (active && el.contains(active)) active.blur();
  };
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
  sync();
  return scope;
}
