import './fonts.js';
import './styles.css';
import { WORLD_LEVELS, ERAS, UNDERGLOW_OPTIONS, LIVERY_OPTIONS, POP_CULTURE_ROSTER, MULTIVERSE_POOL, UPGRADE_DEFS, CONTRACT_TEMPLATES, JARVIS_MODES, ROAD_CFG, PACE_MODES, CAMERA_MODES, RIVAL_NAMES } from './data.js';
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { SoundEngine, setAudioHooks } from './audio.js';
import { InputState, pollGamepad } from './input.js';
import { RigidBody3D } from './physics.js';
import { projectPoint } from './projection.js';
import { FLUX, passiveFluxRate, warpReady, boostOutcome } from './flux.js';
import { speedFeel, createParticlePool, createHitStop, nearMissChain, watchReducedMotion } from './fx.js';

setAudioHooks({ syncAudioUI, triggerAnnouncement });

SaveStore.load();

// Game feel (pillar 2): one spark pool, one hit-stop clock, one near-miss chain for the run.
const sparks = createParticlePool(160);
const hitStop = createHitStop();
const nearMisses = nearMissChain();
let fxClock = 0;
watchReducedMotion((reduce) => { GameState.reducedMotion = reduce; });

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

// --- MULTI-DEVICE INPUT SYSTEM ---

let segments = [];
let generatedCount = 0;

function addSegment(curve, y, bank, trackType, forkInfo = null) {
  const idx = segments.length;
  segments.push({
    index: idx,
    p1: { world: { x: 0, y: idx === 0 ? 0 : segments[idx - 1].p2.world.y, z: idx * ROAD_CFG.segLength }, camera: {}, screen: {} },
    p2: { world: { x: 0, y: y, z: (idx + 1) * ROAD_CFG.segLength }, camera: {}, screen: {} },
    curve: curve,
    bank: bank,
    trackType: trackType,
    forkInfo: forkInfo,
    items: [],
    cars: [],
    flameLeft: false,
    flameRight: false
  });
}

function addRoadSection(enter, hold, leave, curve, yDelta, bank, trackType = 'STANDARD', forkInfo = null) {
  const startY = segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
  const endY = startY + yDelta;
  const total = enter + hold + leave;
  for (let n = 0; n < enter; n++) {
    const t = n / enter;
    const ease = t * t * (3 - 2 * t);
    addSegment(curve * ease, startY + (endY - startY) * (n / total), bank * ease, trackType, forkInfo);
  }
  for (let n = 0; n < hold; n++) {
    addSegment(curve, startY + (endY - startY) * ((enter + n) / total), bank, trackType, forkInfo);
  }
  for (let n = 0; n < leave; n++) {
    const t = 1 - n / leave;
    const ease = t * t * (3 - 2 * t);
    addSegment(curve * ease, startY + (endY - startY) * ((enter + hold + n) / total), bank * ease, trackType, forkInfo);
  }
}

function populateChunkDecorations(startIdx, endIdx, patternType) {
  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
  for (let i = startIdx; i < endIdx; i++) {
    const seg = segments[i];
    if (!seg) continue;

    // Night-Street Smoke Flares on Checkpoints & Forks
    if (seg.trackType === 'CHECKPOINT' && i === startIdx + 2) {
      seg.items.push({ offset: -1.15, type: 'MC_FLARE_GREEN' });
      seg.items.push({ offset: 1.15, type: 'MC_FLARE_GREEN' });
    }

    // Roadside Streetlamps, Billboards & Orange-Track Arches
    if (i % 6 === 0) {
      const propTypes = ['STREET_LAMP', 'SIGN_88', 'PALM_TREE', 'CLOCK_TOWER_BILLBOARD', 'ARCH_HW'];
      const pType = propTypes[(i / 6) % propTypes.length | 0];
      seg.items.push({ offset: -1.42, type: pType });
      seg.items.push({ offset: 1.42, type: pType });
    }

    // Overhead Loop & Tunnel Rings
    if ((seg.trackType === 'LOOP' || seg.trackType === 'BOOSTER') && i % 3 === 0) {
      seg.items.push({ offset: 0, type: 'OVERHEAD_GATE' });
    }

    // Animated 3D Power-Ups (Plutonium Cores, Orange-Track Flame Coins) & Destructible 2026 Obstacles
    if (i % 18 === 0 && seg.trackType !== 'CHECKPOINT') {
      const lane = ((i * 19) % 3) - 1;
      const isPlutonium = (i % 12 === 0) || (patternType === 'STUNT_LOOP');
      seg.items.push({
        offset: lane * 0.52,
        type: isPlutonium ? 'PLUTONIUM' : 'HW_COIN',
        collected: false,
        phase: i * 0.8
      });
    }

    // Spawn Nano-Wrench HP Repair Pickups every 22 segments
    if (i > 30 && i % 38 === 0 && seg.trackType !== 'CHECKPOINT') {
      const healLane = (((i * 7) % 3) - 1) * 0.52;
      seg.items.push({
        offset: healLane,
        type: 'REPAIR_WRENCH',
        collected: false,
        phase: i * 0.4
      });
    }

    const spawnFreq = 999999;
    if (false) {
      const lane = (((i * 29) % 5) - 2) * 0.36;
      const isCop = (GameState.heatLevel >= 2 && (i % (spawnFreq * 3) === 0));
      const isRival = !isCop && (i % (spawnFreq * 2) === 0);
      const rivalName = RIVAL_NAMES[(i / spawnFreq) % RIVAL_NAMES.length | 0];
      seg.cars.push({
        offset: lane,
        type: isCop ? 'POLICE_INTERCEPTOR' : (isRival ? 'STREET_RIVAL' : 'TRAFFIC'),
        name: isCop ? 'TIME-COP' : (isRival ? rivalName : 'TRAFFIC'),
        speedMult: isCop ? 0.55 : (isRival ? 0.52 : 0.34),
        nearMissed: false,
        takenDown: false,
        aiPhase: i * 0.7
      });
    }

    if (false) {
      const gapSide = (i % 2 === 0) ? -0.58 : 0.58;
      seg.cars.push({
        offset: -gapSide * 0.65,
        type: 'POLICE_INTERCEPTOR',
        name: 'ROADBLOCK',
        speedMult: 0,
        nearMissed: false,
        takenDown: false,
        aiPhase: 0
      });
    }
  }
}

