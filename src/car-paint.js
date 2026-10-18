// The car painter (workstream J): turns a body from src/car-shapes.js into a smooth, shaded
// vector car on a 2D canvas, from any angle. Used for the race sprites (cached per size and
// yaw by src/car-sprite.js), the garage turntable, lobby thumbnails and the share card.
//
// How it stays smooth: each body is a loft of rounded (superellipse) cross-sections, so its
// sides are many thin strips. Each strip is lit on its own (key light, sky reflection and a
// specular highlight), and neighbours differ only a little, so the shading reads as curved
// paint rather than flat blocks. The hull and cabin are convex, so back-face culling is all
// the sorting they need; wheels, the cabin and trim pieces are ordered by depth.
//
// Then the details a chase cam actually sees: tail lights that glow (brighter when braking),
// the number plate, diffuser, exhaust tips, glass with a reflection streak, real tyres with
// rims, dark wheel wells and a soft contact shadow. Exhaust tips are also returned as
// `anchors` so flames and plumes leave each car exactly where its pipes are.
//
// Pure canvas 2D: no DOM, no allocation per draw once a shape's geometry exists.
import { topOf } from './car-shapes.js';

const RING = 16;      // points per cross-section (over the top, side to side)
const WHEEL_N = 14;   // points around a tyre
const geoCache = new Map();

// Light rig, in view space (x right, y up, z toward the camera).
const L = norm3(-0.38, 0.78, 0.5);
const Hh = norm3(L[0], L[1], L[2] + 1);

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const rgbMemo = new Map();
function rgbOf(hex) {
  let v = rgbMemo.get(hex);
  if (!v) {
    const s = typeof hex === 'string' && hex[0] === '#' ? hex.slice(1) : '94a3b8';
    const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padEnd(6, '0').slice(0, 6);
    const n = parseInt(full, 16) || 0;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbMemo.set(hex, v);
  }
  return v;
}
const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const rgb = (r, g, b) => `rgb(${c255(r)},${c255(g)},${c255(b)})`;

// ---------------------------------------------------------------------------------------
// Geometry (built once per shape, then only projected).

function face(pts, kind, extra) {
  const n = pts.length / 3;
  return Object.assign({ p: pts, n, kind, nx: 0, ny: 0, nz: 0, cx: 0, cy: 0, cz: 0, sx: new Float64Array(n), sy: new Float64Array(n), vis: false, vz: 0 }, extra);
}

/** Newell normal + centroid, oriented away from the part's centre (parts are convex). */
function finishFaces(faces, ox, oy, oz) {
  for (const f of faces) {
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < f.n; i++) {
      const j = (i + 1) % f.n;
      const x0 = f.p[i * 3], y0 = f.p[i * 3 + 1], z0 = f.p[i * 3 + 2];
      const x1 = f.p[j * 3], y1 = f.p[j * 3 + 1], z1 = f.p[j * 3 + 2];
      nx += (y0 - y1) * (z0 + z1); ny += (z0 - z1) * (x0 + x1); nz += (x0 - x1) * (y0 + y1);
      cx += x0; cy += y0; cz += z0;
    }
    cx /= f.n; cy /= f.n; cz /= f.n;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (nx * (cx - ox) + ny * (cy - oy) + nz * (cz - oz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    f.nx = nx; f.ny = ny; f.nz = nz; f.cx = cx; f.cy = cy; f.cz = cz;
  }
  return faces;
}

/** A rounded cross-section from (−a, y0) over the top to (a, y0): RING + 1 points. */
function ringPts(a, y0, y1, n) {
  const xs = new Float64Array(RING + 1), ys = new Float64Array(RING + 1);
  for (let k = 0; k <= RING; k++) {
    const th = Math.PI * (1 - k / RING);
    const c = Math.cos(th), s = Math.sin(th);
    xs[k] = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    ys[k] = y0 + (y1 - y0) * Math.pow(Math.abs(s), 2 / n);
  }
  return { xs, ys };
}

/** Strips between consecutive sections plus the two end caps. */
function loft(secs, n, kindOf, capKind) {
  const rings = secs.map((s) => Object.assign(ringPts(s.a, s.y0, s.y1, n), { z: s.z }));
  const faces = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < RING; k++) {
      faces.push(face([A.xs[k], A.ys[k], A.z, A.xs[k + 1], A.ys[k + 1], A.z, B.xs[k + 1], B.ys[k + 1], B.z, B.xs[k], B.ys[k], B.z], kindOf(i, k), { seg: i, k }));
    }
  }
  const cap = (R, kind) => {
    const p = [];
    for (let k = 0; k <= RING; k++) p.push(R.xs[k], R.ys[k], R.z);
    return face(p, kind, { cap: true });
  };
  faces.push(cap(rings[0], capKind || 'rear'), cap(rings[rings.length - 1], capKind || 'front'));
  let oy = 0, oz = 0;
  for (const s of secs) { oy += (s.y0 + s.y1) / 2; oz += s.z; }
  return finishFaces(faces, 0, oy / secs.length, oz / secs.length);
}

