// Low-poly synthwave geometry for the 3D view: cars, props, obstacles, sky pieces.
// Everything here runs once at build time (or when a new car style first appears),
// never per frame.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, OctahedronGeometry,
  PlaneGeometry, SRGBColorSpace, Shape, TorusGeometry, AdditiveBlending,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
};
const GLASS = {
  TIME_CAR: [[0.13, 0.96], [0.33, 1.2], [0.5, 1.2], [0.65, 0.88]],
  MUSCLE: [[0.3, 1.0], [0.37, 1.4], [0.59, 1.4], [0.69, 1.03]],
  TUNER_WING: [[0.32, 0.89], [0.41, 1.22], [0.59, 1.22], [0.73, 0.85]],
  SEDAN: [[0.24, 1.0], [0.33, 1.48], [0.65, 1.48], [0.75, 1.03]],
  TAXI: [[0.24, 1.0], [0.33, 1.48], [0.65, 1.48], [0.75, 1.03]],
  SUV: [[0.06, 1.1], [0.06, 1.58], [0.69, 1.6], [0.78, 1.15]],
};

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

const detailMat = new MeshBasicMaterial({ vertexColors: true });

/**
 * A car group, nose toward -Z, origin on the road under its centre. Three draw calls: the
 * paint (recoloured when a pooled car is reassigned: `userData.paint`), the unlit details
 * (glass, lights, tyres) and the underglow (`userData.glow`). Police cars add a light bar.
 */
export function buildCar(style, length, width, { police = false } = {}) {
  const g = new Group();
  const isTruck = style === 'SEMI_TRUCK';
  const paint = new MeshStandardMaterial({ color: '#c9ced6', metalness: 0.5, roughness: 0.42 });
  g.userData.paint = paint;
  const paintParts = [];
  const details = [];
  const prof = PROFILES[style] || PROFILES.SEDAN;
  if (isTruck) {
    const cabL = Math.min(3.2, length * 0.3);
    paintParts.push(colored(new BoxGeometry(width, 2.6, cabL).translate(0, 1.7, -(length / 2 - cabL / 2)), '#ffffff'));
    details.push(colored(new BoxGeometry(width * 1.02, 3.2, length - cabL - 0.3).translate(0, 2.05, cabL / 2 + 0.15), '#c7cad6'));
    details.push(colored(new BoxGeometry(width * 1.04, 0.22, length - cabL - 0.3).translate(0, 1.0, cabL / 2 + 0.15), NEON_PINK));
    details.push(colored(new BoxGeometry(width * 0.7, 0.9, 0.06).translate(0, 2.2, -length / 2 - 0.02), '#0a0f24'));
  } else {
    paintParts.push(colored(profileGeometry(prof, length, width), '#ffffff'));
    details.push(colored(profileGeometry(GLASS[style] || GLASS.SEDAN, length * 1.004, width * 0.94).translate(0, 0.025, 0), '#141c46'));
    if (style === 'TUNER_WING') paintParts.push(colored(new BoxGeometry(width * 0.95, 0.08, 0.6).translate(0, 1.2, length * 0.44), '#ffffff'));
    if (style === 'TAXI') details.push(colored(new BoxGeometry(0.8, 0.28, 0.4).translate(0, 1.64, 0.1 * length), '#ffe066'));
    if (style === 'TIME_CAR') {
      // Rear louvres and the flux-capacitor glow through the back glass.
      for (let i = 0; i < 4; i++) details.push(colored(new BoxGeometry(width * 0.8, 0.04, 0.08).translate(0, 0.93 + i * 0.012, length * (0.2 + i * 0.06)), '#2b3140'));
      details.push(colored(new BoxGeometry(0.5, 0.3, 0.05).translate(0, 1.0, length * 0.06), '#ffd23f'));
    }
  }
  details.push(colored(new BoxGeometry(width * 0.86, 0.16, 0.05).translate(0, isTruck ? 1.0 : 0.78, length / 2 + 0.03), '#ff1f3d'));
  for (const sx of [-1, 1]) {
    details.push(colored(new BoxGeometry(0.42, 0.14, 0.05).translate(sx * width * 0.32, isTruck ? 1.2 : 0.5, -length / 2 - 0.03), '#fff6d8'));
  }
  const axle = length * 0.32;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    details.push(colored(new CylinderGeometry(0.42, 0.42, 0.42, 10).rotateZ(Math.PI / 2).translate(sx * (width / 2 - 0.12), 0.42, sz * axle), '#0b0b12'));
  }
  g.add(new Mesh(merged(paintParts), paint));
  g.add(new Mesh(merged(details), detailMat));
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

