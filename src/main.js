import './fonts.js';
import './styles.css';
import { drawBackdrop, drawRoadsideAd, drawRoadsideProp, drawHazardArt, drawSoftShadow, queueTag, flushTags, drawWeather, preloadBackdrops, resetBackdrop, backdropDebug, setBackdropQuality } from './backdrop.js';
import { WORLD_LEVELS, ERAS, UNDERGLOW_OPTIONS, LIVERY_OPTIONS, POP_CULTURE_ROSTER, MULTIVERSE_POOL, UPGRADE_DEFS, CONTRACT_TEMPLATES, JARVIS_MODES, ROAD_CFG, PACE_MODES, CAMERA_MODES } from './data.js';
import { SaveStore, freshSaveData } from './save.js';
import { GameState } from './state.js';
import { SoundEngine, setAudioHooks } from './audio.js';
import { InputState, pollGamepad } from './input.js';
import { RigidBody3D } from './physics.js';
import { createSteer, stepSteer, createLateral, stepLateral, handlingFor, loopStep, landingKeep } from './handling.js';
import { nosFor, createNos, stepNos, addNos, nosSpeed, nosFill } from './nos.js';
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
import { LEVEL_MEDALS, MEDAL_ICON, nextTarget, applyRunResult, medalFor } from './progress.js';
import { track, generateNextTrackBiome, buildInitialTrack, featureAt, setTrackLine } from './track.js';
import { createLine, createHazardPlanner, TRAFFIC_LATERAL } from './cleanline.js';
import { watchLayout } from './layout.js';
import { createRaceClock } from './race.js';
import { createHud } from './hud.js';
// Sharing (ticket 0053) is its own chunk: fetched for the results screen or a challenge link.
let shareUi = null;
const loadShareUi = () => (shareUi = shareUi || import('./share-ui.js').then((m) => { m.initShareUi({ startChallenge }); return m; }));
import { FIELD_SIZE, RIVAL_PACES, gridSlot, rivalTargetMph, raceLengthFor, sortStandings, crossingTime, ordinal, finishBonus, lapOf, RACE_LAPS } from './raceflow.js';
import { dailySpec, mulberry32, utcDay } from './daily.js';
import { beginRun, submitRun, fetchBoard, fetchStanding, fetchHall, fetchGhost, normalizeInitials, rankLine } from './leaderboard.js';
// Leaderboard/rank UI loads after the first network answer, not at boot (main bundle budget).
const competeUI = () => import('./compete-ui.js');
import { createGhostRecorder, createGhostRace } from './ghost.js';
import { createOnboarding, isNewPlayer } from './onboarding.js';
import { initSettings, toggleTilt, recenterTilt, currentDifficulty, refreshSettingsPanel, settingsOpen, openSettings, registerControlsEditor } from './settings-ui.js';
import { createPenaltyLog, logHit, logWall, penaltyPoints, breakdown, logPayload } from './scoring.js';
import { carParams, isOwned, unlockProgress, recordRace, ensureGarage, CAR_SPECS } from './cars.js';
import { initRacer } from './racer-ui.js';
import { setProfile } from './identity.js';
import { LIVE } from './worker/live-rules.js';

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

const PROP_POOL_SIZE = 24;
const LiveTraffic = {
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
    this.planner = createHazardPlanner({ line: track.line || createLine(1), rand: () => trafficRand(), level: GameState.levelIndex });

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
      body.progress = GameState.distance + slot.dz / this.speedToWorld();
      body.finishTime = null;
      body.targetOffset = slot.offset;
      return body;
    });
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
        tr.takenDown = false;
        tr.y = 0; tr.vy = 0; tr.vx = 0; tr.rot = 0; tr.vRot = 0; tr.yaw = 0; tr.vYaw = 0;
        const maxT = Math.max(playerZ + 12000, ...this.traffic.map(t => t.worldZ));
        tr.worldZ = maxT + (4800 + trafficRand() * 2200) * GameState.trafficGapScale;
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
            addNos(nos, 'nearMiss');
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
            //    Debris someone else knocked out of place (sprint 4) bounces you but costs no points.
            if (isDebris(ob)) {
              GameState.speed = Math.max(30, GameState.speed * 0.8);
              GameState.playerX += pushDir * 0.12;
            } else if (!isBoostSmash) {
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
              ob.type === 'LOW_LASER_BAR' ? '💥 BLOCKED! JUMP (H/E) OR STEER AROUND!' : (ob.type === 'HIGH_LIGHT_GATE' ? '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!' : '💥 BARRICADE IMPACT! -14 HP')
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
        SoundEngine.playTone(420, 'square', 0.05, 0.04);
      } else if (mat.damage > 0) {
        applyPlayerDamage(mat.damage, 'BARREL HIT');
      } else {
        chargePenalty(logHit(GameState.penaltyLog, 'cone', mph), 'CONE HIT');
        SoundEngine.playTone(420, 'square', 0.05, 0.06);
      }
      GameState.dodgeStreak = 0;
    }
  }
};
/** An obstacle or prop knocked out of the spot the planner put it in (by rivals, traffic, chains). */
function isDebris(b) {
  return Math.abs(b.offset - b.homeOffset) > 0.06 || Math.abs(b.worldZ - b.homeZ) > 160;
}

