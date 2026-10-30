import './fonts.js';
import './styles.css';
import { boardsDebug } from './billboards.js';
import { preloadBackdrops, resetBackdrop, backdropDebug, setBackdropQuality } from './backdrop.js';
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
import { createPropPool } from './world.js';
import { createFixedStep, lerp } from './fixedstep.js';
import { contactZ } from './contact.js';
import { hasWebGL, isLowEnd, resolveRenderMode, toggledPref } from './render-mode.js';
import { loadView3D, loadCarPreview } from './render3d-loader.js';
import { FLUX, passiveFluxRate, warpReady, boostOutcome } from './flux.js';
import { speedFeel, createParticlePool, createHitStop, nearMissChain } from './fx.js';
import { createAnnouncer } from './announcer.js';
import { LEVEL_MEDALS, applyRunResult } from './progress.js';
import { setTrackIntensity, setTrackPowerups, addItem } from './track.js';
import { createStorm, stepStorm, stormRespite, runnerMult, canContinue, continueCost, CONTINUE } from './runner.js';
import { difficultyOf, endlessTuning, endlessCash, recordEndless, ENDLESS } from './endless.js';
import { track, generateNextTrackBiome, addRoadSection, buildInitialTrack, setTrackLine, setTrackSeed, hasSetPieceBetween, featureAt, curvatureAt, bankAt } from './track.js';
import { stepSetPieces } from './setpieces.js';
import { mainCanvas, resizeCanvases, roadCanvasHeight, getActiveEraRenderConfig } from './render/canvas.js';
import { renderScene } from './render/scene.js';
import { nosFeel, renderOverlayFx } from './render/fx.js';
export let pickupArt = null; // src/pickup-art.js, lazy: crisp cached pickup icons (simple shapes until it lands)
setTimeout(() => { import('./pickup-art.js').then((m) => { pickupArt = m; }, () => {}); }, 0);
export let setPieceArt = null; // src/setpieces-2d.js, lazy: the art waits for it, the sim never does
setTimeout(() => { import('./setpieces-2d.js').then((m) => { setPieceArt = m; }, () => {}); }, 0);
export let hzArt = null; // src/hazard-art.js, lazy: Endless hazards on the road + their HUD (0186)
setTimeout(() => { import('./hazard-art.js').then((m) => { hzArt = m; }, () => {}); }, 0);
export let carArt = null; // src/car-sprite.js, lazy: each roster car's own model as cached race sprites
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
import { carParams, isOwned, unlockProgress, recordRace, ensureGarage, CAR_SPECS } from './cars.js';
import { initRacer } from './racer-ui.js';
import { setProfile } from './identity.js';
import { LIVE } from './worker/live-rules.js';
/** Race state the lazy race step (race-step.js) writes as well as main: one shared object. */
export const RS = {};
// The race step itself (src/race-step.js) is a lazy chunk: fetched now, in parallel with the
// title, and awaited by every race start, so a race never runs without it (0170).
let raceStep = null, raceStepLoad = null;
function loadRaceStep() {
  // The rigid-body world (0176) is its own chunk, fetched in parallel and handed to the race step.
  // Race start/finish, coach and race HUD (0176) are their own chunk too: one object holds both.
  raceStepLoad = raceStepLoad || Promise.all([import('./race-step.js'), import('./rigid.js'), import('./race-flow.js')]).then(([m, rigid, flow]) => {
    m.useRigid(rigid);
    m.useFlow(flow);
    if (m.LiveTrafficMethods) Object.assign(LiveTraffic, m.LiveTrafficMethods);
    return (raceStep = Object.assign({}, m, flow));
  }, (e) => { raceStepLoad = null; throw e; });
  return raceStepLoad;
}
loadRaceStep().catch(() => {});
// Endless hazards, fuel, NOS heat, the Patrol and checkpoints (0186): a lazy chunk after the race
// step; the race step calls it through RS.hz once it is in.
setTimeout(() => { import('./hazard-run.js').then((m) => { RS.hz = m; m.reset(); }, () => {}); }, 0);
// Race-time actions that main still triggers (keys, touch, co-pilot, the debug hook) run in the
// race step; before it lands (no race can be on yet) they do nothing.
const raceCall = (name) => (...args) => (raceStep ? raceStep[name](...args) : undefined);
const applyPlayerDamage = raceCall('applyPlayerDamage');
const healPlayerHp = raceCall('healPlayerHp');
const performHumanTrick = raceCall('performHumanTrick');
const fireUnibeam = raceCall('fireUnibeam'); // the B-key pulse beam (race-only: lives in the race step)
const activateMidnightSpecial = raceCall('activateMidnightSpecial');
const updateInteractiveCoach = raceCall('updateInteractiveCoach');
const updateLiveHud = raceCall('updateLiveHud');
const endRaceRun = raceCall('endRaceRun');
/** Every race start goes through here: straight away once the race step is in, else as soon as it
 *  lands (taps while it loads collapse into one start, with the latest options). */
