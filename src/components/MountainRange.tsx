import { useMemo } from "react";
import * as THREE from "three";
import { fbm } from "../lib/noise";

const LENGTH = 160;
const ORIGINAL_HALF_DEPTH = 17;
const DEPTH = 17;
const CUT_HALF_DEPTH = DEPTH / 2;
const X_SEG = 128;
const Z_SEG = 20;
const MAX_HEIGHT = 50;
const PEAK_AT_END = 44;

const COLOR_LOW = new THREE.Color("#ffffff");
const COLOR_MID = new THREE.Color("#ffffff");
const COLOR_HIGH = new THREE.Color("#ffffff");

const WALL_LOW = new THREE.Color("#d9dde3");
const WALL_MID = new THREE.Color("#f0f2f5");
const WALL_HIGH = new THREE.Color("#ffffff");

function ridge(): number {
  return 17;
}

function elevationAt(x: number): number {
  return ((x + LENGTH / 2) / LENGTH) * PEAK_AT_END - ridge();
}

function heightAt(x: number, z: number): number {
  if (Math.abs(z) > CUT_HALF_DEPTH) return 0;
  const falloff = Math.pow(
    Math.max(0, 1 - Math.abs(z) / ORIGINAL_HALF_DEPTH),
    0.75,
  );
  const detail = fbm(x * 0.2, z * 0.2, 4) * 4.2;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1.6;
  const h = elevationAt(x) + falloff * (ridge() + detail + fine);
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

export default function MountainRange() {
  const geometry = useMemo(() => buildMountainGeometry(), []);
  const wallNeg = useMemo(() => buildCutWallGeometry(-1), []);
  const wallPos = useMemo(() => buildCutWallGeometry(1), []);

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
    </group>
  );
}