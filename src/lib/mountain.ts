import * as THREE from "three";
import { fbm } from "./noise";

// Fixed slope of the mountain's ridge profile (no longer tunable).
const RISE_SLOPE = 0.5;

export type MountainParams = {
  depth: number;
  xSeg: number;
  zSeg: number;
  rockAmplitude: number;
  detailFreq: number;
  rockFreq: number;
  falloffPower: number;
  baseColor: string;
  rockEnabled: boolean;
  rockRadius: number;
  rockDetail: number;
  rockRough: number;
  rockColor: string;
};

export const DEFAULT_MOUNTAIN_PARAMS: MountainParams = {
  depth: 48,
  xSeg: 112,
  zSeg: 12,
  rockAmplitude: 8,
  detailFreq: 1.25,
  rockFreq: 0.55,
  falloffPower: 0.5,
  baseColor: "#bfa47d",
  rockEnabled: true,
  rockRadius: 4,
  rockDetail: 3,
  rockRough: 0.5,
  rockColor: "#d7cea8",
};

function baseAt(x: number, width: number): number {
  if (x <= width) return RISE_SLOPE * x;
  return RISE_SLOPE * (2 * width - x);
}

// Sign of the base slope (+1 rising, -1 falling) at x, computed from baseAt so
// it stays correct even if the ridge profile changes shape.
function baseSlopeSignAt(x: number, width: number): number {
  const eps = width * 1e-3;
  return baseAt(x + eps, width) - baseAt(x - eps, width) >= 0 ? 1 : -1;
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

// Mask that fades rock detail to zero along the crest line (z === 0) so the
// skyline silhouette stays intact, while the rest of the face keeps full rock.
// zMax is the local depth at this x (it varies with the altitude).
function rockMaskAt(z: number, zMax: number): number {
  const u = Math.abs(z) / Math.max(zMax, 1e-6);
  return smoothstep(0, 0.04, u);
}

// zMax is the local half-depth at this x: the mountain's footprint is wider
// where it is high and tapers to a point where it meets the ground.
function heightAt(
  x: number,
  z: number,
  zMax: number,
  width: number,
  p: MountainParams,
): number {
  const zz = Math.max(zMax, 1e-6);
  // Symmetric around the crest (z=0): the mountain has a front AND a back face
  // that both descend to the ground at ±zMax.
  const falloff = Math.pow(Math.max(0, 1 - Math.abs(z) / zz), p.falloffPower);
  // Fade the terrain noise toward the tapered tips so the mountain ends in a
  // clean point instead of a jagged fold.
  const fade = smoothstep(0, 0.15, zMax / (p.depth / 2));
  const d = p.detailFreq;
  const detail = fbm(x * 0.2 * d, z * 0.2 * d, 4) * fade;
  const fine = fbm(x * 0.55 * d + 12, z * 0.55 * d + 4, 3) * fade;

  // Rocky side displacement. Masked to zero along the crest line (x === width)
  // and the far ridge (z === 0) so the skyline silhouette stays intact.
  const { rock } = rockProfileAt(x, z, p);

  return (
    falloff * (baseAt(x, width) + detail + fine) + rock * rockMaskAt(z, zz) * fade
  );
}

// Height of the skyline ridge directly in front of the camera at x.
export function ridgeHeightAt(
  x: number,
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): number {
  return heightAt(x, 0, p.depth / 2, width, p);
}

// General terrain height at any point on the face (used for shadow placement).
export function mountainHeightAt(
  x: number,
  z: number,
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): number {
  return heightAt(x, z, p.depth / 2, width, p);
}

// Smooth, noise-free ridge base used for camera tracking (no jitter).
export function ridgeBaseHeightAt(x: number, width: number): number {
  return baseAt(x, width);
}

// Low-poly sphere/rock: an icosahedron whose vertices are displaced along
// their own direction by a smooth, spatially-correlated noise so the surface
// stays connected while the silhouette gets slightly irregular. More facets
// (higher detail) make the silhouette read rounder.
export function buildRockGeometry(
  detail: number,
  rough: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    // Average three 2-coordinate noise samples so the bumps distribute evenly
    // across all directions instead of clumping on one side of the sphere.
    const n1 = fbm(nx * 1.5, ny * 1.5, 3);
    const n2 = fbm(ny * 1.5 + 9, nz * 1.5 + 15, 3);
    const n3 = fbm(nz * 1.5 + 23, nx * 1.5 + 31, 3);
    const n = (n1 + n2 + n3) / 3 - 0.5;
    const r = 1 + n * 2 * rough;
    pos.setXYZ(i, nx * r, ny * r, nz * r);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildMountainGeometry(
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): THREE.BufferGeometry {
  const length = width * 2;
  const half = p.depth / 2;
  const peak = RISE_SLOPE * width;
  const gridX = p.xSeg + 1;
  const gridZ = p.zSeg + 1;

  // Build the grid by hand so each x-column's depth (z extent) follows the
  // mountain's altitude: widest at the peak, tapering toward a point where the
  // mountain meets the ground at the ends.
  const positions = new Float32Array(gridX * gridZ * 3);
  const colors = new Float32Array(gridX * gridZ * 3);
  const color = new THREE.Color();
  const baseColor = new THREE.Color(p.baseColor);

  let i = 0;
  for (let iy = 0; iy < gridZ; iy++) {
    // zFrac spans -1..1 so the width extends symmetrically on both sides of
    // the crest (front face as wide as the back face).
    const zFrac = -1 + 2 * (iy / p.zSeg);
    for (let ix = 0; ix < gridX; ix++) {
      const x = (ix / p.xSeg) * length;
      // Linear taper (constant rate), reaching a near-point at the ends.
      const t = THREE.MathUtils.clamp(baseAt(x, width) / peak, 0, 1);
      const f = Math.max(0.001, t);
      const zMax = half * f;
      const z = zFrac * zMax;
      const h = heightAt(x, z, zMax, width, p);

      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = z;

      color.copy(baseColor);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      i++;
    }
  }

  // Orient each quad's diagonal along its own base slope so facets slant with
  // the terrain direction.
  const indices: number[] = [];
  for (let iy = 0; iy < p.zSeg; iy++) {
    for (let ix = 0; ix < p.xSeg; ix++) {
      const a = ix + gridX * iy;
      const b = ix + gridX * (iy + 1);
      const c = ix + 1 + gridX * (iy + 1);
      const d = ix + 1 + gridX * iy;
      const centerX = (positions[a * 3] + positions[d * 3]) / 2;
      if (baseSlopeSignAt(centerX, width) > 0) {
        indices.push(a, b, d, b, c, d);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Flat ground (y=0) whose footprint exactly matches the mountain's tapered
// base, so the mountain color only appears directly below/under the mountain
// instead of spreading out as a wide floor.
export function buildGroundGeometry(
  width: number,
  p: MountainParams = DEFAULT_MOUNTAIN_PARAMS,
): THREE.BufferGeometry {
  const length = width * 2;
  const half = p.depth / 2;
  const peak = RISE_SLOPE * width;
  const gridX = p.xSeg + 1;
  const gridZ = 12;

  const positions = new Float32Array(gridX * gridZ * 3);
  let i = 0;
  for (let iy = 0; iy < gridZ; iy++) {
    const zFrac = -1 + 2 * (iy / (gridZ - 1));
    for (let ix = 0; ix < gridX; ix++) {
      const x = (ix / p.xSeg) * length;
      const t = THREE.MathUtils.clamp(baseAt(x, width) / peak, 0, 1);
      const f = Math.max(0.001, t);
      const zMax = half * f;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = zFrac * zMax;
      i++;
    }
  }

  const indices: number[] = [];
  for (let iy = 0; iy < gridZ - 1; iy++) {
    for (let ix = 0; ix < p.xSeg; ix++) {
      const a = ix + gridX * iy;
      const b = ix + gridX * (iy + 1);
      const c = ix + 1 + gridX * (iy + 1);
      const d = ix + 1 + gridX * iy;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}