function generateNextTrackBiome(chosenBranch = null) {
  const startIdx = segments.length;
  generatedCount++;

  if (generatedCount === 1) {
    addRoadSection(8, 18, 8, 0, 0, 0, 'STANDARD');
    addRoadSection(6, 14, 6, 0, 350, 0, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.75, -350, 0.15, 'STANDARD');
    populateChunkDecorations(startIdx, segments.length, 'OPENING');
    return;
  }

  if (generatedCount % 4 === 2 && !chosenBranch) {
    addRoadSection(8, 20, 8, 0, 280, 0, 'SPLIT_FORK', {
      leftLabel: 'SKY-LOOP SHORTCUT (2X FLUX)',
      rightLabel: 'WANGAN TURBO TUNNEL (+TIME)'
    });
    populateChunkDecorations(startIdx, segments.length, 'FORK');
    return;
  }

  const roll = chosenBranch === 'LEFT' ? 0 : (chosenBranch === 'RIGHT' ? 1 : ((generatedCount + GameState.levelIndex) % 5));

  if (roll === 0) {
    addRoadSection(8, 14, 8, 0, 0, 0, 'BOOSTER');
    addRoadSection(12, 24, 12, 0.45, 650, 0.18, 'LOOP');
    addRoadSection(12, 20, 12, -0.45, -650, -0.18, 'LOOP');
    populateChunkDecorations(startIdx, segments.length, 'STUNT_LOOP');
  } else if (roll === 1) {
    addRoadSection(10, 20, 10, -0.95, 280, -0.22, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.95, -280, 0.22, 'BOOSTER');
    populateChunkDecorations(startIdx, segments.length, 'SPEED_TUNNEL');
  } else if (roll === 2) {
    addRoadSection(10, 16, 8, 0, 520, 0, 'JUMP_RAMP');
    addRoadSection(8, 18, 10, -0.7, -520, -0.15, 'STANDARD');
    populateChunkDecorations(startIdx, segments.length, 'JUMP');
  } else if (roll === 3) {
    // Smooth Sweeping Mulholland S-Curves
    addRoadSection(12, 22, 12, 1.15, 380, 0.25, 'STANDARD');
    addRoadSection(12, 20, 12, -1.1, -380, -0.25, 'STANDARD');
    populateChunkDecorations(startIdx, segments.length, 'CORKSCREW');
  } else {
    addRoadSection(10, 18, 10, 0.65, 320, 0.12, 'STANDARD');
    addRoadSection(8, 14, 8, 0, -320, 0, 'CHECKPOINT');
    populateChunkDecorations(startIdx, segments.length, 'CHECKPOINT');
  }

  if (generatedCount % 3 === 0) {
    const cpStart = segments.length;
    addRoadSection(4, 8, 4, 0, 0, 0, 'CHECKPOINT');
    populateChunkDecorations(cpStart, segments.length, 'CHECKPOINT');
  }
}

// --- 10X 6-DOF MULTI-BODY AUTOMOTIVE & RIGID-BODY PHYSICS ENGINE (240Hz SUB-STEPPED) ---

