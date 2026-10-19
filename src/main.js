import './fonts.js';
import './styles.css';
import { drawBoard, boardsDebug } from './billboards.js';
import { drawBackdrop, drawRoadsideProp, drawHazardArt, drawSoftShadow, queueTag, flushTags, drawWeather, preloadBackdrops, resetBackdrop, backdropDebug, setBackdropQuality } from './backdrop.js';
import { WORLD_LEVELS, ERAS, UNDERGLOW_OPTIONS, LIVERY_OPTIONS, POP_CULTURE_ROSTER, MULTIVERSE_POOL, UPGRADE_DEFS, JARVIS_MODES, ROAD_CFG, PACE_MODES, CAMERA_MODES } from './data.js';
import { SaveStore, freshSaveData } from './save.js';
import { GameState } from './state.js';
import { SoundEngine, setAudioHooks, loadMusic } from './audio.js';
import { InputState, pollGamepad } from './input.js';
import { RigidBody3D } from './physics.js';
import { createSteer, stepSteer, createLateral, stepLateral, handlingFor, loopStep, landingKeep, wallContact } from './handling.js';
import { createDrive, stepDrive, rpmFor } from './drivetrain.js';
import { nosFor, createNos, stepNos, addNos, nosSpeed, nosFill } from './nos.js';
import { PICKUPS, PICKUP, pickupReach, magnetPull } from './pickups.js';
import { materialFor, impactVelocities } from './materials.js';
import { createWorld, createPropPool } from './world.js';
import { projectPoint } from './projection.js';
import { createFixedStep, lerp } from './fixedstep.js';
import { contactZ, cameraDepth } from './contact.js';
import { hasWebGL, isLowEnd, resolveRenderMode, toggledPref } from './render-mode.js';
import { loadView3D, loadCarPreview } from './render3d-loader.js';
import { FLUX, passiveFluxRate, warpReady, boostOutcome } from './flux.js';
import { speedFeel, createParticlePool, createHitStop, nearMissChain } from './fx.js';
import { createAnnouncer } from './announcer.js';
import { LEVEL_MEDALS, applyRunResult } from './progress.js';
import { setTrackIntensity, setTrackPowerups, addItem } from './track.js';
import { createStorm, stepStorm, stormRespite, runnerMult, canContinue, continueCost, CONTINUE } from './runner.js';
import { difficultyOf, endlessTuning, recordEndless, ENDLESS } from './endless.js';
import { track, generateNextTrackBiome, buildInitialTrack, setTrackLine, setTrackSeed, hasSetPieceBetween, featureAt, curvatureAt, bankAt } from './track.js';
import { stepSetPieces, progressIn, viewRoll } from './setpieces.js';
export let pickupArt = null; // src/pickup-art.js, lazy: crisp cached pickup icons (simple shapes until it lands)
setTimeout(() => { import('./pickup-art.js').then((m) => { pickupArt = m; }, () => {}); }, 0);
let setPieceArt = null; // src/setpieces-2d.js, lazy: the art waits for it, the sim never does
setTimeout(() => { import('./setpieces-2d.js').then((m) => { setPieceArt = m; }, () => {}); }, 0);
let carArt = null; // src/car-sprite.js, lazy: each roster car's own model as cached race sprites
setTimeout(() => { import('./car-sprite.js').then((m) => { carArt = m; }, () => {}); }, 0);
import { createLine, createHazardPlanner, TRAFFIC_LATERAL } from './cleanline.js';
import { watchLayout } from './layout.js';
import { createRaceClock } from './race.js';
import { createHud } from './hud.js';
// Sharing (ticket 0053) is its own chunk: fetched for the results screen or a challenge link.
let shareUi = null;
export const loadShareUi = () => (shareUi = shareUi || import('./share-ui.js').then((m) => { m.initShareUi({ startChallenge }); return m; }));
import { FIELD_SIZE, RIVAL_PACES, gridSlot, rivalTargetMph, raceLengthFor, sortStandings, crossingTime, ordinal, finishBonus, lapOf, RACE_LAPS } from './raceflow.js';
import { dailySpec, mulberry32, utcDay } from './daily.js';
import { pickMissions, advanceMission, missionsDone, recordMissions, titleMissionLine } from './missions.js';
import { beginRun, fetchGhost, normalizeInitials } from './leaderboard.js';
import { createGhostRecorder, createGhostRace } from './ghost.js';
import { createOnboarding, isNewPlayer } from './onboarding.js';
import { initSettings, toggleTilt, recenterTilt, currentDifficulty, refreshSettingsPanel, settingsOpen, openSettings, registerControlsEditor } from './settings-ui.js';
import { createPenaltyLog, logHit, logWall, penaltyPoints, breakdown, logPayload } from './scoring.js';
import { carParams, isOwned, unlockProgress, recordRace, ensureGarage, CAR_SPECS } from './cars.js';
import { initRacer } from './racer-ui.js';
import { setProfile } from './identity.js';
import { LIVE } from './worker/live-rules.js';
import { forkLean, forkCueState } from './fork.js';
/** Race state the lazy race step (race-step.js) writes as well as main: one shared object. */
export const RS = {};
// The race step itself (src/race-step.js) is a lazy chunk: fetched now, in parallel with the
// title, and awaited by every race start, so a race never runs without it (0170).
let raceStep = null, raceStepLoad = null;
function loadRaceStep() {
  raceStepLoad = raceStepLoad || import('./race-step.js').then((m) => {
    if (m.LiveTrafficMethods) Object.assign(LiveTraffic, m.LiveTrafficMethods);
    return (raceStep = m);
  }, (e) => { raceStepLoad = null; throw e; });
  return raceStepLoad;
}
loadRaceStep().catch(() => {});
// Race-time actions that main still triggers (keys, touch, co-pilot, the debug hook) run in the
// race step; before it lands (no race can be on yet) they do nothing.
const raceCall = (name) => (...args) => (raceStep ? raceStep[name](...args) : undefined);
const applyPlayerDamage = raceCall('applyPlayerDamage');
const healPlayerHp = raceCall('healPlayerHp');
const performHumanTrick = raceCall('performHumanTrick');
const triggerRivalTakedown = raceCall('triggerRivalTakedown');
const activateMidnightSpecial = raceCall('activateMidnightSpecial');
const updateInteractiveCoach = raceCall('updateInteractiveCoach');
const updateLiveHud = raceCall('updateLiveHud');
const endRaceRun = raceCall('endRaceRun');
/** Every race start goes through here: straight away once the race step is in, else as soon as it
 *  lands (taps while it loads collapse into one start, with the latest options). */
let startWanted, startWait = null;
function startNewRace(opts) {
  if (raceStep) return raceStep.startNewRace(opts);
  startWanted = opts;
  startWait = startWait || loadRaceStep().then((m) => { startWait = null; return m.startNewRace(startWanted); });
  return startWait;
}

setAudioHooks({ syncAudioUI, triggerAnnouncement });

SaveStore.load();

// Game feel (pillar 2): one spark pool, one hit-stop clock, one near-miss chain for the run.
export const sparks = createParticlePool(160);
RS.fxClock = 0;
// Tyre smoke (ticket 0133): src/smoke2d.js, lazy; until it loads there is simply no smoke.
// The 3D view keeps its own world-space puffs (src/render3d/view.js).
export let smoke2d = null;
setTimeout(() => { import('./smoke2d.js').then((m) => { smoke2d = m.createTyreSmoke2D(); }, () => {}); }, 0);
let smokeRoadX = 0, smokeRoadW = 1;
// Reduced motion = the OS setting or the settings panel's choice (src/settings-ui.js).

/** Shower of sparks from the player car (pixel-canvas coords are mapped at draw time). */
export function burstSparks(count, hue, power = 1) {
  if (GameState.reducedMotion) count = Math.ceil(count / 3);
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * (0.15 + Math.random() * 0.7);
    const v = (180 + Math.random() * 420) * power;
    sparks.spawn((Math.random() - 0.5) * 60, 0, Math.cos(a) * v * (Math.random() < 0.5 ? -1 : 1), Math.sin(a) * v, 0.35 + Math.random() * 0.45, hue + Math.random() * 30, 1.5 + Math.random() * 2.5);
  }
}

// --- WORLD TOUR LEVELS (Night Streets × Takedowns × Time-Warp Campaigns) ---

// --- ADDICTING LIVE STREET CONTRACTS (Mini-Missions during gameplay) ---

// --- GLOBAL GAME STATE ---


export const JarvisAI = {
  lastSpokenTime: 0,
  setStatus(text, speakAloud = false) {
    const el = document.getElementById('jarvisStatusText');
    if (el) el.textContent = text;
    if (speakAloud && GameState.jarvisArEnabled && !SoundEngine.muted && SoundEngine.volume > 0 && window.speechSynthesis) {
      const now = Date.now();
      if (now - this.lastSpokenTime > 4500) {
        this.lastSpokenTime = now;
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.08;
          u.pitch = 0.96;
          u.volume = Math.min(1, SoundEngine.volume * 0.9);
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }
    }
  },
  fireUnibeam() {
    SoundEngine.init();
    if (GameState.fluxCharge < 18 && GameState.specialCharges <= 0) {
      this.setStatus('Arc Core needs 18% Flux energy to fire the Pulse Beam.', false);
      return;
    }
    GameState.fluxCharge = Math.max(0, GameState.fluxCharge - 18);
    GameState.unibeamTimer = 0.42;
    SoundEngine.playAbilityRoar();

    let hitCar = null;
    let bestDz = 999999;
    const allTargets = LiveTraffic.racers.concat(LiveTraffic.traffic);
    for (let i = 0; i < allTargets.length; i++) {
      const c = allTargets[i];
      const dz = c.worldZ - (GameState.trackPos + ROAD_CFG.playerZOffset);
      if (!c.takenDown && dz > 150 && dz < 4800 && dz < bestDz) {
        bestDz = dz;
        hitCar = c;
      }
    }

    if (hitCar) {
      triggerRivalTakedown(hitCar, '💠 ARC PULSE TAKEDOWN!');
      this.setStatus(`Target ${hitCar.name} neutralized via Mark-88 Arc Pulse Beam.`, true);
    } else {
      GameState.speed = Math.min(135, GameState.speed + 14);
      this.setStatus('Arc Pulse Beam discharged. Pulse overboost applied.', false);
      triggerAnnouncement('💠 ARC PULSE BEAM FIRED!', '+14 MPH PULSE THRUST!', 1100);
    }
  }
};


// --- 10X 6-DOF MULTI-BODY AUTOMOTIVE & RIGID-BODY PHYSICS ENGINE (240Hz SUB-STEPPED) ---

const PROP_POOL_SIZE = 24;
// The AI reads bends in segment `curve` units (what the track pieces are written in).
const segCurveAt = (z) => curvatureAt(z) * ROAD_CFG.segLength;
// Rival racing AI (ticket 0160) is a lazy chunk, fetched at boot long before the first grid;
// until it lands (or if it fails) rivals use the simple pace-and-dodge driver below.
export let RAI = null;
export const aiRoad = { curvatureAt: segCurveAt, bankAt, featureAt, line: null };
import('./rival-ai.js').then((m) => { RAI = m; LiveTraffic.aiWorld = m.createAiWorld(); }).catch(() => {});
export const LiveTraffic = {
  racers: [],
  traffic: [],
  obstacles: [],
  // Ticket 0074: one world stepper (Z-hash broadphase, sleeping, statics), a fixed pool of
  // knockable props, and persistent body lists so the step never allocates.
  world: createWorld(),
  props: createPropPool(PROP_POOL_SIZE, () => new RigidBody3D({ kind: 'OBSTACLE', type: 'TRAFFIC_CONE' })),
  bodies: [],          // racers + traffic + obstacles + live props (what the world steps)
  drawObstacles: [],   // obstacles + live props (what the renderers draw)
  nextPropZ: 0,
  prevPlayerZ: 0,
  // Sprint 4: every hazard is placed by the clean-line planner (src/cleanline.js), so the
  // race's racing line is never blocked by anything that costs points.
  planner: null,
  rebuildBodyLists() {
    const b = this.bodies;
    b.length = 0;
    for (let i = 0; i < this.racers.length; i++) b.push(this.racers[i]);
    for (let i = 0; i < this.traffic.length; i++) b.push(this.traffic[i]);
    const d = this.drawObstacles;
    d.length = 0;
    for (let i = 0; i < this.obstacles.length; i++) { b.push(this.obstacles[i]); d.push(this.obstacles[i]); }
    const live = this.props.live;
    for (let i = 0; i < live.length; i++) { b.push(live[i]); d.push(live[i]); }
  },
  init() {
    this.prevPlayerZ = (GameState.trackPos || 0) + ROAD_CFG.playerZOffset;
    this.props.clear();
    this.nextPropZ = this.prevPlayerZ + 9000;
    this.planner = createHazardPlanner({ line: track.line || createLine(1), rand: () => RS.trafficRand(), level: GameState.levelIndex, avoid: hasSetPieceBetween });

    // The field (ticket 0051): five named rivals from the roster (never your own driver) on a
    // two-wide grid, you at the back. Each keeps its name for the whole race.
    const playerZ0 = this.prevPlayerZ;
    const field = POP_CULTURE_ROSTER.filter((rc, i) => i !== GameState.selectedCharIdx).slice(0, FIELD_SIZE - 1);
    const pace = currentDifficulty().rivalPace;
    this.racers = field.map((rc, idx) => {
      const slot = gridSlot(idx);
      const body = new RigidBody3D({
        id: rc.id,
        kind: 'RIVAL',
        name: `${rc.driver.split(' ')[0].toUpperCase()} • ${rc.car}`,
        style: rc.shape === 'MUSCLE' ? 'MUSCLE' : 'TUNER_WING',
        shape: rc.shape, // the 3D view builds the roster archetype
        massKg: rc.massKg || 1500,
        restitution: 0.48,
        halfW: 0.14,
        height: 36,
        halfL: 115,
        worldZ: playerZ0 + slot.dz,
        offset: slot.offset,
        mph: 0,
        baseMph: RIVAL_PACES[idx],
        bodyColor: rc.body,
        accentColor: rc.cabin,
        underglow: rc.glow
      });
      body.short = rc.driver.split(/[ &]/)[0].toUpperCase();
      body.driver = rc.driver;
      body.car = rc.car;
      body.color = rc.glow;
      body.accent = rc.cabin;
      body.crew = rc.franchise;
      body.pace = RIVAL_PACES[idx] * pace;
      // A driver (ticket 0160): personality from the car's class, seeded by the race.
      body.ai = null;
      body.rc = rc;
      body.progress = GameState.distance + slot.dz / this.speedToWorld();
      body.finishTime = null;
      body.targetOffset = slot.offset;
      return body;
    });
    // Drivers (src/rival-ai.js); one of them is your nemesis and hunts you all race.
    const nem = RAI && RAI.setupField(this.aiWorld, this.racers, { seed: GameState.lineSeed, pace, cls: (r) => (CAR_SPECS[r.id] || {}).cls, carP: (r) => carParams(r.rc) });
    GameState.nemesisId = nem ? nem.id : null;
    this.updateStandings(0, playerZ0, this.speedToWorld());

    // ONLY 4 Well-Spaced Highway Traffic Vehicles (Spaced 5,200 Z-units apart!)
    this.traffic = [];
    const styles = ['SEMI_TRUCK', 'SEDAN', 'TAXI', 'SUV'];
    for (let i = 0; i < 4; i++) {
      const st = styles[i % styles.length];
      const isTruck = (st === 'SEMI_TRUCK');
      const tz = 4800 + i * 5200;
      this.traffic.push(new RigidBody3D({
        id: 'TRF_' + i,
        kind: 'TRAFFIC',
        name: isTruck ? '18-WHEELER RIG' : 'HIGHWAY TRAFFIC',
        style: st,
        massKg: isTruck ? 5800 : 1420,
        restitution: 0.38,
        halfW: isTruck ? 0.16 : 0.13,
        height: isTruck ? 54 : 34,
        halfL: isTruck ? 160 : 105,
        worldZ: tz,
        offset: this.planner.trafficLane(i, tz, GameState.waveTier || 1, isTruck ? 0.16 : 0.13, isTruck ? 160 : 105),
        oncoming: false,
        mph: 38 + i * 4,
        bodyColor: ['#334155', '#eab308', '#e2e8f0', '#1e3a8a'][i % 4]
      }));
    }

    // Four recycled obstacles, placed off the racing line with rhythm (sprint 4).
    this.obstacles = [];
    let fromZ = 3200;
    for (let i = 0; i < 4; i++) {
      const spot = this.planner.placeObstacle(i, fromZ, 1) || { type: 'PINE_TREE_HAZARD', z: fromZ + 60000, offset: 0.62 };
      this.obstacles.push(this.createObstacleBody(i, spot.type, spot.z, spot.offset));
      fromZ = spot.z + this.planner.obstacleSpacing(spot.z, 1);
    }
    this.rebuildBodyLists();
  },

  /** Rival progress, finish times and your position (ticket 0051). */
  updateStandings(rawDt, playerZ, speedToWorld) {
    const L = GameState.raceLength;
    const field = this.fieldEntries;
    field.length = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const before = r.progress;
      r.progress = GameState.distance + (r.worldZ - playerZ) / speedToWorld;
      if (L && r.finishTime == null && r.progress >= L && GameState.raceTime > 1) {
        r.finishTime = crossingTime(GameState.raceTime, rawDt, before, r.progress, L);
      }
      field.push(r);
    }
    // Live races (0060): friends and CPU cars from the room join the same standings.
    for (let i = 0; i < live.ghosts.length; i++) field.push(live.ghosts[i]);
    field.push(this.playerEntry);
    this.playerEntry.progress = GameState.distance;
    this.playerEntry.finishTime = GameState.finishTime;
    sortStandings(field);
    GameState.racePosition = field.indexOf(this.playerEntry) + 1;
    GameState.totalRacers = field.length;
  },
  // The world the rival AI sees (ticket 0160), refilled each frame without allocating.
  aiWorld: null,
  fieldEntries: [], // reused every frame: the standings, leader first
  playerEntry: { id: 'YOU', short: 'YOU', progress: 0, finishTime: null, isPlayer: true },

  /** World units per (mph × second) at the current pace setting. */
  speedToWorld() {
    const paceCfg = PACE_MODES[GameState.paceMode] || PACE_MODES[0];
    return (11000 * paceCfg.mult) / 88;
  },

  /** Body options for an obstacle or prop of `oType`, from its material (ticket 0074). */
  obstacleOpts(idx, oType, zPos, laneOffset) {
    const m = materialFor(oType);
    return {
      id: 'OBS_' + idx,
      kind: 'OBSTACLE',
      type: oType,
      name: oType,
      worldZ: zPos,
      offset: laneOffset,
      massKg: m.massKg,
      restitution: m.restitution,
      friction: m.friction,
      knockable: m.knockable,
      halfW: m.halfW,
      height: m.height,
      clearanceY: m.clearanceY || 0,
      halfL: m.halfL,
      bodyColor: '#1e293b',
      accentColor: '#f59e0b'
    };
  },
  createObstacleBody(idx, oType, zPos, laneOffset) {
    return new RigidBody3D(this.obstacleOpts(idx, oType, zPos, laneOffset));
  },




};