/** An axis-aligned box as 6 faces (a convex trim part). */
function boxPart(x0, x1, y0, y1, z0, z1, kind) {
  const v = (x, y, z) => [x, y, z];
  const q = (a, b, c, d) => face([...a, ...b, ...c, ...d], kind);
  const p000 = v(x0, y0, z0), p100 = v(x1, y0, z0), p110 = v(x1, y1, z0), p010 = v(x0, y1, z0);
  const p001 = v(x0, y0, z1), p101 = v(x1, y0, z1), p111 = v(x1, y1, z1), p011 = v(x0, y1, z1);
  const faces = [q(p000, p100, p110, p010), q(p001, p011, p111, p101), q(p000, p010, p011, p001), q(p100, p101, p111, p110), q(p010, p110, p111, p011), q(p000, p001, p101, p100)];
  return finishFaces(faces, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

export function geometryFor(S) {
  let g = geoCache.get(S);
  if (g) return g;
  const hx = S.W / 2, hz = S.L / 2, y0 = S.hull[0], y1 = S.hull[1], h = y1 - y0, nd = S.nose || 0;
  const n = S.round || 5;
  const truck = S.extras.includes('truck');
  const bev = Math.min(0.2, S.L * 0.05);
  const hullSecs = truck
    ? [{ z: -hz, a: hx * 0.995, y0, y1: y1 - 0.02 }, { z: -hz + 0.06, a: hx, y0, y1 }, { z: hz, a: hx, y0, y1 }]
    : [
      { z: -hz, a: hx * 0.93, y0: y0 + 0.05, y1: y1 - 0.06 },
      { z: -hz + bev, a: hx, y0, y1 },
      { z: hz * 0.3, a: hx, y0, y1: y1 - h * nd * 0.18 },
      { z: hz - Math.min(0.4, S.L * 0.09), a: hx * 0.97, y0, y1: Math.max(y0 + 0.14, y1 - h * nd * 0.72) },
      { z: hz, a: hx * 0.86, y0: y0 + 0.05, y1: Math.max(y0 + 0.12, y1 - h * nd * 0.95 - 0.03) },
    ];
  const hull = loft(hullSecs, n, () => 'paint');
  const under = truck ? [] : loft([
    { z: -hz + 0.3, a: hx * 0.84, y0: 0.13, y1: y0 + 0.03 },
    { z: hz - 0.3, a: hx * 0.84, y0: 0.13, y1: y0 + 0.03 },
  ], 8, () => 'dark', 'dark');

  let cabin = [];
  if (S.cab) {
    const [c0, c1, base, top, rake] = S.cab;
    const len = c1 - c0;
    const rr = Math.max(0.05, Math.min(len * 0.32, rake * 1.5));
    const rf = Math.max(0.05, Math.min(len * 0.42, rake * 2.3));
    const ac = hx * (S.cycle ? 0.9 : 0.84);
    const secs = [
      { z: c0, a: ac * 0.94, y0: base, y1: base + 0.03 },
      { z: c0 + rr, a: ac, y0: base, y1: top },
      { z: c1 - rf, a: ac, y0: base, y1: top },
      { z: c1, a: ac * 0.94, y0: base, y1: base + 0.03 },
    ];
    const edge = (k) => k < 2 || k >= RING - 2;
    cabin = loft(secs, S.van ? 7 : 3.2, (seg, k) => {
      if (seg === 1) return 'cabside';         // sides and roof: glass below, roof on top
      if (S.van && seg === 0) return 'paint';  // a van's back doors
      return edge(k) ? 'pillar' : 'glass';
    });
    for (const f of cabin) {
      if (f.kind === 'cabside') f.kind = f.ny > 0.8 ? 'roof' : (S.van && f.cy < base + (top - base) * 0.38 ? 'paint' : 'glass');
      else if (f.kind === 'glass' && f.ny > 0.93) f.kind = 'roof';
      else if (f.cap) f.kind = 'roof';
    }
  }

  const trims = [];
  for (const e of S.extras) {
    if (e === 'wing') {
      trims.push(boxPart(-hx * 0.96, hx * 0.96, y1 + 0.32, y1 + 0.4, -hz + 0.04, -hz + 0.46, 'paint'));
      for (const sx of [-1, 1]) trims.push(boxPart(sx * hx * 0.55 - 0.04, sx * hx * 0.55 + 0.04, y1 - 0.02, y1 + 0.33, -hz + 0.16, -hz + 0.3, 'dark'));
    } else if (e === 'fin') {
      trims.push(boxPart(-0.05, 0.05, y1 - 0.02, y1 + 0.52, -hz + 0.1, -hz + 0.72, 'paint'));
    } else if (e === 'scoop') {
      trims.push(boxPart(-hx * 0.3, hx * 0.3, y1 - 0.02, y1 + 0.16, 0.7, 1.45, 'dark'));
    } else if (e === 'taxi') {
      trims.push(boxPart(-0.32, 0.32, S.cab[3] - 0.02, S.cab[3] + 0.22, -0.32, 0.12, 'sign'));
    }
  }

  // Wheels: centre (y = r), axle positions along z, which side (−1 / +1; 0 for a light-cycle).
  const r = S.r || (S.cycle ? 0.4 : 0.36);
  const tw = S.cycle ? 0.2 : truck ? 0.3 : 0.3;
  const axles = S.axles || (S.cycle ? [hz - 0.45, -hz + 0.45] : [hz - 0.85, -hz + 0.85]);
  const wheels = [];
  for (const z of axles) {
    if (S.cycle) { wheels.push(wheelGeo(0, r, z, r, tw, 0)); continue; }
    for (const side of [-1, 1]) {
      wheels.push(wheelGeo(side * (hx * 0.985 - tw / 2), r, z, r, tw, side));
      if (S.dual) wheels.push(wheelGeo(side * (hx * 0.985 - tw * 1.55), r, z, r, tw, side, true));
    }
  }
  g = { S, hx, hz, hull, under, cabin, trims, wheels, r, top: topOf(S) };
  geoCache.set(S, g);
  return g;
}

function wheelGeo(x, y, z, r, w, side, inner) {
  const xo = x + (side >= 0 ? w / 2 : -w / 2), xi = x - (side >= 0 ? w / 2 : -w / 2);
  const ring = (xx, rr) => {
    const p = [];
    for (let j = 0; j < WHEEL_N; j++) { const a = (j / WHEEL_N) * Math.PI * 2; p.push(xx, y + rr * Math.cos(a), z + rr * Math.sin(a)); }
    return p;
  };
  const tread = [];
  for (let j = 0; j < WHEEL_N; j++) {
    const a0 = (j / WHEEL_N) * Math.PI * 2, a1 = ((j + 1) / WHEEL_N) * Math.PI * 2;
    tread.push(face([xo, y + r * Math.cos(a0), z + r * Math.sin(a0), xo, y + r * Math.cos(a1), z + r * Math.sin(a1),
      xi, y + r * Math.cos(a1), z + r * Math.sin(a1), xi, y + r * Math.cos(a0), z + r * Math.sin(a0)], 'rubber'));
  }
  finishFaces(tread, x, y, z);
  const outer = finishFaces([face(ring(xo, r), 'tyreface')], x, y, z)[0];
  const innerF = finishFaces([face(ring(xi, r), 'tyreface')], x, y, z)[0];
  const rim = face(ring(xo + (side >= 0 ? 0.004 : -0.004), r * 0.64), 'rim');
  const rimIn = face(ring(xi + (side >= 0 ? -0.004 : 0.004), r * 0.64), 'rim');
  const well = [];
  if (side !== 0 && !inner) {
    // The dark arch over the tyre, on the body side.
    const xs = side * (Math.abs(x) + w / 2 + 0.006);
    for (let j = 0; j <= 10; j++) { const a = -Math.PI / 2 - 0.25 + (j / 10) * (Math.PI + 0.5); well.push(xs, y + r * 1.16 * Math.cos(a), z + r * 1.16 * Math.sin(a)); }
  }
  return { x, y, z, r, w, side, inner: Boolean(inner), tread, outer, innerF, rim, rimIn, well: well.length ? face(well, 'well') : null };
}

// ---------------------------------------------------------------------------------------
// Projection and shading.

const V = { cx: 0, cy: 0, scale: 1, cyaw: 1, syaw: 0, cp: 1, sp: 0, cam: 9 };
let PX = 0, PY = 0, PZ = 0;
function proj(x, y, z) {
  const X = x * V.cyaw + z * V.syaw;
  const Z0 = -x * V.syaw + z * V.cyaw;
  const Y = y * V.cp - Z0 * V.sp;
  const Z = y * V.sp + Z0 * V.cp;
  const d = V.cam / (V.cam - Z);
  PX = V.cx + X * V.scale * d; PY = V.cy - Y * V.scale * d; PZ = Z;
}
/** View-space normal of a car-space direction (written to N). */
const N = [0, 0, 0];
function rotN(nx, ny, nz) {
  const x = nx * V.cyaw + nz * V.syaw;
  const z0 = -nx * V.syaw + nz * V.cyaw;
  N[0] = x; N[1] = ny * V.cp - z0 * V.sp; N[2] = ny * V.sp + z0 * V.cp;
}

/** Projects a face; returns true if it faces the camera. */
function prep(f) {
  let vz = 0;
  for (let i = 0; i < f.n; i++) { proj(f.p[i * 3], f.p[i * 3 + 1], f.p[i * 3 + 2]); f.sx[i] = PX; f.sy[i] = PY; vz += PZ; }
  f.vz = vz / f.n;
  rotN(f.nx, f.ny, f.nz);
  // Toward the camera from the face's centre, in view space.
  const X = f.cx * V.cyaw + f.cz * V.syaw, Z0 = -f.cx * V.syaw + f.cz * V.cyaw;
  const Y = f.cy * V.cp - Z0 * V.sp, Z = f.cy * V.sp + Z0 * V.cp;
  f.vis = N[0] * -X + N[1] * -Y + N[2] * (V.cam - Z) > 1e-4;
  return f.vis;
}

const SKY = [120, 150, 210];
let LOCKED = false;
/** Lit colour for the last rotN() normal. */
function lit(kind, base) {
  const d = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
  const s = Math.pow(Math.max(0, N[0] * Hh[0] + N[1] * Hh[1] + N[2] * Hh[2]), 40);
  const up = Math.max(0, N[1]);
  if (LOCKED) { const k = 0.45 + 0.7 * d; return rgb(42 * k, 37 * k, 80 * k); }
  switch (kind) {
    case 'glass': return `rgba(${c255(14 * (0.6 + 0.6 * d) + 110 * (0.45 * up + 0.1) + 255 * 0.6 * s)},${c255(20 * (0.6 + 0.6 * d) + 140 * (0.45 * up + 0.1) + 255 * 0.6 * s)},${c255(36 * (0.6 + 0.6 * d) + 190 * (0.45 * up + 0.1) + 255 * 0.6 * s)},0.96)`;
    case 'dark': return rgb(16 * (0.5 + 0.7 * d) + 40 * s, 18 * (0.5 + 0.7 * d) + 40 * s, 23 * (0.5 + 0.7 * d) + 40 * s);
    case 'rubber': case 'tyreface': return rgb(20 * (0.45 + 0.75 * d) + 35 * s, 21 * (0.45 + 0.75 * d) + 35 * s, 26 * (0.45 + 0.75 * d) + 35 * s);
    case 'rim': return rgb(178 * (0.45 + 0.65 * d) + 255 * 0.5 * s, 184 * (0.45 + 0.65 * d) + 255 * 0.5 * s, 196 * (0.45 + 0.65 * d) + 255 * 0.5 * s);
    case 'sign': return rgb(255 * (0.55 + 0.5 * d), 214 * (0.55 + 0.5 * d), 64 * (0.55 + 0.5 * d));
    default: {
      const k = 0.34 + 0.78 * d;
      return rgb(base[0] * k + 255 * 0.55 * s + SKY[0] * 0.1 * up, base[1] * k + 255 * 0.55 * s + SKY[1] * 0.1 * up, base[2] * k + 255 * 0.55 * s + SKY[2] * 0.1 * up);
    }
  }
}

function pathOf(ctx, f) {
  ctx.moveTo(f.sx[0], f.sy[0]);
  for (let i = 1; i < f.n; i++) ctx.lineTo(f.sx[i], f.sy[i]);
  ctx.closePath();
}

function fillFace(ctx, f, fill, seam) {
  ctx.beginPath();
  pathOf(ctx, f);
  ctx.fillStyle = fill;
  ctx.fill();
  if (seam) { ctx.strokeStyle = fill; ctx.lineWidth = seam; ctx.stroke(); }
}

const baseFor = (kind, body, cabin) => (kind === 'roof' || kind === 'pillar' ? cabin : body);

function drawFaces(ctx, faces, body, cabin, seam) {
  for (const f of faces) {
    if (!prep(f)) continue;
    if (f.kind === 'rear' || f.kind === 'front') {
      // Big flat end panels get a top-lit gradient so they read as curved paint.
      const fill = lit('paint', body);
      let top = Infinity, bot = -Infinity;
      for (let i = 0; i < f.n; i++) { if (f.sy[i] < top) top = f.sy[i]; if (f.sy[i] > bot) bot = f.sy[i]; }
      const g = ctxGrad(ctx, top, bot, fill);
      fillFace(ctx, f, g, 0);
      continue;
    }
    fillFace(ctx, f, lit(f.kind, baseFor(f.kind, body, cabin)), seam);
  }
}

function ctxGrad(ctx, top, bot, mid) {
  if (!(bot > top) || LOCKED) return mid;
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, tint(mid, 1.22));
  g.addColorStop(0.16, tint(mid, 1.06));
  g.addColorStop(0.55, mid);
  g.addColorStop(1, tint(mid, 0.6));
  return g;
}

function tint(rgbStr, k) {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgbStr);
  if (!m) return rgbStr;
  return rgb(+m[1] * k + (k > 1 ? 18 * (k - 1) * 4 : 0), +m[2] * k + (k > 1 ? 18 * (k - 1) * 4 : 0), +m[3] * k + (k > 1 ? 18 * (k - 1) * 4 : 0));
}

