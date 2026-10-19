// The race step (bundle split, 0170): everything that only runs while a race is on — the
// per-step simulation (updateGame) and the helpers only it calls. A lazy chunk: main.js starts
// loading it at boot and every race start waits for it, so the title paints sooner and nothing
// in a race ever waits. It reads main's state through main.js's exports; anything both sides
// write lives on the shared RS object.
import {
  RACE_DEPS, DEBUG_MODE, JarvisAI, LiveTraffic, RAI, RC, RS, activeCarParams,
  advanceContractProgress, aiRoad, announcer, burstSparks, callouts, carPaint, ceremonyReady,
  coarsePointer, drive, gfxQ, ghostRace, hideCoach, hudView, initTrack, lateral, live,
  loadGarageUI, loadRunnerUi, loadShareUi, pickupArt, restoreSoloSettings, runStats, runnerMod,
  smoke2d, sparks, steerModes, storm, syncAudioUI, syncModeButtons, syncRunnerUi, todaysDaily,
  touch, triggerAnnouncement, updateEraHud, view3d, withResults
} from './main.js';
// What main imported from shared modules, handed over as one object: importing them from
// those modules (or as re-exports) would make the bundler split them into extra startup chunks.
const {
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
} = RACE_DEPS;
import { POWER, createPower, resetPower, activatePower, stepPower, powerOn, useShield, cashMult, ensurePower } from './powerups.js';

export const hitStop = createHitStop();

// Runner power-ups (0177, src/powerups.js): this run's timers. Renderers read GameState.power.
export const power = createPower();
GameState.power = power;
const endlessSolo = () => GameState.mode === 'INFINITE' && !GameState.daily;

/** A crash while the shield is up: the shield takes it (no HP, speed or points lost). */
export function shieldBreak(rel) {
  if (!useShield(power)) return false;
  GameState.invulnTimer = Math.max(GameState.invulnTimer, 1.0);
  runStats.shieldSaves++;
  if (!SoundEngine.sample('debris', 1.4, 0.9)) SoundEngine.playCrash();
  SoundEngine.sample('zone', 1.6, 0.7);
  if (touch) touch.controls.haptics.pulse('hit');
  if (pickupArt) pickupArt.burst('SHIELD', rel);
  GameState.screenShake = Math.max(GameState.screenShake, 0.18);
  GameState.hitShockwaves.push({ x: rel * 150, y: 0, radius: 18, maxRadius: 150, color: POWER.SHIELD.color, label: '🛡️ SHIELD SAVED YOU!', life: 0.7, maxLife: 0.7 });
  triggerAnnouncement('🛡️ SHIELD SAVED YOU!', 'NO DAMAGE · GRAB ANOTHER TO STAY SAFE', 1200);
  return true;
}

export const nearMisses = nearMissChain();

/** An obstacle or prop knocked out of the spot the planner put it in (by rivals, traffic, chains). */
export function isDebris(b) {
  return Math.abs(b.offset - b.homeOffset) > 0.06 || Math.abs(b.worldZ - b.homeZ) > 160;
}

// --- 2026 3D ANIMATED POWER-UP ACQUISITION & OBSTACLE IMPACT FX ---
// Penalty scoring (ticket 0073): every hit and wall scrape costs points, shown as a red
// popup by the score; the run log lets the server recompute the exact total.
export const penaltyPopup = { pts: 0, label: '', until: 0, drawn: 0 };

export function chargePenalty(pts, label) {
  if (!pts) return;
  RS.penaltyThisStep = true;
  GameState.score -= pts;
  if (touch) touch.controls.haptics.pulse('hit');
  const now = performance.now();
  if (now > penaltyPopup.until || penaltyPopup.label !== label) penaltyPopup.pts = 0;
  penaltyPopup.pts += pts;
  penaltyPopup.label = label;
  penaltyPopup.until = now + 900;
  // Wall scrapes charge every step; repaint the popup at most ~10x a second.
  if (now - penaltyPopup.drawn < 100 && penaltyPopup.pts !== pts) return;
  penaltyPopup.drawn = now;
  const el = document.getElementById('hudPenalty');
  if (!el) return;
  el.textContent = `−${penaltyPopup.pts.toLocaleString()} ${label}`;
  el.classList.remove('show');
  void el.offsetWidth; // restart the float-up animation
  el.classList.add('show');
}

export function applyPlayerDamage(rawDmg, reasonText) {
  if (GameState.invulnTimer > 0 || GameState.agroTimer > 0 || GameState.warpActiveTimer > 0) return;
  if (shieldBreak(0)) return;
  const hitKind = reasonText.includes('TRAFFIC') ? 'traffic' : 'obstacle';
  const impactMph = Math.max(GameState.speed, GameState.prevSpeed || 0);
  chargePenalty(logHit(GameState.penaltyLog, hitKind, impactMph), hitKind === 'traffic' ? 'TRAFFIC CRASH' : reasonText.replace('IMPACT', 'HIT'));
  const charObj = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  if (charObj.id === 'IRON_SAINT_BRAWLER' && reasonText.includes('BARRIER')) {
    // Dez's 1,780kg Brawler smashes barriers with 0 damage!
    return;
  }
  const dmgScale = currentDifficulty().damage; // settings → difficulty (ticket 0050)
  // Durability rating (ticket 0071) decides how much a hit costs.
  const finalDmg = Math.round(Math.max(6, rawDmg * activeCarParams().damageMult) * dmgScale);
  GameState.hp = Math.max(0, GameState.hp - finalDmg);
  RS.stormCrash = true; // the Time Storm gains on every crash (ticket 0151)
  GameState.invulnTimer = 1.1; // 1.1s invulnerability frames
  SoundEngine.playCrash();
  // Crash spectacle: a beat of slow-mo, a spark shower and a jolt (ticket 0009).
  if (!GameState.reducedMotion) GameState.takedownSlowMoTimer = Math.max(GameState.takedownSlowMoTimer, 0.28);
  GameState.screenShake = Math.max(GameState.screenShake, 0.5);
  burstSparks(26, 18, 1.1);

  if (GameState.hp <= 0) {
    if (GameState.mode === 'LIVE') live.wrecked(); // live races never end early: you respawn
    else if (GameState.mode === 'INFINITE') endOrContinue(`💥 WRECKED — RUN OVER AT TIER ${GameState.tier}`);
    else patchUpWreck(); // a race with a finish line: limp on, the lost time is the cost
  }
}

/** Arcade/daily wreck (ticket 0150): the pit crew patches you up instead of ending the race. */
export function patchUpWreck() {
  GameState.wrecks = (GameState.wrecks || 0) + 1;
  GameState.hp = Math.round(GameState.maxHp * 0.35);
  GameState.speed = Math.min(GameState.speed, 20);
  GameState.invulnTimer = 2.2;
  triggerAnnouncement('💥 WRECKED!', `PIT CREW PATCH-UP · +${GameState.hp} HP · KEEP RACING`, 1600, 3);
}

/** HP up (wrenches, regen, level-ups), clamped to max. Returns what was actually healed. */
export function healPlayerHp(amount) {
  const before = GameState.hp;
  GameState.hp = Math.max(0, Math.min(GameState.maxHp, GameState.hp + amount));
  return GameState.hp - before;
}

// Endless Highway (ticket 0150): tier, difficulty and the level-up moment.
export const diffIn = { mode: 'ARCADE', distance: 0, levelIndex: 0, levels: 1, raceLength: 0 };

export const diffOut = { tier: 1, difficulty: 0 };

export const tune = { wave: 1, intensity: 1, coinMult: 1 };

export function updateDifficulty() {
  diffIn.mode = GameState.mode;
  diffIn.distance = GameState.distance;
  diffIn.levelIndex = GameState.levelIndex;
  diffIn.levels = WORLD_LEVELS.length;
  diffIn.raceLength = GameState.raceLength;
  difficultyOf(diffIn, diffOut);
  if (diffOut.difficulty > GameState.difficulty) GameState.difficulty = diffOut.difficulty;
  if (GameState.mode !== 'INFINITE') { GameState.tier = diffOut.tier; return false; }
  const up = diffOut.tier > GameState.tier;
  if (up) GameState.tier = diffOut.tier;
  endlessTuning(GameState.difficulty, GameState.tier, tune);
  if (tune.wave > GameState.waveTier) GameState.waveTier = tune.wave;
  GameState.coinMult = tune.coinMult;
  if (up) levelUpEndless();
  return true;
}

export const goalLevel = () => (SaveStore.data.endless && SaveStore.data.endless.goals ? SaveStore.data.endless.goals.level | 0 : 0);

export function resetRunner() {
  Object.assign(storm, createStorm());
  for (const k of Object.keys(runStats)) runStats[k] = 0;
  runStats.tier = 1;
  RS.stormCrash = false; RS.goalClock = 0; RS.lastLoopF = null; RS.lastDist = 0; RS.passedBest = false;
  resetPower(power);
  GameState.continued = false;
  GameState.stormGap = storm.gap; GameState.stormWarn = 0;
  const endless = GameState.mode === 'INFINITE' && !GameState.daily;
  GameState.runMult = endless ? runnerMult(goalLevel()) : 1;
  // Your best run as a gate on the road: distance → track Z is fixed for the run's pace.
  const best = endless && SaveStore.data.endless ? SaveStore.data.endless.bestDistance | 0 : 0;
  const zPer = 11000 / 88 * (PACE_MODES[GameState.paceMode] || PACE_MODES[0]).mult;
  RS.bestGateSeg = best > 600 ? Math.floor((best * zPer + ROAD_CFG.playerZOffset) / ROAD_CFG.segLength) : -1;
  syncRunnerUi(true);
}

export function stepRunner(rawDt) {
  if (GameState.mode !== 'INFINITE' || GameState.daily || GameState.racePhase !== 'RACING' || GameState.status !== 'PLAYING') return;
  const ended = stepPower(power, rawDt);
  if (ended) {
    SoundEngine.sample('whoosh', 1.5, 0.5);
    if (ended !== 'SHIELD' || !power.popped) triggerAnnouncement(`${POWER[ended].icon} ${POWER[ended].name} OFF`, '', 700, 0);
  }
  runStats.tier = GameState.tier;
  const moved = GameState.distance - RS.lastDist;
  RS.lastDist = GameState.distance;
  if (GameState.wallGrind) runStats.cleanCur = 0;
  else if (moved > 0) { runStats.cleanCur += moved; if (runStats.cleanCur > runStats.cleanBest) runStats.cleanBest = runStats.cleanCur; }
  const f = featureAt(GameState.trackPos + ROAD_CFG.playerZOffset);
  if (RS.lastLoopF && f !== RS.lastLoopF && GameState.peeledLoop !== RS.lastLoopF) runStats.loops++;
  RS.lastLoopF = f && f.kind === 'LOOP' ? f : null;
  if (RS.bestGateSeg > 0 && track.end > RS.bestGateSeg) {
    const seg = track.seg(RS.bestGateSeg);
    if (seg) addItem(seg, 0, 'BEST_GATE');
    RS.bestGateSeg = -1;
  }
  const best = SaveStore.data.endless ? SaveStore.data.endless.bestDistance : 0;
  if (!RS.passedBest && best > 600 && GameState.distance > best) {
    RS.passedBest = true;
    triggerAnnouncement('🏁 NEW BEST!', `PAST YOUR ${Math.round(best).toLocaleString()} m — KEEP GOING!`, 1800, 3);
    if (touch) touch.controls.haptics.pulse('lap');
  }
  const caught = stepStorm(storm, GameState.speed, GameState.difficulty, rawDt, GameState.wallGrind, RS.stormCrash);
  RS.stormCrash = false;
  GameState.stormGap = storm.gap;
  GameState.stormWarn = storm.warn;
  if (caught) { endOrContinue('⛈️ CAUGHT BY THE TIME STORM!'); return; }
  RS.goalClock += rawDt;
  if (RS.goalClock < 0.25 || !runnerMod) return;
  RS.goalClock = 0;
  const fresh = runnerMod.checkRun(SaveStore.data, runStats);
  if (fresh.length) {
    SaveStore.save();
    SoundEngine.playCheckpoint();
    if (fresh.levelUp) {
      GameState.runMult = runnerMult(fresh.levelUp);
      triggerAnnouncement(`⭐ ENDLESS LEVEL ${fresh.levelUp + 1}!`, `ALL 3 GOALS DONE · ×${GameState.runMult.toFixed(1)} POINTS FOREVER`, 2200, 3);
    } else triggerAnnouncement('🎯 GOAL DONE!', runnerMod.goalLabel(fresh[0]), 1500);
  }
  syncRunnerUi(false);
}

/** HP 0 or caught in an endless run: offer the one continue if it's affordable, else end. */
export function endOrContinue(reason) {
  if (GameState.mode !== 'INFINITE' || GameState.daily || !canContinue(GameState.continued, SaveStore.data.fluxCoins, GameState.tier)) { endRaceRun(reason); return; }
  GameState.status = 'CONTINUE';
  const cost = continueCost(GameState.tier);
  loadRunnerUi().then((ui) => ui.offerContinue({
    cost, coins: SaveStore.data.fluxCoins, secs: CONTINUE.offerSecs, reason,
    onYes: () => continueRun(cost),
    onNo: () => endRaceRun(reason),
  })).catch(() => endRaceRun(reason));
}

