import { ensureGarage, grantEarnedCars } from './cars.js';

// Persistent save data. The localStorage key is a compatibility invariant (AGENTS.md §3.6):
// never rename it; migrate by merging new defaults over parsed data, as load() does.
import { normalizeSettings } from './settings.js';

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
    volume: 0.8,
    // Settings panel (ticket 0050); see src/settings.js for the keys and their defaults.
    settings: normalizeSettings(),
    // Renderer (ticket 0040): 'auto' | '2d' | '3d'. Old saves get 'auto' (= 2D today).
    renderMode: 'auto',
    // Cars you own, the one you drive, paint per car (ticket 0071). See src/cars.js.
    garage: null,
    // Career counters that unlock cars: races, wins, takedowns, warps, rivals, daily streak.
    career: null
  },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign({}, this.data, parsed);
        this.data.upgrades = Object.assign({ engine: 1, tires: 1, flux: 1, hover: 1 }, parsed.upgrades || {});
        this.data.settings = normalizeSettings(parsed.settings);
        if (Object.hasOwn(LEGACY_LIVERY_IDS, this.data.livery)) this.data.livery = LEGACY_LIVERY_IDS[this.data.livery];
      }
    } catch (e) {}
    // Garage + career (ticket 0071): old saves get the two starter cars and zeroed counters,
    // plus any milestone car their recorded medals already earned.
    ensureGarage(this.data);
    grantEarnedCars(this.data);
  },
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {}
  }
};

// A pristine save for a brand-new racer on a shared device (ticket 0090), captured before
// load() ever runs.
const FRESH = JSON.stringify(SaveStore.data);
export const freshSaveData = () => JSON.parse(FRESH);
