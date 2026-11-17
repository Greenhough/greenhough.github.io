import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { deskLight, isFrozen, roomLight } from './clock';
import { hear } from './sound';
import { model } from './models';
import room from './room.json';

/**
 * The clock on the left wall, over the Desk, telling the visitor's own time.
 *
 * Its case is baked into the Room. The face and the hands are drawn here, on
 * top: a numeral baked into the Room's atlas would be three texels tall, and a
 * baked hand cannot move. The face is the model's own printing, rendered
 * square on and unlit by scripts/shelf.py, and like the paintings it is tinted
 * by hand to the light the bake puts on that stretch of wall.
 *
 * The hands are the only thing in the Room that knows what time it is. The
 * Room's light is baked at dusk and stays there: see docs/parked-room-ideas.md
 * for why the Prairie does not follow the hour, and why this can.
 *
 * Not `Clock.tsx`: clock.ts is the Room's own time, the one `?t=` freezes,
 * and on a Mac the two names are one file.
 */
const FACE = model('clock-face.webp');

const CENTRE = new THREE.Vector3(...(room.clock.centre as [number, number, number]));
const RADIUS = room.clock.radius;
/** How much of the clock's radius is face. The rest is the case, which is baked. */
const INSIDE = 0.925;
/**
 * What a white clock face comes out as on that wall: under the room light,
 * and then what the desk lamp, which stands just below it, adds while it is on.
 */
const ON_WALL = new THREE.Color(0.52, 0.53, 0.58);
const BY_DESK_LAMP = new THREE.Color(0.13, 0.1, 0.06);
const INK = new THREE.Color(0.055, 0.052, 0.05);
const RED = new THREE.Color(0.62, 0.1, 0.07);

/** Ten past ten and thirty-six seconds: the time a frozen Room shows, as a clock in a shop window does. */
const STILL = { h: 10, m: 9, s: 36 };

interface HandSpec {
  length: number;
  tail: number;
  width: number;
  lift: number;
  colour: THREE.Color;
}

/** In face radii. The proportions of the hands the model came with. */
const HANDS: Record<'hour' | 'minute' | 'second', HandSpec> = {
  hour: { length: 0.5, tail: 0.14, width: 0.05, lift: 0.002, colour: INK },
  minute: { length: 0.74, tail: 0.14, width: 0.034, lift: 0.003, colour: INK },
  second: { length: 0.8, tail: 0.2, width: 0.012, lift: 0.004, colour: RED },
};

export function WallClock() {
  const map = useTexture(FACE);
  const face = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    // The picture is the whole clock, edge to edge. This takes the middle of
    // it, the part inside the case.
    map.repeat.setScalar(INSIDE);
    map.offset.setScalar((1 - INSIDE) / 2);
    map.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map, toneMapped: false });
  }, [map]);
  const ink = useMemo(
    () => ({
      hour: new THREE.MeshBasicMaterial({ toneMapped: false }),
      minute: new THREE.MeshBasicMaterial({ toneMapped: false }),
      second: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }),
    []
  );
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  const lastSecond = useRef(-1);

  const lit = useRef(new THREE.Color());

  useFrame(() => {
    lit.current.copy(BY_DESK_LAMP).multiplyScalar(deskLight.value).add(ON_WALL).multiply(roomLight);
    face.color.copy(lit.current);
    for (const key of ['hour', 'minute', 'second'] as const) {
      ink[key].color.copy(HANDS[key].colour).multiply(lit.current);
    }

    let h = STILL.h;
    let m = STILL.m;
    let s = STILL.s;
    let within = 1;
    if (!isFrozen) {
      const now = new Date();
      h = now.getHours();
      m = now.getMinutes();
      s = now.getSeconds();
      within = now.getMilliseconds() / 1000;
      if (s !== lastSecond.current) {
        // Not on the first frame: a clock does not tick because it was looked at.
        if (lastSecond.current !== -1) hear('tick');
        lastSecond.current = s;
      }
    }
    // The second hand steps, and overshoots its mark a little, as a quartz
    // movement's does. The other two creep.
    const step = Math.min(1, within / 0.11);
    const landed = 1 + 0.35 * Math.sin(step * Math.PI) * (1 - step);
    const seconds = s - 1 + (step < 1 ? step * landed : 1);
    const minutes = m + s / 60;
    const hours = (h % 12) + minutes / 60;
    if (second.current) second.current.rotation.z = -(seconds / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hours / 12) * Math.PI * 2;
  });

  const r = RADIUS * INSIDE;
  const refs = { hour, minute, second };
  return (
    <group position={CENTRE} rotation={[0, room.clock.turn, 0]}>
      <mesh position={[0, 0, 0.001]} material={face}>
        <circleGeometry args={[r, 64]} />
      </mesh>
      {(['hour', 'minute', 'second'] as const).map((key) => {
        const hand = HANDS[key];
        return (
          <group key={key} ref={refs[key]} position={[0, 0, hand.lift]}>
            <mesh position={[0, ((hand.length - hand.tail) / 2) * r, 0]} material={ink[key]}>
              <planeGeometry args={[hand.width * r, (hand.length + hand.tail) * r]} />
            </mesh>
          </group>
        );
      })}
      {/* The cap over the arbor, where the three hands meet. */}
      <mesh position={[0, 0, 0.0045]} material={ink.second}>
        <circleGeometry args={[0.035 * r, 20]} />
      </mesh>
    </group>
  );
}

useTexture.preload(FACE);
