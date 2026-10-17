// Static game content: levels, eras, roster, upgrades, road/pace/camera configs.
// Pure data — no imports, no side effects.

export const WORLD_LEVELS = [
  {
    index: 0,
    id: 'LVL1_CLOCK_HOLLOW',
    name: 'LVL 1: CLOCK HOLLOW 2026 3D',
    subtitle: '3D Orange Toy-Track • Town Square Clock Tower',
    startEra: 0,
    startingHeat: 1,
    rivalDensity: 1.0,
    goalDesc: 'Beat 7 Street Rivals & Hit 88 MPH',
    bossName: 'SPIKES_4X4',
    bonusReward: 150
  },
  {
    index: 1,
    id: 'LVL2_RED_ROCK',
    name: 'LVL 2: RED ROCK CANYON EXPRESS',
    subtitle: '1885 Ravine Loops & Canyon Mega-Jumps',
    startEra: 1,
    startingHeat: 2,
    rivalDensity: 1.15,
    goalDesc: 'Score 3 Rival Takedowns & Clear Canyon Gaps',
    bossName: 'RATTLER_85',
    bonusReward: 220
  },
  {
    index: 2,
    id: 'LVL3_TOKYO_2015',
    name: 'LVL 3: NEO-2015 SKYWAY DUB',
    subtitle: 'Wet-Asphalt Reflections & Wangan Boost Tunnels',
    startEra: 2,
    startingHeat: 3,
    rivalDensity: 1.3,
    goalDesc: 'Chain Drifts & Defeat Vandal\'s Hover Crew',
    bossName: 'VANDAL_HOVER_2015',
    bonusReward: 300
  },
  {
    index: 3,
    id: 'LVL4_MULHOLLAND_2088',
    name: 'LVL 4: MULHOLLAND 2088 HEAT 5',
    subtitle: 'Modern HD Synthwave • Maximum Police Pursuit',
    startEra: 3,
    startingHeat: 5,
    rivalDensity: 1.45,
    goalDesc: 'Survive Heat 5 Roadblocks & Beat Cyber-Brute',
    bossName: 'CYBER_BRUTE_88',
    bonusReward: 450
  },
  {
    index: 4,
    id: 'LVL5_INFINITE_HW',
    name: 'LVL 5: ORANGE TRACK INFINITE',
    subtitle: 'Endless Era-Warping Loops & Split Crossroads',
    startEra: 0,
    startingHeat: 2,
    rivalDensity: 1.25,
    goalDesc: 'Endless High-Score & Time-Warp Marathon',
    bossName: 'TWIN_TURBINE_APEX',
    bonusReward: 350
  }
];

