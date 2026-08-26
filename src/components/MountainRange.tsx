import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  buildMountainGeometry,
  type MountainParams,
} from "../lib/mountain";

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vViewPosition;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  uniform float uRimPower;

  varying vec3 vColor;
  varying vec3 vViewPosition;

  void main() {
    // Flat facet normal derived from screen-space derivatives.
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    vec3 viewDir = normalize(vViewPosition);
    float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), uRimPower);
    vec3 outColor = mix(
      vColor,
      uRimColor,
      clamp(rim * uRimStrength, 0.0, 1.0)
    );
    gl_FragColor = vec4(outColor, 1.0);
  }
`;

type MountainRangeProps = {
  width: number;
  params: MountainParams;
};

export default function MountainRange({ width, params }: MountainRangeProps) {
  const geometry = useMemo(
    () => buildMountainGeometry(width, params),
    [width, params],
  );
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useRef({
    uRimColor: { value: new THREE.Color(params.rimColor) },
    uRimStrength: { value: params.rimStrength },
    uRimPower: { value: params.rimPower },
  }).current;

  useEffect(() => {
    const m = matRef.current;
    if (!m) return;
    (m.uniforms.uRimColor.value as THREE.Color).set(params.rimColor);
    m.uniforms.uRimStrength.value = params.rimStrength;
    m.uniforms.uRimPower.value = params.rimPower;
  }, [params]);

  return (
    <group>
      <mesh geometry={geometry}>
        <shaderMaterial
          ref={matRef}
          vertexColors
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
        />
      </mesh>
    </group>
  );
}