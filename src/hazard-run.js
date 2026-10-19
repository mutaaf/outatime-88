// Endless hazards on the road (ticket 0186): the glue between the pure rules (src/hazards.js)
// and the race. A lazy chunk the race step fetches when it loads; it only acts in Endless solo
// runs, after the gentle first stretch. The race step calls step() once per sim step (before
// the Time Storm), reset() at every run start, onContinue() after a paid continue and noteEnd()
// whenever an Endless run ends. Renderers read GameState.hz (src/hazard-art.js).
import { RACE_DEPS, RS, runStats, storm, touch, triggerAnnouncement } from './main.js';
import { endOrContinue, shieldBreak } from './race-step.js';
import {
  HZ, RULES, FUEL, HEAT, STALL, PATROL, CHECK, LANES, causeOf, planHazard, gapZ, timeTo, armTrain, trainPos,
  hits, endZ, nearestLane, burnFuel, stepHeat, stepStall, stepPatrol, checkSecs, ensureHz, recordDeath,
} from './hazards.js';

const { GameState: G, SaveStore, SoundEngine, ROAD_CFG, PACE_MODES, hasSetPieceBetween } = RACE_DEPS;
const SEG = ROAD_CFG.segLength;
const MAX_LIVE = 6;
const FALLS = { BRIDGE: 1, COLLAPSE: 1, EDGE: 1 };

// One state object for the run; GameState.hz points at it so both renderers can read it.
export const S = {
  on: false, seed: 0, idx: 0, nextZ: 0, met: [], last: '', list: [], lastZ: 0, lastT: 0,
  fuel: FUEL.max, fuelOn: false, dry: false, dryT: 0, lowWarned: false, cores: 0,
  heat: 0, hotWarned: false, stall: 0, patrol: { t: 0, dur: 1 }, slowT: 0, slowSpell: false, grindT: 0, sinceSlip: 9,
  cp: { on: false, gate: 0, gateZ: 0, left: 0, dur: 1 }, boltT: 0, bolt: 0,
  dying: null, cause: '', cue: '', cueT: 0, bell: 0, bell2: 660, refZps: 1,
};
G.hz = S;

function zPer() {
  return (11000 / 88) * (PACE_MODES[G.paceMode] || PACE_MODES[0]).mult; // Z per mph·s (as resetRunner)
}

export function reset() {
  S.on = G.mode === 'INFINITE' && !G.daily;
  S.seed = (G.lineSeed | 0) ^ 0x2d1b;
  S.idx = 0; S.nextZ = 0; S.met.length = 0; S.last = ''; S.list.length = 0;
  S.lastZ = G.trackPos + ROAD_CFG.playerZOffset; S.lastT = G.raceTime || 0;
  S.fuel = FUEL.max; S.fuelOn = false; S.dry = false; S.dryT = 0; S.lowWarned = false; S.cores = G.fuelCores | 0;
  S.heat = 0; S.hotWarned = false; S.stall = 0; S.patrol.t = 0; S.slowT = 0; S.slowSpell = false; S.grindT = 0; S.sinceSlip = 9;
  S.cp.on = false; S.cp.left = 0; S.boltT = 3; S.bolt = 0;
  S.dying = null; S.cause = ''; S.cue = ''; S.cueT = 0; S.bell = 0;
  G.noGas = false; G.hzFall = 0;
  for (const k of ['hazards', 'trains', 'bridges']) runStats[k] = 0;
  card(null);
}

const seen = () => ensureHz(SaveStore.data).seen;

