import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';

/**
 * The carcass and the room it stands in, modelled and lit in Blender.
 *
 * All three files are build artifacts of scripts/shelf.py. See docs/adr/0003.
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
    const carcassMaterial = new THREE.MeshBasicMaterial({
      map: prepare(carcassMap),
      // Let the room fade into the page colour at its far edges.
      fog: true,
    });
    const roomMaterial = new THREE.MeshBasicMaterial({
      map: prepare(roomMap),
      fog: true,
    });

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
