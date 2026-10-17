// Persistent save data. The localStorage key is a compatibility invariant (AGENTS.md §3.6):
// never rename it; migrate by merging new defaults over parsed data, as load() does.

// Livery ids renamed for IP safety (ticket 0001). Old saves keep their choice: load() maps
// each legacy id to its replacement. The legacy strings live only here (ip-denylist allowlist).
export const LEGACY_LIVERY_IDS = {
  STARK_MK88: 'ARC_MK88'
};

export const SaveStore = {
  key: 'outatime_cruisn_88_save_v2',
  data: {
    bestScore: 0,
    fluxCoins: 250,
    // Campaign ladder (ticket 0011): new players start with level 1 open; a bronze opens the
    // next. Old saves stored unlockedLevel: 5, so they keep everything open.
    unlockedLevel: 1,
    progress: {},
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
    // First-run teaching (ticket 0022): set after your first finished run. Old saves don't
    // have it; isNewPlayer() also treats any recorded best score as already onboarded.
    onboarded: false,
    // Leaderboard (ticket 0025): the player's 3-letter initials once entered ('' = never).
    initials: '',
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
        if (Object.hasOwn(LEGACY_LIVERY_IDS, this.data.livery)) this.data.livery = LEGACY_LIVERY_IDS[this.data.livery];
      }
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {}
  }
};