function layDown(pz, tier) {
  for (let guard = 0; guard < 4 && S.nextZ && S.nextZ < pz + RULES.ahead && S.list.length < MAX_LIVE; guard++) {
    const plan = planHazard(S.seed, S.idx, tier, S.met, S.last);
    if (!plan) return;
    const z0 = Math.ceil(S.nextZ / SEG) * SEG;
    // Never inside a loop, gap, ramp or other set piece (they have their own rules).
    if (hasSetPieceBetween(z0 - 3 * SEG, z0 + plan.len + 3 * SEG)) { S.nextZ = z0 + 8 * SEG; continue; }
    const h = plan;
    h.z0 = z0; h.carZ = z0 + plan.len; h.tOn = null; h.tOff = null; h.spent = false; h.warned = false; h.locked = false;
    h.i = S.idx; h.ph = 0; h.tutor = !seen()[h.kind];
    h.signZ = z0 - RULES.signLead * S.refZps;
    S.list.push(h);
    if (!S.met.includes(h.kind)) S.met.push(h.kind);
    S.last = h.kind;
    S.nextZ = z0 + plan.len + gapZ(S.seed, S.idx, G.difficulty, S.refZps);
    S.idx++;
  }
}

function telegraph(h) {
  const d = HZ[h.kind];
  if (h.tutor) {
    seen()[h.kind] = 1;
    SaveStore.save();
    triggerAnnouncement(`${d.icon} ${d.sign}!`, d.how, 2400, 3);
  } else triggerAnnouncement(`${d.icon} ${d.act}`, d.sign, 1300, 3);
  if (h.kind === 'WRONGWAY') SoundEngine.sample('horn', 0.8, 0.9) || SoundEngine.playHorn();
  else if (h.kind === 'LIGHTNING') SoundEngine.sample('zone', 2, 0.6);
  else SoundEngine.sample('beep', h.kind === 'TRAIN' ? 1.6 : 0.8, 0.9) || SoundEngine.playBeep(false);
  if (touch) touch.controls.haptics.pulse('hit');
}

/** The car touched a hazard: the tutorial run forgives it once, a shield eats it, else game over. */
function contact(h) {
  h.spent = true;
  const rel = (h.kind === 'WRONGWAY' || h.kind === 'LIGHTNING' ? LANES[nearestLane(G.playerX)] : 0) - G.playerX;
  if (FALLS[h.kind]) G.playerVY = Math.max(G.playerVY, 520); // hop out of the hole
  if (h.kind === 'EDGE') G.playerX -= h.side * 0.08;
  if (shieldBreak(rel)) return;
  if (h.tutor) {
    G.speed = Math.max(20, G.speed * 0.45);
    G.screenShake = Math.max(G.screenShake, 0.45);
    G.invulnTimer = Math.max(G.invulnTimer, 1);
    SoundEngine.sample('bump', 0.8) || SoundEngine.playCrash();
    triggerAnnouncement('😮 CLOSE ONE — PRACTICE LAP!', `NEXT TIME IT ENDS YOUR RUN · ${HZ[h.kind].tip.toUpperCase()}`, 2600, 3);
    return;
  }
  fail(h.kind);
}

/** Start the run-over moment (a cartoony beat, then the continue offer or the results). */
function fail(id) {
  if (S.dying) return;
  const c = causeOf(id);
  S.dying = { id, t: 0 };
  G.hzFall = FALLS[id] ? 1 : 0;
  G.invulnTimer = Math.max(G.invulnTimer, 1);
  G.screenShake = Math.max(G.screenShake, 0.6);
  if (!G.reducedMotion) G.takedownSlowMoTimer = Math.max(G.takedownSlowMoTimer, 0.35);
  if (id === 'FUEL' || id === 'STALL' || id === 'TIMEOUT') SoundEngine.playTone(330, 'sawtooth', 0.7, 0.12, 90);
  else SoundEngine.sample('crash', 1, 0.9) || SoundEngine.playCrash();
  if (touch) touch.controls.haptics.pulse('hit');
  triggerAnnouncement(`${c.icon} ${c.cause}!`, '', 1400, 3);
}

function finishDying(dt) {
  S.dying.t += dt;
  G.noGas = true;
  G.speed = Math.max(0, G.speed - G.speed * 4 * dt);
  if (S.dying.t < 0.6) return;
  const id = S.dying.id, c = causeOf(id);
  S.dying = null;
  G.hzFall = 0;
  if (G.status !== 'PLAYING') return;
  S.cause = id;
  endOrContinue(`${c.icon} ${c.cause}`);
}

