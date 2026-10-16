// Persistent save data. The localStorage key is a compatibility invariant (AGENTS.md §3.6):
// never rename it; migrate by merging new defaults over parsed data, as load() does.

export const SaveStore = {
  key: 'outatime_cruisn_88_save_v2',
  data: {
    bestScore: 0,
    fluxCoins: 250,
    unlockedLevel: 5,
    selectedLevel: 0,
    underglow: '#00f0ff',
    livery: 'STAINLESS',
    upgrades: {
      engine: 1,
      tires: 1,
      flux: 1,
      hover: 1
    },
    tiltSensitivity: 1.0,
    muted: false,
    volume: 0.8
  },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign({}, this.data, parsed);
        this.data.upgrades = Object.assign({ engine: 1, tires: 1, flux: 1, hover: 1 }, parsed.upgrades || {});
      }
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {}
  }
};