// --- ERA DEFINITIONS (8-Bit to Modern HD Progression) ---
export const ERAS = [
  {
    id: '2026',
    name: '2026 • CLOCK HOLLOW 3D',
    presentDate: 'OCT 16 2026',
    destDate: 'OCT 26 1985',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#060919',
    skyBot: '#1e2952',
    horizonGlow: '#ff6a00',
    groundA: '#0c1322',
    groundB: '#090f1c',
    trackA: '#dc4504',
    trackB: '#d54203',
    railColor: '#ffaa00',
    wetReflection: true,
    sunStyle: 'synthwave-sun'
  },
  {
    id: '1985',
    name: '1985 • CEDAR RIDGE 3D',
    presentDate: 'OCT 26 1985',
    destDate: 'SEP 02 1885',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#0b071e',
    skyBot: '#2b1342',
    horizonGlow: '#e06d2b',
    groundA: '#0f1624',
    groundB: '#0c121e',
    trackA: '#e04806',
    trackB: '#d84405',
    railColor: '#ffb700',
    wetReflection: true,
    sunStyle: 'pixel-moon'
  },
  {
    id: '1885',
    name: '1885 • CANYON RAVINE 3D',
    presentDate: 'SEP 02 1885',
    destDate: 'OCT 21 2015',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#1f0a04',
    skyBot: '#8f3b19',
    horizonGlow: '#e0a82e',
    groundA: '#36190e',
    groundB: '#2e150b',
    trackA: '#d94608',
    trackB: '#d14206',
    railColor: '#f59e0b',
    wetReflection: false,
    sunStyle: 'western-sun'
  },
  {
    id: '2015',
    name: '2015 • SKYWAY CLOCK HOLLOW',
    presentDate: 'OCT 21 2015',
    destDate: 'NOV 12 2088',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#040c24',
    skyBot: '#093b66',
    horizonGlow: '#22b8cf',
    groundA: '#081726',
    groundB: '#061320',
    trackA: '#d94406',
    trackB: '#d14004',
    railColor: '#ff9900',
    wetReflection: true,
    sunStyle: 'holo-globe'
  },
  {
    id: '2088',
    name: '2088 • CYBER CLOCK HOLLOW',
    presentDate: 'NOV 12 2088',
    destDate: 'JUN 18 1955',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#060318',
    skyBot: '#1f093d',
    horizonGlow: '#d63384',
    groundA: '#0c0521',
    groundB: '#10072b',
    trackA: '#dc4308',
    trackB: '#d43f06',
    railColor: '#ffaa00',
    wetReflection: true,
    sunStyle: 'synthwave-sun'
  },
  {
    // Appended (not inserted) so every existing era index stays put (ticket 0008).
    id: '1955',
    name: '1955 • ATOMIC DINER STRIP',
    presentDate: 'JUN 18 1955',
    destDate: 'OCT 16 2026',
    pixelScale: 1.0,
    scanlines: false,
    skyTop: '#3d7ea6',
    skyBot: '#f6b7c8',
    horizonGlow: '#ffd59e',
    groundA: '#2f6b5e',
    groundB: '#285c51',
    trackA: '#e4503a',
    trackB: '#d94a35',
    railColor: '#f2f2e9',
    wetReflection: false,
    sunStyle: 'atomic-sun',
    props: 'atomic',
    backdrop: {
      sky: ['#2e6f99', '#4f93b8', '#8fc4d6', '#f6b7c8', '#ffd59e'],
      stars: false,
      halo: ['rgba(255, 240, 200, 0.55)', 'rgba(255, 183, 200, 0.22)', 'rgba(255, 183, 200, 0)'],
      sun: ['#fffbea', '#ffe8a3', '#ffb3c7'],
      hills: '#5f9e8f',
      city: '#3f6f73',
      tower: '#2f5a5e',
      towerTrim: '#f2f2e9',
      clock: '#ff7aa8',
      landmark: 'driveIn',
      ground: ['#6fb8a3', '#3f8a78', '#24584d']
    }
  }
];

// The 2D renderer's sky, sun, horizon and ground. An era may bring its own `backdrop`;
// the neon-night default is what every era drew before ticket 0008.
export const DEFAULT_BACKDROP = {
  sky: ['#04030c', '#100826', '#2d114d', '#7c1d54', '#ff6a2b'],
  stars: true,
  halo: ['rgba(255, 160, 60, 0.45)', 'rgba(255, 60, 120, 0.18)', 'rgba(255, 60, 120, 0)'],
  sun: ['#fff3b0', '#ff7b00', '#ff006e'],
  hills: '#16092b',
  city: '#0b0518',
  tower: '#1e1026',
  towerTrim: '#cbd5e1',
  clock: '#fef08a',
  landmark: 'clockTower',
  ground: ['#190b2e', '#0b0719', '#05040d']
};

export function eraBackdrop(era) {
  return (era && era.backdrop) || DEFAULT_BACKDROP;
}

// --- DUB CUSTOMIZATION OPTIONS ---
export const UNDERGLOW_OPTIONS = [
  { name: 'Cyber Cyan', color: '#00f0ff' },
  { name: 'Track Orange', color: '#ff5500' },
  { name: 'DUB Purple', color: '#d946ef' },
  { name: 'Zone Green', color: '#10b981' },
  { name: 'Crimson Red', color: '#ef4444' }
];
export const LIVERY_OPTIONS = [
  { id: 'ARC_MK88', name: 'Arc Mark-88', body: '#b91c1c', cabin: '#facc15' },
  { id: 'STAINLESS', name: 'Brushed Stainless', body: '#94a3b8', cabin: '#cbd5e1' },
  { id: 'MIDNIGHT_BLACK', name: 'Midnight Matte', body: '#1e293b', cabin: '#475569' },
  { id: 'GOLD_88', name: 'Gold Chrome 88', body: '#eab308', cabin: '#fef08a' },
  { id: 'CYBER_RED', name: 'Toy-Track Red', body: '#dc2626', cabin: '#fca5a5' }
];

