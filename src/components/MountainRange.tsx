import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";
import {
  buildMountainGeometry,
  buildRockGeometry,
  ridgeHeightAt,
  type MountainParams,
} from "../lib/mountain";

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vViewPosition;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  uniform float uRimPower;

  varying vec3 vColor;
  varying vec3 vViewPosition;

  void main() {
    // Flat facet normal derived from screen-space derivatives.
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    vec3 viewDir = normalize(vViewPosition);
    float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), uRimPower);
    vec3 outColor = mix(
      vColor,
      uRimColor,
      clamp(rim * uRimStrength, 0.0, 1.0)
    );
    gl_FragColor = vec4(outColor, 1.0);
  }
`;

// Glowing low-poly orb shader: per-facet fresnel (flat normals from screen
// derivatives) from a bright luminous core to a white-hot rim.
const ORB_VERTEX_SHADER = /* glsl */ `
  varying vec3 vViewPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ORB_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec3 vViewPosition;

  void main() {
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    float fres = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 1.8);
    vec3 col = mix(uCore, uGlow, fres);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// A glowing low-poly orb that rolls with the drag and publishes its world x so
// the camera can follow (clamped). Reaching the peak signals the confirm
// button; pressing it makes the rock auto-roll down the descending slope.
function RidgeRock({
  width,
  params,
  rockWorldXRef,
  rockPanRef,
  onAtPeak,
  rollDownRef,
  onRollDownDone,
  pastPeakRef,
  behindMountainRef,
}: {
  width: number;
  params: MountainParams;
  rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  onAtPeak: (v: boolean) => void;
  rollDownRef: RefObject<{ active: boolean; targetXM: number }>;
  onRollDownDone: () => void;
  pastPeakRef: RefObject<boolean>;
  behindMountainRef: RefObject<boolean>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const rockXMRef = useRef(-params.rockRadius * 2);
  const prevXRef = useRef(0);
  const atPeakRef = useRef(false);
  const S = params.rockRadius * 4;
  const ROLL_DOWN_SPEED = 90;

  const rockGeometry = useMemo(
    () => buildRockGeometry(params.rockDetail, params.rockRough),
    [params.rockDetail, params.rockRough],
  );

  const orbUniforms = useRef({
    uCore: {
      value: new THREE.Color(params.rockColor).lerp(
        new THREE.Color("#ffffff"),
        0.18,
      ),
    },
    uGlow: {
      value: new THREE.Color(params.rockColor).lerp(
        new THREE.Color("#ffffff"),
        0.8,
      ),
    },
  }).current;

  useEffect(() => {
    // Bright luminous core with white-hot rim.
    const t = THREE.MathUtils.clamp(params.rockGlow / 200, 0, 1);
    const c = new THREE.Color(params.rockColor);
    (orbUniforms.uCore.value as THREE.Color).copy(c).lerp(
      new THREE.Color("#ffffff"),
      0.1 + 0.2 * t,
    );
    (orbUniforms.uGlow.value as THREE.Color).copy(c).lerp(
      new THREE.Color("#ffffff"),
      0.8,
    );
  }, [params, orbUniforms]);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = params.rockEnabled;
    if (!params.rockEnabled || params.rockRadius <= 0) return;

    const vel = rockPanRef.current ?? 0;
    let nextXM = rockXMRef.current;

    if (rollDownRef.current.active) {
      // Auto-roll: down the descending slope into the flat space behind the
      // mountain, stopping at the CENTER of that space (mirroring the front).
      if (rollDownRef.current.targetXM <= 0) {
        rollDownRef.current.targetXM = 2 * width + S / 2;
      }
      nextXM += ROLL_DOWN_SPEED * delta;
      // Unlock the behind space as soon as the rock passes the mountain end so
      // the camera keeps following without stopping.
      if (nextXM >= 2 * width) {
        behindMountainRef.current = true;
      }
      if (nextXM >= rollDownRef.current.targetXM) {
        nextXM = rollDownRef.current.targetXM;
        rollDownRef.current.active = false;
        onRollDownDone();
      }
    } else {
      // Roll with the drag velocity so dragging LEFT moves the view rightward
      // (up the mountain) and dragging RIGHT moves it back down — the mountain
      // follows your finger.
      nextXM += vel * 60 * delta;
      let clampMin = -S / 2;
      let clampMax = pastPeakRef.current ? 2 * width : width;
      if (behindMountainRef.current) {
        // The rock rolls freely between the center of the front floor and the
        // center of the space behind the mountain.
        clampMin = -S / 2;
        clampMax = 2 * width + S / 2;
      }
      nextXM = THREE.MathUtils.clamp(nextXM, clampMin, clampMax);
    }
    rockXMRef.current = nextXM;

    // Signal when the rock is parked at the peak so the confirm button shows.
    const atPeak = Math.abs(nextXM - width) < 0.05;
    if (atPeak !== atPeakRef.current) {
      atPeakRef.current = atPeak;
      onAtPeak(atPeak);
    }

    // Off the mountain (x < 0) the ground is flat at the scene bottom.
    const groundY = Math.max(0, ridgeHeightAt(nextXM, width, params));
    const y = groundY + params.rockRadius;
    mesh.position.set(nextXM, y, 0);
    mesh.rotation.z += (prevXRef.current - nextXM) / params.rockRadius;
    prevXRef.current = nextXM;

    // Publish the rock's world x so the follow camera can track it.
    rockWorldXRef.current = S + nextXM;
  });

  return (
    <group>
      <mesh
        ref={ref}
        geometry={rockGeometry}
        scale={params.rockRadius}
        visible={params.rockEnabled}
      >
        <shaderMaterial
          uniforms={orbUniforms}
          vertexShader={ORB_VERTEX_SHADER}
          fragmentShader={ORB_FRAGMENT_SHADER}
        />
      </mesh>
    </group>
  );
}