export function initTrack() {
  setTrackLine(createLine(GameState.lineSeed || 1));
  // Seeded races (live rooms, dailies) shuffle the road with their shared seed; a normal race
  // gets its level's fixed layout so the level's leaderboard is one road for everyone.
  setTrackSeed(GameState.daily || GameState.mode === 'LIVE' ? GameState.lineSeed : 0);
  setTrackIntensity(1);
  setTrackPowerups(GameState.mode === 'INFINITE' && !GameState.daily ? 1 : 0); // runner power-ups (0177)
  buildInitialTrack();
  LiveTraffic.init();
}

// --- ANNOUNCER & CONTRACT PROGRESSION ---
// One announcement channel (ticket 0002): src/announcer.js decides what is visible; this
// only paints it. Priority is inferred from the text unless a caller passes one.
export const announcer = createAnnouncer({
  now: () => performance.now(),
  show(msg) {
    const mainEl = document.getElementById('announcerMain');
    const subEl = document.getElementById('announcerSub');
    if (!mainEl || !subEl) return;
    // The shared lane belongs to the announcer the moment it speaks — not a frame later —
    // so the coach can never be caught on screen with it.
    const coachBanner = document.getElementById('interactiveCoachBanner');
    if (coachBanner) hideCoach(coachBanner);
    RS.coachYieldUntil = performance.now() + 350;
    mainEl.textContent = msg.main;
    subEl.textContent = msg.sub;
    mainEl.style.opacity = '1';
    mainEl.style.transform = 'scale(1.06)';
    subEl.style.opacity = msg.sub ? '1' : '0';
  },
  hide() {
    const mainEl = document.getElementById('announcerMain');
    const subEl = document.getElementById('announcerSub');
    if (!mainEl || !subEl) return;
    mainEl.style.opacity = '0';
    mainEl.style.transform = 'scale(0.9)';
    subEl.style.opacity = '0';
  },
});

export function triggerAnnouncement(mainText, subText = '', duration = 950, priority) {
  announcer.push(mainText, subText, duration, priority);
}

// Run missions (ticket 0026): the run's three contracts; a completion pays out and goes
// through the announcer (no HUD row). The results card lists all three.
export function advanceContractProgress(type, amount) {
  if (type === 'NEAR_MISS') runStats.nearMisses += amount; // endless goals (ticket 0151)
  const m = advanceMission(GameState.missions, type, amount);
  if (!m) return;
  SaveStore.data.fluxCoins += m.reward;
  GameState.runCoins += m.reward;
  GameState.score += 3000 * GameState.combo;
  GameState.specialCharges = Math.min(5, GameState.specialCharges + 1);
  SoundEngine.playCheckpoint();
  // A finished mission is a reward the player earned: it outranks routine callouts (priority 2,
  // with laps and checkpoints) so a start-of-race line can't push it out of the queue.
  triggerAnnouncement(`🎯 MISSION ${missionsDone(GameState.missions)}/3 COMPLETE!`, `${m.label} · +${m.reward} ⚡ & +1 SPECIAL`, 1900, 2);
  SaveStore.save();
}






// Endless runner loop (ticket 0151, src/runner.js): the Time Storm behind you, three run goals
// that raise a permanent points multiplier, a "YOUR BEST" gate on the road, one coins-only
// continue. Endless solo runs only.
export const storm = createStorm();
export const runStats = { coins: 0, driftSecs: 0, loops: 0, cleanBest: 0, cleanCur: 0, tier: 1, nearMisses: 0, nosSecs: 0, powerups: 0, magnetCoins: 0, shieldSaves: 0, doubledCash: 0 };
let runnerShown = ''; RS.stormCrash = false; RS.goalClock = 0; RS.lastLoopF = null; RS.lastDist = 0; RS.bestGateSeg = -1; RS.passedBest = false;
// Goals and the continue offer live in the lazy runner UI chunk (fetched at boot, idle).
export let runnerUi = null, runnerMod = null;
export const loadRunnerUi = () => (runnerUi = runnerUi || import('./runner-ui.js').then((m) => (runnerMod = m)));



/** Storm glow + meter (DOM writes only on change) and the goal lists (lazy chunk). */
export function syncRunnerUi(force) {
  const endless = GameState.mode === 'INFINITE' && !GameState.daily && GameState.status !== 'TITLE';
  const warn = endless ? Math.round((GameState.stormWarn || 0) * 20) / 20 : 0;
  const key = `${warn}|${warn > 0 ? Math.max(0, Math.round(GameState.stormGap)) : ''}`;
  if (force || key !== runnerShown) {
    runnerShown = key;
    const glow = document.getElementById('stormGlow');
    if (glow) { glow.style.opacity = String(warn * 0.9); glow.classList.toggle('is-close', warn > 0.6); }
    const chip = document.getElementById('hudStorm');
    if (chip) {
      chip.classList.toggle('hidden', warn <= 0);
      if (warn > 0) document.getElementById('hudStormGap').textContent = String(Math.max(0, Math.round(GameState.stormGap)));
    }
  }
  if (force || RS.goalClock === 0) loadRunnerUi().then((ui) => ui.renderGoals(SaveStore.data, runStats, GameState.mode === 'INFINITE' && !GameState.daily, () => SaveStore.save())).catch(() => {});
}












const TOY_DECK = {
  slab: '#4a1202', sheen: 'rgba(255, 215, 150, 0.14)', groove: 'rgba(40, 10, 0, 0.36)', center: 'rgba(255, 195, 40, 0.72)',
  wall: '#8a1c02', rimA: '#ffaa00', rimB: '#ff8800', lip: '#b22c04',
};

function getActiveEraRenderConfig() {
  if (GameState.visualOverride === '8BIT') return ERAS[0];
  if (GameState.visualOverride === '16BIT') return ERAS[1];
  if (GameState.visualOverride === 'HD') return ERAS[3];
  return ERAS[GameState.eraIndex];
}

export function updateEraHud() {
  const era = ERAS[GameState.eraIndex];
  const renderEra = getActiveEraRenderConfig();
  const badge = document.getElementById('eraBadge');
  const pres = document.getElementById('presTimeText');
  const dest = document.getElementById('destTimeText');
  const warps = document.getElementById('warpsCountText');
  const crt = document.getElementById('crtOverlay');

  if (badge) badge.textContent = era.name;
  if (pres) pres.textContent = era.presentDate;
  if (dest) dest.textContent = era.destDate;
  if (warps) warps.textContent = `${GameState.timeWarps} JUMPS`;
  if (crt) crt.style.opacity = renderEra.scanlines ? '0.68' : '0.06';

  for (let i = 0; i < 4; i++) {
    const pill = document.getElementById(`eraStep${i}`);
    if (pill) {
      pill.className = (i === GameState.eraIndex)
        ? 'px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold shadow'
        : 'px-1.5 py-0.5 rounded bg-slate-800 text-slate-400';
    }
  }
}


export const lateral = createLateral();
export const drive = createDrive(); // ticket 0131: gears, traction, brakes (src/drivetrain.js)
// NOS (ticket 0122): the tank is per race and sized by the car's FLUX/BOOST rating.
RS.nos = createNos(nosFor(5));
RS.penaltyThisStep = false;



RS.coachYieldUntil = 0;

export function hideCoach(banner) {
  banner.style.opacity = '0';
  banner.style.pointerEvents = 'none';
}


export const hudView = {
  position: 1, total: 1, progress: 0, length: 0, raceTime: 0, timeLeft: 0, clockUrgent: false,
  infinite: false, mph: 0, flux: 0, nos: 0, nosOn: false, hpFrac: 1, score: 0, field: LiveTraffic.fieldEntries,
};

export const ghostRace = createGhostRace();
RS.pendingGhost = null; // { level, data } armed by the results screen, used by the next start

async function raceGhostOf(initials, level) {
  const data = await fetchGhost('ARCADE', level, initials);
  if (!data) { triggerAnnouncement('👻 NO GHOST YET', 'FINISH A RACE ON THIS TRACK TO LEAVE ONE', 2000); return; }
  RS.pendingGhost = { level, data };
  GameState.levelIndex = level;
  startNewRace();
}



// --- PSEUDO-3D NIGHT-STREET RENDERER ---
const mainCanvas = document.getElementById('gameCanvas');
const mainCtx = mainCanvas.getContext('2d');
const pixelCanvas = document.createElement('canvas');
const pixelCtx = pixelCanvas.getContext('2d');

// Graphics quality (ticket 0041). The controller is a lazy chunk (src/perf/gfx-boot.js);
// until it lands everything draws at full quality. Render-only: the sim never reads it.
export let gfxQ = { res: 1, tier: 'high', step: 0 };
const lowerTier = (t) => ({ ultra: 'high', high: 'medium', medium: 'low' }[t] || 'low');
let gfx = null;
function loadGfx() {
  import('./perf/gfx-boot.js').then((m) => {
    gfx = m.bootGfx({ debug: DEBUG_MODE, onQuality: (q) => { gfxQ = q; if (view3d && view3d.setQuality) view3d.setQuality(q); } });
    // The era backdrops (src/scenes/) follow the tier, one tier lower once the governor is
    // deep into its ladder (step 4+: effects already gone, so the parallax art goes too).
    setBackdropQuality(() => (gfxQ.step >= 4 ? lowerTier(gfxQ.tier) : gfxQ.tier));
  }).catch(() => {});
}

// The display canvas is sized in CSS px (viewW × viewH, what all 2D drawing code works in)
// and backed by viewK device pixels per CSS px, so phones and tablets get crisp lines instead
// of a 1× image stretched 2–3×. viewK follows the graphics tier and the governor (gfxQ.dpr:
// LOW stays at 1×, ULTRA reaches 2×), so slow devices pay nothing.
let viewW = 320, viewH = 240, viewK = 1;
const backingScale = () => Math.max(1, Math.min(window.devicePixelRatio || 1, gfxQ.dpr || 1, 2));
function resizeCanvases() {
  const container = document.getElementById('canvasContainer');
  const w = container ? container.clientWidth : window.innerWidth;
  const h = container ? container.clientHeight : window.innerHeight;
  viewW = Math.max(320, w);
  viewH = Math.max(240, h);
  viewK = backingScale();
  mainCanvas.width = Math.round(viewW * viewK);
  mainCanvas.height = Math.round(viewH * viewK);
}
/** Start a frame on the display canvas: CSS-px coordinates at the current backing scale. */
function beginMainFrame() {
  if (backingScale() !== viewK) resizeCanvases();
  mainCtx.setTransform(viewK, 0, 0, viewK, 0, 0);
}


function drawPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

/** Logical height of the 2D road canvas (era pixel scale applied). */
function roadCanvasHeight() {
  const scale = getActiveEraRenderConfig().pixelScale || 1.0;
  return Math.max(160, Math.floor(viewH / scale));
}

/** Simulation-owned tyre contact Z; independent of which renderer draws the frame. */
function syncContactZ() {
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  const z = contactZ(track, GameState, camCfg, roadCanvasHeight());
  if (z !== null) GameState.visualPlayerZ = z;
}

// The backdrop's per-frame facts, reused every frame (no allocation in the render loop).
const backdropFrame = { curve: 0, trackPos: 0, playerX: 0, t: 0, raceTime: 0, speed: 0, lap: 1, laps: 0, warp: -1, reduced: false };

