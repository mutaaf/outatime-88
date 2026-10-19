// Low-poly synthwave geometry for the 3D view: cars, props, obstacles, sky pieces.
// Everything here runs once at build time (or when a new car style first appears),
// never per frame.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OctahedronGeometry,
  PlaneGeometry, SRGBColorSpace, Shape, TorusGeometry, AdditiveBlending,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shapeOf } from '../car-shapes.js';

export const NEON_CYAN = '#22e6ff';
export const NEON_PINK = '#ff2bd6';

/** Radial glow texture (white core → transparent), tinted by material colour. */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}

export function glowMaterial(color, opacity = 1) {
  return new MeshBasicMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false,
    blending: AdditiveBlending, fog: false, side: DoubleSide,
  });
}

/** Flat glow quad lying on the ground (underglow, lamp pools). */
export function groundGlow(w, l, color, opacity) {
  const m = new Mesh(new PlaneGeometry(w, l), glowMaterial(color, opacity));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

// ── Cars ─────────────────────────────────────────────────────────────────────
// Side profiles: [along-length 0..1 from the rear, height in metres]. Extruded across the
// car's width, then turned so the nose points down -Z (three's forward).
const PROFILES = {
  TIME_CAR: [[0, 0.28], [0, 0.92], [0.12, 0.98], [0.33, 1.22], [0.5, 1.22], [0.66, 0.86], [1, 0.52], [1, 0.28]],
  MUSCLE: [[0, 0.3], [0, 1.0], [0.28, 1.02], [0.36, 1.42], [0.6, 1.42], [0.7, 1.04], [1, 0.96], [1, 0.3]],
  TUNER_WING: [[0, 0.26], [0, 0.86], [0.3, 0.9], [0.4, 1.24], [0.6, 1.24], [0.74, 0.84], [1, 0.62], [1, 0.26]],
  SEDAN: [[0, 0.3], [0, 0.98], [0.22, 1.02], [0.32, 1.5], [0.66, 1.5], [0.76, 1.04], [1, 0.94], [1, 0.3]],
  TAXI: [[0, 0.3], [0, 0.98], [0.22, 1.02], [0.32, 1.5], [0.66, 1.5], [0.76, 1.04], [1, 0.94], [1, 0.3]],
  SUV: [[0, 0.34], [0, 1.6], [0.7, 1.64], [0.8, 1.16], [1, 1.08], [1, 0.34]],
  // The roster's archetypes (POP_CULTURE_ROSTER[].shape), so each car reads as itself in 3D.
  SCANNER: [[0, 0.3], [0, 0.9], [0.26, 0.98], [0.38, 1.26], [0.56, 1.26], [0.68, 0.92], [1, 0.5], [1, 0.3]],
  ROCKET: [[0, 0.26], [0, 0.82], [0.16, 0.88], [0.27, 1.14], [0.45, 1.14], [0.6, 0.8], [1, 0.38], [1, 0.26]],
  HEAVY_VAN: [[0, 0.38], [0, 1.96], [0.82, 1.98], [0.9, 1.34], [1, 1.16], [1, 0.38]],
  ROADSTER: [[0, 0.27], [0, 0.78], [0.18, 0.82], [0.3, 1.04], [0.52, 1.04], [0.66, 0.78], [1, 0.5], [1, 0.27]],
  LIGHTCYCLE: [[0, 0.34], [0, 0.92], [0.22, 1.02], [0.5, 0.94], [0.72, 1.1], [1, 0.72], [1, 0.34]],
};
PROFILES.GULLWING = PROFILES.TIME_CAR;
const GLASS = {
  TIME_CAR: [[0.13, 0.96], [0.33, 1.2], [0.5, 1.2], [0.65, 0.88]],
  MUSCLE: [[0.3, 1.0], [0.37, 1.4], [0.59, 1.4], [0.69, 1.03]],
  TUNER_WING: [[0.32, 0.89], [0.41, 1.22], [0.59, 1.22], [0.73, 0.85]],
  SEDAN: [[0.24, 1.0], [0.33, 1.48], [0.65, 1.48], [0.75, 1.03]],
  TAXI: [[0.24, 1.0], [0.33, 1.48], [0.65, 1.48], [0.75, 1.03]],
  SUV: [[0.06, 1.1], [0.06, 1.58], [0.69, 1.6], [0.78, 1.15]],
  SCANNER: [[0.27, 0.97], [0.38, 1.24], [0.56, 1.24], [0.67, 0.93]],
  ROCKET: [[0.17, 0.87], [0.27, 1.12], [0.45, 1.12], [0.59, 0.82]],
  HEAVY_VAN: [[0.62, 1.4], [0.62, 1.9], [0.82, 1.92], [0.89, 1.38]],
  ROADSTER: [[0.19, 0.83], [0.3, 1.02], [0.51, 1.02], [0.65, 0.79]],
  LIGHTCYCLE: [[0.5, 0.95], [0.6, 1.12], [0.7, 1.12], [0.72, 1.0]],
};
GLASS.GULLWING = GLASS.TIME_CAR;

/** Which 3D body a roster shape (or a traffic style) gets. */
export function bodyStyle(shapeOrStyle) {
  return PROFILES[shapeOrStyle] || shapeOrStyle === 'SEMI_TRUCK' ? shapeOrStyle : 'SEDAN';
}

// One wheel: tyre with a sidewall, a chrome rim and five spokes, axis along X. Built once.
let wheelGeo = null;
function wheelGeometry() {
  if (wheelGeo) return wheelGeo;
  const parts = [
    colored(new CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2), '#111116'),
    colored(new CylinderGeometry(0.64, 0.64, 1.04, 14).rotateZ(Math.PI / 2), '#b8bec9'),
    colored(new CylinderGeometry(0.2, 0.2, 1.08, 8).rotateZ(Math.PI / 2), '#2b2f38'),
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(colored(new BoxGeometry(1.06, 0.12, 0.5).translate(0, 0.32, 0).rotateX(a), '#d7dbe3'));
  }
  wheelGeo = merged(parts);
  return wheelGeo;
}
const wheelMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
wheelMat.userData.shared = true;
const lampOff = new Color('#3a0710'), lampOn = new Color('#ff1a2e');

