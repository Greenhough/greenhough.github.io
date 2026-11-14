import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { isFrozen, lampsNow, roomLight, roomTime, setLamps, turntable } from './clock';
import { voiceLevel } from './voice';
import { model } from './models';

/**
 * The carcass and the room it stands in, modelled and lit in Blender.
 *
 * All three files are build artifacts of scripts/shelf.py. See docs/adr/0003
 * for the baking, docs/adr/0004 for why the room is a closed room with a
 * window rather than a floor and a wall fading into the page, and
 * docs/adr/0006 for the few things in it that move.
 */
const MODEL = model('shelf.glb');
const CARCASS_ATLAS = model('shelf-bake.webp');
/** The room atlas is 4096 on a desktop and half that on a phone. */
const ROOM_ATLAS = model('room-bake.webp');
const ROOM_ATLAS_SMALL = model('room-bake-2k.webp');

/** Meshes whose names start with this take the room atlas. */
const ROOM_PREFIX = 'Room';

/**
 * What moves, found by name. The loader strips the dots Blender puts in a
 * name, so 'Room.FloorPlant.Leaf.3' arrives as 'RoomFloorPlantLeaf3'.
 */
const RECORD = /^RoomRecord$/;
const LEAF = /^Room(FloorPlant|TopPlant|Plant)Leaf/;
/** Marcus Aurelius. Dressing that answers when spoken to: see BustProps. */
const BUST = 'RoomBust';
/** How much the Bust brightens under the pointer. Quiet, like the Book stack's lift. */
const BUST_LIFT = 1.14;
/** How much brighter he gets at the loudest of his line. A glow that follows the voice, since a bust cannot move its lips. */
const BUST_VOICE = 0.3;
/** Hit box margin around the Bust, so a head this small is not fiddly to click. */
const BUST_MARGIN = 0.03;
/** 33⅓ rpm, in radians a second. */
const RECORD_SPEED = (100 / 3 / 60) * Math.PI * 2;

