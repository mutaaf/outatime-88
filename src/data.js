// Static game content: levels, eras, roster, upgrades, road/pace/camera configs.
// Pure data — no imports, no side effects.

export const WORLD_LEVELS = [
  {
    index: 0,
    id: 'LVL1_HILL_VALLEY',
    name: 'LVL 1: HILL VALLEY 2026 3D',
    subtitle: '3D Hot Wheels Track • Courthouse Clock Tower',
    startEra: 0,
    startingHeat: 1,
    rivalDensity: 1.0,
    goalDesc: 'Beat 7 Street Rivals & Hit 88 MPH',
    bossName: 'NEEDLES_4X4',
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
    bossName: 'MAD_DOG_85',
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
    goalDesc: 'Chain Drifts & Defeat Griff\'s Hover Crew',
    bossName: 'GRIFF_BMW_2015',
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
    goalDesc: 'Survive Heat 5 Roadblocks & Beat Cyber-Biff',
    bossName: 'CYBER_BIFF_88',
    bonusReward: 450
  },
  {
    index: 4,
    id: 'LVL5_INFINITE_HW',
    name: 'LVL 5: HOT WHEELS INFINITE',
    subtitle: 'Endless Era-Warping Loops & Split Crossroads',
    startEra: 0,
    startingHeat: 2,
    rivalDensity: 1.25,
    goalDesc: 'Endless High-Score & Time-Warp Marathon',
    bossName: 'TWIN_MILL_APEX',
    bonusReward: 350
  }
];

// --- ERA DEFINITIONS (8-Bit to Modern HD Progression) ---
export const ERAS = [
  {
    id: '2026',
    name: '2026 • HILL VALLEY 3D',
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
    name: '1985 • TWIN PINES 3D',
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
    name: '2015 • SKYWAY HILL VALLEY',
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
    name: '2088 • CYBER HILL VALLEY',
    presentDate: 'NOV 12 2088',
    destDate: 'OCT 16 2026',
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
  }
];

// --- DUB CUSTOMIZATION OPTIONS ---
export const UNDERGLOW_OPTIONS = [
  { name: 'Cyber Cyan', color: '#00f0ff' },
  { name: 'HW Orange', color: '#ff5500' },
  { name: 'DUB Purple', color: '#d946ef' },
  { name: 'Zone Green', color: '#10b981' },
  { name: 'Crimson Red', color: '#ef4444' }
];
export const LIVERY_OPTIONS = [
  { id: 'STARK_MK88', name: 'Stark Mark-88', body: '#b91c1c', cabin: '#facc15' },
  { id: 'STAINLESS', name: 'Stainless DMC', body: '#94a3b8', cabin: '#cbd5e1' },
  { id: 'MIDNIGHT_BLACK', name: 'Midnight Matte', body: '#1e293b', cabin: '#475569' },
  { id: 'GOLD_88', name: 'Gold Chrome 88', body: '#eab308', cabin: '#fef08a' },
  { id: 'CYBER_RED', name: 'Hot Wheels Red', body: '#dc2626', cabin: '#fca5a5' }
];