function profileGeometry(points, length, width) {
  const s = new Shape();
  points.forEach(([u, h], i) => {
    const x = (u - 0.5) * length;
    if (i === 0) s.moveTo(x, h); else s.lineTo(x, h);
  });
  const g = new ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // shape +x (the nose) → -Z
  return g;
}

const detailMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
detailMat.userData.shared = true; // pooled cars share it: never dispose

/**
 * A car group, nose toward -Z, origin on the road under its centre.
 *
 * Paint (`userData.paint`, clearcoat on HIGH+), unlit details (glass, lights, trim), the
 * underglow (`userData.glow`) and wheels. `opts.wheels`:
 *   'static' — tyres merged into the details (no extra draw calls; LOW / distant traffic)
 *   'spin'   — two axle meshes that roll with speed (`userData.axles`)
 *   'steer'  — rear axle + two front wheels that also steer (`userData.front`; the player)
 * The player also gets `userData.lamps` (brake lights, `setBrake(on)`) and headlight glows.
 */
export function buildCar(style, length, width, { police = false, clearcoat = false, wheels = 'static', lamps = false } = {}) {
  const g = new Group();
  const isTruck = style === 'SEMI_TRUCK';
  const cycle = style === 'LIGHTCYCLE';
  const paint = clearcoat
    ? new MeshPhysicalMaterial({ color: '#c9ced6', metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 })
    : new MeshStandardMaterial({ color: '#c9ced6', metalness: 0.5, roughness: 0.38 });
  g.userData.paint = paint;
  const paintParts = [];
  const details = [];
  const prof = PROFILES[style] || PROFILES.SEDAN;
  const bodyW = cycle ? width * 0.34 : width;
  if (isTruck) {
    const cabL = Math.min(3.2, length * 0.3);
    paintParts.push(colored(new BoxGeometry(width, 2.6, cabL).translate(0, 1.7, -(length / 2 - cabL / 2)), '#ffffff'));
    details.push(colored(new BoxGeometry(width * 1.02, 3.2, length - cabL - 0.3).translate(0, 2.05, cabL / 2 + 0.15), '#c7cad6'));
    details.push(colored(new BoxGeometry(width * 1.04, 0.22, length - cabL - 0.3).translate(0, 1.0, cabL / 2 + 0.15), NEON_PINK));
    details.push(colored(new BoxGeometry(width * 0.7, 0.9, 0.06).translate(0, 2.2, -length / 2 - 0.02), '#0a0f24'));
  } else {
    paintParts.push(colored(profileGeometry(prof, length, bodyW), '#ffffff'));
    details.push(colored(profileGeometry(GLASS[style] || GLASS.SEDAN, length * 1.004, bodyW * 0.94).translate(0, 0.025, 0), '#141c46'));
    // Dark sills and bumpers ground the body visually.
    details.push(colored(new BoxGeometry(bodyW * 1.01, 0.18, length * 0.98).translate(0, 0.36, 0), '#15171d'));
    if (style === 'TUNER_WING') paintParts.push(colored(new BoxGeometry(width * 0.95, 0.08, 0.6).translate(0, 1.2, length * 0.44), '#ffffff'));
    if (style === 'TAXI') details.push(colored(new BoxGeometry(0.8, 0.28, 0.4).translate(0, 1.64, 0.1 * length), '#ffe066'));
    if (style === 'MUSCLE') details.push(colored(new BoxGeometry(width * 0.28, 0.2, length * 0.18).translate(0, 1.08, -length * 0.3), '#111827'));
    if (style === 'ROCKET') paintParts.push(colored(new BoxGeometry(0.1, 0.7, length * 0.14).translate(0, 1.15, length * 0.42), '#ffffff'));
    if (style === 'SCANNER') details.push(colored(new BoxGeometry(width * 0.6, 0.08, 0.06).translate(0, 0.62, -length / 2 - 0.02), '#ff2030'));
    if (style === 'TIME_CAR' || style === 'GULLWING') {
      // Rear louvres and the flux-capacitor glow through the back glass.
      for (let i = 0; i < 4; i++) details.push(colored(new BoxGeometry(width * 0.8, 0.04, 0.08).translate(0, 0.93 + i * 0.012, length * (0.2 + i * 0.06)), '#2b3140'));
      details.push(colored(new BoxGeometry(0.5, 0.3, 0.05).translate(0, 1.0, length * 0.06), '#ffd23f'));
    }
  }
  // Tail lights live in the details unless the car has switchable lamps (the player).
  const tail = new BoxGeometry(bodyW * 0.86, 0.16, 0.05).translate(0, isTruck ? 1.0 : 0.78, length / 2 + 0.03);
  if (!lamps) details.push(colored(tail, '#ff1f3d'));
  for (const sx of [-1, 1]) {
    details.push(colored(new BoxGeometry(0.42, 0.14, 0.05).translate(sx * bodyW * 0.32, isTruck ? 1.2 : 0.5, -length / 2 - 0.03), '#fff6d8'));
  }
  const axle = cycle ? length * 0.36 : length * 0.32;
  const r = cycle ? 0.62 : 0.46;
  const tyreW = cycle ? 0.28 : 0.42;
  const wheelX = cycle ? [0] : [-(width / 2 - 0.16), width / 2 - 0.16];
  if (wheels === 'static') {
    for (const sz of [-1, 1]) for (const sx of wheelX) {
      details.push(colored(new CylinderGeometry(r, r, tyreW, 10).rotateZ(Math.PI / 2).translate(sx, r, sz * axle), '#0b0b12'));
    }
  }
  g.add(new Mesh(merged(paintParts), paint));
  g.add(new Mesh(merged(details), detailMat));
  if (wheels !== 'static') {
    const one = wheelGeometry();
    const axleGeo = (xs) => merged(xs.map((x) => one.clone().scale(tyreW, r, r).translate(x, 0, 0)));
    const rear = new Mesh(axleGeo(wheelX), wheelMat);
    rear.position.set(0, r, axle);
    g.add(rear);
    const axles = [rear];
    if (wheels === 'steer' && !cycle) {
      const front = wheelX.map((x) => {
        const pivot = new Group();
        pivot.position.set(x, r, -axle);
        const w = new Mesh(axleGeo([0]), wheelMat);
        pivot.add(w);
        g.add(pivot);
        axles.push(w);
        return pivot;
      });
      g.userData.front = front;
    } else {
      const fr = new Mesh(axleGeo(wheelX), wheelMat);
      fr.position.set(0, r, -axle);
      g.add(fr);
      axles.push(fr);
      if (cycle) g.userData.front = [fr];
    }
    g.userData.axles = axles;
    g.userData.wheelR = r;
  }
  if (lamps) {
    const brake = new MeshBasicMaterial({ color: lampOff.clone(), toneMapped: false });
    g.add(new Mesh(tail, brake));
    g.userData.setBrake = (on) => brake.color.copy(on ? lampOn : lampOff);
    // Headlight pools: two soft glows on the road ahead, shown at night.
    const beams = new Group();
    for (const sx of [-1, 1]) {
      const pool = groundGlow(3.2, 9, '#fff1c9', 0.55);
      pool.position.set(sx * bodyW * 0.3, 0.07, -length / 2 - 4.8);
      beams.add(pool);
    }
    beams.visible = false;
    g.add(beams);
    g.userData.beams = beams;
  }
  g.userData.trailX = cycle ? 0.05 : width / 2 - 0.25;
  addThrusters(g, style, length, bodyW, isTruck);
  if (police) {
    const bar = new Mesh(new BoxGeometry(1.2, 0.18, 0.32), new MeshBasicMaterial({ color: '#3b82f6' }));
    bar.position.set(0, prof === PROFILES.SUV ? 1.7 : 1.58, 0);
    g.add(bar);
    g.userData.lightbar = bar;
  }
  const glow = groundGlow(width + 2.4, length + 2.4, NEON_CYAN, 0.7);
  glow.position.y = 0.06;
  g.userData.glow = glow.material;
  g.add(glow);
  return g;
}

