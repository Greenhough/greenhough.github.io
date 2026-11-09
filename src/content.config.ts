import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

// Every Project and Post on the site is one Markdown file in src/content/.
// These schemas are the contract: a missing or misspelled field fails the build
// instead of shipping a broken page. Nothing here is repeated anywhere else —
// the home page, the hub pages and sitemap.xml all read from these collections.

const THEMES = ['Built for Myself', 'Built for Work'] as const;

/**
 * Write-ups for Projects. Rendered at /{slug}, listed on /work and on the home page.
 */
const work = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/work',
    // The URL comes from the `slug` in frontmatter, not from the filename, so
    // there is exactly one place that decides where a Project lives.
    generateId: ({ data }) => String(data.slug),
  }),
  schema: ({ image }) => z.object({
    /** Title case. Used for the h1, the <title>, og:title and every listing. */
    title: z.string(),
    /**
     * A shorter title for the Spine, where the full one would have to be set
     * too small to read. Optional: without it the Spine carries `title`. This
     * is what a binder does on a real spine, and it is why the field exists
     * rather than the Project simply being renamed — the hub card and the
     * write-up want the long, descriptive title.
     */
    spine: z.string().optional(),
    /** The URL path, without a leading slash: "quibble" serves at /quibble. */
    slug: z.string(),
    /** Small label above the title on the write-up and on the /work card. */
    eyebrow: z.string(),
    /** Technology/topic markers. Labels map to a colour in Tags.astro. */
    tags: z.array(z.string()).default([]),
    /** Publication date. Sorts the listings; displayed as "Mon YYYY". */
    date: z.coerce.date(),
    /** The meta description and og:description. Aim for 110-155 characters. */
    description: z.string(),
    /** The card text on /work and on the home page. One sentence. */
    summary: z.string(),
    /** Optional standfirst line under the h1 on the write-up itself. */
    dek: z.string().optional(),
    /** Which Section of the Shelf this Project belongs to. */
    theme: z.enum(THEMES),
    /**
     * This Project's device: the flat mark blocked on the Cover, from
     * src/assets/covers/. Optional — a Box without one carries the site's
     * asterisk, which is an ordinary thing for a binding to do.
     *
     * A mark, not a screenshot. The Cover is seen small and a screenshot of a
     * dashboard is grey mush at that size; the screenshots belong in the
     * Write-up, where they already are.
     */
    cover: image().optional(),
  }),
});

/**
 * Posts: Evan's writing that is not about a Project. Rendered at /{slug},
 * listed on /writing and on the home page. Posts have no Theme and no Tags —
 * they never appear on the Shelf.
 */
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/posts',
    generateId: ({ data }) => String(data.slug),
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    date: z.coerce.date(),
    /** The meta description and og:description. */
    description: z.string(),
    /** The single-line preview on the listings. May contain inline HTML (<em>). */
    excerpt: z.string(),
    /** Minutes, shown in the article meta line. Roughly 225 words per minute. */
    readTime: z.number().int().positive(),
    /** Optional looping video above the prose. */
    video: z
      .object({
        src: z.string(),
        /** aria-label describing the video for screen readers. */
        label: z.string(),
      })
      .optional(),
  }),
});

export const collections = { work, posts };
