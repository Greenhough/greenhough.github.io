import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { deskLampNow, lampsNow, roomTime } from './clock';
import { weatherOn, type Weather as Kind } from '../../lib/weather';

/**
 * The weather at the Window: rain running down the glass, or snow coming down
 * past it. Most days there is neither.
 *
 * Which it is comes from the date and from chance: see lib/weather.ts.
 * `?weather=rain`, `snow` or `clear` asks for one, so that a still of the Room
 * in the rain is a URL like any other (docs/adr/0006).
 *
 * All of it is a Live part, and for the usual reason: none of it has to be
 * lit. Rain on glass is a lens with the sky in it, snow at dusk is a pale
 * thing against a darker one, and both are drawn unlit and laid on. The Room's
 * own light does not change with the weather, which keeps this inside what the
 * bake can pass for: an overcast dusk is still a dusk.
 *
 * What the weather does to the view itself, the sky closing in and the fields
 * going white, is in the Prairie's own material in Atmosphere.tsx.
 */
export const WEATHER: Kind = (() => {
  if (typeof window === 'undefined') return 'clear';
  const asked = new URLSearchParams(window.location.search).get('weather');
  if (asked === 'rain' || asked === 'snow' || asked === 'clear') return asked;
  return weatherOn(new Date());
})();

/** Mirrors WINDOW and ROOM in scripts/shelf.py: the opening, and the glass set back in it. */
const FLOOR_Y = -1.2975;
const GLASS = {
  x: -1.7,
  y: FLOOR_Y + 0.82 + 1.58 / 2,
  z: -0.52 - 0.14,
  width: 1.4,
  height: 1.58,
};

// ---------------------------------------------------------------- rain

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Rain on the glass, as the eye reads it from across a room.
 *
 * Two things. Beads that have landed and are sitting there, each one a small
 * lens: a drop shows the world upside down, so the bright of the sky is at the
 * bottom of it and the dark of the ground at the top, and the lamps in the
 * room put a warm point on its shoulder. And runs: a drop that has grown heavy
 * enough to go, working its way down in fits and leaving a wet line behind it
 * that dries from the top.
 *
 * Behind both, the rain that is still falling, as faint slanted dashes.
 */
const RAIN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uLamps;
  uniform vec2 uSize;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // What a drop at p, of radius r, looks like at q. xyz is its colour, w how much of it is there.
  vec4 lens(vec2 q, vec2 p, float r) {
    vec2 d = (q - p) / r;
    float inside = 1.0 - smoothstep(0.7, 1.0, length(d));
    // Upside down: the sky in the lower half of it and the dark of the
    // ground in the upper. Against the fields that is a bright lip, against
    // the sky a dark cap, and either way it reads as water and not as dirt.
    // (These are linear light, like every colour in a shader here.)
    vec3 sky = vec3(0.12, 0.13, 0.19);
    vec3 ground = vec3(0.012, 0.015, 0.024);
    vec3 colour = mix(sky, ground, smoothstep(-0.3, 0.4, d.y));
    // The room's lamps, on the shoulder of the drop that faces them.
    float glint = 1.0 - smoothstep(0.0, 0.3, length(d - vec2(0.3, 0.36)));
    colour += vec3(1.0, 0.78, 0.5) * glint * 0.55 * uLamps;
    return vec4(colour, inside * 0.72);
  }

  void main() {
    // In metres from the bottom left of the glass, so a drop is a drop's size
    // whatever shape the window is.
    vec2 q = vUv * uSize;
    vec3 colour = vec3(0.0);
    float alpha = 0.0;

    // The rain still falling, outside. Three sheets of it at three distances.
    float falling = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float density = 26.0 + fi * 22.0;
      vec2 g = vec2(q.x + q.y * 0.08, q.y) * vec2(density, 2.2 + fi);
      float column = floor(g.x);
      float h = hash(vec2(column, fi));
      float along = fract(g.y + uTime * (2.6 + h * 1.6 + fi * 0.6) + h * 31.0);
      float dash = smoothstep(0.0, 0.15, along) * smoothstep(0.5, 0.2, along);
      float thin = 1.0 - smoothstep(0.0, 0.16, abs(fract(g.x) - 0.5));
      falling += dash * thin * step(0.45, h) * (0.5 - fi * 0.12);
    }
    colour += vec3(0.42, 0.48, 0.62) * falling * 0.12;
    alpha = max(alpha, falling * 0.12);

    // Beads, sitting. A grid, one bead to a cell or none, and each lives for a
    // while and is replaced by another somewhere else in its cell.
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float cells = 62.0 + fi * 47.0;
      vec2 g = q * cells + fi * 7.3;
      vec2 cell = floor(g);
      float age = uTime * (0.05 + 0.04 * hash(cell + 3.1)) + hash(cell + 9.7);
      float life = floor(age);
      float seen = fract(age);
      vec2 where = vec2(hash(cell + life), hash(cell + life + 5.5)) * 0.6 + 0.2;
      float r = (0.09 + 0.17 * hash(cell + life + 1.7)) * (0.6 + 0.4 * smoothstep(0.0, 0.2, seen));
      float here = step(0.7 + fi * 0.12, hash(cell + life + 2.9)) * (1.0 - smoothstep(0.85, 1.0, seen));
      vec4 bead = lens(fract(g), where, r);
      colour = mix(colour, bead.rgb, bead.a * here);
      alpha = max(alpha, bead.a * here * 0.9);
    }

    // Runs. A column each, and in it a drop that goes down in fits: it sits,
    // gathers, lets go. The line it leaves is widest just behind it.
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float columns = 9.0 + fi * 6.0;
      float column = floor(q.x * columns);
      float h = hash(vec2(column, 40.0 + fi));
      float pace = 0.05 + 0.07 * h;
      float t = uTime * pace + h * 20.0;
      // Fits and starts: time that mostly creeps and now and then jumps.
      float going = floor(t) + smoothstep(0.55, 1.0, fract(t));
      float span = 2.6;
      float head = span * (1.0 - fract(going * 0.37 + h));
      float wander = sin(head * 9.0 + h * 40.0) * 0.012 + sin(head * 23.0 + h * 11.0) * 0.005;
      float x = (column + 0.2 + 0.6 * hash(vec2(column, 71.0 + fi))) / columns + wander;
      float y = head * uSize.y / span * 1.25 - 0.1 * uSize.y;
      float busy = step(0.5, hash(vec2(column, floor(going * 0.37 + h) + fi)));
      vec4 drop = lens(q, vec2(x, y), 0.0058);
      colour = mix(colour, drop.rgb, drop.a * busy);
      alpha = max(alpha, drop.a * busy);
      float above = q.y - y;
      float trail = (1.0 - smoothstep(0.0, 0.0024 * (1.0 - smoothstep(0.0, 0.5, above) * 0.6), abs(q.x - x)))
        * step(0.0, above) * (1.0 - smoothstep(0.05, 0.55, above)) * busy;
      colour = mix(colour, vec3(0.07, 0.08, 0.12), trail * 0.6);
      alpha = max(alpha, trail * 0.3);
    }

    gl_FragColor = vec4(colour, alpha);
    #include <colorspace_fragment>
  }
