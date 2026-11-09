import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';

/**
 * The carcass, modelled and lit in Blender.
 *
 * Both files are build artifacts of scripts/shelf.py. See docs/adr/0003.
 */
const MODEL = '/models/shelf.glb';
const ATLAS = '/models/shelf-bake.webp';

/**
 * Drawn with MeshBasicMaterial, which takes no light at all. That is the point:
 * the daylight, the bounce and the occlusion in the corners are already in the
 * atlas. Lighting it again would add a second sun to a room that has one.
 */
export function ShelfModel() {
  const { scene } = useGLTF(MODEL);
  const baked = useTexture(ATLAS);

  const carcass = useMemo(() => {
    // glTF UVs have their origin at the top left, unlike everything else three
    // loads, so a texture applied by hand has to be told not to flip.
    baked.flipY = false;
    baked.colorSpace = THREE.SRGBColorSpace;
    baked.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({ map: baked });
    const root = scene.clone(true);
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = material;
        // It casts onto the Boxes but receives nothing: its own shading is baked.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return root;
  }, [scene, baked]);

  return <primitive object={carcass} />;
}

useGLTF.preload(MODEL);
