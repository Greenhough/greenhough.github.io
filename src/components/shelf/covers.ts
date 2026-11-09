import * as THREE from 'three';
import { palette, themeColour } from './palette';
import type { ShelfProject } from './types';

/**
 * The Cover template.
 *
 * Every Box is printed from this one function, which is what makes adding a
 * sixth Project cheap: drop in a Markdown file with cover art and it gets a
 * Cover and a Spine for free. A Project can still be given hand-designed art
 * later by replacing the image in src/assets/covers/ — the frame around it,
 * the title and the tags are drawn here.
 *
 * The layout borrows from an actual board game box: publisher's band across the
 * top, the art in a window, the title under it, and the play information
 * printed along the bottom edge. Tags take the place of player count and
 * play time.
 */

const COVER_ASPECT = 1.25; // height / width

/**
 * Load the self-hosted faces before painting; canvas text will not load them
 * itself. Only the faces actually painted are awaited. An earlier version also
 * awaited document.fonts.ready, which waits on every font the page will ever
 * load and held the Shelf blank for several seconds.
 */
export async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const faces = ['800 100px Archivo', '700 100px "JetBrains Mono"', '500 100px "JetBrains Mono"'];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => undefined)));
}

/** Break text into lines that fit `maxWidth`, at most `maxLines` (last one ellipsised). */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    if (last !== lines[maxLines - 1]) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** Draw `img` into the rect, cropped to fill like CSS object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** The printed face of a Box. */
export function paintCover(
  canvas: HTMLCanvasElement,
  project: ShelfProject,
  art: HTMLImageElement | null,
  width: number
) {
  const W = width;
  const H = Math.round(width * COVER_ASPECT);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  const p = palette();
  const accent = themeColour(project.theme);
  const u = W / 100; // one unit = 1% of the width, so the layout scales with size

  // ground
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);

  // publisher's band
  const bandH = 11 * u;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, bandH);

  ctx.fillStyle = p.paper;
  ctx.font = `700 ${3.1 * u}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.35 * u}px`;
  ctx.fillText(project.eyebrow.toUpperCase(), 6 * u, bandH / 2);

  // the asterisk, printed small at the band's right edge
  ctx.font = `800 ${5 * u}px Archivo, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('*', W - 6 * u, bandH / 2);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  // art window
  const winX = 6 * u;
  const winY = bandH + 6 * u;
  const winW = W - 12 * u;
  const winH = 46 * u;
  ctx.fillStyle = p.surface;
  ctx.fillRect(winX, winY, winW, winH);
  if (art) drawCover(ctx, art, winX, winY, winW, winH);
  ctx.strokeStyle = p.border;
  ctx.lineWidth = Math.max(1, 0.4 * u);
  ctx.strokeRect(winX, winY, winW, winH);

  // title
  const titleSize = 7.4 * u;
  ctx.fillStyle = p.ink;
  ctx.font = `800 ${titleSize}px Archivo, sans-serif`;
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, project.title, winW, 3);
  let ty = winY + winH + 6 * u;
  for (const line of lines) {
    ctx.fillText(line, winX, ty);
    ty += titleSize * 1.06;
  }

  // rule
  const ruleY = H - 15 * u;
  ctx.fillStyle = accent;
  ctx.fillRect(winX, ruleY, winW, Math.max(1, 0.6 * u));

  // tags, printed the way a publisher prints player count and play time
  ctx.fillStyle = p.muted;
  ctx.font = `500 ${3.1 * u}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.2 * u}px`;
  let tx = winX;
  const tagY = ruleY + 8 * u;
  project.tags.forEach((tag, i) => {
    const label = tag.toUpperCase();
    ctx.fillText(label, tx, tagY);
    tx += ctx.measureText(label).width;
    if (i < project.tags.length - 1) {
      ctx.fillStyle = p.faint;
      ctx.fillText('  ·  ', tx, tagY);
      tx += ctx.measureText('  ·  ').width;
      ctx.fillStyle = p.muted;
    }
  });
  ctx.letterSpacing = '0px';
}

/** Read #rrggbb into its three channels. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix two colours: t = 0 is all `a`, t = 1 is all `b`. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)} ${c(ag, bg)} ${c(ab, bb)})`;
}

