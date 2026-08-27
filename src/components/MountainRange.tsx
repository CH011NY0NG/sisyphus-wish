import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";
import {
  buildMountainGeometry,
  buildRockGeometry,
  mountainHeightAt,
  ridgeHeightAt,
  type MountainParams,
} from "../lib/mountain";

// Vertical cap wall that closes a mountain end (x = 0 start or x = 2w end) so
// the bumpy rock there doesn't read as a flat board when viewed from the side.
function buildCapWall(xPos: number, width: number, params: MountainParams) {
  const gz = params.zSeg + 1;
  const positions: number[] = [];
  for (let i = 0; i < gz; i++) {
    const z = (i / params.zSeg) * (params.depth / 2);
    const h = Math.max(0, mountainHeightAt(xPos, z, width, params));
    positions.push(xPos, 0, z);
    positions.push(xPos, h, z);
  }
  const indices: number[] = [];
  for (let i = 0; i < params.zSeg; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2 + 1;
    const d = (i + 1) * 2;
    indices.push(a, b, d, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

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

  // Cap walls closing the mountain's start (x = 0) and far end (x = 2w) so the
  // bumpy rock doesn't read as a flat board when viewed from the side.
  const startWallGeometry = useMemo(
    () => buildCapWall(0, width, params),
    [width, params],
  );
  const endWallGeometry = useMemo(
    () => buildCapWall(2 * width, width, params),
    [width, params],
  );

  // The mountain starts at x = 0 + 2×rockDiameter so x = 0 is the near edge of the
  // empty floor in front of it.
  const S = params.rockRadius * 3;

  return (
    <>
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
        <mesh geometry={startWallGeometry}>
          <meshStandardMaterial
            color={params.baseColor}
            flatShading
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={endWallGeometry}>
          <meshStandardMaterial
            color={params.baseColor}
            flatShading
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
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