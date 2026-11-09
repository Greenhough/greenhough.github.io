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
  ['build/shelf-bake.png', 'public/models/shelf-bake.webp'],
  ['build/room-bake.png', 'public/models/room-bake.webp'],
];
const SIZE = 2048;
const QUALITY = 82;

const kb = (n) => `${Math.round(n / 1024)}KB`;

for (const [source, out] of ATLASES) {
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
  const webp = await sharp(source).resize(SIZE, SIZE).webp({ quality: QUALITY }).toBuffer();
  writeFileSync(out, webp);
  console.log(`${source} ${kb(before)} -> ${out} ${kb(webp.length)} (${SIZE}px, q${QUALITY})`);
}
