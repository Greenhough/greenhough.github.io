import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { ensureFonts, paintSleeve, toTexture } from './covers';
import { easeFor, roomLight } from './clock';
import type { ShelfBoardGame, ShelfRecord } from './types';

/**
 * The Console, and what is live on and over it: the two paintings, the record
 * sleeve that comes out of the row, and the art on the Board games' boxes.
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

/**
 * GAMES in shelf.py. Each box's size is the real one, from its entry in
 * board-games.json, so only the set-back and the yaw live here.
 */
const GAMES = {
  x: (CX + 0.02 + CONSOLE.board / 2 + CONSOLE.x1 - CONSOLE.board) / 2,
  front: Z0 + CONSOLE.depth - 0.025,
  /** Bottom box first. */
  yaw: [0.035, -0.05],
};
/** The side of a box, in the mouth of the bay: lit by the lamp, but from above and behind a board. */
const IN_BAY = new THREE.Color(0.62, 0.5, 0.39);
/** A lid, further in and under the console's top: a shade darker than the side. */
const ON_LID = new THREE.Color(0.52, 0.42, 0.33);
/** Where a box's art is: see the board games schema. */
const boxArt = (id: string, face: 'lid' | 'side') => `/assets/board-games/room/${id}-${face}.webp`;

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

function GameBoxes({ boardGames }: { boardGames: ShelfBoardGame[] }) {
  // Best first in the data, and the best is on top: the stack is the reverse.
  const stack = useMemo(() => [...boardGames].reverse().slice(0, GAMES.yaw.length), [boardGames]);
  const maps = useTexture(stack.flatMap((game) => [boxArt(game.id, 'side'), boxArt(game.id, 'lid')]));

  const materials = useMemo(
    () =>
      maps.map((map, i) => {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
        const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
        // Even entries are sides, odd are lids: see the useTexture call.
        material.userData.tint = i % 2 === 0 ? IN_BAY : ON_LID;
        return material;
      }),
    [maps]
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useFrame(() => materials.forEach((m) => m.color.copy(m.userData.tint as THREE.Color).multiply(roomLight)));

  // The art sits a hair proud of the baked card and stops just short of each
  // edge, so the box keeps its baked corners.
  const PROUD = 0.0012;
  const EDGE = 0.004;
  let y = BAY_FLOOR;
  return (
    <>
      {stack.map((game, i) => {
        const w = game.size.wide / 100;
        const h = game.size.tall / 100;
        const d = game.size.deep / 100;
        const centreY = y + h / 2;
        y += h;
        return (
          <group key={game.id} position={[GAMES.x, centreY, GAMES.front - d / 2]} rotation={[0, GAMES.yaw[i], 0]}>
            <mesh material={materials[i * 2]} position={[0, 0, d / 2 + PROUD]}>
              <planeGeometry args={[w - EDGE, h - EDGE]} />
            </mesh>
            {/* Lying face up. The art's foot is the edge nearest the side, so
                it comes to the front of the bay. */}
            <mesh material={materials[i * 2 + 1]} position={[0, h / 2 + PROUD, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w - EDGE, d - EDGE]} />
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
  // The stack as it stands, from the boxes' real heights.
  const gamesHeight = boardGames.slice(0, GAMES.yaw.length).reduce((sum, game) => sum + game.size.tall / 100, 0);

  return (
    <>
      <Paintings />
      {boardGames.length > 0 && <GameBoxes boardGames={boardGames} />}
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
