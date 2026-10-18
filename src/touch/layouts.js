// Touch-control layouts (ticket 0061): six presets, per device class and orientation, plus the
// player's own edits from the HUD layout editor. Pure: every function maps an environment
// { vw, vh, safe, top } to plain positions, so unit tests can prove that no preset overlaps
// itself, the HUD band, or the screen edge on any viewport we ship to.
//
// Positions are control centres in CSS px; `d` is the diameter. Two areas are reserved and
// measured at runtime by the controller: `top`, the bottom of the HUD (full width), and `lane`,
// the box the floating messages and fork banners use ({ x0, x1, y1 }, from the HUD down).

export const ACTION_IDS = ['boost', 'drift', 'jump', 'special', 'accel', 'horn'];
export const SHORTCUT_IDS = ['pause', 'rear', 'camera', 'respawn'];
export const CONTROL_IDS = ['stick', ...ACTION_IDS, ...SHORTCUT_IDS];
export const MIN_TARGET = 44;

export { MOVEMENT_MODES } from './settings.js';

export const PRESETS = {
  default: { name: 'Default', movement: 'dynamic', blurb: 'Thumbstick appears where you touch. Big WARP button.' },
  roblox: { name: 'Roblox', movement: 'dynamic', blurb: 'Feels like Roblox: steer anywhere on the left, one big button.' },
  fortnite: { name: 'Fortnite', movement: 'floating', blurb: 'Floating joystick and a full button arc.' },
  lefty: { name: 'Left-handed', movement: 'dynamic', blurb: 'Buttons on the left, steering on the right.' },
  claw: { name: 'Claw', movement: 'floating', blurb: 'Index fingers on WARP and DRIFT up top.' },
  tablet: { name: 'Tablet', movement: 'floating', blurb: 'Bigger controls, raised to where tablet thumbs rest.' },
};
export const PRESET_IDS = Object.keys(PRESETS);

export function deviceClass(vw, vh) { return Math.min(vw, vh) >= 600 ? 'tablet' : 'phone'; }
export function orientationOf(vw, vh) { return vw > vh ? 'landscape' : 'portrait'; }
/** Storage key for the player's edits: one layout per device class and orientation. */
export function layoutKey(vw, vh) { return `${deviceClass(vw, vh)}-${orientationOf(vw, vh)}`; }

const MARGIN = 14;
const GAP = 10;
const SHORTCUT_D = 48;
const rad = (deg) => (deg * Math.PI) / 180;

function item(x, y, d, extra) {
  return Object.assign({ x: Math.round(x), y: Math.round(y), d: Math.max(MIN_TARGET, Math.round(d)), opacity: 1, hidden: false }, extra);
}

/**
 * A primary button in the corner with satellites on an arc. `side` is where the cluster sits;
 * angle 0 points toward the screen centre horizontally, 90 straight up.
 */
function cluster(out, env, side, cy, primaryId, p, sats, inset = 0) {
  const { vw, safe } = env;
  const cx = side === 'right' ? vw - safe.r - MARGIN - inset - p / 2 : safe.l + MARGIN + inset + p / 2;
  const inward = side === 'right' ? -1 : 1;
  out[primaryId] = item(cx, cy, p);
  for (const s of sats) {
    out[s.id] = item(cx + inward * s.r * Math.cos(rad(s.a)), cy - s.r * Math.sin(rad(s.a)), s.d);
  }
  return cx;
}

function stickHome(out, env, side, cy, d, inset = 0) {
  const { vw, safe } = env;
  const x = side === 'left' ? safe.l + MARGIN + inset + d / 2 : vw - safe.r - MARGIN - inset - d / 2;
  out.stick = item(x, cy, d);
}

/** Where the player's car sits on screen when centred (drawPlayerCar: 22% wide, 87% down). */
export function carZone(vw, vh) {
  const half = vw * 0.13;
  const bottom = vh * 0.87;
  return { x0: vw / 2 - half, x1: vw / 2 + half, y0: bottom - vw * 0.13 - 8, y1: bottom + 14 };
}

