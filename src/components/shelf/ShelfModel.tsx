import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';

/**
 * The carcass and the room it stands in, modelled and lit in Blender.
 *
 * All three files are build artifacts of scripts/shelf.py. See docs/adr/0003
 * for the baking, and docs/adr/0004 for why the room is a closed room with a
 * window rather than a floor and a wall fading into the page.
 */
const MODEL = '/models/shelf.glb';
const CARCASS_ATLAS = '/models/shelf-bake.webp';
const ROOM_ATLAS = '/models/room-bake.webp';

/** Meshes whose names start with this take the room atlas. */
const ROOM_PREFIX = 'Room';

function prepare(texture: THREE.Texture) {
  // glTF UVs have their origin at the top left, unlike everything else three
  // loads, so a texture applied by hand has to be told not to flip.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Everything here is drawn with MeshBasicMaterial, which takes no light.
 * That is the point: the daylight, the bounce, the occlusion in the corners
 * and the shelf's own shadow on the floor and wall are all in the atlases
 * already. Lighting it again would put a second sun in a room that has one.
 *
 * Two atlases rather than one, because a floor is mostly empty and a carcass
 * is mostly edges. Sharing a map makes the soft shadow and the grain on a
 * board edge compete for the same texels, and both lose.
 */
export function ShelfModel() {
  const { scene } = useGLTF(MODEL);
  const [carcassMap, roomMap] = useTexture([CARCASS_ATLAS, ROOM_ATLAS]);

  const built = useMemo(() => {
    // No fog. The room used to be a floor and a wall that simply stopped, and
    // fog to the page colour hid the edge. docs/adr/0004 closed the room, so
    // there is no edge left to hide — and fog would now be actively wrong,
    // because on a phone the camera pulls back far enough that the fog would
    // eat the back wall.
    // toneMapped: false is the same argument as MeshBasicMaterial, one level
    // up. react-three-fiber tone maps the whole canvas with ACES by default,
    // which is right for the Boxes: they are really lit, and their shader
    // output is scene-referred light that has to be mapped to a display.
    //
    // An atlas is not that. It left Blender already mapped to a display, so
    // tone mapping it again lifts its midtones and crushes its highlights a
    // second time. The window is where that showed: the glass and the wall
    // beside it both went to flat white in the browser while being plainly
    // distinct in the atlas.
    const baked = (map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ map: prepare(map), toneMapped: false });

    const carcassMaterial = baked(carcassMap);
    const roomMaterial = baked(roomMap);

    const root = scene.clone(true);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = mesh.name.startsWith(ROOM_PREFIX) ? roomMaterial : carcassMaterial;
      // Baked surfaces neither cast nor receive at runtime; their shading is
      // already in the texture. Only the Boxes do real-time shadow work.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return root;
  }, [scene, carcassMap, roomMap]);

  return <primitive object={built} />;
}

useGLTF.preload(MODEL);
