// Race flow (0176): starting a race (grid, lineup, lights, launch), finishing one (the flag, the
// results, the run record), the coach and the race HUD. Split off the race step (src/race-step.js)
// so the per-step simulation keeps headroom under its budget; a lazy chunk main fetches alongside
// it and hands over before any race starts. It reads the race step's state through its exports,
// and the race step calls back in through RF (set by useFlow), never a static import, so the
// bundler keeps them separate.
import {
  RACE_DEPS, DEBUG_MODE, LiveTraffic, RAI, RC, RS, activeCarParams, announcer, burstSparks,
  callouts, carPaint, ceremonyReady, drive, ghostRace, hideCoach, hudView, initTrack, lateral,
  live, loadGarageUI, loadShareUi, restoreSoloSettings, smoke2d, sparks, steerModes, syncAudioUI,
  syncModeButtons, syncRunnerUi, todaysDaily, touch, triggerAnnouncement, updateEraHud,
  withResults
} from './main.js';
import { createFair, fairPayload } from './fairplay.js';
// Only the race chunks use these, so they import them directly and never ship at startup (0223).
import { createPenaltyLog, penaltyPoints, breakdown, logPayload } from './scoring.js';
import { catchUpScale } from './fair-field.js';
import { wakeFrame } from './slipstream.js';
import { playHint } from './play-hints.js';
import { createPlaceCall } from './place-call.js';
import { stripMarks, createStripFan } from './strip-marks.js';
import {
  endlessSolo, nearMisses, cashAcc, earnCash, resetRunner, steerWheel, resetNos, showForkCue,
  ghostRecorder, dockDeskCoach
} from './race-step.js';
const {
  CAR_SPECS, ENDLESS, ERAS, FIELD_SIZE, FLUX, GameState, InputState, LIVE, POP_CULTURE_ROSTER,
  ROAD_CFG, SaveStore, SoundEngine, WORLD_LEVELS, applyRunResult, beginRun,
  createDrive, createHud, createLateral, createOnboarding, createRaceClock,
  finishBonus, isNewPlayer, lapOf, missionsDone, mulberry32, ordinal,
  pickMissions, preloadBackdrops, raceLengthFor, recordEndless, recordMissions, recordRace,
  resetBackdrop, utcDay
} = RACE_DEPS;

/** The control prompts for the input in hand right now (ticket 0007). */
export const hintNow = () => playHint(InputState.lastInput, InputState.boostKey);

// Slipstream cue (0197): main's speed lines call this once per frame for the wake's tint and lines.
RS.wake = (c, W, H) => wakeFrame(c, W, H, GameState, RS.fxClock);

// Coach (ticket 0002): teaches only what you haven't learned yet, in one short line, and
// always yields to the announcer so two messages never stack.
export const COACH_LESSON = { PINE_TREE_HAZARD: 'steer', LOW_LASER_BAR: 'jump', HIGH_LIGHT_GATE: 'slide', FLUX_CRATE: 'smash' };

export const COACH_LEARNED_AFTER = 2;

// Portrait phones (0228): the first-race thumb guide (body.tc-guiding) and the coach take turns.
// The coach waits while the guide is up; the GO tip it held back shows once after, for TIP_OWED_MS,
// if nothing else has the card within TIP_OWED_WITHIN ms of the guide going (it is a GO tip, not a
// mid-race one). 480 px is the ticket's line, narrower than the compact HUD's 599 px.
const phoneTall = typeof matchMedia === 'function' ? matchMedia('(max-width: 480px) and (orientation: portrait)') : null;
export const TIP_OWED_MS = 4000;
const TIP_OWED_WITHIN = 2000;
let tipOwed = false;
let tipUntil = 0;
let guideAt = 0;