const LiveTraffic = {
  racers: [],
  traffic: [],
  obstacles: [],
  prevPlayerZ: 0,
  init() {
    this.prevPlayerZ = (GameState.trackPos || 0) + ROAD_CFG.playerZOffset;

    // ONLY 2 Well-Spaced Hero Rivals (Plenty of open road to race & duel!)
    const initialRivals = [
      POP_CULTURE_ROSTER[1], // Dez's '70 Brawler 440
      POP_CULTURE_ROSTER[2]  // Kai's '99 Kestrel GT-4R
    ];
    this.racers = initialRivals.map((rc, idx) => new RigidBody3D({
      id: rc.id,
      kind: 'RIVAL',
      name: `${rc.driver.split(' ')[0].toUpperCase()} • ${rc.car}`,
      style: rc.shape === 'MUSCLE' ? 'MUSCLE' : 'TUNER_WING',
      massKg: rc.massKg || 1500,
      restitution: 0.48,
      halfW: 0.14,
      height: 36,
      halfL: 115,
      worldZ: 3400 + idx * 3800,
      offset: idx === 0 ? -0.38 : 0.38,
      mph: 60 + idx * 4,
      baseMph: 70 + idx * 4,
      bodyColor: rc.body,
      accentColor: rc.cabin,
      underglow: rc.glow
    }));

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
    const playerMass = activeChar.massKg || 1300;
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
          const pool = POP_CULTURE_ROSTER.concat(MULTIVERSE_POOL);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          r.name = `${pick.driver.split(' ')[0].toUpperCase()} • ${pick.car}`;
          r.bodyColor = pick.body;
          r.accentColor = pick.cabin;
          r.underglow = pick.glow;
          r.takenDown = false;
          r.y = 0; r.vy = 0; r.vx = 0; r.rot = 0; r.vRot = 0; r.yaw = 0; r.vYaw = 0;
          r.worldZ = playerZ + 5200 + i * 3200;
          r.prevZ = r.worldZ;
          r.mph = Math.max(55, GameState.speed * 0.92);
        }
        continue;
      }

      const relZ = r.worldZ - playerZ;
      let targetMph = Math.max(50, GameState.speed * (0.92 + i * 0.03));
      if (relZ < -600) { targetMph = GameState.speed + 18; r.nosActive = true; }
      else if (relZ > 4800) { targetMph = Math.max(42, GameState.speed - 16); r.nosActive = false; }
      else { r.nosActive = (Math.sin(Date.now() * 0.0025 + i * 2) > 0.65); }

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

    // 2. Run 4x Sub-Stepped 240Hz Rigid-Body Physics Integration & All-Pairs Solver!
    const SUB_STEPS = 4;
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
    let aheadCount = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.takenDown) continue;
      if (r.worldZ > playerZ) aheadCount++;

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
    GameState.racePosition = 1 + aheadCount;
    GameState.totalRacers = 1 + this.racers.length;

    // 4. Player ↔ Civilian Traffic Swept 3D Rigid-Body Solver
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i];
      const relZ = tr.worldZ - playerZ;
      if (relZ < -800 || tr.takenDown) {
        const lanes = [-0.48, 0.48, -0.20, 0.20];
        tr.takenDown = false;
        tr.y = 0; tr.vy = 0; tr.vx = 0; tr.rot = 0; tr.vRot = 0; tr.yaw = 0; tr.vYaw = 0;
        const maxT = Math.max(playerZ + 12000, ...this.traffic.map(t => t.worldZ));
        tr.worldZ = maxT + 4800 + Math.random() * 2200;
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
  segments = [];
  generatedCount = 0;
  for (let i = 0; i < 6; i++) {
    generateNextTrackBiome();
  }
  LiveTraffic.init();
}