let lookPx = 0, lookClock = 0; // 2D look-into-the-corner (ticket 0181)
function renderScene() {
  const eraCfg = getActiveEraRenderConfig();
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  // The road is drawn in logical px (rw × rh, the same height the simulation's tyre contact
  // uses) onto a backing store of rw·pk × rh·pk: the governor trades resolution (res) for frame
  // time, and the backing scale adds device pixels where the tier can afford them.
  const scale = eraCfg.pixelScale || 1.0;
  const rw = Math.max(240, Math.floor(viewW / scale));
  const rh = Math.max(160, Math.floor(viewH / scale));
  beginMainFrame();
  const pk = Math.max(0.5, gfxQ.res * viewK);
  const bw = Math.round(rw * pk), bh = Math.round(rh * pk);
  if (pixelCanvas.width !== bw || pixelCanvas.height !== bh) {
    pixelCanvas.width = bw;
    pixelCanvas.height = bh;
  }
  if (carArt) { carArt.setSpriteScale(pk); carArt.beginFrame(); }
  if (pickupArt && pickupArt.setPixelScale) pickupArt.setPixelScale(pk);
  GameState.pixelScale = pk; // for lazy 2D art (billboards…): cache at pixelScale × drawn size

  const ctx = pixelCtx;
  ctx.setTransform(bw / rw, 0, 0, bh / rh, 0, 0);
  ctx.save();

  // Screen Shake on Takedown / Roar / Boost
  if (GameState.screenShake > 0 && !GameState.reducedMotion) {
    const mag = GameState.screenShake * 2.5;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // Set-piece roll (sprint 4): the world barrel-rolls through a corkscrew and leans up a
  // half-pipe wall; the car stays put on screen. Undone before the car is drawn.
  const rollF = featureAt(GameState.trackPos + ROAD_CFG.playerZOffset);
  const roll = GameState.status === 'PLAYING' || GameState.status === 'PAUSED' ? viewRoll(rollF, GameState.trackPos + ROAD_CFG.playerZOffset, GameState.reducedMotion) : 0;
  let rolled = false;
  if (roll !== 0) {
    ctx.fillStyle = eraCfg.skyTop || '#05040d';
    ctx.fillRect(0, 0, rw, rh);
    ctx.save();
    ctx.translate(rw / 2, rh * 0.62);
    ctx.rotate(roll);
    ctx.scale(1.5, 1.5);
    ctx.translate(-rw / 2, -rh * 0.62);
    rolled = true;
  }

  // 1. The era's world: sky, parallax layers and live set pieces (src/backdrop.js, ticket 0100).
  const horizonY = Math.floor(rh * 0.46 - GameState.loopPitchOffset * (rh / 420));
  const bgSeg = track.seg(Math.floor(GameState.trackPos / ROAD_CFG.segLength));
  backdropFrame.curve = bgSeg ? bgSeg.curve : 0;
  backdropFrame.trackPos = GameState.trackPos;
  backdropFrame.playerX = GameState.playerX;
  backdropFrame.t = RS.fxClock;
  backdropFrame.raceTime = GameState.raceTime || 0;
  backdropFrame.speed = GameState.status === 'PLAYING' ? GameState.speed : 0;
  backdropFrame.lap = GameState.lapSplits.length + 1;
  backdropFrame.laps = RACE_LAPS;
  backdropFrame.warp = GameState.warpFxTimer > 0 ? 0.9 - GameState.warpFxTimer : -1;
  backdropFrame.reduced = GameState.reducedMotion;
  drawBackdrop(ctx, rw, rh, horizonY, eraCfg, backdropFrame);

  // 2. Project & Draw Seamless 3D Orange Toy-Track Segments (Zero Distracting Blue Bars!)
  const baseIndex = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  const basePercent = (GameState.trackPos % ROAD_CFG.segLength) / ROAD_CFG.segLength;
  const baseSeg = track.seg(baseIndex) || track.seg(track.start);
  if (!baseSeg) {
    if (rolled) ctx.restore();
    ctx.restore();
    return;
  }


  const playerElevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  let playerCurveX = 0;
  let playerCurveDX = -(baseSeg.curve * basePercent);
  for (let cStep = 0; cStep < 6; cStep++) {
    const cSeg = track.seg(baseIndex + cStep);
    if (!cSeg) break;
    playerCurveX += playerCurveDX;
    playerCurveDX += cSeg.curve;
  }
  const cameraX = (GameState.playerX * ROAD_CFG.roadWidth) + playerCurveX;
  const cameraY = playerElevation + camCfg.height + GameState.playerY * 3.5;
  const cameraZ = GameState.trackPos;
  const dynamicDepth = cameraDepth(camCfg, GameState.speed);

  // Look into the corner (ticket 0181): the chase cam turns toward where the road goes (the
  // curvature ahead) and where the car points (its yaw), like a driver's eyes. A shift of the
  // view's centre line, so road, cars and props all move together; off for loops, corkscrews
  // and under reduced motion.
  const racing = GameState.status === 'PLAYING' || GameState.status === 'PAUSED';
  const lookOn = racing && !GameState.reducedMotion && roll === 0 && !(setPieceArt && loopNear(GameState.trackPos + ROAD_CFG.playerZOffset));
  const lookWant = lookOn ? -Math.max(-0.045, Math.min(0.045, (GameState.upcomingCurveSum || 0) * 0.0025 + (GameState.carYaw || 0) * 0.06)) * rw : 0;
  const lookDt = Math.min(0.1, Math.max(0, RS.fxClock - lookClock)); // sim time: holds while paused
  lookClock = RS.fxClock;
  if (!racing) lookPx = 0;
  else lookPx += (lookWant - lookPx) * (1 - Math.exp(-lookDt * 2.6));
  const viewCx = rw / 2 + Math.round(lookPx);
  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = rh;
  const DK = eraCfg.deck || TOY_DECK; // the track's colours (orange toy track; glass ribbon in orbit)
  const visibleSegments = [];
  const playerTireScreenY = Math.floor(rh * 0.87);
  let foundPlayerSeg = null;

  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = track.seg(baseIndex + n);
    if (!seg) break;

    seg.p1.world.x = x;
    seg.p2.world.x = x + dx;

    projectPoint(seg.p1, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh, viewCx);
    projectPoint(seg.p2, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh, viewCx);

    x += dx;
    dx += seg.curve;

    if (seg.p1.camera.z <= dynamicDepth || seg.p2.screen.y >= maxY || seg.p2.screen.y >= seg.p1.screen.y) {
      continue;
    }

    visibleSegments.push(seg);
    if (seg.trackType === 'GAP') continue; // a jump's gap: no road, just air

    const x1 = seg.p1.screen.x;
    const y1 = seg.p1.screen.y;
    const w1 = seg.p1.screen.w;
    const x2 = seg.p2.screen.x;
    const y2 = seg.p2.screen.y;
    const w2 = seg.p2.screen.w;

    // Capture the exact segment at the player's tire contact line (y = 87% of screen height) for 1:1 visual collision!
    // The tyre contact row; the simulation's own copy (visualPlayerZ) comes from contact.js.
    if (!foundPlayerSeg && y1 >= playerTireScreenY && y2 <= playerTireScreenY) {
      foundPlayerSeg = seg;
    }

    const isAlt = (Math.floor(seg.index / 10) % 2) === 0;

    // 1. 3D Extruded Track Underside Shadow Slab
    const slabH1 = Math.max(2, w1 * 0.055);
    const slabH2 = Math.max(1.5, w2 * 0.055);
    const railW1 = w1 * 1.12;
    const railW2 = w2 * 1.12;
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 + railW1, y1 + slabH1, x2 + railW2, y2 + slabH2, x2 - railW2, y2 + slabH2, DK.slab);

    // 2. Seamless Anodized Tangerine-Orange Toy-Track Deck (Zero Blue Bars!)
    let surfaceColor = isAlt ? (DK.surfA || eraCfg.trackA) : (DK.surfB || eraCfg.trackB);
    if (seg.trackType === 'BOOSTER') {
      surfaceColor = DK.boostA ? (isAlt ? DK.boostA : DK.boostB) : (isAlt ? '#ea580c' : '#d9460f');
    } else if (seg.trackType === 'JUMP_RAMP') {
      surfaceColor = isAlt ? '#f59e0b' : '#d97706';
    }
    drawPolygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, surfaceColor);
    if (live.finishZ && seg.index === Math.floor(live.finishZ / ROAD_CFG.segLength)) drawFinishLine(ctx, x1, y1, w1, x2, y2, w2);

    // 3. Soft Satin Specular Sheen Along Left & Right Lanes
    const sheenCol = DK.sheen;
    drawPolygon(ctx, x1 - w1 * 0.58, y1, x1 - w1 * 0.28, y1, x2 - w2 * 0.28, y2, x2 - w2 * 0.58, y2, sheenCol);
    drawPolygon(ctx, x1 + w1 * 0.28, y1, x1 + w1 * 0.58, y1, x2 + w2 * 0.58, y2, x2 + w2 * 0.28, y2, sheenCol);

    // 4. Subtle Carbon-Recessed Lane Grooves & Warm Gold Center Line
    const lineW1 = Math.max(1.2, w1 * 0.016);
    const lineW2 = Math.max(0.8, w2 * 0.016);
    const grooveCol = DK.groove;
    drawPolygon(ctx, x1 - w1 * 0.46 - lineW1, y1, x1 - w1 * 0.46 + lineW1, y1, x2 - w2 * 0.46 + lineW2, y2, x2 - w2 * 0.46 - lineW2, y2, grooveCol);
    drawPolygon(ctx, x1 + w1 * 0.46 - lineW1, y1, x1 + w1 * 0.46 + lineW1, y1, x2 + w2 * 0.46 + lineW2, y2, x2 + w2 * 0.46 - lineW2, y2, grooveCol);

    const centerCol = seg.trackType === 'BOOSTER' ? '#fde047' : DK.center;
    drawPolygon(ctx, x1 - lineW1, y1, x1 + lineW1, y1, x2 + lineW2, y2, x2 - lineW2, y2, centerCol);

    // 5. 3D Extruded Side Guide Walls (Inner Shaded Wall + Warm Gold Top Bevel + Outer Lip)
    const wallH1 = Math.max(2, w1 * 0.068);
    const wallH2 = Math.max(1, w2 * 0.068);
    drawPolygon(ctx, x1 - w1, y1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - w2, y2, DK.wall);
    drawPolygon(ctx, x1 + w1, y1, x1 + w1, y1 - wallH1, x2 + w2, y2 - wallH2, x2 + w2, y2, DK.wall);
    const topRimCol = isAlt ? DK.rimA : DK.rimB;
    drawPolygon(ctx, x1 - railW1, y1 - wallH1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - railW2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 + w1, y1 - wallH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + w2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 - railW1, y1 - wallH1, x2 - railW2, y2 - wallH2, x2 - railW2, y2 + slabH2, DK.lip);
    drawPolygon(ctx, x1 + railW1, y1 + slabH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + railW2, y2 + slabH2, DK.lip);

    // Steady Twin Tire Trails at 88 MPH (No per-segment blinking)
    if (seg.flameLeft) {
      const fx1 = x1 + (seg.flameOffset || 0) * w1;
      const fx2 = x2 + (seg.flameOffset || 0) * w2;
      const tireSpan1 = w1 * 0.22;
      const tireSpan2 = w2 * 0.22;
      const fw1 = Math.max(2, w1 * 0.045);
      const fw2 = Math.max(1, w2 * 0.045);
      const flameCol = 'rgba(0, 224, 255, 0.7)';
      drawPolygon(ctx, fx1 - tireSpan1 - fw1, y1, fx1 - tireSpan1 + fw1, y1, fx2 - tireSpan2 + fw2, y2, fx2 - tireSpan2 - fw2, y2, flameCol);
      drawPolygon(ctx, fx1 + tireSpan1 - fw1, y1, fx1 + tireSpan1 + fw1, y1, fx2 + tireSpan2 + fw2, y2, fx2 + tireSpan2 - fw2, y2, flameCol);
    }

    maxY = y2;
  }

  if (setPieceArt) setPieceArt.drawAhead(ctx, visibleSegments, eraCfg, rw, rh);

  // 3. Draw Scenery, Night-Street Smoke Flares, Collectibles & Rival/Police Cars
  for (let i = visibleSegments.length - 1; i >= 0; i--) {
    const seg = visibleSegments[i];
    const roadX = seg.p1.screen.x;
    const roadY = seg.p1.screen.y;
    const roadW = seg.p1.screen.w;

    for (let k = 0; k < seg.items.length; k++) {
      const item = seg.items[k];
      if (item.collected) continue;

      const itemX = roadX + item.offset * roadW;
      const itemW = Math.max(4, roadW * 0.24);
      const itemH = Math.max(4, itemW * 1.1);

      if (item.smashed) continue;
      const nowSec = Date.now() * 0.001;
      const bobY = Math.sin(nowSec * 5.5 + (item.phase || 0)) * (itemH * 0.18);

      if (item.type === 'MC_FLARE_GREEN') {
        const beaconH = itemH * 4.2;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
        ctx.fillRect(itemX - itemW * 0.22, roadY - beaconH, itemW * 0.44, beaconH);
        ctx.fillStyle = '#00ff66';
        ctx.beginPath();
        ctx.arc(itemX, roadY - 4, Math.max(3, itemW * 0.35), 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'BEST_GATE') {
        // Your best Endless run (ticket 0151): a cyan arch with YOUR BEST across it.
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = Math.max(3, roadW * 0.06);
        ctx.beginPath();
        ctx.arc(roadX, roadY, roadW * 1.08, Math.PI, 0);
        ctx.stroke();
        if (roadW > 24) {
          ctx.fillStyle = '#22d3ee';
          ctx.font = `900 ${Math.round(roadW * 0.2)}px Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('YOUR BEST', roadX, roadY - roadW * 0.86);
        }
      } else if (item.type === 'OVERHEAD_GATE') {
        ctx.strokeStyle = seg.trackType === 'BOOSTER' ? '#fde047' : '#ff8800';
        ctx.lineWidth = Math.max(2, roadW * 0.045);
        ctx.beginPath();
        ctx.arc(roadX, roadY, roadW * 1.05, Math.PI, 0);
        ctx.stroke();

        // Animated Spinning Green Toy-Track Booster Rollers on the Track Sides!
        if (seg.trackType === 'BOOSTER' && roadW > 20) {
          const spinAngle = GameState.reducedMotion ? 0.6 : nowSec * 18;
          const rollerR = Math.min(rh * 0.05, Math.max(3, roadW * 0.065));
          [-1.04, 1.04].forEach((side) => {
            // booster rollers (ticket 0101): a dark housing with a glowing, spinning wheel
            const rx = roadX + side * roadW;
            const ry = roadY - rollerR;
            ctx.fillStyle = '#0b1220';
            ctx.fillRect(rx - rollerR * 1.15, ry - rollerR * 0.9, rollerR * 2.3, rollerR * 1.9);
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = Math.max(1.5, rollerR * 0.22);
            ctx.beginPath();
            ctx.arc(rx, ry, rollerR * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, rollerR * 0.12);
            ctx.beginPath();
            ctx.moveTo(rx - Math.cos(spinAngle) * rollerR * 0.6, ry - Math.sin(spinAngle) * rollerR * 0.6);
            ctx.lineTo(rx + Math.cos(spinAngle) * rollerR * 0.6, ry + Math.sin(spinAngle) * rollerR * 0.6);
            ctx.stroke();
          });
        }
      } else if (PICKUPS[item.type]) {
        // Crisp cached icon (src/pickup-art.js); a plain disc until the chunk lands.
        const size = Math.max(6, itemW * 0.95);
        const py = roadY - itemW * 0.72 + bobY;
        if (pickupArt) pickupArt.drawPickup(ctx, item.type, itemX, py, size, nowSec, item.phase || 0, GameState.reducedMotion);
        else { ctx.fillStyle = PICKUPS[item.type].color; ctx.beginPath(); ctx.arc(itemX, py, size * 0.4, 0, Math.PI * 2); ctx.fill(); }
      } else if ((item.type === 'STREET_LAMP' || item.type === 'PALM_TREE' || item.type === 'ARCH_HW') && drawRoadsideProp(ctx, item.type, itemX, roadY, itemW, itemH, roadW, rw, rh)) {
        // the era's own roadside (ticket 0101)
      } else if (item.type === 'STREET_LAMP') {
        const postH = itemH * 2.5;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(itemX - 1.5, roadY - postH, 3, postH);
      } else if (item.type === 'BILLBOARD' || item.type === 'CLOCK_TOWER_BILLBOARD') {
        // Ad slots and the era's own boards: crisp cached faces (src/billboards.js, docs/ADS.md)
        drawBoard(ctx, item, seg.index, itemX, roadY, roadW, rw, rh, eraCfg.id);
      }
    }

    // Render Live 3D Rigid-Body Obstacles on this Segment (Sleek 3D Street Barricades & Hurdles — Zero Distracting Blue Bars!)
    for (let o = 0; o < LiveTraffic.drawObstacles.length; o++) {
      const ob = LiveTraffic.drawObstacles[o];
      const obSegIdx = Math.floor(ob.worldZ / ROAD_CFG.segLength);
      if (obSegIdx !== seg.index) continue;

      const ox = roadX + ob.offset * roadW;
      const oyLift = (ob.y / 180) * (roadW * 0.45);
      const oy = roadY - oyLift;
      const ow = Math.max(12, roadW * (ob.halfW * 2.0));
      const oh = Math.max(7, ow * 0.58);

      ctx.save();
      ctx.translate(ox, oy - oh * 0.5);
      ctx.rotate(ob.rot);

      // Ground contact shadow
      if (ob.y < 15) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(-ow * 0.52, oh * 0.42, ow * 1.04, 4);
      }

      if (ob.type === 'TRAFFIC_CONE') {
        // 🔺 Traffic cone (ticket 0074): knockable, tumbles when hit.
        const ch = oh * 1.5;
        ctx.fillStyle = '#111827';
        ctx.fillRect(-ow * 0.55, oh * 0.32, ow * 1.1, oh * 0.18);
        ctx.fillStyle = '#ff6a00';
        ctx.beginPath();
        ctx.moveTo(-ow * 0.42, oh * 0.34);
        ctx.lineTo(0, oh * 0.34 - ch);
        ctx.lineTo(ow * 0.42, oh * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-ow * 0.24, oh * 0.34 - ch * 0.55, ow * 0.48, Math.max(1.5, ch * 0.13));
      } else if (ob.type === 'OIL_BARREL') {
        // 🛢 Oil barrel (ticket 0074): heavy prop, rolls and tumbles.
        const bh = oh * 1.6;
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(-ow * 0.4, oh * 0.45 - bh, ow * 0.8, bh);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-ow * 0.4, oh * 0.45 - bh * 0.72, ow * 0.8, Math.max(2, bh * 0.1));
        ctx.fillRect(-ow * 0.4, oh * 0.45 - bh * 0.32, ow * 0.8, Math.max(2, bh * 0.1));
        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(-ow * 0.4, oh * 0.45 - bh, ow * 0.8, Math.max(1.5, bh * 0.06));
      } else if (ob.type === 'PINE_TREE_HAZARD') {
        // A solid hazard (static in physics): the era's own art over the collision box, and the
        // golden close-shave ring you can graze for a boost.
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.lineWidth = Math.max(1.5, ow * 0.05);
        ctx.beginPath();
        ctx.ellipse(0, oh * 0.40, ow * 0.72, oh * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!drawHazardArt(ctx, ow, oh * 0.45, roadW, rw, rh)) {
          ctx.fillStyle = '#064e3b';
          ctx.beginPath();
          ctx.moveTo(-ow * 0.5, oh * 0.4);
          ctx.lineTo(0, -oh * 1.6);
          ctx.lineTo(ow * 0.5, oh * 0.4);
          ctx.fill();
        }
      } else if (ob.type === 'LOW_LASER_BAR') {
        // 🟠 3D CARBON & PLASMA HURDLE (Jump Over [H] OR Steer Around)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-ow * 0.54, -oh * 0.35, ow * 0.16, oh * 0.85);
        ctx.fillRect(ow * 0.38, -oh * 0.35, ow * 0.16, oh * 0.85);
        // Glowing amber-red plasma beam
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-ow * 0.42, -oh * 0.12, ow * 0.84, oh * 0.32);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-ow * 0.42, -oh * 0.02, ow * 0.84, oh * 0.12);
      } else if (ob.type === 'HIGH_LIGHT_GATE') {
        // 🔶 3D OVERHEAD STEEL GANTRY ARCH (Hold Drift [S] to Slide Under OR Steer Around)
        const gateH = oh * 1.65;
        ctx.fillStyle = '#334155';
        ctx.fillRect(-ow * 0.52, -gateH + oh * 0.5, Math.max(3, ow * 0.12), gateH);
        ctx.fillRect(ow * 0.40, -gateH + oh * 0.5, Math.max(3, ow * 0.12), gateH);
        // Overhead dark-steel hazard beam with amber warning stripes
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-ow * 0.52, -gateH + oh * 0.5, ow * 1.04, gateH * 0.44);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = Math.max(1.5, ow * 0.04);
        ctx.strokeRect(-ow * 0.50, -gateH + oh * 0.52, ow, gateH * 0.40);
      } else {
        // 🚧 3D JERSEY CONCRETE & STEEL BARRICADE WITH FLASHING AMBER BEACONS
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(-ow * 0.50, oh * 0.45);
        ctx.lineTo(-ow * 0.42, -oh * 0.42);
        ctx.lineTo(ow * 0.42, -oh * 0.42);
        ctx.lineTo(ow * 0.50, oh * 0.45);
        ctx.closePath();
        ctx.fill();
        // Reflective hazard chevrons
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-ow * 0.38, -oh * 0.24, ow * 0.32, oh * 0.44);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(ow * 0.06, -oh * 0.24, ow * 0.32, oh * 0.44);
        // Dual amber beacons on top
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(-ow * 0.32, -oh * 0.48, Math.max(2, ow * 0.06), 0, Math.PI * 2);
        ctx.arc(ow * 0.32, -oh * 0.48, Math.max(2, ow * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Live Moving Street Rivals & Highway Traffic on this Segment!
    const allMovingCars = live.ghosts.length ? LiveTraffic.racers.concat(LiveTraffic.traffic, live.ghosts) : LiveTraffic.racers.concat(LiveTraffic.traffic);
    for (let m = 0; m < allMovingCars.length; m++) {
      const mv = allMovingCars[m];
      if (mv.takenDown) continue;
      const mvSegIdx = Math.floor(mv.worldZ / ROAD_CFG.segLength);
      if (mvSegIdx !== seg.index) continue;

      const cx = roadX + mv.offset * roadW;
      const mvLift = (((mv.y || 0) + (mv.suspY || 0)) / 180) * (roadW * 0.45);
      const roadYifted = roadY - mvLift;
      const isTruck = (mv.style === 'SEMI_TRUCK');
      const cw = Math.max(10, roadW * (isTruck ? 0.38 : 0.32));
      const ch = Math.max(6, cw * (isTruck ? 0.95 : 0.56));

      // Slipstream Draft Wake Cone if player is drafting this car
      if (GameState.draftingCar === mv) {
        ctx.fillStyle = 'rgba(0, 255, 136, 0.22)';
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.42, roadY);
        ctx.lineTo(cx + cw * 0.42, roadY);
        ctx.lineTo(rw * 0.5 + 42, rh * 0.86);
        ctx.lineTo(rw * 0.5 - 42, rh * 0.86);
        ctx.closePath();
        ctx.fill();
      }

      // 1. Wet Asphalt Neon Underglow (for Street Rivals) or Dark Shadow
      if (mv.underglow) {
        ctx.fillStyle = mv.underglow;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(cx - cw * 0.58, roadYifted - 3, cw * 1.16, Math.max(4, ch * 0.18));
        ctx.globalAlpha = 1.0;
      } else if (carArt) {
        // (the sprite carries its own contact shadow)
      } else if (!drawSoftShadow(ctx, cx, roadY, cw * 1.1)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(cx - cw * 0.54, roadYifted - 2, cw * 1.08, 4);
      }

      if (carArt) {
        // Everyone in their own car: rivals and friends in their roster cars, traffic as
        // sedans, taxis, SUVs and semis, all painted by the same car painter (src/car-paint.js).
        const look = mv.look || (mv.look = isTruck
          ? { shape: 'SEMI_TRUCK', body: '#cbd5e1', cabin: '#94a3b8', glow: '' }
          : { shape: mv.shape || mv.style || 'SEDAN', body: mv.bodyColor || '#334155', cabin: mv.accentColor || '#64748b', glow: mv.underglow || '' });
        // Seen from the chase cam, a car turns with the road under it and with where it sits
        // across your view (one to your right shows you its left flank).
        const p2 = seg.p2.screen;
        const heading = p2 && p2.w > 0 ? Math.atan(((p2.x - rw * 0.5) / p2.w - (roadX - rw * 0.5) / Math.max(1, roadW)) * 2.2) : 0;
        const spin = mv.yaw ? Math.atan2(Math.sin(mv.yaw), Math.cos(mv.yaw)) : 0; // fishtail / spin-out, wrapped
        const yawApp = Math.max(-0.7, Math.min(0.7, spin + heading - Math.atan((cx - rw * 0.5) / (rw * 0.43)) * 0.4));
        if (!rivalThrust) rivalThrust = carArt.createThrust();
        carArt.drawCarAt(ctx, look, cx, roadYifted, Math.max(10, roadW * 0.32), { yaw: yawApp }, rivalThrust);
        if (mv.nosActive) {
          thrustState.nos = 1; thrustState.plume = 0; thrustState.hover = false;
          thrustState.t = RS.fxClock + m; thrustState.calm = GameState.reducedMotion;
          carArt.drawThrust(ctx, rivalThrust, thrustState);
        }
        if (GameState.status !== 'TITLE' && (mv.ghostTag || mv.short)) {
          queueTag(cx, roadY - ch * 1.3 - 6, roadW, mv.ghostTag || mv.short, mv.ghostTag ? (mv.cpu ? 0 : 1) : 2, mv.underglow);
        }
        continue;
      }

      // Placeholder for the first frames before the car painter (src/car-sprite.js) loads.
      ctx.fillStyle = isTruck ? '#cbd5e1' : (mv.bodyColor || '#334155');
      ctx.fillRect(cx - cw * 0.5, roadYifted - ch * (isTruck ? 1.15 : 0.9), cw, ch * (isTruck ? 1.15 : 0.7));
      ctx.fillStyle = '#ff1e1e';
      ctx.fillRect(cx - cw * 0.46, roadYifted - ch * 0.54, cw * 0.22, ch * 0.16);
      ctx.fillRect(cx + cw * 0.24, roadYifted - ch * 0.54, cw * 0.22, ch * 0.16);

      // Name tags (ticket 0101): queued here, laid out once after all cars so they never pile up.
      if (GameState.status !== 'TITLE' && (mv.ghostTag || mv.short)) {
        queueTag(cx, roadY - ch * 1.3 - 6, roadW, mv.ghostTag || mv.short, mv.ghostTag ? (mv.cpu ? 0 : 1) : 2, mv.underglow);
      }
    }
  }
  flushTags(ctx, rw, rh);

  // 4. Draw Flying Takedown Wrecks in Mid-Air!
  for (let i = 0; i < GameState.flyingWrecks.length; i++) {
    const w = GameState.flyingWrecks[i];
    ctx.save();
    ctx.translate(rw * 0.5 + w.x * (rw / 480), rh * 0.72 - w.y * (rh / 480));
    ctx.rotate(w.rot);
    if (carArt && w.look) carArt.drawCarAt(ctx, w.look, 0, 12, 44);
    else {
      ctx.fillStyle = w.color;
      ctx.fillRect(-22, -12, 44, 24);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-14, -6, 28, 12);
    }
    ctx.restore();
  }

  // 4.5 LUMEN Holographic AR Racing Line, Target Lock-On Reticles & Pulse Beam Laser
  if (GameState.jarvisArEnabled) {
    // Project Optimal Racing Line Chevrons on the Road
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.38)';
    ctx.lineWidth = 1.5;
    for (let g = 3; g < Math.min(28, visibleSegments.length); g += 4) {
      const gSeg = visibleSegments[g];
      const gx = gSeg.p1.screen.x;
      const gy = gSeg.p1.screen.y;
      const gw = Math.max(6, gSeg.p1.screen.w * 0.14);
      ctx.beginPath();
      ctx.moveTo(gx - gw, gy + 3);
      ctx.lineTo(gx, gy - 3);
      ctx.lineTo(gx + gw, gy + 3);
      ctx.stroke();
    }

    // Draw Arc Target Lock-On Diamond Bracket around Primary Threat Ahead
    if (GameState.lockedTarget && GameState.lockedTarget.seg && GameState.lockedTarget.seg.p1 && GameState.lockedTarget.seg.p1.screen) {
      const tSeg = GameState.lockedTarget.seg;
      const tCar = GameState.lockedTarget.car;
      if (!tCar.takenDown && tSeg.p1.screen.w > 8) {
        const tx = tSeg.p1.screen.x + tCar.offset * tSeg.p1.screen.w;
        const ty = tSeg.p1.screen.y - tSeg.p1.screen.w * 0.12;
        const tr = Math.max(10, tSeg.p1.screen.w * 0.22);
        GameState.unibeamTargetX = tx;
        GameState.unibeamTargetY = ty;

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty - tr);
        ctx.lineTo(tx + tr, ty);
        ctx.lineTo(tx, ty + tr);
        ctx.lineTo(tx - tr, ty);
        ctx.closePath();
        ctx.stroke();

        // Corner lock ticks
        ctx.strokeStyle = '#fde047';
        ctx.strokeRect(tx - tr * 0.55, ty - tr * 0.55, tr * 1.1, tr * 1.1);
      }
    }

    // Draw Arc Pulse Beam Laser when fired!
    if (GameState.unibeamTimer > 0) {
      const bx = GameState.unibeamTargetX || (rw * 0.5);
      const by = GameState.unibeamTargetY || (rh * 0.48);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = Math.max(4, rw * 0.018);
      ctx.beginPath();
      ctx.moveTo(rw * 0.5, rh * 0.80);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, rw * 0.007);
      ctx.beginPath();
      ctx.moveTo(rw * 0.5, rh * 0.80);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  // 5. Lock Hero Car Screen X & Y to the Exact Track Segment Underneath the Tires (Zero Off-Track Drift!)
  const playerSeg = foundPlayerSeg || track.seg(baseIndex + 6) || visibleSegments[0] || baseSeg;
  if (playerSeg && playerSeg.p1 && playerSeg.p1.screen && playerSeg.p1.screen.w > 0) {
    const segRoadX = playerSeg.p1.screen.x;
    const segRoadW = playerSeg.p1.screen.w;
    GameState.playerScreenX = Math.round(segRoadX + GameState.playerX * segRoadW);
    smokeRoadX = segRoadX; smokeRoadW = segRoadW;
  } else {
    GameState.playerScreenX = Math.floor(rw * 0.5);
  }

  if (rolled) { ctx.restore(); rolled = false; }
  // The real loop: drive round it with the camera riding the loop (src/loopcam.js). Calm mode
  // keeps the side-on loop cam instead (it never turns the screen over).
  const rideF = setPieceArt && !GameState.reducedMotion ? loopNear(GameState.trackPos + ROAD_CFG.playerZOffset) : null;
  let rideOwnsCar = false;
  if (rideF) {
    const z = GameState.trackPos + ROAD_CFG.playerZOffset;
    const blend = setPieceArt.rideBlend(rideF, z - rideF.z0);
    const paint = carPaint(POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0]);
    rideMovers[0] = LiveTraffic.racers; rideMovers[1] = LiveTraffic.traffic; rideMovers[2] = live.ghosts;
    const ride = setPieceArt.drawLoopRide(ctx, rw, rh, {
      f: rideF, z, lat: GameState.playerX, peelT: GameState.peeledLoop === rideF ? GameState.peelT : null,
      ups: GameState.peelUps || 1600, blend, eraCfg, t: RS.fxClock, reduced: GameState.reducedMotion,
      road: track, movers: rideMovers, color: paint.body, cabin: paint.cabin, px: pk,
    });
    if (ride.ownCar && GameState.cameraMode !== 2) {
      // Fell off the top: the same car, flying the ballistic arc the ride view worked out.
      rideOwnsCar = true;
      const ax = rw * 0.5, ay = rh * 0.87;
      ctx.save();
      ctx.translate(ax + ride.dx, ay + ride.dy);
      ctx.rotate(ride.roll);
      ctx.scale(ride.k, ride.k * ride.flip);
      ctx.translate(-ax, -ay);
      GameState.playerScreenX = Math.floor(ax);
      drawPlayerCar(ctx, rw, rh, eraCfg);
      ctx.restore();
    }
    if (ride.landed) {
      // Touchdown after falling off the top: a bounce, sparks and a thump.
      burstSparks(26, 28, 1.2);
      GameState.screenShake = Math.max(GameState.screenShake || 0, 0.35);
      SoundEngine.playLand();
      if (touch) touch.controls.haptics.pulse('hit');
    }
    GameState.playerScreenX = Math.floor(rw * 0.5);
    GameState.loopRide = blend;
    GameState.loopFall = ride.fall;
  } else { GameState.loopRide = 0; GameState.loopFall = 0; }
  if (GameState.cameraMode !== 2 && !rideOwnsCar) {
    drawPlayerCar(ctx, rw, rh, eraCfg);
    if (smoke2d) smoke2d.draw(ctx, rw, rh, smokeRoadX, smokeRoadW, SaveStore.data.underglow);
  }

  drawCarFx(ctx, rw, rh);
  drawWeather(ctx, rw, rh);

  // 5.5 Draw LUMEN Curved Helmet Visor Telemetry Brackets on Screen Edges
  if (GameState.jarvisArEnabled) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
    ctx.lineWidth = 1.5;
    // Left Visor Arc
    ctx.beginPath();
    ctx.arc(rw * 0.14, rh * 0.52, rh * 0.34, Math.PI * 0.72, Math.PI * 1.28);
    ctx.stroke();
    // Right Visor Arc
    ctx.beginPath();
    ctx.arc(rw * 0.86, rh * 0.52, rh * 0.34, -Math.PI * 0.28, Math.PI * 0.28);
    ctx.stroke();

    // Clean, word-free visor arcs
  }

  ctx.restore();

  // 6. Blit onto Main Display Canvas
  mainCtx.save();
  mainCtx.imageSmoothingEnabled = (eraCfg.pixelScale === 1.0);
  mainCtx.clearRect(0, 0, viewW, viewH);
  const playing = GameState.status === 'PLAYING';
  const feel = nosFeel(speedFeel(playing ? GameState.speed : 0, GameState.reducedMotion));
  // FOV push-in toward the vanishing point as you approach 88 (crop the source a touch).
  const cropW = pixelCanvas.width / feel.fov;
  const cropH = pixelCanvas.height / feel.fov;
  const cropX = (pixelCanvas.width - cropW) * 0.5;
  const cropY = (pixelCanvas.height - cropH) * 0.46;
  const shakeX = feel.shake * Math.sin(RS.fxClock * 61.0) * (viewW / 1280);
  const shakeY = feel.shake * Math.sin(RS.fxClock * 47.0 + 1.3) * (viewW / 1280);
  mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX, shakeY, viewW, viewH);
  // Time-warp chromatic split: two offset additive ghosts for ~0.9 s after a warp.
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) {
    const k = GameState.warpFxTimer / 0.9;
    const off = 10 * k * (viewW / 1280);
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.globalAlpha = 0.22 * k;
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX - off, shakeY, viewW, viewH);
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX + off, shakeY, viewW, viewH);
    mainCtx.globalAlpha = 1;
    mainCtx.globalCompositeOperation = 'source-over';
    drawWarpTunnel(mainCtx, k);
  }
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  // Calm mode's side-on loop cam (sprint 4) while you're going round a loop.
  if (setPieceArt && GameState.reducedMotion && rollF && rollF.kind === 'LOOP') {
    const pc = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
    setPieceArt.drawCutaway(mainCtx, viewW, viewH, {
      t: progressIn(rollF, GameState.trackPos + ROAD_CFG.playerZOffset), mph: GameState.speed,
      color: pc.body, eraCfg, failed: GameState.peeledLoop === rollF, reduced: GameState.reducedMotion,
    });
  }
  mainCtx.restore();
}

const rideMovers = [null, null, null]; // reused: the cars the loop ride view draws

/** A loop under the car, or one it is just entering or leaving (the ride view's blend). */
function loopNear(z) {
  const k = setPieceArt.LOOP_CAM.fade;
  // Here, just ahead or just behind (three calls, no array: this runs every frame).
  let f = featureAt(z);
  if (f && f.kind === 'LOOP') return f;
  f = featureAt(z + k);
  if (f && f.kind === 'LOOP') return f;
  f = featureAt(z - k);
  return f && f.kind === 'LOOP' ? f : null;
}

/** Pickups flying into the car, hit shockwaves and debris (screen space; both renderers). */
/** NOS adds a push-in and speed lines on top of the speed feel (calm mode: none). */
function nosFeel(feel) {
  if (GameState.nosBurning && GameState.status === 'PLAYING' && !GameState.reducedMotion) {
    feel.fov += 0.045;
    feel.lines = Math.max(feel.lines, 0.85);
  }
  return feel;
}

/** Twin blue-violet nitrous flames from the exhausts while NOS burns. */
function drawNosFlames(ctx, rw, rh) {
  if (!GameState.nosBurning || GameState.status !== 'PLAYING') return;
  const calm = GameState.reducedMotion;
  const y = rh * 0.885;
  const len = rh * (calm ? 0.05 : 0.07 + 0.025 * Math.sin(RS.fxClock * 47));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const x = rw * 0.5 + side * rw * 0.045;
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(96,165,250,0.9)');
    g.addColorStop(0.7, 'rgba(168,85,247,0.6)');
    g.addColorStop(1, 'rgba(168,85,247,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + len * 0.5, rw * 0.012, len * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCarFx(ctx, rw, rh, over3d) {
  if (!over3d && !carArt) drawNosFlames(ctx, rw, rh);
  // 5.2 Render Animated Power-Ups Magnetically Arcing into the player car's Fusion Core!
  const carCenterX = rw * 0.5;
  const carCenterY = rh * 0.81;
  for (let i = 0; i < GameState.pickupAnimations.length; i++) {
    const pa = GameState.pickupAnimations[i];
    const t = Math.min(1, pa.progress);
    const curX = (carCenterX + pa.startX) * (1 - t) + carCenterX * t;
    const arcLift = Math.sin(t * Math.PI) * 65;
    const curY = (carCenterY + pa.startY) * (1 - t) + carCenterY * t - arcLift;
    const r = Math.max(4, (1 - t * 0.4) * 14);

    if (pickupArt && PICKUPS[pa.type]) { pickupArt.drawPickup(ctx, pa.type, curX, curY, r * 2.4, 0, 0, true); continue; }
    ctx.save();
    ctx.translate(curX, curY);
    ctx.rotate(pa.spin);
    ctx.fillStyle = pa.type === 'PLUTONIUM' ? '#00f0ff' : '#facc15';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.5, -r * 0.5, r, r);
    ctx.restore();
  }
  if (pickupArt) {
    pickupArt.drawBursts(ctx, GameState.playerScreenX || carCenterX, carCenterY, rw);
    if (GameState.status === 'PLAYING' && !GameState.loopRide) pickupArt.drawHint(ctx, rw, rh, GameState.pickupHint, GameState.pickupHintSide, GameState.pickupHintSegs, RS.fxClock);
    if (GameState.power && GameState.power.on) pickupArt.drawPowerHud(ctx, rw, rh, GameState.power, GameState.playerScreenX || carCenterX, carCenterY, RS.fxClock, GameState.reducedMotion);
  }

  // 5.3 Render Expanding 3D Shockwave Rings & Floating Holo-Popups on Acquire / Hit!
  for (let i = 0; i < GameState.hitShockwaves.length; i++) {
    const sw = GameState.hitShockwaves[i];
    const alpha = Math.max(0, sw.life / sw.maxLife);
    const sx = carCenterX + sw.x;
    const sy = carCenterY + sw.y;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sw.radius, sw.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (sw.label) {
      ctx.fillStyle = sw.color;
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sw.label, sx, sy - 24 - (1 - alpha) * 38);
    }
    ctx.restore();
  }

  // 5.4 Render 3D Spinning Debris Shards Bouncing off the Orange Toy-Track!
  for (let i = 0; i < GameState.debrisShards.length; i++) {
    const d = GameState.debrisShards[i];
    ctx.save();
    ctx.translate(carCenterX + d.x, carCenterY + d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.size * 0.5, -d.size * 0.35, d.size, d.size * 0.7);
    ctx.restore();
  }

}

/** Streaks rushing out of the vanishing point, only in the outer band so the road stays clear. */
/** Live races: a checkered flag band across the road at the finish segment. */
function drawFinishLine(ctx, x1, y1, w1, x2, y2, w2) {
  const cols = 10;
  for (let row = 0; row < 2; row++) {
    const ya = y1 + (y2 - y1) * (row / 2), yb = y1 + (y2 - y1) * ((row + 1) / 2);
    const wa = w1 + (w2 - w1) * (row / 2), wb = w1 + (w2 - w1) * ((row + 1) / 2);
    const xa = x1 + (x2 - x1) * (row / 2), xb = x1 + (x2 - x1) * ((row + 1) / 2);
    for (let c = 0; c < cols; c++) {
      const u0 = -1 + (2 * c) / cols, u1 = -1 + (2 * (c + 1)) / cols;
      drawPolygon(ctx, xa + u0 * wa, ya, xa + u1 * wa, ya, xb + u1 * wb, yb, xb + u0 * wb, yb, (c + row) % 2 ? '#0b1020' : '#f8fafc');
    }
  }
}

function drawSpeedLines(c, intensity) {
  GameState.fxLinesDrawn = 0;
  if (intensity <= 0) return;
  const W = viewW, H = viewH;
  const cx = W * 0.5, cy = H * 0.44;
  const count = Math.round(10 + 34 * intensity);
  const maxR = Math.hypot(W, H) * 0.62;
  c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    // Deterministic per-line angle; phase scrolls with time so lines fly outward.
    const seed = Math.sin(i * 91.17) * 43758.5453;
    const ang = (seed - Math.floor(seed)) * Math.PI * 2;
    const phase = (RS.fxClock * (1.6 + intensity * 2.4) + i * 0.137) % 1;
    const r0 = maxR * (0.42 + phase * 0.6);
    const r1 = r0 + maxR * (0.08 + 0.22 * intensity);
    const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0 * 0.75;
    const x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1 * 0.75;
    const fade = 1 - phase * 0.7;
    c.strokeStyle = i % 3 === 0 ? 'rgba(255,190,110,' + (0.5 * intensity * fade) + ')' : 'rgba(200,245,255,' + (0.6 * intensity * fade) + ')';
    c.lineWidth = (1.5 + 3 * intensity) * (W / 1280);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  GameState.fxLinesDrawn = count;
}

/** Concentric cyan/magenta rings collapsing into the horizon right after a warp. */
function drawWarpTunnel(c, k) {
  const W = viewW, H = viewH;
  const cx = W * 0.5, cy = H * 0.44;
  c.lineWidth = 3 * (W / 1280);
  for (let i = 0; i < 6; i++) {
    const r = ((1 - k) * 1.4 + i * 0.22) % 1.4 * Math.max(W, H) * 0.5;
    c.strokeStyle = i % 2 ? 'rgba(255,0,140,' + (0.35 * k) + ')' : 'rgba(0,240,255,' + (0.35 * k) + ')';
    c.beginPath();
    c.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

function drawSparks(c, rw, rh) {
  const sx = viewW / rw, sy = viewH / rh;
  const ox = rw * 0.5 * sx, oy = rh * 0.86 * sy;
  for (let i = 0; i < sparks.items.length; i++) {
    const p = sparks.items[i];
    if (p.life <= 0) continue;
    const a = p.life / p.maxLife;
    c.fillStyle = 'hsla(' + p.hue + ',100%,' + (55 + 30 * a) + '%,' + a + ')';
    const s = p.size * sx;
    c.fillRect(ox + p.x * sx - s / 2, oy + p.y * sy - s / 2, s, s);
  }
}

// 1955 Atomic Diner roadside set (ticket 0008): starburst lamps, a chrome diner sign and
// pastel lollipop trees stand in for the neon-era props on the same scenery slots.

const playerLook = { shape: '', body: '', cabin: '', glow: '' };
let playerThrust = null, rivalThrust = null;
const thrustState = { nos: 0, plume: 0, color: '', t: 0, calm: false, hover: false };
function drawPlayerCar(ctx, rw, rh, eraCfg) {
  const carW = Math.max(58, Math.floor(rw * 0.22));
  const carH = Math.max(32, Math.floor(carW * 0.54));
  const cx = GameState.playerScreenX || Math.floor(rw * 0.5);
  const jumpOffset = Math.floor((GameState.playerY / 220) * (rh * 0.26));
  const bounce = (GameState.playerY <= 2 && GameState.speed > 5)
    ? Math.sin(GameState.trackPos * 0.045) * 1.8
    : 0;
  const suspPx = Math.max(-14, Math.min(14, -(GameState.suspOffset || 0) + (GameState.chassisPitch || 0) * 0.8));
  const cy = Math.floor(rh * 0.87 - jumpOffset + bounce + (GameState.carJoltY || 0) + suspPx);

  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const liveryObj = carPaint(activeChar);

  ctx.save();
  ctx.translate(cx, cy - carH * 0.5);
  // Duck-Slide Low Profile Compression when sliding under High Light Gates!
  if (GameState.isDuckSliding) {
    ctx.translate(0, carH * 0.16);
    ctx.scale(1.08, 0.68);
  }
  // Flash alpha during invulnerability frames
  if (GameState.invulnTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
    ctx.globalAlpha = 0.65;
  }
  // Power-Up Acquisition Surge Scale Pulse!
  if (GameState.carSurgeTimer > 0) {
    const sPulse = 1 + Math.sin(GameState.carSurgeTimer * Math.PI * 3.5) * 0.08;
    ctx.scale(sPulse, sPulse);
  }

  // Camera banking + 2-wheel tilt + stunt barrel roll, plus a little body roll away from the turn.
  const yaw = Math.max(-0.7, Math.min(0.7, GameState.carYaw || 0));
  const rollRad = (GameState.cameraBank + GameState.stuntSpinAngle) * (Math.PI / 180) + yaw * 0.12 + (GameState.chassisRoll || 0);
  ctx.rotate(rollRad);
  // Body yaw seen from the chase cam: the rear face foreshortens and its far corner rides up
  // the screen, so the car visibly points where it's going (and the tail swings out in a drift).
  // (The cached sprites bake the yaw into the model itself; only the placeholder is skewed.)
  if (!carArt) ctx.transform(Math.cos(yaw * 1.4), -Math.sin(yaw * 1.4) * 0.32, 0, 1, 0, 0);
  if (GameState.trickPitchAngle > 0) {
    const pitchScaleY = Math.cos(GameState.trickPitchAngle * Math.PI / 180);
    ctx.scale(1, Math.abs(pitchScaleY) < 0.22 ? 0.22 : pitchScaleY);
  }

  // Keep tires planted on exact lane center during drift

  // Dual Xenon Headlight Beams Projected Forward onto the Night Asphalt
  if (GameState.playerY < 60) {
    const beamGrad = ctx.createLinearGradient(0, -carH * 0.2, 0, -carH * 2.8);
    beamGrad.addColorStop(0, 'rgba(224, 242, 254, 0.24)');
    beamGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(-carW * 0.38, -carH * 0.2);
    ctx.lineTo(-carW * 0.95, -carH * 2.8);
    ctx.lineTo(-carW * 0.12, -carH * 2.8);
    ctx.lineTo(-carW * 0.18, -carH * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(carW * 0.18, -carH * 0.2);
    ctx.lineTo(carW * 0.12, -carH * 2.8);
    ctx.lineTo(carW * 0.95, -carH * 2.8);
    ctx.lineTo(carW * 0.38, -carH * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // DUB Neon Underglow + Ground Shadow
  if (GameState.playerY < 160) {
    ctx.fillStyle = SaveStore.data.underglow || '#00f0ff';
    ctx.globalAlpha = 0.42;
    if (carArt) {
      // A pool of light on the road under the car, as wide as this car is.
      const gw = carW * 0.5 * carArt.widthOf(activeChar.shape);
      ctx.beginPath();
      ctx.ellipse(0, carH * 0.54 + jumpOffset * 0.65, gw * 1.15, Math.max(4, carH * 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-carW * 0.56, carH * 0.40 + jumpOffset * 0.65, carW * 1.12, Math.max(5, carH * 0.20));
    ctx.globalAlpha = 1.0;
  }

  // AGRO Kinetic Shield Aura
  if (GameState.agroTimer > 0) {
    ctx.strokeStyle = '#ff5500';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, carW * 0.66, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tires OR 2015 Hover Conversion Glowing Thrusters
  const isHovering = (GameState.hoverActiveTimer > 0 || GameState.playerY > 25 || eraCfg.id === '2088');
  if (isHovering && !carArt) {
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(-carW * 0.58, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillRect(carW * 0.33, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-carW * 0.52, carH * 0.32, carW * 0.14, carH * 0.08);
    ctx.fillRect(carW * 0.38, carH * 0.32, carW * 0.14, carH * 0.08);
  } else if (!carArt) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(-carW * 0.52, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillRect(carW * 0.30, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillStyle = SaveStore.data.underglow || '#ff5500';
    ctx.fillRect(-carW * 0.50, carH * 0.22, carW * 0.04, carH * 0.22);
    ctx.fillRect(carW * 0.46, carH * 0.22, carW * 0.04, carH * 0.22);
  }

  if (carArt) {
    // Your car, as itself: the garage model of the car you picked, in your paint (src/car-sprite.js).
    playerLook.shape = activeChar.shape; playerLook.body = liveryObj.body; playerLook.cabin = liveryObj.cabin; playerLook.glow = activeChar.glow;
    if (!playerThrust) playerThrust = carArt.createThrust();
    carArt.drawCarAt(ctx, playerLook, 0, carH * 0.54, carW * 0.84, { yaw, hover: isHovering, brake: Boolean(GameState.braking) && GameState.status === 'PLAYING' }, playerThrust);
    GameState.playerShape2D = activeChar.shape;
    // Flames, NOS, plumes and hover thrusters from this car's own pipes (src/car-sprite.js).
    const plume = GameState.warpActiveTimer > 0 || GameState.driftTier > 0 ? 1 : GameState.speed >= 76 ? Math.min(1, (GameState.speed - 70) / 30) : 0;
    thrustState.nos = GameState.nosBurning && GameState.status === 'PLAYING' ? 1 : 0;
    thrustState.plume = plume;
    thrustState.color = GameState.driftTier === 3 ? '#d946ef' : GameState.driftTier > 0 ? '#ff6600' : (GameState.speed >= 88 ? '#00f0ff' : '#ff6600');
    thrustState.t = RS.fxClock; thrustState.calm = GameState.reducedMotion; thrustState.hover = isHovering;
    carArt.drawThrust(ctx, playerThrust, thrustState);
    GameState.thrustTips = playerThrust.n;
  } else {
    // Placeholder until the sprite chunk lands (the first frames of a cold boot).
    ctx.fillStyle = liveryObj.body;
    ctx.fillRect(-carW * 0.48, -carH * 0.16, carW * 0.96, carH * 0.52);
    ctx.fillStyle = liveryObj.cabin;
    ctx.fillRect(-carW * 0.32, -carH * 0.52, carW * 0.64, carH * 0.38);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-carW * 0.44, -carH * 0.02, carW * 0.26, carH * 0.15);
    ctx.fillRect(carW * 0.18, -carH * 0.02, carW * 0.26, carH * 0.15);
    GameState.playerShape2D = '';
  }

  // Twin Plasma & Nitrous Exhaust Plumes (placeholder car only; sprites use their own pipes)
  if (!carArt && (GameState.speed >= 76 || GameState.warpActiveTimer > 0 || GameState.driftTier > 0)) {
    const flameLen = (GameState.speed >= 88 ? 0.36 : 0.22) * carH;
    ctx.fillStyle = GameState.driftTier === 3 ? '#d946ef' : (GameState.speed >= 88 ? '#00f0ff' : '#ff6600');
    ctx.fillRect(-carW * 0.39, carH * 0.18, carW * 0.11, flameLen);
    ctx.fillRect(carW * 0.28, carH * 0.18, carW * 0.11, flameLen);
  }

  // Smooth Flux Aura when ready for 88 MPH Warp
  if (GameState.lightningBolts.length > 0) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-carW * 0.46, -carH * 0.15);
    ctx.lineTo(0, -carH * 0.58);
    ctx.lineTo(carW * 0.46, -carH * 0.15);
    ctx.stroke();
  }

  // Drift & Takedown Sparks
  for (let i = 0; i < GameState.particles.length; i++) {
    const p = GameState.particles[i];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * (carW / 90), carH * 0.35 + p.y * 0.2, 3, 3);
  }

  ctx.restore();
}

// --- WORLD TOUR LEVEL SELECTOR & DUB GARAGE UI ---
/** The physics numbers for the car you're driving (src/cars.js, ticket 0071). */
export function activeCarParams() {
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  if (!GameState.carParams || GameState.carParamsFor !== c.id) {
    GameState.carParams = carParams(c);
    GameState.carParamsFor = c.id;
  }
  return GameState.carParams;
}

/** Body/cabin colours for a car: its garage paint (ticket 0071) or the factory colours. */
export function carPaint(c) {
  // ensureGarage: a racer switch can swap SaveStore.data for a save without garage fields.
  const paintId = ensureGarage(SaveStore.data).garage.paint[c.id];
  const paint = paintId ? LIVERY_OPTIONS.find((l) => l.id === paintId) : null;
  return { body: (paint || c).body || '#94a3b8', cabin: (paint || c).cabin || '#cbd5e1' };
}

/** Index of the next car you own after `from` (locked cars are skipped). */
function nextOwnedCarIndex(from) {
  for (let k = 1; k <= POP_CULTURE_ROSTER.length; k++) {
    const i = (from + k) % POP_CULTURE_ROSTER.length;
    if (isOwned(SaveStore.data, POP_CULTURE_ROSTER[i].id)) return i;
  }
  return from;
}

function selectCharacterByIndex(idx) {
  const want = ((idx % POP_CULTURE_ROSTER.length) + POP_CULTURE_ROSTER.length) % POP_CULTURE_ROSTER.length;
  // Locked cars can't be driven; fall back to the car you had.
  if (!isOwned(SaveStore.data, POP_CULTURE_ROSTER[want].id)) return false;
  GameState.selectedCharIdx = want;
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx];
  SoundEngine.setEngineVoice(c.shape);
  if (SaveStore.data.garage.selected !== c.id) {
    SaveStore.data.garage.selected = c.id;
    SaveStore.save();
  }
  GameState.maxHp = activeCarParams().maxHp;
  GameState.hp = GameState.maxHp;
  SaveStore.data.underglow = c.glow || '#00f0ff';

  const descEl = document.getElementById('selectedDriverDesc');
  if (descEl) {
    descEl.textContent = `${c.driver} • ${c.car} (${c.franchise}) — Mass: ${c.massKg}kg • ${c.maxHp} HP • ${c.perk}`;
  }
  const badgeEl = document.getElementById('activeDriverBadge');
  if (badgeEl) {
    badgeEl.textContent = `🏎️ ${c.driver.toUpperCase()} • ${c.car.toUpperCase()}`;
  }
  renderCharacterRosterGrid();
  updateLiveHud();
  return true;
}

function renderCharacterRosterGrid() {
  const grid = document.getElementById('characterRosterGrid');
  if (!grid) return;
  grid.innerHTML = '';

  POP_CULTURE_ROSTER.forEach((c, idx) => {
    const isSel = (idx === GameState.selectedCharIdx);
    const owned = isOwned(SaveStore.data, c.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.carId = c.id;
    btn.dataset.locked = owned ? '0' : '1';
    btn.className = `text-left p-2 rounded-xl border transition flex flex-col justify-between ${
      !owned
        ? 'bg-slate-950/80 border border-slate-800 text-slate-400'
        : isSel
        ? 'bg-cyan-500/20 border-2 border-cyan-400 text-white shadow'
        : 'bg-slate-900/90 border border-slate-800 text-slate-300 hover:border-slate-600'
    }`;
    btn.innerHTML = owned ? `
      <div class="font-arcade text-[9px] font-black text-white truncate">${c.car}</div>
      <div class="text-[9px] text-cyan-300 truncate">${c.driver}</div>
      <div class="flex items-center justify-between text-[8px] font-arcade text-slate-400 mt-1">
        <span class="text-emerald-300">💚${c.maxHp}HP</span>
        <span>${c.massKg}kg</span>
      </div>
    ` : `
      <div class="font-arcade text-[9px] font-black text-slate-300 truncate">🔒 ${c.car}</div>
      <div class="text-[9px] text-amber-300/90 leading-tight">${unlockProgress(SaveStore.data, c.id).text}</div>
    `;
    btn.addEventListener('click', () => {
      if (!owned) { openGarageModal(c.id); return; }
      selectCharacterByIndex(idx);
      SoundEngine.playCoinPickup();
    });
    grid.appendChild(btn);
  });
}

/** 250000 → '250k', 2500000 → '2.5M' */
function shortScore(n) {
  return n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
}


// The level grid lives in its own chunk (src/level-select.js): it only shows in the events
// panel, so the race boots without it. Rendering is async; the panel opens on the same frame.
let levelSelect = null;
function renderLevelSelectGrid() {
  levelSelect = levelSelect || import('./level-select.js');
  return levelSelect.then((m) => m.renderLevelGrid({
    GameState, SaveStore, levels: WORLD_LEVELS, shortScore,
    picked: () => { renderCharacterRosterGrid(); selectCharacterByIndex(GameState.selectedCharIdx); renderLevelSelectGrid(); },
  }));
}

// The showroom is its own chunk (ticket 0072): it loads the first time the garage opens or a
// car unlocks, so the race boots without it.
let garageUI = null;
let garageLoading = null;
export function loadGarageUI() {
  if (garageUI) return Promise.resolve(garageUI);
  if (!garageLoading) {
    garageLoading = import('./garage-ui.js').then(({ createGarageUI }) => {
      garageUI = createGarageUI({
        save: SaveStore, roster: POP_CULTURE_ROSTER, liveries: LIVERY_OPTIONS, underglows: UNDERGLOW_OPTIONS,
        upgradeDefs: UPGRADE_DEFS, sound: SoundEngine,
        selectedIndex: () => GameState.selectedCharIdx,
        drive: (i) => selectCharacterByIndex(i),
        changed: () => {
          renderCharacterRosterGrid();
          updateLiveHud();
          document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins}`;
        },
        reducedMotion: () => GameState.reducedMotion,
        preview3d: () => (view3d ? loadCarPreview().then((m) => ({ createCarPreview: m.createCarPreview, rich: gfxQ.tier !== 'low' })) : null),
      });
      return garageUI;
    });
  }
  return garageLoading;
}
function renderGarageModal() {
  if (garageUI) garageUI.render();
}

