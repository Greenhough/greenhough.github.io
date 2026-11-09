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

const SOURCE = 'build/shelf-bake.png';
const OUT = 'public/models/shelf-bake.webp';
const SIZE = 2048;
const QUALITY = 82;

if (!existsSync(SOURCE)) {
  console.error(
    `No bake at ${SOURCE}. Run the Blender bake first:\n` +
      '  /Applications/Blender.app/Contents/MacOS/Blender --background \\\n' +
      '    --python scripts/shelf.py -- --bake build/shelf-bake.png --export public/models/shelf.glb'
  );
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });

const before = readFileSync(SOURCE).length;
const webp = await sharp(SOURCE).resize(SIZE, SIZE).webp({ quality: QUALITY }).toBuffer();
writeFileSync(OUT, webp);

const kb = (n) => `${Math.round(n / 1024)}KB`;
console.log(`${SOURCE} ${kb(before)} -> ${OUT} ${kb(webp.length)} (${SIZE}px, q${QUALITY})`);