export function step(dt) {
  if (!S.on) return;
  const now = G.raceTime || 0;
  if (now + 0.5 < S.lastT) reset();
  S.lastT = now;
  if (S.dying) { finishDying(dt); return; }
  const pz = G.trackPos + ROAD_CFG.playerZOffset;
  const dz = Math.max(0, Math.min(4000, pz - S.lastZ));
  S.lastZ = pz;
  const zp = zPer();
  S.refZps = 88 * zp;
  const zps = Math.max(0, G.speed) * zp;
  const gentle = G.distance < RULES.gentle;
  const tier = G.tier | 0, diff = G.difficulty || 0;
  const p = probe(pz, now);
  S.cue = '';

  // Road hazards.
  if (!gentle && !S.nextZ) S.nextZ = pz + RULES.ahead;
  if (!gentle) layDown(pz, tier);
  if (!gentle && storm.warn >= RULES.stormWarn) {
    S.boltT -= dt;
    if (S.boltT <= 0 && S.list.length < MAX_LIVE) {
      S.boltT = RULES.boltEvery;
      const z0 = Math.ceil((pz + Math.max(1200, zps * RULES.boltAhead)) / SEG) * SEG;
      S.list.push({ kind: 'LIGHTNING', len: HZ.LIGHTNING.len, lanes: 1 << nearestLane(G.playerX), safe: -1, side: 0, z0, carZ: 0, tOn: null, tOff: null, spent: false, warned: false, locked: true, i: -1, ph: 0, tutor: !seen().LIGHTNING, signZ: -1 });
    }
  } else S.boltT = Math.max(S.boltT, 1);
  if (S.bolt > 0) S.bolt = Math.max(0, S.bolt - dt);

  for (let k = S.list.length - 1; k >= 0; k--) {
    const h = S.list[k];
    let t;
    if (h.kind === 'WRONGWAY') {
      const carZps = RULES.wrongMph * zp;
      h.carZ -= carZps * dt;
      t = h.carZ > pz ? (h.carZ - pz) / Math.max(1, zps + carZps) : 0;
      if (!h.locked && t <= RULES.wrongLock) { h.locked = true; h.lanes = 1 << nearestLane(G.playerX); }
    } else t = timeTo(h.z0, pz, zps);
    h.t = t;
    if (!h.warned && t <= Math.max(h.tutor ? RULES.warnFirst : HZ[h.kind].warn || RULES.warn, h.kind === 'TRAIN' ? RULES.trainArm : 0)) { h.warned = true; telegraph(h); }
    if (h.kind === 'TRAIN') {
      if (h.tOn == null && t <= RULES.trainArm) armTrain(h, now, t);
      if (h.tOn != null && now < h.tOff + 0.3 && (S.bell -= dt) <= 0) { S.bell = 0.32; SoundEngine.playTone(S.bell2 = S.bell2 === 880 ? 660 : 880, 'square', 0.12, 0.05); }
      h.pos = trainPos(h, now);
    }
    if (h.kind === 'COLLAPSE') h.ph = Math.max(0, Math.min(1, 1 - t / RULES.collapseHoles));
    if (h.kind === 'BRIDGE' && !h.spent && t > 0 && t <= RULES.jumpCue && G.playerY < RULES.lowY) S.cue = 'JUMP!';
    if (h.kind === 'BEAM' && !h.spent && t > 0 && t <= RULES.jumpCue && !p.duck) S.cue = 'DUCK!';
    if (h.kind === 'LIGHTNING' && !h.spent && t <= 0.25 && !h.struck) { h.struck = true; S.bolt = 0.35; SoundEngine.sample('crash', 2.2, 0.5); }
    if (hits(h, p)) { contact(h); if (S.dying) break; }
    if (pz > endZ(h) + 2 * SEG && (h.kind !== 'TRAIN' || now > (h.tOff || 0))) {
      if (!h.spent && h.kind !== 'LIGHTNING') {
        runStats.hazards++;
        if (h.kind === 'TRAIN') runStats.trains++;
        if (h.kind === 'BRIDGE') runStats.bridges++;
      }
      S.list.splice(k, 1);
    } else if (h.kind === 'WRONGWAY' && h.carZ < pz - 8 * SEG) S.list.splice(k, 1);
  }
  if (S.dying) { G.hz = S; return; }

  // Fuel: drains once the gentle stretch is over; plutonium cores refill it.
  const cores = G.fuelCores | 0;
  if (cores !== S.cores) { S.fuel = Math.min(FUEL.max, S.fuel + FUEL.core * (cores - S.cores)); S.cores = cores; }
  if (!gentle && tier >= 2) { S.fuelOn = true; S.fuel = burnFuel(S.fuel, dz, diff); }
  if (S.fuelOn) {
    if (S.fuel <= FUEL.low && !S.lowWarned) { S.lowWarned = true; triggerAnnouncement('⛽ LOW PLUTONIUM!', 'GRAB THE GLOWING BLUE CORES', 1500, 3); SoundEngine.playBeep(false); }
    else if (S.fuel > FUEL.low + 15) S.lowWarned = false;
    const dry = S.fuel <= 0;
    if (dry && !S.dry) triggerAnnouncement('⛽ OUT OF PLUTONIUM!', `COASTING — GRAB A CORE IN ${FUEL.drySecs}s`, 1800, 3);
    S.dry = dry;
    S.dryT = dry ? S.dryT + dt : 0;
    G.noGas = dry;
    if (S.dryT >= FUEL.drySecs) { fail('FUEL'); return; }
  }

  // NOS heat.
  S.heat = stepHeat(S.heat, G.nosBurning, dt);
  if (S.heat >= HEAT.hot && !S.hotWarned) { S.hotWarned = true; triggerAnnouncement('🔥 ENGINE HOT!', 'EASE OFF THE NOS', 1200, 3); SoundEngine.playBeep(false); }
  else if (S.heat < HEAT.hot - 30) S.hotWarned = false;
  if (S.heat >= HEAT.max) { fail('HEAT'); return; }

  // Stalling (waiting for a train or coasting dry doesn't count).
  let waiting = false;
  for (let k = 0; k < S.list.length; k++) { const h = S.list[k]; if (h.kind === 'TRAIN' && h.tOn != null && pz < h.z0 + h.len + 2 * SEG && now < h.tOff + 2.5) waiting = true; }
  const wasStall = S.stall;
  S.stall = stepStall(S.stall, G.speed, dt, waiting || S.dry || now < STALL.after);
  if (S.stall >= 2 && wasStall < 2) triggerAnnouncement('🐌 MOVE IT!', 'STALL TOO LONG AND THE RUN IS OVER', 1200, 3);
  if (S.stall >= STALL.secs) { fail('STALL'); return; }

  // The Patrol.
  if (!gentle && tier >= 2) {
    // Slips: a crash; grinding along a wall at speed (a kiss doesn't count); crawling — but not
    // while you're still recovering from the last slip, so one crash never counts twice.
    const was = S.grindT;
    S.grindT = G.wallGrind && G.speed >= PATROL.grindMph ? S.grindT + dt : 0;
    const grind = was < PATROL.grindSecs && S.grindT >= PATROL.grindSecs;
    S.sinceSlip += dt;
    S.slowT = G.speed < PATROL.slowMph && !waiting && S.sinceSlip > PATROL.recover ? S.slowT + dt : 0;
    const slow = S.slowT >= PATROL.slowSecs && !S.slowSpell;
    if (S.slowT === 0) S.slowSpell = false;
    if (slow) S.slowSpell = true;
    const slip = Boolean(RS.stormCrash) || grind || slow;
    if (slip) S.sinceSlip = 0;
    const r = stepPatrol(S.patrol, slip, dt, diff);
    if (r === 'on') { triggerAnnouncement('🚨 THE PATROL IS ON YOU!', `NO MORE SLIPS FOR ${Math.round(S.patrol.dur)}s`, 1500, 3); SoundEngine.playTone(620, 'triangle', 0.6, 0.08, 980); }
    else if (r === 'lost') { triggerAnnouncement('😎 LOST THE PATROL', '', 900); }
    else if (r === 'caught') { fail('PATROL'); return; }
  }

  // Checkpoints.
  const cp = S.cp;
  if (!cp.on && tier >= CHECK.from) {
    cp.on = true;
    cp.dur = cp.left = checkSecs(diff);
    cp.gate = G.distance + CHECK.dist;
    cp.gateZ = cp.gate * zp + ROAD_CFG.playerZOffset;
  } else if (cp.on) {
    cp.left -= dt;
    if (G.distance >= cp.gate) {
      const spare = cp.left;
      cp.dur = cp.left = checkSecs(diff, spare);
      cp.gate += CHECK.dist;
      cp.gateZ = pz + (cp.gate - G.distance) * zp;
      SoundEngine.playCheckpoint();
      triggerAnnouncement('🏁 CHECKPOINT!', `+${Math.round(cp.dur - Math.min(CHECK.carry, Math.max(0, spare)))}s · ${Math.round(cp.dur)}s TO THE NEXT`, 1200);
    } else if (cp.left <= 0) { fail('TIMEOUT'); return; }
  }
}