// --- ONE-TAP TITLE & FIRST-RUN TEACHING (ticket 0022) ---
RS.onboarding = createOnboarding({ newPlayer: false });
RS.raceClock = createRaceClock();
export const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function titleVisible() {
  const el = document.getElementById('titleScreen');
  return !!el && !el.classList.contains('hidden') && GameState.status !== 'PLAYING';
}

const MODE_BTN = 'mode-select-btn flex-1 text-left px-2.5 py-2 rounded-lg font-arcade text-[10px] font-bold flex items-center justify-between ';
export function syncModeButtons() {
  const a = document.getElementById('modeBtnArcade'), i = document.getElementById('modeBtnInfinite');
  if (!a || !i) return;
  const endless = GameState.mode !== 'ARCADE';
  i.className = MODE_BTN + (endless ? 'bg-cyan-500/20 border-2 border-cyan-400 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300');
  a.className = MODE_BTN + (endless ? 'bg-slate-900 border border-slate-700 text-slate-300' : 'bg-orange-500/20 border-2 border-orange-500 text-white');
}

function updateTitleChip() {
  const chip = document.getElementById('titleEventChip');
  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
  // The title sells Endless Highway (ticket 0150): your best run and the next tier to beat.
  const e = SaveStore.data.endless;
  if (chip) chip.textContent = GameState.mode === 'ARCADE'
    ? `🏁 TRACK RACE · ${lvl.name}`
    : (e && e.bestDistance ? `♾️ BEST ${e.bestDistance.toLocaleString()} m · TIER ${e.bestTier} · BEAT IT!` : '♾️ ENDLESS HIGHWAY · LEVEL UP AS YOU GO');
  const missions = document.getElementById('titleMissions');
  if (missions) missions.textContent = titleMissionLine(SaveStore.data, utcDay(Date.now()));
}