export function continueRun(cost) {
  if (GameState.status !== 'CONTINUE') return;
  SaveStore.data.fluxCoins = Math.max(0, SaveStore.data.fluxCoins - cost);
  SaveStore.save();
  GameState.continued = true;
  GameState.hp = Math.max(GameState.hp, Math.round(GameState.maxHp * CONTINUE.hpFrac));
  GameState.invulnTimer = CONTINUE.invuln;
  GameState.speed = Math.max(GameState.speed, 45);
  stormRespite(storm);
  GameState.stormGap = storm.gap; GameState.stormWarn = 0;
  GameState.status = 'PLAYING';
  triggerAnnouncement('🔧 BACK IN THE RACE!', `−${cost} ⚡ · ${CONTINUE.invuln}s SHIELD · STORM PUSHED BACK`, 1800, 3);
  syncRunnerUi(true);
}

export function levelUpEndless() {
  const tier = GameState.tier;
  setTrackIntensity(tune.intensity);
  setTrackPowerups(endlessSolo() ? tier : 0); // power-ups a little more often each tier (0177)
  const healed = Math.round(healPlayerHp(Math.round(GameState.maxHp * ENDLESS.healFrac)));
  GameState.eraIndex = (GameState.eraIndex + 1) % ERAS.length; // every tier is a new era
  updateEraHud();
  if (!GameState.reducedMotion) GameState.takedownSlowMoTimer = Math.max(GameState.takedownSlowMoTimer, 0.45);
  GameState.levelUpAt = performance.now();
  const banner = document.getElementById('levelUpBanner');
  if (banner) { document.getElementById('levelUpTier').textContent = `TIER ${tier}`; banner.dataset.fx = `t${tier % 2}`; }
  SoundEngine.playLevelUp();
  if (touch) touch.controls.haptics.pulse('lap');
  burstSparks(30, 50, 1.2);
  triggerAnnouncement(`⬆️ LEVEL UP! TIER ${tier}`,
    `${healed > 0 ? `+${healed} HP · ` : ''}${GameState.coinMult.toFixed(1)}× COINS · ${ERAS[GameState.eraIndex].id} · FASTER!`, 2000, 3);
}

export function addEndlessRunStreak(amount, reasonLabel, offsetFromCenter = 0) {
  GameState.dodgeStreak += amount;
  if (GameState.dodgeStreak > GameState.bestStreak) {
    GameState.bestStreak = GameState.dodgeStreak;
  }
  // Endless Run style multiplier: scales up to x30 as your clean dodge streak grows!
  GameState.combo = Math.min(30, 1 + Math.floor(GameState.dodgeStreak / 2));
  GameState.comboTimer = 9.0;
  const chain = nearMisses.hit(RS.fxClock);
  const chainBonus = chain > 1 ? nearMisses.points() : 0;
  const pts = 500 * amount * GameState.combo + chainBonus;
  GameState.score += pts;
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.streakPerDodge * amount);
  // A sliver of hit-stop sells the graze; chains stretch it a touch (ticket 0009).
  hitStop.trigger(Math.min(0.09, 0.035 + chain * 0.008), GameState.reducedMotion);
  if (reasonLabel) {
    const chainTag = chain > 1 ? ` · NEAR-MISS x${chain}` : '';
    spawnAcquireAnimation('HW_COIN', offsetFromCenter, `${reasonLabel} +${pts} (x${GameState.combo})${chainTag}`);
  }
}

export function performHumanTrick(direction) {
  if (GameState.status !== 'PLAYING') return false;

  // A. MID-AIR DIRECTIONAL TRICK COMBOS (When Airborne playerY > 10)
  if (GameState.playerY > 10) {
    GameState.airTrickCount++;
    let trickName = '360° KICKFLIP';
    let basePts = 1200;

    if (direction === 'LEFT') {
      trickName = '🌪️ HOVER KICKFLIP';
      GameState.stuntSpinAngle = 360;
      GameState.airLandingBoostMph = Math.min(32, GameState.airLandingBoostMph + 14);
    } else if (direction === 'RIGHT') {
      trickName = '🌀 BARREL ROLL';
      GameState.stuntSpinAngle = -360;
      GameState.airLandingBoostMph = Math.min(32, GameState.airLandingBoostMph + 14);
    } else if (direction === 'UP') {
      trickName = '🦅 PROFESSOR BACKFLIP';
      GameState.trickPitchAngle = 360;
      GameState.playerVY = Math.max(GameState.playerVY, 240); // Slight air-hang extension!
      GameState.airLandingBoostMph = Math.min(36, GameState.airLandingBoostMph + 18);
      healPlayerHp(8);
      basePts = 1600;
    } else if (direction === 'DOWN') {
      trickName = '⚡ SHOCKWAVE STOMP';
      GameState.playerVY = -950; // Fast slam-dunk stomp onto the track!
      GameState.airLandingBoostMph = Math.min(38, GameState.airLandingBoostMph + 20);
      basePts = 1800;
      // Blast nearby obstacles forward!
      const pz = GameState.visualPlayerZ || (GameState.trackPos + ROAD_CFG.playerZOffset);
      for (let i = 0; i < LiveTraffic.obstacles.length; i++) {
        const ob = LiveTraffic.obstacles[i];
        const dz = ob.worldZ - pz;
        if (dz > -200 && dz < 1800) {
          ob.hitCount++;
          ob.applyImpulseAndTorque((ob.offset >= 0 ? 1 : -1) * 2800, 480000, 320000, 0.3);
        }
      }
    }

    GameState.airTrickNames.push(trickName);
    addEndlessRunStreak(1, `${trickName}!`, 0);
    const trickPts = basePts * GameState.combo * GameState.airTrickCount;
    GameState.score += trickPts;
    GameState.magnetTimer = Math.max(GameState.magnetTimer, 4.0);
    SoundEngine.playStunt();

    const driftBox = document.getElementById('driftCounterBox');
    if (driftBox) {
      driftBox.classList.remove('hidden');
      driftBox.textContent = `${trickName} (AIR COMBO x${GameState.airTrickCount}) • +${trickPts} PTS!`;
    }
    return true;
  }

  // B. GROUND DOUBLE-TAP PHASE-JUKE DASH (Gives Human Reflexes Instant Dodge + Invulnerability Edge!)
  if ((direction === 'JUKE_LEFT' || direction === 'JUKE_RIGHT') && GameState.phaseJukeTimer <= 0) {
    const dirSign = direction === 'JUKE_LEFT' ? -1 : 1;
    GameState.phaseJukeTimer = 0.50;
    GameState.invulnTimer = Math.max(GameState.invulnTimer, 0.50);
    GameState.playerVX = dirSign * 2.15;
    GameState.speed = Math.min(135, GameState.speed + 9);
    GameState.magnetTimer = Math.max(GameState.magnetTimer, 3.0);
    SoundEngine.playBoosterHit();
    addEndlessRunStreak(1, '⚡ PHASE-JUKE!', dirSign * 0.25);
    return true;
  }
  return false;
}

/** A pickup was collected: its effect, score, cue and burst (defs in src/pickups.js). */
/** A power-up was grabbed (0177): start its timer for the upgraded length. */
function applyPowerup(item) {
  const kind = item.type, rel = item.offset - GameState.playerX;
  const lv = ensurePower(SaveStore.data)[kind];
  activatePower(power, kind, lv);
  runStats.powerups++;
  if (!SoundEngine.sample('zone', kind === 'MAGNET' ? 0.8 : kind === 'SHIELD' ? 1.2 : 1.5, 0.9)) SoundEngine.playCheckpoint();
  SoundEngine.sample(kind === 'DOUBLER' ? 'coin' : 'booster', kind === 'DOUBLER' ? 0.75 : 1.3, 0.6);
  if (touch) touch.controls.haptics.pulse('pickup');
  GameState.pickupsTaken = (GameState.pickupsTaken || 0) + 1;
  if (pickupArt) pickupArt.burst(kind, rel);
  const P = POWER[kind];
  const secs = Math.round(power.dur[kind]);
  triggerAnnouncement(`${P.icon} ${P.name}!`, kind === 'MAGNET' ? `COINS FLY TO YOU · ${secs}s` : kind === 'SHIELD' ? `BLOCKS ONE CRASH · ${secs}s` : `DOUBLE COIN CASH · ${secs}s`, 1100);
  spawnAcquireAnimation(kind, rel, `${P.icon} ${P.name} ${secs}s`);
}

export function applyPickup(item, def) {
  if (def.powerup) { applyPowerup(item); return; }
  const rel = item.offset - GameState.playerX;
  if (def.combo) { GameState.combo = Math.min(12, GameState.combo + 1); GameState.comboTimer = 5.0; }
  if (def.flux) GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains[def.flux]);
  // Endless tiers multiply coin cash (ticket 0150); points are unchanged (the server re-checks them).
  // The 2X power-up doubles cash on top (0177).
  const doubled = cashMult(power);
  const cash = def.coins ? Math.round(def.coins * (GameState.coinMult || 1)) * doubled : 0;
  if (cash) {
    GameState.runCoins += cash; SaveStore.data.fluxCoins += cash; runStats.coins++;
    if (doubled > 1) runStats.doubledCash += cash;
    if (powerOn(power, 'MAGNET')) runStats.magnetCoins++;
  }
  const healed = def.heal ? Math.round(healPlayerHp(def.heal)) : 0;
  if (def.nos) { addNos(RS.nos, def.nos); GameState.nosFill = nosFill(RS.nos); }
  const pts = def.pts * GameState.combo;
  GameState.score += pts;
  if (def.cue === 'repair') SoundEngine.playCheckpoint();
  else if (def.cue === 'nos') { if (!SoundEngine.sample('nos', 1.2, 0.8)) SoundEngine.playBoosterHit(); }
  else if (item.type === 'PLUTONIUM') { if (!SoundEngine.sample('coin', 1.3)) SoundEngine.playCoinPickup(); }
  else SoundEngine.playCoinPickup();
  if (touch) touch.controls.haptics.pulse('pickup');
  GameState.pickupsTaken = (GameState.pickupsTaken || 0) + 1;
  if (pickupArt) pickupArt.burst(item.type, rel);
  const label = item.type === 'PLUTONIUM' ? `+${pts} ⚡ 1.88GW!` : item.type === 'HW_COIN' ? `+${pts} 🔥 x${GameState.combo}`
    : item.type === 'REPAIR_WRENCH' ? (healed > 0 ? `+${healed} 💚 HP REPAIRED!` : '💚 HP FULL!') : '💨 NOS REFILL!';
  spawnAcquireAnimation(item.type, rel, label);
}

export function spawnAcquireAnimation(itemType, offsetFromCenter, bonusLabel) {
  GameState.carSurgeTimer = 0.55;
  GameState.pickupAnimations.push({
    type: itemType,
    startX: offsetFromCenter * 180,
    startY: -45,
    progress: 0,
    spin: 0,
    label: bonusLabel
  });
  GameState.hitShockwaves.push({
    x: 0,
    y: 0,
    radius: 12,
    maxRadius: 115,
    color: PICKUPS[itemType] ? PICKUPS[itemType].color : '#ffd000',
    label: bonusLabel,
    life: 0.65,
    maxLife: 0.65
  });
}

export function spawnObstacleShatter(offsetFromCenter, primaryColor, accentColor, labelText) {
  GameState.carJoltY = 12;
  GameState.screenShake = Math.max(GameState.screenShake, 0.28);
  GameState.hitShockwaves.push({
    x: offsetFromCenter * 150,
    y: -20,
    radius: 15,
    maxRadius: 145,
    color: primaryColor,
    label: labelText,
    life: 0.7,
    maxLife: 0.7
  });
  for (let s = 0; s < 16; s++) {
    const angle = (Math.PI * s) / 8 + (Math.random() - 0.5) * 0.3;
    const spd = 120 + Math.random() * 240;
    GameState.debrisShards.push({
      x: offsetFromCenter * 140,
      y: -15 - Math.random() * 25,
      vx: Math.cos(angle) * spd,
      vy: -120 - Math.abs(Math.sin(angle)) * spd,
      rot: Math.random() * 6.28,
      vRot: (Math.random() - 0.5) * 18,
      size: 5 + Math.random() * 7,
      color: (s % 2 === 0) ? primaryColor : accentColor,
      life: 0.75 + Math.random() * 0.35
    });
  }
}

// --- SIDE-SLAM RIVAL TAKEDOWN ---
export function triggerRivalTakedown(car, reason = 'SIDE-SLAM TAKEDOWN!') {
  if (car.takenDown) return;
  car.takenDown = true;
  GameState.takedowns++;
  GameState.combo = Math.min(12, GameState.combo + 2);
  GameState.comboTimer = 5.5;
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.takedown);
  GameState.heatProgress += 35;
  if (GameState.heatProgress >= 100 && GameState.heatLevel < 5) {
    GameState.heatLevel++;
    GameState.heatProgress = 0;
  }

  const tdPoints = 2000 * GameState.combo;
  GameState.score += tdPoints;
  GameState.runCoins += 15;
  SaveStore.data.fluxCoins += 15;
  GameState.screenShake = 0.42;
  GameState.takedownSlowMoTimer = GameState.reducedMotion ? 0 : 0.35; // Brief dramatic impact slow-mo!
  burstSparks(34, 190, 1.3);

  // Launch flying wreck into 3D space
  GameState.flyingWrecks.push({
    x: (car.offset - GameState.playerX) * 180,
    y: 0,
    vx: (car.offset >= GameState.playerX ? 1 : -1) * (180 + Math.random() * 140),
    vy: 380 + Math.random() * 180,
    rot: 0,
    vRot: (Math.random() > 0.5 ? 1 : -1) * 12,
    color: car.type === 'POLICE_INTERCEPTOR' ? '#3b82f6' : '#e11d48',
    look: car.look || null, // the car itself tumbles away (src/car-sprite.js), when it has one
    life: 1.1
  });

  spawnObstacleShatter(car.offset - GameState.playerX, '#ff5500', '#00f0ff', '💥 TAKEDOWN! +2000');
  // Spawn explosion sparks
  for (let s = 0; s < 22; s++) {
    GameState.particles.push({
      x: (car.offset - GameState.playerX) * 120,
      y: -15,
      vx: (Math.random() - 0.5) * 380,
      vy: -80 - Math.random() * 240,
      color: s % 2 === 0 ? '#ff5500' : '#fde047',
      life: 0.55
    });
  }

  SoundEngine.playTakedown();
  triggerAnnouncement(`💥 ${reason} 💥`, `${car.name} WRECKED! +${tdPoints} PTS & +32% FLUX`, 1850);
  advanceContractProgress('TAKEDOWN', 1);
  SaveStore.save();
}

