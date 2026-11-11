import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { paintLabel, toTexture, ensureFonts } from './covers';
import { palette } from './palette';
import { BOX } from './Box';
import { roomLight } from './clock';

/** What white paper comes out as on the front of the Shelf, by the bake. */
const LAMPLIGHT = new THREE.Color(0.86, 0.74, 0.58);

/**
 * The Shelf, built from code geometry.
 *
 * ADR 0001 has the Shelf as an imported model. It is code geometry for now so
 * the scene works end to end without waiting on a .glb; a shelf is uprights and
 * planks, which code geometry handles honestly. Swapping in a Draco-compressed
 * model later means replacing this component, not the scene around it.
 */

/** One Box plus the air beside it. */
export const SLOT = BOX.thickness + 0.055;
/** Slots per Section. More than there are Projects, so the Shelf has room to grow. */
export const SLOTS = 6;

export const SHELF = {
  innerWidth: SLOTS * SLOT,
  openingHeight: BOX.height + 0.16,
  depth: BOX.width + 0.1,
  plank: 0.045,
  side: 0.055,
  back: 0.03,
};

/** Y of the floor of a Section, counting from the top down. */
export function sectionFloorY(index: number, total: number): number {
  const unitHeight = total * (SHELF.openingHeight + SHELF.plank) + SHELF.plank;
  const top = unitHeight / 2;
  return top - SHELF.plank - (index + 1) * SHELF.openingHeight - index * SHELF.plank;
}

/** X of a slot within a Section, left-aligned so new Projects fill rightwards. */
export function slotX(index: number): number {
  return -SHELF.innerWidth / 2 + SLOT / 2 + index * SLOT;
}

function SectionLabel({ text, y }: { text: string; y: number }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      paintLabel(canvas, text, 512);
      made = toTexture(canvas);
      if (cancelled) {
        made.dispose();
        return;
      }
      setTexture(made);
    })();
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [text]);

  // The label is a card on the Shelf, so it takes the Shelf's light: the
  // lamp's warmth at about the strength it falls on the board edge beside it,
  // and the lamps' level when they strike. Drawn at full white it was the one
  // thing in the room lit like a web page.
  const material = useMemo(() => {
    if (!texture) return null;
    return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  }, [texture]);
  useFrame(() => {
    material?.color.copy(roomLight).multiply(LAMPLIGHT);
  });
  useEffect(() => () => material?.dispose(), [material]);

  if (!material) return null;

  const w = SHELF.innerWidth * 0.62;
  return (
    <mesh position={[-SHELF.innerWidth / 2 + w / 2, y, SHELF.depth / 2 + 0.002]} material={material}>
      <planeGeometry args={[w, w * 0.14]} />
    </mesh>
  );
}

export function ShelfUnit({ sections }: { sections: number }) {
  const p = palette();
  const unitHeight = sections * (SHELF.openingHeight + SHELF.plank) + SHELF.plank;
  const outerWidth = SHELF.innerWidth + SHELF.side * 2;

  const wood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.border, roughness: 0.78, metalness: 0 }),
    [p.border]
  );
  const backPanel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.muted, roughness: 0.95, metalness: 0 }),
    [p.muted]
  );

  const planks = [];
  for (let i = 0; i <= sections; i++) {
    const y =
      unitHeight / 2 - SHELF.plank / 2 - i * (SHELF.openingHeight + SHELF.plank);
    planks.push(
      <mesh key={`plank-${i}`} position={[0, y, 0]} material={wood} castShadow receiveShadow>
        <boxGeometry args={[outerWidth, SHELF.plank, SHELF.depth]} />
      </mesh>
    );
  }

  return (
    <group>
      {planks}

      {/* uprights */}
      {[-1, 1].map((side) => (
        <mesh
          key={`side-${side}`}
          position={[side * (SHELF.innerWidth / 2 + SHELF.side / 2), 0, 0]}
          material={wood}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[SHELF.side, unitHeight, SHELF.depth]} />
        </mesh>
      ))}

      {/* back panel, set behind the boxes so they read against something */}
      <mesh
        position={[0, 0, -SHELF.depth / 2 - SHELF.back / 2]}
        material={backPanel}
        receiveShadow
      >
        <boxGeometry args={[outerWidth, unitHeight, SHELF.back]} />
      </mesh>
    </group>
  );
}

export { SectionLabel };
