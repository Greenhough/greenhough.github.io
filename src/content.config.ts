import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { file, glob } from 'astro/loaders';

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
     * How the binding is lettered: the Spine and the Cover both carry this.
     * Named for the Spine because that is the surface that forces it — a long
     * title has to be set too small to read edge-on — but a binder letters a
     * case and its back once, so the Cover follows.
     *
     * Optional: without it the binding carries `title`. The field exists
     * rather than the Project simply being renamed because the hub card and
     * the write-up want the long, descriptive title.
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

/**
 * The records in the Console. One sleeve each, and one song: the Record player
 * plays it as the publisher's own embedded video, per docs/adr/0005. Listed on
 * /music, which is also the URL of the Console view.
 */
const records = defineCollection({
  loader: file('./src/content/room/records.json'),
  schema: z.object({
    /** Where it stands in the row: 1 is the record that is out when the page loads. */
    order: z.number().int().positive(),
    artist: z.string(),
    song: z.string(),
    /** Null for a single that is not on an album. */
    album: z.string().nullable(),
    /** The YouTube video id, not the URL. */
    youtube: z.string(),
    /** The sleeve's card and the colour it is lettered in. No album art. */
    sleeve: z.string(),
    ink: z.string(),
  }),
});

/**
 * Evan's top ten board games, in order. Listed on /board-games. The two with
 * a `box` are the Board games stacked in the Console.
 */
const boardGames = defineCollection({
  loader: file('./src/content/room/board-games.json'),
  schema: z.object({
    rank: z.number().int().positive(),
    title: z.string(),
    year: z.number().int(),
    /**
     * A box in the Console, for the games that have one. Its art is
     * public/assets/board-games/room/{id}-lid.webp and {id}-side.webp, taken
     * from the publisher's box shot; scripts/shelf.py models the box at this
     * size and Console.tsx lays the art on the faces the camera sees.
     */
    box: z
      .object({
        /** The card the box is baked in, for the faces that carry no art. */
        card: z.string(),
        /**
         * The real box in centimetres. `wide` and `tall` are the side that
         * faces out of the bay; `deep` runs back into it.
         */
        size: z.object({ wide: z.number(), tall: z.number(), deep: z.number() }),
      })
      .optional(),
    /**
     * The box image on /board-games, public/assets/board-games/{id}.webp,
     * from the publisher's own product page. The Room still letters its
     * Board games and shows no box art: see docs/adr/0005.
     */
    cover: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
  }),
});

/**
 * The books on /books, three to a topic. Real covers, unlike the Room's
 * Sleeves and Board games: see the 2026-11-13 addendum to docs/adr/0005.
 * Each cover is public/assets/books/{id}.webp, 300 wide.
 */
const books = defineCollection({
  loader: file('./src/content/room/books.json'),
  schema: z.object({
    /** Across the whole list, so topics come out in the order they were written. */
    order: z.number().int().positive(),
    topic: z.string(),
    title: z.string(),
    /** Used in the cover's alt text, not shown. */
    author: z.string(),
    cover: z.object({ width: z.number().int(), height: z.number().int() }),
  }),
});

export const collections = { work, posts, records, boardGames, books };