// --- STREET-CREW SPECIAL ABILITIES (ZONE / AGRO / ROAR) ---
export function activateMidnightSpecial(type) {
  SoundEngine.init();
  const tint = document.getElementById('abilityTintOverlay');
  if (GameState.specialCharges <= 0 && GameState.fluxCharge < 35) {
    triggerAnnouncement('NEED MORE FLUX OR SPECIAL!', 'DRIFT OR DRAFT RIVALS TO CHARGE', 1100);
    return;
  }
  if (GameState.specialCharges > 0) {
    GameState.specialCharges--;
  } else {
    GameState.fluxCharge = Math.max(0, GameState.fluxCharge - 35);
  }

  const upgBonus = (SaveStore.data.upgrades.flux - 1) * 0.6;
  if (type === 'ZONE') {
    GameState.zoneTimer = 4.5 + upgBonus;
    SoundEngine.playAbilityZone();
    if (tint) {
      tint.className = 'pointer-events-none absolute inset-0 bg-emerald-500/10 opacity-100 transition-opacity duration-200';
    }
    triggerAnnouncement('🟢 MIDNIGHT ZONE ENGAGED!', 'BULLET-TIME PRECISION REFLEX ACTIVE', 1600);
  } else if (type === 'AGRO') {
    GameState.agroTimer = 5.0 + upgBonus;
    GameState.speed = Math.max(GameState.speed + 18, 95);
    SoundEngine.playBoosterHit();
    if (tint) {
      tint.className = 'pointer-events-none absolute inset-0 bg-orange-600/10 opacity-100 transition-opacity duration-200';
    }
    triggerAnnouncement('🔴 AGRO JUGGERNAUT SHIELD!', 'RAM ANY RIVAL OR COP FOR INSTANT TAKEDOWNS!', 1800);
  } else if (type === 'ROAR') {
    SoundEngine.playAbilityRoar();
    GameState.screenShake = 0.55;
    GameState.roarWaveZ = 0;
    // Blast all cars in upcoming 18 segments into the rails!
    const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
    let wreckedCount = 0;
    for (let n = 0; n < 18; n++) {
      const seg = track.seg(currentSegIdx + n);
      if (!seg) continue;
      for (let c = 0; c < seg.cars.length; c++) {
        if (!seg.cars[c].takenDown) {
          triggerRivalTakedown(seg.cars[c], '🟣 ROAR SHOCKWAVE TAKEDOWN!');
          wreckedCount++;
        }
      }
    }
    if (wreckedCount === 0) {
      GameState.speed = Math.max(GameState.speed + 22, 92);
      triggerAnnouncement('🟣 1.88 GW ROAR SHOCKWAVE!', 'HIGHWAY CLEARED + TURBO SURGE!', 1500);
    }
  }
  updateLiveHud();
}

// --- TIME WARP AT 88 MPH ---
export function triggerTimeWarp() {
  SoundEngine.playTimeWarp88();
  GameState.timeWarps++;
  GameState.sinceWarp = 0;
  GameState.warpFxTimer = 0.9;
  GameState.warpActiveTimer = (3.5 + (SaveStore.data.upgrades.flux - 1) * 0.5) * activeCarParams().fluxMult;
  GameState.fluxCharge = 0;
  GameState.eraIndex = (GameState.eraIndex + 1) % ERAS.length;
  const newEra = ERAS[GameState.eraIndex];

  const warpBonus = 3000 * GameState.combo;
  GameState.score += warpBonus;
  GameState.runCoins += 30;
  SaveStore.data.fluxCoins += 30;
  GameState.specialCharges = Math.min(5, GameState.specialCharges + 1);
  let warpTime = 0;
  if (GameState.mode === 'ARCADE') {
    warpTime = RS.raceClock.extend(12.0);
    GameState.timeLeft = RS.raceClock.timeLeft;
  }

  const flashEl = document.getElementById('warpFlash');
  if (flashEl) {
    flashEl.style.opacity = GameState.reducedMotion ? '0.08' : '0.14';
    setTimeout(() => { flashEl.style.opacity = '0'; }, 340);
  }

  for (let i = 0; i < 20; i++) {
    GameState.lightningBolts.push({
      x: (Math.random() - 0.5) * 280,
      y: (Math.random() - 0.5) * 130,
      life: 0.5 + Math.random() * 0.4
    });
  }

  triggerAnnouncement(
    `⚡ 88 MPH TIME WARP! ➔ ${newEra.id} ⚡`,
    `ERA SHIFT: ${newEra.name}! +${warpBonus} PTS${warpTime > 0 ? ` & +${warpTime}s` : ''}`,
    2400
  );
  advanceContractProgress('WARP_88', 1);
  updateEraHud();
  SaveStore.save();
}

// --- PRO PHYSICS & GAMEPLAY UPDATE LOOP ---
// Handling state (ticket 0120), reset with each race; latParams is reused to avoid per-step garbage.
export const steerWheel = createSteer();

export const driveIn = { speed: 0, throttle: false, brake: false, cap: 0, engine: 0, dt: 0, grip: 1, lat: 0, airborne: false };

export let latCarP = null, latTires = 0;

export function resetNos() {
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const spec = CAR_SPECS[c.id];
  RS.nos = createNos(nosFor(spec ? spec.stats.flux : 5));
  GameState.nosBurning = false;
  GameState.nosFill = nosFill(RS.nos);
}

export const latParams = { speedMph: 0, curve: 0, bank: 0, worldScale: 1, h: null, braking: false, throttle: false, drifting: false, gripBonus: 1 };

