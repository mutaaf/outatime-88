// Events panel: the level cards with medals and bests (split out of main.js to keep the boot
// bundle in budget). Rendered on demand when the panel opens.
import { LEVEL_MEDALS, MEDAL_ICON } from './progress.js';

export function renderLevelGrid({ GameState, SaveStore, levels, shortScore, picked }) {
  const grid = document.getElementById('levelSelectGrid');
  if (!grid) return;
  grid.innerHTML = '';

  levels.forEach((lvl) => {
    const isSelected = (GameState.levelIndex === lvl.index);
    const locked = lvl.index >= (SaveStore.data.unlockedLevel || 1);
    const prog = (SaveStore.data.progress || {})[lvl.id] || { best: 0, medal: null };
    const medals = LEVEL_MEDALS[lvl.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.levelId = lvl.id;
    card.dataset.locked = locked ? '1' : '0';
    card.className = `text-left p-2.5 rounded-xl border transition flex flex-col justify-between ${
      locked
        ? 'bg-slate-950/70 border border-slate-800 opacity-60 cursor-not-allowed'
        : isSelected
        ? 'bg-orange-500/20 border-2 border-orange-400 shadow-[0_0_15px_rgba(255,102,0,0.35)]'
        : 'bg-slate-950/90 border border-slate-800 hover:border-slate-600'
    }`;
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-1">
          <span class="font-arcade text-[10px] font-black text-white">${lvl.name}</span>
          <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-arcade text-[8px] font-bold">🔥H${lvl.startingHeat}</span>
        </div>
        <div class="text-[10px] text-cyan-300 font-semibold mt-0.5">${lvl.subtitle}</div>
        <div class="text-[9px] text-slate-400 mt-1">🎯 ${lvl.goalDesc}</div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[9px] font-arcade">
        <span class="text-amber-300">BOSS: ${lvl.bossName}</span>
        <span class="text-emerald-300 font-bold">+${lvl.bonusReward} ⚡</span>
      </div>
      <div class="level-ladder mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] font-arcade">
        ${locked
          ? `<span class="text-slate-400">🔒 Earn ${MEDAL_ICON.bronze} on the level before</span>`
          : `<span class="text-white font-bold">${prog.medal ? MEDAL_ICON[prog.medal] : '▫️'} BEST <span class="level-best">${prog.best.toLocaleString()}</span></span>
             <span class="text-slate-400">${MEDAL_ICON.bronze}${shortScore(medals.bronze)} ${MEDAL_ICON.silver}${shortScore(medals.silver)} ${MEDAL_ICON.gold}${shortScore(medals.gold)}</span>`}
      </div>
    `;
    card.addEventListener('click', () => {
      if (locked) return;
      GameState.levelIndex = lvl.index;
      SaveStore.data.selectedLevel = lvl.index;
      SaveStore.save();
      picked();
    });
    grid.appendChild(card);
  });
}
