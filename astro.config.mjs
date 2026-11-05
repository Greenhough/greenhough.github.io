import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';

export default defineConfig({
  // Used to build canonical URLs, og:url and sitemap.xml.
  site: 'https://evangreenhough.com',

  // Build plain .html files at the root of dist/ (work.html, quibble.html) rather
  // than folders with an index.html inside. GitHub Pages then serves them at the
  // extensionless paths the site has always used: /work, /quibble.
  build: { format: 'file' },
  trailingSlash: 'never',

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
