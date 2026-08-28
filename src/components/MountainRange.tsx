import { useMemo /* , useRef */ } from "react";
/* import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react"; */
import * as THREE from "three";
import {
  buildGroundGeometry,
  buildMountainGeometry,
  /* buildRockGeometry,
  ridgeHeightAt, */
  type MountainParams,
} from "../lib/mountain";

/* ---- ROCK (disabled for now; kept for later use) ----

// A low-poly rock that rolls with the drag and publishes its world x so the
// camera can follow (clamped). Reaching the peak signals the confirm button;
// pressing it makes the rock auto-roll down the descending slope.
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
  const rockXMRef = useRef(-params.rockRadius * 3);
  const prevXRef = useRef(0);
  const atPeakRef = useRef(false);
  const S = params.rockRadius * 3;
  const ROLL_DOWN_SPEED = 90;

  const rockGeometry = useMemo(
    () => buildRockGeometry(params.rockDetail, params.rockRough),
    [params.rockDetail, params.rockRough],
  );

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = params.rockEnabled;
    if (!params.rockEnabled || params.rockRadius <= 0) return;

    const vel = rockPanRef.current ?? 0;
    let nextXM = rockXMRef.current;

    if (rollDownRef.current.active) {
      if (rollDownRef.current.targetXM <= 0) {
        rollDownRef.current.targetXM = 2 * width + S / 2;
      }
      nextXM += ROLL_DOWN_SPEED * delta;
      if (nextXM >= 2 * width) {
        behindMountainRef.current = true;
      }
      if (nextXM >= rollDownRef.current.targetXM) {
        nextXM = rollDownRef.current.targetXM;
        rollDownRef.current.active = false;
        onRollDownDone();
      }
    } else {
      nextXM += vel * 60 * delta;
      let clampMin = -S / 2;
      let clampMax = pastPeakRef.current ? 2 * width : width;
      if (behindMountainRef.current) {
        clampMin = -S / 2;
        clampMax = 2 * width + S / 2;
      }
      nextXM = THREE.MathUtils.clamp(nextXM, clampMin, clampMax);
    }
    rockXMRef.current = nextXM;

    const atPeak = Math.abs(nextXM - width) < 0.05;
    if (atPeak !== atPeakRef.current) {
      atPeakRef.current = atPeak;
      onAtPeak(atPeak);
    }

    const groundY = Math.max(0, ridgeHeightAt(nextXM, width, params));
    const y = groundY + params.rockRadius;
    mesh.position.set(nextXM, y, 0);
    mesh.rotation.z += (prevXRef.current - nextXM) / params.rockRadius;
    prevXRef.current = nextXM;

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
        <meshStandardMaterial
          color={params.rockColor}
          flatShading
          roughness={0.9}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

---- ROCK END ---- */

type MountainRangeProps = {
  width: number;
  params: MountainParams;
  /* rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  onAtPeak: (v: boolean) => void;
  rollDownRef: RefObject<{ active: boolean; targetXM: number }>;
  onRollDownDone: () => void;
  pastPeakRef: RefObject<boolean>;
  behindMountainRef: RefObject<boolean>; */
};

export default function MountainRange({
  width,
  params,
  /* rockWorldXRef,
  rockPanRef,
  onAtPeak,
  rollDownRef,
  onRollDownDone,
  pastPeakRef,
  behindMountainRef, */
}: MountainRangeProps) {
  const geometry = useMemo(
    () => buildMountainGeometry(width, params),
    [width, params],
  );
  const groundGeometry = useMemo(
    () => buildGroundGeometry(width, params),
    [width, params],
  );

  // The mountain's footprint now tapers to a point at both ends (depth follows
  // the altitude), so no cap walls are needed.
  const S = params.rockRadius * 3;

  return (
    <>
      {/* Ground in the mountain color that follows the mountain's tapered
          footprint, so it only shows below the mountain. */}
      <mesh
        position={[width, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={groundGeometry}
      >
        <meshStandardMaterial
          color={params.baseColor}
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      <group position={[S, 0, 0]}>
        <mesh geometry={geometry}>
          <meshStandardMaterial
            vertexColors
            flatShading
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Horizontal line at y=0 — the y-level where the mountain starts rising. */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  0, 0, params.depth / 2,
                  2 * width, 0, params.depth / 2,
                ]),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ff5252" />
        </lineSegments>
        {/* <RidgeRock
          width={width}
          params={params}
          rockWorldXRef={rockWorldXRef}
          rockPanRef={rockPanRef}
          onAtPeak={onAtPeak}
          rollDownRef={rollDownRef}
          onRollDownDone={onRollDownDone}
          pastPeakRef={pastPeakRef}
          behindMountainRef={behindMountainRef}
        /> */}
      </group>
    </>
  );
}