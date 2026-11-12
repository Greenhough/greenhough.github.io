import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { ensureFonts, paintGameSide, paintSleeve, toTexture } from './covers';
import { easeFor, roomLight } from './clock';
import type { ShelfBoardGame, ShelfRecord } from './types';

/**
 * The Console, and what is live on and over it: the two paintings, the record
 * sleeve that comes out of the row, and the lettering on the Board games.
 *
 * The furniture itself is baked into the room. These are drawn on top for the
 * reason the Book stack's titles are: the room atlas gives a hundred texels to
 * the unit, which makes a painting thirty texels tall and a game's name three.
 * Each is unlit and tinted by hand to the light the bake puts where it sits,
 * the way the sheet of paper on the Desk is.
 *
 * Every number here mirrors scripts/shelf.py and has to agree with it.
 */
const FLOOR_Y = -1.2975;
const CONSOLE = { x0: 1.02, x1: 1.94, depth: 0.4, height: 0.52, leg: 0.11, board: 0.024 };
const BACK = -0.52;
const Z0 = BACK + 0.02 + 0.01;
const CX = (CONSOLE.x0 + CONSOLE.x1) / 2;
const TOP_Y = FLOOR_Y + CONSOLE.height;
const BAY_FLOOR = FLOOR_Y + CONSOLE.leg + CONSOLE.board;
const BAY_HEIGHT = CONSOLE.height - CONSOLE.leg - CONSOLE.board * 2;

/** PRINTS in shelf.py: the frames, and the canvas inside each. */
const FRAME = { w: 0.3, h: 0.4, border: 0.016, depth: 0.022, y: -0.235 };
const PAINTINGS = [
  { x: 1.25, src: '/assets/paintings/wanderer-above-the-sea-of-fog.webp' },
  { x: 1.69, src: '/assets/paintings/ship-on-stormy-seas.webp' },
];
/** What an oil painting on this wall comes out as, under the floor lamp. */
const ON_WALL = new THREE.Color(0.9, 0.78, 0.64);

/** GAMES in shelf.py, bottom of the stack first. */
const GAMES = {
  x: (CX + 0.02 + CONSOLE.board / 2 + CONSOLE.x1 - CONSOLE.board) / 2,
  front: Z0 + CONSOLE.depth - 0.025,
  boxes: [
    { w: 0.31, h: 0.07, d: 0.3, yaw: 0.035 },
    { w: 0.29, h: 0.08, d: 0.29, yaw: -0.05 },
  ],
};
/** Card in the mouth of the bay: lit by the lamp, but from above and behind a board. */
const IN_BAY = new THREE.Color(0.62, 0.5, 0.39);

/** A sleeve is twelve inches and a bit. */
const SLEEVE = 0.31;
/** In the row, edge on, where it cannot be seen among the baked ones. */
const IN_ROW = new THREE.Vector3(CONSOLE.x0 + 0.2, BAY_FLOOR + SLEEVE / 2, Z0 + CONSOLE.depth / 2 + 0.02);
/** Pulled out and held up in front of the row. */
const HELD = new THREE.Vector3(CONSOLE.x0 + 0.2, BAY_FLOOR + SLEEVE / 2 + 0.075, Z0 + CONSOLE.depth + 0.14);
const SLEEVE_HELD = new THREE.Color(0.95, 0.88, 0.78);

interface Props {
  records: ShelfRecord[];
  recordIndex: number;
  boardGames: ShelfBoardGame[];
  /** True at the Console view. */
  active: boolean;
  /** Anything on the Console, clicked from somewhere else in the room. */
  onVisit: () => void;
  onFlip: () => void;
  onTogglePlay: () => void;
  onOpenGames: () => void;
  onHover: (hovering: boolean) => void;
}

/**
 * Something on the Console that can be clicked: an unseen box round it that
 * warms a little under the pointer. docs/adr/0005 asks for a quiet highlight
 * and no list of controls, and baked furniture cannot move to say so itself.
 */