/** A small, stable number from a string, for per-Project variation. */
function hashed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * The Spine: what you see while a Box is shelved, so it carries the title on
 * its own and is nearly all a visitor looks at.
 *
 * Painted as book cloth, not as a printed panel. The version this replaced was
 * drawn for a board game box — cream ground, accent blocks at head and tail —
 * and once the Box became a hardback it was the one part still arguing for the
 * old idiom. A cloth spine is the binding colour edge to edge, with the title
 * stamped on it and a pair of rules at head and tail, which is what a run of
 * them on a shelf actually looks like.
 *
 * The weave itself is not painted here. It is a normal map baked in Blender
 * (scripts/shelf.py --cloth-bake) and tiled over this, because what gives cloth
 * away is the light crawling across the threads, and no colour texture does
 * that.
 */
export function paintSpine(
  canvas: HTMLCanvasElement,
  project: ShelfProject,
  height: number
) {
  // Tall and narrow, painted flat and then wrapped round the rounded back. A
  // shade wider than the Box is thick, because an arc is longer than its chord.
  const H = height;
  const W = Math.round(height * 0.21);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  const p = palette();
  const u = H / 100;

  // Binding cloth: the Theme's colour, pulled towards the ink and varied a
  // little per Project. Dye lots are never identical and six spines in a row
  // out of the same tin reads as a rendering, not a shelf.
  const jitter = hashed(project.slug);
  const cloth = mix(themeColour(project.theme), p.ink, 0.16 + jitter * 0.14);
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, W, H);

  // Stamping: not gold, which would fight the page, but the paper colour, laid
  // on at less than full strength so it reads as pressed into the cloth.
  const stamp = mix(cloth, p.paper, 0.86);
  const rule = mix(cloth, p.paper, 0.45);

  const inset = 2.6 * u;
  const rules = (y: number) => {
    ctx.fillStyle = rule;
    const t = Math.max(1, 0.35 * u);
    ctx.fillRect(inset, y, W - inset * 2, t);
    ctx.fillRect(inset, y + 1.7 * u, W - inset * 2, t);
  };
  rules(8 * u);
  rules(H - 10 * u);

  // Title runs up the spine, the way it is lettered on this side of the
  // Atlantic: head at the top when the book is standing.
  ctx.save();
  ctx.translate(W / 2, H - 15 * u);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = stamp;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${0.25 * u}px`;

  let size = 8.6 * u;
  const run = H - 30 * u;
  ctx.font = `800 ${size}px Archivo, sans-serif`;
  while (ctx.measureText(project.title).width > run && size > 3 * u) {
    size -= 0.25 * u;
    ctx.font = `800 ${size}px Archivo, sans-serif`;
  }
  ctx.fillText(project.title, 0, 0);
  ctx.letterSpacing = '0px';
  ctx.restore();

  // The site's mark at the foot, where a binder puts the publisher's device.
  ctx.fillStyle = rule;
  ctx.font = `800 ${5 * u}px Archivo, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('*', W / 2, H - 4.6 * u);
  ctx.textAlign = 'left';
}

/**
 * The little printed plate that names a Section, screwed to the shelf edge the
 * way a shop labels a run of shelving.
 */
export function paintLabel(canvas: HTMLCanvasElement, text: string, width: number) {
  const W = width;
  const H = Math.round(width * 0.14);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  const p = palette();
  const u = H / 10;

  ctx.fillStyle = p.ink;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = p.paper;
  ctx.font = `700 ${3.4 * u}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${0.9 * u}px`;
  ctx.fillText(text.toUpperCase(), W / 2, H / 2 + 0.2 * u);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

/** Wrap a painted canvas as a texture ready for a material. */
export function toTexture(canvas: HTMLCanvasElement, renderer?: THREE.WebGLRenderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 4;
  texture.needsUpdate = true;
  return texture;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
