import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ensureFonts, loadImage, paintCover, paintSpine, toTexture } from './covers';
import type { ShelfProject } from './types';

export interface BoxTextures {
  spine: THREE.CanvasTexture | null;
  cover: THREE.CanvasTexture | null;
}

/**
 * Paints a Project's Spine and Cover.
 *
 * The Spine goes first and on its own, because it is what you see while the Box
 * is shelved and it needs no artwork: as soon as the fonts are in, the Shelf is
 * readable. The Cover waits on its image and arrives after, which is soon
 * enough, since a Cover is only seen once a Box is taken off the shelf.
 *
 * Phones get 512px Covers and desktops 1024px, which is the texture budget in
 * docs/adr/0002.
 */
export function useBoxTextures(project: ShelfProject, size: number): BoxTextures {
  const renderer = useThree((s) => s.gl);
  const [textures, setTextures] = useState<BoxTextures>({ spine: null, cover: null });

  useEffect(() => {
    let cancelled = false;
    const made: THREE.CanvasTexture[] = [];

    (async () => {
      await ensureFonts();
      if (cancelled) return;

      const spineCanvas = document.createElement('canvas');
      paintSpine(spineCanvas, project, Math.round(size * 0.75));
      const spine = toTexture(spineCanvas, renderer);
      made.push(spine);
      if (cancelled) return;
      setTextures({ spine, cover: null });

      const src = project.art && (size <= 512 ? project.art.small : project.art.large);
      const art = src ? await loadImage(src) : null;
      if (cancelled) return;

      const coverCanvas = document.createElement('canvas');
      paintCover(coverCanvas, project, art, size);
      const cover = toTexture(coverCanvas, renderer);
      made.push(cover);
      if (cancelled) return;
      setTextures({ spine, cover });
    })();

    return () => {
      cancelled = true;
      made.forEach((t) => t.dispose());
    };
  }, [project, size, renderer]);

  return textures;
}