export function updateGame(rawDt) {
  if (GameState.status !== 'PLAYING') return;
  // Grid lineup and start lights (ticket 0052): the world waits for GO.
  if (GameState.racePhase === 'START') { if (RS.startSeq) updateRaceStart(rawDt); return; }
  updateRaceCeremony(rawDt);

  // Apply ZONE Bullet-Time or Takedown Slow-Mo time dilation to world while keeping player responsive
  let timeScale = 1.0;
  if (GameState.takedownSlowMoTimer > 0) {
    GameState.takedownSlowMoTimer -= rawDt;
    timeScale = 0.45;
  } else if (GameState.zoneTimer > 0) {
    GameState.zoneTimer -= rawDt;
    timeScale = 0.55;
  }
  if (GameState.agroTimer > 0) {
    GameState.agroTimer -= rawDt;
  }
  if (GameState.zoneTimer <= 0 && GameState.agroTimer <= 0) {
    const tint = document.getElementById('abilityTintOverlay');
    if (tint) tint.style.opacity = '0';
  }

  RS.fxClock += rawDt;
  timeScale *= hitStop.scale(rawDt);
  sparks.update(rawDt);
  if (GameState.warpFxTimer > 0) GameState.warpFxTimer -= rawDt;
  const dt = rawDt * timeScale;

  const cameraSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  const currentSegIdx = Math.floor((GameState.trackPos + ROAD_CFG.playerZOffset) / ROAD_CFG.segLength);
  if (track.end - currentSegIdx < ROAD_CFG.drawDistance + 85) {
    generateNextTrackBiome();
  }

  const currentSeg = track.seg(currentSegIdx) || track.seg(track.start);
  const upg = SaveStore.data.upgrades;

  // Handle Midnight Special hotkeys
  if (InputState.zonePressed) { InputState.zonePressed = false; activateMidnightSpecial('ZONE'); }
  if (InputState.agroPressed) { InputState.agroPressed = false; activateMidnightSpecial('AGRO'); }
  if (InputState.roarPressed) { InputState.roarPressed = false; activateMidnightSpecial('ROAR'); }
  if (InputState.twoWheelPressed) {
    InputState.twoWheelPressed = false;
    GameState.twoWheelTimer = GameState.twoWheelTimer > 0 ? 0 : 3.2;
    if (GameState.twoWheelTimer > 0) {
      SoundEngine.playStunt();
      triggerAnnouncement('📐 MIDNIGHT 2-WHEEL TILT!', 'SQUEEZE THROUGH TRAFFIC FOR 2X STYLE PTS!', 1300);
    }
  }
  if (GameState.twoWheelTimer > 0) {
    GameState.twoWheelTimer -= rawDt;
    GameState.score += Math.floor(450 * rawDt * GameState.combo);
  }

  // Update Invulnerability & Voss Nanotech Regen + Endless-Run Progressive Wave Tier
  if (GameState.invulnTimer > 0) GameState.invulnTimer = Math.max(0, GameState.invulnTimer - rawDt);
  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  if (activeChar.id === 'ARC_ROADSTER_88' && GameState.hp < GameState.maxHp) {
    GameState.hp = Math.min(GameState.maxHp, GameState.hp + 2.0 * rawDt);
  }
  // Low-HP warning (ticket 0150): once per dip under 30%, re-armed above 45%.
  const hpFrac = GameState.maxHp ? GameState.hp / GameState.maxHp : 1;
  if (!GameState.hpLowWarned && GameState.hp > 0 && hpFrac <= 0.3) {
    GameState.hpLowWarned = true;
    triggerAnnouncement('⚠️ LOW HP!', 'GRAB A 🔧 WRENCH · DRIVE CLEAN', 1500, 3);
    if (touch) touch.controls.haptics.pulse('hit');
  } else if (GameState.hpLowWarned && hpFrac > 0.45) GameState.hpLowWarned = false;
  const newWave = 1 + Math.floor(GameState.distance / 550);
  if (!updateDifficulty() && newWave > GameState.waveTier) {
    GameState.waveTier = newWave;
    triggerAnnouncement(`🌊 WAVE ${GameState.waveTier} REACHED!`, 'SPEED & OBSTACLE INTENSITY UP!', 1400);
  }

  // 1. Real Newtonian Speed, Slope Gravity (g * sin(theta)), Mass & 6-Speed Gearbox
  const waveSpeedBonus = Math.min(22, (GameState.waveTier - 1) * 3.5);
  const carP = activeCarParams();
  const baseMaxMph = 92 + (upg.engine - 1) * 6 + carP.topMphBonus + waveSpeedBonus;
  const warpMaxMph = 128 + (upg.engine - 1) * 7 + carP.topMphBonus + waveSpeedBonus;
  const isOnBooster = currentSeg && currentSeg.trackType === 'BOOSTER';
  const targetMaxSpeed = (GameState.warpActiveTimer > 0 || GameState.agroTimer > 0 || isOnBooster) ? warpMaxMph : baseMaxMph;

  const gp = pollGamepad();
  if (steerModes) steerModes.gamepad(gp);
  const accelerating = GameState.autoGas || InputState.up || InputState.touchUp || gp.gas;
  const braking = InputState.down || InputState.touchDown || gp.brake;

  const paceCfg = PACE_MODES[GameState.paceMode] || PACE_MODES[0];
  // Pedals through the drivetrain (ticket 0131): gears with a torque curve and shift cuts,
  // traction-limited launches, speed-sensitive brakes, all sharing grip with cornering.
  if (latCarP !== carP || latTires !== upg.tires) { latCarP = carP; latTires = upg.tires; latParams.h = handlingFor(carP, upg.tires); }
  driveIn.speed = GameState.speed;
  driveIn.throttle = Boolean(accelerating);
  driveIn.brake = Boolean(braking);
  driveIn.cap = targetMaxSpeed;
  driveIn.engine = (14 + (upg.engine - 1) * 2.5) * carP.accelMult * paceCfg.accelMult * (GameState.warpActiveTimer > 0 ? 1.5 : 1.0);
  driveIn.dt = rawDt;
  driveIn.grip = latParams.h.grip * (GameState.zoneTimer > 0 ? 1.25 : 1);
  driveIn.lat = lateral.load;
  driveIn.airborne = GameState.playerY > 4;
  GameState.speed = stepDrive(drive, driveIn);
  GameState.wheelSpin = drive.spin;

  // NOS (ticket 0122): hold to burn the tank for extra thrust past top speed, capped at the
  // warp ceiling that live rooms and the leaderboard already allow.
  const nosHeld = InputState.nosHeld || InputState.touchNos || gp.nos;
  const wasBurning = RS.nos.burning;
  const burning = stepNos(RS.nos, nosHeld && GameState.speed > 10, rawDt, { drifting: GameState.isDrifting, airborne: GameState.playerY > 10, penalised: RS.penaltyThisStep });
  RS.penaltyThisStep = false;
  if (burning) { GameState.speed = nosSpeed(GameState.speed, rawDt, baseMaxMph, warpMaxMph + 8); runStats.nosSecs += rawDt; }
  if (burning && !wasBurning) {
    SoundEngine.playBoosterHit();
    if (touch) touch.controls.haptics.pulse('boost');
  }
  GameState.nosBurning = burning;
  GameState.nosFill = nosFill(RS.nos);

  // Loops (road contract set pieces): gravity along the loop, and too slow at the top means
  // you fall off. That costs speed, not points (no new penalty kind for the server to check).
  const feat = featureAt(GameState.trackPos + ROAD_CFG.playerZOffset);
  if (feat && feat.kind === 'LOOP' && GameState.whooshLoop !== feat) { GameState.whooshLoop = feat; SoundEngine.playWhoosh(); }
  if (feat && feat.kind === 'LOOP' && GameState.playerY <= 4) {
    const lt = (GameState.trackPos + ROAD_CFG.playerZOffset - feat.z0) / feat.length;
    const lp = loopStep(GameState.speed, feat, lt, rawDt);
    if (lp.peel && GameState.peeledLoop !== feat) {
      GameState.peeledLoop = feat;
      GameState.peelT = lt; // where you came off: the 2D loop view drops you from here
      GameState.loopPeels = (GameState.loopPeels || 0) + 1;
      GameState.speed = Math.min(GameState.speed, 40);
      // The fall's arc is laid out from this speed (src/loopcam.js peelFall), on the sim's own
      // progress to the exit, so the car lands in the view when the sim says it does.
      GameState.peelUps = (GameState.speed / 88) * 11000 * paceCfg.mult;
      GameState.playerVY = 0;
      triggerAnnouncement('🌀 TOO SLOW FOR THE LOOP!', 'HIT IT FASTER — NOS HELPS', 1300);
      if (touch) touch.controls.haptics.pulse('hit');
    } else if (!lp.peel) {
      GameState.speed = Math.max(18, GameState.speed + lp.dv);
    }
  }

  // 6-speed gearbox and tachometer (src/drivetrain.js keeps the gear, with shift hysteresis).
  GameState.gear = drive.gear;
  GameState.rpm = rpmFor(GameState.speed, drive.gear);

  // 10x Automotive Physics: Slope Gravity, Hill-Crest Airborne Launch, Quadratic Aero Drag & Weight Transfer!
  if (currentSeg) {
    const dy = currentSeg.p2.world.y - currentSeg.p1.world.y;
    const currSlope = dy / ROAD_CFG.segLength;
    if (GameState.playerY <= 4) {
      const slopeAccel = -currSlope * 32;
      // Quadratic Aerodynamic Drag (reduced by 45% in Slipstream wake!)
      const dragFactor = GameState.draftingCar ? 0.00055 : 0.00105;
      const aeroDrag = dragFactor * GameState.speed * GameState.speed * rawDt;
      GameState.speed = Math.max(18, Math.min(warpMaxMph + 14, GameState.speed + slopeAccel * rawDt - aeroDrag));

      // Hill-Crest Centrifugal Launch: Cresting from steep uphill into downhill at high speed launches the car into natural airtime!
      const slopeDrop = (GameState.prevRoadSlope || 0) - currSlope;
      if (slopeDrop > 0.11 && GameState.speed > 68 && GameState.playerVY <= 0) {
        GameState.playerVY = Math.min(340, slopeDrop * GameState.speed * 18);
      }
    }
    GameState.prevRoadSlope = currSlope;
  }

  // 2nd-Order Hooke's Law 4-Wheel Spring-Damper Suspension + Weight Transfer (Pitch & Roll)
  const longG = (GameState.speed - (GameState.prevSpeed || GameState.speed)) / Math.max(0.008, rawDt);
  GameState.prevSpeed = GameState.speed;
  // Target pitch: braking (longG < 0) dives nose forward (+); accelerating/boosting squats rear (-)
  const targetPitch = Math.max(-7, Math.min(8, -longG * 0.14));
  const pitchSpring = -160 * (GameState.chassisPitch - targetPitch) - 16 * GameState.chassisPitchVel;
  GameState.chassisPitchVel += pitchSpring * rawDt;
  GameState.chassisPitch += GameState.chassisPitchVel * rawDt;

  // Vertical suspension spring-damper oscillator
  const suspForce = -220 * GameState.suspOffset - 18 * GameState.suspVel;
  GameState.suspVel += suspForce * rawDt;
  GameState.suspOffset += GameState.suspVel * rawDt;

  // Duck-Slide Profile when holding Brake/Drift (S / Down / Swipe Down) -> Lets you slide under HIGH_LIGHT_GATE!
  GameState.isDuckSliding = Boolean(braking && GameState.playerY < 18);

  if (isOnBooster && GameState.playerY <= 6) {
    GameState.speed = Math.min(warpMaxMph, GameState.speed + 38 * rawDt);
    GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.boosterPadPerSec * rawDt);
  }

  if (GameState.speed > GameState.peakSpeed) GameState.peakSpeed = GameState.speed;

  // Human-friendly world speed scaled by PACE_MODES (default 0.32x = ~3,900 units/s instead of 12,400!)
  const worldSpeed = (GameState.speed / 88) * 11000 * paceCfg.mult;
  GameState.trackPos += worldSpeed * dt;
  LiveTraffic.update(dt, rawDt, paceCfg.mult);
  const distBefore = GameState.distance;
  GameState.distance += GameState.speed * dt;
  GameState.raceTime += rawDt;
  ghostRecorder.sample(GameState.raceTime, GameState.distance, GameState.playerX); // ticket 0092
  GameState.score += Math.floor(GameState.speed * dt * 2.2 * GameState.combo * (GameState.runMult || 1)); // ×Endless level (0151)
  // The finish line (ticket 0051): three laps of the level's race length.
  if (GameState.raceLength && GameState.finishTime == null && GameState.distance >= GameState.raceLength) {
    GameState.finishTime = crossingTime(GameState.raceTime, rawDt, distBefore, GameState.distance, GameState.raceLength);
  }

  // 2. Pro Counter-Steer Drift Physics & Multi-Device Steering
  // Keys are digital and ramp in through the handling model (ticket 0120); stick, tilt,
  // wheel and touch are analog. Both pass through the same speed-sensitive lock below.
  const digitalSteer = (InputState.right ? 1 : 0) - (InputState.left ? 1 : 0);
  let steerInput = 0;
  if (Math.abs(InputState.wheelSteerVal) > 0.02) steerInput += InputState.wheelSteerVal;
  if (InputState.mouseSteerVal) steerInput += InputState.mouseSteerVal; // mouse mode (ticket 0130)
  if (Math.abs(InputState.touchSteerVal) > 0.01) steerInput += InputState.touchSteerVal;
  if (InputState.tiltEnabled && Math.abs(InputState.tiltSteerVal) > 0.03) {
    steerInput += InputState.tiltSteerVal; // sensitivity and invert are already applied (src/settings.js)
  }
  if (Math.abs(gp.steer) > 0.05) steerInput += gp.steer;

  // Scan upcoming road curvature & threats for LUMEN AR HUD and Co-Pilot
  let curveAhead = 0;
  let nearestThreat = null;
  let bestCollectible = null;
  let hintItem = null, hintSegs = 0;
  for (let look = 1; look <= 26; look++) {
    const lSeg = track.seg(currentSegIdx + look);
    if (!lSeg) break;
    if (look <= 15) curveAhead += lSeg.curve;
    for (let c = 0; c < lSeg.cars.length; c++) {
      const car = lSeg.cars[c];
      if (!car.takenDown && !nearestThreat) {
        nearestThreat = { car, distSegs: look, seg: lSeg };
      }
    }
    for (let k = 0; k < lSeg.items.length; k++) {
      const it = lSeg.items[k];
      if (!it.collected && (it.type === 'PLUTONIUM' || it.type === 'HW_COIN') && !bestCollectible) {
        bestCollectible = { item: it, distSegs: look };
      }
      if (!it.collected && !hintItem && PICKUPS[it.type] && PICKUPS[it.type].power) { hintItem = it; hintSegs = look; }
    }
  }
  GameState.upcomingCurveSum = curveAhead;
  // The HUD's power-up hint: the next core, wrench or NOS canister and which way it is.
  GameState.pickupHint = hintItem ? hintItem.type : '';
  GameState.pickupHintSide = hintItem ? Math.sign(Math.round((hintItem.offset - GameState.playerX) * 5)) : 0;
  GameState.pickupHintSegs = hintSegs;
  GameState.lockedTarget = nearestThreat;

  if (GameState.unibeamTimer > 0) {
    GameState.unibeamTimer = Math.max(0, GameState.unibeamTimer - rawDt);
  }

  // LUMEN Co-Pilot Steering Logic (Mode 0: Smart Assist, Mode 1: Full Autopilot)
  if (GameState.jarvisMode === 1) {
    // FULL AUTOPILOT: Steer toward optimal lane, dodge non-rammable traffic, grab plutonium, and auto-warp!
    let desiredX = 0;
    if (bestCollectible && bestCollectible.distSegs < 16) {
      desiredX = bestCollectible.item.offset;
    }
    if (nearestThreat && nearestThreat.distSegs < 12) {
      const tX = nearestThreat.car.offset;
      if (Math.abs(GameState.playerX - tX) < 0.36 && GameState.agroTimer <= 0 && GameState.speed < 86) {
        desiredX = tX > 0 ? Math.max(-0.7, tX - 0.55) : Math.min(0.7, tX + 0.55);
      }
    }
    const errX = desiredX - GameState.playerX;
    const curveComp = (currentSeg ? currentSeg.curve * 0.11 : 0);
    steerInput = Math.max(-1.1, Math.min(1.1, errX * 2.4 + curveComp));
    if (GameState.fluxCharge >= 95 && GameState.speed >= 86) {
      InputState.boostPressed = true;
    }
  } else if (GameState.jarvisMode === 0 && Math.abs(steerInput) < 0.08 && digitalSteer === 0) {
    // SMART ASSIST: Gently keep the player car centered on curves & nudge away from head-on bumper hits
    const recenter = -GameState.playerX * 0.35 + (currentSeg ? currentSeg.curve * 0.08 : 0);
    steerInput += Math.max(-0.45, Math.min(0.45, recenter));
    if (nearestThreat && nearestThreat.distSegs < 8 && Math.abs(GameState.playerX - nearestThreat.car.offset) < 0.25) {
      steerInput += (GameState.playerX >= nearestThreat.car.offset ? 0.45 : -0.45);
    }
  }

  // Periodic LUMEN Tactical Telemetry Advisories
  if (Math.floor(GameState.trackPos / 1800) !== Math.floor((GameState.trackPos - worldSpeed * dt) / 1800)) {
    if (GameState.fluxCharge >= 90) {
      JarvisAI.setStatus('Arc-Flux core at maximum capacity. Accelerate to 88 MPH for temporal jump.', false);
    } else if (nearestThreat && nearestThreat.distSegs < 15) {
      JarvisAI.setStatus(`Target locked: ${nearestThreat.car.name} (${nearestThreat.distSegs * 8}m ahead). Press B for Pulse Beam.`, false);
    } else if (Math.abs(curveAhead) > 6) {
      JarvisAI.setStatus(`Sharp ${curveAhead > 0 ? 'right' : 'left'} apex ahead. Recommend counter-steer drift.`, false);
    } else {
      JarvisAI.setStatus(`Velocity ${Math.round(GameState.speed)} MPH. Trajectory & Arc Core nominal.`, false);
    }
  }

  const analogSteer = Math.max(-1.25, Math.min(1.25, steerInput));
  const autopilot = GameState.jarvisMode === 1;
  steerInput = stepSteer(steerWheel, autopilot ? 0 : digitalSteer, analogSteer, rawDt, GameState.speed, GameState.isDrifting);
  GameState.steerInput = steerInput; // published for the renderers (3D front wheels)
  GameState.braking = Boolean(braking);
  GameState.throttle = Boolean(accelerating);

  // A power drift is asked for (brake + steer) or happens (the tyres are sliding past grip).
  const wantsDrift = GameState.speed > 45 && GameState.playerY < 10 &&
    ((braking && Math.abs(steerInput) > 0.3) || (GameState.isDrifting ? lateral.slip > 0.12 : lateral.slip > 0.35));
  const driftBox = document.getElementById('driftCounterBox');

  if (wantsDrift) {
    GameState.isDrifting = true;
    GameState.driftChargeTime += rawDt * (1 + (upg.tires - 1) * 0.18);
    runStats.driftSecs += rawDt;

    const ptsAdded = Math.floor(680 * rawDt * GameState.combo);
    GameState.currentDriftScore += ptsAdded;
    GameState.score += ptsAdded;
    GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.driftPerSec * rawDt);
    advanceContractProgress('DRIFT_PTS', ptsAdded);

    // Determine 3-Tier Drift Boost (Cyan -> Orange -> Purple Plasma)
    if (GameState.driftChargeTime > 2.2) GameState.driftTier = 3;
    else if (GameState.driftChargeTime > 1.1) GameState.driftTier = 2;
    else GameState.driftTier = 1;

    const tierColors = ['#00f0ff', '#00f0ff', '#ff6600', '#d946ef'];
    const sparkCol = tierColors[GameState.driftTier];
    for (let s = 0; s < 3; s++) {
      GameState.particles.push({
        x: (Math.random() - 0.5) * 95,
        y: 0,
        vx: -steerInput * (140 + Math.random() * 120),
        vy: -45 - Math.random() * 95,
        color: sparkCol,
        life: 0.38
      });
    }

    if (driftBox) {
      driftBox.classList.remove('hidden');
      const tierNames = ['', 'TIER 1 CYAN', 'TIER 2 BLAZING', 'TIER 3 PURPLE MAX!'];
      driftBox.textContent = `🔥 DRIFT: +${GameState.currentDriftScore} PTS • ${tierNames[GameState.driftTier]}`;
    }
  } else {
    if (GameState.isDrifting) {
      // Release Drift -> Fire Slingshot Mini-Turbo if Tier >= 1!
      if (GameState.driftTier >= 1) {
        const boostAdd = GameState.driftTier * 9;
        GameState.speed = Math.min(warpMaxMph + 8, GameState.speed + boostAdd);
        SoundEngine.playBoosterHit();
        triggerAnnouncement(
          `💨 TIER-${GameState.driftTier} DRIFT SLINGSHOT!`,
          `+${GameState.currentDriftScore} DRIFT PTS BANKED! +${boostAdd} MPH`,
          1200
        );
      }
      GameState.isDrifting = false;
      GameState.currentDriftScore = 0;
      GameState.driftChargeTime = 0;
      GameState.driftTier = 0;
      if (driftBox) driftBox.classList.add('hidden');
    }
  }

  // Lateral motion: grip-limited tyres against the corner's pull (src/handling.js).
  lateral.x = GameState.playerX;
  lateral.vx = GameState.playerVX;
  latParams.speedMph = GameState.speed;
  latParams.curve = currentSeg ? currentSeg.curve : 0;
  latParams.bank = currentSeg ? currentSeg.bank : 0;
  latParams.worldScale = timeScale;
  latParams.braking = Boolean(braking);
  latParams.throttle = Boolean(accelerating);
  latParams.drifting = GameState.isDrifting && Boolean(braking);
  latParams.gripBonus = GameState.zoneTimer > 0 ? 1.25 : 1;
  latParams.use = drive.use; // friction circle (ticket 0131)
  // Weight transfer follows the chassis pitch (ticket 0181): + = nose down, about 7° at full brakes.
  latParams.weight = Math.max(-1, Math.min(1, (GameState.chassisPitch || 0) / 7));
  latParams.surface = ERAS[GameState.eraIndex].grip || 1; // the era's road (dusty canyon, wet neon)
  latParams.airborne = GameState.playerY > 4;
  stepLateral(lateral, steerInput, rawDt, latParams);
  GameState.playerX = lateral.x;
  GameState.playerVX = lateral.vx;
  GameState.tyreSlip = lateral.slip;
  // The body's yaw on the road (travel heading + sideslip; the tail steps out in a drift).
  GameState.carYaw = lateral.yaw;
  GameState.driftAngle = lateral.yaw * (180 / Math.PI);
  // Body roll on its springs from the cornering load (rolls away from the turn).
  const rollF = -170 * ((GameState.chassisRoll || 0) - lateral.load * 0.09) - 15 * (GameState.chassisRollVel || 0);
  GameState.chassisRollVel = (GameState.chassisRollVel || 0) + rollF * rawDt;
  GameState.chassisRoll = (GameState.chassisRoll || 0) + GameState.chassisRollVel * rawDt;

  // Side-Slam Shove Button / Key (F)
  if (InputState.slamPressed && GameState.slamCooldown <= 0) {
    InputState.slamPressed = false;
    GameState.slamCooldown = 0.7;
    const slamDir = steerInput !== 0 ? Math.sign(steerInput) : 1;
    GameState.playerVX += slamDir * 1.85;
    SoundEngine.playStunt();
  }
  if (GameState.slamCooldown > 0) GameState.slamCooldown -= rawDt;

  // Strict Rigid-Body Toy-Track Side-Wall Containment (Car half-width = 0.14, Wall = ±0.86 -> Max X = ±0.72)
  const MAX_TRACK_X = 0.72;
  // Walls (ticket 0131, src/handling.js wallContact): a bounce with friction that scrubs
  // speed by how hard you hit, a yaw kick away from the barrier, and grinding costs speed.
  // Touching the wall (pressed against it, or bouncing off this step) grinds: smoke and scrub.
  GameState.wallGrind = Math.abs(GameState.playerX) >= MAX_TRACK_X - 0.004;
  if (GameState.playerX < -MAX_TRACK_X || GameState.playerX > MAX_TRACK_X) {
    const side = GameState.playerX < 0 ? -1 : 1;
    GameState.playerX = side * MAX_TRACK_X;
    chargePenalty(logWall(GameState.penaltyLog, rawDt * 1000, GameState.speed, Math.round(GameState.raceTime * 1000)), 'WALL SCRAPE');
    // Points barely move for a scrape now (ticket 0165); grinding wears HP instead, never to 0.
    // A shield (0177) takes a hard hit into the wall and buys a second of grinding for free.
    if (GameState.playerVX * side > 0.35 && GameState.speed >= 30 && GameState.invulnTimer <= 0) shieldBreak(side * 0.6);
    if (GameState.speed >= 30 && GameState.invulnTimer <= 0) {
      GameState.hp = Math.max(Math.min(GameState.hp, 1), GameState.hp - 5 * activeCarParams().damageMult * currentDifficulty().damage * rawDt);
    }
    const hit = GameState.playerVX * side > 0;
    lateral.vx = GameState.playerVX;
    const lost = wallContact(lateral, side, GameState.speed, rawDt);
    GameState.playerVX = lateral.vx;
    GameState.speed = Math.max(Math.min(GameState.speed, 25), GameState.speed - lost);
    if (hit) GameState.particles.push({ x: side * 38, y: -5, vx: -side * 90, vy: -60, color: '#ffea00', life: 0.25 });
  }
  if (smoke2d) smoke2d.step(rawDt, GameState, gfxQ.particles == null ? 1 : gfxQ.particles, !view3d);

  // 3. Split-Track Crossroads Choice: a compact two-arrow cue (src/fork.js, ticket 0019),
  //    written only when it changes (this runs every sim step).
  const onFork = !!(currentSeg && currentSeg.trackType === 'SPLIT_FORK');
  showForkCue(forkCueState(onFork, GameState.playerX));
  if (onFork) {
    GameState.forkPending = true;
  } else {
    if (GameState.forkPending) {
      GameState.forkPending = false;
      const chosen = forkLean(GameState.playerX);
      GameState.branchName = chosen === 'LEFT' ? 'SKY-LOOP SHORTCUT' : 'CEDAR TURBO TUNNEL';
      const branchBadge = document.getElementById('trackBranchBadge');
      if (branchBadge) branchBadge.textContent = `ROUTE: ${GameState.branchName}`;
      if (chosen === 'RIGHT' && GameState.mode === 'ARCADE') {
        const got = RS.raceClock.extend(7.0);
        GameState.timeLeft = RS.raceClock.timeLeft;
        triggerAnnouncement('CEDAR TURBO SHORTCUT!', got > 0 ? `+${got}s BONUS TIME!` : 'NO TIME LEFT TO WIN — DRIVE!', 1400);
      } else {
        GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.skyLoop);
        triggerAnnouncement('ORANGE TRACK SKY-LOOP!', '+35% FLUX CORE CHARGE!', 1400);
      }
      generateNextTrackBiome(chosen);
    }
  }

  // 3b. Orange-track set pieces (sprint 4, src/setpieces.js): booster gates kick you up to loop
  //     speed; missing a gap costs time, never points (loops: handling.js loopStep above).
  const spF = currentSeg ? currentSeg.feature : null;
  const spEv = stepSetPieces(GameState, spF, GameState.trackPos + ROAD_CFG.playerZOffset);
  if (spEv === 'BOOST') {
    SoundEngine.playBoosterHit();
    if (spF.boostTo) triggerAnnouncement('BOOSTER GATE!', `${spF.boostTo} MPH — HOLD IT`, 900);
  } else if (spEv === 'GAP_FALL') {
    GameState.speed = Math.max(28, GameState.speed * 0.6);
    GameState.playerVY = 420; // a scramble across the gap: slow, but you make it
    triggerAnnouncement('MISSED THE JUMP!', '52+ MPH OFF THE RAMP', 1200);
  }

  // 4. Jump Ramps, Hover Conversion & Mid-Air Stunts
  if (currentSeg && currentSeg.trackType === 'JUMP_RAMP' && GameState.playerY <= 2 && GameState.speed > 52) {
    GameState.playerVY = 560 + GameState.speed * 3.6;
    SoundEngine.playStunt();
    triggerAnnouncement('MEGA TOY-TRACK LAUNCH!', 'PRESS SPACE OR HOVER FOR MID-AIR TRICK!', 1500);
  }

  if (InputState.hoverPressed || gp.hover) {
    InputState.hoverPressed = false;
    if (GameState.playerY <= 3) {
      const jumpScale = (activeChar && activeChar.jumpBonus) ? activeChar.jumpBonus : 1.0;
      GameState.playerVY = 490 * jumpScale;
      GameState.hoverActiveTimer = 0.55;
      SoundEngine.playStunt();
    }
  }
  if (GameState.hoverActiveTimer > 0) {
    GameState.hoverActiveTimer = Math.max(0, GameState.hoverActiveTimer - rawDt);
  }
  if (GameState.playerY > 0 || GameState.playerVY !== 0) {
    GameState.playerY += GameState.playerVY * rawDt;
    GameState.playerVY -= 1550 * (ERAS[GameState.eraIndex].gravity || 1) * rawDt; // Newtonian gravity (low-G in orbit, ticket 0155)
    if (GameState.playerY <= 0) {
      if (GameState.playerVY < -120) {
        GameState.suspVel = -Math.min(260, Math.abs(GameState.playerVY) * 0.45);
        GameState.chassisPitchVel += 10;
      }
      // Award Air-Trick Combo Landing Turbo Surge!
      if (GameState.airTrickCount > 0) {
        const boostMph = GameState.airLandingBoostMph || 14;
        GameState.speed = Math.min(142, GameState.speed + boostMph);
        GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.airTrickPerTrick * GameState.airTrickCount);
        SoundEngine.playBoosterHit();
        triggerAnnouncement(
          `🔥 LANDED x${GameState.airTrickCount} STUNT COMBO!`,
          `+${boostMph} MPH TURBO SURGE & MAGNET ACTIVE!`,
          1200
        );
        GameState.airTrickCount = 0;
        GameState.airTrickNames = [];
        GameState.airLandingBoostMph = 0;
        const driftBox = document.getElementById('driftCounterBox');
        if (driftBox && !GameState.isDrifting) driftBox.classList.add('hidden');
      }
      // Land straight to keep your speed (ticket 0120).
      GameState.speed *= landingKeep(GameState.playerVX, GameState.steerInput, lateral.yaw - lateral.heading);
      GameState.playerY = 0;
      GameState.playerVY = 0;
      GameState.stuntSpinAngle = 0;
      GameState.trickPitchAngle = 0;
    }
  }

  if (GameState.stuntSpinAngle > 0) {
    GameState.stuntSpinAngle = Math.max(0, GameState.stuntSpinAngle - 780 * rawDt);
  } else if (GameState.stuntSpinAngle < 0) {
    GameState.stuntSpinAngle = Math.min(0, GameState.stuntSpinAngle + 780 * rawDt);
  }
  if (GameState.trickPitchAngle > 0) {
    GameState.trickPitchAngle = Math.max(0, GameState.trickPitchAngle - 780 * rawDt);
  }
  if (GameState.magnetTimer > 0) {
    GameState.magnetTimer = Math.max(0, GameState.magnetTimer - rawDt);
  }
  if (GameState.phaseJukeTimer > 0) {
    GameState.phaseJukeTimer = Math.max(0, GameState.phaseJukeTimer - rawDt);
  }

  // 5. Street-Racer Slipstream Drafting Wake Detection behind Moving Rivals & Traffic
  GameState.draftingCar = null;
  const allMoving = LiveTraffic.racers.concat(LiveTraffic.traffic);
  for (let m = 0; m < allMoving.length; m++) {
    const mc = allMoving[m];
    if (mc.takenDown) continue;
    const dz = mc.worldZ - (GameState.trackPos + ROAD_CFG.playerZOffset);
    if (dz > 220 && dz < 2400 && Math.abs(mc.offset - GameState.playerX) < 0.28) {
      GameState.draftingCar = mc;
      break;
    }
  }

  if (GameState.draftingCar && GameState.speed > 50) {
    GameState.draftCharge = Math.min(100, GameState.draftCharge + 34 * rawDt);
    GameState.speed = Math.min(warpMaxMph, GameState.speed + 14 * rawDt);
    advanceContractProgress('SLIPSTREAM', 34 * rawDt);
    if (GameState.draftCharge >= 100) {
      GameState.draftCharge = 0;
      GameState.speed = Math.min(warpMaxMph + 12, GameState.speed + 22);
      GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.draftSling);
      SoundEngine.playBoosterHit();
      triggerAnnouncement('💨 SLIPSTREAM TURBO SLINGSHOT!', '+22 MPH WAKE BOOST & +25% FLUX!', 1400);
    }
  } else {
    GameState.draftCharge = Math.max(0, GameState.draftCharge - 12 * rawDt);
  }

  // 6. Flux Core Charge & 88 MPH Time Warp
  // Earned warp pacing (ticket 0014): slower passive gain; skill (drift/draft/takedowns) fills the rest.
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + passiveFluxRate(GameState.speed, upg.flux) * carP.fluxMult * rawDt);
  GameState.sinceWarp += rawDt;

  if (InputState.boostPressed || gp.boost) {
    InputState.boostPressed = false;
    if (GameState.playerY > 38) {
      GameState.stuntSpinAngle = 360;
      const stuntPts = 1600 * GameState.combo;
      GameState.score += stuntPts;
      GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.barrelRoll);
      SoundEngine.playStunt();
      triggerAnnouncement('FLUX BARREL ROLL!', `+${stuntPts} PTS!`, 1200);
    } else if (boostOutcome(GameState.fluxCharge) !== 'none') {
      GameState.speed = Math.max(GameState.speed + 26, 92);
      // Only a nearly-full meter turns a boost into a warp; otherwise it's a nitro purge.
      if (boostOutcome(GameState.fluxCharge) === 'warp' && GameState.sinceWarp >= FLUX.warpCooldown) {
        triggerTimeWarp();
      } else {
        SoundEngine.playBoosterHit();
        GameState.fluxCharge = Math.max(0, GameState.fluxCharge - FLUX.boostCost);
        triggerAnnouncement('⚡ NITRO FLUX PURGE!', 'SURGING TO 88 MPH!', 1100);
      }
    }
  }

  if (GameState.warpActiveTimer <= 0 && warpReady(GameState.fluxCharge, GameState.speed, GameState.sinceWarp)) {
    triggerTimeWarp();
  }
  if (GameState.warpActiveTimer > 0) GameState.warpActiveTimer -= rawDt;

  if (currentSeg && GameState.speed >= 84 && GameState.playerY < 20) {
    currentSeg.flameLeft = true;
    currentSeg.flameRight = true;
    currentSeg.flameOffset = GameState.playerX;
  }

  // 7. Update AI Cars, Checkpoints, Collectibles & Side-Slam Takedowns
  for (let offset = -1; offset <= 16; offset++) {
    const seg = track.seg(currentSegIdx + offset);
    if (!seg) continue;

    // Move AI Rival & Police Cars dynamically across lanes
    for (let c = 0; c < seg.cars.length; c++) {
      const car = seg.cars[c];
      if (car.takenDown) continue;
      if (car.type === 'POLICE_INTERCEPTOR' && car.name !== 'ROADBLOCK') {
        const dirToPlayer = Math.sign(GameState.playerX - car.offset);
        car.offset += dirToPlayer * 0.06 * dt;
      } else if (car.type === 'STREET_RIVAL') {
        car.offset += Math.sin(GameState.trackPos * 0.0008 + car.aiPhase) * 0.05 * dt;
      }
      car.offset = Math.max(-0.88, Math.min(0.88, car.offset));
    }

    // Magnetic pickups just ahead drift toward the car.
    if (offset >= 0 && offset <= PICKUP.magnetSegs) {
      for (let i = 0; i < seg.items.length; i++) {
        const it = seg.items[i];
        const def = PICKUPS[it.type];
        if (def && !it.collected) magnetPull(it, def, GameState.playerX, offset, pickupReach(def, GameState.speed, coarsePointer, GameState.magnetTimer > 0 || GameState.dodgeStreak >= 4 || power.t.MAGNET > 0), rawDt);
      }
    }

    if (offset < -1 || offset > 1) continue;

    // Checkpoint Gate
    if (seg.trackType === 'CHECKPOINT' && !seg.cpClaimed) {
      seg.cpClaimed = true;
      healPlayerHp(20);
      SoundEngine.playCheckpoint();
      let cpTime = 0;
      if (GameState.mode === 'ARCADE') {
        cpTime = RS.raceClock.extend(12.0);
        GameState.timeLeft = RS.raceClock.timeLeft;
      }
      GameState.score += 1200 * GameState.combo;
      triggerAnnouncement(
        `🏁 CHECKPOINT! ${ordinal(GameState.racePosition)} PLACE`,
        GameState.mode === 'ARCADE' ? (cpTime > 0 ? `+${cpTime}s TIME EXTENDED!` : 'FINAL STRETCH — NO MORE TIME!') : '+1200 STREET REP!',
        1450
      );
    }

    // Pickups (src/pickups.js): one collection path for every kind.
    for (let i = 0; i < seg.items.length; i++) {
      const item = seg.items[i];
      if (item.collected || item.smashed) continue;
      const def = PICKUPS[item.type];
      if (!def) continue;
      if (Math.abs(GameState.playerX - item.offset) < pickupReach(def, GameState.speed, coarsePointer, GameState.magnetTimer > 0 || GameState.dodgeStreak >= 4 || power.t.MAGNET > 0) && GameState.playerY < 95) {
        item.collected = true;
        applyPickup(item, def);
      }
    }

    // Rival & Police Collision vs. Side-Slam Takedown vs. 2-Wheel Squeeze!
    if (offset === 0 && GameState.playerY < 45) {
      for (let c = 0; c < seg.cars.length; c++) {
        const car = seg.cars[c];
        if (car.takenDown) continue;
        const dist = Math.abs(GameState.playerX - car.offset);
        const hitWidth = GameState.twoWheelTimer > 0 ? 0.13 : 0.23; // 2-Wheel mode squeezes through narrower gaps!

        if (dist < hitWidth) {
          const isAggressiveSlam = (
            GameState.agroTimer > 0 ||
            GameState.warpActiveTimer > 0 ||
            GameState.isDrifting ||
            Math.abs(GameState.playerVX) > 0.75 ||
            GameState.speed >= 86
          );
          if (isAggressiveSlam || shieldBreak(car.offset - GameState.playerX)) {
            triggerRivalTakedown(
              car,
              car.type === 'POLICE_INTERCEPTOR' ? '🚓 COP INTERCEPTOR TAKEDOWN!' : '🔥 SIGNATURE SIDE-SLAM TAKEDOWN!'
            );
          } else {
            SoundEngine.playCrash();
            GameState.speed = Math.max(32, GameState.speed * 0.62);
            GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0;
            GameState.screenShake = 0.3;
            car.offset += (GameState.playerX < car.offset ? 0.45 : -0.45);
            triggerAnnouncement('💥 TRAFFIC IMPACT!', 'DRIFT, SLAM (F), OR USE AGRO (X) TO TAKEDOWN!', 1200);
          }
        } else if (dist < 0.44 && !car.nearMissed && GameState.speed > 62) {
          car.nearMissed = true;
          GameState.combo = Math.min(12, GameState.combo + 1);
          GameState.comboTimer = 5.0;
          GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.rivalNearMiss);
          const nmPts = (GameState.twoWheelTimer > 0 ? 1200 : 600) * GameState.combo;
          GameState.score += nmPts;
          SoundEngine.playCoinPickup();
          advanceContractProgress('NEAR_MISS', 1);
          triggerAnnouncement(
            GameState.twoWheelTimer > 0 ? `📐 2-WHEEL THREAD! x${GameState.combo}` : `🔥 NEAR MISS! x${GameState.combo}`,
            `+${nmPts} PTS & +14% FLUX`,
            900
          );
        }
      }
    }
  }

  if (GameState.comboTimer > 0) {
    GameState.comboTimer -= rawDt;
    // The chain lapses when its timer runs out: back to ×1 and a fresh streak. (These used to
    // sit outside the `if`, so the streak, the trick magnet and an air combo in progress were
    // wiped on every step the timer was running. Magnet and air tricks keep their own timers.)
    if (GameState.comboTimer <= 0) { GameState.combo = 1; GameState.dodgeStreak = 0; }
  }

  if (GameState.screenShake > 0) {
    GameState.screenShake = Math.max(0, GameState.screenShake - rawDt * 1.5);
  }

  // Camera Bank (Includes 2-Wheel Tilt Angle!)
  const twoWheelTilt = GameState.twoWheelTimer > 0 ? -14 : 0;
  const targetBank = (currentSeg ? currentSeg.bank * 5 : 0) - steerInput * 2.2 + twoWheelTilt;
  GameState.cameraBank += (targetBank - GameState.cameraBank) * Math.min(1, rawDt * 6);
  const targetLoopPitch = (currentSeg && currentSeg.trackType === 'LOOP') ? 18 : 0;
  GameState.loopPitchOffset += (targetLoopPitch - GameState.loopPitchOffset) * Math.min(1, rawDt * 3);

  // Update Particles, Lightning & Flying Takedown Wrecks
  for (let i = GameState.particles.length - 1; i >= 0; i--) {
    const p = GameState.particles[i];
    p.x += p.vx * rawDt;
    p.y += p.vy * rawDt;
    p.life -= rawDt;
    if (p.life <= 0) GameState.particles.splice(i, 1);
  }
  for (let i = GameState.lightningBolts.length - 1; i >= 0; i--) {
    GameState.lightningBolts[i].life -= rawDt;
    if (GameState.lightningBolts[i].life <= 0) GameState.lightningBolts.splice(i, 1);
  }
  // Update 2026 Animated Power-Up Acquisitions, Shockwaves & 3D Debris Shards
  if (GameState.carSurgeTimer > 0) GameState.carSurgeTimer = Math.max(0, GameState.carSurgeTimer - rawDt);
  if (GameState.carJoltY > 0) GameState.carJoltY = Math.max(0, GameState.carJoltY - rawDt * 45);

  for (let i = GameState.pickupAnimations.length - 1; i >= 0; i--) {
    const pa = GameState.pickupAnimations[i];
    pa.progress += rawDt * 2.4;
    pa.spin += rawDt * 18;
    if (pa.progress >= 1) GameState.pickupAnimations.splice(i, 1);
  }
  for (let i = GameState.hitShockwaves.length - 1; i >= 0; i--) {
    const sw = GameState.hitShockwaves[i];
    sw.life -= rawDt;
    const t = 1 - Math.max(0, sw.life / sw.maxLife);
    sw.radius = 12 + t * sw.maxRadius;
    if (sw.life <= 0) GameState.hitShockwaves.splice(i, 1);
  }
  for (let i = GameState.debrisShards.length - 1; i >= 0; i--) {
    const d = GameState.debrisShards[i];
    d.x += d.vx * rawDt;
    d.y += d.vy * rawDt;
    d.vy += 680 * rawDt; // Gravity
    if (d.y > 20) {
      d.y = 20;
      d.vy = -d.vy * 0.55; // Bounce off the orange toy-track!
    }
    d.rot += d.vRot * rawDt;
    d.life -= rawDt;
    if (d.life <= 0) GameState.debrisShards.splice(i, 1);
  }

  for (let i = GameState.flyingWrecks.length - 1; i >= 0; i--) {
    const w = GameState.flyingWrecks[i];
    w.x += w.vx * rawDt;
    w.y += w.vy * rawDt;
    w.vy -= 980 * rawDt;
    w.rot += w.vRot * rawDt;
    w.life -= rawDt;
    if (w.life <= 0) GameState.flyingWrecks.splice(i, 1);
  }

  // Race shape (ticket 0016): decaying bonuses + a hard cap, so every arcade run ends.
  if (GameState.mode === 'ARCADE' && GameState.racePhase !== 'FINISHED') {
    const beat = RS.raceClock.tick(rawDt);
    GameState.timeLeft = RS.raceClock.timeLeft;
    if (beat === 'final') {
      GameState.finalStretch = true;
      triggerAnnouncement('🏁 FINAL STRETCH 🏁', 'LAST CHANCE — CHAIN EVERYTHING!', 1700, 3);
    } else if (beat === 'over' && GameState.finishTime == null) {
      endRaceRun('⏱️ TIME UP!');
    }
  }
  stepRunner(rawDt);
  if (GameState.mode === 'LIVE') live.update();
  if (GameState.racePhase === 'RACING' && GameState.status === 'PLAYING' && GameState.finishTime != null) finishRace();
  if (GameState.racePhase === 'FINISHED') GameState.score = RS.finishScore; // the line is the line
}