// ---------------------------------------------------------------------------------------
// Details on the end panels (drawn clipped to the panel, so nothing pokes out).

/** Path of a quad in the plane z = zp. */
function quadPath(ctx, x0, x1, y0, y1, zp) {
  proj(x0, y0, zp); ctx.moveTo(PX, PY);
  proj(x1, y0, zp); ctx.lineTo(PX, PY);
  proj(x1, y1, zp); ctx.lineTo(PX, PY);
  proj(x0, y1, zp); ctx.lineTo(PX, PY);
  ctx.closePath();
}
function discPath(ctx, x, y, r, zp) {
  for (let j = 0; j < 14; j++) {
    const a = (j / 14) * Math.PI * 2;
    proj(x + Math.cos(a) * r, y + Math.sin(a) * r, zp);
    if (j === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY);
  }
  ctx.closePath();
}

function lamp(ctx, build, brake, scale, color) {
  ctx.save();
  ctx.shadowColor = color || (brake ? 'rgba(255,70,80,1)' : 'rgba(255,24,48,0.8)');
  ctx.shadowBlur = Math.max(1, scale * (brake ? 0.26 : 0.1));
  ctx.fillStyle = color || (brake ? '#ff4552' : '#d3121f');
  ctx.beginPath(); build(); ctx.fill();
  ctx.restore();
  // A lens highlight across the top.
  ctx.save();
  ctx.globalAlpha = brake ? 0.55 : 0.32;
  ctx.fillStyle = '#ffd5d8';
  ctx.beginPath(); build(true); ctx.fill();
  ctx.restore();
}