function probe(pz, now) {
  P.z = pz; P.x = G.playerX; P.y = G.playerY; P.duck = Boolean(G.isDuckSliding); P.now = now;
  return P;
}
const P = { z: 0, x: 0, y: 0, duck: false, now: 0 };

/** After a paid continue: a clear stretch, a part-filled tank, a cool engine, no Patrol. */
export function onContinue() {
  const pz = G.trackPos + ROAD_CFG.playerZOffset;
  const clear = pz + 3 * S.refZps + 4 * SEG;
  for (const h of S.list) if ((h.kind === 'WRONGWAY' ? h.carZ : h.z0) < clear) h.spent = true;
  if (S.nextZ && S.nextZ < clear) S.nextZ = clear;
  S.fuel = Math.max(S.fuel, FUEL.refill); S.dry = false; S.dryT = 0; G.noGas = false;
  S.heat = 0; S.stall = 0; S.patrol.t = 0; S.slowT = 0; S.boltT = 4;
  if (S.cp.on) S.cp.left = Math.max(S.cp.left, 12);
  S.dying = null; G.hzFall = 0;
}

/** An Endless run ended (or is offering a continue): note the cause and fill the death card. */
export function noteEnd(reason) {
  if (!S.on) return;
  const id = S.cause || (/STORM/.test(reason || '') ? 'STORM' : 'WRECK');
  S.cause = '';
  recordDeath(SaveStore.data, id);
  G.deathCause = id;
  card(id);
}

