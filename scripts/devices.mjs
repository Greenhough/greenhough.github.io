/**
 * Draws the Devices: the flat marks blocked on a Box's Cover.
 *
 * A Device is a mark, not a picture. It is seen at about a quarter of the
 * Cover's width, on cloth, in one tone, so it has to survive being small and
 * having no colour of its own to lean on. One shape, no text, no gradients.
 *
 * This script is the source of truth and the PNGs are build artifacts, the same
 * arrangement as scripts/shelf.py. Edit the geometry here and re-run:
 *
 *   node scripts/devices.mjs
 *
 * Quibble has no entry: its Device is the app's real icon, which beats anything
 * drawn here.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SIZE = 1024;

/**
 * One tone, close to what paintCover stamps the title in, so the mark reads as
 * pressed into the cloth beside it rather than stuck on top. It has to work on
 * the green cloth of Built for Myself and the near-black of Built for Work, so
 * it is light: a dark mark disappears on one of them.
 */
const INK = '#EDE9DE';

/** Every mark is drawn in a 100x100 square and fills most of it. */
const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${SIZE}" height="${SIZE}">` +
  `<g fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">` +
  body +
  '</g></svg>';

const DEVICES = {
  /**
   * This Website: squares inside squares. The Project is a site that contains
   * a write-up about building itself, and the mark is that joke told flat.
   */
  'this-website': wrap(
    '<rect x="8" y="8" width="84" height="84" rx="10"/>' +
      '<rect x="27" y="27" width="46" height="46" rx="7"/>' +
      `<rect x="44" y="44" width="12" height="12" rx="3" fill="${INK}" stroke="none"/>`
  ),

  /**
   * Pomodoro Timer: a dial with its hand part-way round. A tomato would be the
   * obvious joke and would read as a blob at this size.
   */
  'pomodoro-timer': wrap(
    '<circle cx="50" cy="56" r="36"/>' +
      '<path d="M40 11 h20"/>' +
      '<path d="M50 11 v9"/>' +
      '<path d="M50 56 L72 38"/>'
  ),

  /**
   * AI Visibility Report: where you stand against the others, on a baseline.
   * The tallest is hollow because the report is about one brand among several,
   * and a solid third bar would just be a chart.
   */
  'ai-visibility-report': wrap(
    `<rect x="11" y="52" width="20" height="30" rx="4" fill="${INK}" stroke="none"/>` +
      `<rect x="40" y="34" width="20" height="48" rx="4" fill="${INK}" stroke="none"/>` +
      '<rect x="69" y="16" width="20" height="66" rx="4"/>' +
      '<path d="M6 89 h88"/>'
  ),

  /**
   * AI GTM System: parts wired to a centre. The write-up is four of them —
   * context, skills, orchestration, integrations — so the mark is four.
   */
  'ai-marketing-system': wrap(
    '<path d="M50 50 L50 16 M50 50 L18 69 M50 50 L82 69"/>' +
      `<circle cx="50" cy="50" r="11" fill="${INK}" stroke="none"/>` +
      '<circle cx="50" cy="14" r="9"/>' +
      '<circle cx="16" cy="71" r="9"/>' +
      '<circle cx="84" cy="71" r="9"/>'
  ),
};

for (const [name, svg] of Object.entries(DEVICES)) {
  const out = `src/assets/covers/${name}.png`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(out, png);
  console.log(`${out} ${Math.round(png.length / 1024)}KB (${SIZE}px, transparent)`);
}
