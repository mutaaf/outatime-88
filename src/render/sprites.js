// Roadside items, obstacles, traffic and rivals, flying wrecks and the AR overlay of the 2D race
// (ticket 0015: carved out of main.js).
import { GameState } from '../state.js';
import { ROAD_CFG } from '../data.js';
import { PICKUPS } from '../pickups.js';
import { drawBoard, seen, noteSeen } from '../billboards.js';
import { drawRoadsideProp, drawHazardArt, drawEraProp, drawSoftShadow, queueTag, queueBlock, flushTags } from '../backdrop.js';
import { RS, LiveTraffic, live, carArt, pickupArt, hzArt } from '../main.js';
import { road } from './road.js';
import { thrustState } from './player.js';

let rivalThrust = null;
const drawMovers = [], moverSeg = [];
function pushAll(out, a) { for (let i = 0; i < a.length; i++) out.push(a[i]); }

/** Everything standing on the road, far to near: items, obstacles, then cars, with name tags. */
export function drawRoadside(ctx, rw, rh, eraCfg) {
  const visibleSegments = road.segs;
  // 3. Draw Scenery, Night-Street Smoke Flares, Collectibles & Rival/Police Cars
  // Every moving car's segment, worked out once per frame (it used to rebuild the list and
  // re-test every car on every visible segment: ~150 arrays and ~5k checks a frame; 0182).
  const allMovingCars = drawMovers;
  allMovingCars.length = 0;
  pushAll(allMovingCars, LiveTraffic.racers);
  pushAll(allMovingCars, LiveTraffic.traffic);
  pushAll(allMovingCars, live.ghosts);
  moverSeg.length = allMovingCars.length;
  seen.n = 0;
  // The rivals directly ahead of and behind you always keep their name tag (0238).
  const field = LiveTraffic.fieldEntries, me = GameState.racePosition - 1;
  const tagA = field[me - 1], tagB = field[me + 1];
  for (let m = 0; m < allMovingCars.length; m++) moverSeg[m] = allMovingCars[m].takenDown ? -1 : Math.floor(allMovingCars[m].worldZ / ROAD_CFG.segLength);
  for (let i = visibleSegments.length - 1; i >= 0; i--) {
    const seg = visibleSegments[i];
    if (hzArt && GameState.hz && GameState.hz.on) hzArt.seg(ctx, seg);
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
      } else if (item.type === 'BEST_GATE') {
        // Your best Endless run (ticket 0151): a cyan arch with YOUR BEST across it.
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = Math.max(3, roadW * 0.06);
        ctx.beginPath();
        ctx.arc(roadX, roadY, roadW * 1.08, Math.PI, 0);
        ctx.stroke();
        if (roadW > 24) {
          ctx.fillStyle = '#22d3ee';
          ctx.font = `900 ${Math.round(roadW * 0.2)}px Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('YOUR BEST', roadX, roadY - roadW * 0.86);
        }
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
          for (let sd = 0; sd < 2; sd++) {
            const side = sd ? 1.04 : -1.04;
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
          }
        }
      } else if (PICKUPS[item.type]) {
        // Crisp cached icon (src/pickup-art.js); a plain disc until the chunk lands.
        const size = Math.max(6, itemW * 0.95);
        const py = roadY - itemW * 0.72 + bobY;
        noteSeen(itemX - size / 2, py - size / 2, itemX + size / 2, py + size / 2);
        if (i < 20) queueBlock(itemX, py, size * 1.4, size * 1.4); // name tags keep off its icon, ring and most of its glow (0238)
        if (pickupArt) pickupArt.drawPickup(ctx, item.type, itemX, py, size, nowSec, item.phase || 0, GameState.reducedMotion);
        else { ctx.fillStyle = PICKUPS[item.type].color; ctx.beginPath(); ctx.arc(itemX, py, size * 0.4, 0, Math.PI * 2); ctx.fill(); }
      } else if ((item.type === 'STREET_LAMP' || item.type === 'PALM_TREE' || item.type === 'ARCH_HW') && drawRoadsideProp(ctx, item.type, itemX, roadY, itemW, itemH, roadW, rw, rh)) {
        // the era's own roadside (ticket 0101)
      } else if (item.type === 'STREET_LAMP') {
        const postH = itemH * 2.5;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(itemX - 1.5, roadY - postH, 3, postH);
      } else if (item.type === 'BILLBOARD' || item.type === 'CLOCK_TOWER_BILLBOARD') {
        // Ad slots and the era's own boards: crisp cached faces (src/billboards.js, docs/ADS.md)
        drawBoard(ctx, item, seg.index, itemX, roadY, roadW, rw, rh, eraCfg.id);
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
      noteSeen(ox - ow * 0.55, oy - oh * 1.7, ox + ow * 0.55, oy + oh * 0.5);

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
      } else if (ob.knockable) {
        // An era's signature prop (0113): its art is in the lazy stage chunk; a plain block until then.
        if (!drawEraProp(ctx, ob.type, ow, oh)) { ctx.fillStyle = '#94a3b8'; ctx.fillRect(-ow * 0.4, -oh * 0.7, ow * 0.8, oh * 1.1); }
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
    for (let m = 0; m < allMovingCars.length; m++) {
      if (moverSeg[m] !== seg.index) continue;
      const mv = allMovingCars[m];

      const cx = roadX + mv.offset * roadW;
      const mvLift = (((mv.y || 0) + (mv.suspY || 0)) / 180) * (roadW * 0.45);
      const roadYifted = roadY - mvLift;
      const isTruck = (mv.style === 'SEMI_TRUCK');
      const cw = Math.max(10, roadW * (isTruck ? 0.38 : 0.32));
      const ch = Math.max(6, cw * (isTruck ? 0.95 : 0.56));
      noteSeen(cx - cw * 0.6, roadYifted - cw * (isTruck ? 1.2 : 0.85), cx + cw * 0.6, roadYifted);

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
      } else if (carArt) {
        // (the sprite carries its own contact shadow)
      } else if (!drawSoftShadow(ctx, cx, roadY, cw * 1.1)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(cx - cw * 0.54, roadYifted - 2, cw * 1.08, 4);
      }

      if (carArt) {
        // Everyone in their own car: rivals and friends in their roster cars, traffic as
        // sedans, taxis, SUVs and semis, all painted by the same car painter (src/car-paint.js).
        const look = carArt.lookOf(mv);
        // Seen from the chase cam, a car turns with the road under it and with where it sits
        // across your view (one to your right shows you its left flank).
        const p2 = seg.p2.screen;
        const heading = p2 && p2.w > 0 ? Math.atan(((p2.x - rw * 0.5) / p2.w - (roadX - rw * 0.5) / Math.max(1, roadW)) * 2.2) : 0;
        const spin = mv.yaw ? Math.atan2(Math.sin(mv.yaw), Math.cos(mv.yaw)) : 0; // fishtail / spin-out, wrapped
        const yawApp = Math.max(-0.7, Math.min(0.7, spin + heading - Math.atan((cx - rw * 0.5) / (rw * 0.43)) * 0.4));
        if (!rivalThrust) rivalThrust = carArt.createThrust();
        carArt.drawNear(ctx, look, cx, roadYifted, Math.max(10, roadW * 0.32), { yaw: yawApp }, rivalThrust);
        if (mv.nosActive) {
          thrustState.nos = 1; thrustState.plume = 0; thrustState.hover = false;
          thrustState.t = RS.fxClock + m; thrustState.calm = GameState.reducedMotion;
          carArt.drawThrust(ctx, rivalThrust, thrustState);
        }
        if (GameState.status !== 'TITLE' && (mv.ghostTag || mv.short)) {
          queueTag(cx, roadY - ch * 1.3 - 6, roadW, mv.ghostTag || mv.short, mv.ghostTag ? (mv.cpu ? 0 : 1) : 2, mv.underglow, mv === tagA || mv === tagB);
        }
        continue;
      }

      // Placeholder for the first frames before the car painter (src/car-sprite.js) loads.
      ctx.fillStyle = isTruck ? '#cbd5e1' : (mv.bodyColor || '#334155');
      ctx.fillRect(cx - cw * 0.5, roadYifted - ch * (isTruck ? 1.15 : 0.9), cw, ch * (isTruck ? 1.15 : 0.7));
      ctx.fillStyle = '#ff1e1e';
      ctx.fillRect(cx - cw * 0.46, roadYifted - ch * 0.54, cw * 0.22, ch * 0.16);
      ctx.fillRect(cx + cw * 0.24, roadYifted - ch * 0.54, cw * 0.22, ch * 0.16);

      // Name tags (ticket 0101): queued here, laid out once after all cars so they never pile up.
      if (GameState.status !== 'TITLE' && (mv.ghostTag || mv.short)) {
        queueTag(cx, roadY - ch * 1.3 - 6, roadW, mv.ghostTag || mv.short, mv.ghostTag ? (mv.cpu ? 0 : 1) : 2, mv.underglow, mv === tagA || mv === tagB);
      }
    }
  }
  flushTags(ctx, rw, rh);
}

/** Wrecks in mid-air and the AR racing line, lock-on and pulse beam, over the road. */
export function drawOverRoad(ctx, rw, rh) {
  const visibleSegments = road.segs;
  // 4. Draw Flying Takedown Wrecks in Mid-Air!
  for (let i = 0; i < GameState.flyingWrecks.length; i++) {
    const w = GameState.flyingWrecks[i];
    ctx.save();
    ctx.translate(rw * 0.5 + w.x * (rw / 480), rh * 0.72 - w.y * (rh / 480));
    ctx.rotate(w.rot);
    if (carArt && w.look) carArt.drawCarAt(ctx, w.look, 0, 12, 44);
    else {
      ctx.fillStyle = w.color;
      ctx.fillRect(-22, -12, 44, 24);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-14, -6, 28, 12);
    }
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
}
