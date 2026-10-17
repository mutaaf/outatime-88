import './fonts.js';
import './styles.css';
import { WORLD_LEVELS, ERAS, UNDERGLOW_OPTIONS, LIVERY_OPTIONS, POP_CULTURE_ROSTER, MULTIVERSE_POOL, UPGRADE_DEFS, CONTRACT_TEMPLATES, JARVIS_MODES, ROAD_CFG, PACE_MODES, CAMERA_MODES } from './data.js';
import { SaveStore, freshSaveData } from './save.js';
import { GameState } from './state.js';
import { SoundEngine, setAudioHooks } from './audio.js';
import { InputState, pollGamepad } from './input.js';
import { RigidBody3D } from './physics.js';
import { projectPoint } from './projection.js';
import { createFixedStep, lerp } from './fixedstep.js';
import { contactZ, cameraDepth } from './contact.js';
import { hasWebGL, isLowEnd, resolveRenderMode, toggledPref } from './render-mode.js';
import { loadView3D } from './render3d-loader.js';
import { FLUX, passiveFluxRate, warpReady, boostOutcome } from './flux.js';
import { speedFeel, createParticlePool, createHitStop, nearMissChain } from './fx.js';
import { createAnnouncer } from './announcer.js';
import { LEVEL_MEDALS, MEDAL_ICON, nextTarget, applyRunResult } from './progress.js';
import { track, generateNextTrackBiome, buildInitialTrack } from './track.js';
import { watchLayout } from './layout.js';
import { createRaceClock } from './race.js';
import { createHud } from './hud.js';
import { FIELD_SIZE, RIVAL_PACES, gridSlot, rivalTargetMph, raceLengthFor, sortStandings, crossingTime, ordinal, finishBonus } from './raceflow.js';
import { dailySpec, mulberry32, utcDay } from './daily.js';
import { beginRun, submitRun, fetchBoard, normalizeInitials, rankLine } from './leaderboard.js';
import { createOnboarding, isNewPlayer } from './onboarding.js';
import { initSettings, toggleTilt, recenterTilt, currentDifficulty, refreshSettingsPanel, settingsOpen } from './settings-ui.js';
import { createPenaltyLog, logHit, logWall, penaltyPoints, breakdown, logPayload } from './scoring.js';
import { carParams, isOwned, unlockProgress, recordRace } from './cars.js';
import { initRacer } from './racer-ui.js';
import { setProfile } from './identity.js';

setAudioHooks({ syncAudioUI, triggerAnnouncement });

SaveStore.load();

// Game feel (pillar 2): one spark pool, one hit-stop clock, one near-miss chain for the run.
const sparks = createParticlePool(160);
const hitStop = createHitStop();
const nearMisses = nearMissChain();
let fxClock = 0;
// Reduced motion = the OS setting or the settings panel's choice (src/settings-ui.js).

/** Shower of sparks from the player car (pixel-canvas coords are mapped at draw time). */
function burstSparks(count, hue, power = 1) {
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


const JarvisAI = {
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

const LiveTraffic = {
  racers: [],
  traffic: [],
  obstacles: [],
  prevPlayerZ: 0,
  init() {
    this.prevPlayerZ = (GameState.trackPos || 0) + ROAD_CFG.playerZOffset;

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
      body.pace = RIVAL_PACES[idx] * pace;
      body.progress = GameState.distance + slot.dz / this.speedToWorld();
      body.finishTime = null;
      body.targetOffset = slot.offset;
      return body;
    });
    this.updateStandings(0, playerZ0, this.speedToWorld());

    // ONLY 4 Well-Spaced Highway Traffic Vehicles (Spaced 5,200 Z-units apart!)
    this.traffic = [];
    const lanes = [-0.48, 0.48, -0.20, 0.20];
    const styles = ['SEMI_TRUCK', 'SEDAN', 'TAXI', 'SUV'];
    for (let i = 0; i < 4; i++) {
      const st = styles[i % styles.length];
      const isTruck = (st === 'SEMI_TRUCK');
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
        worldZ: 4800 + i * 5200,
        offset: lanes[i % 4],
        oncoming: false,
        mph: 38 + i * 4,
        bodyColor: ['#334155', '#eab308', '#e2e8f0', '#1e3a8a'][i % 4]
      }));
    }

    // ONLY 4 Well-Spaced Physical Obstacles (Spaced 3,800 Z-units apart so the track is open and readable!)
    this.obstacles = [];
    const obsTypes = ['PINE_TREE_HAZARD', 'LOW_LASER_BAR', 'PINE_TREE_HAZARD', 'HIGH_LIGHT_GATE', 'HOLO_BARRIER'];
    for (let i = 0; i < 4; i++) {
      const oType = obsTypes[i % obsTypes.length];
      const lane = (i % 3 - 1) * 0.44;
      this.obstacles.push(this.createObstacleBody(i, oType, 3200 + i * 3800, lane));
    }
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
    field.push(this.playerEntry);
    this.playerEntry.progress = GameState.distance;
    this.playerEntry.finishTime = GameState.finishTime;
    sortStandings(field);
    GameState.racePosition = field.indexOf(this.playerEntry) + 1;
    GameState.totalRacers = field.length;
  },
  fieldEntries: [], // reused every frame: the standings, leader first
  playerEntry: { id: 'YOU', short: 'YOU', progress: 0, finishTime: null, isPlayer: true },

  /** World units per (mph × second) at the current pace setting. */
  speedToWorld() {
    const paceCfg = PACE_MODES[GameState.paceMode] || PACE_MODES[0];
    return (11000 * paceCfg.mult) / 88;
  },

  createObstacleBody(idx, oType, zPos, laneOffset) {
    const isHighGate = (oType === 'HIGH_LIGHT_GATE');
    const isLowLaser = (oType === 'LOW_LASER_BAR');
    const isCrate = (oType === 'FLUX_CRATE');
    return new RigidBody3D({
      id: 'OBS_' + idx + '_' + Date.now(),
      kind: 'OBSTACLE',
      type: oType,
      name: oType,
      worldZ: zPos,
      offset: laneOffset,
      massKg: isCrate ? 180 : (isLowLaser ? 240 : 320),
      restitution: 0.65,
      friction: 1.8,
      halfW: 0.21,
      height: isLowLaser ? 22 : (isHighGate ? 68 : 38),
      clearanceY: isHighGate ? 24 : 0,
      halfL: 145,
      bodyColor: '#1e293b',
      accentColor: '#f59e0b'
    });
  },

  checkSweptOverlapZ(minZA, maxZA, halfLA, minZB, maxZB, halfLB) {
    return (maxZA + halfLA >= minZB - halfLB) && (minZA - halfLA <= maxZB + halfLB);
  },

  // All-Pairs 3D Rigid-Body Impulse + Off-Center Torque Solver between any two non-player bodies (Car<->Car, Obstacle<->Car, Obstacle<->Obstacle)
  solveBodyPairCollision(a, b) {
    if (a === b || a.takenDown || b.takenDown) return;
    const dz = Math.abs(a.worldZ - b.worldZ);
    const minSepZ = a.halfL + b.halfL;
    if (dz >= minSepZ) return;

    const dx = Math.abs(a.offset - b.offset);
    const minSepX = a.halfW + b.halfW;
    if (dx >= minSepX) return;

    const vertOverlap = (a.y < b.y + b.height) && (a.y + a.height > b.y + b.clearanceY);
    if (!vertOverlap) return;

    // Minimum Translation Vector (MTV) + Newtonian Impulse J = -(1+e)*(vRel.n)/(invMassA + invMassB)
    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass <= 0) return;

    const e = Math.min(a.restitution, b.restitution);
    const signX = a.offset <= b.offset ? -1 : 1;
    const signZ = a.worldZ <= b.worldZ ? -1 : 1;
    const penX = minSepX - dx;
    const penZ = minSepZ - dz;

    if (penX * 900 < penZ) {
      // Lateral Side-to-Side Impact
      a.offset += signX * penX * (a.invMass / totalInvMass);
      b.offset -= signX * penX * (b.invMass / totalInvMass);
      const vRelX = a.vx - b.vx;
      const jx = -(1 + e) * vRelX / totalInvMass;
      const lever = (a.worldZ - b.worldZ) / minSepZ;
      a.applyImpulseAndTorque(jx, 45, 0, lever);
      b.applyImpulseAndTorque(-jx, 45, 0, -lever);
    } else {
      // Longitudinal Bumper-to-Bumper / Obstacle Ricochet Impact
      a.worldZ += signZ * penZ * (a.invMass / totalInvMass);
      b.worldZ -= signZ * penZ * (b.invMass / totalInvMass);
      const vRelZ = a.vz - b.vz;
      const jz = -(1 + e) * vRelZ / totalInvMass;
      const lever = a.offset - b.offset;
      a.applyImpulseAndTorque(lever * 180, 140, jz, lever);
      b.applyImpulseAndTorque(-lever * 180, 140, -jz, -lever);

      if ((a.kind === 'OBSTACLE' && a.hitCount > 0) || (b.kind === 'OBSTACLE' && b.hitCount > 0)) {
        spawnObstacleShatter(b.offset - GameState.playerX, '#00f0ff', '#ff5500', '🎯 CHAIN-REACTION PHYSICS HIT! +1000');
        GameState.score += 1000 * GameState.combo;
      }
    }
  },

  update(dt, rawDt, paceMult) {
    const playerZ = GameState.visualPlayerZ || (GameState.trackPos + ROAD_CFG.playerZOffset);
    const prevPZ = this.prevPlayerZ || playerZ;
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

      // Race pace with a soft rubber band (src/raceflow.js); finished rivals cruise.
      const lead = r.progress - GameState.distance;
      const targetMph = r.finishTime != null ? 60 : rivalTargetMph(r.pace, lead);
      r.nosActive = targetMph > r.pace + 5 || (Math.sin(fxClock * 2.5 + i * 2) > 0.8);

      r.mph += (targetMph - r.mph) * Math.min(1, rawDt * 2.5);
      r.vz = r.mph * speedToWorld;

      // AI Rivals steer smoothly around obstacles & traffic
      const hazards = this.traffic.concat(this.obstacles);
      for (let h = 0; h < hazards.length; h++) {
        const hz = hazards[h];
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
      tr.prevZ = tr.worldZ;
      tr.prevOffset = tr.offset;
    }

    for (let i = 0; i < this.obstacles.length; i++) {
      const ob = this.obstacles[i];
      ob.prevZ = ob.worldZ;
      ob.prevOffset = ob.offset;
    }

    // 2. Sub-stepped 240 Hz rigid-body integration (2 sub-steps per 1/120 s sim step).
    const SUB_STEPS = 2;
    const subDt = dt / SUB_STEPS;
    const subRawDt = rawDt / SUB_STEPS;
    const allBodies = this.racers.concat(this.traffic, this.obstacles);

    for (let step = 0; step < SUB_STEPS; step++) {
      for (let i = 0; i < allBodies.length; i++) {
        if (!allBodies[i].takenDown) allBodies[i].stepSubPhysics(subDt, subRawDt);
      }
      // All-pairs rigid-body collision solver (Rivals <-> Traffic <-> Obstacles)
      for (let i = 0; i < allBodies.length; i++) {
        for (let j = i + 1; j < allBodies.length; j++) {
          this.solveBodyPairCollision(allBodies[i], allBodies[j]);
        }
      }
    }

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
              SoundEngine.playTone(120, 'sawtooth', 0.1, 0.1);
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
              SoundEngine.playTone(140, 'sawtooth', 0.08, 0.08);
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
      if (relZ < -800 || tr.takenDown) {
        const lanes = [-0.48, 0.48, -0.20, 0.20];
        tr.takenDown = false;
        tr.y = 0; tr.vy = 0; tr.vx = 0; tr.rot = 0; tr.vRot = 0; tr.yaw = 0; tr.vYaw = 0;
        const maxT = Math.max(playerZ + 12000, ...this.traffic.map(t => t.worldZ));
        tr.worldZ = maxT + (4800 + trafficRand() * 2200) * GameState.trafficGapScale;
        tr.prevZ = tr.worldZ;
        tr.offset = lanes[(i + GameState.waveTier) % 4];
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
          if (GameState.agroTimer > 0 || GameState.warpActiveTimer > 0) {
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
        const obsTypes = ['PINE_TREE_HAZARD', 'LOW_LASER_BAR', 'PINE_TREE_HAZARD', 'HIGH_LIGHT_GATE', 'HOLO_BARRIER'];
        const nextType = obsTypes[(i + GameState.waveTier) % obsTypes.length];
        const lanes = [-0.46, 0, 0.46];
        const nextLane = lanes[(i * 7 + GameState.waveTier) % 3];
        const spacing = Math.max(2400, 3800 - GameState.waveTier * 140);
        const maxAheadZ = Math.max(playerZ + 4200, ...this.obstacles.map(o => o.worldZ));
        this.obstacles[i] = this.createObstacleBody(i, nextType, maxAheadZ + spacing, nextLane);
        continue;
      }

      const minOZ = Math.min(ob.prevZ, ob.worldZ);
      const maxOZ = Math.max(ob.prevZ, ob.worldZ);
      if (this.checkSweptOverlapZ(minPZ, maxPZ, playerHalfL * 0.85, minOZ, maxOZ, ob.halfL * 0.85)) {
        const latDist = Math.abs(GameState.playerX - ob.offset);
        const minLatSep = playerHalfW + ob.halfW;

        if (latDist >= minLatSep && !ob.nearMissed && ob.hitCount === 0) {
          ob.nearMissed = true;
          GameState.lessonsCleared.steer++;
          if (latDist < minLatSep + 0.24) {
            // HUMAN SKILL EDGE: Close-Shave Tree-Graze Slingshot!
            GameState.speed = Math.min(138, GameState.speed + 11);
            GameState.magnetTimer = Math.max(GameState.magnetTimer, 4.0);
            SoundEngine.playCoinPickup();
            addEndlessRunStreak(2, ob.type === 'PINE_TREE_HAZARD' ? '🌲 TREE-GRAZE BOOST!' : '⚡ CLOSE SHAVE!', ob.offset - GameState.playerX);
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
            const leverX = ob.offset - GameState.playerX;
            const pushDir = (GameState.playerX <= ob.offset) ? -1 : 1;

            // 1. Physically block & recoil the player's bumper + shove player laterally out of penetration!
            if (!isBoostSmash) {
              GameState.trackPos = Math.max(0, GameState.trackPos - 135);
              GameState.speed = Math.max(20, GameState.speed * 0.48);
              GameState.playerX += pushDir * 0.18;
              GameState.playerVX = pushDir * 0.72;
              GameState.dodgeStreak = 0; GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0; applyPlayerDamage(14, 'BARRIER IMPACT');
            } else {
              GameState.speed = Math.max(45, GameState.speed * 0.88);
            }

            // 2. Push the obstacle ahead of the front bumper & launch it with 6-DOF Newtonian Impulse + Torque!
            ob.worldZ = Math.max(ob.worldZ, playerZ + playerHalfL + ob.halfL + 40);
            ob.prevZ = ob.worldZ;
            const launchVZ = (playerWorldVZ * 1.65 + 1450) * ob.massKg;
            const launchVX = -pushDir * (1.5 + Math.abs(leverX) * 2.5) * ob.massKg;
            const launchVY = (420 + Math.random() * 160) * ob.massKg;
            ob.applyImpulseAndTorque(launchVX, launchVY, launchVZ, leverX);

            // 3. Compress 4-wheel suspension & pitch nose forward on impact!
            GameState.suspVel -= 220;
            GameState.chassisPitchVel += 16;
            GameState.chassisRollVel += pushDir * 16;

            spawnObstacleShatter(
              ob.offset - GameState.playerX,
              '#ff5500',
              '#fde047',
              ob.type === 'LOW_LASER_BAR' ? '💥 BLOCKED! JUMP (H/E) OR STEER AROUND!' : (ob.type === 'HIGH_LIGHT_GATE' ? '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!' : '💥 BARRICADE IMPACT! -14 HP')
            );
          }
        }
      }
    }
  }
};
function initTrack() {
  buildInitialTrack();
  LiveTraffic.init();
}