/**
 * Shortcuts go wherever there is free room, in a predictable order: stacked in a column above
 * the stick, then above the buttons, then along the bottom scanning outward from the middle,
 * never over the car. Greedy and collision-checked, so a shortcut can never land on another
 * control, the HUD or the message lane.
 */
function shortcuts(out, env, ids, side, u) {
  const { vw, vh, safe, top } = env;
  const d = Math.max(MIN_TARGET, Math.round(SHORTCUT_D * Math.min(u, 1.15)));
  const yBottom = vh - safe.b - MARGIN - d / 2;
  const yTop = top + GAP + d / 2;
  const xL = safe.l + MARGIN + d / 2;
  const xR = vw - safe.r - MARGIN - d / 2;
  const stickX = side === 'right' ? xL : xR;
  const btnX = side === 'right' ? xR : xL;
  const car = carZone(vw, vh);
  const landscape = orientationOf(vw, vh) === 'landscape';
  const half = Math.ceil(ids.length / 2);
  ids.forEach((id, i) => {
    const probe = item(0, 0, d);
    const tryAt = (x, y) => {
      probe.x = Math.round(x); probe.y = Math.round(y);
      if (probe.x < xL - 0.5 || probe.x > xR + 0.5 || probe.y < yTop - 0.5 || probe.y > yBottom + 0.5) return false;
      if (hitsLane(probe, env.lane, GAP)) return false;
      if (probe.x + d / 2 > car.x0 && probe.x - d / 2 < car.x1 && probe.y + d / 2 > car.y0 && probe.y - d / 2 < car.y1) return false;
      for (const k of Object.keys(out)) if (!out[k].hidden && overlaps(out[k], probe, GAP)) return false;
      out[id] = probe;
      return true;
    };
    const cols = landscape || i < half ? [stickX, btnX] : [btnX, stickX];
    for (const x of cols) {
      for (let y = yBottom; y >= yTop; y -= 4) if (tryAt(x, y)) return;
    }
    const mid = (vw - safe.r + safe.l) / 2;
    for (let y = yBottom; y >= yTop; y -= d + GAP) {
      for (let off = 0; off <= vw / 2; off += 4) if (tryAt(mid - off, y) || tryAt(mid + off, y)) return;
    }
    for (let y = yBottom; y >= yTop; y -= 8) for (let x = xL; x <= xR; x += 8) if (tryAt(x, y)) return;
    out[id] = Object.assign(probe, { x: Math.round(xR), y: Math.round(yTop), hidden: true });
  });
}

/** Top of the free band at column x: under the HUD, and under the message lane where it spans x. */
function freeTop(env, x, r) {
  const lane = env.lane;
  if (lane && x + r > lane.x0 - GAP && x - r < lane.x1 + GAP) return Math.max(env.top, lane.y1) + GAP;
  return env.top + GAP;
}

// Satellite arcs per preset (degrees; 0 = toward the screen centre, 90 = straight up).
const ARCS = {
  roblox: { portrait: [8, 38, 68, 98], landscape: [0, 28, 56, 84] },
  fortnite: { portrait: [0, 32, 64, 96], landscape: [0, 26, 52, 78] },
  default: { portrait: [0, 32, 64, 96], landscape: [0, 26, 52, 78] },
};

/**
 * `variant` trades the preferred shape for room: 0 = the preset's arc, 1 = a flatter, wider
 * arc, 2 = satellites in a row beside the primary (short landscape phones).
 */
