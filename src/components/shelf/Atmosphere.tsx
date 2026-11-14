import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import Bones from '../bones/Bones';
import { lampsNow, roomTime } from './clock';
import { model } from './models';
import { chooseColumn, newGame, place, roll, scores } from '../../lib/bones';
import type { Face, Game, Player } from '../../lib/bones';

/**
 * The live parts of the room: the things drawn on top of the bake.
 *
 * A baked room is a photograph, and a photograph does not move. What makes it
 * a place is a handful of things that do, and the trick in choosing them is
 * that none of them has to be lit to match: a prairie behind glass, a glow, a
 * reflection and dust are all light themselves, drawn unlit and added on.
 * That is why these are live and a chair is not. See docs/adr/0006.
 *
 * Positions mirror scripts/shelf.py and have to agree with it.
 */
const FLOOR_Y = -1.2975;
const DESK_TOP = FLOOR_Y + 0.74;
/** The glass, set back in its reveal. */
const GLASS_Z = -0.52 - 0.14;

const LAMP = new THREE.Vector3(1.62, FLOOR_Y + 1.3 + 0.12, 0.72);
const DESK_LAMP = new THREE.Vector3(-2.46, DESK_TOP + 0.3 + 0.0625, -0.31);
const SCREEN = new THREE.Vector3(-1.6, DESK_TOP + 0.108, -0.306);

/** Where something in the room appears to be, seen in the window glass. */
const inGlass = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y, 2 * GLASS_Z - p.z);

// ---------------------------------------------------------------- the Prairie

const PRAIRIE = model('prairie.webp');
/** How far behind the glass it hangs. Far enough to slide, not to swim. */
const PRAIRIE_DISTANCE = 4;
const PRAIRIE_WIDTH = 9.6;
const PRAIRIE_ASPECT = 2048 / 1080;
/**
 * The horizon is the middle of the picture. Hung low: at eye level it cut the
 * window in half and the lower half was dusk-dark ground, which from the Shelf
 * is a black rectangle. Down here two thirds of the window is sky, and it
 * reads as a house on a rise rather than one in a ditch.
 */
const HORIZON_Y = -0.12;

/**
 * What is outside the Window: scripts/prairie.mjs, on a plane behind the
 * glass. Wider than the window by a long way, because the Desk view looks
 * through it from hard on the left and the Shelf view from the right, and
 * each sees a different stretch of the same evening.
 *
 * Not a View: in this codebase that word means a place the camera stands.
 */
