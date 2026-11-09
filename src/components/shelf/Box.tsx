import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { useBoxTextures } from './useBoxTextures';
import { palette } from './palette';
import type { ShelfProject } from './types';

/**
 * A Box: a Project in its physical form.
 *
 * A clothbound hardback, from scripts/shelf.py, that every Project reuses. The
 * board game box it replaced had a lid seam across a third of its face, which
 * is not how a game box is made and is not what a shelf of them looks like.
 *
 * ADR 0001 ruled out modelled Boxes because a hand-authored one would mean
 * opening Blender to add a Project; a single scripted book does not have that
 * problem, because the Cover and Spine are still painted here, per Project, at
 * runtime. Same boards, different printing.
 *
 * Dimensions are repeated in scripts/shelf.py and have to agree with it.
 */
export const BOX = {
  thickness: 0.2, // X: what you see edge-on
  height: 1.0, // Y
  width: 0.82, // Z: the depth into the shelf, and the Cover's width
};

const MODEL = '/models/book.glb';

/**
 * A tiling normal map of book cloth, baked in Blender. One small map, shared by
 * every Box, is what stops a painted Spine reading as paint: cloth is given
 * away by the light crawling over the weave rather than by its colour.
 */
const WEAVE = '/models/cloth-normal.webp';
/** How wide one tile of the weave is, in scene units. 22 threads across it. */
const WEAVE_TILE = 0.066;
/** Shallow. A spine you can see the threads of from across the room is a rug. */
const WEAVE_DEPTH = 0.55;

/** Material names the model carries, which is how the printing finds its faces. */
const COVER_MATERIAL = 'BookCover';
const SPINE_MATERIAL = 'BookSpine';

/**
 * Mirrors the book constants in scripts/shelf.py, and has to agree with them.
 * Only needed to tile the weave at the same density on a flat board and on a
 * curved back, where the printed face is an arc rather than a chord.
 */
const SPINE_ROUND = 0.03;
const GROOVE = 0.005;
const COVER_SPAN = BOX.width - SPINE_ROUND - GROOVE;
const SPINE_RADIUS = ((BOX.thickness / 2) ** 2 + SPINE_ROUND ** 2) / (2 * SPINE_ROUND);
const SPINE_SPAN = 2 * SPINE_RADIUS * Math.asin(BOX.thickness / 2 / SPINE_RADIUS);

/**
 * Two tilings of the one weave: the Cover's face is wide, the Spine's is
 * narrow, and a shared texture cannot carry two repeats. Cloned once for the
 * whole page rather than per Box, because a clone shares its image but gets its
 * own upload to the card.
 */
const weaves = new WeakMap<THREE.Texture, { cover: THREE.Texture; spine: THREE.Texture }>();

function weaveFor(base: THREE.Texture, anisotropy: number) {
  const held = weaves.get(base);
  if (held) return held;

  const tiled = (span: number) => {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace; // directions, not colours
    t.repeat.set(span / WEAVE_TILE, BOX.height / WEAVE_TILE);
    // Tiled this many times, the weave is sub-pixel at Shelf distance. Without
    // anisotropy it would not fade to smooth cloth, it would crawl.
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };

  const made = { cover: tiled(COVER_SPAN), spine: tiled(SPINE_SPAN) };
  weaves.set(base, made);
  return made;
}

/** The front board, hinged at the spine in the model so it can swing open. */
const FRONT_BOARD = 'Book.FrontBoard';
/** How far the cover opens. Not flat: a hardback does not lie open easily. */
const COVER_SWING = -1.15;

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
  const frontBoard = useRef<THREE.Object3D | null>(null);
  const { scene } = useGLTF(MODEL);
  const renderer = useThree((s) => s.gl);
  const weave = weaveFor(useTexture(WEAVE), renderer.capabilities.getMaxAnisotropy());
  const textures = useBoxTextures(project, textureSize);
  const p = palette();

  // Every Box needs its own copy: the geometry is shared but the printing is
  // not, so the materials cannot be.
  const model = useMemo(() => {
    // Cloth and pages keep the materials the model was exported with: they are
    // the same on every Book, so there is nothing to make per instance.
    const printed = (map: THREE.Texture | null, normal: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : p.border,
        map: map ?? null,
        normalMap: normal,
        normalScale: new THREE.Vector2(WEAVE_DEPTH, WEAVE_DEPTH),
        // Cloth, not card. Nothing on a bound book is anywhere near shiny.
        roughness: 0.84,
        metalness: 0,
      });

    const cover = printed(textures.cover, weave.cover);
    const spine = printed(textures.spine, weave.spine);

    const root = scene.clone(true);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material)?.name ?? '';
      if (name === COVER_MATERIAL) mesh.material = cover;
      else if (name === SPINE_MATERIAL) mesh.material = spine;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    frontBoard.current = root.getObjectByName(FRONT_BOARD) ?? null;
    return { root, made: [cover, spine] };
  }, [scene, textures, weave, p.border]);

  // Only the printed materials are made per Book, so only those are let go.
  // Disposing the shared cloth and pages would blank every other Book.
  useEffect(() => () => model.made.forEach((m) => m.dispose()), [model]);

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

    if (frontBoard.current) {
      // Hinged at the spine, so this swings the cover rather than spinning a
      // board about its middle.
      const swing = opened ? COVER_SWING : 0;
      frontBoard.current.rotation.y += (swing - frontBoard.current.rotation.y) * ease;
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
      <primitive object={model.root} />
    </group>
  );
}

useGLTF.preload(MODEL);