function build(presetId, env, u, variant) {
  const { vw, vh, safe } = env;
  const out = {};
  const landscape = orientationOf(vw, vh) === 'landscape';
  const bottomCy = (d) => vh - safe.b - MARGIN - d / 2;
  const side = presetId === 'lefty' ? 'left' : 'right';
  const stickSide = side === 'right' ? 'left' : 'right';
  const S = 128 * u;

  if (presetId === 'claw') {
    // Index fingers: WARP top-right, DRIFT top-left. Right thumb: big JUMP + SPECIAL.
    const p = 84 * u;
    const topD = 72 * u;
    const bx = vw - safe.r - MARGIN - topD / 2;
    const dx = safe.l + MARGIN + topD / 2;
    out.boost = item(bx, freeTop(env, bx, topD / 2) + topD / 2, topD);
    out.drift = item(dx, freeTop(env, dx, topD / 2) + topD / 2, topD);
    // Short screens: the thumb controls move in beside the finger buttons instead of under them.
    const spare = bottomCy(p) - p / 2 - (out.boost.y + out.boost.d / 2) - GAP;
    const inset = spare < 0 || variant === 2 ? topD + GAP : 0;
    const sa = variant === 0 ? 50 : variant === 1 ? 30 : 0;
    cluster(out, env, 'right', bottomCy(p), 'jump', p, [
      { id: 'special', a: sa, r: p / 2 + 28 * u + GAP, d: 56 * u },
      { id: 'accel', a: 0, r: p / 2 + 28 * u + GAP + 56 * u + 32 * u + GAP, d: 64 * u },
    ], inset);
    if (sa === 0) out.accel = item(out.special.x - 28 * u - GAP - 32 * u, out.special.y, 64 * u);
    out.accel.hidden = !!env.autoAccel;
    const sSpare = bottomCy(S) - S / 2 - (out.drift.y + out.drift.d / 2) - GAP;
    stickHome(out, env, 'left', bottomCy(S), S, sSpare < 0 ? topD + GAP : 0);
    const extra = [];
    if (!out.accel.hidden && coversCar(out.accel, carZone(vw, vh))) { delete out.accel; extra.push('accel'); }
    shortcuts(out, env, [...extra, 'pause', 'horn', 'rear', 'camera', 'respawn'], 'right', u);
    return out;
  }

  const kind = ARCS[presetId] ? presetId : 'default';
  const p = (kind === 'roblox' ? 108 : kind === 'fortnite' ? 80 : 90) * u;
  const sd = (kind === 'default' ? 60 : 58) * u;
  // `horn` is the NOS button (ticket 0122; the id stays so saved layouts keep working).
  const ids = ['drift', 'horn', 'jump', 'special'];
  const sc = SHORTCUT_IDS;
  const pref = ARCS[kind][landscape ? 'landscape' : 'portrait'];
  const sats = ids.map((id, i) => ({ id, a: variant === 1 ? pref[i] * 0.6 : pref[i], d: id === 'horn' ? sd * 0.9 : sd }));

  if (variant === 3) {
    // Tall, narrow phones: the arc would sit on your own car, so each satellite (most-used
    // first) takes the free spot nearest the primary — up the screen edge, then beside it.
    let cy3 = bottomCy(p);
    const cx3 = cluster(out, env, side, cy3, 'boost', p, []);
    stickHome(out, env, stickSide, bottomCy(S), S);
    const car = carZone(vw, vh);
    const order = ['horn', 'drift', 'jump', 'special'];
    const inward = side === 'right' ? -1 : 1;
    for (const id of order) {
      const d = id === 'horn' ? sd * 0.9 : sd;
      let best = null, bestD = Infinity;
      const probe = item(0, 0, d);
      for (let a = -10; a <= 100; a += 5) {
        for (let r = p / 2 + d / 2 + GAP; r <= p / 2 + d / 2 + GAP + 4 * d; r += 6) {
          probe.x = Math.round(cx3 + inward * r * Math.cos(rad(a)));
          probe.y = Math.round(cy3 - r * Math.sin(rad(a)));
          if (r >= bestD) break;
          if (probe.x - d / 2 < safe.l + MARGIN - 0.5 || probe.x + d / 2 > vw - safe.r - MARGIN + 0.5) continue;
          if (probe.y + d / 2 > vh - safe.b - MARGIN + 0.5 || probe.y - d / 2 < env.top + GAP) continue;
          if (hitsLane(probe, env.lane, GAP) || coversCar(probe, car)) continue;
          let clash = false;
          for (const k of Object.keys(out)) if (!out[k].hidden && overlaps(out[k], probe, GAP)) { clash = true; break; }
          if (clash) continue;
          best = { x: probe.x, y: probe.y }; bestD = r;
        }
      }
      out[id] = best ? item(best.x, best.y, d) : item(cx3, env.top + d, d, { hidden: true });
    }
    out.accel = item(cx3, env.top + 32 * u, 64 * u, { hidden: true });
    if (!env.autoAccel) {
      // Gas sits beside the stick's home, toward the centre (never over the car).
      const st = out.stick;
      const gx = st.x - inward * (S / 2 + GAP + 32 * u);
      const ga = item(gx, st.y, 64 * u);
      if (!coversCar(ga, car)) out.accel = ga;
      else out.accel = item(st.x, st.y - S / 2 - GAP - 32 * u, 64 * u);
    }
    shortcuts(out, env, sc, side, u);
    return out;
  }

  if (variant === 2) {
    // A row toward the centre: primary, then each satellite beside the last.
    let r = p / 2 + GAP;
    for (const st of sats) { st.a = 0; st.r = r + st.d / 2; r += st.d + GAP; }
    sats.push({ id: 'accel', a: 0, r: r + 32 * u, d: 64 * u });
  } else {
    // One ring radius: far enough out that neighbours on the arc never touch.
    let ring = 0;
    for (let i = 0; i < sats.length; i++) {
      ring = Math.max(ring, p / 2 + sats[i].d / 2 + GAP);
      if (i > 0) {
        const da = rad(sats[i].a - sats[i - 1].a);
        ring = Math.max(ring, ((sats[i].d + sats[i - 1].d) / 2 + GAP) / (2 * Math.sin(da / 2)));
      }
    }
    for (const st of sats) st.r = ring;
    // Accelerate only appears when auto-accelerate is off: outside the arc, toward the centre.
    sats.push({ id: 'accel', a: landscape ? 18 : 30, r: ring + sd / 2 + 32 * u + GAP, d: 64 * u });
  }

  let cy = bottomCy(p);
  let stickCy = bottomCy(S);
  if (presetId === 'tablet' && variant === 0) {
    // Tablet grip: thumbs rest on the sides, well above the bottom bezel.
    cy = Math.min(bottomCy(p) - 24 * u, Math.max(env.top + 200 * u, vh * (landscape ? 0.66 : 0.74)));
    stickCy = cy;
  }
  cluster(out, env, side, cy, 'boost', p, sats);
  if (env.autoAccel) out.accel.hidden = true;
  stickHome(out, env, stickSide, stickCy, S);
  shortcuts(out, env, sc, side, u);
  return out;
}