// --- ORIGINAL DRIVER & VEHICLE ROSTER ---
// Ratings, unlocks and the physics each car drives with live in src/cars.js (ticket 0071);
// maxHp here must equal carParams(car).maxHp (a unit test checks it).
export const POP_CULTURE_ROSTER = [
  {
    id: 'FLUX_COUPE_88',
    driver: 'Rook & The Professor',
    car: "'88 Flux Coupe Gull-Wing",
    franchise: 'Chrono Crew',
    massKg: 1230,
    maxHp: 108,
    speedBonus: 4,
    gripBonus: 0.15,
    jumpBonus: 1.05,
    body: '#94a3b8',
    cabin: '#e2e8f0',
    glow: '#00f0ff',
    shape: 'GULLWING',
    perk: '+25% Faster 1.88GW Flux Charge'
  },
  {
    id: 'IRON_SAINT_BRAWLER',
    driver: 'Dez Navarro',
    car: "'70 Brawler 440 Blower",
    franchise: 'Southside Family',
    massKg: 1780,
    maxHp: 143,
    speedBonus: 6,
    gripBonus: 0.08,
    jumpBonus: 0.95,
    body: '#111827',
    cabin: '#475569',
    glow: '#ff5500',
    shape: 'MUSCLE',
    perk: 'Heavy 1,780kg Muscle • Smashes Barriers with 0 Damage'
  },
  {
    id: 'BLUE_KESTREL',
    driver: 'Kai Mercer',
    car: "'99 Kestrel GT-4R",
    franchise: 'Harbor Tuners',
    massKg: 1430,
    maxHp: 108,
    speedBonus: 7,
    gripBonus: 0.28,
    jumpBonus: 1.05,
    body: '#0284c7',
    cabin: '#bae6fd',
    glow: '#00ff66',
    shape: 'TUNER_WING',
    perk: '2x Slipstream Wake & Precision Drift Control'
  },
  {
    id: 'GRID_CYCLE',
    driver: 'Vex & Ion Arden',
    car: 'Gen-5 Grid Cycle',
    franchise: 'The Gridline',
    massKg: 680,
    maxHp: 94,
    speedBonus: 9,
    gripBonus: 0.42,
    jumpBonus: 1.22,
    body: '#090d16',
    cabin: '#00f0ff',
    glow: '#00f0ff',
    shape: 'LIGHTCYCLE',
    perk: 'Narrow Cyber-Hitbox • Leaves Neon Light-Ribbon'
  },
  {
    id: 'NIGHT_SENTINEL',
    driver: 'Cal Steele',
    car: 'SENTRY-2000 Talking Coupe',
    franchise: 'Night Sentinel Foundation',
    massKg: 1520,
    maxHp: 115,
    speedBonus: 7,
    gripBonus: 0.24,
    jumpBonus: 1.35,
    body: '#090a0f',
    cabin: '#ef4444',
    glow: '#ef4444',
    shape: 'SCANNER',
    perk: 'Turbo-Boost Super Jump (+35% Jump Height)'
  },
  {
    id: 'GO_ROCKET_5',
    driver: 'Rin Takamura',
    car: 'The Go-Rocket 5',
    franchise: 'Takamura Racing',
    massKg: 1180,
    maxHp: 101,
    speedBonus: 8,
    gripBonus: 0.30,
    jumpBonus: 1.40,
    body: '#f8fafc',
    cabin: '#ef4444',
    glow: '#facc15',
    shape: 'ROCKET',
    perk: 'Hydraulic Hop Instant Jump & Blade-Bumper Obstacle Clear'
  },
  {
    id: 'PASS_RUNNER_86',
    driver: 'Yuto Hanada',
    car: "'86 Pass-Runner Hatch",
    franchise: 'Mountain Pass Night Crew',
    massKg: 940,
    maxHp: 108,
    speedBonus: 5,
    gripBonus: 0.45,
    jumpBonus: 1.10,
    body: '#f8fafc',
    cabin: '#111827',
    glow: '#fde047',
    shape: 'TUNER_WING',
    perk: 'Gutter-Run Drift Master • Zero Speed Loss in Turns'
  },
  {
    id: 'DUST_PURSUIT_V8',
    driver: 'Wade Kessler',
    car: 'V8 Dust Pursuit Special',
    franchise: 'Outback Wastes',
    massKg: 1850,
    maxHp: 143,
    speedBonus: 6,
    gripBonus: 0.14,
    jumpBonus: 0.95,
    body: '#1c1917',
    cabin: '#78716c',
    glow: '#f97316',
    shape: 'MUSCLE',
    perk: 'Armored Rammer • Shrugs Off Hits'
  },
  {
    id: 'BULLDOG_VAN',
    driver: 'Big Tank Ortiz',
    car: "'83 Bulldog Cargo Van",
    franchise: 'The Fix-It Four',
    massKg: 2350,
    maxHp: 150,
    speedBonus: 3,
    gripBonus: 0.10,
    jumpBonus: 0.90,
    body: '#111827',
    cabin: '#dc2626',
    glow: '#ef4444',
    shape: 'HEAVY_VAN',
    perk: '2,350kg Juggernaut • Toughest Chassis in the Garage'
  },
  {
    id: 'TWIN_TURBINE',
    driver: 'Vera Sparks',
    car: 'Twin Turbine III',
    franchise: 'Orange Track League',
    massKg: 1310,
    maxHp: 101,
    speedBonus: 10,
    gripBonus: 0.25,
    jumpBonus: 1.20,
    body: '#16a34a',
    cabin: '#fde047',
    glow: '#22c55e',
    shape: 'MUSCLE',
    perk: 'Dual Exposed V8 Engines • +30% Booster Pad Kick'
  },
  {
    id: 'ARC_ROADSTER_88',
    driver: 'Ada Voss & LUMEN',
    car: 'Mark-88 Arc Roadster',
    franchise: 'Voss Dynamics',
    massKg: 1380,
    maxHp: 108,
    speedBonus: 8,
    gripBonus: 0.32,
    jumpBonus: 1.30,
    body: '#b91c1c',
    cabin: '#facc15',
    glow: '#00f0ff',
    shape: 'GULLWING',
    perk: 'Nanotech Self-Healing Hull (+2 HP/sec Regen)'
  }
];

