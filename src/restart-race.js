// RESTART RACE on the pause sheet (0292), its own tiny lazy chunk fetched by src/race-late.js (so
// main and the home chunk carry nothing for it). The button is static markup in index.html,
// hidden until the sheet opens over a race that can restart (src/restart-opts.js decides). A
// press runs the same start the race began with (race-flow's startNewRace, as PLAY AGAIN: score,
// damage, distance, laps and the clock reset, then the lineup and lights) and races the same
// ghost again if there was one. Nothing of the abandoned attempt is recorded: only a finish
// writes the career and bests, and a race past the line offers no restart.
import { RACE_DEPS, RS } from './main.js';
import { RF, resumeHold } from './race-step.js';
import { restartOpts } from './restart-opts.js';

// On the TV (0175) the paired phone is the pad and has its own menu.
const onTv = () => document.body.classList.contains('tv-screen');

export function initRestart() {
  const btn = document.getElementById('btnRestartRace');
  const sheet = document.getElementById('garageModal');
  if (!btn || !sheet) return;
  const G = RACE_DEPS.GameState;
  const sync = () => btn.classList.toggle('hidden', sheet.classList.contains('hidden') || !restartOpts(G, onTv()));
  new MutationObserver(sync).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  sync();
  btn.addEventListener('click', () => {
    const opts = restartOpts(G, onTv());
    if (!opts || !RF) return;
    if (RS.lastGhost && !opts.daily) RS.pendingGhost = RS.lastGhost;
    btn.blur(); // the race takes the keys; no menu button keeps focus under the lights
    resumeHold(0, false, false); // as main's startNewRace: a new race ends any resume beat (0231)
    RF.startNewRace(opts);
  });
}
