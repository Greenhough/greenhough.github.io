# Publishing Guide — evangreenhough.com

How to publish a **Post** (writing) or a **Project write-up** (work).

Since the Astro rebuild, publishing is: **add one Markdown file, push to `main`.**
The home page, the hub page, `sitemap.xml`, the canonical URL, the Open Graph tags
and the Google Analytics tag are all generated from that file. Nothing is
maintained in two places any more, so the old rules about prepending to the hub,
keeping the home page's top 3 in sync, and hand-editing `sitemap.xml` are gone.

Vocabulary (Post, Project, Write-up, Theme, Tag, Flat Site, Archive) is defined in
[`CONTEXT.md`](CONTEXT.md). The decisions behind this setup are in
[`docs/adr/`](docs/adr/).

---

## How the site is built

| | |
|---|---|
| Framework | [Astro](https://astro.build), static output, no JavaScript framework |
| Content | Markdown in `src/content/work/` and `src/content/posts/` |
| Styling | One stylesheet, `src/styles/global.css` |
| Hosting | GitHub Pages, from the `main` branch, built by `.github/workflows/deploy.yml` |
| Live at | https://evangreenhough.com |

GitHub Pages is set to **Source: GitHub Actions** (Settings → Pages). It no longer
serves raw files from the branch, because the site now has a build step.

**Always pull before editing.** Evan works on this from several Claude windows at
once and a stale clone will diverge:

```bash
git pull
```

### Running it locally

```bash
npm install
```

```bash
npm run dev
```

That serves the site at http://localhost:4321 and reloads as you edit. To check
exactly what will be deployed, build it and serve the output:

```bash
npm run build && npm run preview
```

---

## A) Publishing a Post

1. Create `src/content/posts/{slug}.md`.
2. Fill in the frontmatter (see the reference below).
3. Write the body in ordinary Markdown.
4. Commit and push to `main`.

```markdown
---
title: "The Title In Title Case"
slug: "the-title-in-title-case"
date: 2026-11-04
description: "The meta description. One or two sentences, roughly 110-155 characters."
excerpt: "The opening sentence only. This is the preview line on the listings."
readTime: 3
---
The first paragraph.

The second paragraph, with *italics* where you want them.

> A pull quote.

- A list item
- Another list item
```

Markdown maps onto the site's styles automatically: `##` becomes a section
heading, `>` becomes the green-bordered pull quote, `*text*` becomes italics, and
`-` becomes a bulleted list. For the monospace definition block, drop in the HTML:

```html
<div class="defn">
  <b>Speed</b> = distance/time<br>
  <b>Velocity</b> = displacement/time
</div>
```

To put a looping video above the prose, add `video` to the frontmatter rather than
writing the tag in the body:

```yaml
video:
  src: "/assets/the-file.mp4"
  label: "A description of the video, read out by screen readers."
```

## B) Publishing a Project write-up

1. Create `src/content/work/{slug}.md`.
2. Fill in the frontmatter (see the reference below).
3. Write the body using the numbered-section HTML described below.
4. Commit and push to `main`.

```markdown
---
title: "The Project Name"
spine: "Short Name"
slug: "the-project-name"
eyebrow: "Build"
tags: ["Claude Code", "Python"]
date: 2026-11-04
description: "The meta description. Roughly 110-155 characters."
summary: "The one-line card text shown on /work and on the home page."
dek: "An optional standfirst line, shown under the title on the write-up itself."
theme: "Built for Myself"
cover: "../../assets/covers/the-project-name.png"   # optional
---
<section class="cs-sec">
  <h2 class="cs-title"><span class="num">01</span>Why I built it</h2>
  <p>...</p>
  <p>...</p>
</section>

<figure class="cs-fig">
  <img src="/assets/a-screenshot.png" alt="A real description of the image" width="1600" height="900">
  <figcaption>An optional caption.</figcaption>
</figure>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">02</span>What I built</h2>
  <p>...</p>
</section>
```

The usual arc is `01 Why I built it`, `02 What I built`, `03 How it works`,
`04 What broke & what I learned`. Adapt it to the project.

**Why write-up bodies are HTML and posts are not.** The numbered sections, the
figures that sit between them, and the occasional section with no heading at all
are hand-placed editorial layout. Markdown headings cannot express that, so the
body keeps its HTML. The frontmatter above it is still the single source of truth
for everything that appears in more than one place.

**Two rules for the body HTML:**

- **No blank lines inside an element.** Markdown ends a raw-HTML block at the
  first blank line, so a blank line in the middle of a `<section>` would split it
  in half. Put blank lines only *between* top-level elements.
- **Image paths start with `/`.** Images live in `public/assets/` and are
  referenced as `/assets/filename.png`.

Figure variants: `cs-fig` on its own is full width, `cs-fig narrow` caps the
width, and `cs-fig logo` drops the border and shadow for a logo or an app icon.

---

## Frontmatter reference

Fields are checked at build time. A missing or misspelled field fails the build
rather than shipping a broken page. The schema lives in `src/content.config.ts`.

### Posts (`src/content/posts/`)

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Title case. Used for the `<h1>`, the `<title>`, `og:title` and every listing. |
| `slug` | yes | The URL path without a leading slash. `hal-9000` serves at `/hal-9000`. |
| `date` | yes | `YYYY-MM-DD`. Sorts the listings; displayed as `Mon YYYY`. |
| `description` | yes | The meta description and `og:description`. Roughly 110-155 characters. |
| `excerpt` | yes | The single preview line on the home page and `/writing`. Normally the opening sentence. May contain inline HTML such as `<em>`. |
| `readTime` | yes | Whole minutes, at roughly 225 words per minute. |
| `video` | no | `src` and `label`, for a looping video above the prose. |

### Projects (`src/content/work/`)

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Title case. Used for the `<h1>`, the `<title>`, `og:title` and every listing. |
| `spine` | no | How the binding is lettered, on the Spine and the Cover. Leave it out and the binding carries `title`. |
| `slug` | yes | The URL path without a leading slash. |
| `eyebrow` | yes | The small label above the title. Currently `Build` or `Vibe Coding`. |
| `tags` | yes | A list of tag labels. Each must have a colour (see below). |
| `date` | yes | `YYYY-MM-DD`. Sorts the listings. |
| `description` | yes | The meta description and `og:description`. |
| `summary` | yes | The one-line card text on `/work` and on the home page. |
| `dek` | no | A standfirst line under the title on the write-up itself. |
| `theme` | yes | `Built for Myself` or `Built for Work`. The Section this Project sits in on the Shelf. |
| `cover` | no | The Project's device: a flat mark blocked on the Cover, in `src/assets/covers/`. Leave it out and the Box carries the site's asterisk. |

`description` and `summary` do different jobs: `description` is written for search
results and link previews, `summary` is written for someone scanning a list of
projects. `dek` is the line that sets up the write-up itself.

A `cover` is a **mark, not a screenshot**. The Cover is bound in cloth and the
device is blocked on it small, so one flat shape in one or two colours works and
a screenshot of a dashboard is grey mush. Screenshots belong in the write-up.
A transparent PNG is ideal; without a `cover` the Box is simply blind-stamped.
Four of the current marks are drawn by `scripts/devices.mjs` — edit the geometry
there and run `node scripts/devices.mjs` rather than editing the PNGs. Quibble's
is the app's own icon and is not in that script.

Add a `spine` when the title is long. The Spine is read edge-on from across a
room, so the painted title shrinks to fit and a descriptive title ends up too
small to read. A binder shortens a long title on a real spine for the same
reason, and letters the case to match, so this sets both faces of the binding.
The hub card and the write-up keep the full one.

### Adding a new tag colour

Tag labels map to a colour class in `src/components/Tags.astro`. A label with no
mapping fails the build on purpose, so a tag can never render unstyled. To add one:

1. Add a `.tag-{name}` rule in `src/styles/global.css` with a background and text
   colour that fits the palette.
2. Add the label to the `TAG_CLASSES` map in `src/components/Tags.astro`.

---

## Conventions

- **Title case:** capitalise the first word, the last word, and every principal
  word. Lowercase articles (`a`, `an`, `the`), coordinating conjunctions (`and`,
  `but`, `or`, `nor`, `for`, `so`, `yet`), the word `to`, and short prepositions
  (`in`, `on`, `at`, `by`, `of`, `vs`), unless one falls first or last. Leave
  proper nouns and acronyms alone (`AI`, `GTM`, `HAL 9000`, `Notion`). The title
  is written once, in frontmatter, and used everywhere.
- **Slug:** kebab-case, no leading slash, no trailing slash. It is the one thing
  that decides the URL. Name the file after it.
- **Dates:** only the month and year are displayed, but the day decides the order
  within a month. If two items share a month, give the one that should appear
  first the later date.
- **Images:** put them in `public/assets/` and reference them as `/assets/name.png`.
  Always set `alt`, and set `width` and `height` so the page does not jump while
  loading.
- **Voice:** place Evan's text **verbatim** unless he asks for writing or polish.
  Ask about formatting; never invent copy or facts.

---

## What is generated for you

Do not hand-maintain any of this:

- The home page's latest three Projects and three Posts.
- The `/work` and `/writing` listings.
- `sitemap.xml`, built from the collections by `src/pages/sitemap.xml.ts`.
- The `<title>`, meta description, canonical URL and all Open Graph and Twitter tags.
- The Google Analytics tag (`G-NSHF44RF80`), which is in `src/components/BaseHead.astro`
  and therefore on every page. It also anchors Search Console verification, so do
  not remove it.

## What is not in the collections

- **`public/urea-volatilization.html`** and **`public/urea-volatilization-methodology.html`**
  are static leftovers, deliberately excluded from the sitemap, and are coming
  down soon. Do not convert them.
- **`public/archive/v1/`** is the frozen, noindexed copy of the pre-rebuild flat
  site. It is self-contained and should not be edited. The matching commit is
  tagged `v1-flat-site`.

---

## Ship and verify

1. `npm run build` locally. If it fails, the frontmatter is wrong; the error says which field.
2. Commit the new Markdown file plus any new images in `public/assets/`.
3. Push to `main`. The Action builds and deploys (about a minute).
4. Check the Actions tab shows a green run.
5. Verify live: the new URL returns 200, the home page and the hub link to it, and
   the URL appears in https://evangreenhough.com/sitemap.xml.
6. If the link will be shared, refresh the social cache (LinkedIn Post Inspector
   or the Facebook Sharing Debugger).
