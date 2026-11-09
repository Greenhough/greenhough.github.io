/**
 * Converts the baked atlas Blender writes into the WebP the site actually
 * loads.
 *
 * Worth doing rather than shipping the PNG: the bake is 2.1MB as a PNG and
 * 84KB as WebP, because baked wood is mostly smooth gradient. That difference
 * is why the payload budget in docs/adr/0002 survived this change.
 *
 *   node scripts/bake-to-webp.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

const ATLASES = [
  { source: 'build/shelf-bake.png', out: 'public/models/shelf-bake.webp' },
  { source: 'build/room-bake.png', out: 'public/models/room-bake.webp' },
  // The cloth weave is a normal map, not a picture: every pixel is a direction,
  // so the usual quality setting would ripple the lighting across the Spine.
  // It is small enough that near-lossless costs almost nothing.
  {
    source: 'build/cloth-normal.png',
    out: 'public/models/cloth-normal.webp',
    size: 256,
    quality: 98,
  },
];
const SIZE = 2048;
const QUALITY = 82;

const kb = (n) => `${Math.round(n / 1024)}KB`;

for (const { source, out, size = SIZE, quality = QUALITY } of ATLASES) {
  if (!existsSync(source)) {
    console.error(
      `No bake at ${source}. Run the Blender bake first:\n` +
        '  /Applications/Blender.app/Contents/MacOS/Blender --background \\\n' +
        '    --python scripts/shelf.py -- --bake build/shelf-bake.png \\\n' +
        '      --bake-room build/room-bake.png --export public/models/shelf.glb'
    );
    process.exit(1);
  }

  mkdirSync(dirname(out), { recursive: true });
  const before = readFileSync(source).length;
  const webp = await sharp(source).resize(size, size).webp({ quality }).toBuffer();
  writeFileSync(out, webp);
  console.log(`${source} ${kb(before)} -> ${out} ${kb(webp.length)} (${size}px, q${quality})`);
}