function rearDetails(ctx, G, f, o, anchors) {
  const S = G.S, scale = V.scale;
  const zp = -G.hz - 0.004;
  const truck = S.extras.includes('truck');
  const a = G.hx * (truck ? 0.995 : 0.93);
  const ry0 = S.hull[0] + (truck ? 0 : 0.05), ry1 = S.hull[1] - (truck ? 0.02 : 0.06), rh = ry1 - ry0;
  const brake = Boolean(o.brake);
  ctx.save();
  ctx.beginPath(); pathOf(ctx, f); ctx.clip();
  if (truck) {
    // Two big doors: seam, lock bars, ribs, and the clearance lights up top.
    ctx.strokeStyle = 'rgba(15,23,42,0.55)';
    ctx.lineWidth = Math.max(1, scale * 0.03);
    ctx.beginPath(); proj(0, ry0, zp); ctx.moveTo(PX, PY); proj(0, ry1, zp); ctx.lineTo(PX, PY); ctx.stroke();
    ctx.strokeStyle = 'rgba(203,213,225,0.9)';
    ctx.lineWidth = Math.max(1, scale * 0.045);
    for (const x of [-0.95, -0.35, 0.35, 0.95]) { ctx.beginPath(); proj(x, ry0 + 0.15, zp); ctx.moveTo(PX, PY); proj(x, ry1 - 0.2, zp); ctx.lineTo(PX, PY); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(15,23,42,0.25)';
    ctx.lineWidth = Math.max(1, scale * 0.02);
    for (let k = 1; k < 6; k++) { const y = ry0 + (rh * k) / 6; ctx.beginPath(); proj(-a, y, zp); ctx.moveTo(PX, PY); proj(a, y, zp); ctx.lineTo(PX, PY); ctx.stroke(); }
    for (const x of [-a + 0.15, a - 0.15]) lamp(ctx, () => discPath(ctx, x, ry1 - 0.12, 0.07, zp), false, scale, '#f59e0b');
    for (const sx of [-1, 1]) lamp(ctx, (hi) => quadPath(ctx, sx * (a - 0.42), sx * (a - 0.08), ry0 + 0.08 + (hi ? 0.1 : 0), ry0 + 0.24, zp), brake, scale);
    ctx.restore();
    return;
  }
  // Crease highlight under the deck lid.
  ctx.strokeStyle = LOCKED ? 'rgba(148,163,184,0.2)' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = Math.max(1, scale * 0.014);
  ctx.beginPath(); proj(-a * 0.95, ry1 - rh * 0.08, zp); ctx.moveTo(PX, PY); proj(a * 0.95, ry1 - rh * 0.08, zp); ctx.lineTo(PX, PY); ctx.stroke();
  if (LOCKED) { ctx.restore(); return; }
  // Diffuser.
  const dh = Math.min(0.12, rh * 0.22);
  ctx.fillStyle = '#0a0b0f';
  ctx.beginPath(); quadPath(ctx, -a, a, ry0 - 0.06, ry0 + dh, zp); ctx.fill();
  ctx.strokeStyle = '#2a2e38';
  ctx.lineWidth = Math.max(1, scale * 0.012);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) { ctx.beginPath(); proj(x * a, ry0 - 0.04, zp); ctx.moveTo(PX, PY); proj(x * a, ry0 + dh, zp); ctx.lineTo(PX, PY); ctx.stroke(); }
  if (S.extras.includes('diffuserGlow')) {
    ctx.save();
    ctx.strokeStyle = '#7df9ff'; ctx.shadowColor = '#38e8ff'; ctx.shadowBlur = Math.max(1, scale * 0.12);
    ctx.lineWidth = Math.max(1, scale * 0.02);
    ctx.beginPath(); proj(-a * 0.8, ry0 + dh, zp); ctx.moveTo(PX, PY); proj(a * 0.8, ry0 + dh, zp); ctx.lineTo(PX, PY); ctx.stroke();
    ctx.restore();
  }
  // Number plate (blank: no text, no names).
  const pw = Math.min(0.27, a * 0.32), pv = ry0 + dh + Math.max(0.03, rh * 0.06);
  ctx.fillStyle = '#e7e9ee';
  ctx.beginPath(); quadPath(ctx, -pw, pw, pv, pv + 0.115, zp); ctx.fill();
  ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(1, scale * 0.01); ctx.stroke();
  ctx.fillStyle = 'rgba(30,41,59,0.75)';
  ctx.beginPath(); quadPath(ctx, -pw * 0.7, -pw * 0.12, pv + 0.035, pv + 0.08, zp); quadPath(ctx, pw * 0.08, pw * 0.7, pv + 0.035, pv + 0.08, zp); ctx.fill();
  // Tail lights.
  const lv = (k) => ry0 + rh * k;
  switch (S.lights) {
    case 'bar':
      ctx.fillStyle = '#1a0306';
      ctx.beginPath(); quadPath(ctx, -a * 0.94, a * 0.94, lv(0.6), lv(0.76), zp); ctx.fill();
      lamp(ctx, (hi) => quadPath(ctx, -a * 0.9, a * 0.9, hi ? lv(0.7) : lv(0.63), lv(0.73), zp), brake, scale);
      break;
    case 'twin':
      for (const x of [-0.74, -0.46, 0.46, 0.74]) lamp(ctx, (hi) => discPath(ctx, x * a, lv(0.62), hi ? 0.04 : 0.085, zp), brake, scale);
      break;
    case 'quad':
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#1a0306';
        ctx.beginPath(); quadPath(ctx, sx * a * 0.4, sx * a * 0.92, lv(0.5), lv(0.74), zp); ctx.fill();
        for (const k of [0, 1]) {
          const u0 = 0.44 + k * 0.25, u1 = u0 + 0.21;
          lamp(ctx, (hi) => quadPath(ctx, sx * a * u0, sx * a * u1, hi ? lv(0.65) : lv(0.53), lv(0.71), zp), brake, scale);
        }
      }
      break;
    case 'slats':
      for (const sx of [-1, 1]) {
        lamp(ctx, (hi) => quadPath(ctx, sx * a * 0.36, sx * a * 0.9, hi ? lv(0.66) : lv(0.5), lv(0.74), zp), brake, scale);
        ctx.strokeStyle = 'rgba(10,10,14,0.85)';
        ctx.lineWidth = Math.max(1, scale * 0.012);
        for (const k of [0.56, 0.62, 0.68]) { ctx.beginPath(); proj(sx * a * 0.36, lv(k), zp); ctx.moveTo(PX, PY); proj(sx * a * 0.9, lv(k), zp); ctx.lineTo(PX, PY); ctx.stroke(); }
      }
      break;
    case 'vert':
      for (const sx of [-1, 1]) lamp(ctx, (hi) => quadPath(ctx, sx * a * 0.8, sx * a * (hi ? 0.86 : 0.97), lv(0.25), lv(0.9), zp), brake, scale);
      break;
    case 'cycle':
      lamp(ctx, (hi) => quadPath(ctx, -a * 0.5, a * 0.5, hi ? lv(0.74) : lv(0.62), lv(0.8), zp), brake, scale);
      break;
    default: // sedan
      for (const sx of [-1, 1]) lamp(ctx, (hi) => quadPath(ctx, sx * a * 0.5, sx * a * 0.92, hi ? lv(0.66) : lv(0.52), lv(0.74), zp), brake, scale);
  }
  if (S.van) {
    ctx.strokeStyle = 'rgba(10,12,18,0.6)'; ctx.lineWidth = Math.max(1, scale * 0.016);
    ctx.beginPath(); proj(0, ry0 + 0.06, zp); ctx.moveTo(PX, PY); proj(0, ry1, zp); ctx.lineTo(PX, PY); ctx.stroke();
  }
  // Exhaust tips (and where the flames come out).
  for (let i = 0; i < S.exhaust.length; i++) {
    const [x, y, r] = S.exhaust[i];
    if (S.thrust === 'jet') {
      ctx.fillStyle = '#9aa3b2'; ctx.beginPath(); discPath(ctx, x, y, r * 1.15, zp); ctx.fill();
      ctx.fillStyle = '#2b3140'; ctx.beginPath(); discPath(ctx, x, y, r * 0.92, zp); ctx.fill();
      ctx.fillStyle = 'rgba(255,140,60,0.55)'; ctx.beginPath(); discPath(ctx, x, y, r * 0.5, zp); ctx.fill();
    } else if (S.thrust === 'cold') {
      ctx.fillStyle = '#4b5563'; ctx.beginPath(); discPath(ctx, x, y, r, zp); ctx.fill();
      ctx.fillStyle = '#05060a'; ctx.beginPath(); discPath(ctx, x, y, r * 0.55, zp); ctx.fill();
    } else {
      ctx.fillStyle = '#d6dbe3'; ctx.beginPath(); discPath(ctx, x, y, r, zp); ctx.fill();
      ctx.fillStyle = '#05060a'; ctx.beginPath(); discPath(ctx, x, y, r * 0.68, zp); ctx.fill();
    }
    if (anchors && anchors.n < anchors.x.length) {
      proj(x, y, zp);
      const cx = PX, cy = PY;
      proj(x + r, y, zp);
      anchors.x[anchors.n] = cx; anchors.y[anchors.n] = cy; anchors.r[anchors.n] = Math.max(0.5, Math.abs(PX - cx)); anchors.n++;
    }
  }
  ctx.restore();
}

