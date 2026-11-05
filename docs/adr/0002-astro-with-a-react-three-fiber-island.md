---
status: accepted
date: 2026-11-04
---

# Astro with a React Three Fiber island, static, on GitHub Pages

The site was hand-written HTML with no build step, which cannot support a 3D home page or
a single source of truth for Projects. It is rebuilt in Astro: Write-ups and Posts become
Markdown in a content collection, every page ships zero JavaScript by default, and only the
home page hydrates as a React Three Fiber island.

## Considered options

**Vanilla three.js via an import map** would have preserved the no-build-step property, but
scene code written imperatively sprawls, and a declarative scene graph is markedly easier for
both Evan and Claude Code to read and edit — which matters, because learning to build
ambitious things with Claude Code is a stated goal of this project, not a side effect.

**Vite + React alone** was the first choice and was dropped for Astro. Astro is content-first:
the Flat Site falls out of it for free rather than being built twice, and content collections
*are* the single source of truth for Projects, with type-checking included.

## Consequences

- **No backend, deliberately.** A visitor counter or guestbook would force a migration off
  GitHub Pages. Rejected: it is the least interesting possible feature and the only thing
  demanding a host change. DNS, domain and Search Console stay untouched.
- **Two deploys, not one.** Deploy one is the whole site rebuilt in Astro with an ordinary
  flat home page and no WebGL, verified for URL, sitemap and analytics parity. Deploy two
  swaps in the Shelf. A regression after deploy two has exactly one possible cause.
- **`PUBLISHING.md` is obsolete on landing.** Publishing becomes "add a Markdown file with
  frontmatter." The home-page-top-3 rule, the hub-prepend rule and the tag-class rule all
  stop existing, because nothing is hand-maintained in two places any more.
- **The urea-volatilization pages are not converted.** They are already excluded from the
  sitemap and slated for removal; they stay in `public/` as static files until deleted.
- **Performance budget, agreed up front:** interactive under 2.5s on a mid-range phone over
  4G; initial payload under 1.5MB including the Draco-compressed Shelf model and KTX2
  textures; Cover textures 512px mobile / 1024px desktop; device pixel ratio capped at 1.5
  on phones; baked shadows plus one real-time contact shadow under the focused Box.