export function updateInteractiveCoach(currentSegIdx) {
  const banner = document.getElementById('interactiveCoachBanner');
  if (!banner) return;
  // Settings → Coach tips off (0201) silences it for good; GOT IT only for this race.
  if (GameState.coachDismissed || SaveStore.data.settings.coach === false) { hideCoach(banner); return; }
  // A pending fork is the decision on screen; the coach waits until it's made (ticket 0019).
  if (GameState.forkPending) { RS.coachYieldUntil = performance.now() + 350; hideCoach(banner); return; }
  // Yield to the announcer, and wait for its fade-out so the two never cross-fade on top of
  // each other in the shared message lane (ticket 0021).
  const nowMs = performance.now();
  if (announcer.isVisible()) { RS.coachYieldUntil = nowMs + 350; hideCoach(banner); return; }
  if (nowMs < RS.coachYieldUntil) { hideCoach(banner); return; }
  // The guide's chunk loads after GO on a slow phone: while it is still due (touch, not yet seen,
  // early in the race) the coach waits for it too, so it never shows first and fades under it.
  const guideDue = document.body.classList.contains('tc-guiding') || (GameState.raceTime < 5 && GameState.mode !== 'LIVE'
    && SaveStore.data.controls && !SaveStore.data.controls.coachSeen && document.documentElement.classList.contains('touch-ui'));
  if (guideDue && phoneTall && phoneTall.matches) {
    if (GameState.distance < 300) tipOwed = true;
    guideAt = nowMs;
    hideCoach(banner);
    return;
  }
  if (tipOwed && nowMs - guideAt > TIP_OWED_WITHIN) tipOwed = false;

  // Nearest un-hit obstacle within ~2,800 Z-units that the player still needs coaching on.
  let foundObs = null;
  let bestDz = 999999;
  for (let i = 0; i < LiveTraffic.obstacles.length; i++) {
    const ob = LiveTraffic.obstacles[i];
    const lesson = COACH_LESSON[ob.type] || 'steer';
    if (GameState.lessonsCleared[lesson] >= COACH_LEARNED_AFTER && ob.type !== 'REPAIR_WRENCH') continue;
    const dz = ob.worldZ - (GameState.trackPos + ROAD_CFG.playerZOffset);
    if (ob.hitCount === 0 && dz > 150 && dz < 2800 && dz < bestDz) {
      bestDz = dz;
      foundObs = { item: ob };
    }
  }

  const iconEl = document.getElementById('coachIcon');
  const titleEl = document.getElementById('coachTitle');
  const descEl = document.getElementById('coachDesc');
  if (!iconEl || !titleEl || !descEl) return;

  if (foundObs || GameState.warpReady) tipUntil = 0; // another card took over: the owed tip is spent
  if (foundObs) {
    const t = foundObs.item.type;
    const open = foundObs.item.offset >= 0 ? '◀ LEFT' : 'RIGHT ▶';
    if (t === 'PINE_TREE_HAZARD') {
      iconEl.textContent = '🌲'; titleEl.textContent = 'TREE AHEAD';
      descEl.textContent = `Graze the gold ring for a slingshot — or go ${open}`;
    } else if (t === 'LOW_LASER_BAR') {
      iconEl.textContent = '🟠'; titleEl.textContent = 'LOW LASER';
      descEl.textContent = `Hop it (W / ▲ / swipe up) — or go ${open}`;
    } else if (t === 'HIGH_LIGHT_GATE') {
      iconEl.textContent = '🔵'; titleEl.textContent = 'HIGH GATE';
      descEl.textContent = `Hold drift to duck (S / ▼ / swipe down) — or go ${open}`;
    } else if (t === 'FLUX_CRATE') {
      iconEl.textContent = '📦'; titleEl.textContent = 'FLUX CRATE';
      descEl.textContent = 'Smash straight through it for flux + HP';
    } else if (t === 'REPAIR_WRENCH') {
      if (GameState.hp >= GameState.maxHp) { hideCoach(banner); return; }
      iconEl.textContent = '🔧'; titleEl.textContent = 'REPAIR';
      descEl.textContent = `Grab the wrench (${foundObs.item.offset < 0 ? 'left' : (foundObs.item.offset > 0 ? 'right' : 'center')}) for +25 HP`;
    } else {
      iconEl.textContent = '⚡'; titleEl.textContent = 'BARRIER';
      descEl.textContent = `Go ${open}, jump it, or boost-smash it`;
    }
  } else if (GameState.warpReady && GameState.timeWarps === 0) {
    iconEl.textContent = '⚡'; titleEl.textContent = 'FLUX FULL';
    descEl.textContent = hintNow().coachFlux;
  } else if (GameState.distance < 300 || tipOwed || nowMs < tipUntil) { // just after the green light
    if (tipOwed) { tipOwed = false; tipUntil = nowMs + TIP_OWED_MS; }
    iconEl.textContent = '🎓'; titleEl.textContent = 'TIP';
    descEl.textContent = 'Draft the green wake behind rivals for a slingshot';
  } else {
    hideCoach(banner);
    return;
  }
  if (!document.body.classList.contains('coach-up')) dockDeskCoach(banner);
  banner.style.opacity = '1';
  banner.style.pointerEvents = '';
  document.body.classList.add('coach-up');
}

// Race HUD (ticket 0051): one reused view object, repainted ~20 times a second.
export let raceHud = null;

export let hudNextAt = 0;
// Place changes for screen readers (0030): #hudPlaceCall, a visually hidden polite live line.
const placeCall = createPlaceCall({
  now: () => performance.now(),
  write(text) { const el = document.getElementById('hudPlaceCall'); if (el) el.textContent = text; },
});
const phonePortrait = typeof matchMedia === 'function' ? matchMedia('(max-width: 599px) and (orientation: portrait)') : null;

