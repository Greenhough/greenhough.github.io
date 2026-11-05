import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ensureFonts, loadImage, paintCover, paintSpine, toTexture } from './covers';
import type { ShelfProject } from './types';

export interface BoxTextures {
  cover: THREE.CanvasTexture;
  spine: THREE.CanvasTexture;
}

/**
 * Paints a Project's Cover and Spine once and keeps them.
 *
 * Phones get 512px Covers and desktops 1024px, which is the texture budget in
 * docs/adr/0002. The Spine is painted at half that: it is a narrow strip and
 * never fills much of the screen.
 */
export function useBoxTextures(project: ShelfProject, size: number): BoxTextures | null {
  const renderer = useThree((s) => s.gl);
  const [textures, setTextures] = useState<BoxTextures | null>(null);

  useEffect(() => {
    let cancelled = false;
    const made: THREE.CanvasTexture[] = [];

    (async () => {
      await ensureFonts();
      const art = await loadImage(size <= 512 ? project.art.small : project.art.large);
      if (cancelled) return;

      const coverCanvas = document.createElement('canvas');
      paintCover(coverCanvas, project, art, size);

      const spineCanvas = document.createElement('canvas');
      paintSpine(spineCanvas, project, Math.round(size * 0.75));

      const cover = toTexture(coverCanvas, renderer);
      const spine = toTexture(spineCanvas, renderer);
      made.push(cover, spine);

      if (cancelled) {
        made.forEach((t) => t.dispose());
        return;
      }
      setTextures({ cover, spine });
    })();

    return () => {
      cancelled = true;
      made.forEach((t) => t.dispose());
    };
  }, [project, size, renderer]);

  return textures;
}
