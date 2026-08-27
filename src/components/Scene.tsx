import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import MountainRange from "./MountainRange";
import {
  ridgeBaseHeightAt,
  type MountainParams,
} from "../lib/mountain";

const CAMERA_Z = 36;
const CAMERA_FOV = 44;
const HALF_FOV_V = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
const PITCH = 0.15;
const CAMERA_Y = CAMERA_Z * Math.tan(PITCH + HALF_FOV_V);
const VIEW_DEPTH =
  CAMERA_Y * Math.sin(PITCH) + CAMERA_Z * Math.cos(PITCH);
const WIDTH_MULTIPLIER = 3;

function leftEdgeX(aspect: number): number {
  const halfFovH = Math.atan(Math.tan(HALF_FOV_V) * aspect);
  return VIEW_DEPTH * Math.tan(halfFovH);
}

// The rock is decoupled from the camera: it rolls with the drag velocity and
// the camera follows it (clamped), so the rock keeps rolling to the peak even
// after the camera hits the drag limit.
function CameraRig({
  params,
  rockWorldXRef,
  rockPanRef,
  pastPeakRef,
}: {
  params: MountainParams;
  rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  pastPeakRef: RefObject<boolean>;
}) {
  const { camera, gl } = useThree();
  const vel = useRef(0);
  const dragging = useRef(false);
  const camXRef = useRef(0);
  const positioned = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    let lastX = 0;
    let lastT = 0;

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      lastX = e.clientX;
      lastT = performance.now();
      vel.current = 0;
      el.style.cursor = "grabbing";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture not available for this pointer
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vel.current = -((e.clientX - lastX) / dt) * 0.14 * 16.7;
      lastX = e.clientX;
      lastT = now;
    };

    const onUp = () => {
      dragging.current = false;
      el.style.cursor = "grab";
    };

    const onCancel = () => {
      dragging.current = false;
      el.style.cursor = "grab";
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [gl, camera]);

  useFrame((_, delta) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const lx = leftEdgeX(perspective.aspect);
    const width = 2 * lx * WIDTH_MULTIPLIER;
    const S = params.rockRadius * 4;
    // The camera follows the rock continuously — down the mountain, past its end,
// and across the flat space behind it (no intermediate stop at the corner).
    const minX = lx;
    const maxX = pastPeakRef.current
      ? S + 2 * width + S + lx
      : S + width;

    // Decay the pan velocity when not dragging (gives the rock inertia).
    if (!dragging.current) {
      if (Math.abs(vel.current) > 0.05) {
        vel.current *= Math.pow(0.92, delta * 60);
      } else {
        vel.current = 0;
      }
    }

    // The camera follows the rock (kept at a fixed screen offset), clamped to
    // the pan range, and glides toward the target so releasing the peak clamp
    // doesn't make the view jump.
    const targetCamX = THREE.MathUtils.clamp(
      (rockWorldXRef.current ?? 0) + lx - S / 2,
      minX,
      maxX,
    );
    if (!positioned.current) {
      camXRef.current = targetCamX;
      positioned.current = true;
    }
    camXRef.current += (targetCamX - camXRef.current) * Math.min(1, delta * 10);
    const camX = camXRef.current;

    // Height: flat while the mountain start hasn't reached the bottom-left
    // corner, then track the skyline (ridge at the camera center) so the view
    // stays the same whether the rock climbs up or rolls down.
    const trackActive = camX >= S + lx;
    const trackedY = trackActive
      ? CAMERA_Y +
        Math.max(0, ridgeBaseHeightAt(camX - S, width)) -
        ridgeBaseHeightAt(lx, width)
      : CAMERA_Y;
    // Once the mountain's end is at the bottom-right corner the camera stops
    // descending and just stays level as the rock rolls into the space behind.
    const camY = Math.max(trackedY, CAMERA_Y);

    rockPanRef.current = vel.current;

    camera.position.x = camX;
    camera.position.y = camY;
    camera.rotation.set(-PITCH, 0, 0);
  });

  return null;
}

function AdaptiveMountain({
  params,
  rockWorldXRef,
  rockPanRef,
  onAtPeak,
  rollDownRef,
  onRollDownDone,
  pastPeakRef,
  behindMountainRef,
}: {
  params: MountainParams;
  rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  onAtPeak: (v: boolean) => void;
  rollDownRef: RefObject<{ active: boolean; targetXM: number }>;
  onRollDownDone: () => void;
  pastPeakRef: RefObject<boolean>;
  behindMountainRef: RefObject<boolean>;
}) {
  const { camera } = useThree();
  const aspect = (camera as THREE.PerspectiveCamera).aspect;
  const width = 2 * leftEdgeX(aspect) * WIDTH_MULTIPLIER;
  return (
    <MountainRange
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
  );
}

type SceneProps = {
  params: MountainParams;
};

export default function Scene({ params }: SceneProps) {
  const rockWorldXRef = useRef(0);
  const rockPanRef = useRef(0);
  const rollDownRef = useRef({ active: false, targetXM: 0 });
  const pastPeakRef = useRef(false);
  const behindMountainRef = useRef(false);
  const [atPeak, setAtPeak] = useState(false);
  const [rollingDown, setRollingDown] = useState(false);

  return (
    <div className="scene-wrap">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [20, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 600 }}
      >
        <color attach="background" args={["#ffffff"]} />
        <fog attach="fog" args={["#ffffff", 90, 260]} />

        <AdaptiveMountain
          params={params}
          rockWorldXRef={rockWorldXRef}
          rockPanRef={rockPanRef}
          onAtPeak={setAtPeak}
          rollDownRef={rollDownRef}
          onRollDownDone={() => setRollingDown(false)}
          pastPeakRef={pastPeakRef}
          behindMountainRef={behindMountainRef}
        />

        <ContactShadows
          position={[141 + params.rockRadius * 4, 0.02, 0]}
          opacity={0.38}
          scale={320}
          blur={2.6}
          far={26}
          color="#d5d9de"
        />

        <CameraRig
          params={params}
          rockWorldXRef={rockWorldXRef}
          rockPanRef={rockPanRef}
          pastPeakRef={pastPeakRef}
        />
      </Canvas>

      {atPeak && !rollingDown && (
        <button
          type="button"
          className="peak-confirm"
          onClick={() => {
            rollDownRef.current.active = true;
            pastPeakRef.current = true;
            setRollingDown(true);
          }}
        >
          확인
        </button>
      )}
    </div>
  );
}