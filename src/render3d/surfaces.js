// Physically based surfaces for the 3D view (ticket 0041): a procedural asphalt set (colour,
// roughness and normal maps painted once on canvases, no downloaded textures) and a per-era
// image-based-lighting environment baked with PMREM from the era's own sky. Built once and
// reused; nothing here runs per frame.
import {
  BackSide, CanvasTexture, Color, Mesh, MeshBasicMaterial, NoColorSpace, PMREMGenerator,
  RepeatWrapping, SRGBColorSpace, Scene, ShaderMaterial, SphereGeometry,
} from 'three';
import { ERA_PALETTES } from '../era-palettes.js';

const SIZE = 256;

/** Deterministic value noise so every device paints the same road. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let asphalt = null;
/** { map, roughnessMap, normalMap } — tileable 256² asphalt with aggregate and tar-sealed cracks. */
export function asphaltTextures() {
  if (asphalt) return asphalt;
  const r = rng(88);
  const height = new Float32Array(SIZE * SIZE);
  // Aggregate: many tiny stones at several sizes, wrapped so the tile repeats seamlessly.
  for (let n = 0; n < 5200; n++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 0.5 + r() * r() * 1.6, hgt = 0.2 + r() * 0.6;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > rad) continue;
      const i = ((Math.floor(y + dy) + SIZE) % SIZE) * SIZE + ((Math.floor(x + dx) + SIZE) % SIZE);
      height[i] = Math.max(height[i], hgt * (1 - d / (rad + 0.5)));
    }
  }
  const col = document.createElement('canvas');
  col.width = col.height = SIZE;
  const cg = col.getContext('2d');
  const img = cg.createImageData(SIZE, SIZE);
  const rough = document.createElement('canvas');
  rough.width = rough.height = SIZE;
  const rgx = rough.getContext('2d');
  const rimg = rgx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const h = height[i];
      const grain = (r() - 0.5) * 18;
      const v = Math.max(0, Math.min(255, 70 + h * 34 + grain));
      const o = i * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v * 1.04; img.data[o + 3] = 255;
      const rv = Math.max(0, Math.min(255, 225 - h * 40 + grain));
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = rv; rimg.data[o + 3] = 255;
    }
  }
  cg.putImageData(img, 0, 0);
  // A few tar-sealed cracks.
  cg.strokeStyle = 'rgba(12,12,16,0.55)';
  cg.lineWidth = 1.4;
  for (let c = 0; c < 5; c++) {
    let x = r() * SIZE, y = r() * SIZE;
    cg.beginPath(); cg.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 30; y += (r() - 0.2) * 26; cg.lineTo(x, y); }
    cg.stroke();
  }
  rgx.putImageData(rimg, 0, 0);
  // Normal map from the height field (central differences, wrapped).
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = SIZE;
  const ng = nrm.getContext('2d');
  const nimg = ng.createImageData(SIZE, SIZE);
  const H = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1);
    const o = (y * SIZE + x) * 4;
    nimg.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    nimg.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
    nimg.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    nimg.data[o + 3] = 255;
  }
  ng.putImageData(nimg, 0, 0);
  const tex = (c, srgb) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  asphalt = { map: tex(col, true), roughnessMap: tex(rough, false), normalMap: tex(nrm, false) };
  return asphalt;
}

/** The era's palette (src/era-palettes.js) for an ERAS entry, with safe fallbacks. */
export function paletteFor(era) {
  const p = ERA_PALETTES[era && era.id] || ERA_PALETTES[2026];
  const stops = p.sky.map((s) => (Array.isArray(s) ? s[1] : s));
  return {
    p,
    top: stops[0], mid: stops[2] || stops[1], horizon: p.horizon, fog: p.fog, sun: p.sun,
    ground: p.ground[1] || p.ground[0], wet: p.weather === 'rain', dusty: p.weather === 'dust',
    bright: era && era.id === '1955',
    space: Boolean(p.space), // orbit (ticket 0150): Earth below, no ground or mountains
  };
}

const envSkyMat = () => new ShaderMaterial({
  side: BackSide, depthWrite: false,
  uniforms: { top: { value: new Color() }, mid: { value: new Color() }, glow: { value: new Color() }, ground: { value: new Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 glow; uniform vec3 ground; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.0, 0.6, h));
    c = mix(c, glow, (1.0 - smoothstep(-0.05, 0.22, h)) * 0.85);
    if (h < 0.0) c = mix(glow * 0.4, ground, smoothstep(0.0, -0.25, h));
    gl_FragColor = vec4(c, 1.0); }`,
});

/**
 * Bakes the era's sky (plus a bright sun/moon and a few neon panels for highlights) into a
 * PMREM environment map. Returns { texture, dispose() }. ~1 ms on a laptop GPU, once per era.
 */
export function bakeEnvironment(renderer, era) {
  const c = paletteFor(era);
  const scene = new Scene();
  const mat = envSkyMat();
  mat.uniforms.top.value.set(c.top);
  mat.uniforms.mid.value.set(c.mid);
  mat.uniforms.glow.value.set(c.horizon);
  mat.uniforms.ground.value.set(c.ground);
  scene.add(new Mesh(new SphereGeometry(50, 32, 16), mat));
  const sun = new Mesh(new SphereGeometry(3.2, 16, 8), new MeshBasicMaterial({ color: new Color(c.sun).multiplyScalar(c.bright ? 6 : 3.5) }));
  sun.position.set(0, c.bright ? 26 : 9, -46);
  scene.add(sun);
  // Neon signage panels around the horizon give car paint and wet asphalt something to mirror.
  const neon = ['#ff2bd6', '#22e6ff', '#ffd23f'];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    const m = new Mesh(new SphereGeometry(1.6, 8, 4), new MeshBasicMaterial({ color: new Color(neon[k % 3]).multiplyScalar(c.bright ? 0.6 : 2.2) }));
    m.position.set(Math.sin(a) * 44, 3 + (k % 2) * 3, Math.cos(a) * 44);
    m.scale.set(2.4, 0.6, 1);
    scene.add(m);
  }
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return { texture: rt.texture, dispose: () => rt.dispose() };
}
