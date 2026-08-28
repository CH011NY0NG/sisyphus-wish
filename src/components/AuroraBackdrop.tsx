import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// The camera always looks downward at -PITCH; keep in sync with Scene.tsx.
const BACK_PITCH = 0.15;
const DISTANCE = 90;
const BACK_FORWARD = new THREE.Vector3(
  0,
  -Math.sin(BACK_PITCH),
  -Math.cos(BACK_PITCH),
);

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uAuroraA;
  uniform vec3 uAuroraB;
  uniform vec3 uAuroraC;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Ashima 2D simplex noise: smooth, no grid artifacts, range ~[-1, 1].
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,
      0.366025403784439,
      -0.577350269189626,
      0.024390243902439
    );
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      v += a * snoise(p);
      p = m * p + 11.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.06;
    float flow = 1.0 + uFlow * 1.0;

    // Sky base: deeper tone at the top, warm sand near the horizon.
    vec3 sky = mix(uTop, uMid, smoothstep(0.85, 0.25, uv.y));
    sky = mix(sky, uBottom, smoothstep(0.35, 0.0, uv.y));

    // Aurora layers concentrate in the upper sky, fading toward the horizon.
    float hgt = uv.y;
    float mask = smoothstep(0.05, 0.25, hgt) * (1.0 - smoothstep(0.8, 1.0, hgt));

    // Domain warp drives a gentle SIDEWAYS flow only — no vertical drift, so
    // the layers sway like soft light rather than dripping downward.
    float wt = t * flow;
    vec2 q = vec2(
      fbm(uv * vec2(2.2, 1.6) + vec2(wt * 1.2, 0.0)),
      fbm(uv * vec2(2.2, 1.6) + vec2(7.0, wt * 0.8))
    );
    vec2 wp = uv * vec2(2.6, 3.2) + vec2(q.x * 1.7, q.y * 1.5);

    float l1 = snoise(vec2(wp.x - wt * 0.7, wp.y));
    float l2 = snoise(vec2(wp.x * 1.4 + 17.0 + wt * 0.5, wp.y * 1.2));
    float l3 = snoise(vec2(wp.x * 2.0 + 41.0, wp.y * 1.5 - wt * 0.3));
    l1 = smoothstep(-0.45, 0.95, l1);
    l2 = smoothstep(-0.45, 0.95, l2);
    l3 = smoothstep(-0.5, 0.9, l3);

    vec3 auroraCol = mix(uAuroraA, uAuroraB, l1);
    auroraCol = mix(auroraCol, uAuroraC, l2 * 0.5);
    float inten =
      clamp((l1 * 0.55 + l2 * 0.4 + l3 * 0.3) * (0.8 + 0.2 * sin(uTime * 0.7 - uv.x * 2.5)), 0.0, 1.0);

    vec3 col = mix(sky, auroraCol, mask * inten * 0.55);

    // Warm glow gathering above the mountain silhouette.
    col += uBottom * exp(-hgt * 4.5) * 0.22;

    // A few sparse, twinkling stars in the deep upper sky.
    vec2 suv = uv * vec2(30.0, 20.0);
    vec2 cell = floor(suv);
    float hsh = hash(cell);
    float star = smoothstep(0.997, 1.0, hsh);
    star *= smoothstep(0.45, 0.0, length(fract(suv) - 0.5));
    star *= 0.55 + 0.45 * sin(uTime * 2.5 + hsh * 50.0);
    star *= smoothstep(0.55, 0.95, uv.y);
    col += vec3(1.0, 0.98, 0.94) * star * 0.6;

    // Blue-noise-style dither kills gradient banding on the big flat quad.
    col += (hash(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);

    // Quiet vignette at the frame edges.
    float vig = smoothstep(1.25, 0.55, length((uv - 0.5) * vec2(1.0, 1.15)));
    col *= mix(0.9, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Fullscreen aurora backdrop. The plane rides along with the camera (position
// + orientation), so it always fills the frame no matter how high the camera
// climbs. A custom shader blends tone-on-tone pastel tones into slowly drifting
// gradient ribbons; dragging (rockPanRef) speeds the shimmer up for a subtle
// interactive feel.
export default function AuroraBackdrop({
  panRef,
}: {
  panRef?: RefObject<number>;
}) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uTop: { value: new THREE.Color("#e0d5c0") },
      uMid: { value: new THREE.Color("#ede3d0") },
      uBottom: { value: new THREE.Color("#faf4e8") },
      uAuroraA: { value: new THREE.Color("#fbf5e6") },
      uAuroraB: { value: new THREE.Color("#f0e7d2") },
      uAuroraC: { value: new THREE.Color("#e2d2b2") },
    }),
    [],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (mesh) {
      // Place the plane straight ahead of the camera, facing it, so it tracks
      // the climb and the drag pan without ever leaving a gap at the edges.
      mesh.position.copy(cam.position).addScaledVector(BACK_FORWARD, DISTANCE);
      mesh.rotation.copy(cam.rotation);
    }
    const mat = materialRef.current;
    if (mat) {
      const vel = panRef?.current ?? 0;
      mat.uniforms.uFlow.value = THREE.MathUtils.lerp(
        mat.uniforms.uFlow.value,
        THREE.MathUtils.clamp(Math.abs(vel) * 0.02, 0, 1),
        Math.min(1, delta * 3),
      );
      mat.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -50]} rotation={[-BACK_PITCH, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}