export function updateRaceHud(force) {
  const now = performance.now();
  if (!force && now < hudNextAt) return;
  hudNextAt = now + 50;
  if (!raceHud) raceHud = createHud(document, stripMarks, createStripFan());
  hudView.position = GameState.racePosition;
  hudView.total = GameState.totalRacers;
  hudView.progress = GameState.distance;
  hudView.length = GameState.raceLength || raceLengthFor(GameState.levelIndex);
  hudView.raceTime = GameState.finishTime != null ? GameState.finishTime : GameState.raceTime;
  hudView.timeLeft = GameState.timeLeft;
  hudView.clockUrgent = GameState.finalStretch || GameState.timeLeft < 10;
  hudView.infinite = GameState.mode === 'INFINITE';
  hudView.compact = Boolean(phonePortrait && phonePortrait.matches); // the phone-portrait HUD layout in styles.css (0190)
  hudView.mph = GameState.speed;
  hudView.flux = GameState.fluxCharge;
  hudView.ready = Boolean(GameState.warpReady);
  hudView.nos = GameState.nosFill || 0;
  hudView.nosOn = Boolean(GameState.nosBurning);
  hudView.hpFrac = GameState.maxHp ? GameState.hp / GameState.maxHp : 1;
  hudView.hp = GameState.hp;
  hudView.maxHp = GameState.maxHp;
  hudView.tier = GameState.tier;
  hudView.score = GameState.score;
  raceHud.update(hudView);
  placeCall.update(hudView.position, hudView.total, GameState.racePhase === 'RACING' && GameState.status === 'PLAYING');
  if (ghostRace.active) ghostRace.update(hudView.raceTime, GameState.distance, GameState.speed, hudView.length);
}

export function updateLiveHud(forceHud) {
  if (GameState.racePhase === 'START' && GameState.status === 'PLAYING') { updateRaceHud(forceHud === true); return; } // no tips over the lineup
  const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  updateInteractiveCoach(currentSegIdx);
  if (GameState.status === 'PLAYING') updateOnboarding();
  updateRaceHud(forceHud === true);

  const hpText = document.getElementById('hpTextDisplay');
  const hpFill = document.getElementById('hpBarFill');
  const waveEl = document.getElementById('waveTierDisplay');
  if (hpText) hpText.textContent = `${Math.ceil(GameState.hp)}/${GameState.maxHp}`;
  if (hpFill) {
    const hpPct = Math.max(0, Math.min(100, (GameState.hp / GameState.maxHp) * 100));
    hpFill.style.width = `${hpPct}%`;
    hpFill.className = hpPct > 50
      ? 'h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-150'
      : (hpPct > 25 ? 'h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-150' : 'h-full bg-red-500 transition-all duration-150');
  }
  if (waveEl) waveEl.textContent = GameState.mode === 'INFINITE' ? `T${GameState.tier}` : `W${GameState.waveTier}`;
  const streakEl = document.getElementById('streakMultDisplay');
  const distEl = document.getElementById('distMetersDisplay');
  if (streakEl) {
    streakEl.textContent = `🌲${GameState.dodgeStreak} • x${GameState.combo}`;
  }
  if (distEl) {
    distEl.textContent = `${Math.floor(GameState.distance)}m`;
  }
  const speedEl = document.getElementById('speedDisplay');
  const gearEl = document.getElementById('gearDisplay');
  const rpmFill = document.getElementById('rpmBarFill');
  const scoreEl = document.getElementById('scoreDisplay');
  const timerEl = document.getElementById('timerDisplay');
  const coinsEl = document.getElementById('coinsDisplay');
  const posEl = document.getElementById('racePosDisplay');
  const tdEl = document.getElementById('takedownsDisplay');
  const heatEl = document.getElementById('heatBadge');
  const centerPanel = document.getElementById('centerHudPanel');
  const fluxFill = document.getElementById('fluxBarFill');
  const fluxPct = document.getElementById('fluxPctText');
  const draftFill = document.getElementById('draftBarFill');
  const draftLbl = document.getElementById('driftDraftLabel');
  const chargesEl = document.getElementById('specialChargesText');
  const fluxHint = document.getElementById('fluxReadyHint');
  const hoverDot = document.getElementById('hoverStatusDot');
  const comboPill = document.getElementById('comboPill');

  const mph = Math.round(GameState.speed);
  if (speedEl) {
    speedEl.textContent = mph < 10 ? `0${mph}` : `${mph}`;
    speedEl.className = mph >= 88
      ? 'font-arcade text-lg sm:text-2xl font-black led-cyan'
      : 'font-arcade text-lg sm:text-2xl font-black led-red';
  }
  if (gearEl) gearEl.textContent = mph >= 88 ? 'OD•88' : `G${GameState.gear}`;
  if (rpmFill) rpmFill.style.width = `${Math.round(GameState.rpm)}%`;
  if (scoreEl) scoreEl.textContent = String(GameState.score).padStart(6, '0');
  if (timerEl) {
    timerEl.textContent = GameState.mode === 'INFINITE' ? '∞' : GameState.mode === 'LIVE' ? live.clockText() : `${Math.ceil(GameState.timeLeft)}`;
    timerEl.classList.toggle('timer-urgent', GameState.mode === 'ARCADE' && (GameState.finalStretch || GameState.timeLeft < 10));
  }
  if (coinsEl) coinsEl.textContent = `${SaveStore.data.fluxCoins}`;
  if (posEl) posEl.textContent = `${GameState.racePosition}/${GameState.totalRacers}`;
  if (tdEl) tdEl.textContent = `${GameState.takedowns} 💥`;
  if (heatEl) heatEl.textContent = `🔥 HEAT ${GameState.heatLevel}`;
  if (centerPanel) {
    centerPanel.classList.toggle('siren-active', GameState.heatLevel >= 3);
  }
  if (fluxFill) fluxFill.style.width = `${Math.round(GameState.fluxCharge)}%`;
  if (fluxPct) fluxPct.textContent = `${Math.round(GameState.fluxCharge)}%`;

  const draftOrDriftPct = GameState.isDrifting
    ? Math.min(100, (GameState.driftChargeTime / 2.2) * 100)
    : GameState.draftCharge;
  if (draftFill) draftFill.style.width = `${Math.round(draftOrDriftPct)}%`;
  if (draftLbl) {
    draftLbl.textContent = GameState.draftingCar
      ? '💨 SLIPSTREAM WAKE!'
      : (GameState.isDrifting ? `🔥 DRIFT TIER ${GameState.driftTier}` : 'SLIPSTREAM / DRIFT');
  }
  if (chargesEl) chargesEl.textContent = `⚡x${GameState.specialCharges}`;

  if (fluxHint) {
    if (GameState.zoneTimer > 0) {
      fluxHint.textContent = '🟢 ZONE BULLET-TIME ACTIVE!';
      fluxHint.className = 'text-[7px] font-arcade text-emerald-300 font-bold truncate';
    } else if (GameState.agroTimer > 0) {
      fluxHint.textContent = '🔴 AGRO RAM SHIELD ACTIVE!';
      fluxHint.className = 'text-[7px] font-arcade text-orange-300 font-bold truncate';
    } else if (GameState.warpReady) {
      fluxHint.textContent = hintNow().flux;
      fluxHint.className = 'text-[7px] font-arcade text-yellow-300 font-bold truncate';
    } else {
      fluxHint.textContent = 'DRIFT, DRAFT & SLAM RIVALS!';
      fluxHint.className = 'text-[7px] font-arcade text-slate-400 truncate';
    }
  }
  if (hoverDot) {
    hoverDot.textContent = GameState.twoWheelTimer > 0
      ? '📐 2-WHEEL'
      : ((GameState.hoverActiveTimer > 0 || GameState.playerY > 20) ? '🛸 HOVER' : '🛞 STREET');
  }
  if (comboPill) comboPill.textContent = `x${GameState.combo}`;
}

