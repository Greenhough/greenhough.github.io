/**
 * Paints what is outside the Window: prairie at dusk.
 *
 *   node scripts/prairie.mjs
 *
 * The site draws this on a plane four metres behind the glass, so it moves
 * against the window frame as the camera does. That is the whole reason it is
 * a picture drawn live rather than a gradient baked onto the glass: a view
 * that slides behind its frame reads as a distance, and one that does not
 * reads as a lit panel. See docs/adr/0006.
 *
 * Painted from code rather than taken from a photograph, for the same reason
 * the room is a script: it diffs, and it shows no real place. A low horizon,
 * a big sky, stubble, a slough, shelterbelts and a line of poles. Nothing in
 * it can be identified.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const W = 2048;
const H = 1080;
/** Where the horizon sits, as a fraction of the height from the top. */
const HORIZON = 0.5;
const OUT = 'public/models/prairie.webp';

// ---------------------------------------------------------------- helpers

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amp *= 0.5;
  }
  return sum / norm;
}

/** A colour ramp: [[position, colour], ...], positions ascending. */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return mix(c0, c1, smooth(p0, p1, t));
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------- the sky

// Top of the frame to the horizon. The sun went down a few minutes ago, left
// of centre, so the warm band is low and the blue above it is already deep.
const SKY = [
  [0.0, hex('#111a36')],
  [0.3, hex('#263761')],
  [0.55, hex('#56597f')],
  [0.74, hex('#a8717a')],
  [0.87, hex('#e79a69')],
  [0.955, hex('#f8be7a')],
  [1.0, hex('#ffdba6')],
];
const SUN = { u: 0.31, glow: hex('#fff0c4') };

function sky(u, s) {
  let c = ramp(SKY, s);

  // The glow where the sun went: wide along the horizon, shallow above it.
  const dx = (u - SUN.u) * 1.9;
  const dy = (1.0 - s) * 3.4;
  const glow = Math.exp(-(dx * dx + dy * dy) * 3.2);
  c = mix(c, SUN.glow, glow * 0.62);

  // Cloud, in long streaks. Stretched hard along the horizon, thicker in the
  // middle of the sky, lit from underneath by a sun that is below them.
  const n = fbm(u * 5.5 + 3.0, s * 26.0, 5);
  const wisps = fbm(u * 14.0, s * 70.0 + 40.0, 4);
  const band = smooth(0.18, 0.5, s) * (1 - smooth(0.9, 1.0, s));
  const cover = smooth(0.5, 0.7, n * 0.8 + wisps * 0.2) * band;
  const lit = smooth(0.45, 0.95, s) * (0.55 + 0.45 * Math.exp(-dx * dx * 1.4));
  const cloud = mix(hex('#3a3c5e'), hex('#ff9a6b'), lit);
  c = mix(c, cloud, cover * 0.72);
  return c;
}

// ---------------------------------------------------------------- the land

// Dusk colours: the gold has gone out of the stubble and what is left is
// brown, olive and near-black. Brighter than this and the land competes with
// the sky, which is the only thing out there still lit.
const FIELDS = [hex('#3a2f20'), hex('#1d1c16'), hex('#232a20'), hex('#44371f'), hex('#2b251b'), hex('#191c16')];

function land(u, d) {
  // d runs 0 at the horizon to 1 at the bottom of the frame. Ground distance
  // goes as its reciprocal, which is what makes fields stack up thin near the
  // horizon and open out towards the viewer.
  const far = 1 / (d + 0.018);

  // Fields: bands across the view, each its own crop, their boundaries
  // wandering a little because no quarter section is square to anything.
  const wander = (fbm(u * 3.0 + 5.0, far * 0.2, 3) - 0.5) * 0.9;
  const band = Math.floor(Math.log(far) * 4.2 + wander);
  // Pulled halfway to one common earth colour. At full strength the fields
  // are stripes of different paint; this far into dusk they are one dark
  // plain with the memory of having been different crops.
  let c = mix(FIELDS[Math.floor(hash(band, 7) * FIELDS.length)], hex('#28251b'), 0.5);

  // Rows. They run away from the viewer, so on screen they fan out from a
  // point on the horizon, and they are only visible close in.
  const row = Math.sin(((u - 0.46) / (d + 0.03)) * 150.0 + hash(band, 3) * 6.0);
  c = mix(c, mix(c, hex('#000000'), 0.3), smooth(-0.2, 1.0, row) * smooth(0.25, 0.8, d) * 0.22);

  // Stubble and grass: fine, and finer with distance.
  const blade = fbm(u * 520.0 * (0.4 + d), far * 60.0, 3) - 0.5;
  c = mix(c, blade > 0 ? hex('#4a4028') : hex('#0c0b08'), Math.abs(blade) * 0.55 * smooth(0.02, 0.5, d));

  // Tone, so a field is not one flat colour end to end.
  c = mix(c, hex('#0d0c08'), (fbm(u * 9.0, far * 1.2, 4) - 0.35) * 0.55);

  // A slough, holding the last of the sky.
  const sx = (u - 0.63) / 0.115;
  const sy = (d - 0.115) / 0.012;
  const edge = sx * sx + sy * sy + (fbm(u * 30.0, d * 200.0, 3) - 0.5) * 0.5;
  const water = 1 - smooth(0.75, 1.0, edge);
  c = mix(c, mix(hex('#f0a771'), hex('#7d6f8e'), smooth(-1, 1, sy)), water * 0.9);

  // Everything dims towards the viewer: the light is behind the horizon.
  c = mix(c, hex('#0b0a08'), 0.18 + smooth(0.05, 1.0, d) * 0.5);
  // And hazes into the sky where it meets it.
  c = mix(c, hex('#8a6a66'), (1 - smooth(0.0, 0.07, d)) * 0.42);
  return c;
}