function frontDetails(ctx, G, f) {
  const S = G.S, scale = V.scale;
  if (LOCKED || S.extras.includes('truck')) return;
  const zp = G.hz + 0.004;
  const a = G.hx * 0.86;
  const fy0 = S.hull[0] + 0.05, fy1 = Math.max(fy0 + 0.12, S.hull[1] - (S.hull[1] - S.hull[0]) * (S.nose || 0) * 0.95 - 0.03), fh = fy1 - fy0;
  ctx.save();
  ctx.beginPath(); pathOf(ctx, f); ctx.clip();
  ctx.fillStyle = '#0b0d12';
  ctx.beginPath(); quadPath(ctx, -a * 0.42, a * 0.42, fy0 + fh * 0.12, fy0 + fh * 0.48, zp); ctx.fill();
  for (const sx of [-1, 1]) lamp(ctx, (hi) => quadPath(ctx, sx * a * 0.52, sx * a * (hi ? 0.7 : 0.9), fy0 + fh * (hi ? 0.66 : 0.55), fy0 + fh * 0.78, zp), false, scale, '#fff4cf');
  if (S.extras.includes('scanner')) lamp(ctx, () => quadPath(ctx, -a * 0.3, a * 0.3, fy0 + fh * 0.5, fy0 + fh * 0.6, zp), false, scale, '#ff2030');
  ctx.restore();
}

