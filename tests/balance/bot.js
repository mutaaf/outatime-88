// Balance bots (docs/BALANCE.md). Injected into the page by tests/balance/balance.spec.js and
// run inside ?debug, where window.__OT exposes the live game. Never part of the shipped bundle.
//
// A bot reads only what a player can see — bodies and pickups on the road ahead, within its
// sight distance — and drives through InputState like a gamepad would. Skill is reaction
// (how far ahead it sees, how often it rethinks), precision (steering noise, how cleanly it
// times jumps and slides), attention (moments where it stops looking) and ambition (coins,
// power-ups, NOS, warps).
(function () {
  const SKILLS = {
    // sight: world units ahead it reacts to (≈ 3,500/s at 100 mph on the default pace)
    // think: s between decisions · tau: s for the hands to follow (reaction lag)
    // curve: how well it reads bends (1 = perfect feed-forward) · noise: lane-keeping error
    // pass: chance it times a jump/slide/brake right · read: chance it understands a hazard's
    // sign and picks the right lane (Endless hazards, 0186) · lapse: per-second chance of a look-away of
    // lapseSecs, hands frozen · greed: how much it goes for coins and power-ups
    novice: { sight: 2200, think: 0.35, tau: 0.3, curve: 0.45, gain: 1.8, noise: 0.14, pass: 0.4, read: 0.6, lapse: 0.12, lapseSecs: 1.0, greed: 0, nos: false, warp: false, cont: 0.5 },
    casual: { sight: 3200, think: 0.2, tau: 0.18, curve: 0.7, gain: 2.4, noise: 0.08, pass: 0.7, read: 0.85, lapse: 0.06, lapseSecs: 0.8, greed: 0.4, nos: false, warp: true, cont: 1 },
    good: { sight: 4800, think: 0.1, tau: 0.1, curve: 0.88, gain: 3.0, noise: 0.04, pass: 0.9, read: 0.95, lapse: 0.025, lapseSecs: 0.55, greed: 0.8, nos: true, warp: true, cont: 1 },
    expert: { sight: 7200, think: 0.04, tau: 0.05, curve: 1, gain: 3.4, noise: 0.015, pass: 0.98, read: 0.99, lapse: 0.005, lapseSecs: 0.35, greed: 1, nos: true, warp: true, cont: 1 },
  };
  const LANES = [-0.48, -0.24, 0, 0.24, 0.48];
  const HZ_LANES = [-0.48, 0, 0.48], HZ_HALF = 0.28; // src/hazards.js LANES, LANE_HALF + slack
  const PLAYER_HALF_W = 0.14;
  const SEG = 200, Z_OFF = 1250;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createBot(skillName, seed) {
    const sk = SKILLS[skillName];
    const rand = mulberry32(seed ^ 0xb07);
    const OT = window.__OT;
    const G = OT.GameState, I = OT.input;
    const dt = 1 / 120;
    let target = 0, thinkLeft = 0, lapseLeft = 0, noise = 0, hands = 0;
    const rolls = new WeakMap(); // obstacle → will this bot clear it by jumping/sliding?
    let slideUntilZ = -1;
    const hzRolls = new WeakMap(); // hazard → { ok: times it right, read: understands it, early }
    const hzRoll = (h) => {
      let r = hzRolls.get(h);
      if (!r) {
        // Players learn: every earlier meeting (the tutorial) and every death to a kind takes
        // a quarter off the chance of getting it wrong again.
        const z = (OT.save().endless || {}).hz || {};
        const learn = Math.pow(0.75, ((z.deaths || {})[h.kind] | 0) + ((z.seen || {})[h.kind] ? 1 : 0));
        r = { ok: rand() < 1 - (1 - sk.pass) * learn, read: rand() < 1 - (1 - sk.read) * learn, early: 0.7 + rand() * 0.5, jump: rand() < 0.5 };
        hzRolls.set(h, r);
      }
      return r;
    };
    const lanesAt = (x, half = HZ_HALF) => { let m = 0; for (let i = 0; i < 3; i++) if (Math.abs(x - HZ_LANES[i]) < half) m |= 1 << i; return m; };
    // A player trusts a lane to save them only near its middle, not on the line between two.
    const safeAt = (x) => lanesAt(x, 0.14);
    const hazards = () => (G.hz && G.hz.on && G.hz.list) || [];
    /** Cost of being in `lane` for the Endless hazards this bot has seen and understood. */
    function hazardCost(lane, ws) {
      let cost = 0;
      const m = lanesAt(lane);
      const sightSecs = sk.sight / ws;
      for (const h of hazards()) {
        if (h.spent || !(h.t >= 0)) continue;
        if (!h.warned && h.t > sightSecs) continue; // not on screen yet, not called out
        const r = hzRoll(h);
        if (!r.read) continue;
        const tta = Math.max(0.05, h.t);
        const DEATH = 6000 / tta; // these end the run: worth far more than any 15 HP bump
        const ms = safeAt(lane);
        if (h.kind === 'COLLAPSE' && (m & h.lanes) && !(ms & (1 << h.safe))) cost += DEATH;
        else if (h.kind === 'BEAM' && (m & h.lanes) && !(ms & ~h.lanes & 7) && !r.ok) cost += DEATH;
        else if (h.kind === 'BEAM' && (m & h.lanes) && !(m & ~h.lanes & 7)) cost += 60;
        else if ((h.kind === 'WRONGWAY' && h.locked) || h.kind === 'LIGHTNING') { if (m & h.lanes) cost += DEATH; }
        else if (h.kind === 'EDGE' && lane * h.side > 0.3) cost += 400;
      }
      return cost;
    }

    const canPass = (b) => {
      if (b.type !== 'LOW_LASER_BAR' && b.type !== 'HIGH_LIGHT_GATE') return false;
      let r = rolls.get(b);
      if (r === undefined) { r = rand() < sk.pass; rolls.set(b, r); }
      return r;
    };

    function bodies() {
      const t = OT.traffic();
      return [t.traffic, t.obstacles, t.props.live, t.racers];
    }

    function think(playerZ) {
      const ws = Math.max(600, (G.speed / 88) * 11000 * 0.32);
      let best = target, bestCost = Infinity;
      const groups = bodies();
      const track = OT.track();
      for (const lane of LANES) {
        let cost = Math.abs(lane - G.playerX) * 30 + Math.abs(lane) * 8;
        for (const list of groups) {
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.takenDown) continue;
            const dz = b.worldZ - playerZ;
            if (dz < -150 || dz > sk.sight) continue;
            const reach = (b.halfW || 0.15) + PLAYER_HALF_W + 0.06;
            if (Math.abs(lane - b.offset) >= reach) continue;
            if (canPass(b)) { cost += 40; continue; }
            const tta = Math.max(0.05, dz / ws); // seconds until we reach it
            cost += (b.kind === 'TRAFFIC' || b.kind === 'RIVAL' ? 900 : 700) / tta;
          }
        }
        cost += hazardCost(lane, ws);
        const lowFuel = G.hz && G.hz.fuelOn && G.hz.fuel < 60;
        if (sk.greed > 0 || lowFuel) {
          const s0 = Math.floor(playerZ / SEG), s1 = Math.floor((playerZ + sk.sight * 0.8) / SEG);
          for (let s = s0; s <= s1; s++) {
            const seg = track.seg(s);
            if (!seg) continue;
            for (let k = 0; k < seg.items.length; k++) {
              const it = seg.items[k];
              if (it.collected || Math.abs(it.offset - lane) > 0.16) continue;
              cost -= it.type === 'PLUTONIUM' && lowFuel ? 60 * sk.read : sk.greed * (it.type === 'HW_COIN' ? 6 : 30);
            }
          }
        }
        if (lane === target) cost *= 0.85; // commit to a line
        if (cost < bestCost) { bestCost = cost; best = lane; }
      }
      target = best;
      noise = (rand() * 2 - 1) * sk.noise;
    }

    /** One sim step's worth of inputs (called before every updateGame). */
    return function step() {
      const playerZ = (G.trackPos || 0) + Z_OFF;
      if (lapseLeft > 0) lapseLeft -= dt;
      else if (rand() < sk.lapse * dt) lapseLeft = sk.lapseSecs;
      if ((thinkLeft -= dt) <= 0) { thinkLeft = sk.think; if (lapseLeft <= 0) think(playerZ); }

      const seg = OT.track().seg(Math.floor(playerZ / SEG));
      const curve = seg ? seg.curve * 0.11 * sk.curve : 0;
      const err = target + noise - G.playerX;
      const want = Math.max(-1.1, Math.min(1.1, err * sk.gain - G.playerVX * 0.5 + curve));
      if (lapseLeft <= 0) hands += (want - hands) * Math.min(1, dt / sk.tau); // a look-away freezes the hands
      I.wheelSteerVal = Math.abs(hands) <= 0.02 ? 0 : hands;

      // Jumps and slides: only for the bars and gates this bot has decided to clear.
      const ws = Math.max(600, (G.speed / 88) * 11000 * 0.32);
      let duck = playerZ < slideUntilZ;
      if (lapseLeft <= 0) {
        const obs = OT.traffic().obstacles;
        for (let i = 0; i < obs.length; i++) {
          const b = obs[i];
          const dz = b.worldZ - playerZ;
          if (dz < -100 || dz > ws * 0.7) continue;
          if (Math.abs(G.playerX - b.offset) >= (b.halfW || 0.2) + PLAYER_HALF_W) continue;
          if (!canPass(b)) continue;
          if (b.type === 'LOW_LASER_BAR' && dz - 250 < ws * 0.22 && G.playerY <= 0) I.hoverPressed = true;
          if (b.type === 'HIGH_LIGHT_GATE' && dz < ws * 0.5) { duck = true; slideUntilZ = b.worldZ + 300; }
        }
      }
      // Endless hazards (0186): jump the broken bridge, duck the low beam, wait for the train.
      let brake = false;
      if (lapseLeft <= 0) {
        for (const h of hazards()) {
          if (h.spent || !(h.t >= 0)) continue;
          const r = hzRoll(h);
          if (h.kind === 'BRIDGE' && G.playerY <= 0) {
            if (r.ok ? h.t > 0 && h.t <= 0.2 : r.jump && h.t <= r.early && h.t > r.early - 0.05) I.hoverPressed = true;
          } else if (h.kind === 'BEAM' && r.ok && h.t <= 0.5) {
            const m = lanesAt(G.playerX);
            if ((m & h.lanes) && !(m & ~h.lanes & 7)) duck = true;
          } else if (h.kind === 'TRAIN' && h.tOn != null && r.ok) {
            const rails = h.z0 + h.len / 2;
            const tRails = (rails - playerZ) / ws;
            if (rails + 150 > playerZ && tRails < 2.4 && G.raceTime + tRails < h.tOff + 0.15) brake = true;
          }
        }
      }
      I.down = duck || brake;

      const cool = !(G.hz && G.hz.on) || G.hz.heat < 55 + 25 * sk.pass; // eases off as the heat bar climbs
      if (sk.nos) I.nosHeld = !brake && cool && lapseLeft <= 0 && Math.abs(err) < 0.08 && G.hp > G.maxHp * 0.4;
      if (sk.warp && G.fluxCharge >= 95 && G.speed >= 86) I.boostPressed = true;
    };
  }

  window.__balanceBot = { createBot, SKILLS, mulberry32 };
})();
