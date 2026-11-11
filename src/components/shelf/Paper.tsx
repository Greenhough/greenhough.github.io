import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ensureFonts, paintSheet, toTexture } from './covers';
import type { ShelfPost } from './types';
import { easeFor, roomLight } from './clock';

/** What white paper comes out as in the bake: on the desk by the lamp, and held up. */
const ON_DESK = new THREE.Color(0.80, 0.66, 0.50);
const HELD_UP = new THREE.Color(0.95, 0.89, 0.80);

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

/**
 * A4 at the room's scale, where one unit is one metre.
 *
 * It was 0.26 wide, which at A4's proportions is 368mm deep — and lying flat
 * that put a third of the sheet out over the front edge of the desk, hanging
 * in the air. Paper is a size people know; getting it wrong shows.
 */
const WIDTH = 0.22;
const HEIGHT = WIDTH * 1.414;

/**
 * To the right of the laptop, where it fits the desk with a margin on every
 * side. The desk is 1.77 units with a lamp, a book stack and a laptop on it,
 * and this is the open stretch beside the laptop.
 */
const AT = { x: -1.13, z: -0.06 };

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

  // Unlit, and tinted by hand. The sheet was a standard material lit by the
  // live lights, which are set for a Book held out in front of the Shelf: on
  // the desk they made white paper a flat grey, the one dull thing under a
  // lamp. A sheet of paper is as simple a surface as there is, so it takes
  // the colour the bake gives paper where it is: warm and bright under the
  // desk lamp lying down, a little cooler held up to be read.
  const material = useMemo(() => {
    if (!texture) return null;
    return new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      // The sheet is a single plane, so the back has to draw as well.
      side: THREE.DoubleSide,
    });
  }, [texture]);
  const lift = useRef(0);

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
    const ease = easeFor(delta, 0.004);

    if (active) {
      // Up off the desk and a good way towards the camera. The Desk view
      // stands two metres back now, and a sheet held just above where it lay
      // was the size of a postage stamp from there.
      held.current.set(AT.x - 0.2, DESK_TOP + 0.38, AT.z + 0.62);
      aim.current.position.copy(held.current);
      aim.current.lookAt(camera.position);
      facing.current.copy(aim.current.quaternion);
    } else {
      held.current.set(AT.x, DESK_TOP + 0.0014 + (lifted ? 0.016 : 0), AT.z);
      facing.current.copy(flat);
    }

    group.current.position.lerp(held.current, ease);
    group.current.quaternion.slerp(facing.current, ease);

    // Larger in the hand: the Desk view stands two metres off.
    lift.current += ((active ? 1 : 0) - lift.current) * ease;
    group.current.scale.setScalar(1 + 0.35 * lift.current);
    material?.color.copy(ON_DESK).lerp(HELD_UP, lift.current).multiply(roomLight);
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
      <mesh material={material}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
      </mesh>
    </group>
  );
}
