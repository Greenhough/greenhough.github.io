# Publishing Guide — evangreenhough.com

How to publish a new **writing** post or **work** case study. This is the single
source of truth for the `/new-writing` and `/new-work` Claude Code commands.

## Repo & deploy basics
- Repo: `Greenhough/greenhough.github.io` (public). GitHub Pages serves the `main`
  branch root. Live at https://evangreenhough.com.
- Work on `main`. After pushing, Pages rebuilds (~30–90s). **Always verify** the live
  URL returns 200 and links resolve before calling it done.
- Not cloned locally by default — clone fresh: `gh repo clone Greenhough/greenhough.github.io`.

## Conventions (both types)
- **Filename / URL:** kebab-case slug → `my-title.html`, served at `/my-title`
  (Pages serves extensionless paths; never use a trailing slash).
- **`<title>`:** `{Title} | Evan Greenhough` (pipe, never an em dash).
- **Canonical + `og:url`:** `https://evangreenhough.com/{slug}`.
- **OG/Twitter (every page):** `og:type=article`, `og:title={Title}` (no name suffix on
  og:title), `og:description`, `og:url`, `og:image=https://evangreenhough.com/assets/og-image.png`
  (the shared site card) + `og:image:width/height` 1200/630, `twitter:card=summary_large_image`,
  `twitter:image` = same card.
- **Meta description = the excerpt line** (reuse the same text for the page meta + OG
  description). Keep ~110–155 chars.
- **Listing preview text** (home + writing-hub cards, `<p class="post-excerpt">`) is a
  **single line** — the post's opening sentence only, not the full excerpt. It may be
  shorter than the meta description; the two do not have to match.
- **Paths:** relative on content pages (`assets/...`, `styles.css`); root-relative for nav
  links (`/`, `/work`, `/writing`).
- **Fonts:** already self-hosted via styles.css — nothing to add.
- **Date format:** `Mon YYYY` (e.g. `Jun 2026`) in listings and the article meta line.
- **Voice:** place the author's text **verbatim** unless asked to write/polish. Ask
  clarifying questions about formatting; never invent copy or facts.

## Home-page rule
- Home shows the **latest 3** of each section (Recent Work, Writing), **newest first**.
- Hub pages (`/work`, `/writing`) show **all** entries, newest first.
- On publish: prepend the new entry to the hub list, then rebuild the home section to
  mirror the hub's top 3.

## A) New WRITING post
Template: `post.html` (unlinked reference — don't delete). Body uses `<article class="article narrow">`.
1. Create `{slug}.html` from the article template.
2. Head: title (pipe), meta description (= excerpt), canonical, OG/Twitter (`og:type=article`).
3. Header: `<h1 class="art-title">{Title}</h1>` + `<div class="art-meta">{Mon YYYY} &middot; {N} min read</div>`
   (estimate read time at ~225 wpm).
4. Body in `<div class="prose">`: use `<p>`, `<h2>`, `<blockquote>`, `<ul><li>`, `<em>`,
   and `<div class="defn">…</div>` for definition/equation blocks. Ask how to format
   (preserve short-line rhythm vs flowing paragraphs; lists; pull-quote).
5. Keep the `<div class="art-foot">` back-link and `<footer class="footer spaced">`.
6. **Writing hub** (`writing.html`) — prepend inside `<div class="post-list index">`:
   ```html
   <a class="post" href="/{slug}">
     <h2 class="post-title">{Title}</h2>
     <span class="post-date">{Mon YYYY}</span>
     <p class="post-excerpt">{preview — single line, the opening sentence}</p>
   </a>
   ```
7. **Home** (`index.html`) Writing section `<div class="post-list">` — same entry but
   `<h3 class="post-title">`. Keep only the latest 3. Same single-line preview text.

## B) New WORK case study
Template: `case-study-1.html` (full reference). Body uses `<article class="article">` (NOT narrow).
1. Create `{slug}.html` from the case-study template.
2. Head: title (pipe), meta description, canonical, OG/Twitter (`og:type=article`).
3. Header: `<header class="cs-head">` → `<div class="eyebrow">{Category}</div>`,
   `<h1 class="art-title">{Title}</h1>`, `<div class="tags cs-tags">{tags}</div>`.
4. Body: numbered `<section class="cs-sec">` blocks →
   `<h2 class="cs-title"><span class="num">01</span>{Heading}</h2>` + `<p>`.
   Typical arc: 01 The Problem, 02 The Approach, 03 The Outcome (adapt to the content).
5. **Work hub** (`work.html`) — prepend inside `<div class="proj-list">`:
   ```html
   <a class="proj" href="/{slug}">
     <div class="eyebrow">{Category}</div>
     <h2 class="proj-title">{Title}</h2>
     <p class="proj-desc">{one-line description}</p>
     <div class="tags">{tags}</div>
   </a>
   ```
6. **Home** (`index.html`) Recent Work `<div class="card-grid">`:
   ```html
   <a class="card" href="/{slug}">
     <div class="tags">{tags}</div>
     <h3 class="card-title">{Title}</h3>
     <p class="card-desc">{short description}</p>
     <span class="arrow">&rarr;</span>
   </a>
   ```
   Keep only the latest 3.

### Tag classes (work cards)
Available: `tag-claude`, `tag-clay`, `tag-automation`, `tag-enablement`, `tag-hubspot`,
`tag-notion`, `tag-make`. A tag span looks like `<span class="tag tag-clay">Clay</span>`.
To add a new one, add a `.tag-{name}` rule in styles.css (bg + text color) matching the palette.

## Ship & verify (both)
1. `git add` the new page + edited `index.html` + edited hub (+ `styles.css` only if a new
   tag/block was added).
2. Commit (clear message, `Co-Authored-By` trailer) and push to `main`.
3. Poll the Pages build until the new commit is "built".
4. Verify live: new URL → 200; home + hub link to it; no broken links. If the link will be
   shared, remind to refresh the social cache (LinkedIn Post Inspector / FB Sharing Debugger).

## Notes / don't forget
- Keep `post.html` and the case-study template as references (unlinked; fine to leave).
- No `sitemap.xml` exists yet. If one is added later, append each new page's URL on publish.
- The "italicize feel/feeling" styling on the *Speed vs Velocity* post was a one-off
  request, **not** a standing rule.