// The fork cue's DOM, touched only when its state changes ('OFF' | 'LEFT' | 'RIGHT').
export let forkCueShown = 'OFF';

export function showForkCue(state) {
  if (state === forkCueShown) return;
  forkCueShown = state;
  const banner = document.getElementById('forkChoiceBanner');
  if (!banner) return;
  banner.classList.toggle('hidden', state === 'OFF');
  if (state === 'OFF') return;
  document.getElementById('forkLeftCard')?.classList.toggle('fork-lean', state === 'LEFT');
  document.getElementById('forkRightCard')?.classList.toggle('fork-lean', state === 'RIGHT');
}

// Coach (ticket 0002): teaches only what you haven't learned yet, in one short line, and
// always yields to the announcer so two messages never stack.
export const COACH_LESSON = { PINE_TREE_HAZARD: 'steer', LOW_LASER_BAR: 'jump', HIGH_LIGHT_GATE: 'slide', FLUX_CRATE: 'smash' };

export const COACH_LEARNED_AFTER = 2;

export function updateInteractiveCoach(currentSegIdx) {
  const banner = document.getElementById('interactiveCoachBanner');
  if (!banner) return;
  if (GameState.coachDismissed) { hideCoach(banner); return; }
  // A pending fork is the decision on screen; the coach waits until it's made (ticket 0019).
  if (GameState.forkPending) { RS.coachYieldUntil = performance.now() + 350; hideCoach(banner); return; }
  // Yield to the announcer, and wait for its fade-out so the two never cross-fade on top of
  // each other in the shared message lane (ticket 0021).
  const nowMs = performance.now();
  if (announcer.isVisible()) { RS.coachYieldUntil = nowMs + 350; hideCoach(banner); return; }
  if (nowMs < RS.coachYieldUntil) { hideCoach(banner); return; }

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
  } else if (GameState.fluxCharge >= 95 && GameState.timeWarps === 0) {
    iconEl.textContent = '⚡'; titleEl.textContent = 'FLUX FULL';
    descEl.textContent = 'Hold 88 mph — or hit SPACE / ⚡ — to jump eras';
  } else if (GameState.distance < 300) { // just after the green light
    iconEl.textContent = '🎓'; titleEl.textContent = 'TIP';
    descEl.textContent = 'Draft the green wake behind rivals for a slingshot';
  } else {
    hideCoach(banner);
    return;
  }
  banner.style.opacity = '1';
  banner.style.pointerEvents = '';
}

