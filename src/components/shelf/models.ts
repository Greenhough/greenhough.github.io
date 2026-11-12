/**
 * Where the room's model and baked textures are fetched from.
 *
 * The files in public/models/ are build artifacts of scripts/shelf.py and are
 * overwritten in place by each bake, so their names never change. The version
 * is a hash of all of them, set in astro.config.mjs: without it a returning
 * visitor's browser pairs this build's code with the last bake's files.
 */
declare const __MODELS_VERSION__: string;

export const MODELS_VERSION = __MODELS_VERSION__;

export function model(name: string): string {
  return `/models/${name}?v=${MODELS_VERSION}`;
}
