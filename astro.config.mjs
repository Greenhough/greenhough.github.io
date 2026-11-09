import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import react from '@astrojs/react';

export default defineConfig({
  // Used to build canonical URLs, og:url and sitemap.xml.
  site: 'https://evangreenhough.com',

  // React powers the Shelf island on the home page. Every other page still
  // ships zero JavaScript: Astro only hydrates the one component that asks for it.
  integrations: [react()],

  // Build plain .html files at the root of dist/ (work.html, quibble.html) rather
  // than folders with an index.html inside. GitHub Pages then serves them at the
  // extensionless paths the site has always used: /work, /quibble.
  build: { format: 'file' },
  trailingSlash: 'never',

  // The urea volatilization pages moved under /archive/. They were never linked
  // from the site and never in the sitemap, but they were shared with people
  // who may still have the URL, so the old paths redirect rather than 404.
  // Static output turns these into meta-refresh pages, which is all GitHub
  // Pages can do.
  redirects: {
    '/urea-volatilization': '/archive/urea-volatilization',
    '/urea-volatilization-methodology': '/archive/urea-volatilization-methodology',
  },

  markdown: {
    processor: satteri({
      features: {
        // Smart punctuation rewrites straight apostrophes and quotes into curly
        // ones. The posts were written with straight quotes and this rebuild is a
        // port, so the text has to come out exactly as it was typed.
        smartPunctuation: false,
      },
    }),
  },
});
