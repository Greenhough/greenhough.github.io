# evangreenhough.com

Evan's personal site: a place he shows things he built with AI in his free time.
The reader is a curious peer, not a hiring manager and not a prospective client.

Terms only. No implementation details — those live in `docs/adr/`.

## Language

**Project**:
A thing Evan built, with a Write-up and a place on the Shelf.
_Avoid_: case study, portfolio piece, work item

**Write-up**:
The prose page for a Project.
_Avoid_: post, article, case study

**Post**:
A piece of Evan's writing that is not about a Project. Posts live in a flat list and never appear on the Shelf.
_Avoid_: blog, essay, note

## The Shelf

**Shelf**:
The 3D scene that is the site's home page — a shelf on which every Project is a Box.
_Avoid_: scene, canvas, hero, viewer

**Room**:
The room the Shelf stands in. Floor, ceiling, three walls, a skirting board and a Window, with the fourth side left open towards the camera. Modelled and baked alongside the Shelf.
_Avoid_: backdrop, environment, set, background, scene

**Window**:
The opening in the Room's back wall, left of the Shelf. Shows a dusk sky and gives the Room its cool light, opposite the Lamp.
_Avoid_: light, lightbox, panel

**Lamp**:
The floor lamp to the right of the Shelf. The Room's warm light and most of what makes it visible, since the Window alone leaves it nearly black. The Desk has a smaller one of its own.
_Avoid_: light, lighting, practical

**Desk**:
The desk under the Window, left of the Shelf. Where Posts will live once the camera visits it. Carries a lamp, a closed laptop, a plant and the Book stack.
_Avoid_: table, workstation

**Book stack**:
The four read books lying flat on the Desk. Real books by other people, not Projects — they lie down, they are not on the Shelf, and the titles are someone else's. Lettered at runtime, never baked.
_Avoid_: books (unqualified, which means Boxes), library

**View**:
A composed camera position in the Room, authored by hand and named — Shelf, Desk. The navigation moves between them. A Project never needs one; an object does.
_Avoid_: angle, shot, scene, page

**Sheet**:
The piece of paper on the Desk carrying the latest Post. Lies flat until the camera comes to the Desk, then stands up to be read. Painted at runtime, never baked.
_Avoid_: card, note, panel

**Pinboard**:
The cork board on the back wall right of the Shelf, with blank paper pinned to it. Dressing: nothing on it is clickable.
_Avoid_: board, moodboard, gallery

**Section**:
A labelled run of the Shelf holding the Projects of one Theme.
_Avoid_: row, category, shelf (singular, when meaning a part of the Shelf)

**Theme**:
What a Section is about, and a field on every Project. Currently *Built for Myself* and *Built for Work*.
_Avoid_: category, tag, collection

**Box**:
A Project's physical form on the Shelf — a clothbound hardback with a Cover, a Spine and a page block. Still called a Box: the word is the slot a Project occupies, not a claim about what it looks like.
_Avoid_: card, tile, model, item

**Cover**:
The front board of a Box, bound in the Theme's cloth with the title blocked on it. Carries a Project's Device if it has one.
_Avoid_: art, thumbnail, hero image

**Device**:
A Project's mark, blocked on its Cover. A flat shape, not a screenshot. Optional: a Box without one carries the site's asterisk.
_Avoid_: logo, icon, thumbnail

**Spine**:
The rounded back of a Box, and what is visible while it is shelved. Bound in the Theme's cloth and stamped with the title, generated from the Project's data.
_Avoid_: label, title bar

**Tag**:
A short technology or topic marker on a Project (Claude Code, Swift, Python), set on the Cover the way a publisher sets a series line.
_Avoid_: label, keyword, skill

## States

**Browsing**:
The lit state in which the camera travels the Shelf with one Box focused.
_Avoid_: idle, default view

**Inspecting**:
The state in which a Box is held out of the Shelf to be turned over and read.
_Avoid_: zoomed, detail view, preview

**Opened**:
The state in which a Box's front board swings open on its hinge and its Write-up is shown.
_Avoid_: modal, expanded, drawer

## Everything else

**Flat Site**:
The non-3D rendering of the same content — every Project and Post as ordinary HTML. What crawlers, reduced-motion visitors and browsers without WebGL receive. A peer of the Shelf, not a degraded copy of it.
_Avoid_: fallback, no-JS version, lite mode

**Archive**:
What is kept but no longer current, frozen and noindexed at a live URL: the pre-rebuild flat site, and the urea volatilization pages.
_Avoid_: old site, v1, legacy