function openEventsPanel() {
  // EVENTS is where you pick a track race (ticket 0150): it opens on TRACK RACE; the Endless
  // Highway is one tap away there and always on the title's PLAY.
  GameState.mode = 'ARCADE';
  syncModeButtons();
  renderCharacterRosterGrid();
  selectCharacterByIndex(GameState.selectedCharIdx || 0);
  renderLevelSelectGrid();
  document.getElementById('startModal').classList.remove('hidden');
}

function closeEventsPanel() {
  document.getElementById('startModal').classList.add('hidden');
  updateTitleChip();
}



// --- DAILY CHALLENGE & GLOBAL LEADERBOARD (tickets 0023, 0025) ---
// Traffic draws from this; a daily run swaps in a date-seeded RNG so everyone meets the
// same rivals. Visual FX keep Math.random (they don't change the race).
RS.trafficRand = Math.random;
RS.currentRun = null; // { tokenPromise, t0, mode, level }

export function todaysDaily() { return dailySpec(utcDay(Date.now())); }


// Results card and leaderboard (ticket 0115): a lazy chunk, preloaded once the title is up.
let resultsUi = null;
let resultsLoading = null;
function loadResultsUi() {
  if (!resultsLoading) resultsLoading = import('./results-ui.js').then(({ createResultsUI }) => (resultsUi = createResultsUI({
    run: { get: () => RS.currentRun, set: (r) => { RS.currentRun = r; } }, raceGhostOf, coarsePointer,
  }))).catch((e) => { resultsLoading = null; throw e; }); // a failed fetch is retried next time
  return resultsLoading;
}
/** Runs fn with the results UI: now if it has loaded, else as soon as it lands (offline: fallback). */
export function withResults(fn, fallback) {
  if (resultsUi) fn(resultsUi);
  else loadResultsUi().then(fn, () => { if (fallback) fallback(); });
}
const openLeaderboard = (view) => withResults((ui) => ui.openLeaderboard(view));
const refreshRival = () => withResults((ui) => ui.refreshRival());