function card(id) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('hzCause');
  if (!id) { if (el) el.hidden = true; return; }
  const badge = document.getElementById('endModalBadge');
  if (!el && badge && badge.parentNode) {
    el = document.createElement('div');
    el.id = 'hzCause';
    el.className = 'hz-cause';
    el.setAttribute('role', 'status');
    const head = document.createElement('div'), tip = document.createElement('div');
    head.className = 'hz-cause-head'; tip.className = 'hz-cause-tip';
    el.style.cssText = 'margin:6px auto 10px;padding:8px 12px;max-width:26rem;border:2px solid #f43f5e;border-radius:10px;background:rgba(244,63,94,0.12);text-align:center';
    head.style.cssText = 'font:900 15px Orbitron,sans-serif;color:#fecdd3;letter-spacing:0.04em';
    tip.style.cssText = 'margin-top:3px;font-size:12px;color:#e2e8f0';
    el.append(head, tip);
    badge.parentNode.insertBefore(el, badge.nextSibling);
  }
  if (!el) return;
  const c = causeOf(id), n = ensureHz(SaveStore.data).deaths[id] | 0;
  el.hidden = false;
  el.children[0].textContent = `${c.icon} ${c.cause}`;
  el.children[1].textContent = `TIP: ${c.tip}${n > 1 ? ` · (${n}× so far)` : ''}`;
}