// ---------------------------------------------------------------------------------------
// Wheels.

function drawWheel(ctx, w, withWell) {
  if (withWell && w.well) { prep(w.well); ctx.beginPath(); pathOf(ctx, w.well); ctx.fillStyle = '#050608'; ctx.fill(); }
  for (const t of w.tread) if (prep(t)) fillFace(ctx, t, lit('rubber'), 0.6);
  for (const [face, rimF] of [[w.outer, w.rim], [w.innerF, w.rimIn]]) {
    if (!prep(face)) continue;
    rotN(face.nx, face.ny, face.nz);
    fillFace(ctx, face, lit('tyreface'), 0);
    if (w.inner) continue;
    prep(rimF);
    rotN(face.nx, face.ny, face.nz);
    fillFace(ctx, rimF, LOCKED ? '#334155' : lit('rim'), 0);
    // Five spokes and a hub.
    let cx = 0, cy = 0;
    for (let i = 0; i < rimF.n; i++) { cx += rimF.sx[i]; cy += rimF.sy[i]; }
    cx /= rimF.n; cy /= rimF.n;
    ctx.strokeStyle = LOCKED ? '#1e293b' : 'rgba(40,44,54,0.85)';
    ctx.lineWidth = Math.max(0.6, V.scale * 0.025);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const i = Math.round((k / 5) * rimF.n) % rimF.n;
      ctx.moveTo(cx, cy); ctx.lineTo(cx + (rimF.sx[i] - cx) * 0.9, cy + (rimF.sy[i] - cy) * 0.9);
    }
    ctx.stroke();
    ctx.fillStyle = '#1f232c';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.6, V.scale * w.r * 0.14), 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------