export function restoreSoloSettings() {
  GameState.levelIndex = GameState.savedLevelIndex;
  GameState.mode = GameState.savedMode || 'INFINITE';
  if (GameState.savedPace !== undefined) GameState.paceMode = GameState.savedPace;
  GameState.savedLevelIndex = undefined;
  GameState.savedPace = undefined;
}

// Live races with friends (sprint 3): src/live/ owns the rooms; these are its only hooks.
// The live code is its own chunk, fetched only when you open FRIENDS or follow an invite, so
// solo players never download it; until then `live` is an inert stand-in.
const LIVE_IDLE = { ghosts: [], finishZ: 0, frame() {}, update() {}, wrecked() {}, finished() {}, clockText: () => '0:00' };
export let live = LIVE_IDLE;
let liveLoading = null;
function loadLive() {
  // The live controller starts races synchronously (startRace, then GRID), so it comes up only
  // once the race step is in (0170).
  liveLoading = liveLoading || Promise.all([import('./live/controller.js'), loadRaceStep()]).then(([m]) => { live = m.createLive(liveHooks); return live; });
  return liveLoading;
}
const liveHooks = {
  startRace: (cfg) => startNewRace({ live: cfg }),
  announce: (main, sub, ms) => triggerAnnouncement(main, sub, ms, 3),
  selectCar: (idx) => selectCharacterByIndex(idx),
  unlockAudio: () => { SoundEngine.init(); },
  beep: (n) => {
    if (n > 0) SoundEngine.playBeep(false);
    else if (n === 0) SoundEngine.playBeep(true);
    else SoundEngine.playCheckpoint();
  },
  hideTitle: () => {
    document.getElementById('titleScreen').classList.add('hidden');
    document.getElementById('gameOverModal').classList.add('hidden');
  },
  leaveLive: () => {
    if (GameState.mode === 'LIVE') {
      if (GameState.savedLevelIndex !== undefined) restoreSoloSettings();
      else GameState.mode = 'ARCADE';
    }
    GameState.status = 'TITLE';
    GameState.racePosition = 8;
    initTrack();
    document.getElementById('gameOverModal').classList.add('hidden');
    document.getElementById('titleScreen').classList.remove('hidden');
    document.body.classList.add('on-title');
    updateTitleChip();
  },
};



// --- RACE CEREMONY (ticket 0052): lineup, lights, rocket start, callouts, finish flag ---
export const DEBUG_MODE = new URLSearchParams(location.search).has('debug');
RS.startSeq = null;
RS.launchPressAt = null;
RS.launchJudged = false;
RS.finishScore = 0;
RS.finishSeqLeft = 0;
RS.skipRequested = false;
// The ceremony code (src/racecall.js + src/racestage.js) is its own chunk, fetched at boot in
// parallel with everything else, so it is ready long before anyone reaches the grid.
export let RC = null;
export let callouts = null;
export const ceremonyReady = Promise.all([import('./racecall.js'), import('./racestage.js')]).then(([call, stageMod]) => {
  RC = { ...call, ...stageMod };
  callouts = RC.createCallouts({ laps: RACE_LAPS });
}).catch(() => {});
RS.lapStartedAt = 0;
RS.lapNow = 1;








/** Tap/click/Enter during the lineup skips to the lights. */
function bindRaceStageSkip() {
  const req = () => { if (GameState.racePhase === 'START' && RS.startSeq && RS.startSeq.inLineup) RS.skipRequested = true; };
  // On touch screens the stage lets touches through to the controls (styles.css), so a touch
  // on the controls skips the lineup too, while the same thumb keeps steering.
  window.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('#raceStage, #touchControlsLayer')) req();
  }, true);
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Escape') req(); });
}

/** Race a friend's challenge link: their track (or their daily's road), their time to beat. */
function startChallenge(c) {
  const today = todaysDaily();
  if (c.daily && c.daily === today.day) { startNewRace({ daily: true }); return; }
  const idx = c.levelIndex != null ? c.levelIndex : dailySpec(c.daily).levelIndex;
  GameState.levelIndex = Math.max(0, Math.min(WORLD_LEVELS.length - 1, idx));
  GameState.mode = 'ARCADE';
  startNewRace();
}




// Tilt steering lives in src/settings-ui.js (ticket 0050).