// Race HUD (ticket 0051): one reused view object, repainted ~20 times a second.
export let raceHud = null;

export let hudNextAt = 0;

export function updateRaceHud(force) {
  const now = performance.now();
  if (!force && now < hudNextAt) return;
  hudNextAt = now + 50;
  if (!raceHud) raceHud = createHud();
  hudView.position = GameState.racePosition;
  hudView.total = GameState.totalRacers;
  hudView.progress = GameState.distance;
  hudView.length = GameState.raceLength || raceLengthFor(GameState.levelIndex);
  hudView.raceTime = GameState.finishTime != null ? GameState.finishTime : GameState.raceTime;
  hudView.timeLeft = GameState.timeLeft;
  hudView.clockUrgent = GameState.finalStretch || GameState.timeLeft < 10;
  hudView.infinite = GameState.mode === 'INFINITE';
  hudView.mph = GameState.speed;
  hudView.flux = GameState.fluxCharge;
  hudView.nos = GameState.nosFill || 0;
  hudView.nosOn = Boolean(GameState.nosBurning);
  hudView.hpFrac = GameState.maxHp ? GameState.hp / GameState.maxHp : 1;
  hudView.hp = GameState.hp;
  hudView.maxHp = GameState.maxHp;
  hudView.tier = GameState.tier;
  hudView.score = GameState.score;
  raceHud.update(hudView);
  if (ghostRace.active) ghostRace.update(hudView.raceTime, GameState.distance, GameState.speed, hudView.length);
}

