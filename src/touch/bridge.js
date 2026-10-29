// Glue between the touch kit and the game (ticket 0061), loaded with the kit so desktops never
// download it. main.js hands over the few game actions that live there (`game`); everything
// else is read straight from the shared state modules.
import { GameState } from '../state.js';
import { InputState } from '../input.js';
import { SaveStore } from '../save.js';
import { SoundEngine } from '../audio.js';
import { ROAD_CFG } from '../data.js';
import { createTouchControls } from './touch-ui.js';
import { drawRearMirror } from './mirror.js';
import { normalizeControls } from './settings.js';
import { createWakeKeeper, maybeFullscreen } from './device.js';

const RESPAWN_COOLDOWN_S = 5;
const loadPanel = () => import('./panel.js');

/**
 * @param game { performHumanTrick, activateMidnightSpecial, cycleCameraMode, openSettings,
 *   recenterTilt, toggleTilt, announce, traffic: () => LiveTraffic, onboarding: () => onboarding,
 *   is3D: () => boolean }
 */
export function connectTouch(game) {
  SaveStore.data.controls = normalizeControls(SaveStore.data.controls);
  let respawnCooldown = 0;
  const status = { flux: 0, warpReady: false, calm: false, specials: 0, airborne: false, respawn: 1, nosOn: false };
  const mirrorPlayer = { z: 0, x: 0 };
  const mirrorGroups = [];
  const cfg = () => SaveStore.data.controls;
  const save = () => SaveStore.save();

  function steerEdge(dir) {
    if (GameState.status !== 'PLAYING') return;
    if (GameState.playerY > 10) { game.performHumanTrick(dir < 0 ? 'LEFT' : 'RIGHT'); return; }
    const now = performance.now();
    const key = dir < 0 ? 'lastLeftTap' : 'lastRightTap';
    if (now - GameState[key] < 280) game.performHumanTrick(dir < 0 ? 'JUKE_LEFT' : 'JUKE_RIGHT');
    GameState[key] = now;
  }

  /** RESET: back to the centre lane, wheels down. A cooldown keeps it from being a dodge. */
  function respawn() {
    if (GameState.status !== 'PLAYING' || respawnCooldown > 0) return;
    respawnCooldown = RESPAWN_COOLDOWN_S;
    GameState.playerX = 0;
    GameState.playerVX = 0;
    GameState.playerY = 0;
    GameState.playerVY = 0;
    GameState.speed = Math.max(GameState.speed, 40);
    game.announce('↺ BACK ON THE ROAD', 'CENTRE LANE', 900);
  }

  const controls = createTouchControls({
    settings: cfg,
    save,
    hooks: {
      canPlay: () => GameState.status === 'PLAYING',
      calm: () => !!GameState.reducedMotion,
      onBoost: () => { SoundEngine.init(); InputState.boostPressed = true; },
      onJump: () => { SoundEngine.init(); if (GameState.playerY > 12) game.performHumanTrick('UP'); else InputState.hoverPressed = true; },
      onDrift: () => { if (GameState.playerY > 12) game.performHumanTrick('DOWN'); },
      onSpecial: (type) => game.activateMidnightSpecial(type),
      onHorn: () => { SoundEngine.init(); SoundEngine.playHorn(); },
      onNos: () => { SoundEngine.init(); },
      onPause: () => game.openSettings(),
      onCamera: () => game.cycleCameraMode(),
      onRespawn: respawn,
      onSteerStart: () => { SoundEngine.init(); game.onboarding().steer(); },
      onSteerEdge: steerEdge,
      onFlick: (dir) => {
        if (dir === 'up') InputState.hoverPressed = true;
        else if (dir === 'down') { InputState.down = true; setTimeout(() => { InputState.down = false; }, 650); }
        else { GameState.playerVX += dir === 'right' ? 1.15 : -1.15; game.onboarding().steer(); }
      },
      onTiltRecenter: game.recenterTilt,
      tiltOn: () => InputState.tiltEnabled,
      is3D: game.is3D,
      status: () => {
        status.flux = GameState.fluxCharge / 100;
        status.warpReady = !!GameState.warpReady; // set by the race step (0112)
        status.calm = !!GameState.reducedMotion;
        status.specials = GameState.specialCharges;
        status.airborne = GameState.playerY > 12;
        status.respawn = 1 - respawnCooldown / RESPAWN_COOLDOWN_S;
        status.nosOn = !!InputState.nosOn; // NOS TAP ON/OFF switched on (0222)
        return status;
      },
      drawMirror: (ctx, w, h) => {
        const t = game.traffic();
        mirrorPlayer.z = GameState.trackPos + ROAD_CFG.playerZOffset;
        mirrorPlayer.x = GameState.playerX;
        mirrorGroups[0] = t.racers;
        mirrorGroups[1] = t.traffic;
        drawRearMirror(ctx, w, h, mirrorPlayer, mirrorGroups);
      },
    },
  });

  /** Settings the race reads directly: auto-accelerate and steer assist. */
  function apply() {
    const c = cfg();
    GameState.autoGas = c.autoAccel !== false;
    const gasBtn = document.getElementById('btnGasPedal');
    if (gasBtn) gasBtn.textContent = GameState.autoGas ? '🟢 AUTO-GAS: ON (W)' : '⚪ AUTO-GAS: OFF (W)';
    if (c.steerAssist && GameState.jarvisMode === 2) GameState.jarvisMode = 0;
    if (!c.steerAssist && GameState.jarvisMode === 0) GameState.jarvisMode = 2;
    controls.applySettings();
  }

  const wake = createWakeKeeper();

  function raceStart(lateLoad) {
    if (!lateLoad) { respawnCooldown = 0; InputState.lookZoom = 1; }
    // Inside the tap that started the race: browser bars away on Android phones.
    if (!lateLoad && controls.isActive()) maybeFullscreen(cfg().fullscreen !== false);
    if (!history.state || !history.state.otRace) {
      try { history.pushState({ otRace: 1 }, ''); } catch (e) { /* sandboxed */ }
    }
    apply();
    controls.relayout();
    // Live races can't pause (everyone shares one clock), so the guide waits for your first
    // solo race instead of covering the countdown; the lobby shows a one-line tip meanwhile.
    // Coach tips off (0201) skips it without marking it seen: turned back on, it still plays once.
    if (controls.isActive() && !cfg().coachSeen && SaveStore.data.settings.coach !== false && GameState.status === 'PLAYING' && GameState.mode !== 'LIVE') {
      // The guide plays over the start lights and never pauses the race: it's done once you
      // steer, or a few seconds into the race (the steering hint takes over from there).
      loadPanel().then(({ maybeShowCoach }) => maybeShowCoach({
        settings: cfg(), save, controls,
        done: () => Math.abs(InputState.touchSteerVal) > 0.25 || InputState.tiltSteerVal * InputState.tiltSteerVal > 0.06
          || (GameState.racePhase === 'RACING' && GameState.raceTime > 3) || GameState.status !== 'PLAYING',
      }));
    }
  }

  // Back gesture / back button mid-race pauses instead of leaving the game.
  window.addEventListener('popstate', () => {
    if (GameState.status === 'PLAYING' || GameState.status === 'PAUSED') {
      game.openSettings();
      history.pushState({ otRace: 1 }, '');
    }
  });

  apply();
  return {
    sample(dt) {
      wake.set(GameState.status === 'PLAYING');
      if (respawnCooldown > 0 && GameState.status === 'PLAYING') respawnCooldown = Math.max(0, respawnCooldown - dt);
      controls.sample(dt);
    },
    render: controls.render,
    controls,
    wake,
    raceStart,
    show() {
      if (controls.isActive()) return;
      controls.setActive(true);
      if (GameState.status === 'PLAYING') raceStart(true);
    },
    openPanel(back) {
      loadPanel().then(({ openControlsPanel }) => openControlsPanel({
        onDone: back, settings: cfg(), save, controls, onChange: apply,
        enableTilt: (on) => game.toggleTilt(on), tiltState: () => InputState.tiltEnabled,
      }));
    },
    openEditor(onClose) {
      loadPanel().then(({ openLayoutEditor }) => openLayoutEditor({
        settings: cfg(), save, controls, onClose: () => { apply(); onClose(); },
      }));
    },
  };
}