/** Base size for a device: phones 1, tablets bigger; tiny phones a touch smaller. */
export function baseScale(env, presetId) {
  const m = Math.min(env.vw, env.vh);
  if (deviceClass(env.vw, env.vh) === 'tablet') return presetId === 'tablet' ? 1.35 : 1.22;
  return Math.max(0.85, Math.min(1, m / 390));
}

/**
 * A preset's layout for this screen. If the arc would reach into the HUD band (short landscape
 * phones), the whole layout shrinks until it fits, never below the 44 px touch-target floor.
 */
export function presetLayout(presetId, env) {
  const id = PRESETS[presetId] ? presetId : 'default';
  const u0 = baseScale(env, id) * (env.size || 1);
  let first = null, loose = null;
  // Claw is a finger grip with its own shape; every other preset can fall back to the
  // nearest-free-spot arc (variant 3) before it has to shrink.
  const variants = id === 'claw' ? 3 : 4;
  for (let u = u0, i = 0; i < 12; i++, u *= 0.94) {
    for (let v = 0; v < variants; v++) {
      const out = build(id, env, u, v);
      if (!first) first = out;
      if (fits(out, env)) {
        if (!carProblems(out, env).length) return out;
        if (!loose) loose = out;
      }
    }
  }
  return loose || first;
}