// ---------------------------------------------------------------------------------------
// The 3D view draws hazards with its existing simple obstacle shapes (no new meshes): the
// obstacle list it reads gets a few draw-only stand-ins appended while hazards are on the road.

const proxyPool = [];
const with3dList = [];
const proxy = (n, type, z, offset, halfW) => {
  const o = proxyPool[n] || (proxyPool[n] = { type: '', worldZ: 0, offset: 0, halfW: 0.2, y: 0, kind: 'HAZARD' });
  o.type = type; o.worldZ = z; o.offset = offset; o.halfW = halfW;
  return o;
};

export function with3D(base) {
  if (!S.on || !S.list.length) return base;
  const out = with3dList;
  out.length = 0;
  for (let i = 0; i < base.length; i++) out.push(base[i]);
  let n = 0;
  for (const h of S.list) {
    if (h.spent || n > 40) continue;
    if (h.kind === 'BRIDGE') { out.push(proxy(n++, 'HZ_BRIDGE', h.z0, 0, 0.86)); out.push(proxy(n++, 'HZ_BRIDGE', h.z0 + h.len, 0, 0.86)); }
    else if (h.kind === 'BEAM') { for (let l = 0; l < 3; l++) if (h.lanes & (1 << l)) out.push(proxy(n++, 'HIGH_LIGHT_GATE', h.z0, LANES[l], 0.24)); }
    else if (h.kind === 'COLLAPSE' || h.kind === 'LIGHTNING') {
      for (let l = 0; l < 3; l++) if (h.lanes & (1 << l) && l !== h.safe) out.push(proxy(n++, h.kind === 'LIGHTNING' ? 'HZ_BOLT' : 'HZ_HOLE', h.z0 + h.len * 0.3, LANES[l], 0.22));
    } else if (h.kind === 'TRAIN') { if (h.pos != null) for (let c = 0; c < 3; c++) out.push(proxy(n++, 'FLUX_CRATE', h.z0 + h.len / 2, h.pos * 1.8 - c * 0.42, 0.2)); }
    else if (h.kind === 'WRONGWAY') out.push(proxy(n++, 'FLUX_CRATE', h.carZ, LANES[nearestLane(laneX(h))], 0.2));
    else if (h.kind === 'EDGE') for (let z = h.z0; z < h.z0 + h.len; z += 600) out.push(proxy(n++, 'TRAFFIC_CONE', z, h.side * 0.8, 0.1));
  }
  return out;
}
const laneX = (h) => LANES[h.lanes & 1 ? 0 : h.lanes & 2 ? 1 : 2];

// Debug hook for tests (?debug only, through main's __OT): lay a hazard `ahead` seconds out.
export function debugPlace(kind, ahead = 1.8, lane = -1) {
  const pz = G.trackPos + ROAD_CFG.playerZOffset;
  const zp = zPer();
  S.refZps = 88 * zp;
  const z0 = Math.ceil((pz + ahead * Math.max(30, G.speed) * zp) / SEG) * SEG;
  const l = lane >= 0 ? lane : 1;
  const h = { kind, len: HZ[kind].len, lanes: 7, safe: -1, side: l === 0 ? -1 : 1 };
  if (kind === 'BEAM' || kind === 'COLLAPSE') { h.safe = l; h.lanes = 7 & ~(1 << l); }
  else if (kind === 'WRONGWAY' || kind === 'LIGHTNING') h.lanes = 1 << l;
  Object.assign(h, { z0, carZ: z0 + h.len, tOn: null, tOff: null, spent: false, warned: false, locked: lane >= 0 || kind === 'LIGHTNING', i: -1, ph: 0, tutor: !seen()[kind], signZ: z0 - RULES.signLead * S.refZps });
  S.on = true;
  S.list.push(h);
  return { kind, z0, lanes: h.lanes, safe: h.safe, side: h.side, tutor: h.tutor };
}
