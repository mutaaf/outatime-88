// Race specials (0227): the side-slam rival takedown, the street-crew specials (ZONE / AGRO /
// ROAR) and the Arc Pulse Beam, carved out of src/race-step.js with no behaviour change. Only
// race-step.js imports this, so it lands in the same lazy chunk (never a chunk of its own).
import {
  RACE_DEPS, JarvisAI, LiveTraffic, advanceContractProgress, burstSparks, triggerAnnouncement
} from './main.js';
import { RF, earnCash, spawnParticle } from './race-step.js';
import { foldRepeat } from './chain-plate.js';

const { FLUX, GameState, ROAD_CFG, SaveStore, SoundEngine, track } = RACE_DEPS;

// Whether a special's tint is on screen: null at load, true while one shows, false once faded.
let tintShown = null;

export function spawnObstacleShatter(offsetFromCenter, primaryColor, accentColor, labelText) {
  GameState.carJoltY = 12;
  GameState.screenShake = Math.max(GameState.screenShake, 0.28);
  const sw = {
    x: offsetFromCenter * 150,
    y: -20,
    radius: 15,
    maxRadius: 145,
    color: primaryColor,
    label: labelText,
    hit: true, // outranks a pickup plate in the one label lane (src/popups.js, 0220)
    life: 0.7,
    maxLife: 0.7
  };
  // Two cars hit in the same instant: one plate with a count, not two stacked copies (0241).
  foldRepeat(GameState.hitShockwaves, sw, 0.4);
  GameState.hitShockwaves.push(sw);
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
  const tdCash = earnCash(15);
  GameState.runCoins += tdCash;
  SaveStore.data.fluxCoins += tdCash;
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
    spawnParticle((car.offset - GameState.playerX) * 120, -15, (Math.random() - 0.5) * 380, -80 - Math.random() * 240, s % 2 === 0 ? '#ff5500' : '#fde047', 0.55);
  }

  SoundEngine.playTakedown();
  triggerAnnouncement(`💥 ${reason} 💥`, `${car.name} WRECKED! +${tdPoints} PTS & +32% FLUX`, 1850);
  advanceContractProgress('TAKEDOWN', 1);
  SaveStore.save();
}

// --- STREET-CREW SPECIAL ABILITIES (ZONE / AGRO / ROAR) ---
// Calm motion: the tint (a 10% wash) shows at half strength, under the 0.1 flash line (ticket 0188).
const CALM_TINT = '0.5';
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
      tint.style.opacity = GameState.reducedMotion ? CALM_TINT : ''; tintShown = true; // the step loop's '0' would otherwise hide it
    }
    triggerAnnouncement('🟢 MIDNIGHT ZONE ENGAGED!', 'BULLET-TIME PRECISION REFLEX ACTIVE', 1600);
  } else if (type === 'AGRO') {
    GameState.agroTimer = 5.0 + upgBonus;
    GameState.speed = Math.max(GameState.speed + 18, 95);
    SoundEngine.playBoosterHit();
    if (tint) {
      tint.className = 'pointer-events-none absolute inset-0 bg-orange-600/10 opacity-100 transition-opacity duration-200';
      tint.style.opacity = GameState.reducedMotion ? CALM_TINT : ''; tintShown = true; // the step loop's '0' would otherwise hide it
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
  RF.updateLiveHud();
}

// The Arc Pulse Beam (B key / pulse button): moved out of main with the rest of race-only code.
export function fireUnibeam() {
  SoundEngine.init();
  if (GameState.fluxCharge < 18 && GameState.specialCharges <= 0) {
    JarvisAI.setStatus('Arc Core needs 18% Flux energy to fire the Pulse Beam.', false);
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
    JarvisAI.setStatus(`Target ${hitCar.name} neutralized via Mark-88 Arc Pulse Beam.`, true);
  } else {
    GameState.speed = Math.min(135, GameState.speed + 14);
    JarvisAI.setStatus('Arc Pulse Beam discharged. Pulse overboost applied.', false);
    triggerAnnouncement('💠 ARC PULSE BEAM FIRED!', '+14 MPH PULSE THRUST!', 1100);
  }
}

/** The step loop's half: fade the tint once ZONE and AGRO have both run out. */
export function fadeAbilityTint() {
  if (GameState.zoneTimer <= 0 && GameState.agroTimer <= 0 && tintShown !== false) {
    // Written once when the abilities run out, not every 120 Hz step (ticket 0182).
    const tint = document.getElementById('abilityTintOverlay');
    if (tint) tint.style.opacity = '0';
    tintShown = false;
  }
}
