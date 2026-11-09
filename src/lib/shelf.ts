import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ShelfSection } from '../components/shelf/types';

/**
 * Builds the Shelf's data at build time: the Sections, in the order they are
 * stacked, each holding its Projects newest first.
 *
 * Cover art is resized here rather than in the browser, so the island only ever
 * downloads what it needs. docs/adr/0002 sets the budget: 512px on phones,
 * 1024px on desktop.
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
        const [small, large] = await Promise.all([
          getImage({ src: entry.data.cover, width: 512, format: 'webp' }),
          getImage({ src: entry.data.cover, width: 1024, format: 'webp' }),
        ]);
        return {
          slug: entry.data.slug,
          title: entry.data.title,
          spine: entry.data.spine ?? entry.data.title,
          eyebrow: entry.data.eyebrow,
          tags: entry.data.tags,
          summary: entry.data.summary,
          theme: entry.data.theme,
          art: { small: small.src, large: large.src },
        };
      })
    );

    sections.push({ theme, projects });
  }

  return sections;
}
