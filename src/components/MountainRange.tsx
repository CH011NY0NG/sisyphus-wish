import { useMemo } from "react";
import * as THREE from "three";
import { fbm } from "../lib/noise";

const DEPTH = 34;
const HALF_DEPTH = DEPTH / 2;
const X_SEG = 128;
const Z_SEG = 20;
const RISE_SLOPE = 0.3217;

const COLOR_LOW = new THREE.Color("#eef0f3");
const COLOR_MID = new THREE.Color("#f8f9fa");
const COLOR_HIGH = new THREE.Color("#ffffff");

function baseAt(x: number, width: number): number {
  if (x <= width) return RISE_SLOPE * x;
  return RISE_SLOPE * (2 * width - x);
}

function heightAt(x: number, z: number, width: number): number {
  const falloff = Math.pow(Math.max(0, 1 - z / HALF_DEPTH), 1.35);
  const detail = fbm(x * 0.2, z * 0.2, 4) * 1;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1;
  return falloff * (baseAt(x, width) + detail + fine);
}

function buildMountainGeometry(width: number): THREE.BufferGeometry {
  const length = width * 2;
  const geo = new THREE.PlaneGeometry(length, HALF_DEPTH, X_SEG, Z_SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(width, 0, HALF_DEPTH / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z, width);
    pos.setY(i, h);

    const t = THREE.MathUtils.clamp(h / (RISE_SLOPE * width), 0, 1);
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

type MountainRangeProps = {
  width: number;
};

export default function MountainRange({ width }: MountainRangeProps) {
  const geometry = useMemo(() => buildMountainGeometry(width), [width]);

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
    </group>
  );
}