`;

function Rain() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERTEX,
        fragmentShader: RAIN_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uLamps: { value: 0 },
          uSize: { value: new THREE.Vector2(GLASS.width, GLASS.height) },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    []
  );
  useFrame(() => {
    material.uniforms.uTime.value = roomTime();
    // Mostly the desk lamp, which stands under the window; a little from the rest.
    material.uniforms.uLamps.value = 0.25 * lampsNow() + 0.75 * deskLampNow();
  });
  // A hair in front of where the glass is, so it is the glass that is wet.
  return (
    <mesh position={[GLASS.x, GLASS.y, GLASS.z + 0.004]} material={material} renderOrder={2}>
      <planeGeometry args={[GLASS.width, GLASS.height]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- snow

const SNOW_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixels;
  uniform vec3 uBox;
  attribute vec4 aSeed;
  varying float vFade;

  void main() {
    // Each flake falls at its own pace, round and round the height of the
    // box, and swings a little as it comes.
    vec3 p = position;
    float fall = uTime * (0.16 + aSeed.x * 0.16);
    p.y = (fract(aSeed.y - fall / uBox.y) - 0.5) * uBox.y;
    p.x += sin(uTime * (0.5 + aSeed.z) + aSeed.w * 6.28) * 0.09 + uTime * 0.05;
    p.x = (fract(p.x / uBox.x + 0.5) - 0.5) * uBox.x;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPixels * (0.016 + aSeed.z * 0.022) / -mv.z;
    // Softer at the top and bottom of the fall, so none pops in or out.
    float edge = abs(p.y) / (uBox.y * 0.5);
    vFade = (1.0 - smoothstep(0.8, 1.0, edge)) * (0.45 + 0.55 * aSeed.w);
  }
`;

const SNOW_FRAGMENT = /* glsl */ `
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.1, 1.0, d)) * vFade;
    // Dusk snow: blue, not white. The window's light is what is on it.
    gl_FragColor = vec4(vec3(0.66, 0.74, 0.94) * a, a);
  }
`;

/** Snow coming down between the glass and the Prairie. A thousand points and one draw call. */
function Snow() {
  const { geometry, material } = useMemo(() => {
    const count = 1000;
    // Wider than the window by a long way, as the Prairie is: the Desk looks
    // out through it from hard on the left.
    const box = new THREE.Vector3(7, 3.2, 3.2);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    let s = 7654321;
    const rand = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * box.x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = -rand() * box.z;
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rand();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERTEX,
      fragmentShader: SNOW_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixels: { value: 1000 }, uBox: { value: box } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry, material };
  }, []);

  useFrame(({ size, viewport }) => {
    material.uniforms.uTime.value = roomTime();
    material.uniforms.uPixels.value = size.height * viewport.dpr * 1.3;
  });

  // Starting a hand behind the glass and going back from there.
  return (
    <points
      geometry={geometry}
      material={material}
      position={[GLASS.x, GLASS.y, GLASS.z - 0.2]}
      frustumCulled={false}
    />
  );
}

// ----------------------------------------------------------------

export function Weather() {
  if (WEATHER === 'rain') return <Rain />;
  if (WEATHER === 'snow') return <Snow />;
  return null;
}
