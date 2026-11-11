import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { lampsNow, roomTime } from './clock';

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

const PRAIRIE = '/models/prairie.webp';
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
const SCREEN_FACE = new THREE.Vector3(
  -1.6,
  DESK_TOP + 0.011 + Math.cos(LID_LEAN) * 0.103 + Math.sin(LID_LEAN) * 0.0068,
  -0.17 - 0.106 - Math.sin(LID_LEAN) * 0.103 + Math.cos(LID_LEAN) * 0.0068
);

/**
 * What is on the laptop: an editor, mid-thought, with the cursor blinking.
 *
 * The bake has the display as a pale emissive card, which is right for what
 * it throws on the keyboard and wrong to look at: a lit screen with nothing
 * on it is a lightbox. A screen is light, so it can be drawn live without
 * anything having to be lit to match. Bars, not words. At the size the Desk
 * view shows it, text would be four pixels tall, and bars at that size are
 * what code looks like anyway.
 */
function Laptop() {
  const cursor = useRef<THREE.Mesh>(null);
  const map = useMemo(() => {
    const w = 600;
    const h = 392;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12141a';
    ctx.fillRect(0, 0, w, h);
    // A title bar and a file tree down the left.
    ctx.fillStyle = '#1c1f28';
    ctx.fillRect(0, 0, w, 26);
    ctx.fillRect(0, 26, 118, h);
    ['#e0685c', '#e3b341', '#56b36a'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(16 + i * 16, 13, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#3a4050';
    for (let i = 0; i < 9; i++) ctx.fillRect(14 + (i % 3 === 1 ? 10 : 0), 44 + i * 19, 52 + ((i * 37) % 34), 6);

    // Lines of code: an indent, then a few runs of colour. Fixed, not random,
    // so the screen is the same screen every time the page loads.
    const tints = ['#6fcf9b', '#d9d4c7', '#7f8aa3', '#e3b341', '#8fb3ff'];
    const lines = [
      [0, 3, 9, 4], [1, 2, 7], [1, 5, 3, 6], [2, 4, 4, 8, 2], [2, 6, 5], [2, 3, 10], [1, 2],
      [0], [0, 4, 6, 3], [1, 7, 4], [1, 3, 3, 5, 4], [2, 5, 8], [2, 2, 6, 3], [1, 2],
    ];
    lines.forEach(([indent, ...runs], row) => {
      let x = 138 + indent * 22;
      runs.forEach((length, i) => {
        ctx.fillStyle = tints[(row * 2 + i * 3 + indent) % tints.length];
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, 46 + row * 23, length * 11, 7);
        x += length * 11 + 9;
      });
    });
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, []);

  useFrame(() => {
    // A second on, a little less off: the rhythm of a cursor nobody is typing at.
    if (cursor.current) cursor.current.visible = roomTime() % 1.1 < 0.62;
  });

  const [w, h] = SCREEN_SIZE;
  return (
    <group position={SCREEN_FACE} rotation={[-LID_LEAN, 0, 0]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      {/* At the end of the last line of code. */}
      <mesh ref={cursor} position={[w * (-0.5 + 195 / 600), h * (0.5 - 348 / 392), 0.0004]}>
        <planeGeometry args={[w * (7 / 600), h * (13 / 392)]} />
        <meshBasicMaterial color="#d9d4c7" toneMapped={false} />
      </mesh>
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
      <Laptop />
      <Glows />
      <Dust />
    </>
  );
}

useTexture.preload(PRAIRIE);
