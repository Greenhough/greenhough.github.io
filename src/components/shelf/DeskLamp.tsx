import { useMemo } from 'react';
import * as THREE from 'three';
import { deskLamp } from './clock';
import { hear } from './sound';
import room from './room.json';

/**
 * The desk lamp's switch. It starts off (see clock.ts): click the lamp and it
 * comes on, click it again and it goes off.
 *
 * The lamp itself is baked into the Room, and so is its light, as an atlas of
 * its own that ShelfModel adds for as long as it is on. All this is, then, is
 * something to click: a box round the lamp that draws nothing, the way the
 * Bust's is. Where the lamp stands comes from room.json, which the bake
 * writes.
 *
 * Not a door. It leads nowhere, like the Bust: the Room answers and the
 * camera stays where it is.
 */

/** A little bigger than the lamp, which is a thin thing to hit from across the Room. */
const MARGIN = 0.035;

interface Props {
  onHover: (hovering: boolean) => void;
}

export function DeskLamp({ onHover }: Props) {
  const box = useMemo(() => {
    const min = new THREE.Vector3(...(room.deskLamp.min as [number, number, number]));
    const max = new THREE.Vector3(...(room.deskLamp.max as [number, number, number]));
    const bounds = new THREE.Box3(min, max).expandByScalar(MARGIN);
    return { centre: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()) };
  }, []);

  return (
    <mesh
      position={box.centre}
      onClick={(e) => {
        e.stopPropagation();
        deskLamp.on = !deskLamp.on;
        hear('switch');
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      <boxGeometry args={[box.size.x, box.size.y, box.size.z]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}
