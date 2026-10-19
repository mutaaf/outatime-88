// The 3D view: a three.js renderer over the SAME simulation the 2D canvas draws. It only
// reads GameState, the track and the traffic bodies (AGENTS.md sim/render rule), and is
// loaded with a dynamic import so the 2D bundle never pays for three.js.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  DynamicDrawUsage, Fog, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  Points, PointsMaterial, Scene, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
  Float32BufferAttribute, MeshStandardMaterial, ACESFilmicToneMapping, PCFSoftShadowMap, PCFShadowMap,
  CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Quaternion, Euler, DoubleSide, Sphere,
  BoxGeometry, LinearMipmapLinearFilter,
} from 'three';
import { asphaltTextures, bakeEnvironment, paletteFor } from './surfaces.js';
import { createEarth } from './orbit.js';
import { ROAD_CFG } from '../data.js';
import { InputState } from '../input.js';
import { createTrackPath } from './path.js';
import { featureAt } from '../track.js';
import { tyreSmokeLevel, smokeRate, createSmokePool } from '../smoke.js';
import { bodyPose, playerPose } from '../render-pose.js';
import { SPEC as BOARD, creativeFor, faceCanvas, faceGeneration, noteView } from '../billboard-art.js';
import { buildCar, buildObstacle, propKinds, mountainRing, turnWheels, bodyStyle, NEON_CYAN, NEON_PINK } from './meshes.js';

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
    uniforms: { t: { value: 0 }, space: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float t; uniform float space; varying vec2 vUv;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 col = mix(vec3(1.0,0.0,0.43), vec3(1.0,0.95,0.69), smoothstep(-0.9, 0.85, p.y));
      col = mix(col, vec3(1.0,0.48,0.0), smoothstep(0.2,0.0,abs(p.y-0.05))*0.5);
      float disc = 1.0 - smoothstep(0.62, 0.635, r);
      // Retro scan bands across the lower half, thicker toward the horizon.
      float y = (p.y + 0.1) * -1.0;
      float band = y > 0.0 ? step(0.5 + y * 0.9, fract(y * 9.0 - t * 0.25)) * (1.0 - space) : 0.0;
      // In orbit (ticket 0155) the sun is a small white-hot disc with a wide glare, no bands.
      disc = mix(disc, 1.0 - smoothstep(0.18, 0.2, r), space);
      float halo = mix(exp(-max(r - 0.6, 0.0) * 5.0) * 0.55, exp(-r * 4.0) * 0.9, space);
      float a = max(disc * (1.0 - band), halo * (1.0 - disc));
      vec3 c = disc > 0.5 ? mix(col, vec3(1.0, 0.98, 0.93), space) : mix(vec3(1.0, 0.3, 0.55), vec3(1.0, 0.93, 0.8), space);
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
 * @param {object} o.track     the track module's container (ring: seg(i), start, end, run)
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
  renderer.info.autoReset = false; // count every pass (post-processing too) in stats.drawCalls
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
  let earth = null; // the orbit era's planet (ticket 0155), built the first time it is needed

  // ── Road chunks ────────────────────────────────────────────────────────────
  const path = createTrackPath(PATH_SCALE);
  const chunks = new Map();
  // The road is real asphalt (PBR, procedural maps); vertex colours only tint it (booster pads,
  // ramps, kerbs). Rain eras turn the roughness down so the deck mirrors the sky and neon.
  const asph = asphaltTextures();
  const deckMat = new MeshStandardMaterial({
    vertexColors: true, map: asph.map, roughnessMap: asph.roughnessMap, normalMap: asph.normalMap,
    roughness: 1, metalness: 0, envMapIntensity: 1, side: DoubleSide, // loops are seen from outside too
  });
  // LOW (and software GPUs) draw the same asphalt colour map without the PBR lighting cost.
  const deckLite = new MeshLambertMaterial({ vertexColors: true, map: asph.map, side: DoubleSide });
  const deckFor = () => (q.env ? deckMat : deckLite);
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
    // Orange-track set pieces (sprint 4): loops, corkscrews and half-pipes in toy-track orange.
    const fk = seg.feature && seg.feature.kind;
    if (fk === 'LOOP' || fk === 'CORKSCREW' || fk === 'WALLRIDE') return out.set(alt ? '#ff6a13' : '#f25205');
    if (seg.trackType === 'BOOSTER') return out.set(alt ? '#ea580c' : '#d9460f');
    if (seg.trackType === 'JUMP_RAMP') return out.set(alt ? '#f59e0b' : '#d97706');
    if (seg.trackType === 'CHECKPOINT') return out.set(seg.index % 2 ? '#f8fafc' : '#1e1b2e');
    if (e.deck) return out.set(alt ? e.trackA : e.trackB).multiplyScalar(3.4); // orbit: glassy blue ribbon
    // Asphalt: near-neutral with a whisper of the era's road colour, and patched sections.
    out.set('#c9c7cc').lerp(tmpCol2.set(e.trackA), 0.1);
    return alt ? out : out.multiplyScalar(0.9);
  }

  // Road chunks are pooled (endless-track ticket): each chunk is three meshes over fixed-size
  // typed buffers sized for the busiest CHUNK segments. A chunk that falls behind is refilled
  // for the road ahead in place, so an endless road creates no geometry and frees none.
  const DECK_V = CHUNK * 7 * 6, NEON_V = CHUNK * 13 * 6, GLOW_V = CHUNK * 2 * 6;
  const freeChunks = [];
  let chunkObjects = 0;
  const A = [0, 0, 0], B = [0, 0, 0], Cc = [0, 0, 0], D = [0, 0, 0];
  const C_SKIRT = new Color('#2a0a12'), C_LANE = new Color('#ece6d4'), C_RAIL = new Color(NEON_CYAN), C_PINK = new Color(NEON_PINK), C_BLACK = new Color(0, 0, 0);
  const C_PINK_GLOW = new Color(NEON_PINK).multiplyScalar(0.85);
  const C_KERB_RED = new Color('#c8102e'), C_KERB_WHITE = new Color('#e8e8ea'), C_EDGE = new Color('#f2f2f2');
  const C_TOY = new Color('#ff6a13'), C_TOY_GLOW = new Color('#ffd166');
  const LANES = [-0.34, 0.34], BOOST_STRIPES = [-0.22, 0.22], TOY_LINES = [-0.86, -0.3, 0.3, 0.86], SIDES = [-1, 1];

  /** One pooled buffer set: positions, colours (and UVs for the deck), with a write cursor. */
  function makeBuf(cap, withUV) {
    const g = new BufferGeometry();
    const P = new Float32BufferAttribute(new Float32Array(cap * 3), 3);
    const C = new Float32BufferAttribute(new Float32Array(cap * 3), 3);
    P.setUsage(DynamicDrawUsage); C.setUsage(DynamicDrawUsage);
    g.setAttribute('position', P);
    g.setAttribute('color', C);
    let U = null;
    if (withUV) { U = new Float32BufferAttribute(new Float32Array(cap * 2), 2); U.setUsage(DynamicDrawUsage); g.setAttribute('uv', U); }
    g.boundingSphere = new Sphere();
    return { g, P: P.array, C: C.array, U: U && U.array, n: 0, cap };
  }

  function makeChunk() {
    chunkObjects++;
    const grp = new Group();
    const bufs = { deck: makeBuf(DECK_V, true), neon: makeBuf(NEON_V, false), glow: makeBuf(GLOW_V, false) };
    const deck = new Mesh(bufs.deck.g, deckFor());
    deck.receiveShadow = true;
    grp.add(deck);
    grp.add(new Mesh(bufs.neon.g, neonMat));
    const glow = new Mesh(bufs.glow.g, glowMat);
    glow.renderOrder = 1;
    grp.add(glow);
    grp.userData.deck = deck;
    grp.userData.bufs = bufs;
    return grp;
  }

  // Writers into a buffer set (no allocation): a quad is two triangles a-b-c, a-c-d.
  function vtx(bf, p, r, g, b) {
    const i = bf.n * 3;
    bf.P[i] = p[0]; bf.P[i + 1] = p[1]; bf.P[i + 2] = p[2];
    bf.C[i] = r; bf.C[i + 1] = g; bf.C[i + 2] = b;
    bf.n++;
  }
  function quad(bf, a, b, cc, d, col) {
    if (bf.n + 6 > bf.cap) return;
    vtx(bf, a, col.r, col.g, col.b); vtx(bf, b, col.r, col.g, col.b); vtx(bf, cc, col.r, col.g, col.b);
    vtx(bf, a, col.r, col.g, col.b); vtx(bf, cc, col.r, col.g, col.b); vtx(bf, d, col.r, col.g, col.b);
  }
  function quad2(bf, a, b, cc, d, ca, cb) { // a,d use ca; b,c use cb (gradient across)
    if (bf.n + 6 > bf.cap) return;
    vtx(bf, a, ca.r, ca.g, ca.b); vtx(bf, b, cb.r, cb.g, cb.b); vtx(bf, cc, cb.r, cb.g, cb.b);
    vtx(bf, a, ca.r, ca.g, ca.b); vtx(bf, cc, cb.r, cb.g, cb.b); vtx(bf, d, ca.r, ca.g, ca.b);
  }
  // Deck quads carry UVs: u across the road (six ~3.7 m asphalt tiles), v along it.
  function quadUV(bf, a, b, cc, d, col, u0, u1, v0, v1) {
    if (bf.n + 6 > bf.cap) return;
    const k = bf.n * 2, U = bf.U;
    U[k] = u0; U[k + 1] = v0; U[k + 2] = u1; U[k + 3] = v0; U[k + 4] = u1; U[k + 5] = v1;
    U[k + 6] = u0; U[k + 7] = v0; U[k + 8] = u1; U[k + 9] = v1; U[k + 10] = u0; U[k + 11] = v1;
    quad(bf, a, b, cc, d, col);
  }
  // A point on the road frame at segment boundary j: `off` half-widths right, `up` metres up
  // the road's normal (so banks, half-pipes, corkscrews and loops all just work).
  function pt(j, off, up, out) {
    const m = j & path.mask;
    const lat = off * HALF_W;
    out[0] = path.cx[m] + path.rx[m] * lat + path.ux[m] * up;
    out[1] = path.cy[m] + path.ry[m] * lat + path.uy[m] * up;
    out[2] = -(path.cz[m] + path.rz[m] * lat + path.uz[m] * up);
    return out;
  }
  /** A strip across [o0, o1] half-widths, `up` above the deck, from boundary j to k. */
  function strip(j, k, o0, o1, up) {
    pt(j, o0, up, A); pt(j, o1, up, B); pt(k, o1, up, Cc); pt(k, o0, up, D);
  }
  /** A wall at `o` half-widths from `up0` to `up1` metres, from boundary j to k. */
  function wall(j, k, o, up0, up1) {
    pt(j, o, up0, A); pt(j, o, up1, B); pt(k, o, up1, Cc); pt(k, o, up0, D);
  }

  /** Upload what was written and fit the bounding sphere to it (the tail is stale data). */
  function finishBuf(bf) {
    const g = bf.g;
    g.setDrawRange(0, bf.n);
    for (const name of ['position', 'color', 'uv']) {
      const at = g.getAttribute(name);
      if (!at) continue;
      at.clearUpdateRanges();
      at.addUpdateRange(0, bf.n * at.itemSize);
      at.needsUpdate = true;
    }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const P = bf.P;
    for (let i = 0; i < bf.n * 3; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const sp = g.boundingSphere;
    if (bf.n === 0) { sp.center.set(0, 0, 0); sp.radius = 0; return; }
    sp.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    sp.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
  }

  /** Fill pooled chunk `grp` with road chunk `c` (segments c*CHUNK … (c+1)*CHUNK-1). */
  function fillChunk(grp, c, e) {
    const { deck: dk, neon: nn, glow: gl } = grp.userData.bufs;
    dk.n = 0; nn.n = 0; gl.n = 0;
    grp.userData.deck.material = deckFor();
    for (let i = c * CHUNK; i < (c + 1) * CHUNK; i++) {
      const seg = track.seg(i);
      if (!seg) break;
      if (seg.trackType === 'GAP') continue; // the jump's gap: no road, just air
      const j = i, k = i + 1;
      segColor(seg, e, tmpCol);
      // Deck (between the kerbs), red/white kerbs, solid edge lines, underside skirts.
      const v0 = i * 1.6, v1 = (i + 1) * 1.6;
      strip(j, k, -0.93, 0.93, 0); quadUV(dk, A, B, Cc, D, tmpCol, 0.1, 5.9, v0, v1);
      const kerb = (Math.floor(i / 2) % 2) ? C_KERB_RED : C_KERB_WHITE;
      strip(j, k, -1, -0.93, 0.04); quadUV(dk, A, B, Cc, D, kerb, 0, 0.1, v0, v1);
      strip(j, k, 0.93, 1, 0.04); quadUV(dk, A, B, Cc, D, kerb, 5.9, 6, v0, v1);
      strip(j, k, -0.905, -0.89, 0.02); quadUV(dk, A, B, Cc, D, C_EDGE, 0.3, 0.33, v0, v1);
      strip(j, k, 0.89, 0.905, 0.02); quadUV(dk, A, B, Cc, D, C_EDGE, 5.67, 5.7, v0, v1);
      wall(j, k, -1.02, -2.2, 0); quad(nn, A, B, Cc, D, C_SKIRT);
      wall(j, k, 1.02, 0, -2.2); quad(nn, A, B, Cc, D, C_SKIRT);
      // Lane dashes and the boost flames.
      if (i % 4 < 2) {
        for (let q = 0; q < LANES.length; q++) {
          const o = LANES[q];
          strip(j, k, o - 0.012, o + 0.012, 0.015);
          quadUV(dk, A, B, Cc, D, C_LANE, (o + 1) * 3 - 0.036, (o + 1) * 3 + 0.036, v0, v1);
        }
      }
      if (seg.trackType === 'BOOSTER') {
        for (let q = 0; q < BOOST_STRIPES.length; q++) {
          const o = BOOST_STRIPES[q];
          strip(j, k, o - 0.012, o + 0.012, 0.035); quad(nn, A, B, Cc, D, C_RAIL);
        }
      }
      // Set pieces (0124) glow toy-track orange: lit or not (a loop's inside sits in its own
      // shade, a corkscrew is upside down), the lane grooves and edges always read.
      const fk = seg.feature && seg.feature.kind;
      if (fk === 'LOOP' || fk === 'CORKSCREW' || fk === 'WALLRIDE') {
        for (let q = 0; q < TOY_LINES.length; q++) {
          const o = TOY_LINES[q];
          strip(j, k, o - 0.02, o + 0.02, 0.03); quad(nn, A, B, Cc, D, C_TOY);
        }
        if (i % 3 === 0) { strip(j, k, -0.012, 0.012, 0.03); quad(nn, A, B, Cc, D, C_TOY_GLOW); }
      }
      // Neon rails (inner face + top) and their glow on the ground outside.
      for (let q = 0; q < SIDES.length; q++) {
        const sd = SIDES[q];
        const col = sd < 0 ? C_RAIL : C_PINK;
        wall(j, k, sd * 1.0, 0, 0.55); quad(nn, A, B, Cc, D, col);
        strip(j, k, sd * 1.0, sd * 1.025, 0.55); quad(nn, A, B, Cc, D, col);
        pt(j, sd * 1.03, 0.02, A); pt(j, sd * 1.32, -0.3, B); pt(k, sd * 1.32, -0.3, Cc); pt(k, sd * 1.03, 0.02, D);
        quad2(gl, A, B, Cc, D, C_PINK_GLOW, C_BLACK);
      }
    }
    finishBuf(dk); finishBuf(nn); finishBuf(gl);
    dk.g.computeVertexNormals();
    return grp;
  }

  function releaseChunk(grp) {
    scene.remove(grp);
    freeChunks.push(grp);
  }

  function syncRoad(playerSeg, e, eraKey) {
    if (path.source !== track.run || eraKey !== lastEraKey) {
      chunks.forEach(releaseChunk);
      chunks.clear();
      lastEraKey = eraKey;
    }
    path.sync(track);
    const lo = Math.max(0, Math.floor((Math.max(track.start, playerSeg - BEHIND)) / CHUNK));
    const hi = Math.floor((playerSeg + AHEAD) / CHUNK);
    chunks.forEach((grp, c) => { if (c < lo || c > hi) { releaseChunk(grp); chunks.delete(c); } });
    let built = 0;
    for (let c = lo; c <= hi && built < 3; c++) {
      if (chunks.has(c)) continue;
      if ((c + 1) * CHUNK > path.count) break; // not generated yet
      const grp = fillChunk(freeChunks.pop() || makeChunk(), c, e);
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
    // Pickups cut through the fog so you can line up for them early.
    if (def.spin || k === 'PICKUP_GLOW') def.mat.fog = false;
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

  // ── Billboards (docs/ADS.md): a fixed pool of lit boards, one crisp texture per campaign ──
  // Faces come from the same vector painter as 2D (src/billboard-art.js) at 1024 px (512 on
  // LOW), mipmapped with full anisotropy so text holds up at a grazing angle. Unlit and not
  // tone-mapped: a sponsor's colours read exactly as supplied, by day or by neon night.
  const BOARD_POOL = 16;
  const BOARD_REACH = 110; // segments ahead: further out a face is a few pixels anyway
  const unitPlane = new PlaneGeometry(1, 1);
  const boardBlank = new MeshBasicMaterial({ color: '#0c0e13' });
  // Every board's back panel and two legs are one instanced draw; each face is one more.
  const boardFrames = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: '#14161d' }), BOARD_POOL * 3);
  boardFrames.instanceMatrix.setUsage(DynamicDrawUsage);
  boardFrames.frustumCulled = false;
  boardFrames.castShadow = true;
  boardFrames.count = 0;
  scene.add(boardFrames);
  const boardFaces = [];
  for (let n = 0; n < BOARD_POOL; n++) {
    const face = new Mesh(unitPlane, boardBlank);
    face.visible = false;
    scene.add(face);
    boardFaces.push(face);
  }
  const bd = new Object3D();
  let nFrames = 0;
  /** One frame piece at local (lx, ly, lz) of a board at (ox, oy, oz) turned `yaw`. */
  function boardPiece(ox, oy, oz, yaw, lx, ly, lz, sx, sy, sz) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    bd.position.set(ox + lx * c + lz * sn, oy + ly, oz - lx * sn + lz * c);
    bd.rotation.set(0, yaw, 0);
    bd.scale.set(sx, sy, sz);
    bd.updateMatrix();
    boardFrames.setMatrixAt(nFrames++, bd.matrix);
  }
  const boardMats = new Map(); // `${cid}|${kind aspect}` → material (bounded: campaigns × 3 aspects)
  function boardMat(cid, kind) {
    const key = cid + '|' + BOARD[kind].key;
    let m = boardMats.get(key);
    if (m && m.userData.gen === faceGeneration()) return m;
    const tex = new CanvasTexture(faceCanvas(cid, kind, q.tier === 'low' ? 512 : 1024));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    if (!m) { m = new MeshBasicMaterial({ map: tex, toneMapped: false }); boardMats.set(key, m); }
    else { if (m.map) m.map.dispose(); m.map = tex; m.needsUpdate = true; }
    m.userData.gen = faceGeneration();
    return m;
  }
  const bc = new Vector3(), bq = new Vector3();
  function syncBoards(playerSeg, e) {
    let used = 0;
    nFrames = 0;
    const end = Math.min(track.end, playerSeg + Math.min(AHEAD, BOARD_REACH), path.count);
    const eraId = e.id || '';
    const vw = canvas.clientWidth || 1, vh = canvas.clientHeight || 1;
    for (let i = Math.max(track.start, playerSeg - 2); i < end && used < BOARD_POOL; i++) {
      const items = track.seg(i).items;
      for (let k = 0; k < items.length && used < BOARD_POOL; k++) {
        const it = items[k];
        if (it.type !== 'BILLBOARD' || !BOARD[it.kind]) continue;
        const s = BOARD[it.kind];
        const face = boardFaces[used++];
        const w = s.w * HALF_W, h = w / s.aspect, lift = s.lift * HALF_W, bez = Math.max(0.12, w * 0.022);
        path.at(i * ROAD_CFG.segLength, it.offset, pose);
        const ox = pose.x, oy = pose.y, oz = -pose.z;
        const ground = s.overhead ? 0 : -2;
        // Roadside boards toe in toward the road so they read on the approach.
        const yaw = -pose.heading + (s.overhead ? 0 : -Math.sign(it.offset) * 0.28);
        const cy = lift + h / 2;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        face.position.set(ox + 0.07 * sn, oy + cy, oz + 0.07 * c);
        face.rotation.set(0, yaw, 0);
        face.scale.set(w, h, 1);
        boardPiece(ox, oy, oz, yaw, 0, cy, 0, w + bez * 2, h + bez * 2, 0.12);
        if (s.overhead) {
          const lh = lift + h - ground, lx = w / 2 + bez + 0.2;
          boardPiece(ox, oy, oz, yaw, -lx, ground + lh / 2, 0, 0.35, lh, 0.35);
          boardPiece(ox, oy, oz, yaw, lx, ground + lh / 2, 0, 0.35, lh, 0.35);
        } else {
          const lh = lift - ground;
          boardPiece(ox, oy, oz, yaw, -w * 0.3, ground + lh / 2, -0.05, 0.18, lh, 0.18);
          boardPiece(ox, oy, oz, yaw, w * 0.3, ground + lh / 2, -0.05, 0.18, lh, 0.18);
        }
        const cid = creativeFor(it, eraId);
        face.material = boardMat(cid, it.kind);
        face.visible = true;
        // Viewability: the face's screen rect from two opposite corners.
        bc.set(ox - c * w / 2, oy + lift + h, oz + sn * w / 2).project(camera);
        bq.set(ox + c * w / 2, oy + lift, oz - sn * w / 2).project(camera);
        if (bc.z < 1 && bq.z < 1 && bc.z > -1 && bq.z > -1) {
          const x0 = (Math.min(bc.x, bq.x) + 1) / 2 * vw, x1 = (Math.max(bc.x, bq.x) + 1) / 2 * vw;
          const y0 = (1 - Math.max(bc.y, bq.y)) / 2 * vh, y1 = (1 - Math.min(bc.y, bq.y)) / 2 * vh;
          noteView(it, cid, x0, y0, x1 - x0, y1 - y0, vw, vh);
        }
      }
    }
    for (let n = used; n < BOARD_POOL; n++) boardFaces[n].visible = false;
    boardFrames.count = nFrames;
    boardFrames.visible = nFrames > 0;
    if (nFrames) boardFrames.instanceMatrix.needsUpdate = true;
    stats.boards = used;
  }

  function syncProps(playerSeg, t) {
    for (const k in props) props[k].n = 0;
    const end = Math.min(track.end, playerSeg + AHEAD, path.count);
    for (let i = Math.max(track.start, playerSeg - BEHIND); i < end; i++) {
      const items = track.seg(i).items;
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
          case 'CLOCK_TOWER_BILLBOARD': placeProp('CLOCK_TOWER_BILLBOARD', x, y - 2, z, yaw); placeProp('CLOCK_FACE', x, y - 2, z, yaw); break;
          case 'ARCH_HW': placeProp('ARCH_HW', x, y - 1, z, yaw); break;
          case 'OVERHEAD_GATE': case 'BEST_GATE': placeProp('OVERHEAD_GATE', x, y, z, yaw); break;
          case 'MC_FLARE_GREEN': placeProp('MC_FLARE_GREEN', x, y, z, 0); break;
          case 'HW_COIN': case 'PLUTONIUM': case 'REPAIR_WRENCH': case 'NOS_CAN': {
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
  // How much model detail cars get at this tier: clearcoat paint on HIGH+, rolling wheels on
  // MEDIUM+ (LOW keeps them merged into the body: no extra draw calls).
  const carDetail = () => ({ clearcoat: q.tier === 'high' || q.tier === 'ultra', wheels: q.tier === 'low' ? 'static' : 'spin' });
  let detail = carDetail();
  function takeCar(style, length, width, police, ghost) {
    const key = style + '|' + length.toFixed(1) + '|' + width.toFixed(1) + (police ? '|P' : '') + (ghost ? '|G' : '');
    let list = carPool.get(key);
    if (!list) { list = []; carPool.set(key, list); }
    for (let i = 0; i < list.length; i++) if (!list[i].visible) { list[i].visible = true; return list[i]; }
    const g = buildCar(style, length, width, { police, ...detail });
    if (ghost) makeGhost(g); else castShadows(g);
    list.push(g);
    scene.add(g);
    return g;
  }

  function castShadows(g) {
    g.traverse((m) => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
  }
  // A ghost (your rival's recorded run) is a translucent cyan car that casts no shadow.
  function makeGhost(g) {
    g.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.userData = {}; // the clone is this ghost's own: dispose it with the car
      m.material.transparent = true;
      m.material.opacity = m.material.blending === AdditiveBlending ? 0.5 : 0.38;
      m.material.depthWrite = false;
      if (m.material.emissive) { m.material.emissive.set('#22d3ee'); m.material.emissiveIntensity = 0.6; }
      m.renderOrder = 5;
    });
    g.userData.paint = g.children[0].material;
  }

  // Name tags over remote and ghost cars: one sprite per car, texture cached per name.
  const tagTex = new Map();
  function tagTexture(text) {
    let t = tagTex.get(text);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '800 34px Orbitron, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(248, x.measureText(text).width + 36);
    x.fillStyle = 'rgba(2,6,23,0.78)';
    x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 24); x.fill();
    x.strokeStyle = '#22d3ee'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#f8fafc';
    x.fillText(text, 128, 33);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    tagTex.set(text, t);
    return t;
  }
  function setTag(g, text) {
    let sp = g.userData.tag;
    if (!text) { if (sp) sp.visible = false; return; }
    if (!sp) {
      sp = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      sp.scale.set(4.4, 1.1, 1);
      sp.position.y = 3.3;
      sp.renderOrder = 6;
      g.add(sp);
      g.userData.tag = sp;
    }
    sp.visible = true;
    if (g.userData.tagText !== text) { sp.material.map = tagTexture(text); sp.material.needsUpdate = true; g.userData.tagText = text; }
  }

  function disposeCar(g) {
    scene.remove(g);
    g.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (m.material !== undefined && m.material.userData.shared !== true && m.material.dispose) m.material.dispose(); } });
  }
  function buildPlayer(shape) {
    const g = buildCar(bodyStyle(shape || 'GULLWING'), 6.6, 3.0, { clearcoat: detail.clearcoat, wheels: detail.wheels === 'static' ? 'static' : 'steer', lamps: true });
    g.userData.shape = shape;
    castShadows(g);
    scene.add(g);
    return g;
  }
  let playerCar = buildPlayer(player().shape);
  /** Rebuild cars after a quality change that alters their models. */
  function syncCarDetail() {
    const next = carDetail();
    if (next.clearcoat === detail.clearcoat && next.wheels === detail.wheels) return;
    detail = next;
    carPool.forEach((list) => list.forEach(disposeCar));
    carPool.clear();
    usedCars.length = 0;
    disposeCar(playerCar);
    playerCar = buildPlayer(player().shape);
  }

  // Cars sit on the road's frame (sprint 4): up is the road's normal, so they bank, wall-ride,
  // corkscrew and loop with it. Model forward is -Z; three's Z is the sim's -Z.
  const qFrame = new Quaternion(), qLocal = new Quaternion(), eLocal = new Euler(0, 0, 0, 'YXZ');
  const bx = new Vector3(), by = new Vector3(), bz = new Vector3(), basis = new Matrix4();
  function poseCar(g, trackZ, offset, lift, yawExtra, roll, pitch) {
    path.at(trackZ, offset, pose);
    g.position.set(pose.x + pose.ux * lift, pose.y + pose.uy * lift, -(pose.z + pose.uz * lift));
    bx.set(pose.rx, pose.ry, -pose.rz);
    by.set(pose.ux, pose.uy, -pose.uz);
    bz.set(-pose.fx, -pose.fy, pose.fz);
    qFrame.setFromRotationMatrix(basis.makeBasis(bx, by, bz));
    qLocal.setFromEuler(eLocal.set(pitch, yawExtra, roll, 'YXZ'));
    g.quaternion.multiplyQuaternions(qFrame, qLocal);
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
      if (dz < -3000 || dz > AHEAD * ROAD_CFG.segLength || (drawn >= q.cars && !b.ghost && !b.live)) continue;
      drawn++;
      const style = bodyStyle(b.shape || b.style || 'SEDAN');
      const length = Math.max(4, (b.halfL || 110) * 2 * PATH_SCALE.zScale);
      const width = Math.max(2.4, (b.halfW || 0.14) * 2 * HALF_W);
      const police = b.type === 'POLICE_INTERCEPTOR';
      const g = takeCar(style, length, width, police, Boolean(b.ghost));
      setTag(g, b.ghostTag || (b.live ? b.name : ''));
      usedCars.push(g);
      g.userData.paint.color.set(b.bodyColor || '#94a3b8');
      if (!b.ghost) g.userData.glow.color.set(b.underglow || (b.kind === 'RIVAL' ? NEON_PINK : '#000000'));
      if (g.userData.lightbar) g.userData.lightbar.material.color.set(Math.floor(t * 6) % 2 ? '#ef4444' : '#3b82f6');
      if (g.userData.setThrust) g.userData.setThrust(b.nosActive && !b.ghost ? 1 : 0, 'nos', t + i);
      // A gentle suspension bob, out of phase per car.
      const bob = Math.sin(t * 9 + i * 1.7) * 0.025 * Math.min(1, (b.mph || b.speed || 60) / 60);
      poseCar(g, bp.z, bp.offset, bp.y * JUMP_SCALE + bob, bp.yaw * 0.35, bp.rot, 0);
      const lz = g.userData.lastZ;
      g.userData.lastZ = bp.z;
      if (lz !== undefined && g.userData.axles) turnWheels(g, Math.max(0, Math.min(40, (bp.z - lz) * PATH_SCALE.zScale)));
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
        wheelLocal.set(tr.side * (playerCar.userData.trailX ?? 1.25), 0.06, 2.3); // this car's own track width
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

  // ── Tyre smoke (ticket 0133): one Points draw over a fixed pool of world-space puffs ──
  // Spawned at the rear wheels from the same tyreSmokeLevel() the 2D view and the squeal use;
  // the car drives out of them, they rise, spread and fade. Buffers are filled in place.
  const SMOKE_N = 140;
  const smoke = createSmokePool(SMOKE_N);
  const sPos = new Float32Array(SMOKE_N * 3), sSize = new Float32Array(SMOKE_N), sAlpha = new Float32Array(SMOKE_N);
  const sGeo = new BufferGeometry();
  sGeo.setAttribute('position', new BufferAttribute(sPos, 3).setUsage(DynamicDrawUsage));
  sGeo.setAttribute('size', new BufferAttribute(sSize, 1).setUsage(DynamicDrawUsage));
  sGeo.setAttribute('alpha', new BufferAttribute(sAlpha, 1).setUsage(DynamicDrawUsage));
  const sMat = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { color: { value: new Color('#d9dbe2') }, scale: { value: 600 }, fogColor: { value: new Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    vertexShader: `attribute float size; attribute float alpha; uniform float scale; varying float vA;
      #include <fog_pars_vertex>
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = size * scale / max(0.5, -mvPosition.z);
        vA = alpha * smoothstep(0.6, 2.5, -mvPosition.z); // no smoke smeared over the lens
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 color; varying float vA;
      #include <fog_pars_fragment>
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = (1.0 - smoothstep(0.12, 0.5, d)) * (0.85 + 0.15 * sin(gl_PointCoord.x * 9.0 + gl_PointCoord.y * 7.0));
        if (a * vA < 0.01) discard;
        gl_FragColor = vec4(color, a * vA);
        #include <fog_fragment>
      }`,
  });
  const smokePts = new Points(sGeo, sMat);
  smokePts.frustumCulled = false;
  smokePts.renderOrder = 5;
  scene.add(smokePts);
  let smokeEmit = 0;
  function syncSmoke(dt) {
    const lv = state.status === 'PLAYING' ? tyreSmokeLevel(state) : 0;
    smoke.update(dt, 1.2, 1.4);
    smokeEmit += dt * smokeRate(lv, q.particles == null ? 1 : q.particles, state.reducedMotion);
    while (smokeEmit >= 1) {
      smokeEmit -= 1;
      wheelLocal.set((Math.random() < 0.5 ? -1 : 1) * 1.1, 0.25, 2.1);
      playerCar.localToWorld(wheelLocal);
      const sp = 0.6 + Math.random() * 1.4;
      smoke.spawn(wheelLocal.x, wheelLocal.y, wheelLocal.z, (Math.random() - 0.5) * sp * 2, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * sp * 2,
        0.8 + Math.random() * 0.5, 1.8 + lv * 2, 0.8 + Math.random() * 0.9, 0.36 + lv * 0.34);
    }
    let n = 0;
    for (let i = 0; i < SMOKE_N; i++) {
      const p = smoke.items[i];
      if (p.life <= 0) continue;
      sPos[n * 3] = p.x; sPos[n * 3 + 1] = p.y; sPos[n * 3 + 2] = p.z;
      sSize[n] = p.size;
      sAlpha[n] = p.a * (p.life / p.maxLife) * Math.min(1, (p.maxLife - p.life) * 10);
      n++;
    }
    stats.smoke = n;
    smokePts.visible = n > 0;
    if (!n) return;
    sGeo.setDrawRange(0, n);
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.size.needsUpdate = true;
    sGeo.attributes.alpha.needsUpdate = true;
    sMat.uniforms.color.value.set(pal.bright ? '#e6e3dc' : '#c9ccd6');
    sMat.uniforms.scale.value = Math.max(1, container.clientHeight) * 0.9;
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
    poseCar(playerCar, pz, pp.x, lift, -(s.carYaw || 0), roll, pitch);
    const p = player();
    if (p.shape !== playerCar.userData.shape) { disposeCar(playerCar); playerCar = buildPlayer(p.shape); poseCar(playerCar, pz, pp.x, lift, 0, roll, pitch); }
    playerCar.userData.paint.color.set(p.body || '#c9ced6');
    playerCar.userData.glow.color.set(p.underglow || NEON_CYAN);
    // Wheels roll with the road, the front pair steers, brake lights and headlights work.
    const lz = playerCar.userData.lastZ;
    playerCar.userData.lastZ = pz;
    if (lz !== undefined) turnWheels(playerCar, Math.max(0, Math.min(40, (pz - lz) * PATH_SCALE.zScale)), -(s.steerInput || 0) * 0.32);
    playerCar.userData.setBrake(Boolean(s.braking) && s.status === 'PLAYING');
    if (playerCar.userData.setThrust) {
      const racing = s.status === 'PLAYING';
      const nosOn = racing && s.nosBurning;
      playerCar.userData.setThrust(nosOn ? 1 : racing && (s.warpActiveTimer > 0 || s.speed >= 82) ? 0.45 : 0, nosOn ? 'nos' : 'fire', s.raceTime || 0);
    }
    playerCar.userData.beams.visible = !pal.bright;
    return pz;
  }

  // The camera is locked to the player along the track (at ~100 m/s any positional lag
  // would leave the car far ahead); only its sideways follow, height and aim are smoothed.
  let camX = 0, camUp = 0, camLookX = 0, lean = 0, loopK = 0;
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
    // The chase cam rides the road's frame through set pieces (sprint 4): up the loop, round the
    // corkscrew. Calm mode keeps the horizon level instead.
    path.at(pz - rig.back / PATH_SCALE.zScale, camX, pose);
    camera.position.set(pose.x + pose.ux * camUp, pose.y + pose.uy * camUp, -(pose.z + pose.uz * camUp));
    path.at(pz, camX, pose);
    if (s.reducedMotion) camera.up.set(0, 1, 0);
    else camera.up.set(pose.ux, pose.uy, -pose.uz);
    // Round a loop the road curls up fast: aim closer so the car stays in frame (eased, no snap).
    const lf = featureAt(pz), la = featureAt(pz + rig.look / PATH_SCALE.zScale);
    const inLoop = (lf && lf.kind === 'LOOP') || (la && la.kind === 'LOOP') ? 1 : 0;
    loopK += (inLoop - loopK) * Math.min(1, dt * 3);
    const look = rig.lag === 0 ? rig.look : rig.look + (6 - rig.look) * loopK;
    path.at(pz + look / PATH_SCALE.zScale, camLookX, pose);
    const lu = rig.lookUp + ly * 0.3;
    camLook.set(pose.x + pose.ux * lu, pose.y + pose.uy * lu, -(pose.z + pose.uz * lu));
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
    chunks.forEach((grp) => { grp.userData.deck.material = deckFor(); });
    stats.env = Boolean(env);
    const wet = pal.wet;
    deckMat.roughness = wet ? 0.5 : 1;
    deckMat.envMapIntensity = wet ? 0.75 : 0.45;
    deckMat.normalScale.set(wet ? 0.25 : 0.45, wet ? 0.25 : 0.45);
    // Orbit: the deck is a lit glass ribbon (glossy, with a soft blue glow of its own).
    if (pal.space) { deckMat.roughness = 0.22; deckMat.metalness = 0.35; deckMat.envMapIntensity = 1.2; deckMat.normalScale.set(0.08, 0.08); }
    else deckMat.metalness = 0;
    deckMat.emissive.set(pal.space ? '#0e2f78' : '#000000');
    deckLite.emissive.set(pal.space ? '#0e2f78' : '#000000');
    if (pal.space && !earth) { earth = createEarth(); scene.add(earth.group); }
    if (earth) earth.group.visible = Boolean(pal.space);
    mountains.visible = !pal.space;
    grid.visible = !pal.space;
    sunMat.uniforms.space.value = pal.space ? 1 : 0;
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
    sun.position.set(cx + fx * 1500, groundY + (pal.space ? 420 : 150), cz + fz * 1500);
    if (earth && pal.space) earth.update(cx, cy, cz, t);
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

  // ── Weather: rain streaks or drifting dust, animated entirely on the GPU ────
  // One Points draw. Each drop's start is random in a box around the camera; the vertex
  // shader moves it with time and wraps it, so the CPU never touches the buffer again.
  const WX = 90, WY = 46, WZ = 140;
  const MAX_DROPS = 2400;
  const seeds = new Float32Array(MAX_DROPS * 3);
  for (let i = 0; i < MAX_DROPS; i++) {
    seeds[i * 3] = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    seeds[i * 3 + 1] = Math.abs(Math.sin(i * 78.233) * 12543.21) % 1;
    seeds[i * 3 + 2] = Math.abs(Math.sin(i * 39.425) * 24634.63) % 1;
  }
  const wGeo = new BufferGeometry();
  wGeo.setAttribute('position', new BufferAttribute(seeds, 3));
  const wMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { t: { value: 0 }, box: { value: new Vector3(WX, WY, WZ) }, cam: { value: new Vector3() }, color: { value: new Color('#9fb7d8') }, fall: { value: 38 }, drift: { value: 0 }, size: { value: 34 }, streak: { value: 1 } },
    vertexShader: `uniform float t; uniform vec3 box; uniform vec3 cam; uniform float fall; uniform float drift; uniform float size;
      varying float vA;
      void main(){
        vec3 p = position * box;
        p.y = mod(p.y - t * fall * (0.8 + position.z * 0.4), box.y);
        p.x = mod(p.x + t * drift + sin(t * 0.7 + position.z * 30.0) * drift * 0.3, box.x);
        // Wrap around the camera so the field always surrounds it.
        vec3 w = cam + vec3(p.x - box.x * 0.5, p.y - box.y * 0.35, p.z - box.z * 0.8);
        w.x = cam.x + mod(w.x - cam.x + box.x * 0.5, box.x) - box.x * 0.5;
        w.z = cam.z + mod(w.z - cam.z + box.z * 0.8, box.z) - box.z * 0.8;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size / max(1.0, -mv.z);
        vA = clamp(1.0 - (-mv.z) / box.z, 0.0, 1.0) * smoothstep(3.0, 12.0, -mv.z); // no giant drops on the lens
      }`,
    fragmentShader: `uniform vec3 color; uniform float streak; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = streak > 0.5 ? (1.0 - smoothstep(0.03, 0.08, abs(c.x))) * (1.0 - smoothstep(0.3, 0.5, abs(c.y)))
                               : 1.0 - smoothstep(0.15, 0.5, length(c));
        if (a < 0.02) discard;
        gl_FragColor = vec4(color * a * vA * 0.55, 1.0);
      }`,
  });
  const weather = new Points(wGeo, wMat);
  weather.frustumCulled = false;
  weather.renderOrder = 7;
  scene.add(weather);
  function syncWeather(t) {
    const want = (pal.wet || pal.dusty) && q.particles > 0.45 ? Math.round(MAX_DROPS * Math.min(1, q.particles * (pal.wet ? 0.55 : 0.35))) : 0;
    weather.visible = want > 0;
    if (!want) return;
    wGeo.setDrawRange(0, want);
    const u = wMat.uniforms;
    u.t.value = state.reducedMotion ? 0 : t;
    u.cam.value.copy(camera.position);
    u.streak.value = pal.wet ? 1 : 0;
    u.fall.value = pal.wet ? 38 : 0.6;
    u.drift.value = pal.wet ? 0 : 4;
    u.size.value = pal.wet ? 420 : 260;
    u.color.value.set(pal.wet ? '#9fb7d8' : '#d9a066');
  }

  // ── Post-processing (HIGH/ULTRA, its own lazy chunk) ────────────────────────
  let post = null, postLoading = false;
  function syncPost() {
    if (q.post && !post && !postLoading) {
      postLoading = true;
      import('./post.js').then((m) => {
        postLoading = false;
        if (!q.post || lost) return;
        post = m.createPost(renderer, scene, camera);
        sizeDirty = true;
      }).catch(() => { postLoading = false; });
    } else if (!q.post && post) {
      post.dispose();
      post = null;
    }
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
    if (post) post.setSize(w, h, dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const stats = { frames: 0, dpr, chunks: 0, cars: 0, drawCalls: 0, triangles: 0, step: q.step || 0, env: false, shadows: 0, post: false, weather: 0, wheelSpin: 0, playerShape: '', smoke: 0 };

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
      syncBoards(playerSeg, e);
      syncCars(clock, dt);
      syncObstacles();
      syncTrails(dt);
      syncSmoke(dt);
      syncSky(e, clock);
      syncWeather(clock);
      syncPost();
      renderer.info.reset();
      if (post) {
        post.setWarp(state.warpFxTimer > 0 && !state.reducedMotion ? state.warpFxTimer / 0.9 : 0);
        post.render();
      } else {
        renderer.render(scene, camera);
      }
      stats.frames++;
      stats.dpr = dpr;
      stats.chunks = chunks.size;
      stats.chunkObjects = chunkObjects; // pooled: stays flat on an endless road
      stats.cars = usedCars.length;
      stats.drawCalls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.shadows = sunLight.castShadow ? sunLight.shadow.mapSize.x : 0;
      stats.post = Boolean(post);
      stats.weather = weather.visible ? wGeo.drawRange.count : 0;
      stats.wheelSpin = playerCar.userData.axles ? -playerCar.userData.axles[0].rotation.x : 0;
      stats.playerShape = playerCar.userData.shape || '';
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
      syncCarDetail();
      litEra = ''; // re-bake (or drop) the environment if `env` changed
    },
    dispose() {
      window.removeEventListener('resize', markDirty);
      window.removeEventListener('orientationchange', markDirty);
      if (ro) ro.disconnect();
      chunks.forEach(releaseChunk);
      chunks.clear();
      freeChunks.forEach((grp) => grp.children.forEach((m) => m.geometry.dispose()));
      freeChunks.length = 0;
      if (env) env.dispose();
      if (post) post.dispose();
      tagTex.forEach((t) => t.dispose());
      boardMats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
      canvas.remove();
    },
  };
}