let startWanted, startWait = null;
const NO_START = {}; // going home while the race step loads cancels the queued start (0185)
function startNewRace(opts) {
  if (raceStep) return raceStep.startNewRace(opts);
  startWanted = opts;
  startWait = startWait || loadRaceStep().then((m) => { startWait = null; return startWanted === NO_START ? null : m.startNewRace(startWanted); });
  return startWait;
}

// The street sound layer (0193) hears the road: cars rushing past, tunnels around you.
setAudioHooks({ syncAudioUI, triggerAnnouncement, world: { bodies: () => LiveTraffic.bodies, playerZ: () => GameState.trackPos + ROAD_CFG.playerZOffset, seg: (z) => track.seg(Math.floor(z / ROAD_CFG.segLength)) } });

SaveStore.load();

// Game feel (pillar 2): one spark pool, one hit-stop clock, one near-miss chain for the run.
export const sparks = createParticlePool(160);
RS.fxClock = 0;
// Tyre smoke (ticket 0133): src/smoke2d.js, lazy; until it loads there is simply no smoke.
// The 3D view keeps its own world-space puffs (src/render3d/view.js).
export let smoke2d = null;
setTimeout(() => { import('./smoke2d.js').then((m) => { smoke2d = m.createTyreSmoke2D(); }, () => {}); }, 0);
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
import('./rival-ai.js').then((m) => {
  RAI = m; LiveTraffic.aiWorld = m.createAiWorld();
  // A race that started before the chunk landed (a slow phone, a quick tap): seat its drivers now.
  if (LiveTraffic.racers.length && !LiveTraffic.racers.some((r) => r.ai)) LiveTraffic.seatDrivers();
}).catch(() => {});
export const LiveTraffic = {
  /** Drivers (src/rival-ai.js) for the field; one of them is your nemesis and hunts you all race. */
  seatDrivers() {
    const pace = currentDifficulty().rivalPace;
    const nem = RAI && RAI.setupField(this.aiWorld, this.racers, { seed: GameState.lineSeed, pace, cls: (r) => (CAR_SPECS[r.id] || {}).cls, carP: (r) => carParams(r.rc) });
    GameState.nemesisId = nem ? nem.id : null;
  },
  racers: [],
  traffic: [],
  obstacles: [],
  // Ticket 0074: one world stepper (Z-hash broadphase, sleeping, statics), a fixed pool of
  // knockable props, and persistent body lists so the step never allocates.
  world: null,         // the rigid-body world (src/rigid.js), made by the race step
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
    this.seatDrivers();
    this.updateStandings(0, playerZ0, this.speedToWorld());

    // 4 well-spaced highway cars on the road, 2 parked: passed cars come back as formations (0027).
    this.traffic = [];
    const styles = ['SEMI_TRUCK', 'SEDAN', 'TAXI', 'SUV'];
    for (let i = 0; i < 6; i++) {
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
        vz: (38 + i * 4) * this.speedToWorld(), // already cruising (the rigid world drives it from here)
        bodyColor: ['#334155', '#eab308', '#e2e8f0', '#1e3a8a', '#7c2d12', '#0f766e'][i]
      }));
      const tr = this.traffic[i];
      tr.idle = i >= 4;
      if (tr.idle) { tr.takenDown = true; tr.active = false; tr.vz = 0; tr.worldZ = tr.prevZ = -1e6; }
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
  document.body.classList.remove('coach-up'); // landscape phones: the tips wait for the coach (0225)
}


