// The single mutable game-state object shared by every system.

export const GameState = {
  status: 'TITLE',
  mode: 'INFINITE', // Endless Highway is the default (ticket 0150); EVENTS picks a track race
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
  // A real race (ticket 0051): seconds since the green light, the line, and when you crossed it.
  raceTime: 0,
  raceLength: 0,
  finishTime: null,
  // Race ceremony (ticket 0052): 'START' (lineup + lights) → 'RACING' → 'FINISHED' (roll-out).
  racePhase: 'RACING',
  launchStall: 0,
  launchResult: null,
  lastResult: null,
  lapSplits: [],      // seconds per lap this race (ticket 0053: best lap on the share card)
  steerInput: 0,      // this step's steering (-1.4..1.4) and brake, published for the renderers
  braking: false,
  liveInvite: null,   // a live room's invite URL, when racing in one; sharing then invites to the rematch
  timeLeft: 48.0,
  finalStretch: false,
  daily: null,
  trafficGapScale: 1,
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
  carYaw: 0, // rad; the body's yaw on the road (src/handling.js stepLateral), + points right
  isDrifting: false,
  // Tyre smoke and squeal (ticket 0133, src/smoke.js): wheelspin and tyreSlip come from the
  // drivetrain and handling; wallGrind is set while scraping a wall; smokePuffs counts 2D puffs.
  wheelSpin: 0,
  tyreSlip: 0,
  wallGrind: false,
  smokeLevel: 0,
  smokePuffs: 0,
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
  loopRide: 0, // how much of the 2D ride-the-loop view is showing (0..1), for tests/debug
  cameraBank: 0,
  particles: [],
  lightningBolts: [],
  flyingWrecks: [], // Rivals launched into the air on Takedown!
  missions: null, // this run's three missions (src/missions.js, ticket 0026)
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
  carBox: { x0: 0, y0: 0, x1: 0, y1: 0 }, // the player car on screen (drawPlayerCar), for labels (0114)
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
  lastRightTap: 0,
  // Game feel (ticket 0009/0003/0014)
  reducedMotion: false,
  sinceWarp: 99,
  warpFxTimer: 0,
  fxLinesDrawn: 0
};