// --- ANNOUNCER & CONTRACT PROGRESSION ---
let announcerTimeout = null;
function triggerAnnouncement(mainText, subText = '', duration = 950) {
  const mainEl = document.getElementById('announcerMain');
  const subEl = document.getElementById('announcerSub');
  if (!mainEl || !subEl) return;
  mainEl.textContent = mainText;
  subEl.textContent = subText;
  mainEl.style.opacity = '1';
  mainEl.style.transform = 'scale(1.06)';
  subEl.style.opacity = subText ? '1' : '0';

  if (announcerTimeout) clearTimeout(announcerTimeout);
  announcerTimeout = setTimeout(() => {
    mainEl.style.opacity = '0';
    mainEl.style.transform = 'scale(0.9)';
    subEl.style.opacity = '0';
  }, duration);
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
function applyPlayerDamage(rawDmg, reasonText) {
  if (GameState.invulnTimer > 0 || GameState.agroTimer > 0 || GameState.warpActiveTimer > 0) return;
  const charObj = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  if (charObj.id === 'IRON_SAINT_BRAWLER' && reasonText.includes('BARRIER')) {
    // Dez's 1,780kg Brawler smashes barriers with 0 damage!
    return;
  }
  const massReduction = Math.max(0.65, 1350 / (charObj.massKg || 1350));
  const finalDmg = Math.max(6, Math.round(rawDmg * massReduction));
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
  if (GameState.racePosition > 1 && car.type === 'STREET_RIVAL') {
    GameState.racePosition = Math.max(1, GameState.racePosition - 1);
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
      const seg = segments[currentSegIdx + n];
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
  GameState.warpActiveTimer = 3.5 + (SaveStore.data.upgrades.flux - 1) * 0.5;
  GameState.fluxCharge = 0;
  GameState.eraIndex = (GameState.eraIndex + 1) % ERAS.length;
  const newEra = ERAS[GameState.eraIndex];

  const warpBonus = 3000 * GameState.combo;
  GameState.score += warpBonus;
  GameState.runCoins += 30;
  SaveStore.data.fluxCoins += 30;
  GameState.specialCharges = Math.min(5, GameState.specialCharges + 1);
  if (GameState.mode === 'ARCADE') {
    GameState.timeLeft = Math.min(60, GameState.timeLeft + 12.0);
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
    `ERA SHIFT: ${newEra.name}! +${warpBonus} PTS & +12s`,
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
  if (segments.length - currentSegIdx < ROAD_CFG.drawDistance + 85) {
    generateNextTrackBiome();
  }

  const currentSeg = segments[currentSegIdx] || segments[0];
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
  const baseMaxMph = 92 + (upg.engine - 1) * 6 + (activeChar.speedBonus || 0) + waveSpeedBonus;
  const warpMaxMph = 128 + (upg.engine - 1) * 7 + (activeChar.speedBonus || 0) + waveSpeedBonus;
  const isOnBooster = currentSeg && currentSeg.trackType === 'BOOSTER';
  const targetMaxSpeed = (GameState.warpActiveTimer > 0 || GameState.agroTimer > 0 || isOnBooster) ? warpMaxMph : baseMaxMph;

  const gp = pollGamepad();
  const accelerating = GameState.autoGas || InputState.up || gp.gas;
  const braking = InputState.down || gp.brake;

  const paceCfg = PACE_MODES[GameState.paceMode] || PACE_MODES[0];
  if (braking) {
    GameState.speed = Math.max(18, GameState.speed - 45 * rawDt);
  } else if (accelerating) {
    const accelRate = (14 + (upg.engine - 1) * 2.5) * paceCfg.accelMult * (GameState.warpActiveTimer > 0 ? 1.5 : 1.0);
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
  GameState.distance += GameState.speed * dt;
  GameState.score += Math.floor(GameState.speed * dt * 2.2 * GameState.combo);

  // 2. Pro Counter-Steer Drift Physics & Multi-Device Steering
  let steerInput = 0;
  if (InputState.left) steerInput -= 1;
  if (InputState.right) steerInput += 1;
  if (Math.abs(InputState.wheelSteerVal) > 0.02) steerInput += InputState.wheelSteerVal;
  if (InputState.tiltEnabled && Math.abs(InputState.tiltSteerVal) > 0.03) {
    steerInput += InputState.tiltSteerVal * SaveStore.data.tiltSensitivity;
  }
  if (Math.abs(gp.steer) > 0.05) steerInput += gp.steer;

  // Scan upcoming road curvature & threats for LUMEN AR HUD and Co-Pilot
  let curveAhead = 0;
  let nearestThreat = null;
  let bestCollectible = null;
  for (let look = 1; look <= 26; look++) {
    const lSeg = segments[currentSegIdx + look];
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

  const gripFactor = (1.15 + (upg.tires - 1) * 0.12) * (GameState.zoneTimer > 0 ? 1.25 : 1.0);
  const speedRatio = Math.min(1.0, GameState.speed / 88);

  // Initiate or maintain Power Drift when holding Brake/Drift + steering or hard cornering
  const wantsDrift = (braking || Math.abs(currentSeg ? currentSeg.curve : 0) > 1.8) && Math.abs(steerInput) > 0.35 && GameState.speed > 45 && GameState.playerY < 10;
  const driftBox = document.getElementById('driftCounterBox');

  if (wantsDrift) {
    GameState.isDrifting = true;
    GameState.driftChargeTime += rawDt * (1 + (upg.tires - 1) * 0.18);
    const targetYaw = steerInput * 32;
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
    const centrifugal = (currentSeg.curve * 0.14 * speedRatio) / (1 + (upg.tires - 1) * 0.15);
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
    if (GameState.playerVX < 0) {
      GameState.playerVX = -GameState.playerVX * 0.42; // Elastic guardrail rebound impulse
      GameState.speed = Math.max(25, GameState.speed - 12 * rawDt);
      GameState.particles.push({ x: -38, y: -5, vx: 90, vy: -60, color: '#ffea00', life: 0.25 });
    }
  } else if (GameState.playerX > MAX_TRACK_X) {
    GameState.playerX = MAX_TRACK_X;
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
        GameState.timeLeft = Math.min(60, GameState.timeLeft + 7.0);
        triggerAnnouncement('WANGAN TURBO SHORTCUT!', '+7.0s BONUS TIME!', 1400);
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
  GameState.fluxCharge = Math.min(100, GameState.fluxCharge + passiveFluxRate(GameState.speed, upg.flux) * rawDt);
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
    const seg = segments[currentSegIdx + offset];
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
      if (GameState.mode === 'ARCADE') {
        GameState.timeLeft = Math.min(60, GameState.timeLeft + 12.0);
      }
      if (GameState.racePosition > 1) {
        GameState.racePosition = Math.max(1, GameState.racePosition - 1);
      }
      GameState.score += 1200 * GameState.combo;
      triggerAnnouncement(
        `🏁 CHECKPOINT! POS: ${GameState.racePosition}/${GameState.totalRacers}`,
        GameState.mode === 'ARCADE' ? '+12.0s TIME EXTENDED!' : '+1200 STREET REP!',
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

  if (GameState.mode === 'ARCADE') {
    GameState.timeLeft -= rawDt;
    if (GameState.timeLeft <= 0) {
      GameState.timeLeft = 0;
      endRaceRun();
    }
  }

  updateLiveHud();
}

function updateInteractiveCoach(currentSegIdx) {
  const banner = document.getElementById('interactiveCoachBanner');
  if (!banner) return;
  if (GameState.coachDismissed) {
    banner.style.opacity = '0';
    banner.style.pointerEvents = 'none';
    return;
  }

  // Scan upcoming physical RigidBody3D obstacles within 2,800 Z-units to coach the player!
  let foundObs = null;
  let bestDz = 999999;
  for (let i = 0; i < LiveTraffic.obstacles.length; i++) {
    const ob = LiveTraffic.obstacles[i];
    const dz = ob.worldZ - (GameState.trackPos + ROAD_CFG.playerZOffset);
    if (ob.hitCount === 0 && dz > 150 && dz < 2800 && dz < bestDz) {
      bestDz = dz;
      foundObs = { item: ob, dist: Math.round(dz / 200) };
    }
  }

  const iconEl = document.getElementById('coachIcon');
  const titleEl = document.getElementById('coachTitle');
  const descEl = document.getElementById('coachDesc');
  if (!iconEl || !titleEl || !descEl) return;

  banner.style.opacity = '1';
  if (foundObs) {
    const t = foundObs.item.type;
    const openDir = foundObs.item.offset >= 0 ? 'LEFT (◀ / A)' : 'RIGHT (▶ / D)';
    if (t === 'PINE_TREE_HAZARD') {
      iconEl.textContent = '🌲';
      titleEl.textContent = 'TWIN-PINES SLALOM TREE • HUMAN SKILL EDGE:';
      descEl.textContent = `Graze the golden ring around the tree for a +11 MPH Slingshot & +2x Streak, or double-tap ${openDir} to Phase-Juke!`;
    } else if (t === 'LOW_LASER_BAR') {
      iconEl.textContent = '🟠';
      titleEl.textContent = 'LOW LASER AHEAD • CHOOSE 1 OF 2 SOLUTIONS:';
      descEl.textContent = `Solution 1: Press JUMP / HOVER (W, ▲, H, or Swipe Up) to hop over • Solution 2: Steer ${openDir}!`;
    } else if (t === 'HIGH_LIGHT_GATE') {
      iconEl.textContent = '🔵';
      titleEl.textContent = 'HIGH LIGHT GATE AHEAD • CHOOSE 1 OF 2 SOLUTIONS:';
      descEl.textContent = `Solution 1: Hold DRIFT / SLIDE (S, ▼, or Swipe Down) to duck under • Solution 2: Steer ${openDir}!`;
    } else if (t === 'FLUX_CRATE') {
      iconEl.textContent = '📦';
      titleEl.textContent = 'BLUE FLUX CRATE AHEAD • 2 SOLUTIONS:';
      descEl.textContent = `Solution 1: Smash straight through it for +18% Flux & +8 HP • Solution 2: Steer ${openDir}!`;
    } else if (t === 'REPAIR_WRENCH') {
      iconEl.textContent = '🔧';
      titleEl.textContent = 'NANO-WRENCH REPAIR AHEAD!';
      descEl.textContent = `Steer toward the green wrench in lane ${foundObs.item.offset < 0 ? 'LEFT' : (foundObs.item.offset > 0 ? 'RIGHT' : 'CENTER')} to heal +25 HP!`;
    } else {
      iconEl.textContent = '⚡';
      titleEl.textContent = 'BARRIER AHEAD • CHOOSE 1 OF 2 SOLUTIONS:';
      descEl.textContent = `Solution 1: Steer ${openDir} into the open lane • Solution 2: Jump (W/H) or Boost-Smash (Space)!`;
    }
  } else if (GameState.fluxCharge >= 95) {
    iconEl.textContent = '⚡';
    titleEl.textContent = '1.88 GW FLUX FULL • READY FOR 88 MPH TIME WARP!';
    descEl.textContent = 'Press SPACEBAR or tap ⚡ 88 MPH WARP to blast into the next Era with full invincibility!';
  } else {
    iconEl.textContent = '🎓';
    titleEl.textContent = `WAVE ${GameState.waveTier} • DRIVING TIP`;
    descEl.textContent = 'Draft in the green wake behind rivals for a Slipstream Slingshot, or press N to switch cars!';
  }
}

function updateLiveHud() {
  const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
  updateInteractiveCoach(currentSegIdx);

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
    timerEl.textContent = GameState.mode === 'INFINITE' ? '♾️ FREE' : `${GameState.timeLeft.toFixed(1)}s`;
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
    const seg = segments[baseIndex + n];
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
    const seg = segments[baseIndex + n];
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
  const baseSeg = segments[baseIndex] || segments[0];
  if (!baseSeg) {
    ctx.restore();
    return;
  }

  renderRadarMinimap(baseIndex);

  const playerElevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  let playerCurveX = 0;
  let playerCurveDX = -(baseSeg.curve * basePercent);
  for (let cStep = 0; cStep < 6; cStep++) {
    const cSeg = segments[baseIndex + cStep];
    if (!cSeg) break;
    playerCurveX += playerCurveDX;
    playerCurveDX += cSeg.curve;
  }
  const cameraX = (GameState.playerX * ROAD_CFG.roadWidth) + playerCurveX;
  const cameraY = playerElevation + camCfg.height + GameState.playerY * 3.5;
  const cameraZ = GameState.trackPos;
  const dynamicDepth = Math.max(0.62, camCfg.depth - Math.max(0, (GameState.speed - 70) * 0.0022));

  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = rh;
  const visibleSegments = [];
  const playerTireScreenY = Math.floor(rh * 0.87);
  let foundPlayerSeg = null;

  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = segments[baseIndex + n];
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
    if (!foundPlayerSeg && y1 >= playerTireScreenY && y2 <= playerTireScreenY) {
      foundPlayerSeg = seg;
      const tSeg = (y1 - playerTireScreenY) / Math.max(1, y1 - y2);
      GameState.visualPlayerZ = seg.p1.world.z + tSeg * ROAD_CFG.segLength;
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
  const playerSeg = foundPlayerSeg || segments[baseIndex + 6] || visibleSegments[0] || baseSeg;
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
  const liveryObj = {
    body: activeChar.body || '#94a3b8',
    cabin: activeChar.cabin || '#cbd5e1'
  };

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
function selectCharacterByIndex(idx) {
  GameState.selectedCharIdx = idx % POP_CULTURE_ROSTER.length;
  const c = POP_CULTURE_ROSTER[GameState.selectedCharIdx];
  GameState.maxHp = c.maxHp || 100;
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
}

function summonMultiverseRacer() {
  const base = MULTIVERSE_POOL[Math.floor(Math.random() * MULTIVERSE_POOL.length)];
  const suffixes = ['2026 Turbo Spec', 'Outatime Edition', 'Cyber-Mod', 'Toy-Track Custom', 'Hyper-Shift'];
  const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
  const newEntry = {
    id: 'MULTI_' + Date.now(),
    driver: base.driver,
    car: `${base.car} (${suf})`,
    franchise: base.franchise,
    massKg: 1050 + Math.floor(Math.random() * 900),
    maxHp: 105 + Math.floor(Math.random() * 45),
    speedBonus: 5 + Math.floor(Math.random() * 6),
    gripBonus: 0.18 + Math.random() * 0.25,
    jumpBonus: 1.05 + Math.random() * 0.3,
    body: base.body,
    cabin: base.cabin,
    glow: base.glow,
    shape: base.shape,
    perk: 'Multiverse Custom • +Bonus Flux & Speed'
  };
  POP_CULTURE_ROSTER.unshift(newEntry);
  selectCharacterByIndex(0);
  SoundEngine.playCheckpoint();
  triggerAnnouncement(`🎬 SUMMONED: ${newEntry.car.toUpperCase()}!`, `DRIVER: ${newEntry.driver.toUpperCase()} (${newEntry.franchise.toUpperCase()})`, 1600);
}

function renderCharacterRosterGrid() {
  const grid = document.getElementById('characterRosterGrid');
  if (!grid) return;
  grid.innerHTML = '';

  POP_CULTURE_ROSTER.forEach((c, idx) => {
    const isSel = (idx === GameState.selectedCharIdx);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `text-left p-2 rounded-xl border transition flex flex-col justify-between ${
      isSel
        ? 'bg-cyan-500/20 border-2 border-cyan-400 text-white shadow'
        : 'bg-slate-900/90 border border-slate-800 text-slate-300 hover:border-slate-600'
    }`;
    btn.innerHTML = `
      <div class="font-arcade text-[9px] font-black text-white truncate">${c.car}</div>
      <div class="text-[9px] text-cyan-300 truncate">${c.driver}</div>
      <div class="flex items-center justify-between text-[8px] font-arcade text-slate-400 mt-1">
        <span class="text-emerald-300">💚${c.maxHp}HP</span>
        <span>${c.massKg}kg</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      selectCharacterByIndex(idx);
      SoundEngine.playCoinPickup();
    });
    grid.appendChild(btn);
  });
}

function renderLevelSelectGrid() {
  const grid = document.getElementById('levelSelectGrid');
  if (!grid) return;
  grid.innerHTML = '';

  WORLD_LEVELS.forEach((lvl) => {
    const isSelected = (GameState.levelIndex === lvl.index);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `text-left p-2.5 rounded-xl border transition flex flex-col justify-between ${
      isSelected
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
    `;
    card.addEventListener('click', () => {
      GameState.levelIndex = lvl.index;
      SaveStore.data.selectedLevel = lvl.index;
      SaveStore.save();
      renderCharacterRosterGrid();
  selectCharacterByIndex(0);
  renderLevelSelectGrid();
    });
    grid.appendChild(card);
  });
}

function renderGarageModal() {
  const listEl = document.getElementById('upgradesList');
  const coinsEl = document.getElementById('garageCoinsText');
  const glowRow = document.getElementById('underglowSelectRow');
  const livRow = document.getElementById('liverySelectRow');
  if (!listEl || !coinsEl) return;

  coinsEl.textContent = `⚡ ${SaveStore.data.fluxCoins}`;
  listEl.innerHTML = '';

  UPGRADE_DEFS.forEach((def) => {
    const lvl = SaveStore.data.upgrades[def.key] || 1;
    const isMax = lvl >= 5;
    const cost = def.baseCost * lvl;
    const canAfford = !isMax && SaveStore.data.fluxCoins >= cost;

    const card = document.createElement('div');
    card.className = 'p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between">
          <span class="font-arcade text-xs font-bold text-white">${def.icon} ${def.title}</span>
          <span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-arcade text-[10px] font-bold">LVL ${lvl}/5</span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">${def.desc}</p>
      </div>
      <button data-upgrade="${def.key}" class="w-full py-2 px-3 rounded-xl font-arcade text-xs font-bold transition ${
        isMax
          ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/40 cursor-default'
          : canAfford
            ? 'hw-badge text-slate-950 hover:brightness-110'
            : 'bg-slate-800 text-slate-400 border border-slate-700'
      }">
        ${isMax ? 'MAXED OUT ✓' : `UPGRADE • ⚡ ${cost}`}
      </button>
    `;
    const btn = card.querySelector('button');
    if (btn && !isMax) {
      btn.addEventListener('click', () => {
        if (SaveStore.data.fluxCoins >= cost && SaveStore.data.upgrades[def.key] < 5) {
          SaveStore.data.fluxCoins -= cost;
          SaveStore.data.upgrades[def.key]++;
          SaveStore.save();
          SoundEngine.playCoinPickup();
          renderGarageModal();
          updateLiveHud();
        }
      });
    }
    listEl.appendChild(card);
  });

  if (glowRow) {
    glowRow.innerHTML = '';
    UNDERGLOW_OPTIONS.forEach((opt) => {
      const active = SaveStore.data.underglow === opt.color;
      const b = document.createElement('button');
      b.className = `px-2.5 py-1 rounded-lg font-arcade text-[10px] font-bold border transition ${
        active ? 'border-white bg-slate-800 text-white' : 'border-slate-700 bg-slate-900 text-slate-400'
      }`;
      b.style.boxShadow = active ? `0 0 10px ${opt.color}` : 'none';
      b.textContent = opt.name;
      b.addEventListener('click', () => {
        SaveStore.data.underglow = opt.color;
        SaveStore.save();
        renderGarageModal();
      });
      glowRow.appendChild(b);
    });
  }

  if (livRow) {
    livRow.innerHTML = '';
    LIVERY_OPTIONS.forEach((opt) => {
      const active = SaveStore.data.livery === opt.id;
      const b = document.createElement('button');
      b.className = `px-2.5 py-1 rounded-lg font-arcade text-[10px] font-bold border transition ${
        active ? 'border-orange-400 bg-orange-500/20 text-white' : 'border-slate-700 bg-slate-900 text-slate-400'
      }`;
      b.textContent = opt.name;
      b.addEventListener('click', () => {
        SaveStore.data.livery = opt.id;
        SaveStore.save();
        renderGarageModal();
      });
      livRow.appendChild(b);
    });
  }
}

// --- START / END / PAUSE FLOWS ---
function startNewRace() {
  SoundEngine.init();
  SoundEngine.startMusicLoop();

  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];

  const activeChar = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  GameState.status = 'PLAYING';
  GameState.eraIndex = lvl.startEra;
  GameState.maxHp = activeChar.maxHp || 100;
  GameState.hp = GameState.maxHp;
  GameState.invulnTimer = 0;
  GameState.waveTier = 1;
  GameState.isDuckSliding = false;
  GameState.score = 0;
  GameState.runCoins = 0;
  GameState.combo = 1; GameState.dodgeStreak = 0; GameState.magnetTimer = 0; GameState.airTrickCount = 0; GameState.airLandingBoostMph = 0;
  GameState.timeWarps = 0;
  GameState.takedowns = 0;
  GameState.heatLevel = lvl.startingHeat;
  GameState.heatProgress = 0;
  GameState.racePosition = 8;
  GameState.timeLeft = 48.0;
  GameState.distance = 0;
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
  updateLiveHud();

  document.getElementById('startModal').classList.add('hidden');
  document.getElementById('garageModal').classList.add('hidden');
  document.getElementById('gameOverModal').classList.add('hidden');

  triggerAnnouncement(`🏁 ${lvl.name} 🏁`, `GOAL: ${lvl.goalDesc.toUpperCase()}`, 2300);
}

function endRaceRun(customBadgeText = null) {
  GameState.status = 'GAMEOVER';
  const badgeEl = document.getElementById('endModalBadge');
  if (badgeEl) {
    badgeEl.textContent = customBadgeText || 'EVENT COMPLETE!';
  }
  const lvl = WORLD_LEVELS[GameState.levelIndex] || WORLD_LEVELS[0];
  if (GameState.racePosition <= 3) {
    GameState.runCoins += lvl.bonusReward;
    SaveStore.data.fluxCoins += lvl.bonusReward;
  }
  if (GameState.score > SaveStore.data.bestScore) {
    SaveStore.data.bestScore = GameState.score;
  }
  SaveStore.save();

  document.getElementById('endScoreText').textContent = GameState.score.toLocaleString();
  document.getElementById('endWarpsText').textContent = `POS #${GameState.racePosition} • ${GameState.timeWarps} WARPS`;
  document.getElementById('endPeakSpeedText').textContent = `${Math.round(GameState.peakSpeed)} MPH • ${GameState.takedowns} TD`;
  document.getElementById('endCoinsText').textContent = `+${GameState.runCoins} ⚡`;
  document.getElementById('gameOverModal').classList.remove('hidden');
}

// --- ACCELEROMETER / DEVICEORIENTATION ---
function handleDeviceOrientation(e) {
  if (!InputState.tiltEnabled) return;
  const isLandscape = window.innerWidth > window.innerHeight;
  let rawDeg = isLandscape ? (e.beta || 0) : (e.gamma || 0);
  if (rawDeg === 0 && e.gamma) rawDeg = e.gamma;
  InputState.tiltRawAngle = rawDeg;

  const calibrated = rawDeg - InputState.tiltZeroOffset;
  const clamped = Math.max(-28, Math.min(28, calibrated));
  InputState.tiltSteerVal = Math.abs(clamped) < 2.0 ? 0 : (clamped / 24);

  const dot = document.getElementById('tiltIndicatorDot');
  if (dot) {
    const pct = Math.max(8, Math.min(92, 50 + InputState.tiltSteerVal * 42));
    dot.style.left = `${pct}%`;
  }
}

async function toggleAccelerometerTilt(forceEnable = null) {
  const targetState = forceEnable !== null ? forceEnable : !InputState.tiltEnabled;
  if (targetState) {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== 'granted') {
          triggerAnnouncement('TILT PERMISSION BLOCKED', 'USING TOUCH WHEEL & KEYS INSTEAD', 1800);
          return;
        }
      }
    } catch (err) {}
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    InputState.tiltEnabled = true;
    InputState.tiltZeroOffset = InputState.tiltRawAngle || 0;
  } else {
    InputState.tiltEnabled = false;
    InputState.tiltSteerVal = 0;
  }

  const tiltBtn = document.getElementById('btnTiltToggle');
  const tiltModalBtn = document.getElementById('btnEnableTiltModal');
  const tiltHud = document.getElementById('tiltHudBar');
  const sensorStatus = document.getElementById('sensorStatusText');

  if (tiltBtn) {
    tiltBtn.textContent = InputState.tiltEnabled ? 'TILT: ON' : 'TILT: OFF';
    tiltBtn.className = InputState.tiltEnabled
      ? 'px-2 py-1 rounded-lg bg-amber-500 text-slate-950 border border-amber-300 text-[9px] font-arcade font-bold transition'
      : 'px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-arcade font-bold text-amber-300 transition';
  }
  if (tiltModalBtn) {
    tiltModalBtn.textContent = InputState.tiltEnabled ? '📱 TILT STEERING: ACTIVE ✓' : '📱 ENABLE TILT STEERING';
  }
  if (tiltHud) tiltHud.classList.toggle('hidden', !InputState.tiltEnabled);
  if (sensorStatus && InputState.tiltEnabled) {
    sensorStatus.textContent = 'Accelerometer Tilt Steering enabled! Tilt device left/right to steer.';
  }
}

// --- EVENT LISTENERS & CONTROLS BINDING ---
function bindAllControls() {
  window.addEventListener('keydown', (e) => {
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
    if (e.code === 'KeyN') selectCharacterByIndex((GameState.selectedCharIdx + 1) % POP_CULTURE_ROSTER.length);
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
    if (GameState.playerY > 10) performHumanTrick('LEFT');
    else {
      const now = performance.now();
      if (now - GameState.lastLeftTap < 280) performHumanTrick('JUKE_LEFT');
      GameState.lastLeftTap = now;
    }
    InputState.left = true;
  }, () => { InputState.left = false; });
  bindHoldButton('btnSteerRight', () => {
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
  document.getElementById('btnTiltToggle').addEventListener('click', () => toggleAccelerometerTilt());
  document.getElementById('btnEnableTiltModal').addEventListener('click', () => toggleAccelerometerTilt(true));
  document.getElementById('btnCalibrateTilt').addEventListener('click', () => {
    InputState.tiltZeroOffset = InputState.tiltRawAngle || 0;
    triggerAnnouncement('📱 TILT CENTERED!', 'NEUTRAL STEERING CALIBRATED', 1100);
  });

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
  document.getElementById('btnMuteGarageModal').addEventListener('click', () => {
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
  document.getElementById('btnOpenGarageFromTitle').addEventListener('click', () => {
    document.getElementById('startModal').classList.add('hidden');
    openGarageModal();
  });
  document.getElementById('btnOpenGarageFromEnd').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    openGarageModal();
  });
  document.getElementById('btnChangeEventFromGarage').addEventListener('click', () => {
    document.getElementById('garageModal').classList.add('hidden');
    renderCharacterRosterGrid();
  selectCharacterByIndex(0);
  renderLevelSelectGrid();
    document.getElementById('startModal').classList.remove('hidden');
  });
  document.getElementById('btnSelectLevelFromEnd').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    renderCharacterRosterGrid();
  selectCharacterByIndex(0);
  renderLevelSelectGrid();
    document.getElementById('startModal').classList.remove('hidden');
  });
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

  const summonBtn = document.getElementById('btnSummonRandomDriver');
  if (summonBtn) summonBtn.addEventListener('click', summonMultiverseRacer);
  const quickCarBtn = document.getElementById('btnQuickSwitchCar');
  if (quickCarBtn) {
    quickCarBtn.addEventListener('click', () => {
      selectCharacterByIndex((GameState.selectedCharIdx + 1) % POP_CULTURE_ROSTER.length);
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
    } else if (dy < -28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.hoverPressed = true; // Swipe Up -> Jump / Hover!
    } else if (dy > 28 && Math.abs(dy) > Math.abs(dx)) {
      InputState.down = true; // Swipe Down -> Duck-Slide!
      setTimeout(() => { InputState.down = false; }, 650);
    }
  });

  document.getElementById('btnStartRace').addEventListener('click', startNewRace);
  document.getElementById('btnPlayAgain').addEventListener('click', startNewRace);

  window.addEventListener('resize', () => {
    resizeCanvases();
    renderScene();
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
    startBtn.textContent = isMuted ? '🔇 SOUND: MUTED' : '🔊 SOUND: ON';
  }
  if (garBtn) {
    garBtn.textContent = isMuted ? 'UNMUTE (M)' : 'MUTE (M)';
  }
  if (volSlider) {
    volSlider.value = isMuted ? 0 : Math.round(SoundEngine.volume * 100);
  }
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

function openGarageModal() {
  if (GameState.status === 'PLAYING') GameState.status = 'PAUSED';
  renderGarageModal();
  document.getElementById('garageModal').classList.remove('hidden');
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

let lastFrameTime = 0;
let rafId = null;

function mainLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const dt = Math.min(0.05, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  if (GameState.status === 'PLAYING') {
    updateGame(dt);
  } else {
    GameState.trackPos += 1350 * dt;
    const currentSegIdx = Math.floor(GameState.trackPos / ROAD_CFG.segLength);
    if (segments.length - currentSegIdx < ROAD_CFG.drawDistance + 60) {
      generateNextTrackBiome();
    }
  }

  SoundEngine.updateEngine(GameState.speed, GameState.status === 'PLAYING' && !SoundEngine.muted);
  renderScene();
  rafId = requestAnimationFrame(mainLoop);
}

window.onload = () => {
  // Test/debug hook: ?debug exposes state for e2e checks (never used by the game itself).
  if (new URLSearchParams(location.search).has('debug')) window.__OT = { GameState };
  resizeCanvases();
  GameState.levelIndex = SaveStore.data.selectedLevel || 0;
  initTrack();
  bindAllControls();
  renderCharacterRosterGrid();
  selectCharacterByIndex(0);
  renderLevelSelectGrid();
  document.getElementById('titleBestScore').textContent = SaveStore.data.bestScore.toLocaleString();
  document.getElementById('titleTotalWarps').textContent = `⚡ ${SaveStore.data.fluxCoins} FLUX CASH`;
  syncAudioUI();
  updateEraHud();
  updateContractHud();
  updateLiveHud();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(mainLoop);
};