export const hudView = {
  position: 1, total: 1, progress: 0, length: 0, raceTime: 0, timeLeft: 0, clockUrgent: false,
  infinite: false, compact: false, mph: 0, flux: 0, nos: 0, nosOn: false, hpFrac: 1, score: 0, field: LiveTraffic.fieldEntries,
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

/** Simulation-owned tyre contact Z; independent of which renderer draws the frame. */
function syncContactZ() {
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  const z = contactZ(track, GameState, camCfg, roadCanvasHeight());
  if (z !== null) GameState.visualPlayerZ = z;
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
  SoundEngine.setEngineVoice(c.shape, c.car);
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

// The driver grid lives in the events chunk too (src/level-select.js, 0185): it only shows in
// the events panel.
function renderCharacterRosterGrid() {
  levelSelect = levelSelect || import('./level-select.js');
  return levelSelect.then((m) => m.renderRosterGrid({
    GameState, SaveStore, roster: POP_CULTURE_ROSTER, locked: (id) => openGarageModal(id),
    pick: (idx) => { selectCharacterByIndex(idx); SoundEngine.playCoinPickup(); },
  }));
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
  leaveLive: () => showTitle(),
};

/** Home (ticket 0185): the one way back to the title from results, pause or a live room. */
export function showTitle() {
  if (GameState.savedLevelIndex !== undefined) restoreSoloSettings();
  else if (GameState.mode === 'LIVE') GameState.mode = 'ARCADE';
  if (startWait) startWanted = NO_START;
  GameState.status = 'TITLE';
  GameState.daily = null;
  GameState.racePosition = 8;
  initTrack();
  for (const id of ['gameOverModal', 'garageModal', 'settingsModal', 'leaderboardModal', 'continueOffer']) document.getElementById(id)?.classList.add('hidden');
  document.getElementById('titleScreen').classList.remove('hidden');
  document.body.classList.add('on-title');
  document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins}`;
  renderRacerPill();
  syncRunnerUi(true);
  refreshRival();
}
let home = null; // src/home.js: hooks, results → home, history, the attract driver (lazy)



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
    // Rebound keys (0013, src/keybinds.js) arrive as the default key their action answers to.
    const c = InputState.keyMap?.[e.code] ?? e.code;
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(c)) RS.onboarding.steer();
    if (['ArrowLeft', 'KeyA'].includes(c)) {
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
    if (['ArrowRight', 'KeyD'].includes(c)) {
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
    if (['ArrowUp', 'KeyW'].includes(c)) {
      if (GameState.playerY > 10 && !e.repeat) performHumanTrick('UP');
      InputState.up = true;
    }
    const racing = GameState.status === 'PLAYING';
    if (c === 'KeyN' && !racing) selectCharacterByIndex(nextOwnedCarIndex(GameState.selectedCharIdx));
    if (['ShiftLeft', 'ShiftRight'].includes(c) || (c === 'KeyN' && racing)) { InputState.nosHeld = true; if (!e.repeat) InputState.nosTap = true; }
    if (['ArrowDown', 'KeyS'].includes(c)) { if (GameState.playerY > 12 && !e.repeat) performHumanTrick('DOWN'); InputState.down = true; }
    if (c === 'Space') { e.preventDefault(); if (!e.repeat) InputState.boostPressed = true; }
    if (['KeyH', 'KeyE'].includes(c) && !e.repeat) { if (GameState.playerY > 12) performHumanTrick('UP'); else InputState.hoverPressed = true; }
    if (c === 'KeyZ') InputState.zonePressed = true;
    if (c === 'KeyX') InputState.agroPressed = true;
    if (c === 'KeyR') InputState.roarPressed = true;
    if (c === 'KeyQ') InputState.twoWheelPressed = true;
    if (c === 'KeyF') InputState.slamPressed = true;
    if (c === 'KeyB') fireUnibeam();
    if (c === 'KeyI') cycleJarvisMode();
    if (c === 'KeyK' && steerModes) steerModes.cycleMode(e.shiftKey ? -1 : 1);
    if (c === 'KeyJ') toggleJarvisArHud();
    if (c === 'KeyG') cyclePaceMode();
    if (c === 'KeyC') cycleCameraMode();
    if (c === 'KeyV') cycleVisualMode();
    if (c === 'KeyT') toggleRenderMode();
    if (c === 'KeyM') SoundEngine.toggleMute();
    if (['KeyP', 'Escape'].includes(c)) toggleGarageModal();
  });

  window.addEventListener('keyup', (e) => {
    const c = InputState.keyMap?.[e.code] ?? e.code;
    if (['ArrowLeft', 'KeyA'].includes(c)) InputState.left = false;
    if (['ArrowRight', 'KeyD'].includes(c)) InputState.right = false;
    if (['ArrowUp', 'KeyW'].includes(c)) InputState.up = false;
    if (['ArrowDown', 'KeyS'].includes(c)) InputState.down = false;
    if (['ShiftLeft', 'ShiftRight', 'KeyN'].includes(c)) InputState.nosHeld = false;
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
  document.getElementById('btnPulseBeam').addEventListener('click', () => { fireUnibeam(); });
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
  InputState.nosOn = false; // a tapped-on NOS (0222) stops when the menu opens, live races included
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
      obstacles: () => (RS.hz ? RS.hz.with3D(LiveTraffic.drawObstacles) : LiveTraffic.drawObstacles),
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

// Force feel (ticket 0183, src/forcefeel.js): gamepad rumble and phone pulses from the tyres
// and chassis. Its own chunk, fetched when a gamepad connects or the touch kit loads.
let forceFeel = null, forceFeelLoading = null;
function loadForceFeel() {
  forceFeelLoading = forceFeelLoading || import('./forcefeel.js').then(({ createForceFeel }) => {
    forceFeel = createForceFeel({
      state: GameState, settings: () => SaveStore.data.controls || {}, calm: () => GameState.reducedMotion,
      haptics: () => (touch ? touch.controls.haptics : null),
    });
  }).catch(() => { forceFeelLoading = null; });
}
window.addEventListener('gamepadconnected', loadForceFeel);

/** `show` = put the controls on screen (a touch device); the settings buttons only need the code. */
function loadTouch(show = true) {
  touchLoading = touchLoading || import('./touch/bridge.js').then(({ connectTouch }) => {
    touch = connectTouch({
      performHumanTrick, activateMidnightSpecial, cycleCameraMode, openSettings, recenterTilt, toggleTilt,
      announce: triggerAnnouncement, traffic: () => LiveTraffic, onboarding: () => RS.onboarding, is3D: () => !!view3d,
    });
    loadForceFeel();
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
let raceOn = false; // body.race-on while the race steps: CSS hides title/garage-only UI (0229)
let simHeld = false; // the balance harness steps the sim itself (?debug, tests/balance)
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
  if (simHeld) { rafId = requestAnimationFrame(mainLoop); return; }
  if (!lastFrameTime) lastFrameTime = timestamp;
  const frameSeconds = (timestamp - lastFrameTime) / 1000;
  const dt = Math.min(0.05, frameSeconds); // wall-clock frame time for attract mode and render FX
  lastFrameTime = timestamp;

  if (touch) touch.sample(dt);
  if (gfx) { if (GameState.status === 'PLAYING') gfx.sample(frameSeconds * 1000); else gfx.hold(); }
  const stepping = GameState.status === 'PLAYING' && !!raceStep;
  if (stepping !== raceOn) document.body.classList.toggle('race-on', raceOn = stepping);
  if (stepping) {
    const steps = simClock.advance(frameSeconds);
    for (let i = 0; i < steps && GameState.status === 'PLAYING'; i++) {
      snapshotView();
      raceStep.updateGame(simClock.step);
      syncContactZ();
    }
    updateLiveHud();
  } else {
    simClock.reset();
    InputState.nosOn = InputState.nosTap = false; // a tapped-on NOS (0222) stops on pause and off the road
    // Live race countdown (GRID): on the line, road still. A pause freezes it too; otherwise
    // attract mode rolls the road.
    if (GameState.status !== 'PAUSED' && GameState.status !== 'GRID') {
      GameState.trackPos += 1350 * dt;
      if (home) home.attract(dt);
      const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
      if (track.end - currentSegIdx < ROAD_CFG.drawDistance + 60) {
        generateNextTrackBiome();
      }
    }
    syncContactZ();
  }
  live.frame(); // live races: countdown → green light, friends' cars, our state out
  if (forceFeel) forceFeel.frame(dt); // rumble and phone pulses (ticket 0183)

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
  const view = () => ({ mode: activeView, loading: view3dLoading, stats: view3d ? view3d.stats : null });
  if (DEBUG_MODE) window.__OT = !/^(localhost|127\.0\.0\.1|\[::1\])$|\.workers\.dev$/.test(location.hostname) ? { view } : {
    GameState, InputState, announce: triggerAnnouncement, startRace: startNewRace, ready: () => ceremonyReady, get live() { return live; }, loadLive,
    pause: () => { GameState.status = 'PAUSED'; },
    home: () => home, // the home flow (0185), once its chunk is in
    finishRun: () => endRaceRun('🏁 FINISH!'),
    mission: advanceContractProgress,
    traffic: () => LiveTraffic,
    track: () => track,
    backdrop: backdropDebug,
    offline: () => loadOffline().then((m) => m.offlineDebug()),
    ads: boardsDebug,
    gfx: () => gfx,
    view,
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
    streak: (why) => raceStep && raceStep.addEndlessRunStreak(2, why), // a near-miss chain event (0205)
    fair: () => RS.fair, // jump/trick caps and counters (ticket 0180)
    hazard: (k, a, l) => RS.hz && RS.hz.debugPlace(k, a, l),
    // Balance harness (docs/BALANCE.md): hold the frame loop and run sim steps flat out.
    sim: (n, cb) => { simHeld = true; let i = 0; for (; i < n && GameState.status === 'PLAYING'; i++) { if (cb) cb(); snapshotView(); raceStep.updateGame(simClock.step); syncContactZ(); } return i; },
    release: () => { simHeld = false; lastFrameTime = 0; },
    save: () => SaveStore.data,
  };
  initSettings({ announce: triggerAnnouncement });
  // Steering-mode switch (ticket 0130): its own chunk, fetched right after startup.
  setTimeout(() => import('./steermode-ui.js').then(({ initSteerModes }) => {
    steerModes = initSteerModes({ announce: triggerAnnouncement, toggleTilt, recenterTilt, touch: () => touch });
  }).catch(() => {}), 0);
  setTimeout(loadGfx, 0);
  setTimeout(() => { loadResultsUi().catch(() => {}); loadMusic().catch(() => {}); }, 0);
  setTimeout(() => import('./home.js').then((m) => { home = m.createHome({
    state: GameState, save: SaveStore, goHome: showTitle, play: () => startNewRace(titleStart || { mode: 'INFINITE' }),
    daily: () => startNewRace({ daily: true }), garage: openGarageModal, ranks: () => openLeaderboard(), pause: openGarageModal,
    tv: () => { location.href = `${import.meta.env.BASE_URL}?tv`; }, leaveLive: () => live.leave(), touchActive: () => !!touch,
    bigScreen: !coarsePointer, road: LiveTraffic,
  }); }).catch(() => {}), 0);
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
// Only for modules main itself needs: one that only the race chunks use is imported there
// directly, or this object keeps it in the startup bundle (0223).
export const RACE_DEPS = {
  CAR_SPECS, CONTINUE, ENDLESS, ERAS, FIELD_SIZE, FLUX, GameState, InputState, LIVE, PACE_MODES,
  PICKUP, PICKUPS, POP_CULTURE_ROSTER, ROAD_CFG, SaveStore, SoundEngine, TRAFFIC_LATERAL,
  WORLD_LEVELS, addItem, addNos, addRoadSection, applyRunResult, beginRun, boostOutcome, canContinue,
  continueCost, createDrive, createGhostRecorder, createHitStop, createHud, createLateral,
  createNos, createOnboarding, createRaceClock, createSteer, createStorm,
  crossingTime, currentDifficulty, difficultyOf, endlessCash, endlessTuning, featureAt, finishBonus,
  generateNextTrackBiome, handlingFor, hasSetPieceBetween,
  impactVelocities, isNewPlayer, landingKeep, lapOf, loopStep,
  magnetPull, materialFor, missionsDone, mulberry32, nearMissChain, nosFill, nosFor, nosSpeed,
  ordinal, passiveFluxRate, pickMissions, pickupReach, pollGamepad,
  preloadBackdrops, raceLengthFor, recordEndless, recordMissions, recordRace, resetBackdrop,
  rivalTargetMph, rpmFor, runnerMult, setTrackIntensity, setTrackPowerups, stepDrive, stepLateral, stepNos,
  stepSetPieces, stepSteer, stepStorm, stormRespite, track, utcDay, wallContact, warpReady
};
