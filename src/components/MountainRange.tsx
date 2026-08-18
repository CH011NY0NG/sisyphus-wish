import { useMemo } from "react";
import * as THREE from "three";
import { fbm, mulberry32 } from "../lib/noise";

const LENGTH = 160;
const ORIGINAL_HALF_DEPTH = 17;
const DEPTH = 17;
const CUT_HALF_DEPTH = DEPTH / 2;
const X_SEG = 128;
const Z_SEG = 20;
const MAX_HEIGHT = 26;

const COLOR_LOW = new THREE.Color("#ffffff");
const COLOR_MID = new THREE.Color("#ffffff");
const COLOR_HIGH = new THREE.Color("#ffffff");

const WALL_LOW = new THREE.Color("#d9dde3");
const WALL_MID = new THREE.Color("#f0f2f5");
const WALL_HIGH = new THREE.Color("#ffffff");

const BOULDER_COLORS = ["#cfd4da", "#e3e7eb", "#b9c0c9", "#d9dde2", "#c3c9d0"];

function ridge(): number {
  return 24;
}

function heightAt(x: number, z: number): number {
  if (Math.abs(z) > CUT_HALF_DEPTH) return 0;
  const falloff = Math.pow(
    Math.max(0, 1 - Math.abs(z) / ORIGINAL_HALF_DEPTH),
    0.75,
  );
  const detail = fbm(x * 0.2, z * 0.2, 4) * 4.2;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1.6;
  const h = falloff * (ridge() + detail + fine);
  return THREE.MathUtils.clamp(h, 0, MAX_HEIGHT);
}

function surfaceColor(
  _x: number,
  _z: number,
  h: number,
  low: THREE.Color,
  mid: THREE.Color,
  high: THREE.Color,
): THREE.Color {
  const t = THREE.MathUtils.clamp(h / MAX_HEIGHT, 0, 1);
  const color = new THREE.Color();
  color.copy(low).lerp(mid, Math.min(1, t * 1.6));
  color.lerp(high, Math.max(0, t - 0.4) * 1.2);
  return color;
}

function buildMountainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(LENGTH, DEPTH, X_SEG, Z_SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const color = surfaceColor(x, z, h, COLOR_LOW, COLOR_MID, COLOR_HIGH);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildCutWallGeometry(zSign: 1 | -1): THREE.BufferGeometry {
  const zc = CUT_HALF_DEPTH * zSign;
  const segments = X_SEG;
  const positions: number[] = [];
  const colors = new Float32Array((segments + 1) * 2 * 3);

  for (let i = 0; i <= segments; i++) {
    const x = (i / segments - 0.5) * LENGTH;
    const h = heightAt(x, zc);
    positions.push(x, 0, zc, x, h, zc);
    const colorTop = surfaceColor(x, zc, h, WALL_LOW, WALL_MID, WALL_HIGH);
    const colorBottom = surfaceColor(x, zc, 0, WALL_LOW, WALL_MID, WALL_HIGH);
    const vi = i * 2 * 3;
    colors[vi] = colorBottom.r;
    colors[vi + 1] = colorBottom.g;
    colors[vi + 2] = colorBottom.b;
    colors[vi + 3] = colorTop.r;
    colors[vi + 4] = colorTop.g;
    colors[vi + 5] = colorTop.b;
  }

  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    if (zSign === 1) {
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    } else {
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
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
  const wallNeg = useMemo(() => buildCutWallGeometry(-1), []);
  const wallPos = useMemo(() => buildCutWallGeometry(1), []);
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

      <mesh geometry={wallNeg} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.9}
          metalness={0}
        />
      </mesh>

      <mesh geometry={wallPos} castShadow receiveShadow>
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