// RESTART RACE on the pause sheet (0292), its own tiny lazy chunk fetched by src/race-late.js (so
// main and the home chunk carry nothing for it). The button is static markup in index.html,
// hidden until the sheet opens over a race that can restart (src/restart-opts.js decides). A
// press runs the same start the race began with (main's startNewRace path: race-flow resets
// score, damage, distance, laps and the clock, and goes through the lineup and lights); nothing
// of the abandoned attempt is recorded, since only a finish writes the career and bests.
import { RACE_DEPS } from './main.js';
import { RF, resumeHold } from './race-step.js';
import { restartOpts } from './restart-opts.js';

const TV = /[?&](screen=tv|tv)(&|=?$|=&)/.test(location.search); // the paired phone is the pad there (0175)

export function initRestart() {
  const btn = document.getElementById('btnRestartRace');
  const sheet = document.getElementById('garageModal');
  if (!btn || !sheet) return;
  const G = RACE_DEPS.GameState;
  const sync = () => btn.classList.toggle('hidden', sheet.classList.contains('hidden') || !restartOpts(G, TV));
  new MutationObserver(sync).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  sync();
  btn.addEventListener('click', () => {
    const opts = restartOpts(G, TV);
    if (!opts || !RF) return;
    const s = document.getElementById('settingsModal');
    if (s) s.classList.add('hidden');
    btn.blur(); // the race takes the keys; no menu button keeps focus under it
    resumeHold(0, false, false); // as main's startNewRace: a new race ends any resume beat (0231)
    RF.startNewRace(opts);
  });
}
