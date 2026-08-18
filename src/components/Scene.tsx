import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import MountainRange from "./MountainRange";

const MAX_X = 56;
const CAMERA_Z = 42;
const MOUNTAIN_FRONT_Z = 8.5;
const CAMERA_Y =
  (CAMERA_Z - MOUNTAIN_FRONT_Z) * Math.tan(THREE.MathUtils.degToRad(44 / 2));

function CameraRig() {
  const { camera, gl } = useThree();
  const target = useRef(0);
  const current = useRef(0);
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
      startCamX = current.current;
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
      const dx = e.clientX - startX;
      target.current = Math.min(startCamX - dx * 0.14, MAX_X);
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
  }, [gl]);

  useFrame((_, delta) => {
    if (!dragging.current) {
      if (Math.abs(vel.current) > 0.05) {
        target.current = Math.min(target.current + vel.current, MAX_X);
        vel.current *= Math.pow(0.92, delta * 60);
      } else {
        vel.current = 0;
      }
    }

    current.current += (target.current - current.current) * Math.min(1, delta * 9);
    current.current = Math.min(current.current, MAX_X);

    camera.position.x = current.current;
    camera.position.y = CAMERA_Y;
    camera.position.z = CAMERA_Z;
    camera.rotation.set(0, 0, 0);
  });

  return null;
}

export default function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, CAMERA_Y, CAMERA_Z], fov: 44, near: 0.1, far: 600 }}
    >
      <color attach="background" args={["#eef0f2"]} />
      <fog attach="fog" args={["#eef0f2", 90, 260]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[24, 36, 26]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-30, 20, -20]} intensity={0.25} />
      <directionalLight position={[0, 30, 45]} intensity={0.3} />

      <MountainRange />

      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.45}
        scale={180}
        blur={2.6}
        far={26}
        color="#88919c"
      />

      <CameraRig />
    </Canvas>
  );
}