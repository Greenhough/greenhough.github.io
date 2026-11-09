import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// sitemap.xml is generated from the content collections, so publishing a new
// write-up or post can never leave it stale. Search Console already has this
// URL submitted, so the filename and format stay exactly as they were.
//
// Deliberately absent: the 404, /archive/v1/* (noindexed), and the two
// urea-volatilization pages, which have always been excluded and now live
// under /archive/ with the rest of what is kept but not current.

const STATIC_PATHS = ['/', '/work', '/writing'];

const byNewest = (a: { data: { date: Date } }, b: { data: { date: Date } }) =>
  b.data.date.valueOf() - a.data.date.valueOf();

export const GET: APIRoute = async ({ site }) => {
  const work = (await getCollection('work')).sort(byNewest);
  const posts = (await getCollection('posts')).sort(byNewest);

  const paths = [
    ...STATIC_PATHS,
    ...work.map((entry) => `/${entry.data.slug}`),
    ...posts.map((entry) => `/${entry.data.slug}`),
  ];

  const urls = paths
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