// --- INFINITE POP-CULTURE CHARACTER & VEHICLE MULTIVERSE ROSTER ---
export const POP_CULTURE_ROSTER = [
  {
    id: 'BTTF_DELOREAN',
    driver: 'Marty McFly & Doc Brown',
    car: '1981 DeLorean DMC-12',
    franchise: 'Back to the Future',
    massKg: 1230,
    maxHp: 100,
    speedBonus: 4,
    gripBonus: 0.15,
    jumpBonus: 1.05,
    body: '#94a3b8',
    cabin: '#e2e8f0',
    glow: '#00f0ff',
    shape: 'DELOREAN',
    perk: '+25% Faster 1.21GW Flux Charge'
  },
  {
    id: 'DOM_CHARGER',
    driver: 'Dominic Toretto',
    car: "1970 Dodge Charger R/T",
    franchise: 'The Fast and the Furious',
    massKg: 1780,
    maxHp: 135,
    speedBonus: 6,
    gripBonus: 0.08,
    jumpBonus: 0.95,
    body: '#111827',
    cabin: '#475569',
    glow: '#ff5500',
    shape: 'CHARGER',
    perk: 'Heavy 1,780kg Muscle • Smashes Barriers with 0 Damage'
  },
  {
    id: 'BRIAN_SKYLINE',
    driver: "Brian O'Conner",
    car: '1999 Skyline GT-R R34',
    franchise: '2 Fast 2 Furious',
    massKg: 1430,
    maxHp: 105,
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
    id: 'TRON_LIGHTCYCLE',
    driver: 'Kevin & Sam Flynn',
    car: 'Gen-5 Light Cycle',
    franchise: 'TRON: Legacy',
    massKg: 680,
    maxHp: 95,
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
    id: 'KNIGHT_RIDER_KITT',
    driver: 'Michael Knight',
    car: 'K.I.T.T. Trans Am 2000',
    franchise: 'Knight Rider',
    massKg: 1520,
    maxHp: 125,
    speedBonus: 7,
    gripBonus: 0.24,
    jumpBonus: 1.35,
    body: '#090a0f',
    cabin: '#ef4444',
    glow: '#ef4444',
    shape: 'KITT',
    perk: 'Turbo-Boost Super Jump (+35% Jump Height)'
  },
  {
    id: 'SPEED_RACER_MACH5',
    driver: 'Speed Racer',
    car: 'The Mach 5',
    franchise: 'Speed Racer',
    massKg: 1180,
    maxHp: 105,
    speedBonus: 8,
    gripBonus: 0.30,
    jumpBonus: 1.40,
    body: '#f8fafc',
    cabin: '#ef4444',
    glow: '#facc15',
    shape: 'MACH5',
    perk: 'Auto-Jacks Instant Jump & Saw-Blade Obstacle Clear'
  },
  {
    id: 'HAN_RX7',
    driver: 'Takumi Fujiwara',
    car: 'Toyota AE86 Trueno',
    franchise: 'Initial D',
    massKg: 940,
    maxHp: 100,
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
    id: 'AKIRA_KANEDA_BIKE',
    driver: 'Shotaro Kaneda',
    car: 'Capsule Cyber-Bike',
    franchise: 'Akira',
    massKg: 720,
    maxHp: 95,
    speedBonus: 9,
    gripBonus: 0.40,
    jumpBonus: 1.25,
    body: '#dc2626',
    cabin: '#fca5a5',
    glow: '#ff2a2a',
    shape: 'LIGHTCYCLE',
    perk: 'Iconic Electric Power-Slide & Narrow Gap Threading'
  },
  {
    id: 'MAD_MAX_INTERCEPTOR',
    driver: 'Max Rockatansky',
    car: 'V8 Pursuit Special',
    franchise: 'Mad Max: Fury Road',
    massKg: 1850,
    maxHp: 145,
    speedBonus: 6,
    gripBonus: 0.14,
    jumpBonus: 0.95,
    body: '#1c1917',
    cabin: '#78716c',
    glow: '#f97316',
    shape: 'CHARGER',
    perk: '+45 Armor HP & Supercharged Wasteland Ramming'
  },
  {
    id: 'ATEAM_VANDURA',
    driver: 'B.A. Baracus',
    car: '1983 GMC Vandura',
    franchise: 'The A-Team',
    massKg: 2350,
    maxHp: 160,
    speedBonus: 3,
    gripBonus: 0.10,
    jumpBonus: 0.90,
    body: '#111827',
    cabin: '#dc2626',
    glow: '#ef4444',
    shape: 'HEAVY_VAN',
    perk: '2,350kg Heavy Tank • Maximum 160 HP Juggernaut'
  },
  {
    id: 'HW_TWIN_MILL',
    driver: 'Vert Wheeler',
    car: 'Twin Mill III',
    franchise: 'Hot Wheels: World Race',
    massKg: 1310,
    maxHp: 110,
    speedBonus: 10,
    gripBonus: 0.25,
    jumpBonus: 1.20,
    body: '#16a34a',
    cabin: '#fde047',
    glow: '#22c55e',
    shape: 'CHARGER',
    perk: 'Dual Exposed V8 Engines • +30% Booster Pad Kick'
  },
  {
    id: 'STARK_MARK88_CAR',
    driver: 'Tony Stark & J.A.R.V.I.S.',
    car: 'Mark-88 Arc Roadster',
    franchise: 'Stark Industries',
    massKg: 1380,
    maxHp: 130,
    speedBonus: 8,
    gripBonus: 0.32,
    jumpBonus: 1.30,
    body: '#b91c1c',
    cabin: '#facc15',
    glow: '#00f0ff',
    shape: 'DELOREAN',
    perk: 'Nanotech Self-Healing Hull (+2 HP/sec Regen)'
  }
];