function initTrack() {
  setTrackLine(createLine(GameState.lineSeed || 1));
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
  penaltyThisStep = true;
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
    if (GameState.mode === 'LIVE') live.wrecked(); // live races never end early: you respawn
    else endRaceRun('WRECKED — CHASSIS HP DEPLETED!');
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
// Handling state (ticket 0120), reset with each race; latParams is reused to avoid per-step garbage.
const steerWheel = createSteer();
const lateral = createLateral();
let latCarP = null, latTires = 0;
// NOS (ticket 0122): the tank is per race and sized by the car's FLUX/BOOST rating.
let nos = createNos(nosFor(5));
let penaltyThisStep = false;
function resetNos() {
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const spec = CAR_SPECS[c.id];
  nos = createNos(nosFor(spec ? spec.stats.flux : 5));
  GameState.nosBurning = false;
  GameState.nosFill = nosFill(nos);
}
const latParams = { speedMph: 0, curve: 0, bank: 0, worldScale: 1, h: null, braking: false, throttle: false, drifting: false, gripBonus: 1 };

function updateGame(rawDt) {
  if (GameState.status !== 'PLAYING') return;
  // Grid lineup and start lights (ticket 0052): the world waits for GO.
  if (GameState.racePhase === 'START') { if (startSeq) updateRaceStart(rawDt); return; }
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
  const accelerating = GameState.autoGas || InputState.up || InputState.touchUp || gp.gas;
  const braking = InputState.down || InputState.touchDown || gp.brake;

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

  // NOS (ticket 0122): hold to burn the tank for extra thrust past top speed, capped at the
  // warp ceiling that live rooms and the leaderboard already allow.
  const nosHeld = InputState.nosHeld || InputState.touchNos || gp.nos;
  const wasBurning = nos.burning;
  const burning = stepNos(nos, nosHeld && GameState.speed > 10, rawDt, { drifting: GameState.isDrifting, airborne: GameState.playerY > 10, penalised: penaltyThisStep });
  penaltyThisStep = false;
  if (burning) GameState.speed = nosSpeed(GameState.speed, rawDt, baseMaxMph, warpMaxMph + 8);
  if (burning && !wasBurning) {
    SoundEngine.playBoosterHit();
    if (touch) touch.controls.haptics.pulse('boost');
  }
  GameState.nosBurning = burning;
  GameState.nosFill = nosFill(nos);

  // Loops (road contract set pieces): gravity along the loop, and too slow at the top means
  // you fall off. That costs speed, not points (no new penalty kind for the server to check).
  const feat = featureAt(GameState.trackPos + ROAD_CFG.playerZOffset);
  if (feat && feat.kind === 'LOOP' && GameState.playerY <= 4) {
    const lt = (GameState.trackPos + ROAD_CFG.playerZOffset - feat.z0) / feat.length;
    const lp = loopStep(GameState.speed, feat, lt, rawDt);
    if (lp.peel && GameState.peeledLoop !== feat) {
      GameState.peeledLoop = feat;
      GameState.loopPeels = (GameState.loopPeels || 0) + 1;
      GameState.speed = Math.min(GameState.speed, 40);
      GameState.playerVY = 0;
      triggerAnnouncement('🌀 TOO SLOW FOR THE LOOP!', 'HIT IT FASTER — NOS HELPS', 1300);
      if (touch) touch.controls.haptics.pulse('hit');
    } else if (!lp.peel) {
      GameState.speed = Math.max(18, GameState.speed + lp.dv);
    }
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
  ghostRecorder.sample(GameState.raceTime, GameState.distance, GameState.playerX); // ticket 0092
  GameState.score += Math.floor(GameState.speed * dt * 2.2 * GameState.combo);
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
  if (Math.abs(InputState.touchSteerVal) > 0.01) steerInput += InputState.touchSteerVal;
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

  // A power drift is asked for (brake + steer) or happens (the tyres are sliding past grip).
  const wantsDrift = GameState.speed > 45 && GameState.playerY < 10 &&
    ((braking && Math.abs(steerInput) > 0.3) || (GameState.isDrifting ? lateral.slip > 0.12 : lateral.slip > 0.35));
  const driftBox = document.getElementById('driftCounterBox');

  if (wantsDrift) {
    GameState.isDrifting = true;
    GameState.driftChargeTime += rawDt * (1 + (upg.tires - 1) * 0.18);
    const targetYaw = (steerInput * 32 + Math.sign(steerInput || GameState.playerVX) * Math.min(1, lateral.slip) * 14) * carP.slipMult; // looser cars swing wider
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

  // Lateral motion: grip-limited tyres against the corner's pull (src/handling.js).
  lateral.x = GameState.playerX;
  lateral.vx = GameState.playerVX;
  latParams.speedMph = GameState.speed;
  latParams.curve = currentSeg ? currentSeg.curve : 0;
  latParams.bank = currentSeg ? currentSeg.bank : 0;
  latParams.worldScale = timeScale;
  if (latCarP !== carP || latTires !== upg.tires) { latCarP = carP; latTires = upg.tires; latParams.h = handlingFor(carP, upg.tires); }
  latParams.braking = Boolean(braking);
  latParams.throttle = Boolean(accelerating);
  latParams.drifting = GameState.isDrifting && Boolean(braking);
  latParams.gripBonus = GameState.zoneTimer > 0 ? 1.25 : 1;
  stepLateral(lateral, steerInput, rawDt, latParams);
  GameState.playerX = lateral.x;
  GameState.playerVX = lateral.vx;
  GameState.tyreSlip = lateral.slip;

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
      GameState.branchName = chosen === 'LEFT' ? 'SKY-LOOP SHORTCUT' : 'CEDAR TURBO TUNNEL';
      const branchBadge = document.getElementById('trackBranchBadge');
      if (branchBadge) branchBadge.textContent = `ROUTE: ${GameState.branchName}`;
      if (chosen === 'RIGHT' && GameState.mode === 'ARCADE') {
        const got = raceClock.extend(7.0);
        GameState.timeLeft = raceClock.timeLeft;
        triggerAnnouncement('CEDAR TURBO SHORTCUT!', got > 0 ? `+${got}s BONUS TIME!` : 'NO TIME LEFT TO WIN — DRIVE!', 1400);
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
      // Land straight to keep your speed (ticket 0120).
      GameState.speed *= landingKeep(GameState.playerVX, GameState.steerInput);
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
  if (GameState.mode === 'ARCADE' && GameState.racePhase !== 'FINISHED') {
    const beat = raceClock.tick(rawDt);
    GameState.timeLeft = raceClock.timeLeft;
    if (beat === 'final') {
      GameState.finalStretch = true;
      triggerAnnouncement('🏁 FINAL STRETCH 🏁', 'LAST CHANCE — CHAIN EVERYTHING!', 1700, 3);
    } else if (beat === 'over' && GameState.finishTime == null) {
      endRaceRun('⏱️ TIME UP!');
    }
  }
  if (GameState.mode === 'LIVE') live.update();
  if (GameState.racePhase === 'RACING' && GameState.status === 'PLAYING' && GameState.finishTime != null) finishRace();
  if (GameState.racePhase === 'FINISHED') GameState.score = finishScore; // the line is the line
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
  infinite: false, mph: 0, flux: 0, nos: 0, nosOn: false, hpFrac: 1, score: 0, field: LiveTraffic.fieldEntries,
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
  hudView.nos = GameState.nosFill || 0;
  hudView.nosOn = Boolean(GameState.nosBurning);
  hudView.hpFrac = GameState.maxHp ? GameState.hp / GameState.maxHp : 1;
  hudView.score = GameState.score;
  raceHud.update(hudView);
  if (ghostRace.active) ghostRace.update(hudView.raceTime, GameState.distance, GameState.speed, hudView.length);
}

// Ghost racing (ticket 0092): every race records a trace; "race the ghost" loads someone's
// best on this track for the next start and shows it on the HUD strip.
const ghostRecorder = createGhostRecorder();
const ghostRace = createGhostRace();
let pendingGhost = null; // { level, data } armed by the results screen, used by the next start

async function raceGhostOf(initials, level) {
  const data = await fetchGhost('ARCADE', level, initials);
  if (!data) { triggerAnnouncement('👻 NO GHOST YET', 'FINISH A RACE ON THIS TRACK TO LEAVE ONE', 2000); return; }
  pendingGhost = { level, data };
  GameState.levelIndex = level;
  startNewRace();
}

function updateLiveHud(forceHud) {
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


// --- PSEUDO-3D NIGHT-STREET RENDERER ---
const mainCanvas = document.getElementById('gameCanvas');
const mainCtx = mainCanvas.getContext('2d');
const pixelCanvas = document.createElement('canvas');
const pixelCtx = pixelCanvas.getContext('2d');

// Graphics quality (ticket 0041). The controller is a lazy chunk (src/perf/gfx-boot.js);
// until it lands everything draws at full quality. Render-only: the sim never reads it.
let gfxQ = { res: 1, tier: 'high', step: 0 };
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

// The backdrop's per-frame facts, reused every frame (no allocation in the render loop).
const backdropFrame = { curve: 0, trackPos: 0, playerX: 0, t: 0, raceTime: 0, speed: 0, lap: 1, laps: 0, warp: -1, reduced: false };

function renderScene() {
  const eraCfg = getActiveEraRenderConfig();
  const camCfg = CAMERA_MODES[GameState.cameraMode] || CAMERA_MODES[0];
  const scale = (eraCfg.pixelScale || 1.0) / gfxQ.res; // the governor trades resolution for frame time
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

  // 1. The era's world: sky, parallax layers and live set pieces (src/backdrop.js, ticket 0100).
  const horizonY = Math.floor(rh * 0.46 - GameState.loopPitchOffset * (rh / 420));
  const bgSeg = track.segments[Math.floor(GameState.trackPos / ROAD_CFG.segLength)];
  backdropFrame.curve = bgSeg ? bgSeg.curve : 0;
  backdropFrame.trackPos = GameState.trackPos;
  backdropFrame.playerX = GameState.playerX;
  backdropFrame.t = fxClock;
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
  const baseSeg = track.segments[baseIndex] || track.segments[0];
  if (!baseSeg) {
    ctx.restore();
    return;
  }


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
    if (live.finishZ && seg.index === Math.floor(live.finishZ / ROAD_CFG.segLength)) drawFinishLine(ctx, x1, y1, w1, x2, y2, w2);

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
      } else if ((item.type === 'STREET_LAMP' || item.type === 'PALM_TREE' || item.type === 'ARCH_HW') && drawRoadsideProp(ctx, item.type, itemX, roadY, itemW, itemH, roadW, rw, rh)) {
        // the era's own roadside (ticket 0101)
      } else if (item.type === 'STREET_LAMP') {
        const postH = itemH * 2.5;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(itemX - 1.5, roadY - postH, 3, postH);
      } else if (item.type === 'SIGN_88' || item.type === 'CLOCK_TOWER_BILLBOARD') {
        const postH = itemH * 1.7;
        ctx.fillStyle = '#475569';
        ctx.fillRect(itemX - 2, roadY - postH, 4, postH);
        ctx.fillStyle = item.type === 'SIGN_88' ? '#ea580c' : '#1e1b4b';
        ctx.fillRect(itemX - itemW * 0.7, roadY - postH, itemW * 1.4, itemH * 0.8);
        // the era's own ads on the boards (ticket 0100); plain white until its scene loads
        if (!drawRoadsideAd(ctx, itemX - itemW * 0.62, roadY - postH + itemH * 0.08, itemW * 1.24, itemH * 0.64, seg.index)) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(itemX - itemW * 0.5, roadY - postH + itemH * 0.2, itemW, itemH * 0.35);
        }
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
      } else if (!drawSoftShadow(ctx, cx, roadY, cw * 1.1)) {
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
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  const playing = GameState.status === 'PLAYING';
  const feel = nosFeel(speedFeel(playing ? GameState.speed : 0, GameState.reducedMotion));
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
  const len = rh * (calm ? 0.05 : 0.07 + 0.025 * Math.sin(fxClock * 47));
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

function drawCarFx(ctx, rw, rh) {
  drawNosFlames(ctx, rw, rh);
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

// 1955 Atomic Diner roadside set (ticket 0008): starburst lamps, a chrome diner sign and
// pastel lollipop trees stand in for the neon-era props on the same scenery slots.

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

  // Vehicle Signature Details (Muscle Blower, Nightwatch Scanner, Light-Cycle Canopy, or Flux Core)
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
  if (sheet.coneHits) why.push(`${sheet.coneHits} CONE${sheet.coneHits > 1 ? 'S' : ''}`);
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
  if (InputState.left || InputState.right || Math.abs(InputState.touchSteerVal) > 0.2 || Math.abs(GameState.playerVX) > 0.6) onboarding.steer();
  setSteerHint(onboarding.hint(performance.now()) === 'steer');
}

// --- DAILY CHALLENGE & GLOBAL LEADERBOARD (tickets 0023, 0025) ---
// Traffic draws from this; a daily run swaps in a date-seeded RNG so everyone meets the
// same rivals. Visual FX keep Math.random (they don't change the race).
let trafficRand = Math.random;
let currentRun = null; // { tokenPromise, t0, mode, level }
let boardView = { board: 'week', mode: 'ARCADE' }; // the weekly season leads (ticket 0091)

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

// Boards (ticket 0091): podium, medals on the track board, last week's champion crowned,
// your row always shown and scrolled into view, and the season clock.
let hallCache = null;

const sameView = (a, b) => a.board === b.board && a.mode === b.mode && Boolean(a.track) === Boolean(b.track);

function renderBoard(data, view) {
  const list = document.getElementById('boardList');
  const status = document.getElementById('boardStatus');
  if (!list || !status) return;
  list.textContent = '';
  if (!data) { status.textContent = 'LEADERBOARD OFFLINE — YOUR BEST IS SAVED ON THIS DEVICE'; return; }
  const lvl = view.track ? WORLD_LEVELS[data.level] : null;
  if (data.entries.length) status.textContent = lvl ? `TRACK: ${lvl.name.replace(/^LVL \d+:\s*/, '')}` : '';
  else status.textContent = view.board === 'friends'
    ? 'NO FRIENDS HERE YET — SEND A CHALLENGE OR RACE IN A ROOM'
    : 'NO SCORES YET — BE THE FIRST';
  competeUI().then(({ renderBoardRows }) => renderBoardRows(list, data, {
    me: SaveStore.data.initials,
    champion: hallCache?.champions?.[0]?.initials || null,
    medal: (e) => (lvl ? MEDAL_ICON[medalFor(lvl.id, e.score)] || '' : ''),
    reduced: GameState.reducedMotion,
  }));
}

async function renderSeason() {
  const el = document.getElementById('boardSeason');
  if (!el) return;
  const { timeLeft } = await competeUI();
  const champ = hallCache?.champions?.[0];
  const end = hallCache?.season?.endsAt;
  el.textContent = [end ? `⏳ SEASON ENDS IN ${timeLeft(end, Date.now())}` : '', champ ? `LAST WEEK 👑 ${champ.initials}` : ''].filter(Boolean).join(' · ');
}

async function loadBoard() {
  document.querySelectorAll('.board-tab').forEach((b) => {
    b.setAttribute('aria-selected', String(sameView({ board: b.dataset.board, mode: b.dataset.mode, track: b.dataset.track }, boardView)));
  });
  const status = document.getElementById('boardStatus');
  if (status) status.textContent = 'LOADING…';
  const view = { ...boardView };
  const level = view.track ? (SaveStore.data.selectedLevel || 0) : undefined;
  const data = await fetchBoard(view.board, view.mode, 10, { level, around: SaveStore.data.initials || undefined });
  if (sameView(view, boardView)) renderBoard(data, view);
}

function openLeaderboard(view) {
  if (view) boardView = view;
  renderDailyCard();
  const best = document.getElementById('boardYourBest');
  if (best) best.textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('leaderboardModal').classList.remove('hidden');
  loadBoard();
  fetchHall('ARCADE').then((h) => { if (h) { hallCache = h; renderSeason(); } });
}

// Rival line on the title and the daily streak (ticket 0091): one pull at boot, no push.
const COMPETE_KEY = 'outatime88_compete_v1';
async function refreshRival() {
  const initials = normalizeInitials(SaveStore.data.initials);
  if (!initials) return;
  let seen = 0;
  try { seen = JSON.parse(localStorage.getItem(COMPETE_KEY) || '{}').seen || 0; } catch { seen = 0; }
  const s = await fetchStanding({ initials, mode: 'ARCADE', level: SaveStore.data.selectedLevel || 0, since: seen || undefined });
  if (!s) return;
  try { localStorage.setItem(COMPETE_KEY, JSON.stringify({ seen: Date.now() })); } catch { /* blocked */ }
  const line = document.getElementById('titleRival');
  if (line) line.textContent = (await competeUI()).rivalLine(s);
  const streak = document.getElementById('dailyStreak');
  if (streak) streak.textContent = s.streak?.days ? `🔥 ${s.streak.days}-DAY STREAK${s.streak.today ? '' : ' — PLAY TODAY TO KEEP IT'}` : '';
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
    warps: run.warps, level: run.level, mode: run.mode, car: run.car, earned: run.earned, pen: run.pen, trace: run.trace,
  });
  if (r.ok) {
    const { renderRankCard } = await competeUI();
    const card = document.getElementById('endRankCard');
    const rich = card && renderRankCard(card, r.body, {
      reduced: GameState.reducedMotion,
      onGhost: run.mode === 'ARCADE' ? (who) => raceGhostOf(who, run.level) : null,
    });
    rankEl.textContent = rich ? '' : `🏆 ${initials} ${rankLine(r.body.rank)}`;
    refreshRival();
  }
  else if (r.status === 400) { rankEl.textContent = 'PICK OTHER INITIALS'; SaveStore.data.initials = ''; SaveStore.save(); currentRun = run; form.classList.remove('hidden'); }
  else if (r.status === 0 || r.status === 503) rankEl.textContent = 'LEADERBOARD OFFLINE — BEST SAVED LOCALLY';
  else rankEl.textContent = 'SCORE NOT ACCEPTED';
}

function offerScoreSubmission() {
  const form = document.getElementById('initialsForm');
  const rankEl = document.getElementById('endRankText');
  if (!form || !rankEl) return;
  rankEl.textContent = '';
  const card = document.getElementById('endRankCard');
  if (card) card.textContent = '';
  form.classList.add('hidden');
  if (!currentRun || currentRun.score <= 0) { currentRun = null; return; }
  const saved = normalizeInitials(SaveStore.data.initials);
  if (saved) { postScore(saved); return; }
  form.classList.remove('hidden');
  const input = document.getElementById('initialsInput');
  if (input) { input.value = ''; if (!coarsePointer) input.focus(); }
}

function restoreSoloSettings() {
  GameState.levelIndex = GameState.savedLevelIndex;
  GameState.mode = GameState.savedMode || 'ARCADE';
  if (GameState.savedPace !== undefined) GameState.paceMode = GameState.savedPace;
  GameState.savedLevelIndex = undefined;
  GameState.savedPace = undefined;
}

// Live races with friends (sprint 3): src/live/ owns the rooms; these are its only hooks.
// The live code is its own chunk, fetched only when you open FRIENDS or follow an invite, so
// solo players never download it; until then `live` is an inert stand-in.
const LIVE_IDLE = { ghosts: [], finishZ: 0, frame() {}, update() {}, wrecked() {}, finished() {}, clockText: () => '0:00' };
let live = LIVE_IDLE;
let liveLoading = null;
function loadLive() {
  liveLoading = liveLoading || import('./live/controller.js').then((m) => { live = m.createLive(liveHooks); return live; });
  return liveLoading;
}
const liveHooks = {
  startRace: (cfg) => startNewRace({ live: cfg }),
  announce: (main, sub, ms) => triggerAnnouncement(main, sub, ms, 3),
  selectCar: (idx) => selectCharacterByIndex(idx),
  unlockAudio: () => { SoundEngine.init(); },
  beep: (n) => {
    if (n > 0) SoundEngine.playTone(440, 'square', 0.16, 0.12);
    else if (n === 0) SoundEngine.playTone(880, 'square', 0.4, 0.14);
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

// --- START / END / PAUSE FLOWS ---
function startNewRace(opts) {
  SoundEngine.init();
  SoundEngine.startMusicLoop();

  // A daily run (ticket 0023) borrows today's level and rules without touching your
  // campaign selection; any other start (button, Enter, tap) is a normal race.
  const daily = opts && opts.daily ? todaysDaily() : null;
  const liveRace = opts && opts.live ? opts.live : null;
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
  trafficRand = liveRace ? mulberry32(liveRace.seed) : daily ? mulberry32(daily.seed) : Math.random;
  // The racing line (sprint 4) is shared by everyone on a seeded race (live rooms, dailies).
  GameState.lineSeed = liveRace ? liveRace.seed : daily ? daily.seed : (1 + Math.random() * 2147483646) | 0;
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
  GameState.raceLength = liveRace ? liveRace.length : GameState.mode === 'INFINITE' ? 0 : raceLengthFor(lvl.index);
  GameState.trackPos = 0;
  GameState.playerX = 0;
  GameState.playerVX = 0;
  steerWheel.value = 0;
  lateral.slip = 0;
  resetNos();
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
  if (liveRace) {
    // Your rivals are the room (friends + CPU cars from src/live/), not local AI.
    LiveTraffic.racers = [];
    LiveTraffic.updateStandings(0, GameState.trackPos + ROAD_CFG.playerZOffset, LiveTraffic.speedToWorld());
  }
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
  // The attract-mode coach must not linger into the race under the level intro.
  const coachBanner = document.getElementById('interactiveCoachBanner');
  if (coachBanner) hideCoach(coachBanner);
  coachYieldUntil = performance.now() + 350;
  document.getElementById('leaderboardModal').classList.add('hidden');
  GameState.autoGas = SaveStore.data.controls.autoAccel !== false;
  if (touch) touch.raceStart();

  if (daily) applyDailyModifier(daily.modifier.id);
  ghostRecorder.reset();
  const ghostFor = pendingGhost && !daily && !liveRace && pendingGhost.level === lvl.index ? pendingGhost.data : null;
  pendingGhost = null;
  if (!(ghostFor && ghostRace.load(ghostFor, GameState.raceLength || raceLengthFor(lvl.index)))) ghostRace.clear();
  if (liveRace) { // live races don't post to the solo leaderboard, and the room runs its own countdown
    currentRun = null;
    beginRaceStart(lvl, { ceremony: false });
    return;
  }
  currentRun = {
    tokenPromise: beginRun(), t0: performance.now(), level: lvl.index,
    mode: daily ? 'DAILY' : (GameState.mode === 'INFINITE' ? 'INFINITE' : 'ARCADE'),
  };

  // Lineup + lights (ticket 0052). ?debug skips them unless asked (?debug&intro or
  // startRace({ intro: true })) so tests can race at once.
  const ceremony = !DEBUG_MODE || (opts && opts.intro) || new URLSearchParams(location.search).has('intro');
  if (ceremony && !RC) { // tapped PLAY before the ceremony chunk arrived: hold on the grid for it
    GameState.racePhase = 'START';
    GameState.speed = 0;
    startSeq = null;
    const race = currentRun;
    ceremonyReady.then(() => { if (currentRun === race && GameState.status === 'PLAYING') beginRaceStart(lvl, { ceremony: true }); });
  } else beginRaceStart(lvl, { ceremony });
  if (!ceremony) {
    if (daily) triggerAnnouncement(`📅 DAILY: ${daily.modifier.name}`, daily.modifier.desc.toUpperCase(), 2300);
    else if (ghostRace.active) triggerAnnouncement(`👻 BEAT ${ghostRace.initials}'S GHOST`, `${lvl.name.replace(/^LVL \d+:\s*/, '')} · THEIR BEST LINE, LIVE ON YOUR STRIP`, 2300);
    else triggerAnnouncement(`🏁 ${lvl.name} 🏁`, `GOAL: ${lvl.goalDesc.toUpperCase()}`, 2300);
  }
}


// --- RACE CEREMONY (ticket 0052): lineup, lights, rocket start, callouts, finish flag ---
const DEBUG_MODE = new URLSearchParams(location.search).has('debug');
let startSeq = null;
let launchPressAt = null;
let launchJudged = false;
let finishScore = 0;
let finishSeqLeft = 0;
let skipRequested = false;
const lineupSeen = new Set();
// The ceremony code (src/racecall.js + src/racestage.js) is its own chunk, fetched at boot in
// parallel with everything else, so it is ready long before anyone reaches the grid.
let RC = null;
let callouts = null;
const ceremonyReady = Promise.all([import('./racecall.js'), import('./racestage.js')]).then(([call, stageMod]) => {
  RC = { ...call, ...stageMod };
  callouts = RC.createCallouts({ laps: RACE_LAPS });
}).catch(() => {});
let lapStartedAt = 0;
let lapNow = 1;

/** The grid front to back: rivals in slot order, then you. */
function gridOrder() {
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  return LiveTraffic.racers.map((r) => ({ driver: r.driver, short: r.short, car: r.car, crew: r.crew, color: r.color, accent: r.accent }))
    .concat([{ isPlayer: true, driver: me.driver, short: 'YOU', car: me.car, crew: me.franchise, color: SaveStore.data.underglow || me.glow, accent: me.body }]);
}

function beginRaceStart(lvl, { ceremony }) {
  GameState.lapSplits = [];
  lapStartedAt = 0;
  lapNow = 1;
  launchPressAt = null;
  launchJudged = false;
  skipRequested = false;
  GameState.launchStall = 0;
  if (callouts) callouts.reset(GameState.racePosition);
  if (!ceremony || !RC) { GameState.racePhase = 'RACING'; startSeq = null; if (RC) RC.stage.hide(); onboarding.start(performance.now()); return; }
  const key = `${GameState.mode}:${lvl.index}:${GameState.daily ? 'd' : ''}`;
  const lineup = !lineupSeen.has(key);
  lineupSeen.add(key);
  GameState.racePhase = 'START';
  GameState.speed = 0;
  startSeq = RC.createStartSequence({ racers: FIELD_SIZE, lineup });
  RC.stage.show();
  if (!lineup) RC.stage.grid(gridOrder());
}

function applyLaunch(result) {
  launchJudged = true;
  const fx = result && RC.LAUNCH_EFFECT[result];
  if (!fx) return;
  GameState.speed += fx.mph;
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + fx.flux);
  GameState.launchStall = fx.stall;
  GameState.launchResult = result;
  triggerAnnouncement(fx.text, result === 'early' ? 'WAIT FOR GREEN NEXT TIME' : `+${fx.mph} MPH OFF THE LINE`, 1400, 2);
  if (result === 'perfect') { SoundEngine.playTone(660, 'sawtooth', 0.25, 0.14, 1320); burstSparks(18, 190, 1); }
}

const startHooks = {
  field: () => gridOrder(),
  announceLevel() {
    const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
    triggerAnnouncement(GameState.daily ? `📅 DAILY: ${GameState.daily.modifier.name}` : `🏁 ${lvl.name} 🏁`, 'TAP ⚡ RIGHT ON GREEN FOR A ROCKET START', 2400, 1);
  },
  go() {
    GameState.racePhase = 'RACING';
    GameState.speed = 26;
    if (launchPressAt != null) applyLaunch(RC.judgeLaunch(launchPressAt));
    onboarding.start(performance.now());
  },
};
const handleStartEvents = (events) => RC.playStartEvents(events, startHooks);

function updateRaceStart(rawDt) {
  if (startSeq.inLineup && (skipRequested || InputState.boostPressed)) {
    InputState.boostPressed = false;
    skipRequested = false;
    if (startSeq.skip()) { RC.stage.grid(gridOrder()); SoundEngine.playTone(520, 'triangle', 0.08, 0.08); }
  }
  skipRequested = false;
  if (InputState.boostPressed) { // a tap on ⚡ during the lights: judged at GO
    InputState.boostPressed = false;
    if (launchPressAt == null && !startSeq.inLineup) launchPressAt = startSeq.t + rawDt;
  }
  GameState.speed = 0;
  handleStartEvents(startSeq.update(rawDt));
}

/** After GO: the late rocket-start window, the GO! hold, live callouts, the finish roll-out. */
function updateRaceCeremony(rawDt) {
  if (startSeq && !startSeq.done) {
    if (!launchJudged && InputState.boostPressed && startSeq.t <= RC.LAUNCH.goodEnd) {
      InputState.boostPressed = false;
      applyLaunch(RC.judgeLaunch(startSeq.t));
    }
    handleStartEvents(startSeq.update(rawDt));
  }
  if (GameState.launchStall > 0) {
    GameState.launchStall -= rawDt;
    GameState.speed = Math.min(GameState.speed, 6);
  }
  if (GameState.racePhase === 'RACING') {
    const lap = GameState.raceLength ? lapOf(GameState.distance, GameState.raceLength).lap : 1;
    if (lap > lapNow) { GameState.lapSplits.push(GameState.raceTime - lapStartedAt); lapStartedAt = GameState.raceTime; lapNow = lap; if (touch) touch.controls.haptics.pulse('lap'); }
    const c = callouts ? callouts.update(rawDt, GameState.racePosition, lap) : null;
    if (c) {
      triggerAnnouncement(c.main, c.sub, 1500, c.kind === 'final' ? 3 : 2);
      if (c.kind === 'final') { RC.say('Final lap!'); SoundEngine.playTone(784, 'square', 0.3, 0.14, 1046); }
      else if (c.kind === 'up') SoundEngine.playTone(660, 'triangle', 0.14, 0.12, 880);
    }
  } else if (GameState.racePhase === 'FINISHED') {
    GameState.invulnTimer = 1;
    finishSeqLeft -= rawDt;
    if (finishSeqLeft <= 0) { if (RC) RC.stage.hide(); endRaceRun('🏁 FINISH!'); }
  }
}

/** Tap/click/Enter during the lineup skips to the lights. */
function bindRaceStageSkip() {
  const req = () => { if (GameState.racePhase === 'START' && startSeq && startSeq.inLineup) skipRequested = true; };
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
  const idx = c.levelIndex != null ? c.levelIndex : dailySpec(c.daily, WORLD_LEVELS.length).levelIndex;
  GameState.levelIndex = Math.max(0, Math.min(WORLD_LEVELS.length - 1, idx));
  GameState.mode = 'ARCADE';
  startNewRace();
}

/** You crossed the line (ticket 0051): a bonus for where you finished, then the results. */
function finishRace() {
  if (GameState.mode === 'LIVE') { live.finished(); return; } // the room ranks live races
  let ahead = 0;
  for (const r of LiveTraffic.racers) if (r.finishTime != null && r.finishTime < GameState.finishTime) ahead++;
  GameState.racePosition = ahead + 1;
  GameState.score += finishBonus(GameState.racePosition);
  finishScore = GameState.score;
  GameState.lapSplits.push(GameState.finishTime - lapStartedAt);
  // Chequered flag (ticket 0052): your place, a fanfare, and a short roll-out while the rest
  // of the field crosses, then the results.
  GameState.racePhase = 'FINISHED';
  finishSeqLeft = GameState.reducedMotion ? 1.4 : 2.8;
  const place = GameState.racePosition;
  if (!RC) { finishSeqLeft = 0; return; }
  RC.stage.finish(ordinal(place), place === 1 ? 'YOU WIN!' : place <= 3 ? 'PODIUM!' : 'FINISHED');
  RC.fanfare(place);
  RC.say(place === 1 ? 'You win!' : `You finished ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][place - 1] || ordinal(place)}!`);
}

/** Finish order for the whole field, a headline for how it went, Retry / Next (ticket 0052). */
function renderRaceResults(badgeText, lvl) {
  if (!RC) return; // the ceremony chunk never loaded: plain results
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  RC.renderResults({
    badgeText, lvl, next: WORLD_LEVELS[lvl.index + 1], racers: LiveTraffic.racers, speedToWorld: LiveTraffic.speedToWorld(),
    playerZ: GameState.trackPos + ROAD_CFG.playerZOffset, me, color: SaveStore.data.underglow || me.glow,
    unlockedLevel: SaveStore.data.unlockedLevel || 1, fieldSize: FIELD_SIZE,
  });
  // Share card + a friend's challenge verdict (ticket 0053), from the lazy share chunk.
  loadShareUi().then((m) => m.onResults(lvl.index)).catch(() => {});
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
    // A ghost only makes sense for a finished three-lap race on a campaign track.
    currentRun.trace = currentRun.mode === 'ARCADE' && GameState.finishTime != null ? ghostRecorder.encode() : undefined;
  }
  // The ghost verdict sits on the results card (the finish ceremony owns the announcer).
  const verdict = ghostRace.verdict(GameState.finishTime);
  const ghostEl = document.getElementById('endGhostText');
  if (ghostEl) {
    const by = verdict && verdict.by != null ? ` BY ${verdict.by.toFixed(1)}s` : '';
    ghostEl.textContent = !verdict ? '' : verdict.beat
      ? `👻 YOU BEAT ${ghostRace.initials}'S GHOST${by}!`
      : `👻 ${ghostRace.initials}'S GHOST WON${by} — RACE IT AGAIN`;
    ghostEl.classList.toggle('hidden', !verdict);
  }

  renderRaceResults(customBadgeText, lvl);
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
      startNewRace(titleStart);
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
    const racing = GameState.status === 'PLAYING';
    if (e.code === 'KeyN' && !racing) selectCharacterByIndex(nextOwnedCarIndex(GameState.selectedCharIdx));
    if (['ShiftLeft', 'ShiftRight'].includes(e.code) || (e.code === 'KeyN' && racing)) InputState.nosHeld = true;
    if (['ArrowDown', 'KeyS'].includes(e.code)) { if (GameState.playerY > 12) performHumanTrick('DOWN'); InputState.down = true; }
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
  document.getElementById('btnCloseLeaderboard').addEventListener('click', closeLeaderboard);
  document.getElementById('btnPlayDaily').addEventListener('click', () => startNewRace({ daily: true }));
  document.querySelectorAll('.board-tab').forEach((b) => b.addEventListener('click', () => {
    boardView = { board: b.dataset.board, mode: b.dataset.mode, track: Boolean(b.dataset.track) };
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
    if (!e.target.closest('button, nav, a')) startNewRace(titleStart);
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
  document.getElementById('btnOpenLive').addEventListener('click', () => loadLive().then((l) => l.openMenu()));
  document.getElementById('btnPlayAgain').addEventListener('click', () => startNewRace(GameState.daily ? { daily: true } : undefined));
  document.getElementById('btnNextRace').addEventListener('click', (e) => {
    const idx = Number(e.currentTarget.dataset.level);
    if (!Number.isInteger(idx) || !WORLD_LEVELS[idx]) return;
    GameState.levelIndex = idx;
    SaveStore.data.selectedLevel = idx;
    SaveStore.save();
    updateTitleChip();
    startNewRace();
  });

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
let view3d = null;
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
  const feel = nosFeel(speedFeel(GameState.status === 'PLAYING' ? GameState.speed : 0, GameState.reducedMotion));
  view3d.render(dt, feel);
  renderOverlayFx(feel);
}

// --- TOUCH CONTROLS (ticket 0061) ---
// Thumbstick / D-pad / tilt, an action arc and shortcuts (src/touch/). Touch devices (or any
// device's first touch) load the kit as its own chunk; desktops never download it.
let touch = null;
let touchLoading = null;
const canTouch = () => (navigator.maxTouchPoints || 0) > 0
  || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches);

/** `show` = put the controls on screen (a touch device); the settings buttons only need the code. */
function loadTouch(show = true) {
  touchLoading = touchLoading || import('./touch/bridge.js').then(({ connectTouch }) => {
    touch = connectTouch({
      performHumanTrick, activateMidnightSpecial, cycleCameraMode, openSettings, recenterTilt, toggleTilt,
      announce: triggerAnnouncement, traffic: () => LiveTraffic, onboarding: () => onboarding, is3D: () => !!view3d,
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
    // Live race countdown (GRID): on the line, road still. A pause freezes it too; otherwise
    // attract mode rolls the road.
    if (GameState.status !== 'PAUSED' && GameState.status !== 'GRID') {
      GameState.trackPos += 1350 * dt;
      const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
      if (track.segments.length - currentSegIdx < ROAD_CFG.drawDistance + 60) {
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

// Offline + instant repeat loads (ticket 0075). Production builds only; the API, identity and
// live rooms are never cached (see scripts/sw-template.js).
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
}

window.onload = () => {
  registerServiceWorker();
  preloadBackdrops(ERAS[GameState.eraIndex].id);
  // Test/debug hook: ?debug exposes state for e2e checks (never used by the game itself).
  if (new URLSearchParams(location.search).has('debug')) window.__OT = {
    GameState, InputState, announce: triggerAnnouncement, startRace: startNewRace, ready: () => ceremonyReady, get live() { return live; }, loadLive,
    pause: () => { GameState.status = 'PAUSED'; },
    finishRun: () => endRaceRun('🏁 FINISH!'),
    traffic: () => LiveTraffic,
    backdrop: backdropDebug,
    gfx: () => gfx,
    view: () => ({ mode: activeView, loading: view3dLoading, stats: view3d ? view3d.stats : null }),
    setView: (m) => setRenderMode(m, { persist: false }),
    input: InputState,
    controls: () => SaveStore.data.controls,
    touch: () => touch && touch.controls,
  };
  initSettings({ announce: triggerAnnouncement });
  setTimeout(loadGfx, 0);
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
  document.getElementById('titleBestScore').textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins}`;
  const playHint = document.getElementById('playHint');
  if (playHint) playHint.textContent = coarsePointer ? 'TAP ANYWHERE' : 'PRESS ENTER';
  updateTitleChip();
  syncAudioUI();
  updateEraHud();
  updateContractHud();
  updateLiveHud();
  // A ?room=CODE invite drops you straight into that room's lobby (no title, no menus).
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) loadLive().then((l) => l.join(roomParam));
  // Deep links (?play= ?board= ?level= ?garage, ticket 0110): lazy, only when present.
  else if (/[?&](play|board|level|garage)(=|&|$)/.test(location.search)) import('./deeplink.js').then((m) => m.applyDeepLink({
    levels: WORLD_LEVELS, unlocked: () => SaveStore.data.unlockedLevel || 1, live: loadLive, board: openLeaderboard,
    garage: openGarageModal, titleStart: (o) => { titleStart = o; },
    pickLevel: (i) => { GameState.levelIndex = i; SaveStore.data.selectedLevel = i; SaveStore.save(); updateTitleChip(); },
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
}