// Ghost racing (ticket 0092): every race records a trace; "race the ghost" loads someone's
// best on this track for the next start and shows it on the HUD strip.
export const ghostRecorder = createGhostRecorder();

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
    } else if (GameState.fluxCharge >= 95) {
      fluxHint.textContent = '⚡ FLUX READY! HIT 88 MPH OR SPACE!';
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
  setSteerHint(RS.onboarding.hint(performance.now()) === 'steer');
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
  GameState.trafficGapScale = 1;

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
  GameState.sinceWarp = FLUX.warpCooldown;
  GameState.warpFxTimer = 0;
  sparks.clear();
  if (smoke2d) smoke2d.clear();
  nearMisses.reset();
  GameState.draftCharge = 0;
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
    triggerAnnouncement(GameState.daily ? `📅 DAILY: ${GameState.daily.modifier.name}` : `🏁 ${lvl.name} 🏁`, 'TAP ⚡ RIGHT ON GREEN FOR A ROCKET START', 2400, 1);
  },
  go() {
    GameState.racePhase = 'RACING';
    GameState.speed = 26;
    if (RS.launchPressAt != null) applyLaunch(RC.judgeLaunch(RS.launchPressAt));
    RS.onboarding.start(performance.now());
  },
};

export const handleStartEvents = (events) => RC.playStartEvents(events, startHooks);

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
  handleStartEvents(RS.startSeq.update(rawDt));
}

