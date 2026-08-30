// Metaball fluid shader — ray-marched SDF metaballs rendering as a living
// fluid. One fragment shader, one draw call on a full-screen plane.
//
// Uniforms:
//   uTime       — elapsed seconds (drift + morph)
//   uAmplitude  — overall audio amplitude 0..1 (mass swell)
//   uBeat       — beat pulse 0..1 (shockwave)
//   uBass       — low-frequency energy 0..1 (mass swell)
//   uTreble     — high-frequency energy 0..1 (surface ripples)
//   uColorA     — primary brand color (vec3)
//   uColorB     — secondary brand color (vec3)
//   uShockwave  — OUTBID shockwave strength 0..1 (decays)
//   uShockCenter — shockwave origin in UV space (vec2)
//   uQuality    — 0..1 (controls march steps + metaball count)
//   uResolution — viewport resolution (vec2)

export const METABALL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const METABALL_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uAmplitude;
uniform float uBeat;
uniform float uBass;
uniform float uTreble;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uShockwave;
uniform vec2  uShockCenter;
uniform float uQuality;
uniform vec2  uResolution;

// --- Metaball field ---------------------------------------------------------

// Each metaball is a moving sphere in 3D. The field is the sum of inverse
// distance contributions. We ray-march through a slab to find the surface.

#define MAX_BALLS 8

struct Ball {
  vec3 pos;
  float radius;
};

// Procedural metaball positions — drift with time + audio.
// The arrangement fills the screen with organic, overlapping blobs.
Ball getBall(int i, float t, float amp, float bass) {
  // Base positions in a loose grid, animated with layered sines.
  float fi = float(i);
  float angle = fi * 0.7853 + t * 0.3;  // ~45deg apart, slow rotation
  float dist = 0.3 + 0.15 * sin(t * 0.5 + fi * 1.7);

  // Audio displacement — bass swells the orbit, amplitude pushes outward.
  float push = bass * 0.15 + amp * 0.1;
  dist += push;

  vec3 p = vec3(
    cos(angle) * dist + 0.1 * sin(t * 0.8 + fi),
    sin(angle) * dist + 0.1 * cos(t * 0.6 + fi * 1.3),
    0.1 * sin(t * 1.2 + fi * 2.1)
  );

  // Radius swells with bass + amplitude.
  float r = 0.12 + 0.06 * bass + 0.04 * amp + 0.02 * sin(t * 1.5 + fi);

  return Ball(p, r);
}

// SDF for a single metaball (sphere).
float sdSphere(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

// Smooth min for metaball blending (k controls blend softness).
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// The metaball field — combined SDF of all balls.
float map(vec3 p, float t, float amp, float bass) {
  float field = 1e10;
  int ballCount = int(mix(4.0, float(MAX_BALLS), uQuality));
  float k = 0.15 + 0.05 * bass;  // softer blend when bass is high

  for (int i = 0; i < MAX_BALLS; i++) {
    if (i >= ballCount) break;
    Ball b = getBall(i, t, amp, bass);
    float d = sdSphere(p, b.pos, b.radius);
    field = smin(field, d, k);
  }

  // Treble ripples — high-frequency surface perturbation.
  float ripple = uTreble * 0.02 * sin(p.x * 20.0 + t * 5.0) * sin(p.y * 20.0 + t * 4.0);
  field += ripple;

  return field;
}

// --- Ray marching -----------------------------------------------------------

// March from the camera through the fragment toward the metaball slab.
// Returns the distance to the surface, or -1 if nothing was hit.
float rayMarch(vec3 ro, vec3 rd, float t, float amp, float bass) {
  int maxSteps = int(mix(24.0, 64.0, uQuality));
  float maxDist = 3.0;
  float surfDist = 0.001;
  float d = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= maxSteps) break;
    vec3 p = ro + rd * d;
    float field = map(p, t, amp, bass);
    if (field < surfDist) return d;
    d += field;
    if (d > maxDist) return -1.0;
  }
  return -1.0;
}

// --- Normal estimation ------------------------------------------------------

vec3 getNormal(vec3 p, float t, float amp, float bass) {
  float eps = 0.002;
  vec2 e = vec2(eps, 0.0);
  float c = map(p, t, amp, bass);
  return normalize(vec3(
    map(p + e.xyy, t, amp, bass) - c,
    map(p + e.yxy, t, amp, bass) - c,
    map(p + e.yyx, t, amp, bass) - c
  ));
}

// --- Shockwave ---------------------------------------------------------------

// OUTBID shockwave — an expanding ring from uShockCenter that displaces
// the fluid surface. Decays over time via uShockwave.
float shockwaveDisplacement(vec2 uv) {
  if (uShockwave < 0.01) return 0.0;
  float dist = distance(uv, uShockCenter);
  float ringRadius = (1.0 - uShockwave) * 0.8;
  float ringWidth = 0.05;
  float ring = smoothstep(ringWidth, 0.0, abs(dist - ringRadius));
  return ring * uShockwave * 0.08;
}

// --- Main --------------------------------------------------------------------

void main() {
  vec2 uv = vUv;
  vec2 aspectUv = uv;
  aspectUv.x *= uResolution.x / uResolution.y;

  // Camera — looking down the Z axis at the metaball slab.
  vec3 ro = vec3(0.0, 0.0, 1.2);
  vec3 rd = normalize(vec3((aspectUv - 0.5) * 2.0, -1.0));

  // Add shockwave displacement to the ray direction.
  float shock = shockwaveDisplacement(uv);
  rd.xy += vec2(
    shock * sin(uv.y * 30.0 + uTime * 8.0),
    shock * cos(uv.x * 30.0 + uTime * 8.0)
  );
  rd = normalize(rd);

  // Ray-march the metaball field.
  float dist = rayMarch(ro, rd, uTime, uAmplitude, uBass);

  if (dist < 0.0) {
    // No hit — render the deep background gradient.
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    vec3 bg = mix(uColorB * 0.15, uColorA * 0.08, vignette);
    // Subtle noise texture so it's not flat.
    float n = fract(sin(dot(uv * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    bg += n * 0.008;
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  // Hit — compute the surface.
  vec3 p = ro + rd * dist;
  vec3 normal = getNormal(p, uTime, uAmplitude, uBass);

  // Lighting — a key light from above-right, a fill from below-left.
  vec3 keyDir = normalize(vec3(0.5, 0.7, 0.5));
  vec3 fillDir = normalize(vec3(-0.3, -0.4, 0.6));
  float key = max(dot(normal, keyDir), 0.0);
  float fill = max(dot(normal, fillDir), 0.0) * 0.4;

  // Fresnel — rim glow at grazing angles.
  float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);

  // Color — blend brand colors based on position + lighting.
  float colorMix = clamp(p.y * 2.0 + 0.5, 0.0, 1.0);
  vec3 baseColor = mix(uColorA, uColorB, colorMix);

  // Audio reactivity — amplitude brightens, beat adds a flash.
  vec3 color = baseColor * (0.3 + key * 0.7 + fill);
  color += baseColor * uAmplitude * 0.3;
  color += vec3(1.0) * uBeat * 0.15;
  color += baseColor * fresnel * 0.5;

  // Shockwave glow — brand-colored flash on the ring.
  color += uColorA * shock * 2.0;

  // Depth fog — distant parts of the surface fade into the background.
  float fog = 1.0 / (1.0 + dist * dist * 0.3);
  vec3 bgColor = mix(uColorB * 0.15, uColorA * 0.08, 0.5);
  color = mix(bgColor, color, fog);

  // Subtle gamma.
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
