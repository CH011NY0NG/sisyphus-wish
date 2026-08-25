import { useMemo } from "react";
import { buildMountainGeometry } from "../lib/mountain";

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