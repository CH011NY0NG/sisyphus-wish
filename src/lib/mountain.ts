import * as THREE from "three";
import { fbm } from "./noise";

const DEPTH = 56;
const HALF_DEPTH = DEPTH / 2;
const X_SEG = 96;
const Z_SEG = 12;
const RISE_SLOPE = 0.3217;
const ROCK_AMPLITUDE = 12;
const ROCK_SHADE = 1.0;

const COLOR_LOW = new THREE.Color("#f4f6f9");
const COLOR_MID = new THREE.Color("#f4f6f9");
const COLOR_HIGH = new THREE.Color("#f4f6f9");

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

function rockProfileAt(x: number, z: number) {
  const craggy = 1 - fbm(x * 0.6 + 30, z * 0.65 + 60, 6);
  const fracture = 1 - fbm(x * 2.4 + 300, z * 2.6 + 400, 5);
  const rubble = fbm(x * 1.2 + 88, z * 1.3 + 120, 4) - 0.5;
  const rock =
    (craggy - 0.5) * ROCK_AMPLITUDE +
    (fracture - 0.5) * 2.4 +
    rubble * 1.6;
  return { rock, craggy, fracture, rubble };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Mask that fades rock detail to zero along the far ridge (z === 0) so the
// skyline silhouette stays intact, while the rest of the face keeps full rock.
function rockMaskAt(z: number): number {
  const u = z / HALF_DEPTH;
  return smoothstep(0, 0.04, u);
}

function heightAt(x: number, z: number, width: number): number {
  const falloff = Math.pow(Math.max(0, 1 - z / HALF_DEPTH), 1.35);
  const detail = fbm(x * 0.2, z * 0.2, 4) * 1;
  const fine = fbm(x * 0.55 + 12, z * 0.55 + 4, 3) * 1;

  // Rocky side displacement. Masked to zero along the crest line (x === width)
  // and the far ridge (z === 0) so the skyline silhouette stays intact.
  const { rock } = rockProfileAt(x, z);

  return falloff * (baseAt(x, width) + detail + fine) + rock * rockMaskAt(z);
}

// Height of the skyline ridge directly in front of the camera at x.
export function ridgeHeightAt(x: number, width: number): number {
  return heightAt(x, 0, width);
}

// Smooth, noise-free ridge base used for camera tracking (no jitter).
export function ridgeBaseHeightAt(x: number, width: number): number {
  return baseAt(x, width);
}

export function buildMountainGeometry(width: number): THREE.BufferGeometry {
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

    // Bake crevice/crag shading so the rock reads even where facets are flat.
    // Scaled by the same mask as the displacement, so the ridge stays clean.
    const { craggy, fracture, rubble } = rockProfileAt(x, z);
    const contrast = rockMaskAt(z) * ROCK_SHADE;
    const relief = (craggy - 0.5) * 2 + (fracture - 0.5) * 1.2 + rubble * 0.3;
    const shade = 1 + relief * contrast;
    color.multiplyScalar(THREE.MathUtils.clamp(shade, 0.35, 1.45));

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  // PlaneGeometry splits every quad along the same diagonal, which makes the
  // facet grain point the same way on both slopes. Orient each quad's diagonal
  // along its own base slope so facets slant with the terrain direction.
  const gridX = X_SEG + 1;
  const indices: number[] = [];
  for (let iy = 0; iy < Z_SEG; iy++) {
    for (let ix = 0; ix < X_SEG; ix++) {
      const a = ix + gridX * iy;
      const b = ix + gridX * (iy + 1);
      const c = ix + 1 + gridX * (iy + 1);
      const d = ix + 1 + gridX * iy;
      const centerX = (pos.getX(a) + pos.getX(d)) / 2;
      if (baseSlopeSignAt(centerX, width) > 0) {
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