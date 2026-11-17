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

// Where the bakes are read from. `node scripts/bake-to-webp.mjs build/m` reads
// a trial bake from its own folder without touching the last full one.
const FROM = process.argv[2] ?? 'build';

const ATLASES = [
  { source: `${FROM}/shelf-bake.png`, out: 'public/models/shelf-bake.webp' },
  // The room is baked at 4096 and shipped at two sizes. A desktop looks at it
  // from a metre away through a 4K window; a phone has neither the pixels to
  // show the difference nor the memory to spare, and gets a quarter of it.
  { source: `${FROM}/room-bake.png`, out: 'public/models/room-bake.webp', size: 4096, quality: 80 },
  { source: `${FROM}/room-bake.png`, out: 'public/models/room-bake-2k.webp' },
  // The desk lamp's own light on the room, which the site adds to the room's
  // atlas while the lamp is on: see light_layer() in scripts/shelf.py. Black
  // but for one pool of light, so it is small at any quality; kept high,
  // because it is added to another picture and its blocks would show in the
  // dark half of that one.
  { source: `${FROM}/room-desk.png`, out: 'public/models/room-desk.webp', size: 2048, quality: 90 },
  // The clock's printed face, for WallClock.tsx to draw over the baked case.
  // Rendered by `--clock-face build/clock-face.png`, and has an alpha.
  { source: 'build/clock-face.png', out: 'public/models/clock-face.webp', size: 512, quality: 88 },
  // The light on the Books at rest: see docs/adr/0006. Light, not colour, and
  // multiplied by four when it is read, so it is kept a little cleaner than a
  // picture needs to be.
  //
  // Shipped at half the size it is baked at. Light on a Book is a slow
  // gradient, the bake is already smoothed, and at 1024 each Book still has
  // a 340px tile to itself. It is a quarter of the download.
  { source: `${FROM}/box-bake.png`, out: 'public/models/box-bake.webp', size: 1024, quality: 90 },
  // The desk lamp's own light on the Books: black but for the Book stack. See
  // bakedLight.ts.
  { source: `${FROM}/box-bake-desk.png`, out: 'public/models/box-desk.webp', size: 512, quality: 90 },
  // The Monstera's leaf cut-out, read as an alphaMap through the leaves'
  // second UV set: see build_floor_plant() in scripts/shelf.py. Kept at the
  // source's full 1024, because its only job is a crisp edge on each hole.
  { source: `${FROM}/leaf-mask.png`, out: 'public/models/leaf-mask.webp', size: 1024, quality: 90 },
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
      `No bake at ${source}. Run the Blender bake first: the full command is at the top of scripts/shelf.py.`
    );
    process.exit(1);
  }

  mkdirSync(dirname(out), { recursive: true });
  const before = readFileSync(source).length;
  const webp = await sharp(source, { limitInputPixels: false }).resize(size, size).webp({ quality }).toBuffer();
  writeFileSync(out, webp);
  console.log(`${source} ${kb(before)} -> ${out} ${kb(webp.length)} (${size}px, q${quality})`);
}
