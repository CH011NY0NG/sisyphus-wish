import { useMemo } from "react";
import * as THREE from "three";
import { fbm, mulberry32 } from "../lib/noise";

const LENGTH = 160;
const DEPTH = 34;
const HALF_DEPTH = DEPTH / 2;
const X_SEG = 128;
const Z_SEG = 20;
const MAX_HEIGHT = 26;

const COLOR_LOW = new THREE.Color("#eef0f3");
const COLOR_MID = new THREE.Color("#f8f9fa");
const COLOR_HIGH = new THREE.Color("#ffffff");

const BOULDER_COLORS = ["#cfd4da", "#e3e7eb", "#b9c0c9", "#d9dde2", "#c3c9d0"];

function ridge(x: number): number {
  return (
    12 *
      Math.pow(Math.sin(x * 0.04 + 1.2), 2) *
      Math.pow(Math.sin(x * 0.017 + 0.5), 2) +
    9 * Math.pow(Math.sin(x * 0.027 + 2.7), 2) +
    5 * Math.pow(Math.sin(x * 0.011), 2) +
    2
  );
}

function heightAt(x: number, z: number): number {
  const falloff = Math.pow(Math.max(0, 1 - Math.abs(z) / HALF_DEPTH), 1.35);
  const detail = fbm(x * 0.2, z * 0.2, 4) * 4.2;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1.6;
  const h = falloff * (ridge(x) + detail + fine);
  return THREE.MathUtils.clamp(h, 0, MAX_HEIGHT);
}

function buildMountainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(LENGTH, DEPTH, X_SEG, Z_SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const t = THREE.MathUtils.clamp(h / MAX_HEIGHT, 0, 1);
    const tint = fbm(x * 0.9 + 2, z * 0.9 + 8, 2) - 0.5;
    color.copy(COLOR_LOW).lerp(COLOR_MID, Math.min(1, t * 1.6));
    color.lerp(COLOR_HIGH, Math.max(0, t - 0.4) * 1.2);
    color.offsetHSL(0, 0, tint * 0.03);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

type Boulder = {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  detail: number;
};

function buildBoulders(): Boulder[] {
  const rand = mulberry32(7);
  const boulders: Boulder[] = [];
  const count = 24;

  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * (LENGTH - 10);
    const z = (rand() - 0.5) * (DEPTH - 8);
    const s = 0.7 + rand() * 1.7;
    const h = heightAt(x, z);
    if (h > 2.5) continue;

    boulders.push({
      position: [x, s * 0.28, z],
      scale: [s, s * (0.7 + rand() * 0.6), s * (0.7 + rand() * 0.5)],
      color: BOULDER_COLORS[Math.floor(rand() * BOULDER_COLORS.length)],
      detail: Math.floor(rand() * 2),
    });
  }

  return boulders;
}

export default function MountainRange() {
  const geometry = useMemo(() => buildMountainGeometry(), []);
  const boulders = useMemo(() => buildBoulders(), []);

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.9}
          metalness={0}
        />
      </mesh>

      {boulders.map((b, i) => (
        <mesh
          key={i}
          position={b.position}
          scale={b.scale}
          castShadow
          receiveShadow
        >
          <icosahedronGeometry args={[1, b.detail]} />
          <meshStandardMaterial
            color={b.color}
            flatShading
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}