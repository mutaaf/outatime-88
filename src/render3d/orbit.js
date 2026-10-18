// The 2061 orbit era in 3D (ticket 0155): Earth far below the glass highway, generated in a
// shader (no textures, no downloads). Oceans, continents with night-side city lights, a slow
// cloud layer and a Fresnel atmosphere rim. Built lazily the first time the orbit era shows,
// so the other eras never pay for it; two draw calls while visible.
//
// The planet is a backdrop layer like the sky dome: drawn first with no depth test or write, so
// the road and cars always cover it. That lets it sit just below the camera at a scale where
// its horizon dips only a few degrees under eye level, the way a low-orbit view looks, without
// ever cutting through the highway.
import { AdditiveBlending, BackSide, Group, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

// Horizon dip below eye level = acos(radius / (radius + below)) ≈ 8°.
export const EARTH = { radius: 1700, below: 17 };

const NOISE = `
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

function earthMaterial() {
  return new ShaderMaterial({
    fog: false, toneMapped: false, depthTest: false, depthWrite: false,
    uniforms: { t: { value: 0 }, sunDir: { value: new Vector3(0.85, 0.12, -0.5).normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float t; uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        vec3 p = vN * 11.0;
        float land = smoothstep(0.5, 0.55, fbm(p));
        float cloud = smoothstep(0.5, 0.72, fbm(vN * 16.0 + vec3(t * 0.004, 0.0, t * 0.002)));
        // The terminator crosses the visible cap: day on one side, city lights on the other.
        float day = clamp(dot(vN, sunDir) * 2.2 + 0.3, 0.0, 1.0);
        vec3 ocean = mix(vec3(0.01, 0.04, 0.12), vec3(0.06, 0.36, 0.78), day);
        vec3 ground = mix(vec3(0.02, 0.04, 0.03), mix(vec3(0.22, 0.4, 0.16), vec3(0.55, 0.45, 0.28), smoothstep(0.6, 0.8, fbm(p * 1.7))), day);
        vec3 c = mix(ocean, ground, land);
        // Night-side cities: speckles on land, warm sodium orange.
        float city = step(0.86, h3(floor(vN * 900.0))) * land * smoothstep(0.35, 0.0, day);
        c += vec3(1.0, 0.7, 0.32) * city * 1.6;
        c = mix(c, vec3(0.9, 0.94, 1.0) * (0.08 + day * 0.92), cloud * 0.85);
        // Atmosphere toward the limb (view-dependent).
        vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(vN, v), 0.0), 3.0);
        c = mix(c, vec3(0.37, 0.72, 1.0), rim * 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function atmosphereMaterial() {
  return new ShaderMaterial({
    // Additive but drawn in the opaque pass (transparent: false) so it stays behind the road.
    fog: false, toneMapped: false, transparent: false, depthTest: false, depthWrite: false, side: BackSide, blending: AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(max(0.0, 1.0 - abs(dot(vN, v))), 4.0);
        gl_FragColor = vec4(vec3(0.37, 0.72, 1.0) * f * 1.6, f); }`,
  });
}

/** The planet as one Group (earth + atmosphere shell). `update` keeps it below the camera. */
export function createEarth() {
  const grp = new Group();
  const mat = earthMaterial();
  const earth = new Mesh(new SphereGeometry(EARTH.radius, 64, 40), mat);
  const atmo = new Mesh(new SphereGeometry(EARTH.radius * 1.025, 48, 24), atmosphereMaterial());
  earth.renderOrder = -9.6; atmo.renderOrder = -9.5; // after the sky dome (-10), before everything else
  earth.frustumCulled = false; atmo.frustumCulled = false;
  grp.add(earth, atmo);
  grp.visible = false;
  return {
    group: grp,
    /** Ride below the camera (the planet is "infinitely" far; only its slow spin moves). */
    update(cx, cy, cz, t) {
      grp.position.set(cx, cy - EARTH.below - EARTH.radius, cz);
      earth.rotation.y = t * 0.002;
      mat.uniforms.t.value = t;
    },
  };
}