function prepare(texture: THREE.Texture) {
  // glTF UVs have their origin at the top left, unlike everything else three
  // loads, so a texture applied by hand has to be told not to flip.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

interface Leaf {
  object: THREE.Object3D;
  rest: THREE.Euler;
  phase: number;
  /** Radians. The big plant's leaves move more than the little ones'. */
  reach: number;
}

/**
 * Everything here is drawn with MeshBasicMaterial, which takes no light.
 * That is the point: the lamplight, the bounce, the occlusion in the corners
 * and the shelf's own shadow on the floor and wall are all in the atlases
 * already. Lighting it again would put a second sun in a room that has one.
 *
 * Two atlases rather than one, because a floor is mostly empty and a carcass
 * is mostly edges. Sharing a map makes the soft shadow and the grain on a
 * board edge compete for the same texels, and both lose.
 */
interface Props {
  phone?: boolean;
  /**
   * The Bust leads nowhere, and is not a View (docs/adr/0005 keeps the last
   * one for the Pinboard). Clicking it only puts a line of the Meditations in
   * the HUD; the camera does not move.
   */
  onBust?: () => void;
  onHover?: (hovering: boolean) => void;
}

export function ShelfModel({ phone = false, onBust, onHover }: Props) {
  const bustHovered = useRef(false);
  const bustVoice = useRef(0);
  const { scene } = useGLTF(MODEL);
  const [carcassMap, roomMap] = useTexture([CARCASS_ATLAS, phone ? ROOM_ATLAS_SMALL : ROOM_ATLAS]);

  const built = useMemo(() => {
    // No tone mapping on these, for the same reason they take no light: an
    // atlas left Blender already mapped to a display. The canvas as a whole
    // is untone-mapped now (see Shelf.tsx), so this flag is belt and braces.
    //
    // The colour is the one live thing about a baked surface. Every material
    // here shares roomLight, the single colour the lamps' level is written
    // to, so the whole room comes up together when they strike.
    const baked = (map: THREE.Texture) => {
      const material = new THREE.MeshBasicMaterial({ map: prepare(map), toneMapped: false });
      material.color = roomLight;
      return material;
    };

    const carcassMaterial = baked(carcassMap);
    const roomMaterial = baked(roomMap);
    // The Bust gets its own copy of the room's material so it alone can
    // brighten under the pointer. Its colour follows roomLight every frame.
    const bustMaterial = new THREE.MeshBasicMaterial({ map: roomMaterial.map, toneMapped: false });
    let bust: THREE.Object3D | null = null;

    const root = scene.clone(true);
    const leaves: Leaf[] = [];
    let record: THREE.Object3D | null = null;

    root.traverse((child) => {
      if (RECORD.test(child.name)) record = child;
      if (child.name === BUST) bust = child;
      if (LEAF.test(child.name)) {
        leaves.push({
          object: child,
          rest: child.rotation.clone(),
          phase: leaves.length * 2.399,
          reach: child.name.includes('FloorPlant') ? 0.022 : 0.012,
        });
      }

      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // A joined object arrives as a group of meshes, one per material, under
      // a node carrying the name. Either the mesh or its parent says "Room".
      const named = mesh.name.startsWith(ROOM_PREFIX) || !!mesh.parent?.name.startsWith(ROOM_PREFIX);
      const isBust = mesh.name === BUST || mesh.parent?.name === BUST;
      mesh.material = isBust ? bustMaterial : named ? roomMaterial : carcassMaterial;
      // Baked surfaces neither cast nor receive at runtime; their shading is
      // already in the texture. Only a Book in the hand does real-time shadow.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    // Where the Bust stands, for a hit box around it. The root sits at the
    // origin, so its own bounds are already in the Room's coordinates.
    let bustBox: { center: THREE.Vector3; size: THREE.Vector3 } | null = null;
    if (bust) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(bust).expandByScalar(BUST_MARGIN);
      bustBox = { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    }
    return { root, leaves, record: record as THREE.Object3D | null, bustMaterial, bustBox };
  }, [scene, carcassMap, roomMap]);

  useFrame((_, delta) => {
    const t = roomTime();

    built.bustMaterial.color.copy(roomLight);
    if (bustHovered.current) built.bustMaterial.color.multiplyScalar(BUST_LIFT);
    // Eased, so the glow swells and settles with the voice rather than flickering on every syllable.
    bustVoice.current += (voiceLevel() - bustVoice.current) * Math.min(1, delta * 12);
    if (bustVoice.current > 0.002) built.bustMaterial.color.multiplyScalar(1 + bustVoice.current * BUST_VOICE);

    // The lamps strike once, when the room first draws.
    setLamps(lampsNow());

    // The record turns while a song is playing, and stands still otherwise.
    // Its light is baked, and a baked highlight that turned with it would be
    // wrong, but vinyl at this size is a black disc with a label: what turns
    // is the label, and that is all that needs to.
    if (built.record && turntable.playing && !isFrozen) {
      built.record.rotation.y -= delta * RECORD_SPEED;
    }

    // Leaves, a degree or so, each on its own time. Enough that the corner of
    // the eye catches it and not enough that the baked shadows give it away.
    for (const leaf of built.leaves) {
      leaf.object.rotation.x = leaf.rest.x + Math.sin(t * 0.83 + leaf.phase) * leaf.reach;
      leaf.object.rotation.z = leaf.rest.z + Math.sin(t * 0.61 + leaf.phase * 1.7) * leaf.reach * 0.7;
    }
  });

  const box = built.bustBox;
  return (
    <>
      <primitive object={built.root} />
      {box && onBust && (
        // An invisible box rather than handlers on the room itself, so the
        // pointer is only raycast against six faces and not every wall.
        <mesh
          position={box.center}
          onClick={(e) => {
            e.stopPropagation();
            onBust();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            bustHovered.current = true;
            onHover?.(true);
          }}
          onPointerOut={() => {
            bustHovered.current = false;
            onHover?.(false);
          }}
        >
          <boxGeometry args={[box.size.x, box.size.y, box.size.z]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

// Asked for at module load, alongside the model, rather than when the model
// has arrived and the component first renders. Suspense fetches in the order
// it suspends, which made these a second round trip behind the .glb.
useGLTF.preload(MODEL);
useTexture.preload(CARCASS_ATLAS);
