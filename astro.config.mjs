import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import react from '@astrojs/react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

// A fingerprint of everything in public/models/. Those files keep their names
// from one bake to the next, so a browser that has visited before holds the
// old model and the old atlases while the page hands it new code that expects
// new ones: Books lit from the wrong tiles, lettering for objects that are not
// there. Every request for one carries this, so a new bake is a new URL.
const modelsHash = createHash('sha1');
for (const name of readdirSync('public/models').sort()) {
  modelsHash.update(name).update(readFileSync(`public/models/${name}`));
}
const MODELS_VERSION = modelsHash.digest('hex').slice(0, 10);

export default defineConfig({
  // Used to build canonical URLs, og:url and sitemap.xml.
  site: 'https://evangreenhough.com',

  // React powers the Shelf island on the home page. Every other page still
  // ships zero JavaScript: Astro only hydrates the one component that asks for it.
  integrations: [react()],

  vite: { define: { __MODELS_VERSION__: JSON.stringify(MODELS_VERSION) } },

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
