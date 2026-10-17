// Garage showroom (ticket 0072): browse every car on a turntable, compare specs, see how to
// unlock, buy, paint and upgrade, plus the full-screen reveal when a new car unlocks.
// DOM only; the rules live in src/cars.js and main.js passes in what it owns.

import { CAR_SPECS, STATS, STAT_LABELS, displayStats, isOwned, unlockProgress, buyCar } from './cars.js';
import { createTurntable } from './car-art.js';
import './garage.css';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MAX_UPGRADE = 5;

/**
 * @param deps {
 *   save: SaveStore, roster, liveries, underglows, upgradeDefs, sound,
 *   selectedIndex(): number, drive(index): void, changed(): void, reducedMotion(): boolean,
 * }
 */
export function createGarageUI(deps) {
  const { save, roster } = deps;
  let viewIdx = 0;
  let turntable = null;
  let revealTable = null;
  const revealQueue = [];

  const data = () => save.data;
  const carAt = (i) => roster[((i % roster.length) + roster.length) % roster.length];
  const paintOf = (c) => {
    const id = data().garage.paint[c.id];
    const l = id ? deps.liveries.find((x) => x.id === id) : null;
    return { body: (l || c).body, cabin: (l || c).cabin };
  };
  const artFor = (c) => ({ shape: c.shape, ...paintOf(c), glow: c.glow });

  function specBars(el, car, compareTo) {
    const now = displayStats(car.id, data().upgrades);
    const base = CAR_SPECS[car.id].stats;
    const them = compareTo && compareTo.id !== car.id ? displayStats(compareTo.id, data().upgrades) : null;
    el.innerHTML = STATS.map((k) => {
      const delta = them ? now[k] - them[k] : 0;
      const tag = !them || Math.abs(delta) < 0.25 ? '' : delta > 0
        ? `<span class="spec-delta up">▲${(+delta.toFixed(1))}</span>`
        : `<span class="spec-delta down">▼${(+(-delta).toFixed(1))}</span>`;
      return `<div class="spec-row" data-stat="${k}">
        <span class="spec-label">${STAT_LABELS[k]}</span>
        <span class="spec-track"><span class="spec-base" style="width:${base[k] * 10}%"></span><span class="spec-up" style="left:${base[k] * 10}%;width:${Math.max(0, now[k] - base[k]) * 10}%"></span></span>
        <span class="spec-num">${(+now[k].toFixed(1))}${tag}</span>
      </div>`;
    }).join('');
  }

  function renderThumbs() {
    const box = $('garageThumbs');
    if (!box) return;
    box.innerHTML = '';
    roster.forEach((c, i) => {
      const owned = isOwned(data(), c.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `garage-thumb${i === viewIdx ? ' is-view' : ''}${i === deps.selectedIndex() ? ' is-driving' : ''}${owned ? '' : ' is-locked'}`;
      b.dataset.carId = c.id;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === viewIdx));
      b.setAttribute('aria-label', `${c.car}${owned ? '' : ' (locked)'}`);
      const p = paintOf(c);
      b.innerHTML = `<span class="thumb-swatch" style="background:linear-gradient(135deg, ${owned ? p.body : '#1e1b3a'}, ${owned ? c.glow : '#0f172a'})"></span><span class="thumb-name">${owned ? '' : '🔒 '}${esc(c.car.replace(/^'\d\d /, ''))}</span>`;
      b.addEventListener('click', () => show(i));
      box.appendChild(b);
    });
    const cur = box.children[viewIdx];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: deps.reducedMotion() ? 'auto' : 'smooth' });
  }

  function renderPrimary(c) {
    const btn = $('btnGaragePrimary');
    const owned = isOwned(data(), c.id);
    const driving = roster.indexOf(c) === deps.selectedIndex();
    const prog = unlockProgress(data(), c.id);
    btn.disabled = false;
    btn.dataset.action = '';
    if (owned && driving) {
      btn.textContent = '✓ YOUR RIDE';
      btn.className = 'garage-primary is-current';
      btn.dataset.action = 'race';
    } else if (owned) {
      btn.textContent = 'DRIVE THIS CAR ➔';
      btn.className = 'garage-primary is-drive';
      btn.dataset.action = 'drive';
    } else if (CAR_SPECS[c.id].unlock.type === 'coins') {
      btn.textContent = prog.buyable ? `BUY FOR ⚡ ${prog.need.toLocaleString()}` : `NEED ⚡ ${prog.need.toLocaleString()}`;
      btn.className = `garage-primary ${prog.buyable ? 'is-buy' : 'is-locked'}`;
      btn.dataset.action = prog.buyable ? 'buy' : '';
      btn.disabled = !prog.buyable;
    } else {
      btn.textContent = '🔒 LOCKED';
      btn.className = 'garage-primary is-locked';
      btn.disabled = true;
    }
  }

  function renderUnlock(c) {
    const box = $('garageUnlock');
    const owned = isOwned(data(), c.id);
    box.classList.toggle('hidden', owned);
    if (owned) return;
    const p = unlockProgress(data(), c.id);
    $('garageUnlockText').textContent = `🔓 ${p.text}`;
    const pct = Math.round((Math.min(p.have, p.need) / Math.max(1, p.need)) * 100);
    $('garageUnlockBar').style.width = `${pct}%`;
    $('garageUnlockCount').textContent = CAR_SPECS[c.id].unlock.type === 'coins'
      ? `YOU HAVE ⚡ ${(data().fluxCoins || 0).toLocaleString()}`
      : CAR_SPECS[c.id].unlock.type === 'medal' ? 'PICK THE LEVEL IN EVENTS AND GO FOR IT' : `${p.have} / ${p.need}`;
  }

  function renderPaint(c) {
    const owned = isOwned(data(), c.id);
    const livRow = $('liverySelectRow');
    livRow.innerHTML = '';
    const current = data().garage.paint[c.id] || '';
    const options = [{ id: '', name: 'Factory', body: c.body, cabin: c.cabin }, ...deps.liveries];
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `paint-swatch${current === opt.id ? ' is-on' : ''}`;
      b.disabled = !owned;
      b.title = opt.name;
      b.setAttribute('aria-label', `Paint: ${opt.name}`);
      b.dataset.paint = opt.id || 'FACTORY';
      b.style.background = `linear-gradient(135deg, ${opt.body} 0 58%, ${opt.cabin} 58% 100%)`;
      b.addEventListener('click', () => {
        if (opt.id) data().garage.paint[c.id] = opt.id;
        else delete data().garage.paint[c.id];
        save.save();
        deps.sound.playCoinPickup();
        show(viewIdx);
        deps.changed();
      });
      livRow.appendChild(b);
    }
    const glowRow = $('underglowSelectRow');
    glowRow.innerHTML = '';
    for (const opt of deps.underglows) {
      const b = document.createElement('button');
      b.type = 'button';
      const on = data().underglow === opt.color;
      b.className = `paint-swatch glow${on ? ' is-on' : ''}`;
      b.title = opt.name;
      b.setAttribute('aria-label', `Underglow: ${opt.name}`);
      b.style.background = opt.color;
      b.style.boxShadow = on ? `0 0 14px ${opt.color}` : 'none';
      b.addEventListener('click', () => {
        data().underglow = opt.color;
        save.save();
        show(viewIdx);
        deps.changed();
      });
      glowRow.appendChild(b);
    }
  }

  function renderUpgrades() {
    const listEl = $('upgradesList');
    listEl.innerHTML = '';
    for (const def of deps.upgradeDefs) {
      const lvl = data().upgrades[def.key] || 1;
      const isMax = lvl >= MAX_UPGRADE;
      const cost = def.baseCost * lvl;
      const canAfford = !isMax && data().fluxCoins >= cost;
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-arcade text-[11px] font-bold text-white">${def.icon} ${esc(def.title)}</span>
        </div>
        <div class="tier-pips" aria-label="Tier ${lvl} of ${MAX_UPGRADE}">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<span class="${i < lvl ? 'on' : ''}"></span>`).join('')}</div>
        <p class="text-[10px] text-slate-400 leading-snug">${esc(def.desc)}</p>
        <button type="button" data-upgrade="${def.key}" class="upgrade-buy ${isMax ? 'is-max' : canAfford ? 'is-buy' : 'is-locked'}" ${isMax || !canAfford ? 'disabled' : ''}>
          ${isMax ? 'MAXED ✓' : `TIER ${lvl + 1} • ⚡ ${cost}`}
        </button>`;
      const btn = card.querySelector('button');
      if (!isMax && canAfford) {
        btn.addEventListener('click', () => {
          if (data().fluxCoins < cost || data().upgrades[def.key] >= MAX_UPGRADE) return;
          data().fluxCoins -= cost;
          data().upgrades[def.key] = lvl + 1;
          save.save();
          deps.sound.playCoinPickup();
          render();
          deps.changed();
        });
      }
      listEl.appendChild(card);
    }
  }

  function show(i) {
    viewIdx = ((i % roster.length) + roster.length) % roster.length;
    const c = carAt(viewIdx);
    const spec = CAR_SPECS[c.id];
    const owned = isOwned(data(), c.id);
    $('garageCarName').textContent = c.car;
    $('garageDriver').textContent = `${c.driver} · ${c.franchise}`;
    $('garagePerk').textContent = `★ ${c.perk}`;
    $('garageClassChip').textContent = spec.cls;
    $('garageCounter').textContent = `${viewIdx + 1} / ${roster.length}`;
    $('garageCoinsText').textContent = `⚡ ${(data().fluxCoins || 0).toLocaleString()}`;
    $('garageModal').dataset.viewCar = c.id;
    specBars($('garageSpecs'), c, carAt(deps.selectedIndex()));
    renderUnlock(c);
    renderPrimary(c);
    renderPaint(c);
    renderThumbs();
    if (turntable) turntable.set(artFor(c), !owned);
  }

  function render() {
    show(viewIdx);
    renderUpgrades();
  }

  function primaryAction() {
    const c = carAt(viewIdx);
    const action = $('btnGaragePrimary').dataset.action;
    if (action === 'drive') {
      deps.drive(viewIdx);
      deps.sound.playCheckpoint();
      if (turntable) turntable.flourish();
      render();
    } else if (action === 'buy') {
      if (buyCar(data(), c.id)) {
        save.save();
        deps.drive(viewIdx);
        render();
        deps.changed();
        queueReveals([c.id]);
      }
    } else if (action === 'race') {
      $('btnResumeFromGarage').click();
    }
  }

  // Swipe the stage to change car; a slow drag turns the turntable instead.
  function bindSwipe() {
    const stage = $('garageStage');
    let x0 = 0, t0 = 0, active = false;
    stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; t0 = performance.now(); active = true; });
    stage.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 60 && performance.now() - t0 < 320) show(viewIdx + (dx < 0 ? 1 : -1));
    });
  }

  function bind() {
    $('btnGaragePrev').addEventListener('click', () => show(viewIdx - 1));
    $('btnGarageNext').addEventListener('click', () => show(viewIdx + 1));
    $('btnGaragePrimary').addEventListener('click', primaryAction);
    $('btnRevealDrive').addEventListener('click', () => closeReveal(true));
    $('btnRevealLater').addEventListener('click', () => closeReveal(false));
    window.addEventListener('keydown', (e) => {
      if (!$('carRevealOverlay').classList.contains('hidden')) {
        if (e.code === 'Enter') { e.preventDefault(); closeReveal(true); }
        if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeReveal(false); }
        return;
      }
      if ($('garageModal').classList.contains('hidden')) return;
      if (e.code === 'ArrowLeft') { e.preventDefault(); show(viewIdx - 1); }
      if (e.code === 'ArrowRight') { e.preventDefault(); show(viewIdx + 1); }
    }, true);
    bindSwipe();
  }

  // --- New car reveal ---
  function queueReveals(ids) {
    for (const id of ids) if (!revealQueue.includes(id)) revealQueue.push(id);
    if ($('carRevealOverlay').classList.contains('hidden')) nextReveal();
  }

  function nextReveal() {
    const id = revealQueue.shift();
    if (!id) return;
    const c = roster.find((x) => x.id === id);
    if (!c) { nextReveal(); return; }
    const g = data().garage;
    if (!g.revealed.includes(id)) { g.revealed.push(id); save.save(); }
    $('carRevealName').textContent = c.car;
    $('carRevealClass').textContent = CAR_SPECS[id].cls;
    specBars($('carRevealSpecs'), c, carAt(deps.selectedIndex()));
    const ov = $('carRevealOverlay');
    ov.dataset.carId = id;
    ov.classList.remove('hidden');
    ov.classList.toggle('calm', deps.reducedMotion());
    if (!revealTable) revealTable = createTurntable($('carRevealCanvas'), { reducedMotion: deps.reducedMotion() });
    revealTable.set(artFor(c), false);
    revealTable.flourish();
    deps.sound.playStunt();
  }

  function closeReveal(drive) {
    const ov = $('carRevealOverlay');
    const id = ov.dataset.carId;
    ov.classList.add('hidden');
    if (drive && id) {
      const i = roster.findIndex((x) => x.id === id);
      if (i >= 0) deps.drive(i);
      if (!$('garageModal').classList.contains('hidden')) show(i);
      deps.changed();
    }
    if (revealQueue.length) nextReveal();
    else if (revealTable) { revealTable.dispose(); revealTable = null; }
  }

  /** Cars unlocked earlier but never celebrated (e.g. earned while the garage was closed). */
  function unrevealed() {
    const g = data().garage;
    return g.owned.filter((id) => CAR_SPECS[id].unlock.type !== 'starter' && !g.revealed.includes(id));
  }

  function stopTurntable() {
    if (turntable) { turntable.dispose(); turntable = null; }
  }

  bind();
  // Whoever hides the garage (resume, race start, Esc), the turntable stops drawing.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if ($('garageModal').classList.contains('hidden')) stopTurntable();
    }).observe($('garageModal'), { attributes: true, attributeFilter: ['class'] });
  }

  return {
    open(focusId) {
      const focus = focusId ? roster.findIndex((c) => c.id === focusId) : -1;
      viewIdx = focus >= 0 ? focus : deps.selectedIndex();
      if (!turntable) turntable = createTurntable($('garageCanvas'), { reducedMotion: deps.reducedMotion() });
      render();
      const pending = unrevealed();
      if (pending.length) queueReveals(pending);
    },
    close: stopTurntable,
    render,
    queueReveals,
    get viewIndex() { return viewIdx; },
  };
}