/** After GO: the late rocket-start window, the GO! hold, live callouts, the finish roll-out. */
export function updateRaceCeremony(rawDt) {
  if (RS.startSeq && !RS.startSeq.done) {
    if (!RS.launchJudged && InputState.boostPressed && RS.startSeq.t <= RC.LAUNCH.goodEnd) {
      InputState.boostPressed = false;
      applyLaunch(RC.judgeLaunch(RS.startSeq.t));
    }
    handleStartEvents(RS.startSeq.update(rawDt));
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
    GameState.runCoins += lvl.bonusReward;
    SaveStore.data.fluxCoins += lvl.bonusReward;
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
export const LiveTrafficMethods = {
  update(dt, rawDt, paceMult) {
    const playerZ = GameState.visualPlayerZ || (GameState.trackPos + ROAD_CFG.playerZOffset);
    // A jump of the player's Z far beyond one step's travel (a respawn, a warp, a debug move)
    // is a teleport, not motion: don't sweep it through every car in between.
    const prevPZ = this.prevPlayerZ && Math.abs(playerZ - this.prevPlayerZ) < 2500 ? this.prevPlayerZ : playerZ;
    this.prevPlayerZ = playerZ;
    const minPZ = Math.min(prevPZ, playerZ);
    const maxPZ = Math.max(prevPZ, playerZ);

    const speedToWorld = (11000 * paceMult) / 88;
    const playerWorldVZ = GameState.speed * speedToWorld;
    const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
    const playerMass = activeCarParams().massKg;
    const playerInvMass = 1 / playerMass;
    const playerHalfW = (GameState.twoWheelTimer > 0 || activeChar.shape === 'LIGHTCYCLE') ? 0.10 : 0.14;
    const playerHalfL = 105;
    const playerTopY = GameState.playerY + (GameState.isDuckSliding ? 18 : 34);
    const playerBotY = GameState.playerY;

    // 1. Update AI Steering & Target Velocities for Rivals & Traffic
    const aw = this.fillAiWorld(playerZ, speedToWorld);
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.takenDown) {
        r.respawnTimer -= rawDt;
        if (r.respawnTimer <= 0) {
          // A wrecked rival rejoins behind you, same driver, and has to fight back.
          r.takenDown = false;
          r.y = 0; r.vy = 0; r.vx = 0; r.rot = 0; r.vRot = 0; r.yaw = 0; r.vYaw = 0;
          r.worldZ = playerZ - 2600 - i * 500;
          r.prevZ = r.worldZ;
          r.mph = Math.max(45, GameState.speed * 0.8);
        }
        continue;
      }

      if (r.ai && aw) {
        // Real racing AI (src/rival-ai.js): corners, apexes, passes, drafting, NOS, defending.
        RAI.stepRival(r, r.ai, aw, r.progress - GameState.distance, rawDt);
        r.vz = r.mph * speedToWorld;
        r.prevZ = r.worldZ;
        r.prevOffset = r.offset;
        continue;
      }
      // Fallback driver: race pace with a soft rubber band (src/raceflow.js); finished rivals cruise.
      const lead = r.progress - GameState.distance;
      const targetMph = r.finishTime != null ? 60 : rivalTargetMph(r.pace, lead);
      r.nosActive = targetMph > r.pace + 5;
      r.mph += (targetMph - r.mph) * Math.min(1, rawDt * 2.5);
      r.vz = r.mph * speedToWorld;
      const nT = this.traffic.length;
      for (let h = 0; h < nT + this.obstacles.length; h++) {
        const hz = h < nT ? this.traffic[h] : this.obstacles[h - nT];
        const dz = hz.worldZ - r.worldZ;
        if (dz > 0 && dz < 850 && Math.abs(hz.offset - r.offset) < 0.30) {
          r.targetOffset = hz.offset >= 0 ? -0.46 : 0.46;
          break;
        }
      }
      r.vx += (r.targetOffset - r.offset) * 3.8 * rawDt;
      r.prevZ = r.worldZ;
      r.prevOffset = r.offset;
    }

    const waveTrafficMphBonus = Math.min(16, (GameState.waveTier - 1) * 2.0);
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i];
      tr.vz = (tr.mph + waveTrafficMphBonus) * speedToWorld;
      // Keep the racing line clear: drift to a clear lane (or the shoulder) on this side of it.
      if (!tr.takenDown) {
        const tgt = this.planner.trafficTarget(tr.worldZ, tr.offset, tr.halfW, tr.halfL);
        const maxStep = TRAFFIC_LATERAL * rawDt;
        tr.offset += Math.max(-maxStep, Math.min(maxStep, tgt - tr.offset));
      }
      tr.prevZ = tr.worldZ;
      tr.prevOffset = tr.offset;
    }

    for (let i = 0; i < this.drawObstacles.length; i++) {
      const ob = this.drawObstacles[i];
      ob.prevZ = ob.worldZ;
      ob.prevOffset = ob.offset;
    }

    // 2. Rigid-body world (ticket 0074): 240 Hz sub-steps, Z-hash broadphase, sleeping props.
    this.props.retireBehind(playerZ, 1800);
    if (this.props.live.length + this.obstacles.length + this.traffic.length + this.racers.length !== this.bodies.length) this.rebuildBodyLists();
    this.spawnProps(playerZ);
    this.world.step(this.bodies, dt, rawDt, this.onChain);

    // 3. Player ↔ Rivals Swept 3D Rigid-Body Collision + PIT-Maneuver Torque Solver
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.takenDown) continue;

      const minRZ = Math.min(r.prevZ, r.worldZ);
      const maxRZ = Math.max(r.prevZ, r.worldZ);
      if (this.checkSweptOverlapZ(minPZ, maxPZ, playerHalfL, minRZ, maxRZ, r.halfL)) {
        const latDist = Math.abs(GameState.playerX - r.offset);
        const minLatSep = playerHalfW + r.halfW;
        const vertOverlap = (playerBotY < r.y + r.height) && (playerTopY > r.y);
        if (latDist < minLatSep && vertOverlap) {
          const isSlam = (GameState.agroTimer > 0 || GameState.warpActiveTimer > 0 || Math.abs(GameState.playerVX) > 0.62 || GameState.isDrifting);
          const leverX = r.offset - GameState.playerX;
          if (isSlam) {
            r.applyImpulseAndTorque(leverX >= 0 ? 3200 : -3200, 680000, playerWorldVZ * 800, leverX);
            r.takenDown = true;
            r.respawnTimer = 6.0;
            GameState.suspVel -= 140;
            triggerRivalTakedown(r, '🔥 PIT-MANEUVER TAKEDOWN!');
          } else {
            const totalInvMass = playerInvMass + r.invMass;
            const e = 0.48;
            if (prevPZ < r.prevZ - r.halfL * 0.55 && GameState.speed > r.mph) {
              // Rear-end collision with off-center PIT-maneuver torque!
              GameState.trackPos = r.worldZ - ROAD_CFG.playerZOffset - (playerHalfL + r.halfL + 6);
              const vRelMph = GameState.speed - r.mph;
              const jMph = (1 + e) * vRelMph / totalInvMass;
              GameState.speed = Math.max(24, GameState.speed - jMph * playerInvMass);
              r.mph += jMph * r.invMass;
              r.applyImpulseAndTorque(leverX * 1800, 120000, jMph * 400, leverX);
              GameState.suspVel -= 160;
              GameState.chassisPitchVel += 12; // Nose dive on front impact!
              SoundEngine.playImpact('crash2', 120, 0.1, 0.1);
            } else {
              // Door-to-door side collision with body roll & lateral impulse!
              const dir = GameState.playerX < r.offset ? -1 : 1;
              const overlapX = minLatSep - latDist + 0.02;
              GameState.playerX += dir * overlapX * 0.55;
              r.offset -= dir * overlapX * 0.55;
              const vRelX = GameState.playerVX - r.vx;
              const jx = -(1 + e) * vRelX / totalInvMass;
              GameState.playerVX += (jx * playerInvMass) + dir * 0.38;
              r.applyImpulseAndTorque(-jx - dir * 800, 80000, 0, leverX);
              GameState.chassisRollVel += dir * 18;
              SoundEngine.playImpact('bump', 140, 0.08, 0.08);
            }
          }
        }
      }
    }
    this.updateStandings(rawDt, playerZ, speedToWorld);

    // 4. Player ↔ Civilian Traffic Swept 3D Rigid-Body Solver
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i];
      const relZ = tr.worldZ - playerZ;
      // Traffic doesn't drive loops, corkscrews or gaps (sprint 4): it peels off and rejoins ahead.
      const trF = featureAt(tr.worldZ);
      if (relZ < -800 || tr.takenDown || (trF && trF.kind !== 'BOOSTER')) {
        tr.takenDown = false;
        tr.y = 0; tr.vy = 0; tr.vx = 0; tr.rot = 0; tr.vRot = 0; tr.yaw = 0; tr.vYaw = 0;
        const maxT = Math.max(playerZ + 12000, ...this.traffic.map(t => t.worldZ));
        tr.worldZ = maxT + (4800 + RS.trafficRand() * 2200) * GameState.trafficGapScale;
        for (let k = 0; k < 20 && hasSetPieceBetween(tr.worldZ - 600, tr.worldZ + 600); k++) tr.worldZ += 2000;
        tr.prevZ = tr.worldZ;
        tr.offset = this.planner.trafficLane(i, tr.worldZ, GameState.waveTier || 1, tr.halfW, tr.halfL);
        tr.nearMissed = false;
        continue;
      }

      const minTZ = Math.min(tr.prevZ, tr.worldZ);
      const maxTZ = Math.max(tr.prevZ, tr.worldZ);
      if (this.checkSweptOverlapZ(minPZ, maxPZ, playerHalfL, minTZ, maxTZ, tr.halfL)) {
        const latDist = Math.abs(GameState.playerX - tr.offset);
        const minLatSep = playerHalfW + tr.halfW;
        const vertOverlap = (playerBotY < tr.y + tr.height) && (playerTopY > tr.y);

        if (latDist < minLatSep && vertOverlap) {
          const leverX = tr.offset - GameState.playerX;
          if (GameState.agroTimer > 0 || GameState.warpActiveTimer > 0 || (GameState.invulnTimer <= 0 && shieldBreak(leverX))) {
            tr.applyImpulseAndTorque(leverX >= 0 ? 4500 : -4500, 850000, playerWorldVZ * 900, leverX);
            tr.takenDown = true;
            triggerRivalTakedown(tr, '💥 TRAFFIC LAUNCHED!');
          } else {
            const totalInvMass = playerInvMass + tr.invMass;
            const e = 0.42;
            GameState.dodgeStreak = 0; GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0; applyPlayerDamage(14, 'TRAFFIC COLLISION');
            spawnObstacleShatter(tr.offset - GameState.playerX, '#ef4444', '#fde047', '💥 SOLID TRAFFIC IMPACT!');
            GameState.suspVel -= 210;
            GameState.chassisPitchVel += 16;

            if (prevPZ < tr.prevZ - tr.halfL * 0.5) {
              GameState.trackPos = tr.worldZ - ROAD_CFG.playerZOffset - (playerHalfL + tr.halfL + 8);
              const vRelMph = Math.max(10, GameState.speed - tr.mph);
              const jMph = (1 + e) * vRelMph / totalInvMass;
              GameState.speed = Math.max(22, GameState.speed - jMph * playerInvMass);
              tr.mph += jMph * tr.invMass;
              tr.applyImpulseAndTorque(leverX * 2200, tr.style === 'SEMI_TRUCK' ? 90000 : 320000, jMph * 950, leverX);
            } else {
              const dir = GameState.playerX < tr.offset ? -1 : 1;
              const overlapX = minLatSep - latDist + 0.04;
              GameState.playerX += dir * overlapX * 0.7;
              tr.offset -= dir * overlapX * 0.3;
              GameState.playerVX = dir * 0.68;
              tr.applyImpulseAndTorque(-dir * 1900, 140000, 0, leverX);
              GameState.chassisRollVel += dir * 22;
              GameState.speed = Math.max(26, GameState.speed * 0.80);
            }
          }
        } else if (latDist < minLatSep + 0.18 && !tr.nearMissed && GameState.speed > 50) {
          tr.nearMissed = true;
          GameState.combo = Math.min(12, GameState.combo + 1);
          GameState.comboTimer = 5.0;
          GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.trafficNearMiss);
          GameState.score += 500 * GameState.combo;
          SoundEngine.playCoinPickup();
          advanceContractProgress('NEAR_MISS', 1);
        }
      }
    }

    // 5. Player ↔ Physical Obstacles Swept 3D Rigid-Body & Torque Solver
    for (let i = 0; i < this.obstacles.length; i++) {
      const ob = this.obstacles[i];

      // Recycle obstacles that fall behind the player (Spaced 3,400–4,200 Z-units apart so the road is never crowded!)
      if (ob.worldZ - playerZ < -600) {
        // Placed off the racing line, spaced by the section's density (sprint 4).
        const wave = GameState.waveTier || 1;
        let maxAheadZ = playerZ + 4200;
        for (let k = 0; k < this.obstacles.length; k++) if (this.obstacles[k].worldZ > maxAheadZ) maxAheadZ = this.obstacles[k].worldZ;
        const spot = this.planner.placeObstacle(i, maxAheadZ + this.planner.obstacleSpacing(maxAheadZ, wave), wave)
          || { type: 'PINE_TREE_HAZARD', z: maxAheadZ + 60000, offset: 0.62 };
        ob.reset(this.obstacleOpts(i, spot.type, spot.z, spot.offset));
        continue;
      }

      // A static obstacle you already bounced off can't hit you again on the way past
      // (it doesn't fly away like the others, ticket 0074).
      if (ob.isStatic && ob.hitCount > 0) continue;
      const minOZ = Math.min(ob.prevZ, ob.worldZ);
      const maxOZ = Math.max(ob.prevZ, ob.worldZ);
      if (this.checkSweptOverlapZ(minPZ, maxPZ, playerHalfL * 0.85, minOZ, maxOZ, ob.halfL * 0.85)) {
        const latDist = Math.abs(GameState.playerX - ob.offset);
        const minLatSep = playerHalfW + ob.halfW;

        if (latDist >= minLatSep && !ob.nearMissed && ob.hitCount === 0) {
          ob.nearMissed = true;
          GameState.lessonsCleared.steer++;
          // A close shave is a skill move: it only pays if you steered into it (trees are
          // solid now and stay in their lane, ticket 0074, so a car on rails mustn't farm it).
          if (latDist < minLatSep + 0.24 && Math.abs(GameState.playerVX) > 0.05) {
            // HUMAN SKILL EDGE: Close-Shave Tree-Graze Slingshot!
            GameState.speed = Math.min(138, GameState.speed + 11);
            GameState.magnetTimer = Math.max(GameState.magnetTimer, 4.0);
            SoundEngine.playCoinPickup();
            addEndlessRunStreak(2, ob.type === 'PINE_TREE_HAZARD' ? '🌲 TREE-GRAZE BOOST!' : '⚡ CLOSE SHAVE!', ob.offset - GameState.playerX);
            addNos(RS.nos, 'nearMiss');
          } else {
            // Clean Endless-Run Dodge Streak +1
            addEndlessRunStreak(1, null, 0);
          }
        } else if (latDist < minLatSep) {
          const jumpedOver = (playerBotY >= ob.y + ob.height - 4);
          const slidUnder = (ob.clearanceY > 0 && playerTopY <= ob.y + ob.clearanceY + 4);

          if (jumpedOver) {
            if (!ob.nearMissed) {
              ob.nearMissed = true;
              GameState.lessonsCleared.jump++; addEndlessRunStreak(2, null, 0); GameState.speed = Math.min(135, GameState.speed + 8);
              const pts = 600 * GameState.combo;
              GameState.score += pts;
              SoundEngine.playStunt();
              spawnAcquireAnimation('HW_COIN', 0, `🔼 JUMP CLEARED! +${pts}`);
            }
          } else if (slidUnder) {
            if (!ob.nearMissed) {
              ob.nearMissed = true;
              GameState.lessonsCleared.slide++; addEndlessRunStreak(2, null, 0); GameState.speed = Math.min(135, GameState.speed + 8);
              const pts = 650 * GameState.combo;
              GameState.score += pts;
              GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.obstacleSlide);
              SoundEngine.playStunt();
              spawnAcquireAnimation('PLUTONIUM', 0, `🔽 SLIDE UNDER! +${pts}`);
            }
          } else {
            // HARD PHYSICAL RIGID-BODY COLLISION: Never let the player pass through the obstacle!
            ob.hitCount++;
            const isBoostSmash = (GameState.agroTimer > 0 || GameState.warpActiveTimer > 0);
            // A shield (0177) takes the hit like a boost smash: the barricade flies, you keep going.
            const shielded = !isBoostSmash && !isDebris(ob) && GameState.invulnTimer <= 0 && shieldBreak(ob.offset - GameState.playerX);
            const leverX = ob.offset - GameState.playerX;
            const pushDir = (GameState.playerX <= ob.offset) ? -1 : 1;

            // 1. Physically block & recoil the player's bumper + shove player laterally out of penetration!
            //    Debris someone else knocked out of place (sprint 4) bounces you but costs no points.
            if (isDebris(ob)) {
              GameState.speed = Math.max(30, GameState.speed * 0.8);
              GameState.playerX += pushDir * 0.12;
            } else if (!isBoostSmash && !shielded) {
              GameState.trackPos = Math.max(0, GameState.trackPos - 135);
              GameState.speed = Math.max(20, GameState.speed * 0.48);
              GameState.playerX += pushDir * 0.18;
              GameState.playerVX = pushDir * 0.72;
              GameState.dodgeStreak = 0; GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0; applyPlayerDamage(14, 'BARRIER IMPACT');
            } else {
              GameState.speed = Math.max(45, GameState.speed * 0.88);
            }

            // 2. Push the obstacle ahead of the front bumper & launch it with 6-DOF Newtonian Impulse + Torque!
            //    A static obstacle (a tree, ticket 0074) doesn't move: you bounce off it instead.
            if (!ob.isStatic) {
              ob.worldZ = Math.max(ob.worldZ, playerZ + playerHalfL + ob.halfL + 40);
              ob.prevZ = ob.worldZ;
              const launchVZ = (playerWorldVZ * 1.65 + 1450) * ob.massKg;
              const launchVX = -pushDir * (1.5 + Math.abs(leverX) * 2.5) * ob.massKg;
              const launchVY = (420 + Math.random() * 160) * ob.massKg;
              ob.applyImpulseAndTorque(launchVX, launchVY, launchVZ, leverX);
            }

            // 3. Compress 4-wheel suspension & pitch nose forward on impact!
            GameState.suspVel -= 220;
            GameState.chassisPitchVel += 16;
            GameState.chassisRollVel += pushDir * 16;

            spawnObstacleShatter(
              ob.offset - GameState.playerX,
              '#ff5500',
              '#fde047',
              shielded ? '🛡️ SHIELD BASH!' : ob.type === 'LOW_LASER_BAR' ? '💥 BLOCKED! JUMP (H/E) OR STEER AROUND!' : (ob.type === 'HIGH_LIGHT_GATE' ? '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!' : '💥 BARRICADE IMPACT! -14 HP')
            );
          }
        }
      }
    }

    // 6. Player ↔ knockable props (ticket 0074): a real momentum exchange. A 4 kg cone is
    //    swatted aside at nearly twice your speed and costs you almost nothing; a 95 kg
    //    barrel takes a bite out of your speed. Both tumble, bounce and settle.
    const props = this.props.live;
    for (let i = 0; i < props.length; i++) {
      const pr = props[i];
      if (pr.hitCount > 0 && pr.vz > playerWorldVZ * 0.5) continue; // already swatted ahead of us
      const minZ = Math.min(pr.prevZ, pr.worldZ);
      const maxZ = Math.max(pr.prevZ, pr.worldZ);
      if (!this.checkSweptOverlapZ(minPZ, maxPZ, playerHalfL * 0.9, minZ, maxZ, pr.halfL)) continue;
      const lever = pr.offset - GameState.playerX;
      if (Math.abs(lever) >= playerHalfW + pr.halfW) continue;
      if (!(playerBotY < pr.y + pr.height && playerTopY > pr.y)) continue;
      const mat = materialFor(pr.type);
      // Debris knocked out of place by someone else is just debris: it never costs points.
      const debris = isDebris(pr);
      const e = Math.min(mat.restitution + 0.25, 0.8);
      const mph = GameState.speed;
      const v = impactVelocities(playerMass, playerWorldVZ, mat.massKg, pr.vz, e);
      GameState.speed = Math.max(18, GameState.speed * Math.max(0, v.car) / Math.max(1, playerWorldVZ));
      pr.wake();
      pr.hitCount++;
      pr.worldZ = Math.max(pr.worldZ, playerZ + playerHalfL + pr.halfL + 6);
      pr.prevZ = pr.worldZ;
      pr.vz = v.body;
      // Hit off-centre and it flies off to that side, spinning; light props pop up and tumble.
      const sideDir = lever >= 0 ? 1 : -1;
      pr.vx = sideDir * (0.35 + Math.abs(lever) * 6) * (mat.massKg < 20 ? 1.6 : 0.6);
      pr.vy = (mat.massKg < 20 ? 300 : 140) + mph * (mat.massKg < 20 ? 2.2 : 0.6);
      pr.vRot = sideDir * (mat.massKg < 20 ? 16 : 7);
      pr.vYaw = sideDir * 5;
      burstSparks(mat.massKg < 20 ? 6 : 12, mat.massKg < 20 ? 30 : 18, 0.7);
      if (debris) {
        SoundEngine.playImpact('debris', 420, 0.05, 0.04);
      } else if (mat.damage > 0) {
        applyPlayerDamage(mat.damage, 'BARREL HIT');
      } else {
        chargePenalty(logHit(GameState.penaltyLog, 'cone', mph), 'CONE HIT');
        SoundEngine.playImpact('cone', 420, 0.05, 0.06);
      }
      GameState.dodgeStreak = 0;
    }
  },
  fillAiWorld(playerZ, speedToWorld) {
    if (!this.aiWorld) return null;
    aiRoad.line = track.line;
    return RAI.fillWorld(this.aiWorld, this, playerZ, aiRoad, GameState, speedToWorld);
  },
  /** Cone chicanes and barrel clusters ahead of the player (pooled; deterministic on dailies). */
  spawnProps(playerZ) {
    if (playerZ + 9000 < this.nextPropZ) return;
    // Cone walls, cone gates and barrel huddles built around the racing line (sprint 4).
    const plan = this.planner.planProps(this.nextPropZ, GameState.waveTier || 1);
    for (let k = 0; k < plan.items.length; k++) {
      const it = plan.items[k];
      const body = this.props.spawn(this.obstacleOpts(100 + k, it.type, it.z, it.offset));
    }
    this.nextPropZ = plan.nextZ;
    this.rebuildBodyLists();
  },
  checkSweptOverlapZ(minZA, maxZA, halfLA, minZB, maxZB, halfLB) {
    return (maxZA + halfLA >= minZB - halfLB) && (minZA - halfLA <= maxZB + halfLB);
  },
  // A knocked obstacle slamming into something end-on (solver in src/world.js).
  onChain(a, b) {
    // Once per knocked body, and not for props bumping each other (ticket 0074): a pile of
    // cones in contact would otherwise pay +1000 every sub-step.
    const hit = a.kind === 'OBSTACLE' && a.hitCount > 0 ? a : b;
    if (hit.knockable || hit.chained) return;
    hit.chained = true;
    spawnObstacleShatter(b.offset - GameState.playerX, '#00f0ff', '#ff5500', '🎯 CHAIN-REACTION PHYSICS HIT! +1000');
    GameState.score += 1000 * GameState.combo;
  },
};