// Flames from each car's own exhaust tips (src/car-shapes.js), the same anchors the 2D sprites
// use: NOS (blue-violet), warp fire (orange), cold gas for the electric roadster, one big jet
// for the rocket. Hidden (no draw call) until `setThrust(level, kind, t)` lights them.
const FLAME = { nos: ['#7c6cff', '#e8f4ff'], fire: ['#ff6a1a', '#fff1c2'], cold: ['#bfe9ff', '#ffffff'] };

function addThrusters(g, style, length, bodyW, isTruck) {
  const S = shapeOf(style === 'TIME_CAR' ? 'GULLWING' : style);
  if (isTruck || S.thrust === 'none') return;
  const kx = bodyW / S.W, outer = [], core = [];
  for (const [x, y, r] of S.exhaust) {
    const rr = Math.max(0.06, r * kx * (S.thrust === 'jet' ? 1.6 : 1.9));
    // (car-shapes x is the car's left seen from behind; three's +x is its right)
    for (const [list, k] of [[outer, 1], [core, 0.45]]) list.push(new ConeGeometry(rr * k, 1, 10, 1, true).rotateX(Math.PI / 2).translate(-x * kx, y, 0.5));
  }
  const mk = (geo, order) => {
    const m = new Mesh(merged(geo), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.frustumCulled = false; m.renderOrder = order;
    return m;
  };
  const mo = mk(outer, 4), mc = mk(core, 5);
  const grp = new Group();
  grp.position.z = length / 2 + 0.02;
  grp.add(mo, mc);
  grp.visible = false;
  g.add(grp);
  const base = S.thrust === 'jet' ? 2.6 : S.thrust === 'cold' ? 0.9 : 1.7;
  g.userData.setThrust = (level, kind, t) => {
    grp.visible = level > 0;
    if (!grp.visible) return;
    const c = FLAME[S.thrust === 'cold' ? 'cold' : kind] || FLAME.fire;
    mo.material.color.set(c[0]); mc.material.color.set(c[1]);
    mo.scale.z = base * (0.6 + 1.4 * level) * (0.85 + 0.15 * Math.sin((t || 0) * 43));
    mc.scale.z = mo.scale.z * 0.6;
  };
}

/** Rolls (and for the player, steers) a car's wheels. `dist` metres travelled this frame. */
export function turnWheels(g, dist, steer) {
  const axles = g.userData.axles;
  if (!axles) return;
  const a = dist / (g.userData.wheelR || 0.46);
  for (let i = 0; i < axles.length; i++) axles[i].rotation.x -= a;
  const front = g.userData.front;
  if (front && steer !== undefined) for (let i = 0; i < front.length; i++) front[i].rotation.y = steer;
}

// ── Roadside props (instanced; one geometry per type, built once) ─────────────
function colored(geo, color) {
  const c = new Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return geo;
}

function merged(parts) {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
}

function palmGeometry() {
  const parts = [colored(new CylinderGeometry(0.22, 0.38, 9, 6).translate(0, 4.5, 0), '#3a1d2e')];
  for (let i = 0; i < 7; i++) {
    const frond = new ConeGeometry(0.5, 4.6, 4, 1, true);
    frond.translate(0, 2.3, 0);
    frond.rotateZ(Math.PI / 2 - 0.35);
    frond.rotateY((i / 7) * Math.PI * 2);
    frond.translate(0, 9, 0);
    parts.push(colored(frond, i % 2 ? '#0e6b55' : '#11806a'));
  }
  return merged(parts);
}

function lampGeometry() {
  return merged([
    colored(new CylinderGeometry(0.12, 0.16, 7.5, 6).translate(0, 3.75, 0), '#6b7280'),
    colored(new BoxGeometry(2.4, 0.16, 0.16).translate(-1.2, 7.4, 0), '#6b7280'),
    colored(new BoxGeometry(0.9, 0.22, 0.5).translate(-2.3, 7.3, 0), '#ffe2a8'),
  ]);
}

/** Instanced prop kinds: geometry, material and a per-kind capacity. */
export function propKinds() {
  const lit = new MeshLambertMaterial({ vertexColors: true });
  const neonOrange = new MeshBasicMaterial({ color: '#ff8a1f' });
  return {
    PALM_TREE: { geo: palmGeometry(), mat: lit, cap: 48 },
    STREET_LAMP: { geo: lampGeometry(), mat: lit, cap: 48, mirror: true },
    LAMP_GLOW: { geo: new PlaneGeometry(4, 4), mat: glowMaterial('#ffc27a', 0.9), cap: 48, billboard: true },
    CLOCK_TOWER_BILLBOARD: { geo: merged([colored(new BoxGeometry(3, 14, 3).translate(0, 7, 0), '#2a1840'), colored(new ConeGeometry(2.4, 3, 4).rotateY(Math.PI / 4).translate(0, 15.5, 0), '#3d2160')]), mat: lit, cap: 32 },
    CLOCK_FACE: { geo: new CircleGeometry(1.1, 16).translate(0, 11.5, 1.52), mat: new MeshBasicMaterial({ color: '#fff3c4' }), cap: 32 },
    ARCH_HW: { geo: new BoxGeometry(0.5, 9, 0.5).translate(0, 4.5, 0), mat: neonOrange, cap: 32 },
    OVERHEAD_GATE: { geo: new TorusGeometry(12.5, 0.28, 6, 24, Math.PI), mat: new MeshBasicMaterial({ color: NEON_PINK }), cap: 24 },
    MC_FLARE_GREEN: { geo: new PlaneGeometry(2.4, 2.4).translate(0, 0.9, 0), mat: glowMaterial('#39ff88', 1), cap: 16, billboard: true },
    HW_COIN: { geo: new CylinderGeometry(0.75, 0.75, 0.16, 14).rotateX(Math.PI / 2), mat: new MeshStandardMaterial({ color: '#ffd23f', emissive: '#a66b00', metalness: 0.7, roughness: 0.3 }), cap: 32, spin: true },
    PLUTONIUM: { geo: new OctahedronGeometry(0.85), mat: new MeshBasicMaterial({ color: '#4ff7ff' }), cap: 24, spin: true },
    REPAIR_WRENCH: { geo: merged([colored(new BoxGeometry(1.6, 0.4, 0.4), '#34d399'), colored(new BoxGeometry(0.4, 1.6, 0.4), '#34d399')]), mat: new MeshBasicMaterial({ vertexColors: true }), cap: 16, spin: true },
    NOS_CAN: { geo: merged([colored(new CylinderGeometry(0.45, 0.45, 1.3, 12), '#3b82f6'), colored(new CylinderGeometry(0.47, 0.47, 0.32, 12), '#e0f2fe'), colored(new CylinderGeometry(0.16, 0.2, 0.3, 8).translate(0, 0.8, 0), '#1f2937')]), mat: new MeshBasicMaterial({ vertexColors: true }), cap: 12, spin: true },
    // Runner power-ups (0177): flat-colour magnet arc, shield disc and gold 2X gem (kept tiny: 3D budget).
    MAGNET: { geo: new TorusGeometry(0.6, 0.22, 6, 12, Math.PI), mat: new MeshBasicMaterial({ color: '#f43f5e' }), cap: 8, spin: true },
    SHIELD: { geo: new CylinderGeometry(0.85, 0.85, 0.16, 16).rotateX(Math.PI / 2), mat: new MeshBasicMaterial({ color: '#38bdf8' }), cap: 8, spin: true },
    DOUBLER: { geo: new OctahedronGeometry(0.8), mat: new MeshBasicMaterial({ color: '#facc15' }), cap: 8, spin: true },
    PICKUP_GLOW: { geo: new PlaneGeometry(3, 3), mat: glowMaterial('#ffe27a', 0.55), cap: 64, billboard: true },
  };
}

// ── Obstacles (few at a time: pooled groups) ──────────────────────────────────
export function buildObstacle(type, width) {
  const g = new Group();
  if (type === 'TRAFFIC_CONE') {
    // ticket 0074: knockable props have their own small meshes (width is ignored)
    const cone = new Mesh(new ConeGeometry(0.32, 0.9, 10), new MeshLambertMaterial({ color: '#ff6a00' }));
    cone.position.y = 0.5;
    const band = new Mesh(new CylinderGeometry(0.17, 0.22, 0.12, 10), new MeshBasicMaterial({ color: '#f8fafc' }));
    band.position.y = 0.52;
    const base = new Mesh(new BoxGeometry(0.75, 0.08, 0.75), new MeshLambertMaterial({ color: '#111827' }));
    base.position.y = 0.04;
    g.add(base, cone, band);
  } else if (type === 'OIL_BARREL') {
    const drum = new Mesh(new CylinderGeometry(0.45, 0.45, 1.25, 14), new MeshLambertMaterial({ color: '#1d4ed8' }));
    drum.position.y = 0.63;
    const ringMat = new MeshBasicMaterial({ color: '#fbbf24' });
    for (const y of [0.35, 0.9]) {
      const ring = new Mesh(new CylinderGeometry(0.47, 0.47, 0.08, 14), ringMat);
      ring.position.y = y;
      g.add(ring);
    }
    g.add(drum);
  } else if (type === 'PINE_TREE_HAZARD') {
    const trunk = new Mesh(new CylinderGeometry(0.3, 0.4, 1.6, 6), new MeshLambertMaterial({ color: '#4a2a17' }));
    trunk.position.y = 0.8;
    const crown = new Mesh(new ConeGeometry(1.9, 5.2, 7), new MeshLambertMaterial({ color: '#0f7a3f' }));
    crown.position.y = 4.0;
    g.add(trunk, crown);
  } else if (type === 'LOW_LASER_BAR') {
    const mat = new MeshLambertMaterial({ color: '#1f2937' });
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.3, 1.1, 0.3), mat);
      post.position.set(sx * width / 2, 0.55, 0);
      g.add(post);
    }
    const beam = new Mesh(new BoxGeometry(width, 0.16, 0.16), new MeshBasicMaterial({ color: '#ff2a3d' }));
    beam.position.y = 0.75;
    const glow = new Mesh(new PlaneGeometry(width + 1.5, 1.6), glowMaterial('#ff2a3d', 0.8));
    glow.position.y = 0.75;
    g.add(beam, glow);
  } else if (type === 'HIGH_LIGHT_GATE') {
    const frame = new MeshBasicMaterial({ color: '#ffd23f' });
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.3, 3.4, 0.3), frame);
      post.position.set(sx * width / 2, 1.7, 0);
      g.add(post);
    }
    const bar = new Mesh(new BoxGeometry(width, 0.9, 0.3), new MeshBasicMaterial({ color: '#fff3b0' }));
    bar.position.y = 2.6;
    g.add(bar);
  } else if (type === 'FLUX_CRATE') {
    const box = new Mesh(new BoxGeometry(2.2, 2.2, 2.2), new MeshLambertMaterial({ color: '#7c3aed' }));
    box.position.y = 1.1;
    const band = new Mesh(new BoxGeometry(2.3, 0.25, 2.3), new MeshBasicMaterial({ color: NEON_CYAN }));
    band.position.y = 1.1;
    g.add(box, band);
  } else {
    const wall = new Mesh(new BoxGeometry(width, 1.6, 0.3), new MeshBasicMaterial({ color: NEON_CYAN, transparent: true, opacity: 0.45, depthWrite: false }));
    wall.position.y = 0.9;
    const edge = new Mesh(new BoxGeometry(width, 0.1, 0.34), new MeshBasicMaterial({ color: '#e0fcff' }));
    edge.position.y = 1.7;
    g.add(wall, edge);
  }
  return g;
}

