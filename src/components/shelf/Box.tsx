import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useBoxTextures } from './useBoxTextures';
import { palette } from './palette';
import type { ShelfProject } from './types';

/**
 * A Box: a Project in its physical form.
 *
 * Code geometry, not a model. ADR 0001: the moment a Box is hand-authored in
 * Blender, adding a Project means opening Blender and the Shelf stops scaling.
 *
 * Dimensions are a board game box on its edge, so the narrow Spine faces out
 * and the Cover faces sideways, the way a shelved box actually sits.
 */
export const BOX = {
  thickness: 0.2, // X: what you see edge-on
  height: 1.0, // Y
  width: 0.82, // Z: the depth into the shelf, and the Cover's width
};

/** How far a Box slides out of the Shelf when it is the focused one. */
const FOCUS_NUDGE = 0.1;

interface Props {
  project: ShelfProject;
  /** Resting position on the Shelf. */
  position: [number, number, number];
  textureSize: number;
  focused: boolean;
  inspecting: boolean;
  opened: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

export function Box({
  project,
  position,
  textureSize,
  focused,
  inspecting,
  opened,
  onSelect,
  onHover,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const textures = useBoxTextures(project, textureSize);
  const p = palette();

  // Where the Box wants to be, given the state. The frame loop eases towards it
  // rather than snapping, which is what makes it feel like an object.
  useFrame((_, delta) => {
    if (!group.current) return;
    const ease = 1 - Math.pow(0.0015, delta);

    const target = new THREE.Vector3(...position);
    let targetRotY = 0;

    if (inspecting) {
      // Held out of the Shelf, turned so the Cover faces the reader.
      target.set(position[0], position[1] + 0.12, position[2] + 1.5);
      targetRotY = -Math.PI / 2;
    } else if (focused) {
      target.set(position[0], position[1], position[2] + FOCUS_NUDGE);
    }

    group.current.position.lerp(target, ease);
    group.current.rotation.y += (targetRotY - group.current.rotation.y) * ease;

    if (lid.current) {
      const lift = opened ? BOX.height * 0.55 : 0;
      lid.current.position.y += (lift - lid.current.position.y) * ease;
    }
  });

  // Face order for BoxGeometry is +X, -X, +Y, -Y, +Z, -Z.
  // +X carries the Cover, +Z carries the Spine.
  const faces = [
    textures?.cover, // +X  the printed face
    undefined, // -X  back of the box
    undefined, // +Y  top
    undefined, // -Y  bottom
    textures?.spine, // +Z  the edge you see while it is shelved
    undefined, // -Z  the edge against the back panel
  ];

  return (
    <group
      ref={group}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[BOX.thickness, BOX.height, BOX.width]} />
        {/*
          The key has to change when the Cover finishes painting. Without it
          React patches the existing material in place, the shader keeps its
          old no-texture program, and the Box renders solid black.
        */}
        {faces.map((map, i) => (
          <meshStandardMaterial
            key={`${i}-${map ? 'printed' : 'blank'}`}
            attach={`material-${i}`}
            {...(map ? { map } : { color: p.border })}
            roughness={0.85}
            metalness={0}
          />
        ))}
      </mesh>

      {/* The lid. Shallow, slightly proud of the base, and lifts when Opened. */}
      <group ref={lid}>
        <mesh castShadow position={[0, BOX.height * 0.36, 0]}>
          <boxGeometry
            args={[BOX.thickness * 1.04, BOX.height * 0.3, BOX.width * 1.02]}
          />
          <meshStandardMaterial
            color={p.paper}
            roughness={0.85}
            transparent
            opacity={opened ? 1 : 0}
            depthWrite={opened}
          />
        </mesh>
      </group>
    </group>
  );
}
