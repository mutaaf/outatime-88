// The 3D view: a three.js renderer over the SAME simulation the 2D canvas draws. It only
// reads GameState, the track and the traffic bodies (AGENTS.md sim/render rule), and is
// loaded with a dynamic import so the 2D bundle never pays for three.js.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  DynamicDrawUsage, Fog, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  Points, PointsMaterial, Scene, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
  Float32BufferAttribute, MeshStandardMaterial, ACESFilmicToneMapping, PCFSoftShadowMap, PCFShadowMap,
} from 'three';
import { asphaltTextures, bakeEnvironment, paletteFor } from './surfaces.js';
import { ROAD_CFG } from '../data.js';
import { InputState } from '../input.js';
import { createTrackPath } from './path.js';
import { bodyPose, playerPose } from '../render-pose.js';
import { buildCar, buildObstacle, propKinds, mountainRing, NEON_CYAN, NEON_PINK } from './meshes.js';

// Simulation units → metres. Depth is stretched and the road narrowed (see path.js).
const PATH_SCALE = { zScale: 0.03, xScale: 0.005, yScale: 0.025 };
const HALF_W = ROAD_CFG.roadWidth * PATH_SCALE.xScale; // 11 m
const JUMP_SCALE = 0.016;   // playerY / body.y → metres
const CHUNK = 24;           // road segments per mesh
const BEHIND = 14;
const DEG = Math.PI / 180;
const PORTRAIT_TAN = Math.tan(23 * DEG);

// Camera rigs per GameState.cameraMode (LOW, CHASE, BUMPER → hood, HELI).
const RIGS = [
  { back: 10.5, up: 2.4, look: 22, lookUp: 1.2, lag: 7 },
  { back: 13, up: 4.6, look: 26, lookUp: 1.0, lag: 6 },
  { back: -0.2, up: 1.45, look: 40, lookUp: 1.1, lag: 0 },
  { back: 24, up: 13, look: 26, lookUp: 0, lag: 4 },
];

function skyMaterial() {
  return new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new Color() }, mid: { value: new Color() }, glow: { value: new Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.02, 0.55, h));
      c = mix(c, glow, (1.0 - smoothstep(-0.02, 0.16, h)) * 0.9);
      if (h < -0.02) c = mix(glow * 0.35, mid * 0.4, smoothstep(-0.02, -0.3, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
}

function sunMaterial() {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float t; varying vec2 vUv;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 col = mix(vec3(1.0,0.0,0.43), vec3(1.0,0.95,0.69), smoothstep(-0.9, 0.85, p.y));
      col = mix(col, vec3(1.0,0.48,0.0), smoothstep(0.2,0.0,abs(p.y-0.05))*0.5);
      float disc = 1.0 - smoothstep(0.62, 0.635, r);
      // Retro scan bands across the lower half, thicker toward the horizon.
      float y = (p.y + 0.1) * -1.0;
      float band = y > 0.0 ? step(0.5 + y * 0.9, fract(y * 9.0 - t * 0.25)) : 0.0;
      float halo = exp(-max(r - 0.6, 0.0) * 5.0) * 0.55;
      float a = max(disc * (1.0 - band), halo * (1.0 - disc));
      vec3 c = disc > 0.5 ? col : vec3(1.0, 0.3, 0.55);
      gl_FragColor = vec4(c, a); }`,
  });
}

function gridMaterial() {
  return new ShaderMaterial({
    transparent: false, fog: false,
    uniforms: { base: { value: new Color('#090314') }, line: { value: new Color(NEON_PINK) }, far: { value: new Color() }, origin: { value: new Vector3() }, strength: { value: 1 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 base; uniform vec3 line; uniform vec3 far; uniform vec3 origin; uniform float strength; varying vec3 vW;
      void main(){ vec2 g = vW.xz / 14.0; vec2 d = abs(fract(g - 0.5) - 0.5) / fwidth(g);
      float l = (1.0 - min(min(d.x, d.y), 1.0)) * strength;
      float dist = length(vW.xz - origin.xz);
      float fade = smoothstep(80.0, 900.0, dist);
      vec3 c = mix(base, line, l * (1.0 - fade * 0.85));
      gl_FragColor = vec4(mix(c, far, fade), 1.0); }`,
  });
}

/**
 * @param {object} o
 * @param {HTMLElement} o.container  element the canvas fills (the game's canvas container)
 * @param {object} o.state     GameState (read-only)
 * @param {object} o.track     the track module's container ({ segments })
 * @param {() => object} o.era active era render config (colours)
 * @param {(out: object[]) => number} o.collectCars  fills `out` with car bodies, returns count
 * @param {() => object[]} o.obstacles  obstacle bodies
 * @param {() => object} o.player  { underglow, livery colour } for the player's car
 * @param {(reason: string) => void} o.onLost  called once if WebGL dies (fall back to 2D)
 * @param {object} [o.quality]  graphics preset from src/perf/ (dpr cap, draw distance…)
 */
