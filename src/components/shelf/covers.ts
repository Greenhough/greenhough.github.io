import * as THREE from 'three';
import { palette, themeColour } from './palette';
import type { ShelfProject, ShelfRecord } from './types';
import type { ReadBook } from './readBooks';
import type { ShelfPost } from './types';

/**
 * The printing on a Box: the Cover, the Spine and the Section label.
 *
 * Every Box is printed from these functions, which is what makes adding a
 * sixth Project cheap: drop in a Markdown file and it gets a Cover and a Spine
 * for free.
 *
 * Both faces are a clothbound case, and the two have to agree, because on a
 * real book they are one piece of cloth folded round the boards. The colour
 * comes from clothColour() for that reason rather than being written twice.
 *
 * What this replaced was a board game box: a publisher's band across the top,
 * the art in a window, the title under it and the tags along the bottom edge
 * standing in for player count and play time. It was the last part of the Box
 * still drawn for the cut direction. See docs/adr/0001.
 */

/** Height over width of the front board, from scripts/shelf.py. */
const COVER_ASPECT = 1.0 / 0.785;

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
 * The binding: the Theme's colour pulled towards the ink, varied a little per
 * Project because dye lots are never identical and six bindings out of one tin
 * reads as a rendering rather than a shelf.
 *
 * Also the two tones stamped onto it. Not gold, which would fight the page:
 * the paper colour, at less than full strength, so it reads as pressed into
 * the cloth rather than printed on top of it.
 */
function clothColour(project: ShelfProject) {
  const p = palette();
  const cloth = mix(themeColour(project.theme), p.ink, 0.16 + hashed(project.slug) * 0.14);
  return {
    cloth,
    stamp: mix(cloth, p.paper, 0.86),
    rule: mix(cloth, p.paper, 0.45),
    /** Blind stamping has no ink at all: it is a shadow and a lip, nothing more. */
    blind: mix(cloth, p.ink, 0.45),
    lip: mix(cloth, p.paper, 0.14),
  };
}

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

/**
 * Fit a title into at most `maxLines` by shrinking it rather than cutting it.
 * An ellipsis on a cover looks like a bug, because it is one: wrap() truncates
 * when it runs out of lines, and a long title needs a smaller size, not fewer
 * words. The Spine does the same thing for the same reason.
 */
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  start: number,
  min: number
) {
  const font = (size: number) => `800 ${size}px Archivo, sans-serif`;
  let size = start;
  for (;;) {
    ctx.font = font(size);
    const lines = wrap(ctx, text, maxWidth, maxLines);
    if (size <= min || !lines[lines.length - 1].endsWith('…')) return { size, lines };
    size -= start * 0.05;
  }
}

