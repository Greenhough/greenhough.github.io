import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { roomLight } from './clock';
import symbol from './claude-symbol.svg?raw';

/**
 * A Claude sticker on the Pinboard, in the top right corner, clear of the
 * pinned papers. A nod to the thing that helped build the room.
 *
 * Drawn live rather than baked: the room atlas gives it a few dozen texels,
 * and a logo that small turns to an orange smudge. Like Paper, it takes no
 * light of its own; its colour follows roomLight so it comes up with the lamps.
 */

/** Mirrors PINBOARD and ROOM["back"] in scripts/shelf.py. */
const BOARD_CENTRE = { x: (1.08 + 2.36) / 2, y: (0.36 + 1.12) / 2 };
const CORK_FACE = -0.52 + 0.012 + 0.012;

/** Metres across. A laptop sticker, near enough. */
const SIZE = 0.15;
const POSITION = new THREE.Vector3(BOARD_CENTRE.x + 0.47, BOARD_CENTRE.y + 0.2, CORK_FACE + 0.001);
const TILT = THREE.MathUtils.degToRad(-8);

/** How bright the board is where the sticker sits, by the floor lamp. */
const LIT = new THREE.Color(0.86, 0.76, 0.64);
const CLAUDE_ORANGE = 'hsl(14.8, 63.1%, 59.6%)';
const CARD = '#f4efe6';

/** The mark's outline, from the SVG's one path, in its 100-unit viewBox. */
const MARK_PATH = symbol.match(/\sd="([^"]+)"/)![1];

function paintMark(): THREE.CanvasTexture {
  // Made here, not at module load, so nothing touches Path2D outside a browser.
  const MARK = new Path2D(MARK_PATH);
  const px = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;

  // The 100-unit mark, centred, with room round it for the die-cut edge.
  const scale = (px * 0.72) / 100;
  ctx.translate(px / 2 - 50 * scale, px / 2 - 50 * scale);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 11;
  ctx.strokeStyle = CARD;
  ctx.fillStyle = CARD;

  // A soft shadow, then the cream edge every sticker has, then the mark.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.stroke(MARK);
  ctx.fill(MARK);
  ctx.restore();
  ctx.stroke(MARK);
  ctx.fill(MARK);
  ctx.fillStyle = CLAUDE_ORANGE;
  ctx.fill(MARK);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function Sticker() {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: paintMark(),
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );

  useFrame(() => {
    material.color.copy(LIT).multiply(roomLight);
  });

  return (
    <mesh position={POSITION} rotation={[0, 0, TILT]} material={material}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  );
}