function Prairie() {
  const map = useTexture(PRAIRIE);
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);

  return (
    <mesh position={[-1.7, HORIZON_Y, GLASS_Z - PRAIRIE_DISTANCE]}>
      <planeGeometry args={[PRAIRIE_WIDTH, PRAIRIE_WIDTH / PRAIRIE_ASPECT]} />
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- the laptop

/** Mirrors build_laptop() in scripts/shelf.py: the lid leans back 20 degrees. */
const LID_LEAN = (20 * Math.PI) / 180;
const SCREEN_SIZE: [number, number] = [0.288 - 0.006, 0.188 - 0.006];
/** A hair in front of the baked display, along the lid's own normal. */
export const SCREEN_CENTRE = new THREE.Vector3(
  -1.6,
  DESK_TOP + 0.011 + Math.cos(LID_LEAN) * 0.103 + Math.sin(LID_LEAN) * 0.0068,
  -0.17 - 0.106 - Math.sin(LID_LEAN) * 0.103 + Math.cos(LID_LEAN) * 0.0068
);
const SCREEN_FACE = SCREEN_CENTRE;
/** The way the screen faces, and the way is up on it: the lid leans back, so both tip. */
export const SCREEN_NORMAL = new THREE.Vector3(0, Math.sin(LID_LEAN), Math.cos(LID_LEAN));
export const SCREEN_UP = new THREE.Vector3(0, Math.cos(LID_LEAN), -Math.sin(LID_LEAN));
/** The canvas painted on the screen, and the size Bones is laid out at to cover it. */
const SCREEN_PIXELS: [number, number] = [600, 392];
/**
 * drei's Html in transform mode draws 400 / distanceFactor CSS pixels to the unit,
 * so this is the factor that makes Bones' 600 pixels exactly the screen's width.
 */
const SCREEN_DISTANCE_FACTOR = (400 * SCREEN_SIZE[0]) / SCREEN_PIXELS[0];

interface LaptopProps {
  /** At the Laptop View: Bones is on the screen and taking input. */
  active: boolean;
  /** A phone plays Bones under the Room instead, where it is big enough to tap. */
  phone: boolean;
  onVisit: () => void;
  onHover: (hovering: boolean) => void;
}

/**
 * What is on the laptop: Bones, playing itself, the way an arcade cabinet
 * plays itself until someone puts a coin in.
 *
 * The bake has the display as a pale emissive card, which is right for what
 * it throws on the keyboard and wrong to look at: a lit screen with nothing
 * on it is a lightbox. A screen is light, so it can be drawn live without
 * anything having to be lit to match.
 *
 * It is the same game in the same dress as the one the Laptop View puts on
 * the screen: a title bar, the computer's board above and the visitor's
 * below, the scores beside them, with the real rules moving the dice. Where
 * the game's status line goes it says, in the game's own voice, to click to
 * play. That is the screen saying what it is, as a game's attract mode does,
 * not a key hint laid over the room: see docs/adr/0007. Under the pointer the
 * screen brightens, the way the Bust does.
 */
/** Seconds a die tumbles before it lands, and then sits before it is put down. */
const IDLE = { tumble: 0.5, settle: 0.35, between: 0.3, gameOver: 2.6 };
/** How much the screen brightens under the pointer. */
const SCREEN_LIFT = 1.22;
const ED = { bg: '#12141a', bar: '#1c1f28', board: '#171a22', line: '#3a4050', dim: '#7f8aa3', text: '#d9d4c7', green: '#6fcf9b', amber: '#e3b341', blue: '#8fb3ff' };
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

/** Pips on a die, on a 3 by 3 grid read left to right, top to bottom. */
const PIPS: Record<Face, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintDie(ctx: CanvasRenderingContext2D, face: Face, x: number, y: number, size: number, fill: string) {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, size, size, size * 0.18);
  ctx.fill();
  ctx.fillStyle = ED.bg;
  const step = size / 4;
  for (const at of PIPS[face]) {
    ctx.beginPath();
    ctx.arc(x + step * (1 + (at % 3)), y + step * (1 + Math.floor(at / 3)), size * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The whole screen: Bones mid-game, and the prompt to play. `blink` is the
 * prompt's cursor, on or off.
 */
function paintAttract(ctx: CanvasRenderingContext2D, w: number, h: number, game: Game, tumbling: Face | null, blink: boolean) {
  ctx.fillStyle = ED.bg;
  ctx.fillRect(0, 0, w, h);

  // The title bar, as Bones draws its own.
  ctx.fillStyle = ED.bar;
  ctx.fillRect(0, 0, w, 30);
  ['#e0685c', '#e3b341', '#56b36a'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(18 + i * 17, 15, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ED.text;
  ctx.font = `500 15px ${MONO}`;
  ctx.fillText('bones.ts', 82, 16);

  const die = 34;
  const gap = 5;
  const colW = die + 10;
  const colGap = 8;
  const boardW = 3 * colW + 2 * colGap;
  const boardX = (w - boardW) / 2;
  const colH = 3 * die + 2 * gap + 10;
  const [visitor, computer] = scores(game);
  const sides: { player: Player; top: number; score: number; name: string; tint: string }[] = [
    { player: 1, top: 40, score: computer, name: 'cpu', tint: ED.dim },
    { player: 0, top: h - 12 - colH, score: visitor, name: 'you', tint: ED.green },
  ];
  ctx.textAlign = 'center';
  for (const side of sides) {
    const board = game.boards[side.player];
    for (let col = 0; col < 3; col++) {
      const cx = boardX + col * (colW + colGap);
      ctx.fillStyle = ED.board;
      roundRect(ctx, cx, side.top, colW, colH, 7);
      ctx.fill();
      ctx.strokeStyle = ED.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (let row = 0; row < 3; row++) {
        // The computer's dice stack down from its edge, the visitor's up from
        // theirs, so the two boards face each other across the middle.
        const slot = side.player === 1 ? row : 2 - row;
        const face = board[col][row];
        if (!face) continue;
        const same = board[col].filter((f) => f === face).length;
        paintDie(ctx, face, cx + 5, side.top + 5 + slot * (die + gap), die, same === 3 ? ED.blue : same === 2 ? ED.amber : ED.text);
      }
    }
    // Who, and their score, to the left of the board.
    const midY = side.top + colH / 2;
    ctx.fillStyle = side.tint;
    ctx.font = `500 15px ${MONO}`;
    ctx.fillText(side.name, boardX / 2, midY - 18);
    ctx.fillStyle = ED.text;
    ctx.font = `700 32px ${MONO}`;
    ctx.fillText(String(side.score), boardX / 2, midY + 10);
    // The die in hand, to the right of whoever is about to put it down.
    if (tumbling && game.turn === side.player && game.outcome === null) {
      paintDie(ctx, tumbling, boardX + boardW + (w - boardX - boardW) / 2 - die / 2, midY - die / 2, die, ED.text);
    }
  }

  // Between the boards, where Bones says whose move it is: the invitation.
  const middle = (40 + colH + (h - 12 - colH)) / 2;
  ctx.font = `700 28px ${MONO}`;
  const prompt = '$ click to play';
  const width = ctx.measureText(prompt).width;
  const x0 = (w - width) / 2 - 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = ED.green;
  ctx.fillText(prompt, x0, middle);
  if (blink) ctx.fillRect(x0 + width + 6, middle - 14, 15, 28);
}

export function Laptop({ active, phone, onVisit, onHover }: LaptopProps) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const hovered = useRef(false);

  const screen = useMemo(() => {
    const [w, h] = SCREEN_PIXELS;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { ctx, texture };
  }, []);
  useEffect(() => () => screen.texture.dispose(), [screen]);

  // The game it plays against itself, with the real rules. It moves on the
  // room's clock, so a frozen room (reduced motion, a thumbnail) shows a
  // board mid-game and holds it.
  const idle = useRef<{ game: Game; next: number; shown: string }>({ game: newGame(1), next: 0, shown: '' });

  useFrame(() => {
    const t = roomTime();
    if (material.current) material.current.color.setScalar(hovered.current && !active ? SCREEN_LIFT : 1);

    const run = idle.current;
    let tumbling: Face | null = null;
    // Behind the real Bones at the Laptop View: nobody sees it, so it waits.
    if (!(active && !phone)) {
      if (t >= run.next) {
        const game = run.game;
        if (game.outcome !== null) {
          run.game = newGame(1);
          run.next = t + IDLE.between;
        } else if (game.roll === null) {
          run.game = roll(game, Math.random);
          run.next = t + IDLE.tumble + IDLE.settle;
        } else {
          run.game = place(game, chooseColumn(game, Math.random));
          run.next = t + (run.game.outcome !== null ? IDLE.gameOver : IDLE.between);
        }
      }
      // While it tumbles the die shows a new face every tenth of a second.
      const game = run.game;
      if (game.roll !== null) {
        const tumbleLeft = run.next - IDLE.settle - t;
        tumbling = tumbleLeft > 0 ? ((((Math.floor(t * 10) * 7) % 6) + 1) as Face) : game.roll;
      }
    }
    // A second on, a little less off: the rhythm of a cursor.
    const blink = t % 1.1 < 0.62;
    // Repaint only when something on the screen has changed.
    const key = `${JSON.stringify(run.game.boards)}|${run.game.turn}|${tumbling}|${blink}`;
    if (key !== run.shown) {
      run.shown = key;
      paintAttract(screen.ctx, SCREEN_PIXELS[0], SCREEN_PIXELS[1], run.game, tumbling, blink);
      screen.texture.needsUpdate = true;
    }
  });

  const [w, h] = SCREEN_SIZE;
  const onScreen = active && !phone;
  return (
    <group position={SCREEN_FACE} rotation={[-LID_LEAN, 0, 0]}>
      {/* The screen is the door to the Laptop View, the way the Sheet is to a Post. */}
      <mesh
        onClick={(e) => {
          if (active) return;
          e.stopPropagation();
          hovered.current = false;
          onHover(false);
          onVisit();
        }}
        onPointerOver={(e) => {
          if (active) return;
          e.stopPropagation();
          hovered.current = true;
          onHover(true);
        }}
        onPointerOut={() => {
          hovered.current = false;
          onHover(false);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={material} map={screen.texture} toneMapped={false} />
      </mesh>
      {onScreen && (
        // The page's own Bones, laid over the screen as DOM rather than painted
        // into it, so it is the same component, crisp, and takes real clicks.
        // Pointer events stop here: they would otherwise bubble to the canvas
        // and be raycast into the Room behind the screen.
        <Html
          transform
          center
          position={[0, 0, 0.0006]}
          distanceFactor={SCREEN_DISTANCE_FACTOR}
          zIndexRange={[20, 0]}
        >
          <div
            className="bones-on-screen"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Bones variant="screen" />
          </div>
        </Html>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- glow

/** A soft round falloff, painted once and shared by every glow. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.09)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

interface GlowSpec {
  at: THREE.Vector3;
  size: number;
  colour: string;
  strength: number;
  /** Lamps come on with the lamps. The screen was on already. */
  lamp: boolean;
  /** Each breathes on its own time, or they read as one light pulsing. */
  phase: number;
}

const GLOWS: GlowSpec[] = [
  // The bloom a bright shade has to the eye and a bake has not.
  { at: LAMP, size: 1.5, colour: '#ffc98a', strength: 0.22, lamp: true, phase: 0 },
  { at: DESK_LAMP, size: 0.85, colour: '#ffcf96', strength: 0.16, lamp: true, phase: 1.9 },
  { at: SCREEN, size: 0.6, colour: '#9db8ff', strength: 0.16, lamp: false, phase: 3.1 },
  // The same three, where the window glass shows them. Behind the wall as far
  // as the scene is concerned, so they are only ever seen through the opening,
  // which is exactly where a reflection in that glass would be seen.
  { at: inGlass(DESK_LAMP), size: 0.42, colour: '#ffc98a', strength: 0.5, lamp: true, phase: 1.9 },
  { at: inGlass(SCREEN), size: 0.34, colour: '#9db8ff', strength: 0.2, lamp: false, phase: 3.1 },
  { at: inGlass(LAMP), size: 0.7, colour: '#ffc98a', strength: 0.4, lamp: true, phase: 0 },
];

function Glows() {
  const map = useGlowTexture();
  const materials = useRef<(THREE.SpriteMaterial | null)[]>([]);

  useFrame(() => {
    const t = roomTime();
    const lamps = lampsNow();
    GLOWS.forEach((glow, i) => {
      const material = materials.current[i];
      if (!material) return;
      // A filament is never quite steady. Two slow sines, a few percent.
      const breath = 1 + 0.035 * Math.sin(t * 1.7 + glow.phase) + 0.02 * Math.sin(t * 4.3 + glow.phase * 2.0);
      material.opacity = glow.strength * breath * (glow.lamp ? lamps : 1);
    });
  });

  return (
    <>
      {GLOWS.map((glow, i) => (
        <sprite key={i} position={glow.at} scale={[glow.size, glow.size, 1]}>
          <spriteMaterial
            ref={(m) => {
              materials.current[i] = m;
            }}
            map={map}
            color={glow.colour}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- dust

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLamps;
  uniform float uPixels;
  uniform vec3 uLamp;
  uniform vec3 uDeskLamp;
  attribute vec4 aSeed;
  varying float vLit;

  void main() {
    // Each mote wanders a slow loop of its own and sinks a little.
    vec3 p = position;
    float t = uTime * (0.05 + aSeed.x * 0.06);
    p.x += sin(t * 2.1 + aSeed.y * 6.28) * 0.11;
    p.z += cos(t * 1.7 + aSeed.z * 6.28) * 0.11;
    p.y += sin(t * 1.3 + aSeed.w * 6.28) * 0.07 - fract(t * 0.25 + aSeed.x) * 0.16;

    // Dust is only ever seen in light. Bright near a shade, gone a metre out.
    float a = 1.0 - smoothstep(0.12, 1.05, distance(p, uLamp));
    float b = 1.0 - smoothstep(0.08, 0.62, distance(p, uDeskLamp));
    vLit = max(a, b * 0.9) * uLamps * (0.35 + 0.65 * aSeed.w);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPixels * (0.007 + aSeed.z * 0.010) / -mv.z;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  varying float vLit;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.2, 1.0, d)) * vLit;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a * 0.8, a);
  }
`;

/** Motes in the lamplight. Two hundred and twenty points and one draw call. */
function Dust() {
  const { geometry, material } = useMemo(() => {
    const count = 220;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    // A fixed scatter, so a frozen frame is the same frame every time.
    let s = 1234567;
    const rand = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      // Two thirds round the floor lamp, the rest round the desk lamp.
      const round = i % 3 === 0 ? DESK_LAMP : LAMP;
      const reach = round === LAMP ? 0.95 : 0.55;
      positions[i * 3] = round.x + (rand() - 0.5) * 2 * reach;
      positions[i * 3 + 1] = round.y + (rand() - 0.72) * 1.5 * reach;
      positions[i * 3 + 2] = round.z + (rand() - 0.5) * 2 * reach;
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rand();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uLamps: { value: 0 },
        uPixels: { value: 1000 },
        uLamp: { value: LAMP },
        uDeskLamp: { value: DESK_LAMP },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry, material };
  }, []);

  useFrame(({ size, viewport }) => {
    const t = roomTime();
    material.uniforms.uTime.value = t;
    material.uniforms.uLamps.value = lampsNow();
    // Point size is in drawing-buffer pixels, so it follows the canvas height
    // and the pixel ratio, or the motes change size with the window.
    material.uniforms.uPixels.value = size.height * viewport.dpr * 1.3;
  });

  // Never culled: the points move in the shader, so their bounds are a guess.
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ----------------------------------------------------------------

export function Atmosphere() {
  return (
    <>
      <Prairie />
      <Glows />
      <Dust />
    </>
  );
}

useTexture.preload(PRAIRIE);
