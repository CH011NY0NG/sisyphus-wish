import * as THREE from "three";
import { fbm } from "./noise";

export type MountainParams = {
  depth: number;
  xSeg: number;
  zSeg: number;
  riseSlope: number;
  rockAmplitude: number;
  rockShade: number;
  detailFreq: number;
  rockFreq: number;
  falloffPower: number;
  baseColor: string;
  shadeLight: string;
  shadeDark: string;
  rimColor: string;
  rimStrength: number;
  rimPower: number;
  lightColor: string;
  fillLightColor: string;
  ambientColor: string;
  bgColor: string;
  shadowColor: string;
};

export const DEFAULT_MOUNTAIN_PARAMS: MountainParams = {
  depth: 56,
  xSeg: 96,
  zSeg: 12,
  riseSlope: 0.3217,
  rockAmplitude: 8,
  rockShade: 0.85,
  detailFreq: 3,
  rockFreq: 1,
  falloffPower: 0.5,
  baseColor: "#ffffff",
  shadeLight: "#ffffff",
  shadeDark: "#ffffff",
  rimColor: "#b39ddb",
  rimStrength: 1.2,
  rimPower: 2.5,
  lightColor: "#ffffff",
  fillLightColor: "#ffffff",
  ambientColor: "#ffffff",
  bgColor: "#f2f4f6",
  shadowColor: "#d5d9de",
};

function baseAt(x: number, width: number, p: MountainParams): number {
  if (x <= width) return p.riseSlope * x;
  return p.riseSlope * (2 * width - x);
}

// Sign of the base slope (+1 rising, -1 falling) at x, computed from baseAt so
// it stays correct even if the ridge profile changes shape.
function baseSlopeSignAt(x: number, width: number, p: MountainParams): number {
  const eps = width * 1e-3;
  return baseAt(x + eps, width, p) - baseAt(x - eps, width, p) >= 0 ? 1 : -1;
}

function rockProfileAt(x: number, z: number, p: MountainParams) {
  const f = p.rockFreq;
  const craggy = 1 - fbm(x * 0.6 * f + 30, z * 0.65 * f + 60, 6);
  const fracture = 1 - fbm(x * 2.4 * f + 300, z * 2.6 * f + 400, 5);
  const rubble = fbm(x * 1.2 * f + 88, z * 1.3 * f + 120, 4) - 0.5;
  const rock =
    (craggy - 0.5) * p.rockAmplitude +
    (fracture - 0.5) * (2.4 * (p.rockAmplitude / 8)) +
    rubble * (1.6 * (p.rockAmplitude / 8));
  return { rock, craggy, fracture, rubble };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Mask that fades rock detail to zero along the far ridge (z === 0) so the
// skyline silhouette stays intact, while the rest of the face keeps full rock.
function rockMaskAt(z: number, p: MountainParams): number {
  const u = z / (p.depth / 2);
  return smoothstep(0, 0.04, u);
}

function heightAt(
  x: number,
  z: number,
  width: number,
  p: MountainParams,
): number {
  const falloff = Math.pow(Math.max(0, 1 - z / (p.depth / 2)), p.falloffPower);
  const d = p.detailFreq;
  const detail = fbm(x * 0.2 * d, z * 0.2 * d, 4) * 1;
  const fine = fbm(x * 0.55 * d + 12, z * 0.55 * d + 4, 3) * 1;

  // Rocky side displacement. Masked to zero along the crest line (x === width)
  // and the far ridge (z === 0) so the skyline silhouette stays intact.
  const { rock } = rockProfileAt(x, z, p);

  return falloff * (baseAt(x, width, p) + detail + fine) + rock * rockMaskAt(z, p);
}

// Height of the skyline ridge directly in front of the camera at x.
export function ridgeHeightAt(
  x: number,
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): number {
  return heightAt(x, 0, width, p);
}

// General terrain height at any point on the face (used for shadow placement).
export function mountainHeightAt(
  x: number,
  z: number,
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): number {
  return heightAt(x, z, width, p);
}

// Smooth, noise-free ridge base used for camera tracking (no jitter).
export function ridgeBaseHeightAt(
  x: number,
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): number {
  return baseAt(x, width, p);
}

export function buildMountainGeometry(
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): THREE.BufferGeometry {
  const length = width * 2;
  const half = p.depth / 2;
  const geo = new THREE.PlaneGeometry(length, half, p.xSeg, p.zSeg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(width, 0, half / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  const baseColor = new THREE.Color(p.baseColor);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z, width, p);
    pos.setY(i, h);

    color.copy(baseColor);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  // PlaneGeometry splits every quad along the same diagonal, which makes the
  // facet grain point the same way on both slopes. Orient each quad's diagonal
  // along its own base slope so facets slant with the terrain direction.
  const gridX = p.xSeg + 1;
  const indices: number[] = [];
  for (let iy = 0; iy < p.zSeg; iy++) {
    for (let ix = 0; ix < p.xSeg; ix++) {
      const a = ix + gridX * iy;
      const b = ix + gridX * (iy + 1);
      const c = ix + 1 + gridX * (iy + 1);
      const d = ix + 1 + gridX * iy;
      const centerX = (pos.getX(a) + pos.getX(d)) / 2;
      if (baseSlopeSignAt(centerX, width, p) > 0) {
        indices.push(a, b, d, b, c, d);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  geo.setIndex(indices);

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}