// ── Sky pieces ─────────────────────────────────────────────────────────────
/** Jagged mountain ring (silhouette + neon ridge line) of radius r around the origin. */
export function mountainRing(r, color, ridgeColor) {
  const n = 96;
  const pos = [];
  const ridge = [];
  const h = (k) => 40 + Math.sin(k * 0.37 + 1.2) * 26 + Math.cos(k * 0.91) * 14 + ((k * 7919) % 13) * 2.2;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const x0 = Math.sin(a0) * r, z0 = Math.cos(a0) * r, x1 = Math.sin(a1) * r, z1 = Math.cos(a1) * r;
    const h0 = h(k), h1 = h((k + 1) % n);
    pos.push(x0, -30, z0, x1, -30, z1, x1, h1, z1, x0, -30, z0, x1, h1, z1, x0, h0, z0);
    ridge.push(x0, h0, z0, x1, h1, z1, x1, h1 - 1.6, z1, x0, h0, z0, x1, h1 - 1.6, z1, x0, h0 - 1.6, z0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const rg = new BufferGeometry();
  rg.setAttribute('position', new Float32BufferAttribute(ridge, 3));
  const grp = new Group();
  grp.add(new Mesh(g, new MeshBasicMaterial({ color, fog: false, side: DoubleSide })));
  grp.add(new Mesh(rg, new MeshBasicMaterial({ color: ridgeColor, fog: false, side: DoubleSide })));
  return grp;
}