// --- ANNOUNCER & CONTRACT PROGRESSION ---
// One announcement channel (ticket 0002): src/announcer.js decides what is visible; this
// only paints it. Priority is inferred from the text unless a caller passes one.
const announcer = createAnnouncer({
  now: () => performance.now(),
  show(msg) {
    const mainEl = document.getElementById('announcerMain');
    const subEl = document.getElementById('announcerSub');
    if (!mainEl || !subEl) return;
    // The shared lane belongs to the announcer the moment it speaks — not a frame later —
    // so the coach can never be caught on screen with it.
    const coachBanner = document.getElementById('interactiveCoachBanner');
    if (coachBanner) hideCoach(coachBanner);
    coachYieldUntil = performance.now() + 350;
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

function triggerAnnouncement(mainText, subText = '', duration = 950, priority) {
  announcer.push(mainText, subText, duration, priority);
}

function advanceContractProgress(type, amount) {
  const tmpl = CONTRACT_TEMPLATES[GameState.contractIdx % CONTRACT_TEMPLATES.length];
  if (!tmpl || tmpl.type !== type) return;
  GameState.contractProgress += amount;
  if (GameState.contractProgress >= tmpl.target) {
    // Contract Completed!
    SaveStore.data.fluxCoins += tmpl.reward;
    GameState.runCoins += tmpl.reward;
    GameState.score += 3000 * GameState.combo;
    GameState.specialCharges = Math.min(5, GameState.specialCharges + 1);
    SoundEngine.playCheckpoint();
    triggerAnnouncement('🎯 STREET CONTRACT COMPLETE!', `+${tmpl.reward} ⚡ FLUX & +1 SPECIAL CHARGE!`, 1900);
    GameState.contractIdx = (GameState.contractIdx + 1) % CONTRACT_TEMPLATES.length;
    GameState.contractProgress = 0;
    SaveStore.save();
  }
  updateContractHud();
}

function updateContractHud() {
  const tmpl = CONTRACT_TEMPLATES[GameState.contractIdx % CONTRACT_TEMPLATES.length];
  const textEl = document.getElementById('activeContractText');
  const rewEl = document.getElementById('activeContractReward');
  if (textEl && tmpl) textEl.textContent = tmpl.label(GameState.contractProgress, tmpl.target);
  if (rewEl && tmpl) rewEl.textContent = `+${tmpl.reward} ⚡`;
}

// --- 2026 3D ANIMATED POWER-UP ACQUISITION & OBSTACLE IMPACT FX ---
// Penalty scoring (ticket 0073): every hit and wall scrape costs points, shown as a red
// popup by the score; the run log lets the server recompute the exact total.
const penaltyPopup = { pts: 0, label: '', until: 0, drawn: 0 };
function chargePenalty(pts, label) {
  if (!pts) return;
  GameState.score -= pts;
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

function applyPlayerDamage(rawDmg, reasonText) {
  if (GameState.invulnTimer > 0 || GameState.agroTimer > 0 || GameState.warpActiveTimer > 0) return;
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
  GameState.invulnTimer = 1.1; // 1.1s invulnerability frames
  SoundEngine.playCrash();
  // Crash spectacle: a beat of slow-mo, a spark shower and a jolt (ticket 0009).
  if (!GameState.reducedMotion) GameState.takedownSlowMoTimer = Math.max(GameState.takedownSlowMoTimer, 0.28);
  GameState.screenShake = Math.max(GameState.screenShake, 0.5);
  burstSparks(26, 18, 1.1);

  if (GameState.hp <= 0) {
    endRaceRun('WRECKED — CHASSIS HP DEPLETED!');
  }
}

function healPlayerHp(amount) {
  GameState.hp = Math.min(GameState.maxHp, GameState.hp + amount);
}

function addEndlessRunStreak(amount, reasonLabel, offsetFromCenter = 0) {
  GameState.dodgeStreak += amount;
  if (GameState.dodgeStreak > GameState.bestStreak) {
    GameState.bestStreak = GameState.dodgeStreak;
  }
  // Endless Run style multiplier: scales up to x30 as your clean dodge streak grows!
  GameState.combo = Math.min(30, 1 + Math.floor(GameState.dodgeStreak / 2));
  GameState.comboTimer = 9.0;
  const chain = nearMisses.hit(fxClock);
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

function performHumanTrick(direction) {
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

function spawnAcquireAnimation(itemType, offsetFromCenter, bonusLabel) {
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
    color: itemType === 'PLUTONIUM' ? '#00f0ff' : '#ffd000',
    label: bonusLabel,
    life: 0.65,
    maxLife: 0.65
  });
}

function spawnObstacleShatter(offsetFromCenter, primaryColor, accentColor, labelText) {
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
function triggerRivalTakedown(car, reason = 'SIDE-SLAM TAKEDOWN!') {
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
function activateMidnightSpecial(type) {
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
      const seg = track.segments[currentSegIdx + n];
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
function triggerTimeWarp() {
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
    warpTime = raceClock.extend(12.0);
    GameState.timeLeft = raceClock.timeLeft;
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

function getActiveEraRenderConfig() {
  if (GameState.visualOverride === '8BIT') return ERAS[0];
  if (GameState.visualOverride === '16BIT') return ERAS[1];
  if (GameState.visualOverride === 'HD') return ERAS[3];
  return ERAS[GameState.eraIndex];
}

function updateEraHud() {
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


// --- PRO PHYSICS & GAMEPLAY UPDATE LOOP ---
function updateGame(rawDt) {
  if (GameState.status !== 'PLAYING') return;

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

  fxClock += rawDt;
  timeScale *= hitStop.scale(rawDt);
  sparks.update(rawDt);
  if (GameState.warpFxTimer > 0) GameState.warpFxTimer -= rawDt;
  const dt = rawDt * timeScale;

  const cameraSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  const currentSegIdx = Math.floor((GameState.trackPos + ROAD_CFG.playerZOffset) / ROAD_CFG.segLength);
  if (track.segments.length - currentSegIdx < ROAD_CFG.drawDistance + 85) {
    generateNextTrackBiome();
  }

  const currentSeg = track.segments[currentSegIdx] || track.segments[0];
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
  const newWave = 1 + Math.floor(GameState.distance / 550);
  if (newWave > GameState.waveTier) {
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
  const accelerating = GameState.autoGas || InputState.up || gp.gas;
  const braking = InputState.down || gp.brake;

  const paceCfg = PACE_MODES[GameState.paceMode] || PACE_MODES[0];
  if (braking) {
    GameState.speed = Math.max(18, GameState.speed - 45 * rawDt);
  } else if (accelerating) {
    const accelRate = (14 + (upg.engine - 1) * 2.5) * carP.accelMult * paceCfg.accelMult * (GameState.warpActiveTimer > 0 ? 1.5 : 1.0);
    if (GameState.speed < targetMaxSpeed) {
      GameState.speed = Math.min(targetMaxSpeed, GameState.speed + accelRate * rawDt);
    } else {
      GameState.speed = Math.max(targetMaxSpeed, GameState.speed - 14 * rawDt);
    }
  } else {
    GameState.speed = Math.max(0, GameState.speed - 18 * rawDt);
  }

  // 6-Speed Gearbox + RPM calculation
  const gearThresholds = [0, 24, 44, 64, 82, 102, 140];
  let newGear = 1;
  for (let g = 1; g <= 6; g++) {
    if (GameState.speed >= gearThresholds[g - 1]) newGear = g;
  }
  GameState.gear = newGear;
  const gMin = gearThresholds[newGear - 1];
  const gMax = gearThresholds[newGear];
  GameState.rpm = Math.min(100, Math.max(18, ((GameState.speed - gMin) / Math.max(1, gMax - gMin)) * 82 + 18));

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
  GameState.score += Math.floor(GameState.speed * dt * 2.2 * GameState.combo);
  // The finish line (ticket 0051): three laps of the level's race length.
  if (GameState.raceLength && GameState.finishTime == null && GameState.distance >= GameState.raceLength) {
    GameState.finishTime = crossingTime(GameState.raceTime, rawDt, distBefore, GameState.distance, GameState.raceLength);
  }

  // 2. Pro Counter-Steer Drift Physics & Multi-Device Steering
  let steerInput = 0;
  if (InputState.left) steerInput -= 1;
  if (InputState.right) steerInput += 1;
  if (Math.abs(InputState.wheelSteerVal) > 0.02) steerInput += InputState.wheelSteerVal;
  if (InputState.tiltEnabled && Math.abs(InputState.tiltSteerVal) > 0.03) {
    steerInput += InputState.tiltSteerVal; // sensitivity and invert are already applied (src/settings.js)
  }
  if (Math.abs(gp.steer) > 0.05) steerInput += gp.steer;

  // Scan upcoming road curvature & threats for LUMEN AR HUD and Co-Pilot
  let curveAhead = 0;
  let nearestThreat = null;
  let bestCollectible = null;
  for (let look = 1; look <= 26; look++) {
    const lSeg = track.segments[currentSegIdx + look];
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
    }
  }
  GameState.upcomingCurveSum = curveAhead;
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
  } else if (GameState.jarvisMode === 0 && Math.abs(steerInput) < 0.08) {
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

  steerInput = Math.max(-1.4, Math.min(1.4, steerInput));

  const gripFactor = (1.15 + (upg.tires - 1) * 0.12) * carP.gripMult * (GameState.zoneTimer > 0 ? 1.25 : 1.0);
  const speedRatio = Math.min(1.0, GameState.speed / 88);

  // Initiate or maintain Power Drift when holding Brake/Drift + steering or hard cornering
  const wantsDrift = (braking || Math.abs(currentSeg ? currentSeg.curve : 0) > 1.8) && Math.abs(steerInput) > 0.35 && GameState.speed > 45 && GameState.playerY < 10;
  const driftBox = document.getElementById('driftCounterBox');

  if (wantsDrift) {
    GameState.isDrifting = true;
    GameState.driftChargeTime += rawDt * (1 + (upg.tires - 1) * 0.18);
    const targetYaw = steerInput * 32 * carP.slipMult; // looser cars swing wider
    GameState.driftAngle += (targetYaw - GameState.driftAngle) * Math.min(1, rawDt * 10);

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
    GameState.driftAngle += (0 - GameState.driftAngle) * Math.min(1, rawDt * 12);
  }

  // Lateral movement with smooth momentum
  const targetVX = steerInput * gripFactor * Math.max(0.4, speedRatio);
  GameState.playerVX += (targetVX - GameState.playerVX) * Math.min(1, rawDt * 14);
  GameState.playerX += GameState.playerVX * rawDt;

  // Gentle, predictable curve pull
  if (currentSeg) {
    const centrifugal = (currentSeg.curve * 0.14 * speedRatio) / ((1 + (upg.tires - 1) * 0.15) * carP.gripMult);
    GameState.playerX -= centrifugal * dt;
  }

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
  if (GameState.playerX < -MAX_TRACK_X) {
    GameState.playerX = -MAX_TRACK_X;
    chargePenalty(logWall(GameState.penaltyLog, rawDt * 1000, GameState.speed), 'WALL SCRAPE');
    if (GameState.playerVX < 0) {
      GameState.playerVX = -GameState.playerVX * 0.42; // Elastic guardrail rebound impulse
      GameState.speed = Math.max(25, GameState.speed - 12 * rawDt);
      GameState.particles.push({ x: -38, y: -5, vx: 90, vy: -60, color: '#ffea00', life: 0.25 });
    }
  } else if (GameState.playerX > MAX_TRACK_X) {
    GameState.playerX = MAX_TRACK_X;
    chargePenalty(logWall(GameState.penaltyLog, rawDt * 1000, GameState.speed), 'WALL SCRAPE');
    if (GameState.playerVX > 0) {
      GameState.playerVX = -GameState.playerVX * 0.42;
      GameState.speed = Math.max(25, GameState.speed - 12 * rawDt);
      GameState.particles.push({ x: 38, y: -5, vx: -90, vy: -60, color: '#ffea00', life: 0.25 });
    }
  }

  // 3. Split-Track Crossroads Choice
  const forkBanner = document.getElementById('forkChoiceBanner');
  if (currentSeg && currentSeg.trackType === 'SPLIT_FORK') {
    if (forkBanner) forkBanner.classList.remove('hidden');
    GameState.forkPending = true;
    const leftCard = document.getElementById('forkLeftCard');
    const rightCard = document.getElementById('forkRightCard');
    if (leftCard && rightCard) {
      leftCard.style.transform = GameState.playerX < 0 ? 'scale(1.08)' : 'scale(0.95)';
      rightCard.style.transform = GameState.playerX >= 0 ? 'scale(1.08)' : 'scale(0.95)';
    }
  } else {
    if (forkBanner) forkBanner.classList.add('hidden');
    if (GameState.forkPending) {
      GameState.forkPending = false;
      const chosen = GameState.playerX < 0 ? 'LEFT' : 'RIGHT';
      GameState.branchName = chosen === 'LEFT' ? 'SKY-LOOP SHORTCUT' : 'WANGAN TURBO TUNNEL';
      const branchBadge = document.getElementById('trackBranchBadge');
      if (branchBadge) branchBadge.textContent = `ROUTE: ${GameState.branchName}`;
      if (chosen === 'RIGHT' && GameState.mode === 'ARCADE') {
        const got = raceClock.extend(7.0);
        GameState.timeLeft = raceClock.timeLeft;
        triggerAnnouncement('WANGAN TURBO SHORTCUT!', got > 0 ? `+${got}s BONUS TIME!` : 'NO TIME LEFT TO WIN — DRIVE!', 1400);
      } else {
        GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.skyLoop);
        triggerAnnouncement('ORANGE TRACK SKY-LOOP!', '+35% FLUX CORE CHARGE!', 1400);
      }
      generateNextTrackBiome(chosen);
    }
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
    GameState.playerVY -= 1550 * rawDt; // Real Newtonian gravity (no floating!)
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
    const seg = track.segments[currentSegIdx + offset];
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

    if (offset < -1 || offset > 1) continue;

    // Checkpoint Gate
    if (seg.trackType === 'CHECKPOINT' && !seg.cpClaimed) {
      seg.cpClaimed = true;
      healPlayerHp(20);
      SoundEngine.playCheckpoint();
      let cpTime = 0;
      if (GameState.mode === 'ARCADE') {
        cpTime = raceClock.extend(12.0);
        GameState.timeLeft = raceClock.timeLeft;
      }
      GameState.score += 1200 * GameState.combo;
      triggerAnnouncement(
        `🏁 CHECKPOINT! ${ordinal(GameState.racePosition)} PLACE`,
        GameState.mode === 'ARCADE' ? (cpTime > 0 ? `+${cpTime}s TIME EXTENDED!` : 'FINAL STRETCH — NO MORE TIME!') : '+1200 STREET REP!',
        1450
      );
    }

    // Animated Collectibles & Destructible 2026 Obstacles
    for (let i = 0; i < seg.items.length; i++) {
      const item = seg.items[i];
      if (item.collected || item.smashed) continue;
      const dist = Math.abs(GameState.playerX - item.offset);

      if (item.type === 'PLUTONIUM' || item.type === 'HW_COIN') {
        const pickupRadius = (GameState.magnetTimer > 0 || GameState.dodgeStreak >= 4) ? 1.25 : 0.44;
        if (dist < pickupRadius && GameState.playerY < 95) {
          item.collected = true;
          SoundEngine.playCoinPickup();
          GameState.combo = Math.min(12, GameState.combo + 1);
          GameState.comboTimer = 5.0;
          if (item.type === 'PLUTONIUM') {
            GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.plutonium);
            GameState.runCoins += 8;
            SaveStore.data.fluxCoins += 8;
            const pts = 500 * GameState.combo;
            GameState.score += pts;
            spawnAcquireAnimation('PLUTONIUM', item.offset - GameState.playerX, `+${pts} ⚡ 1.88GW!`);
          } else {
            GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.coin);
            GameState.runCoins += 4;
            SaveStore.data.fluxCoins += 4;
            const pts = 300 * GameState.combo;
            GameState.score += pts;
            spawnAcquireAnimation('HW_COIN', item.offset - GameState.playerX, `+${pts} 🔥 x${GameState.combo}`);
          }
        }
      } else if (item.type === 'REPAIR_WRENCH') {
        if (dist < 0.42 && GameState.playerY < 95) {
          item.collected = true;
          SoundEngine.playCheckpoint();
          healPlayerHp(25);
          const pts = 400 * GameState.combo;
          GameState.score += pts;
          spawnAcquireAnimation('PLUTONIUM', item.offset - GameState.playerX, `+25 💚 HP REPAIRED!`);
        }
      } else if (item.type === 'LOW_LASER_BAR') {
        // 2 SOLUTIONS: Solution 1 = Jump Over (playerY >= 24) • Solution 2 = Steer into open lane (dist >= 0.34)
        if (dist < 0.34) {
          if (GameState.playerY >= 22) {
            if (!item.cleared) {
              item.cleared = true;
              GameState.lessonsCleared.jump++; addEndlessRunStreak(2, null, 0); GameState.speed = Math.min(135, GameState.speed + 8);
              const pts = 600 * GameState.combo;
              GameState.score += pts;
              SoundEngine.playStunt();
              spawnAcquireAnimation('HW_COIN', 0, `🔼 JUMP CLEARED! +${pts}`);
            }
          } else {
            item.smashed = true;
            applyPlayerDamage(15, 'LOW LASER HIT');
            GameState.speed = Math.max(26, GameState.speed * 0.75);
            spawnObstacleShatter(item.offset - GameState.playerX, '#ff5500', '#fde047', '💥 JUMP (W/UP/H) OR DODGE!');
          }
        } else if (offset === 0 && !item.cleared) {
          item.cleared = true;
          GameState.lessonsCleared.steer++;
        }
      } else if (item.type === 'HIGH_LIGHT_GATE') {
        // 2 SOLUTIONS: Solution 1 = Hold Drift/Duck-Slide Under (isDuckSliding) • Solution 2 = Steer around (dist >= 0.34)
        if (dist < 0.34) {
          if (GameState.isDuckSliding || GameState.twoWheelTimer > 0) {
            if (!item.cleared) {
              item.cleared = true;
              GameState.lessonsCleared.slide++; addEndlessRunStreak(2, null, 0); GameState.speed = Math.min(135, GameState.speed + 8);
              const pts = 650 * GameState.combo;
              GameState.score += pts;
              GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.obstacleSlide);
              SoundEngine.playStunt();
              spawnAcquireAnimation('PLUTONIUM', 0, `🔽 SLIDE UNDER! +${pts}`);
            }
          } else {
            item.smashed = true;
            applyPlayerDamage(15, 'HIGH LIGHT GATE HIT');
            GameState.speed = Math.max(26, GameState.speed * 0.75);
            spawnObstacleShatter(item.offset - GameState.playerX, '#00f0ff', '#d946ef', '💥 HOLD DRIFT (S/DOWN) TO SLIDE UNDER!');
          }
        } else if (offset === 0 && !item.cleared) {
          item.cleared = true;
          GameState.lessonsCleared.steer++;
        }
      } else if (item.type === 'FLUX_CRATE' || item.type === 'HOLO_BARRIER') {
        if (dist < 0.34 && GameState.playerY < 52) {
          item.smashed = true;
          if (item.type === 'FLUX_CRATE' || GameState.agroTimer > 0 || GameState.warpActiveTimer > 0 || GameState.speed >= 72 || GameState.isDrifting) {
            SoundEngine.playStunt();
            GameState.lessonsCleared.smash++;
            GameState.fluxCharge = Math.min(100, GameState.fluxCharge + FLUX.gains.obstacleSmash);
            healPlayerHp(8);
            GameState.speed = Math.min(135, GameState.speed + 8);
            const pts = 750 * GameState.combo;
            GameState.score += pts;
            spawnObstacleShatter(
              item.offset - GameState.playerX,
              item.type === 'FLUX_CRATE' ? '#00f0ff' : '#ff5500',
              '#fde047',
              item.type === 'FLUX_CRATE' ? `📦 CRATE SMASH! +${pts} & +8 HP` : `⚡ BARRIER SHATTERED! +${pts}`
            );
          } else {
            applyPlayerDamage(14, 'BARRIER HIT');
            GameState.speed = Math.max(26, GameState.speed * 0.74);
            spawnObstacleShatter(item.offset - GameState.playerX, '#ef4444', '#f97316', '💥 BARRIER HIT! -14 HP');
          }
        }
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
          if (isAggressiveSlam) {
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
    if (GameState.comboTimer <= 0) GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0;
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
  if (GameState.mode === 'ARCADE') {
    const beat = raceClock.tick(rawDt);
    GameState.timeLeft = raceClock.timeLeft;
    if (beat === 'final') {
      GameState.finalStretch = true;
      triggerAnnouncement('🏁 FINAL STRETCH 🏁', 'LAST CHANCE — CHAIN EVERYTHING!', 1700, 3);
    } else if (beat === 'over' && GameState.finishTime == null) {
      endRaceRun('⏱️ TIME UP!');
    }
  }
  if (GameState.status === 'PLAYING' && GameState.finishTime != null) finishRace();
}

// Coach (ticket 0002): teaches only what you haven't learned yet, in one short line, and
// always yields to the announcer so two messages never stack.
const COACH_LESSON = { PINE_TREE_HAZARD: 'steer', LOW_LASER_BAR: 'jump', HIGH_LIGHT_GATE: 'slide', FLUX_CRATE: 'smash' };
const COACH_LEARNED_AFTER = 2;
let coachYieldUntil = 0;

function hideCoach(banner) {
  banner.style.opacity = '0';
  banner.style.pointerEvents = 'none';
}

function updateInteractiveCoach(currentSegIdx) {
  const banner = document.getElementById('interactiveCoachBanner');
  if (!banner) return;
  if (GameState.coachDismissed) { hideCoach(banner); return; }
  // Yield to the announcer, and wait for its fade-out so the two never cross-fade on top of
  // each other in the shared message lane (ticket 0021).
  const nowMs = performance.now();
  if (announcer.isVisible()) { coachYieldUntil = nowMs + 350; hideCoach(banner); return; }
  if (nowMs < coachYieldUntil) { hideCoach(banner); return; }

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
let raceHud = null;
let hudNextAt = 0;
const hudView = {
  position: 1, total: 1, progress: 0, length: 0, raceTime: 0, timeLeft: 0, clockUrgent: false,
  infinite: false, mph: 0, flux: 0, hpFrac: 1, score: 0, field: LiveTraffic.fieldEntries,
};
function updateRaceHud(force) {
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
  hudView.hpFrac = GameState.maxHp ? GameState.hp / GameState.maxHp : 1;
  hudView.score = GameState.score;
  raceHud.update(hudView);
}

function updateLiveHud(forceHud) {
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
  if (waveEl) waveEl.textContent = `W${GameState.waveTier}`;
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
    timerEl.textContent = GameState.mode === 'INFINITE' ? '∞' : `${Math.ceil(GameState.timeLeft)}`;
    timerEl.classList.toggle('timer-urgent', GameState.mode !== 'INFINITE' && (GameState.finalStretch || GameState.timeLeft < 10));
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

// --- LIVE GPS STREET RADAR MINIMAP RENDERER ---
const radarCanvas = document.getElementById('radarCanvas');
const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;

function renderRadarMinimap(baseIndex) {
  if (!radarCtx) return;
  const w = radarCanvas.width;
  const h = radarCanvas.height;
  radarCtx.clearRect(0, 0, w, h);

  // Dark Radar Grid
  radarCtx.fillStyle = '#040814';
  radarCtx.fillRect(0, 0, w, h);
  radarCtx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
  radarCtx.lineWidth = 1;
  radarCtx.beginPath();
  radarCtx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
  radarCtx.stroke();

  // Plot upcoming road curvature & rival/police/checkpoint dots
  let rx = w / 2;
  let ry = h - 12;
  let angle = 0;

  radarCtx.strokeStyle = '#ff5500';
  radarCtx.lineWidth = 3;
  radarCtx.beginPath();
  radarCtx.moveTo(rx, ry);

  for (let n = 0; n < 45; n += 2) {
    const seg = track.segments[baseIndex + n];
    if (!seg) break;
    angle += seg.curve * 0.015;
    rx += Math.sin(angle) * 1.9;
    ry -= Math.cos(angle) * 1.9;
    radarCtx.lineTo(rx, ry);
  }
  radarCtx.stroke();

  // Re-walk to draw rival & cop dots on the radar
  rx = w / 2;
  ry = h - 12;
  angle = 0;
  for (let n = 0; n < 42; n++) {
    const seg = track.segments[baseIndex + n];
    if (!seg) break;
    angle += seg.curve * 0.0075;
    rx += Math.sin(angle) * 0.95;
    ry -= Math.cos(angle) * 0.95;

    if (seg.trackType === 'CHECKPOINT' && n % 4 === 0) {
      radarCtx.fillStyle = '#10b981';
      radarCtx.fillRect(rx - 2, ry - 2, 4, 4);
    }
    for (let c = 0; c < seg.cars.length; c++) {
      const car = seg.cars[c];
      if (car.takenDown) continue;
      radarCtx.fillStyle = car.type === 'POLICE_INTERCEPTOR'
        ? ((Math.floor(Date.now() / 480) % 2 === 0) ? '#ef4444' : '#3b82f6')
        : (car.type === 'STREET_RIVAL' ? '#facc15' : '#94a3b8');
      radarCtx.fillRect(rx + car.offset * 5 - 1.5, ry - 1.5, 3, 3);
    }
  }

  // Player Car Arrow at bottom center
  radarCtx.fillStyle = '#00f0ff';
  radarCtx.beginPath();
  radarCtx.moveTo(w / 2, h - 16);
  radarCtx.lineTo(w / 2 - 4, h - 8);
  radarCtx.lineTo(w / 2 + 4, h - 8);
  radarCtx.closePath();
  radarCtx.fill();
}

// --- PSEUDO-3D NIGHT-STREET RENDERER ---
const mainCanvas = document.getElementById('gameCanvas');
const mainCtx = mainCanvas.getContext('2d');
const pixelCanvas = document.createElement('canvas');
const pixelCtx = pixelCanvas.getContext('2d');

function resizeCanvases() {
  const container = document.getElementById('canvasContainer');
  const w = container ? container.clientWidth : window.innerWidth;
  const h = container ? container.clientHeight : window.innerHeight;
  mainCanvas.width = Math.max(320, w);
  mainCanvas.height = Math.max(240, h);
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
  return Math.max(160, Math.floor(mainCanvas.height / scale));
}

/** Simulation-owned tyre contact Z; independent of which renderer draws the frame. */
function syncContactZ() {
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  const z = contactZ(track.segments, GameState, camCfg, roadCanvasHeight());
  if (z !== null) GameState.visualPlayerZ = z;
}

function renderScene() {
  const eraCfg = getActiveEraRenderConfig();
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  const scale = eraCfg.pixelScale || 1.0;
  const rw = Math.max(240, Math.floor(mainCanvas.width / scale));
  const rh = Math.max(160, Math.floor(mainCanvas.height / scale));

  if (pixelCanvas.width !== rw || pixelCanvas.height !== rh) {
    pixelCanvas.width = rw;
    pixelCanvas.height = rh;
  }

  const ctx = pixelCtx;
  ctx.save();

  // Screen Shake on Takedown / Roar / Boost
  if (GameState.screenShake > 0 && !GameState.reducedMotion) {
    const mag = GameState.screenShake * 2.5;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // 1. Cinematic Multi-Stop Twilight Sunset Sky & Atmospheric Bloom
  const horizonY = Math.floor(rh * 0.46 - GameState.loopPitchOffset * (rh / 420));
  const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(10, horizonY));
  skyGrad.addColorStop(0, '#04030c');
  skyGrad.addColorStop(0.38, '#100826');
  skyGrad.addColorStop(0.72, '#2d114d');
  skyGrad.addColorStop(0.92, '#7c1d54');
  skyGrad.addColorStop(1, '#ff6a2b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, rw, rh);

  // Soft Twinkling Starfield in Upper Sky
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  for (let s = 0; s < 28; s++) {
    const sx = ((s * 103 + Math.floor(GameState.playerX * 18)) % rw + rw) % rw;
    const sy = (s * 31) % Math.max(20, Math.floor(horizonY * 0.65));
    ctx.fillRect(sx, sy, (s % 3 === 0) ? 2 : 1.5, (s % 3 === 0) ? 2 : 1.5);
  }

  // Synthwave Setting Sun with Soft Radial Atmospheric Halo
  const sunX = rw * 0.5 - (GameState.playerX * rw * 0.08);
  const sunY = horizonY - rh * 0.08;
  const sunR = Math.min(rw, rh) * 0.14;

  const haloGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.2);
  haloGrad.addColorStop(0, 'rgba(255, 160, 60, 0.45)');
  haloGrad.addColorStop(0.5, 'rgba(255, 60, 120, 0.18)');
  haloGrad.addColorStop(1, 'rgba(255, 60, 120, 0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
  ctx.fill();

  const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
  sunGrad.addColorStop(0, '#fff3b0');
  sunGrad.addColorStop(0.45, '#ff7b00');
  sunGrad.addColorStop(1, '#ff006e');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Parallax Sierra Mountain Range Silhouettes on Horizon
  ctx.fillStyle = '#16092b';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let mx = 0; mx <= rw; mx += 36) {
    const mh = 18 + Math.sin(mx * 0.018 + 1.2) * 14 + Math.cos(mx * 0.045) * 8;
    ctx.lineTo(mx, horizonY - mh);
  }
  ctx.lineTo(rw, horizonY);
  ctx.closePath();
  ctx.fill();

  // Clock Hollow 2026 Distant City Lights & Iconic Courthouse Clock Tower Silhouette
  ctx.fillStyle = '#0b0518';
  const bldgStep = Math.max(16, Math.floor(rw / 24));
  for (let bx = 0; bx < rw; bx += bldgStep) {
    const bh = ((bx * 19) % 18) + 6;
    ctx.fillRect(bx, horizonY - bh, bldgStep - 3, bh);
  }

  const ctX = Math.floor(sunX);
  const ctW = Math.max(48, Math.floor(rw * 0.10));
  const ctH = Math.max(32, Math.floor(rh * 0.10));
  ctx.fillStyle = '#1e1026';
  ctx.fillRect(ctX - ctW * 0.5, horizonY - ctH, ctW, ctH);
  ctx.fillStyle = '#cbd5e1';
  for (let col = -1.5; col <= 1.5; col += 1) {
    ctx.fillRect(ctX + col * (ctW * 0.22) - 1.5, horizonY - ctH * 0.72, 3, ctH * 0.72);
  }
  ctx.beginPath();
  ctx.moveTo(ctX - ctW * 0.54, horizonY - ctH * 0.72);
  ctx.lineTo(ctX, horizonY - ctH * 1.15);
  ctx.lineTo(ctX + ctW * 0.54, horizonY - ctH * 0.72);
  ctx.closePath();
  ctx.fill();
  const clkR = Math.max(4, ctW * 0.10);
  const clkY = horizonY - ctH * 0.90;
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(ctX, clkY, clkR, 0, Math.PI * 2);
  ctx.fill();

  // Deep Twilight Ground Plane with Subtle Horizon Glow
  const gndGrad = ctx.createLinearGradient(0, horizonY, 0, rh);
  gndGrad.addColorStop(0, '#190b2e');
  gndGrad.addColorStop(0.25, '#0b0719');
  gndGrad.addColorStop(1, '#05040d');
  ctx.fillStyle = gndGrad;
  ctx.fillRect(0, horizonY, rw, rh - horizonY);

  // 2. Project & Draw Seamless 3D Orange Toy-Track Segments (Zero Distracting Blue Bars!)
  const baseIndex = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  const basePercent = (GameState.trackPos % ROAD_CFG.segLength) / ROAD_CFG.segLength;
  const baseSeg = track.segments[baseIndex] || track.segments[0];
  if (!baseSeg) {
    ctx.restore();
    return;
  }

  renderRadarMinimap(baseIndex);

  const playerElevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  let playerCurveX = 0;
  let playerCurveDX = -(baseSeg.curve * basePercent);
  for (let cStep = 0; cStep < 6; cStep++) {
    const cSeg = track.segments[baseIndex + cStep];
    if (!cSeg) break;
    playerCurveX += playerCurveDX;
    playerCurveDX += cSeg.curve;
  }
  const cameraX = (GameState.playerX * ROAD_CFG.roadWidth) + playerCurveX;
  const cameraY = playerElevation + camCfg.height + GameState.playerY * 3.5;
  const cameraZ = GameState.trackPos;
  const dynamicDepth = cameraDepth(camCfg, GameState.speed);

  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = rh;
  const visibleSegments = [];
  const playerTireScreenY = Math.floor(rh * 0.87);
  let foundPlayerSeg = null;

  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = track.segments[baseIndex + n];
    if (!seg) break;

    seg.p1.world.x = x;
    seg.p2.world.x = x + dx;

    projectPoint(seg.p1, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh);
    projectPoint(seg.p2, cameraX, cameraY, cameraZ, dynamicDepth, rw, rh);

    x += dx;
    dx += seg.curve;

    if (seg.p1.camera.z <= dynamicDepth || seg.p2.screen.y >= maxY || seg.p2.screen.y >= seg.p1.screen.y) {
      continue;
    }

    visibleSegments.push(seg);

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
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 + railW1, y1 + slabH1, x2 + railW2, y2 + slabH2, x2 - railW2, y2 + slabH2, '#4a1202');

    // 2. Seamless Anodized Tangerine-Orange Toy-Track Deck (Zero Blue Bars!)
    let surfaceColor = isAlt ? eraCfg.trackA : eraCfg.trackB;
    if (seg.trackType === 'BOOSTER') {
      surfaceColor = isAlt ? '#ea580c' : '#d9460f';
    } else if (seg.trackType === 'JUMP_RAMP') {
      surfaceColor = isAlt ? '#f59e0b' : '#d97706';
    }
    drawPolygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, surfaceColor);

    // 3. Soft Satin Specular Sheen Along Left & Right Lanes
    const sheenCol = 'rgba(255, 215, 150, 0.14)';
    drawPolygon(ctx, x1 - w1 * 0.58, y1, x1 - w1 * 0.28, y1, x2 - w2 * 0.28, y2, x2 - w2 * 0.58, y2, sheenCol);
    drawPolygon(ctx, x1 + w1 * 0.28, y1, x1 + w1 * 0.58, y1, x2 + w2 * 0.58, y2, x2 + w2 * 0.28, y2, sheenCol);

    // 4. Subtle Carbon-Recessed Lane Grooves & Warm Gold Center Line
    const lineW1 = Math.max(1.2, w1 * 0.016);
    const lineW2 = Math.max(0.8, w2 * 0.016);
    const grooveCol = 'rgba(40, 10, 0, 0.36)';
    drawPolygon(ctx, x1 - w1 * 0.46 - lineW1, y1, x1 - w1 * 0.46 + lineW1, y1, x2 - w2 * 0.46 + lineW2, y2, x2 - w2 * 0.46 - lineW2, y2, grooveCol);
    drawPolygon(ctx, x1 + w1 * 0.46 - lineW1, y1, x1 + w1 * 0.46 + lineW1, y1, x2 + w2 * 0.46 + lineW2, y2, x2 + w2 * 0.46 - lineW2, y2, grooveCol);

    const centerCol = seg.trackType === 'BOOSTER' ? '#fde047' : 'rgba(255, 195, 40, 0.72)';
    drawPolygon(ctx, x1 - lineW1, y1, x1 + lineW1, y1, x2 + lineW2, y2, x2 - lineW2, y2, centerCol);

    // 5. 3D Extruded Side Guide Walls (Inner Shaded Wall + Warm Gold Top Bevel + Outer Lip)
    const wallH1 = Math.max(2, w1 * 0.068);
    const wallH2 = Math.max(1, w2 * 0.068);
    drawPolygon(ctx, x1 - w1, y1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - w2, y2, '#8a1c02');
    drawPolygon(ctx, x1 + w1, y1, x1 + w1, y1 - wallH1, x2 + w2, y2 - wallH2, x2 + w2, y2, '#8a1c02');
    const topRimCol = isAlt ? '#ffaa00' : '#ff8800';
    drawPolygon(ctx, x1 - railW1, y1 - wallH1, x1 - w1, y1 - wallH1, x2 - w2, y2 - wallH2, x2 - railW2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 + w1, y1 - wallH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + w2, y2 - wallH2, topRimCol);
    drawPolygon(ctx, x1 - railW1, y1 + slabH1, x1 - railW1, y1 - wallH1, x2 - railW2, y2 - wallH2, x2 - railW2, y2 + slabH2, '#b22c04');
    drawPolygon(ctx, x1 + railW1, y1 + slabH1, x1 + railW1, y1 - wallH1, x2 + railW2, y2 - wallH2, x2 + railW2, y2 + slabH2, '#b22c04');

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
      } else if (item.type === 'OVERHEAD_GATE') {
        ctx.strokeStyle = seg.trackType === 'BOOSTER' ? '#fde047' : '#ff8800';
        ctx.lineWidth = Math.max(2, roadW * 0.045);
        ctx.beginPath();
        ctx.arc(roadX, roadY, roadW * 1.05, Math.PI, 0);
        ctx.stroke();

        // Animated Spinning Green Toy-Track Booster Rollers on the Track Sides!
        if (seg.trackType === 'BOOSTER' && roadW > 20) {
          const spinAngle = nowSec * 18;
          const rollerR = Math.max(4, roadW * 0.10);
          [-1.04, 1.04].forEach((side) => {
            const rx = roadX + side * roadW;
            const ry = roadY - rollerR * 0.9;
            ctx.fillStyle = '#15803d';
            ctx.fillRect(rx - rollerR * 1.2, ry - rollerR, rollerR * 2.4, rollerR * 2);
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(rx, ry, rollerR * 0.85, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#052e16';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(rx - Math.cos(spinAngle) * rollerR * 0.75, ry - Math.sin(spinAngle) * rollerR * 0.75);
            ctx.lineTo(rx + Math.cos(spinAngle) * rollerR * 0.75, ry + Math.sin(spinAngle) * rollerR * 0.75);
            ctx.stroke();
          });
        }
      } else if (item.type === 'PLUTONIUM') {
        // Animated 3D Bobbing Plutonium Core with Orbiting Electron Rings!
        const py = roadY - itemH * 0.65 + bobY;
        const pr = Math.max(3, itemW * 0.44);
        // Ground glow pool
        ctx.fillStyle = 'rgba(0, 240, 255, 0.32)';
        ctx.fillRect(itemX - pr, roadY - 3, pr * 2, 4);
        // Outer pulsing energy sphere
        ctx.fillStyle = 'rgba(0, 240, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(itemX, py, pr, 0, Math.PI * 2);
        ctx.fill();
        // Inner golden nuclear cylinder
        ctx.fillStyle = '#fde047';
        ctx.fillRect(itemX - pr * 0.45, py - pr * 0.55, pr * 0.9, pr * 1.1);
        // Orbiting 3D electron dot
        const orbX = itemX + Math.cos(nowSec * 8 + (item.phase || 0)) * (pr * 1.35);
        const orbY = py + Math.sin(nowSec * 8 + (item.phase || 0)) * (pr * 0.45);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(orbX, orbY, Math.max(2, pr * 0.28), 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'HW_COIN') {
        // Animated 3D Spinning Orange-Track Flame Medallion!
        const cyCoin = roadY - itemH * 0.58 + bobY;
        const rCoin = Math.max(3, itemW * 0.40);
        const spinScaleX = Math.max(0.22, Math.abs(Math.cos(nowSec * 5.5 + (item.phase || 0))));
        ctx.save();
        ctx.translate(itemX, cyCoin);
        ctx.scale(spinScaleX, 1);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, 0, rCoin, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5500';
        ctx.beginPath();
        ctx.arc(0, 0, rCoin * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (item.type === 'FLUX_CRATE') {
        // Animated 3D Glowing Supply Crate (Shatters for bonus Flux when hit!)
        const boxW = Math.max(6, itemW * 0.85);
        const boxH = Math.max(6, itemH * 0.85);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(itemX - boxW * 0.5, roadY - boxH, boxW, boxH);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = Math.max(1, boxW * 0.08);
        ctx.strokeRect(itemX - boxW * 0.5, roadY - boxH, boxW, boxH);
        // Pulsing X core
        ctx.fillStyle = '#fde047';
        ctx.fillRect(itemX - boxW * 0.22, roadY - boxH * 0.72, boxW * 0.44, boxH * 0.44);
      } else if (item.type === 'REPAIR_WRENCH') {
        // Spinning 3D Green Nano-Wrench (+25 HP Repair Pickup)
        const wy = roadY - itemH * 0.65 + bobY;
        const wr = Math.max(4, itemW * 0.42);
        ctx.save();
        ctx.translate(itemX, wy);
        ctx.rotate(nowSec * 3.5);
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(0, 0, wr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-wr * 0.6, -wr * 0.2, wr * 1.2, wr * 0.4);
        ctx.fillRect(-wr * 0.2, -wr * 0.6, wr * 0.4, wr * 1.2);
        ctx.restore();
      } else if (item.type === 'LOW_LASER_BAR') {
        // 🟠 LOW LASER HURDLE (Solution 1: Jump Over • Solution 2: Steer Around)
        const barW = Math.max(10, itemW * 1.25);
        const barH = Math.max(4, itemH * 0.42);
        // Left & right emitters
        ctx.fillStyle = '#334155';
        ctx.fillRect(itemX - barW * 0.55, roadY - barH * 1.2, barW * 0.14, barH * 1.2);
        ctx.fillRect(itemX + barW * 0.41, roadY - barH * 1.2, barW * 0.14, barH * 1.2);
        // Glowing orange laser beam low to the track
        ctx.fillStyle = '#ff5500';
        ctx.fillRect(itemX - barW * 0.45, roadY - barH * 0.85, barW * 0.9, barH * 0.45);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(itemX - barW * 0.45, roadY - barH * 0.70, barW * 0.9, barH * 0.18);
        if (roadW > 55) {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 8px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔼 JUMP OR DODGE', itemX, roadY - barH * 1.45);
        }
      } else if (item.type === 'HIGH_LIGHT_GATE') {
        // 🔵 HIGH OVERHEAD LIGHT GATE (Solution 1: Hold Drift/Slide Under • Solution 2: Steer Around)
        const gateW = Math.max(12, itemW * 1.35);
        const gateH = Math.max(10, itemH * 1.45);
        const clearanceH = gateH * 0.48; // Open space at the bottom to slide under!
        // Side Pylons
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(itemX - gateW * 0.5, roadY - gateH, Math.max(2, gateW * 0.10), gateH);
        ctx.fillRect(itemX + gateW * 0.4, roadY - gateH, Math.max(2, gateW * 0.10), gateH);
        // Overhead Cyan/Magenta Light-Wall Beam (Raised above the ground!)
        ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.fillRect(itemX - gateW * 0.48, roadY - gateH, gateW * 0.96, gateH - clearanceH);
        if (roadW > 55) {
          ctx.fillStyle = '#00f0ff';
          ctx.font = 'bold 8px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔽 SLIDE (S) OR DODGE', itemX, roadY - gateH - 4);
        }
      } else if (item.type === 'HOLO_BARRIER') {
        // Animated 2026 Clock Hollow Laser-Chevron Obstacle with Rotating Beacon!
        const barW = Math.max(8, itemW * 1.15);
        const barH = Math.max(5, itemH * 0.68);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(itemX - barW * 0.5, roadY - barH, barW, barH);
        ctx.fillStyle = (Math.floor(nowSec * 6) % 2 === 0) ? '#ff5500' : '#facc15';
        ctx.fillRect(itemX - barW * 0.44, roadY - barH * 0.78, barW * 0.36, barH * 0.52);
        ctx.fillRect(itemX + barW * 0.08, roadY - barH * 0.78, barW * 0.36, barH * 0.52);
      } else if (item.type === 'STREET_LAMP') {
        const postH = itemH * 2.5;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(itemX - 1.5, roadY - postH, 3, postH);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(itemX, roadY - postH, Math.max(2, itemW * 0.25), 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'SIGN_88' || item.type === 'CLOCK_TOWER_BILLBOARD') {
        const postH = itemH * 1.7;
        ctx.fillStyle = '#475569';
        ctx.fillRect(itemX - 2, roadY - postH, 4, postH);
        ctx.fillStyle = item.type === 'SIGN_88' ? '#ea580c' : '#1e1b4b';
        ctx.fillRect(itemX - itemW * 0.7, roadY - postH, itemW * 1.4, itemH * 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(itemX - itemW * 0.5, roadY - postH + itemH * 0.2, itemW, itemH * 0.35);
      } else if (item.type === 'PALM_TREE' || item.type === 'ARCH_HW') {
        const trunkH = itemH * 2.1;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(itemX - itemW * 0.1, roadY - trunkH, itemW * 0.2, trunkH);
        ctx.fillStyle = eraCfg.id === '2088' ? '#ff007f' : '#10b981';
        ctx.beginPath();
        ctx.arc(itemX, roadY - trunkH, itemW * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render Live 3D Rigid-Body Obstacles on this Segment (Sleek 3D Street Barricades & Hurdles — Zero Distracting Blue Bars!)
    for (let o = 0; o < LiveTraffic.obstacles.length; o++) {
      const ob = LiveTraffic.obstacles[o];
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

      if (ob.type === 'PINE_TREE_HAZARD') {
        // 🌲 3D TWIN-PINES SLALOM TREE (Dodge Around OR Graze the Golden Ring for +11 MPH Boost!)
        const treeH = oh * 2.35;
        // Golden Close-Shave Graze Ring on the track
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.lineWidth = Math.max(1.5, ow * 0.05);
        ctx.beginPath();
        ctx.ellipse(0, oh * 0.40, ow * 0.72, oh * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 3D Textured Cedar Trunk
        ctx.fillStyle = '#451a03';
        ctx.fillRect(-ow * 0.14, -oh * 0.1, ow * 0.28, oh * 0.55);

        // 3 Layered 3D Pine Foliage Cones with Neon-Sunset Rim Lighting
        const layers = [
          { yBot: 0.05, yTop: -0.75, wSpan: 0.62, col: '#064e3b', rim: '#10b981' },
          { yBot: -0.45, yTop: -1.35, wSpan: 0.48, col: '#047857', rim: '#34d399' },
          { yBot: -1.00, yTop: -1.95, wSpan: 0.34, col: '#059669', rim: '#6ee7b7' }
        ];
        for (let l = 0; l < layers.length; l++) {
          const ly = layers[l];
          ctx.fillStyle = ly.col;
          ctx.beginPath();
          ctx.moveTo(-ow * ly.wSpan, oh * ly.yBot);
          ctx.lineTo(0, oh * ly.yTop);
          ctx.lineTo(ow * ly.wSpan, oh * ly.yBot);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = ly.rim;
          ctx.lineWidth = 1.5;
          ctx.stroke();
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
    const allMovingCars = LiveTraffic.racers.concat(LiveTraffic.traffic);
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
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(cx - cw * 0.54, roadYifted - 2, cw * 1.08, 4);
      }

      // 2. Tires
      ctx.fillStyle = '#090a0f';
      ctx.fillRect(cx - cw * 0.52, roadYifted - ch * 0.38, cw * 0.18, ch * 0.38);
      ctx.fillRect(cx + cw * 0.34, roadYifted - ch * 0.38, cw * 0.18, ch * 0.38);

      if (isTruck) {
        // 18-Wheeler Semi-Truck Trailer with Metallic Ribs & Amber Clearance Lights
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx - cw * 0.5, roadY - ch * 1.15, cw, ch * 0.92);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(cx - cw * 0.46, roadY - ch * 1.1, cw * 0.92, ch * 0.82);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(cx - cw * 0.44, roadY - ch * 1.12, cw * 0.12, 3);
        ctx.fillRect(cx + cw * 0.32, roadY - ch * 1.12, cw * 0.12, 3);
      } else {
        // 3D Shaded Car Lower Chassis & Tapered Roof Cabin
        ctx.fillStyle = mv.bodyColor || '#334155';
        ctx.fillRect(cx - cw * 0.5, roadYifted - ch * 0.68, cw, ch * 0.48);

        // Tapered 3D Roof & Rear Windshield
        ctx.fillStyle = mv.accentColor || '#64748b';
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.44, roadYifted - ch * 0.68);
        ctx.lineTo(cx - cw * 0.32, roadYifted - ch * 1.08);
        ctx.lineTo(cx + cw * 0.32, roadYifted - ch * 1.08);
        ctx.lineTo(cx + cw * 0.44, roadYifted - ch * 0.68);
        ctx.closePath();
        ctx.fill();

        // Dark Tinted Rear Window
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx - cw * 0.28, roadYifted - ch * 1.02, cw * 0.56, ch * 0.30);

        // Dez's Brawler Chrome Blower OR Kai's Carbon GT Spoiler Wing!
        if (mv.style === 'MUSCLE') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(cx - cw * 0.12, roadY - ch * 1.20, cw * 0.24, ch * 0.15);
        } else if (mv.style === 'TUNER_WING') {
          ctx.fillStyle = '#090a0f';
          ctx.fillRect(cx - cw * 0.48, roadY - ch * 0.86, cw * 0.96, Math.max(2, ch * 0.08));
          ctx.fillRect(cx - cw * 0.32, roadY - ch * 0.86, 2, ch * 0.18);
          ctx.fillRect(cx + cw * 0.30, roadY - ch * 0.86, 2, ch * 0.18);
        }

        // Twin NOS Purge Flames when Rival is Boosting!
        if (mv.nosActive) {
          ctx.fillStyle = '#00f0ff';
          ctx.fillRect(cx - cw * 0.36, roadY - ch * 0.18, cw * 0.12, ch * 0.26);
          ctx.fillRect(cx + cw * 0.24, roadY - ch * 0.18, cw * 0.12, ch * 0.26);
        }
      }

      // Headlights (for Oncoming Traffic) OR Glowing Red Taillights
      if (mv.oncoming) {
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(cx - cw * 0.44, roadY - ch * 0.52, cw * 0.22, ch * 0.18);
        ctx.fillRect(cx + cw * 0.22, roadY - ch * 0.52, cw * 0.22, ch * 0.18);
      } else {
        ctx.fillStyle = '#ff1e1e';
        ctx.fillRect(cx - cw * 0.46, roadY - ch * 0.54, cw * 0.22, ch * 0.16);
        ctx.fillRect(cx + cw * 0.24, roadY - ch * 0.54, cw * 0.22, ch * 0.16);
      }

      // Compact Rival Tag (Only for the Hero Rivals when close!)
      if (mv.underglow && roadW > 55) {
        ctx.fillStyle = mv.underglow;
        ctx.font = 'bold 9px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mv.name, cx, roadY - ch * 1.26);
      }
    }
  }

  // 4. Draw Flying Takedown Wrecks in Mid-Air!
  for (let i = 0; i < GameState.flyingWrecks.length; i++) {
    const w = GameState.flyingWrecks[i];
    ctx.save();
    ctx.translate(rw * 0.5 + w.x * (rw / 480), rh * 0.72 - w.y * (rh / 480));
    ctx.rotate(w.rot);
    ctx.fillStyle = w.color;
    ctx.fillRect(-22, -12, 44, 24);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-14, -6, 28, 12);
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
  const playerSeg = foundPlayerSeg || track.segments[baseIndex + 6] || visibleSegments[0] || baseSeg;
  if (playerSeg && playerSeg.p1 && playerSeg.p1.screen && playerSeg.p1.screen.w > 0) {
    const segRoadX = playerSeg.p1.screen.x;
    const segRoadW = playerSeg.p1.screen.w;
    GameState.playerScreenX = Math.round(segRoadX + GameState.playerX * segRoadW);
  } else {
    GameState.playerScreenX = Math.floor(rw * 0.5);
  }

  if (GameState.cameraMode !== 2) {
    drawPlayerCar(ctx, rw, rh, eraCfg);
  }

  drawCarFx(ctx, rw, rh);

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
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  const playing = GameState.status === 'PLAYING';
  const feel = speedFeel(playing ? GameState.speed : 0, GameState.reducedMotion);
  // FOV push-in toward the vanishing point as you approach 88 (crop the source a touch).
  const cropW = pixelCanvas.width / feel.fov;
  const cropH = pixelCanvas.height / feel.fov;
  const cropX = (pixelCanvas.width - cropW) * 0.5;
  const cropY = (pixelCanvas.height - cropH) * 0.46;
  const shakeX = feel.shake * Math.sin(fxClock * 61.0) * (mainCanvas.width / 1280);
  const shakeY = feel.shake * Math.sin(fxClock * 47.0 + 1.3) * (mainCanvas.width / 1280);
  mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX, shakeY, mainCanvas.width, mainCanvas.height);
  // Time-warp chromatic split: two offset additive ghosts for ~0.9 s after a warp.
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) {
    const k = GameState.warpFxTimer / 0.9;
    const off = 10 * k * (mainCanvas.width / 1280);
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.globalAlpha = 0.22 * k;
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX - off, shakeY, mainCanvas.width, mainCanvas.height);
    mainCtx.drawImage(pixelCanvas, cropX, cropY, cropW, cropH, shakeX + off, shakeY, mainCanvas.width, mainCanvas.height);
    mainCtx.globalAlpha = 1;
    mainCtx.globalCompositeOperation = 'source-over';
    drawWarpTunnel(mainCtx, k);
  }
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  mainCtx.restore();
}

/** Pickups flying into the car, hit shockwaves and debris (screen space; both renderers). */
function drawCarFx(ctx, rw, rh) {
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

    ctx.save();
    ctx.translate(curX, curY);
    ctx.rotate(pa.spin);
    ctx.fillStyle = pa.type === 'PLUTONIUM' ? '#00f0ff' : '#facc15';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.5, -r * 0.5, r, r);
    ctx.restore();
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
function drawSpeedLines(c, intensity) {
  GameState.fxLinesDrawn = 0;
  if (intensity <= 0) return;
  const W = mainCanvas.width, H = mainCanvas.height;
  const cx = W * 0.5, cy = H * 0.44;
  const count = Math.round(10 + 34 * intensity);
  const maxR = Math.hypot(W, H) * 0.62;
  c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    // Deterministic per-line angle; phase scrolls with time so lines fly outward.
    const seed = Math.sin(i * 91.17) * 43758.5453;
    const ang = (seed - Math.floor(seed)) * Math.PI * 2;
    const phase = (fxClock * (1.6 + intensity * 2.4) + i * 0.137) % 1;
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
  const W = mainCanvas.width, H = mainCanvas.height;
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
  const sx = mainCanvas.width / rw, sy = mainCanvas.height / rh;
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

  // Apply camera banking + 2-Wheel tilt + stunt barrel roll + counter-steer drift yaw!
  const rollRad = (GameState.cameraBank + GameState.stuntSpinAngle + GameState.driftAngle * 0.38) * (Math.PI / 180);
  ctx.rotate(rollRad);
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
    ctx.fillRect(-carW * 0.56, carH * 0.40 + jumpOffset * 0.65, carW * 1.12, Math.max(5, carH * 0.20));
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
  if (isHovering) {
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(-carW * 0.58, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillRect(carW * 0.33, carH * 0.28, carW * 0.25, carH * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-carW * 0.52, carH * 0.32, carW * 0.14, carH * 0.08);
    ctx.fillRect(carW * 0.38, carH * 0.32, carW * 0.14, carH * 0.08);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(-carW * 0.52, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillRect(carW * 0.30, carH * 0.12, carW * 0.22, carH * 0.42);
    ctx.fillStyle = SaveStore.data.underglow || '#ff5500';
    ctx.fillRect(-carW * 0.50, carH * 0.22, carW * 0.04, carH * 0.22);
    ctx.fillRect(carW * 0.46, carH * 0.22, carW * 0.04, carH * 0.22);
  }

  // Sculpted 3D Metallic Sports-Car Chassis with Aerodynamic Fender Bevels
  const bodyGrad = ctx.createLinearGradient(-carW * 0.5, -carH * 0.2, carW * 0.5, carH * 0.4);
  bodyGrad.addColorStop(0, liveryObj.body);
  bodyGrad.addColorStop(0.5, '#f8fafc');
  bodyGrad.addColorStop(1, liveryObj.body);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-carW * 0.44, -carH * 0.16);
  ctx.lineTo(carW * 0.44, -carH * 0.16);
  ctx.lineTo(carW * 0.50, carH * 0.06);
  ctx.lineTo(carW * 0.46, carH * 0.36);
  ctx.lineTo(-carW * 0.46, carH * 0.36);
  ctx.lineTo(-carW * 0.50, carH * 0.06);
  ctx.closePath();
  ctx.fill();

  // Lower Carbon-Fiber Rear Diffuser Skirt
  ctx.fillStyle = '#090d16';
  ctx.fillRect(-carW * 0.44, carH * 0.22, carW * 0.88, carH * 0.14);

  // Tapered 3D Fastback Gull-Wing Cabin
  const cabGrad = ctx.createLinearGradient(0, -carH * 0.56, 0, -carH * 0.15);
  cabGrad.addColorStop(0, '#ffffff');
  cabGrad.addColorStop(1, liveryObj.cabin);
  ctx.fillStyle = cabGrad;
  ctx.beginPath();
  ctx.moveTo(-carW * 0.42, -carH * 0.15);
  ctx.lineTo(-carW * 0.29, -carH * 0.54);
  ctx.lineTo(carW * 0.29, -carH * 0.54);
  ctx.lineTo(carW * 0.42, -carH * 0.15);
  ctx.closePath();
  ctx.fill();

  // Rear Black Louvers & Fusion Canister Reactor
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-carW * 0.26, -carH * 0.46, carW * 0.52, carH * 0.28);

  // Vehicle Signature Details (Muscle Blower, Sentry Scanner, Light-Cycle Canopy, or Flux Core)
  if (activeChar.shape === 'MUSCLE') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-carW * 0.12, -carH * 0.64, carW * 0.24, carH * 0.18);
  } else if (activeChar.shape === 'SCANNER') {
    const scanX = Math.sin(Date.now() * 0.008) * (carW * 0.28);
    ctx.fillStyle = '#ff1e1e';
    ctx.fillRect(scanX - carW * 0.08, -carH * 0.12, carW * 0.16, carH * 0.08);
  }
  // Voss Dynamics Circular Arc Core + Flux Core Y-Matrix
  ctx.fillStyle = '#00f0ff';
  ctx.beginPath();
  ctx.arc(0, -carH * 0.32, Math.max(3.5, carW * 0.065), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -carH * 0.32, Math.max(1.8, carW * 0.032), 0, Math.PI * 2);
  ctx.fill();

  const fluxGlowCol = GameState.fluxCharge >= 95 || GameState.speed >= 88 ? '#00f0ff' : '#facc15';
  ctx.strokeStyle = fluxGlowCol;
  ctx.lineWidth = Math.max(1.5, carW * 0.032);
  ctx.beginPath();
  ctx.moveTo(0, -carH * 0.32);
  ctx.lineTo(-carW * 0.08, -carH * 0.44);
  ctx.moveTo(0, -carH * 0.32);
  ctx.lineTo(carW * 0.08, -carH * 0.44);
  ctx.moveTo(0, -carH * 0.32);
  ctx.lineTo(0, -carH * 0.20);
  ctx.stroke();

  // Dual Nuclear Exhaust Vents
  ctx.fillStyle = '#334155';
  ctx.fillRect(-carW * 0.42, -carH * 0.28, carW * 0.14, carH * 0.22);
  ctx.fillRect(carW * 0.28, -carH * 0.28, carW * 0.14, carH * 0.22);

  // BTTF Taillights + OUTATIME Plate
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-carW * 0.44, -carH * 0.02, carW * 0.26, carH * 0.15);
  ctx.fillRect(carW * 0.18, -carH * 0.02, carW * 0.26, carH * 0.15);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(-carW * 0.44, -carH * 0.02, carW * 0.12, carH * 0.07);
  ctx.fillRect(carW * 0.32, -carH * 0.02, carW * 0.12, carH * 0.07);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-carW * 0.13, -carH * 0.01, carW * 0.26, carH * 0.16);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(-carW * 0.11, carH * 0.03, carW * 0.22, carH * 0.07);

  // Twin Plasma & Nitrous Exhaust Plumes
  if (GameState.speed >= 76 || GameState.warpActiveTimer > 0 || GameState.driftTier > 0) {
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
function activeCarParams() {
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  if (!GameState.carParams || GameState.carParamsFor !== c.id) {
    GameState.carParams = carParams(c);
    GameState.carParamsFor = c.id;
  }
  return GameState.carParams;
}

/** Body/cabin colours for a car: its garage paint (ticket 0071) or the factory colours. */
function carPaint(c) {
  const paintId = SaveStore.data.garage.paint[c.id];
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

/** Results-screen medal line: what you earned, your best, and the next target. */
function renderRunMedal(lvl, result) {
  const el = document.getElementById('endMedalText');
  if (!el) return;
  const prog = SaveStore.data.progress[lvl.id] || { best: 0, medal: null };
  const earned = result.medal ? `${MEDAL_ICON[result.medal]} ${result.medal.toUpperCase()}` : 'NO MEDAL';
  const next = nextTarget(lvl.id, GameState.score);
  const nextTxt = next ? ` • NEXT ${MEDAL_ICON[next.medal]} ${next.score.toLocaleString()}` : ' • TOP OF THE LADDER';
  el.textContent = `${earned}${result.newBest ? ' • NEW BEST!' : ` • BEST ${prog.best.toLocaleString()}`}${nextTxt}`;
  const unlockEl = document.getElementById('endUnlockText');
  if (unlockEl) {
    const opened = result.unlocked !== null ? WORLD_LEVELS[result.unlocked] : null;
    unlockEl.textContent = opened ? `🔓 UNLOCKED: ${opened.name}` : '';
    unlockEl.classList.toggle('hidden', !opened);
  }
}

/** Results: what the run earned, what sloppy driving cost, and why (ticket 0073). */
function renderScoreSheet(sheet) {
  const el = document.getElementById('endPenaltyText');
  if (!el) return;
  if (!sheet.penalty) {
    el.textContent = 'CLEAN RUN — NO PENALTIES ✨';
    el.className = 'mt-0.5 text-[8px] sm:text-[9px] font-arcade font-bold text-emerald-300';
    return;
  }
  const why = [];
  if (sheet.obstacleHits) why.push(`${sheet.obstacleHits} HIT${sheet.obstacleHits > 1 ? 'S' : ''}`);
  if (sheet.trafficHits) why.push(`${sheet.trafficHits} CRASH${sheet.trafficHits > 1 ? 'ES' : ''}`);
  if (sheet.wallSec) why.push(`${sheet.wallSec}s WALL`);
  el.textContent = `${sheet.earned.toLocaleString()} − ${sheet.penalty.toLocaleString()} (${why.join(' · ')})`;
  el.className = 'mt-0.5 text-[8px] sm:text-[9px] font-arcade font-bold text-rose-300';
}

/** Results line for cars a race just unlocked (the garage plays the full reveal). */
function announceNewCars(ids) {
  if (!ids.length) return;
  // The full-screen reveal lands just after the results, so the score is seen first.
  setTimeout(() => loadGarageUI().then((ui) => ui.queueReveals(ids)), 1100);
  const el = document.getElementById('endUnlockText');
  if (!el) return;
  const names = ids.map((id) => (POP_CULTURE_ROSTER.find((c) => c.id === id) || {}).car).filter(Boolean);
  const carLine = `🏎️ NEW CAR UNLOCKED: ${names.join(' + ').toUpperCase()}`;
  el.textContent = el.classList.contains('hidden') || !el.textContent ? carLine : `${el.textContent} • ${carLine}`;
  el.classList.remove('hidden');
}

function renderLevelSelectGrid() {
  const grid = document.getElementById('levelSelectGrid');
  if (!grid) return;
  grid.innerHTML = '';

  WORLD_LEVELS.forEach((lvl) => {
    const isSelected = (GameState.levelIndex === lvl.index);
    const locked = lvl.index >= (SaveStore.data.unlockedLevel || 1);
    const prog = (SaveStore.data.progress || {})[lvl.id] || { best: 0, medal: null };
    const medals = LEVEL_MEDALS[lvl.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.levelId = lvl.id;
    card.dataset.locked = locked ? '1' : '0';
    card.className = `text-left p-2.5 rounded-xl border transition flex flex-col justify-between ${
      locked
        ? 'bg-slate-950/70 border border-slate-800 opacity-60 cursor-not-allowed'
        : isSelected
        ? 'bg-orange-500/20 border-2 border-orange-400 shadow-[0_0_15px_rgba(255,102,0,0.35)]'
        : 'bg-slate-950/90 border border-slate-800 hover:border-slate-600'
    }`;
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-1">
          <span class="font-arcade text-[10px] font-black text-white">${lvl.name}</span>
          <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-arcade text-[8px] font-bold">🔥H${lvl.startingHeat}</span>
        </div>
        <div class="text-[10px] text-cyan-300 font-semibold mt-0.5">${lvl.subtitle}</div>
        <div class="text-[9px] text-slate-400 mt-1">🎯 ${lvl.goalDesc}</div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[9px] font-arcade">
        <span class="text-amber-300">BOSS: ${lvl.bossName}</span>
        <span class="text-emerald-300 font-bold">+${lvl.bonusReward} ⚡</span>
      </div>
      <div class="level-ladder mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] font-arcade">
        ${locked
          ? `<span class="text-slate-400">🔒 Earn ${MEDAL_ICON.bronze} on the level before</span>`
          : `<span class="text-white font-bold">${prog.medal ? MEDAL_ICON[prog.medal] : '▫️'} BEST <span class="level-best">${prog.best.toLocaleString()}</span></span>
             <span class="text-slate-400">${MEDAL_ICON.bronze}${shortScore(medals.bronze)} ${MEDAL_ICON.silver}${shortScore(medals.silver)} ${MEDAL_ICON.gold}${shortScore(medals.gold)}</span>`}
      </div>
    `;
    card.addEventListener('click', () => {
      if (locked) return;
      GameState.levelIndex = lvl.index;
      SaveStore.data.selectedLevel = lvl.index;
      SaveStore.save();
      renderCharacterRosterGrid();
      selectCharacterByIndex(GameState.selectedCharIdx);
      renderLevelSelectGrid();
    });
    grid.appendChild(card);
  });
}

// The showroom is its own chunk (ticket 0072): it loads the first time the garage opens or a
// car unlocks, so the race boots without it.
let garageUI = null;
let garageLoading = null;
function loadGarageUI() {
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
let onboarding = createOnboarding({ newPlayer: false });
let raceClock = createRaceClock();
const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function titleVisible() {
  const el = document.getElementById('titleScreen');
  return !!el && !el.classList.contains('hidden') && GameState.status !== 'PLAYING';
}

function updateTitleChip() {
  const chip = document.getElementById('titleEventChip');
  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
  if (chip) chip.textContent = `${lvl.name} · ${GameState.mode === 'INFINITE' ? 'ENDLESS' : 'ARCADE'}`;
}

function openEventsPanel() {
  renderCharacterRosterGrid();
  selectCharacterByIndex(GameState.selectedCharIdx || 0);
  renderLevelSelectGrid();
  document.getElementById('startModal').classList.remove('hidden');
}

function closeEventsPanel() {
  document.getElementById('startModal').classList.add('hidden');
  updateTitleChip();
}

function setSteerHint(on) {
  const el = document.getElementById('steerHint');
  if (el) el.classList.toggle('hidden', !on);
}

function updateOnboarding() {
  if (InputState.left || InputState.right || Math.abs(GameState.playerVX) > 0.6) onboarding.steer();
  setSteerHint(onboarding.hint(performance.now()) === 'steer');
}

// --- DAILY CHALLENGE & GLOBAL LEADERBOARD (tickets 0023, 0025) ---
// Traffic draws from this; a daily run swaps in a date-seeded RNG so everyone meets the
// same rivals. Visual FX keep Math.random (they don't change the race).
let trafficRand = Math.random;
let currentRun = null; // { tokenPromise, t0, mode, level }
let boardView = { board: 'all', mode: 'ARCADE' };

function todaysDaily() { return dailySpec(utcDay(Date.now()), WORLD_LEVELS.length); }

function applyDailyModifier(id) {
  if (id === 'HEAT_WAVE') GameState.heatLevel += 2;
  else if (id === 'GLASS_CHASSIS') { GameState.maxHp = Math.round(GameState.maxHp / 2); GameState.hp = GameState.maxHp; }
  else if (id === 'FLUX_STORM') GameState.fluxCharge = Math.max(GameState.fluxCharge, 60);
  else if (id === 'RUSH_HOUR') GameState.trafficGapScale = 0.66;
}

function renderDailyCard() {
  const d = todaysDaily();
  const lvl = WORLD_LEVELS[d.levelIndex];
  const t = document.getElementById('dailyTitle');
  const desc = document.getElementById('dailyDesc');
  if (t) t.textContent = `${lvl.name.replace(/^LVL \d+:\s*/, '')} · ${d.modifier.name}`;
  if (desc) desc.textContent = `${d.modifier.desc}. Same road for everyone today.`;
}

function renderBoard(data) {
  const list = document.getElementById('boardList');
  const status = document.getElementById('boardStatus');
  if (!list || !status) return;
  list.textContent = '';
  if (!data) { status.textContent = 'LEADERBOARD OFFLINE — YOUR BEST IS SAVED ON THIS DEVICE'; return; }
  status.textContent = data.entries.length ? '' : 'NO SCORES YET — BE THE FIRST';
  const me = SaveStore.data.initials;
  for (const e of data.entries) {
    const li = document.createElement('li');
    li.className = `board-row${e.initials === me ? ' me' : ''}`;
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = `#${e.rank}`;
    const ini = document.createElement('span'); ini.className = 'in'; ini.textContent = e.initials;
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = e.score.toLocaleString();
    li.append(rk, ini, sc);
    list.appendChild(li);
  }
}

async function loadBoard() {
  document.querySelectorAll('.board-tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.board === boardView.board && b.dataset.mode === boardView.mode));
  });
  const status = document.getElementById('boardStatus');
  if (status) status.textContent = 'LOADING…';
  const view = { ...boardView };
  const data = await fetchBoard(view.board, view.mode, 10);
  if (view.board === boardView.board && view.mode === boardView.mode) renderBoard(data);
}

function openLeaderboard(view) {
  if (view) boardView = view;
  renderDailyCard();
  const best = document.getElementById('boardYourBest');
  if (best) best.textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('leaderboardModal').classList.remove('hidden');
  loadBoard();
}

function closeLeaderboard() {
  document.getElementById('leaderboardModal').classList.add('hidden');
}

async function postScore(initials) {
  const rankEl = document.getElementById('endRankText');
  const form = document.getElementById('initialsForm');
  const run = currentRun;
  if (!run || !rankEl) return;
  currentRun = null; // one submission per run
  form.classList.add('hidden');
  rankEl.textContent = 'POSTING…';
  const token = await run.tokenPromise;
  if (!token) { rankEl.textContent = 'LEADERBOARD OFFLINE — BEST SAVED LOCALLY'; return; }
  const r = await submitRun({
    token, initials, score: run.score, distance: run.distance, durationMs: run.durationMs,
    warps: run.warps, level: run.level, mode: run.mode, car: run.car, earned: run.earned, pen: run.pen,
  });
  if (r.ok) rankEl.textContent = `🏆 ${initials} ${rankLine(r.body.rank)}`;
  else if (r.status === 400) { rankEl.textContent = 'PICK OTHER INITIALS'; SaveStore.data.initials = ''; SaveStore.save(); currentRun = run; form.classList.remove('hidden'); }
  else if (r.status === 0 || r.status === 503) rankEl.textContent = 'LEADERBOARD OFFLINE — BEST SAVED LOCALLY';
  else rankEl.textContent = 'SCORE NOT ACCEPTED';
}

function offerScoreSubmission() {
  const form = document.getElementById('initialsForm');
  const rankEl = document.getElementById('endRankText');
  if (!form || !rankEl) return;
  rankEl.textContent = '';
  form.classList.add('hidden');
  if (!currentRun || currentRun.score <= 0) { currentRun = null; return; }
  const saved = normalizeInitials(SaveStore.data.initials);
  if (saved) { postScore(saved); return; }
  form.classList.remove('hidden');
  const input = document.getElementById('initialsInput');
  if (input) { input.value = ''; if (!coarsePointer) input.focus(); }
}

// --- START / END / PAUSE FLOWS ---
function startNewRace(opts) {
  SoundEngine.init();
  SoundEngine.startMusicLoop();

  // A daily run (ticket 0023) borrows today's level and rules without touching your
  // campaign selection; any other start (button, Enter, tap) is a normal race.
  const daily = opts && opts.daily ? todaysDaily() : null;
  GameState.daily = daily;
  if (daily) {
    if (GameState.savedLevelIndex === undefined) {
      GameState.savedLevelIndex = GameState.levelIndex;
      GameState.savedMode = GameState.mode;
    }
    GameState.levelIndex = daily.levelIndex;
    GameState.mode = 'ARCADE';
  } else if (GameState.savedLevelIndex !== undefined) {
    GameState.levelIndex = GameState.savedLevelIndex;
    GameState.mode = GameState.savedMode || 'ARCADE';
    GameState.savedLevelIndex = undefined;
  }
  trafficRand = daily ? mulberry32(daily.seed) : Math.random;
  GameState.trafficGapScale = 1;

  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];

  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  GameState.status = 'PLAYING';
  GameState.eraIndex = lvl.startEra;
  GameState.maxHp = activeCarParams().maxHp;
  GameState.hp = GameState.maxHp;
  GameState.invulnTimer = 0;
  GameState.waveTier = 1;
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
  raceClock = createRaceClock({ levelIndex: lvl.index });
  GameState.timeLeft = raceClock.timeLeft;
  GameState.finalStretch = false;
  GameState.distance = 0;
  GameState.raceTime = 0;
  GameState.finishTime = null;
  GameState.raceLength = GameState.mode === 'INFINITE' ? 0 : raceLengthFor(lvl.index);
  GameState.trackPos = 0;
  GameState.playerX = 0;
  GameState.playerVX = 0;
  GameState.playerY = 0;
  GameState.playerVY = 0;
  GameState.speed = 26;
  GameState.peakSpeed = 42;
  GameState.fluxCharge = FLUX.start;
  GameState.sinceWarp = FLUX.warpCooldown;
  GameState.warpFxTimer = 0;
  sparks.clear();
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

  const branchBadge = document.getElementById('trackBranchBadge');
  if (branchBadge) branchBadge.textContent = lvl.name;

  initTrack();
  syncAudioUI();
  updateEraHud();
  updateContractHud();
  if (raceHud) raceHud.reset();
  updateLiveHud(true);

  document.getElementById('titleScreen').classList.add('hidden');
  document.body.classList.remove('on-title');
  document.getElementById('startModal').classList.add('hidden');
  document.getElementById('garageModal').classList.add('hidden');
  document.getElementById('gameOverModal').classList.add('hidden');

  onboarding = createOnboarding({ newPlayer: isNewPlayer(SaveStore.data) });
  onboarding.start(performance.now());
  // The attract-mode coach must not linger into the race under the level intro.
  const coachBanner = document.getElementById('interactiveCoachBanner');
  if (coachBanner) hideCoach(coachBanner);
  coachYieldUntil = performance.now() + 350;
  document.getElementById('leaderboardModal').classList.add('hidden');

  if (daily) applyDailyModifier(daily.modifier.id);
  currentRun = {
    tokenPromise: beginRun(), t0: performance.now(), level: lvl.index,
    mode: daily ? 'DAILY' : (GameState.mode === 'INFINITE' ? 'INFINITE' : 'ARCADE'),
  };

  if (daily) triggerAnnouncement(`📅 DAILY: ${daily.modifier.name}`, daily.modifier.desc.toUpperCase(), 2300);
  else triggerAnnouncement(`🏁 ${lvl.name} 🏁`, `GOAL: ${lvl.goalDesc.toUpperCase()}`, 2300);
}

/** You crossed the line (ticket 0051): a bonus for where you finished, then the results. */
function finishRace() {
  let ahead = 0;
  for (const r of LiveTraffic.racers) if (r.finishTime != null && r.finishTime < GameState.finishTime) ahead++;
  GameState.racePosition = ahead + 1;
  GameState.score += finishBonus(GameState.racePosition);
  endRaceRun('🏁 FINISH!');
}

function endRaceRun(customBadgeText = null) {
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
  SaveStore.save();
  if (result) renderRunMedal(lvl, result);
  else {
    document.getElementById('endMedalText').textContent = `📅 DAILY CHALLENGE · ${GameState.daily.modifier.name}`;
    document.getElementById('endUnlockText').classList.add('hidden');
  }
  announceNewCars(newCars);
  if (currentRun) {
    currentRun.score = scoreSheet.final;
    currentRun.earned = scoreSheet.earned;
    currentRun.pen = logPayload(penLog);
    currentRun.distance = Math.max(0, Math.round(GameState.distance));
    currentRun.durationMs = Math.round(performance.now() - currentRun.t0);
    currentRun.warps = GameState.timeWarps;
    currentRun.car = (POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0]).id;
  }

  document.getElementById('endScoreText').textContent = GameState.score.toLocaleString();
  renderScoreSheet(scoreSheet);
  document.getElementById('endWarpsText').textContent = `${ordinal(GameState.racePosition)} • ${GameState.timeWarps} WARPS`;
  document.getElementById('endPeakSpeedText').textContent = `${Math.round(GameState.peakSpeed)} MPH • ${GameState.takedowns} TD`;
  document.getElementById('endCoinsText').textContent = `+${GameState.runCoins} ⚡`;
  document.getElementById('gameOverModal').classList.remove('hidden');
  offerScoreSubmission();
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
      startNewRace();
      return;
    }
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) onboarding.steer();
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
      if (GameState.playerY > 10) performHumanTrick('UP');
      InputState.up = true;
    }
    if (e.code === 'KeyN') selectCharacterByIndex(nextOwnedCarIndex(GameState.selectedCharIdx));
    if (['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { if (GameState.playerY > 12) performHumanTrick('DOWN'); InputState.down = true; }
    if (e.code === 'Space') { e.preventDefault(); InputState.boostPressed = true; }
    if (['KeyH', 'KeyE'].includes(e.code)) { if (GameState.playerY > 12) performHumanTrick('UP'); else InputState.hoverPressed = true; }
    if (e.code === 'KeyZ') InputState.zonePressed = true;
    if (e.code === 'KeyX') InputState.agroPressed = true;
    if (e.code === 'KeyR') InputState.roarPressed = true;
    if (e.code === 'KeyQ') InputState.twoWheelPressed = true;
    if (e.code === 'KeyF') InputState.slamPressed = true;
    if (e.code === 'KeyB') JarvisAI.fireUnibeam();
    if (e.code === 'KeyI') cycleJarvisMode();
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
    if (['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) InputState.down = false;
  });

  function bindHoldButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (ev) => { ev.preventDefault(); el.classList.add('active-press'); onDown(); };
    const end = (ev) => { ev.preventDefault(); el.classList.remove('active-press'); onUp(); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  }

  bindHoldButton('btnSteerLeft', () => {
    onboarding.steer(); // a tap is shorter than a frame: count it on the event itself
    if (GameState.playerY > 10) performHumanTrick('LEFT');
    else {
      const now = performance.now();
      if (now - GameState.lastLeftTap < 280) performHumanTrick('JUKE_LEFT');
      GameState.lastLeftTap = now;
    }
    InputState.left = true;
  }, () => { InputState.left = false; });
  bindHoldButton('btnSteerRight', () => {
    onboarding.steer();
    if (GameState.playerY > 10) performHumanTrick('RIGHT');
    else {
      const now = performance.now();
      if (now - GameState.lastRightTap < 280) performHumanTrick('JUKE_RIGHT');
      GameState.lastRightTap = now;
    }
    InputState.right = true;
  }, () => { InputState.right = false; });
  bindHoldButton('btnBrakeDrift', () => {
    if (GameState.playerY > 12) performHumanTrick('DOWN');
    InputState.down = true;
  }, () => { InputState.down = false; });

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

  document.getElementById('btnFluxBoost').addEventListener('click', () => { SoundEngine.init(); InputState.boostPressed = true; });
  document.getElementById('btnHoverStunt').addEventListener('click', () => {
    SoundEngine.init();
    if (GameState.playerY > 12) performHumanTrick('UP');
    else InputState.hoverPressed = true;
  });
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
    openLeaderboard(GameState.daily ? { board: 'daily', mode: 'DAILY' } : { board: 'all', mode: 'ARCADE' });
  });
  document.getElementById('btnCloseLeaderboard').addEventListener('click', closeLeaderboard);
  document.getElementById('btnPlayDaily').addEventListener('click', () => startNewRace({ daily: true }));
  document.querySelectorAll('.board-tab').forEach((b) => b.addEventListener('click', () => {
    boardView = { board: b.dataset.board, mode: b.dataset.mode };
    loadBoard();
  }));
  document.getElementById('initialsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('initialsInput');
    const ini = normalizeInitials(input.value);
    if (!ini) { input.focus(); return; }
    SaveStore.data.initials = ini;
    SaveStore.save();
    setProfile({ initials: ini });
    postScore(ini);
  });
  // Typing initials must not steer the car or trigger shortcuts.
  document.getElementById('initialsInput').addEventListener('keydown', (e) => e.stopPropagation());
  // Tap anywhere on the title (outside its icons) to race.
  document.getElementById('titleScreen').addEventListener('click', (e) => {
    if (!e.target.closest('button, nav, a')) startNewRace();
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
  btnArcade.addEventListener('click', () => {
    GameState.mode = 'ARCADE';
    btnArcade.className = 'mode-select-btn flex-1 text-left px-2.5 py-2 rounded-lg bg-orange-500/20 border-2 border-orange-500 text-white font-arcade text-[10px] font-bold flex items-center justify-between';
    btnInfinite.className = 'mode-select-btn flex-1 text-left px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-arcade text-[10px] font-bold flex items-center justify-between';
  });
  btnInfinite.addEventListener('click', () => {
    GameState.mode = 'INFINITE';
    btnInfinite.className = 'mode-select-btn flex-1 text-left px-2.5 py-2 rounded-lg bg-cyan-500/20 border-2 border-cyan-400 text-white font-arcade text-[10px] font-bold flex items-center justify-between';
    btnArcade.className = 'mode-select-btn flex-1 text-left px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-arcade text-[10px] font-bold flex items-center justify-between';
  });

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
      onboarding.steer();
    } else if (dy < -28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.hoverPressed = true; // Swipe Up -> Jump / Hover!
    } else if (dy > 28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.down = true; // Swipe Down -> Duck-Slide!
      setTimeout(() => { InputState.down = false; }, 650);
    }
  });

  document.getElementById('btnStartRace').addEventListener('click', () => startNewRace());
  document.getElementById('btnPlayAgain').addEventListener('click', () => startNewRace(GameState.daily ? { daily: true } : undefined));

  window.addEventListener('resize', () => {
    resizeCanvases();
    if (!view3d) renderScene();
  });
}

function syncAudioUI() {
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

function cycleJarvisMode() {
  GameState.jarvisMode = (GameState.jarvisMode + 1) % JARVIS_MODES.length;
  const m = JARVIS_MODES[GameState.jarvisMode];
  const btn = document.getElementById('btnJarvisMode');
  if (btn) btn.textContent = m.label;
  JarvisAI.setStatus(m.desc, true);
  triggerAnnouncement(m.label, m.desc, 1200);
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
  if (GameState.status === 'PLAYING') GameState.status = 'PAUSED';
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
let view3d = null;
let view3dLoading = false;
const carsFor3D = [];

/** Every car the 3D view should draw. Remote/ghost cars belong here too. */
function collectCarsFor3D(out) {
  let n = 0;
  for (let i = 0; i < LiveTraffic.racers.length; i++) out[n++] = LiveTraffic.racers[i];
  for (let i = 0; i < LiveTraffic.traffic.length; i++) out[n++] = LiveTraffic.traffic[i];
  out.length = n;
  return n;
}

function playerPaint() {
  const ch = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  return { body: carPaint(ch).body, underglow: SaveStore.data.underglow || ch.glow };
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
      obstacles: () => LiveTraffic.obstacles,
      player: playerPaint,
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
  const rw = Math.max(240, Math.floor(mainCanvas.width / scale));
  const rh = roadCanvasHeight();
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  mainCtx.save();
  if (GameState.warpFxTimer > 0 && !GameState.reducedMotion) drawWarpTunnel(mainCtx, GameState.warpFxTimer / 0.9);
  drawSpeedLines(mainCtx, feel.lines);
  drawSparks(mainCtx, rw, rh);
  mainCtx.scale(mainCanvas.width / rw, mainCanvas.height / rh);
  drawCarFx(mainCtx, rw, rh);
  mainCtx.restore();
}

function renderFrame(dt) {
  if (!view3d) { renderScene(); return; }
  const feel = speedFeel(GameState.status === 'PLAYING' ? GameState.speed : 0, GameState.reducedMotion);
  view3d.render(dt, feel);
  renderOverlayFx(feel);
  renderRadarMinimap(Math.floor(GameState.trackPos / ROAD_CFG.segLength));
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
  for (let i = 0; i < LiveTraffic.obstacles.length; i++) fn(LiveTraffic.obstacles[i]);
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

function mainLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const frameSeconds = (timestamp - lastFrameTime) / 1000;
  const dt = Math.min(0.05, frameSeconds); // wall-clock frame time for attract mode and render FX
  lastFrameTime = timestamp;

  if (GameState.status === 'PLAYING') {
    const steps = simClock.advance(frameSeconds);
    for (let i = 0; i < steps && GameState.status === 'PLAYING'; i++) {
      snapshotView();
      updateGame(simClock.step);
      syncContactZ();
    }
    updateLiveHud();
  } else {
    simClock.reset();
    if (GameState.status !== 'PAUSED') { // attract mode rolls the road; a pause freezes it
      GameState.trackPos += 1350 * dt;
      const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
      if (track.segments.length - currentSegIdx < ROAD_CFG.drawDistance + 60) {
        generateNextTrackBiome();
      }
    }
    syncContactZ();
  }

  announcer.update();
  SoundEngine.updateEngine(GameState.speed, GameState.status === 'PLAYING' && !SoundEngine.muted);
  if (GameState.status === 'PLAYING') renderBlended(simClock.alpha, dt);
  else renderFrame(dt);
  rafId = requestAnimationFrame(mainLoop);
}

window.onload = () => {
  // Test/debug hook: ?debug exposes state for e2e checks (never used by the game itself).
  if (new URLSearchParams(location.search).has('debug')) window.__OT = {
    GameState, InputState, announce: triggerAnnouncement, startRace: startNewRace,
    pause: () => { GameState.status = 'PAUSED'; },
    finishRun: () => endRaceRun('🏁 FINISH!'),
    view: () => ({ mode: activeView, loading: view3dLoading, stats: view3d ? view3d.stats : null }),
    setView: (m) => setRenderMode(m, { persist: false }),
  };
  initSettings({ announce: triggerAnnouncement });
  watchLayout();
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
  document.getElementById('titleBestScore').textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins}`;
  const playHint = document.getElementById('playHint');
  if (playHint) playHint.textContent = coarsePointer ? 'TAP ANYWHERE' : 'PRESS ENTER';
  updateTitleChip();
  syncAudioUI();
  updateEraHud();
  updateContractHud();
  updateLiveHud();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(mainLoop);
  // Zero-login identity (ticket 0090): silent, never blocks the title.
  initRacer({ SaveStore, freshSaveData, levels: WORLD_LEVELS, onChange: renderRacerPill });
};

function renderRacerPill(p) {
  const name = document.getElementById('racerPillName');
  if (name) name.textContent = p?.initials || SaveStore.data.initials || 'RACER';
  const best = document.getElementById('titleBestScore');
  if (best) best.textContent = SaveStore.data.bestScore.toLocaleString();
}
