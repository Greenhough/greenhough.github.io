import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { BOX_LIGHT, bakeInto, prepareLight, stackTile } from './bakedLight';
import { ensureFonts, paintReadSpine, toTexture } from './covers';
import { READ_BOOKS } from './readBooks';
import { BOX } from './Box';
import { model } from './models';

/**
 * The stack of read books on the desk.
 *
 * Real-time rather than baked into the room, for one reason: a title baked
 * into the room atlas would be about twenty texels tall and unreadable. These
 * reuse the Boxes' own geometry and their own Spine painter, lying down, which
 * is the cheapest possible way to get lettering that survives the camera
 * coming closer when the Desk view lands.
 *
 * Why four books that are not Projects can sit in a scene where a book means a
 * Project is argued in docs/adr/0004 and summarised in readBooks.ts.
 */
const MODEL = model('book.glb');

/** Mirrors DESK in scripts/shelf.py, and has to agree with it. */
const DESK = { height: 0.74, floorY: -1.2975 };
const DESK_TOP = DESK.floorY + DESK.height;

/**
 * How long a book is, lying down. A Project's Box is a metre tall, which is
 * deliberate and monumental and would be absurd on a desk, so these are cut to
 * roughly a large hardback — still a shade over life size, because under it
 * the lettering stops being lettering.
 */
const LENGTH = 0.42;
/**
 * Thickness is scaled harder than the rest. At the Box's own proportions a
 * book this long would be 84mm thick and four of them would stack taller than
 * they are long, which is a pile of bricks rather than a pile of books.
 */
const THICKNESS = 0.046;

/** Where the stack sits: clear of the desk lamp on one side and the laptop on the other. */
const AT = { x: -2.08, z: -0.16 };

interface Props {
  /** The stack is the way in to the books Evan would hand to someone. */
  onOpen: () => void;
  onHover: (hovering: boolean) => void;
}

export function BookStack({ onOpen, onHover }: Props) {
  // The top book lifts a little under the pointer, the way the sheet of paper
  // lifts a corner: the stack saying it can be picked up.
  const [lifted, setLifted] = useState(false);
  const { scene } = useGLTF(MODEL);
  const renderer = useThree((s) => s.gl);
  const light = prepareLight(useTexture(BOX_LIGHT));
  const [spines, setSpines] = useState<THREE.CanvasTexture[] | null>(null);

  // Painted once for the page. Unlike a Project's Spine these never change:
  // the titles are a constant, so there is nothing to repaint.
  useEffect(() => {
    let cancelled = false;
    const made: THREE.CanvasTexture[] = [];
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      for (const book of READ_BOOKS) {
        const canvas = document.createElement('canvas');
        paintReadSpine(canvas, book, 512);
        made.push(toTexture(canvas, renderer));
      }
      if (cancelled) return;
      setSpines(made);
    })();
    return () => {
      cancelled = true;
      made.forEach((t) => t.dispose());
    };
  }, [renderer]);

  const stack = useMemo(() => {
    if (!spines) return null;
    const materials: THREE.Material[] = [];

    const books = READ_BOOKS.map((book, i) => {
      const cover = new THREE.MeshStandardMaterial({
        color: book.cloth,
        roughness: 0.86,
        metalness: 0,
      });
      const spine = new THREE.MeshStandardMaterial({
        map: spines[i],
        roughness: 0.86,
        metalness: 0,
      });
      materials.push(cover, spine);

      // These never leave the desk, so they are never lit live: the light the
      // desk lamp throws on them is baked, the same way the desk's is, and
      // `live` stays at nought. See bakedLight.ts.
      const tile = stackTile(i);
      const atRest = { value: 0 };
      if (tile) {
        bakeInto(cover, light, tile, atRest);
        bakeInto(spine, light, tile, atRest);
      }
      const own = new Map<string, THREE.MeshStandardMaterial>();

      const root = scene.clone(true);
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const shared = mesh.material as THREE.MeshStandardMaterial;
        const name = shared?.name ?? '';
        // Both boards are the binding's own cloth: only a Project's Cover is
        // printed, and these are not Projects.
        if (name === 'BookCover' || name === 'BookCloth') mesh.material = cover;
        else if (name === 'BookSpine') mesh.material = spine;
        else if (tile) {
          let mine = own.get(name);
          if (!mine) {
            mine = bakeInto(shared.clone(), light, tile, atRest);
            own.set(name, mine);
            materials.push(mine);
          }
          mesh.material = mine;
        }
        mesh.castShadow = !tile;
        mesh.receiveShadow = false;
      });
      return { book, root, i };
    });

    return { books, materials };
  }, [scene, spines, light]);

  useEffect(() => () => stack?.materials.forEach((m) => m.dispose()), [stack]);

  if (!stack) return null;

  return (
    <group
      position={[AT.x, DESK_TOP, AT.z]}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
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
      {stack.books.map(({ book, root, i }) => (
        <group
          key={book.title}
          // A few degrees out of square each, because a stack nobody squared
          // up is the only kind that looks like it was put there by a person.
          position={[0, THICKNESS * (i + 0.5) + (lifted && i === stack.books.length - 1 ? 0.014 : 0), 0]}
          rotation={[0, (((i * 37) % 11) - 5) * 0.012, 0]}
        >
          {/* Turned on its side: the Box's thickness axis becomes the vertical
              one and the Spine still faces out.

              Turned the way that leaves the back board up, not the front one.
              A Spine is lettered bottom-to-top, so laying the book down the
              other way sends the title right-to-left and it reads upside
              down — which is just as true of a real book. Nothing is lost by
              flipping it: both boards are plain cloth and only a Project's
              Cover carries printing. */}
          <group
            rotation={[0, 0, -Math.PI / 2]}
            scale={[THICKNESS / BOX.thickness, LENGTH / BOX.height, LENGTH / BOX.height]}
          >
            <primitive object={root} />
          </group>
        </group>
      ))}
    </group>
  );
}

useGLTF.preload(MODEL);