type MountainRangeProps = {
  width: number;
  params: MountainParams;
  rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  onAtPeak: (v: boolean) => void;
  rollDownRef: RefObject<{ active: boolean; targetXM: number }>;
  onRollDownDone: () => void;
  pastPeakRef: RefObject<boolean>;
  behindMountainRef: RefObject<boolean>;
};

export default function MountainRange({
  width,
  params,
  rockWorldXRef,
  rockPanRef,
  onAtPeak,
  rollDownRef,
  onRollDownDone,
  pastPeakRef,
  behindMountainRef,
}: MountainRangeProps) {
  const geometry = useMemo(
    () => buildMountainGeometry(width, params),
    [width, params],
  );
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useRef({
    uRimColor: { value: new THREE.Color(params.rimColor) },
    uRimStrength: { value: params.rimStrength },
    uRimPower: { value: params.rimPower },
  }).current;

  useEffect(() => {
    const m = matRef.current;
    if (!m) return;
    (m.uniforms.uRimColor.value as THREE.Color).set(params.rimColor);
    m.uniforms.uRimStrength.value = params.rimStrength;
    m.uniforms.uRimPower.value = params.rimPower;
  }, [params]);

  // The mountain starts at x = 0 + 2×rockDiameter so x = 0 is the near edge of the
  // empty floor in front of it.
  const S = params.rockRadius * 4;

  return (
    <>
      <group position={[S, 0, 0]}>
        <mesh geometry={geometry}>
          <shaderMaterial
            ref={matRef}
            vertexColors
            uniforms={uniforms}
            vertexShader={VERTEX_SHADER}
            fragmentShader={FRAGMENT_SHADER}
          />
        </mesh>
        <RidgeRock
          width={width}
          params={params}
          rockWorldXRef={rockWorldXRef}
          rockPanRef={rockPanRef}
          onAtPeak={onAtPeak}
          rollDownRef={rollDownRef}
          onRollDownDone={onRollDownDone}
          pastPeakRef={pastPeakRef}
          behindMountainRef={behindMountainRef}
        />
      </group>
    </>
  );
}