export function createView3D({ container, state, track, era, collectCars, obstacles, player, onLost, quality }) {
  let q = quality && quality.dpr ? quality : { dpr: 1.5, ahead: 190, cars: 14 };
  let AHEAD = q.ahead;
  const canvas = document.createElement('canvas');
  canvas.id = 'gameCanvas3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;';
  container.insertBefore(canvas, container.firstChild);

  const renderer = new WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: false });
  // Resolution is the quality governor's call (src/perf/governor.js): the tier's DPR cap,
  // eased down rung by rung when frames run long. Never above the screen's own DPR.
  let dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(dpr);
  // Filmic tone mapping: bright neon and sun roll off instead of clipping (custom sky/grid
  // shaders and unlit neon opt out, so the synthwave colours stay punchy).
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = q.shadows > 0;
  renderer.shadowMap.type = q.softShadows ? PCFSoftShadowMap : PCFShadowMap;

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (!lost) { lost = true; onLost('context-lost'); }
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(62, 1, 0.3, 2200);
  const fog = new Fog('#2a0f3d', 90, 720);
  scene.fog = fog;
  const hemi = new HemisphereLight('#ff7ad9', '#1a1035', 0.95);
  const sunLight = new DirectionalLight('#ffc48a', 1.1);
  // The sun/moon casts real shadows on MEDIUM+ (map size per tier), in a tight box that
  // rides with the player, so a 1k map still gives crisp car shadows.
  sunLight.castShadow = q.shadows > 0;
  sunLight.shadow.mapSize.set(q.shadows || 512, q.shadows || 512);
  const sc = sunLight.shadow.camera;
  sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 20; sc.far = 260;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.04;
  scene.add(hemi, sunLight, sunLight.target);

  // Sky dome, stars, sun, mountains and the neon grid all ride with the camera.
  const skyMat = skyMaterial();
  const sky = new Mesh(new SphereGeometry(1800, 24, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const a = (Math.sin(i * 12.9898) * 43758.5453) % 1, b = (Math.sin(i * 78.233) * 12543.21) % 1;
    const az = Math.abs(a) * Math.PI * 2, el = 0.12 + Math.abs(b) * 1.3;
    starPos[i * 3] = Math.cos(el) * Math.sin(az) * 1700;
    starPos[i * 3 + 1] = Math.sin(el) * 1700;
    starPos[i * 3 + 2] = Math.cos(el) * Math.cos(az) * 1700;
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75 }));
  scene.add(stars);
  const sunMat = sunMaterial();
  const sun = new Mesh(new PlaneGeometry(520, 520), sunMat);
  sun.renderOrder = -9;
  scene.add(sun);
  const mountains = mountainRing(1350, '#16092b', NEON_PINK);
  mountains.renderOrder = -8;
  scene.add(mountains);
  const gridMat = gridMaterial();
  const grid = new Mesh(new PlaneGeometry(2400, 2400), gridMat);
  grid.rotation.x = -Math.PI / 2;
  scene.add(grid);

  // ── Road chunks ────────────────────────────────────────────────────────────
  const path = createTrackPath(PATH_SCALE);
  const chunks = new Map();
  // The road is real asphalt (PBR, procedural maps); vertex colours only tint it (booster pads,
  // ramps, kerbs). Rain eras turn the roughness down so the deck mirrors the sky and neon.
  const asph = asphaltTextures();
  const deckMat = new MeshStandardMaterial({
    vertexColors: true, map: asph.map, roughnessMap: asph.roughnessMap, normalMap: asph.normalMap,
    roughness: 1, metalness: 0, envMapIntensity: 1,
  });
  const neonMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  // LOW skips the soft additive glow passes (rail glow on the ground, lamp halos).
  const glowMats = [glowMat];
  const applyGlow = () => { for (let i = 0; i < glowMats.length; i++) glowMats[i].visible = q.glow !== false; };
  const pose = { x: 0, y: 0, z: 0, heading: 0 };
  const bp = { z: 0, offset: 0, y: 0, rot: 0, yaw: 0 };   // body render pose
  const pp = { z: 0, x: 0, y: 0 };                         // player render pose
  const tmpCol = new Color();
  const tmpCol2 = new Color();

  function segColor(seg, e, out) {
    const alt = (Math.floor(seg.index / 10) % 2) === 0;
    if (seg.trackType === 'BOOSTER') return out.set(alt ? '#ea580c' : '#d9460f');
    if (seg.trackType === 'JUMP_RAMP') return out.set(alt ? '#f59e0b' : '#d97706');
    if (seg.trackType === 'CHECKPOINT') return out.set(seg.index % 2 ? '#f8fafc' : '#1e1b2e');
    // Asphalt: near-neutral with a whisper of the era's road colour, and patched sections.
    out.set('#c9c7cc').lerp(tmpCol2.set(e.trackA), 0.1);
    return alt ? out : out.multiplyScalar(0.9);
  }

  function buildChunk(c, e) {
    const pos = [], col = [], uv = [], npos = [], ncol = [], gpos = [], gcol = [];
    // Deck quads carry UVs: u across the road (six ~3.7 m asphalt tiles), v along it.
    const quadUV = (a, b, cc, d, color, u0, u1, v0, v1) => {
      quad(pos, col, a, b, cc, d, color);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    const quad = (P, C, a, b, cc, d, color) => {
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], a[0], a[1], a[2], cc[0], cc[1], cc[2], d[0], d[1], d[2]);
      for (let k = 0; k < 6; k++) C.push(color.r, color.g, color.b);
    };
    const quad2 = (P, C, a, b, cc, d, ca, cb) => { // a,d use ca; b,c use cb (gradient across)
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], a[0], a[1], a[2], cc[0], cc[1], cc[2], d[0], d[1], d[2]);
      C.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, ca.r, ca.g, ca.b);
    };
    const pt = (j, off, up) => {
      const segs = track.segments;
      const s = segs[Math.min(j, segs.length - 1)];
      const y = (j < segs.length ? s.p1.world.y : s.p2.world.y) * PATH_SCALE.yScale;
      const h = path.h[j], cx = path.x[j], cz = path.z[j];
      const lat = off * HALF_W;
      return [cx + Math.cos(h) * lat, y + up, -(cz - Math.sin(h) * lat)];
    };
    const skirt = new Color('#2a0a12'), lane = new Color('#ece6d4'), rail = new Color(NEON_CYAN), pink = new Color(NEON_PINK), black = new Color(0, 0, 0);
    const pinkGlow = new Color(NEON_PINK).multiplyScalar(0.85);
    const kerbRed = new Color('#c8102e'), kerbWhite = new Color('#e8e8ea'), edgeLine = new Color('#f2f2f2');
    for (let i = c * CHUNK; i < (c + 1) * CHUNK; i++) {
      const seg = track.segments[i];
      if (!seg) break;
      const j = i, k = i + 1;
      segColor(seg, e, tmpCol);
      // Deck (between the kerbs), red/white kerbs, solid edge lines, underside skirts.
      const v0 = i * 1.6, v1 = (i + 1) * 1.6;
      quadUV(pt(j, -0.93, 0), pt(j, 0.93, 0), pt(k, 0.93, 0), pt(k, -0.93, 0), tmpCol, 0.1, 5.9, v0, v1);
      const kerb = (Math.floor(i / 2) % 2) ? kerbRed : kerbWhite;
      quadUV(pt(j, -1, 0.04), pt(j, -0.93, 0.04), pt(k, -0.93, 0.04), pt(k, -1, 0.04), kerb, 0, 0.1, v0, v1);
      quadUV(pt(j, 0.93, 0.04), pt(j, 1, 0.04), pt(k, 1, 0.04), pt(k, 0.93, 0.04), kerb, 5.9, 6, v0, v1);
      quadUV(pt(j, -0.905, 0.02), pt(j, -0.89, 0.02), pt(k, -0.89, 0.02), pt(k, -0.905, 0.02), edgeLine, 0.3, 0.33, v0, v1);
      quadUV(pt(j, 0.89, 0.02), pt(j, 0.905, 0.02), pt(k, 0.905, 0.02), pt(k, 0.89, 0.02), edgeLine, 5.67, 5.7, v0, v1);
      quad(npos, ncol, pt(j, -1.02, -2.2), pt(j, -1.02, 0), pt(k, -1.02, 0), pt(k, -1.02, -2.2), skirt);
      quad(npos, ncol, pt(j, 1.02, 0), pt(j, 1.02, -2.2), pt(k, 1.02, -2.2), pt(k, 1.02, 0), skirt);
      // Lane dashes and the boost flames.
      if (i % 4 < 2) {
        for (const o of [-0.34, 0.34]) quadUV(pt(j, o - 0.012, 0.015), pt(j, o + 0.012, 0.015), pt(k, o + 0.012, 0.015), pt(k, o - 0.012, 0.015), lane, (o + 1) * 3 - 0.036, (o + 1) * 3 + 0.036, v0, v1);
      }
      if (seg.trackType === 'BOOSTER') {
        for (const o of [-0.22, 0.22]) quad(npos, ncol, pt(j, o - 0.012, 0.035), pt(j, o + 0.012, 0.035), pt(k, o + 0.012, 0.035), pt(k, o - 0.012, 0.035), rail);
      }
      // Neon rails (inner face + top) and their glow on the ground outside.
      for (const s of [-1, 1]) {
        quad(npos, ncol, pt(j, s * 1.0, 0), pt(j, s * 1.0, 0.55), pt(k, s * 1.0, 0.55), pt(k, s * 1.0, 0), s < 0 ? rail : pink);
        quad(npos, ncol, pt(j, s * 1.0, 0.55), pt(j, s * 1.025, 0.55), pt(k, s * 1.025, 0.55), pt(k, s * 1.0, 0.55), s < 0 ? rail : pink);
        quad2(gpos, gcol, pt(j, s * 1.03, 0.02), pt(j, s * 1.32, -0.3), pt(k, s * 1.32, -0.3), pt(k, s * 1.03, 0.02), pinkGlow, black);
      }
    }
    const grp = new Group();
    const mk = (P, C, mat) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(P, 3));
      g.setAttribute('color', new Float32BufferAttribute(C, 3));
      if (mat === deckMat) { g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); }
      const m = new Mesh(g, mat);
      grp.add(m);
      return m;
    };
    mk(pos, col, deckMat).receiveShadow = true;
    mk(npos, ncol, neonMat);
    mk(gpos, gcol, glowMat).renderOrder = 1;
    return grp;
  }

  function disposeChunk(grp) {
    scene.remove(grp);
    grp.children.forEach((m) => m.geometry.dispose());
  }

  function syncRoad(playerSeg, e, eraKey) {
    if (path.source !== track.segments || eraKey !== lastEraKey) {
      chunks.forEach(disposeChunk);
      chunks.clear();
      lastEraKey = eraKey;
    }
    path.sync(track.segments);
    const lo = Math.max(0, Math.floor((playerSeg - BEHIND) / CHUNK));
    const hi = Math.floor((playerSeg + AHEAD) / CHUNK);
    chunks.forEach((grp, c) => { if (c < lo || c > hi) { disposeChunk(grp); chunks.delete(c); } });
    let built = 0;
    for (let c = lo; c <= hi && built < 3; c++) {
      if (chunks.has(c)) continue;
      if ((c + 1) * CHUNK > path.count) break; // not generated yet
      const grp = buildChunk(c, e);
      scene.add(grp);
      chunks.set(c, grp);
      built++;
    }
  }
  let lastEraKey = '';

  // ── Instanced props and pickups ────────────────────────────────────────────
  const kinds = propKinds();
  const props = {};
  for (const [k, def] of Object.entries(kinds)) {
    const m = new InstancedMesh(def.geo, def.mat, def.cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    if (def.billboard) { m.renderOrder = 3; if (k === 'LAMP_GLOW') glowMats.push(def.mat); }
    else if (!def.mat.transparent) m.castShadow = true;
    scene.add(m);
    props[k] = { mesh: m, def, n: 0 };
  }
  applyGlow();
  const dummy = new Object3D();
  function placeProp(kind, x, y, z, yaw, scale = 1, spin = 0) {
    const p = props[kind];
    if (!p || p.n >= p.def.cap) return;
    dummy.position.set(x, y, z);
    if (p.def.billboard) dummy.quaternion.copy(camera.quaternion);
    else { dummy.rotation.set(0, yaw + spin, 0); }
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    p.mesh.setMatrixAt(p.n++, dummy.matrix);
  }

  function syncProps(playerSeg, t) {
    for (const k in props) props[k].n = 0;
    const segs = track.segments;
    const end = Math.min(segs.length, playerSeg + AHEAD, path.count);
    for (let i = Math.max(0, playerSeg - BEHIND); i < end; i++) {
      const items = segs[i].items;
      if (!items || items.length === 0) continue;
      for (let q = 0; q < items.length; q++) {
        const it = items[q];
        if (it.collected) continue;
        path.at(i * ROAD_CFG.segLength, it.offset, pose);
        const x = pose.x, y = pose.y, z = -pose.z, yaw = -pose.heading;
        switch (it.type) {
          case 'PALM_TREE': placeProp('PALM_TREE', x, y - 2, z, yaw + i, 1 + ((i * 13) % 5) * 0.06); break;
          case 'STREET_LAMP': {
            const side = it.offset < 0 ? Math.PI : 0;
            placeProp('STREET_LAMP', x, y - 2, z, yaw + side);
            path.at(i * ROAD_CFG.segLength, it.offset - Math.sign(it.offset) * 0.21, pose);
            placeProp('LAMP_GLOW', pose.x, pose.y + 5.1, -pose.z, 0);
            break;
          }
          case 'SIGN_88': placeProp('SIGN_88', x, y - 1, z, yaw); placeProp('SIGN_POST', x, y - 1, z, yaw); break;
          case 'CLOCK_TOWER_BILLBOARD': placeProp('CLOCK_TOWER_BILLBOARD', x, y - 2, z, yaw); placeProp('CLOCK_FACE', x, y - 2, z, yaw); break;
          case 'ARCH_HW': placeProp('ARCH_HW', x, y - 1, z, yaw); break;
          case 'OVERHEAD_GATE': placeProp('OVERHEAD_GATE', x, y, z, yaw); break;
          case 'MC_FLARE_GREEN': placeProp('MC_FLARE_GREEN', x, y, z, 0); break;
          case 'HW_COIN': case 'PLUTONIUM': case 'REPAIR_WRENCH': {
            const bob = 1.4 + Math.sin(t * 3 + (it.phase || 0)) * 0.25;
            placeProp(it.type, x, y + bob, z, yaw, 1, t * 3 + (it.phase || 0));
            placeProp('PICKUP_GLOW', x, y + bob, z, 0, it.type === 'HW_COIN' ? 0.9 : 1.3);
            break;
          }
          default: break;
        }
      }
    }
    for (const k in props) {
      const p = props[k];
      p.mesh.count = p.n;
      p.mesh.visible = p.n > 0; // an empty kind costs no draw call
      if (p.n) p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ── Cars ───────────────────────────────────────────────────────────────────
  const carPool = new Map(); // key → [groups]
  const carsOut = [];
  const usedCars = [];
  function takeCar(style, length, width, police) {
    const key = style + '|' + length.toFixed(1) + '|' + width.toFixed(1) + (police ? '|P' : '');
    let list = carPool.get(key);
    if (!list) { list = []; carPool.set(key, list); }
    for (let i = 0; i < list.length; i++) if (!list[i].visible) { list[i].visible = true; return list[i]; }
    const g = buildCar(style, length, width, { police });
    castShadows(g);
    list.push(g);
    scene.add(g);
    return g;
  }

  function castShadows(g) {
    g.traverse((m) => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
  }
  const playerCar = buildCar('TIME_CAR', 6.6, 3.0);
  castShadows(playerCar);
  scene.add(playerCar);

  function poseCar(g, trackZ, offset, lift, yawExtra, roll, pitch) {
    path.at(trackZ, offset, pose);
    g.position.set(pose.x, pose.y + lift, -pose.z);
    g.rotation.set(pitch, -pose.heading + yawExtra, roll, 'YXZ');
  }

  function syncCars(t, dt) {
    for (let i = 0; i < usedCars.length; i++) usedCars[i].visible = false;
    usedCars.length = 0;
    const n = collectCars(carsOut);
    let drawn = 0;
    const pz = playerZ();
    for (let i = 0; i < n; i++) {
      const b = carsOut[i];
      if (b.takenDown) continue;
      bodyPose(b, bp);
      const dz = bp.z - pz;
      if (dz < -3000 || dz > AHEAD * ROAD_CFG.segLength || drawn >= q.cars) continue;
      drawn++;
      const style = b.style === 'SEMI_TRUCK' ? 'SEMI_TRUCK' : (b.style || 'SEDAN');
      const length = Math.max(4, (b.halfL || 110) * 2 * PATH_SCALE.zScale);
      const width = Math.max(2.4, (b.halfW || 0.14) * 2 * HALF_W);
      const police = b.type === 'POLICE_INTERCEPTOR';
      const g = takeCar(style, length, width, police);
      usedCars.push(g);
      g.userData.paint.color.set(b.bodyColor || '#94a3b8');
      g.userData.glow.color.set(b.underglow || (b.kind === 'RIVAL' ? NEON_PINK : '#000000'));
      if (g.userData.lightbar) g.userData.lightbar.material.color.set(Math.floor(t * 6) % 2 ? '#ef4444' : '#3b82f6');
      poseCar(g, bp.z, bp.offset, bp.y * JUMP_SCALE, bp.yaw * 0.35, bp.rot, 0);
    }
  }

  // ── Obstacles ──────────────────────────────────────────────────────────────
  const obsPool = new Map();
  const usedObs = [];
  function syncObstacles() {
    for (let i = 0; i < usedObs.length; i++) usedObs[i].visible = false;
    usedObs.length = 0;
    const list = obstacles();
    for (let i = 0; i < list.length; i++) {
      const ob = list[i];
      let pool = obsPool.get(ob.type);
      if (!pool) { pool = []; obsPool.set(ob.type, pool); }
      let g = null;
      for (let k = 0; k < pool.length; k++) if (!pool[k].visible) { g = pool[k]; break; }
      if (!g) { g = buildObstacle(ob.type, Math.max(3, (ob.halfW || 0.21) * 2 * HALF_W)); castShadows(g); pool.push(g); scene.add(g); }
      g.visible = true;
      usedObs.push(g);
      bodyPose(ob, bp);
      poseCar(g, bp.z, bp.offset, bp.y * JUMP_SCALE, bp.yaw, bp.rot, 0);
    }
  }

  // ── Flux fire trails (two ribbons from the rear wheels) ────────────────────
  const TRAIL_N = 48;
  const trails = [-1, 1].map((side) => {
    const posArr = new Float32Array(TRAIL_N * 2 * 3);
    const colArr = new Float32Array(TRAIL_N * 2 * 3);
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(posArr, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(colArr, 3).setUsage(DynamicDrawUsage));
    g.setIndex(idx);
    const m = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2 }));
    m.frustumCulled = false;
    m.renderOrder = 4;
    scene.add(m);
    return { side, m, posArr, colArr, xs: new Float32Array(TRAIL_N), ys: new Float32Array(TRAIL_N), zs: new Float32Array(TRAIL_N), age: new Float32Array(TRAIL_N).fill(9), head: 0, emitT: 0 };
  });
  const wheelLocal = new Vector3();
  const flame = new Color(), plasma = new Color('#38e8ff'), fire = new Color('#ff7a1a');
  function syncTrails(dt) {
    const warp = state.warpActiveTimer > 0 || state.warpFxTimer > 0;
    const active = state.status === 'PLAYING' && (warp || state.speed >= 82) && state.playerY < 8;
    flame.copy(warp ? fire : plasma);
    for (const tr of trails) {
      for (let i = 0; i < TRAIL_N; i++) tr.age[i] += dt;
      tr.emitT += dt;
      if (active && tr.emitT > 1 / 40) {
        tr.emitT = 0;
        wheelLocal.set(tr.side * 1.25, 0.06, 2.3);
        playerCar.localToWorld(wheelLocal);
        tr.head = (tr.head + 1) % TRAIL_N;
        tr.xs[tr.head] = wheelLocal.x; tr.ys[tr.head] = wheelLocal.y; tr.zs[tr.head] = wheelLocal.z; tr.age[tr.head] = 0;
      }
      // Newest → oldest, two vertices (low/high) per sample.
      for (let n = 0; n < TRAIL_N; n++) {
        const i = (tr.head - n + TRAIL_N) % TRAIL_N;
        const life = Math.max(0, 1 - tr.age[i] / (warp ? 1.6 : 0.45));
        const h = 0.55 * life;
        const o = n * 6;
        tr.posArr[o] = tr.xs[i]; tr.posArr[o + 1] = tr.ys[i]; tr.posArr[o + 2] = tr.zs[i];
        tr.posArr[o + 3] = tr.xs[i]; tr.posArr[o + 4] = tr.ys[i] + h; tr.posArr[o + 5] = tr.zs[i];
        const k = life * life;
        tr.colArr[o] = flame.r * k; tr.colArr[o + 1] = flame.g * k; tr.colArr[o + 2] = flame.b * k;
        tr.colArr[o + 3] = flame.r * k * 0.4; tr.colArr[o + 4] = flame.g * k * 0.4; tr.colArr[o + 5] = flame.b * k * 0.4;
      }
      tr.m.geometry.attributes.position.needsUpdate = true;
      tr.m.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ── Player, camera, sky ────────────────────────────────────────────────────
  function playerZ() {
    return playerPose(state, pp).z;
  }

  const camLook = new Vector3();
  const orbitPivot = new Vector3();
  const orbitOff = new Vector3();
  let orbitBack = 0; // 0..1 eased LOOK BACK
  let sunHeading = 0;
  let groundY = 0;
  let camInit = false;
  let lastRig = -1;

  function syncPlayer(dt) {
    const s = state;
    playerPose(s, pp);
    const pz = pp.z;
    const lift = pp.y * JUMP_SCALE - (s.suspOffset || 0) * 0.01;
    const roll = -((s.chassisRoll || 0) * 0.6 + (s.stuntSpinAngle || 0)) * DEG;
    const pitch = ((s.chassisPitch || 0) * 0.4 - (s.trickPitchAngle || 0)) * DEG;
    poseCar(playerCar, pz, pp.x, lift, -(s.driftAngle || 0) * 0.55 * DEG, roll, pitch);
    const p = player();
    playerCar.userData.paint.color.set(p.body || '#c9ced6');
    playerCar.userData.glow.color.set(p.underglow || NEON_CYAN);
    return pz;
  }

  // The camera is locked to the player along the track (at ~100 m/s any positional lag
  // would leave the car far ahead); only its sideways follow, height and aim are smoothed.
  let camX = 0, camUp = 0, camLookX = 0, lean = 0;
  function syncCamera(pz, dt, feel, t) {
    const s = state;
    const rigIdx = Math.max(0, Math.min(RIGS.length - 1, s.cameraMode | 0));
    const rig = RIGS[rigIdx];
    const ly = pp.y * JUMP_SCALE;
    const wantX = pp.x * (rig.lag ? 0.8 : 1), wantUp = rig.up + ly * (rig.lag ? 0.55 : 1);
    if (!camInit || rigIdx !== lastRig || rig.lag === 0) {
      camX = wantX; camUp = wantUp; camLookX = pp.x * 0.6; camInit = true; lastRig = rigIdx;
    } else {
      const k = 1 - Math.exp(-dt * rig.lag);
      camX += (wantX - camX) * k;
      camUp += (wantUp - camUp) * k;
      camLookX += (pp.x * 0.6 - camLookX) * k;
    }
    path.at(pz - rig.back / PATH_SCALE.zScale, camX, pose);
    camera.position.set(pose.x, pose.y + camUp, -pose.z);
    path.at(pz + rig.look / PATH_SCALE.zScale, camLookX, pose);
    camLook.set(pose.x, pose.y + rig.lookUp + ly * 0.3, -pose.z);
    // Shake: deterministic wobble, off under reduced motion.
    if (!s.reducedMotion) {
      const mag = (feel.shake * 0.02) + Math.min(1, s.screenShake || 0) * 0.25;
      if (mag > 0) { camera.position.x += Math.sin(t * 61) * mag; camera.position.y += Math.sin(t * 47 + 1.3) * mag; }
    }
    // Touch look (ticket 0061): drag the right side to orbit the chase camera around the car,
    // pinch to change the chase distance, hold LOOK BACK to swing round. Springs back in the
    // input layer, so this only reads InputState. The hood cam (lag 0) stays put.
    orbitBack += ((InputState.lookBack ? 1 : 0) - orbitBack) * Math.min(1, dt * 10);
    const yaw = (InputState.lookYaw || 0) * 1.9 + orbitBack * Math.PI;
    const pitch = (InputState.lookPitch || 0) * 0.45;
    const zoom = InputState.lookZoom || 1;
    if (rig.lag !== 0 && (yaw !== 0 || pitch !== 0 || zoom !== 1)) {
      path.at(pz, pp.x, pose);
      orbitPivot.set(pose.x, pose.y + 1.1 + ly, -pose.z);
      orbitOff.subVectors(camera.position, orbitPivot).multiplyScalar(zoom);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const ox = orbitOff.x * c - orbitOff.z * sn;
      orbitOff.z = orbitOff.x * sn + orbitOff.z * c;
      orbitOff.x = ox;
      orbitOff.y = Math.max(0.6, orbitOff.y + pitch * orbitOff.length());
      camera.position.addVectors(orbitPivot, orbitOff);
      // Aim between the road ahead and the car as the orbit grows.
      const w = Math.min(1, Math.abs(yaw) / 1.2 + Math.abs(pitch));
      camLook.lerp(orbitPivot, w);
    }
    camera.lookAt(camLook);
    // A little lean into the corner and with the chassis roll, like a real chase cam.
    if (rig.lag !== 0 && !s.reducedMotion) {
      lean += ((-(s.chassisRoll || 0) * 0.35 - (s.playerVX || 0) * 0.8) * DEG - lean) * Math.min(1, dt * 4);
      camera.rotateZ(Math.max(-0.06, Math.min(0.06, lean)));
    }
    const warpKick = (!s.reducedMotion && s.warpFxTimer > 0) ? (s.warpFxTimer / 0.9) * 16 : 0;
    // Portrait phones/tablets: widen the vertical FOV so the road keeps ~46° across.
    const base = camera.aspect < 1 ? Math.min(85, Math.max(60, 2 * Math.atan(PORTRAIT_TAN / camera.aspect) / DEG)) : 60;
    const fov = base + (feel.fov - 1) * 160 + warpKick;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    path.at(pz, 0, pose);
    sunHeading += (pose.heading - sunHeading) * Math.min(1, dt * 0.6);
    groundY += ((pose.y - 9) - groundY) * Math.min(1, dt * 2);
  }

  // ── Era lighting: palette, image-based light, fog ──────────────────────────
  // Each era (src/era-palettes.js, shared with the 2D scenes) sets the sky, the key light,
  // the fog and — on MEDIUM+ — a PMREM environment baked from that same sky, which lights
  // every PBR surface and gives wet asphalt and car paint something real to reflect.
  let env = null;
  let litEra = '';
  let pal = paletteFor(null);
  function syncEra(e) {
    const id = (e.id || '') + (q.env ? '|env' : '');
    if (id === litEra) return;
    litEra = id;
    pal = paletteFor(e);
    if (env) { env.dispose(); env = null; }
    if (q.env) {
      try { env = bakeEnvironment(renderer, e); } catch { env = null; }
    }
    scene.environment = env ? env.texture : null;
    stats.env = Boolean(env);
    const wet = pal.wet;
    deckMat.roughness = wet ? 0.5 : 1;
    deckMat.envMapIntensity = wet ? 0.75 : 0.45;
    deckMat.normalScale.set(wet ? 0.25 : 0.45, wet ? 0.25 : 0.45);
    sunLight.color.set(pal.sun);
    sunLight.intensity = pal.bright ? 2.6 : 1.5;
    hemi.color.set(pal.bright ? '#bfe3ff' : pal.horizon);
    hemi.groundColor.set(pal.ground);
    hemi.intensity = env ? (pal.bright ? 0.6 : 0.35) : (pal.bright ? 1.4 : 0.95);
    // The neon grid is the cyber world's floor; real-world eras get ground with a faint grid.
    gridMat.uniforms.line.value.set(e.id === '2088' ? NEON_PINK : pal.horizon);
    gridMat.uniforms.strength.value = e.id === '2088' ? 1 : (pal.bright ? 0.05 : 0.22);
  }

  function syncSky(e, t) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    syncEra(e);
    skyMat.uniforms.top.value.set(pal.top);
    skyMat.uniforms.mid.value.set(pal.mid);
    skyMat.uniforms.glow.value.set(pal.horizon);
    sky.position.set(cx, cy, cz);
    stars.position.set(cx, cy, cz);
    stars.visible = e.id !== '1955'; // the one daytime era
    mountains.position.set(cx, groundY, cz);
    const fx = Math.sin(sunHeading), fz = -Math.cos(sunHeading);
    sun.position.set(cx + fx * 1500, groundY + 150, cz + fz * 1500);
    sun.lookAt(camera.position);
    sunMat.uniforms.t.value = t;
    if (!sunLight.castShadow) {
      sunLight.position.set(cx + fx * 400, cy + 260, cz + fz * 400);
      sunLight.target.position.set(cx, cy, cz);
    }
    fog.color.set(pal.fog).lerp(tmpCol.set(pal.horizon), 0.2).multiplyScalar(pal.bright ? 1 : 0.8);
    // Fog ends where the road does, so the draw distance (a quality setting) never pops.
    fog.far = AHEAD * ROAD_CFG.segLength * PATH_SCALE.zScale * 0.95;
    fog.near = pal.dusty ? 40 : fog.far * 0.14;
    const sh = sunLight.shadow.camera;
    if (sunLight.castShadow) {
      // Keep the shadow box centred just ahead of the car.
      const pc = playerCar.position;
      sunLight.target.position.set(pc.x - Math.sin(-sunHeading) * 14, pc.y, pc.z - Math.cos(sunHeading) * 14);
      sunLight.position.set(sunLight.target.position.x + fx * 90, pc.y + 120, sunLight.target.position.z + fz * 90);
      sh.updateProjectionMatrix();
    }
    grid.position.set(Math.round(cx / 14) * 14, groundY, Math.round(cz / 14) * 14);
    gridMat.uniforms.origin.value.set(cx, groundY, cz);
    gridMat.uniforms.far.value.copy(fog.color);
    gridMat.uniforms.base.value.set(pal.ground).multiplyScalar(pal.bright ? 0.9 : 0.7);
  }

  // ── Size and adaptive resolution ───────────────────────────────────────────
  let sizeDirty = true;
  const markDirty = () => { sizeDirty = true; };
  window.addEventListener('resize', markDirty);
  window.addEventListener('orientationchange', markDirty);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(markDirty) : null;
  if (ro) ro.observe(container);
  function syncSize() {
    if (!sizeDirty) return;
    sizeDirty = false;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const stats = { frames: 0, dpr, chunks: 0, cars: 0, drawCalls: 0, triangles: 0, step: q.step || 0, env: false, shadows: 0 };

  let clock = 0;
  return {
    canvas,
    stats,
    /** Draw one frame. `feel` is fx.speedFeel() for this frame. */
    render(dt, feel) {
      if (lost) return;
      clock += dt;
      syncSize();
      const e = era();
      const pz = playerZ();
      const playerSeg = Math.floor(pz / ROAD_CFG.segLength);
      syncRoad(playerSeg, e, e.id || '');
      const pzDrawn = syncPlayer(dt);
      syncCamera(pzDrawn, dt, feel, clock);
      syncProps(playerSeg, clock);
      syncCars(clock, dt);
      syncObstacles();
      syncTrails(dt);
      syncSky(e, clock);
      renderer.render(scene, camera);
      stats.frames++;
      stats.dpr = dpr;
      stats.chunks = chunks.size;
      stats.cars = usedCars.length;
      stats.drawCalls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.shadows = sunLight.castShadow ? sunLight.shadow.mapSize.x : 0;
    },
    /** A new graphics preset from the governor or the player (src/perf/gfx.js). */
    setQuality(next) {
      if (!next || !next.dpr) return;
      q = next;
      AHEAD = q.ahead;
      const want = Math.min(window.devicePixelRatio || 1, q.dpr);
      if (want !== dpr) { dpr = want; renderer.setPixelRatio(dpr); sizeDirty = true; }
      stats.step = q.step || 0;
      const shadowsOn = q.shadows > 0;
      if (shadowsOn !== renderer.shadowMap.enabled || (shadowsOn && sunLight.shadow.mapSize.x !== q.shadows)) {
        renderer.shadowMap.enabled = shadowsOn;
        renderer.shadowMap.type = q.softShadows ? PCFSoftShadowMap : PCFShadowMap;
        sunLight.castShadow = shadowsOn;
        if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
        if (shadowsOn) sunLight.shadow.mapSize.set(q.shadows, q.shadows);
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
      applyGlow();
      litEra = ''; // re-bake (or drop) the environment if `env` changed
    },
    dispose() {
      window.removeEventListener('resize', markDirty);
      window.removeEventListener('orientationchange', markDirty);
      if (ro) ro.disconnect();
      chunks.forEach(disposeChunk);
      chunks.clear();
      if (env) env.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
      canvas.remove();
    },
  };
}
