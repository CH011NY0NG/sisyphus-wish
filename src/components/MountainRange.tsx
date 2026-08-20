import { useMemo } from "react";
import * as THREE from "three";
import { fbm } from "../lib/noise";

const LENGTH = 160;
const ORIGINAL_HALF_DEPTH = 8.5;
const DEPTH = 8.5;
const CUT_HALF_DEPTH = DEPTH / 2;
const X_SEG = 128;
const Z_SEG = 20;

const X_MIN = 0;
const X_MAX = LENGTH;
const WIDTH = X_MAX - X_MIN;
const CENTER = (X_MIN + X_MAX) / 2;

const START_HEIGHT = 0;
const PEAK_HEIGHT = 44;
const END_HEIGHT = 0;
const RIDGE_AMPLITUDE = 8;

const PEAK_T = 0.5;
const PEAK_X = X_MIN + WIDTH * PEAK_T;

export const MOUNTAIN_LEFT = X_MIN;
export const MOUNTAIN_RIGHT = X_MAX;
export const MOUNTAIN_PEAK_X = PEAK_X;
export const MOUNTAIN_ASCENT_SLOPE =
  (PEAK_HEIGHT - START_HEIGHT) / (PEAK_X - X_MIN);
export const MOUNTAIN_DESCENT_SLOPE =
  (PEAK_HEIGHT - END_HEIGHT) / (X_MAX - PEAK_X);

const COLOR_LOW = new THREE.Color("#ffffff");
const COLOR_MID = new THREE.Color("#ffffff");
const COLOR_HIGH = new THREE.Color("#ffffff");

const WALL_LOW = new THREE.Color("#d9dde3");
const WALL_MID = new THREE.Color("#f0f2f5");
const WALL_HIGH = new THREE.Color("#ffffff");

function baseHeightAt(x: number): number {
  const t = (x - X_MIN) / WIDTH;
  if (t <= PEAK_T) {
    return START_HEIGHT + (PEAK_HEIGHT - START_HEIGHT) * (t / PEAK_T);
  }
  return END_HEIGHT + (PEAK_HEIGHT - END_HEIGHT) * ((1 - t) / (1 - PEAK_T));
}

const RIDGE_START = fbm(X_MIN * 0.045 + 7, 3.7, 4);
const RIDGE_END = fbm(X_MAX * 0.045 + 7, 3.7, 4);

function elevationAt(x: number): number {
  const t = (x - X_MIN) / WIDTH;
  const ridge =
    (fbm(x * 0.045 + 7, 3.7, 4) -
      (RIDGE_START + (RIDGE_END - RIDGE_START) * t)) *
    RIDGE_AMPLITUDE;
  return baseHeightAt(x) + ridge;
}

function wallTop(x: number): number {
  return Math.max(0, elevationAt(x));
}

function heightAt(x: number, z: number): number {
  if (Math.abs(z) > CUT_HALF_DEPTH) return 0;
  const falloff = Math.pow(
    Math.max(0, 1 - Math.abs(z) / ORIGINAL_HALF_DEPTH),
    0.75,
  );
  const edgeFade = Math.max(0, 1 - Math.abs(z) / CUT_HALF_DEPTH);
  const detail = fbm(x * 0.2, z * 0.2, 4) * 4.2;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1.6;
  const h = elevationAt(x) + falloff * edgeFade * (detail + fine);
  return Math.max(0, h);
}

function surfaceColor(
  _x: number,
  _z: number,
  h: number,
  low: THREE.Color,
  mid: THREE.Color,
  high: THREE.Color,
): THREE.Color {
  const t = THREE.MathUtils.clamp(h / PEAK_HEIGHT, 0, 1);
  const color = new THREE.Color();
  color.copy(low).lerp(mid, Math.min(1, t * 1.6));
  color.lerp(high, Math.max(0, t - 0.4) * 1.2);
  return color;
}

function buildMountainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, X_SEG, Z_SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CENTER, 0, 0);

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
    const x = X_MIN + (i / segments) * WIDTH;
    const h = wallTop(x);
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