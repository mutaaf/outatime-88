// Marquee ads (owner decision 2026-10-30, AGENTS.md §3.3 and docs/ADS.md § Marquee): a lazy chunk.
// Players are kids, so Google ads (child-directed, served by the same-origin loader /ads/v1/ads.js)
// only ever run in MENUS: the title banner, an interstitial on the way back to the title after a
// race (never after the session's first race, never from a live room or TV mode) and an opt-in
// rewarded video on the results card. During a race only the first-party sponsor boards show.
// Every call is fire-and-forget: the game never waits on an ad, and with no loader it is a no-op.

/** Statuses where an ad may be asked for. Anything else is a race (PLAYING, PAUSED, GRID). */
export const MENU_STATUSES = ['TITLE', 'GAMEOVER'];

let deps = null; // { state, save, sound, hold(on), tv }
let finished = 0; // solo races finished this session
let offerFor = 0; // the finished race the 2× COINS offer belongs to (claimed → 0)

/** The loader's API, or null while it hasn't loaded (or never will: blocked, offline, local). */
const marquee = () => { const m = window.marquee; return m && m.v ? m : null; };

const inMenu = () => !!deps && !deps.tv && deps.state.mode !== 'LIVE' && MENU_STATUSES.includes(deps.state.status);

export function initAds(d) {
  deps = d;
  const btn = document.getElementById('btnBonusAd');
  if (btn) btn.addEventListener('click', watchBonus);
}

/** beforeAd/afterAd: freeze the frame loop and silence the mix (not the saved mute) while it plays. */
function breakHooks() {
  let held = false;
  const quiet = (on) => {
    const s = deps.sound;
    try {
      if (on && window.speechSynthesis) window.speechSynthesis.cancel();
      if (!s.ctx || !s.masterGain) return;
      const t = s.ctx.currentTime;
      s.masterGain.gain.cancelScheduledValues(t);
      s.masterGain.gain.setValueAtTime(on || s.muted ? 0 : s.volume, t);
    } catch { /* audio is best effort */ }
  };
  return {
    beforeAd() { if (held) return; held = true; deps.hold(true); quiet(true); },
    afterAd() { if (!held) return; held = false; quiet(false); deps.hold(false); },
  };
}

/** Results card is up after a solo race: count it and offer 2× COINS when the slot has fill. */
export function onResults() {
  if (!deps || deps.state.mode === 'LIVE') return;
  const race = ++finished;
  offerFor = 0;
  const btn = document.getElementById('btnBonusAd');
  if (btn) btn.classList.add('hidden');
  const m = marquee();
  if (!m || !btn || !inMenu() || !(deps.state.runCoins > 0)) return;
  m.ready().then((cfg) => {
    const slot = cfg && cfg.enabled && cfg.slots && cfg.slots.bonus;
    if (!slot || slot.source === 'none' || race !== finished || !inMenu()) return;
    offerFor = race;
    btn.classList.remove('hidden');
  }).catch(() => {});
}

/** The player tapped "Watch a short ad for 2× coins" (opt-in only, never shown in a race). */
export function watchBonus() {
  const m = marquee();
  const race = offerFor;
  const btn = document.getElementById('btnBonusAd');
  if (!m || !race || !inMenu()) return;
  if (btn) btn.disabled = true;
  m.rewarded('bonus', breakHooks()).then((earned) => {
    if (btn) btn.disabled = false;
    if (!earned || offerFor !== race) return;
    offerFor = 0;
    const { state, save } = deps;
    const bonus = Math.max(0, Math.round(state.runCoins));
    state.runCoins += bonus;
    save.data.fluxCoins += bonus;
    save.save();
    const coins = document.getElementById('endCoinsText');
    if (coins) coins.textContent = `+${state.runCoins} ⚡ (2×)`;
    const total = document.getElementById('titleTotalWarps');
    if (total) total.textContent = `⚡ ${save.data.fluxCoins}`;
    if (btn) btn.classList.add('hidden');
  }).catch(() => { if (btn) btn.disabled = false; });
}

/** Back on the title from a solo race's results: an interstitial, from the second race on. The
 *  server caps how often (Marquee `frequency_sec`, 120 s by default). */
export function onMenuReturn({ live = false } = {}) {
  offerFor = 0;
  const m = marquee();
  if (!m || live || finished < 2 || !inMenu()) return;
  m.interstitial('postrace', breakHooks()).catch(() => {});
}