/** Cars a race just unlocked: the full-screen reveal lands just after the results, so the score is seen first. */
export function carNamesFor(ids) {
  if (ids.length) setTimeout(() => loadGarageUI().then((ui) => ui.queueReveals(ids)), 1100);
  return ids.map((id) => (POP_CULTURE_ROSTER.find((c) => c.id === id) || {}).car).filter(Boolean);
}

export function setSteerHint(on) {
  const el = document.getElementById('steerHint');
  if (el) el.classList.toggle('hidden', !on);
}

export function updateOnboarding() {
  if (InputState.left || InputState.right || Math.abs(InputState.touchSteerVal) > 0.2 || Math.abs(GameState.playerVX) > 0.6) RS.onboarding.steer();
  setSteerHint(SaveStore.data.settings.coach !== false && RS.onboarding.hint(performance.now()) === 'steer');
}

export function applyDailyModifier(id) {
  if (id === 'HEAT_WAVE') GameState.heatLevel += 2;
  else if (id === 'GLASS_CHASSIS') { GameState.maxHp = Math.round(GameState.maxHp / 2); GameState.hp = GameState.maxHp; }
  else if (id === 'FLUX_STORM') GameState.fluxCharge = Math.max(GameState.fluxCharge, 60);
  else if (id === 'RUSH_HOUR') GameState.trafficGapScale = 0.66;
}