// --- EVENT LISTENERS & CONTROLS BINDING ---
function bindAllControls() {
  window.addEventListener('keydown', (e) => {
    if (titleVisible() && !settingsOpen() && document.getElementById('startModal').classList.contains('hidden')
        && document.getElementById('garageModal').classList.contains('hidden')
        && document.getElementById('leaderboardModal').classList.contains('hidden')
        && ['Enter', 'Space', 'NumpadEnter'].includes(e.code)) {
      e.preventDefault();
      startNewRace(titleStart || { mode: 'INFINITE' });
      return;
    }
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) RS.onboarding.steer();
    if (['ArrowLeft', 'KeyA'].includes(e.code)) {
      if (!InputState.left) {
        if (GameState.playerY > 10) {
          performHumanTrick('LEFT');
        } else {
          const now = performance.now();
          if (now - GameState.lastLeftTap < 260) performHumanTrick('JUKE_LEFT');
          GameState.lastLeftTap = now;
        }
      }
      InputState.left = true;
    }
    if (['ArrowRight', 'KeyD'].includes(e.code)) {
      if (!InputState.right) {
        if (GameState.playerY > 10) {
          performHumanTrick('RIGHT');
        } else {
          const now = performance.now();
          if (now - GameState.lastRightTap < 260) performHumanTrick('JUKE_RIGHT');
          GameState.lastRightTap = now;
        }
      }
      InputState.right = true;
    }
    if (['ArrowUp', 'KeyW'].includes(e.code)) {
      if (GameState.playerY > 10 && !e.repeat) performHumanTrick('UP');
      InputState.up = true;
    }
    const racing = GameState.status === 'PLAYING';
    if (e.code === 'KeyN' && !racing) selectCharacterByIndex(nextOwnedCarIndex(GameState.selectedCharIdx));
    if (['ShiftLeft', 'ShiftRight'].includes(e.code) || (e.code === 'KeyN' && racing)) InputState.nosHeld = true;
    if (['ArrowDown', 'KeyS'].includes(e.code)) { if (GameState.playerY > 12 && !e.repeat) performHumanTrick('DOWN'); InputState.down = true; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) InputState.boostPressed = true; }
    if (['KeyH', 'KeyE'].includes(e.code) && !e.repeat) { if (GameState.playerY > 12) performHumanTrick('UP'); else InputState.hoverPressed = true; }
    if (e.code === 'KeyZ') InputState.zonePressed = true;
    if (e.code === 'KeyX') InputState.agroPressed = true;
    if (e.code === 'KeyR') InputState.roarPressed = true;
    if (e.code === 'KeyQ') InputState.twoWheelPressed = true;
    if (e.code === 'KeyF') InputState.slamPressed = true;
    if (e.code === 'KeyB') JarvisAI.fireUnibeam();
    if (e.code === 'KeyI') cycleJarvisMode();
    if (e.code === 'KeyK' && steerModes) steerModes.cycleMode(e.shiftKey ? -1 : 1);
    if (e.code === 'KeyJ') toggleJarvisArHud();
    if (e.code === 'KeyG') cyclePaceMode();
    if (e.code === 'KeyC') cycleCameraMode();
    if (e.code === 'KeyV') cycleVisualMode();
    if (e.code === 'KeyT') toggleRenderMode();
    if (e.code === 'KeyM') SoundEngine.toggleMute();
    if (['KeyP', 'Escape'].includes(e.code)) toggleGarageModal();
  });

  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) InputState.left = false;
    if (['ArrowRight', 'KeyD'].includes(e.code)) InputState.right = false;
    if (['ArrowUp', 'KeyW'].includes(e.code)) InputState.up = false;
    if (['ArrowDown', 'KeyS'].includes(e.code)) InputState.down = false;
    if (['ShiftLeft', 'ShiftRight', 'KeyN'].includes(e.code)) InputState.nosHeld = false;
  });

  const wheel = document.getElementById('virtualWheel');
  const spoke = document.getElementById('wheelSpoke');
  if (wheel) {
    const updateWheelFromPointer = (clientX) => {
      const rect = wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const norm = Math.max(-1, Math.min(1, (clientX - centerX) / (rect.width * 0.55)));
      InputState.wheelSteerVal = norm;
      if (spoke) spoke.style.transform = `rotate(${norm * 65}deg)`;
    };
    wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      InputState.wheelDragActive = true;
      wheel.setPointerCapture(e.pointerId);
      updateWheelFromPointer(e.clientX);
    });
    wheel.addEventListener('pointermove', (e) => {
      if (!InputState.wheelDragActive) return;
      updateWheelFromPointer(e.clientX);
    });
    const releaseWheel = () => {
      InputState.wheelDragActive = false;
      InputState.wheelSteerVal = 0;
      if (spoke) spoke.style.transform = 'rotate(0deg)';
    };
    wheel.addEventListener('pointerup', releaseWheel);
    wheel.addEventListener('pointercancel', releaseWheel);
  }

  document.getElementById('btnAbilityZone').addEventListener('click', () => activateMidnightSpecial('ZONE'));
  document.getElementById('btnAbilityAgro').addEventListener('click', () => activateMidnightSpecial('AGRO'));
  document.getElementById('btnAbilityRoar').addEventListener('click', () => activateMidnightSpecial('ROAR'));
  document.getElementById('btnPulseBeam').addEventListener('click', () => { JarvisAI.fireUnibeam(); });
  document.getElementById('btnJarvisMode').addEventListener('click', cycleJarvisMode);
  document.getElementById('btnJarvisArToggle').addEventListener('click', toggleJarvisArHud);
  document.getElementById('btnTwoWheel').addEventListener('click', () => { SoundEngine.init(); InputState.twoWheelPressed = true; });
  document.getElementById('btnSideSlam').addEventListener('click', () => { SoundEngine.init(); InputState.slamPressed = true; });

  document.getElementById('btnGasPedal').addEventListener('click', () => {
    GameState.autoGas = !GameState.autoGas;
    const gasBtn = document.getElementById('btnGasPedal');
    if (gasBtn) gasBtn.textContent = GameState.autoGas ? '🟢 AUTO-GAS: ON (W)' : '⚪ AUTO-GAS: OFF (W)';
  });

  document.getElementById('btnPaceMode').addEventListener('click', cyclePaceMode);
  document.getElementById('btnCameraMode').addEventListener('click', cycleCameraMode);
  document.getElementById('btnVisualMode').addEventListener('click', cycleVisualMode);
  document.getElementById('btnTiltToggle').addEventListener('click', () => toggleTilt());
  document.getElementById('btnEnableTiltModal').addEventListener('click', () => toggleTilt(true));
  document.getElementById('btnCalibrateTilt').addEventListener('click', recenterTilt);

  document.getElementById('btnAudioToggle').addEventListener('click', () => {
    SoundEngine.init();
    SoundEngine.toggleMute();
  });
  document.getElementById('btnMuteLabelToggle').addEventListener('click', () => {
    SoundEngine.init();
    SoundEngine.toggleMute();
  });
  document.getElementById('btnMuteStartModal').addEventListener('click', () => {
    SoundEngine.init();
    SoundEngine.toggleMute();
  });
  const garageMuteBtn = document.getElementById('btnMuteGarageModal');
  if (garageMuteBtn) garageMuteBtn.addEventListener('click', () => {
    SoundEngine.init();
    SoundEngine.toggleMute();
  });
  const volSlider = document.getElementById('masterVolSlider');
  if (volSlider) {
    volSlider.value = Math.round(SoundEngine.volume * 100);
    volSlider.addEventListener('input', () => {
      SoundEngine.init();
      SoundEngine.setVolume(parseFloat(volSlider.value) / 100);
    });
  }

  document.getElementById('btnGarageOpen').addEventListener('click', toggleGarageModal);
  document.getElementById('btnOpenGarageFromTitle').addEventListener('click', openGarageModal);
  document.getElementById('btnOpenEvents').addEventListener('click', openEventsPanel);
  document.getElementById('btnCloseEvents').addEventListener('click', closeEventsPanel);
  document.getElementById('btnStartEvent').addEventListener('click', () => startNewRace());
  document.getElementById('btnOpenLeaderboard').addEventListener('click', () => openLeaderboard());
  document.getElementById('btnViewMode').addEventListener('click', (e) => { e.stopPropagation(); toggleRenderMode(); });
  document.getElementById('setView2d').addEventListener('click', () => setRenderMode('2d'));
  document.getElementById('setView3d').addEventListener('click', () => setRenderMode('3d'));
  document.getElementById('btnOpenLeaderboardFromEnd').addEventListener('click', () => {
    openLeaderboard(GameState.daily ? { board: 'daily', mode: 'DAILY' } : { board: 'week', mode: 'ARCADE' });
  });
  document.getElementById('btnCloseLeaderboard').addEventListener('click', () => withResults((ui) => ui.closeLeaderboard()));
  document.getElementById('btnPlayDaily').addEventListener('click', () => startNewRace({ daily: true }));
  document.querySelectorAll('.board-tab').forEach((b) => b.addEventListener('click', () => {
    const view = { board: b.dataset.board, mode: b.dataset.mode, track: Boolean(b.dataset.track) };
    withResults((ui) => ui.selectBoard(view));
  }));
  document.getElementById('initialsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('initialsInput');
    const ini = normalizeInitials(input.value);
    if (!ini) { input.focus(); return; }
    SaveStore.data.initials = ini;
    SaveStore.save();
    setProfile({ initials: ini });
    withResults((ui) => ui.postScore(ini));
  });
  // Typing initials must not steer the car or trigger shortcuts.
  document.getElementById('initialsInput').addEventListener('keydown', (e) => e.stopPropagation());
  // Tap anywhere on the title (outside its icons) to race.
  document.getElementById('titleScreen').addEventListener('click', (e) => {
    if (!e.target.closest('button, nav, a')) startNewRace(titleStart || { mode: 'INFINITE' });
  });
  document.getElementById('btnOpenGarageFromEnd').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    openGarageModal();
  });
  document.getElementById('btnChangeEventFromGarage').addEventListener('click', () => {
    document.getElementById('garageModal').classList.add('hidden');
    openEventsPanel();
  });
  document.getElementById('btnSelectLevelFromEnd').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    openEventsPanel();
  });
  document.getElementById('btnCloseGarage').addEventListener('click', toggleGarageModal);
  document.getElementById('btnResumeFromGarage').addEventListener('click', () => {
    document.getElementById('garageModal').classList.add('hidden');
    if (GameState.status === 'PAUSED') {
      GameState.status = 'PLAYING';
    } else if (GameState.status === 'TITLE' || GameState.status === 'GAMEOVER') {
      startNewRace();
    }
  });

  const btnArcade = document.getElementById('modeBtnArcade');
  const btnInfinite = document.getElementById('modeBtnInfinite');
  btnArcade.addEventListener('click', () => { GameState.mode = 'ARCADE'; syncModeButtons(); updateTitleChip(); });
  btnInfinite.addEventListener('click', () => { GameState.mode = 'INFINITE'; syncModeButtons(); updateTitleChip(); });
  syncModeButtons();

  const sensSlider = document.getElementById('tiltSensSlider');
  const sensVal = document.getElementById('tiltSensValue');
  if (sensSlider) {
    sensSlider.value = SaveStore.data.tiltSensitivity || 1.0;
    if (sensVal) sensVal.textContent = `${Number(sensSlider.value).toFixed(1)}x`;
    sensSlider.addEventListener('input', () => {
      SaveStore.data.tiltSensitivity = parseFloat(sensSlider.value);
      if (sensVal) sensVal.textContent = `${SaveStore.data.tiltSensitivity.toFixed(1)}x`;
      SaveStore.save();
    });
  }

  const rosterGarageBtn = document.getElementById('btnRosterGarage');
  if (rosterGarageBtn) rosterGarageBtn.addEventListener('click', () => openGarageModal());
  const quickCarBtn = document.getElementById('btnQuickSwitchCar');
  if (quickCarBtn) {
    quickCarBtn.addEventListener('click', () => {
      selectCharacterByIndex(nextOwnedCarIndex(GameState.selectedCharIdx));
      const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx];
      triggerAnnouncement(`🏎️ ${c.car.toUpperCase()}`, `${c.driver} (${c.franchise})`, 1100);
    });
  }
  const dismissCoachBtn = document.getElementById('btnDismissCoach');
  if (dismissCoachBtn) {
    dismissCoachBtn.addEventListener('click', () => {
      GameState.coachDismissed = true;
      updateInteractiveCoach(0);
    });
  }

  // Touch Swipe Gesture Support directly on gameCanvas!
  let touchStartX = 0;
  let touchStartY = 0;
  mainCanvas.addEventListener('pointerdown', (e) => {
    touchStartX = e.clientX;
    touchStartY = e.clientY;
  });
  mainCanvas.addEventListener('pointerup', (e) => {
    const dx = e.clientX - touchStartX;
    const dy = e.clientY - touchStartY;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      GameState.playerVX += (dx > 0 ? 1.15 : -1.15);
      RS.onboarding.steer();
    } else if (dy < -28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.hoverPressed = true; // Swipe Up -> Jump / Hover!
    } else if (dy > 28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.down = true; // Swipe Down -> Duck-Slide!
      setTimeout(() => { InputState.down = false; }, 650);
    }
  });

  // PLAY is Endless Highway (ticket 0150); a deep link (daily, ?level=) can point it elsewhere.
  document.getElementById('btnStartRace').addEventListener('click', () => startNewRace(titleStart || { mode: 'INFINITE' }));
  document.getElementById('btnOpenLive').addEventListener('click', () => loadLive().then((l) => l.openMenu()));
  // One more run (ticket 0151): an Endless retry skips the lineup and lights — driving in < 2 s.
  document.getElementById('btnPlayAgain').addEventListener('click', () => startNewRace(GameState.daily ? { daily: true }
    : GameState.mode === 'INFINITE' ? { mode: 'INFINITE', quick: true } : undefined));
  document.getElementById('btnNextRace').addEventListener('click', (e) => {
    const idx = Number(e.currentTarget.dataset.level);
    if (!Number.isInteger(idx) || !WORLD_LEVELS[idx]) return;
    GameState.levelIndex = idx;
    SaveStore.data.selectedLevel = idx;
    SaveStore.save();
    startNewRace({ mode: 'ARCADE' });
  });

  window.addEventListener('resize', () => {
    resizeCanvases();
    if (!view3d) renderScene();
  });
}

export function syncAudioUI() {
  const isMuted = SoundEngine.muted || SoundEngine.volume <= 0;
  const iconBtn = document.getElementById('btnAudioToggle');
  const lblBtn = document.getElementById('btnMuteLabelToggle');
  const startBtn = document.getElementById('btnMuteStartModal');
  const garBtn = document.getElementById('btnMuteGarageModal');
  const volSlider = document.getElementById('masterVolSlider');

  if (iconBtn) iconBtn.textContent = isMuted ? '🔇' : '🔊';
  if (lblBtn) {
    lblBtn.textContent = isMuted ? '🔇 MUTED (M)' : '🔊 SOUND: ON (M)';
    lblBtn.className = isMuted
      ? 'px-2 py-1 rounded-lg bg-red-600 text-white border border-red-300 text-[9px] font-arcade font-bold transition'
      : 'px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-800 border border-rose-500/70 text-[9px] font-arcade font-bold text-rose-200 transition';
  }
  if (startBtn) {
    const icon = document.getElementById('titleSoundIcon');
    if (icon) icon.textContent = isMuted ? '🔇' : '🔊';
    startBtn.setAttribute('aria-pressed', String(!isMuted));
  }
  if (garBtn) {
    garBtn.textContent = isMuted ? 'UNMUTE (M)' : 'MUTE (M)';
  }
  if (volSlider) {
    volSlider.value = isMuted ? 0 : Math.round(SoundEngine.volume * 100);
  }
  refreshSettingsPanel();
}

// The co-pilot: OFF → SMART ASSIST → AUTOPILOT (src/steermode-ui.js saves it; I or the pill).
function cycleJarvisMode() {
  if (steerModes) steerModes.cycleAssist();
  const m = JARVIS_MODES[GameState.jarvisMode];
  if (m) JarvisAI.setStatus(m.desc, true);
}

function toggleJarvisArHud() {
  GameState.jarvisArEnabled = !GameState.jarvisArEnabled;
  const btn = document.getElementById('btnJarvisArToggle');
  if (btn) {
    btn.textContent = GameState.jarvisArEnabled ? '💠 AR HUD: ON (J)' : '💠 AR HUD: OFF (J)';
  }
  JarvisAI.setStatus(
    GameState.jarvisArEnabled
      ? 'Holographic Mark-88 AR Visor & Target Lock restored.'
      : 'AR Visor projection minimized for unobstructed street view.',
    false
  );
}

function cyclePaceMode() {
  GameState.paceMode = (GameState.paceMode + 1) % PACE_MODES.length;
  const pCfg = PACE_MODES[GameState.paceMode];
  const btn = document.getElementById('btnPaceMode');
  if (btn) btn.textContent = pCfg.name;
  triggerAnnouncement(pCfg.name, pCfg.desc, 1100);
}

function cycleCameraMode() {
  GameState.cameraMode = (GameState.cameraMode + 1) % CAMERA_MODES.length;
  const btn = document.getElementById('btnCameraMode');
  if (btn) btn.textContent = CAMERA_MODES[GameState.cameraMode].name;
  triggerAnnouncement(CAMERA_MODES[GameState.cameraMode].name, 'CAMERA PERSPECTIVE UPDATED', 900);
}

function cycleVisualMode() {
  const order = ['AUTO', '8BIT', '16BIT', 'HD'];
  const idx = (order.indexOf(GameState.visualOverride) + 1) % order.length;
  GameState.visualOverride = order[idx];
  const btn = document.getElementById('btnVisualMode');
  if (btn) btn.textContent = `GFX: ${GameState.visualOverride}`;
  updateEraHud();
}

function openGarageModal(focusCarId) {
  if (GameState.status === 'PLAYING' && GameState.mode !== 'LIVE') GameState.status = 'PAUSED'; // live races can't pause
  const focus = typeof focusCarId === 'string' ? focusCarId : null;
  // Show it once its chunk (and styles) are in, so it never flashes unstyled.
  loadGarageUI().then((ui) => {
    if (GameState.status === 'PLAYING') return; // a race started while it loaded
    document.getElementById('garageModal').classList.remove('hidden');
    ui.open(focus);
  });
}

function toggleGarageModal() {
  const modal = document.getElementById('garageModal');
  if (modal.classList.contains('hidden')) {
    openGarageModal();
  } else {
    modal.classList.add('hidden');
    if (GameState.status === 'PAUSED') GameState.status = 'PLAYING';
  }
}

// ── 2D / 3D view (ticket 0040) ───────────────────────────────────────────────
// The 3D view is a second renderer over the same simulation, loaded on demand. In 3D the
// 2D canvas stays on top, transparent, for screen-space FX (speed lines, sparks, warp).
const webglOk = hasWebGL();
let activeView = '2d';
export let view3d = null;
let view3dLoading = false;
const carsFor3D = [];

// The solo ghost (ticket 0092) as a translucent car on the road in 3D, where its trace was.
const ghostPose3D = { d: 0, x: 0 };
const ghostBody3D = {
  worldZ: 0, offset: 0, y: 0, rot: 0, yaw: 0, halfL: 110, halfW: 0.136, active: true, takenDown: false,
  style: 'GULLWING', shape: 'GULLWING', bodyColor: '#a5f3fc', underglow: '#67e8f9', ghost: true, ghostTag: '',
};

/** Every car the 3D view should draw. Remote/ghost cars belong here too. */
function collectCarsFor3D(out) {
  let n = 0;
  if (ghostRace.active && GameState.status === 'PLAYING' && ghostRace.poseInto(hudView.raceTime, ghostPose3D)) {
    const mult = (PACE_MODES[GameState.paceMode] || PACE_MODES[0]).mult;
    ghostBody3D.worldZ = GameState.trackPos + ROAD_CFG.playerZOffset + (ghostPose3D.d - GameState.distance) * (11000 * mult / 88);
    ghostBody3D.offset = ghostPose3D.x;
    ghostBody3D.ghostTag = `👻 ${ghostRace.initials}`;
    out[n++] = ghostBody3D;
  }
  for (let i = 0; i < LiveTraffic.racers.length; i++) out[n++] = LiveTraffic.racers[i];
  for (let i = 0; i < LiveTraffic.traffic.length; i++) out[n++] = LiveTraffic.traffic[i];
  for (let i = 0; i < live.ghosts.length; i++) out[n++] = live.ghosts[i]; // live races: friends + CPU
  out.length = n;
  return n;
}

function playerPaint() {
  const ch = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  return { body: carPaint(ch).body, underglow: SaveStore.data.underglow || ch.glow, shape: ch.shape };
}

function setCanvasLayering(on) {
  mainCanvas.style.position = on ? 'relative' : '';
  mainCanvas.style.zIndex = on ? '1' : '';
}

async function enable3D() {
  if (view3d || view3dLoading || !webglOk) return;
  view3dLoading = true;
  syncViewModeUI();
  try {
    const { createView3D } = await loadView3D();
    if (activeView !== '3d') return; // switched back while loading
    view3d = createView3D({
      container: document.getElementById('canvasContainer'),
      state: GameState,
      track,
      era: getActiveEraRenderConfig,
      collectCars: collectCarsFor3D,
      obstacles: () => LiveTraffic.drawObstacles,
      player: playerPaint,
      quality: gfxQ,
      onLost: () => {
        setRenderMode('2d', { persist: false });
        triggerAnnouncement('3D VIEW LOST', 'BACK TO 2D', 1600);
      },
    });
    setCanvasLayering(true);
  } catch (err) {
    console.warn('3D view unavailable, staying in 2D', err);
    activeView = '2d';
  } finally {
    view3dLoading = false;
    syncViewModeUI();
  }
}

function disable3D() {
  if (view3d) { view3d.dispose(); view3d = null; }
  setCanvasLayering(false);
}

function setRenderMode(mode, { persist = true } = {}) {
  activeView = mode === '3d' && webglOk ? '3d' : '2d';
  if (persist) { SaveStore.data.renderMode = activeView; SaveStore.save(); }
  if (activeView === '3d') enable3D(); else disable3D();
  syncViewModeUI();
}

function toggleRenderMode() {
  setRenderMode(toggledPref(activeView));
  triggerAnnouncement(activeView === '3d' ? '🧊 3D VIEW' : '🎞️ 2D VIEW', '', 900);
}