/**
 * Paints one car.
 * @param ctx canvas 2D context
 * @param S a body from src/car-shapes.js
 * @param look { body, cabin, glow } colours
 * @param o { cx, cy (screen point of the road under the car's centre), scale (px per metre
 *   at the camera distance), yaw (model rotation; π = seen from behind), pitch, camDist,
 *   wheels: 'tyre' | 'disc' | 'none', brake, locked, pool (underglow pool), anchors
 *   ({ n, x, y, r } typed arrays to receive the exhaust tips, in canvas px) }
 */
export function paintCar(ctx, S, look, o) {
  const G = geometryFor(S);
  V.cx = o.cx; V.cy = o.cy; V.scale = o.scale;
  V.cyaw = Math.cos(o.yaw); V.syaw = Math.sin(o.yaw);
  const pitch = o.pitch == null ? 0.32 : o.pitch;
  V.cp = Math.cos(pitch); V.sp = Math.sin(pitch);
  V.cam = o.camDist || 9;
  LOCKED = Boolean(o.locked);
  const body = rgbOf(look.body || '#94a3b8'), cabin = rgbOf(look.cabin || '#e2e8f0');
  const anchors = o.anchors || null;
  if (anchors) anchors.n = 0;
  const seam = Math.max(0.5, Math.min(1.2, o.scale * 0.012));

  ctx.save();
  ctx.lineJoin = 'round';

  // Contact shadow (and the garage's underglow pool).
  proj(0, 0, 0);
  const sx0 = PX, sy0 = PY;
  let rx = 1, ry = 1;
  for (const [x, z] of [[G.hx + 0.3, 0], [-G.hx - 0.3, 0], [0, G.hz + 0.25], [0, -G.hz - 0.25]]) {
    proj(x, 0, z);
    rx = Math.max(rx, Math.abs(PX - sx0)); ry = Math.max(ry, Math.abs(PY - sy0));
  }
  if (o.pool) {
    ctx.save();
    ctx.globalAlpha = LOCKED ? 0.15 : 0.55;
    ctx.translate(sx0, sy0); ctx.scale(1, Math.max(0.12, ry / rx));
    const pool = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * 1.35);
    pool.addColorStop(0, look.glow || '#00f0ff'); pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, rx * 1.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(sx0, sy0); ctx.scale(1, Math.max(0.12, ry / rx));
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  sh.addColorStop(0, 'rgba(0,0,0,0.62)'); sh.addColorStop(0.72, 'rgba(0,0,0,0.38)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Which flank faces the camera, and how much (wheels on it are drawn over the body).
  rotN(1, 0, 0);
  const sideR = N[2], sideL = -N[2];
  const wheelsOn = o.wheels !== 'none';

  drawFaces(ctx, G.under, body, cabin, seam);
  if (wheelsOn) {
    for (const w of G.wheels) {
      const f = w.side > 0 ? sideR : w.side < 0 ? sideL : 0;
      if (!(f > 0.22) || w.inner) drawWheel(ctx, w, false);
    }
  }
  drawFaces(ctx, G.hull, body, cabin, seam);
  let rearCap = null, frontCap = null;
  for (const f of G.hull) { if (f.cap && f.vis) { if (f.kind === 'rear') rearCap = f; else frontCap = f; } }
  if (rearCap) rearDetails(ctx, G, rearCap, o, anchors);
  if (frontCap) frontDetails(ctx, G, frontCap);
  if (!LOCKED && S.extras.includes('vents')) {
    // Louvres across the rear deck.
    ctx.fillStyle = 'rgba(12,14,20,0.8)';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const z = -G.hz + 0.28 + i * 0.075;
      proj(-G.hx * 0.62, S.hull[1] + 0.004, z); ctx.moveTo(PX, PY);
      proj(G.hx * 0.62, S.hull[1] + 0.004, z); ctx.lineTo(PX, PY);
      proj(G.hx * 0.62, S.hull[1] + 0.004, z + 0.035); ctx.lineTo(PX, PY);
      proj(-G.hx * 0.62, S.hull[1] + 0.004, z + 0.035); ctx.lineTo(PX, PY);
      ctx.closePath();
    }
    ctx.fill();
  }
  if (S.extras.includes('truck')) {
    // The under-run bar and mud flaps below the doors.
    ctx.fillStyle = '#111318';
    ctx.beginPath(); quadPath(ctx, -G.hx * 0.86, G.hx * 0.86, 0.48, 0.62, -G.hz + 0.08); ctx.fill();
    ctx.fillStyle = '#0a0b0e';
    ctx.beginPath(); quadPath(ctx, -G.hx * 0.98, -G.hx * 0.5, 0.18, 0.92, -G.hz + 0.6); quadPath(ctx, G.hx * 0.5, G.hx * 0.98, 0.18, 0.92, -G.hz + 0.6); ctx.fill();
  }
  if (wheelsOn) {
    for (const w of G.wheels) {
      const f = w.side > 0 ? sideR : w.side < 0 ? sideL : 0;
      if (f > 0.22 && !w.inner) drawWheel(ctx, w, true);
    }
  }

  // Cabin and trim, far to near.
  const parts = [];
  if (G.cabin.length) parts.push({ faces: G.cabin, z: depthOf(G.cabin), cabin: true });
  for (const t of G.trims) parts.push({ faces: t, z: depthOf(t), cabin: false });
  parts.sort((p, q) => p.z - q.z);
  for (const p of parts) {
    drawFaces(ctx, p.faces, body, cabin, seam);
    if (p.cabin && !LOCKED) glassStreak(ctx, p.faces);
  }

  if (S.extras.includes('ribbon') && !LOCKED) {
    // The light-cycle's glowing spine.
    ctx.save();
    ctx.strokeStyle = look.glow || '#00f0ff'; ctx.shadowColor = look.glow || '#00f0ff';
    ctx.shadowBlur = Math.max(1, o.scale * 0.15); ctx.lineWidth = Math.max(1, o.scale * 0.035);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { proj(0, S.hull[1] + 0.012, -G.hz + (i / 8) * S.L); if (i === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY); }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  LOCKED = false;
  return G;
}

function depthOf(faces) {
  // Mean view depth of the part's centre (bigger = nearer the camera).
  let x = 0, y = 0, z = 0;
  for (const f of faces) { x += f.cx; y += f.cy; z += f.cz; }
  x /= faces.length; y /= faces.length; z /= faces.length;
  proj(x, y, z);
  return PZ;
}

function glassStreak(ctx, faces) {
  let any = false, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ctx.save();
  ctx.beginPath();
  for (const f of faces) {
    if (!f.vis || f.kind !== 'glass') continue;
    pathOf(ctx, f);
    any = true;
    for (let i = 0; i < f.n; i++) { x0 = Math.min(x0, f.sx[i]); y0 = Math.min(y0, f.sy[i]); x1 = Math.max(x1, f.sx[i]); y1 = Math.max(y1, f.sy[i]); }
  }
  if (any && x1 - x0 > 2) {
    ctx.clip();
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0.28, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.26)');
    g.addColorStop(0.47, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.restore();
}

/** Clears the per-shape geometry (tests). */
export function clearPaintCache() { geoCache.clear(); }

/** Projects a car-space point with the camera of the last paintCar() call (into `out`). */
export function projectLast(x, y, z, out) {
  proj(x, y, z);
  out.x = PX; out.y = PY;
  return out;
}
