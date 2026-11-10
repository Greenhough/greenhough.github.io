import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ShelfPost, ShelfSection } from '../components/shelf/types';
import { monthYear } from './format';

/**
 * Builds the Shelf's data at build time: the Sections, in the order they are
 * stacked, each holding its Projects newest first.
 *
 * A Project's device is resized here rather than in the browser, so the island
 * only ever downloads what it needs. docs/adr/0002 sets the budget: 512px on
 * phones, 1024px on desktop. A Project without one sends nothing.
 */

/** Top to bottom. The schema in content.config.ts enforces the same set. */
const SECTION_ORDER = ['Built for Myself', 'Built for Work'] as const;

export async function getShelfSections(): Promise<ShelfSection[]> {
  const work = (await getCollection('work')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const sections: ShelfSection[] = [];

  for (const theme of SECTION_ORDER) {
    const inTheme = work.filter((entry) => entry.data.theme === theme);
    if (inTheme.length === 0) continue;

    const projects = await Promise.all(
      inTheme.map(async (entry) => {
        const device = entry.data.cover;
        const [small, large] = device
          ? await Promise.all([
              getImage({ src: device, width: 512, format: 'webp' }),
              getImage({ src: device, width: 1024, format: 'webp' }),
            ])
          : [null, null];
        return {
          slug: entry.data.slug,
          title: entry.data.title,
          spine: entry.data.spine ?? entry.data.title,
          eyebrow: entry.data.eyebrow,
          tags: entry.data.tags,
          summary: entry.data.summary,
          theme: entry.data.theme,
          art: small && large ? { small: small.src, large: large.src } : null,
        };
      })
    );

    sections.push({ theme, projects });
  }

  return sections;
}


/**
 * The latest Post, shaped for the room.
 *
 * The sheet of paper on the Desk shows this one; everything older is the list
 * on /writing. The room renders content it does not own, so the date is
 * formatted here rather than in the scene — one date format for the site, not
 * one for the page and another for the canvas.
 */
export async function getLatestPost(): Promise<ShelfPost | null> {
  const posts = await getCollection('posts');
  if (posts.length === 0) return null;

  const latest = posts.reduce((a, b) =>
    b.data.date.valueOf() > a.data.date.valueOf() ? b : a
  );

  return {
    slug: latest.data.slug,
    title: latest.data.title,
    date: monthYear(latest.data.date),
    // The excerpt may carry inline HTML, which a canvas cannot draw.
    excerpt: latest.data.excerpt.replace(/<[^>]*>/g, ''),
    readTime: latest.data.readTime,
  };
}