export const MULTIVERSE_POOL = [
  { driver: 'Egon & Ray', car: 'Ecto-1 Cadillac', franchise: 'Ghostbusters', body: '#f8fafc', cabin: '#dc2626', glow: '#22c55e', shape: 'HEAVY_VAN' },
  { driver: 'Jim Douglas', car: 'Herbie #53 Beetle', franchise: 'The Love Bug', body: '#f8fafc', cabin: '#2563eb', glow: '#ef4444', shape: 'TUNER_WING' },
  { driver: 'OutRun Hero', car: '1986 Testarossa Spider', franchise: 'Sega OutRun', body: '#dc2626', cabin: '#fde047', glow: '#ff5500', shape: 'DELOREAN' },
  { driver: 'Razor / Player', car: 'BMW M3 GTR Most Wanted', franchise: 'Need for Speed', body: '#e2e8f0', cabin: '#1d4ed8', glow: '#38bdf8', shape: 'TUNER_WING' },
  { driver: 'Captain Falcon', car: 'Blue Falcon #07', franchise: 'F-Zero GX', body: '#1d4ed8', cabin: '#facc15', glow: '#00f0ff', shape: 'MACH5' },
  { driver: 'V (Night City)', car: 'Quadra Turbo-R V-Tech', franchise: 'Cyberpunk 2077', body: '#1e293b', cabin: '#00f0ff', glow: '#ff007f', shape: 'DELOREAN' },
  { driver: 'Bruce Wayne', car: 'Wayne Tech Tumbler', franchise: 'The Dark Knight', body: '#090a0f', cabin: '#f59e0b', glow: '#f59e0b', shape: 'HEAVY_VAN' },
  { driver: 'Suki', car: 'Honda S2000 Pink Spec', franchise: '2 Fast 2 Furious', body: '#ec4899', cabin: '#fbcfe8', glow: '#f43f5e', shape: 'TUNER_WING' },
  { driver: 'Han Lue', car: 'Veilside Fortune RX-7', franchise: 'Tokyo Drift', body: '#ea580c', cabin: '#090a0f', glow: '#ff5500', shape: 'TUNER_WING' },
  { driver: 'Bo & Luke', car: '1969 Charger Stock Car', franchise: 'Hazzard County', body: '#ea580c', cabin: '#fef08a', glow: '#f59e0b', shape: 'CHARGER' },
  { driver: 'Bandit', car: '1977 Black & Gold Trans Am', franchise: 'Smokey and the Bandit', body: '#090a0f', cabin: '#eab308', glow: '#eab308', shape: 'KITT' },
  { driver: 'Arnie Cunningham', car: '1958 Plymouth Fury', franchise: 'Christine', body: '#b91c1c', cabin: '#f8fafc', glow: '#ff1e1e', shape: 'CHARGER' },
  { driver: 'Reiko Nagase', car: 'Kamata Fiera Type-S', franchise: 'Ridge Racer', body: '#f8fafc', cabin: '#e11d48', glow: '#00f0ff', shape: 'MACH5' },
  { driver: 'Master Chief', car: 'M12 LRV Warthog', franchise: 'Halo UNSC', body: '#3f6212', cabin: '#a3e635', glow: '#84cc16', shape: 'HEAVY_VAN' },
  { driver: "Cruis'n Champion", car: 'La Bomba Lowrider', franchise: "Cruis'n USA", body: '#eab308', cabin: '#7c3aed', glow: '#d946ef', shape: 'CHARGER' }
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
    title: 'Midnight Club Drift Spec Tires',
    desc: 'Sharper counter-steer drift control & faster Tier-3 boost.',
    icon: '🛞',
    baseCost: 45
  },
  {
    key: 'flux',
    title: 'Mr. Fusion + ZONE/AGRO Core',
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
  { id: 'ASSIST', label: '🤖 AI: ASSIST (I)', desc: 'J.A.R.V.I.S. Smart Trajectory & Cornering Assist engaged, Sir.' },
  { id: 'AUTOPILOT', label: '🤖 AI: AUTOPILOT (I)', desc: 'Full J.A.R.V.I.S. Autonomous Driving Protocol engaged. Sit back, Sir.' },
  { id: 'MANUAL', label: '🤖 AI: MANUAL (I)', desc: 'Manual flight control transferred to you, Sir. AR HUD remains online.' }
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
  'CYBER_BIFF_88', 'GRIFF_2015', 'NEEDLES_4X4', 'TWIN_MILL_X',
  'BONE_SHAKER', 'DOC_BROWN_85', 'TOKYO_DRIFT_Z'
];
