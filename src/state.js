// The single mutable game-state object shared by every system.

export const GameState = {
  status: 'TITLE',
  mode: 'ARCADE',
  levelIndex: 0,
  paceMode: 0, // 0: SMOOTH CRUISE (Default), 1: ARCADE NORMAL, 2: PRO FAST
  visualOverride: 'AUTO',
  cameraMode: 1, // Default to CHASE CAM for clear forward road visibility
  eraIndex: 0,
  score: 0,
  runCoins: 0,
  combo: 1,
  comboTimer: 0,
  timeWarps: 0,
  takedowns: 0,
  heatLevel: 1,
  heatProgress: 0,
  racePosition: 8,
  totalRacers: 8,
  timeLeft: 48.0,
  distance: 0,
  trackPos: 0,
  playerX: 0,
  playerVX: 0,
  playerY: 0,
  playerVY: 0,
  speed: 0,
  peakSpeed: 0,
  gear: 1,
  rpm: 2000,
  // Pro Drift & Slipstream State
  driftAngle: 0,
  isDrifting: false,
  currentDriftScore: 0,
  driftChargeTime: 0,
  driftTier: 0, // 0, 1 (Cyan), 2 (Orange), 3 (Purple)
  draftCharge: 0, // 0-100% slipstream wake
  draftingCar: null,
  // Street-Crew Specials & Takedown State
  specialCharges: 3,
  zoneTimer: 0,
  agroTimer: 0,
  roarWaveZ: -1,
  twoWheelTimer: 0,
  slamCooldown: 0,
  takedownSlowMoTimer: 0,
  screenShake: 0,
  fluxCharge: 45,
  warpActiveTimer: 0,
  hoverActiveTimer: 0,
  stuntSpinAngle: 0,
  autoGas: true,
  branchName: 'MAIN STREET',
  forkPending: false,
  loopPitchOffset: 0,
  cameraBank: 0,
  particles: [],
  lightningBolts: [],
  flyingWrecks: [], // Rivals launched into the air on Takedown!
  contractIdx: 0,
  contractProgress: 0,
  // LUMEN Co-Pilot / Mark-88 State
  jarvisMode: 2, // Default to 100% pure manual player control
  jarvisArEnabled: true,
  lockedTarget: null,
  unibeamTimer: 0,
  unibeamTargetX: 0,
  unibeamTargetY: 0,
  upcomingCurveSum: 0,
  // 2026 3D Animated Power-Up & Obstacle Impact FX
  pickupAnimations: [], // Magnetic fly-to-car animations when acquiring powerups!
  hitShockwaves: [],    // Expanding 3D shockwave rings & floating badges on hit/acquire!
  debrisShards: [],     // 3D spinning shards when smashing obstacles/crates/rivals!
  carSurgeTimer: 0,
  carJoltY: 0,
  // 10x 6-DOF Automotive Suspension & Weight Transfer Physics State
  prevSpeed: 0,
  suspOffset: 0,      // Vertical spring displacement (Hooke's law: F = -k*x - c*v)
  suspVel: 0,         // Vertical spring velocity
  chassisPitch: 0,    // Nose dive (+ on brake) / Rear squat (- on acceleration)
  chassisPitchVel: 0,
  chassisRoll: 0,     // Body roll angle on cornering (compresses outside tire!)
  chassisRollVel: 0,
  prevRoadSlope: 0,
  skidmarks: [],      // Persistent tire skidmarks & rubber marks on the track!
  // HP, Wave Difficulty, Character & Interactive Coach State
  selectedCharIdx: 0,
  hp: 100,
  maxHp: 100,
  invulnTimer: 0,
  waveTier: 1,
  isDuckSliding: false,
  coachDismissed: false,
  lessonsCleared: { steer: 0, jump: 0, slide: 0, smash: 0 },
  activeObstaclePrompt: null,
  // Endless Run / Tree-Dodging Streak & Human Skill-Edge Trick State
  dodgeStreak: 0,
  bestStreak: 0,
  magnetTimer: 0,
  airTrickCount: 0,
  airTrickNames: [],
  airLandingBoostMph: 0,
  trickPitchAngle: 0,
  phaseJukeTimer: 0,
  lastLeftTap: 0,
  lastRightTap: 0
};