// --- START / END / PAUSE FLOWS ---
export function startNewRace(opts) {
  SoundEngine.init();
  SoundEngine.startMusicLoop();

  // A daily run (ticket 0023) borrows today's level and rules without touching your
  // campaign selection; any other start (button, Enter, tap) is a normal race.
  const daily = opts && opts.daily ? todaysDaily() : null;
  const liveRace = opts && opts.live ? opts.live : null;
  if (opts && (opts.mode === 'INFINITE' || opts.mode === 'ARCADE') && !daily && !liveRace) {
    if (GameState.savedLevelIndex !== undefined) restoreSoloSettings();
    GameState.mode = opts.mode;
    syncModeButtons();
  }
  GameState.daily = daily;
  if (liveRace) {
    // Live race (sprint 3): the room picks the road, the seed and one shared pace.
    if (GameState.savedLevelIndex === undefined) {
      GameState.savedLevelIndex = GameState.levelIndex;
      GameState.savedMode = GameState.mode;
      GameState.savedPace = GameState.paceMode;
    }
    GameState.levelIndex = liveRace.level;
    GameState.mode = 'LIVE';
    GameState.paceMode = LIVE.pace;
  } else if (daily) {
    if (GameState.savedLevelIndex === undefined) {
      GameState.savedLevelIndex = GameState.levelIndex;
      GameState.savedMode = GameState.mode;
    }
    GameState.levelIndex = daily.levelIndex;
    GameState.mode = 'ARCADE';
  } else if (GameState.savedLevelIndex !== undefined) {
    restoreSoloSettings();
  }
  RS.trafficRand = liveRace ? mulberry32(liveRace.seed) : daily ? mulberry32(daily.seed) : Math.random;
  // The racing line (sprint 4) is shared by everyone on a seeded race (live rooms, dailies).
  GameState.lineSeed = liveRace ? liveRace.seed : daily ? daily.seed : (1 + Math.random() * 2147483646) | 0;
  // Missions (0026) draw from their own stream so they never shift the seeded traffic.
  GameState.missions = pickMissions(liveRace || daily ? mulberry32(GameState.lineSeed ^ 0x5eed) : Math.random);
  cashAcc.milli = 0;
  // Endless missions pay the Endless cash rate too, in round numbers (docs/BALANCE.md).
  if (endlessSolo()) for (const m of GameState.missions) m.reward = Math.max(10, Math.round((m.reward * ENDLESS.cash) / 5) * 5);
  GameState.trafficGapScale = 1;
  // Settings → RIVALS (0211): how hard the rubber band pulls this race; rooms and dailies ignore it.
  GameState.catchUp = catchUpScale(SaveStore.data.settings && SaveStore.data.settings.rivals, { mode: liveRace ? 'LIVE' : GameState.mode, daily });

  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];

  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  GameState.status = 'PLAYING';
  GameState.eraIndex = lvl.startEra;
  resetBackdrop();
  preloadBackdrops(ERAS[lvl.startEra].id);
  GameState.maxHp = activeCarParams().maxHp;
  GameState.hp = GameState.maxHp;
  GameState.invulnTimer = 0;
  GameState.waveTier = 1;
  GameState.tier = 1;
  GameState.difficulty = 0;
  GameState.coinMult = 1;
  GameState.wrecks = 0;
  GameState.hpLowWarned = false;
  GameState.isDuckSliding = false;
  GameState.score = 0;
  GameState.penaltyLog = createPenaltyLog();
  RS.fair = createFair(); // jump/trick/juke rules and the run's fair-play counters (0180)
  GameState.runCoins = 0;
  GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0;
  GameState.timeWarps = 0;
  GameState.takedowns = 0;
  GameState.heatLevel = lvl.startingHeat;
  GameState.heatProgress = 0;
  GameState.racePosition = 8;
  RS.raceClock = createRaceClock({ levelIndex: lvl.index });
  GameState.timeLeft = RS.raceClock.timeLeft;
  GameState.finalStretch = false;
  GameState.distance = 0;
  GameState.raceTime = 0;
  GameState.finishTime = null;
  GameState.raceLength = liveRace ? liveRace.length : GameState.mode === 'INFINITE' ? 0 : raceLengthFor(lvl.index);
  GameState.trackPos = 0;
  GameState.playerX = 0;
  GameState.playerVX = 0;
  steerWheel.value = 0;
  Object.assign(lateral, createLateral(0));
  Object.assign(drive, createDrive());
  GameState.chassisRoll = 0; GameState.chassisRollVel = 0;
  GameState.carYaw = 0;
  resetNos();
  GameState.playerY = 0;
  GameState.playerVY = 0;
  GameState.speed = 26;
  GameState.peakSpeed = 42;
  GameState.fluxCharge = FLUX.start;
  GameState.warpReady = false; // set by the race step (0112); stale from the last race until then
  GameState.sinceWarp = FLUX.warpCooldown;
  GameState.warpFxTimer = 0;
  sparks.clear();
  if (smoke2d) smoke2d.clear();
  nearMisses.reset();
  GameState.draftCharge = 0;
  GameState.draftingCar = null;
  GameState.specialCharges = 3;
  GameState.zoneTimer = 0;
  GameState.agroTimer = 0;
  GameState.twoWheelTimer = 0;
  GameState.warpActiveTimer = 0;
  GameState.hoverActiveTimer = 0;
  GameState.flyingWrecks = [];
  GameState.branchName = lvl.name;
  GameState.forkPending = false; // a fork left mid-race must not pay out (or mute the coach) next race
  showForkCue('OFF');

  const branchBadge = document.getElementById('trackBranchBadge');
  if (branchBadge) branchBadge.textContent = lvl.name;

  initTrack();
  resetRunner();
  if (liveRace) {
    // Your rivals are the room (friends + CPU cars from src/live/), not local AI.
    LiveTraffic.racers = [];
    LiveTraffic.updateStandings(0, GameState.trackPos + ROAD_CFG.playerZOffset, LiveTraffic.speedToWorld());
  }
  syncAudioUI();
  updateEraHud();
  if (raceHud) raceHud.reset();
  placeCall.reset();
  updateLiveHud(true);

  document.getElementById('titleScreen').classList.add('hidden');
  document.body.classList.remove('on-title');
  document.getElementById('startModal').classList.add('hidden');
  document.getElementById('garageModal').classList.add('hidden');
  document.getElementById('gameOverModal').classList.add('hidden');

  RS.onboarding = createOnboarding({ newPlayer: isNewPlayer(SaveStore.data) });
  // The attract-mode coach must not linger into the race under the level intro.
  const coachBanner = document.getElementById('interactiveCoachBanner');
  if (coachBanner) hideCoach(coachBanner);
  RS.coachYieldUntil = performance.now() + 350;
  tipOwed = false;
  tipUntil = 0;
  document.getElementById('leaderboardModal').classList.add('hidden');
  GameState.autoGas = SaveStore.data.controls.autoAccel !== false;
  if (touch) touch.raceStart();
  if (steerModes) steerModes.raceStart();

  if (daily) applyDailyModifier(daily.modifier.id);
  ghostRecorder.reset();
  const ghostFor = RS.pendingGhost && !daily && !liveRace && RS.pendingGhost.level === lvl.index ? RS.pendingGhost.data : null;
  RS.pendingGhost = null;
  if (!(ghostFor && ghostRace.load(ghostFor, GameState.raceLength || raceLengthFor(lvl.index)))) ghostRace.clear();
  if (liveRace) { // live races don't post to the solo leaderboard, and the room runs its own countdown
    RS.currentRun = null;
    beginRaceStart(lvl, { ceremony: false });
    return;
  }
  RS.currentRun = {
    tokenPromise: beginRun(), t0: performance.now(), level: lvl.index, online: navigator.onLine !== false,
    mode: daily ? 'DAILY' : (GameState.mode === 'INFINITE' ? 'INFINITE' : 'ARCADE'),
  };

  // Lineup + lights (ticket 0052). ?debug skips them unless asked (?debug&intro or
  // startRace({ intro: true })) so tests can race at once.
  const ceremony = !(opts && opts.quick) && (!DEBUG_MODE || (opts && opts.intro) || new URLSearchParams(location.search).has('intro'));
  if (ceremony && !RC) { // tapped PLAY before the ceremony chunk arrived: hold on the grid for it
    GameState.racePhase = 'START';
    GameState.speed = 0;
    RS.startSeq = null;
    const race = RS.currentRun;
    ceremonyReady.then(() => { if (RS.currentRun === race && GameState.status === 'PLAYING') beginRaceStart(lvl, { ceremony: true }); });
  } else beginRaceStart(lvl, { ceremony });
  if (!ceremony) {
    if (daily) triggerAnnouncement(`📅 DAILY: ${daily.modifier.name}`, daily.modifier.desc.toUpperCase(), 2300);
    else if (ghostRace.active) triggerAnnouncement(`👻 BEAT ${ghostRace.initials}'S GHOST`, `${lvl.name.replace(/^LVL \d+:\s*/, '')} · THEIR BEST LINE, LIVE ON YOUR STRIP`, 2300);
    else triggerAnnouncement(`🏁 ${lvl.name} 🏁`, `GOAL: ${lvl.goalDesc.toUpperCase()}`, 2300);
  }
}