/** Draw `img` centred in the box at its own aspect, like object-fit: contain. */
function drawDevice(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  box: number
) {
  const scale = Math.min(box / img.width, box / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/**
 * The Cover: the front board of a Box, bound in the same cloth as the Spine.
 *
 * A cloth case carries almost nothing, which is the point. A blind frame
 * pressed into the cloth, the title blocked on it, the Project's device below
 * and the tags at the foot. There is no art window, because the thing that
 * used to go in it was a screenshot, and a screenshot is evidence while a
 * cover is a sign. The evidence belongs in the Write-up, where it already is.
 *
 * `art` is a Project's device — a flat mark, blocked on the cloth. It is
 * optional: without one the Box carries the site's asterisk, which is a
 * perfectly ordinary thing for a binding to do.
 *
 * The Write-up keeps the full, descriptive title. Only the binding is short.
 */
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
  const c = clothColour(project);
  const u = W / 100; // one unit = 1% of the width, so the layout scales with size

  ctx.fillStyle = c.cloth;
  ctx.fillRect(0, 0, W, H);

  // A blind frame: no ink, just a line pressed into the cloth. Two strokes a
  // hair apart, the shadow of the channel and the lip the press raised beside
  // it, which is the whole trick to making stamping read without colour.
  const inset = 7 * u;
  const frame = (offset: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1, 0.4 * u);
    ctx.strokeRect(inset + offset, inset + offset, W - inset * 2, H - inset * 2);
  };
  frame(0, c.blind);
  frame(Math.max(1, 0.4 * u), c.lip);

  ctx.textAlign = 'center';

  // Eyebrow, blocked small above the title the way a series line is.
  ctx.fillStyle = c.rule;
  ctx.font = `700 ${3 * u}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.9 * u}px`;
  ctx.fillText(project.eyebrow.toUpperCase(), W / 2, 26 * u);
  ctx.letterSpacing = '0px';

  // Title, blocked in the upper half. The same lettering as the Spine, because
  // a binder letters a case and its spine once: a book whose board and back
  // disagree about its own name is a book with a dust jacket on it.
  const lettering = project.spine;
  ctx.fillStyle = c.stamp;
  ctx.textBaseline = 'top';
  const { size: titleSize, lines } = fitTitle(ctx, lettering, W - 28 * u, 4, 9 * u, 4.5 * u);
  let ty = 36 * u;
  for (const line of lines) {
    ctx.fillText(line, W / 2, ty);
    ty += titleSize * 1.08;
  }

  // A short rule under it, the full stop on the lettering.
  const ruleY = ty + 5 * u;
  ctx.fillStyle = c.rule;
  ctx.fillRect(W / 2 - 8 * u, ruleY, 16 * u, Math.max(1, 0.45 * u));

  // The device sits in whatever the title left, between the rule and the tags,
  // rather than at a fixed height a four-line title would collide with.
  const top = ruleY + 9 * u;
  const bottom = H - 22 * u;
  const box = Math.min(24 * u, bottom - top);

  if (art) {
    drawDevice(ctx, art, W / 2, (top + bottom) / 2, box);
  } else {
    ctx.fillStyle = c.rule;
    ctx.font = `800 ${box * 0.55}px Archivo, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('*', W / 2, (top + bottom) / 2);
  }

  // Tags at the foot, where a binding carries the imprint.
  ctx.fillStyle = c.rule;
  ctx.font = `500 ${2.8 * u}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.6 * u}px`;
  ctx.fillText(project.tags.map((t) => t.toUpperCase()).join('   ·   '), W / 2, H - 14 * u);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
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
  const u = H / 100;

  // The same binding as the Cover, from the same function: on a real book the
  // spine and the boards are one piece of cloth.
  const { cloth, stamp, rule } = clothColour(project);
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, W, H);

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

  // The Spine's own title, which is the full one unless the Project gives a
  // shorter one. The loop below will fit anything, but "fits" and "reads
  // across a room" are not the same thing, so a long title is shortened in
  // frontmatter rather than shrunk to nothing here.
  let size = 8.6 * u;
  const run = H - 30 * u;
  ctx.font = `800 ${size}px Archivo, sans-serif`;
  while (ctx.measureText(project.spine).width > run && size > 3 * u) {
    size -= 0.25 * u;
    ctx.font = `800 ${size}px Archivo, sans-serif`;
  }
  ctx.fillText(project.spine, 0, 0);
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
 * A read book's Spine: the ones lying on the desk, not the ones on the Shelf.
 *
 * Close to paintSpine and deliberately not the same function. Two differences
 * carry meaning rather than style. The binding colour comes from the book
 * itself instead of from a Theme, because these are nobody's Projects and have
 * no Theme to belong to. And there is no asterisk at the foot: that is the
 * site's own device, and stamping it on someone else's book would be claiming
 * it. See src/components/shelf/readBooks.ts.
 */
export function paintReadSpine(canvas: HTMLCanvasElement, book: ReadBook, height: number) {
  const H = height;
  const W = Math.round(height * 0.21);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  const u = H / 100;
  const p = palette();
  const stamp = mix(book.cloth, p.paper, 0.80);
  const rule = mix(book.cloth, p.paper, 0.38);

  ctx.fillStyle = book.cloth;
  ctx.fillRect(0, 0, W, H);

  const inset = 2.6 * u;
  const bands = (y: number) => {
    ctx.fillStyle = rule;
    const t = Math.max(1, 0.4 * u);
    ctx.fillRect(inset, y, W - inset * 2, t);
    ctx.fillRect(inset, y + 1.9 * u, W - inset * 2, t);
  };
  bands(7 * u);
  bands(H - 9 * u);

  ctx.save();
  ctx.translate(W / 2, H - 12 * u);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = stamp;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${0.2 * u}px`;

  let size = 9 * u;
  const run = H - 24 * u;
  ctx.font = `800 ${size}px Archivo, sans-serif`;
  while (ctx.measureText(book.title).width > run && size > 3 * u) {
    size -= 0.25 * u;
    ctx.font = `800 ${size}px Archivo, sans-serif`;
  }
  ctx.fillText(book.title, 0, 0);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * The sheet of paper on the Desk: the latest Post, as something lying there.
 *
 * Printed rather than typeset on screen. docs/adr/0005 draws the line between
 * showing and reading — the sheet shows you what the Post is and reading the
 * whole of it goes to the page, because a long article on a plane in 3D is
 * worse than a page and calling that interactive would be using the word to
 * mean harder.
 */
export function paintSheet(canvas: HTMLCanvasElement, post: ShelfPost, width: number) {
  // A4 proportions, near enough. Paper people recognise is paper people believe.
  const W = width;
  const H = Math.round(width * 1.414);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  const u = W / 100;
  const p = palette();

  ctx.fillStyle = mix(p.paper, '#ffffff', 0.5);
  ctx.fillRect(0, 0, W, H);

  const margin = 11 * u;
  let y = 20 * u;

  ctx.fillStyle = mix(p.ink, p.paper, 0.55);
  ctx.font = `500 ${4.4 * u}px "JetBrains Mono", monospace`;
  ctx.letterSpacing = `${0.6 * u}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(post.date.toUpperCase(), margin, y);
  ctx.letterSpacing = '0px';

  y += 11 * u;
  ctx.fillStyle = p.ink;
  const title = fitTitle(ctx, post.title, W - margin * 2, 4, 10 * u, 5.5 * u);
  ctx.font = `800 ${title.size}px Archivo, sans-serif`;
  for (const line of title.lines) {
    ctx.fillText(line, margin, y);
    y += title.size * 1.14;
  }

  y += 4 * u;
  ctx.fillStyle = mix(p.ink, p.paper, 0.3);
  ctx.fillRect(margin, y, 16 * u, Math.max(1, 0.5 * u));

  y += 9 * u;
  ctx.fillStyle = mix(p.ink, p.paper, 0.32);
  ctx.font = `400 ${4.8 * u}px Archivo, sans-serif`;
  for (const line of wrap(ctx, post.excerpt, W - margin * 2, 6)) {
    ctx.fillText(line, margin, y);
    y += 7 * u;
  }

  // The foot, where a printed page puts its running information.
  ctx.fillStyle = mix(p.ink, p.paper, 0.6);
  ctx.font = `500 ${3.8 * u}px "JetBrains Mono", monospace`;
  ctx.letterSpacing = `${0.4 * u}px`;
  ctx.fillText(`${post.readTime} MIN READ`, margin, H - 12 * u);
  ctx.letterSpacing = '0px';
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

/**
 * A record sleeve: card in one colour, lettered in another, and nothing else.
 *
 * No album art. A sleeve's cover belongs to whoever made it, and the room
 * letters things in its own hand anyway: a Box, a read book, this.
 */
export function paintSleeve(canvas: HTMLCanvasElement, record: ShelfRecord, size: number) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const u = size / 100;
  const soft = mix(record.sleeve, record.ink, 0.5);

  ctx.fillStyle = record.sleeve;
  ctx.fillRect(0, 0, size, size);

  // The ring a record wears into its sleeve.
  ctx.strokeStyle = mix(record.sleeve, record.ink, 0.09);
  ctx.lineWidth = 1.1 * u;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 43 * u, 0, Math.PI * 2);
  ctx.stroke();

  const margin = 9 * u;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = soft;
  ctx.font = `700 ${3.6 * u}px "JetBrains Mono", monospace`;
  ctx.letterSpacing = `${0.55 * u}px`;
  ctx.fillText(record.artist.toUpperCase(), margin, 15 * u);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = record.ink;
  const title = fitTitle(ctx, record.album ?? record.song, size - margin * 2, 4, 15 * u, 7 * u);
  ctx.font = `800 ${title.size}px Archivo, sans-serif`;
  let y = 22 * u + title.size;
  for (const line of title.lines) {
    ctx.fillText(line, margin, y);
    y += title.size * 1.04;
  }

  ctx.fillStyle = soft;
  ctx.fillRect(margin, size - 21 * u, 14 * u, Math.max(1, 0.5 * u));
  ctx.font = `500 ${3.4 * u}px "JetBrains Mono", monospace`;
  ctx.letterSpacing = `${0.45 * u}px`;
  const foot = wrap(ctx, record.song.toUpperCase(), size - margin * 2, 1);
  ctx.fillText(foot[0] ?? '', margin, size - 12 * u);
  ctx.letterSpacing = '0px';
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