let signTex = null;
function signTexture() {
  if (signTex) return signTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#12051f'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = NEON_PINK; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = NEON_CYAN; g.font = 'bold 74px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = NEON_CYAN; g.shadowBlur = 14;
  g.fillText('88', 128, 62);
  g.font = 'bold 18px Orbitron, sans-serif'; g.fillStyle = '#ffd166'; g.shadowBlur = 0;
  g.fillText('MILES PER HOUR', 128, 108);
  signTex = new CanvasTexture(c);
  signTex.colorSpace = SRGBColorSpace;
  return signTex;
}

/** Instanced prop kinds: geometry, material and a per-kind capacity. */
export function propKinds() {
  const lit = new MeshLambertMaterial({ vertexColors: true });
  const neonOrange = new MeshBasicMaterial({ color: '#ff8a1f' });
  return {
    PALM_TREE: { geo: palmGeometry(), mat: lit, cap: 48 },
    STREET_LAMP: { geo: lampGeometry(), mat: lit, cap: 48, mirror: true },
    LAMP_GLOW: { geo: new PlaneGeometry(4, 4), mat: glowMaterial('#ffc27a', 0.9), cap: 48, billboard: true },
    SIGN_88: { geo: new PlaneGeometry(7, 3.5).translate(0, 6, 0), mat: new MeshBasicMaterial({ map: signTexture(), side: DoubleSide }), cap: 32 },
    SIGN_POST: { geo: merged([colored(new BoxGeometry(0.2, 4.5, 0.2).translate(-2.5, 2.25, 0), '#374151'), colored(new BoxGeometry(0.2, 4.5, 0.2).translate(2.5, 2.25, 0), '#374151')]), mat: lit, cap: 32 },
    CLOCK_TOWER_BILLBOARD: { geo: merged([colored(new BoxGeometry(3, 14, 3).translate(0, 7, 0), '#2a1840'), colored(new ConeGeometry(2.4, 3, 4).rotateY(Math.PI / 4).translate(0, 15.5, 0), '#3d2160')]), mat: lit, cap: 32 },
    CLOCK_FACE: { geo: new CircleGeometry(1.1, 16).translate(0, 11.5, 1.52), mat: new MeshBasicMaterial({ color: '#fff3c4' }), cap: 32 },
    ARCH_HW: { geo: new BoxGeometry(0.5, 9, 0.5).translate(0, 4.5, 0), mat: neonOrange, cap: 32 },
    OVERHEAD_GATE: { geo: new TorusGeometry(12.5, 0.28, 6, 24, Math.PI), mat: new MeshBasicMaterial({ color: NEON_PINK }), cap: 24 },
    MC_FLARE_GREEN: { geo: new PlaneGeometry(2.4, 2.4).translate(0, 0.9, 0), mat: glowMaterial('#39ff88', 1), cap: 16, billboard: true },
    HW_COIN: { geo: new CylinderGeometry(0.75, 0.75, 0.16, 14).rotateX(Math.PI / 2), mat: new MeshStandardMaterial({ color: '#ffd23f', emissive: '#a66b00', metalness: 0.7, roughness: 0.3 }), cap: 32, spin: true },
    PLUTONIUM: { geo: new OctahedronGeometry(0.85), mat: new MeshBasicMaterial({ color: '#4ff7ff' }), cap: 24, spin: true },
    REPAIR_WRENCH: { geo: merged([colored(new BoxGeometry(1.6, 0.4, 0.4), '#34d399'), colored(new BoxGeometry(0.4, 1.6, 0.4), '#34d399')]), mat: new MeshBasicMaterial({ vertexColors: true }), cap: 16, spin: true },
    PICKUP_GLOW: { geo: new PlaneGeometry(3, 3), mat: glowMaterial('#ffe27a', 0.55), cap: 64, billboard: true },
  };
}

// ── Obstacles (few at a time: pooled groups) ──────────────────────────────────
export function buildObstacle(type, width) {
  const g = new Group();
  if (type === 'PINE_TREE_HAZARD') {
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