function syncViewModeUI() {
  const on = activeView === '3d';
  const t = document.getElementById('btnViewMode');
  if (t) {
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
    t.setAttribute('aria-busy', view3dLoading ? 'true' : 'false');
    t.disabled = !webglOk;
    t.title = webglOk ? 'Switch between the 2D and 3D view (T)' : '3D needs WebGL, which this browser has turned off';
  }
  for (const [id, mine] of [['setView2d', false], ['setView3d', true]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.setAttribute('aria-pressed', on === mine ? 'true' : 'false');
    if (mine) b.disabled = !webglOk;
  }
  const note = document.getElementById('setViewNote');
  if (note) {
    note.textContent = !webglOk ? '3D needs WebGL, which this browser has turned off.'
      : view3dLoading ? 'Loading the 3D view…'
        : '3D draws the same race in real 3D. Press T to flip mid-race.';
  }
}

/** Screen-space FX over the 3D view (the 2D canvas, cleared to transparent each frame). */
function renderOverlayFx(feel) {
  const scale = getActiveEraRenderConfig().pixelScale || 1.0;
  const rw = Math.max(240, Math.floor(viewW / scale));
  const rh = roadCanvasHeight();
  beginMainFrame();
  mainCtx.clearRect(0, 0, viewW, viewH);
  mainCtx.save();
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) drawWarpTunnel(mainCtx, GameState.warpFxTimer / 0.9);
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  mainCtx.scale(viewW / rw, viewH / rh);
  drawCarFx(mainCtx, rw, rh, true);
  mainCtx.restore();
}

function renderFrame(dt) {
  if (!view3d) { renderScene(); return; }
  const feel = nosFeel(speedFeel(GameState.status === 'PLAYING' ? GameState.speed : 0, GameState.reducedMotion));
  view3d.render(dt, feel);
  renderOverlayFx(feel);
}

// --- TOUCH CONTROLS (ticket 0061) ---
// Thumbstick / D-pad / tilt, an action arc and shortcuts (src/touch/). Touch devices (or any
// device's first touch) load the kit as its own chunk; desktops never download it.
export let touch = null;
export let steerModes = null; // ticket 0130 (src/steermode-ui.js)
let touchLoading = null;
const canTouch = () => (navigator.maxTouchPoints || 0) > 0
  || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches);

/** `show` = put the controls on screen (a touch device); the settings buttons only need the code. */
function loadTouch(show = true) {
  touchLoading = touchLoading || import('./touch/bridge.js').then(({ connectTouch }) => {
    touch = connectTouch({
      performHumanTrick, activateMidnightSpecial, cycleCameraMode, openSettings, recenterTilt, toggleTilt,
      announce: triggerAnnouncement, traffic: () => LiveTraffic, onboarding: () => RS.onboarding, is3D: () => !!view3d,
    });
    return touch;
  });
  return touchLoading.then((t) => { if (show) t.show(); return t; });
}

function initTouchControls() {
  if (canTouch()) loadTouch();
  else {
    const first = (e) => {
      if (e.pointerType !== 'touch') return;
      window.removeEventListener('pointerdown', first, true);
      loadTouch();
    };
    window.addEventListener('pointerdown', first, true);
  }
  // Settings gear: STEERING & BUTTONS opens the Controls panel; EDIT CONTROLS opens the HUD
  // layout editor directly (one tap from the gear).
  document.getElementById('btnOpenControls').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
    loadTouch(false).then((t) => t.openPanel(openSettings));
  });
  registerControlsEditor(({ resume }) => loadTouch(false).then((t) => t.openEditor(() => {
    openSettings();
    if (resume && GameState.status !== 'PAUSED') resume();
  })));
}

let lastFrameTime = 0;
let rafId = null;

// Fixed-timestep simulation (ticket 0070): the race always advances in 1/120 s steps, so
// it plays identically at any display rate; the renderer blends the last two steps.
const simClock = createFixedStep();
const viewPrev = { trackPos: 0, playerX: 0, playerY: 0 };
const viewHeld = { trackPos: 0, playerX: 0, playerY: 0 };
const VIEW_KEYS = ['trackPos', 'playerX', 'playerY'];
// Bigger jumps than this between two steps are teleports (race reset, recycle): don't blend.
const VIEW_TELEPORT = 2500;

function forEachBody(fn) {
  for (let i = 0; i < LiveTraffic.racers.length; i++) fn(LiveTraffic.racers[i]);
  for (let i = 0; i < LiveTraffic.traffic.length; i++) fn(LiveTraffic.traffic[i]);
  for (let i = 0; i < LiveTraffic.drawObstacles.length; i++) fn(LiveTraffic.drawObstacles[i]);
}
const snapBody = (b) => { b.viewZ0 = b.worldZ; b.viewX0 = b.offset; };
const holdBody = (b) => { b.viewZ1 = b.worldZ; b.viewX1 = b.offset; };
const restoreBody = (b) => { b.worldZ = b.viewZ1; b.offset = b.viewX1; };
let viewAlpha = 0;
const blendBody = (b) => {
  if (b.viewZ0 === undefined || Math.abs(b.worldZ - b.viewZ0) > VIEW_TELEPORT) return;
  b.worldZ = lerp(b.viewZ0, b.worldZ, viewAlpha);
  b.offset = lerp(b.viewX0, b.offset, viewAlpha);
};

function snapshotView() {
  for (let i = 0; i < VIEW_KEYS.length; i++) viewPrev[VIEW_KEYS[i]] = GameState[VIEW_KEYS[i]];
  forEachBody(snapBody);
}

/** Draws the frame at `alpha` between the previous and current sim step, then restores. */
function renderBlended(alpha, frameDt) {
  if (alpha <= 0 || alpha >= 1 || Math.abs(GameState.trackPos - viewPrev.trackPos) > VIEW_TELEPORT) {
    renderFrame(frameDt);
    return;
  }
  viewAlpha = alpha;
  for (let i = 0; i < VIEW_KEYS.length; i++) {
    const k = VIEW_KEYS[i];
    viewHeld[k] = GameState[k];
    GameState[k] = lerp(viewPrev[k], viewHeld[k], alpha);
  }
  forEachBody(holdBody);
  forEachBody(blendBody);
  renderFrame(frameDt);
  forEachBody(restoreBody);
  for (let i = 0; i < VIEW_KEYS.length; i++) GameState[VIEW_KEYS[i]] = viewHeld[VIEW_KEYS[i]];
}

const garageModalEl = document.getElementById('garageModal');

function mainLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const frameSeconds = (timestamp - lastFrameTime) / 1000;
  const dt = Math.min(0.05, frameSeconds); // wall-clock frame time for attract mode and render FX
  lastFrameTime = timestamp;

  if (touch) touch.sample(dt);
  if (gfx) { if (GameState.status === 'PLAYING') gfx.sample(frameSeconds * 1000); else gfx.hold(); }
  if (GameState.status === 'PLAYING' && raceStep) {
    const steps = simClock.advance(frameSeconds);
    for (let i = 0; i < steps && GameState.status === 'PLAYING'; i++) {
      snapshotView();
      raceStep.updateGame(simClock.step);
      syncContactZ();
    }
    updateLiveHud();
  } else {
    simClock.reset();
    // Live race countdown (GRID): on the line, road still. A pause freezes it too; otherwise
    // attract mode rolls the road.
    if (GameState.status !== 'PAUSED' && GameState.status !== 'GRID') {
      GameState.trackPos += 1350 * dt;
      const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
      if (track.end - currentSegIdx < ROAD_CFG.drawDistance + 60) {
        generateNextTrackBiome();
      }
    }
    syncContactZ();
  }
  live.frame(); // live races: countdown → green light, friends' cars, our state out

  announcer.update();
  SoundEngine.updateEngine(GameState.speed, GameState.status === 'PLAYING' && !SoundEngine.muted);
  // The garage covers the screen (blurred, 90% opaque): unless a live race is still running
  // under it, the road behind holds its last frame instead of re-rendering, re-blurring and
  // fighting the garage turntable for the GPU.
  const covered = GameState.status !== 'PLAYING' && garageModalEl && !garageModalEl.classList.contains('hidden');
  if (GameState.status === 'PLAYING') renderBlended(simClock.alpha, dt);
  else if (!covered) renderFrame(dt);
  if (touch) touch.render();
  rafId = requestAnimationFrame(mainLoop);
}

// Offline play (tickets 0075, 0158): production builds register the service worker, which
// precaches the whole game; the API, identity and live rooms are never cached.
// Offline play (src/offline.js) is a lazy chunk too: the service worker only matters after the
// first paint, so it registers once the page has loaded (0170).
const loadOffline = () => import('./offline.js');
function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  loadOffline().then(({ registerOffline, onOffline, offlineLabel }) => startOffline(registerOffline, onOffline, offlineLabel)).catch(() => {});
}
function startOffline(registerOffline, onOffline, offlineLabel) {
  registerOffline(import.meta.env.BASE_URL);
  const pill = document.getElementById('offlinePill');
  onOffline((s) => {
    document.documentElement.classList.toggle('is-offline', !s.online);
    if (!pill) return;
    const label = offlineLabel(s);
    pill.textContent = label;
    pill.classList.toggle('hidden', !label);
    pill.classList.toggle('is-ready', s.ready);
    // The install / Add-to-Home-Screen hint is a lazy chunk, shown once everything is saved.
    if (s.ready && !offlineHintLoaded) {
      offlineHintLoaded = true;
      import('./offline-ui.js').then((m) => m.initOfflineHint({ pill })).catch(() => {});
    }
  });
}
let offlineHintLoaded = false;

window.onload = () => {
  registerServiceWorker();
  preloadBackdrops(ERAS[GameState.eraIndex].id);
  // Test/debug hook: ?debug exposes state for e2e checks (never used by the game itself). Only
  // on local and preview hosts: on the real site ?debug keeps just the graphics overlay, so the
  // console isn't a one-line score editor (ticket 0180).
  if (DEBUG_MODE && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.workers\.dev$/.test(location.hostname)) window.__OT = { view: () => ({ mode: activeView, loading: view3dLoading, stats: view3d ? view3d.stats : null }) };
  else if (DEBUG_MODE) window.__OT = {
    GameState, InputState, announce: triggerAnnouncement, startRace: startNewRace, ready: () => ceremonyReady, get live() { return live; }, loadLive,
    pause: () => { GameState.status = 'PAUSED'; },
    finishRun: () => endRaceRun('🏁 FINISH!'),
    mission: advanceContractProgress,
    traffic: () => LiveTraffic,
    track: () => track,
    backdrop: backdropDebug,
    offline: () => loadOffline().then((m) => m.offlineDebug()),
    ads: boardsDebug,
    gfx: () => gfx,
    view: () => ({ mode: activeView, loading: view3dLoading, stats: view3d ? view3d.stats : null }),
    setView: (m) => setRenderMode(m, { persist: false }),
    input: InputState,
    controls: () => SaveStore.data.controls,
    touch: () => touch && touch.controls,
    steer: () => steerModes,
    drive: () => drive,
    lateral: () => lateral,
    audio: () => SoundEngine,
    smoke: () => smoke2d && smoke2d.pool,
    pickupArt: () => pickupArt && pickupArt.stats,
    damage: (n, why = 'BARREL HIT') => applyPlayerDamage(n, why),
    heal: healPlayerHp,
    runner: () => ({ storm, stats: runStats, goals: runnerMod ? runnerMod.goalsOf(SaveStore.data) : null }),
    pickup: (type) => raceStep && raceStep.applyPickup({ type, offset: GameState.playerX }, PICKUPS[type]),
    fair: () => RS.fair, // jump/trick caps and counters (ticket 0180)
  };
  initSettings({ announce: triggerAnnouncement });
  // Steering-mode switch (ticket 0130): its own chunk, fetched right after startup.
  setTimeout(() => import('./steermode-ui.js').then(({ initSteerModes }) => {
    steerModes = initSteerModes({ announce: triggerAnnouncement, toggleTilt, recenterTilt, touch: () => touch });
  }).catch(() => {}), 0);
  setTimeout(loadGfx, 0);
  setTimeout(() => { loadResultsUi().catch(() => {}); loadMusic().catch(() => {}); }, 0);
  bindRaceStageSkip();
  if (/[?&]track=/.test(location.search)) loadShareUi().catch(() => {});
  watchLayout();
  initTouchControls();
  resizeCanvases();
  GameState.levelIndex = SaveStore.data.selectedLevel || 0;
  initTrack();
  bindAllControls();
  setRenderMode(resolveRenderMode({
    saved: SaveStore.data.renderMode,
    query: new URLSearchParams(location.search).get('view'),
    webgl: webglOk,
    lowEnd: isLowEnd(),
  }), { persist: false });
  renderCharacterRosterGrid();
  const savedCar = POP_CULTURE_ROSTER.findIndex((c) => c.id === SaveStore.data.garage.selected);
  if (!selectCharacterByIndex(Math.max(0, savedCar))) selectCharacterByIndex(0);
  renderLevelSelectGrid();
  setTimeout(() => syncRunnerUi(true), 0); // endless goals on the title (ticket 0151)
  document.getElementById('titleBestScore').textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins}`;
  const playHint = document.getElementById('playHint');
  if (playHint) playHint.textContent = coarsePointer ? 'ENDLESS HIGHWAY · TAP ANYWHERE' : 'ENDLESS HIGHWAY · PRESS ENTER';
  updateTitleChip();
  syncAudioUI();
  updateEraHud();
  updateLiveHud();
  // TV mode (ticket 0175): ?tv (or ?screen=tv) pairs a phone as the controller; lazy, TV only.
  if (/[?&](screen=tv|tv)(&|=?$|=&)/.test(location.search)) import('./tv/tv.js').then((m) => m.startTv({
    start: () => { const again = document.getElementById('btnPlayAgain'); if (again && again.offsetParent) again.click(); else if (titleVisible()) startNewRace(titleStart || { mode: 'INFINITE' }); },
    unlockAudio: () => SoundEngine.init(),
    debug: new URLSearchParams(location.search).has('debug'),
  })).catch(() => {});
  // A ?room=CODE invite drops you straight into that room's lobby (no title, no menus).
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) loadLive().then((l) => l.join(roomParam));
  // Deep links (?play= ?board= ?level= ?garage, ticket 0110): lazy, only when present.
  else if (/[?&](play|board|level|garage)(=|&|$)/.test(location.search)) import('./deeplink.js').then((m) => m.applyDeepLink({
    levels: WORLD_LEVELS, unlocked: () => SaveStore.data.unlockedLevel || 1, live: loadLive, board: openLeaderboard,
    garage: openGarageModal, titleStart: (o) => { titleStart = o; },
    pickLevel: (i) => { GameState.levelIndex = i; GameState.mode = 'ARCADE'; titleStart = titleStart || { mode: 'ARCADE' }; SaveStore.data.selectedLevel = i; SaveStore.save(); syncModeButtons(); updateTitleChip(); },
  })).catch(() => {});
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(mainLoop);
  // Zero-login identity (ticket 0090): silent, never blocks the title.
  initRacer({ SaveStore, freshSaveData, levels: WORLD_LEVELS, onChange: renderRacerPill }).finally(refreshRival);
};

let titleStart; // a deep link can make the title tap start today's daily (ticket 0110)

function renderRacerPill(p) {
  const name = document.getElementById('racerPillName');
  if (name) name.textContent = p?.initials || SaveStore.data.initials || 'RACER';
  const best = document.getElementById('titleBestScore');
  if (best) best.textContent = SaveStore.data.bestScore.toLocaleString();
  updateTitleChip();
}

// Shared-module bindings the lazy race-step.js chunk uses, as one object (see there).
export const RACE_DEPS = {
  CAR_SPECS, CONTINUE, ENDLESS, ERAS, FIELD_SIZE, FLUX, GameState, InputState, LIVE, PACE_MODES,
  PICKUP, PICKUPS, POP_CULTURE_ROSTER, ROAD_CFG, SaveStore, SoundEngine, TRAFFIC_LATERAL,
  WORLD_LEVELS, addItem, addNos, applyRunResult, beginRun, boostOutcome, breakdown, canContinue,
  continueCost, createDrive, createGhostRecorder, createHitStop, createHud, createLateral,
  createNos, createOnboarding, createPenaltyLog, createRaceClock, createSteer, createStorm,
  crossingTime, currentDifficulty, difficultyOf, endlessTuning, featureAt, finishBonus,
  forkCueState, forkLean, generateNextTrackBiome, handlingFor, hasSetPieceBetween,
  impactVelocities, isNewPlayer, landingKeep, lapOf, logHit, logPayload, logWall, loopStep,
  magnetPull, materialFor, missionsDone, mulberry32, nearMissChain, nosFill, nosFor, nosSpeed,
  ordinal, passiveFluxRate, penaltyPoints, pickMissions, pickupReach, pollGamepad,
  preloadBackdrops, raceLengthFor, recordEndless, recordMissions, recordRace, resetBackdrop,
  rivalTargetMph, rpmFor, runnerMult, setTrackIntensity, setTrackPowerups, stepDrive, stepLateral, stepNos,
  stepSetPieces, stepSteer, stepStorm, stormRespite, track, utcDay, wallContact, warpReady
};