export const lineupSeen = new Set();

/** The grid front to back: rivals in slot order, then you. */
export function gridOrder() {
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const spec = CAR_SPECS[me.id];
  return LiveTraffic.racers.map((r) => ({ driver: r.driver, short: r.short, car: r.car, crew: r.crew, color: r.color, accent: r.accent, shape: r.shape, bodyColor: r.bodyColor, accentColor: r.accentColor, underglow: r.underglow }))
    .concat([{ isPlayer: true, driver: me.driver, short: 'YOU', car: me.car, crew: me.franchise, color: SaveStore.data.underglow || me.glow, accent: me.body,
      look: myCarLook(), cls: spec ? spec.cls : '', specLine: spec ? specLine(spec.stats) : '' }]);
}

/** Your car's look for the race stage and results: its shape in your garage paint. */
export function myCarLook() {
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  return { shape: me.shape, ...carPaint(me), glow: SaveStore.data.underglow || me.glow };
}

export const specLine = (st) => `SPD ${st.speed} · ACC ${st.accel} · GRIP ${st.grip} · ARMOR ${st.armor}`;

export function beginRaceStart(lvl, { ceremony }) {
  GameState.lapSplits = [];
  RS.lapStartedAt = 0;
  RS.lapNow = 1;
  RS.launchPressAt = null;
  // A press from the menus or while the ceremony chunk loaded is not a launch (0111): the pad's
  // boost must be released and pressed again, and a stale Space is dropped.
  RS.gpBoost = true;
  InputState.boostPressed = false;
  RS.launchJudged = false;
  RS.skipRequested = false;
  GameState.launchStall = 0;
  if (callouts) callouts.reset(GameState.racePosition);
  if (!ceremony || !RC) { GameState.racePhase = 'RACING'; RS.startSeq = null; if (RC) RC.stage.hide(); RS.onboarding.start(performance.now()); return; }
  const key = `${GameState.mode}:${lvl.index}:${GameState.daily ? 'd' : ''}`;
  // The lineup plays once per track, ever (remembered on this device), so coming back for
  // another go is lights-and-race in under 3 s instead of a 9 s ceremony every visit.
  const saved = Array.isArray(SaveStore.data.lineupsSeen) ? SaveStore.data.lineupsSeen : [];
  const lineup = !lineupSeen.has(key) && !saved.includes(key);
  lineupSeen.add(key);
  if (lineup) { SaveStore.data.lineupsSeen = saved.concat(key).slice(-24); SaveStore.save(); }
  GameState.racePhase = 'START';
  GameState.speed = 0;
  RS.startSeq = RC.createStartSequence({ racers: FIELD_SIZE, lineup });
  SoundEngine.playStartUp(); // engines fire up on the grid (a recorded start-up, when loaded)
  RC.stage.show();
  if (!lineup) RC.stage.grid(gridOrder());
}

