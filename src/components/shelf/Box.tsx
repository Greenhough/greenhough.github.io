import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useBoxTextures } from './useBoxTextures';
import { palette } from './palette';
import type { ShelfProject } from './types';

/**
 * A Box: a Project in its physical form.
 *
 * One modelled box, from scripts/shelf.py, that every Project reuses. ADR 0001
 * ruled out modelled Boxes because a hand-authored one would mean opening
 * Blender to add a Project; a single scripted box does not have that problem,
 * because the Cover and Spine are still painted here, per Project, at runtime.
 * Same geometry, different printing.
 *
 * Dimensions are repeated in scripts/shelf.py and have to agree with it.
 */
export const BOX = {
  thickness: 0.2, // X: what you see edge-on
  height: 1.0, // Y
  width: 0.82, // Z: the depth into the shelf, and the Cover's width
};

const MODEL = '/models/box.glb';

/** Material names the model carries, which is how the printing finds its faces. */
const COVER_MATERIAL = 'BoxCover';
const SPINE_MATERIAL = 'BoxSpine';

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
  const lid = useRef<THREE.Object3D | null>(null);
  const { scene } = useGLTF(MODEL);
  const textures = useBoxTextures(project, textureSize);
  const p = palette();

  // Every Box needs its own copy: the geometry is shared but the printing is
  // not, so the materials cannot be.
  const model = useMemo(() => {
    const card = new THREE.MeshStandardMaterial({
      color: p.border,
      roughness: 0.72,
      metalness: 0,
    });
    const printed = (map: THREE.Texture | null) =>
      new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : p.border,
        map: map ?? null,
        roughness: 0.74,
        metalness: 0,
      });

    const cover = printed(textures.cover);
    const spine = printed(textures.spine);

    const root = scene.clone(true);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material)?.name ?? '';
      mesh.material =
        name === COVER_MATERIAL ? cover : name === SPINE_MATERIAL ? spine : card;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    lid.current = root.getObjectByName('Box.Lid') ?? null;
    return root;
  }, [scene, textures, p.border]);

  // Materials are made per Box, so they have to be let go per Box too.
  useEffect(() => {
    const made = new Set<THREE.Material>();
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) made.add(mesh.material as THREE.Material);
    });
    return () => made.forEach((m) => m.dispose());
  }, [model]);

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
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(MODEL);
