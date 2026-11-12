import * as THREE from 'three';
import manifest from './box-bake.json';
import { roomLight } from './clock';
import { model } from './models';

/**
 * The light on a Book at rest, baked in Blender.
 *
 * docs/adr/0003 kept the Books real-time because they move, and baked light
 * on a moving object is wrong light. That is still true of a Book in the
 * hand. It was never true of a Book on the Shelf, which stands where it was
 * baked for as long as nobody touches it, and a real-time Book in a baked
 * room is the seam the eye finds first: crisper, more saturated, lit by a
 * different evening. docs/adr/0006 splits it. At rest a Book is its printing
 * multiplied by the light Cycles found there. In the hand it is lit live, as
 * before. One number, `live`, runs between the two as the Book leaves.
 *
 * What is stored is light, not colour, so the same map serves whatever is
 * printed on the Book. Each Book has a tile of one atlas; which tile is in
 * box-bake.json, written by scripts/shelf.py alongside the atlas.
 */
export const BOX_LIGHT = model('box-bake.webp');

/** Where a Book's light is in the atlas (u, v, size), and how far it is lifted. */
export type Tile = [number, number, number, number];

/**
 * The lower Section stands under a shelf board and away from the Lamp, and
 * the bake is honest about it: its Spines came out too dark to read. A Spine
 * nobody can read has failed at the one thing it is for, so the lower Section's
 * baked light is lifted. The shading within it is untouched.
 */
const LOWER_LIFT = 1.9;

interface Manifest {
  gain: number;
  grid: number;
  boxes: { slug: string; section: number; slot: number; tile: number[] }[];
  stack: number[][];
}

const baked = manifest as Manifest;

/**
 * The tile for a Project, or null if the last bake did not have it standing
 * there. A Project added or moved since then is lit live until the next bake,
 * which is the whole of what adding a Project costs: nothing, and then a bake
 * when there is time for one.
 */
export function boxTile(slug: string, section: number, slot: number): Tile | null {
  const hit = baked.boxes.find((b) => b.slug === slug && b.section === section && b.slot === slot);
  return hit ? ([...hit.tile, section === 0 ? 1 : LOWER_LIFT] as Tile) : null;
}

/** The tile for the nth read book in the stack on the Desk. */
export function stackTile(index: number): Tile | null {
  const tile = baked.stack[index];
  return tile ? ([...tile, 1] as Tile) : null;
}

/** Set a loaded atlas up to be sampled through the Book's second UV set. */
export function prepareLight(texture: THREE.Texture): THREE.Texture {
  if (texture.channel !== 1) {
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.channel = 1;
    texture.needsUpdate = true;
  }
  return texture;
}

/**
 * A little more light on a Book at rest than the bake found there.
 *
 * Not physical, and deliberate. The Spines are the content of the page, and
 * docs/adr/0003 chose its light so they would stay readable. Lit exactly as
 * the room lights them they are correct and a shade too quiet: the lettering
 * sits at about half the brightness of the wall beside the Shelf, and the eye
 * goes to the wall. A third more is what a photographer would do with a
 * reflector, and it also brings a Book at rest closer to the same Book in the
 * hand, so the change between the two is smaller.
 */
const REST_LIFT = 1.32;

/** Stored at a fraction of its strength so bright light fits in eight bits. */
const gain = { value: baked.gain * REST_LIFT };
const room = { value: roomLight };

/**
 * Teach a material the baked light.
 *
 * The material stays a standard one, so the live half is exactly what it was.
 * The atlas rides in the light map slot with its intensity at zero: that gets
 * the second UV set and the sampler wired up by three without three adding
 * the texel to the lighting itself, and the patch below does the mixing.
 */
export function bakeInto<T extends THREE.MeshStandardMaterial>(
  material: T,
  light: THREE.Texture,
  tile: Tile,
  live: { value: number }
): T {
  material.lightMap = light;
  material.lightMapIntensity = 0;
  const tileUniform = { value: new THREE.Vector4(tile[0], tile[1], tile[2], tile[3]) };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLive = live;
    shader.uniforms.uTile = tileUniform;
    shader.uniforms.uGain = gain;
    shader.uniforms.uRoom = room;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uLive;\nuniform vec4 uTile;\nuniform float uGain;\nuniform vec3 uRoom;'
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef USE_LIGHTMAP
          vec3 restLight = texture2D( lightMap, vLightMapUv * uTile.z + uTile.xy ).rgb * uGain * uTile.w * uRoom;
          outgoingLight = mix( diffuseColor.rgb * restLight, outgoingLight, uLive );
        #endif
        #include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => 'book-at-rest';
  return material;
}
