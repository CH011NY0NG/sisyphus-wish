import { useEffect, useMemo, useRef /* , useState */ } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import MountainRange from "./MountainRange";
import AuroraBackdrop from "./AuroraBackdrop";
import {
  ridgeBaseHeightAt,
  type MountainParams,
  DEFAULT_MOUNTAIN_PARAMS,
} from "../lib/mountain";

// The mountain/rock render with the original 4:3 projection, mapped into the
// top band of the fullscreen canvas via a custom camera projection. The aurora
// is a separate screen-space fullscreen quad, so the scene stays fullscreen
// while the mountain/rock keep their exact original on-screen size.
const CAMERA_Z = 36;
const CAMERA_FOV = 44;
const HALF_FOV_V = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
const PITCH = 0.15;
const CAMERA_Y = CAMERA_Z * Math.tan(PITCH + HALF_FOV_V);
const VIEW_DEPTH =
  CAMERA_Y * Math.sin(PITCH) + CAMERA_Z * Math.cos(PITCH);
const WIDTH_MULTIPLIER = 3;
const REF_ASPECT = 4 / 3;

function leftEdgeX(aspect: number): number {
  const halfFovH = Math.atan(Math.tan(HALF_FOV_V) * aspect);
  return VIEW_DEPTH * Math.tan(halfFovH);
}

// Reference mountain length, independent of the live canvas aspect.
const REF_LX = leftEdgeX(REF_ASPECT);
const REF_WIDTH = 2 * REF_LX * WIDTH_MULTIPLIER;

// Temp matrices for composing the band-mapped projection each frame.
const PROJ_BAND = new THREE.Matrix4();
const PROJ_TEMP = new THREE.Matrix4();

// Drifting sand motes that stay in front of the camera (the parent group
// follows the camera x/y). Normal blending with a mid-sand color so the
// particles stay visible against the light background.
function SandParticles() {
  const COUNT = 260;
  const elapsed = useRef(0);

  const { positions, velocities, geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 180;
      // Fixed world height spread across the whole mountain so the camera
      // passes the motes by while climbing, yet they stay present everywhere.
      pos[i * 3 + 1] = Math.random() * 90;
      pos[i * 3 + 2] = 18 + Math.random() * 16;
      vel[i] = 1 + Math.random() * 3;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c),
      color: new THREE.Color("#c0a277"),
      size: 0.9,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
    });
    return { positions: pos, velocities: vel, geometry: geo, material: mat };
  }, []);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;
    for (let i = 0; i < COUNT; i++) {
      // Slow fall plus a gentle horizontal sway so the motes scatter in the air.
      positions[i * 3 + 1] -= velocities[i] * delta;
      positions[i * 3] += Math.sin(t * 0.5 + i) * delta * 2;
      if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] += 90;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} />;
}