export const MULTIVERSE_POOL = [
  { driver: 'Drs. Penn & Okafor', car: 'Spectre-1 Wagon', franchise: 'Paranormal Patrol', body: '#f8fafc', cabin: '#dc2626', glow: '#22c55e', shape: 'HEAVY_VAN' },
  { driver: 'Lulu Baxter', car: 'Lucky Bug #35', franchise: 'Garage Gremlins', body: '#f8fafc', cabin: '#2563eb', glow: '#ef4444', shape: 'TUNER_WING' },
  { driver: 'Sunset Hero', car: "'86 Rosso Spider", franchise: 'Coastline Cruisers', body: '#dc2626', cabin: '#fde047', glow: '#ff5500', shape: 'GULLWING' },
  { driver: 'Blade Ito', car: 'M-Spec Street Legend', franchise: 'Harbor Ten', body: '#e2e8f0', cabin: '#1d4ed8', glow: '#38bdf8', shape: 'TUNER_WING' },
  { driver: 'Commander Vireo', car: 'Blue Vireo #07', franchise: 'Zero-G League', body: '#1d4ed8', cabin: '#facc15', glow: '#00f0ff', shape: 'ROCKET' },
  { driver: 'Nyx Halden', car: 'Turbo-R Vector', franchise: 'Neon Sprawl', body: '#1e293b', cabin: '#00f0ff', glow: '#ff007f', shape: 'GULLWING' },
  { driver: 'The Night Warden', car: 'Warden Tank Coupe', franchise: 'Old Harbor City', body: '#090a0f', cabin: '#f59e0b', glow: '#f59e0b', shape: 'HEAVY_VAN' },
  { driver: 'Mika Rose', car: 'Pink Spec Roadster S2', franchise: 'Harbor Tuners', body: '#ec4899', cabin: '#fbcfe8', glow: '#f43f5e', shape: 'TUNER_WING' },
  { driver: 'Jun Sato', car: 'Fortune Widebody Rotary', franchise: 'Drift Kings East', body: '#ea580c', cabin: '#090a0f', glow: '#ff5500', shape: 'TUNER_WING' },
  { driver: 'Cody & Clay Brandt', car: "'69 Moonshine Stocker", franchise: 'Backroads County', body: '#ea580c', cabin: '#fef08a', glow: '#f59e0b', shape: 'MUSCLE' },
  { driver: 'The Outlaw', car: "'77 Black & Gold Eagle", franchise: 'Long-Haul Run', body: '#090a0f', cabin: '#eab308', glow: '#eab308', shape: 'SCANNER' },
  { driver: 'Vic Harlan', car: "'58 Crimson Widow", franchise: 'Haunted Garage', body: '#b91c1c', cabin: '#f8fafc', glow: '#ff1e1e', shape: 'MUSCLE' },
  { driver: 'Aya Kisaragi', car: 'Solace Type-S', franchise: 'Ridgeline Circuit', body: '#f8fafc', cabin: '#e11d48', glow: '#00f0ff', shape: 'ROCKET' },
  { driver: 'Sgt. Dana Pike', car: 'Frontier Scout Buggy', franchise: 'Colony Marines', body: '#3f6212', cabin: '#a3e635', glow: '#84cc16', shape: 'HEAVY_VAN' },
  { driver: 'Coast-to-Coast Champ', car: 'Boulevard Bomber Lowrider', franchise: 'Boulevard Kings', body: '#eab308', cabin: '#7c3aed', glow: '#d946ef', shape: 'MUSCLE' }
];