export function applyLaunch(result) {
  RS.launchJudged = true;
  const fx = result && RC.LAUNCH_EFFECT[result];
  if (!fx) return;
  GameState.speed += fx.mph;
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + fx.flux);
  GameState.launchStall = fx.stall;
  GameState.launchResult = result;
  triggerAnnouncement(fx.text, result === 'early' ? 'WAIT FOR GREEN NEXT TIME' : `+${fx.mph} MPH OFF THE LINE`, 1400, 2);
  if (result === 'perfect') { SoundEngine.playTone(660, 'sawtooth', 0.25, 0.14, 1320); burstSparks(18, 190, 1); }
}

export const startHooks = {
  field: () => gridOrder(),
  announceLevel() {
    const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
    triggerAnnouncement(GameState.daily ? `📅 DAILY: ${GameState.daily.modifier.name}` : `🏁 ${lvl.name} 🏁`, '', 2400, 1); // the rocket-start prompt lives in the lights card only (0111)
  },
  go() {
    GameState.racePhase = 'RACING';
    GameState.speed = 26;
    if (RS.launchPressAt != null) applyLaunch(RC.judgeLaunch(RS.launchPressAt));
    RS.onboarding.start(performance.now());
  },
};

export const handleStartEvents = (events, dt) => RC.playStartEvents(events, startHooks, dt);

export function updateRaceStart(rawDt) {
  if (RS.startSeq.inLineup && (RS.skipRequested || InputState.boostPressed)) {
    InputState.boostPressed = false;
    RS.skipRequested = false;
    if (RS.startSeq.skip()) { RC.stage.grid(gridOrder()); SoundEngine.playTone(520, 'triangle', 0.08, 0.08); }
  }
  RS.skipRequested = false;
  if (InputState.boostPressed) { // a tap on ⚡ during the lights: judged at GO
    InputState.boostPressed = false;
    if (RS.launchPressAt == null && !RS.startSeq.inLineup) RS.launchPressAt = RS.startSeq.t + rawDt;
  }
  GameState.speed = 0;
  handleStartEvents(RS.startSeq.update(rawDt), rawDt);
}

/** After GO: the late rocket-start window, the GO! hold, live callouts, the finish roll-out. */
export function updateRaceCeremony(rawDt) {
  if (RS.startSeq && !RS.startSeq.done) {
    if (!RS.launchJudged && InputState.boostPressed && RS.startSeq.t <= RC.LAUNCH.goodEnd) {
      InputState.boostPressed = false;
      applyLaunch(RC.judgeLaunch(RS.startSeq.t));
    }
    handleStartEvents(RS.startSeq.update(rawDt), rawDt);
  }
  if (GameState.launchStall > 0) {
    GameState.launchStall -= rawDt;
    GameState.speed = Math.min(GameState.speed, 6);
  }
  if (GameState.racePhase === 'RACING') {
    const lap = GameState.raceLength ? lapOf(GameState.distance, GameState.raceLength).lap : 1;
    if (lap > RS.lapNow) { GameState.lapSplits.push(GameState.raceTime - RS.lapStartedAt); RS.lapStartedAt = GameState.raceTime; RS.lapNow = lap; if (touch) touch.controls.haptics.pulse('lap'); }
    const c = callouts ? callouts.update(rawDt, GameState.racePosition, lap) : null;
    // Who got you and how, and the nemesis intro (ticket 0160, src/rival-ai.js).
    const nc = RAI && LiveTraffic.aiWorld && RAI.raceCalls(LiveTraffic.aiWorld, LiveTraffic, c);
    if (nc) triggerAnnouncement(nc[0], nc[1], 1600, 2);
    if (c) {
      triggerAnnouncement(c.main, c.sub, 1500, c.kind === 'final' ? 3 : 2);
      if (c.kind === 'final') { RC.say('Final lap!'); SoundEngine.playTone(784, 'square', 0.3, 0.14, 1046); }
      else if (c.kind === 'up') SoundEngine.playTone(660, 'triangle', 0.14, 0.12, 880);
    }
  } else if (GameState.racePhase === 'FINISHED') {
    GameState.invulnTimer = 1;
    RS.finishSeqLeft -= rawDt;
    if (RS.finishSeqLeft <= 0) { if (RC) RC.stage.hide(); endRaceRun('🏁 FINISH!'); }
  }
}

/** You crossed the line (ticket 0051): a bonus for where you finished, then the results. */
export function finishRace() {
  if (GameState.mode === 'LIVE') { live.finished(); return; } // the room ranks live races
  let ahead = 0;
  for (const r of LiveTraffic.racers) if (r.finishTime != null && r.finishTime < GameState.finishTime) ahead++;
  GameState.racePosition = ahead + 1;
  GameState.score += finishBonus(GameState.racePosition);
  RS.finishScore = GameState.score;
  GameState.lapSplits.push(GameState.finishTime - RS.lapStartedAt);
  // Chequered flag (ticket 0052): your place, a fanfare, and a short roll-out while the rest
  // of the field crosses, then the results.
  GameState.racePhase = 'FINISHED';
  RS.finishSeqLeft = GameState.reducedMotion ? 1.4 : 2.8;
  const place = GameState.racePosition;
  if (!RC) { RS.finishSeqLeft = 0; return; }
  RC.stage.finish(ordinal(place), place === 1 ? 'YOU WIN!' : place <= 3 ? 'PODIUM!' : 'FINISHED');
  RC.fanfare(place);
  RC.say(place === 1 ? 'You win!' : `You finished ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][place - 1] || ordinal(place)}!`);
}

