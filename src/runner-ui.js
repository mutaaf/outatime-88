// Endless runner UI (ticket 0151), a lazy chunk: the three run goals on the title, the pause
// panel and the results, and the coins-only CONTINUE offer. main.js owns the rules
// (src/runner.js) and calls in here; nothing here changes the simulation by itself.
import { runnerMult } from './runner.js';
import { ensureGoals, checkGoals, goalLabel, goalProgress } from './runner-goals.js';
import { POWER, POWER_KINDS, UPGRADE, ensurePower, powerSecs, upgradeCost, buyUpgrade } from './powerups.js';

export { goalLabel };

/** The save's goals (repaired/created). */
export const goalsOf = (save) => ensureGoals(save);

/** Check this run against the goals; returns newly met ones (`.levelUp` when a set completes). */
export const checkRun = (save, stats) => checkGoals(ensureGoals(save), stats);

const $ = (id) => document.getElementById(id);

/** Fill one goals list (`ul`) with the three goals and this run's progress. */
function fillList(ul, goals, stats) {
  if (!ul) return;
  const key = goals.active.map((g) => `${g.type}:${g.target}:${g.done ? 1 : 0}:${goalProgress(g, stats)}`).join('|') + goals.level;
  if (ul.dataset.key === key) return; // nothing changed: no DOM writes
  ul.dataset.key = key;
  ul.textContent = '';
  const head = document.createElement('li');
  head.className = 'goals-head';
  head.textContent = `⭐ ENDLESS LV ${goals.level + 1} · ×${runnerMult(goals.level).toFixed(1)} PTS · DO ALL 3 TO LEVEL UP`;
  ul.appendChild(head);
  for (const g of goals.active) {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : '';
    const label = document.createElement('span');
    label.textContent = `${g.done ? '✓' : '🎯'} ${goalLabel(g)}`;
    const prog = document.createElement('b');
    prog.textContent = goalProgress(g, stats);
    li.append(label, prog);
    ul.appendChild(li);
  }
}

/** Title line: short, one row. */
function titleLine(goals) {
  const el = $('titleGoals');
  if (!el) return;
  const done = goals.active.filter((g) => g.done).length;
  const next = goals.active.find((g) => !g.done);
  el.textContent = `⭐ LV ${goals.level + 1} ×${runnerMult(goals.level).toFixed(1)} · 🎯 ${done}/3${next ? ` · ${goalLabel(next)}` : ''}`;
}

/**
 * The power-up shop (0177) on the results card and in the pause panel: one button per power-up,
 * its level pips, how long it lasts and the next level's price in earned FLUX cash (no money).
 */
function fillShop(box, save, onSave) {
  if (!box) return;
  const lv = ensurePower(save);
  const coins = save.fluxCoins | 0;
  const key = POWER_KINDS.map((k) => lv[k]).join(',') + '|' + coins;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.textContent = '';
  const head = document.createElement('div');
  head.className = 'shop-head';
  head.textContent = `⚡ POWER-UP UPGRADES · YOU HAVE ${coins.toLocaleString()} ⚡`;
  box.appendChild(head);
  for (const k of POWER_KINDS) {
    const P = POWER[k], l = lv[k], cost = upgradeCost(l);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shop-item';
    b.dataset.kind = k;
    b.style.setProperty('--pc', P.color);
    b.disabled = !cost || coins < cost;
    const pips = '●'.repeat(l) + '○'.repeat(UPGRADE.max - l);
    const secs = (s) => `${Math.round(s * 10) / 10}s`;
    b.setAttribute('aria-label', `${P.name} level ${l} of ${UPGRADE.max}, lasts ${secs(powerSecs(k, l))}${cost ? `, upgrade for ${cost} flux cash` : ', maxed'}`);
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = `${P.icon} ${P.name}`;
    const info = document.createElement('small');
    info.textContent = `${pips} ${secs(powerSecs(k, l))}${cost ? ` → ${secs(powerSecs(k, l + 1))}` : ''}`;
    const price = document.createElement('b');
    price.textContent = cost ? `${cost.toLocaleString()} ⚡` : 'MAX';
    b.append(name, info, price);
    b.onclick = () => {
      const r = buyUpgrade(save, k);
      if (!r.ok) return;
      if (onSave) onSave();
      b.classList.add('bought');
      fillShop(box, save, onSave);
    };
    box.appendChild(b);
  }
}

/** Repaint every goals view (cheap when nothing changed). `endless` hides them in other modes. */
export function renderGoals(save, stats, endless, onSave) {
  const goals = ensureGoals(save);
  for (const id of ['pauseGoals', 'endGoals']) {
    const ul = $(id);
    if (!ul) continue;
    ul.classList.toggle('hidden', !endless);
    if (endless) fillList(ul, goals, stats);
  }
  for (const id of ['pauseShop', 'endShop']) {
    const box = $(id);
    if (!box) continue;
    box.classList.toggle('hidden', !endless);
    if (endless) fillShop(box, save, onSave);
  }
  titleLine(goals);
}

let offer = null;
/**
 * The CONTINUE offer: one per run, paid in earned FLUX cash only. Counts down `secs`; tapping
 * CONTINUE (or Enter) calls onYes, END RUN / Escape / time running out calls onNo.
 */
export function offerContinue({ cost, coins, secs, reason, onYes, onNo }) {
  const box = $('continueOffer');
  if (!box) { onNo(); return; }
  closeOffer();
  $('continueReason').textContent = reason;
  $('continueCost').textContent = `${cost.toLocaleString()} ⚡`;
  $('continueWallet').textContent = `YOU HAVE ${coins.toLocaleString()} ⚡`;
  box.classList.remove('hidden');
  const yes = $('btnContinueYes'), no = $('btnContinueNo'), clock = $('continueClock');
  const t0 = performance.now();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    closeOffer();
    (ok ? onYes : onNo)();
  };
  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); finish(true); }
    else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  };
  const tick = () => {
    const left = Math.max(0, secs - (performance.now() - t0) / 1000);
    clock.textContent = String(Math.ceil(left));
    clock.style.setProperty('--left', String(left / secs));
    if (left <= 0) finish(false);
  };
  const timer = setInterval(tick, 100);
  tick();
  yes.onclick = () => finish(true);
  no.onclick = () => finish(false);
  window.addEventListener('keydown', onKey, true);
  yes.focus({ preventScroll: true });
  offer = { box, timer, onKey };
}

function closeOffer() {
  if (!offer) return;
  clearInterval(offer.timer);
  window.removeEventListener('keydown', offer.onKey, true);
  offer.box.classList.add('hidden');
  offer = null;
}