// --- UPGRADE DEFINITIONS ---
export const UPGRADE_DEFS = [
  {
    key: 'engine',
    title: 'Plutonium Twin-Turbo V6',
    desc: 'Higher top MPH, faster 0-88 launch & 6-speed torque.',
    icon: '🚀',
    baseCost: 50
  },
  {
    key: 'tires',
    title: 'Night-Run Drift Spec Tires',
    desc: 'Sharper counter-steer drift control & faster Tier-3 boost.',
    icon: '🛞',
    baseCost: 45
  },
  {
    key: 'flux',
    title: 'Fusion Canister + ZONE/AGRO Core',
    desc: 'Faster Flux & Special Ability charge + longer duration.',
    icon: '⚡',
    baseCost: 60
  },
  {
    key: 'hover',
    title: '2015 Hover & Slam Chassis',
    desc: 'Harder Side-Slam Takedowns & longer Hover flight.',
    icon: '🛸',
    baseCost: 55
  }
];

// --- SYNTHESIZED AUDIO ENGINE (Engine RPM + Drift Screech + Siren + Synthwave) ---

export const CONTRACT_TEMPLATES = [
  { type: 'TAKEDOWN', target: 2, reward: 150, label: (c, t) => `Slam ${t} Rival Takedowns (${c}/${t})` },
  { type: 'DRIFT_PTS', target: 1500, reward: 180, label: (c, t) => `Bank ${t} Drift Points (${Math.floor(c)}/${t})` },
  { type: 'WARP_88', target: 1, reward: 200, label: (c, t) => `Trigger an 88 MPH Time Warp (${c}/${t})` },
  { type: 'NEAR_MISS', target: 3, reward: 160, label: (c, t) => `Chain ${t} High-Speed Near Misses (${c}/${t})` },
  { type: 'SLIPSTREAM', target: 100, reward: 175, label: (c, t) => `Fill 100% Slipstream Wake (${Math.floor(c)}%)` }
];

export const JARVIS_MODES = [
  { id: 'ASSIST', label: '🤖 AI: ASSIST (I)', desc: 'LUMEN Smart Trajectory & Cornering Assist engaged.' },
  { id: 'AUTOPILOT', label: '🤖 AI: AUTOPILOT (I)', desc: 'Full LUMEN Autonomous Driving Protocol engaged. Sit back.' },
  { id: 'MANUAL', label: '🤖 AI: MANUAL (I)', desc: 'Manual flight control transferred to you. AR HUD remains online.' }
];

export const ROAD_CFG = {
  segLength: 200,
  drawDistance: 140,
  roadWidth: 2200,
  cameraHeight: 920,
  cameraDepth: 0.86,
  playerZOffset: 1250 // Exact Z distance from camera to the player car's tires on screen (y = 86% of screen height)!
};

export const PACE_MODES = [
  { name: '🐢 PACE: SMOOTH', mult: 0.32, accelMult: 0.55, desc: 'RELAXED & READABLE PACE' },
  { name: '🏎️ PACE: ARCADE', mult: 0.46, accelMult: 0.75, desc: 'STANDARD ARCADE SPEED' },
  { name: '🚀 PACE: TURBO', mult: 0.65, accelMult: 1.0, desc: 'HIGH-SPEED PRO REFLEX' }
];

export const CAMERA_MODES = [
  { name: '🎥 LOW CAM', height: 840, depth: 0.82 },
  { name: '🎥 CHASE CAM', height: 1120, depth: 0.86 },
  { name: '🎥 BUMPER CAM', height: 520, depth: 0.92 },
  { name: '🎥 HELI CAM', height: 1580, depth: 0.78 }
];

export const RIVAL_NAMES = [
  'CYBER_BRUTE_88', 'VANDAL_2015', 'SPIKES_4X4', 'TWIN_TURBINE_X',
  'RATTLE_TRAP', 'PROF_VOLT_85', 'NIGHT_DRIFT_Z'
];