function fits(out, env) {
  if (layoutProblems(out, env).length) return false;
  for (const id of SHORTCUT_IDS) if (out[id].hidden) return false;
  for (const id of ['boost', 'drift', 'jump', 'special', 'horn']) if (out[id] && out[id].hidden) return false;
  return true;
}

function coversCar(it, car) {
  const r = it.d / 2;
  return it.x + r > car.x0 && it.x - r < car.x1 && it.y + r > car.y0 && it.y - r < car.y1;
}

/** Buttons drawn over the player's own car (the stick is an invisible zone until touched). */
export function carProblems(items, env) {
  const car = carZone(env.vw, env.vh);
  const out = [];
  for (const id of Object.keys(items)) {
    if (id === 'stick' || items[id].hidden) continue;
    if (coversCar(items[id], car)) out.push(`${id} covers the car`);
  }
  return out;
}

/** Applies the player's saved edits (fractions of the viewport, size scale, opacity, hidden). */
export function applyCustom(base, custom, env) {
  if (!custom || !custom.items) return base;
  const out = {};
  for (const id of Object.keys(base)) {
    const b = base[id];
    const c = custom.items[id];
    if (!c) { out[id] = b; continue; }
    const d = Math.round(Math.max(MIN_TARGET, b.d * clampNum(c.s, 0.6, 1.6, 1)));
    out[id] = item(
      clampNum(c.fx, 0, 1, b.x / env.vw) * env.vw,
      clampNum(c.fy, 0, 1, b.y / env.vh) * env.vh,
      d,
      { opacity: clampNum(c.o, 0.2, 1, 1), hidden: b.hidden || !!c.h },
    );
  }
  return out;
}

/** The inverse of applyCustom for one control: what the editor saves. */
export function toCustomItem(base, it, env) {
  return {
    fx: +(it.x / env.vw).toFixed(4),
    fy: +(it.y / env.vh).toFixed(4),
    s: +(it.d / base.d).toFixed(3),
    o: +it.opacity.toFixed(2),
    h: it.hidden && !base.hidden ? 1 : 0,
  };
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * Everything wrong with a layout on this screen: off-screen, inside the HUD band, below the
 * touch-target floor, or two controls overlapping. Empty means shippable.
 */
export function layoutProblems(items, env) {
  const { vw, vh, safe, top } = env;
  const out = [];
  const ids = Object.keys(items).filter((id) => !items[id].hidden);
  for (const id of ids) {
    const it = items[id];
    const r = it.d / 2;
    if (it.x - r < safe.l - 0.5 || it.x + r > vw - safe.r + 0.5 || it.y + r > vh - safe.b + 0.5) out.push(`${id} off screen`);
    if (it.y - r < top - 0.5 || hitsLane(it, env.lane)) out.push(`${id} in HUD band`);
    if (it.d < MIN_TARGET) out.push(`${id} smaller than ${MIN_TARGET}px`);
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (overlaps(items[ids[i]], items[ids[j]])) out.push(`${ids[i]} overlaps ${ids[j]}`);
    }
  }
  return out;
}

/** Circle vs. the message-lane box. */
export function hitsLane(it, lane, gap = 2) {
  if (!lane) return false;
  const r = it.d / 2 + gap;
  const nx = Math.max(lane.x0, Math.min(it.x, lane.x1));
  const ny = Math.min(it.y, lane.y1);
  return Math.hypot(it.x - nx, it.y - ny) < r && it.y - r < lane.y1;
}

export function overlaps(a, b, gap = 2) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.d / 2 + b.d / 2 + gap;
}
