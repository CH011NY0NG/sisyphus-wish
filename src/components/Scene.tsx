import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import MountainRange from "./MountainRange";

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

function mountainBounds(aspect: number): { minX: number; maxX: number } {
  const lx = leftEdgeX(aspect);
  const totalLength = 2 * (2 * lx * WIDTH_MULTIPLIER);
  return { minX: lx, maxX: totalLength - lx };
}

function CameraRig() {
  const { camera, gl } = useThree();
  const target = useRef(0);
  const current = useRef(0);
  const positioned = useRef(false);
  const vel = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    let startX = 0;
    let startCamX = 0;
    let lastX = 0;
    let lastT = 0;

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      startX = e.clientX;
      startCamX = camera.position.x;
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
      const { minX, maxX } = mountainBounds(
        (camera as THREE.PerspectiveCamera).aspect,
      );
      const dx = e.clientX - startX;
      target.current = THREE.MathUtils.clamp(
        startCamX - dx * 0.14,
        minX,
        maxX,
      );
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
    const { minX, maxX } = mountainBounds(perspective.aspect);
    if (!positioned.current) {
      target.current = minX;
      current.current = minX;
      positioned.current = true;
    }

    if (!dragging.current) {
      if (Math.abs(vel.current) > 0.05) {
        target.current = THREE.MathUtils.clamp(
          target.current + vel.current,
          minX,
          maxX,
        );
        vel.current *= Math.pow(0.92, delta * 60);
      } else {
        vel.current = 0;
      }
    }

    current.current += (target.current - current.current) * Math.min(1, delta * 9);
    current.current = THREE.MathUtils.clamp(current.current, minX, maxX);

    camera.position.x = current.current;
    camera.position.y = CAMERA_Y;
    camera.rotation.set(-PITCH, 0, 0);
  });

  return null;
}

function AdaptiveMountain() {
  const { camera } = useThree();
  const aspect = (camera as THREE.PerspectiveCamera).aspect;
  const width = 2 * leftEdgeX(aspect) * WIDTH_MULTIPLIER;
  return <MountainRange width={width} />;
}

export default function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [20, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 600 }}
    >
      <color attach="background" args={["#eef0f2"]} />
      <fog attach="fog" args={["#eef0f2", 90, 260]} />

      <ambientLight intensity={0.95} />
      <directionalLight
        position={[24, 36, 26]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={450}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-30, 20, -20]} intensity={0.3} />

      <AdaptiveMountain />

      <ContactShadows
        position={[141, 0.02, 0]}
        opacity={0.38}
        scale={320}
        blur={2.6}
        far={26}
        color="#88919c"
      />

      <CameraRig />
    </Canvas>
  );
}