function Target({
  position,
  size,
  onClick,
  onHover,
}: {
  position: [number, number, number];
  size: [number, number, number];
  onClick: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <mesh
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setOver(true);
        onHover(true);
      }}
      onPointerOut={() => {
        setOver(false);
        onHover(false);
      }}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial
        color="#ffd9a2"
        transparent
        opacity={over ? 0.09 : 0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function Paintings() {
  const maps = useTexture(PAINTINGS.map((p) => p.src));
  const materials = useMemo(
    () =>
      maps.map((map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
        return new THREE.MeshBasicMaterial({ map, toneMapped: false });
      }),
    [maps]
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useFrame(() => materials.forEach((m) => m.color.copy(ON_WALL).multiply(roomLight)));

  const w = FRAME.w - FRAME.border * 2;
  const h = FRAME.h - FRAME.border * 2;
  return (
    <>
      {PAINTINGS.map((painting, i) => (
        <mesh key={painting.src} material={materials[i]} position={[painting.x, FRAME.y, BACK + FRAME.depth + 0.006]}>
          <planeGeometry args={[w, h]} />
        </mesh>
      ))}
    </>
  );
}

function GameSides({ boardGames }: { boardGames: ShelfBoardGame[] }) {
  const renderer = useThree((s) => s.gl);
  const [maps, setMaps] = useState<THREE.CanvasTexture[] | null>(null);
  // Best first in the data, and the best is on top: the stack is the reverse.
  const stack = useMemo(() => [...boardGames].reverse().slice(0, GAMES.boxes.length), [boardGames]);

  useEffect(() => {
    let cancelled = false;
    const made: THREE.CanvasTexture[] = [];
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      stack.forEach((game, i) => {
        const box = GAMES.boxes[i];
        const canvas = document.createElement('canvas');
        paintGameSide(canvas, game, 1024, box.w / box.h);
        made.push(toTexture(canvas, renderer));
      });
      setMaps(made);
    })();
    return () => {
      cancelled = true;
      made.forEach((t) => t.dispose());
    };
  }, [stack, renderer]);

  const materials = useMemo(
    () => maps?.map((map) => new THREE.MeshBasicMaterial({ map, toneMapped: false })) ?? null,
    [maps]
  );
  useEffect(() => () => materials?.forEach((m) => m.dispose()), [materials]);
  useFrame(() => materials?.forEach((m) => m.color.copy(IN_BAY).multiply(roomLight)));

  if (!materials) return null;
  let y = BAY_FLOOR;
  return (
    <>
      {stack.map((game, i) => {
        const box = GAMES.boxes[i];
        const centreY = y + box.h / 2;
        y += box.h;
        return (
          <group key={game.title} position={[GAMES.x, centreY, GAMES.front - box.d / 2]} rotation={[0, box.yaw, 0]}>
            <mesh material={materials[i]} position={[0, 0, box.d / 2 + 0.0012]}>
              <planeGeometry args={[box.w - 0.008, box.h - 0.008]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/**
 * The record that is out of the row. At the Console it is held up, facing the
 * camera; anywhere else it is back among the baked sleeves, edge on.
 */
function Sleeve({ record, active, onFlip, onHover }: { record: ShelfRecord; active: boolean; onFlip: () => void; onHover: (h: boolean) => void }) {
  const renderer = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  const inRow = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), []);
  const aim = useRef(new THREE.Object3D());

  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      paintSleeve(canvas, record, 768);
      made = toTexture(canvas, renderer);
      // A different record: this one starts from the row and comes out.
      if (group.current) {
        group.current.position.copy(IN_ROW);
        group.current.quaternion.copy(inRow);
      }
      setMap(made);
    })();
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [record, renderer, inRow]);

  useEffect(() => {
    material.map = map;
    material.needsUpdate = true;
  }, [map, material]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const ease = easeFor(delta, 0.003);
    if (active) {
      aim.current.position.copy(HELD);
      aim.current.lookAt(camera.position);
      group.current.position.lerp(HELD, ease);
      group.current.quaternion.slerp(aim.current.quaternion, ease);
    } else {
      group.current.position.lerp(IN_ROW, ease);
      group.current.quaternion.slerp(inRow, ease);
    }
    material.color.copy(SLEEVE_HELD).multiply(roomLight);
  });

  return (
    <group
      ref={group}
      position={IN_ROW}
      quaternion={inRow}
      visible={!!map}
      onClick={(e) => {
        if (!active) return;
        e.stopPropagation();
        onFlip();
      }}
      onPointerOver={(e) => {
        if (!active) return;
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      <mesh material={material}>
        <planeGeometry args={[SLEEVE, SLEEVE]} />
      </mesh>
    </group>
  );
}

export function Console({
  records,
  recordIndex,
  boardGames,
  active,
  onVisit,
  onFlip,
  onTogglePlay,
  onOpenGames,
  onHover,
}: Props) {
  const record = records[recordIndex] ?? null;
  const gamesHeight = GAMES.boxes.reduce((sum, box) => sum + box.h, 0);

  return (
    <>
      <Paintings />
      {boardGames.length > 0 && <GameSides boardGames={boardGames} />}
      {record && <Sleeve record={record} active={active} onFlip={onFlip} onHover={onHover} />}

      {/* The Record player: goes to the Console, and once there, plays. */}
      {records.length > 0 && (
        <Target
          position={[CX - 0.16, TOP_Y + 0.045, Z0 + CONSOLE.depth / 2 - 0.01]}
          size={[0.46, 0.1, 0.36]}
          onClick={active ? onTogglePlay : onVisit}
          onHover={onHover}
        />
      )}
      {/* The row of sleeves: goes to the Console, and once there, flips. */}
      {records.length > 0 && (
        <Target
          position={[(CONSOLE.x0 + CX) / 2 + 0.01, BAY_FLOOR + BAY_HEIGHT / 2, Z0 + CONSOLE.depth / 2]}
          size={[CX - CONSOLE.x0 - 0.03, BAY_HEIGHT, CONSOLE.depth - 0.02]}
          onClick={active ? onFlip : onVisit}
          onHover={onHover}
        />
      )}
      {/* The Board games: from across the room they lead here, and from here
          to the list. */}
      {boardGames.length > 0 && (
        <Target
          position={[GAMES.x, BAY_FLOOR + gamesHeight / 2, GAMES.front - 0.15]}
          size={[0.34, gamesHeight + 0.01, 0.32]}
          onClick={active ? onOpenGames : onVisit}
          onHover={onHover}
        />
      )}
    </>
  );
}
