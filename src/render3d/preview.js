// One car on a showroom turntable, rendered into a canvas you give it (the garage in 3D
// mode, ticket 0041). Same API as the 2D turntable (src/car-art.js createTurntable), so the
// garage swaps one for the other: set(art, locked), flourish(), yaw, dispose().
// The same archetype models as the race, PBR paint with clearcoat, the era-neutral studio
// environment and a soft contact shadow under the car.
import {
  ACESFilmicToneMapping, CircleGeometry, Color, DirectionalLight, HemisphereLight, Mesh,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { buildCar, bodyStyle, groundGlow, NEON_CYAN } from './meshes.js';
import { bakeEnvironment } from './surfaces.js';

/**
 * @param {HTMLCanvasElement} canvas  a fresh canvas (never one that has a 2D context)
 * @param {object} [o]
 * @param {boolean} [o.reducedMotion]  no idle spin
 * @param {boolean} [o.rich=true]      clearcoat, shadows and environment light
 */
export function createCarPreview(canvas, { reducedMotion = false, rich = true } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = rich;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(9.5, 4.4, 11.5);
  camera.lookAt(0, 0.9, 0);
  scene.add(new HemisphereLight('#ffd6f3', '#1a1035', rich ? 0.5 : 1.4));
  const key = new DirectionalLight('#fff1e0', 2.4);
  key.position.set(6, 10, 5);
  key.castShadow = rich;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(key);
  const rim = new DirectionalLight(NEON_CYAN, 1.2);
  rim.position.set(-7, 3, -6);
  scene.add(rim);
  const env = rich ? bakeEnvironment(renderer, { id: '1985' }) : null;
  if (env) scene.environment = env.texture;

  // The turntable: a dark glossy disc with a neon rim glow.
  const floor = new Mesh(new CircleGeometry(5.2, 48), new MeshStandardMaterial({ color: '#0d0a1c', roughness: 0.35, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = groundGlow(12, 12, NEON_CYAN, 0.16);
  ring.position.y = 0.01;
  scene.add(ring);

  let car = null, shape = null, locked = false, yaw = -0.8, raf = 0, last = 0, idleFor = 0, dragX = null;
  const onDown = (e) => { dragX = e.clientX; idleFor = 0; };
  const onMove = (e) => { if (dragX !== null) { yaw += (e.clientX - dragX) * 0.012; dragX = e.clientX; } };
  const onUp = () => { dragX = null; };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function dropCar() {
    if (!car) return;
    scene.remove(car);
    car.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (!m.material.userData.shared) m.material.dispose(); } });
    car = null;
  }

  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    idleFor += dt;
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 180;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // Keep the whole car in frame on tall (portrait) canvases.
      camera.fov = camera.aspect < 1 ? 30 / Math.max(0.55, camera.aspect) : 30;
      camera.updateProjectionMatrix();
    }
    if (dragX === null && !reducedMotion && idleFor > 0.6) yaw += dt * 0.6;
    if (car) car.rotation.y = yaw;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** art: { shape, body, cabin, glow } (the garage's artFor()); locked shows a silhouette. */
    set(art, isLocked) {
      if (!art) return;
      if (art.shape !== shape) {
        dropCar();
        shape = art.shape;
        car = buildCar(bodyStyle(shape || 'GULLWING'), 6.6, 3.0, { clearcoat: rich, wheels: 'spin' });
        car.traverse((m) => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
        car.position.y = 0.02;
        scene.add(car);
      }
      locked = Boolean(isLocked);
      car.userData.paint.color.set(locked ? '#0b0b12' : (art.body || '#c9ced6'));
      car.userData.glow.color.set(new Color(locked ? '#334155' : (art.glow || NEON_CYAN)));
    },
    flourish() { yaw -= Math.PI * 0.5; idleFor = 1; },
    get yaw() { return yaw; },
    get locked() { return locked; },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dropCar();
      if (env) env.dispose();
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
      renderer.dispose();
    },
  };
}