// Light, cheap atmosphere: drifting sand motes (fixed heights, passed by while
// climbing) + a soft dawn sun that rises with the rock's progress up the
// mountain (0% at the start, 100% at the peak).
function Atmosphere({
  rockWorldXRef,
  params,
}: {
  rockWorldXRef: RefObject<number>;
  params: MountainParams;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Sprite>(null);

  const glowTexture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255, 238, 205, 0.14)");
      g.addColorStop(0.5, "rgba(255, 228, 185, 0.11)");
      g.addColorStop(1, "rgba(255, 228, 185, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (groupRef.current) groupRef.current.position.x = cam.position.x;
    if (sunRef.current) {
      // Rock's progress up the mountain: 0% at the start (x=0), 100% at the
      // peak (x=width). This is stable even where the camera stops moving.
      const S = params.rockRadius * 3;
      const rockXM = (rockWorldXRef.current ?? 0) - S;
      const progress = THREE.MathUtils.clamp(rockXM / REF_WIDTH, 0, 1);
      const y = THREE.MathUtils.lerp(-70, REF_WIDTH / 2, progress);
      sunRef.current.position.set(0, y, -46);
    }
  });

  return (
    <group ref={groupRef}>
      <SandParticles />
      <sprite ref={sunRef} scale={[100, 100, 1]}>
        <spriteMaterial
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

// The rock is decoupled from the camera: it rolls with the drag velocity and
// the camera follows it (clamped), so the rock keeps rolling to the peak even
// after the camera hits the drag limit. It also rebuilds the 4:3 band
// projection each frame, placing the mountain in the top ~1/3 of the screen.
function CameraRig({
  params,
  rockPanRef,
}: {
  params: MountainParams;
  rockPanRef: RefObject<number>;
}) {
  const { camera, gl, size } = useThree();
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
    // Rebuild the original 4:3 projection and map it into the top band of the
    // fullscreen canvas: NDC y ∈ [-1,1] → [1-2·band, 1]. This keeps the
    // mountain/rock pixel-identical to the original 4:3 scene while the aurora
    // (a separate screen-space quad) fills the whole canvas.
    perspective.aspect = REF_ASPECT;
    perspective.fov = CAMERA_FOV;
    perspective.updateProjectionMatrix();
    const band = (size.width * 0.75) / size.height;
    PROJ_BAND.set(
      1,
      0,
      0,
      0,
      0,
      band,
      0,
      1 - band,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    const mapped = PROJ_TEMP.multiplyMatrices(
      PROJ_BAND,
      perspective.projectionMatrix,
    );
    perspective.projectionMatrix.copy(mapped);
    perspective.projectionMatrixInverse.copy(mapped).invert();

    const lx = leftEdgeX(perspective.aspect);
    const width = REF_WIDTH;
    const S = params.rockRadius * 3;
    // Pan range covers the whole mountain (front edge to the back end).
    const minX = lx;
    const maxX = S + 2 * width + S + lx;

    // Start the camera at the mountain's front.
    if (!positioned.current) {
      camXRef.current = minX;
      positioned.current = true;
    }

    // Direct left/right drag: the camera pans with the pointer, and keeps a
    // little inertia when released (the mountain follows your finger).
    if (dragging.current) {
      camXRef.current += vel.current * delta * 60;
    } else if (Math.abs(vel.current) > 0.05) {
      vel.current *= Math.pow(0.92, delta * 60);
      camXRef.current += vel.current * delta * 60;
    } else {
      vel.current = 0;
    }
    const camX = THREE.MathUtils.clamp(camXRef.current, minX, maxX);
    camXRef.current = camX;

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
  /* rockWorldXRef,
  rockPanRef,
  onAtPeak,
  rollDownRef,
  onRollDownDone,
  pastPeakRef,
  behindMountainRef, */
}: {
  params: MountainParams;
  /* rockWorldXRef: RefObject<number>;
  rockPanRef: RefObject<number>;
  onAtPeak: (v: boolean) => void;
  rollDownRef: RefObject<{ active: boolean; targetXM: number }>;
  onRollDownDone: () => void;
  pastPeakRef: RefObject<boolean>;
  behindMountainRef: RefObject<boolean>; */
}) {
  return (
    <MountainRange
      width={REF_WIDTH}
      params={params}
      /* rockWorldXRef={rockWorldXRef}
      rockPanRef={rockPanRef}
      onAtPeak={onAtPeak}
      rollDownRef={rollDownRef}
      onRollDownDone={onRollDownDone}
      pastPeakRef={pastPeakRef}
      behindMountainRef={behindMountainRef} */
    />
  );
}

// Contact shadows sit under the rock's final resting spot in the flat space
// behind the mountain (world x = S + 2×width + S/2).
function BehindShadows({ params }: { params: MountainParams }) {
  const S = params.rockRadius * 3;
  return (
    <ContactShadows
      position={[S + 2 * REF_WIDTH + S / 2, 0.02, 0]}
      opacity={0.38}
      scale={320}
      blur={2.6}
      far={26}
      color="#d5d9de"
    />
  );
}

type SceneProps = {
  params?: MountainParams;
};

export default function Scene({
  params = DEFAULT_MOUNTAIN_PARAMS,
}: SceneProps) {
  const rockWorldXRef = useRef(0);
  const rockPanRef = useRef(0);
  /* const pastPeakRef = useRef(false); */
  /* const rockPanRef = useRef(0);
  const pastPeakRef = useRef(false); */
  /* const rollDownRef = useRef({ active: false, targetXM: 0 }); */
  /* const behindMountainRef = useRef(false);
  const [atPeak, setAtPeak] = useState(false);
  const [rollingDown, setRollingDown] = useState(false); */

  return (
    <div className="scene-wrap">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [20, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 600 }}
      >
        <color attach="background" args={["#ecdcc2"]} />
        <fog attach="fog" args={["#ecdcc2", 120, 300]} />

        <AuroraBackdrop groundColor={params.baseColor} />
        <Atmosphere rockWorldXRef={rockWorldXRef} params={params} />

        <ambientLight intensity={0.25} />
        <directionalLight position={[16, 45, -30]} intensity={0.5} />
        <directionalLight position={[-16, 45, 20]} intensity={0.5} />

        <AdaptiveMountain
          params={params}
          /* rockWorldXRef={rockWorldXRef}
          rockPanRef={rockPanRef}
          onAtPeak={setAtPeak}
          rollDownRef={rollDownRef}
          onRollDownDone={() => setRollingDown(false)}
          pastPeakRef={pastPeakRef}
          behindMountainRef={behindMountainRef} */
        />

        <BehindShadows params={params} />

        <CameraRig
          params={params}
          rockPanRef={rockPanRef}
        />
      </Canvas>

      {/* {atPeak && !rollingDown && (
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
      )} */}
    </div>
  );
}