/** Finish order for the whole field, a headline for how it went, Retry / Next (ticket 0052). */
export function renderRaceResults(badgeText, lvl) {
  if (!RC) return; // the ceremony chunk never loaded: plain results
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  RC.renderResults({
    badgeText, lvl, next: WORLD_LEVELS[lvl.index + 1], racers: LiveTraffic.racers, speedToWorld: LiveTraffic.speedToWorld(),
    playerZ: GameState.trackPos + ROAD_CFG.playerZOffset, me, myLook: myCarLook(), color: SaveStore.data.underglow || me.glow,
    unlockedLevel: SaveStore.data.unlockedLevel || 1, fieldSize: FIELD_SIZE,
  });
  // Share card + a friend's challenge verdict (ticket 0053), from the lazy share chunk.
  loadShareUi().then((m) => m.onResults(lvl.index)).catch(() => {});
}

export function endRaceRun(customBadgeText = null) {
  GameState.status = 'GAMEOVER';
  const badgeEl = document.getElementById('endModalBadge');
  if (badgeEl) {
    badgeEl.textContent = customBadgeText || 'EVENT COMPLETE!';
  }
  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
  // Penalties (ticket 0073) were charged live; the final score never goes below zero.
  const penLog = GameState.penaltyLog || createPenaltyLog();
  const scoreSheet = breakdown(Math.round(GameState.score) + penaltyPoints(penLog), penLog);
  GameState.score = scoreSheet.final;
  if (GameState.racePosition <= 3) {
    const bonus = earnCash(lvl.bonusReward);
    GameState.runCoins += bonus;
    SaveStore.data.fluxCoins += bonus;
  }
  if (GameState.score > SaveStore.data.bestScore) {
    SaveStore.data.bestScore = GameState.score;
  }
  // Endless Highway (ticket 0150): distance and tier are the run's story; keep the bests.
  if (GameState.mode === 'INFINITE' && !GameState.daily) {
    const rec = recordEndless(SaveStore.data, GameState.distance, GameState.tier);
    GameState.endlessResult = { distance: Math.round(GameState.distance), tier: GameState.tier, best: rec.best, bestTier: rec.bestTier, isBest: rec.isBest };
  } else GameState.endlessResult = null;
  GameState.stormWarn = 0;
  SaveStore.data.onboarded = true;
  setSteerHint(false);
  // Daily runs count for the daily board, not the campaign ladder (their rules differ).
  const result = GameState.daily ? null : applyRunResult(SaveStore.data, { levelIndex: lvl.index, levelId: lvl.id, score: GameState.score }, WORLD_LEVELS.length);
  // Career counters and car unlocks (ticket 0071): every rival you finish ahead of counts.
  const newCars = recordRace(SaveStore.data, {
    position: GameState.racePosition,
    takedowns: GameState.takedowns,
    warps: GameState.timeWarps,
    rivalsBeaten: Math.max(0, (GameState.totalRacers || 1) - GameState.racePosition),
    daily: Boolean(GameState.daily),
    day: utcDay(Date.now()),
  });
  recordMissions(SaveStore.data, utcDay(Date.now()), missionsDone(GameState.missions));
  SaveStore.save();
  const newCarNames = carNamesFor(newCars);
  if (RS.currentRun) {
    RS.currentRun.score = scoreSheet.final;
    RS.currentRun.earned = scoreSheet.earned;
    RS.currentRun.pen = logPayload(penLog);
    RS.currentRun.fp = fairPayload(RS.fair); // payload v4 (0180)
    RS.currentRun.distance = Math.max(0, Math.round(GameState.distance));
    RS.currentRun.durationMs = Math.round(performance.now() - RS.currentRun.t0);
    RS.currentRun.warps = GameState.timeWarps;
    RS.currentRun.car = (POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0]).id;
    // A ghost only makes sense for a finished three-lap race on a campaign track.
    RS.currentRun.trace = RS.currentRun.mode === 'ARCADE' && GameState.finishTime != null ? ghostRecorder.encode() : undefined;
  }
  syncRunnerUi(true); // the results' goal list and the title line (ticket 0151)
  const verdict = ghostRace.verdict(GameState.finishTime);
  renderRaceResults(customBadgeText, lvl);
  const ghostInitials = ghostRace.initials;
  // Values read late by showResults are safe: no new race starts until this modal is up.
  withResults((ui) => ui.showResults({ lvl, result, newCarNames, verdict, ghostInitials, scoreSheet }), () => {
    document.getElementById('endScoreText').textContent = GameState.score.toLocaleString();
    document.getElementById('gameOverModal').classList.remove('hidden');
  });
}

/** LiveTraffic's race-time methods: main.js keeps its data fields and assigns these on load. */
