import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ensureFonts, paintSheet, toTexture } from './covers';
import type { ShelfPost } from './types';

/**
 * The sheet of paper on the Desk: the latest Post, lying where someone left it.
 *
 * Posts have never had a physical place on this site — they are the one kind
 * of content the Shelf cannot hold, since a Post has no Theme and no Box. This
 * is that place, per docs/adr/0004.
 *
 * Painted at runtime rather than baked into the room, for the same reason the
 * book stack is: the room atlas gives about a hundred texels to the unit, and
 * a Post's title printed into it would be unreadable. It also has to change
 * when a new Post is written, and the atlas is a build artifact.
 */
interface Props {
  post: ShelfPost;
  /** True at the Desk: the sheet comes up to be read. */
  active: boolean;
  onOpen: (slug: string) => void;
  onHover: (hovering: boolean) => void;
}

/** Mirrors DESK in scripts/shelf.py, and has to agree with it. */
const DESK_TOP = -1.2975 + 0.74;

/** A4 at the room's scale: one unit is one metre. */
const WIDTH = 0.26;
const HEIGHT = WIDTH * 1.414;

/**
 * In front of the laptop and clear of the plant. The desk is a crowded 1.77
 * units once a lamp, a book stack, a laptop and a plant are on it, and this is
 * the one stretch of it still free.
 */
const AT = { x: -1.6, z: 0.035 };

/** A few degrees off square. Nobody sets a sheet of paper down straight. */
const YAW = -0.055;

export function Paper({ post, active, onOpen, onHover }: Props) {
  const renderer = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [lifted, setLifted] = useState(false);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      paintSheet(canvas, post, 768);
      made = toTexture(canvas, renderer);
      setTexture(made);
    })();
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [post, renderer]);

  const material = useMemo(() => {
    if (!texture) return null;
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0,
      // Paper is thin enough to be lit from behind, and the sheet is a single
      // plane, so the back has to draw as well as the front.
      side: THREE.DoubleSide,
    });
  }, [texture]);

  useEffect(() => () => material?.dispose(), [material]);

  /**
   * Where the sheet wants to be, and which way it wants to face.
   *
   * Lying on the desk it cannot be read: seen from the Desk view it is
   * foreshortened to a pale sliver, and the whole point of putting a Post
   * there was that you could see what it is. So at the Desk it comes up and
   * turns to face the camera — the same thing a Box does when it leaves the
   * Shelf, which is already this site's way of saying "here, look at this".
   *
   * Everywhere else it lies flat and slightly out of square, and lifts a
   * corner on hover. That hover is the whole affordance: docs/adr/0005 ruled
   * out key hints and an on-screen list of what is clickable, so the objects
   * have to say it themselves, and paper says it by moving.
   */
  const flat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, YAW)),
    []
  );
  const held = useRef(new THREE.Vector3());
  const facing = useRef(new THREE.Quaternion());
  const aim = useRef(new THREE.Object3D());

  useFrame((_, delta) => {
    if (!group.current) return;
    const ease = 1 - Math.pow(0.004, delta);

    if (active) {
      held.current.set(AT.x - 0.07, DESK_TOP + 0.26, AT.z + 0.1);
      aim.current.position.copy(held.current);
      aim.current.lookAt(camera.position);
      facing.current.copy(aim.current.quaternion);
    } else {
      held.current.set(AT.x, DESK_TOP + 0.0014 + (lifted ? 0.016 : 0), AT.z);
      facing.current.copy(flat);
    }

    group.current.position.lerp(held.current, ease);
    group.current.quaternion.slerp(facing.current, ease);
  });

  if (!material) return null;

  return (
    <group
      ref={group}
      position={[AT.x, DESK_TOP + 0.0014, AT.z]}
      rotation={[-Math.PI / 2, 0, YAW]}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(post.slug);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setLifted(true);
        onHover(true);
      }}
      onPointerOut={() => {
        setLifted(false);
        onHover(false);
      }}
    >
      <mesh material={material} castShadow>
        <planeGeometry args={[WIDTH, HEIGHT]} />
      </mesh>
    </group>
  );
}