// ---------------------------------------------------------------- silhouettes

const DARK = hex('#14151b');

/** How far above the horizon the far treeline reaches at u, in frame heights. */
function treeline(u) {
  let h = 0.004 + fbm(u * 60.0, 1.0, 3) * 0.007;
  // Shelterbelts: planted rows, so they come as runs with a flat-ish top.
  for (const [at, width, height] of [
    [0.08, 0.035, 0.017],
    [0.2, 0.02, 0.011],
    [0.335, 0.012, 0.015],
    [0.44, 0.045, 0.019],
    [0.66, 0.018, 0.012],
    [0.73, 0.03, 0.015],
    [0.9, 0.04, 0.018],
  ]) {
    const run = 1 - smooth(width * 0.6, width, Math.abs(u - at));
    h = Math.max(h, run * height * (0.5 + 0.5 * fbm(u * 420.0, at * 9.0, 4)));
  }
  return h;
}

/** A nearer belt of trees, left, a few fields out. */
function nearBelt(u, v) {
  if (u > 0.3) return 0;
  const base = HORIZON + 0.03;
  const crown = 0.05 * (0.3 + 0.7 * fbm(u * 150.0, 4.0, 4)) * (1 - smooth(0.16, 0.3, u));
  return v > base - crown && v < base + 0.004 ? 1 : 0;
}

/** Grain bins, far off: three cylinders with cone roofs. */
function bins(u, v) {
  const aspect = W / H;
  for (const [at, r, h] of [
    [0.548, 0.0052, 0.016],
    [0.561, 0.0064, 0.021],
    [0.575, 0.0048, 0.014],
  ]) {
    const dx = Math.abs(u - at);
    const up = HORIZON - v;
    if (dx < r && up > -0.002 && up < h) return 1;
    // The roof: a cone, a third as tall again.
    const roof = up - h;
    if (roof >= 0 && roof < h * 0.42 && dx < r * (1 - roof / (h * 0.42)) * 1.05) return 1;
    void aspect;
  }
  return 0;
}

/** A line of poles along a road, running from the right foreground to the horizon. */
const POLES = Array.from({ length: 9 }, (_, k) => {
  const s = 1 / (1 + (k + 1) * 0.75); // perspective: each one this much smaller
  return {
    u: 0.705 + 0.3 * s,
    foot: HORIZON + 0.012 + 0.5 * s,
    height: 0.52 * s,
    half: Math.max(0.0006, 0.0034 * s),
    arm: 0.03 * s,
  };
});

function poles(u, v) {
  for (const p of POLES) {
    const top = p.foot - p.height;
    if (Math.abs(u - p.u) < p.half && v > top && v < p.foot) return 1;
    // The crossarm, just under the top.
    if (Math.abs(u - p.u) < p.arm && Math.abs(v - (top + p.height * 0.07)) < Math.max(0.0008, p.half * 0.9)) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------- paint

const pixels = Buffer.alloc(W * H * 3);

for (let y = 0; y < H; y++) {
  const v = (y + 0.5) / H;
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W;
    let c;

    if (v < HORIZON) {
      c = sky(u, v / HORIZON);
      const up = HORIZON - v;
      const tree = treeline(u);
      // A soft top edge, a pixel or two, so the trees are not cut out.
      c = mix(c, DARK, 1 - smooth(tree - 0.0025, tree + 0.0005, up));
      if (bins(u, v)) c = mix(c, hex('#1d1e25'), 0.92);
    } else {
      c = land(u, (v - HORIZON) / (1 - HORIZON));
    }

    if (nearBelt(u, v)) c = mix(c, hex('#0f1014'), 0.94);
    if (poles(u, v)) c = mix(c, hex('#0c0c0f'), 0.9);

    // A little grain. Dusk is a long smooth gradient and eight bits band it.
    const grain = (hash(x, y + 9173) - 0.5) * (2.4 / 255);
    const i = (y * W + x) * 3;
    pixels[i] = Math.round(clamp(c[0] + grain) * 255);
    pixels[i + 1] = Math.round(clamp(c[1] + grain) * 255);
    pixels[i + 2] = Math.round(clamp(c[2] + grain) * 255);
  }
}

mkdirSync('public/models', { recursive: true });
mkdirSync('build', { recursive: true });
const image = sharp(pixels, { raw: { width: W, height: H, channels: 3 } });
await image.clone().png().toFile('build/prairie.png');
const info = await image.webp({ quality: 88 }).toFile(OUT);
console.log(`${OUT}  ${W}x${H}  ${Math.round(info.size / 1024)}KB`);
